import { describe, expect, it, vi } from 'vitest';
import { processProductCheck } from './pipeline';
import { registerBackgroundMessageHandler } from './messages';
import { registerBackgroundScheduler } from './scheduler';
import { registerBackgroundServices } from './index';

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
});
