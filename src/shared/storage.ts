import { computeStats } from './buyability';
import {
  CURRENT_SCHEMA_VERSION,
  DEFAULT_SETTINGS,
  type HistoryChunkKey,
  type HistorySample,
  type Product,
  type ProductsMap,
  type Settings,
  type Stats,
} from './types';

export function getYearMonth(ts: number): string {
  const date = new Date(ts);
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
}

function historyChunkKey(productId: string, ts: number): HistoryChunkKey {
  return `${productId}:${getYearMonth(ts)}`;
}

async function getProductsMap(): Promise<ProductsMap> {
  const result = await chrome.storage.local.get('products');
  return isRecord(result.products) ? (result.products as ProductsMap) : {};
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function defaultSettings(): Settings {
  return {
    ...DEFAULT_SETTINGS,
    buyabilityThresholds: { ...DEFAULT_SETTINGS.buyabilityThresholds },
  };
}

function normalizeSettings(value: unknown): Settings {
  if (!isRecord(value)) return defaultSettings();

  const thresholds = isRecord(value.buyabilityThresholds)
    ? { ...DEFAULT_SETTINGS.buyabilityThresholds, ...value.buyabilityThresholds }
    : { ...DEFAULT_SETTINGS.buyabilityThresholds };

  return {
    ...DEFAULT_SETTINGS,
    ...value,
    schemaVersion: CURRENT_SCHEMA_VERSION,
    buyabilityThresholds: thresholds,
  } as Settings;
}

export async function initializeStorage(): Promise<void> {
  const current = await chrome.storage.local.get(['schemaVersion', 'products', 'settings']);
  const patch: Record<string, unknown> = {};

  if (typeof current.schemaVersion !== 'number') {
    patch.schemaVersion = CURRENT_SCHEMA_VERSION;
  }

  if (!isRecord(current.products)) {
    patch.products = {};
  }

  if (!isRecord(current.settings)) {
    patch.settings = defaultSettings();
  } else {
    patch.settings = normalizeSettings(current.settings);
  }

  if (Object.keys(patch).length > 0) {
    await chrome.storage.local.set(patch);
  }
}

export async function getSettings(): Promise<Settings> {
  const result = await chrome.storage.local.get('settings');
  return normalizeSettings(result.settings);
}

export async function setSettings(settings: Settings): Promise<void> {
  await chrome.storage.local.set({
    settings: normalizeSettings(settings),
  });
}

export async function getAllProducts(): Promise<Product[]> {
  return Object.values(await getProductsMap());
}

export async function getProduct(productId: string): Promise<Product | null> {
  const products = await getProductsMap();
  return products[productId] ?? null;
}

export async function setProduct(product: Product): Promise<void> {
  const products = await getProductsMap();
  await chrome.storage.local.set({
    products: { ...products, [product.id]: product },
  });
}

export async function deleteProduct(productId: string): Promise<void> {
  const products = await getProductsMap();
  const { [productId]: _deleted, ...remaining } = products;
  await chrome.storage.local.set({ products: remaining });

  const historyKeys = await listHistoryChunkKeys(productId);
  if (historyKeys.length > 0) {
    await chrome.storage.local.remove(historyKeys);
  }
}

export async function getHistoryChunk(productId: string, yearMonth: string): Promise<HistorySample[]> {
  const key: HistoryChunkKey = `${productId}:${yearMonth}`;
  const result = await chrome.storage.local.get(key);
  return Array.isArray(result[key]) ? ([...(result[key] as HistorySample[])] as HistorySample[]) : [];
}

export async function appendHistorySample(productId: string, sample: HistorySample): Promise<void> {
  const key = historyChunkKey(productId, sample.ts);
  const chunk = await getHistoryChunk(productId, getYearMonth(sample.ts));
  const nextChunk = [...chunk, sample].sort((a, b) => a.ts - b.ts);
  await chrome.storage.local.set({ [key]: nextChunk });
}

export async function listHistoryChunkKeys(productId: string): Promise<HistoryChunkKey[]> {
  const all = await chrome.storage.local.get(null);
  const prefix = `${productId}:`;
  return Object.keys(all)
    .filter((key): key is HistoryChunkKey => key.startsWith(prefix) && /^\d{4}-\d{2}$/.test(key.slice(prefix.length)))
    .sort();
}

export async function getProductHistory(productId: string): Promise<HistorySample[]> {
  const keys = await listHistoryChunkKeys(productId);
  if (keys.length === 0) return [];

  const all = await chrome.storage.local.get(keys);
  const merged: HistorySample[] = [];
  for (const key of keys) {
    const chunk = all[key];
    if (Array.isArray(chunk)) merged.push(...(chunk as HistorySample[]));
  }

  return merged.sort((a, b) => a.ts - b.ts);
}

export async function recomputeAndStoreStats(productId: string, now: number): Promise<Stats> {
  const product = await getProduct(productId);
  if (!product) {
    throw new Error(`recomputeAndStoreStats: product ${productId} not found`);
  }

  const history = await getProductHistory(productId);
  const stats = computeStats(history, now);
  await setProduct({ ...product, stats });
  return stats;
}

export async function pruneHistory(productId: string, retentionDays: number, now: number): Promise<number> {
  const cutoff = now - retentionDays * 24 * 60 * 60 * 1000;
  const keys = await listHistoryChunkKeys(productId);
  let removed = 0;

  for (const key of keys) {
    const result = await chrome.storage.local.get(key);
    const chunk = Array.isArray(result[key]) ? (result[key] as HistorySample[]) : [];
    const kept = chunk.filter((sample) => sample.ts >= cutoff);
    removed += chunk.length - kept.length;

    if (kept.length === 0) {
      await chrome.storage.local.remove(key);
    } else if (kept.length !== chunk.length) {
      await chrome.storage.local.set({ [key]: kept });
    }
  }

  return removed;
}
