import { extractProductPrice } from '../shared/extraction';
import {
  appendHistorySample,
  getProduct,
  getSettings,
  pruneHistory,
  recomputeAndStoreStats,
  setProduct,
} from '../shared/storage';
import { computeNextCheckAt } from './scheduler';

export interface ProcessProductCheckOptions {
  now: number;
  fetchHtml: (url: string) => Promise<string>;
  jitterMs?: number;
}

export async function processProductCheck(productId: string, options: ProcessProductCheckOptions): Promise<void> {
  const product = await getProduct(productId);
  if (!product) return;

  const settings = await getSettings();
  const html = await options.fetchHtml(product.canonicalUrl);
  const document = new DOMParser().parseFromString(html, 'text/html');
  const snapshot = await extractProductPrice(document, { now: options.now, productId });
  const nextCheckAt = computeNextCheckAt(options.now, settings.fetchIntervalHours, options.jitterMs ?? 0);

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
  await pruneHistory(productId, settings.retentionDays, options.now);
}
