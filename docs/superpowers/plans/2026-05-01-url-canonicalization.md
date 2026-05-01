# Issue #20: URL Canonicalization

## Goal

Normalize product URLs during registration so the same product cannot be tracked twice through query parameters or redirect aliases.

## Tasks

### Task 1: Canonical URL helper

1. Add RED tests for a shared URL helper:
   - Strips tracking query params.
   - Preserves only explicitly whitelisted params.
   - Normalizes to origin + pathname.
2. Implement helper in `src/shared/url.ts`.
3. Verify:
   - `pnpm test src/shared/url.test.ts`
   - `pnpm typecheck`
4. Commit.

### Task 2: Registration canonicalization

1. Add RED background message tests:
   - `TRACK_START` resolves final URL once via injected resolver.
   - Registering the same product id twice through different URLs leaves one product entry.
2. Use the helper when creating the product record.
3. Wire production background to resolve redirects once and fall back to the stripped URL.
4. Verify:
   - `pnpm test src/background/messages.test.ts src/background/index.test.ts src/shared/url.test.ts`
   - `pnpm typecheck`
5. Commit.

### Task 3: Close issue

1. Run:
   - `pnpm test`
   - `pnpm typecheck`
   - `pnpm build`
2. Commit an issue-close marker with `Closes #20`.
3. Push `main`.
4. Confirm GitHub issue state is closed.
