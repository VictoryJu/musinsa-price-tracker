import { registerBackgroundMessageHandler } from './messages';
import { processProductCheck } from './pipeline';
import { registerBackgroundScheduler } from './scheduler';

const fetchHtml = async (url: string): Promise<string> => {
  const response = await fetch(url, { credentials: 'include' });
  if (!response.ok) {
    throw new Error(`Fetch failed: ${response.status}`);
  }
  return response.text();
};

const fetchJson = async (url: string): Promise<unknown> => {
  const response = await fetch(url, { credentials: 'include' });
  if (!response.ok) {
    throw new Error(`Fetch failed: ${response.status}`);
  }
  return response.json();
};

export interface RegisterBackgroundServicesOptions {
  fetchHtml: (url: string) => Promise<string>;
  fetchJson?: (url: string) => Promise<unknown>;
  now?: () => number;
}

export function registerBackgroundServices(options: RegisterBackgroundServicesOptions): void {
  registerBackgroundMessageHandler({
    checkProduct: (productId) =>
      processProductCheck(productId, {
        now: options.now?.() ?? Date.now(),
        fetchHtml: options.fetchHtml,
        fetchJson: options.fetchJson,
      }),
    resolveCanonicalUrl: resolveFinalProductUrl,
  });

  registerBackgroundScheduler({
    fetchHtml: options.fetchHtml,
    fetchJson: options.fetchJson,
  });
}

export async function resolveFinalProductUrl(url: string): Promise<string> {
  const response = await fetch(url, {
    method: 'HEAD',
    redirect: 'follow',
    credentials: 'include',
  });
  return response.url || url;
}

registerBackgroundServices({ fetchHtml, fetchJson });
