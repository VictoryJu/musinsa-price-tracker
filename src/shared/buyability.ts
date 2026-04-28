import { computePercentile } from './price';
import type { BuyabilityThresholds, HistorySample, Stats } from './types';

export type BuyabilityClass = 'great' | 'good' | 'fair' | 'wait';

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

function okSamples(samples: HistorySample[]): Array<{ ts: number; price: number }> {
  return samples
    .filter((sample): sample is HistorySample & { price: number } => sample.status === 'ok' && sample.price !== null)
    .map((sample) => ({ ts: sample.ts, price: sample.price }));
}

export function computeStats(samples: HistorySample[], now: number): Stats {
  const valid = okSamples(samples);
  const allTimeLow = valid.reduce<{ price: number; ts: number } | null>((lowest, sample) => {
    if (!lowest || sample.price < lowest.price || (sample.price === lowest.price && sample.ts < lowest.ts)) {
      return { price: sample.price, ts: sample.ts };
    }
    return lowest;
  }, null);

  const cutoff = now - THIRTY_DAYS_MS;
  const recent = valid.filter((sample) => sample.ts >= cutoff && sample.ts <= now);
  const prices = recent.map((sample) => sample.price);

  return {
    allTimeLow,
    avg30d: prices.length > 0 ? Math.round(prices.reduce((sum, price) => sum + price, 0) / prices.length) : null,
    min30d: prices.length > 0 ? Math.min(...prices) : null,
    max30d: prices.length > 0 ? Math.max(...prices) : null,
    samplesIn30d: prices.length,
    lastComputedAt: now,
  };
}

export function classifyBuyability(
  currentPrice: number | null,
  samples: HistorySample[],
  thresholds: BuyabilityThresholds,
  minSamplesForAnalysis: number,
  now: number
): BuyabilityClass | null {
  if (currentPrice === null) return null;

  const cutoff = now - THIRTY_DAYS_MS;
  const prices = okSamples(samples)
    .filter((sample) => sample.ts >= cutoff && sample.ts <= now)
    .map((sample) => sample.price)
    .sort((a, b) => a - b);

  if (prices.length < minSamplesForAnalysis) return null;

  const percentile = computePercentile(currentPrice, prices);
  if (Number.isNaN(percentile)) return null;
  if (percentile <= thresholds.great) return 'great';
  if (percentile <= thresholds.good) return 'good';
  if (percentile <= thresholds.fair) return 'fair';
  return 'wait';
}
