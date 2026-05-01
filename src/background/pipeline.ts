import { extractProductPrice } from '../shared/extraction';
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
    const document = new DOMParser().parseFromString(html, 'text/html');
    return await extractProductPrice(document, { now: options.now, productId });
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
