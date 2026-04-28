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
});
