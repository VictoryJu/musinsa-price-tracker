import { CURRENT_SCHEMA_VERSION, DEFAULT_SETTINGS } from '../types';

export async function v0_to_v1(): Promise<void> {
  const existing = await chrome.storage.local.get(['settings', 'products']);
  const patch: Record<string, unknown> = {
    schemaVersion: 1,
  };

  if (existing.settings === undefined) {
    patch.settings = { ...DEFAULT_SETTINGS };
  }

  if (existing.products === undefined) {
    patch.products = {};
  }

  await chrome.storage.local.set(patch);
}

export const META = { name: 'v0-to-v1', from: 0, to: 1 } as const;

if (CURRENT_SCHEMA_VERSION < 1) {
  throw new Error('v0-to-v1 migration requires CURRENT_SCHEMA_VERSION >= 1');
}
