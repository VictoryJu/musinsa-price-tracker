import { describe, expect, it } from 'vitest';
import {
  createLogVisitMessage,
  createRefreshNowMessage,
  createTrackStartMessage,
  createTrackStopMessage,
  isRuntimeMessage,
} from './messages';

describe('runtime messages', () => {
  it('creates TRACK_START messages with product summary payload', () => {
    const message = createTrackStartMessage({
      productId: '3674341',
      canonicalUrl: 'https://www.musinsa.com/products/3674341',
      name: 'Test Hoodie',
      thumbnail: 'https://image.musinsa.com/hoodie.jpg',
    });

    expect(message).toEqual({
      type: 'TRACK_START',
      payload: {
        productId: '3674341',
        canonicalUrl: 'https://www.musinsa.com/products/3674341',
        name: 'Test Hoodie',
        thumbnail: 'https://image.musinsa.com/hoodie.jpg',
      },
    });
    expect(isRuntimeMessage(message)).toBe(true);
  });

  it('creates TRACK_STOP messages for one product', () => {
    expect(createTrackStopMessage('3674341')).toEqual({
      type: 'TRACK_STOP',
      payload: { productId: '3674341' },
    });
  });

  it('creates REFRESH_NOW messages for one product', () => {
    expect(createRefreshNowMessage('3674341')).toEqual({
      type: 'REFRESH_NOW',
      payload: { productId: '3674341' },
    });
  });

  it('creates LOG_VISIT messages with visit timestamp', () => {
    expect(
      createLogVisitMessage({
        productId: '3674341',
        canonicalUrl: 'https://www.musinsa.com/products/3674341',
        name: 'Test Hoodie',
        thumbnail: '',
        visitedAt: 100,
      })
    ).toEqual({
      type: 'LOG_VISIT',
      payload: {
        productId: '3674341',
        canonicalUrl: 'https://www.musinsa.com/products/3674341',
        name: 'Test Hoodie',
        thumbnail: '',
        visitedAt: 100,
      },
    });
  });

  it('rejects malformed messages', () => {
    expect(isRuntimeMessage({ type: 'TRACK_START', payload: { productId: '3674341' } })).toBe(false);
    expect(isRuntimeMessage({ type: 'UNKNOWN', payload: {} })).toBe(false);
    expect(isRuntimeMessage(null)).toBe(false);
  });
});
