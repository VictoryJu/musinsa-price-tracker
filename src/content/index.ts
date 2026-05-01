import { createLogVisitMessage, createTrackStartMessage } from '../shared/messages';
import type { Product, ProductsMap } from '../shared/types';
import { renderProductUi } from './render';

export async function bootstrapContentPage(root: Document, pageLocation: Location): Promise<void> {
  const productId = getProductId(pageLocation.pathname);
  if (!productId) return;

  const product = await getTrackedProduct(productId);
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
    onTrackStart: () => {
      void chrome.runtime.sendMessage(createTrackStartMessage(summary));
    },
  });
}

function getProductId(pathname: string): string | null {
  return pathname.match(/\/products\/(\d+)/)?.[1] ?? null;
}

function getOpenGraphImage(root: Document): string {
  return root.querySelector<HTMLMetaElement>('meta[property="og:image"]')?.content ?? '';
}

async function getTrackedProduct(productId: string): Promise<Product | null> {
  const result = await chrome.storage.local.get('products');
  const products = isProductsMap(result.products) ? result.products : {};
  return products[productId] ?? null;
}

function isProductsMap(value: unknown): value is ProductsMap {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

if (typeof window !== 'undefined') {
  void bootstrapContentPage(document, window.location);
}
