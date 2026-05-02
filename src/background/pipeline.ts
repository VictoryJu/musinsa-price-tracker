import { extractProductPrice } from '../shared/extraction';
import { parsePrice } from '../shared/price';
import { loadRemoteConfig } from '../shared/remote-config';
import {
  appendHistorySample,
  getProduct,
  getSettings,
  pruneHistory,
  recomputeAndStoreStats,
  setProduct,
} from '../shared/storage';
import type { CurrentSnapshot, SnapshotErrorClass } from '../shared/types';
import { maybeNotifyNewLow, type MaybeNotifyNewLowOptions } from './notifications';
import { computeNextCheckAt } from './scheduler';

const STALE_SAMPLE_TOLERANCE_MS = 24 * 60 * 60 * 1000;
const RETRY_DELAY_MS = 5 * 60 * 1000;

export interface ProcessProductCheckOptions {
  now: number;
  fetchHtml: (url: string) => Promise<string>;
  fetchJson?: (url: string) => Promise<unknown>;
  jitterMs?: number;
  notify?: MaybeNotifyNewLowOptions['notify'];
}

export async function processProductCheck(productId: string, options: ProcessProductCheckOptions): Promise<void> {
  const product = await getProduct(productId);
  if (!product) return;

  const settings = await getSettings();
  const snapshot = await getSnapshot(product.canonicalUrl, productId, options);
  const nextCheckAt =
    snapshot.status === 'failed' && product.currentSnapshot.status !== 'failed'
      ? options.now + RETRY_DELAY_MS
      : computeNextCheckAt(options.now, settings.fetchIntervalHours, options.jitterMs ?? 0);

  if (snapshot.ts < product.lastCheckedAt - STALE_SAMPLE_TOLERANCE_MS) {
    return;
  }

  await setProduct({
    ...product,
    currentSnapshot: snapshot,
    lastCheckedAt: options.now,
    nextCheckAt,
  });

  await appendHistorySample(productId, {
    ts: snapshot.ts,
    price: snapshot.price,
    status: snapshot.status,
  });

  if (snapshot.status !== 'failed') {
    await recomputeAndStoreStats(productId, options.now);
  }
  await maybeNotifyNewLow(productId, { notify: options.notify });
  await pruneHistory(productId, settings.retentionDays, options.now);
}

async function getSnapshot(
  canonicalUrl: string,
  productId: string,
  options: ProcessProductCheckOptions
): Promise<CurrentSnapshot> {
  try {
    const html = await options.fetchHtml(canonicalUrl);
    const remoteConfig = options.fetchJson
      ? await loadRemoteConfig({ now: options.now, fetchJson: options.fetchJson })
      : undefined;

    if (typeof DOMParser === 'undefined') {
      return await extractServiceWorkerSnapshot(html, productId, options, remoteConfig);
    }

    const document = new DOMParser().parseFromString(html, 'text/html');
    return await extractProductPrice(document, { now: options.now, productId, fetchJson: options.fetchJson, remoteConfig });
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err));
    return {
      price: null,
      ts: options.now,
      extractorPath: 'unknown',
      status: 'failed',
      errorClass: classifyFetchError(error),
      errorMessage: error.message,
    };
  }
}

async function extractServiceWorkerSnapshot(
  html: string,
  productId: string,
  options: ProcessProductCheckOptions,
  remoteConfig: Awaited<ReturnType<typeof loadRemoteConfig>> | undefined
): Promise<CurrentSnapshot> {
  const jsonLdPrice = extractJsonLdPriceFromHtml(html);
  if (jsonLdPrice !== null) {
    return {
      price: jsonLdPrice,
      ts: options.now,
      extractorPath: 'json-ld',
      status: 'ok',
    };
  }

  const cssPrice = extractPriceFromMarkup(html);
  if (cssPrice !== null) {
    return {
      price: cssPrice,
      ts: options.now,
      extractorPath: 'css-selector',
      status: 'ok',
    };
  }

  if (!remoteConfig?.disabledExtractorPaths?.includes('internal-api') && options.fetchJson) {
    const apiPrice = await extractInternalApiPrice(productId, options.fetchJson);
    if (apiPrice !== null) {
      return {
        price: apiPrice,
        ts: options.now,
        extractorPath: 'internal-api',
        status: 'ok',
      };
    }
  }

  return {
    price: null,
    ts: options.now,
    extractorPath: 'unknown',
    status: 'failed',
    errorClass: 'parse',
    errorMessage: 'Unable to extract price',
  };
}

