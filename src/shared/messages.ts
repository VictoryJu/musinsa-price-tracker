export interface ProductSummaryPayload {
  productId: string;
  canonicalUrl: string;
  name: string;
  thumbnail: string;
}

export interface TrackStartMessage {
  type: 'TRACK_START';
  payload: ProductSummaryPayload;
}

export interface TrackStopMessage {
  type: 'TRACK_STOP';
  payload: { productId: string };
}

export interface RefreshNowMessage {
  type: 'REFRESH_NOW';
  payload: { productId: string };
}

export interface LogVisitMessage {
  type: 'LOG_VISIT';
  payload: ProductSummaryPayload & { visitedAt: number };
}

export type RuntimeMessage = TrackStartMessage | TrackStopMessage | RefreshNowMessage | LogVisitMessage;

export interface RuntimeMessageResponse {
  ok: boolean;
  error?: string;
}

export function createTrackStartMessage(payload: ProductSummaryPayload): TrackStartMessage {
  return { type: 'TRACK_START', payload };
}

export function createTrackStopMessage(productId: string): TrackStopMessage {
  return { type: 'TRACK_STOP', payload: { productId } };
}

export function createRefreshNowMessage(productId: string): RefreshNowMessage {
  return { type: 'REFRESH_NOW', payload: { productId } };
}

export function createLogVisitMessage(payload: ProductSummaryPayload & { visitedAt: number }): LogVisitMessage {
  return { type: 'LOG_VISIT', payload };
}

export function isRuntimeMessage(value: unknown): value is RuntimeMessage {
  if (!isRecord(value) || typeof value.type !== 'string' || !isRecord(value.payload)) return false;

  switch (value.type) {
    case 'TRACK_START':
      return isProductSummaryPayload(value.payload);
    case 'TRACK_STOP':
    case 'REFRESH_NOW':
      return typeof value.payload.productId === 'string' && value.payload.productId.length > 0;
    case 'LOG_VISIT':
      return isProductSummaryPayload(value.payload) && typeof value.payload.visitedAt === 'number';
    default:
      return false;
  }
}

function isProductSummaryPayload(value: Record<string, unknown>): value is Record<string, unknown> & ProductSummaryPayload {
  return (
    typeof value.productId === 'string' &&
    value.productId.length > 0 &&
    typeof value.canonicalUrl === 'string' &&
    value.canonicalUrl.length > 0 &&
    typeof value.name === 'string' &&
    typeof value.thumbnail === 'string'
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
