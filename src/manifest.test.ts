import { describe, expect, it } from 'vitest';
import manifest from './manifest.json';

const productPageMatches = [
  '*://*.musinsa.com/products/*',
  '*://*.musinsa.com/app/goods/*',
  '*://*.musinsa.com/goods/*',
];
const hostPermissions = [...productPageMatches, 'https://raw.githubusercontent.com/*'];

describe('manifest permissions', () => {
  it('limits host permissions to Musinsa product pages and remote config', () => {
    expect(manifest.host_permissions).toEqual(hostPermissions);
  });

  it('runs content scripts only on Musinsa product pages', () => {
    expect(manifest.content_scripts).toHaveLength(1);
    expect(manifest.content_scripts[0]?.matches).toEqual(productPageMatches);
  });

  it('does not request broad tab permissions', () => {
    expect(manifest.permissions).not.toContain('tabs');
    expect(manifest.permissions).not.toContain('activeTab');
  });

  it('does not request remote code or broad URL access', () => {
    expect(JSON.stringify(manifest)).not.toContain('<all_urls>');
    expect(JSON.stringify(manifest)).not.toContain('*://*.musinsa.com/*"');
  });
});
