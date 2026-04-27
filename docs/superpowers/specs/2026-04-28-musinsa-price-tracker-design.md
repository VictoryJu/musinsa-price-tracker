# Design — Musinsa Price Tracker (Chrome Extension)

**Date:** 2026-04-28 (revised after eng review)
**Status:** Brainstorming → Office Hours → Eng Review (Codex + Claude) → Ready for Implementation
**Author:** VictoryJu
**Mode:** Builder (side project)

---

## 1. Wedge

> **무신사 페이지를 떠나지 않고, 가격 옆에서 바로 "지금 살만한가?"를 시각적으로 알려주는 익스텐션.**

본인 일상 pain. 사용자 자신이 user.

### 두 단계 활성화 — Soak Period

| 단계 | 기간 | 표시 내용 |
|---|---|---|
| **수집 단계 (Soak)** | 추적 시작 ~ **14일** (≥20 data points) | 현재가 + "데이터 수집 중 N일째 / D-X" 진행도. 별점/sparkline 비활성 |
| **분석 단계** | 14일 이후 | wedge 모든 기능 활성: 컨텍스트 라벨 + 살만함 별점 + 호버 sparkline + 클릭 팝오버 |

**근거:** 데이터 충분히 쌓이기 전엔 평균/최저가/별점이 fiction. Codex 권고 + 사용자 통찰 — "어차피 데이터 쌓이기 전엔 사용 못 함." 정직하게.

## 2. 경쟁 환경

| 도구 | 형태 | 무신사 페이지 인라인 통합 | 호버/시각 분석 | 평균가/추천 | 무신사 전용 UX |
|---|---|---|---|---|---|
| **Otsledit** | 범용 크롬 익스텐션 | ❌ | ❌ | ❌ | ❌ |
| **폴센트 / 로우차트** | 쿠팡 전용 | N/A | ✅ | ✅ | (쿠팡 한정) |
| **Musinsa-Scouter** (GitHub) | 별도 웹사이트 | ❌ | △ | ✅ | (스탠다드만) |
| **이 익스텐션 (V1)** | 크롬 익스텐션 | ✅ | ✅ | ✅ | ✅ |

## 3. 사용자 시나리오

**처음 등록 (수집 단계 진입):**
1. `musinsa.com/products/{id}` 접속
2. 가격 옆 [📊] 아이콘 → 클릭 → 인라인 팝오버: `[추적 시작]` 토글
3. 즉시 현재가 1회 기록. 라벨: `37,700원 [추적 중 1일째 / D-13]`

**14일 후 (분석 단계 진입):**
4. 가격 옆 라벨: `60% 37,700원 [↓ 5,200원 vs 최저] [평균 -800원] [살만함 ★★★★☆]`
5. 가격 위에 hover (300ms delay) → mini sparkline tooltip + 살만함 뱃지
6. [📊] 아이콘 → 인라인 팝오버: 30/90/전체 라인 차트, 통계, [추적 해제] / [지금 체크]
7. 백그라운드가 12h 자동 가격 수집 (지속)
8. 최저가 갱신 시 chrome.notifications

**에러 상태:**
- DOM 추출 실패 → 라벨에 "가격 추출 실패 ⚠️"
- 마지막 fetch 24h 이상 → "마지막 업데이트: N시간 전"
- 품절/단종 → "🛑 품절"

## 4. 컴포넌트 책임 (Eng Review 후 명확화)

