# Issue #23: Hidden Popup Debug Surface

## Goal

Add a hidden popup debug panel for Day-2 support: per-product extractor/error/check metadata, aggregate health counts, and copy-to-clipboard issue report output.

## Tasks

### Task 1: Debug panel

1. Add RED popup tests:
   - Settings contains a `Debug` action that reveals a hidden debug panel.
   - Per product shows `extractorPath`, `lastError`, `lastCheckedAt`, and `samplesIn30d`.
   - Aggregate shows total products, failed products, and blocked fetches in the last 7 days.
   - Copy button writes a JSON report to clipboard.
2. Implement in `src/popup/index.ts`.
3. Verify:
   - `pnpm test src/popup/index.test.ts`
   - `pnpm typecheck`
4. Commit.

### Task 2: Close issue

1. Run:
   - `pnpm test`
   - `pnpm typecheck`
   - `pnpm build`
2. Commit an issue-close marker with `Closes #23`.
3. Push `main`.
4. Confirm GitHub issue state is closed.
