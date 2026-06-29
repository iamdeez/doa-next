---
작성: Test Agent (EXECUTION)
버전: v1.0
최종 수정: 2026-06-29 19:01
상태: 확정 (retroactive)
---

# Coverage Gap: 008-settlement-idempotency

## 목차

- [미커버 항목 목록](#미커버-항목-목록)
- [DB UNIQUE P2002 자동 단언 부재 (상세)](#db-unique-p2002-자동-단언-부재-상세)
- [신규 단위 테스트 수 기록](#신규-단위-테스트-수-기록)

---

## 미커버 항목 목록

> 모든 spec.md SC(SC-001~003)는 직접 커버(PASS). 아래는 SC 로 정의되지 않았거나 방어 심층화 구조라
> 자동 단언 대상이 없는 항목이다.

| 항목 | 미커버 시나리오 | 카테고리 | 검증 방법 | 담당 | 비고 |
|---|---|---|---|---|---|
| `orderItemId @unique` P2002 자동 단언 | 동일 항목 중복 insert → P2002 → 트랜잭션 롤백 | (2) 설계(방어 심층화) | 동시 재정산 경합 통합 테스트(DB 연결) | 후속 보강 | SC-003 은 schema/migration 구조 검증으로 갈음 |
| `SettlementRepository.findSettledOrderItemIds` 직접 단위 테스트 | 빈 입력 단락(`[]`)·IN 조회 매칭 직접 검증 | (1) 단위테스트 가능 | settlement.repository 직접 테스트 추가 | 개발 | service.spec mock 반환 단언으로 간접 커버 |

---

## DB UNIQUE P2002 자동 단언 부재 (상세)

**현상**: `SettlementItem.orderItemId @unique`(`settlement_items_orderItemId_key`)가 동일 주문항목의
중복 정산 insert 를 DB 수준에서 차단하지만, 동일 `orderItemId` 를 두 번 insert 하여 P2002 가 발생하고
정산 트랜잭션이 롤백됨을 검증하는 **자동화 통합 테스트는 없다**.

**근본 원인 (코드 근거)**:
- 멱등성의 1차 방어는 애플리케이션 필터(`findSettledOrderItemIds` → `filter`)이며, 이는 단위 테스트
  SC-001·002 로 직접 검증된다.
- `@unique` 제약은 애플리케이션 필터를 우회한 경합(동시 재정산)에 대한 2차 방어(방어 심층화)이며,
  P2002 경로를 재현하려면 동시성·실 DB 연결이 필요하다.

**위험도**: 낮음. 1차 방어(애플리케이션 필터)가 단위 테스트로 검증되어 정상 경로의 중복은 차단된다.
2차 방어(`@unique`)는 schema/migration 구조 검증(SC-003)으로 존재가 확인된다.

**권장 수정 방향**: 동시 재정산 경합 시 두 번째 `createItems` 가 P2002 로 거부되고 정산 트랜잭션이
롤백됨을 검증하는 통합 테스트(실 PostgreSQL + 동시 호출) 후속 보강.

---

## 신규 단위 테스트 수 기록

008 신규 단위 테스트는 **2건**이며, 실제 spec 파일의 `it()` 를 직접 카운트하여 확정했다(자가 보고
신뢰하지 않음):

| 파일 | 008 신규 케이스 수 | 구성 |
|---|---|---|
| `settlement.service.spec.ts` | 2 | 멱등성: when_some_items_already_settled... 1 + when_all_items_already_settled... 1 |
| **합계** | **2** | 007 baseline 229 + 2 = 231 unit (정합) |

> `settlement.service.spec.ts` 는 008 에서 기존 6 케이스(Decimal 계산·반올림·빈 항목·listMySettlements
> 2·listAll 1)에 멱등성 2 케이스를 더해 총 8 케이스가 되었다. 신규 suite 가 아니라 기존 suite 확장이며,
> e2e+static(16/84)에는 변화가 없다(008 은 신규 e2e/static 미추가). 본 카운트는 추적 정확성 목적이다.
