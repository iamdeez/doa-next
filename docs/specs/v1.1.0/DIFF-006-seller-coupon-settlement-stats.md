---
작성: Docs Agent
버전: v1.0
최종 수정: 2026-06-30 01:41
상태: 확정 (retroactive)
---

# Diff: 006-seller-coupon-settlement-stats

## 목차

- [커밋 메시지용 한 줄 요약](#커밋-메시지용-한-줄-요약)
- [변경 요약](#변경-요약)
- [변경 파일 및 라인 수](#변경-파일-및-라인-수)
- [Diff](#diff)

## 커밋 메시지용 한 줄 요약

- **KO**: 006 프론트 Phase 2 — 판매자 통계·정산·쿠폰 화면(통계 StatCard·정산 테이블·쿠폰 목록/생성/발급) +
  view 타입·stats/settlement/coupon facade·네비 + console 전 페이지 디자인 토큰 통일(하드코딩 0)
- **EN**: 006 frontend Phase 2 — seller stats/settlement/coupon screens (stat cards·settlement table·coupon
  list/create/issue) + view types·stats/settlement/coupon facade·nav + console-wide design-token unification

## 변경 요약

- **판매 통계 화면(FR-001)**: `apps/console/app/(dashboard)/seller/stats/page.tsx`(신규) —
  `useQuery(['seller','stats'], api.stats.seller, { enabled: isSeller })`로 `SellerStats` 조회 후 `StatCard`
  2개(누적 매출 `formatKRW(salesTotal)`·완료 주문 수 `orderCount.toLocaleString('ko-KR')`건) 렌더. 로딩·
  에러·비판매자 분기.
- **정산 내역 화면(FR-002)**: `seller/settlements/page.tsx`(신규) — `api.settlement.listMine`(`SettlementView[]`)
  조회 후 Table(정산 기간·총 매출·수수료 `−formatKRW`·지급액·상태 Badge) 렌더. status `completed`→"지급완료"
  (success)·그 외→"정산대기"(warning). 빈·비판매자 분기.
- **쿠폰 화면(FR-003·004·005)**: `seller/coupons/page.tsx`(신규) — `api.coupon.listSeller`
  (`CursorPage<Coupon>`, `data.items`) Table(할인·최소주문·발급/총량·만료·발급 버튼). `CreateCouponDialog`
  (Radix Dialog — `Select`(type)·`Input`·클라이언트 `validate`(discountValue>0·PERCENTAGE 1~100, 010 정합)·
  `createSeller` `onSuccess` invalidate+닫기). `IssueCouponDialog`(Radix Dialog — targetUserId·`issueSeller`
  `onSuccess` 성공 문구+닫기).
- **view 타입(FR-006)**: `packages/shared-types/src/index.ts` — 통계·정산·쿠폰 view 타입 8종(`SellerStats`·
  `SettlementStatus`·`SettlementView`·`CouponType`·`Coupon`·`CreateCouponRequest`·`IssueCouponRequest`·
  `UserCoupon`). 백엔드 응답 OpenAPI 미정의(Prisma 엔티티)이므로 전이형 view 타입(금전 string).
- **도메인 facade(FR-007)**: `packages/api-client/src/index.ts` — `createApiClient` 반환에 `stats`(seller)·
  `settlement`(listMine)·`coupon`(listSeller·createSeller·issueSeller) 추가(`api.http` 기반, view 타입 응답
  제네릭). 기존 facade·client·http 불변.
- **네비(FR-008)**: `apps/console/app/(dashboard)/layout.tsx` 에 "쿠폰"(`/seller/coupons`)·"정산"
  (`/seller/settlements`)·"판매 통계"(`/seller/stats`) 판매자 네비 3개 추가.
- **디자인 토큰 통일(FR-009·NFR-003)**: console 기존 화면 9개(`login`·`dashboard`·`account/profile`·
  `account/addresses`·`account/wishlist`·`seller/products`·`seller/products/[id]`·`seller/products/new`·
  `seller/register`)의 하드코딩 팔레트(`zinc/red/amber/green/bg-white`)를 @doa/design-tokens 시맨틱 토큰
  클래스(`bg-surface`·`text-foreground`·`text-muted-foreground`·`text-subtle-foreground`·`border-border`·
  `divide-border`·`bg-muted`·`rounded-card`·`text-danger`·`bg-warning-soft`·`border-warning`·
  `text-warning(-foreground)` 등)로 전환(클래스명만 교체, 동작·계약 불변). console 화면 하드코딩 팔레트 0건.
- **검증**: `pnpm --filter console typecheck` 0 error · `pnpm --filter console build` 17 라우트 PASS(신규
  `/seller/stats`·`/seller/settlements`·`/seller/coupons` 포함). 기존 화면 동작 회귀 0. 신규 단위/e2e 테스트
  0(UI 화면 — 타입체크 + 빌드 + 정적 구조 리뷰 + grep 으로 갈음). 신규 의존 0(`package.json` 변경 없음).
  `@doa/ui`(StatCard·Select·Table·Dialog)·`lib/order.ts`(formatKRW) 기존 자산 재사용(변경 0).
- **해결**: FRONTEND-PLAN Phase 2(판매자 운영 화면) — 004 GAP-004-01 (4)의 판매자 통계·정산·쿠폰 화면 부분
  RESOLVED. 002 디자인 시스템의 화면 레벨 미통일도 RESOLVED(하드코딩 0). 쿠폰 더보기·발급 후 갱신·서버 에러
  표면·낙관적 업데이트·e2e·응답 스키마 보강은 후속(GAP-006-01).

## 변경 파일 및 라인 수

> 범위: `apps/console` + `packages`. base `4daca5a` → `1a6d70d`(커밋 2개: `1b3ffd1` Phase 2 화면 + `1a6d70d`
> 토큰 통일). `git diff --numstat 4daca5a 1a6d70d -- apps/console packages` 직접 카운트.

| 파일 | 추가 | 삭제 | 비고 |
|---|---|---|---|
| `apps/console/app/(dashboard)/seller/coupons/page.tsx` (신규) | +235 | -0 | 쿠폰 목록·생성 다이얼로그(검증·invalidate)·발급 다이얼로그 |
| `apps/console/app/(dashboard)/seller/settlements/page.tsx` (신규) | +78 | -0 | 정산 Table·상태 Badge·formatKRW |
| `packages/shared-types/src/index.ts` | +70 | -0 | 통계·정산·쿠폰 view 타입 8종(금전 string) |
| `apps/console/app/(dashboard)/seller/stats/page.tsx` (신규) | +36 | -0 | 판매 통계 StatCard 2개 |
| `packages/api-client/src/index.ts` | +30 | -0 | stats·settlement·coupon 도메인 facade |
| `apps/console/app/(dashboard)/seller/products/[id]/page.tsx` | +16 | -16 | 토큰 통일(옵션·재고 섹션 포함) |
| `apps/console/app/(dashboard)/account/addresses/page.tsx` | +8 | -8 | 토큰 통일 |
| `apps/console/app/(dashboard)/account/wishlist/page.tsx` | +7 | -7 | 토큰 통일 |
| `apps/console/app/(dashboard)/seller/products/page.tsx` | +7 | -7 | 토큰 통일 |
| `apps/console/app/(dashboard)/account/profile/page.tsx` | +3 | -3 | 토큰 통일 |
| `apps/console/app/(dashboard)/dashboard/page.tsx` | +3 | -3 | 토큰 통일 |
| `apps/console/app/login/page.tsx` | +3 | -3 | 토큰 통일 |
| `apps/console/app/(dashboard)/layout.tsx` | +3 | -0 | 네비 3개(쿠폰·정산·판매 통계) |
| `apps/console/app/(dashboard)/seller/products/new/page.tsx` | +2 | -2 | 토큰 통일 |
| `apps/console/app/(dashboard)/seller/register/page.tsx` | +2 | -2 | 토큰 통일 |

**합계**: 15 files changed, 503 insertions(+), 51 deletions(-).

> **부수 변경 없음**: 신규 의존성 0(`package.json`·`pnpm-lock.yaml` 변경 없음). DB 스키마 변경 0(마이그레이션
> 없음). `@doa/ui`·`@doa/design-tokens` 변경 0(기존 컴포넌트·토큰 재사용).
>
> 본 006 SDD 문서 세트(`docs/specs/v1.1.0/006-seller-coupon-settlement-stats/**`) 와 `DIFF-006`·`CHANGES.md`
> 006 항목은 `1a6d70d` 코드 커밋 **이후** retroactive 로 별도 추가된다(코드 diff 범위 외).

## Diff

> 전체 diff 는 본 문서에 박제하지 않는다 — **git 이 형상관리 SoT** 이며 전체 캡처는 중복·문서 비대화를
> 유발한다. 변경 내용은 위 "변경 요약" · "변경 파일 및 라인 수" 절로 추적하고, 라인 단위 diff 가 필요하면
> 아래로 재생성한다:
>
> ```bash
> git diff 4daca5a 1a6d70d -- apps/console packages   # base commit: 4daca5a
> ```
