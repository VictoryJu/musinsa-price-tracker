# Background Scheduler Pipeline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the MV3 background scheduling pipeline that safely resumes from persisted product state and processes due products one at a time per alarm wake.

**Architecture:** Keep the scheduling and fetch/store pipeline testable without a live service worker by placing pure orchestration in `src/background/scheduler.ts` and `src/background/pipeline.ts`. `src/background/index.ts` only wires Chrome events to those functions. The pipeline uses existing Phase 1A storage helpers and Phase 1 extraction to update `currentSnapshot`, append history samples, recompute stats, prune retention, and reschedule via persisted `nextCheckAt`/`lastCheckedAt`.

**Tech Stack:** TypeScript 5.x, MV3 Chrome APIs, Vitest + jsdom, existing `src/shared/storage.ts`, `src/shared/extraction.ts`.

---

## gstack Plan-Eng Review

### Scope Challenge

Scope accepted with one reduction: notification dedup is NOT included here. It is issue #5 and needs a focused check-and-set design. This plan only prepares the pipeline point where notification logic will later plug in.

### What Already Exists

- `src/shared/types.ts`: already defines `Product.nextCheckAt`, `Product.lastCheckedAt`, `Product.currentSnapshot`, and `lastNotified`.
- `src/shared/storage.ts`: already provides `getAllProducts`, `getProduct`, `setProduct`, `appendHistorySample`, `recomputeAndStoreStats`, `pruneHistory`, and `getSettings`.
- `src/shared/extraction.ts`: already converts a DOM document into `CurrentSnapshot`.
- `tests/setup.ts`: already mocks `chrome.storage.local`; this plan extends it for `chrome.alarms`, `chrome.runtime`, and `chrome.notifications` only as needed.

### NOT in Scope

- Notification dedup and `chrome.notifications`, handled by issue #5.
- Content script message handling, except background event wiring placeholders.
- Popup UI and manual refresh UI.
- Real network mocking with browser APIs beyond injected `fetchHtml`.
- Full `pnpm build`, because content/popup entry files are still not implemented.

### Architecture Review

No blocking architecture issues if the implementation keeps these boundaries:
- `scheduler.ts` owns due-product selection and schedule math only.
- `pipeline.ts` owns fetch/extract/store for one product.
- `index.ts` owns Chrome event wiring only.
- Storage writes stay in background modules.

### Test Review

Required test diagram:

```
alarm wake
  -> runDueProductBatch(now)
    -> load settings/products from storage
    -> choose due product with smallest nextCheckAt
    -> process one product only
      -> fetchHtml(canonicalUrl)
      -> parse DOM
      -> extractProductPrice(document, now)
      -> set product currentSnapshot + lastCheckedAt + nextCheckAt
      -> append history sample
      -> recompute stats
      -> prune retention
```

Failure modes:

| Failure | Covered by this plan | Handling | User-visible later |
|---|---|---|---|
| Worker dies between alarms | yes | persisted `nextCheckAt` | stale UI later |
| Rapid double wake | yes | in-memory run lock for same worker + persisted reschedule | no duplicate fetch |
| Fetch fails | yes | failed `currentSnapshot`, reschedule | error label later |
| Product deleted before fetch completes | yes | missing product check before write | no write |
| Huge tracked list | yes | one product per alarm batch | slower catch-up but stable |

No critical silent gap in this plan. Notification duplicates remain out of scope and tracked by #5.

### Performance Review

The plan intentionally processes one product per alarm. That is slower than a loop, but avoids MV3 worker lifetime surprises and throttling. For a personal dogfood extension with 5-10 products, this is the right trade.

### Parallelization

Sequential implementation, no parallelization opportunity. Scheduler and pipeline share background modules and storage contract.

---

## File Structure

