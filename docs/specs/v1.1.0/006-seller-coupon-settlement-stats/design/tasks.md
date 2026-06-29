---
작성: Design Agent
버전: v1.0
최종 수정: 2026-06-30 01:41
상태: 확정 (retroactive — 전 태스크 구현 완료)
---

# Tasks: 006-seller-coupon-settlement-stats

> Branch: 006-seller-coupon-settlement-stats | Date: 2026-06-30 | Plan: [../planning/plan.md](../planning/plan.md)

## 목차

- [전제 조건](#전제-조건)
- [태스크 목록](#태스크-목록)
- [Test Authoring Contract](#test-authoring-contract)
- [구현 완료 기준](#구현-완료-기준)

---

## 전제 조건

- [x] spec.md 의 모든 [NEEDS CLARIFICATION] 항목 해소(미결 사항: 없음)
- [x] plan.md Constitution Gates(P-001~P-007) 통과(예외 0건, 신규 의존 0 — P-002 무저촉)
- [x] CHANGES.md 의 이전 작업(005·004·003) "후속 작업 시 주의사항" 확인 — 004 의 "응답 view 타입 한시성"·
      "권한은 백엔드 강제(UI 표시 분기)"·"formatKRW 재사용" 이 본 차수 view 타입·facade·금전 표기의 직접
      배경. 005 의 "응답 view 타입 한시성(004 연속)" 도 연속
- [x] 선택 단계 전부 N(Database Design·Deploy·Security·Performance — selection-phases.md)

> A = 타입 계약(view 타입), B = 공유 인프라(facade), C = 화면(통계·정산·쿠폰·셸·토큰), D = 검증(타입체크·
> 빌드·정적). 레이어 A→B→C→D 의존 순. 본 차수는 `@doa/ui` 변경이 없어(기존 컴포넌트 재사용) B 레이어는
> facade 만.

---

## 태스크 목록

> 레이어: A 타입 계약 / B 공유 인프라 / C 화면 / D 검증(5a/5b).

### Step 1. 타입 계약 — view 타입 (A)

- [x] **T001** — 통계·정산·쿠폰 view 타입 정의
  - 레이어: A
  - 구현 파일: `packages/shared-types/src/index.ts`
  - 관련 요구사항: FR-006, NFR-001, NFR-002
  - 상세: `SellerStats`(salesTotal string·orderCount number)·`SettlementStatus`(pending/completed)·
    `SettlementView`(금전 string)·`CouponType`(FIXED/PERCENTAGE)·`Coupon`(discountValue string·
    maxDiscountAmount/minOrderAmount string|null)·`CreateCouponRequest`·`IssueCouponRequest`(targetUserId)·
    `UserCoupon`. 백엔드 응답 OpenAPI 미정의(Prisma 엔티티)이므로 전이형 view 타입. 금전 필드 Decimal→문자열.
  - 완료 기준: view 타입 8종 정의, 금전 필드 `string`.

### Step 2. 공유 인프라 — facade (B)

- [x] **T002** — stats·settlement·coupon 도메인 facade 추가
  - 레이어: B (T001 완료 후)
  - 구현 파일: `packages/api-client/src/index.ts`
  - 관련 요구사항: FR-007
  - 상세: `createApiClient` 반환에 `stats.seller`·`settlement.listMine`·`coupon.{listSeller,createSeller,
    issueSeller}` 추가. `api.http` 기반(`http.get/post`), view 타입 응답 제네릭. `listSeller` 는
    `{ query: { cursor, take } }`. 기존 facade 불변.
  - 완료 기준: 3 facade(stats·settlement·coupon) 5 메서드, 기존 facade·client·http 불변.

### Step 3. 화면 — 통계·정산·쿠폰·셸·토큰 (C)

- [x] **T003** — 판매 통계 화면
  - 레이어: C (T002 완료 후)
  - 구현 파일: `apps/console/app/(dashboard)/seller/stats/page.tsx`(신규)
  - 관련 요구사항: FR-001, NFR-001, NFR-005
  - 상세: `useQuery(['seller','stats'], api.stats.seller, { enabled: isSeller })`. `StatCard` 2개(누적 매출
    `formatKRW(salesTotal)`·완료 주문 수 `orderCount.toLocaleString('ko-KR')`건). 로딩·에러·비판매자 분기.
  - 완료 기준: StatCard 2개 렌더·상태 분기.

- [x] **T004** — 정산 내역 화면
  - 레이어: C (T002 완료 후)
  - 구현 파일: `apps/console/app/(dashboard)/seller/settlements/page.tsx`(신규)
  - 관련 요구사항: FR-002, NFR-001, NFR-005
  - 상세: `useQuery(['seller','settlements'], api.settlement.listMine, { enabled: isSeller })`. Table
    (정산 기간·총 매출·수수료 `−formatKRW`·지급액·상태 Badge). status `completed`→지급완료(success)·그 외→
    정산대기(warning). 빈 목록·비판매자 분기.
  - 완료 기준: Table 렌더·상태 Badge 매핑·금액 formatKRW.

- [x] **T005** — 쿠폰 화면(목록 + 생성 + 발급)
  - 레이어: C (T002 완료 후)
  - 구현 파일: `apps/console/app/(dashboard)/seller/coupons/page.tsx`(신규)
  - 관련 요구사항: FR-003, FR-004, FR-005, NFR-002, NFR-004, NFR-005
  - 상세: `useQuery(['seller','coupons'], api.coupon.listSeller)`(`CursorPage<Coupon>`, `data.items` Table).
    `CreateCouponDialog`(Radix Dialog — Select(type)·Input(discountValue/minOrderAmount/totalQuantity/
    expiresAt)·`validate`(discountValue>0·PERCENTAGE 1~100)·`createSeller` `onSuccess` invalidate+닫기).
    `IssueCouponDialog`(Radix Dialog — targetUserId·`issueSeller` `onSuccess` 성공 문구+닫기). 로딩·에러·빈·
    비판매자 분기.
  - 완료 기준: 목록 Table·생성 다이얼로그(검증·invalidate)·발급 다이얼로그.

- [x] **T006** `[P]` — AppShell 네비 추가
  - 레이어: C
  - 구현 파일: `apps/console/app/(dashboard)/layout.tsx`
  - 관련 요구사항: FR-008
  - 상세: `NAV` 판매자 섹션에 `쿠폰`(`/seller/coupons`)·`정산`(`/seller/settlements`)·`판매 통계`
    (`/seller/stats`) 3개 추가(`isSeller` 한정 노출). (layout 토큰은 004 에서 이미 전환됨 — 본 차수 토큰
    대상 아님.)
  - 완료 기준: 네비 3개 추가.

- [x] **T007** `[P]` — console 기존 화면 토큰 통일
  - 레이어: C
  - 구현 파일: `login`·`dashboard`·`account/profile`·`account/addresses`·`account/wishlist`·
    `seller/products`·`seller/products/[id]`·`seller/products/new`·`seller/register` page.tsx (9개)
  - 관련 요구사항: FR-009, NFR-003, NFR-006
  - 상세: 하드코딩 팔레트(`zinc/red/amber/green/bg-white`)를 시맨틱 토큰 클래스(`bg-surface`·`text-foreground`·
    `text-muted-foreground`·`text-subtle-foreground`·`border-border`·`divide-border`·`bg-muted`·
    `rounded-card`·`text-danger`·`bg-warning-soft`·`border-warning`·`text-warning(-foreground)` 등)로 전환.
    구조·props 불변(클래스명만 교체).
  - 완료 기준: console 화면 하드코딩 팔레트 0건(grep 확인), 동작 회귀 0.

### Step 4. 검증 (D 레이어 — 5a/5b)

> 본 차수는 UI 화면으로 별도 e2e/단위 테스트 스위트를 작성하지 않는다(빌드/타입체크 갈음). D 레이어는
> **타입체크 + console 빌드 + 정적 구조 검증**으로 SC 를 판정한다(5a 는 검증 시나리오 정의, 5b 는 실행·
> 확인). test-cases.md / coverage.md 참조.

- [x] **T008** — 검증 시나리오 정의 (5a Test Agent AUTHORING)
  - 검증 대상: SC-001(통계)·SC-002(정산)·SC-003(쿠폰 목록+생성)·SC-004(쿠폰 발급)·SC-005(view 타입·
    facade)·SC-006(네비·토큰·회귀 0)
  - 산출물: test-cases.md(통계 렌더·정산 렌더·쿠폰 목록/생성/발급·view 타입·금전 포맷·토큰 — 단위/e2e 아닌
    빌드/타입/정적 기반)
  - 신규 단위/e2e 테스트 it() 0건(UI 화면 — 빌드/타입/정적 갈음)

- [x] **T009** — 게이트 실행·확인 (5b Test Agent EXECUTION)
  - 실행: `pnpm --filter console typecheck`(0 error) / `pnpm --filter console build`(17 라우트 PASS —
    신규 `/seller/stats`·`/seller/settlements`·`/seller/coupons` 포함) / 정적 구조 검증(쿠폰 클라이언트
    검증·발급 분기·view 타입·facade·금전 포맷·네비·하드코딩 0 grep)
  - 산출물: coverage.md·coverage-gap.md·test-report.md

---

## Test Authoring Contract

> **5a Test Agent(AUTHORING) 입력 contract**. 본 차수는 UI 화면으로 단위/e2e 테스트 it() 를 추가하지 않으며,
> 검증은 타입체크·console 빌드·정적 구조 검증으로 갈음한다(추측 단언 금지 — 직접 코드 리뷰/빌드/grep).

### 검증 canonical 대상

| 대상 | canonical 형태 |
|---|---|
| 판매 통계 | `stats/page.tsx` — `useQuery(['seller','stats'], api.stats.seller)` + StatCard 2개(formatKRW·toLocaleString) |
| 정산 | `settlements/page.tsx` — `useQuery(api.settlement.listMine)` + Table(상태 Badge completed/pending·formatKRW) |
| 쿠폰 목록 | `coupons/page.tsx` — `useQuery(api.coupon.listSeller)` `CursorPage<Coupon>` `data.items` Table |
| 쿠폰 생성 | `coupons/page.tsx` `CreateCouponDialog` — Radix Dialog·`validate`·`createSeller` `onSuccess` invalidate `['seller','coupons']` |
| 쿠폰 발급 | `coupons/page.tsx` `IssueCouponDialog` — `issueSeller(id, { targetUserId })` `onSuccess` 성공 문구+닫기 |
| view 타입 | `shared-types/index.ts` — `SellerStats`·`SettlementView`·`Coupon`·`UserCoupon` 등 8종(금전 string) |
| facade | `api-client/index.ts` — `stats.seller`·`settlement.listMine`·`coupon.{listSeller,createSeller,issueSeller}` |
| 네비 | `layout.tsx` — `/seller/coupons`·`/seller/settlements`·`/seller/stats` 3개(section seller) |
| 토큰 통일 | console 화면 9개 — 하드코딩 팔레트 0(grep `zinc/red/amber/green-NN`·`bg-white`) |
| 타입체크/빌드 | `pnpm --filter console typecheck`·`pnpm --filter console build`(17 라우트) |

### 검증 재현 규약

- **SC-001(통계)**: `stats/page.tsx` grep `api.stats.seller` + `StatCard`·`formatKRW(data.salesTotal)`·
  `data.orderCount.toLocaleString`. `console build` 에 `/seller/stats` 라우트 컴파일.
- **SC-002(정산)**: `settlements/page.tsx` grep `api.settlement.listMine` + Table + `s.status === 'completed'`
  분기(지급완료/정산대기 Badge) + `formatKRW`. `console build` 에 `/seller/settlements` 컴파일.
- **SC-003(쿠폰 목록+생성)**: `coupons/page.tsx` `api.coupon.listSeller`(`data.items`) + `CreateCouponDialog`
  (`validate`·`createSeller` `onSuccess` invalidate). `console build` 에 `/seller/coupons` 컴파일.
- **SC-004(쿠폰 발급)**: `coupons/page.tsx` `IssueCouponDialog` `api.coupon.issueSeller` + `targetUserId`
  비활성화·`issue.isSuccess` 성공 문구.
- **SC-005(view 타입·facade)**: `shared-types/index.ts` view 타입 8종(금전 string) + `api-client/index.ts`
  stats·settlement·coupon facade.
- **SC-006(네비·토큰·회귀)**: `layout.tsx` 네비 3개 + console 화면 하드코딩 팔레트 0(grep). `console
  typecheck` 0·`build` 17 라우트 PASS.

### SC → 검증 매핑

| SC-ID | 수용 기준 | 검증 방법 | 비고 |
|---|---|---|---|
| SC-001 | 통계 StatCard·formatKRW | stats/page.tsx grep + console typecheck/build | [env:typecheck][env:build] |
| SC-002 | 정산 Table·상태 Badge | settlements/page.tsx grep + console typecheck/build | [env:typecheck][env:build] |
| SC-003 | 쿠폰 목록+생성(검증·invalidate) | coupons/page.tsx 코드 리뷰 + console build | [env:static][env:typecheck][env:build] |
| SC-004 | 쿠폰 발급 | coupons/page.tsx 코드 리뷰 | [env:static] IssueCouponDialog |
| SC-005 | view 타입·facade | shared-types·api-client 코드 리뷰 | [env:static][env:typecheck] |
| SC-006 | 네비·토큰·회귀 0 | layout·9화면 grep + console typecheck/build | [env:static][env:typecheck][env:build] |

---

## 구현 완료 기준

- [x] 모든 A·B·C 태스크 체크박스 완료(4단계), D 검증 시나리오 완료(5a/5b)
- [x] `shared-types/index.ts` — view 타입 8종(금전 string) `[TypeScript]`
- [x] `api-client/index.ts` — stats·settlement·coupon facade 추가, 기존 facade·client·http 불변
- [x] `stats/page.tsx`(신규) — StatCard 2개(매출·완료주문)
- [x] `settlements/page.tsx`(신규) — Table·상태 Badge·formatKRW
- [x] `coupons/page.tsx`(신규) — 목록·생성 다이얼로그(검증·invalidate)·발급 다이얼로그
- [x] `layout.tsx` — "쿠폰"·"정산"·"판매 통계" 네비 3개 추가
- [x] console 기존 화면 9개 — 하드코딩 팔레트 → 시맨틱 토큰(하드코딩 0)
- [x] `pnpm --filter console typecheck` 0 error + `pnpm --filter console build` 17 라우트 PASS(회귀 0)
- [x] 신규 의존 0(`package.json` 변경 없음 — P-002 무저촉)
- [x] git status 의도치 않은 파일 없음(15파일 변경, 커밋 2개)