```
┌─ Content Script (musinsa.com/products/*) ────────────────┐
│  RENDER ONLY + emit intents                              │
│  - DOM 가격 추출 (extractor)                              │
│  - storage READ → 라벨/툴팁/팝오버 렌더 (Shadow DOM)      │
│  - 사용자 액션 → chrome.runtime.sendMessage(background)   │
│  ❌ 백그라운드 fetch 안 함                                 │
│  ❌ buyability 계산 안 함 (background precompute한 거 표시만)│
│  ❌ storage write 안 함 (intent만 emit)                   │
└──────────────────────────────────────────────────────────┘
            │ TRACK_START | TRACK_STOP | REFRESH_NOW | LOG_VISIT
            ▼
┌─ Background Service Worker (single source of truth) ─────┐
│  - chrome.alarms (12h base) + persisted nextCheckAt      │
│  - 매 wake마다 nextCheckAt 재계산 (jitter 0~30분)        │
│  - 추적 상품 1개씩 fetch (alarm chunk 단위, no big loop) │
│  - extract → validate → store currentSnapshot/history    │
│  - precompute stats: { allTimeLow, avg30d, min30d, max30d }│
│  - dedup notification: lastNotified check-and-set        │
│  - 실패 시 status: 'failed' 기록 (silent staleness 금지) │
│  - timestamp-aware merge (out-of-order 샘플 안 덮어씀)   │
└──────────────────────────────────────────────────────────┘

┌─ Popup ──────────────────────────────────────────────────┐
│  - 추적 목록 (썸네일/현재가/최저가/스파크라인)             │
│  - 정렬, 알림 ON/OFF, "지금 체크"(REFRESH_NOW)            │
│  - 가져오기/내보내기 / 리셋 (debugging)                   │
│  - hidden debug tab: extractorPath, lastError             │
└──────────────────────────────────────────────────────────┘
```

## 5. 데이터 모델 (chrome.storage.local) — split

```json
{
  "schemaVersion": 1,
  "products": {
    "<productId>": {
      "id": "3674341",
      "canonicalUrl": "https://www.musinsa.com/products/3674341",
      "name": "...",
      "thumbnail": "...",
      "addedAt": 1735300000000,
      "notifyOnNewLow": true,
      "currentSnapshot": {
        "price": 37700,
        "ts": 1735300000000,
        "extractorPath": "json-ld",
        "status": "ok",
        "errorMessage": ""
      },
      "stats": {
        "allTimeLow": { "price": 31500, "ts": 1734000000000 },
        "avg30d": 38500,
        "min30d": 35000,
        "max30d": 42000,
        "samplesIn30d": 60,
        "lastComputedAt": 1735300000000
      },
      "lastNotified": { "price": 31500, "ts": 1734000000000 },
      "nextCheckAt": 1735346400000,
      "lastCheckedAt": 1735300000000
    }
  },
  "history": {
    "<productId>:2026-04": [
      { "ts": 1735300000000, "price": 37700, "status": "ok" }
    ]
  },
  "settings": {
    "schemaVersion": 1,
    "fetchIntervalHours": 12,
    "globalNotifications": true,
    "retentionDays": 365,
    "soakPeriodDays": 14,
    "minSamplesForAnalysis": 20,
    "hoverDelayMs": 300,
    "buyabilityMethod": "percentile",
    "buyabilityThresholds": {
      "great": 10,
      "good": 25,
      "fair": 75,
      "wait": 90
    }
  }
}
```

**Key changes from prior version:**
- `history`를 월별 청크로 분리 → write amplification 회피
- `currentSnapshot` + `stats` 미리 저장 → content script가 매 페이지 로드마다 full scan 안 함
- `lastNotified` 영구 token으로 알림 dedup
- `nextCheckAt` 영구화 → MV3 service worker 사망 안전
- buyability는 **percentile-based** (절대 % 아님)

## 6. 가격 추출 spec

```
PRICE EXTRACTION CHAIN
======================
1. JSON-LD (primary)
   <script type="application/ld+json">
   Offer.price 또는 PriceSpecification 필드
   장점: 구조화 데이터, 스키마 안정적
   단점: SEO용이라 보이는 할인가랑 다를 수 있음
   검증: visible textContent와 비교 → 불일치 시 reject

2. CSS selector (fallback)
   primary: 실제 셀렉터는 page-spec에서 정의
   secondary: data-* attribute
   검증: "원" 패턴, 정상가/세일가 동시 있을 때 세일가 우선

3. Internal API (last resort)
   /api/product/{id} 등 페이지에서 노출되는 endpoint
   검증: response shape, status 200
   Risk: bot 차단 가능성 가장 높음

VALIDATION RULES
================
- 추출된 price > 0 AND < 100,000,000
- 정상가 + 세일가 둘 다 있으면 세일가 선택
- 멤버가/쿠폰가/앱전용가는 무시 (V1 명시적 단정)
- 매진 표시 감지 → status: "soldOut"
- 추출 실패 → status: "failed", 라벨에 "가격 추출 실패" 표시

DOM HEALTH CHECK
================
매 fetch마다 currentSnapshot.extractorPath에 사용한 path 기록.
Day-2 디버깅: 어떤 상품이 어떤 path 쓰는지 popup debug tab에서 확인.
```

