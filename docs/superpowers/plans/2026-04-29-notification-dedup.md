# Notification Dedup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Persist and atomically update `lastNotified` before showing a new-low notification so duplicate worker/tab races do not spam the user.

**Architecture:** Put the storage check-and-set in `src/shared/storage.ts` because it must read and write the product record in one storage adapter operation. Put notification decision/rendering in `src/background/notifications.ts`, then call it from `processProductCheck` after stats recompute. The notification module accepts an injected notifier for tests and uses `chrome.notifications.create` in production.

**Tech Stack:** TypeScript 5.x, Vitest + jsdom, Chrome notifications API mock, existing `Product.lastNotified`, existing `Stats.allTimeLow`.

---

## gstack Plan-Eng Review

### Scope Challenge

Scope accepted as issue #5 only. This plan does not design UI copy beyond a basic notification title/body, and it does not introduce cross-device sync or backend dedup.

### What Already Exists

- `Product.lastNotified` exists in `src/shared/types.ts`.
- `recomputeAndStoreStats` updates `stats.allTimeLow`.
- `processProductCheck` is now the single background pipeline point after every fetch.
- `chrome.notifications.create` is already mocked in `tests/setup.ts`.

### NOT in Scope

- Notification permission UX.
- Popup notification settings UI beyond honoring existing `globalNotifications` and `notifyOnNewLow`.
- Backend/server push notifications.
- Localized copy polish.

### Failure Modes

| Failure | Test | Handling | User impact |
|---|---|---|---|
| Rapid double-fire sees same new low twice | yes | `markNewLowNotified` re-reads product and refuses same/lower token replay | no duplicate |
| Same low price later date | yes | token compares price, not timestamp only | no duplicate |
| Out-of-order stale cheaper sample | yes | notify only when sample ts is at least current snapshot ts and price is new all-time low | no stale alert |
| Product deleted before notification | yes | helper returns false | no notification |
| Global notifications disabled | yes | notification module exits before check-and-set | no notification |

Critical gaps: none for local single-profile storage. Cross-device duplication is out of scope.

### Parallelization

Sequential implementation, no parallelization opportunity. Storage helper and notification pipeline touch shared product record behavior.

---

## Task 1: Atomic Last-Notified Check-And-Set

**Files:**
- Modify: `src/shared/storage.ts`
- Modify: `src/shared/storage.test.ts`

- [ ] **Step 1.1: Write failing storage tests**

Add tests for:
- `markNewLowNotified(productId, price, ts)` sets `lastNotified` and returns `true`.
- Calling it again with the same price returns `false`.
- Calling it for a missing product returns `false`.

- [ ] **Step 1.2: Run RED**

```bash
pnpm test src/shared/storage.test.ts
```

Expected: FAIL because `markNewLowNotified` is not exported.

- [ ] **Step 1.3: Implement helper**

Export:

```ts
export async function markNewLowNotified(productId: string, price: number, ts: number): Promise<boolean>;
```

Rules:
- Re-read products map inside the helper.
- Return false if product missing.
- Return false if `lastNotified.price <= price`.
- Otherwise set `lastNotified = { price, ts }` and return true.

- [ ] **Step 1.4: Run GREEN**

```bash
pnpm test src/shared/storage.test.ts
```

- [ ] **Step 1.5: Commit**

```bash
git add src/shared/storage.ts src/shared/storage.test.ts
git commit -m "feat(storage): add notification check-and-set token"
```

---

## Task 2: Notification Decision Module

**Files:**
- Create: `src/background/notifications.ts`
- Create: `src/background/notifications.test.ts`

- [ ] **Step 2.1: Write failing notification tests**

Tests:
- Notifies when current ok snapshot equals a new all-time low.
- Does not notify when `notifyOnNewLow` is false.
- Does not notify when `globalNotifications` is false.
- Does not notify same low price later.
- Does not notify out-of-order stale sample.

- [ ] **Step 2.2: Run RED**

```bash
pnpm test src/background/notifications.test.ts
```

Expected: FAIL because module does not exist.

- [ ] **Step 2.3: Implement notification module**

Export:

```ts
export interface MaybeNotifyNewLowOptions {
  notify?: (notificationId: string, options: chrome.notifications.NotificationOptions) => Promise<void> | void;
}

export async function maybeNotifyNewLow(productId: string, options?: MaybeNotifyNewLowOptions): Promise<boolean>;
```

Rules:
- Load product and settings.
- Require `settings.globalNotifications && product.notifyOnNewLow`.
- Require `currentSnapshot.status === 'ok'` and non-null price.
- Require `stats.allTimeLow.price === currentSnapshot.price`.
- Require `stats.allTimeLow.ts === currentSnapshot.ts` or at least `stats.allTimeLow.ts >= product.lastCheckedAt` to avoid stale out-of-order alerts. Use exact equality for this plan.
- Call `markNewLowNotified` before notifying.
- If helper returns true, call notifier and return true.

- [ ] **Step 2.4: Run GREEN**

```bash
pnpm test src/background/notifications.test.ts
```

- [ ] **Step 2.5: Commit**

```bash
git add src/background/notifications.ts src/background/notifications.test.ts
git commit -m "feat(background): dedupe new-low notifications"
```

---

## Task 3: Pipeline Integration

**Files:**
- Modify: `src/background/pipeline.ts`
- Modify: `src/background/pipeline.test.ts`

- [ ] **Step 3.1: Write failing pipeline integration test**

Add a test that runs `processProductCheck` for a new low and asserts the injected notifier is called once.

- [ ] **Step 3.2: Run RED**

```bash
pnpm test src/background/pipeline.test.ts
```

Expected: FAIL because pipeline does not call `maybeNotifyNewLow`.

- [ ] **Step 3.3: Implement integration**

Add optional `notify` to `ProcessProductCheckOptions` and call `maybeNotifyNewLow(productId, { notify })` after `recomputeAndStoreStats`.

- [ ] **Step 3.4: Run GREEN**

```bash
pnpm test src/background/pipeline.test.ts
```

- [ ] **Step 3.5: Commit**

```bash
git add src/background/pipeline.ts src/background/pipeline.test.ts
git commit -m "feat(background): notify after price checks"
```

---

## Task 4: Verification and Close

- [ ] **Step 4.1: Run full suite**

```bash
pnpm test
pnpm typecheck
```

- [ ] **Step 4.2: Commit close marker if needed**

```bash
git commit --allow-empty -m "chore: close notification dedup issue" -m "Closes #5"
```

- [ ] **Step 4.3: Push**

```bash
git push origin main
gh issue view 5 --repo VictoryJu/musinsa-price-tracker --json number,state,title,closedAt
```

---

## GSTACK REVIEW REPORT

| Review | Trigger | Why | Runs | Status | Findings |
|--------|---------|-----|------|--------|----------|
| Eng Review | `/plan-eng-review` | Architecture and tests | 1 | CLEAR | Check-and-set placed in storage adapter, stale/out-of-order cases covered |
| CEO Review | `/plan-ceo-review` | Scope and strategy | 0 | n/a | Not needed for infrastructure |
| Design Review | `/plan-design-review` | UI/UX gaps | 0 | n/a | Notification copy minimal, UI polish deferred |

**VERDICT:** ENG CLEARED, ready to implement with TDD.