```
src/
  background/
    scheduler.ts          # due-product selection, schedule math, run lock, alarm setup
    scheduler.test.ts     # alarm/scheduling behavior
    pipeline.ts           # fetch/extract/store one product
    pipeline.test.ts      # successful and failed product processing
    index.ts              # MV3 service worker event wiring
tests/
  setup.ts                # extend chrome mock with alarms/runtime/notifications
```

---

## Task 1: Scheduler Math and Due Selection

**Files:**
- Create: `src/background/scheduler.test.ts`
- Create: `src/background/scheduler.ts`

- [ ] **Step 1.1: Write failing scheduler tests**

Test cases:
- `computeNextCheckAt(now, settings, jitterMs)` returns `now + fetchIntervalHours + jitter`.
- `pickDueProduct(products, now)` returns the due product with the earliest `nextCheckAt`.
- `pickDueProduct(products, now)` returns `null` when no product is due.

- [ ] **Step 1.2: Run RED**

```bash
pnpm test src/background/scheduler.test.ts
```

Expected: FAIL because `src/background/scheduler.ts` does not exist.

- [ ] **Step 1.3: Implement minimal scheduler math**

Create exported functions:

```ts
export function computeNextCheckAt(now: number, fetchIntervalHours: number, jitterMs: number): number;
export function pickDueProduct(products: Product[], now: number): Product | null;
```

- [ ] **Step 1.4: Run GREEN**

```bash
pnpm test src/background/scheduler.test.ts
```

Expected: PASS.

- [ ] **Step 1.5: Commit**

```bash
git add src/background/scheduler.ts src/background/scheduler.test.ts
git commit -m "feat(background): add persisted schedule selection"
```

---

## Task 2: Process One Product Pipeline

**Files:**
- Create: `src/background/pipeline.test.ts`
- Create: `src/background/pipeline.ts`

- [ ] **Step 2.1: Write failing successful-process test**

Test one product with injected `fetchHtml` returning HTML with visible JSON-LD price. Assert:
- product `currentSnapshot.status === 'ok'`
- product `lastCheckedAt === now`
- product `nextCheckAt > now`
- one history sample is appended
- stats are recomputed

- [ ] **Step 2.2: Run RED**

```bash
pnpm test src/background/pipeline.test.ts
```

Expected: FAIL because `processProductCheck` is not exported.

- [ ] **Step 2.3: Implement successful pipeline**

Create:

```ts
export interface ProcessProductCheckOptions {
  now: number;
  fetchHtml: (url: string) => Promise<string>;
  jitterMs?: number;
}

export async function processProductCheck(productId: string, options: ProcessProductCheckOptions): Promise<void>;
```

Use `getProduct`, `getSettings`, `extractProductPrice`, `setProduct`, `appendHistorySample`, `recomputeAndStoreStats`, `pruneHistory`.

- [ ] **Step 2.4: Run GREEN**

```bash
pnpm test src/background/pipeline.test.ts
```

Expected: PASS.

- [ ] **Step 2.5: Commit**

```bash
git add src/background/pipeline.ts src/background/pipeline.test.ts
git commit -m "feat(background): process one product price check"
```

---

## Task 3: Failed Fetch Handling

**Files:**
- Modify: `src/background/pipeline.test.ts`
- Modify: `src/background/pipeline.ts`

- [ ] **Step 3.1: Write failing failed-fetch test**

Test `fetchHtml` throwing. Assert:
- `currentSnapshot.status === 'failed'`
- `currentSnapshot.price === null`
- `currentSnapshot.errorMessage` includes the thrown message
- `lastCheckedAt` and `nextCheckAt` are still persisted
- no ok history price is appended

- [ ] **Step 3.2: Run RED**

```bash
pnpm test src/background/pipeline.test.ts
```

Expected: FAIL because fetch errors are not persisted.

- [ ] **Step 3.3: Implement failed snapshot path**

Catch fetch/extraction errors and write a failed snapshot with `extractorPath: 'unknown'`.

- [ ] **Step 3.4: Run GREEN**

```bash
pnpm test src/background/pipeline.test.ts
```

