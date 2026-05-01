# Sold-Out State Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close issue #8 by treating sold-out/discontinued as a first-class product state across extraction, history, chart data, and label display.

**Architecture:** Keep status detection in `src/shared/extraction.ts`, store sold-out samples through the existing pipeline, and add a small `src/shared/presentation.ts` helper for UI-ready label text and chart points. This avoids building full UI before Lane B while still locking the behavior contract with tests.

**Tech Stack:** TypeScript 5.x, Vitest + jsdom, existing `CurrentSnapshot` and `HistorySample` types.

---

## Task 1: Sold-Out From JSON-LD And Internal API

**Files:**
- Modify: `src/shared/extraction.test.ts`
- Modify: `src/shared/extraction.ts`

- [ ] **Step 1.1: Write failing extraction tests**

Add tests for:
- JSON-LD `offers.availability` containing `OutOfStock` returns `{ status: 'soldOut', price: null }`.
- Internal API fallback object containing `{ soldOut: true }` returns `{ status: 'soldOut', price: null }`.

Run:

```bash
pnpm test src/shared/extraction.test.ts
```

Expected: FAIL because only visible text sold-out markers are currently handled.

- [ ] **Step 1.2: Implement minimal detection**

Add sold-out detection for parsed JSON-LD and API responses before price extraction succeeds.

- [ ] **Step 1.3: Run GREEN**

```bash
pnpm test src/shared/extraction.test.ts
pnpm typecheck
```

- [ ] **Step 1.4: Commit**

```bash
git add src/shared/extraction.ts src/shared/extraction.test.ts
git commit -m "feat(extraction): detect structured sold-out state"
```

## Task 2: Restock Transition In Pipeline

**Files:**
- Modify: `src/background/pipeline.test.ts`
- Modify: `src/background/pipeline.ts` only if needed

- [ ] **Step 2.1: Write failing/passing restock test**

Add a pipeline test that starts with `currentSnapshot.status: 'soldOut'`, then fetches an ok price and verifies:
- product current snapshot becomes `ok`.
- history contains both sold-out and ok samples in timestamp order.
- stats recompute ignores the sold-out sample and uses the ok price.

Run:

```bash
pnpm test src/background/pipeline.test.ts
```

Expected: This may already PASS. If it passes immediately, commit it as coverage because it proves existing behavior.

- [ ] **Step 2.2: Implement only if RED**

If the test fails, update pipeline/storage minimally so restock transitions persist correctly.

- [ ] **Step 2.3: Run GREEN**

```bash
pnpm test src/background/pipeline.test.ts
pnpm typecheck
```

- [ ] **Step 2.4: Commit**

```bash
git add src/background/pipeline.ts src/background/pipeline.test.ts
git commit -m "test(background): cover sold-out restock transition"
```

## Task 3: Presentation Contract For Sold-Out Label And Chart Breaks

**Files:**
- Create: `src/shared/presentation.test.ts`
- Create: `src/shared/presentation.ts`

- [ ] **Step 3.1: Write failing presentation tests**

Add tests for:
- `formatSnapshotLabel({ status: 'soldOut', price: null })` returns `품절`.
- `historyToChartPoints` converts sold-out and failed samples to `{ y: null }` so line charts break instead of interpolating through zero.

Run:

```bash
pnpm test src/shared/presentation.test.ts
```

Expected: FAIL because presentation module does not exist.

- [ ] **Step 3.2: Implement helper**

Export:

```ts
export function formatSnapshotLabel(snapshot: CurrentSnapshot): string;
export function historyToChartPoints(samples: HistorySample[]): Array<{ x: number; y: number | null; status: HistorySample['status'] }>;
```

- [ ] **Step 3.3: Run GREEN**

```bash
pnpm test src/shared/presentation.test.ts
pnpm typecheck
```

- [ ] **Step 3.4: Commit**

```bash
git add src/shared/presentation.ts src/shared/presentation.test.ts
git commit -m "feat(shared): format sold-out presentation state"
```

## Task 4: Verification And Close

- [ ] **Step 4.1: Run full verification**

```bash
pnpm test
pnpm typecheck
```

- [ ] **Step 4.2: Close issue #8**

```bash
git commit --allow-empty -m "chore: close sold-out state issue" -m "Closes #8"
git push origin main
gh issue view 8 --repo VictoryJu/musinsa-price-tracker --json number,state,title,closedAt
```

## Self-Review

- Spec coverage: DOM sold-out already exists, JSON-LD/API added, persistence covered by pipeline, chart break and label covered by presentation helper.
- Placeholder scan: no placeholders.
- Type consistency: uses existing `SampleStatus`, `CurrentSnapshot`, and `HistorySample`.
