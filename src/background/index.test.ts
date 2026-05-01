import { describe, expect, it, vi } from 'vitest';
import { processProductCheck } from './pipeline';
import { registerBackgroundMessageHandler } from './messages';
import { registerBackgroundScheduler } from './scheduler';
import { registerBackgroundServices, resolveFinalProductUrl } from './index';

vi.mock('./pipeline', () => ({
  processProductCheck: vi.fn(async () => undefined),
}));

vi.mock('./messages', () => ({
  registerBackgroundMessageHandler: vi.fn(),
}));

vi.mock('./scheduler', () => ({
  registerBackgroundScheduler: vi.fn(),
}));

describe('background service registration', () => {
  it('wires manual refresh messages to an immediate single-product check', async () => {
    const fetchHtml = vi.fn(async () => '<html></html>');
    registerBackgroundServices({
      fetchHtml,
      now: () => 123,
    });

    const messageOptions = vi.mocked(registerBackgroundMessageHandler).mock.calls[0]?.[0];
    await messageOptions?.checkProduct?.('3674341');

    expect(processProductCheck).toHaveBeenCalledWith('3674341', {
      now: 123,
      fetchHtml,
    });
    expect(registerBackgroundScheduler).toHaveBeenCalledWith({ fetchHtml });
  });

  it('resolves a final URL by following one fetch redirect', async () => {
    const fetchMock = vi.fn(async () => ({ url: 'https://www.musinsa.com/products/3674341?utm_source=ad', ok: true }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(resolveFinalProductUrl('https://musinsa.test/alias/3674341')).resolves.toBe(
      'https://www.musinsa.com/products/3674341?utm_source=ad'
    );
    expect(fetchMock).toHaveBeenCalledWith('https://musinsa.test/alias/3674341', {
      method: 'HEAD',
      redirect: 'follow',
      credentials: 'include',
    });
  });
});
