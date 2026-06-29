---
작성: Test Agent (EXECUTION)
버전: v1.0
최종 수정: 2026-06-29 17:30
상태: 확정 (retroactive)
---

# 테스트 실행 결과 — 005-shipping-settlement

## 목차

- [실행 요약](#실행-요약)
- [실패 목록](#실패-목록)
- [SC 매핑표 검증](#sc-매핑표-검증)
- [설계 문서 정합성](#설계-문서-정합성)
- [회귀 탐지](#회귀-탐지)

---

## 실행 요약

> 본 retroactive 검증은 005 완료 커밋 `b174133` 에서 재실행하여 사실을 확인했다.

| 항목 | 결과 (본 retroactive 재실행, HEAD `b174133`) |
|---|---|
| 실행 일시 | 2026-06-29 17:30 |
| tsc `--noEmit` | **EXIT 0** |
| Unit 테스트 (apps/backend, rootDir: src) | **209 PASS** / 0 FAIL / 21 suites |
| Static 테스트 (apps/backend, test/static/) | **49 PASS** / 0 FAIL / 9 suites |
| 전체 통과 여부 | **PASS** |
| 003/004 회귀 여부 | **없음** |
| 005 신규 단위 테스트 | **17** (shipping.service.spec 11 + settlement.service.spec 6) |

### 005 완료 시점 스냅샷 (경량 spec.md 자체 기록)

| 항목 | 값 |
|---|---|
| tsc | EXIT 0 |
| Unit | 18 suites / 189 PASS (004 baseline 172 + 005 신규 17, 회귀 0) |
| Static | 9 suites / 47 PASS |
| health e2e (AppModule 부팅) | 3 PASS — ShippingModule·SettlementModule DI 정상 |

### 실행 커맨드

```bash
cd /Users/krystal/workspace/doa/doa-next/apps/backend
npx tsc --noEmit -p tsconfig.json                                              # EXIT 0
npx jest --testPathPattern="src/"                                              # 21 suites / 209 PASS
npx jest --config ./test/jest-e2e.json --testPathPattern="test/static"        # 9 suites / 49 PASS
```

> **e2e(DB 의존) 미실행 명시**: `orders.e2e-spec.ts`·`payments.e2e-spec.ts`·`products.e2e-spec.ts`·
> `auth.e2e-spec.ts`·`health.e2e-spec.ts`·`search-notification-file.e2e-spec.ts` 는 PostgreSQL 연결을
> 요구하므로 본 retroactive 문서화 세션에서는 실행하지 않았다. 005 완료 시점에는 AppModule 부팅
> (health e2e 3 PASS) 으로 ShippingModule·SettlementModule DI 와이어링을 확인했다.

> **재실행 수치(209/49)와 스냅샷(189/47)의 차이**: HEAD `b174133` 트리에 006(notification·file) 모듈
> 스캐폴드 테스트가 이미 포함되어 함께 실행된 결과다(unit +20, static +2). 005 산출물·회귀에는 영향
> 없으며 전체 PASS·회귀 0 을 재확인했다. 상세 근거는 coverage.md §실행 요약 참조.

---

## 실패 목록

**실패 없음.** tsc EXIT 0, unit 209 + static 49 = 전체 PASS.

---

## SC 매핑표 검증

| SC-ID | 관련 테스트 | 통과 여부 |
|---|---|---|
| SC-001 | shipping.service.spec.ts: when_approved_seller_registers_shipment_then_order_marked_shipped_and_shipment_created, when_non_approved_seller_then_ForbiddenException, when_order_not_in_preparing_then_OrderService_error_propagates_and_no_shipment | PASS |
| SC-002 | shipping.service.spec.ts: when_status_delivered_then_order_marked_delivered, when_status_in_transit_then_order_not_marked_delivered, when_seller_not_owner_then_ForbiddenException, when_shipment_not_found_then_NotFoundException | PASS |
| SC-003 | shipping.service.spec.ts: when_customer_owner_then_returns_tracking, when_seller_of_order_then_returns_tracking, when_neither_customer_nor_seller_then_ForbiddenException, when_shipment_not_found_then_NotFoundException | PASS |
| SC-004 | settlement.service.spec.ts: when_completed_items_then_decimal_money_calculated_correctly, when_no_completed_items_then_zero_amounts_and_no_items_created | PASS |
| SC-005 | settlement.service.spec.ts: when_completed_items_then_decimal_money_calculated_correctly, when_commission_has_more_than_2_decimals_then_rounded_half_up | PASS |
| SC-006 | settlement.service.spec.ts: when_approved_seller_then_returns_own_settlements, when_non_approved_seller_then_ForbiddenException, when_admin_lists_all_then_returns_all_settlements | PASS |
| SC-050 | test/static/schema-decimal.spec.ts: MONEY_FIELDS 005(settlement) — totalSales·commission·payoutAmount·saleAmount·commissionAmount Decimal | PASS |
| SC-051 | test/static/cross-schema.spec.ts: ShippingRepository(005)·SettlementRepository(005) cross-schema 검증 | PASS |
| SC-052 | test/static/package-no-aws.spec.ts: when_inspect_package_json_then_no_aws_sdk_packages | PASS |

---

## 설계 문서 정합성

### plan.md 현행화 점검

- 배송 상태 전이(`preparing→shipped`·`shipped→delivered`)가 `OrderService.markShipped`·`markDelivered`
  DI 경유로 처리됨 — plan.md ADR-003 과 구현 일치 ✓
- 정산 금전 계산: `Prisma.Decimal` + `.toDecimalPlaces(2, ROUND_HALF_UP)`, `COMMISSION_RATE='0.1'`
  문자열 — plan.md ADR-005 와 구현 일치 ✓
- 추적 권한 3축(구매자 OR 판매자, `getApprovedSeller` try/catch) — plan.md ADR-004 와 일치 ✓
- cross-schema 금지: cross-schema.spec.ts 에 ShippingRepository·SettlementRepository 규칙 반영 ✓
- 정산 금전 필드 5종 Decimal: schema-decimal.spec.ts MONEY_FIELDS 반영 ✓

### 발견된 한계

- **정산 멱등성 미구현**: `getCompletedItemsForSettlement` 기집계 미제외 + `orderItemId` unique 부재.
  코드 수정 없이 후속 spec 위임(GAP-005-01·SEC-FIND-005-01).
- **order 005 메서드 직접 단위 테스트 부재**: shipping/settlement.service.spec 의 mock 호출 단언으로
  간접 커버. 상태 전이 직접 검증은 후속 권장(coverage-gap.md).

### 003/004 회귀 확인

- order.service.spec.ts·payment.service.spec.ts: 005 의 order 신규 메서드는 전부 additive 공개이며
  기존 메서드 시그니처 불변 → 003/004 기존 테스트 PASS.
- coupon/review/cart/product/seller 등 기타 모듈: 모든 기존 테스트 PASS.

---

## 회귀 탐지

005 가 추가/변경한 테스트 파일 (`git diff 289b36f b174133` 기준):
- `src/modules/shipping/shipping.service.spec.ts`: 신규 (+315, 11 케이스)
- `src/modules/settlement/settlement.service.spec.ts`: 신규 (+174, 6 케이스)
- `test/static/cross-schema.spec.ts`: 확장 (+27 — ShippingRepository·SettlementRepository 규칙 2건)
- `test/static/schema-decimal.spec.ts`: 확장 (+6 — MONEY_FIELDS 정산 5종)

004 baseline(172 unit) 대비 005 신규 17 → 189 unit (회귀 0). 본 retroactive 재실행은 트리에 포함된
006 스캐폴드까지 합산하여 209 unit / 49 static 으로 측정되었으며, 전체 PASS·회귀 0 을 확인했다.
