---
작성: Spec Agent
버전: v1.0
최종 수정: 2026-06-29 19:01
상태: 확정 (구현 완료 — retroactive 문서화)
---

# Spec: 008-settlement-idempotency

> Branch: 008-settlement-idempotency | Date: 2026-06-29 | Version: v1.0.0
>
> 본 문서는 이미 구현·검증이 완료된 코드(커밋 `e97a142`, base `cf2c3d1`)를 근거로 정식 SDD
> 포맷으로 retroactive 작성되었다. 모든 요구사항·수용 기준은 실제 구현된 `settlement` 모듈의
> 멱등성 보강 코드(`createSettlement` 기집계 제외 필터·`findSettledOrderItemIds`)와 `SettlementItem.orderItemId`
> `@unique` 제약, 그리고 008 마이그레이션에서 확인한 사실을 기준으로 한다.

## 목차

- [배경 및 목적](#배경-및-목적)
- [선행 spec 영향 추적](#선행-spec-영향-추적)
- [사용자 스토리](#사용자-스토리)
- [기능 요구사항](#기능-요구사항)
- [비기능 요구사항](#비기능-요구사항)
- [수용 기준](#수용-기준)
- [요구사항 구조화 매트릭스](#요구사항-구조화-매트릭스)
- [해결된 선행 보안 발견](#해결된-선행-보안-발견)
- [범위 외](#범위-외)
- [미결 사항](#미결-사항)

---

## 배경 및 목적

005-shipping-settlement 의 보안 감사에서 정산 생성이 **멱등성을 보장하지 않는다**는 Medium 등급
설계 공백(SEC-FIND-005-01 / GAP-005-01)이 식별되었다. 구체적으로:

1. `OrderService.getCompletedItemsForSettlement` 가 기간 내 모든 `completed` 주문항목을 반환하며,
   **이미 정산에 포함된 항목을 제외하지 않았다**.
2. `SettlementItem.orderItemId` 에 **UNIQUE 제약이 없었다**.

따라서 관리자가 동일/겹치는 기간으로 `POST /settlements` 를 재호출하면 동일 `orderItemId` 가 복수
정산의 `settlement_items` 에 중복 집계되어 중복 지급액(`payoutAmount`)이 산정될 수 있었다.
admin-only 트리거라 외부 공격 표면은 아니나, 운영 실수(중복/겹치는 기간 재정산)로 판매자 과다
지급액이 발생할 수 있는 금전 정합성(P-005) 공백이었다.

008 은 이 공백을 **애플리케이션 레벨 멱등 필터 + DB 레벨 UNIQUE 제약 + 단위 테스트**의 3중
방어로 해소한다. 정산 후보(`getCompletedItemsForSettlement`) 중 이미 `settlement_items` 에 집계된
`orderItemId` 를 제외한 뒤 금액을 재계산하며(P-005 Decimal), `SettlementItem.orderItemId @unique`
로 동일 주문항목의 중복 insert 를 DB 수준에서 차단한다.

---

## 선행 spec 영향 추적

| 선행 spec | 식별된 연동 항목 | 인지 시점 | 식별 경로 |
|---|---|---|---|
| v1.0.0/005-shipping-settlement | 정산 생성(`SettlementService.createSettlement`)이 멱등성을 보장하지 않았다(SEC-FIND-005-01 / GAP-005-01, Medium). 008 이 기집계 항목 제외 필터(`findSettledOrderItemIds`) + `SettlementItem.orderItemId @unique` 로 해결. | 2026-06-29 | settlement.service.ts·schema.prisma SettlementItem |
| v1.0.0/005-shipping-settlement (order) | 정산 후보 집계는 `OrderService.getCompletedItemsForSettlement`(orders 스키마, DI read-only) 를 소비. 008 은 이 메서드를 **변경하지 않고**, settlement 모듈이 자기 소유 테이블(`settlement_items`)을 조회해 기집계 항목을 제외(P-001 경계 유지). | 2026-06-29 | order.service.ts getCompletedItemsForSettlement |

---

## 사용자 스토리

- **US-001**: 플랫폼 운영자로서, 동일/겹치는 기간으로 정산을 재실행하더라도 동일 주문항목이 중복
  집계되지 않아 판매자 과다 지급액이 발생하지 않기를 원한다.
- **US-002**: 데이터 무결성 관점에서, 동일 `orderItemId` 가 복수 정산에 들어가는 일이 DB 수준에서
  구조적으로 차단되기를 원한다.

---

## 기능 요구사항

- **FR-001**: `SettlementService.createSettlement` 는 정산 후보(`OrderService.getCompletedItemsForSettlement`)
  중 **이미 정산에 포함된 `orderItemId` 를 제외**한 뒤 금액을 산정한다. 기집계 여부는
  `SettlementRepository.findSettledOrderItemIds(orderItemIds)` 가 자기 소유 테이블(`settlement_items`)을
  조회해 판정한다(P-001). 제외 후 남은 항목으로 `totalSales`·`commission`·`payoutAmount`(전부
  `Prisma.Decimal`)를 재계산하며, 남은 항목이 0건이면 `createItems` 를 호출하지 않고 금액 0으로
  정산을 생성한다.

- **FR-002**: `SettlementItem.orderItemId` 에 `@unique` 제약을 부여하여 동일 주문항목의 중복 정산
  insert 를 DB 수준에서 차단한다. 008 마이그레이션(`20260629183631_008_settlement_item_orderitem_unique`)이
  `settlement_items_orderItemId_key` UNIQUE INDEX 를 생성한다.

---

## 비기능 요구사항

- **NFR-001** (P-001 모듈 경계): 기집계 판정(`findSettledOrderItemIds`)은 settlement 모듈의 자기 소유
  테이블(`settlements.settlement_items`)만 조회한다. orders 스키마 데이터(정산 후보)는 005 와 동일하게
  `OrderService.getCompletedItemsForSettlement` DI 경유로만 획득하며, `orderItemId`·`orderId`·`sellerId`
  는 cross-schema plain String 으로 다룬다.

- **NFR-002** (P-005 결제·정산 정합성): 기집계 제외 후 금액 재계산은 전부 `Prisma.Decimal` 로
  수행한다 — `totalSales = Σ saleAmount`, `commission = totalSales × COMMISSION_RATE`(소수점 2자리
  `ROUND_HALF_UP`), `payoutAmount = totalSales − commission`. 부동소수점을 사용하지 않는다.

- **NFR-003** (호환성 / additive): 008 변경은 005 정산 생성 흐름에 대해 additive 다 —
  `getCompletedItemsForSettlement`(order) 시그니처 불변, `createSettlement` 의 입력 시그니처 불변.
  005 의 기존 정산 단위 테스트(Decimal 계산·반올림·빈 항목·조회)는 회귀 0 으로 유지된다.

---

## 수용 기준

> **환경 태그 규약**:
> | 태그 | 의미 |
> |---|---|
> | `[env:static]` | 코드·설정·스키마·마이그레이션 파일 존재·구조 검증만으로 판정 가능 |
> | `[env:unit]` | 단위 테스트(mock)로 판정 가능 |

- **SC-001** (`FR-001`·`NFR-002` 관련): 정산 후보 중 일부가 기집계된 경우, 기집계 항목을 제외한
  나머지만 집계한다 — 후보 3건(oi1·oi2·oi3) 중 oi1·oi2 가 기집계 → oi3(saleAmount 5000)만 집계되어
  `totalSales=5000`·`commission=500`·`payoutAmount=4500`, `createItems` 는 oi3 1건만 받는다.
  `findSettledOrderItemIds` 는 후보 전체 orderItemId(oi1·oi2·oi3)로 조회된다. [env:unit]

- **SC-002** (`FR-001` 관련): 정산 후보 전체가 기집계된 경우(재정산), 금액 0으로 정산을 생성하고
  `createItems` 를 호출하지 않는다 — 후보 oi1 1건이 전부 기집계 → `totalSales=0`·`payoutAmount=0`,
  `createItems` 미호출(중복 지급액 0). [env:unit]

- **SC-003** (`FR-002`·`NFR-001` 관련): `SettlementItem.orderItemId` 에 `@unique` 가 선언되어 있고,
  008 마이그레이션이 `settlement_items_orderItemId_key` UNIQUE INDEX 를 생성한다(schema.prisma +
  migration.sql 구조 검증). [env:static]

---

## 요구사항 구조화 매트릭스

> 매핑 누락(SC 없는 FR/NFR, FR/NFR 없는 SC) 0건이 완료 조건.
> MoSCoW: Must / Should / Could / Won't

| US-ID | FR-ID | NFR-ID | SC-ID | [env:*] | MoSCoW |
|---|---|---|---|---|---|
| US-001 | FR-001 | NFR-001, NFR-002 | SC-001, SC-002 | unit | Must |
| US-002 | FR-002 | NFR-001 | SC-003 | static | Must |
| — | — | NFR-003 | (005 회귀 0) | unit | Must |

> NFR-003(additive 호환성)은 005 기존 정산 단위 테스트의 회귀 0(전체 PASS)으로 충족하며 별도 신규 SC
> 없음(부재가 곧 상태). SC-003 의 DB UNIQUE 제약은 구조 검증(static)이며, 동일 항목 중복 insert →
> P2002 의 자동화 단언 테스트는 없다(방어 심층화 — coverage-gap.md 기록).

---

## 해결된 선행 보안 발견

| 식별자 | 선행 spec | 등급 | 008 해결 내용 | 상태 |
|---|---|---|---|---|
| SEC-FIND-005-01 | 005-shipping-settlement | Medium | (1) `findSettledOrderItemIds` 로 기집계 항목 제외(FR-001), (2) `SettlementItem.orderItemId @unique` DB 제약(FR-002), (3) 멱등성 단위 테스트 2건(SC-001·002) — 코드+DB제약+테스트 3중 방어 | **RESOLVED (008, 커밋 e97a142)** |
| GAP-005-01 | 005-shipping-settlement | Medium | SEC-FIND-005-01 과 동일 사안 | **RESOLVED (008)** |

---

## 범위 외

- **정산 취소·정정 시 settlement_items 회수**: 정산을 취소하거나 정정할 때 이미 집계된
  `orderItemId` 의 `@unique` 점유를 해제하는 흐름은 본 spec 범위 외다. 현재 정산은 생성·조회만
  지원하며 취소·정정 엔드포인트가 없다.
- **실 이체(payout) 연동**: 산정된 `payoutAmount` 의 실제 이체는 외부 PG/뱅킹 연동이 필요하며 본
  spec 범위 외다(005 범위 외 항목 승계). 실 이체 시 결제·환불과 동일한 멱등성 키·outbox 패턴(P-005)
  적용은 후속 spec.
- **정산 기간 산정 정확화**: 정산 기간 필터가 주문 `createdAt` 기준(전용 `completedAt` 컬럼 부재,
  005 GAP-005-02)인 점은 본 spec 에서 다루지 않는다.

---

## 미결 사항

없음 — 본 spec 은 구현 완료 코드를 기준으로 retroactive 작성되었으며, 모든 요구사항·수용 기준이 실제
구현과 대조 확인되었다. 008 은 신규 GAP 을 남기지 않는다(gaps.md: NONE). SEC-FIND-005-01 / GAP-005-01
은 본 spec 에서 RESOLVED 처리된다.
