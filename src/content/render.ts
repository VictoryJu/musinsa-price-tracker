import { formatSnapshotLabel } from '../shared/presentation';
import type { Product } from '../shared/types';

export interface RenderProductUiOptions {
  root: Document;
  productId: string;
  product: Product | null;
  onTrackStart: () => void;
}

export interface RenderProductUiResult {
  mode: 'cta' | 'tracked';
  durationMs: number;
}

export function renderProductUi(options: RenderProductUiOptions): RenderProductUiResult {
  const startedAt = performance.now();
  removeExistingMount(options.root);

  const mount = options.root.createElement('span');
  mount.dataset.musinsaPriceTracker = options.productId;
  options.root.body.append(mount);

  if (!options.product) {
    const button = options.root.createElement('button');
    button.type = 'button';
    button.textContent = '추적 시작';
    button.addEventListener('click', options.onTrackStart);
    mount.append(button);
    return { mode: 'cta', durationMs: performance.now() - startedAt };
  }

  const shadow = mount.attachShadow({ mode: 'open' });
  const label = options.root.createElement('span');
  label.textContent = formatSnapshotLabel(options.product.currentSnapshot);
  shadow.append(label);
  mount.setAttribute('data-hover-mounted', 'true');
  mount.addEventListener('mouseenter', () => undefined);

  return { mode: 'tracked', durationMs: performance.now() - startedAt };
}

function removeExistingMount(root: Document): void {
  root.querySelector('[data-musinsa-price-tracker]')?.remove();
}