## 7. 결정 사항 (Eng Review 후 확정)

| # | 결정 | 선택 | 근거 |
|---|---|---|---|
| 1 | 범위 | 무신사 한정, 멀티 상품 | YAGNI |
| 2 | 추적 가격 | **세일가만** (멤버/쿠폰/앱전용 무시 명시) | Codex — fake simplification 방지 |
| 3 | 수집 방식 | 백그라운드 12h + persisted scheduling state | MV3 lifecycle |
| 4 | 알림 | 최저가 갱신 + lastNotified dedup token + out-of-order safe | 중복/허위 알림 방지 |
| 5 | 백필 | 없음 (V1) | 신뢰 가능한 소스 부재 |
| 6 | UI 활성화 | **14일 소크 → 분석 활성** (수집 중엔 단순 표시) | 정직한 UX |
| 7 | 플랫폼 | Chrome 익스텐션 | DOM 주입은 Content Script만 |
| 8 | 데이터 보존 | **365일 sliding window hard cap** | Codex — "decide now" |
| 9 | DOM 추출 우선순위 | **JSON-LD → CSS → Internal API** (역순) | Eng review — JSON-LD가 더 안정적 |
| 10 | Buyability 계산 | **Percentile-based** (현재가 vs 30d 분포 위치) | 절대 % 보다 적응적 |
| 11 | 호버 delay | **300ms** | Codex — 즉시 호버는 noisy |
| 12 | 추적 진입점 | **단일** (팝오버 안 [추적] 토글). 별도 [+] 버튼 X | Codex — 두 entry point 금지 |
| 13 | Chart 라이브러리 | popover: uPlot (40KB) / sparkline tooltip: **inline SVG (~2KB)** | 페이지 무게 최소화 |
| 14 | Storage 구조 | **products + history split (월별 청크)** | Write amplification 방지 |
| 15 | Schema versioning | `schemaVersion: 1` + extension update 시 자동 migration | 데이터 깨짐 방지 |
| 16 | 권한 | `*://*.musinsa.com/products/*`만 (전체 도메인 X) | 설치 장벽 낮춤 |
| 17 | 데이터 손상 방지 | **background-only writes**, content script은 message passing | Multi-tab race 방지 |

## 8. V1 제약 (정직하게)

- **백필 불가:** 추적 시작 시점부터 누적. 14일 소크 후 분석 활성. UI에 명확히 표시
- **Chrome 활성 의존:** 백그라운드 수집은 Chrome 실행 중일 때만. UI는 데이터 갭 명시
- **봇 차단 회색지대:** robots.txt + 12h jitter + 사용자가 직접 등록한 상품만 fetch
- **상품당 단일 가격:** 옵션(사이즈/색상)별 차이는 V1 미지원. 변종 감지 시 사용자에게 알림만
- **품절/단종:** status로 추적 (가격 0원 박지 않음)

## 9. V2 후보 (Out of Scope)

- 자연어 어드바이저 ("지금 사지 마세요. 평소보다 12% 비쌈")
- 카테고리 전체 가격 비교 ("이 후드티는 평균 대비 어느 위치?")
- 위시리스트 폴더링, 알림 그룹
- 다나와 백필 (무신사 스탠다드)
- 멀티 쇼핑몰 (29CM, 쿠팡, 네이버)
- chrome.storage.sync / 백엔드 동기화
- **옵션별 (변종) 가격 individual tracking**
- **Remote kill-switch / DOM 셀렉터 hot-update** (V1.1 후보)
- **Debugging surface 정식화** (V1.1)

## 10. Failure Modes Analysis