function extractJsonLdPriceFromHtml(html: string): number | null {
  const scripts = html.matchAll(/<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi);
  for (const script of scripts) {
    const text = decodeHtmlEntities(script[1]?.trim() ?? '');
    if (!text) continue;

    try {
      const price = findPriceValue(JSON.parse(text) as unknown);
      if (price !== null) return price;
    } catch {
      continue;
    }
  }

  return null;
}

function extractPriceFromMarkup(html: string): number | null {
  const metaPrice = extractMetaPrice(html);
  if (metaPrice !== null) return metaPrice;

  const goodsPrice = extractGoodsPrice(html);
  if (goodsPrice !== null) return goodsPrice;

  const normalizedText = decodeHtmlEntities(html.replace(/<script\b[\s\S]*?<\/script>/gi, ' ').replace(/<style\b[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' '));
  const price = parsePrice(normalizedText);
  return price !== null && isValidPrice(price) ? price : null;
}

function extractMetaPrice(html: string): number | null {
  const metaMatch = html.match(/<meta\b(?=[^>]*\bproperty=["']product:price:amount["'])(?=[^>]*\bcontent=["']([^"']+)["'])[^>]*>/i);
  const price = metaMatch?.[1] ? parsePrice(decodeHtmlEntities(metaMatch[1])) : null;
  return price !== null && isValidPrice(price) ? price : null;
}

function extractGoodsPrice(html: string): number | null {
  const salePriceMatch = html.match(/"goodsPrice"\s*:\s*\{[\s\S]{0,800}?"salePrice"\s*:\s*(\d+)/);
  const price = salePriceMatch?.[1] ? Number.parseInt(salePriceMatch[1], 10) : null;
  return price !== null && isValidPrice(price) ? price : null;
}

async function extractInternalApiPrice(productId: string, fetchJson: (url: string) => Promise<unknown>): Promise<number | null> {
  try {
    const response = await fetchJson(`/api/product/${productId}`);
    return findPriceValue(response);
  } catch {
    return null;
  }
}

function findPriceValue(value: unknown): number | null {
  if (Array.isArray(value)) {
    for (const item of value) {
      const price = findPriceValue(item);
      if (price !== null) return price;
    }
    return null;
  }

  if (typeof value === 'number') return isValidPrice(value) ? value : null;
  if (typeof value === 'string') {
    const price = parsePrice(value);
    return price !== null && isValidPrice(price) ? price : null;
  }
  if (typeof value !== 'object' || value === null) return null;

  const record = value as Record<string, unknown>;
  for (const key of ['salePrice', 'price', 'finalPrice']) {
    const price = findPriceValue(record[key]);
    if (price !== null) return price;
  }

  for (const item of Object.values(record)) {
    const price = findPriceValue(item);
    if (price !== null) return price;
  }
  return null;
}

function decodeHtmlEntities(value: string): string {
  return value
    .replace(/&quot;/g, '"')
    .replace(/&#34;/g, '"')
    .replace(/&#x22;/gi, '"')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/gi, "'");
}

function isValidPrice(price: number): boolean {
  return price > 0 && price < 100_000_000;
}

function classifyFetchError(error: Error): SnapshotErrorClass {
  const message = error.message.toLowerCase();
  if (message.includes('blocked')) return 'blocked';

  const status = message.match(/\b([45]\d{2})\b/)?.[1];
  if (status?.startsWith('4')) return 'http4xx';
  if (status?.startsWith('5')) return 'http5xx';

  if (error instanceof TypeError || message.includes('failed to fetch') || message.includes('network')) {
    return 'network';
  }

  return 'unknown';
}
