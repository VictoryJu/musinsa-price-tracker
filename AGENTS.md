# Musinsa Price Tracker Agent Guide

This file is the project-level operating manual for AI coding agents. Claude and Codex should follow the same workflow, decisions, and quality bar from this document.

---

## Project Summary

A Chrome extension that shows whether a Musinsa product is worth buying, directly next to the price on the product page. This is a personal dogfood project based on a real shopping pain.

- **GitHub:** https://github.com/VictoryJu/musinsa-price-tracker
- **Design doc:** [docs/superpowers/specs/2026-04-28-musinsa-price-tracker-design.md](docs/superpowers/specs/2026-04-28-musinsa-price-tracker-design.md)
- **TODO reference:** [TODOS.md](TODOS.md)
- **Issue tracker:** GitHub Issues are the source of truth for V1 work.

---

## Current Workflow

| Stage | Skill system | What it is for |
|---|---|---|
| Brainstorming | superpowers `brainstorming` | Wedge, user scenarios, first design direction |
| Product questions | gstack `office-hours` | Competitive pressure, wedge validation, product scope |
| Engineering review | gstack `plan-eng-review` | Architecture, tests, edge cases, issue discovery |
| Implementation | superpowers `writing-plans` -> `executing-plans` -> `test-driven-development` | Per-issue plans and TDD implementation |
| Completion | superpowers `verification-before-completion`, gstack `review` / `ship` | Final verification, review, push/PR |

Principles:

- Use gstack for review, strategy, QA, shipping, and product/engineering critique.
- Use superpowers for implementation planning, TDD, debugging, and execution discipline.
- For every new issue, write an implementation plan first, then execute it with TDD.
- Do not skip RED/GREEN verification. If a test was not seen failing first, it is not TDD.
- Prefer GitHub Issues over `TODOS.md`; `TODOS.md` is only a supporting reference.

---

## V1 Product Decisions

| Area | Decision |
|---|---|
| Tracked price | Track sale price only. Ignore member, coupon, and app-only prices. |
| Wedge activation | 14-day soak period before analysis is active. Before that, show simple collection status. |
| Background collection | 12h interval plus jitter, persisted `nextCheckAt` for MV3 worker death safety. |
| Retention | 365-day sliding window hard cap. |
| DOM extraction | JSON-LD primary -> CSS selector fallback -> internal API last resort. Verify visible text when possible. |
| Component ownership | Content script renders UI and sends intents only. Background is the single source of truth. |
| Storage layout | `products` for metadata/snapshot/stats, monthly history chunks for samples. |
| Notification dedup | `lastNotified` token plus storage check-and-set, stale/out-of-order safe. |
| Buyability | Percentile-based, not absolute discount percent. |
| Hover | 300ms delay, pre-load data, lazy mount expensive UI. |
| Charting | uPlot only inside popover. Hover sparkline should be inline SVG around 2KB. |
| Permissions | Limit host permissions to `*://*.musinsa.com/products/*`; avoid broad host permissions. |

Rejected recommendation:

- Codex suggested removing hover sparkline and rating from V1. Decision: keep them because they are central to the wedge, but activate analysis only after the soak threshold.

---

## Execution Lanes

```text
Lane A - Price pipeline: extraction, storage, scheduler
Lane B - UI render: Shadow DOM, label, sparkline, popover
Lane C - Popup: tracked list, settings, debug, import/export
```

Recommended order:

1. Start Lane A first.
2. Let Lane B and Lane C proceed with mocks once the storage shape is stable.
3. Integrate after Lane A contracts are tested.

---

## Skill Routing Rules

When the intent matches one of these, use the matching local skill/workflow before answering directly:

