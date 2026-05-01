# Issue #22: Popup Data Import / Export / Reset

## Goal

Add popup settings controls to export all `chrome.storage.local` data, import a validated JSON backup, and reset storage after confirmation.

## Tasks

### Task 1: Data recovery helpers and UI

1. Add RED popup tests:
   - Settings section renders export/import/reset actions.
   - Export returns full storage JSON.
   - Round-trip export -> reset -> import preserves products and history.
   - Import rejects invalid JSON/schema.
2. Implement helpers in `src/popup/index.ts`:
   - `exportStorageSnapshot`
   - `importStorageSnapshot`
   - `resetStorage`
3. Wire popup controls.
4. Verify:
   - `pnpm test src/popup/index.test.ts`
   - `pnpm typecheck`
5. Commit.

### Task 2: Close issue

1. Run:
   - `pnpm test`
   - `pnpm typecheck`
   - `pnpm build`
2. Commit an issue-close marker with `Closes #22`.
3. Push `main`.
4. Confirm GitHub issue state is closed.
