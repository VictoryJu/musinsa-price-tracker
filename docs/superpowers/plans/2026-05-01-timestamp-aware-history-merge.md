# Timestamp-Aware History Merge Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close issue #7 by making history writes sorted, duplicate-aware, and stale-sample safe.

**Architecture:** Keep the merge rule inside `src/shared/storage.ts` because the storage adapter already owns history chunks and can read the product's `lastCheckedAt`. Return a boolean from `appendHistorySample` so callers can tell whether a sample was persisted, while keeping existing callers source-compatible because ignored promise values still work.

**Tech Stack:** TypeScript 5.x, Vitest + jsdom, existing Chrome storage mock.

---

## Task 1: Timestamp-Aware History Upsert

**Files:**
- Modify: `src/shared/storage.test.ts`
- Modify: `src/shared/storage.ts`

- [ ] **Step 1.1: Write failing tests**

Add tests for:
- duplicate timestamp replaces the existing sample instead of appending another row.
- stale sample older than `lastCheckedAt - 24h` is rejected and returns `false`.
- stale tolerance can be overridden with `{ staleToleranceMs }`.

Run:

```bash
pnpm test src/shared/storage.test.ts
```

Expected: FAIL because `appendHistorySample` currently always appends and returns `void`.

- [ ] **Step 1.2: Implement minimal merge**

Change:

```ts
export async function appendHistorySample(
  productId: string,
  sample: HistorySample,
  options: { staleToleranceMs?: number } = {}
): Promise<boolean>
```

Rules:
- Default stale tolerance: 24h.
- If product exists and `sample.ts < product.lastCheckedAt - tolerance`, return `false`.
- Upsert by `ts`: remove any existing sample with the same `ts`, insert the new sample, sort ascending.
- Return `true` when persisted.

- [ ] **Step 1.3: Run GREEN**

```bash
pnpm test src/shared/storage.test.ts
pnpm typecheck
```

- [ ] **Step 1.4: Commit**

```bash
git add src/shared/storage.ts src/shared/storage.test.ts
git commit -m "feat(storage): merge history samples by timestamp"
```

## Task 2: Pipeline Does Not Notify On Rejected Stale Samples

**Files:**
- Modify: `src/background/pipeline.test.ts`
- Modify: `src/background/pipeline.ts`

- [ ] **Step 2.1: Write failing test**

Add a test that sets a product with `lastCheckedAt` newer than the incoming check timestamp by more than 24h, then runs `processProductCheck`. Assert:
- history did not persist the stale sample.
- notifier was not called.
- existing newer product snapshot was not overwritten.

Run:

```bash
pnpm test src/background/pipeline.test.ts
```

Expected: FAIL because pipeline currently overwrites product snapshot before stale rejection.

- [ ] **Step 2.2: Implement stale guard in pipeline**

Before writing the new current snapshot, load the product and skip the update when `snapshot.ts < product.lastCheckedAt - 24h`.

- [ ] **Step 2.3: Run GREEN**

```bash
pnpm test src/background/pipeline.test.ts
pnpm typecheck
```

- [ ] **Step 2.4: Commit**

```bash
git add src/background/pipeline.ts src/background/pipeline.test.ts
git commit -m "feat(background): ignore stale price checks"
```

## Task 3: Verification And Close

- [ ] **Step 3.1: Run full verification**

```bash
pnpm test
pnpm typecheck
```

- [ ] **Step 3.2: Close issue #7**

```bash
git commit --allow-empty -m "chore: close timestamp merge issue" -m "Closes #7"
git push origin main
gh issue view 7 --repo VictoryJu/musinsa-price-tracker --json number,state,title,closedAt
```

## Self-Review

- Spec coverage: sorted insert, stale rejection, default 24h tolerance, configurable override, no stale notification retrigger.
- Placeholder scan: no placeholders.
- Type consistency: keeps existing `HistorySample` and storage adapter shape.
