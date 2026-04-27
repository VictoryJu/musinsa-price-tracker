# Design — Musinsa Price Tracker (Chrome Extension)

**Date:** 2026-04-28
**Status:** Brainstorming → Planning
**Author:** VictoryJu

---

## 1. 목표 (Goal)

무신사 상품의 세일가가 자주 바뀌어서 "지금이 최저가인지" 판단하기 어렵다. 이 익스텐션은:

1. 사용자가 등록한 무신사 상품들을 백그라운드에서 자동 추적한다
2. 상품 페이지의 가격 옆에서 클릭 한 번으로 **현재가 vs 최저가 vs 평균가**를 즉시 비교할 수 있다
3. 추적 상품이 역대 최저가를 갱신하면 크롬 알림을 보낸다

## 2. 사용자 시나리오

1. 사용자가 무신사 상품 페이지(`musinsa.com/products/{id}`)에 접속
2. 가격 옆에 익스텐션이 주입한 [📊] 아이콘이 보임
3. 아이콘 클릭 → 인라인 팝오버:
   - 현재가: 37,700원
   - 최저가: 32,000원 (2주 전)
   - 평균가 (30일): 38,500원
   - 미니 라인 차트
   - [추적하기] 버튼
4. 추적 등록 후 백그라운드가 하루 2회 가격 수집
5. 최저가 갱신 시 크롬 알림: "무신사 — {상품명} 최저가 갱신: 31,500원"

## 3. 컴포넌트 아키텍처

### 3.1 Content Script (`src/content/`)

- 적용 대상: `https://www.musinsa.com/products/*`
- 페이지의 **세일가 DOM**을 추출 (셀렉터 정의 + 페이지 구조 변경 대비 fallback)
- 가격 옆 [📊] 아이콘 렌더링
- 클릭 시 팝오버 표시 (Shadow DOM으로 페이지 CSS 격리)
- 페이지 방문 자체로도 가격 1회 기록 (passive logging)

### 3.2 Background Service Worker (`src/background/`)

- `chrome.alarms`로 12시간 주기 스케줄
- 추적 중인 상품 목록 순회 → 각 상품 페이지/API fetch → 세일가 파싱 → 저장
- 호출 간 jitter (0~30s) 적용으로 봇 패턴 회피
- 최저가 갱신 감지 시 `chrome.notifications.create`

### 3.3 Popup (`src/popup/`)

- 툴바 아이콘 클릭 시 표시
- 추적 중인 상품 카드 목록 (썸네일/현재가/최저가/스파크라인)
- 추적 해제, 알림 ON/OFF 토글, 가격 정렬

## 4. 데이터 모델

`chrome.storage.local`:

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
    "globalNotifications": true
  }
}
```

## 5. 기술 스택

| 영역 | 선택 | 이유 |
|---|---|---|
| Manifest | V3 | 크롬 웹스토어 신규 등록 필수 |
| 언어 | Vanilla JS (또는 Preact ~5KB) | 의존성 최소, 빠른 부팅 |
| 빌드 | Vite + @crxjs/vite-plugin | 익스텐션 HMR + 자동 manifest 생성 |
| 차트 | uPlot (~40KB) | Chart.js 대비 가벼움, 시계열 충분 |
| 저장 | chrome.storage.local | 무제한 용량, 동기화 불필요 |
| 스케줄 | chrome.alarms | 서비스 워커 슬립 무관하게 발화 |
| 알림 | chrome.notifications | 표준 |

## 6. 결정 사항 (확정)

| # | 결정 | 선택 | 이유 |
|---|---|---|---|
| 1 | 범위 | 무신사 한정, 멀티 상품 | YAGNI — 다른 사이트는 V2에서 |
| 2 | 추적 가격 | 세일가만 | 사용자 실제 결제가에 가장 근접. 카드할인가는 사용자별로 달라 노이즈 |
| 3 | 수집 방식 | 백그라운드 자동 (12h) + 페이지 방문 시 passive | 사용자 비활성에도 데이터 누적 |
| 4 | 알림 | 최저가 갱신 시 | "맨날 바뀌어서 언제가 최저가인지" 핵심 욕구 |
| 5 | 백필 | 없음 (V1) | 무신사·다나와·웨이백 모두 신뢰 가능한 소스 부재. 다나와는 무신사 스탠다드 한정으로 V2 후보 |
| 6 | UI 진입점 | 가격 옆 [📊] 아이콘 → 인라인 팝오버 | 사용자 명시 요구사항 |
| 7 | 플랫폼 | Chrome 익스텐션 (Electron 아님) | 페이지 DOM 주입은 Content Script만 가능 |

## 7. 제약 (Known Limitations)

- **백필 불가:** 추적 시작 시점부터만 데이터 누적. UI에 "추적 N일째" 명시
- **Chrome 활성 의존:** 백그라운드 수집은 Chrome 실행 중일 때만. 24/7 보장 불가
- **봇 차단 리스크:** 무신사 `robots.txt`는 일반 크롤러 차단. 하루 2회 + jitter로 완화
- **상품당 단일 가격:** 옵션(사이즈/색상)별 가격 차이는 V1 무시 → 대표 세일가만 추적

## 8. 미결정 (Planning 단계 이월)

- 추적 등록 인터랙션 (별도 [+] 버튼 vs 팝오버 안 [추적하기] 버튼 단일)
- 데이터 보관 기간 (영구 vs 1년 슬라이딩)
- 가격 DOM 셀렉터 fallback 전략 (DOM → JSON-LD → 내부 API 순)
- 옵션별 가격 처리 (V2)
- 다나와 백필 (V2 후보)

## 9. Out of Scope (V1)

- 멀티 쇼핑몰 (쿠팡, 29CM, 네이버 쇼핑)
- 옵션별 가격
- 다나와 백필
- 클라우드 동기화 (`chrome.storage.sync`, 백엔드)
- 가격 비교 추천 ("이 상품 다른 곳에서 더 쌉니다")
- 위시리스트 / 폴더링

## 10. 리뷰 포인트

다른 엔지니어/리뷰어가 이 디자인을 볼 때 특히 검증해주길 원하는 부분:

1. **컴포넌트 분리 적정성** — Content Script / Background / Popup 책임 분담이 명확한가
2. **데이터 모델** — `products[id].history` 배열이 무한 증가하면 storage quota 이슈?
3. **봇 차단 회피 전략** — 하루 2회 + jitter면 충분한가? User-Agent / Referer 어떻게?
4. **세일가 추출 신뢰성** — DOM이 바뀌면 실패. fallback 우선순위는?
5. **알림 중복 방지** — 같은 최저가 갱신을 두 번 알림 보내지 않으려면?
6. **누락된 V1 기능** — 이 스코프로 진짜 사용자 가치가 나오는가?
