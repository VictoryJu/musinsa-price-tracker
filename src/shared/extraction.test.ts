import { describe, expect, it, vi } from 'vitest';
import { extractProductPrice } from './extraction';

const KRW = '\uC6D0';

function doc(html: string): Document {
  return new DOMParser().parseFromString(html, 'text/html');
}

describe('extractProductPrice', () => {
  it('uses JSON-LD Offer.price when the same price is visible on the page', async () => {
    const page = doc(`
      <html>
        <body>
          <script type="application/ld+json">
            {
              "@context": "https://schema.org",
              "@type": "Product",
              "offers": { "@type": "Offer", "price": "37700" }
            }
          </script>
          <strong class="price">37,700${KRW}</strong>
        </body>
      </html>
    `);

    await expect(extractProductPrice(page, { now: 1 })).resolves.toEqual({
      price: 37700,
      ts: 1,
      extractorPath: 'json-ld',
      status: 'ok',
    });
  });

  it('rejects JSON-LD price when it does not match the visible page price', async () => {
    const page = doc(`
      <html>
        <body>
          <script type="application/ld+json">
            {
              "@context": "https://schema.org",
              "@type": "Product",
              "offers": { "@type": "Offer", "price": "49900" }
            }
          </script>
          <strong class="sale-price">37,700${KRW}</strong>
        </body>
      </html>
    `);

    const result = await extractProductPrice(page, { now: 1 });

    expect(result.extractorPath).toBe('css-selector');
    expect(result.price).toBe(37700);
    expect(result.status).toBe('ok');
  });

  it('prefers visible sale price over regular price in CSS fallback', async () => {
    const page = doc(`
      <html>
        <body>
          <span class="price">49,900${KRW}</span>
          <strong class="sale-price">37,700${KRW}</strong>
        </body>
      </html>
    `);

    const result = await extractProductPrice(page, { now: 1 });

    expect(result.extractorPath).toBe('css-selector');
    expect(result.price).toBe(37700);
    expect(result.status).toBe('ok');
  });

  it('prefers visible sale price over JSON-LD list price when both are visible', async () => {
    const page = doc(`
      <html>
        <body>
          <script type="application/ld+json">
            {
              "@context": "https://schema.org",
              "@type": "Product",
              "offers": { "@type": "Offer", "price": "49900" }
            }
          </script>
          <span class="price">49,900${KRW}</span>
          <strong class="sale-price">37,700${KRW}</strong>
        </body>
      </html>
    `);

    const result = await extractProductPrice(page, { now: 1 });

    expect(result.extractorPath).toBe('css-selector');
    expect(result.price).toBe(37700);
    expect(result.status).toBe('ok');
  });

  it('ignores member coupon and app-only prices when choosing a generic price', async () => {
    const page = doc(`
      <html>
        <body>
          <span class="member-price" data-price="35000">회원가 35,000${KRW}</span>
          <span class="coupon-price" data-price="33000">쿠폰 적용가 33,000${KRW}</span>
          <span class="app-price" data-price="31000">앱 전용가 31,000${KRW}</span>
          <span class="price">49,900${KRW}</span>
        </body>
      </html>
    `);

    const result = await extractProductPrice(page, { now: 1 });

    expect(result.extractorPath).toBe('css-selector');
    expect(result.price).toBe(49900);
    expect(result.status).toBe('ok');
  });

  it('flags variant sale prices while tracking the lowest representative sale price', async () => {
    const page = doc(`
      <html>
        <body>
          <button data-option="S">
            <strong class="sale-price">37,700${KRW}</strong>
          </button>
          <button data-option="M">
            <strong class="sale-price">39,900${KRW}</strong>
          </button>
        </body>
      </html>
    `);

    await expect(extractProductPrice(page, { now: 1 })).resolves.toEqual({
      price: 37700,
      ts: 1,
      extractorPath: 'css-selector',
      status: 'ok',
      variantNotice: 'Variant prices detected',
    });
  });

  it('returns soldOut when sold-out text is visible', async () => {
    const page = doc(`
      <html>
        <body>
          <h1>Test Hoodie</h1>
          <button disabled>품절</button>
        </body>
      </html>
    `);

    await expect(extractProductPrice(page, { now: 1 })).resolves.toEqual({
      price: null,
      ts: 1,
      extractorPath: 'unknown',
      status: 'soldOut',
      errorMessage: 'Product is sold out',
    });
  });

  it('returns failed when every extraction path is unavailable', async () => {
    const page = doc(`
      <html>
        <body>
          <h1>Test Hoodie</h1>
          <p>No price here.</p>
        </body>
      </html>
    `);

    await expect(extractProductPrice(page, { now: 1 })).resolves.toEqual({
      price: null,
      ts: 1,
      extractorPath: 'unknown',
      status: 'failed',
      errorMessage: 'Unable to extract price',
    });
  });

  it('uses injected internal API fetcher as the last resort', async () => {
    const page = doc(`
      <html>
        <body>
          <h1>Test Hoodie</h1>
        </body>
      </html>
    `);
    const fetchJson = vi.fn(async () => ({ product: { salePrice: 37700 } }));

    const result = await extractProductPrice(page, {
      now: 1,
      productId: '3674341',
      fetchJson,
    });

    expect(fetchJson).toHaveBeenCalledWith('/api/product/3674341');
    expect(result).toEqual({
      price: 37700,
      ts: 1,
      extractorPath: 'internal-api',
      status: 'ok',
    });
  });

  it('returns failed when internal API fallback throws', async () => {
    const page = doc(`
      <html>
        <body>
          <h1>Test Hoodie</h1>
        </body>
      </html>
    `);
    const fetchJson = vi.fn(async () => {
      throw new Error('blocked');
    });

    await expect(
      extractProductPrice(page, {
        now: 1,
        apiEndpoint: '/api/custom/3674341',
        fetchJson,
      })
    ).resolves.toEqual({
      price: null,
      ts: 1,
      extractorPath: 'unknown',
      status: 'failed',
      errorMessage: 'Unable to extract price',
    });
  });
});
