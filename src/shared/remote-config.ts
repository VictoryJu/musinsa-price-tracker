import type { ExtractorPath } from './types';
import type { RemoteExtractionConfig } from './extraction';

const DEFAULT_REMOTE_CONFIG_URL =
  'https://raw.githubusercontent.com/VictoryJu/musinsa-price-tracker/main/config/remote-config.json';
const DAY_MS = 24 * 60 * 60 * 1000;

export interface LoadRemoteConfigOptions {
  now: number;
  url?: string;
  fetchJson: (url: string) => Promise<unknown>;
}

export async function loadRemoteConfig(options: LoadRemoteConfigOptions): Promise<RemoteExtractionConfig> {
  const current = await chrome.storage.local.get(['remoteConfig', 'remoteConfigFetchedAt']);
  if (
    isRemoteExtractionConfig(current.remoteConfig) &&
    typeof current.remoteConfigFetchedAt === 'number' &&
    options.now - current.remoteConfigFetchedAt < DAY_MS
  ) {
    return current.remoteConfig;
  }

  const remoteConfig = normalizeRemoteConfig(await options.fetchJson(options.url ?? DEFAULT_REMOTE_CONFIG_URL));
  await chrome.storage.local.set({
    remoteConfig,
    remoteConfigFetchedAt: options.now,
  });
  return remoteConfig;
}

function normalizeRemoteConfig(value: unknown): RemoteExtractionConfig {
  if (!isRecord(value)) return {};
  const disabledExtractorPaths = Array.isArray(value.disabledExtractorPaths)
    ? value.disabledExtractorPaths.filter(isExtractorPath)
    : undefined;
  const salePriceSelectors = Array.isArray(value.salePriceSelectors)
    ? value.salePriceSelectors.filter((selector): selector is string => typeof selector === 'string')
    : undefined;
  const genericPriceSelectors = Array.isArray(value.genericPriceSelectors)
    ? value.genericPriceSelectors.filter((selector): selector is string => typeof selector === 'string')
    : undefined;

  return {
    ...(disabledExtractorPaths ? { disabledExtractorPaths } : {}),
    ...(salePriceSelectors ? { salePriceSelectors } : {}),
    ...(genericPriceSelectors ? { genericPriceSelectors } : {}),
  };
}

function isRemoteExtractionConfig(value: unknown): value is RemoteExtractionConfig {
  return isRecord(value);
}

function isExtractorPath(value: unknown): value is ExtractorPath {
  return (
    value === 'json-ld' ||
    value === 'css-selector' ||
    value === 'internal-api' ||
    value === 'unknown'
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
