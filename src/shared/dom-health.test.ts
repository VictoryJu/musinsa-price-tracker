import { describe, expect, it, vi } from 'vitest';
import { recordDomHealth } from './dom-health';

describe('recordDomHealth', () => {
  it('tracks extraction success and failure counters per extractorPath', () => {
    const health = recordDomHealth({}, 'css-selector', true, { minSamples: 3, failRateThreshold: 0.5 });
    const next = recordDomHealth(health, 'css-selector', false, { minSamples: 3, failRateThreshold: 0.5 });

    expect(next['css-selector']).toEqual({ success: 1, fail: 1 });
  });

  it('logs a warning when fail rate exceeds the threshold after enough samples', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    let health = {};

    health = recordDomHealth(health, 'json-ld', false, { minSamples: 3, failRateThreshold: 0.5 });
    health = recordDomHealth(health, 'json-ld', false, { minSamples: 3, failRateThreshold: 0.5 });
    health = recordDomHealth(health, 'json-ld', true, { minSamples: 3, failRateThreshold: 0.5 });

    expect(warn).toHaveBeenCalledWith('Extractor json-ld fail rate 0.67 exceeds threshold 0.5');
    warn.mockRestore();
  });
});
