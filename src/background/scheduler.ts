import type { Product } from '../shared/types';
import { getAllProducts } from '../shared/storage';
import { processProductCheck } from './pipeline';

const HOUR_MS = 60 * 60 * 1000;
let runInProgress = false;

export interface RunDueProductBatchOptions {
  now?: number;
  fetchHtml: (url: string) => Promise<string>;
  jitterMs?: number;
}

export function computeNextCheckAt(now: number, fetchIntervalHours: number, jitterMs: number): number {
  return now + fetchIntervalHours * HOUR_MS + jitterMs;
}

export function pickDueProduct(products: Product[], now: number): Product | null {
  const due = products
    .filter((product) => product.nextCheckAt <= now)
    .sort((a, b) => a.nextCheckAt - b.nextCheckAt);

  return due[0] ?? null;
}

export async function runDueProductBatch(
  options: RunDueProductBatchOptions
): Promise<{ processedProductId: string | null }> {
  if (runInProgress) return { processedProductId: null };

  runInProgress = true;
  try {
    const now = options.now ?? Date.now();
    const due = pickDueProduct(await getAllProducts(), now);
    if (!due) return { processedProductId: null };

    await processProductCheck(due.id, {
      now,
      fetchHtml: options.fetchHtml,
      jitterMs: options.jitterMs,
    });

    return { processedProductId: due.id };
  } finally {
    runInProgress = false;
  }
}
