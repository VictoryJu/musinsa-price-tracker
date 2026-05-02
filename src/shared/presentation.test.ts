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

    expect(formatSnapshotLabel(snapshot)).toBe('Sold out');
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

  it('formats failed snapshots with an error class when available', () => {
    const snapshot: CurrentSnapshot = {
      price: null,
      ts: 1,
      extractorPath: 'unknown',
      status: 'failed',
      errorClass: 'blocked',
      errorMessage: 'fetch blocked',
    };

    expect(formatSnapshotLabel(snapshot)).toBe('Fetch blocked');
  });

  it('formats generic failed snapshots as explicit extraction failure', () => {
    const snapshot: CurrentSnapshot = {
      price: null,
      ts: 1,
      extractorPath: 'unknown',
      status: 'failed',
      errorClass: 'parse',
      errorMessage: 'Unable to extract price',
    };

    expect(formatSnapshotLabel(snapshot)).toBe('Price extraction failed');
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
