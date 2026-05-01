import { describe, expect, it } from 'vitest';
import { canonicalizeProductUrl } from './url';

describe('canonicalizeProductUrl', () => {
  it('strips tracking query params from product URLs', () => {
    expect(canonicalizeProductUrl('https://www.musinsa.com/products/3674341?utm_source=ad&foo=bar')).toBe(
      'https://www.musinsa.com/products/3674341'
    );
  });

  it('preserves explicitly whitelisted query params', () => {
    expect(canonicalizeProductUrl('https://www.musinsa.com/products/3674341?color=black&utm_source=ad', ['color'])).toBe(
      'https://www.musinsa.com/products/3674341?color=black'
    );
  });

  it('normalizes hash fragments away', () => {
    expect(canonicalizeProductUrl('https://www.musinsa.com/products/3674341#reviews')).toBe(
      'https://www.musinsa.com/products/3674341'
    );
  });
});
