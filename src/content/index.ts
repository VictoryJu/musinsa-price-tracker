import { createLogVisitMessage } from '../shared/messages';

const productId = getProductId(location.pathname);

if (productId) {
  void chrome.runtime.sendMessage(
    createLogVisitMessage({
      productId,
      canonicalUrl: `${location.origin}${location.pathname}`,
      name: document.title || 'Musinsa product',
      thumbnail: getOpenGraphImage(),
      visitedAt: Date.now(),
    })
  );
}

function getProductId(pathname: string): string | null {
  return pathname.match(/\/products\/(\d+)/)?.[1] ?? null;
}

function getOpenGraphImage(): string {
  return document.querySelector<HTMLMetaElement>('meta[property="og:image"]')?.content ?? '';
}
