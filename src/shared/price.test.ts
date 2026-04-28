import { describe, expect, it } from 'vitest';
import { computePercentile, formatPrice, parsePrice } from './price';

describe('formatPrice', () => {
  it('formats integer KRW with comma separators', () => {
    expect(formatPrice(37700)).toBe('37,700원');
    expect(formatPrice(1000000)).toBe('1,000,000원');
  });

  it('formats zero explicitly', () => {
    expect(formatPrice(0)).toBe('0원');
  });

  it('returns placeholder for null', () => {
    expect(formatPrice(null)).toBe('-');
  });

  it('rounds decimals to integer KRW', () => {
    expect(formatPrice(37700.7)).toBe('37,701원');
  });

  it('formats negative values for deltas', () => {
    expect(formatPrice(-5200)).toBe('-5,200원');
  });
});

describe('parsePrice', () => {
  it('extracts integer price from KRW text', () => {
    expect(parsePrice('37,700원')).toBe(37700);
  });

  it('works without a currency symbol', () => {
    expect(parsePrice('37,700')).toBe(37700);
  });

  it('trims whitespace', () => {
    expect(parsePrice('  37,700원 ')).toBe(37700);
  });

  it('returns null when no number exists', () => {
    expect(parsePrice('price on request')).toBeNull();
    expect(parsePrice('')).toBeNull();
  });

  it('chooses the largest number group to ignore discount rates', () => {
    expect(parsePrice('60% 37,700원')).toBe(37700);
  });
});

describe('computePercentile', () => {
  it('computes percentile in a sorted distribution', () => {
    const sorted = [10, 20, 30, 40, 50];
    expect(computePercentile(10, sorted)).toBe(0);
    expect(computePercentile(30, sorted)).toBe(50);
    expect(computePercentile(50, sorted)).toBe(100);
  });

  it('interpolates values between distribution points', () => {
    expect(computePercentile(25, [10, 20, 30, 40, 50])).toBeCloseTo(37.5);
  });

  it('clamps below minimum to 0', () => {
    expect(computePercentile(5, [10, 20, 30])).toBe(0);
  });

  it('clamps above maximum to 100', () => {
    expect(computePercentile(100, [10, 20, 30])).toBe(100);
  });

  it('returns NaN for empty distribution', () => {
    expect(computePercentile(50, [])).toBeNaN();
  });
});
