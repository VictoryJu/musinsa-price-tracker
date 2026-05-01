# Issue #19: Shadow DOM CSS Isolation

## Goal

Reset inherited page styles inside the Shadow DOM host so content labels render consistently across Musinsa product pages.

## Tasks

### Task 1: Host reset

1. Add RED render test asserting the Shadow DOM style includes:
   - `all: initial`
   - explicit `font-family`
   - explicit `color`
   - explicit `line-height`
   - explicit `font-size`
2. Update `createStatusStyle`.
3. Verify:
   - `pnpm test src/content/render.test.ts`
   - `pnpm typecheck`
4. Commit.

### Task 2: Close issue

1. Run:
   - `pnpm test`
   - `pnpm typecheck`
   - `pnpm build`
2. Commit an issue-close marker with `Closes #19`.
3. Push `main`.
4. Confirm GitHub issue state is closed.
