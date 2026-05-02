import { afterEach, beforeEach, describe, expect, it, type Mock, vi } from 'vitest';
import type { Product } from '../shared/types';
import { bootstrapContentPage } from './index';

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

function setLocation(pathname: string): Location {
  return {
    origin: 'https://www.musinsa.com',
    pathname,
  } as Location;
}

describe('bootstrapContentPage', () => {
  beforeEach(() => {
    document.body.innerHTML = '<h1>Test Hoodie</h1><meta property="og:image" content="https://image.test/hoodie.jpg">';
    document.title = 'Test Hoodie';
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('reads product storage and renders CTA for untracked product pages', async () => {
    await bootstrapContentPage(document, setLocation('/products/3674341'));

    expect(chrome.storage.local.get).toHaveBeenCalledWith(null);
    expect(document.querySelector('button')?.textContent).toBe('+');
    expect(document.querySelector('button')?.getAttribute('aria-label')).toBe('Track this product');
    expect(chrome.runtime.sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'LOG_VISIT',
        payload: expect.objectContaining({ productId: '3674341' }),
      })
    );
  });

  it('reads product ids from current Musinsa goods page paths', async () => {
    await bootstrapContentPage(document, setLocation('/app/goods/3674341'));

    expect(document.querySelector('[data-musinsa-price-tracker]')).not.toBeNull();
    expect(chrome.runtime.sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'LOG_VISIT',
        payload: expect.objectContaining({ productId: '3674341' }),
      })
    );
  });

  it('reads product ids from short goods page paths', async () => {
    await bootstrapContentPage(document, setLocation('/goods/3674341'));

    expect(document.querySelector('[data-musinsa-price-tracker]')).not.toBeNull();
    expect(chrome.runtime.sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'LOG_VISIT',
        payload: expect.objectContaining({ productId: '3674341' }),
      })
    );
  });

  it('sends TRACK_START when the untracked CTA is clicked', async () => {
    await bootstrapContentPage(document, setLocation('/products/3674341'));

    document.querySelector('button')?.click();

    expect(chrome.runtime.sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'TRACK_START',
        payload: expect.objectContaining({ productId: '3674341' }),
      })
    );
  });

  it('renders tracked label when product already exists in storage', async () => {
    (chrome.storage.local.get as unknown as Mock).mockResolvedValueOnce({ products: { '3674341': productFixture() } });

    await bootstrapContentPage(document, setLocation('/products/3674341'));

    expect(document.querySelector('[data-musinsa-price-tracker]')?.shadowRoot?.textContent).toContain('37,700원');
  });

  it('uses stored settings to render soak progress on tracked pages', async () => {
    vi.setSystemTime(new Date(Date.UTC(2026, 4, 10)));
    (chrome.storage.local.get as unknown as Mock).mockResolvedValueOnce({
      settings: { soakPeriodDays: 7 },
      products: {
        '3674341': productFixture({
          addedAt: Date.UTC(2026, 4, 6),
          lastCheckedAt: Date.UTC(2026, 4, 10),
        }),
      },
    });

    await bootstrapContentPage(document, setLocation('/products/3674341'));

    expect(
      document.querySelector('[data-musinsa-price-tracker]')?.shadowRoot?.querySelector('[data-snapshot-label]')
        ?.textContent
    ).toBe('Tracking day 5 / D-2');
  });

  it('preloads product history once and renders the visible chart from cache', async () => {
    (chrome.storage.local.get as unknown as Mock).mockResolvedValueOnce({
      products: { '3674341': productFixture() },
      '3674341:2026-04': [
        { ts: 1, price: 37700, status: 'ok' },
        { ts: 2, price: 38000, status: 'ok' },
      ],
      '999:2026-04': [{ ts: 1, price: 1, status: 'ok' }],
    });

    await bootstrapContentPage(document, setLocation('/products/3674341'));

    const mount = document.querySelector('[data-musinsa-price-tracker]');
    expect(chrome.storage.local.get).toHaveBeenCalledTimes(1);
    expect(mount?.shadowRoot?.querySelector('[data-sparkline] polyline')?.getAttribute('points')).toBe('0,18 100,0');
    expect(mount?.shadowRoot?.querySelector('[data-stat="samples"]')?.textContent).toContain('20');
  });

  it('sends REFRESH_NOW from the visible price card', async () => {
    (chrome.storage.local.get as unknown as Mock).mockResolvedValueOnce({
      products: { '3674341': productFixture() },
      '3674341:2026-04': [
        { ts: 1, price: 37700, status: 'ok' },
        { ts: 2, price: 38000, status: 'ok' },
      ],
    });

    await bootstrapContentPage(document, setLocation('/products/3674341'));

    const mount = document.querySelector('[data-musinsa-price-tracker]');
    mount?.shadowRoot?.querySelector<HTMLButtonElement>('[data-refresh-now]')?.click();
    await Promise.resolve();

    expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({
      type: 'REFRESH_NOW',
      payload: { productId: '3674341' },
    });
  });

  it('does nothing on non-product pages', async () => {
    await bootstrapContentPage(document, setLocation('/ranking'));

    expect(chrome.storage.local.get).not.toHaveBeenCalled();
    expect(chrome.runtime.sendMessage).not.toHaveBeenCalled();
    expect(document.querySelector('[data-musinsa-price-tracker]')).toBeNull();
  });
});
