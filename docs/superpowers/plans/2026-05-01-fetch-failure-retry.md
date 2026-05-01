# Fetch Failure Retry Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close issue #13 by making fetch/extraction failures explicit, classified, visible to presentation, and retried once after 5 minutes.

**Architecture:** Add optional `errorClass` to `CurrentSnapshot`, classify failures in `src/background/pipeline.ts`, and schedule a 5-minute retry only when the previous snapshot was not already failed. Keep persistent failures visible through existing snapshot status and presentation helper.

**Tech Stack:** TypeScript 5.x, Vitest + jsdom, existing scheduler/pipeline/storage modules.

---

## Task 1: Failure Classification

**Files:**
- Modify: `src/shared/types.ts`
- Modify: `src/background/pipeline.test.ts`
- Modify: `src/background/pipeline.ts`
- Modify: `src/shared/extraction.ts`
- Modify: `src/shared/extraction.test.ts`

- [ ] **Step 1.1: Write failing tests**

Add tests for error classes:
- network error from thrown `TypeError`.
- 4xx error from message containing HTTP 404.
- 5xx error from message containing HTTP 503.
- blocked error from message containing blocked.
- parse error from extraction failure.

- [ ] **Step 1.2: Implement minimal classification**

Add:

```ts
export type SnapshotErrorClass = 'network' | 'http4xx' | 'http5xx' | 'parse' | 'blocked' | 'unknown';
```

Add optional `errorClass?: SnapshotErrorClass` to `CurrentSnapshot`.

- [ ] **Step 1.3: Run GREEN**

```bash
pnpm test src/background/pipeline.test.ts src/shared/extraction.test.ts
pnpm typecheck
```

- [ ] **Step 1.4: Commit**

```bash
git add src/shared/types.ts src/background/pipeline.ts src/background/pipeline.test.ts src/shared/extraction.ts src/shared/extraction.test.ts
git commit -m "feat(background): classify price check failures"
```

## Task 2: Single 5-Minute Retry

**Files:**
- Modify: `src/background/pipeline.test.ts`
- Modify: `src/background/pipeline.ts`

- [ ] **Step 2.1: Write failing retry tests**

Add tests:
- first failure after an ok snapshot sets `nextCheckAt = now + 5 minutes`.
- persistent failure after an already failed snapshot uses the regular interval schedule.

- [ ] **Step 2.2: Implement retry scheduling**

If new snapshot status is `failed` and previous `product.currentSnapshot.status !== 'failed'`, use retry delay. Otherwise use `computeNextCheckAt`.

- [ ] **Step 2.3: Run GREEN**

```bash
pnpm test src/background/pipeline.test.ts
pnpm typecheck
```

- [ ] **Step 2.4: Commit**

```bash
git add src/background/pipeline.ts src/background/pipeline.test.ts
git commit -m "feat(background): retry failed checks once"
```

## Task 3: Presentation Failure Surface

**Files:**
- Modify: `src/shared/presentation.test.ts`
- Modify: `src/shared/presentation.ts`

- [ ] **Step 3.1: Write failing UI helper test**

Add a test that a failed snapshot with `errorClass: 'blocked'` returns a failure label including the error class.

- [ ] **Step 3.2: Implement helper behavior**

Keep labels short and deterministic:
- soldOut: `품절`
- failed + class: `가격 확인 실패: blocked`
- failed no class: `가격 확인 실패`

- [ ] **Step 3.3: Run GREEN**

```bash
pnpm test src/shared/presentation.test.ts
pnpm typecheck
```

- [ ] **Step 3.4: Commit**

```bash
git add src/shared/presentation.ts src/shared/presentation.test.ts
git commit -m "feat(shared): surface failure class in labels"
```

## Task 4: Verification And Close

- [ ] **Step 4.1: Run full verification**

```bash
pnpm test
pnpm typecheck
```

- [ ] **Step 4.2: Close issue #13**

```bash
git commit --allow-empty -m "chore: close fetch failure retry issue" -m "Closes #13"
git push origin main
gh issue view 13 --repo VictoryJu/musinsa-price-tracker --json number,state,title,closedAt
```

## Self-Review

- Spec coverage: persisted failed snapshot, retry once after 5 minutes, persistent failure visible, network/4xx/5xx/parse/blocked classes, UI helper test.
- Placeholder scan: no placeholders.
- Type consistency: `errorClass` is optional, so existing snapshots remain valid.
