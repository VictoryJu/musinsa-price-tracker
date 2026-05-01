import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();

function readProjectFile(path: string): string {
  return readFileSync(join(root, path), 'utf8');
}

describe('extension architecture boundaries', () => {
  it('has content and popup entrypoints owned by render-and-intent layers', () => {
    expect(existsSync(join(root, 'src/content/index.ts'))).toBe(true);
    expect(existsSync(join(root, 'src/popup/index.ts'))).toBe(true);
  });

  it('keeps content and popup from writing directly to chrome storage', () => {
    const entrypoints = ['src/content/index.ts', 'src/popup/index.ts'];

    for (const path of entrypoints) {
      if (!existsSync(join(root, path))) continue;
      expect(readProjectFile(path)).not.toContain('chrome.storage.local.set');
    }
  });

  it('keeps runtime messages free of direct storage writes', () => {
    expect(readProjectFile('src/shared/messages.ts')).not.toContain('chrome.storage.local.set');
  });

  it('keeps storage writes inside the shared storage adapter', () => {
    expect(readProjectFile('src/shared/storage.ts')).toContain('chrome.storage.local.set');
  });
});
