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

export interface RegisterBackgroundServicesOptions {
  fetchHtml: (url: string) => Promise<string>;
  now?: () => number;
}

export function registerBackgroundServices(options: RegisterBackgroundServicesOptions): void {
  registerBackgroundMessageHandler({
    checkProduct: (productId) =>
      processProductCheck(productId, {
        now: options.now?.() ?? Date.now(),
        fetchHtml: options.fetchHtml,
      }),
    resolveCanonicalUrl: resolveFinalProductUrl,
  });

  registerBackgroundScheduler({
    fetchHtml: options.fetchHtml,
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

registerBackgroundServices({ fetchHtml });
