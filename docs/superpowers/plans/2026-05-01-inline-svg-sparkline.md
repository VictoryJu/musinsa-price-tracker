# Issue #11: Inline SVG Sparkline Tooltip

## Goal

Replace the hover tooltip sparkline placeholder with a small inline SVG renderer that uses cached history samples, and add guardrails proving the content script does not pull chart-library code into the default page path.

## Context

- Issue: `#11 [P2] uPlot only inside popover; inline SVG for sparkline tooltip`
- Current content UI has delayed hover tooltip mounting and cached history preload from `#10`.
- The repository does not currently depend on `uplot`, so the dynamic-import requirement is enforced as a no-static-uPlot guard unless a future popover feature adds the dependency.

## Tasks

### Task 1: Add inline sparkline SVG renderer

1. Add RED tests in `src/content/render.test.ts`:
   - Hover tooltip renders an `svg[data-sparkline]`, not a placeholder span.
   - SVG `polyline` points are derived from ok history samples in chronological order.
   - Sold-out/failed/null price samples are ignored for the micro sparkline.
2. Implement the smallest renderer in `src/content/render.ts`:
   - Create SVG with stable `viewBox`, width, height, and accessible label.
   - Render empty state when fewer than two ok samples exist.
   - Keep tooltip delayed and cache-only.
3. Verify:
   - `pnpm test src/content/render.test.ts`
   - `pnpm typecheck`
4. Commit.

### Task 2: Add chart-library and bundle-size guardrails

1. Add RED architecture/build tests:
   - No content source file statically imports `uplot`.
   - Production build content script gzip size is below 30KB.
2. Implement supporting test helper only if needed.
3. Verify:
   - `pnpm test src/architecture-boundaries.test.ts`
   - `pnpm build`
   - `pnpm test`
   - `pnpm typecheck`
4. Commit.

### Task 3: Close issue

1. Run full verification:
   - `pnpm test`
   - `pnpm typecheck`
   - `pnpm build`
2. Commit an issue-close marker with `Closes #11`.
3. Push `main`.
4. Confirm GitHub issue state is closed.
