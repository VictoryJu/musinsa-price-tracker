import { afterEach, beforeEach, describe, expect, it, type Mock, vi } from 'vitest';
import type { Product } from '../shared/types';
import { exportStorageSnapshot, importStorageSnapshot, renderPopup, resetStorage } from './index';

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
    document.body.innerHTML =
      '<main><p id="tracked-count"></p><section id="product-list"></section><section id="settings"></section></main>';
  });

  afterEach(() => {
    vi.useRealTimers();
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
    expect(document.querySelector<HTMLButtonElement>('[data-refresh-now="3674341"]')?.textContent).toBe('Check now');
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
    expect(button?.textContent).toBe('Checking...');

    resolveRefresh({ ok: true });
    await Promise.resolve();
    await Promise.resolve();

    expect(button?.disabled).toBe(false);
    expect(button?.getAttribute('aria-busy')).toBe('false');
    expect(button?.textContent).toBe('Check now');
  });

  it('renders settings actions for export import and reset', async () => {
    await renderPopup(document);

    expect(document.querySelector('[data-export-data]')?.textContent).toBe('Export JSON');
    expect(document.querySelector('[data-import-data]')?.textContent).toBe('Import JSON');
    expect(document.querySelector('[data-reset-data]')?.textContent).toBe('Reset data');
  });

  it('round-trips export reset import while preserving products and history', async () => {
    await chrome.storage.local.set({
      products: { '3674341': productFixture() },
      '3674341:2026-04': [{ ts: 1, price: 37700, status: 'ok' }],
    });

    const backup = await exportStorageSnapshot();
    await resetStorage(() => true);
    expect(await chrome.storage.local.get(null)).toEqual({});

    await importStorageSnapshot(backup, () => true);

    expect(await chrome.storage.local.get(null)).toEqual({
      products: { '3674341': productFixture() },
      '3674341:2026-04': [{ ts: 1, price: 37700, status: 'ok' }],
    });
  });

  it('rejects invalid import payloads before replacing storage', async () => {
    await chrome.storage.local.set({ products: { '3674341': productFixture() } });

    await expect(importStorageSnapshot('{"products":[]}', () => true)).rejects.toThrow('Invalid backup schema');

    expect(await chrome.storage.local.get('products')).toEqual({ products: { '3674341': productFixture() } });
  });

  it('reveals debug metadata and copies an issue report', async () => {
    const now = Date.UTC(2026, 4, 1);
    vi.setSystemTime(now);
    const writeText = vi.fn(async () => undefined);
    Object.assign(navigator, { clipboard: { writeText } });
    await chrome.storage.local.set({
      products: {
        '3674341': productFixture({
          currentSnapshot: {
            price: null,
            ts: now,
            extractorPath: 'unknown',
            status: 'failed',
            errorClass: 'blocked',
            errorMessage: 'fetch blocked',
          },
          lastCheckedAt: now - 2 * 24 * 60 * 60 * 1000,
          stats: {
            allTimeLow: null,
            avg30d: null,
            min30d: null,
            max30d: null,
            samplesIn30d: 0,
            lastComputedAt: 1,
          },
        }),
      },
    });

    await renderPopup(document);
    document.querySelector<HTMLButtonElement>('[data-debug-toggle]')?.click();

    const debug = document.querySelector('[data-debug-panel]');
    expect(debug?.textContent).toContain('total products: 1');
    expect(debug?.textContent).toContain('failed products: 1');
    expect(debug?.textContent).toContain('blocked fetches 7d: 1');
    expect(debug?.textContent).toContain('extractorPath: unknown');
    expect(debug?.textContent).toContain('lastError: blocked fetch blocked');
    expect(debug?.textContent).toContain(`lastCheckedAt: ${now - 2 * 24 * 60 * 60 * 1000}`);
    expect(debug?.textContent).toContain('samplesIn30d: 0');

    document.querySelector<HTMLButtonElement>('[data-copy-debug]')?.click();
    await Promise.resolve();

    expect(writeText).toHaveBeenCalledWith(expect.stringContaining('"blockedFetches7d":1'));
    vi.useRealTimers();
  });
});
