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
      tooltip.append(createInlineSparkline(historySamples));
      shadow.append(tooltip);
    }, delay);
  });

  mount.addEventListener('mouseleave', () => {
    if (timer) clearTimeout(timer);
    timer = null;
  });
}

function createInlineSparkline(samples: HistorySample[]): SVGSVGElement {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('data-sparkline', 'true');
  svg.setAttribute('viewBox', '0 0 100 18');
  svg.setAttribute('width', '100');
  svg.setAttribute('height', '18');
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', 'Price history sparkline');

  const points = samples
    .filter((sample): sample is HistorySample & { price: number } => sample.status === 'ok' && sample.price !== null)
    .sort((left, right) => left.ts - right.ts);

  if (points.length < 2) {
    svg.setAttribute('data-empty', 'true');
    return svg;
  }

  const prices = points.map((sample) => sample.price);
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  const range = max - min;
  const linePoints = points
    .map((sample, index) => {
      const x = (index / (points.length - 1)) * 100;
      const y = range === 0 ? 9 : 18 - ((sample.price - min) / range) * 18;
      return `${formatCoordinate(x)},${formatCoordinate(y)}`;
    })
    .join(' ');

  const polyline = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
  polyline.setAttribute('points', linePoints);
  polyline.setAttribute('fill', 'none');
  polyline.setAttribute('stroke', 'currentColor');
  polyline.setAttribute('stroke-width', '2');
  polyline.setAttribute('vector-effect', 'non-scaling-stroke');
  svg.append(polyline);

  return svg;
}

function formatCoordinate(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(2).replace(/\.?0+$/, '');
}
