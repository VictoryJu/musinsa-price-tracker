import { describe, expect, it } from 'vitest';
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
});
