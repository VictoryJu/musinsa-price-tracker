import { describe, expect, it, vi } from 'vitest';
import { getHistoryChunk, getProduct, initializeStorage, setProduct } from '../shared/storage';
import type { Product } from '../shared/types';
import { processProductCheck } from './pipeline';

const KRW = '\uC6D0';

function productFixture(id = '3674341'): Product {
  return {
    id,
    canonicalUrl: `https://www.musinsa.com/products/${id}`,
    name: 'Test Hoodie',
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
    nextCheckAt: 0,
    lastCheckedAt: 0,
  };
}

function productHtml(price: number): string {
  return `
    <html>
      <body>
        <script type="application/ld+json">
          {
            "@context": "https://schema.org",
            "@type": "Product",
            "offers": { "@type": "Offer", "price": "${price}" }
          }
        </script>
        <strong class="price">${price.toLocaleString('ko-KR')}${KRW}</strong>
      </body>
    </html>
  `;
}

describe('processProductCheck', () => {
  it('fetches, extracts, stores history, recomputes stats, and reschedules one product', async () => {
    await initializeStorage();
    const product = productFixture();
    await setProduct(product);
    const now = Date.UTC(2026, 3, 15);

    await processProductCheck(product.id, {
      now,
      jitterMs: 30_000,
      fetchHtml: async (url) => {
        expect(url).toBe(product.canonicalUrl);
        return productHtml(37700);
      },
    });

    const stored = await getProduct(product.id);
    expect(stored?.currentSnapshot).toEqual({
      price: 37700,
      ts: now,
      extractorPath: 'json-ld',
      status: 'ok',
    });
    expect(stored?.lastCheckedAt).toBe(now);
    expect(stored?.nextCheckAt).toBe(now + 12 * 60 * 60 * 1000 + 30_000);
    expect(stored?.stats.allTimeLow).toEqual({ price: 37700, ts: now });

    const history = await getHistoryChunk(product.id, '2026-04');
    expect(history).toEqual([{ ts: now, price: 37700, status: 'ok' }]);
  });

  it('persists a failed snapshot and schedule when fetch throws', async () => {
    await initializeStorage();
    const product = productFixture();
    await setProduct(product);
    const now = Date.UTC(2026, 3, 15);

    await processProductCheck(product.id, {
      now,
      jitterMs: 30_000,
      fetchHtml: async () => {
        throw new Error('fetch blocked');
      },
    });

    const stored = await getProduct(product.id);
    expect(stored?.currentSnapshot).toEqual({
      price: null,
      ts: now,
      extractorPath: 'unknown',
      status: 'failed',
      errorClass: 'blocked',
      errorMessage: 'fetch blocked',
    });
    expect(stored?.lastCheckedAt).toBe(now);
    expect(stored?.nextCheckAt).toBe(now + 12 * 60 * 60 * 1000 + 30_000);

    const history = await getHistoryChunk(product.id, '2026-04');
    expect(history).toEqual([{ ts: now, price: null, status: 'failed' }]);
  });

  it.each([
    ['network', new TypeError('Failed to fetch')],
    ['http4xx', new Error('Fetch failed: 404')],
    ['http5xx', new Error('Fetch failed: 503')],
    ['blocked', new Error('fetch blocked by bot protection')],
  ] as const)('classifies %s fetch failures', async (errorClass, error) => {
    await initializeStorage();
    const product = productFixture();
    await setProduct(product);
    const now = Date.UTC(2026, 3, 15);

    await processProductCheck(product.id, {
      now,
      fetchHtml: async () => {
        throw error;
      },
    });

    expect((await getProduct(product.id))?.currentSnapshot).toMatchObject({
      price: null,
      ts: now,
      extractorPath: 'unknown',
      status: 'failed',
      errorClass,
    });
  });

  it('schedules one retry five minutes after the first failed check', async () => {
    await initializeStorage();
    const product = {
      ...productFixture(),
      currentSnapshot: {
        price: 41000,
        ts: Date.UTC(2026, 3, 14),
        extractorPath: 'json-ld' as const,
        status: 'ok' as const,
      },
    };
    await setProduct(product);
    const now = Date.UTC(2026, 3, 15);

    await processProductCheck(product.id, {
      now,
      fetchHtml: async () => {
        throw new TypeError('Failed to fetch');
      },
    });

    expect((await getProduct(product.id))?.nextCheckAt).toBe(now + 5 * 60 * 1000);
  });

  it('uses the regular interval after a persistent failed retry', async () => {
    await initializeStorage();
    const product = {
      ...productFixture(),
      currentSnapshot: {
        price: null,
        ts: Date.UTC(2026, 3, 14),
        extractorPath: 'unknown' as const,
        status: 'failed' as const,
        errorClass: 'network' as const,
        errorMessage: 'Failed to fetch',
      },
    };
    await setProduct(product);
    const now = Date.UTC(2026, 3, 15);

    await processProductCheck(product.id, {
      now,
      jitterMs: 0,
      fetchHtml: async () => {
        throw new TypeError('Failed to fetch');
      },
    });

    expect((await getProduct(product.id))?.nextCheckAt).toBe(now + 12 * 60 * 60 * 1000);
  });

  it('notifies once after a successful new-low price check', async () => {
    await initializeStorage();
    const product = productFixture();
    await setProduct(product);
    const now = Date.UTC(2026, 3, 15);
    const notify = vi.fn();

    await processProductCheck(product.id, {
      now,
      fetchHtml: async () => productHtml(30000),
      notify,
    });

    expect(notify).toHaveBeenCalledOnce();
    expect((await getProduct(product.id))?.lastNotified).toEqual({ price: 30000, ts: now });
  });

  it('ignores stale price checks older than the product lastCheckedAt tolerance', async () => {
    await initializeStorage();
    const previousSnapshot = {
      price: 41000,
      ts: Date.UTC(2026, 3, 20),
      extractorPath: 'json-ld' as const,
      status: 'ok' as const,
    };
    const product = productFixture();
    await setProduct({
      ...product,
      currentSnapshot: previousSnapshot,
      lastCheckedAt: Date.UTC(2026, 3, 20),
    });
    const notify = vi.fn();

    await processProductCheck(product.id, {
      now: Date.UTC(2026, 3, 18, 23, 59),
      fetchHtml: async () => productHtml(30000),
      notify,
    });

    expect(await getHistoryChunk(product.id, '2026-04')).toEqual([]);
    expect((await getProduct(product.id))?.currentSnapshot).toEqual(previousSnapshot);
    expect(notify).not.toHaveBeenCalled();
  });

  it('persists restock transition from sold-out to ok and recomputes stats from ok samples', async () => {
    await initializeStorage();
    const product = productFixture();
    const soldOutAt = Date.UTC(2026, 3, 14);
    const restockedAt = Date.UTC(2026, 3, 15);
    await setProduct({
      ...product,
      currentSnapshot: {
        price: null,
        ts: soldOutAt,
        extractorPath: 'unknown',
        status: 'soldOut',
        errorMessage: 'Product is sold out',
      },
      lastCheckedAt: soldOutAt,
    });

    await processProductCheck(product.id, {
      now: restockedAt,
      fetchHtml: async () => productHtml(37700),
    });

    const stored = await getProduct(product.id);
    expect(stored?.currentSnapshot).toEqual({
      price: 37700,
      ts: restockedAt,
      extractorPath: 'json-ld',
      status: 'ok',
    });
    expect(await getHistoryChunk(product.id, '2026-04')).toEqual([{ ts: restockedAt, price: 37700, status: 'ok' }]);
    expect(stored?.stats.samplesIn30d).toBe(1);
    expect(stored?.stats.allTimeLow).toEqual({ price: 37700, ts: restockedAt });
  });
});
