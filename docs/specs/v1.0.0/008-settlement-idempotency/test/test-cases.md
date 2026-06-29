---
작성: Test Agent (AUTHORING)
버전: v1.0
최종 수정: 2026-06-29 19:01
상태: 확정 (retroactive)
---

# Test Cases: 008-settlement-idempotency

## 목차

- [SC × 시나리오 매트릭스](#sc--시나리오-매트릭스)
- [외부 의존성 명시](#외부-의존성-명시)
- [미커버 항목 (사전 분류)](#미커버-항목-사전-분류)

---

## SC × 시나리오 매트릭스

> 테스트 함수명은 실제 spec 파일의 `it('...')` 식별자 기준.
> 신규 단위 테스트: settlement.service.spec 멱등성 **2** 케이스(SC-001·002). SC-003 은 정적(schema/migration) 검증.

| SC-ID | 수용 기준 | Happy Path | Edge Case | 테스트 파일·함수 | env 태그 |
|---|---|---|---|---|---|
| SC-001 | 일부 기집계 제외 후 나머지만 집계 | `when_some_items_already_settled_then_excluded_from_aggregation` | — | settlement.service.spec.ts::createSettlement | [env:unit] |
| SC-002 | 전체 기집계 → 0·createItems skip | — | `when_all_items_already_settled_then_zero_and_no_items_created` | settlement.service.spec.ts::createSettlement | [env:unit] |
| SC-003 | orderItemId @unique 제약 존재 | schema.prisma `@unique` 선언 + migration `settlement_items_orderItemId_key` UNIQUE INDEX | — | (정적 구조 검증) | [env:static] |

### SC-001 상세 (when_some_items_already_settled_then_excluded_from_aggregation)

- 후보: oi1(10000)·oi2(23455)·oi3(5000). `findSettledOrderItemIds.mockResolvedValue(['oi1','oi2'])`.
- 단언:
  - `findSettledOrderItemIds` 호출 인자 = `['oi1','oi2','oi3']`(후보 전체).
  - `createSettlement` 인자: `totalSales='5000'`·`commission='500'`·`payoutAmount='4500'`.
  - `createItems` 인자 길이 1, `orderItemId='oi3'`.

### SC-002 상세 (when_all_items_already_settled_then_zero_and_no_items_created)

- 후보: oi1(10000). `findSettledOrderItemIds.mockResolvedValue(['oi1'])`.
- 단언: `createSettlement` 인자 `totalSales='0'`·`payoutAmount='0'`. `createItems` **미호출**.

---

## 외부 의존성 명시

### fixture / mock

- `mockSettlementRepository`: `{ findSettledOrderItemIds, createSettlement, createItems, findById, listBySeller, listAll }` jest.fn(). `findSettledOrderItemIds` 기본값 `[]`(beforeEach — 005 기존 테스트 회귀 0 보장).
- `mockOrderService`: `{ getCompletedItemsForSettlement }` jest.fn().
- `mockPrismaService`: `{ runInTransaction: (fn)=>fn(), tx: this }`.
- Decimal fixture: `new Prisma.Decimal('...')` — saleAmount·totalSales·commission·payout `.toString()` 단언.

### 환경 변수

- 단위 테스트: 별도 환경 변수 불필요(전부 mock, DB 연결 없음).

### 외부 서비스

- 단위: DB·네트워크 연결 없음. 전부 mock.

---

## 미커버 항목 (사전 분류)

| 항목 | 미커버 사유 | 카테고리 | 권장 검증 방법 |
|---|---|---|---|
| `orderItemId @unique` P2002 자동 단언 | DB UNIQUE 제약은 방어 심층화이며, 동일 항목 중복 insert → P2002 → 트랜잭션 롤백을 자동 단언하는 통합 테스트가 없음. SC-003 은 schema/migration 구조 검증으로 갈음 | (2) 설계(방어 심층화) | 동시 재정산 경합 시 P2002 거부를 검증하는 통합 테스트(DB 연결) 후속 보강 |
| `SettlementRepository.findSettledOrderItemIds` 직접 단위 테스트 | service 레벨 mock 으로 멱등 분기를 단언하나 repository 의 `IN` 조회·빈 입력 단락(`length===0 → []`) 자체는 직접 단위 테스트 없음 | (1) 단위테스트 가능 | settlement.repository 직접 테스트(빈 입력·IN 매칭) 추가 권장 |
