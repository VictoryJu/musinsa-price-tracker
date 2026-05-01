# Lightweight Untracked Render Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close issue #9 by rendering only a minimal tracking CTA for untracked product pages and reserving heavier label/hover UI for tracked products.

**Architecture:** Split content UI into testable pure DOM helpers in `src/content/render.ts`. `src/content/index.ts` remains a thin page bootstrap that reads product state, sends visit intent, and calls the renderer.

**Tech Stack:** TypeScript 5.x, Vitest + jsdom, Chrome storage mock.

---

## Task 1: Content Render Helper

**Files:**
- Create: `src/content/render.test.ts`
- Create: `src/content/render.ts`

- [ ] **Step 1.1: Write failing render tests**

Add tests:
- untracked product renders one `button` with label `추적 시작`, no shadow root, and no hover handler marker.
- tracked product renders a host with shadow root, price label, and hover handler marker.
- render duration for tracked path is below 50ms in jsdom.

Run:

```bash
pnpm test src/content/render.test.ts
```

Expected: FAIL because `src/content/render.ts` does not exist.

- [ ] **Step 1.2: Implement render helper**

Export:

```ts
export interface RenderProductUiOptions {
  root: Document;
  productId: string;
  product: Product | null;
  onTrackStart: () => void;
}

export function renderProductUi(options: RenderProductUiOptions): { mode: 'cta' | 'tracked'; durationMs: number };
```

- [ ] **Step 1.3: Run GREEN**

```bash
pnpm test src/content/render.test.ts
pnpm typecheck
```

- [ ] **Step 1.4: Commit**

```bash
git add src/content/render.ts src/content/render.test.ts
git commit -m "feat(content): render lightweight tracking CTA"
```

## Task 2: Wire Content Entrypoint

**Files:**
- Modify: `src/content/index.ts`
- Create: `src/content/index.test.ts`

- [ ] **Step 2.1: Write failing bootstrap tests**

Add tests:
- product page reads `chrome.storage.local.get('products')`.
- untracked product sends `LOG_VISIT` and renders CTA.
- clicking CTA sends `TRACK_START`.
- non-product page does nothing.

Run:

```bash
pnpm test src/content/index.test.ts
```

Expected: FAIL because `src/content/index.ts` is not testable/exported yet.

- [ ] **Step 2.2: Refactor index to export bootstrap**

Export `bootstrapContentPage(document, location)` and keep auto-run guarded for real extension load.

- [ ] **Step 2.3: Run GREEN**

```bash
pnpm test src/content/index.test.ts
pnpm typecheck
```

- [ ] **Step 2.4: Commit**

```bash
git add src/content/index.ts src/content/index.test.ts
git commit -m "feat(content): bootstrap product tracking CTA"
```

## Task 3: Verification And Close

- [ ] **Step 3.1: Run full verification**

```bash
pnpm test
pnpm typecheck
```

- [ ] **Step 3.2: Close issue #9**

```bash
git commit --allow-empty -m "chore: close lightweight render issue" -m "Closes #9"
git push origin main
gh issue view 9 --repo VictoryJu/musinsa-price-tracker --json number,state,title,closedAt
```

## Self-Review

- Spec coverage: storage read, CTA-only untracked path, tracked full label path, hover handler marker, <50ms unit render guard.
- Placeholder scan: no placeholders.
- Type consistency: uses existing `Product` type and runtime messages.
