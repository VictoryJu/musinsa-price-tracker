import { describe, expect, it } from 'vitest';
import manifest from './manifest.json';

describe('manifest permissions', () => {
  it('limits host permissions to Musinsa product pages', () => {
    expect(manifest.host_permissions).toEqual(['*://*.musinsa.com/products/*']);
  });

  it('runs content scripts only on Musinsa product pages', () => {
    expect(manifest.content_scripts).toHaveLength(1);
    expect(manifest.content_scripts[0]?.matches).toEqual(['*://*.musinsa.com/products/*']);
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
