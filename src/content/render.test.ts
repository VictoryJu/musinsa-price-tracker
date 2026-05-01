import { describe, expect, it, vi } from 'vitest';
import type { Product } from '../shared/types';
import { renderProductUi } from './render';

function productFixture(overrides: Partial<Product> = {}): Product {
  return {
    id: '3674341',
    canonicalUrl: 'https://www.musinsa.com/products/3674341',
    name: 'Test Hoodie',
    thumbnail: '',
    addedAt: 0,
    notifyOnNewLow: true,
    currentSnapshot: {
      price: 37700,
      ts: 1,
      extractorPath: 'json-ld',
      status: 'ok',
    },
    stats: {
      allTimeLow: { price: 37700, ts: 1 },
      avg30d: 39000,
      min30d: 37700,
      max30d: 41000,
      samplesIn30d: 20,
      lastComputedAt: 1,
    },
    lastNotified: null,
    nextCheckAt: 0,
    lastCheckedAt: 1,
    ...overrides,
  };
}

describe('renderProductUi', () => {
  it('renders only a minimal tracking CTA for untracked products', () => {
    const onTrackStart = vi.fn();
    const result = renderProductUi({
      root: document,
      productId: '3674341',
      product: null,
      onTrackStart,
    });

    const mount = document.querySelector('[data-musinsa-price-tracker]');
    expect(result.mode).toBe('cta');
    expect(mount?.shadowRoot).toBeNull();
    expect(document.querySelectorAll('button')).toHaveLength(1);
    expect(document.querySelector('button')?.textContent).toBe('추적 시작');
    expect(mount?.getAttribute('data-hover-mounted')).toBeNull();
  });

  it('renders tracked products with a shadow label and hover marker', () => {
    const result = renderProductUi({
      root: document,
      productId: '3674341',
      product: productFixture(),
      onTrackStart: vi.fn(),
    });

    const mount = document.querySelector('[data-musinsa-price-tracker]');
    expect(result.mode).toBe('tracked');
    expect(mount?.shadowRoot?.textContent).toContain('37,700원');
    expect(mount?.getAttribute('data-hover-mounted')).toBe('true');
  });

  it('keeps tracked render under the 50ms budget in jsdom', () => {
    const result = renderProductUi({
      root: document,
      productId: '3674341',
      product: productFixture(),
      onTrackStart: vi.fn(),
    });

    expect(result.durationMs).toBeLessThan(50);
  });
});
