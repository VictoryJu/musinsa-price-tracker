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
  });

  registerBackgroundScheduler({
    fetchHtml: options.fetchHtml,
  });
}

registerBackgroundServices({ fetchHtml });
