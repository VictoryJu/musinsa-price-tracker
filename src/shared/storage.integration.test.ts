import { describe, expect, it } from 'vitest';
import { runMigrationsWithFallback } from './migrations';
import {
  appendHistorySample,
  deleteProduct,
  getProduct,
  getSettings,
  listHistoryChunkKeys,
  pruneHistory,
  recomputeAndStoreStats,
  setProduct,
} from './storage';
import type { Product } from './types';

const day = 24 * 60 * 60 * 1000;

const productFixture: Product = {
  id: '3674341',
  canonicalUrl: 'https://www.musinsa.com/products/3674341',
  name: 'Test Hoodie',
  thumbnail: 'https://example.com/t.jpg',
  addedAt: Date.UTC(2025, 0, 1),
  notifyOnNewLow: true,
  currentSnapshot: {
    price: 37700,
    ts: Date.UTC(2026, 3, 15),
    extractorPath: 'json-ld',
    status: 'ok',
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
  nextCheckAt: 0,
  lastCheckedAt: 0,
};

describe('storage lifecycle integration', () => {
  it('handles greenfield migration, registration, history, stats, prune, and delete', async () => {
    const migration = await runMigrationsWithFallback();
    expect(migration.status).toBe('success');

    const settings = await getSettings();
    expect(settings.retentionDays).toBe(365);
    expect(settings.minSamplesForAnalysis).toBe(20);

    await setProduct(productFixture);
    expect(await getProduct(productFixture.id)).not.toBeNull();

    const now = Date.UTC(2026, 3, 15);
    const startTs = now - 540 * day;
    for (let d = 0; d <= 540; d += 15) {
      await appendHistorySample(productFixture.id, {
        ts: startTs + d * day,
        price: 35000 + (d % 60) * 100,
        status: 'ok',
      });
    }

    const stats = await recomputeAndStoreStats(productFixture.id, now);
    expect(stats.allTimeLow).not.toBeNull();
    expect(stats.samplesIn30d).toBeGreaterThan(0);

    const removed = await pruneHistory(productFixture.id, 365, now);
    expect(removed).toBeGreaterThan(0);

    const remaining = await listHistoryChunkKeys(productFixture.id);
    expect(remaining.some((key) => key.includes('2024-10'))).toBe(false);
    expect(remaining.some((key) => key.includes('2026-04'))).toBe(true);

    await deleteProduct(productFixture.id);
    expect(await getProduct(productFixture.id)).toBeNull();
    expect(await listHistoryChunkKeys(productFixture.id)).toEqual([]);
  });

  it('preserves existing data when migration fails for a future schema', async () => {
    await chrome.storage.local.set({
      schemaVersion: 999,
      products: { '3674341': productFixture },
    });

    const migration = await runMigrationsWithFallback();
    expect(migration.status).toBe('failure');
    expect((await getProduct('3674341'))?.id).toBe('3674341');
  });
});
