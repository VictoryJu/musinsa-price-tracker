# CLAUDE.md — Musinsa Price Tracker

이 파일은 **매 세션 자동으로 컨텍스트에 로드**돼요. 워크플로우와 핵심 결정사항을 잊지 않게 박아둔 reference doc.

---

## 프로젝트 한 줄

무신사 페이지를 떠나지 않고 가격 옆에서 "지금 살만한가?"를 시각적으로 보여주는 크롬 익스텐션. 본인 일상 pain에서 출발한 사이드 프로젝트.

- **GitHub:** https://github.com/VictoryJu/musinsa-price-tracker
- **Design doc:** [docs/superpowers/specs/2026-04-28-musinsa-price-tracker-design.md](docs/superpowers/specs/2026-04-28-musinsa-price-tracker-design.md)
- **TODOS:** [TODOS.md](TODOS.md)
- **Issue tracker:** GitHub Issues (V1 milestone) — 24개 이슈 등록됨

---

## 작업 워크플로우 (잊지 말 것)

| 단계 | Skill 시스템 | 한 일 / 할 일 |
|---|---|---|
| Brainstorming | superpowers (`brainstorming`) | wedge / 사용자 시나리오 / 첫 디자인 |
| Forcing questions | gstack (`office-hours`) | 경쟁환경 / wedge 검증 / Approach B 선택 |
| Eng review | gstack (`plan-eng-review` + Codex) | 24개 이슈 발굴 / design doc 개정 |
| **현재: 코드 작성** | **superpowers (`writing-plans` → `executing-plans` → `test-driven-development`)** | issue별 plan + TDD 구현 |
| 마무리 | gstack (`ship` / `review`) | PR / 코드 리뷰 / 머지 |

**원칙:**
- gstack은 review/strategy 라이브러리. superpowers는 implementation 라이브러리. 섞어 쓰는 게 정상.
- 새 issue 작업 시작할 때마다 `/writing-plans`로 implementation plan 먼저, 그 다음 `/executing-plans`.
- 의문 생기면 잘 모르는 영역에 대해 `/office-hours` 추가 호출 가능.

---

## V1 핵심 결정사항 (변경 시 design doc + 이 파일 같이 수정)

| 영역 | 결정 |
|---|---|
| 추적 가격 | **세일가만** (멤버/쿠폰/앱전용 무시) |
| Wedge 활성화 | **14일 소크 → 분석 활성**. 그 전엔 단순 표시만 |
| 백그라운드 수집 | 12h + jitter, persisted nextCheckAt (MV3 worker 사망 안전) |
| 데이터 보존 | 365일 sliding window hard cap |
| DOM 추출 | **JSON-LD primary** → CSS selector → internal API. visible textContent 검증 |
| 컴포넌트 책임 | content script는 render+intent만, background가 single source of truth |
| Storage 구조 | `products` (메타+snapshot+stats) + `history` (월별 청크) split |
| 알림 dedup | `lastNotified` token + check-and-set + out-of-order safe |
| Buyability | percentile-based (절대 % 아님) |
| 호버 | 300ms delay + pre-load + lazy mount |
| Chart | popover만 uPlot, 호버 sparkline은 inline SVG ~2KB |
| 권한 | `*://*.musinsa.com/products/*`만 (broad host X) |

**거부된 권고 (의도적):** Codex의 "호버 sparkline + 별점 V1에서 빼라" → wedge thesis 핵심이라 절충안 (소크 기간 후 활성) 채택.

---

## Lane / 병렬화

```
Lane A — 가격 파이프라인 (extractor + storage + scheduler)  [의존성: —]
Lane B — UI render (Shadow DOM + 라벨 + sparkline + popover)  [의존성: A의 storage shape, mock 가능]
Lane C — Popup (목록 + settings + debug + import/export)      [의존성: A의 storage shape]
```

순서: **Lane A 먼저 시작 → Lane B + C mock 병렬 합류 → 통합.**

---

## Skill Routing Rules

다음 의도가 보이면 직접 답하지 말고 해당 skill 호출:

- 새 기능 / 디자인 결정 / 브레인스토밍 → `superpowers:brainstorming`
- 작업 단위 plan 작성 (이슈별) → `superpowers:writing-plans`
- 작성된 plan 실행 (TDD) → `superpowers:executing-plans`
- 디버깅 / "왜 안 되지" / 에러 → `superpowers:systematic-debugging`
- 작업 완료 후 검증 / "다 됐어요" 직전 → `superpowers:verification-before-completion`
- PR 생성 / 머지 / 배포 → `gstack:ship`
- 디자인/아키텍처 다시 검증 필요 → `gstack:plan-eng-review`
- 깊은 product 질문 ("이게 진짜 필요해?") → `gstack:office-hours`
- 코드 review → `gstack:review`

---

## 코드 컨벤션

- **TypeScript** + Manifest V3
- **Vanilla DOM** (Preact 도입은 V1.1에서 재평가)
- **Vite + @crxjs/vite-plugin** 빌드
- **모듈 구조:**
  ```
  src/
    background/         # service worker
    content/            # content script (musinsa.com/products/*)
    popup/              # toolbar popup
    shared/
      messages.ts       # typed runtime messages
      price.ts          # parse/format/percentile
      buyability.ts     # classify + computeStats
      storage.ts        # chrome.storage adapter (single owner: background)
      extraction/       # JSON-LD / CSS / API extractors
  ```
- 작은 모듈 / 명시적 (explicit) > clever
- Background-only writes — content script은 chrome.storage write 금지
- 모든 cross-context 통신은 `src/shared/messages.ts`의 typed message 통해서

---

## Testing

- **Framework:** Vitest (선호) 또는 Jest. jsdom 환경.
- **핵심 wedge 테스트는 ★★★ (모든 path + edge case):**
  - DOM 추출 (JSON-LD primary + visible 검증 + fallback chain + sold-out + variant)
  - Buyability classifier (percentile + < 20 sample 비활성)
  - Notification dedup (out-of-order + same-low-later)
  - Storage retention prune + schema migration
- **인프라 테스트는 ★★** (happy path + 1~2 edge)
- **UI 테스트는 ★** (smoke / Shadow DOM 렌더 확인)
- 사이드 프로젝트라 100% coverage는 강제 X. 다만 wedge는 무조건.

테스트 파일 명명: `*.test.ts` 옆에 두기 (별도 디렉토리 X).

---

## 빌드 / 배포

- 개발: `bun run dev` 또는 `pnpm dev` (Vite HMR + 익스텐션 reload)
- 프로덕션 빌드: `bun run build` → `dist/` 에 unpacked extension
- **V1 동안은 본인 dogfood용 unpacked extension만.** Chrome Web Store 등록은 V1.1 (소크 + 14일 통과 후)

---

## "이거 잊지 마" 리스트

- [ ] 새 issue 시작 시 `/writing-plans`로 plan 먼저
- [ ] commit 메시지에 `Closes #N` 포함 (issue 자동 닫힘)
- [ ] design doc 변경 시 이 CLAUDE.md의 결정사항도 같이 업데이트
- [ ] 24개 이슈는 GitHub Issues 우선, TODOS.md는 보조 reference
- [ ] V1.1 후보로 분류된 항목 (#23, #24)은 V1 통과 후
- [ ] 무신사 사이트 변경 가능성 — DOM 추출은 매 분기 fixture 업데이트 검토