Expected: PASS.

- [ ] **Step 3.5: Commit**

```bash
git add src/background/pipeline.ts src/background/pipeline.test.ts
git commit -m "feat(background): persist failed price checks"
```

---

## Task 4: Alarm Batch Runner and Rapid Double Wake Guard

**Files:**
- Modify: `src/background/scheduler.test.ts`
- Modify: `src/background/scheduler.ts`

- [ ] **Step 4.1: Write failing batch tests**

Test cases:
- `runDueProductBatch` processes only one due product per call.
- Two simultaneous calls do not process the same product twice in the same worker instance.

- [ ] **Step 4.2: Run RED**

```bash
pnpm test src/background/scheduler.test.ts
```

Expected: FAIL because `runDueProductBatch` is missing.

- [ ] **Step 4.3: Implement batch runner**

Create:

```ts
export interface RunDueProductBatchOptions {
  now?: number;
  fetchHtml: (url: string) => Promise<string>;
}

export async function runDueProductBatch(options: RunDueProductBatchOptions): Promise<{ processedProductId: string | null }>;
```

Use a module-level boolean lock. Load products from storage on every call.

- [ ] **Step 4.4: Run GREEN**

```bash
pnpm test src/background/scheduler.test.ts
```

Expected: PASS.

- [ ] **Step 4.5: Commit**

```bash
git add src/background/scheduler.ts src/background/scheduler.test.ts
git commit -m "feat(background): run one due product per alarm"
```

---

## Task 5: MV3 Event Wiring and Test Mock Extension

**Files:**
- Create: `src/background/index.ts`
- Modify: `tests/setup.ts`
- Modify: `src/background/scheduler.test.ts`

- [ ] **Step 5.1: Write failing alarm setup test**

Assert `registerBackgroundScheduler()` creates a Chrome alarm and registers listeners for startup/installed/alarm.

- [ ] **Step 5.2: Run RED**

```bash
pnpm test src/background/scheduler.test.ts
```

Expected: FAIL because alarm mock/event wiring is not available.

- [ ] **Step 5.3: Extend chrome mock and implement wiring**

Add `chrome.alarms.create`, `chrome.alarms.onAlarm.addListener`, `chrome.runtime.onInstalled.addListener`, `chrome.runtime.onStartup.addListener` mocks. Implement `registerBackgroundScheduler`.

- [ ] **Step 5.4: Run GREEN**

```bash
pnpm test src/background/scheduler.test.ts
```

Expected: PASS.

- [ ] **Step 5.5: Commit**

```bash
git add src/background/index.ts src/background/scheduler.ts src/background/scheduler.test.ts tests/setup.ts
git commit -m "feat(background): wire MV3 scheduler events"
```

---

## Task 6: Integration Verification

**Files:**
- Modify: none unless tests reveal gaps.

- [ ] **Step 6.1: Run focused tests**

```bash
pnpm test src/background/scheduler.test.ts src/background/pipeline.test.ts
```

- [ ] **Step 6.2: Run full suite**

```bash
pnpm test
```

- [ ] **Step 6.3: Run typecheck**

```bash
pnpm typecheck
```

- [ ] **Step 6.4: Push**

```bash
git push origin main
```

---

## GSTACK REVIEW REPORT

| Review | Trigger | Why | Runs | Status | Findings |
|--------|---------|-----|------|--------|----------|
| Eng Review | `/plan-eng-review` | Architecture and tests | 1 | CLEAR | Scope reduced to scheduler/pipeline, notification dedup deferred, no critical gaps |
| CEO Review | `/plan-ceo-review` | Scope and strategy | 0 | n/a | Not needed for background infrastructure |
| Design Review | `/plan-design-review` | UI/UX gaps | 0 | n/a | No UI changes |
| Outside Voice | `codex review` | Independent plan review | 0 | n/a | Skipped, local gstack skill path only |

**VERDICT:** ENG CLEARED, ready to implement with TDD.
