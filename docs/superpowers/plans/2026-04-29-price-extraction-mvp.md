# Price Extraction MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a tested shared extraction module that turns a Musinsa product page DOM into a `CurrentSnapshot`.

**Architecture:** Keep extraction pure and testable in `src/shared/extraction.ts`. The module reads an injected `Document`, tries JSON-LD first, rejects JSON-LD when the price is not visible in page text, falls back to CSS selectors, then optionally calls an injected internal API fetcher. It returns existing Phase 1A `CurrentSnapshot` shape so background/content code can store or render it later without translation.

**Tech Stack:** TypeScript 5.x, Vitest + jsdom, existing `src/shared/types.ts`, existing `src/shared/price.ts`.

---

## File Structure

```
src/shared/
  extraction.ts       # extractProductPrice + focused helpers
  extraction.test.ts  # DOM fixtures and TDD coverage for extraction chain
```

Out of scope for this plan:
- background scheduler/fetch orchestration
- content script rendering
- popup/debug UI
- variant-specific tracking

---

## Public API

```ts
import type { CurrentSnapshot } from './types';

export interface ExtractProductPriceOptions {
  now?: number;
  productId?: string;
  apiEndpoint?: string;
  fetchJson?: (url: string) => Promise<unknown>;
}

export async function extractProductPrice(
  document: Document,
  options?: ExtractProductPriceOptions
): Promise<CurrentSnapshot>;
```

Behavior:
- `status: 'ok'` when a valid price is found.
- `status: 'soldOut'` when sold-out text is detected.
- `status: 'failed'` when all extraction paths fail.
- `extractorPath` is one of existing `ExtractorPath` values.
- `price` is `null` unless `status === 'ok'`.
- `ts` comes from `options.now` or `Date.now()`.

---

## Task 1: JSON-LD Primary Path

**Files:**
- Create: `src/shared/extraction.test.ts`
- Create: `src/shared/extraction.ts`

- [ ] **Step 1.1: Write failing JSON-LD test**

Add this test:

```ts
import { describe, expect, it } from 'vitest';
import { extractProductPrice } from './extraction';

const KRW = '\uC6D0';

function doc(html: string): Document {
  return new DOMParser().parseFromString(html, 'text/html');
}

describe('extractProductPrice', () => {
  it('uses JSON-LD Offer.price when the same price is visible on the page', async () => {
    const page = doc(`
      <html>
        <body>
          <script type="application/ld+json">
            {
              "@context": "https://schema.org",
              "@type": "Product",
              "offers": { "@type": "Offer", "price": "37700" }
            }
          </script>
          <strong class="price">37,700${KRW}</strong>
        </body>
      </html>
    `);

    await expect(extractProductPrice(page, { now: 1 })).resolves.toEqual({
      price: 37700,
      ts: 1,
      extractorPath: 'json-ld',
      status: 'ok',
    });
  });
});
```

- [ ] **Step 1.2: Run test to verify RED**

Run:

```bash
pnpm test src/shared/extraction.test.ts
```

Expected: FAIL because `./extraction` does not exist.

- [ ] **Step 1.3: Implement minimal JSON-LD extraction**

Create `src/shared/extraction.ts` with:
- `extractProductPrice`
- JSON-LD script parsing
- recursive object search for `offers.price`, `offer.price`, and `priceSpecification.price`
- price validation `> 0 && < 100_000_000`
- visible text validation by checking page text contains a parseable matching price

- [ ] **Step 1.4: Run test to verify GREEN**

Run:

```bash
pnpm test src/shared/extraction.test.ts
```

Expected: PASS.

- [ ] **Step 1.5: Commit**

```bash
git add src/shared/extraction.ts src/shared/extraction.test.ts
git commit -m "feat(extraction): read visible JSON-LD product price"
```

---

## Task 2: JSON-LD Rejection and CSS Fallback

**Files:**
- Modify: `src/shared/extraction.test.ts`
- Modify: `src/shared/extraction.ts`

- [ ] **Step 2.1: Add failing fallback tests**

Add tests for:
- JSON-LD price exists but visible page price is different, so JSON-LD is rejected.
- CSS fallback returns sale price over regular price.

Expected assertions:

```ts
expect(result.extractorPath).toBe('css-selector');
expect(result.price).toBe(37700);
expect(result.status).toBe('ok');
```

- [ ] **Step 2.2: Run tests to verify RED**

Run:

```bash
pnpm test src/shared/extraction.test.ts
```

Expected: FAIL because CSS fallback is not implemented.

- [ ] **Step 2.3: Implement CSS fallback**

Rules:
- Prefer sale selectors first:
  - `[data-price-type="sale"]`
  - `[data-testid="sale-price"]`
  - `.sale-price`
  - `[class*="sale"][class*="price"]`
