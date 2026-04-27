# Phase 1A — Storage Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Storage 스키마 + 마이그레이션 프레임워크 + 공유 유틸리티(price/buyability)를 박아서 V1의 다른 모든 issue가 의존할 단단한 기반을 만든다.

**Architecture:** chrome.storage.local에 split key 구조 (`schemaVersion`, `products`, `history`, `settings`). 히스토리는 월별 청크(`<id>:YYYY-MM`)로 분리해 write amplification 회피. 마이그레이션 레지스트리는 익스텐션 시작 시 실행. 공유 모듈은 `src/shared/` 아래에 두고 모든 UI 표면이 같은 함수 사용.

**Tech Stack:** TypeScript 5.x · Manifest V3 · Vite + @crxjs/vite-plugin · Vitest + jsdom · pnpm · @types/chrome

**Closes:** #3 (storage split) · #18 (shared price/buyability) · #21 (schema versioning)

---

## File Structure

```
musinsa-price-tracker/
├── package.json                                   (Task 0)
├── tsconfig.json                                  (Task 0)
├── vite.config.ts                                 (Task 0)
├── vitest.config.ts                               (Task 0)
├── tests/
│   └── setup.ts                                   (Task 0) — chrome.* mock + jsdom
├── src/
│   ├── manifest.json                              (Task 0)
│   ├── shared/
│   │   ├── types.ts                               (Task 1) — Product, HistorySample, Stats, Settings, Status
│   │   ├── price.ts                               (Task 2) — formatPrice, parsePrice, computePercentile
│   │   ├── price.test.ts                          (Task 2)
│   │   ├── buyability.ts                          (Task 3) — classifyBuyability, computeStats
│   │   ├── buyability.test.ts                     (Task 3)
│   │   ├── storage.ts                             (Tasks 4-6) — chrome.storage.local adapter
│   │   ├── storage.test.ts                        (Tasks 4-6)
│   │   └── migrations/
│   │       ├── index.ts                           (Tasks 7-8) — registry + runMigrations + safe fallback
│   │       ├── index.test.ts                      (Tasks 7-8)
│   │       └── v0-to-v1.ts                        (Task 7) — first migration (no-op for greenfield)
│   ├── background/                                (Phase 1C — not in scope)
│   ├── content/                                   (Phase 1B — not in scope)
│   └── popup/                                     (Phase 1C — not in scope)
└── docs/superpowers/specs/                        (already exists)
```

**원칙:**
- 한 파일 = 한 책임. `storage.ts`는 chrome.storage 래퍼만, `buyability.ts`는 분류만.
- 테스트 파일은 옆에 `.test.ts` (별도 디렉토리 X)
- TDD: 각 task 안에서 테스트 먼저 작성 → 실패 확인 → 구현 → 통과 확인 → commit

---

## Task 0: 프로젝트 부트스트랩

**Files:**
- Create: `package.json`, `tsconfig.json`, `vite.config.ts`, `vitest.config.ts`, `tests/setup.ts`, `src/manifest.json`

- [ ] **Step 0.1: `package.json` 작성**

```json
{
  "name": "musinsa-price-tracker",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "test": "vitest run",
    "test:watch": "vitest",
    "typecheck": "tsc --noEmit"
  },
  "devDependencies": {
    "@crxjs/vite-plugin": "^2.0.0",
    "@types/chrome": "^0.0.260",
    "@types/node": "^20.0.0",
    "jsdom": "^25.0.0",
    "typescript": "^5.4.0",
    "vite": "^5.4.0",
    "vitest": "^2.0.0"
  }
}
```

- [ ] **Step 0.2: `tsconfig.json` 작성**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "isolatedModules": true,
    "resolveJsonModule": true,
    "types": ["chrome", "vitest/globals"]
  },
  "include": ["src/**/*", "tests/**/*"]
}
```

- [ ] **Step 0.3: `vite.config.ts` 작성**

```typescript
import { defineConfig } from 'vite';
import { crx } from '@crxjs/vite-plugin';
import manifest from './src/manifest.json';

export default defineConfig({
  plugins: [crx({ manifest })],
  build: {
    sourcemap: true,
    rollupOptions: {
      input: {},
    },
  },
});
```

- [ ] **Step 0.4: `vitest.config.ts` 작성**

```typescript
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./tests/setup.ts'],
    include: ['src/**/*.test.ts'],
  },
});
```

- [ ] **Step 0.5: `tests/setup.ts` 작성 — chrome.storage.local 인메모리 mock**

```typescript
import { beforeEach, vi } from 'vitest';

const mockStorage = new Map<string, unknown>();

(globalThis as unknown as { chrome: unknown }).chrome = {
  storage: {
    local: {
      get: vi.fn(async (keys?: string | string[] | null) => {
        if (keys === null || keys === undefined) {
          return Object.fromEntries(mockStorage);
        }
        const keyArray = Array.isArray(keys) ? keys : [keys];
        return Object.fromEntries(
          keyArray
            .filter((k) => mockStorage.has(k))
            .map((k) => [k, mockStorage.get(k)])
        );
      }),
      set: vi.fn(async (items: Record<string, unknown>) => {
        for (const [k, v] of Object.entries(items)) {
          mockStorage.set(k, v);
        }
      }),
      remove: vi.fn(async (keys: string | string[]) => {
        const keyArray = Array.isArray(keys) ? keys : [keys];
        for (const k of keyArray) mockStorage.delete(k);
      }),
      clear: vi.fn(async () => {
        mockStorage.clear();
      }),
    },
  },
};

beforeEach(() => {
  mockStorage.clear();
  vi.clearAllMocks();
});

export { mockStorage };
```

- [ ] **Step 0.6: `src/manifest.json` 작성 (Manifest V3 최소판)**

```json
{
  "manifest_version": 3,
  "name": "Musinsa Price Tracker",
  "version": "0.1.0",
  "description": "무신사 상품 가격 추적 + 페이지 인라인 분석",
  "permissions": ["storage", "alarms", "notifications"],
  "host_permissions": ["*://*.musinsa.com/products/*"],
  "background": {
    "service_worker": "src/background/index.ts",
    "type": "module"
  },
  "action": {
    "default_popup": "src/popup/index.html"
  },
  "content_scripts": [
    {
      "matches": ["*://*.musinsa.com/products/*"],
      "js": ["src/content/index.ts"],
      "run_at": "document_idle"
    }
  ]
}
```

> Note: `background/index.ts`, `content/index.ts`, `popup/index.html`은 Phase 1B/1C에서 작성. Phase 1A에선 manifest만 미리 박고, 빌드는 entry 파일이 없어 일시 실패할 수 있음 → typecheck/test만 통과하면 OK.

- [ ] **Step 0.7: 의존성 설치**

Run:
```bash
pnpm install
```

Expected: `node_modules/` 생성, `pnpm-lock.yaml` 생성, 0 vulnerabilities.

- [ ] **Step 0.8: typecheck + test 빈 상태에서 통과 확인**

Run:
```bash
pnpm typecheck
pnpm test
```

Expected:
- typecheck: 에러 없음
- test: "No test files found" 또는 0 tests 통과 (PASS)

- [ ] **Step 0.9: Commit**

```bash
git add package.json tsconfig.json vite.config.ts vitest.config.ts tests/setup.ts src/manifest.json pnpm-lock.yaml .gitignore
git commit -m "chore: bootstrap MV3 + vite + vitest project skeleton

Sets up TypeScript strict mode, @crxjs/vite-plugin for bundling,
Vitest with jsdom for tests, and an in-memory chrome.storage mock.
Manifest V3 declares permissions limited to products pages only.

Refs #17"
```

---

## Task 1: Storage 타입 정의

**Files:**
- Create: `src/shared/types.ts`

타입은 TDD가 어색하므로 테스트 없이 작성. 후속 태스크가 이 타입을 사용하면서 자연스럽게 검증.

- [ ] **Step 1.1: `src/shared/types.ts` 작성**

```typescript
// 핵심 도메인 타입 — Phase 1A storage foundation의 single source of truth.
//
// 변경 시 src/shared/migrations/ 아래에 마이그레이션 추가 필수.
// 변경 시 docs/superpowers/specs/2026-04-28-musinsa-price-tracker-design.md §5도 업데이트.

