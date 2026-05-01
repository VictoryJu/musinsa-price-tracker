import type { ProductsMap } from '../shared/types';

void renderTrackedCount();

async function renderTrackedCount(): Promise<void> {
  const label = document.querySelector('#tracked-count');
  if (!label) return;

  const result = await chrome.storage.local.get('products');
  const products = isProductsMap(result.products) ? result.products : {};
  const count = Object.keys(products).length;

  label.textContent = `${count} tracked product${count === 1 ? '' : 's'}`;
}

function isProductsMap(value: unknown): value is ProductsMap {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
