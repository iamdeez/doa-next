---
작성: Docs Agent
버전: v1.0
최종 수정: 2026-06-29 17:30
상태: 확정 (retroactive)
---

# Diff: 005-shipping-settlement

## 커밋 메시지용 한 줄 요약

(이 섹션은 커밋 메시지 작성 시 참고용이다. 실제 커밋 메시지는 프로젝트 컨벤션에 맞춰 조정한다.)

- **KO**: 배송·정산 모듈 실구현 및 order 모듈 005 연동 메서드 추가
- **EN**: implement shipping & settlement modules with order 005 integration methods

## 변경 요약

- **Prisma 스키마**: `ShipmentStatus`(orders)·`SettlementStatus`(settlements) 2개 enum, `Shipment`·`ShipmentTracking`(orders 스키마)·`Settlement`·`SettlementItem`(신규 settlements 스키마) 4개 모델 추가. 금전 필드 5종 `Decimal(12,2)`, shipment_tracking append-only `(shipmentId, occurredAt desc)` 인덱스, settlements `(sellerId, createdAt desc)` 인덱스. cross-schema/cross-module 참조는 plain String(FK 미선언, P-001).
- **shipping 모듈 스텁 → 실구현**: ShippingRepository(shipment/tracking CRUD, append-only tracking), ShippingService(createShipment — 주문 `preparing→shipped` 전이 + shipment/tracking, updateStatus — delivered 시 `shipped→delivered`, getTracking — 권한 3축 구매자/판매자), ShippingController(POST /shipments · PATCH /:id/status · GET /:id/tracking), `shipping.shipped`·`shipping.delivered` 이벤트 상수.
- **settlement 모듈 스텁 → 실구현**: SettlementRepository(settlement/item 생성·조회), SettlementService(createSettlement — Decimal 집계 totalSales/commission/payoutAmount HALF_UP, listMySettlements·listAll), SettlementController·AdminSettlementController(POST /settlements·GET /settlements AdminGuard·GET /admin/settlements), `COMMISSION_RATE='0.1'` 상수.
- **order 모듈 005 연동(additive 공개)**: `markShipped`(preparing→shipped, 소유권·상태 검증)·`markDelivered`(shipped→delivered, 멱등)·`getOrderOwnership`(추적 권한 3축 판정)·`getCompletedItemsForSettlement`(정산 집계 매출 명세) 신규 공개 메서드, `OrderRepository.findCompletedItemsBySellerInPeriod` 신규(orders 스키마 join). 기존 메서드 시그니처 불변(003/004 회귀 0).
- **테스트 추가**: shipping.service.spec(11 케이스 — SC-001/002/003), settlement.service.spec(6 케이스 — SC-004/005/006), cross-schema.spec(ShippingRepository·SettlementRepository 규칙, SC-051), schema-decimal.spec(정산 금전 필드 5종, SC-050).

## 변경 파일 및 라인 수

> 범위: `apps/backend` (docs/specs·CHANGES.md 제외). base `289b36f`(004 완료) → `b174133`(005 완료).

| 파일 | 추가 | 삭제 |
|---|---|---|
| `apps/backend/prisma/migrations/20260629080659_005_shipping_settlement/migration.sql` | +151 | -0 |
| `apps/backend/prisma/schema.prisma` | +103 | -0 |
| `apps/backend/src/modules/order/order.repository.ts` | +28 | -0 |
| `apps/backend/src/modules/order/order.service.ts` | +99 | -0 |
| `apps/backend/src/modules/settlement/dto/create-settlement.dto.ts` | +16 | -0 |
| `apps/backend/src/modules/settlement/settlement.constants.ts` | +5 | -0 |
| `apps/backend/src/modules/settlement/settlement.controller.ts` | +54 | -3 |
| `apps/backend/src/modules/settlement/settlement.module.ts` | +10 | -2 |
| `apps/backend/src/modules/settlement/settlement.repository.ts` | +57 | -1 |
| `apps/backend/src/modules/settlement/settlement.service.spec.ts` | +174 | -0 |
| `apps/backend/src/modules/settlement/settlement.service.ts` | +93 | -1 |
| `apps/backend/src/modules/shipping/dto/create-shipment.dto.ts` | +18 | -0 |
| `apps/backend/src/modules/shipping/dto/update-shipment-status.dto.ts` | +13 | -0 |
| `apps/backend/src/modules/shipping/shipping.controller.ts` | +60 | -3 |
| `apps/backend/src/modules/shipping/shipping.events.ts` | +6 | -0 |
| `apps/backend/src/modules/shipping/shipping.module.ts` | +5 | -0 |
| `apps/backend/src/modules/shipping/shipping.repository.ts` | +54 | -1 |
| `apps/backend/src/modules/shipping/shipping.service.spec.ts` | +315 | -0 |
| `apps/backend/src/modules/shipping/shipping.service.ts` | +167 | -2 |
| `apps/backend/test/static/cross-schema.spec.ts` | +27 | -0 |
| `apps/backend/test/static/schema-decimal.spec.ts` | +6 | -0 |

**합계 (apps/backend)**: 21 files changed, 1461 insertions(+), 13 deletions(-).

> 위 범위 외 변경: `docs/specs/v1.0.0/005-shipping-settlement/spec/spec.md`(+77, 경량 spec) · `docs/specs/v1.0.0/CHANGES.md`(+22). 전체 23 files / 1560 insertions(+) / 13 deletions(-).

## Diff

> 전체 diff 는 본 문서에 박제하지 않는다 — **git 이 형상관리 SoT** 이며 전체 캡처는 중복·비효율이다.
> 변경 내용은 위 "변경 요약" · "변경 파일 및 라인 수" 절로 추적하고, 라인 단위 diff 가 필요하면 아래로 재생성한다:
>
> ```bash
> git diff 289b36f b174133 -- apps/backend   # base commit: 289b36f (004 완료)
> ```
