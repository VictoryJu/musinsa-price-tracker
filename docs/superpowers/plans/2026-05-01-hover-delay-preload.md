# Hover Delay And Preload Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close issue #10 by delaying hover tooltip intent by 300ms and rendering tooltip/sparkline from page-session cached history.

**Architecture:** Extend `src/content/render.ts` with hover delay and cached history options. Update `src/content/index.ts` to preload product history from storage once on page load and pass it into the renderer.

**Tech Stack:** TypeScript 5.x, Vitest fake timers, jsdom.

---

## Task 1: Hover Delay From Cached History

**Files:**
- Modify: `src/content/render.test.ts`
- Modify: `src/content/render.ts`

- [ ] **Step 1.1: Write failing render tests**

Add tests:
- tooltip is not mounted before `hoverDelayMs`.
- tooltip mounts after `hoverDelayMs` using cached history.
- mouseleave before delay prevents tooltip mount.
- 10 quick hover passes do not mount sparkline.

- [ ] **Step 1.2: Implement render hover delay**

Add options:

```ts
hoverDelayMs?: number;
historySamples?: HistorySample[];
```

Use default 300ms. Tooltip should render from `historySamples` without storage access.

- [ ] **Step 1.3: Run GREEN**

```bash
pnpm test src/content/render.test.ts
pnpm typecheck
```

- [ ] **Step 1.4: Commit**

```bash
git add src/content/render.ts src/content/render.test.ts
git commit -m "feat(content): delay hover tooltip render"
```

## Task 2: Preload History On Page Load

**Files:**
- Modify: `src/content/index.test.ts`
- Modify: `src/content/index.ts`

- [ ] **Step 2.1: Write failing bootstrap test**

Add a test that storage contains product history chunks and `bootstrapContentPage` passes cached history into the renderer so hover tooltip can render without another storage call.

- [ ] **Step 2.2: Implement storage preload**

Read storage once with `chrome.storage.local.get(null)`, extract `products[productId]`, and collect keys that start with `${productId}:`.

- [ ] **Step 2.3: Run GREEN**

```bash
pnpm test src/content/index.test.ts src/content/render.test.ts
pnpm typecheck
```

- [ ] **Step 2.4: Commit**

```bash
git add src/content/index.ts src/content/index.test.ts
git commit -m "feat(content): preload product history"
```

## Task 3: Verification And Close

- [ ] **Step 3.1: Run full verification**

```bash
pnpm test
pnpm typecheck
```

- [ ] **Step 3.2: Close issue #10**

```bash
git commit --allow-empty -m "chore: close hover delay issue" -m "Closes #10"
git push origin main
gh issue view 10 --repo VictoryJu/musinsa-price-tracker --json number,state,title,closedAt
```

## Self-Review

- Spec coverage: 300ms configurable delay, preload/cache, instant cached tooltip render, leave cancels, 10 quick passes no mount.
- Placeholder scan: no placeholders.
- Type consistency: uses existing `HistorySample`.
