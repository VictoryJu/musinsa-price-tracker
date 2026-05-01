import { formatPrice } from './price';
import type { CurrentSnapshot, HistorySample } from './types';

export interface ChartPoint {
  x: number;
  y: number | null;
  status: HistorySample['status'];
}

export function formatSnapshotLabel(snapshot: CurrentSnapshot): string {
  if (snapshot.status === 'soldOut') return '품절';
  if (snapshot.status === 'failed') {
    if (snapshot.errorClass === 'blocked') return 'fetch 차단됨';
    return '가격 추출 실패 ⚠️';
  }
  return formatPrice(snapshot.price);
}

export function historyToChartPoints(samples: HistorySample[]): ChartPoint[] {
  return samples.map((sample) => ({
    x: sample.ts,
    y: sample.status === 'ok' ? sample.price : null,
    status: sample.status,
  }));
}
