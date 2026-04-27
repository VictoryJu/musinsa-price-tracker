# Design — Musinsa Price Tracker (Chrome Extension)

**Date:** 2026-04-28
**Status:** Brainstorming → Office Hours Reviewed → Planning
**Author:** VictoryJu
**Mode:** Builder (side project)

---

## 1. Wedge (한 줄)

> **무신사 페이지를 떠나지 않고, 가격 옆에서 바로 "지금 살만한가?"를 시각적으로 알려주는 익스텐션.**

본인 일상 pain: "무신사 가격이 자주 바뀌어서 지금이 최저가인지 판단이 안 됨." 사용자 자신이 user.

## 2. 경쟁 환경 (Office Hours에서 검증)

| 도구 | 형태 | 무신사 페이지 인라인 통합 | 호버/시각 분석 | 평균가/추천 | 무신사 전용 UX |
|---|---|---|---|---|---|
| **Otsledit** | 범용 크롬 익스텐션 | ❌ (수동 셀렉터, 자체 watchlist UI) | ❌ | ❌ | ❌ |
| **폴센트 / 로우차트** | 쿠팡 전용 사이트/앱 | N/A (쿠팡 한정) | ✅ | ✅ | — |
| **Musinsa-Scouter** (GitHub) | 별도 웹사이트 | ❌ | △ | ✅ | (무신사 스탠다드만) |
| **이 익스텐션 (V1)** | 크롬 익스텐션 | ✅ | ✅ | ✅ | ✅ |

**Gap:** 한국에서 **무신사 일반 셀러 상품**의 시각적 가격 분석을 **페이지 안에서** 제공하는 도구가 비어있음.

## 3. 사용자 시나리오 (Approach B — Wedge Maximizer)

1. 사용자가 무신사 상품 페이지(`musinsa.com/products/{id}`)에 접속
2. **가격 옆에 항상 떠 있는 컨텍스트 라벨** 즉시 표시:
   `60% 37,700원 [↓ 역대 최저 대비 +5,200원] [평균 대비 −800원] [살만함 ★★★★☆]`
3. **가격 텍스트에 마우스 호버 → 즉시 미니 sparkline 툴팁** + 살만함 뱃지
   ("지금 살만함" / "더 기다려봐" / "최저가 근접")
4. 더 보고 싶으면 가격 옆 [📊] 아이콘 → 인라인 팝오버:
   - 30일 / 90일 / 전체 기간 토글 라인 차트
   - 현재가 / 최저가 / 평균가 / 중앙값 / 최고가
   - [추적하기] 토글
5. 추적 등록 후 백그라운드 12h 자동 가격 수집
6. 최저가 갱신 시 크롬 알림: "무신사 — {상품명} 최저가 갱신: 31,500원"

## 4. 컴포넌트 아키텍처

```
┌─ Content Script (musinsa.com/products/*) ──────────────┐
│                                                         │
│  [DOM 추출 layer]                                       │
│   ├── selector: .price-current-sale (primary)           │
│   ├── selector: [data-price-sale] (fallback 1)          │
│   ├── JSON-LD <script type="application/ld+json">       │
│   └── 내부 API /api/product/{id} (마지막 fallback)      │
│                                                         │
│  [Render layer — Shadow DOM]                            │
│   ├── 컨텍스트 라벨 (가격 옆, 항상 표시)                │
│   ├── hover tooltip (가격 hover 시 sparkline)           │
│   └── [📊] 아이콘 + 클릭 팝오버                         │
│                                                         │
│  → background에 passive log: { id, price, ts }          │
└────────────────────────────────────────────────────────┘

┌─ Background Service Worker ────────────────────────────┐
│  chrome.alarms — 12h 주기 + jitter (0~30분)             │
│  ↓                                                      │
│  추적 상품 순회 → 페이지 fetch → 세일가 파싱 → 저장     │
│  ↓                                                      │
│  최저가 갱신 검출 → chrome.notifications.create         │
└────────────────────────────────────────────────────────┘

┌─ Popup (툴바 아이콘) ──────────────────────────────────┐
│  추적 카드 목록: 썸네일 / 현재가 / 최저가 / 스파크라인  │
│  추적 해제 / 알림 ON-OFF / 정렬                         │
└────────────────────────────────────────────────────────┘
```

## 5. 데이터 모델 (`chrome.storage.local`)

```json
{
  "products": {
    "<productId>": {
      "id": "3674341",
      "name": "...",
      "thumbnail": "https://...",
      "url": "https://www.musinsa.com/products/3674341",
      "addedAt": 1735300000000,
      "notifyOnNewLow": true,
      "history": [
        { "ts": 1735300000000, "price": 37700 }
      ]
    }
  },
  "settings": {
    "fetchIntervalHours": 12,
    "globalNotifications": true,
    "buyabilityThresholds": {
      "great":  -0.10,
      "good":   -0.03,
      "fair":    0.03,
      "wait":    0.10
    }
  }
}
```

`buyabilityThresholds`: 30일 평균 대비 현재가 위치 기준. 음수 = 평균보다 쌈.

## 6. 기술 스택

