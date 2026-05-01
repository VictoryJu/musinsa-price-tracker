import type { ExtractorPath } from './types';

export type DomHealthMap = Partial<Record<ExtractorPath, { success: number; fail: number }>>;

export interface DomHealthThresholds {
  minSamples: number;
  failRateThreshold: number;
}

export function recordDomHealth(
  current: DomHealthMap,
  extractorPath: ExtractorPath,
  success: boolean,
  thresholds: DomHealthThresholds
): DomHealthMap {
  const previous = current[extractorPath] ?? { success: 0, fail: 0 };
  const nextEntry = {
    success: previous.success + (success ? 1 : 0),
    fail: previous.fail + (success ? 0 : 1),
  };
  const next = { ...current, [extractorPath]: nextEntry };
  const samples = nextEntry.success + nextEntry.fail;
  const failRate = samples === 0 ? 0 : nextEntry.fail / samples;

  if (samples >= thresholds.minSamples && failRate > thresholds.failRateThreshold) {
    console.warn(
      `Extractor ${extractorPath} fail rate ${failRate.toFixed(2)} exceeds threshold ${thresholds.failRateThreshold}`
    );
  }

  return next;
}
