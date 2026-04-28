import type { Product } from '../shared/types';
import { getAllProducts } from '../shared/storage';
import { processProductCheck } from './pipeline';

const HOUR_MS = 60 * 60 * 1000;
const ALARM_NAME = 'musinsa-price-tracker.tick';
let runInProgress = false;

export interface RunDueProductBatchOptions {
  now?: number;
  fetchHtml: (url: string) => Promise<string>;
  jitterMs?: number;
}

export interface RegisterBackgroundSchedulerOptions {
  fetchHtml: (url: string) => Promise<string>;
}

export function computeNextCheckAt(now: number, fetchIntervalHours: number, jitterMs: number): number {
  return now + fetchIntervalHours * HOUR_MS + jitterMs;
}

export function pickDueProduct(products: Product[], now: number): Product | null {
  const due = products
    .filter((product) => product.nextCheckAt <= now)
    .sort((a, b) => a.nextCheckAt - b.nextCheckAt);

  return due[0] ?? null;
}

export async function runDueProductBatch(
  options: RunDueProductBatchOptions
): Promise<{ processedProductId: string | null }> {
  if (runInProgress) return { processedProductId: null };

  runInProgress = true;
  try {
    const now = options.now ?? Date.now();
    const due = pickDueProduct(await getAllProducts(), now);
    if (!due) return { processedProductId: null };

    await processProductCheck(due.id, {
      now,
      fetchHtml: options.fetchHtml,
      jitterMs: options.jitterMs,
    });

    return { processedProductId: due.id };
  } finally {
    runInProgress = false;
  }
}

export function registerBackgroundScheduler(options: RegisterBackgroundSchedulerOptions): void {
  chrome.alarms.create(ALARM_NAME, { periodInMinutes: 1 });

  const run = (): void => {
    void runDueProductBatch({ fetchHtml: options.fetchHtml });
  };

  chrome.runtime.onInstalled.addListener(run);
  chrome.runtime.onStartup.addListener(run);
  chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === ALARM_NAME) run();
  });
}
