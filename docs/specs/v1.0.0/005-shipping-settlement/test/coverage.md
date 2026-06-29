---
작성: Test Agent (EXECUTION)
버전: v1.0
최종 수정: 2026-06-29 17:30
상태: 확정 (retroactive)
---

# Coverage: 005-shipping-settlement

## 목차

- [실행 요약](#실행-요약)
- [SC × 시나리오 커버리지 매트릭스](#sc--시나리오-커버리지-매트릭스)
- [커버리지 요약](#커버리지-요약)
- [STALE_SC 경고](#stale_sc-경고)

---

## 실행 요약

> 본 retroactive 검증은 커밋 `b174133`(005 완료 커밋) 에서 재실행하여 사실을 확인했다.
> 005 완료 시점 경량 spec.md 가 자체 기록한 스냅샷과 본 재실행 수치를 함께 기재한다.

| 항목 | 005 완료 스냅샷 (경량 spec.md 자체 기록) | 본 retroactive 재실행 (HEAD `b174133`) |
|---|---|---|
| tsc `--noEmit` | EXIT 0 | **EXIT 0** (재확인) |
| Unit 테스트 (src/) | 18 suites / 189 PASS | **21 suites / 209 PASS** |
| Static 테스트 (test/static/) | 9 suites / 47 PASS | **9 suites / 49 PASS** |
| AppModule 부팅 (health e2e) | 3 PASS | (DB 의존 e2e — 본 세션 미실행) |
| 005 신규 단위 테스트 | "신규 21"로 기록 | **신규 17** (shipping 11 + settlement 6 — git diff 검증) |
| 005 회귀 | 0 | **0** (전체 PASS) |

> **수치 차이 설명(사실 기준)**:
> - **신규 단위 17 (≠ 경량 spec 의 21)**: `git diff 289b36f b174133` 상 `src/` 하위 신규/변경 테스트 파일은 `shipping.service.spec.ts`(+315, 11 케이스)·`settlement.service.spec.ts`(+174, 6 케이스) 2개뿐이다. 두 파일 합 17 케이스가 005 신규 단위 테스트의 전부다. 004 baseline(172) + 17 = 189 로 정합하므로, 경량 spec 의 "신규 21·기존 168"은 "신규 17·기존 172"가 정확하다.
> - **재실행 209/49 (> 스냅샷 189/47)**: HEAD `b174133` 트리에는 이미 006(notification·file) 모듈 스캐폴드가 존재하며 그 정적/단위 테스트가 함께 실행된다(`cross-schema.spec.ts` 의 NotificationRepository·FileRepository 규칙 + notification/file 단위 스펙). 005 자체 산출물·회귀에는 영향 없으며 전체 PASS·회귀 0 을 재확인했다.

### 실행 커맨드

```bash
cd apps/backend
npx tsc --noEmit -p tsconfig.json                                              # EXIT 0
npx jest --testPathPattern="src/"                                              # 21 suites / 209 PASS
npx jest --config ./test/jest-e2e.json --testPathPattern="test/static"        # 9 suites / 49 PASS
```

> Static 테스트는 `package.json` jest 설정(rootDir: "src")으로 실행 불가. `test/jest-e2e.json`(rootDir: ".") 으로 실행한다.

---

## SC × 시나리오 커버리지 매트릭스

### 배송 (SC-001~003)

| SC-ID | 수용 기준 | Happy Path | Edge Case | Error Case | 상태 |
|---|---|---|---|---|---|
| SC-001 | 송장 등록 + 주문 shipped 전이 + 이벤트 | when_approved_seller_registers_shipment_then_order_marked_shipped_and_shipment_created | — | when_non_approved_seller_then_ForbiddenException, when_order_not_in_preparing_then_OrderService_error_propagates_and_no_shipment | PASS |
| SC-002 | delivered 전이 / in_transit 미전이 | when_status_delivered_then_order_marked_delivered | when_status_in_transit_then_order_not_marked_delivered | when_seller_not_owner_then_ForbiddenException, when_shipment_not_found_then_NotFoundException | PASS |
| SC-003 | 추적 권한 3축 + 없음 | when_customer_owner_then_returns_tracking, when_seller_of_order_then_returns_tracking | — | when_neither_customer_nor_seller_then_ForbiddenException, when_shipment_not_found_then_NotFoundException | PASS |

### 정산 (SC-004~006)

| SC-ID | 수용 기준 | Happy Path | Edge Case | Error Case | 상태 |
|---|---|---|---|---|---|
| SC-004 | completed 항목 집계 정산 생성 / 빈 집계 | when_completed_items_then_decimal_money_calculated_correctly | when_no_completed_items_then_zero_amounts_and_no_items_created | — | PASS |
| SC-005 | Decimal 계산·반올림(HALF_UP) | when_completed_items_then_decimal_money_calculated_correctly | when_commission_has_more_than_2_decimals_then_rounded_half_up | — | PASS |
| SC-006 | 본인/미승인/전체 정산 조회 | when_approved_seller_then_returns_own_settlements, when_admin_lists_all_then_returns_all_settlements | — | when_non_approved_seller_then_ForbiddenException | PASS |

### NFR 정적 검증 (SC-050~052)

| SC-ID | 수용 기준 | Happy Path | 상태 |
|---|---|---|---|
| SC-050 | 정산 금전 필드 Decimal 정적 검증 | schema-decimal.spec.ts MONEY_FIELDS 005 항목(totalSales·commission·payoutAmount·saleAmount·commissionAmount) | PASS |
| SC-051 | shipping·settlement Repository cross-schema 0 | cross-schema.spec.ts ShippingRepository(005)·SettlementRepository(005) 규칙 | PASS |
| SC-052 | `@aws-sdk/*` 신규 0 | package-no-aws.spec.ts | PASS |

---

## 커버리지 요약

| 항목 | 수 |
|---|---|
| 전체 SC | 9 (FR SC 6 + NFR SC 3) |
| PASS (직접 커버) | 9 |
| INDIRECT (간접 커버) | 0 |
| GAP | 0 (단, 정산 멱등성은 기능 미구현 — coverage-gap.md §정산 중복 집계 참조) |

> 모든 SC(SC-001~006, SC-050~052)가 직접 커버되었다. 단, 정산 *중복 집계 차단(멱등성)* 은 production
> 기능 자체가 구현되지 않아 SC 로 정의되지 않았으며, 이는 의도된 범위 외(GAP-005-01)로 coverage-gap.md
> 에 기록한다.

---

## STALE_SC 경고

STALE_SC 검출 결과: **0건**

검출 대상: 005 git diff 변경 파일 내 테스트 SC 번호. `shipping.service.spec.ts`·`settlement.service.spec.ts`
는 docstring 시나리오 주석에 SC 번호를 직접 부착하지 않고 행위 기반 `it('when_..._then_...')` 명명을
사용한다(spec.md SC 와의 매핑은 본 coverage.md·test-cases.md 가 담당). 정적 스펙(`cross-schema.spec.ts`
의 ShippingRepository(005)·SettlementRepository(005) 라벨, `schema-decimal.spec.ts` 의 `005(settlement)`
태그)에서 사용된 식별자도 spec.md/data-model.md 정의와 일치한다. semantic mismatch 없음.
