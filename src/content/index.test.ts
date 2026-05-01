import { beforeEach, describe, expect, it, type Mock, vi } from 'vitest';
import type { Product } from '../shared/types';
import { bootstrapContentPage } from './index';

function productFixture(): Product {
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

  it('reads product storage and renders CTA for untracked product pages', async () => {
    await bootstrapContentPage(document, setLocation('/products/3674341'));

    expect(chrome.storage.local.get).toHaveBeenCalledWith(null);
    expect(document.querySelector('button')?.textContent).toBe('추적 시작');
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

  it('preloads product history once and renders hover tooltip from cache', async () => {
    vi.useFakeTimers();
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
    mount?.dispatchEvent(new MouseEvent('mouseenter'));
    vi.advanceTimersByTime(300);

    expect(chrome.storage.local.get).toHaveBeenCalledTimes(1);
    expect(mount?.shadowRoot?.querySelector('[data-tooltip]')?.textContent).toContain('2 samples');
    vi.useRealTimers();
  });

  it('does nothing on non-product pages', async () => {
    await bootstrapContentPage(document, setLocation('/ranking'));

    expect(chrome.storage.local.get).not.toHaveBeenCalled();
    expect(chrome.runtime.sendMessage).not.toHaveBeenCalled();
    expect(document.querySelector('[data-musinsa-price-tracker]')).toBeNull();
  });
});
