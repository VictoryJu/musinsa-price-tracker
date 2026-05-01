import { createRefreshNowMessage } from '../shared/messages';
import { formatSnapshotLabel } from '../shared/presentation';
import { formatPrice } from '../shared/price';
import type { ProductsMap } from '../shared/types';

void renderPopup(document);

export async function renderPopup(root: Document): Promise<void> {
  const countLabel = root.querySelector('#tracked-count');
  const list = root.querySelector('#product-list');
  const settings = root.querySelector('#settings');

  const result = await chrome.storage.local.get('products');
  const products = isProductsMap(result.products) ? result.products : {};
  const productList = Object.values(products).sort((left, right) => left.name.localeCompare(right.name));
  const count = productList.length;

  if (countLabel) countLabel.textContent = `${count} tracked product${count === 1 ? '' : 's'}`;
  renderSettingsActions(root, settings);
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

export async function exportStorageSnapshot(): Promise<string> {
  return JSON.stringify(await chrome.storage.local.get(null), null, 2);
}

export async function importStorageSnapshot(
  json: string,
  confirmImport: (message: string) => boolean = (message) => window.confirm(message)
): Promise<void> {
  const parsed = JSON.parse(json) as unknown;
  if (!isValidBackup(parsed)) throw new Error('Invalid backup schema');
  if (!confirmImport('Replace all extension data with this backup?')) return;

  await chrome.storage.local.clear();
  await chrome.storage.local.set(parsed);
}

export async function resetStorage(
  confirmReset: (message: string) => boolean = (message) => window.confirm(message)
): Promise<void> {
  if (!confirmReset('Clear all Musinsa Price Tracker data?')) return;
  await chrome.storage.local.clear();
}

function renderSettingsActions(root: Document, settings: Element | null): void {
  if (!settings) return;
  settings.textContent = '';

  const exportButton = root.createElement('button');
  exportButton.type = 'button';
  exportButton.dataset.exportData = 'true';
  exportButton.textContent = 'Export JSON';
  exportButton.addEventListener('click', () => {
    void downloadStorageSnapshot(root);
  });

  const importButton = root.createElement('button');
  importButton.type = 'button';
  importButton.dataset.importData = 'true';
  importButton.textContent = 'Import JSON';

  const importInput = root.createElement('input');
  importInput.type = 'file';
  importInput.accept = 'application/json';
  importInput.hidden = true;
  importInput.addEventListener('change', () => {
    const file = importInput.files?.[0];
    if (!file) return;
    void file.text().then((contents) => importStorageSnapshot(contents));
  });
  importButton.addEventListener('click', () => importInput.click());

  const resetButton = root.createElement('button');
  resetButton.type = 'button';
  resetButton.dataset.resetData = 'true';
  resetButton.textContent = 'Reset data';
  resetButton.addEventListener('click', () => {
    void resetStorage();
  });

  settings.append(exportButton, importButton, importInput, resetButton);
}

async function downloadStorageSnapshot(root: Document): Promise<void> {
  const blob = new Blob([await exportStorageSnapshot()], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = root.createElement('a');
  link.href = url;
  link.download = `musinsa-price-tracker-${new Date().toISOString().slice(0, 10)}.json`;
  root.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function isValidBackup(value: unknown): value is Record<string, unknown> {
  if (!isRecord(value)) return false;
  if ('products' in value && !isProductsMap(value.products)) return false;
  for (const [key, entry] of Object.entries(value)) {
    if (/^\d+:\d{4}-\d{2}$/.test(key) && !Array.isArray(entry)) return false;
  }
  return true;
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
