import { describe, expect, it, vi } from 'vitest';
import { loadRemoteConfig } from './remote-config';

describe('loadRemoteConfig', () => {
  it('fetches and stores remote config when missing or stale', async () => {
    const fetchJson = vi.fn(async () => ({
      disabledExtractorPaths: ['internal-api'],
      salePriceSelectors: ['[data-hot-price]'],
    }));

    await expect(loadRemoteConfig({ now: 100, fetchJson, url: 'https://config.test/config.json' })).resolves.toEqual({
      disabledExtractorPaths: ['internal-api'],
      salePriceSelectors: ['[data-hot-price]'],
    });

    expect(fetchJson).toHaveBeenCalledWith('https://config.test/config.json');
    expect(await chrome.storage.local.get(['remoteConfig', 'remoteConfigFetchedAt'])).toEqual({
      remoteConfig: {
        disabledExtractorPaths: ['internal-api'],
        salePriceSelectors: ['[data-hot-price]'],
      },
      remoteConfigFetchedAt: 100,
    });
  });

  it('does not fetch again before 24 hours', async () => {
    await chrome.storage.local.set({
      remoteConfig: { disabledExtractorPaths: ['internal-api'] },
      remoteConfigFetchedAt: 100,
    });
    const fetchJson = vi.fn(async () => ({}));

    await expect(loadRemoteConfig({ now: 100 + 23 * 60 * 60 * 1000, fetchJson })).resolves.toEqual({
      disabledExtractorPaths: ['internal-api'],
    });
    expect(fetchJson).not.toHaveBeenCalled();
  });
});
