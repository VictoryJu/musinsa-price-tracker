import { parsePrice } from './price';
import type { CurrentSnapshot, ExtractorPath } from './types';

export interface RemoteExtractionConfig {
  disabledExtractorPaths?: ExtractorPath[];
  salePriceSelectors?: string[];
  genericPriceSelectors?: string[];
}

export interface ExtractProductPriceOptions {
  now?: number;
  productId?: string;
  apiEndpoint?: string;
  fetchJson?: (url: string) => Promise<unknown>;
  remoteConfig?: RemoteExtractionConfig;
}

export async function extractProductPrice(
  document: Document,
  options: ExtractProductPriceOptions = {}
): Promise<CurrentSnapshot> {
  const ts = options.now ?? Date.now();

  if (isSoldOut(document)) {
    return soldOutSnapshot(ts);
  }

  const salePrices = extractVisibleSalePrices(document, options.remoteConfig);
  const salePrice = salePrices[0] ?? null;
  const variantNotice = hasVariantSalePrices(salePrices) ? 'Variant prices detected' : undefined;
  if (isJsonLdSoldOut(document)) {
    return soldOutSnapshot(ts);
  }
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

  const cssPrice = extractCssPrice(document, options.remoteConfig);
  if (cssPrice !== null) {
    return {
      price: cssPrice,
      ts,
      extractorPath: 'css-selector',
      status: 'ok',
      ...(variantNotice ? { variantNotice } : {}),
    };
  }

  const apiResult = isExtractorDisabled(options.remoteConfig, 'internal-api')
    ? { price: null, soldOut: false }
    : await extractInternalApiResult(options);
  if (apiResult.soldOut) {
    return soldOutSnapshot(ts);
  }
  const apiPrice = apiResult.price;
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
    errorClass: 'parse',
    errorMessage: 'Unable to extract price',
  };
}

function soldOutSnapshot(ts: number): CurrentSnapshot {
  return {
    price: null,
    ts,
    extractorPath: 'unknown',
    status: 'soldOut',
    errorMessage: 'Product is sold out',
  };
}

async function extractInternalApiResult(options: ExtractProductPriceOptions): Promise<{ price: number | null; soldOut: boolean }> {
  if (!options.fetchJson) return { price: null, soldOut: false };

  const url = options.apiEndpoint ?? (options.productId ? `/api/product/${options.productId}` : null);
  if (!url) return { price: null, soldOut: false };

  try {
    const response = await options.fetchJson(url);
    if (findSoldOutFlag(response)) return { price: null, soldOut: true };
    const price = findApiPrice(response);
    return { price: price !== null && isValidPrice(price) ? price : null, soldOut: false };
  } catch {
    return { price: null, soldOut: false };
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

function extractCssPrice(document: Document, remoteConfig?: RemoteExtractionConfig): number | null {
  return extractVisibleSalePrices(document, remoteConfig)[0] ?? extractVisibleGenericPrice(document, remoteConfig);
}

function extractVisibleSalePrices(document: Document, remoteConfig?: RemoteExtractionConfig): number[] {
  const saleSelectors = [
    ...(remoteConfig?.salePriceSelectors ?? []),
    '[data-price-type="sale"]',
    '[data-testid="sale-price"]',
    '.sale-price',
    '[class*="sale"][class*="price"]',
  ];

  return findValidPrices(document, saleSelectors);
}

function extractVisibleGenericPrice(document: Document, remoteConfig?: RemoteExtractionConfig): number | null {
  const genericSelectors = [...(remoteConfig?.genericPriceSelectors ?? []), '[data-price]', '[data-testid="price"]', '.price'];
  return findFirstValidPrice(document, genericSelectors);
}

function isExtractorDisabled(remoteConfig: RemoteExtractionConfig | undefined, path: ExtractorPath): boolean {
  return remoteConfig?.disabledExtractorPaths?.includes(path) ?? false;
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

function isJsonLdSoldOut(document: Document): boolean {
  const scripts = Array.from(document.querySelectorAll('script[type="application/ld+json"]'));

  for (const script of scripts) {
    const text = script.textContent?.trim();
    if (!text) continue;

    try {
      if (findSoldOutFlag(JSON.parse(text) as unknown)) return true;
    } catch {
      continue;
    }
  }

  return false;
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

function findSoldOutFlag(value: unknown): boolean {
  if (Array.isArray(value)) return value.some((item) => findSoldOutFlag(item));
  if (!isRecord(value)) {
    if (typeof value !== 'string') return false;
    const normalized = value.toLowerCase();
    return normalized.includes('outofstock') || normalized.includes('soldout') || normalized.includes('sold out');
  }

  if (value.soldOut === true || value.isSoldOut === true || value.outOfStock === true) return true;
  return Object.values(value).some((item) => findSoldOutFlag(item));
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
