import { formatSnapshotLabel } from '../shared/presentation';
import type { HistorySample, Product } from '../shared/types';

export interface RenderProductUiOptions {
  root: Document;
  productId: string;
  product: Product | null;
  onTrackStart: () => void;
  hoverDelayMs?: number;
  historySamples?: HistorySample[];
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
  attachDelayedTooltip(mount, shadow, options);

  return { mode: 'tracked', durationMs: performance.now() - startedAt };
}

function removeExistingMount(root: Document): void {
  root.querySelector('[data-musinsa-price-tracker]')?.remove();
}

function attachDelayedTooltip(mount: HTMLElement, shadow: ShadowRoot, options: RenderProductUiOptions): void {
  let timer: ReturnType<typeof setTimeout> | null = null;
  const delay = options.hoverDelayMs ?? 300;
  const historySamples = options.historySamples ?? [];

  mount.addEventListener('mouseenter', () => {
    timer = setTimeout(() => {
      if (shadow.querySelector('[data-tooltip]')) return;

      const tooltip = document.createElement('aside');
      tooltip.dataset.tooltip = 'true';
      tooltip.textContent = `${historySamples.length} samples`;

      const sparkline = document.createElement('span');
      sparkline.dataset.sparkline = 'true';
      tooltip.append(sparkline);
      shadow.append(tooltip);
    }, delay);
  });

  mount.addEventListener('mouseleave', () => {
    if (timer) clearTimeout(timer);
    timer = null;
  });
}
