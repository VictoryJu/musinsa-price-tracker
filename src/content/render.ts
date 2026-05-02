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
  placementRetryMs?: number[];
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

  if (!options.product) {
    pinMountToViewport(mount);
    options.root.body.append(mount);
    const button = options.root.createElement('button');
    button.type = 'button';
    button.textContent = '+';
    button.setAttribute('aria-label', 'Track this product');
    styleTrackButton(button);
    button.addEventListener('click', options.onTrackStart);
    mount.append(button);
    return { mode: 'cta', durationMs: performance.now() - startedAt };
  }

  const placedInline = placeTrackedMount(mount, options);
  if (!placedInline) scheduleInlinePlacementRetry(mount, options);
  const shadow = mount.attachShadow({ mode: 'open' });
  mount.setAttribute('data-state', getSnapshotState(options.product));
  shadow.append(createStatusStyle());
  shadow.append(createInlinePriceBadge(options));
  shadow.append(createPricePopover(options));

  return { mode: 'tracked', durationMs: performance.now() - startedAt };
}

function formatTrackingStateLabel(product: Product, options: RenderProductUiOptions): string {
  if (product.currentSnapshot.status !== 'ok') return formatSnapshotLabel(product.currentSnapshot);

  const trackedDays = getTrackedDays(product.addedAt, options.now ?? Date.now());
  const soakPeriodDays = options.soakPeriodDays ?? 14;
  if (trackedDays <= soakPeriodDays) {
    return `Tracking day ${trackedDays} / D-${soakPeriodDays - trackedDays}`;
  }

  return 'Current price';
}

function getTrackedDays(addedAt: number, now: number): number {
  const elapsedMs = Math.max(0, now - addedAt);
  return Math.floor(elapsedMs / (24 * 60 * 60 * 1000)) + 1;
}

function getSnapshotState(product: Product): 'ok' | 'soldOut' | 'failed' | 'blocked' {
  if (product.currentSnapshot.status === 'failed' && product.currentSnapshot.errorClass === 'blocked') return 'blocked';
  return product.currentSnapshot.status;
}

function placeTrackedMount(mount: HTMLElement, options: RenderProductUiOptions): boolean {
  const priceAnchor = findPriceAnchor(options.root, options.product);
  if (priceAnchor) {
    mount.dataset.placement = 'inline-price';
    styleInlineHost(mount, priceAnchor);
    priceAnchor.insertAdjacentElement('afterend', mount);
    return true;
  }

  mount.dataset.placement = 'floating-fallback';
  pinMountToViewport(mount);
  options.root.body.append(mount);
  return false;
}

function scheduleInlinePlacementRetry(mount: HTMLElement, options: RenderProductUiOptions): void {
  const retryDelays = options.placementRetryMs ?? [250, 1000, 2500, 5000];
  for (const delay of retryDelays) {
    window.setTimeout(() => {
      if (!mount.isConnected || mount.dataset.placement !== 'floating-fallback') return;
      moveMountToPriceAnchorIfReady(mount, options);
    }, delay);
  }
}

function moveMountToPriceAnchorIfReady(mount: HTMLElement, options: RenderProductUiOptions): void {
  const priceAnchor = findPriceAnchor(options.root, options.product);
  if (!priceAnchor) return;

  mount.dataset.placement = 'inline-price';
  styleInlineHost(mount, priceAnchor);
  priceAnchor.insertAdjacentElement('afterend', mount);
}

function findPriceAnchor(root: Document, product: Product | null): Element | null {
  if (!product || product.currentSnapshot.status !== 'ok') return null;

  const priceLabel = formatPrice(product.currentSnapshot.price);
  const candidates = Array.from(root.body.querySelectorAll<HTMLElement>('body *'))
    .filter((element) => {
      if (element.closest('[data-musinsa-price-tracker]')) return false;
      if (['SCRIPT', 'STYLE', 'NOSCRIPT', 'META', 'LINK'].includes(element.tagName)) return false;
      const text = normalizeText(element.textContent ?? '');
      if (text === priceLabel) return true;
      return text.includes(priceLabel) && text.length <= priceLabel.length + 10;
    })
    .map((element) => ({ element, score: scorePriceAnchor(element, priceLabel) }))
    .sort((left, right) => right.score - left.score);

  return candidates[0]?.element ?? null;
}

