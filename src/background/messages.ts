import { deleteProduct, setProduct } from '../shared/storage';
import { isRuntimeMessage, type RuntimeMessageResponse } from '../shared/messages';
import type { Product } from '../shared/types';

export interface BackgroundMessageHandlerOptions {
  now?: () => number;
  checkProduct?: (productId: string) => Promise<void>;
}

export async function handleRuntimeMessage(
  message: unknown,
  options: BackgroundMessageHandlerOptions = {}
): Promise<RuntimeMessageResponse> {
  if (!isRuntimeMessage(message)) {
    return { ok: false, error: 'Invalid message' };
  }

  switch (message.type) {
    case 'TRACK_START':
    case 'LOG_VISIT':
      await setProduct(createInitialProduct(message.payload, options.now?.() ?? Date.now()));
      return { ok: true };
    case 'TRACK_STOP':
      await deleteProduct(message.payload.productId);
      return { ok: true };
    case 'REFRESH_NOW':
      if (!options.checkProduct) return { ok: false, error: 'Refresh checker unavailable' };
      await options.checkProduct(message.payload.productId);
      return { ok: true };
  }
}

export function registerBackgroundMessageHandler(options: BackgroundMessageHandlerOptions = {}): void {
  chrome.runtime.onMessage.addListener((message: unknown, _sender, sendResponse) => {
    void handleRuntimeMessage(message, options).then(sendResponse);
    return true;
  });
}

function createInitialProduct(
  payload: { productId: string; canonicalUrl: string; name: string; thumbnail: string },
  now: number
): Product {
  return {
    id: payload.productId,
    canonicalUrl: payload.canonicalUrl,
    name: payload.name,
    thumbnail: payload.thumbnail,
    addedAt: now,
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
  };
}
