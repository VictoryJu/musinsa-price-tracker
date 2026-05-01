import { extractProductPrice } from '../shared/extraction';
import {
  appendHistorySample,
  getProduct,
  getSettings,
  pruneHistory,
  recomputeAndStoreStats,
  setProduct,
} from '../shared/storage';
import type { CurrentSnapshot } from '../shared/types';
import { maybeNotifyNewLow, type MaybeNotifyNewLowOptions } from './notifications';
import { computeNextCheckAt } from './scheduler';

const STALE_SAMPLE_TOLERANCE_MS = 24 * 60 * 60 * 1000;

export interface ProcessProductCheckOptions {
  now: number;
  fetchHtml: (url: string) => Promise<string>;
  jitterMs?: number;
  notify?: MaybeNotifyNewLowOptions['notify'];
}

export async function processProductCheck(productId: string, options: ProcessProductCheckOptions): Promise<void> {
  const product = await getProduct(productId);
  if (!product) return;

  const settings = await getSettings();
  const nextCheckAt = computeNextCheckAt(options.now, settings.fetchIntervalHours, options.jitterMs ?? 0);
  const snapshot = await getSnapshot(product.canonicalUrl, productId, options);

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

  await recomputeAndStoreStats(productId, options.now);
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
    const document = new DOMParser().parseFromString(html, 'text/html');
    return await extractProductPrice(document, { now: options.now, productId });
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err));
    return {
      price: null,
      ts: options.now,
      extractorPath: 'unknown',
      status: 'failed',
      errorMessage: error.message,
    };
  }
}
