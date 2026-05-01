import { describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { dirname, join } from 'node:path';

const root = process.cwd();

function readProjectFile(path: string): string {
  return readFileSync(join(root, path), 'utf8');
}

function sourceFilesUnder(path: string): string[] {
  const absolutePath = join(root, path);
  return readdirSync(absolutePath, { withFileTypes: true }).flatMap((entry) => {
    const childPath = join(path, entry.name);
    if (entry.isDirectory()) return sourceFilesUnder(childPath);
    return entry.name.endsWith('.ts') ? [childPath] : [];
  });
}

function buildProductionExtension(): void {
  execFileSync(process.execPath, [join(root, 'node_modules/vite/bin/vite.js'), 'build'], {
    cwd: root,
    stdio: 'pipe',
  });
}

function contentScriptFilesFromDist(): string[] {
  const manifest = JSON.parse(readProjectFile('dist/manifest.json')) as {
    content_scripts?: Array<{ js?: string[] }>;
  };
  const initialFiles = new Set(manifest.content_scripts?.flatMap((script) => script.js ?? []) ?? []);
  const visited = new Set<string>();
  const pending = [...initialFiles];

  while (pending.length > 0) {
    const file = pending.pop();
    if (!file || visited.has(file)) continue;
    visited.add(file);

    const contents = readProjectFile(join('dist', file));
    for (const match of contents.matchAll(/(?:getURL\("|from"\.\/)([^"]+\.js)"/g)) {
      const importPath = match[1];
      if (!importPath) continue;
      const imported = match[0].startsWith('from"')
        ? join(dirname(file), importPath).replaceAll('\\', '/')
        : importPath;
      if (!visited.has(imported)) pending.push(imported);
    }
  }

  return [...visited].sort();
}

function gzipSize(path: string): number {
  return gzipSync(readFileSync(join(root, path))).byteLength;
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

  it('keeps uPlot out of statically loaded content source', () => {
    const contentFiles = sourceFilesUnder('src/content');

    for (const path of contentFiles) {
      expect(readProjectFile(path)).not.toMatch(/from ['"]uplot['"]|import\(['"]uplot['"]\)/);
    }
  });

  it('keeps the production content script bundle under 30KB gzip', () => {
    buildProductionExtension();

    const files = contentScriptFilesFromDist();
    const totalGzipBytes = files.reduce((total, file) => total + gzipSize(join('dist', file)), 0);

    expect(files.length).toBeGreaterThan(0);
    expect(totalGzipBytes).toBeLessThan(30 * 1024);
  });
});