- New feature, design decision, or brainstorming: `superpowers:brainstorming`
- Per-issue implementation plan: `superpowers:writing-plans`
- Execute an existing plan with TDD: `superpowers:executing-plans`
- Bug, unexpected behavior, failing test: `superpowers:systematic-debugging`
- Feature or bugfix implementation: `superpowers:test-driven-development`
- Before claiming completion: `superpowers:verification-before-completion`
- PR, merge, deploy, or push workflow: `gstack:ship`
- Architecture/design validation: `gstack:plan-eng-review`
- Product scope challenge: `gstack:office-hours`
- Code review: `gstack:review`

If a named skill is unavailable in the current runtime, read the corresponding `SKILL.md` from disk if present and follow it manually.

Known local skill roots on this machine:

- `C:/Users/Victory_Ju/.codex/skills/superpowers`
- `C:/Users/Victory_Ju/.codex/skills/gstack`
- `C:/Users/Victory_Ju/.claude/plugins/cache/claude-plugins-official/superpowers`

---

## Code Conventions

- TypeScript + Chrome Manifest V3.
- Vanilla DOM for V1. Re-evaluate Preact in V1.1.
- Vite + `@crxjs/vite-plugin` build pipeline.
- Keep modules small and explicit. Prefer clear code over clever code.
- Content scripts must not write directly to `chrome.storage`.
- All cross-context communication should go through typed runtime messages in `src/shared/messages.ts`.
- Use the existing storage adapter and domain types instead of inventing parallel data shapes.

Target module shape:

```text
src/
  background/         # service worker orchestration
  content/            # content script for musinsa.com/products/*
  popup/              # toolbar popup
  shared/
    messages.ts       # typed runtime messages
    price.ts          # parse/format/percentile helpers
    buyability.ts     # classification and stats
    storage.ts        # chrome.storage adapter, background-owned writes
    extraction/       # JSON-LD, CSS, API extraction paths
```

---

## Testing Rules

- Framework: Vitest with jsdom.
- Test files live next to source as `*.test.ts`.
- Wedge-critical tests need broad path and edge coverage:
  - DOM extraction: JSON-LD primary, visible validation, fallback chain, sold-out, variant detection.
  - Buyability: percentile boundaries and disabled state before enough data.
  - Notification dedup: same low later, out-of-order samples, check-and-set.
  - Storage: retention pruning, schema migration, history chunking.
- Infrastructure tests should cover happy path plus one or two important edges.
- UI tests can be smoke-level for V1, focused on Shadow DOM render and key states.
- Do not chase 100% coverage for the side project, but do not under-test the wedge.

TDD rule:

1. Write the failing test.
2. Run it and confirm the expected failure.
3. Implement the smallest passing change.
4. Run focused tests.
5. Run broader verification before completion.

---

## Build And Verification

Common commands:

```powershell
pnpm test
pnpm typecheck
pnpm build
```

Development commands:

```powershell
pnpm dev
```

V1 distribution is dogfood-only as an unpacked extension. Chrome Web Store packaging is V1.1 after soak and dogfood validation.

---

## Git And Issue Rules

- Work from GitHub Issues. Close completed issues with `Closes #N` in a pushed commit.
- Keep commits small and conventional when possible.
- Before starting a new issue, create a plan in `docs/superpowers/plans/`.
- Before final completion, run `pnpm test` and `pnpm typecheck` at minimum.
- If the design doc changes, update this guide in the same change.
- V1.1 candidates such as #23 and #24 should wait until V1 is dogfooded.

---

## Claude Hook Migration Notes For Codex

Claude-specific hooks on this machine enforce workflow boundaries, prompt/read guards, context monitoring, session state, update checks, and commit validation. Codex does not run Claude hooks directly, so agents should emulate the behavior manually:

- Before edits, read the relevant files and state the intended edit.
- Do not write implementation code before a failing test for feature/bugfix work.
- Before commit/push, run focused tests plus `pnpm typecheck`.
- Prefer `rg` for search.
- Do not revert user changes unless explicitly asked.
- Keep all project-facing guidance in this file in English to avoid encoding issues across tools.
