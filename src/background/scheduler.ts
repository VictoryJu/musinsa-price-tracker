import type { Product } from '../shared/types';

const HOUR_MS = 60 * 60 * 1000;

export function computeNextCheckAt(now: number, fetchIntervalHours: number, jitterMs: number): number {
  return now + fetchIntervalHours * HOUR_MS + jitterMs;
}

export function pickDueProduct(products: Product[], now: number): Product | null {
  const due = products
    .filter((product) => product.nextCheckAt <= now)
    .sort((a, b) => a.nextCheckAt - b.nextCheckAt);

  return due[0] ?? null;
}
