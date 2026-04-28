import { describe, expect, it, vi } from 'vitest';
import { getProduct, initializeStorage, setProduct, setSettings } from '../shared/storage';
import { DEFAULT_SETTINGS, type Product } from '../shared/types';
import { maybeNotifyNewLow } from './notifications';

function productFixture(overrides: Partial<Product> = {}): Product {
  const now = Date.UTC(2026, 3, 15);
  return {
    id: '3674341',
    canonicalUrl: 'https://www.musinsa.com/products/3674341',
    name: 'Test Hoodie',
    thumbnail: '',
    addedAt: 0,
    notifyOnNewLow: true,
    currentSnapshot: {
      price: 30000,
      ts: now,
      extractorPath: 'json-ld',
      status: 'ok',
    },
    stats: {
      allTimeLow: { price: 30000, ts: now },
      avg30d: 35000,
      min30d: 30000,
      max30d: 40000,
      samplesIn30d: 20,
      lastComputedAt: now,
    },
    lastNotified: null,
    nextCheckAt: 0,
    lastCheckedAt: now,
    ...overrides,
  };
}

describe('maybeNotifyNewLow', () => {
  it('notifies when current ok snapshot is a new all-time low', async () => {
    await initializeStorage();
    const product = productFixture();
    await setProduct(product);
    const notify = vi.fn();

    await expect(maybeNotifyNewLow(product.id, { notify })).resolves.toBe(true);

    expect(notify).toHaveBeenCalledOnce();
    expect((await getProduct(product.id))?.lastNotified).toEqual({ price: 30000, ts: product.currentSnapshot.ts });
  });

  it('does not notify when product notification is disabled', async () => {
    await initializeStorage();
    const product = productFixture({ notifyOnNewLow: false });
    await setProduct(product);
    const notify = vi.fn();

    await expect(maybeNotifyNewLow(product.id, { notify })).resolves.toBe(false);

    expect(notify).not.toHaveBeenCalled();
  });

  it('does not notify when global notifications are disabled', async () => {
    await initializeStorage();
    await setSettings({ ...DEFAULT_SETTINGS, globalNotifications: false });
    const product = productFixture();
    await setProduct(product);
    const notify = vi.fn();

    await expect(maybeNotifyNewLow(product.id, { notify })).resolves.toBe(false);

    expect(notify).not.toHaveBeenCalled();
  });

  it('does not notify the same low price on a later date', async () => {
    await initializeStorage();
    const product = productFixture({ lastNotified: { price: 30000, ts: 1 } });
    await setProduct(product);
    const notify = vi.fn();

    await expect(maybeNotifyNewLow(product.id, { notify })).resolves.toBe(false);

    expect(notify).not.toHaveBeenCalled();
  });

  it('does not notify an out-of-order stale low sample', async () => {
    await initializeStorage();
    const product = productFixture({
      currentSnapshot: {
        price: 30000,
        ts: Date.UTC(2026, 3, 10),
        extractorPath: 'json-ld',
        status: 'ok',
      },
      stats: {
        allTimeLow: { price: 30000, ts: Date.UTC(2026, 3, 10) },
        avg30d: 35000,
        min30d: 30000,
        max30d: 40000,
        samplesIn30d: 20,
        lastComputedAt: Date.UTC(2026, 3, 15),
      },
      lastCheckedAt: Date.UTC(2026, 3, 15),
    });
    await setProduct(product);
    const notify = vi.fn();

    await expect(maybeNotifyNewLow(product.id, { notify })).resolves.toBe(false);

    expect(notify).not.toHaveBeenCalled();
  });
});
