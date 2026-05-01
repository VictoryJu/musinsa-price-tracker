# Issue #14: Error UI and Staleness Badge

## Goal

Make failed extraction, fetch blocking, and stale data explicit in the content UI, and prevent failed fetches from silently recomputing stats.

## Context

- Issue: `#14 [P2] Error UI: extraction failed / fetch blocked / staleness >24h`
- Current UI displays only the snapshot label and does not expose staleness.
- `processProductCheck` currently appends failed history and recomputes stats after every failed fetch.

## Tasks

### Task 1: Error labels and visual states

1. Add RED tests:
   - Failed extraction renders `가격 추출 실패 ⚠️`.
   - Blocked fetch renders `fetch 차단됨`.
   - Failed/blocked states expose a distinct `data-state` and style marker.
2. Implement in presentation/render code with no background writes.
3. Verify:
   - `pnpm test src/shared/presentation.test.ts src/content/render.test.ts`
   - `pnpm typecheck`
4. Commit.

### Task 2: Staleness badge

1. Add RED render test:
   - When `now - product.lastCheckedAt > 24h`, render `마지막 업데이트: N시간 전`.
2. Pass `now` from content bootstrap and default to `Date.now()` for direct render use.
3. Verify:
   - `pnpm test src/content/render.test.ts src/content/index.test.ts`
   - `pnpm typecheck`
4. Commit.

### Task 3: No stats recompute on failed fetch

1. Add RED pipeline test:
   - Existing stats remain unchanged after a failed fetch.
2. Implement by skipping `recomputeAndStoreStats` when `snapshot.status === 'failed'`.
3. Verify:
   - `pnpm test src/background/pipeline.test.ts`
   - `pnpm typecheck`
4. Commit.

### Task 4: Close issue

1. Run:
   - `pnpm test`
   - `pnpm typecheck`
   - `pnpm build`
2. Commit an issue-close marker with `Closes #14`.
3. Push `main`.
4. Confirm GitHub issue state is closed.