export const CURRENT_SCHEMA_VERSION = 1;

export type SampleStatus = 'ok' | 'soldOut' | 'failed';

export type ExtractorPath = 'json-ld' | 'css-selector' | 'internal-api' | 'unknown';

export interface HistorySample {
  ts: number;            // unix ms
  price: number | null;  // null when status !== 'ok'
  status: SampleStatus;
}

export interface CurrentSnapshot {
  price: number | null;
  ts: number;
  extractorPath: ExtractorPath;
  status: SampleStatus;
  errorMessage?: string;
}

export interface Stats {
  allTimeLow: { price: number; ts: number } | null;
  avg30d: number | null;
  min30d: number | null;
  max30d: number | null;
  samplesIn30d: number;
  lastComputedAt: number;
}

export interface NotificationToken {
  price: number;
  ts: number;
}

export interface Product {
  id: string;
  canonicalUrl: string;
  name: string;
  thumbnail: string;
  addedAt: number;
  notifyOnNewLow: boolean;
  currentSnapshot: CurrentSnapshot;
  stats: Stats;
  lastNotified: NotificationToken | null;
  nextCheckAt: number;
  lastCheckedAt: number;
}

export interface BuyabilityThresholds {
  // percentile-based: current price 위치가 30d 분포 안에서
  great: number;  // <= great percentile → great
  good: number;   // <= good percentile → good
  fair: number;   // <= fair percentile → fair
  wait: number;   // <= wait percentile → wait, otherwise wait
}

export interface Settings {
  schemaVersion: number;
  fetchIntervalHours: number;
  globalNotifications: boolean;
  retentionDays: number;
  soakPeriodDays: number;
  minSamplesForAnalysis: number;
  hoverDelayMs: number;
  buyabilityThresholds: BuyabilityThresholds;
}

export const DEFAULT_SETTINGS: Settings = {
  schemaVersion: CURRENT_SCHEMA_VERSION,
  fetchIntervalHours: 12,
  globalNotifications: true,
  retentionDays: 365,
  soakPeriodDays: 14,
  minSamplesForAnalysis: 20,
  hoverDelayMs: 300,
  buyabilityThresholds: {
    great: 10,
    good: 25,
    fair: 75,
    wait: 90,
  },
};

// chrome.storage.local 최상위 키
export type StorageKey = 'schemaVersion' | 'products' | 'history' | 'settings';

export type ProductsMap = Record<string, Product>;

// history는 `<productId>:<YYYY-MM>` 형태의 키로 분리됨
export type HistoryChunkKey = `${string}:${string}`;
export type HistoryMap = Record<HistoryChunkKey, HistorySample[]>;
```

- [ ] **Step 1.2: typecheck 통과 확인**

Run:
```bash
pnpm typecheck
```

Expected: 에러 없음.

- [ ] **Step 1.3: Commit**

```bash
git add src/shared/types.ts
git commit -m "feat(types): define storage schema types

ProductRecord with currentSnapshot + stats + lastNotified + scheduling
state, HistorySample union with sold-out/failed states, Settings with
percentile-based buyability thresholds and DEFAULT_SETTINGS export.

Refs #3 #21"
```

---

## Task 2: Price 유틸리티 (TDD)

**Files:**
- Create: `src/shared/price.ts`, `src/shared/price.test.ts`

가격 포맷/파싱/percentile은 사용자 보이는 모든 표면에서 공유. DRY 차원에서 가장 먼저 박음.

- [ ] **Step 2.1: 테스트 먼저 작성 — `src/shared/price.test.ts`**

```typescript
import { describe, it, expect } from 'vitest';
import { formatPrice, parsePrice, computePercentile } from './price';

describe('formatPrice', () => {
  it('정수 가격을 한국식 콤마 포함 원화 표기로 반환', () => {
    expect(formatPrice(37700)).toBe('37,700원');
    expect(formatPrice(1000000)).toBe('1,000,000원');
  });

  it('0원도 명시적으로 반환', () => {
    expect(formatPrice(0)).toBe('0원');
  });

  it('null이면 빈 문자열 대신 "-"를 반환 (UI placeholder)', () => {
    expect(formatPrice(null)).toBe('-');
  });

  it('소수점은 반올림 (정수 KRW만 다룸)', () => {
    expect(formatPrice(37700.7)).toBe('37,701원');
  });

  it('음수는 그대로 표시 (할인 차이 등에서 사용)', () => {
    expect(formatPrice(-5200)).toBe('-5,200원');
  });
});

describe('parsePrice', () => {
  it('"37,700원" 문자열에서 정수 추출', () => {
    expect(parsePrice('37,700원')).toBe(37700);
  });

  it('통화기호 없이도 동작', () => {
    expect(parsePrice('37,700')).toBe(37700);
  });

  it('공백/탭 trim', () => {
    expect(parsePrice('  37,700원  ')).toBe(37700);
  });

  it('숫자가 없으면 null', () => {
    expect(parsePrice('가격 문의')).toBeNull();
    expect(parsePrice('')).toBeNull();
  });

  it('할인율 같은 다른 숫자 무시 — 가장 큰 숫자 그룹 선택', () => {
    expect(parsePrice('60% 37,700원')).toBe(37700);
  });
});

describe('computePercentile', () => {
  it('정렬된 분포에서 값의 percentile (0~100) 계산', () => {
    const sorted = [10, 20, 30, 40, 50];
    expect(computePercentile(10, sorted)).toBe(0);
    expect(computePercentile(30, sorted)).toBe(50);
    expect(computePercentile(50, sorted)).toBe(100);
  });

  it('값이 분포에 없어도 보간된 percentile 반환', () => {
    const sorted = [10, 20, 30, 40, 50];
    expect(computePercentile(25, sorted)).toBeCloseTo(37.5);
  });

  it('값이 최저 미만이면 0', () => {
    expect(computePercentile(5, [10, 20, 30])).toBe(0);
  });

  it('값이 최고 초과면 100', () => {
    expect(computePercentile(100, [10, 20, 30])).toBe(100);
  });

  it('빈 분포는 NaN', () => {
    expect(computePercentile(50, [])).toBeNaN();
  });
});
```

- [ ] **Step 2.2: 테스트 실행해서 실패 확인**

Run:
```bash
pnpm test src/shared/price.test.ts
```

Expected: FAIL — `Cannot find module './price'` 또는 export 없음 에러.

- [ ] **Step 2.3: 구현 — `src/shared/price.ts`**

```typescript
/**
 * 한국 원화 정수 표기로 변환. null이면 "-".
 */
export function formatPrice(value: number | null): string {
  if (value === null) return '-';
  const rounded = Math.round(value);
  return `${rounded.toLocaleString('ko-KR')}원`;
}

/**
 * 문자열에서 가격 정수 추출. 가장 큰 숫자 그룹을 KRW 정수로 본다.
 * 할인율(60%)과 가격(37,700원)이 함께 있을 때 가격을 선택.
 */
export function parsePrice(input: string): number | null {
  const trimmed = input.trim();
  if (trimmed === '') return null;

  const matches = trimmed.matchAll(/[\d,]+/g);
  let largest: number | null = null;
  for (const match of matches) {
    const digits = match[0].replace(/,/g, '');
    if (digits === '') continue;
    const value = Number.parseInt(digits, 10);
    if (Number.isNaN(value)) continue;
    if (largest === null || value > largest) largest = value;
  }
  return largest;
}

/**
 * 정렬된 오름차순 배열에서 value의 percentile (0~100). 선형 보간.
 * 빈 배열은 NaN.
 */
