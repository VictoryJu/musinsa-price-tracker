import { createLogVisitMessage, createRefreshNowMessage, createTrackStartMessage } from '../shared/messages';
import type { HistorySample, Product, ProductsMap } from '../shared/types';
import { renderProductUi } from './render';

export async function bootstrapContentPage(root: Document, pageLocation: Location): Promise<void> {
  const productId = getProductId(pageLocation.pathname);
  if (!productId) return;

  const storage = await chrome.storage.local.get(null);
  const product = getTrackedProductFromStorage(storage, productId);
  const historySamples = getHistorySamplesFromStorage(storage, productId);
  const summary = {
    productId,
    canonicalUrl: `${pageLocation.origin}${pageLocation.pathname}`,
    name: root.title || 'Musinsa product',
    thumbnail: getOpenGraphImage(root),
  };

  await chrome.runtime.sendMessage(createLogVisitMessage({ ...summary, visitedAt: Date.now() }));

  renderProductUi({
    root,
    productId,
    product,
    historySamples,
    now: Date.now(),
    onTrackStart: () => {
      void chrome.runtime.sendMessage(createTrackStartMessage(summary));
    },
    onRefreshNow: (targetProductId) => chrome.runtime.sendMessage(createRefreshNowMessage(targetProductId)),
  });
}

function getProductId(pathname: string): string | null {
  return pathname.match(/\/products\/(\d+)/)?.[1] ?? null;
}

function getOpenGraphImage(root: Document): string {
  return root.querySelector<HTMLMetaElement>('meta[property="og:image"]')?.content ?? '';
}

function getTrackedProductFromStorage(storage: Record<string, unknown>, productId: string): Product | null {
  const products = isProductsMap(storage.products) ? storage.products : {};
  return products[productId] ?? null;
}

function getHistorySamplesFromStorage(storage: Record<string, unknown>, productId: string): HistorySample[] {
  const prefix = `${productId}:`;
  return Object.entries(storage)
    .filter(([key]) => key.startsWith(prefix) && /^\d{4}-\d{2}$/.test(key.slice(prefix.length)))
    .flatMap(([, value]) => (Array.isArray(value) ? (value as HistorySample[]) : []))
    .sort((left, right) => left.ts - right.ts);
}

function isProductsMap(value: unknown): value is ProductsMap {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

if (typeof window !== 'undefined') {
  void bootstrapContentPage(document, window.location);
}
