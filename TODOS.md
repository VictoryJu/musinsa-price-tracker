# TODOS — V1 Implementation Checklist

Design doc(`docs/superpowers/specs/2026-04-28-musinsa-price-tracker-design.md`)에서 명시되었으나 구현 시 누락하기 쉬운 항목 체크리스트. Eng review (Codex + Claude)에서 "Missing from V1"로 짚힌 것 중심.

## P1 — V1 출시 전 반드시

### Core 인프라
- [ ] **Persisted scheduling state** — `nextCheckAt`, `lastCheckedAt`. MV3 worker 죽어도 resume safe
- [ ] **Notification dedup** — `lastNotified: { price, ts }` 영구화 + check-and-set in single transaction
- [ ] **Out-of-order sample merge** — timestamp-aware. 늦게 도착한 옛날 데이터가 새 데이터 덮어쓰기 금지
- [ ] **Background-only storage writes** — multi-tab race 방지. content script은 message passing만
- [ ] **Schema versioning** — `schemaVersion: 1` 키 + extension update 시 migration 함수
- [ ] **History 월별 청크 분리** — `history: { "id:YYYY-MM": [...] }`. write amplification 방지
- [ ] **365일 retention sliding window** — 매 fetch 후 prune
- [ ] **Precomputed stats** — `allTimeLow`, `avg30d`, `min30d`, `max30d`. 매 fetch 후 갱신

### 추출 / 검증
- [ ] **JSON-LD primary path** — `<script type="application/ld+json">` Offer.price
- [ ] **Visible textContent 검증** — JSON-LD 가격이 페이지 보이는 가격과 일치 확인
- [ ] **CSS selector fallback** — page-specific selector spec
- [ ] **Internal API last resort** — 사용 시 risk 명시
- [ ] **세일가 only 단정** — 멤버가/쿠폰가/앱전용가 무시. 정상가+세일가 동시 시 세일가
- [ ] **품절/단종 detection** — `status: "soldOut"`, 차트 그 시점 break
- [ ] **변종 (옵션별) 감지** — 사이즈/색상별 가격 다를 때 사용자에게 알림 (V1은 추적 안 함)

### UX
- [ ] **소크 단계 진행도 표시** — "데이터 수집 중 N일째 / D-X"
- [ ] **분석 단계 임계 (≥20 samples + ≥14일)** — 둘 다 충족해야 별점/sparkline 활성
- [ ] **수동 refresh "지금 체크"** — popup + 페이지 팝오버 양쪽
- [ ] **추적 상태 페이지 표시** — 라벨에 "추적 중 N일째" or "[추적 시작] CTA"
- [ ] **에러 UI**:
  - [ ] "가격 추출 실패 ⚠️" — DOM 추출 실패 시
  - [ ] "fetch 차단됨" — 무신사 봇 차단 시
  - [ ] "마지막 업데이트: N시간 전" — staleness ≥ 24h
- [ ] **호버 delay 300ms** — 즉시 호버 noise 방지
- [ ] **Inline SVG sparkline (~2KB)** — uPlot은 popover에서만
- [ ] **Shadow DOM `:host { all: initial }`** — 무신사 CSS 충돌 방지
- [ ] **단일 추적 진입점** — 팝오버 안 [추적] 토글만. 별도 [+] 버튼 X

### 데이터 위생
- [ ] **URL canonicalization** — 쿼리 파라미터 제거, 리다이렉트 normalize. 같은 상품 두 번 추적 방지
- [ ] **Percentile-based buyability** — 절대 % 아닌 30일 분포 위치
- [ ] **권한 최소화 (manifest)** — `*://*.musinsa.com/products/*`만. 전체 도메인 X
- [ ] **데이터 가져오기/내보내기/리셋** — popup settings. JSON 형식
- [ ] **Settings 저장** — soak period, 보존 기간, 알림 ON/OFF 사용자 조정 가능

### Tests (구현과 동시)

**핵심 wedge 테스트 (★★★)**
- [ ] `price-extraction.test.ts` — JSON-LD primary path + visible 검증
- [ ] `price-extraction.test.ts` — CSS selector fallback
- [ ] `price-extraction.test.ts` — Internal API last-resort
- [ ] `price-extraction.test.ts` — 세 path 모두 실패 시 graceful degradation (status: failed)
- [ ] `price-extraction.test.ts` — 정상가+세일가 동시 → 세일가 선택
- [ ] `price-extraction.test.ts` — 품절 detection
- [ ] `price-extraction.test.ts` — 변종 감지 → 사용자 알림 emit
- [ ] `buyability.test.ts` — percentile boundary 케이스
- [ ] `buyability.test.ts` — 데이터 < 20개일 때 disabled
- [ ] `buyability.test.ts` — 데이터 ≥ 20개 + 14일 후 enabled

**인프라 테스트 (★★)**
- [ ] `scheduler.test.ts` — persisted nextCheckAt resume after worker death simulation
- [ ] `scheduler.test.ts` — alarm 단위 chunk 처리 (no big loop)
- [ ] `notification.test.ts` — dedup with lastNotified check-and-set
- [ ] `notification.test.ts` — out-of-order sample doesn't retrigger
- [ ] `notification.test.ts` — same low price on later date → 알림 안 가게
- [ ] `storage.test.ts` — 365일 retention prune
- [ ] `storage.test.ts` — write amplification 측정 (history split 효과)
- [ ] `storage.test.ts` — schema migration 1 → 2 simulation
- [ ] `storage.test.ts` — multi-tab race (background-only writes 검증)

**UI 테스트 (★)**
- [ ] `label-render.test.ts` — Shadow DOM 생성 + 가격 옆 인서트
- [ ] `label-render.test.ts` — 소크/분석 단계 분기 표시
- [ ] `label-render.test.ts` — 호버 300ms delay 후 sparkline mount

## P2 — V1.1 후보 (소크 + dogfood 통과 후)

- [ ] **Debugging surface 정식화** — popup hidden tab. extractorPath/lastError/lastFetch 시각
- [ ] **Remote kill-switch / 셀렉터 hot-update** — 무신사 DOM deploy 시 빠른 대응
- [ ] **변종(옵션별) 가격 individual tracking** — 사이즈/색상별 별도 추적
- [ ] **Soak period 사용자 조정** — settings에서 7~30일 변경
- [ ] **Chrome Web Store 등록** — privacy policy, icon set, screenshots
- [ ] **다나와 백필 시도** — 무신사 스탠다드 SKU 한정

## V2 후보

- [ ] 자연어 어드바이저 ("지금 사지 마세요. 평소보다 12% 비쌈")
- [ ] 카테고리 전체 가격 비교
- [ ] 위시리스트 폴더링 / 알림 그룹
- [ ] 멀티 쇼핑몰 (29CM, 쿠팡, 네이버)
- [ ] chrome.storage.sync / 백엔드 동기화

## 구현 Lane (병렬 가능)

| Lane | 영역 | 시작 조건 |
|---|---|---|
| **A** | 가격 파이프라인: extractor + validator + storage + scheduler | 즉시 |
| **B** | UI render: content script Shadow DOM + label + sparkline + popover | A의 storage shape 정의 후 (mock fixture로 병렬도 가능) |
| **C** | Popup: 추적 목록, settings, debug, import/export | A의 storage shape 정의 후 |

순서: A 시작 → B + C mock 병렬 합류 → 통합.
