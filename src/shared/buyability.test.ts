import { describe, expect, it } from 'vitest';
import { classifyBuyability, computeStats } from './buyability';
import type { BuyabilityThresholds, HistorySample } from './types';

const day = 24 * 60 * 60 * 1000;
const now = 1_700_000_000_000;

const thresholds: BuyabilityThresholds = {
  great: 10,
  good: 25,
  fair: 75,
  wait: 90,
};

function sample(ts: number, price: number, status: HistorySample['status'] = 'ok'): HistorySample {
  return {
    ts,
    price: status === 'ok' ? price : null,
    status,
  };
}

describe('computeStats', () => {
  it('computes 30-day min/max/avg/count and all-time low', () => {
    const stats = computeStats(
      [
        sample(now - 100 * day, 32000),
        sample(now - 20 * day, 38000),
        sample(now - 10 * day, 35000),
        sample(now - 5 * day, 40000),
        sample(now - 1 * day, 37000),
      ],
      now
    );

    expect(stats.allTimeLow).toEqual({ price: 32000, ts: now - 100 * day });
    expect(stats.min30d).toBe(35000);
    expect(stats.max30d).toBe(40000);
    expect(stats.avg30d).toBe(37500);
    expect(stats.samplesIn30d).toBe(4);
    expect(stats.lastComputedAt).toBe(now);
  });

  it('excludes sold-out and failed samples', () => {
    const stats = computeStats(
      [sample(now - 5 * day, 35000), sample(now - 4 * day, 0, 'soldOut'), sample(now - 3 * day, 0, 'failed'), sample(now - 2 * day, 37000)],
      now
    );

    expect(stats.samplesIn30d).toBe(2);
    expect(stats.min30d).toBe(35000);
    expect(stats.max30d).toBe(37000);
  });

  it('returns null stats when no usable samples exist', () => {
    const stats = computeStats([], now);
    expect(stats.allTimeLow).toBeNull();
    expect(stats.min30d).toBeNull();
    expect(stats.max30d).toBeNull();
    expect(stats.avg30d).toBeNull();
    expect(stats.samplesIn30d).toBe(0);
  });
});

describe('classifyBuyability', () => {
  const distribution = Array.from({ length: 30 }, (_, i) => sample(now - i * day, 35000 + i * 100));

  it('returns null when sample count is below the analysis threshold', () => {
    expect(classifyBuyability(35000, distribution.slice(0, 10), thresholds, 20, now)).toBeNull();
  });

  it('classifies a small absolute drop as great for a low-variance product when it is bottom percentile', () => {
    const lowVariance = Array.from({ length: 30 }, (_, i) => sample(now - i * day, 39700 + i * 10));

    expect(classifyBuyability(39700, lowVariance, thresholds, 20, now)).toBe('great');
  });

  it('classifies a large absolute discount by percentile for a high-variance product', () => {
    const highVariance = Array.from({ length: 30 }, (_, i) => sample(now - i * day, 20000 + i * 2000));

    expect(classifyBuyability(48000, highVariance, thresholds, 20, now)).toBe('fair');
  });

  it('classifies an all-time-low current price as great', () => {
    expect(classifyBuyability(34000, distribution, thresholds, 20, now)).toBe('great');
  });

  it('classifies bottom decile as great', () => {
    expect(classifyBuyability(35000, distribution, thresholds, 20, now)).toBe('great');
  });

  it('classifies values near the first quartile as good', () => {
    expect(classifyBuyability(35600, distribution, thresholds, 20, now)).toBe('good');
  });

  it('classifies middle values as fair', () => {
    expect(classifyBuyability(36500, distribution, thresholds, 20, now)).toBe('fair');
  });

  it('classifies high values as wait', () => {
    expect(classifyBuyability(37900, distribution, thresholds, 20, now)).toBe('wait');
  });

  it('returns null for unavailable current price', () => {
    expect(classifyBuyability(null, distribution, thresholds, 20, now)).toBeNull();
  });
});
