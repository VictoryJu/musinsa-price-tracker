# Issue #24: DOM Health Check and Remote Kill Switch

## Goal

Add defensive extraction controls for DOM breakage: health counters, remote config refresh, internal API kill switch, and server-controlled selector overrides.

## Tasks

### Task 1: Remote config + selector controls

1. Add RED tests:
   - Remote config can disable `internal-api`.
   - Remote config selectors are used before default selectors.
2. Implement extraction options for disabled paths and selector overrides.
3. Verify:
   - `pnpm test src/shared/extraction.test.ts`
   - `pnpm typecheck`
4. Commit.

### Task 2: DOM health counters

1. Add RED tests:
   - Success/failure counters are tracked per `extractorPath`.
   - Warning is logged when fail rate exceeds threshold over N samples.
2. Implement `src/shared/dom-health.ts`.
3. Verify:
   - `pnpm test src/shared/dom-health.test.ts`
   - `pnpm typecheck`
4. Commit.

### Task 3: Daily remote config fetch

1. Add RED tests:
   - Fetches GitHub/raw JSON when stale.
   - Does not fetch again before 24h.
2. Implement `src/shared/remote-config.ts` with storage adapter calls.
3. Verify:
   - `pnpm test src/shared/remote-config.test.ts`
   - `pnpm typecheck`
4. Commit.

### Task 4: Close issue

1. Run:
   - `pnpm test`
   - `pnpm typecheck`
   - `pnpm build`
2. Commit an issue-close marker with `Closes #24`.
3. Push `main`.
4. Confirm GitHub issue state is closed.
