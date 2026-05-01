import { afterEach, describe, expect, it, vi } from 'vitest';
import type { HistorySample, Product } from '../shared/types';
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

function sample(ts: number, price: number | null, status: HistorySample['status'] = 'ok'): HistorySample {
  return { ts, price, status };
}

describe('renderProductUi', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

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

  it('renders failed extraction with a distinct error state', () => {
    renderProductUi({
      root: document,
      productId: '3674341',
      product: productFixture({
        currentSnapshot: {
          price: null,
          ts: 1,
          extractorPath: 'unknown',
          status: 'failed',
          errorClass: 'parse',
          errorMessage: 'Unable to extract price',
        },
      }),
      onTrackStart: vi.fn(),
    });

    const mount = document.querySelector('[data-musinsa-price-tracker]');
    expect(mount?.getAttribute('data-state')).toBe('failed');
    expect(mount?.shadowRoot?.textContent).toContain('가격 추출 실패 ⚠️');
    expect(mount?.shadowRoot?.querySelector('[data-status-style]')?.textContent).toContain('[data-state="failed"]');
  });

  it('renders bot-blocked fetch with a distinct blocked state', () => {
    renderProductUi({
      root: document,
      productId: '3674341',
      product: productFixture({
        currentSnapshot: {
          price: null,
          ts: 1,
          extractorPath: 'unknown',
          status: 'failed',
          errorClass: 'blocked',
          errorMessage: 'fetch blocked',
        },
      }),
      onTrackStart: vi.fn(),
    });

    const mount = document.querySelector('[data-musinsa-price-tracker]');
    expect(mount?.getAttribute('data-state')).toBe('blocked');
    expect(mount?.shadowRoot?.textContent).toContain('fetch 차단됨');
    expect(mount?.shadowRoot?.querySelector('[data-status-style]')?.textContent).toContain('[data-state="blocked"]');
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

  it('mounts tooltip only after the configured hover delay using cached history', () => {
    vi.useFakeTimers();
    renderProductUi({
      root: document,
      productId: '3674341',
      product: productFixture(),
      onTrackStart: vi.fn(),
      hoverDelayMs: 300,
      historySamples: [sample(1, 37700)],
    });

    const mount = document.querySelector('[data-musinsa-price-tracker]');
    mount?.dispatchEvent(new MouseEvent('mouseenter'));
    vi.advanceTimersByTime(299);
    expect(mount?.shadowRoot?.querySelector('[data-tooltip]')).toBeNull();

    vi.advanceTimersByTime(1);
    expect(mount?.shadowRoot?.querySelector('[data-tooltip]')?.textContent).toContain('1 samples');
  });

  it('does not mount tooltip when mouse leaves before the hover delay', () => {
    vi.useFakeTimers();
    renderProductUi({
      root: document,
      productId: '3674341',
      product: productFixture(),
      onTrackStart: vi.fn(),
      hoverDelayMs: 300,
      historySamples: [sample(1, 37700)],
    });

    const mount = document.querySelector('[data-musinsa-price-tracker]');
    mount?.dispatchEvent(new MouseEvent('mouseenter'));
    mount?.dispatchEvent(new MouseEvent('mouseleave'));
    vi.advanceTimersByTime(300);

    expect(mount?.shadowRoot?.querySelector('[data-tooltip]')).toBeNull();
  });

  it('does not mount sparkline after quick hover passes', () => {
    vi.useFakeTimers();
    renderProductUi({
      root: document,
      productId: '3674341',
      product: productFixture(),
      onTrackStart: vi.fn(),
      hoverDelayMs: 300,
      historySamples: [sample(1, 37700)],
    });

    const mount = document.querySelector('[data-musinsa-price-tracker]');
    for (let i = 0; i < 10; i += 1) {
      mount?.dispatchEvent(new MouseEvent('mouseenter'));
      vi.advanceTimersByTime(50);
      mount?.dispatchEvent(new MouseEvent('mouseleave'));
    }
    vi.advanceTimersByTime(300);

    expect(mount?.shadowRoot?.querySelector('[data-sparkline]')).toBeNull();
  });

  it('renders cached history as an inline SVG sparkline after hover delay', () => {
    vi.useFakeTimers();
    renderProductUi({
      root: document,
      productId: '3674341',
      product: productFixture(),
      onTrackStart: vi.fn(),
      hoverDelayMs: 300,
      historySamples: [
        sample(3, 39000),
        sample(1, 37000),
        sample(2, 38000),
      ],
    });

    const mount = document.querySelector('[data-musinsa-price-tracker]');
    mount?.dispatchEvent(new MouseEvent('mouseenter'));
    vi.advanceTimersByTime(300);

    const sparkline = mount?.shadowRoot?.querySelector('[data-sparkline]');
    expect(sparkline?.tagName.toLowerCase()).toBe('svg');
    expect(sparkline?.querySelector('polyline')?.getAttribute('points')).toBe('0,18 50,9 100,0');
  });

  it('ignores unavailable samples in the hover sparkline path', () => {
    vi.useFakeTimers();
    renderProductUi({
      root: document,
      productId: '3674341',
      product: productFixture(),
      onTrackStart: vi.fn(),
      hoverDelayMs: 300,
      historySamples: [
        sample(1, 37000),
        sample(2, null, 'soldOut'),
        sample(3, null, 'failed'),
        sample(4, 39000),
      ],
    });

    const mount = document.querySelector('[data-musinsa-price-tracker]');
    mount?.dispatchEvent(new MouseEvent('mouseenter'));
    vi.advanceTimersByTime(300);

    expect(mount?.shadowRoot?.querySelector('[data-sparkline] polyline')?.getAttribute('points')).toBe('0,18 100,0');
  });
});
