import { beforeEach, describe, expect, it, type Mock, vi } from 'vitest';
import type { Product } from '../shared/types';
import { renderPopup } from './index';

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

describe('renderPopup', () => {
  beforeEach(() => {
    document.body.innerHTML = '<main><p id="tracked-count"></p><section id="product-list"></section></main>';
  });

  it('renders one popup card with a refresh button per tracked product', async () => {
    await chrome.storage.local.set({
      products: {
        '3674341': productFixture(),
      },
    });

    await renderPopup(document);

    expect(document.querySelector('#tracked-count')?.textContent).toBe('1 tracked product');
    expect(document.querySelector('[data-product-card="3674341"]')?.textContent).toContain('Test Hoodie');
    expect(document.querySelector<HTMLButtonElement>('[data-refresh-now="3674341"]')?.textContent).toBe('지금 체크');
  });

  it('sends REFRESH_NOW and shows a spinner while refresh is pending', async () => {
    let resolveRefresh!: (value: unknown) => void;
    (chrome.runtime.sendMessage as unknown as Mock).mockReturnValueOnce(
      new Promise((resolve) => {
        resolveRefresh = resolve;
      })
    );
    await chrome.storage.local.set({
      products: {
        '3674341': productFixture(),
      },
    });

    await renderPopup(document);
    document.querySelector<HTMLButtonElement>('[data-refresh-now="3674341"]')?.click();
    await Promise.resolve();

    const button = document.querySelector<HTMLButtonElement>('[data-refresh-now="3674341"]');
    expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({
      type: 'REFRESH_NOW',
      payload: { productId: '3674341' },
    });
    expect(button?.disabled).toBe(true);
    expect(button?.getAttribute('aria-busy')).toBe('true');
    expect(button?.textContent).toBe('체크 중...');

    resolveRefresh({ ok: true });
    await Promise.resolve();
    await Promise.resolve();

    expect(button?.disabled).toBe(false);
    expect(button?.getAttribute('aria-busy')).toBe('false');
    expect(button?.textContent).toBe('지금 체크');
  });
});
