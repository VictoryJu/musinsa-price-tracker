import { CURRENT_SCHEMA_VERSION } from '../types';
import { META as v0_to_v1_meta, v0_to_v1 } from './v0-to-v1';

interface MigrationStep {
  name: string;
  from: number;
  to: number;
  run: () => Promise<void>;
}

const REGISTRY: MigrationStep[] = [{ ...v0_to_v1_meta, run: v0_to_v1 }];

export interface MigrationResult {
  fromVersion: number;
  toVersion: number;
  applied: string[];
}

export type FallbackResult =
  | { status: 'success'; fromVersion: number; toVersion: number; applied: string[] }
  | { status: 'failure'; error: Error; preservedSchemaVersion: number };

export async function getStoredSchemaVersion(): Promise<number> {
  const result = await chrome.storage.local.get('schemaVersion');
  return typeof result.schemaVersion === 'number' ? result.schemaVersion : 0;
}

export async function runMigrations(): Promise<MigrationResult> {
  const startVersion = await getStoredSchemaVersion();
  const applied: string[] = [];
  let current = startVersion;

  while (current < CURRENT_SCHEMA_VERSION) {
    const next = REGISTRY.find((migration) => migration.from === current);
    if (!next) {
      throw new Error(`Migration registry incomplete: no step from v${current}.`);
    }

    await next.run();
    applied.push(next.name);
    current = next.to;
  }

  if (current > CURRENT_SCHEMA_VERSION) {
    throw new Error(`Stored schema v${current} is newer than supported v${CURRENT_SCHEMA_VERSION}.`);
  }

  return { fromVersion: startVersion, toVersion: current, applied };
}

export async function runMigrationsWithFallback(): Promise<FallbackResult> {
  let preservedVersion = 0;
  try {
    preservedVersion = await getStoredSchemaVersion();
    const result = await runMigrations();
    return { status: 'success', ...result };
  } catch (err) {
    return {
      status: 'failure',
      error: err instanceof Error ? err : new Error(String(err)),
      preservedSchemaVersion: preservedVersion,
    };
  }
}
