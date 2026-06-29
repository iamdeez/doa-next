---
작성: Spec Agent
버전: v1.0
최종 수정: 2026-06-30 01:41
상태: 확정 (retroactive)
---

# Spec Input: 006-seller-coupon-settlement-stats

> 수집 일시: 2026-06-30 | 맥락: 004·005(판매자 주문·배송) 다음 단계 = FRONTEND-PLAN Phase 2 판매자 부가
> 운영 화면(통계·정산·쿠폰) + 병행 디자인 토큰 통일 → 정식 SDD 문서화. 사용자 지시: "다음 진행 = Phase 2 +
> 병행 토큰 통일".

## 목차

- [수집 진행 상태](#수집-진행-상태)
- [원 요청 맥락](#원-요청-맥락)
- [질문 분석 근거](#질문-분석-근거-question-analysis-basis)
- [카테고리별 수집 내용](#카테고리별-수집-내용)

## 수집 진행 상태

| 카테고리 | 상태 | 답변 완료 항목 |
|---|---|---|
| 1. 배경 및 목적 | 완료 | [Q1, Q2, Q3] |
| 2. 사용자 & 이해관계자 | 완료 | [Q4] |
| 3. 핵심 기능 | 완료 | [Q-A~G] |
| 4. 데이터 & 입출력 | 완료 | [Q-H] |
| 5. 제약조건 | 완료 | [Q5] |
| 6. 예외 & 실패 시나리오 | 완료 | [Q6] |

## 원 요청 맥락

사용자 지시: **004·005(판매자 주문·배송) 다음 단계 = FRONTEND-PLAN Phase 2 판매자 부가 운영 화면 + 병행
디자인 토큰 통일**. 004·005 가 Phase 1(판매자 주문 이행)을 완성했으나 console 에 판매자 매출 통계·정산·쿠폰
화면이 없었고, 002 가 `@doa/ui` 를 시맨틱 토큰으로 전환했으나 console 화면 페이지에는 하드코딩 팔레트가
잔존했다. 006 은 판매 통계(`/seller/stats`)·정산(`/seller/settlements`)·쿠폰(`/seller/coupons` — 목록 +
생성 다이얼로그 + 발급 다이얼로그) 화면을 추가하고, 응답 스키마가 OpenAPI 미정의인 통계·정산·쿠폰
엔드포인트를 전이형 view 타입 + 도메인 facade 로 호출하며, 쿠폰 생성 폼에 010 서버 검증과 정합되는 클라이언트
검증을 적용하고, 병행하여 console 전 페이지의 하드코딩 팔레트를 시맨틱 토큰으로 통일한다. 본 문서는 그 구현
(커밋 `1b3ffd1` Phase 2 화면 + `1a6d70d` 토큰 통일)을 정식 SDD 포맷으로 보강하기 위한 입력 재구성이다
(FRONTEND-PLAN Phase 2 판매자 화면 / DESIGN-PLAN 토큰 일관성 연속).

## 질문 분석 근거 (Question Analysis Basis)

| 질문 ID | 요지 | 옵션·근거 | 채택 결과 |
|---|---|---|---|
| Q-A | 응답 호출 도구 (타입드 client vs facade) | A:003 타입드 `api.client.GET` / B:`api.http` 기반 도메인 facade + view 타입 | **B 채택**(통계·정산·쿠폰 응답 스키마가 OpenAPI 미정의(Prisma 엔티티 반환 — 001 coverage-gap)여서 타입드 client 의 응답 타입이 비어 이점이 적음. 004 와 동일 — view 타입 + facade) |
| Q-B | 응답 타입 정의 위치 | A:화면 로컬 타입 / B:`@doa/shared-types` 전이형 view 타입 | **B 채택**(공유 패키지에 view 타입 8종 정의 — 금전 Decimal→문자열. 백엔드 응답 DTO 보강 후 생성 타입 대체 예정 — FR-006) |
| Q-C | 쿠폰 생성/발급 UI 패턴 | A:별도 라우트 페이지 / B:Radix Dialog(목록 화면 내 모달) | **B 채택**(002 산출 Radix Dialog — 포커스 트랩·ESC·ARIA. 목록 화면에서 생성·발급을 모달로 — FR-004·005, NFR-004) |
| Q-D | 쿠폰 검증 위치 | A:클라이언트만 / B:백엔드만 / C:클라이언트(UX) + 백엔드(강제) | **C 채택**(클라이언트 `validate`(discountValue>0, PERCENTAGE 1~100)는 제출 전 즉시 피드백, 실제 강제는 백엔드 010 서버 검증. 정합 — NFR-002) |
| Q-E | 정산 데이터 형태 | A:CursorPage / B:전체 배열 | **B 채택**(`GET /settlements` 는 `SettlementView[]` 전체 배열. 판매자 본인 정산 규모로 충분 — 서버 페이지네이션 범위 외) |
| Q-F | 토큰 통일 범위 | A:Phase 2 신규 화면만 / B:console 전 화면(기존 9개 포함) | **B 채택**(002 디자인 시스템을 화면 레벨까지 확장 — 기존 9개 페이지 하드코딩 팔레트 전환, 하드코딩 0 — FR-009·NFR-003) |
| Q-G | 금전 표기 | Decimal→문자열 `formatKRW`(004 헬퍼 재사용) | **채택**(view 타입 금전 필드 `string`, 기존 `lib/order.ts` `formatKRW` 재사용 — 신규 헬퍼 없음 — NFR-001·P-005) |
| Q-H | 재고 화면 추가 여부 | A:신규 재고 화면 추가 / B:기존 상품 상세에 통합됨(추가 불요) | **B 채택**(재고는 `/seller/products/[id]` 에 이미 통합 — 별도 화면 불필요. 범위 외) |

## 카테고리별 수집 내용

### [카테고리 1] 배경 및 목적

Q1. 왜 만드는가?
- 004·005 가 판매자 주문 이행(Phase 1)을 완성했으나 매출 통계·정산·쿠폰 등 판매자 부가 운영 화면이 부재.
  동시에 002 디자인 시스템이 `@doa/ui` 까지만 적용되고 console 화면 페이지에는 하드코딩 팔레트가 잔존.
  Phase 2 운영 화면 + 화면 레벨 토큰 통일을 함께 수행.

Q2. 현재 어떻게? (006 이전)
- console 판매자 영역에 상품·주문·배송 화면만 존재. 통계·정산·쿠폰 화면 없음. 백엔드는 통계·정산·쿠폰
  라우트를 이미 제공하나 소비 UI 부재. 응답 스키마는 OpenAPI 미정의(004 와 동일). 기존 화면 9개는 하드코딩
  팔레트(`zinc/red/amber/green/bg-white`) 사용.

Q3. 성공 판단 기준
- `/seller/stats`(매출·완료주문 카드)·`/seller/settlements`(정산 테이블)·`/seller/coupons`(목록 + 생성/발급
  다이얼로그) 렌더. 쿠폰 생성 클라이언트 검증. console typecheck 0·build 17 라우트 PASS·하드코딩 팔레트 0
  (기존 화면 회귀 0).

### [카테고리 2] 사용자 & 이해관계자

Q4. 사용자 역할
- 판매자(console): 운영 데이터 확인·쿠폰 발급 주체 — 매출 통계·정산 조회·쿠폰 생성/발급.
- 백엔드 개발자: 통계·정산·쿠폰 라우트 + 쿠폰 서버 검증(010) 제공 주체. 응답 DTO 미정의(view 타입 한시 정의
  사유 — GAP-006-01).
- 디자이너/프론트엔드 개발자: 디자인 시스템 일관성 수혜자 — 화면 레벨 시맨틱 토큰 적용으로 팔레트 교체·
  다크모드 분기가 화면까지 작동.

### [카테고리 3] 핵심 기능

**Must:**
- `apps/console/app/(dashboard)/seller/stats/page.tsx`(신규): `api.stats.seller()` → `StatCard` 2개(누적
  매출·완료 주문 수).
- `apps/console/app/(dashboard)/seller/settlements/page.tsx`(신규): `api.settlement.listMine()` → Table
  (정산 기간·총 매출·수수료·지급액·상태 Badge).
- `apps/console/app/(dashboard)/seller/coupons/page.tsx`(신규): `api.coupon.listSeller()`(`CursorPage<Coupon>`)
  → Table + `CreateCouponDialog`(Radix Dialog, 클라이언트 검증, invalidate) + `IssueCouponDialog`(targetUserId).
- `packages/api-client/src/index.ts`: `stats`(seller)·`settlement`(listMine)·`coupon`(listSeller·createSeller·
  issueSeller) facade 추가.
- `packages/shared-types/src/index.ts`: 통계·정산·쿠폰 view 타입 8종(`SellerStats`·`SettlementStatus`·
  `SettlementView`·`CouponType`·`Coupon`·`CreateCouponRequest`·`IssueCouponRequest`·`UserCoupon`).
- `apps/console/app/(dashboard)/layout.tsx`: "쿠폰"·"정산"·"판매 통계" 네비 3개 추가.
- console 기존 화면 9개: 하드코딩 팔레트 → 시맨틱 토큰 전환(하드코딩 0).

**제외(Out of Scope):**
- 쿠폰 cursor '더보기', 서버 검증 에러 필드 매핑, 낙관적 업데이트, 정산/통계 기간 필터·차트, 재고 별도
  화면(기존 통합), 다크모드 토글 UI.

### [카테고리 4] 데이터 & 입출력

- 백엔드 라우트(실제): `GET /seller/stats`(요약)·`GET /settlements`(정산 배열)·`GET /sellers/me/coupons`
  (cursor 쿠폰 목록)·`POST /sellers/me/coupons`(CreateCouponDto → Coupon)·`POST /sellers/me/coupons/:id/issue`
  (IssueCouponDto: targetUserId → UserCoupon).
- view 타입: `SellerStats`(salesTotal[string]·orderCount[number])·`SettlementView`(periodStart/End·
  totalSales·commission·payoutAmount[string]·status)·`Coupon`(type·discountValue[string]·maxDiscountAmount·
  minOrderAmount·expiresAt·totalQuantity·issuedCount 등)·`UserCoupon`(couponId·userId·status).
- facade: `api.stats.seller`·`api.settlement.listMine`·`api.coupon.{listSeller,createSeller,issueSeller}`
  (`api.http` 기반).

### [카테고리 5] 제약조건

Q5. 기술 스택 제약
- Next.js 15(App Router) + TanStack Query(useQuery/useMutation/invalidate) + Radix Dialog + `@doa/ui`
  시맨틱 토큰.
- 응답 스키마 미정의(001 coverage-gap)로 타입드 client 대신 view 타입 + facade(004 연속).
- 금전 Decimal→문자열(부동소수점 금지 — P-005, `formatKRW` 재사용). console typecheck/build 회귀 0(NFR-006).
- 쿠폰 클라이언트 검증은 백엔드 010 서버 검증과 정합(NFR-002).

### [카테고리 6] 예외 & 실패 시나리오

Q6. 엣지 케이스
- 비판매자 접근 → 각 화면 `EmptyState`("판매자 미등록"). 실제 강제는 백엔드(APPROVED 판매자).
- 쿠폰 할인값 오류 → 클라이언트 `validate`(discountValue>0, PERCENTAGE 1~100)가 제출 전 차단(`ErrorText`).
  백엔드 010 이 최종 강제. 클라이언트 통과 값도 백엔드가 재검증(서버 거부 시 `ApiError` 메시지 표시).
- 쿠폰 cursor → facade 는 cursor/take 지원하나 화면은 첫 페이지만 렌더(더보기 미구현 — 범위 외).
- 응답 타입 → 백엔드 OpenAPI 응답 미정의(Prisma 엔티티 반환). 전이형 view 타입으로 한시 정의(생성 타입 대체
  예정 — GAP-006-01).
- 금전 부동소수점 → Decimal 문자열을 `formatKRW`가 `Number().toLocaleString`으로 표기(비유한값은 원문 표기).
