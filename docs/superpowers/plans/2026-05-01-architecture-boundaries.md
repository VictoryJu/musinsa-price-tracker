# Architecture Boundaries Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close issue #2 by enforcing render-and-intent boundaries for content/popup code and routing all writes through background-owned typed messages.

**Architecture:** Add a shared runtime message contract in `src/shared/messages.ts`, then add a background message handler that translates intents into existing storage/pipeline operations. Add a static boundary test that fails if content or popup code calls `chrome.storage.local.set`, while allowing shared/background storage adapters to keep writing.

**Tech Stack:** TypeScript 5.x, Chrome Manifest V3 runtime messaging, Vitest + jsdom, Node `fs` for static boundary tests.

---

## What Already Exists

- `src/shared/storage.ts` owns all current `chrome.storage.local.set` writes.
- `src/background/pipeline.ts` performs fetch, extraction, storage, stats, pruning, and notification work.
- `src/background/scheduler.ts` wires alarms/startup to the background pipeline.
- `src/manifest.json` already references `src/content/index.ts` and `src/popup/index.html`, but those files are not implemented yet.

## Not In Scope

- Full content Shadow DOM UI.
- Full popup UI.
- Manual refresh UI button behavior.
- Product canonicalization beyond accepting a supplied canonical URL.

## Task 1: Typed Runtime Message Contract

**Files:**
- Create: `src/shared/messages.ts`
- Create: `src/shared/messages.test.ts`

- [ ] **Step 1.1: Write failing message tests**

Add tests that validate message constructors for:
- `TRACK_START`
- `TRACK_STOP`
- `REFRESH_NOW`
- `LOG_VISIT`

Expected API:

```ts
import {
  createLogVisitMessage,
  createRefreshNowMessage,
  createTrackStartMessage,
  createTrackStopMessage,
  isRuntimeMessage,
} from './messages';
```

Run:

```bash
pnpm test src/shared/messages.test.ts
```

Expected: FAIL because `src/shared/messages.ts` does not exist.

- [ ] **Step 1.2: Implement minimal message contract**

Create:

```ts
export type RuntimeMessage =
  | TrackStartMessage
  | TrackStopMessage
  | RefreshNowMessage
  | LogVisitMessage;
```

Each message has a `type` discriminant and a `payload` object. `TRACK_START` carries a product summary, `TRACK_STOP` and `REFRESH_NOW` carry `productId`, and `LOG_VISIT` carries a product summary plus `visitedAt`.

- [ ] **Step 1.3: Run GREEN**

```bash
pnpm test src/shared/messages.test.ts
pnpm typecheck
```

- [ ] **Step 1.4: Commit**

```bash
git add src/shared/messages.ts src/shared/messages.test.ts
git commit -m "feat(shared): add typed runtime messages"
```

## Task 2: Background Message Handler

**Files:**
- Create: `src/background/messages.ts`
- Create: `src/background/messages.test.ts`
- Modify: `src/background/index.ts`

- [ ] **Step 2.1: Write failing handler tests**

Add tests for:
- `TRACK_START` creates a product through the storage adapter.
- `TRACK_STOP` deletes a product through the storage adapter.
- `REFRESH_NOW` calls the injected checker.
- Invalid messages return `{ ok: false, error: 'Invalid message' }`.

Run:

```bash
pnpm test src/background/messages.test.ts
```

Expected: FAIL because `src/background/messages.ts` does not exist.

- [ ] **Step 2.2: Implement minimal handler**

Export:

```ts
export interface BackgroundMessageHandlerOptions {
  now?: () => number;
  checkProduct?: (productId: string) => Promise<void>;
}

export function registerBackgroundMessageHandler(options?: BackgroundMessageHandlerOptions): void;
export async function handleRuntimeMessage(message: unknown, options?: BackgroundMessageHandlerOptions): Promise<RuntimeMessageResponse>;
```

Rules:
- Use `setProduct`, `deleteProduct`, and `processProductCheck` from background/shared modules.
- Never expose direct storage writes to content or popup.
- For `TRACK_START`, create a product with empty stats and scheduling fields initialized.
- For `REFRESH_NOW`, call injected `checkProduct` in tests, or `processProductCheck` in production when available through the injected path.

- [ ] **Step 2.3: Wire background index**

`src/background/index.ts` should call `registerBackgroundMessageHandler` once next to scheduler registration.

- [ ] **Step 2.4: Run GREEN**

```bash
pnpm test src/background/messages.test.ts
pnpm typecheck
```

- [ ] **Step 2.5: Commit**

```bash
git add src/background/messages.ts src/background/messages.test.ts src/background/index.ts
git commit -m "feat(background): route typed runtime messages"
```

## Task 3: Content/Popup Storage Boundary Guard

**Files:**
- Create: `src/architecture-boundaries.test.ts`

- [ ] **Step 3.1: Write failing boundary test**

Add a static test that scans `src/content/**/*.ts`, `src/popup/**/*.ts`, and `src/shared/**/*.ts`.

Rules:
- `src/content/index.ts` must exist.
- `src/popup/index.ts` must exist.
- `src/content` and `src/popup` must not contain `chrome.storage.local.set`.
- `src/shared/storage.ts` may contain `chrome.storage.local.set`.
- `src/shared/messages.ts` must not contain `chrome.storage.local.set`.

Run:

```bash
pnpm test src/architecture-boundaries.test.ts
```

Expected: FAIL because `src/content/index.ts` and `src/popup/index.ts` do not exist yet.

- [ ] **Step 3.2: Add minimal content intent sender**

Create `src/content/index.ts` that reads the current page URL/title, extracts a product id from `/products/<id>`, and sends `LOG_VISIT`. It must not write storage.

- [ ] **Step 3.3: Add minimal popup placeholder**

Create `src/popup/index.html` and `src/popup/index.ts` with a read-only placeholder that sends no storage writes. Full popup behavior stays in later issues.

- [ ] **Step 3.4: Run GREEN**

```bash
pnpm test src/architecture-boundaries.test.ts
pnpm typecheck
```

- [ ] **Step 3.5: Commit**

```bash
git add src/architecture-boundaries.test.ts src/content/index.ts src/popup/index.html src/popup/index.ts
git commit -m "test: guard extension storage boundaries"
```

## Task 4: Verification And Close

- [ ] **Step 4.1: Run full verification**

```bash
pnpm test
pnpm typecheck
```

- [ ] **Step 4.2: Close issue #2**

```bash
git commit --allow-empty -m "chore: close architecture boundary issue" -m "Closes #2"
git push origin main
gh issue view 2 --repo VictoryJu/musinsa-price-tracker --json number,state,title,closedAt
```

## Self-Review

- Spec coverage: Covers typed messages, background-owned writes, content/popup no-write guard, and minimal content/popup entrypoints.
- Placeholder scan: No TBD/TODO placeholders.
- Type consistency: Uses existing `Product`, `CurrentSnapshot`, `Stats`, and storage adapter names.
