import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
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
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders a compact tracking CTA for untracked products', () => {
    const onTrackStart = vi.fn();
    const result = renderProductUi({
      root: document,
      productId: '3674341',
      product: null,
      onTrackStart,
    });

    const mount = document.querySelector('[data-musinsa-price-tracker]');
    const button = document.querySelector('button');
    expect(result.mode).toBe('cta');
    expect(mount?.shadowRoot).toBeNull();
    expect(button?.textContent).toBe('+');
    expect(button?.getAttribute('aria-label')).toBe('Track this product');
    expect(mount?.getAttribute('data-hover-mounted')).toBeNull();
  });

  it('pins the extension mount into the visible viewport', () => {
    renderProductUi({
      root: document,
      productId: '3674341',
      product: null,
      onTrackStart: vi.fn(),
    });

    const mount = document.querySelector<HTMLElement>('[data-musinsa-price-tracker]');
    expect(mount?.style.position).toBe('fixed');
    expect(mount?.style.right).toBe('24px');
    expect(mount?.style.bottom).toBe('24px');
    expect(mount?.style.zIndex).toBe('2147483647');
  });

  it('places a compact tracking badge next to the Musinsa price and keeps details in a hover popover', () => {
    const now = Date.UTC(2026, 4, 1);
    document.body.innerHTML = '<div><span>60%</span> <strong id="musinsa-price">37,700\uC6D0</strong></div>';
    const result = renderProductUi({
      root: document,
      productId: '3674341',
      product: productFixture({ addedAt: now - 20 * 24 * 60 * 60 * 1000, lastCheckedAt: now }),
      onTrackStart: vi.fn(),
      now,
      historySamples: [sample(1, 37700), sample(2, 39000), sample(3, 38350)],
    });

    const mount = document.querySelector('[data-musinsa-price-tracker]');
    const shadow = mount?.shadowRoot;
    expect(result.mode).toBe('tracked');
    expect(document.querySelector('#musinsa-price')?.nextElementSibling).toBe(mount);
    expect(mount?.getAttribute('data-placement')).toBe('inline-price');
    expect((mount as HTMLElement | null)?.style.position).toBe('relative');
    expect(mount?.getAttribute('data-hover-mounted')).toBeNull();
    expect(shadow?.querySelector('[data-price-badge]')?.textContent).toBe('Tracked 37,700\uC6D0');
    expect(shadow?.querySelector('[data-price-popover]')).not.toBeNull();
    expect(shadow?.querySelector('[data-price-card]')).not.toBeNull();
    expect(shadow?.querySelector('[data-current-price]')?.textContent).toBe('37,700원');
    expect(shadow?.querySelector('[data-snapshot-label]')?.textContent).toBe('Current price');
    expect(shadow?.querySelector('[data-stat="low"]')?.textContent).toContain('37,700원');
    expect(shadow?.querySelector('[data-stat="avg"]')?.textContent).toContain('39,000원');
    expect(shadow?.querySelector('[data-sparkline] polyline')?.getAttribute('points')).toBe('0,18 50,0 100,9');
  });

  it('prefers the product detail price over matching recommendation prices', () => {
    document.body.innerHTML = `
      <article class="Curation__Container"><span id="recommended-price">37,700\uC6D0</span></article>
      <div class="Price__CurrentPrice-sc-1vz564u-7"><span>60%</span><span id="detail-price" class="Price__CalculatedPrice-sc-1vz564u-11">37,700\uC6D0</span></div>
    `;

    renderProductUi({
      root: document,
      productId: '3674341',
      product: productFixture(),
      onTrackStart: vi.fn(),
    });

    const mount = document.querySelector('[data-musinsa-price-tracker]');
    expect(document.querySelector('#detail-price')?.nextElementSibling).toBe(mount);
    expect(document.querySelector('#recommended-price')?.nextElementSibling).not.toBe(mount);
  });

  it('falls back to the lower-right floating card when the page price anchor cannot be found', () => {
    renderProductUi({
      root: document,
      productId: '3674341',
      product: productFixture(),
      onTrackStart: vi.fn(),
    });

    const mount = document.querySelector<HTMLElement>('[data-musinsa-price-tracker]');
    expect(mount?.getAttribute('data-placement')).toBe('floating-fallback');
    expect(mount?.style.position).toBe('fixed');
    expect(mount?.style.right).toBe('24px');
    expect(mount?.style.bottom).toBe('24px');
  });

  it('moves the tracked UI from fallback to the product price when the price DOM appears later', () => {
    vi.useFakeTimers();
    renderProductUi({
      root: document,
      productId: '3674341',
      product: productFixture(),
      onTrackStart: vi.fn(),
      placementRetryMs: [100],
    });

    const mount = document.querySelector<HTMLElement>('[data-musinsa-price-tracker]');
    expect(mount?.getAttribute('data-placement')).toBe('floating-fallback');

    document.body.insertAdjacentHTML(
      'afterbegin',
      '<div class="Price__CurrentPrice-sc-1vz564u-7"><span id="late-price" class="Price__CalculatedPrice-sc-1vz564u-11">37,700\uC6D0</span></div>'
    );
    vi.advanceTimersByTime(100);

    expect(document.querySelector('#late-price')?.nextElementSibling).toBe(mount);
    expect(mount?.getAttribute('data-placement')).toBe('inline-price');
    expect(mount?.style.position).toBe('relative');
  });

  it('keeps a one-sample chart visible with an empty state instead of hiding it', () => {
    renderProductUi({
      root: document,
      productId: '3674341',
      product: productFixture(),
      onTrackStart: vi.fn(),
      historySamples: [sample(1, 37700)],
    });

    const sparkline = document.querySelector('[data-musinsa-price-tracker]')?.shadowRoot?.querySelector('[data-sparkline]');
    expect(sparkline).not.toBeNull();
    expect(sparkline?.getAttribute('data-empty')).toBe('true');
  });

  it('resets inherited page styles at the shadow host boundary', () => {
    renderProductUi({
      root: document,
      productId: '3674341',
      product: productFixture(),
      onTrackStart: vi.fn(),
    });

    const style = document
      .querySelector('[data-musinsa-price-tracker]')
      ?.shadowRoot?.querySelector('[data-status-style]')?.textContent;
    expect(style).toContain('all: initial');
    expect(style).toContain('font-family:');
    expect(style).toContain('color:');
    expect(style).toContain('line-height:');
    expect(style).toContain('font-size:');
  });

  it('renders soak-period tracking progress while still showing price', () => {
    const now = Date.UTC(2026, 4, 10);
    renderProductUi({
      root: document,
      productId: '3674341',
      product: productFixture({ addedAt: now - 2 * 24 * 60 * 60 * 1000, lastCheckedAt: now }),
      onTrackStart: vi.fn(),
      now,
      soakPeriodDays: 14,
    });

    const shadow = document.querySelector('[data-musinsa-price-tracker]')?.shadowRoot;
    expect(shadow?.querySelector('[data-snapshot-label]')?.textContent).toBe('Tracking day 3 / D-11');
    expect(shadow?.querySelector('[data-current-price]')?.textContent).toBe('37,700원');
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
    expect(mount?.shadowRoot?.textContent).toContain('Price extraction failed');
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
    expect(mount?.shadowRoot?.textContent).toContain('Fetch blocked');
  });

  it('renders a stale last-updated badge when product data is older than 24 hours', () => {
    const now = Date.UTC(2026, 4, 1, 12);
    renderProductUi({
      root: document,
      productId: '3674341',
      product: productFixture({ lastCheckedAt: now - 26 * 60 * 60 * 1000 }),
      onTrackStart: vi.fn(),
      now,
    });

    const staleBadge = document.querySelector('[data-musinsa-price-tracker]')?.shadowRoot?.querySelector('[data-stale-badge]');
    expect(staleBadge?.textContent).toBe('Last update: 26h ago');
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

  it('refreshes the tracked product from the always-visible card and shows a pending state', async () => {
    let resolveRefresh!: () => void;
    const onRefreshNow = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveRefresh = resolve;
        })
    );
    renderProductUi({
      root: document,
      productId: '3674341',
      product: productFixture(),
      onTrackStart: vi.fn(),
      onRefreshNow,
      historySamples: [sample(1, 37700), sample(2, 38000)],
    });

    const button = document
      .querySelector('[data-musinsa-price-tracker]')
      ?.shadowRoot?.querySelector<HTMLButtonElement>('[data-refresh-now]');
    button?.click();
    await Promise.resolve();

    expect(onRefreshNow).toHaveBeenCalledWith('3674341');
    expect(button?.disabled).toBe(true);
    expect(button?.getAttribute('aria-busy')).toBe('true');
    expect(button?.textContent).toBe('Updating...');

    resolveRefresh();
    await Promise.resolve();
    await Promise.resolve();

    expect(button?.disabled).toBe(false);
    expect(button?.getAttribute('aria-busy')).toBe('false');
    expect(button?.textContent).toBe('Update');
  });

  it('keeps the popover open long enough to move from the badge to the update button', () => {
    vi.useFakeTimers();
    document.body.innerHTML = '<div><span>60%</span> <strong id="musinsa-price">37,700\uC6D0</strong></div>';
    renderProductUi({
      root: document,
      productId: '3674341',
      product: productFixture(),
      onTrackStart: vi.fn(),
    });

    const mount = document.querySelector<HTMLElement>('[data-musinsa-price-tracker]');
    const shadow = mount?.shadowRoot;
    const badge = shadow?.querySelector('[data-price-badge]');
    const popover = shadow?.querySelector('[data-price-popover]');
    const button = shadow?.querySelector('[data-refresh-now]');

    badge?.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
    expect(mount?.dataset.popoverOpen).toBe('true');
    expect((popover as HTMLElement | null)?.dataset.open).toBe('true');

    badge?.dispatchEvent(new MouseEvent('mouseleave', { bubbles: true }));
    vi.advanceTimersByTime(100);
    popover?.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
    vi.advanceTimersByTime(300);

    expect(mount?.dataset.popoverOpen).toBe('true');
    expect((popover as HTMLElement | null)?.dataset.open).toBe('true');
    expect(button?.textContent).toBe('Update');
  });

  it('ignores unavailable samples in the visible sparkline path', () => {
    renderProductUi({
      root: document,
      productId: '3674341',
      product: productFixture(),
      onTrackStart: vi.fn(),
      historySamples: [sample(1, 37000), sample(2, null, 'soldOut'), sample(3, null, 'failed'), sample(4, 39000)],
    });

    expect(
      document
        .querySelector('[data-musinsa-price-tracker]')
        ?.shadowRoot?.querySelector('[data-sparkline] polyline')
        ?.getAttribute('points')
    ).toBe('0,18 100,0');
  });
});