| 영역 | 선택 | 이유 |
|---|---|---|
| Manifest | V3 | 신규 등록 필수 |
| 언어 | Vanilla JS (또는 Preact ~5KB) | 부팅 속도, 의존성 최소 |
| 빌드 | Vite + @crxjs/vite-plugin | HMR + manifest 자동 생성 |
| 차트 | **uPlot (~40KB)** | 호버 sparkline에서 자주 호출 → 가벼워야 함 |
| 저장 | chrome.storage.local | 무제한, 동기화 불필요 |
| 스케줄 | chrome.alarms | 서비스 워커 슬립과 무관 |
| 알림 | chrome.notifications | 표준 |
| 스타일 격리 | Shadow DOM | 무신사 CSS 충돌 방지 |

## 7. 결정 사항

| # | 결정 | 선택 | 근거 |
|---|---|---|---|
| 1 | 범위 | 무신사 한정, 멀티 상품 | YAGNI |
| 2 | 추적 가격 | 세일가만 | 사용자 실제 결제가에 가장 가까움 |
| 3 | 수집 방식 | 백그라운드 12h + 페이지 방문 시 passive | 비활성에도 누적 |
| 4 | 알림 | 최저가 갱신 시 | "언제가 최저가" 핵심 욕구 |
| 5 | 백필 | 없음 (V1) | 신뢰 가능한 소스 부재 |
| 6 | UI 진입점 | **항상 떠 있는 컨텍스트 라벨 + 호버 sparkline + 클릭 팝오버** (Approach B) | wedge 정확히 구현 |
| 7 | 플랫폼 | Chrome 익스텐션 | DOM 주입은 Content Script만 가능 |

## 8. V1 제약

- **백필 불가:** 추적 시작 시점부터만 누적. UI에 "추적 N일째" 명시
- **Chrome 활성 의존:** 백그라운드 수집은 Chrome 실행 중일 때만
- **봇 차단 리스크:** robots.txt 회색지대. 12h + jitter로 완화
- **상품당 단일 가격:** 옵션(사이즈/색상)별 차이는 V1 무시 → 대표 세일가만
- **컨텍스트 라벨은 추적 등록한 상품에만 표시:** 처음 방문하는 상품은 데이터 없음 → 라벨 대신 "추적 시작" CTA만 표시

## 9. V2 후보 (Out of Scope)

- 자연어 어드바이저 ("지금 사지 마세요. 평소보다 12% 비쌈")
- 카테고리 전체 가격 비교 ("이 후드티는 평균 대비 어느 위치?")
- 위시리스트 폴더링, 알림 그룹
- 다나와 백필 (무신사 스탠다드만)
- 멀티 쇼핑몰 (29CM, 쿠팡, 네이버)
- `chrome.storage.sync` 또는 백엔드 동기화
- 옵션별 가격

## 10. Open Questions (Planning 이월)

- "살만한 가격" 뱃지 임계치 미세 조정 (현재 -10% / -3% / +3% / +10% 가안)
- 컨텍스트 라벨 위치 (정상가 옆 / 세일가 옆 / 별도 줄)
- 호버 sparkline 표시 지연 (즉시 vs 200ms hover delay)
- 가격 DOM 셀렉터 우선순위 검증 (실제 페이지에서 fallback chain 테스트)
- 추적 등록 인터랙션 (별도 [+] 버튼 vs 팝오버 안 [추적하기] 단일)
- `history` 배열 retention (영구 vs 1년 슬라이딩)

## 11. 리뷰 포인트 (plan-eng-review에서 검증)

1. Content Script / Background / Popup 책임 분담 적정성
2. `products[id].history` 무한 증가 → storage quota (~10MB) 도달 시점 추정
3. 봇 차단 회피 (12h + jitter)면 충분한가? User-Agent / Referer 정책
4. 가격 DOM 추출 신뢰성 — JSON-LD가 더 안정적이면 primary로?
5. 알림 중복 방지 (같은 최저가를 두 번 알리지 않기)
6. 호버 sparkline 성능 — 매 페이지 로드마다 라벨 + sparkline 데이터 로딩이 무거우면 LCP 영향

---

## Cross-Model Perspective

(plan-eng-review 단계에서 Codex outside voice 받기로 함 — 여기서는 skip)

## What I noticed about how you think (Office Hours 회고)

- 본인 일상 pain에서 출발했어요. "맨날 바뀌어서 언제가 최저가인지 궁금해." 이게 가장 강한 idea generation 패턴이에요. 본인이 user니까 user research가 거의 free.
- forcing question에 "나는 UX/UI적으로 차별점을 주고 싶은 것도 있어"로 push back. 자기 thesis가 분명함. wedge 발견의 가장 빠른 길.
- "이질감 없이" / "가격에 호버하면 추이가 나오고" / "원래 페이지랑 자연스럽게" — UX 직관이 구체적이고 시각적. 텍스트로 이걸 articulate할 수 있는 사람 많지 않아요.
- 경쟁 도구(Otsledit) 존재를 모르고도 본인 디자인이 거기랑 다르다고 직감했음. taste가 정확하다는 신호.

## The Assignment (Office Hours)

**다음 단계는 plan-eng-review 한 번 더 — 이번엔 Approach B 기준으로 데이터 모델/봇 차단/DOM 셀렉터/호버 성능을 codex와 함께 검증.** 그 다음 Phase 1 구현 (가격 DOM 추출 + 컨텍스트 라벨만).

> 핵심: V1 출시 전에 무신사 product 페이지 5개에서 셀렉터 fallback chain이 다 잘 작동하는지 직접 손으로 확인. 거기서 하나 깨지면 wedge 자체가 깨짐.
