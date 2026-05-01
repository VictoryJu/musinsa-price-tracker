import { createRefreshNowMessage } from '../shared/messages';
import { formatSnapshotLabel } from '../shared/presentation';
import { formatPrice } from '../shared/price';
import type { ProductsMap } from '../shared/types';

void renderPopup(document);

export async function renderPopup(root: Document): Promise<void> {
  const countLabel = root.querySelector('#tracked-count');
  const list = root.querySelector('#product-list');

  const result = await chrome.storage.local.get('products');
  const products = isProductsMap(result.products) ? result.products : {};
  const productList = Object.values(products).sort((left, right) => left.name.localeCompare(right.name));
  const count = productList.length;

  if (countLabel) countLabel.textContent = `${count} tracked product${count === 1 ? '' : 's'}`;
  if (!list) return;

  list.textContent = '';
  for (const product of productList) {
    const card = root.createElement('article');
    card.dataset.productCard = product.id;

    const title = root.createElement('h2');
    title.textContent = product.name;

    const price = root.createElement('p');
    price.textContent = product.currentSnapshot.status === 'ok'
      ? formatPrice(product.currentSnapshot.price)
      : formatSnapshotLabel(product.currentSnapshot);

    const refreshButton = root.createElement('button');
    refreshButton.type = 'button';
    refreshButton.dataset.refreshNow = product.id;
    refreshButton.textContent = '지금 체크';
    refreshButton.setAttribute('aria-busy', 'false');
    refreshButton.addEventListener('click', () => {
      void refreshProduct(product.id, refreshButton);
    });

    card.append(title, price, refreshButton);
    list.append(card);
  }
}

async function refreshProduct(productId: string, button: HTMLButtonElement): Promise<void> {
  button.disabled = true;
  button.setAttribute('aria-busy', 'true');
  button.textContent = '체크 중...';

  try {
    await chrome.runtime.sendMessage(createRefreshNowMessage(productId));
  } finally {
    button.disabled = false;
    button.setAttribute('aria-busy', 'false');
    button.textContent = '지금 체크';
  }
}

function isProductsMap(value: unknown): value is ProductsMap {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
