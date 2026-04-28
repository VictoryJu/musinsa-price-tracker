import { describe, expect, it } from 'vitest';
import { computeNextCheckAt, pickDueProduct } from './scheduler';
import type { Product } from '../shared/types';

function product(id: string, nextCheckAt: number): Product {
  return {
    id,
    canonicalUrl: `https://www.musinsa.com/products/${id}`,
    name: `Product ${id}`,
    thumbnail: '',
    addedAt: 0,
    notifyOnNewLow: true,
    currentSnapshot: {
      price: null,
      ts: 0,
      extractorPath: 'unknown',
      status: 'failed',
    },
    stats: {
      allTimeLow: null,
      avg30d: null,
      min30d: null,
      max30d: null,
      samplesIn30d: 0,
      lastComputedAt: 0,
    },
    lastNotified: null,
    nextCheckAt,
    lastCheckedAt: 0,
  };
}

describe('scheduler math', () => {
  it('computes next check time from interval and jitter', () => {
    const now = 1_700_000_000_000;

    expect(computeNextCheckAt(now, 12, 30_000)).toBe(now + 12 * 60 * 60 * 1000 + 30_000);
  });

  it('picks the due product with the earliest nextCheckAt', () => {
    const now = 1_700_000_000_000;

    const due = pickDueProduct(
      [product('later', now - 1_000), product('not-due', now + 1_000), product('earliest', now - 10_000)],
      now
    );

    expect(due?.id).toBe('earliest');
  });

  it('returns null when no product is due', () => {
    const now = 1_700_000_000_000;

    expect(pickDueProduct([product('future', now + 1_000)], now)).toBeNull();
  });
});
