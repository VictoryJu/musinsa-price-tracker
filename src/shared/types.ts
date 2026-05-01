// Core domain types for Phase 1A storage foundation.
// Schema changes must add a migration under src/shared/migrations.

export const CURRENT_SCHEMA_VERSION = 1;

export type SampleStatus = 'ok' | 'soldOut' | 'failed';

export type ExtractorPath = 'json-ld' | 'css-selector' | 'internal-api' | 'unknown';

export interface HistorySample {
  ts: number;
  price: number | null;
  status: SampleStatus;
}

export interface CurrentSnapshot {
  price: number | null;
  ts: number;
  extractorPath: ExtractorPath;
  status: SampleStatus;
  errorMessage?: string;
  variantNotice?: string;
}

export interface Stats {
  allTimeLow: { price: number; ts: number } | null;
  avg30d: number | null;
  min30d: number | null;
  max30d: number | null;
  samplesIn30d: number;
  lastComputedAt: number;
}

export interface NotificationToken {
  price: number;
  ts: number;
}

export interface Product {
  id: string;
  canonicalUrl: string;
  name: string;
  thumbnail: string;
  addedAt: number;
  notifyOnNewLow: boolean;
  currentSnapshot: CurrentSnapshot;
  stats: Stats;
  lastNotified: NotificationToken | null;
  nextCheckAt: number;
  lastCheckedAt: number;
}

export interface BuyabilityThresholds {
  great: number;
  good: number;
  fair: number;
  wait: number;
}

export interface Settings {
  schemaVersion: number;
  fetchIntervalHours: number;
  globalNotifications: boolean;
  retentionDays: number;
  soakPeriodDays: number;
  minSamplesForAnalysis: number;
  hoverDelayMs: number;
  buyabilityThresholds: BuyabilityThresholds;
}

export const DEFAULT_SETTINGS: Settings = {
  schemaVersion: CURRENT_SCHEMA_VERSION,
  fetchIntervalHours: 12,
  globalNotifications: true,
  retentionDays: 365,
  soakPeriodDays: 14,
  minSamplesForAnalysis: 20,
  hoverDelayMs: 300,
  buyabilityThresholds: {
    great: 10,
    good: 25,
    fair: 75,
    wait: 90,
  },
};

export type StorageKey = 'schemaVersion' | 'products' | 'history' | 'settings';

export type ProductsMap = Record<string, Product>;

export type HistoryChunkKey = `${string}:${string}`;
export type HistoryMap = Record<HistoryChunkKey, HistorySample[]>;
