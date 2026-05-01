import { parsePrice } from './price';
import type { CurrentSnapshot } from './types';

export interface ExtractProductPriceOptions {
  now?: number;
  productId?: string;
  apiEndpoint?: string;
  fetchJson?: (url: string) => Promise<unknown>;
}

export async function extractProductPrice(
  document: Document,
  options: ExtractProductPriceOptions = {}
): Promise<CurrentSnapshot> {
  const ts = options.now ?? Date.now();

  if (isSoldOut(document)) {
    return {
      price: null,
      ts,
      extractorPath: 'unknown',
      status: 'soldOut',
      errorMessage: 'Product is sold out',
    };
  }

  const salePrices = extractVisibleSalePrices(document);
  const salePrice = salePrices[0] ?? null;
  const variantNotice = hasVariantSalePrices(salePrices) ? 'Variant prices detected' : undefined;
  const jsonLdPrice = extractJsonLdPrice(document);

  if (jsonLdPrice !== null && isValidPrice(jsonLdPrice) && isPriceVisible(document, jsonLdPrice)) {
    if (salePrice !== null && salePrice !== jsonLdPrice) {
      return {
        price: salePrice,
        ts,
        extractorPath: 'css-selector',
        status: 'ok',
        ...(variantNotice ? { variantNotice } : {}),
      };
    }

    return {
      price: jsonLdPrice,
      ts,
      extractorPath: 'json-ld',
      status: 'ok',
    };
  }

  const cssPrice = extractCssPrice(document);
  if (cssPrice !== null) {
    return {
      price: cssPrice,
      ts,
      extractorPath: 'css-selector',
      status: 'ok',
      ...(variantNotice ? { variantNotice } : {}),
    };
  }

  const apiPrice = await extractInternalApiPrice(options);
  if (apiPrice !== null) {
    return {
      price: apiPrice,
      ts,
      extractorPath: 'internal-api',
      status: 'ok',
    };
  }

  return {
    price: null,
    ts,
    extractorPath: 'unknown',
    status: 'failed',
    errorMessage: 'Unable to extract price',
  };
}

async function extractInternalApiPrice(options: ExtractProductPriceOptions): Promise<number | null> {
  if (!options.fetchJson) return null;

  const url = options.apiEndpoint ?? (options.productId ? `/api/product/${options.productId}` : null);
  if (!url) return null;

  try {
    const response = await options.fetchJson(url);
    const price = findApiPrice(response);
    return price !== null && isValidPrice(price) ? price : null;
  } catch {
    return null;
  }
}

function findApiPrice(value: unknown): number | null {
  if (Array.isArray(value)) {
    for (const item of value) {
      const price = findApiPrice(item);
      if (price !== null) return price;
    }
    return null;
  }

  if (!isRecord(value)) return readPriceValue(value);

  const salePrice = readPriceValue(value.salePrice);
  if (salePrice !== null) return salePrice;

  const price = readPriceValue(value.price);
  if (price !== null) return price;

  for (const item of Object.values(value)) {
    const nestedPrice = findApiPrice(item);
    if (nestedPrice !== null) return nestedPrice;
  }

  return null;
}

function extractCssPrice(document: Document): number | null {
  return extractVisibleSalePrices(document)[0] ?? extractVisibleGenericPrice(document);
}

function extractVisibleSalePrices(document: Document): number[] {
  const saleSelectors = [
    '[data-price-type="sale"]',
    '[data-testid="sale-price"]',
    '.sale-price',
    '[class*="sale"][class*="price"]',
  ];

  return findValidPrices(document, saleSelectors);
}

function extractVisibleGenericPrice(document: Document): number | null {
  const genericSelectors = ['[data-price]', '[data-testid="price"]', '.price'];
  return findFirstValidPrice(document, genericSelectors);
}

function findFirstValidPrice(document: Document, selectors: string[]): number | null {
  return findValidPrices(document, selectors)[0] ?? null;
}

function findValidPrices(document: Document, selectors: string[]): number[] {
  const prices: number[] = [];
  for (const selector of selectors) {
    const elements = Array.from(document.querySelectorAll(selector));
    for (const element of elements) {
      if (isConditionalPriceElement(element)) continue;
      const attrPrice = element.getAttribute('data-price');
      const price = parsePrice(attrPrice ?? element.textContent ?? '');
      if (price !== null && isValidPrice(price)) prices.push(price);
    }
  }

  return [...new Set(prices)].sort((a, b) => a - b);
}

function hasVariantSalePrices(prices: number[]): boolean {
  return new Set(prices).size > 1;
}

function isConditionalPriceElement(element: Element): boolean {
  const markerText = [
    element.className,
    element.id,
    element.getAttribute('data-testid'),
    element.getAttribute('data-price-type'),
    element.textContent,
    element.parentElement?.className,
    element.parentElement?.id,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();

  return ['member', 'coupon', 'app', '회원', '쿠폰', '앱'].some((marker) => markerText.includes(marker));
}

function extractJsonLdPrice(document: Document): number | null {
  const scripts = Array.from(document.querySelectorAll('script[type="application/ld+json"]'));

  for (const script of scripts) {
    const text = script.textContent?.trim();
    if (!text) continue;

    try {
      const parsed = JSON.parse(text) as unknown;
      const price = findJsonLdPrice(parsed);
      if (price !== null) return price;
    } catch {
      continue;
    }
  }

  return null;
}

function findJsonLdPrice(value: unknown): number | null {
  if (Array.isArray(value)) {
    for (const item of value) {
      const price = findJsonLdPrice(item);
      if (price !== null) return price;
    }
    return null;
  }

  if (!isRecord(value)) return null;

  const directPrice = readPriceValue(value.price);
  if (directPrice !== null) return directPrice;

  const offersPrice = findJsonLdPrice(value.offers);
  if (offersPrice !== null) return offersPrice;

  const offerPrice = findJsonLdPrice(value.offer);
  if (offerPrice !== null) return offerPrice;

  const specificationPrice = findJsonLdPrice(value.priceSpecification);
  if (specificationPrice !== null) return specificationPrice;

  return null;
}

function readPriceValue(value: unknown): number | null {
  if (typeof value === 'number') return value;
  if (typeof value === 'string') return parsePrice(value);
  return null;
}

function isPriceVisible(document: Document, price: number): boolean {
  const visibleText = getVisibleText(document);
  return parsePrice(visibleText) === price || visibleText.includes(price.toLocaleString('ko-KR'));
}

function getVisibleText(document: Document): string {
  const clone = document.body?.cloneNode(true);
  if (!(clone instanceof HTMLElement)) return '';
  clone.querySelectorAll('script, style, noscript').forEach((element) => element.remove());
  return clone.textContent ?? '';
}

function isSoldOut(document: Document): boolean {
  const text = getVisibleText(document).toLowerCase();
  return ['sold out', '품절', '일시품절', '판매 종료'].some((marker) => text.includes(marker));
}

function isValidPrice(price: number): boolean {
  return price > 0 && price < 100_000_000;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