| 시나리오 | 빈도 | 영향 | 대응 |
|---|---|---|---|
| DOM 셀렉터 깨짐 (무신사 deploy) | 분기 1~2회 | 라벨 안 보임 | DOM health check, fallback chain, 에러 UI |
| Service worker 도중 사망 | 매 fetch 가능 | 일부 상품 stale | persisted nextCheckAt + alarm 단위 chunk → resume safe |
| 더블 알림 | drag race 시 | 사용자 짜증 | lastNotified check-and-set in single transaction |
| 두 탭 동시 storage write | 흔함 | 데이터 corruption | background-only writes |
| 봇 차단 | 무신사 정책 변경 시 | fetch 0% | failure status + "fetch 차단됨" UI + 사용자 backoff |
| 옵션별 가격 무시한 평균 계산 | 항상 (변종 상품) | 잘못된 분석 | "대표 세일가만" 명시, 변종 감지 시 알림 |
| Day 1 데이터 없음 | 매 신규 사용자 | 별점 거짓말 | 14일 소크 + 진행도 표시 |
| Stale out-of-order sample | 늦게 도착 fetch | 차트 거짓말 | timestamp-aware merge |

---

## 11. Engineering Review 회고

### 양쪽이 합의 (수용)
- MV3 service worker는 죽음 → persisted state 필수
- Content Script은 render+intent만, fetch/decide/write는 background에 집중
- `history` unbounded array는 write amplification → split 필수
- 보존 기간 결정 사항 (365일)
- DOM 추출 JSON-LD primary
- Notification dedup은 영구 token + check-and-set
- uPlot은 popover만, sparkline tooltip은 inline SVG

### Codex가 새로 짚은 결함 (수용)
한국 쇼핑몰 가격 다종 → 세일가 명시. Multi-tab race → background-only writes. Stale out-of-order → timestamp merge. 품절/단종 state, URL canonicalization, schema versioning, 에러 UI, 수동 refresh, 추적 상태 페이지 표시, debugging surface, 권한 최소화. 모두 design doc + TODOS.md에 반영.

### Cross-Model Tension (사용자 결정)
**Codex:** V1에서 호버 sparkline + 살만함 별점 빼라.
**Claude:** wedge thesis 핵심.
**사용자 결정:** B (절충) — 호버/별점 유지, 단 14일 소크 후 활성화. 인프라 권고는 모두 수용.

### Lake Score
17/19 권고 수용 (89%). 거부: (1) 호버 sparkline 완전 제거, (2) 살만함 별점 완전 제거 — wedge 핵심이라 절충안 선택.

---

## 12. Worktree Parallelization

| Lane | 영역 | 의존성 |
|---|---|---|
| **A** | 가격 파이프라인 (extractor, validator, storage, scheduler) | — |
| **B** | UI render (content script Shadow DOM, label, sparkline, popover) | A의 storage shape (mock fixture로 병렬 가능) |
| **C** | Popup (추적 목록, settings, debug, import/export) | A의 storage shape |

**실행 순서:** A 먼저 시작 → B + C 병렬 합류 (mock 사용) → 통합.

---

## 13. The Assignment

**다음 단계는 implementation Phase 1, Lane A — 가격 추출 파이프라인 MVP.**

> 핵심 사용자 액션: 본인이 직접 무신사 상품 5~10개 등록해두고, 14일 소크 동안 dogfood. 그 동안 Lane B (UI) 합류. 14일째에 분석 단계 활성화 보면서 fine-tune. Chrome Web Store 등록은 V1.1 (소크 통과 후).

---

## What I Noticed (Eng Review 회고)

- 데이터 부족 문제를 본인이 먼저 짚었음 ("어차피 데이터 쌓이기 전엔 사용 못 함") → soak period 컨셉이 elegantly 들어옴. codex의 비판을 user-side에서 한 발 먼저 수용한 셈.
- forcing question에 자기 thesis로 push back 하면서도, eng review의 인프라 비판은 거의 다 수용. 자기 wedge는 지키고 fragility는 인정. 좋은 builder 본능.
- "절충안 B" 선택은 정확함. Codex의 "drop until reliable" 권고를 그대로 따랐으면 또 다른 평범한 알림 트래커가 됐을 것. wedge는 지켜졌고 인프라는 강화됐음.
