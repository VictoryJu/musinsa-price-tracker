import { formatPrice } from './price';
import type { CurrentSnapshot, HistorySample } from './types';

export interface ChartPoint {
  x: number;
  y: number | null;
  status: HistorySample['status'];
}

export function formatSnapshotLabel(snapshot: CurrentSnapshot): string {
  if (snapshot.status === 'soldOut') return 'Sold out';
  if (snapshot.status === 'failed') {
    if (snapshot.errorClass === 'blocked') return 'Fetch blocked';
    return 'Price extraction failed';
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
