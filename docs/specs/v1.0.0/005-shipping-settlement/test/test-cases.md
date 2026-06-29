---
작성: Test Agent (AUTHORING)
버전: v1.0
최종 수정: 2026-06-29 17:30
상태: 확정 (retroactive)
---

# Test Cases: 005-shipping-settlement

## 목차

- [SC × 시나리오 매트릭스](#sc--시나리오-매트릭스)
  - [배송 (SC-001~003)](#배송-sc-001003)
  - [정산 (SC-004~006)](#정산-sc-004006)
  - [NFR 정적 검증 (SC-050~052)](#nfr-정적-검증-sc-050052)
- [외부 의존성 명시](#외부-의존성-명시)
- [미커버 항목 (사전 분류)](#미커버-항목-사전-분류)

---

## SC × 시나리오 매트릭스

> 테스트 함수명은 실제 spec 파일의 `it('...')` 식별자 기준. shipping 11 케이스 + settlement 6 케이스 = 17 신규 단위 테스트.

### 배송 (SC-001~003)

| SC-ID | 수용 기준 | Happy Path | Edge Case | Error Case | 테스트 파일·함수 | env 태그 |
|---|---|---|---|---|---|---|
| SC-001 | 송장 등록 → 주문 shipped 전이 + shipment/tracking/event | `when_approved_seller_registers_shipment_then_order_marked_shipped_and_shipment_created` | — | `when_non_approved_seller_then_ForbiddenException`, `when_order_not_in_preparing_then_OrderService_error_propagates_and_no_shipment` | shipping.service.spec.ts::createShipment | [env:unit] |
| SC-002 | delivered 전이 시 주문 markDelivered, in_transit 미전이 | `when_status_delivered_then_order_marked_delivered` | `when_status_in_transit_then_order_not_marked_delivered` | `when_seller_not_owner_then_ForbiddenException`, `when_shipment_not_found_then_NotFoundException` | shipping.service.spec.ts::updateStatus | [env:unit] |
| SC-003 | 추적 조회 권한 3축(구매자/판매자/제3자/없음) | `when_customer_owner_then_returns_tracking`, `when_seller_of_order_then_returns_tracking` | — | `when_neither_customer_nor_seller_then_ForbiddenException`, `when_shipment_not_found_then_NotFoundException` | shipping.service.spec.ts::getTracking | [env:unit] |

### 정산 (SC-004~006)

| SC-ID | 수용 기준 | Happy Path | Edge Case | Error Case | 테스트 파일·함수 | env 태그 |
|---|---|---|---|---|---|---|
| SC-004 | completed 항목 집계 정산 생성 / 빈 집계 0금액 | `when_completed_items_then_decimal_money_calculated_correctly` | `when_no_completed_items_then_zero_amounts_and_no_items_created` | — | settlement.service.spec.ts::createSettlement | [env:unit] |
| SC-005 | Decimal 금전 계산·반올림(HALF_UP 2자리) | `when_completed_items_then_decimal_money_calculated_correctly` | `when_commission_has_more_than_2_decimals_then_rounded_half_up` | — | settlement.service.spec.ts::createSettlement | [env:unit] |
| SC-006 | 본인 정산 조회 / 미승인 403 / 전체 조회 | `when_approved_seller_then_returns_own_settlements`, `when_admin_lists_all_then_returns_all_settlements` | — | `when_non_approved_seller_then_ForbiddenException` | settlement.service.spec.ts::listMySettlements, listAll | [env:unit] |

### NFR 정적 검증 (SC-050~052)

| SC-ID | 수용 기준 | Happy Path | 테스트 파일·함수 | env 태그 |
|---|---|---|---|---|
| SC-050 | 정산 금전 필드(totalSales·commission·payoutAmount·saleAmount·commissionAmount) Decimal 타입 | `when_inspect_schema_money_fields_then_all_Decimal` (MONEY_FIELDS 005 항목) | schema-decimal.spec.ts | [env:static] |
| SC-051 | shipping·settlement Repository commerce/orders/users 외 직접 참조 금지 | `when_inspect_ShippingRepository__005__then_no_cross_schema_prisma_access`, `when_inspect_SettlementRepository__005__then_no_cross_schema_prisma_access` | cross-schema.spec.ts | [env:static] |
| SC-052 | `@aws-sdk/*` 패키지 신규 추가 없음 | `when_inspect_package_json_then_no_aws_sdk_packages` | package-no-aws.spec.ts (기존, 자동 충족) | [env:static] |

---

## 외부 의존성 명시

### fixture / mock

- `mockShippingRepository`: `{ createShipment, findById, updateShipment, appendTracking, findTracking }` jest.fn()
- `mockSettlementRepository`: `{ createSettlement, createItems, findById, listBySeller, listAll }` jest.fn()
- `mockOrderService`(shipping): `{ markShipped, markDelivered, getOrderOwnership }` jest.fn()
- `mockOrderService`(settlement): `{ getCompletedItemsForSettlement }` jest.fn()
- `mockSellerService`: `{ getApprovedSeller }` jest.fn()
- `mockPrismaService`: `{ runInTransaction: (fn)=>fn(), onAfterCommit: (cb)=>Promise.resolve(cb()), get tx(){return this} }`
- `mockEventEmitter`: `{ emit: jest.fn() }` (shipping 전용)
- 상수 fixture: `SHIPMENT`(id·orderId·status·carrier·trackingNumber·shippedAt·deliveredAt·createdAt), `TRACKING[]`, `PERIOD_START`/`PERIOD_END`

### 환경 변수

테스트 실행 시 별도 환경 변수 불필요 (unit test — DB 연결 없음, 전부 mock).

### 외부 서비스

DB 연결 없음. 모든 외부 의존성 mock 처리(PrismaService passthrough).

---

## 미커버 항목 (사전 분류)

| 항목 | 미커버 사유 | 카테고리 | 권장 검증 방법 |
|---|---|---|---|
| 정산 중복 집계 차단 (멱등성) | `getCompletedItemsForSettlement` 가 기집계 항목을 제외하지 않고 `orderItemId` unique 부재 → 동일/겹치는 기간 재정산 시 중복 지급액. **이를 막는 production 로직 자체가 없으므로 테스트 대상 부재** | (3) 기능 미구현 | 후속 정산 보강 spec 에서 멱등 로직 + 중복정산 거부 테스트 작성 (GAP-005-01) |
| 송장 등록 동시성 race (동일 주문 2건) | `markShipped` 의 status≠preparing 거부로 두 번째 차단되나, 실제 DB 동시 트랜잭션 race 는 통합 환경에서만 완전 재현 | (1) 단위테스트 가능(분기) | 단위는 status 검증 분기로 갈음. 운영 재현은 통합 테스트 |
| `markShipped`/`markDelivered`/`getOrderOwnership` order 단위 테스트 | shipping.service.spec 에서 mock 으로 호출 단언하나, order.service.spec 에 005 메서드 자체의 직접 단위 테스트는 미작성 | (1) 단위테스트 가능 | order.service.spec 에 markShipped/markDelivered 상태 전이·예외 직접 테스트 추가 권장 |
