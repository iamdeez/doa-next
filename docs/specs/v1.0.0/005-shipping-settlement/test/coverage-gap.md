---
작성: Test Agent (EXECUTION)
버전: v1.0
최종 수정: 2026-06-29 17:30
상태: 확정 (retroactive)
---

# Coverage Gap: 005-shipping-settlement

## 목차

- [미커버 항목 목록](#미커버-항목-목록)
- [정산 중복 집계 미차단 (상세)](#정산-중복-집계-미차단-상세)
- [order 모듈 005 메서드 직접 테스트 부재 (상세)](#order-모듈-005-메서드-직접-테스트-부재-상세)
- [신규 단위 테스트 수 정정 기록](#신규-단위-테스트-수-정정-기록)

---

## 미커버 항목 목록

> 모든 spec.md SC(SC-001~006, SC-050~052)는 직접 커버(PASS). 아래는 SC 로 정의되지 않았거나 production
> 기능 부재로 테스트 대상이 없는 공백이다.

| 항목 | 미커버 시나리오 | 카테고리 | 검증 방법 | 담당 | 비고 |
|---|---|---|---|---|---|
| 정산 중복 집계 차단 | 동일/겹치는 기간 재정산 시 동일 orderItem 중복 지급액 방지 | (3) 기능 미구현 | 후속 정산 보강 spec: 멱등 로직 + 중복정산 거부 테스트 | 후속 spec | Medium, admin-only 트리거 (GAP-005-01·SEC-FIND-005-01) |
| order 005 메서드 직접 단위 테스트 | `markShipped`·`markDelivered`·`getOrderOwnership`·`getCompletedItemsForSettlement` 의 상태 전이·예외(404/403/400)·멱등 직접 검증 | (1) 단위테스트 가능 | order.service.spec.ts 에 005 메서드 직접 테스트 추가 | 개발 | shipping/settlement.service.spec 에서 mock 호출 단언으로 간접 커버. 직접 상태 전이 테스트 권장 |
| 송장 등록 동시성 race | 동일 주문 동시 송장 등록 2건 실제 DB race | (2) 단위테스트 불가(완전 재현) | 통합 테스트 | 후속 | 단위는 `markShipped` status≠preparing 거부 분기로 갈음 |

> 카테고리 (1) 항목이 1건 — order 005 메서드 직접 테스트. 기능 커버리지는 shipping/settlement.service.spec
> 의 호출 단언으로 충족되며 기능 결함 위험은 낮으나, 상태머신 전이의 직접 검증은 후속 보강 권장.

---

## 정산 중복 집계 미차단 (상세)

**현상**: `SettlementService.createSettlement` 가 정산 생성 시 멱등성을 보장하지 않는다.

**근본 원인 (코드 근거)**:
1. `OrderService.getCompletedItemsForSettlement(sellerId, periodStart, periodEnd)`(`order.service.ts:400`)
   → `OrderRepository.findCompletedItemsBySellerInPeriod`(`order.repository.ts:148`) 가 기간 내 모든
   `completed` 주문항목을 반환하며, **이미 정산에 포함된 항목을 제외하지 않는다**.
2. `SettlementItem.orderItemId`(`schema.prisma:643`) 에 **UNIQUE 제약이 없다**.

따라서 관리자가 동일/겹치는 기간으로 `POST /settlements` 를 재호출하면 동일 `orderItemId` 가 복수
정산의 `settlement_items` 에 중복 집계되어 중복 지급액(`payoutAmount`)이 산정될 수 있다.

**위험도**: Medium. 트리거가 `AdminGuard`(관리자 전용)이므로 외부 악용이 아닌 운영 절차 위험.

**미커버**: 동일 항목 재정산을 거부하거나 기집계 항목을 제외하는 production 로직 자체가 없으므로 이를
검증하는 테스트도 없다(기능 미구현).

**권장 수정 방향 (후속 정산 보강 spec)**:
1. `SettlementItem.orderItemId` 에 `@unique` 추가 (DB 수준 중복 차단).
2. `getCompletedItemsForSettlement` 에서 기존 `settlement_items` 에 포함된 `orderItemId` 제외.
3. 중복정산 거부 단위 테스트 추가(동일 orderItemId 재집계 시 거부 단언).

> 본 항목은 security-report.md SEC-FIND-005-01 및 gaps.md GAP-005-01 과 동일 사안이다.

---

## order 모듈 005 메서드 직접 테스트 부재 (상세)

**현상**: 005 가 추가한 `OrderService` 공개 메서드 4종(`markShipped`·`markDelivered`·`getOrderOwnership`·
`getCompletedItemsForSettlement`)에 대한 `order.service.spec.ts` 직접 단위 테스트가 작성되지 않았다.

**현재 커버리지 (간접)**:
- `shipping.service.spec.ts` 가 `mockOrderService.markShipped`·`markDelivered`·`getOrderOwnership` 의
  호출 인자·횟수를 단언한다(예: `markShipped('order-1','seller-1')` 호출, in_transit 시 `markDelivered`
  미호출).
- `settlement.service.spec.ts` 가 `mockOrderService.getCompletedItemsForSettlement` 반환값으로 정산
  계산을 검증한다.

**미커버 범위**: `markShipped` 의 status≠preparing 400·항목 sellerId 불일치 403·order 없음 404,
`markDelivered` 멱등(이미 delivered no-op)·status≠shipped 400 등 상태머신 전이 분기를 OrderService
자체 단위 테스트로 직접 검증하지 않는다(shipping mock 이 이 분기를 흉내낼 뿐 production 분기는
미실행).

**권장**: `order.service.spec.ts` 에 005 메서드별 상태 전이·예외 직접 테스트 추가.

---

## 신규 단위 테스트 수 정정 기록

005 완료 시 경량 spec.md 는 "신규 21 (기존 168)"로 기록했으나, 실제 git diff 검증 결과 005 신규 단위
테스트는 **17건**(shipping 11 + settlement 6)이며 004 baseline 은 **172건**이다(172 + 17 = 189, 정합).
`src/` 하위 변경 테스트 파일은 `shipping.service.spec.ts`·`settlement.service.spec.ts` 2개뿐이다. 정적
스펙은 `cross-schema.spec.ts`(ShippingRepository·SettlementRepository 규칙 2건 추가)·`schema-decimal.spec.ts`
(MONEY_FIELDS 5종 추가)를 확장했다. 본 정정은 추적 정확성 목적이며 기능 커버리지에는 영향 없다.
