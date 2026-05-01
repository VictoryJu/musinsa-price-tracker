# Percentile Buyability Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close issue #12 by proving buyability classification uses the 30-day percentile distribution across low-variance, high-variance, all-time-low, and insufficient-sample cases.

**Architecture:** `src/shared/buyability.ts` already uses `computePercentile` over the 30-day ok-sample window. Add acceptance-level tests without changing behavior unless the tests expose a gap.

**Tech Stack:** TypeScript 5.x, Vitest, existing `HistorySample` domain type.

---

## Task 1: Acceptance-Level Buyability Tests

**Files:**
- Modify: `src/shared/buyability.test.ts`
- Modify: `src/shared/buyability.ts` only if tests fail

- [ ] **Step 1.1: Write tests**

Add tests for:
- Low-variance product where a small absolute drop is still bottom percentile and classified `great`.
- High-variance product where a large absolute discount can still be mid-distribution.
- All-time-low edge clamps to `great`.
- Fewer than `minSamplesForAnalysis` returns `null`.

- [ ] **Step 1.2: Run tests**

```bash
pnpm test src/shared/buyability.test.ts
```

Expected: likely PASS because implementation is already percentile-based. If it fails, implement the smallest fix.

- [ ] **Step 1.3: Run typecheck**

```bash
pnpm typecheck
```

- [ ] **Step 1.4: Commit**

```bash
git add src/shared/buyability.test.ts src/shared/buyability.ts
git commit -m "test(shared): cover percentile buyability cases"
```

## Task 2: Verification And Close

- [ ] **Step 2.1: Run full verification**

```bash
pnpm test
pnpm typecheck
```

- [ ] **Step 2.2: Close issue #12**

```bash
git commit --allow-empty -m "chore: close percentile buyability issue" -m "Closes #12"
git push origin main
gh issue view 12 --repo VictoryJu/musinsa-price-tracker --json number,state,title,closedAt
```

## Self-Review

- Spec coverage: return classes, percentile implementation, 30-day window, insufficient samples, low/high variance, all-time-low edge.
- Placeholder scan: no placeholders.
- Type consistency: no API changes planned.
