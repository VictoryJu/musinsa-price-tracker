# Permission Minimization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close issue #17 by locking the MV3 manifest to product-page-only host permissions and adding regression tests.

**Architecture:** The manifest already limits host permissions to `*://*.musinsa.com/products/*`. Add a static manifest test so future changes cannot broaden permissions, add `tabs`/`activeTab`, or run content scripts outside product pages.

**Tech Stack:** TypeScript 5.x, Vitest, JSON import.

---

## Task 1: Manifest Permission Regression Test

**Files:**
- Create: `src/manifest.test.ts`
- Modify: `src/manifest.json` only if tests fail

- [ ] **Step 1.1: Write tests**

Add tests for:
- `host_permissions` equals `['*://*.musinsa.com/products/*']`.
- content script `matches` equals `['*://*.musinsa.com/products/*']`.
- permissions do not include `tabs` or `activeTab`.
- manifest does not request remote code related permissions.

- [ ] **Step 1.2: Run tests**

```bash
pnpm test src/manifest.test.ts
```

Expected: PASS if current manifest is already minimal.

- [ ] **Step 1.3: Run typecheck**

```bash
pnpm typecheck
```

- [ ] **Step 1.4: Commit**

```bash
git add src/manifest.test.ts src/manifest.json
git commit -m "test(manifest): lock down extension permissions"
```

## Task 2: Verification And Close

- [ ] **Step 2.1: Run full verification**

```bash
pnpm test
pnpm typecheck
```

- [ ] **Step 2.2: Close issue #17**

```bash
git commit --allow-empty -m "chore: close permission minimization issue" -m "Closes #17"
git push origin main
gh issue view 17 --repo VictoryJu/musinsa-price-tracker --json number,state,title,closedAt
```

## Self-Review

- Spec coverage: host permission narrow, no tabs/activeTab, no remote code, content script only runs on product pages.
- Placeholder scan: no placeholders.
- Type consistency: no runtime API changes.
