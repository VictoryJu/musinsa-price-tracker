import { describe, expect, it } from 'vitest';
import {
  appendHistorySample,
  deleteProduct,
  getAllProducts,
  getHistoryChunk,
  getProduct,
  getProductHistory,
  getSettings,
  getYearMonth,
  initializeStorage,
  listHistoryChunkKeys,
  pruneHistory,
  recomputeAndStoreStats,
  setProduct,
} from './storage';
import { CURRENT_SCHEMA_VERSION, DEFAULT_SETTINGS } from './types';
import type { Product } from './types';

const day = 24 * 60 * 60 * 1000;

function productFixture(id = '3674341'): Product {
  return {
    id,
    canonicalUrl: `https://www.musinsa.com/products/${id}`,
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
}

describe('storage foundation', () => {
  it('initializes schema, products, and default settings', async () => {
    await initializeStorage();

    const raw = await chrome.storage.local.get(['schemaVersion', 'products']);
    expect(raw.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
    expect(raw.products).toEqual({});

    const settings = await getSettings();
    expect(settings.retentionDays).toBe(365);
    expect(settings.minSamplesForAnalysis).toBe(20);
  });

  it('returns settings without sharing nested DEFAULT_SETTINGS objects', async () => {
    await initializeStorage();

    const settings = await getSettings();
    settings.buyabilityThresholds.great = 99;

    expect(DEFAULT_SETTINGS.buyabilityThresholds.great).toBe(10);
    expect((await getSettings()).buyabilityThresholds.great).toBe(10);
  });

  it('sets, gets, lists, and deletes products', async () => {
    await initializeStorage();
    const product = productFixture();

    await setProduct(product);
    expect(await getProduct(product.id)).toEqual(product);
    expect(await getAllProducts()).toEqual([product]);

    await deleteProduct(product.id);
    expect(await getProduct(product.id)).toBeNull();
    expect(await getAllProducts()).toEqual([]);
  });

  it('uses UTC year-month chunk keys', () => {
    expect(getYearMonth(Date.UTC(2026, 0, 1))).toBe('2026-01');
    expect(getYearMonth(Date.UTC(2026, 11, 31, 23, 59))).toBe('2026-12');
  });

  it('appends history into month chunks sorted by timestamp', async () => {
    await initializeStorage();
    const id = '3674341';

    await appendHistorySample(id, { ts: Date.UTC(2026, 3, 20), price: 37000, status: 'ok' });
    await appendHistorySample(id, { ts: Date.UTC(2026, 3, 10), price: 35000, status: 'ok' });

    const chunk = await getHistoryChunk(id, '2026-04');
    expect(chunk.map((sample) => sample.price)).toEqual([35000, 37000]);
  });

  it('lists only matching history chunks for the requested product', async () => {
    await initializeStorage();
    await appendHistorySample('3674341', { ts: Date.UTC(2026, 3, 20), price: 37000, status: 'ok' });
    await appendHistorySample('3674341', { ts: Date.UTC(2026, 2, 20), price: 36000, status: 'ok' });
    await appendHistorySample('999', { ts: Date.UTC(2026, 3, 20), price: 10000, status: 'ok' });

    expect(await listHistoryChunkKeys('3674341')).toEqual(['3674341:2026-03', '3674341:2026-04']);
  });

  it('merges all product history chunks by timestamp', async () => {
    await initializeStorage();
    const id = '3674341';
    await appendHistorySample(id, { ts: Date.UTC(2026, 2, 15), price: 35000, status: 'ok' });
    await appendHistorySample(id, { ts: Date.UTC(2026, 3, 1), price: 36000, status: 'ok' });
    await appendHistorySample(id, { ts: Date.UTC(2026, 1, 20), price: 37000, status: 'ok' });

    expect((await getProductHistory(id)).map((sample) => sample.price)).toEqual([37000, 35000, 36000]);
  });

  it('deletes history chunks with the product', async () => {
    await initializeStorage();
    const product = productFixture();
    await setProduct(product);
    await appendHistorySample(product.id, { ts: Date.UTC(2026, 3, 20), price: 37000, status: 'ok' });

    await deleteProduct(product.id);

    expect(await getProduct(product.id)).toBeNull();
    expect(await listHistoryChunkKeys(product.id)).toEqual([]);
  });

  it('prunes samples outside the retention window and removes empty chunks', async () => {
    await initializeStorage();
    const id = '3674341';
    const now = Date.UTC(2026, 3, 15);
    await appendHistorySample(id, { ts: now - 400 * day, price: 30000, status: 'ok' });
    await appendHistorySample(id, { ts: now - 10 * day, price: 36000, status: 'ok' });

    const removed = await pruneHistory(id, 365, now);

    expect(removed).toBe(1);
    expect((await getProductHistory(id)).map((sample) => sample.price)).toEqual([36000]);
  });

  it('recomputes stats and stores them on the product', async () => {
    await initializeStorage();
    const product = productFixture();
    const now = Date.UTC(2026, 3, 15);
    await setProduct(product);

    for (let i = 1; i <= 5; i += 1) {
      await appendHistorySample(product.id, { ts: now - i * day, price: 35000 + i * 100, status: 'ok' });
    }
    await appendHistorySample(product.id, { ts: now - 60 * day, price: 30000, status: 'ok' });

    const stats = await recomputeAndStoreStats(product.id, now);

    expect(stats.allTimeLow?.price).toBe(30000);
    expect(stats.samplesIn30d).toBe(5);
    expect(stats.min30d).toBe(35100);
    expect(stats.max30d).toBe(35500);
    expect(stats.lastComputedAt).toBe(now);
    expect((await getProduct(product.id))?.stats.allTimeLow?.price).toBe(30000);
  });

  it('throws when recomputing stats for a missing product', async () => {
    await initializeStorage();
    await expect(recomputeAndStoreStats('missing', Date.now())).rejects.toThrow('missing');
  });
});
