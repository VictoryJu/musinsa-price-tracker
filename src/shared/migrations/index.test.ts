import { describe, expect, it } from 'vitest';
import { CURRENT_SCHEMA_VERSION } from '../types';
import { getStoredSchemaVersion, runMigrations, runMigrationsWithFallback } from './index';

describe('getStoredSchemaVersion', () => {
  it('returns 0 for empty storage', async () => {
    expect(await getStoredSchemaVersion()).toBe(0);
  });

  it('returns the stored schema version', async () => {
    await chrome.storage.local.set({ schemaVersion: 3 });
    expect(await getStoredSchemaVersion()).toBe(3);
  });
});

describe('runMigrations', () => {
  it('migrates greenfield storage from v0 to current', async () => {
    const result = await runMigrations();

    expect(result.fromVersion).toBe(0);
    expect(result.toVersion).toBe(CURRENT_SCHEMA_VERSION);
    expect(result.applied).toContain('v0-to-v1');
    expect(await getStoredSchemaVersion()).toBe(CURRENT_SCHEMA_VERSION);
  });

  it('is a no-op when storage is already current', async () => {
    await chrome.storage.local.set({ schemaVersion: CURRENT_SCHEMA_VERSION });

    expect(await runMigrations()).toEqual({
      fromVersion: CURRENT_SCHEMA_VERSION,
      toVersion: CURRENT_SCHEMA_VERSION,
      applied: [],
    });
  });
});

describe('runMigrationsWithFallback', () => {
  it('returns success for a normal migration', async () => {
    const result = await runMigrationsWithFallback();

    expect(result.status).toBe('success');
    if (result.status === 'success') {
      expect(result.applied).toContain('v0-to-v1');
    }
  });

  it('preserves data and schema version when migration fails', async () => {
    await chrome.storage.local.set({
      schemaVersion: 999,
      products: { '999': { id: '999' } },
    });

    const result = await runMigrationsWithFallback();

    expect(result.status).toBe('failure');
    if (result.status === 'failure') {
      expect(result.error).toBeInstanceOf(Error);
      expect(result.preservedSchemaVersion).toBe(999);
    }

    const after = await chrome.storage.local.get(['products', 'schemaVersion']);
    expect(after.products).toEqual({ '999': { id: '999' } });
    expect(after.schemaVersion).toBe(999);
  });
});
