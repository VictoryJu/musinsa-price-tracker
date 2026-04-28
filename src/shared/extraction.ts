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
  const jsonLdPrice = extractJsonLdPrice(document);

  if (jsonLdPrice !== null && isValidPrice(jsonLdPrice) && isPriceVisible(document, jsonLdPrice)) {
    return {
      price: jsonLdPrice,
      ts,
      extractorPath: 'json-ld',
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
  const visibleText = document.body?.textContent ?? '';
  return parsePrice(visibleText) === price || visibleText.includes(price.toLocaleString('ko-KR'));
}

function isValidPrice(price: number): boolean {
  return price > 0 && price < 100_000_000;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
