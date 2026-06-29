---
작성: Docs Agent
버전: v1.0
최종 수정: 2026-06-30 01:23
상태: 확정 (retroactive)
---

# Diff: 005-order-shipping-gap-fill

## 목차

- [커밋 메시지용 한 줄 요약](#커밋-메시지용-한-줄-요약)
- [변경 요약](#변경-요약)
- [변경 파일 및 라인 수](#변경-파일-및-라인-수)
- [Diff](#diff)

## 커밋 메시지용 한 줄 요약

- **KO**: 005 Phase 1 갭 보강 — 주문→송장 조회(권한 3축·null) + 판매자 주문 상세(items·소유검증) + 권한 헬퍼 추출 + console ship 재진입 복구
- **EN**: 005 Phase 1 gap fill — order→shipment lookup (3-axis auth·null) + seller order detail (items·ownership) + auth helper extraction + console ship re-entry recovery

## 변경 요약

- **주문 기준 송장 조회(FR-001·002·003)**: `shipping.service.ts` — `getTracking` 의 인라인 권한 3축 검증을
  `_assertCanViewOrder(userId, orderId)` private 헬퍼로 추출하고 신규 `getByOrder(userId, orderId)` 가 공유
  (인가 단일 지점). `shipping.repository.ts` — `findByOrderId`(`findFirst orderBy createdAt desc`, 주문당
  최신 1건, 미존재 null). `shipping.controller.ts` — `@Get()` `getByOrder(@CurrentUser, @Query('orderId'))`
  → `GET /shipments?orderId=`(권한 3축, `Shipment | null`).
- **판매자 단건 주문 상세(FR-004)**: `order.service.ts` — `getSellerOrderDetail(userId, orderId)`
  (`getApprovedSeller` → `findById` → 미존재 404·items 중 본인 sellerId 불일치 403, items 포함 반환).
  `seller-order.controller.ts` — `@Get(':orderId')` → `GET /seller/orders/:orderId`.
- **view 타입(FR-005)**: `packages/shared-types/src/index.ts` — `OrderItemView`(id·productId·sellerId·
  variantId·unitPrice[string]·quantity)·`SellerOrderDetail`(`SellerOrder` 확장 + `items: OrderItemView[]`).
  금전 필드 string(전이형 view 타입 — 004 연속).
- **도메인 facade(FR-006)**: `packages/api-client/src/index.ts` — `order.getSellerDetail(orderId)`(GET
  `/seller/orders/:id` → `SellerOrderDetail`)·`shipping.getByOrder(orderId)`(GET `/shipments?orderId=` →
  `Shipment | null`, `{ query: { orderId } }`). 기존 facade 메서드 불변.
- **console 재진입 복구(FR-007)**: `apps/console/.../ship/page.tsx` — 진입 시 `shipmentQuery`
  (`api.shipping.getByOrder`)로 기존 송장 복구 + `orderQuery`(`api.order.getSellerDetail`)로 주문 상태·금액
  헤더. `shipment = shipmentQuery.data ?? null` 로 등록 폼/관리 패널 분기. create·updateStatus `onSuccess`
  가 `qc.setQueryData(['shipment','byOrder',orderId])` 캐시 갱신(004 세션 `useState` 대체).
- **OpenAPI 재생성(FR-008)**: `apps/backend/openapi.json`(paths 71 — `/shipments` GET 추가·
  `/seller/orders/{orderId}` 신규) + `packages/shared-types/src/openapi.gen.ts` 재생성.
- **검증**: `pnpm --filter backend typecheck` 0 · `test` 261(+6: getByOrder 3·getSellerOrderDetail 3) ·
  `test:e2e` 84 PASS / openapi 71 paths / `pnpm --filter console typecheck` 0 · `build` 14 라우트 PASS
  (`/seller/orders/[id]/ship` ƒ). 회귀 0. 신규 의존 0(`package.json` 변경 없음). 마이그레이션 0.
- **해결**: **004 GAP-004-01 의 BE-GAP 2건(판매자 주문 상세·주문→송장 조회) RESOLVED**. ship 재진입 복구 +
  주문 컨텍스트 표시 달성(004 세션 state 한계 해소). 응답 스키마 한시·송장 status e2e·분할배송·낙관적
  업데이트는 GAP-005-01(Low) 후속.

## 변경 파일 및 라인 수

> 범위: `apps/backend` + `packages` + `apps/console`. base `8bba04d`(004 완료) → `8b48eb5`(005 완료).
> `git diff --numstat 8bba04d 8b48eb5 -- apps/backend packages apps/console` 직접 카운트.

| 파일 | 추가 | 삭제 | 비고 |
|---|---|---|---|
| `apps/console/app/(dashboard)/seller/orders/[id]/ship/page.tsx` | +138 | -72 | 재진입 복구(getByOrder)·주문 헤더(getSellerDetail)·setQueryData |
| `packages/shared-types/src/openapi.gen.ts` | +61 | -1 | 신규 라우트 2개 생성 타입 재생성 |
| `apps/backend/openapi.json` | +60 | -0 | 신규 라우트 2개 재생성(paths 71) |
| `apps/backend/src/modules/shipping/shipping.service.spec.ts` | +46 | -0 | getByOrder 단위 3(seller·buyer+null·stranger) |
| `apps/backend/src/modules/order/order.service.spec.ts` | +32 | -0 | getSellerOrderDetail 단위 3(owner·not_owner·missing) |
| `apps/backend/src/modules/shipping/shipping.service.ts` | +16 | -5 | `_assertCanViewOrder` 추출 + `getByOrder` |
| `apps/backend/src/modules/order/order.service.ts` | +14 | -0 | `getSellerOrderDetail`(items·소유검증) |
| `packages/shared-types/src/index.ts` | +14 | -0 | `OrderItemView`·`SellerOrderDetail`(금전 string) |
| `apps/backend/src/modules/shipping/shipping.controller.ts` | +10 | -0 | `GET /shipments?orderId=` |
| `apps/backend/src/modules/order/seller-order.controller.ts` | +9 | -0 | `GET /seller/orders/:orderId` |
| `apps/backend/src/modules/shipping/shipping.repository.ts` | +8 | -0 | `findByOrderId`(최신 1건, null) |
| `packages/api-client/src/index.ts` | +7 | -0 | `getSellerDetail`·`getByOrder` facade |

**합계**: 12 files changed, 415 insertions(+), 78 deletions(-).

> **부수 변경 없음**: 신규 의존성 0(`package.json`·`pnpm-lock.yaml` 변경 없음). DB 스키마 변경 0(마이그레이션
> 없음).
>
> 본 005 SDD 문서 세트(`docs/specs/v1.1.0/005-order-shipping-gap-fill/**`) 와 `DIFF-005`·`CHANGES.md` 005
> 항목·004 `gaps.md` RESOLVED 갱신은 `8b48eb5` 코드 커밋 **이후** retroactive 로 별도 추가된다(코드 diff
> 범위 외).

## Diff

> 전체 diff 는 본 문서에 박제하지 않는다 — **git 이 형상관리 SoT** 이며 전체 캡처는 중복·문서 비대화를
> 유발한다. 변경 내용은 위 "변경 요약" · "변경 파일 및 라인 수" 절로 추적하고, 라인 단위 diff 가 필요하면
> 아래로 재생성한다:
>
> ```bash
> git diff 8bba04d 8b48eb5 -- apps/backend packages apps/console   # base commit: 8bba04d
> ```
</content>
