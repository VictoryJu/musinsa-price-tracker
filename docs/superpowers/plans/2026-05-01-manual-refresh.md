# Issue #15: Manual Refresh Button

## Goal

Add per-product `지금 체크` controls in the popup and inline page hover UI, send typed `REFRESH_NOW` messages, and wire the background handler to check exactly one product immediately.

## Context

- Issue: `#15 [P2] Manual refresh '지금 체크' button`
- `createRefreshNowMessage` and `handleRuntimeMessage` already exist.
- `src/background/index.ts` registers the message handler without a `checkProduct` implementation, so real refresh is not wired yet.
- Popup currently renders only a count.

## Tasks

### Task 1: Popup per-product refresh UI

1. Add RED popup tests:
   - Renders one card per tracked product with a `지금 체크` button.
   - Clicking the button sends `REFRESH_NOW`.
   - Button shows spinner/loading state while the runtime message is pending.
2. Implement popup rendering in `src/popup/index.ts` and minimal semantic markup in `src/popup/index.html`.
3. Verify:
   - `pnpm test src/popup/index.test.ts`
   - `pnpm typecheck`
4. Commit.

### Task 2: Inline hover refresh UI

1. Add RED content tests:
   - Tracked hover tooltip contains `지금 체크`.
   - Clicking it calls an injected refresh handler with the product id.
   - Button shows spinner/loading state while pending.
2. Add `onRefreshNow` to `renderProductUi`, and wire content bootstrap to send `createRefreshNowMessage`.
3. Verify:
   - `pnpm test src/content/render.test.ts src/content/index.test.ts`
   - `pnpm typecheck`
4. Commit.

### Task 3: Background real refresh wiring

1. Add RED background test:
   - `registerBackgroundServices` wires `REFRESH_NOW` to `processProductCheck(productId, { now: Date.now(), fetchHtml })`.
2. Extract a small registration function from `src/background/index.ts`.
3. Verify:
   - `pnpm test src/background/index.test.ts src/background/messages.test.ts`
   - `pnpm typecheck`
4. Commit.

### Task 4: Close issue

1. Run:
   - `pnpm test`
   - `pnpm typecheck`
   - `pnpm build`
2. Commit an issue-close marker with `Closes #15`.
3. Push `main`.
4. Confirm GitHub issue state is closed.
