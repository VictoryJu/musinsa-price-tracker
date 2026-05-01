import { describe, expect, it } from 'vitest';
import { formatSnapshotLabel, historyToChartPoints } from './presentation';
import type { CurrentSnapshot, HistorySample } from './types';

describe('presentation helpers', () => {
  it('formats sold-out snapshots as a sold-out label', () => {
    const snapshot: CurrentSnapshot = {
      price: null,
      ts: 1,
      extractorPath: 'unknown',
      status: 'soldOut',
      errorMessage: 'Product is sold out',
    };

    expect(formatSnapshotLabel(snapshot)).toBe('품절');
  });

  it('formats ok snapshots as KRW price labels', () => {
    const snapshot: CurrentSnapshot = {
      price: 37700,
      ts: 1,
      extractorPath: 'json-ld',
      status: 'ok',
    };

    expect(formatSnapshotLabel(snapshot)).toBe('37,700원');
  });

  it('converts unavailable samples to null chart points so lines break', () => {
    const samples: HistorySample[] = [
      { ts: 1, price: 37000, status: 'ok' },
      { ts: 2, price: null, status: 'soldOut' },
      { ts: 3, price: null, status: 'failed' },
      { ts: 4, price: 36000, status: 'ok' },
    ];

    expect(historyToChartPoints(samples)).toEqual([
      { x: 1, y: 37000, status: 'ok' },
      { x: 2, y: null, status: 'soldOut' },
      { x: 3, y: null, status: 'failed' },
      { x: 4, y: 36000, status: 'ok' },
    ]);
  });
});
