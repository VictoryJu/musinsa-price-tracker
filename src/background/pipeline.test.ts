import { describe, expect, it } from 'vitest';
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
});
