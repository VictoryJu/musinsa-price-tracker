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
    return snapshot.errorClass ? `가격 확인 실패: ${snapshot.errorClass}` : '가격 확인 실패';
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