export function computePercentile(value: number, sortedAsc: number[]): number {
  if (sortedAsc.length === 0) return Number.NaN;
  if (value <= sortedAsc[0]!) return 0;
  if (value >= sortedAsc[sortedAsc.length - 1]!) return 100;

  for (let i = 0; i < sortedAsc.length - 1; i++) {
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
```

- [ ] **Step 2.4: 테스트 통과 확인**

Run:
```bash
pnpm test src/shared/price.test.ts
```

Expected: PASS — 5 + 5 + 5 = 15 tests passing.

- [ ] **Step 2.5: Commit**

```bash
git add src/shared/price.ts src/shared/price.test.ts
git commit -m "feat(price): add formatPrice/parsePrice/computePercentile

Shared formatting/parsing/percentile utilities used by content script
labels, hover tooltips, popovers, and the popup. parsePrice picks the
largest number group so it ignores discount-rate noise like 60%.

Refs #18"
```

---

## Task 3: Buyability 분류기 (TDD)

**Files:**
- Create: `src/shared/buyability.ts`, `src/shared/buyability.test.ts`

Stats(min/max/avg/all-time-low) 계산 + 현재가가 어느 percentile인지 분류. 표본이 부족하면 null.

- [ ] **Step 3.1: 테스트 먼저 작성 — `src/shared/buyability.test.ts`**

```typescript
import { describe, it, expect } from 'vitest';
import { computeStats, classifyBuyability } from './buyability';
import type { HistorySample, BuyabilityThresholds } from './types';

const sample = (ts: number, price: number, status: HistorySample['status'] = 'ok'): HistorySample => ({
  ts,
  price: status === 'ok' ? price : null,
  status,
});

const day = 24 * 60 * 60 * 1000;

const defaultThresholds: BuyabilityThresholds = {
  great: 10,
  good: 25,
  fair: 75,
  wait: 90,
};

describe('computeStats', () => {
  it('30일 안 ok 샘플로 min/max/avg/count + 전체 allTimeLow 계산', () => {
    const now = 1_700_000_000_000;
    const samples: HistorySample[] = [
      sample(now - 100 * day, 32000),  // 30일 밖
      sample(now - 20 * day, 38000),
      sample(now - 10 * day, 35000),
      sample(now - 5 * day, 40000),
      sample(now - 1 * day, 37000),
    ];

    const stats = computeStats(samples, now);

    expect(stats.allTimeLow).toEqual({ price: 32000, ts: now - 100 * day });
    expect(stats.min30d).toBe(35000);
    expect(stats.max30d).toBe(40000);
    expect(stats.avg30d).toBe(37500);
    expect(stats.samplesIn30d).toBe(4);
  });

  it('실패/품절 샘플은 stats 계산에서 제외', () => {
    const now = 1_700_000_000_000;
    const samples: HistorySample[] = [
      sample(now - 5 * day, 35000),
      sample(now - 4 * day, 0, 'soldOut'),
      sample(now - 3 * day, 0, 'failed'),
      sample(now - 2 * day, 37000),
    ];

    const stats = computeStats(samples, now);

    expect(stats.samplesIn30d).toBe(2);
    expect(stats.min30d).toBe(35000);
    expect(stats.max30d).toBe(37000);
  });

  it('샘플이 없으면 모든 통계 null + count 0', () => {
    const stats = computeStats([], 1_700_000_000_000);
    expect(stats.allTimeLow).toBeNull();
    expect(stats.min30d).toBeNull();
    expect(stats.max30d).toBeNull();
    expect(stats.avg30d).toBeNull();
    expect(stats.samplesIn30d).toBe(0);
  });
});

describe('classifyBuyability', () => {
  it('샘플이 minSamplesForAnalysis 미만이면 null (소크 단계 표시)', () => {
    const samples: HistorySample[] = Array.from({ length: 10 }, (_, i) =>
      sample(1_700_000_000_000 - i * day, 35000 + i * 100)
    );
    const result = classifyBuyability(35000, samples, defaultThresholds, 20, 1_700_000_000_000);
    expect(result).toBeNull();
  });

  it('충분한 샘플 + 현재가가 분포 하위 10% 이내 → great', () => {
    const samples: HistorySample[] = Array.from({ length: 30 }, (_, i) =>
      sample(1_700_000_000_000 - i * day, 35000 + i * 100)
    );
    const lowest = 35000;
    const result = classifyBuyability(lowest, samples, defaultThresholds, 20, 1_700_000_000_000);
    expect(result).toBe('great');
  });

  it('현재가가 중앙값 근처 → fair', () => {
    const samples: HistorySample[] = Array.from({ length: 30 }, (_, i) =>
      sample(1_700_000_000_000 - i * day, 35000 + i * 100)
    );
    const middle = 36500;
    const result = classifyBuyability(middle, samples, defaultThresholds, 20, 1_700_000_000_000);
    expect(result).toBe('fair');
  });

  it('현재가가 분포 상위 10% → wait', () => {
    const samples: HistorySample[] = Array.from({ length: 30 }, (_, i) =>
      sample(1_700_000_000_000 - i * day, 35000 + i * 100)
    );
    const highest = 37900;
    const result = classifyBuyability(highest, samples, defaultThresholds, 20, 1_700_000_000_000);
    expect(result).toBe('wait');
  });

  it('현재가가 분포 외 (역대 최저보다 낮음) → great', () => {
    const samples: HistorySample[] = Array.from({ length: 30 }, (_, i) =>
      sample(1_700_000_000_000 - i * day, 35000 + i * 100)
    );
    const result = classifyBuyability(30000, samples, defaultThresholds, 20, 1_700_000_000_000);
    expect(result).toBe('great');
  });

  it('30일 안 ok 샘플만 카운트 (오래된 샘플은 충분 조건에서 제외)', () => {
    const now = 1_700_000_000_000;
    // 25개는 60일 전, 5개만 30일 안 → minSamples 20 미만 → null
    const old: HistorySample[] = Array.from({ length: 25 }, (_, i) =>
      sample(now - (40 + i) * day, 35000 + i * 100)
    );
    const recent: HistorySample[] = Array.from({ length: 5 }, (_, i) =>
      sample(now - i * day, 35000 + i * 100)
    );
    const result = classifyBuyability(35000, [...old, ...recent], defaultThresholds, 20, now);
    expect(result).toBeNull();
  });
});
```

- [ ] **Step 3.2: 테스트 실패 확인**

Run:
```bash
pnpm test src/shared/buyability.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3.3: 구현 — `src/shared/buyability.ts`**

```typescript
import type { HistorySample, Stats, BuyabilityThresholds } from './types';
import { computePercentile } from './price';

const DAY_MS = 24 * 60 * 60 * 1000;

export type BuyabilityClass = 'great' | 'good' | 'fair' | 'wait';

/**
 * 30일 윈도우 안 ok 샘플로 min/max/avg/count, 전체 history에서 allTimeLow 계산.
 * 현재 시각 `now`는 호출자가 주입 (테스트 가능성을 위해).
 */
export function computeStats(samples: HistorySample[], now: number): Stats {
  const ok = samples.filter((s): s is HistorySample & { price: number } =>
    s.status === 'ok' && s.price !== null
  );
  if (ok.length === 0) {
    return {
      allTimeLow: null,
      avg30d: null,
      min30d: null,
      max30d: null,
      samplesIn30d: 0,
      lastComputedAt: now,
    };
  }

  let allTimeLow = ok[0]!;
  for (const s of ok) {
    if (s.price < allTimeLow.price) allTimeLow = s;
  }

  const cutoff = now - 30 * DAY_MS;
  const recent = ok.filter((s) => s.ts >= cutoff);
  if (recent.length === 0) {
    return {
      allTimeLow: { price: allTimeLow.price, ts: allTimeLow.ts },
      avg30d: null,
      min30d: null,
      max30d: null,
      samplesIn30d: 0,
      lastComputedAt: now,
    };
  }

  let min = recent[0]!.price;
  let max = recent[0]!.price;
  let sum = 0;
  for (const s of recent) {
    if (s.price < min) min = s.price;
    if (s.price > max) max = s.price;
    sum += s.price;
  }

  return {
    allTimeLow: { price: allTimeLow.price, ts: allTimeLow.ts },
    avg30d: Math.round(sum / recent.length),
    min30d: min,
    max30d: max,
    samplesIn30d: recent.length,
    lastComputedAt: now,
  };
}

/**
 * 현재가가 30일 분포에서 어느 percentile에 위치하는지로 분류.
 * 30일 ok 샘플 수가 minSamples 미만이면 null (소크 단계).
 */
export function classifyBuyability(
  currentPrice: number,
  samples: HistorySample[],
  thresholds: BuyabilityThresholds,
  minSamples: number,
  now: number
): BuyabilityClass | null {
  const cutoff = now - 30 * DAY_MS;
  const recent = samples
    .filter((s): s is HistorySample & { price: number } => s.status === 'ok' && s.price !== null && s.ts >= cutoff)
    .map((s) => s.price)
    .sort((a, b) => a - b);

  if (recent.length < minSamples) return null;

  const pct = computePercentile(currentPrice, recent);
  if (pct <= thresholds.great) return 'great';
  if (pct <= thresholds.good) return 'good';
  if (pct <= thresholds.fair) return 'fair';
  return 'wait';
}
```

- [ ] **Step 3.4: 테스트 통과 확인**

Run:
```bash
pnpm test src/shared/buyability.test.ts
```

Expected: PASS — 9 tests passing.

- [ ] **Step 3.5: Commit (closes #18)**

```bash
git add src/shared/buyability.ts src/shared/buyability.test.ts
git commit -m "feat(buyability): add classifyBuyability + computeStats

Percentile-based classifier returns null when 30d ok-sample count is
under minSamplesForAnalysis (default 20) — matches the 14-day soak
period UX. computeStats separates 30d window stats from all-time low
so the badge logic stays adaptive while the all-time anchor stays
honest.

Closes #18"
```

---

## Task 4: Storage 어댑터 — 기본 read/write (TDD)

**Files:**
- Create: `src/shared/storage.ts`, `src/shared/storage.test.ts`

chrome.storage.local의 split key 구조를 추상화. 모든 write는 background에서만 호출 (코드 레벨로 강제 X, 컨벤션은 주석 + 통합 테스트).

- [ ] **Step 4.1: 테스트 먼저 작성 — `src/shared/storage.test.ts` (Task 4 범위)**

```typescript
import { describe, it, expect } from 'vitest';
import {
  getProduct,
  setProduct,
  deleteProduct,
  getAllProducts,
  getHistoryChunk,
  appendHistorySample,
  getYearMonth,
  initializeStorage,
  getSettings,
} from './storage';
import { CURRENT_SCHEMA_VERSION, DEFAULT_SETTINGS } from './types';
import type { Product, HistorySample } from './types';

const baseProduct: Product = {
  id: '3674341',
  canonicalUrl: 'https://www.musinsa.com/products/3674341',
  name: 'Test Product',
  thumbnail: 'https://example.com/thumb.jpg',
  addedAt: 1_700_000_000_000,
  notifyOnNewLow: true,
  currentSnapshot: {
    price: 37700,
    ts: 1_700_000_000_000,
    extractorPath: 'json-ld',
    status: 'ok',
  },
  stats: {
    allTimeLow: null,
    avg30d: null,
    min30d: null,
    max30d: null,
    samplesIn30d: 0,
    lastComputedAt: 1_700_000_000_000,
  },
  lastNotified: null,
  nextCheckAt: 1_700_043_200_000,
  lastCheckedAt: 1_700_000_000_000,
};

describe('initializeStorage', () => {
  it('빈 storage에 schemaVersion + DEFAULT_SETTINGS 박음', async () => {
    await initializeStorage();
    const settings = await getSettings();
    expect(settings.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
    expect(settings.fetchIntervalHours).toBe(DEFAULT_SETTINGS.fetchIntervalHours);
    expect(settings.retentionDays).toBe(365);
  });

  it('이미 초기화된 storage는 기존 settings 보존', async () => {
    await initializeStorage();
    const settings = await getSettings();
    settings.fetchIntervalHours = 6;
    await chrome.storage.local.set({ settings });

    await initializeStorage();
    const reloaded = await getSettings();
    expect(reloaded.fetchIntervalHours).toBe(6);
  });
});

describe('product CRUD', () => {
  it('setProduct 후 getProduct로 같은 객체 반환', async () => {
    await initializeStorage();
    await setProduct(baseProduct);
    const result = await getProduct('3674341');
    expect(result).toEqual(baseProduct);
  });

  it('없는 id 조회 → null', async () => {
    await initializeStorage();
    const result = await getProduct('does-not-exist');
    expect(result).toBeNull();
  });

  it('deleteProduct 후 getProduct → null + getAllProducts에서도 빠짐', async () => {
    await initializeStorage();
    await setProduct(baseProduct);
    await deleteProduct('3674341');
    expect(await getProduct('3674341')).toBeNull();
    expect(await getAllProducts()).toEqual({});
  });

  it('getAllProducts는 등록된 모든 상품 반환', async () => {
    await initializeStorage();
    await setProduct(baseProduct);
    await setProduct({ ...baseProduct, id: '999', canonicalUrl: 'https://www.musinsa.com/products/999' });
    const all = await getAllProducts();
    expect(Object.keys(all).sort()).toEqual(['3674341', '999']);
  });
});

describe('getYearMonth', () => {
  it('unix ms → YYYY-MM', () => {
    // 2024-01-15 12:00 UTC
    expect(getYearMonth(1_705_320_000_000)).toBe('2024-01');
    // 2026-04-28 (현재 날짜)
    expect(getYearMonth(1_777_932_000_000)).toBe('2026-04');
  });
});

describe('history chunks', () => {
  it('appendHistorySample은 해당 월 청크에 추가, ts 오름차순 유지', async () => {
    await initializeStorage();
    const ts1 = new Date('2026-04-01T00:00:00Z').getTime();
    const ts2 = new Date('2026-04-15T00:00:00Z').getTime();
    const ts3 = new Date('2026-04-10T00:00:00Z').getTime();  // 중간 삽입

    await appendHistorySample('3674341', { ts: ts1, price: 37000, status: 'ok' });
    await appendHistorySample('3674341', { ts: ts2, price: 38000, status: 'ok' });
    await appendHistorySample('3674341', { ts: ts3, price: 36500, status: 'ok' });

    const chunk = await getHistoryChunk('3674341', '2026-04');
    expect(chunk.map((s) => s.ts)).toEqual([ts1, ts3, ts2]);
  });

  it('월이 다르면 별도 청크에 들어감', async () => {
    await initializeStorage();
    const aprTs = new Date('2026-04-15T00:00:00Z').getTime();
    const mayTs = new Date('2026-05-01T00:00:00Z').getTime();

    await appendHistorySample('3674341', { ts: aprTs, price: 37000, status: 'ok' });
    await appendHistorySample('3674341', { ts: mayTs, price: 36000, status: 'ok' });

    const apr = await getHistoryChunk('3674341', '2026-04');
    const may = await getHistoryChunk('3674341', '2026-05');
    expect(apr).toHaveLength(1);
    expect(may).toHaveLength(1);
    expect(apr[0]!.price).toBe(37000);
    expect(may[0]!.price).toBe(36000);
  });

  it('없는 청크 → 빈 배열', async () => {
    await initializeStorage();
    const chunk = await getHistoryChunk('3674341', '2024-01');
    expect(chunk).toEqual([]);
  });
});
```

- [ ] **Step 4.2: 테스트 실패 확인**

Run:
```bash
pnpm test src/shared/storage.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 4.3: 구현 — `src/shared/storage.ts`**

```typescript
import {
  CURRENT_SCHEMA_VERSION,
  DEFAULT_SETTINGS,
  type HistorySample,
  type Product,
  type ProductsMap,
  type Settings,
  type HistoryChunkKey,
} from './types';

// ────────────────────────────────────────────────────────────
//  CONTRACT
//  --------
//  - 모든 write 함수 (setProduct, deleteProduct, appendHistorySample,
//    initializeStorage 등)는 BACKGROUND service worker에서만 호출.
//  - Content script와 popup은 read 함수만 사용. write는 message
//    passing으로 background에 위임 (Phase 1B/1C 통합 시 강제).
//  - 이 contract가 Issue #2 (architecture boundary)와 #10
//    (multi-tab race) 방지의 기반.
// ────────────────────────────────────────────────────────────

const KEY_SCHEMA_VERSION = 'schemaVersion';
const KEY_PRODUCTS = 'products';
const KEY_SETTINGS = 'settings';

/** unix ms → "YYYY-MM" UTC 기준 */
export function getYearMonth(ts: number): string {
  const d = new Date(ts);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

function historyKey(productId: string, yearMonth: string): HistoryChunkKey {
  return `history:${productId}:${yearMonth}` as HistoryChunkKey;
}

export async function initializeStorage(): Promise<void> {
  const existing = await chrome.storage.local.get([KEY_SCHEMA_VERSION, KEY_SETTINGS]);
  const updates: Record<string, unknown> = {};
  if (existing[KEY_SCHEMA_VERSION] === undefined) {
    updates[KEY_SCHEMA_VERSION] = CURRENT_SCHEMA_VERSION;
  }
  if (existing[KEY_SETTINGS] === undefined) {
    updates[KEY_SETTINGS] = { ...DEFAULT_SETTINGS };
  }
  if (Object.keys(updates).length > 0) {
    await chrome.storage.local.set(updates);
  }
}

export async function getSettings(): Promise<Settings> {
  const result = await chrome.storage.local.get(KEY_SETTINGS);
  const stored = result[KEY_SETTINGS] as Settings | undefined;
  return stored ?? { ...DEFAULT_SETTINGS };
}

export async function getAllProducts(): Promise<ProductsMap> {
  const result = await chrome.storage.local.get(KEY_PRODUCTS);
  return (result[KEY_PRODUCTS] as ProductsMap | undefined) ?? {};
}

export async function getProduct(id: string): Promise<Product | null> {
  const all = await getAllProducts();
  return all[id] ?? null;
}

export async function setProduct(product: Product): Promise<void> {
  const all = await getAllProducts();
  all[product.id] = product;
  await chrome.storage.local.set({ [KEY_PRODUCTS]: all });
}

export async function deleteProduct(id: string): Promise<void> {
  const all = await getAllProducts();
  if (id in all) {
    delete all[id];
    await chrome.storage.local.set({ [KEY_PRODUCTS]: all });
  }
  // 해당 상품의 모든 history 청크도 제거
  const allKeys = await chrome.storage.local.get(null);
  const chunkKeysToRemove = Object.keys(allKeys).filter((k) => k.startsWith(`history:${id}:`));
  if (chunkKeysToRemove.length > 0) {
    await chrome.storage.local.remove(chunkKeysToRemove);
  }
}

export async function getHistoryChunk(productId: string, yearMonth: string): Promise<HistorySample[]> {
  const key = historyKey(productId, yearMonth);
  const result = await chrome.storage.local.get(key);
  return (result[key] as HistorySample[] | undefined) ?? [];
}

/**
 * 청크에 샘플을 추가하면서 ts 오름차순 유지.
 * 동일 ts가 이미 있으면 새 샘플로 대체 (background-only 보장 하에 안전).
 */
export async function appendHistorySample(productId: string, sample: HistorySample): Promise<void> {
  const yearMonth = getYearMonth(sample.ts);
  const key = historyKey(productId, yearMonth);
  const chunk = await getHistoryChunk(productId, yearMonth);

  // ts가 같으면 대체, 아니면 정렬 위치에 삽입
  const existingIdx = chunk.findIndex((s) => s.ts === sample.ts);
  if (existingIdx >= 0) {
    chunk[existingIdx] = sample;
  } else {
    let insertAt = chunk.length;
    for (let i = 0; i < chunk.length; i++) {
      if (chunk[i]!.ts > sample.ts) {
        insertAt = i;
        break;
      }
    }
    chunk.splice(insertAt, 0, sample);
  }

  await chrome.storage.local.set({ [key]: chunk });
}
```

- [ ] **Step 4.4: 테스트 통과 확인**

Run:
```bash
pnpm test src/shared/storage.test.ts
```

Expected: PASS — 모든 describe 블록 통과 (~10 tests).

- [ ] **Step 4.5: Commit (refs #3)**

```bash
git add src/shared/storage.ts src/shared/storage.test.ts
git commit -m "feat(storage): add chrome.storage.local adapter with split keys

products + settings + schemaVersion live at top level. History split
into monthly chunks (history:<id>:YYYY-MM) to avoid write
amplification. appendHistorySample keeps each chunk sorted by ts and
deduplicates on identical timestamps. deleteProduct also clears all
history chunks for the product.

Refs #3"
```

---

## Task 5: 365일 retention prune

**Files:**
- Modify: `src/shared/storage.ts` (extend), `src/shared/storage.test.ts` (extend)

- [ ] **Step 5.1: 테스트 추가 — `storage.test.ts`에 새 describe**

```typescript
import { pruneHistory, listHistoryChunkKeys } from './storage';
// ... 기존 import 유지

describe('pruneHistory', () => {
  it('retentionDays 이전 청크는 모두 제거, 안쪽은 보존', async () => {
    await initializeStorage();
    const productId = '3674341';
    const now = new Date('2026-04-15T00:00:00Z').getTime();

    // 2024-04 (~ 2년 전, retention 365일이면 제외 대상)
    const oldTs = new Date('2024-04-01T00:00:00Z').getTime();
    // 2025-12 (~ 4개월 전, retention 안)
    const recentTs = new Date('2025-12-01T00:00:00Z').getTime();

    await appendHistorySample(productId, { ts: oldTs, price: 30000, status: 'ok' });
    await appendHistorySample(productId, { ts: recentTs, price: 35000, status: 'ok' });

    const removed = await pruneHistory(productId, 365, now);
    expect(removed).toBe(1);
    expect(await getHistoryChunk(productId, '2024-04')).toEqual([]);
    expect(await getHistoryChunk(productId, '2025-12')).toHaveLength(1);
  });

  it('retention 안 청크만 있으면 0 제거', async () => {
    await initializeStorage();
    const productId = '3674341';
    const now = new Date('2026-04-15T00:00:00Z').getTime();
    await appendHistorySample(productId, {
      ts: new Date('2026-04-01T00:00:00Z').getTime(),
      price: 35000,
      status: 'ok',
    });

    const removed = await pruneHistory(productId, 365, now);
    expect(removed).toBe(0);
  });

  it('listHistoryChunkKeys는 해당 productId의 모든 청크 키 반환', async () => {
    await initializeStorage();
    const productId = '3674341';
    await appendHistorySample(productId, { ts: new Date('2026-03-15T00:00:00Z').getTime(), price: 35000, status: 'ok' });
    await appendHistorySample(productId, { ts: new Date('2026-04-01T00:00:00Z').getTime(), price: 36000, status: 'ok' });
    await appendHistorySample('999', { ts: new Date('2026-04-01T00:00:00Z').getTime(), price: 99000, status: 'ok' });

    const keys = await listHistoryChunkKeys(productId);
    expect(keys.sort()).toEqual(['history:3674341:2026-03', 'history:3674341:2026-04']);
  });
});
```

- [ ] **Step 5.2: 테스트 실패 확인**

Run:
```bash
pnpm test src/shared/storage.test.ts
```

Expected: FAIL — `pruneHistory`, `listHistoryChunkKeys` not exported.

- [ ] **Step 5.3: 구현 — `storage.ts`에 함수 추가**

```typescript
// (파일 하단에 추가)

const DAY_MS = 24 * 60 * 60 * 1000;

/** 해당 productId의 모든 history 청크 키 (정렬 안 함) */
export async function listHistoryChunkKeys(productId: string): Promise<string[]> {
  const all = await chrome.storage.local.get(null);
  const prefix = `history:${productId}:`;
  return Object.keys(all).filter((k) => k.startsWith(prefix));
}

/**
 * retentionDays보다 오래된 청크 전체 제거.
 * 청크 단위 prune이라 부분적으로 잘리지는 않음 — 청크 전체가 cutoff 이전이면 삭제.
 * @returns 제거된 청크 개수
 */
export async function pruneHistory(productId: string, retentionDays: number, now: number): Promise<number> {
  const cutoff = now - retentionDays * DAY_MS;
  const keys = await listHistoryChunkKeys(productId);
  const toRemove: string[] = [];

  for (const key of keys) {
    const yearMonth = key.split(':')[2];
    if (!yearMonth) continue;
    const [yearStr, monthStr] = yearMonth.split('-');
    const year = Number.parseInt(yearStr ?? '', 10);
    const month = Number.parseInt(monthStr ?? '', 10);
    if (Number.isNaN(year) || Number.isNaN(month)) continue;
    // 그 달의 마지막 날 23:59 (월말이 cutoff보다 이전이면 청크 전체가 cutoff 이전)
    const monthEnd = Date.UTC(year, month, 0, 23, 59, 59); // month 0-indexed → 다음달 0번째 = 이번달 마지막
    if (monthEnd < cutoff) toRemove.push(key);
  }

  if (toRemove.length > 0) {
    await chrome.storage.local.remove(toRemove);
  }
  return toRemove.length;
}
```

- [ ] **Step 5.4: 테스트 통과 확인**

Run:
```bash
pnpm test src/shared/storage.test.ts
```

Expected: PASS — 신규 3 + 기존 통과.

- [ ] **Step 5.5: Commit (refs #3)**

```bash
git add src/shared/storage.ts src/shared/storage.test.ts
git commit -m "feat(storage): add 365-day sliding window history prune

pruneHistory removes whole month chunks whose latest possible date is
older than retentionDays. listHistoryChunkKeys exposes per-product
keys so callers can iterate without scanning full storage.

Refs #3"
```

---

## Task 6: Stats 사전 계산

**Files:**
- Modify: `src/shared/storage.ts`, `src/shared/storage.test.ts`

매 fetch 후 history 전체를 다시 읽고 stats를 product 레코드에 박아둠. content script가 매 페이지 로드마다 history를 스캔할 필요 없음.

- [ ] **Step 6.1: 테스트 추가**

```typescript
import { recomputeAndStoreStats, getProductHistory } from './storage';
// 기존 import 유지

describe('recomputeAndStoreStats', () => {
  it('해당 product의 모든 청크를 합쳐 stats를 product.stats에 저장', async () => {
    await initializeStorage();
    const productId = '3674341';
    await setProduct(baseProduct);

    const now = new Date('2026-04-15T00:00:00Z').getTime();
    const day = 24 * 60 * 60 * 1000;

    // 30일 안 5개
    for (let i = 1; i <= 5; i++) {
      await appendHistorySample(productId, { ts: now - i * day, price: 35000 + i * 100, status: 'ok' });
    }
    // 60일 전 1개 (allTimeLow 후보)
    await appendHistorySample(productId, { ts: now - 60 * day, price: 30000, status: 'ok' });

    const stats = await recomputeAndStoreStats(productId, now);

    expect(stats.allTimeLow?.price).toBe(30000);
    expect(stats.samplesIn30d).toBe(5);
    expect(stats.min30d).toBe(35100);
    expect(stats.max30d).toBe(35500);
    expect(stats.lastComputedAt).toBe(now);

    const stored = await getProduct(productId);
    expect(stored?.stats.allTimeLow?.price).toBe(30000);
  });

  it('상품이 없으면 throw', async () => {
    await initializeStorage();
    await expect(recomputeAndStoreStats('does-not-exist', Date.now())).rejects.toThrow();
  });

  it('getProductHistory는 모든 월 청크를 합쳐 ts 오름차순 반환', async () => {
    await initializeStorage();
    const productId = '3674341';
    await appendHistorySample(productId, { ts: new Date('2026-03-15T00:00:00Z').getTime(), price: 35000, status: 'ok' });
    await appendHistorySample(productId, { ts: new Date('2026-04-01T00:00:00Z').getTime(), price: 36000, status: 'ok' });
    await appendHistorySample(productId, { ts: new Date('2026-02-20T00:00:00Z').getTime(), price: 37000, status: 'ok' });

    const all = await getProductHistory(productId);
    expect(all.map((s) => s.price)).toEqual([37000, 35000, 36000]);
  });
});
```

- [ ] **Step 6.2: 테스트 실패 확인**

Run:
```bash
pnpm test src/shared/storage.test.ts
```

Expected: FAIL — `recomputeAndStoreStats`, `getProductHistory` not exported.

- [ ] **Step 6.3: 구현 — `storage.ts`에 추가**

```typescript
import { computeStats } from './buyability';
// 기존 import 유지

/**
 * 해당 product의 모든 history 청크를 ts 오름차순으로 합쳐 반환.
 */
export async function getProductHistory(productId: string): Promise<HistorySample[]> {
  const keys = await listHistoryChunkKeys(productId);
  const all = await chrome.storage.local.get(keys);
  const merged: HistorySample[] = [];
  for (const key of keys) {
    const chunk = all[key] as HistorySample[] | undefined;
    if (chunk) merged.push(...chunk);
  }
  merged.sort((a, b) => a.ts - b.ts);
  return merged;
}

/**
 * product.stats를 다시 계산해서 저장.
 * background에서 매 fetch 후 호출.
 */
export async function recomputeAndStoreStats(
  productId: string,
  now: number
): Promise<import('./types').Stats> {
  const product = await getProduct(productId);
  if (!product) {
    throw new Error(`recomputeAndStoreStats: product ${productId} not found`);
  }
  const history = await getProductHistory(productId);
  const stats = computeStats(history, now);
  product.stats = stats;
  await setProduct(product);
  return stats;
}
```

- [ ] **Step 6.4: 테스트 통과 확인**

Run:
```bash
pnpm test src/shared/storage.test.ts
```

Expected: PASS.

- [ ] **Step 6.5: Commit (closes #3)**

```bash
git add src/shared/storage.ts src/shared/storage.test.ts
git commit -m "feat(storage): precompute stats so content script never scans history

recomputeAndStoreStats merges all month chunks for a product, runs
computeStats, and writes the result into product.stats. Called by
background after every successful fetch. Content script reads
product.stats directly — no storage roundtrip on every page render.

Closes #3"
```

---

## Task 7: 마이그레이션 레지스트리

**Files:**
- Create: `src/shared/migrations/index.ts`, `src/shared/migrations/index.test.ts`, `src/shared/migrations/v0-to-v1.ts`

`schemaVersion`을 비교해서 필요한 마이그레이션을 순차 실행. v0(빈 storage) → v1(현재) 마이그레이션은 사실상 no-op이지만 프레임워크는 미리 박음.

- [ ] **Step 7.1: 테스트 먼저 작성 — `src/shared/migrations/index.test.ts`**

```typescript
import { describe, it, expect } from 'vitest';
import { runMigrations, getStoredSchemaVersion } from './index';
import { CURRENT_SCHEMA_VERSION } from '../types';

describe('getStoredSchemaVersion', () => {
  it('storage가 비어있으면 0 반환 (greenfield install)', async () => {
    const v = await getStoredSchemaVersion();
    expect(v).toBe(0);
  });

  it('schemaVersion 키가 있으면 그 값 반환', async () => {
    await chrome.storage.local.set({ schemaVersion: 3 });
    const v = await getStoredSchemaVersion();
    expect(v).toBe(3);
  });
});

describe('runMigrations', () => {
  it('greenfield (v0 → v1) 마이그레이션 실행 후 schemaVersion === CURRENT', async () => {
    const result = await runMigrations();
    expect(result.fromVersion).toBe(0);
    expect(result.toVersion).toBe(CURRENT_SCHEMA_VERSION);
    expect(result.applied).toContain('v0-to-v1');

    const v = await getStoredSchemaVersion();
    expect(v).toBe(CURRENT_SCHEMA_VERSION);
  });

  it('이미 최신 버전이면 no-op', async () => {
    await chrome.storage.local.set({ schemaVersion: CURRENT_SCHEMA_VERSION });
    const result = await runMigrations();
    expect(result.applied).toEqual([]);
    expect(result.fromVersion).toBe(CURRENT_SCHEMA_VERSION);
    expect(result.toVersion).toBe(CURRENT_SCHEMA_VERSION);
  });
});
```

- [ ] **Step 7.2: 테스트 실패 확인**

Run:
```bash
pnpm test src/shared/migrations/
```

Expected: FAIL — module not found.

- [ ] **Step 7.3: 구현 — `src/shared/migrations/v0-to-v1.ts`**

```typescript
import { DEFAULT_SETTINGS, CURRENT_SCHEMA_VERSION } from '../types';

/**
 * v0 (빈 storage) → v1 마이그레이션.
 * 사실상 initializeStorage와 같은 일 — settings 기본값 박음.
 * 프레임워크 시연 + 향후 v1→v2 마이그레이션의 템플릿.
 */
export async function v0_to_v1(): Promise<void> {
  const existing = await chrome.storage.local.get(['settings']);
  if (existing.settings === undefined) {
    await chrome.storage.local.set({ settings: { ...DEFAULT_SETTINGS } });
  }
  await chrome.storage.local.set({ schemaVersion: 1 });
}

export const META = { name: 'v0-to-v1', from: 0, to: 1 } as const;

// schemaVersion 1 시점의 CURRENT_SCHEMA_VERSION이 1이라는 sanity check
if (CURRENT_SCHEMA_VERSION < 1) {
  throw new Error('v0-to-v1 migration requires CURRENT_SCHEMA_VERSION >= 1');
}
```

- [ ] **Step 7.4: 구현 — `src/shared/migrations/index.ts`**

```typescript
import { CURRENT_SCHEMA_VERSION } from '../types';
import { v0_to_v1, META as v0_to_v1_meta } from './v0-to-v1';

interface MigrationStep {
  name: string;
  from: number;
  to: number;
  run: () => Promise<void>;
}

const REGISTRY: MigrationStep[] = [
  { ...v0_to_v1_meta, run: v0_to_v1 },
  // 향후 추가: { ...v1_to_v2_meta, run: v1_to_v2 },
];

export interface MigrationResult {
  fromVersion: number;
  toVersion: number;
  applied: string[];
}

export async function getStoredSchemaVersion(): Promise<number> {
  const result = await chrome.storage.local.get('schemaVersion');
  const v = result.schemaVersion;
  return typeof v === 'number' ? v : 0;
}

export async function runMigrations(): Promise<MigrationResult> {
  const startVersion = await getStoredSchemaVersion();
  const applied: string[] = [];
  let current = startVersion;

  while (current < CURRENT_SCHEMA_VERSION) {
    const next = REGISTRY.find((m) => m.from === current);
    if (!next) {
      throw new Error(
        `Migration registry incomplete: no step from v${current}. Cannot reach v${CURRENT_SCHEMA_VERSION}.`
      );
    }
    await next.run();
    applied.push(next.name);
    current = next.to;
  }

  return { fromVersion: startVersion, toVersion: current, applied };
}
```

- [ ] **Step 7.5: 테스트 통과 확인**

Run:
```bash
pnpm test src/shared/migrations/
```

Expected: PASS — 4 tests.

- [ ] **Step 7.6: Commit (refs #21)**

```bash
git add src/shared/migrations/
git commit -m "feat(migrations): add schema version registry

runMigrations chains migration steps from stored schemaVersion to
CURRENT_SCHEMA_VERSION. v0-to-v1 is the greenfield bootstrap and
serves as the template for future schema changes. Background calls
runMigrations on every onInstalled / onStartup event.

Refs #21"
```

---

## Task 8: 마이그레이션 안전 폴백

**Files:**
- Modify: `src/shared/migrations/index.ts`, `src/shared/migrations/index.test.ts`

마이그레이션 실패 시 데이터 보존 + 마지막 성공 버전 유지. 익스텐션이 리부트 루프 빠지지 않게.

- [ ] **Step 8.1: 테스트 추가**

```typescript
// migrations/index.test.ts에 추가

import { runMigrationsWithFallback, type FallbackResult } from './index';

describe('runMigrationsWithFallback', () => {
  it('정상 케이스는 status: success + applied 반환', async () => {
    const result = await runMigrationsWithFallback();
    expect(result.status).toBe('success');
    if (result.status === 'success') {
      expect(result.applied).toContain('v0-to-v1');
    }
  });

  it('마이그레이션이 throw하면 status: failure + 기존 schemaVersion 유지 + 데이터 보존', async () => {
    // 실패 마이그레이션 주입을 위한 기본 호출 후 인위적 손상
    await chrome.storage.local.set({
      schemaVersion: 999,  // 미래 버전 → 등록된 마이그레이션 없음 → throw
      products: { '999': { id: '999' } },
    });

    const result = await runMigrationsWithFallback();
    expect(result.status).toBe('failure');
    if (result.status === 'failure') {
      expect(result.error).toBeInstanceOf(Error);
      expect(result.preservedSchemaVersion).toBe(999);
    }

    // 데이터는 그대로 보존
    const after = await chrome.storage.local.get(['products', 'schemaVersion']);
    expect(after.products).toEqual({ '999': { id: '999' } });
    expect(after.schemaVersion).toBe(999);
  });
});
```

- [ ] **Step 8.2: 테스트 실패 확인**

Run:
```bash
pnpm test src/shared/migrations/
```

Expected: FAIL — `runMigrationsWithFallback` not exported.

- [ ] **Step 8.3: 구현 — `migrations/index.ts`에 추가**

```typescript
// 파일 하단에 추가

export type FallbackResult =
  | { status: 'success'; fromVersion: number; toVersion: number; applied: string[] }
  | { status: 'failure'; error: Error; preservedSchemaVersion: number };

/**
 * 마이그레이션 실패해도 데이터 손상시키지 않는 안전 wrapper.
 * 실패 시 기존 schemaVersion을 그대로 두고 에러를 호출자에게 반환 — 다음 시작 시
 * 같은 마이그레이션이 다시 시도됨. 호출자(background)는 사용자에게 에러 UI 표시.
 */
export async function runMigrationsWithFallback(): Promise<FallbackResult> {
  let preservedVersion = 0;
  try {
    preservedVersion = await getStoredSchemaVersion();
    const result = await runMigrations();
    return { status: 'success', ...result };
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err));
    return { status: 'failure', error, preservedSchemaVersion: preservedVersion };
  }
}
```

- [ ] **Step 8.4: 테스트 통과 확인**

Run:
```bash
pnpm test src/shared/migrations/
```

Expected: PASS.

- [ ] **Step 8.5: Commit (closes #21)**

```bash
git add src/shared/migrations/index.ts src/shared/migrations/index.test.ts
git commit -m "feat(migrations): add safe fallback wrapper

runMigrationsWithFallback returns a discriminated result instead of
throwing. On failure the existing schemaVersion is preserved so user
data stays intact and the same migration retries on next startup.
Background reports the error in the popup UI for the user.

Closes #21"
```

---

## Task 9: 통합 테스트 — full storage lifecycle

**Files:**
- Create: `src/shared/storage.integration.test.ts`

전체 흐름을 한 테스트에서 시뮬레이션: 마이그레이션 → 상품 등록 → 샘플 추가 → stats 재계산 → retention prune → 상품 삭제. 컴포넌트들이 진짜 합쳐졌을 때 깨지지 않는지 검증.

- [ ] **Step 9.1: 통합 테스트 작성**

```typescript
import { describe, it, expect } from 'vitest';
import { runMigrationsWithFallback } from './migrations';
import {
  setProduct,
  getProduct,
  appendHistorySample,
  recomputeAndStoreStats,
  pruneHistory,
  deleteProduct,
  listHistoryChunkKeys,
  getSettings,
} from './storage';
import type { Product } from './types';

const day = 24 * 60 * 60 * 1000;

const productFixture: Product = {
  id: '3674341',
  canonicalUrl: 'https://www.musinsa.com/products/3674341',
  name: 'Test Hoodie',
  thumbnail: 'https://example.com/t.jpg',
  addedAt: new Date('2025-01-01T00:00:00Z').getTime(),
  notifyOnNewLow: true,
  currentSnapshot: {
    price: 37700,
    ts: new Date('2026-04-15T00:00:00Z').getTime(),
    extractorPath: 'json-ld',
    status: 'ok',
  },
  stats: {
    allTimeLow: null,
    avg30d: null,
    min30d: null,
    max30d: null,
    samplesIn30d: 0,
    lastComputedAt: 0,
  },
  lastNotified: null,
  nextCheckAt: 0,
  lastCheckedAt: 0,
};

describe('Storage lifecycle (integration)', () => {
  it('greenfield install → register → 1년 데이터 → prune → delete', async () => {
    // 1. greenfield 마이그레이션
    const mig = await runMigrationsWithFallback();
    expect(mig.status).toBe('success');

    // 2. 기본 settings 존재 확인
    const settings = await getSettings();
    expect(settings.retentionDays).toBe(365);
    expect(settings.minSamplesForAnalysis).toBe(20);

    // 3. 상품 등록
    await setProduct(productFixture);
    expect(await getProduct(productFixture.id)).not.toBeNull();

    // 4. 18개월에 걸친 샘플 추가 (월 2회씩 → 36 샘플)
    const now = new Date('2026-04-15T00:00:00Z').getTime();
    const startTs = now - 540 * day; // 18개월 전
    for (let d = 0; d <= 540; d += 15) {
      await appendHistorySample(productFixture.id, {
        ts: startTs + d * day,
        price: 35000 + (d % 60) * 100,
        status: 'ok',
      });
    }

    // 5. stats 재계산 → 30일 안 통계 + allTimeLow
    const stats = await recomputeAndStoreStats(productFixture.id, now);
    expect(stats.allTimeLow).not.toBeNull();
    expect(stats.samplesIn30d).toBeGreaterThan(0);

    // 6. retention prune (365일)
    const removed = await pruneHistory(productFixture.id, 365, now);
    expect(removed).toBeGreaterThan(0);
    const remaining = await listHistoryChunkKeys(productFixture.id);
    // 가장 오래된 청크는 사라졌어야 함
    expect(remaining.some((k) => k.includes('2024-10'))).toBe(false);
    // 최신 청크는 남아있음
    expect(remaining.some((k) => k.includes('2026-04'))).toBe(true);

    // 7. 상품 삭제 → 모든 history 청크도 같이 사라짐
    await deleteProduct(productFixture.id);
    expect(await getProduct(productFixture.id)).toBeNull();
    expect(await listHistoryChunkKeys(productFixture.id)).toEqual([]);
  });

  it('마이그레이션 실패 시 기존 데이터 보존 (실 케이스 시뮬레이션)', async () => {
    // 알 수 없는 미래 버전이 storage에 박혀있으면 마이그레이션 실패해야 함
    await chrome.storage.local.set({
      schemaVersion: 999,
      products: { '3674341': productFixture },
    });

    const mig = await runMigrationsWithFallback();
    expect(mig.status).toBe('failure');

    // 기존 데이터는 보존
    const stored = await getProduct('3674341');
    expect(stored?.id).toBe('3674341');
  });
});
```

- [ ] **Step 9.2: 테스트 통과 확인**

Run:
```bash
pnpm test src/shared/storage.integration.test.ts
```

Expected: PASS — 2 tests.

- [ ] **Step 9.3: 전체 테스트 통과 확인**

Run:
```bash
pnpm test
```

Expected:
- price: 15 tests passing
- buyability: 9 tests passing
- storage: 13 tests passing (units 11 + integration 2)
- migrations: 6 tests passing
- 총 ~43 tests passing, 0 failing

- [ ] **Step 9.4: typecheck 통과 확인**

Run:
```bash
pnpm typecheck
```

Expected: 0 errors.

- [ ] **Step 9.5: Commit**

```bash
git add src/shared/storage.integration.test.ts
git commit -m "test: integration test for full storage lifecycle

Greenfield migration → product registration → 18 months of samples →
stats recomputation → 365-day prune → deletion. Also verifies that a
broken (future-version) schema preserves user data through the safe
fallback path.

Refs #3 #21"
```

---

## Verification Checklist (Phase 1A 완수 기준)

- [ ] `pnpm test` 모든 테스트 통과 (~43 tests)
- [ ] `pnpm typecheck` 에러 0
- [ ] `git log --oneline` 9~10개 commit (각 task별로 분리, conventional commits 형식)
- [ ] `gh issue view 3 --repo VictoryJu/musinsa-price-tracker` → 자동 close 확인
- [ ] `gh issue view 18 --repo VictoryJu/musinsa-price-tracker` → 자동 close 확인
- [ ] `gh issue view 21 --repo VictoryJu/musinsa-price-tracker` → 자동 close 확인
- [ ] `src/shared/` 안 export 검증:
  - `types.ts`: Product, HistorySample, Stats, Settings, DEFAULT_SETTINGS, CURRENT_SCHEMA_VERSION
  - `price.ts`: formatPrice, parsePrice, computePercentile
  - `buyability.ts`: classifyBuyability, computeStats, BuyabilityClass
  - `storage.ts`: initializeStorage, getProduct/setProduct/deleteProduct/getAllProducts, getHistoryChunk/appendHistorySample/getProductHistory, recomputeAndStoreStats, pruneHistory, listHistoryChunkKeys, getYearMonth, getSettings
  - `migrations/index.ts`: runMigrations, runMigrationsWithFallback, getStoredSchemaVersion
- [ ] CLAUDE.md의 코드 컨벤션 준수 (Background-only writes 주석으로 명시)
- [ ] 모든 commit이 GitHub main에 push됨

## Phase 1A가 끝나면 풀린 의존성

| 후속 issue | 풀린 이유 |
|---|---|
| #1 (scheduler) | Product에 `nextCheckAt`, `lastCheckedAt` 필드 정의됨 + storage adapter 사용 가능 |
| #2 (architecture boundaries) | storage write contract 주석으로 박힘 + 함수 시그니처 확립 |
| #4 (extraction) | currentSnapshot 타입 + status enum 사용 가능 |
| #5 (notification dedup) | lastNotified 타입 + product 레코드 위치 확정 |
| #6 (sale price only) | extractorPath, ExtractorPath enum 사용 가능 |
| #7 (out-of-order merge) | appendHistorySample이 이미 ts-ordered insert 처리 |
| #8 (sold-out) | SampleStatus enum + price: null 표현 가능 |
| #12 (percentile buyability) | 이미 buyability.ts에 구현됨 |
| #13 (failure status) | currentSnapshot.status + errorMessage 정의됨 |
| #20 (URL canonical) | canonicalUrl 필드 위치 확정 |

---

## Self-Review

(plan 작성 후 spec 대비 점검 결과)

- ✅ Issue #3 — products + history split, 365일 prune, precomputed stats 모두 task로 다룸
- ✅ Issue #18 — formatPrice/parsePrice/computePercentile + classifyBuyability/computeStats 모두 정의
- ✅ Issue #21 — schemaVersion + migration registry + safe fallback 모두 정의
- ✅ Type consistency — Product의 stats 필드는 Task 1에서 정의된 Stats 타입 그대로 사용
- ✅ No placeholders — 모든 step에 실제 코드/명령어/expected 결과 명시
- ✅ TDD — Task 2~9 모두 테스트 먼저 / 실패 / 구현 / 통과 / commit 순서

## Execution Handoff

**plan complete and saved to `docs/superpowers/plans/2026-04-28-phase-1a-storage-foundation.md`.**

다음 단계 두 옵션:

**1. Subagent-Driven (recommended)** — task별로 fresh subagent dispatch, 사이사이 검토. 빠른 iteration. `superpowers:subagent-driven-development`

**2. Inline Execution** — 이 세션 안에서 task batch 실행, checkpoint마다 검토. `superpowers:executing-plans`

**Auto mode + greenfield 코드 0줄 + plan TDD 단단함 — Inline Execution이 더 효율적이라고 봄.** Subagent는 기존 코드베이스가 있을 때 더 강력. 이번엔 한 세션에서 끝내는 게 나음.
