import { describe, expect, it } from 'vitest';
import { getProduct, initializeStorage, setProduct } from '../shared/storage';
import { computeNextCheckAt, pickDueProduct, registerBackgroundScheduler, runDueProductBatch } from './scheduler';
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

  it('processes only one due product per alarm batch', async () => {
    await initializeStorage();
    const now = Date.UTC(2026, 3, 15);
    await setProduct(product('due-a', now - 10_000));
    await setProduct(product('due-b', now - 5_000));

    const result = await runDueProductBatch({
      now,
      jitterMs: 0,
      fetchHtml: async () => `
        <html>
          <body>
            <strong class="price">37,700\uC6D0</strong>
          </body>
        </html>
      `,
    });

    expect(result.processedProductId).toBe('due-a');
    expect((await getProduct('due-a'))?.lastCheckedAt).toBe(now);
    expect((await getProduct('due-b'))?.lastCheckedAt).toBe(0);
  });

  it('re-reads storage on the next wake so resume after worker death is safe', async () => {
    await initializeStorage();
    const now = Date.UTC(2026, 3, 15);
    await setProduct(product('due-a', now - 10_000));
    await setProduct(product('due-b', now - 5_000));

    const fetchHtml = async (): Promise<string> => '<html><body><strong class="price">37,700\uC6D0</strong></body></html>';

    const first = await runDueProductBatch({ now, jitterMs: 0, fetchHtml });
    const second = await runDueProductBatch({ now, jitterMs: 0, fetchHtml });

    expect(first.processedProductId).toBe('due-a');
    expect(second.processedProductId).toBe('due-b');
    expect((await getProduct('due-a'))?.lastCheckedAt).toBe(now);
    expect((await getProduct('due-b'))?.lastCheckedAt).toBe(now);
  });

  it('prevents simultaneous alarm wakes from processing the same product twice in one worker', async () => {
    await initializeStorage();
    const now = Date.UTC(2026, 3, 15);
    await setProduct(product('due-a', now - 10_000));
    let fetchCount = 0;

    const [first, second] = await Promise.all([
      runDueProductBatch({
        now,
        jitterMs: 0,
        fetchHtml: async () => {
          fetchCount += 1;
          await new Promise((resolve) => setTimeout(resolve, 10));
          return '<html><body><strong class="price">37,700\uC6D0</strong></body></html>';
        },
      }),
      runDueProductBatch({
        now,
        jitterMs: 0,
        fetchHtml: async () => {
          fetchCount += 1;
          return '<html><body><strong class="price">37,700\uC6D0</strong></body></html>';
        },
      }),
    ]);

    expect([first.processedProductId, second.processedProductId].filter(Boolean)).toEqual(['due-a']);
    expect(fetchCount).toBe(1);
  });

  it('registers MV3 startup, install, and alarm listeners', () => {
    registerBackgroundScheduler({
      fetchHtml: async () => '<html></html>',
    });

    expect(chrome.alarms.create).toHaveBeenCalledWith('musinsa-price-tracker.tick', { periodInMinutes: 1 });
    expect(chrome.alarms.onAlarm.addListener).toHaveBeenCalledTimes(1);
    expect(chrome.runtime.onInstalled.addListener).toHaveBeenCalledTimes(1);
    expect(chrome.runtime.onStartup.addListener).toHaveBeenCalledTimes(1);
  });
});
