import { formatSnapshotLabel } from '../shared/presentation';
import { formatPrice } from '../shared/price';
import type { HistorySample, Product } from '../shared/types';

export interface RenderProductUiOptions {
  root: Document;
  productId: string;
  product: Product | null;
  onTrackStart: () => void;
  onRefreshNow?: (productId: string) => Promise<unknown>;
  hoverDelayMs?: number;
  historySamples?: HistorySample[];
  now?: number;
  soakPeriodDays?: number;
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
    button.textContent = '+';
    button.setAttribute('aria-label', 'Track this product');
    button.addEventListener('click', options.onTrackStart);
    mount.append(button);
    return { mode: 'cta', durationMs: performance.now() - startedAt };
  }

  const shadow = mount.attachShadow({ mode: 'open' });
  mount.setAttribute('data-state', getSnapshotState(options.product));
  shadow.append(createStatusStyle());

  const label = options.root.createElement('span');
  label.dataset.snapshotLabel = 'true';
  label.textContent = formatTrackingStateLabel(options.product, options);
  shadow.append(label);
  const staleBadge = createStaleBadge(options.product, options.now ?? Date.now());
  if (staleBadge) {
    mount.dataset.stale = 'true';
    shadow.append(staleBadge);
  }
  mount.setAttribute('data-hover-mounted', 'true');
  attachDelayedTooltip(mount, shadow, options);

  return { mode: 'tracked', durationMs: performance.now() - startedAt };
}

function formatTrackingStateLabel(product: Product, options: RenderProductUiOptions): string {
  if (product.currentSnapshot.status !== 'ok') return formatSnapshotLabel(product.currentSnapshot);

  const trackedDays = getTrackedDays(product.addedAt, options.now ?? Date.now());
  const soakPeriodDays = options.soakPeriodDays ?? 14;
  if (trackedDays <= soakPeriodDays) {
    return `추적 중 ${trackedDays}일째 / D-${soakPeriodDays - trackedDays}`;
  }

  const pieces = [formatSnapshotLabel(product.currentSnapshot)];
  if (product.stats.allTimeLow) pieces.push(`최저 ${formatPrice(product.stats.allTimeLow.price)}`);
  if (product.stats.avg30d !== null) pieces.push(`30일 평균 ${formatPrice(product.stats.avg30d)}`);
  return pieces.join(' · ');
}

function getTrackedDays(addedAt: number, now: number): number {
  const elapsedMs = Math.max(0, now - addedAt);
  return Math.floor(elapsedMs / (24 * 60 * 60 * 1000)) + 1;
}

function getSnapshotState(product: Product): 'ok' | 'soldOut' | 'failed' | 'blocked' {
  if (product.currentSnapshot.status === 'failed' && product.currentSnapshot.errorClass === 'blocked') return 'blocked';
  return product.currentSnapshot.status;
}

function createStatusStyle(): HTMLStyleElement {
  const style = document.createElement('style');
  style.dataset.statusStyle = 'true';
  style.textContent = `
    :host {
      display: inline-flex;
      align-items: center;
      gap: 4px;
    }
    :host([data-state="failed"]) [data-snapshot-label],
    :host([data-state="blocked"]) [data-snapshot-label] {
      color: #b42318;
      font-weight: 600;
    }
    :host([data-state="soldOut"]) [data-snapshot-label] {
      color: #667085;
      font-weight: 600;
    }
    [data-stale-badge] {
      color: #92400e;
      font-size: 11px;
      font-weight: 600;
      margin-left: 4px;
    }
  `;
  return style;
}

function createStaleBadge(product: Product, now: number): HTMLElement | null {
  const ageMs = now - product.lastCheckedAt;
  const staleAfterMs = 24 * 60 * 60 * 1000;
  if (ageMs <= staleAfterMs) return null;

  const badge = document.createElement('span');
  badge.dataset.staleBadge = 'true';
  badge.textContent = `마지막 업데이트: ${Math.floor(ageMs / (60 * 60 * 1000))}시간 전`;
  return badge;
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
      tooltip.append(createRefreshButton(options));
      shadow.append(tooltip);
    }, delay);
  });

  mount.addEventListener('mouseleave', () => {
    if (timer) clearTimeout(timer);
    timer = null;
  });
}

function createRefreshButton(options: RenderProductUiOptions): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.dataset.refreshNow = options.productId;
  button.textContent = '지금 체크';
  button.setAttribute('aria-busy', 'false');
  button.addEventListener('click', () => {
    void refreshNow(options, button);
  });
  return button;
}

async function refreshNow(options: RenderProductUiOptions, button: HTMLButtonElement): Promise<void> {
  if (!options.onRefreshNow) return;

  button.disabled = true;
  button.setAttribute('aria-busy', 'true');
  button.textContent = '체크 중...';

  try {
    await options.onRefreshNow(options.productId);
  } finally {
    button.disabled = false;
    button.setAttribute('aria-busy', 'false');
    button.textContent = '지금 체크';
  }
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
