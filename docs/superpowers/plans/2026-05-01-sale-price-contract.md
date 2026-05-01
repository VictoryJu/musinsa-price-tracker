# Sale Price Contract Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close issue #6 by making the extractor contract explicitly track representative sale price and ignore member/coupon/app-only prices.

**Architecture:** Keep the rule in `src/shared/extraction.ts` so all callers receive the same `CurrentSnapshot`. Add an optional `variantNotice` to `CurrentSnapshot` for variant-priced pages while still returning a representative sale price.

**Tech Stack:** TypeScript 5.x, Vitest + jsdom, existing price parser.

---

## Task 1: Sale Price Beats Visible List Price

**Files:**
- Modify: `src/shared/extraction.test.ts`
- Modify: `src/shared/extraction.ts`

- [ ] **Step 1.1: Write failing test**

Add a test where JSON-LD exposes list price `49900`, both list and sale prices are visible, and CSS exposes sale price `37700`. Expected extractor result is `37700` with `extractorPath: 'css-selector'`.

Run:

```bash
pnpm test src/shared/extraction.test.ts
```

Expected: FAIL because JSON-LD list price is currently accepted when the list price is visible.

- [ ] **Step 1.2: Implement minimal rule**

Before accepting JSON-LD, detect a visible sale price candidate. If sale price exists and differs from JSON-LD, prefer sale price.

- [ ] **Step 1.3: Run GREEN**

```bash
pnpm test src/shared/extraction.test.ts
pnpm typecheck
```

- [ ] **Step 1.4: Commit**

```bash
git add src/shared/extraction.ts src/shared/extraction.test.ts
git commit -m "feat(extraction): prefer visible sale price"
```

## Task 2: Ignore Member/Coupon/App-Only Prices

**Files:**
- Modify: `src/shared/extraction.test.ts`
- Modify: `src/shared/extraction.ts`

- [ ] **Step 2.1: Write failing test**

Add a test with:
- visible regular price `49900`
- visible member price `35000`
- visible coupon/app price `33000`
- no sale price

Expected extractor result is `49900`, not member/coupon/app-only.

- [ ] **Step 2.2: Implement ignore filter**

When scanning generic price candidates, reject candidates whose own attributes/classes/text or close ancestor text contains `member`, `coupon`, `app`, `회원`, `쿠폰`, or `앱`.

- [ ] **Step 2.3: Run GREEN**

```bash
pnpm test src/shared/extraction.test.ts
pnpm typecheck
```

- [ ] **Step 2.4: Commit**

```bash
git add src/shared/extraction.ts src/shared/extraction.test.ts
git commit -m "feat(extraction): ignore conditional prices"
```

## Task 3: Variant Price Notice

**Files:**
- Modify: `src/shared/types.ts`
- Modify: `src/shared/extraction.test.ts`
- Modify: `src/shared/extraction.ts`

- [ ] **Step 3.1: Write failing test**

Add a test with two visible sale prices for different options. Expected:
- representative price is the lowest visible sale price.
- snapshot includes `variantNotice: 'Variant prices detected'`.

- [ ] **Step 3.2: Implement variant notice**

Add optional `variantNotice?: string` to `CurrentSnapshot`. Detect multiple distinct sale price candidates and include the notice on `ok` snapshots.

- [ ] **Step 3.3: Run GREEN**

```bash
pnpm test src/shared/extraction.test.ts
pnpm typecheck
```

- [ ] **Step 3.4: Commit**

```bash
git add src/shared/types.ts src/shared/extraction.ts src/shared/extraction.test.ts
git commit -m "feat(extraction): flag variant sale prices"
```

## Task 4: Verification And Close

- [ ] **Step 4.1: Run full verification**

```bash
pnpm test
pnpm typecheck
```

- [ ] **Step 4.2: Close issue #6**

```bash
git commit --allow-empty -m "chore: close sale price contract issue" -m "Closes #6"
git push origin main
gh issue view 6 --repo VictoryJu/musinsa-price-tracker --json number,state,title,closedAt
```

## Self-Review

- Spec coverage: list+sale, sale only, sold-out existing test, member/coupon/app ignore, variant flag.
- Placeholder scan: no placeholders.
- Type consistency: `variantNotice` is optional so existing snapshots remain valid.
