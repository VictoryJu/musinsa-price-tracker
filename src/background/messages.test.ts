import { describe, expect, it, vi } from 'vitest';
import { getProduct, initializeStorage, setProduct } from '../shared/storage';
import type { Product } from '../shared/types';
import { createRefreshNowMessage, createTrackStartMessage, createTrackStopMessage } from '../shared/messages';
import { handleRuntimeMessage, registerBackgroundMessageHandler } from './messages';

function productFixture(overrides: Partial<Product> = {}): Product {
  return {
    id: '3674341',
    canonicalUrl: 'https://www.musinsa.com/products/3674341',
    name: 'Test Hoodie',
    thumbnail: '',
    addedAt: 0,
    notifyOnNewLow: true,
    currentSnapshot: {
      price: null,
      ts: 0,
      extractorPath: 'unknown',
      status: 'failed',
    },
    stats: {
      allTimeLow: null,
      avg30d: null,
      min30d: null,
      max30d: null,
      samplesIn30d: 0,
      lastComputedAt: 0,
    },
    lastNotified: null,
    nextCheckAt: 0,
    lastCheckedAt: 0,
    ...overrides,
  };
}

describe('background runtime messages', () => {
  it('handles TRACK_START by creating a tracked product through storage', async () => {
    await initializeStorage();

    await expect(
      handleRuntimeMessage(
        createTrackStartMessage({
          productId: '3674341',
          canonicalUrl: 'https://www.musinsa.com/products/3674341',
          name: 'Test Hoodie',
          thumbnail: 'https://image.musinsa.com/hoodie.jpg',
        }),
        { now: () => 100 }
      )
    ).resolves.toEqual({ ok: true });

    expect(await getProduct('3674341')).toMatchObject({
      id: '3674341',
      canonicalUrl: 'https://www.musinsa.com/products/3674341',
      name: 'Test Hoodie',
      thumbnail: 'https://image.musinsa.com/hoodie.jpg',
      addedAt: 100,
      notifyOnNewLow: true,
      currentSnapshot: {
        price: null,
        ts: 0,
        extractorPath: 'unknown',
        status: 'failed',
      },
    });
  });

  it('handles TRACK_STOP by deleting the product through storage', async () => {
    await initializeStorage();
    await setProduct(productFixture());

    await expect(handleRuntimeMessage(createTrackStopMessage('3674341'))).resolves.toEqual({ ok: true });

    expect(await getProduct('3674341')).toBeNull();
  });

  it('handles REFRESH_NOW by calling the injected background checker', async () => {
    const checkProduct = vi.fn(async () => undefined);

    await expect(
      handleRuntimeMessage(createRefreshNowMessage('3674341'), {
        checkProduct,
      })
    ).resolves.toEqual({ ok: true });

    expect(checkProduct).toHaveBeenCalledWith('3674341');
  });

  it('rejects invalid messages', async () => {
    await expect(handleRuntimeMessage({ type: 'NOPE', payload: {} })).resolves.toEqual({
      ok: false,
      error: 'Invalid message',
    });
  });

  it('registers a Chrome runtime onMessage listener', () => {
    registerBackgroundMessageHandler({ checkProduct: async () => undefined });

    expect(chrome.runtime.onMessage.addListener).toHaveBeenCalledOnce();
  });
});