- Then generic visible price selectors:
  - `[data-price]`
  - `[data-testid="price"]`
  - `.price`
- Parse text with existing `parsePrice`.
- Validate `> 0 && < 100_000_000`.

- [ ] **Step 2.4: Run tests to verify GREEN**

Run:

```bash
pnpm test src/shared/extraction.test.ts
```

Expected: PASS.

- [ ] **Step 2.5: Commit**

```bash
git add src/shared/extraction.ts src/shared/extraction.test.ts
git commit -m "feat(extraction): fall back to visible CSS price"
```

---

## Task 3: Sold-Out and Failed States

**Files:**
- Modify: `src/shared/extraction.test.ts`
- Modify: `src/shared/extraction.ts`

- [ ] **Step 3.1: Add failing status tests**

Add tests for:
- Body text contains sold-out markers (`sold out`, `품절`, `일시품절`, `판매 종료`), result is `status: 'soldOut'`.
- No price and no sold-out marker, result is `status: 'failed'`.

- [ ] **Step 3.2: Run tests to verify RED**

Run:

```bash
pnpm test src/shared/extraction.test.ts
```

Expected: FAIL because status detection is not implemented.

- [ ] **Step 3.3: Implement status handling**

Rules:
- Sold-out detection runs before price extraction.
- Sold-out result:
  - `price: null`
  - `status: 'soldOut'`
  - `extractorPath: 'unknown'`
  - `errorMessage: 'Product is sold out'`
- Failed result:
  - `price: null`
  - `status: 'failed'`
  - `extractorPath: 'unknown'`
  - `errorMessage: 'Unable to extract price'`

- [ ] **Step 3.4: Run tests to verify GREEN**

Run:

```bash
pnpm test src/shared/extraction.test.ts
```

Expected: PASS.

- [ ] **Step 3.5: Commit**

```bash
git add src/shared/extraction.ts src/shared/extraction.test.ts
git commit -m "feat(extraction): return sold-out and failed snapshots"
```

---

## Task 4: Internal API Last Resort

**Files:**
- Modify: `src/shared/extraction.test.ts`
- Modify: `src/shared/extraction.ts`

- [ ] **Step 4.1: Add failing internal API tests**

Add tests for:
- No JSON-LD/CSS price, `fetchJson` returns `{ price: 37700 }`, result uses `extractorPath: 'internal-api'`.
- `fetchJson` throws, result remains `status: 'failed'`.

- [ ] **Step 4.2: Run tests to verify RED**

Run:

```bash
pnpm test src/shared/extraction.test.ts
```

Expected: FAIL because internal API fallback is not implemented.

- [ ] **Step 4.3: Implement internal API fallback**

Rules:
- Only run if `options.fetchJson` and either `options.apiEndpoint` or `options.productId` is provided.
- URL:
  - use `apiEndpoint` as-is when provided
  - otherwise `/api/product/${productId}`
- Accept common response shapes:
  - `{ price: 37700 }`
  - `{ salePrice: 37700 }`
  - `{ product: { price: 37700 } }`
- Validate price with the same bounds.
- Catch errors and continue to failed result.

- [ ] **Step 4.4: Run tests to verify GREEN**

Run:

```bash
pnpm test src/shared/extraction.test.ts
```

Expected: PASS.

- [ ] **Step 4.5: Commit**

```bash
git add src/shared/extraction.ts src/shared/extraction.test.ts
git commit -m "feat(extraction): add internal API fallback"
```

---

## Task 5: Integration Verification

**Files:**
- Modify: none unless verification finds gaps.

- [ ] **Step 5.1: Run focused tests**

```bash
pnpm test src/shared/extraction.test.ts
```

Expected: all extraction tests pass.

- [ ] **Step 5.2: Run full test suite**

```bash
pnpm test
```

Expected: all tests pass.

- [ ] **Step 5.3: Run typecheck**

```bash
pnpm typecheck
```

Expected: zero TypeScript errors.

- [ ] **Step 5.4: Commit checklist or docs if needed**

Only commit docs if the plan status or TODO checklist is updated.

---

## Self-Review

- Spec coverage: JSON-LD primary, visible validation, CSS fallback, sale-price preference, sold-out detection, failed status, internal API last resort.
- Gaps intentionally left out: scheduler, storage write orchestration, UI labels, popup debug tab, variant-specific tracking.
- Placeholder scan: no TBD/TODO placeholders. Each task has exact files, commands, and expected outcomes.
- Type consistency: output is `CurrentSnapshot` from Phase 1A, `extractorPath` uses existing `ExtractorPath` union.

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-04-29-price-extraction-mvp.md`.

Execution mode for this session: Inline Execution with `test-driven-development`.
