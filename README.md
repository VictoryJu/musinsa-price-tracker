# Musinsa Price Tracker

무신사(musinsa.com) 상품의 가격 변동을 자동 추적하는 크롬 익스텐션.

상품 페이지의 가격 옆에서 클릭 한 번으로 **현재가 vs 최저가 vs 평균가**를 비교하고, 최저가가 갱신되면 크롬 알림을 받습니다.

## Status

> Design / Planning — 코드는 아직 없습니다.

자세한 설계: [docs/superpowers/specs/2026-04-28-musinsa-price-tracker-design.md](docs/superpowers/specs/2026-04-28-musinsa-price-tracker-design.md)

## 핵심 기능 (V1)

- 무신사 상품 멀티 추적 (세일가 기준)
- 상품 페이지 인라인 팝오버: 현재가 vs 최저가 vs 평균가 + 미니 그래프
- 백그라운드 자동 수집 (하루 2회)
- 최저가 갱신 시 크롬 알림

## 기술 스택

Manifest V3 · Vanilla JS · Vite + @crxjs/vite-plugin · chrome.storage.local · chrome.alarms · chrome.notifications · uPlot

## V1 제외 (Out of Scope)

멀티 쇼핑몰 / 옵션별 가격 / 클라우드 동기화 / 다나와 백필.
