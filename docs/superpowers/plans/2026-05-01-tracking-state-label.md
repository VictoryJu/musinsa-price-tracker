# Issue #16: Tracking State Visible on Page

## Goal

Make the on-page content label always communicate the product tracking state without requiring the popup.

## Context

- Issue: `#16 [P2] Tracking state visible on page (no popup needed)`
- Current untracked UI is a full text CTA.
- Current tracked UI displays only snapshot price/error status.
- Content bootstrap already preloads full storage, so settings can be passed to the renderer without extra reads.

## Tasks

### Task 1: State labels

1. Add RED render tests for all state transitions:
   - Untracked renders a minimal icon button with `aria-label="Track this product"`.
   - Soak period renders `추적 중 N일째 / D-X`.
   - Active analysis renders current price plus context stats.
   - Failed/blocked labels from #14 continue to win over soak/active labels.
2. Implement label selection in `src/content/render.ts`.
3. Verify:
   - `pnpm test src/content/render.test.ts`
   - `pnpm typecheck`
4. Commit.

### Task 2: Settings wiring

1. Add RED content bootstrap test:
   - `settings.soakPeriodDays` from storage controls the soak label.
2. Pass settings from storage to `renderProductUi`, defaulting to `DEFAULT_SETTINGS`.
3. Verify:
   - `pnpm test src/content/index.test.ts src/content/render.test.ts`
   - `pnpm typecheck`
4. Commit.

### Task 3: Close issue

1. Run:
   - `pnpm test`
   - `pnpm typecheck`
   - `pnpm build`
2. Commit an issue-close marker with `Closes #16`.
3. Push `main`.
4. Confirm GitHub issue state is closed.
