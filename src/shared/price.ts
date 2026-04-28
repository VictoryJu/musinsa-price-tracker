export function formatPrice(value: number | null): string {
  if (value === null) return '-';
  const rounded = Math.round(value);
  return `${rounded.toLocaleString('ko-KR')}원`;
}

export function parsePrice(input: string): number | null {
  const trimmed = input.trim();
  if (trimmed === '') return null;

  const matches = trimmed.matchAll(/[\d,]+/g);
  let largest: number | null = null;
  for (const match of matches) {
    const digits = match[0]?.replace(/,/g, '');
    if (!digits) continue;
    const value = Number.parseInt(digits, 10);
    if (Number.isNaN(value)) continue;
    if (largest === null || value > largest) largest = value;
  }

  return largest;
}

export function computePercentile(value: number, sortedAsc: number[]): number {
  if (sortedAsc.length === 0) return Number.NaN;

  const first = sortedAsc[0]!;
  const last = sortedAsc[sortedAsc.length - 1]!;
  if (value <= first) return 0;
  if (value >= last) return 100;

  for (let i = 0; i < sortedAsc.length - 1; i += 1) {
    const lo = sortedAsc[i]!;
    const hi = sortedAsc[i + 1]!;
    if (value >= lo && value <= hi) {
      const span = hi - lo;
      const offset = span === 0 ? 0 : (value - lo) / span;
      const pLo = (i / (sortedAsc.length - 1)) * 100;
      const pHi = ((i + 1) / (sortedAsc.length - 1)) * 100;
      return pLo + offset * (pHi - pLo);
    }
  }

  return Number.NaN;
}