function normalizeText(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

function scorePriceAnchor(element: HTMLElement, priceLabel: string): number {
  const text = normalizeText(element.textContent ?? '');
  const classPath = getClassPath(element);
  const rect = element.getBoundingClientRect();
  let score = 0;

  if (text === priceLabel) score += 20;
  if (element.children.length === 0) score += 80;
  if (/CalculatedPrice|CurrentPrice|Price__/.test(classPath)) score += 120;
  if (/Price__CurrentPrice|Price__PriceTotalWrap|Price__PriceWrap/.test(classPath)) score += 60;
  if (/Curation|Carousel|Recommend|ProductsItem|impression-content/.test(classPath)) score -= 120;
  if (rect.width > 0 && rect.height > 0 && rect.x > window.innerWidth * 0.5 && rect.y < window.innerHeight * 0.75) score += 30;

  return score - text.length / 100;
}

function getClassPath(element: HTMLElement): string {
  const classes: string[] = [];
  let current: Element | null = element;
  while (current && current !== document.body) {
    classes.push(String((current as HTMLElement).className ?? ''));
    current = current.parentElement;
  }
  return classes.join(' ');
}

function createInlinePriceBadge(options: RenderProductUiOptions): HTMLElement {
  const badge = document.createElement('button');
  badge.type = 'button';
  badge.dataset.priceBadge = 'true';
  badge.textContent = `Tracked ${getCurrentPriceLabel(options.product)}`;
  badge.setAttribute('aria-label', 'Show Musinsa price tracking details');
  return badge;
}

function createPricePopover(options: RenderProductUiOptions): HTMLElement {
  const popover = document.createElement('div');
  popover.dataset.pricePopover = 'true';
  popover.append(createPriceCard(options));
  return popover;
}

function getCurrentPriceLabel(product: Product | null): string {
  if (!product) return '-';
  return product.currentSnapshot.status === 'ok' ? formatPrice(product.currentSnapshot.price) : formatSnapshotLabel(product.currentSnapshot);
}

function createPriceCard(options: RenderProductUiOptions): HTMLElement {
  const product = options.product;
  if (!product) throw new Error('createPriceCard requires a tracked product');

  const card = document.createElement('section');
  card.dataset.priceCard = 'true';

  const header = document.createElement('div');
  header.dataset.cardHeader = 'true';

  const title = document.createElement('span');
  title.dataset.cardTitle = 'true';
  title.textContent = 'MUSINSA PRICE';
  header.append(title);

  const label = document.createElement('span');
  label.dataset.snapshotLabel = 'true';
  label.textContent = formatTrackingStateLabel(product, options);
  header.append(label);
  card.append(header);

  const current = document.createElement('strong');
  current.dataset.currentPrice = 'true';
  current.textContent = product.currentSnapshot.status === 'ok' ? formatPrice(product.currentSnapshot.price) : '-';
  card.append(current);

  const stats = document.createElement('div');
  stats.dataset.stats = 'true';
  stats.append(createStat('low', 'Low', product.stats.allTimeLow ? formatPrice(product.stats.allTimeLow.price) : '-'));
  stats.append(createStat('avg', '30d avg', product.stats.avg30d !== null ? formatPrice(product.stats.avg30d) : '-'));
  stats.append(createStat('samples', 'Samples', String(product.stats.samplesIn30d)));
  card.append(stats);

  const chartWrap = document.createElement('div');
  chartWrap.dataset.chartWrap = 'true';
  chartWrap.append(createInlineSparkline(options.historySamples ?? []));
  card.append(chartWrap);

  const footer = document.createElement('div');
  footer.dataset.cardFooter = 'true';
  const staleBadge = createStaleBadge(product, options.now ?? Date.now());
  if (staleBadge) {
    footer.append(staleBadge);
  } else {
    const fresh = document.createElement('span');
    fresh.dataset.freshBadge = 'true';
    fresh.textContent = 'Updated recently';
    footer.append(fresh);
  }
  footer.append(createRefreshButton(options));
  card.append(footer);

  return card;
}

function createStat(key: string, label: string, value: string): HTMLElement {
  const stat = document.createElement('span');
  stat.dataset.stat = key;

  const caption = document.createElement('span');
  caption.dataset.statLabel = 'true';
  caption.textContent = label;

  const number = document.createElement('strong');
  number.textContent = value;

  stat.append(caption, number);
  return stat;
}

function createStatusStyle(): HTMLStyleElement {
  const style = document.createElement('style');
  style.dataset.statusStyle = 'true';
  style.textContent = `
    :host {
      all: initial;
      display: inline-block;
      position: relative;
      color: #111827;
      font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      font-size: 12px;
      line-height: 1.35;
      box-sizing: border-box;
      vertical-align: middle;
    }
    *, *::before, *::after {
      box-sizing: border-box;
    }
    [data-price-badge] {
      border: 1px solid rgba(17, 24, 39, 0.14);
      border-radius: 7px;
      background: #ffffff;
      color: #0f766e;
      cursor: default;
      display: inline-flex;
      align-items: center;
      font: 800 12px/1 system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      min-height: 28px;
      margin-left: 8px;
      padding: 0 8px;
      white-space: nowrap;
      box-shadow: 0 6px 16px rgba(17, 24, 39, 0.08);
    }
    [data-price-popover] {
      position: fixed;
      top: var(--mpt-popover-top, 0);
      left: var(--mpt-popover-left, 0);
      width: 292px;
      opacity: 0;
      pointer-events: none;
      transform: translateY(-4px);
      transition: opacity 120ms ease, transform 120ms ease, visibility 120ms ease;
      visibility: hidden;
      z-index: 2147483647;
    }
    :host(:hover) [data-price-popover],
    :host(:focus-within) [data-price-popover] {
      opacity: 1;
      pointer-events: auto;
      transform: translateY(0);
      visibility: visible;
    }
    :host([data-placement="floating-fallback"]) [data-price-badge] {
      display: none;
    }
    :host([data-placement="floating-fallback"]) [data-price-popover] {
      position: static;
      opacity: 1;
      pointer-events: auto;
      transform: none;
      visibility: visible;
    }
    [data-price-card] {
      width: 100%;
      border: 1px solid rgba(17, 24, 39, 0.12);
      border-radius: 8px;
      background: rgba(255, 255, 255, 0.97);
      box-shadow: 0 18px 44px rgba(17, 24, 39, 0.18);
      color: #111827;
      padding: 12px;
      backdrop-filter: blur(10px);
    }
    [data-card-header],
    [data-card-footer] {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 10px;
    }
    [data-card-title] {
      color: #6b7280;
      font-size: 10px;
      font-weight: 700;
      letter-spacing: 0;
      white-space: nowrap;
    }
    [data-snapshot-label] {
      min-width: 0;
      color: #374151;
      font-size: 11px;
      font-weight: 600;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    [data-current-price] {
      display: block;
      margin-top: 8px;
      color: #111827;
      font-size: 24px;
      font-weight: 800;
      letter-spacing: 0;
      line-height: 1.1;
    }
    [data-stats] {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 6px;
      margin-top: 10px;
    }
    [data-stat] {
      min-width: 0;
      border: 1px solid rgba(17, 24, 39, 0.08);
      border-radius: 7px;
      background: #f9fafb;
      padding: 7px 8px;
    }
    [data-stat-label] {
      display: block;
      color: #6b7280;
      font-size: 10px;
      font-weight: 600;
      line-height: 1.2;
    }
    [data-stat] strong {
      display: block;
      margin-top: 3px;
      color: #111827;
      font-size: 11px;
      font-weight: 750;
      overflow-wrap: anywhere;
    }
    [data-chart-wrap] {
      height: 42px;
      margin-top: 10px;
      color: #0f766e;
    }
    [data-sparkline] {
      display: block;
      width: 100%;
      height: 42px;
      overflow: visible;
    }
    [data-sparkline][data-empty="true"] {
      color: #d1d5db;
    }
    [data-card-footer] {
      margin-top: 10px;
    }
    :host([data-state="failed"]) [data-snapshot-label],
    :host([data-state="blocked"]) [data-snapshot-label] {
      color: #b42318;
      font-weight: 700;
    }
    :host([data-state="soldOut"]) [data-snapshot-label] {
      color: #667085;
      font-weight: 700;
    }
    [data-stale-badge] {
      color: #92400e;
      font-size: 11px;
      font-weight: 600;
    }
    [data-fresh-badge] {
      color: #6b7280;
      font-size: 11px;
      font-weight: 600;
    }
    [data-refresh-now] {
      border: 1px solid rgba(17, 24, 39, 0.12);
      border-radius: 7px;
      background: #111827;
      color: #ffffff;
      cursor: pointer;
      font: 700 11px/1 system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      min-height: 28px;
      padding: 0 10px;
      white-space: nowrap;
    }
    [data-refresh-now]:disabled {
      cursor: wait;
      opacity: 0.72;
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
  badge.textContent = `Last update: ${Math.floor(ageMs / (60 * 60 * 1000))}h ago`;
  return badge;
}

function removeExistingMount(root: Document): void {
  root.querySelector('[data-musinsa-price-tracker]')?.remove();
}

function pinMountToViewport(mount: HTMLElement): void {
  Object.assign(mount.style, {
    position: 'fixed',
    right: '24px',
    bottom: '24px',
    zIndex: '2147483647',
    display: 'inline-flex',
    alignItems: 'center',
  });
}

function styleInlineHost(mount: HTMLElement, anchor: Element): void {
  const anchorRect = anchor.getBoundingClientRect();
  const popoverWidth = 292;
  const margin = 12;
  const estimatedBadgeWidth = 124;
  const left = Math.max(
    margin,
    Math.min(anchorRect.right + estimatedBadgeWidth - popoverWidth, window.innerWidth - popoverWidth - margin)
  );
  const top = Math.min(anchorRect.bottom + 8, window.innerHeight - 240);

  Object.assign(mount.style, {
    position: 'relative',
    right: '',
    bottom: '',
    zIndex: '2147483647',
    display: 'inline-block',
    alignItems: '',
  });
  mount.style.setProperty('--mpt-popover-left', `${Math.round(left)}px`);
  mount.style.setProperty('--mpt-popover-top', `${Math.round(top)}px`);
}

function styleTrackButton(button: HTMLButtonElement): void {
  Object.assign(button.style, {
    width: '36px',
    height: '36px',
    border: '0',
    borderRadius: '18px',
    background: '#111827',
    color: '#ffffff',
    boxShadow: '0 8px 24px rgba(17, 24, 39, 0.24)',
    cursor: 'pointer',
    font: '600 22px/36px system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    padding: '0',
  });
}

function createRefreshButton(options: RenderProductUiOptions): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.dataset.refreshNow = options.productId;
  button.textContent = 'Check now';
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
  button.textContent = 'Checking...';

  try {
    await options.onRefreshNow(options.productId);
  } finally {
    button.disabled = false;
    button.setAttribute('aria-busy', 'false');
    button.textContent = 'Check now';
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
    const baseline = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    baseline.setAttribute('x1', '0');
    baseline.setAttribute('x2', '100');
    baseline.setAttribute('y1', '9');
    baseline.setAttribute('y2', '9');
    baseline.setAttribute('stroke', 'currentColor');
    baseline.setAttribute('stroke-width', '2');
    baseline.setAttribute('stroke-dasharray', '4 4');
    baseline.setAttribute('vector-effect', 'non-scaling-stroke');
    svg.append(baseline);
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
