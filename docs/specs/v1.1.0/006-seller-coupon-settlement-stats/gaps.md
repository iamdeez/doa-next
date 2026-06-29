---
작성: Design Agent → Docs Agent 누적
버전: v1.0
최종 수정: 2026-06-30 01:41
상태: 확정 (retroactive)
---

# Gaps — 006-seller-coupon-settlement-stats

> 기획/설계 공백 누적 기록. 3단계 이후 모든 Agent 가 누적.

## 목차

- [신규 GAP](#신규-gap)
- [해결한 선행 설계 공백](#해결한-선행-설계-공백)

---

## 신규 GAP

### GAP-006-01

- **출처**: Design Agent / Test Agent (research·coverage-gap) / Docs Agent
- **유형**: 프론트 후속·테스트 자동화 한계 + 백엔드 응답 스키마 의존 (Low — 권고) — 쿠폰 cursor 더보기·발급 후
  목록 갱신·서버 에러 표면·낙관적 업데이트·e2e 부재 + 응답 스키마 미정의(view 타입 한시)
- **컨텍스트**: `apps/console/app/(dashboard)/seller/coupons/page.tsx`(cursor 미소비·발급 후 비갱신)·
  `seller/stats/page.tsx`·`seller/settlements/page.tsx`(e2e 부재)·`packages/shared-types/src/index.ts`
  (전이형 view 타입)·백엔드 통계·정산·쿠폰 라우트(응답 OpenAPI 미정의)
- **내용**:
  - (1) **쿠폰 cursor '더보기' 미구현** (Low) — `api.coupon.listSeller` facade 는 `cursor`·`take` 를
    지원하나, 화면은 인자 없이 호출하여 첫 페이지(`data.items`)만 렌더한다. 추가 로드 버튼·무한 스크롤 부재.
  - (2) **발급 후 목록 즉시 미반영** (Low) — `IssueCouponDialog` 의 `issue.onSuccess` 가 `['seller',
    'coupons']` 를 invalidate 하지 않아, 발급/총량(`issuedCount`) 컬럼이 발급 직후 즉시 갱신되지 않는다
    (다음 조회 시 반영 — 데이터 손상 아님).
  - (3) **서버 검증 에러 필드 매핑 부재** (Low) — 생성/발급 다이얼로그는 `ApiError` 메시지를 단일
    `ErrorText` 로 표시하며 필드별(할인값·만료일·대상 사용자) 인라인 서버 에러 매핑이 없다. 클라이언트
    검증(`validate`)은 010 서버 검증과 정합하나, 서버가 거부한 케이스의 표면이 거칠다.
  - (4) **낙관적 업데이트·e2e 미적용** (Low) — createSeller·issueSeller mutation 은 서버 응답 후 invalidate/
    닫기 방식(낙관적 미적용)이며, 통계·정산·쿠폰 화면에 e2e/단위 테스트가 없다(빌드/타입체크/정적/grep 갈음).
  - (5) **응답 스키마 미정의 → view 타입 한시** (Low) — 통계·정산·쿠폰 응답은 백엔드가 Prisma 엔티티를
    반환하고 OpenAPI 응답 content 가 미주석이다(87 ops 중 typed 2xx content 36건 — 001 GAP-001-01 연속).
    따라서 003 타입드 client 대신 `@doa/shared-types` 전이형 view 타입(금전 string) 8종을 한시 정의했다
    (004 GAP-004-01 와 동일 패턴).
- **수정 방향**:
  - (1)·(2) 쿠폰 화면에 cursor 기반 '더보기' 추가 로드를 구현하고, `issueSeller` `onSuccess` 에
    `invalidateQueries(['seller','coupons'])` 를 추가하여 발급 결과를 즉시 반영한다.
  - (3)·(4) 생성/발급 다이얼로그에 필드별 서버 에러 표면을 강화하고, `onMutate` 낙관적 업데이트 + 롤백을
    적용하며, Playwright e2e(통계 렌더·정산 표·쿠폰 생성 검증/제출/갱신·발급 성공)를 추가한다.
  - (5) 백엔드에 통계·정산·쿠폰 도메인별 응답 DTO + `@ApiResponse({ type })` 를 보강한 후 코드젠 재생성
    (`openapi:gen` → `gen`)하면 view 타입을 생성 타입(`Schemas['...']`)으로 대체 가능하다(004 GAP-004-01 (3)
    / 001 GAP-001-01 연속). 금전 필드는 Decimal→문자열이므로 대체 후에도 `string` 유지를 확인한다(P-005).
- **영향**: 낮음 — Phase 2 핵심 목표(판매자 매출 확인·정산 조회·쿠폰 생성/발급 화면 + console 디자인 토큰
  전면 통일)는 console typecheck 0·build 17 라우트 PASS·하드코딩 팔레트 0 으로 달성. (1)~(4)는 후속 UX·
  테스트 보강이며 핵심 운영 흐름은 동작한다. (5) view 타입 한시는 점진 보강 대상이다.
- **상태**: OPEN — 전부 Low(후속 위임). (1)~(4) 프론트 후속(쿠폰 더보기·발급 갱신·서버 에러 표면·낙관적·
  e2e)은 후속 차수로 이월, (5) 응답 스키마 보강은 001/004 GAP 연속(백엔드 후속). coverage-gap.md 와 동일
  사안. 004 GAP-004-01 (3)(응답 스키마 미정의)·(4)(Phase 2 프론트 보강)의 통계·정산·쿠폰 도메인 연속이며,
  006 은 그중 판매자 운영 화면 3종 + console 토큰 통일을 view 타입 + facade + 시맨틱 토큰으로 **구현**한다.

---

## 해결한 선행 설계 공백

| 식별자 | 선행 맥락 | 등급 | 006 해결 | 상태 |
|---|---|---|---|---|
| GAP-004-01 (4) (Phase 2 프론트 보강 — 운영 화면 부분) | 004 §범위 외 — "판매자 부가 운영 화면(통계·정산·쿠폰)" / FRONTEND-PLAN Phase 2 판매자 운영 화면 부재 | 후속 위임 | console 판매자 영역에 판매 통계(`/seller/stats`)·정산(`/seller/settlements`)·쿠폰(`/seller/coupons` — 목록+생성+발급) 화면 추가. 응답 OpenAPI 미정의 도메인을 전이형 view 타입 + `api.stats`/`api.settlement`/`api.coupon` facade 로 호출. 쿠폰 생성 클라이언트 검증(010 정합). AppShell 네비 3개 추가 | **RESOLVED (006, 커밋 1b3ffd1 — 판매자 통계·정산·쿠폰 화면 한정. cursor 더보기·발급 후 갱신·서버 에러 표면·낙관적·e2e·응답 스키마 보강은 GAP-006-01 후속)** |
| 디자인 토큰 화면 레벨 미통일 (002 후속) | 002 §후속 — `@doa/ui` 는 시맨틱 토큰 전환했으나 console 화면 페이지에 하드코딩 팔레트 잔존 | 후속 위임 | console 기존 화면 9개의 하드코딩 팔레트(`zinc/red/amber/green/bg-white`)를 @doa/design-tokens 시맨틱 토큰 클래스로 전환(하드코딩 0). 디자인 시스템을 화면 레벨까지 확장 | **RESOLVED (006, 커밋 1a6d70d — console 화면 하드코딩 팔레트 0. 다크 토글 UI 는 002 GAP-002-01 잔여)** |

> 006 은 004 GAP-004-01 (4)(Phase 2 프론트 보강) 중 **판매자 운영 화면(통계·정산·쿠폰)** 을 구현하되, 004 와
> 동일하게 응답 스키마가 미정의인 도메인이라 타입드 client 대신 view 타입 + facade 를 채택했다(응답 스키마
> 보강 후 생성 타입 대체 — GAP-006-01 (5)). 동시에 002 가 화면 레벨까지 닿지 못한 디자인 토큰을 console 전
> 화면에 통일했다(하드코딩 0). 쿠폰 cursor 더보기·발급 후 갱신·서버 에러 표면·낙관적 업데이트·e2e·다크 토글
> UI 는 후속(GAP-006-01 / 002 GAP-002-01)으로 유지된다.
