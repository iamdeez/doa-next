---
작성: Design Agent
버전: v1.0
최종 수정: 2026-06-29 19:01
상태: 확정 (retroactive — 전 태스크 구현 완료)
---

# Tasks: 008-settlement-idempotency

> Branch: 008-settlement-idempotency | Date: 2026-06-29 | Plan: [../planning/plan.md](../planning/plan.md)

## 목차

- [전제 조건](#전제-조건)
- [태스크 목록](#태스크-목록)
- [Test Authoring Contract](#test-authoring-contract)
- [구현 완료 기준](#구현-완료-기준)

---

## 전제 조건

- [x] spec.md 의 모든 [NEEDS CLARIFICATION] 항목 해소(미결 사항: 없음)
- [x] plan.md Constitution Gates(P-001~P-007) 통과(예외 0건)
- [x] CHANGES.md 의 이전 작업(007-banner-stats-admin) "후속 작업 시 주의사항" 확인
- [x] **Database Design Agent** 가 `data-model.md`(SettlementItem.orderItemId @unique 제약 변경분) + 마이그레이션(`settlement_items_orderItemId_key` UNIQUE INDEX)을 확정하고 Prisma client 재생성 완료

> A 레이어 = schema/repository, B = service, D = 테스트(5a). 레이어 A→B→D 의존 순.

---

## 태스크 목록

> 레이어: A 데이터(schema·repository) / B 도메인(service) / D 테스트(5a).

### Step 1. DB 제약 (A — Database Design Agent)

- [x] **T001** — SettlementItem.orderItemId @unique + 마이그레이션
  - 레이어: A
  - 구현 파일: `apps/backend/prisma/schema.prisma`, `prisma/migrations/20260629183631_008_settlement_item_orderitem_unique/migration.sql`
  - 관련 요구사항: FR-002
  - 상세: `SettlementItem.orderItemId` 에 `@unique` 추가(주석: 동일 주문항목 중복 정산 DB 수준 차단 — 008 SEC-FIND-005-01). 마이그레이션이 `CREATE UNIQUE INDEX "settlement_items_orderItemId_key"` 생성.
  - 완료 기준: 적용 전 DB 중복 0건 확인 후 `migrate deploy` 적용. `migrate status` up-to-date.

### Step 2. 멱등 판정 메서드 (A)

- [x] **T002** — settlement.repository.findSettledOrderItemIds
  - 레이어: A
  - 구현 파일: `apps/backend/src/modules/settlement/settlement.repository.ts`
  - 관련 요구사항: FR-001(P-001)
  - 상세: `findSettledOrderItemIds(orderItemIds: string[]): Promise<string[]>` — 빈 입력 즉시 `[]`. `this.prisma.tx.settlementItem.findMany({ where: { orderItemId: { in } }, select: { orderItemId: true } })` 후 매칭 id 반환.
  - 완료 기준: settlement_items 자기 소유 테이블만 접근(P-001). 빈 입력 단락.

### Step 3. 멱등 필터 (B)

- [x] **T003** — settlement.service.createSettlement 기집계 제외
  - 레이어: B
  - 구현 파일: `apps/backend/src/modules/settlement/settlement.service.ts`
  - 관련 요구사항: FR-001
  - 상세: `candidates = order.getCompletedItemsForSettlement(...)` → `settledIds = Set(findSettledOrderItemIds(candidates.map(orderItemId)))` → `items = candidates.filter(c => !settledIds.has(c.orderItemId))`. 남은 `items` 로 `totalSales`·`commission`(`mul(rate).toDecimalPlaces(2, ROUND_HALF_UP)`)·`payoutAmount`(`minus`) 재계산. `items.length > 0` 일 때만 `createItems` 호출.
  - 완료 기준: 일부 기집계 → 나머지만 집계. 전체 기집계 → 금액 0·createItems skip. 금액 Prisma.Decimal.

### Step 4. 테스트 (D 레이어 — 5a Test Agent AUTHORING)

> 본 Step 은 **5a Test Agent(AUTHORING)** 가 작성(TDD Red). 아래 [Test Authoring Contract](#test-authoring-contract) 가 입력.

- [x] **T004** — 멱등성 단위 테스트 (`settlement.service.spec.ts` 확장) — SC-001·002 (2 케이스)
  - `when_some_items_already_settled_then_excluded_from_aggregation`(SC-001)
  - `when_all_items_already_settled_then_zero_and_no_items_created`(SC-002)
  - `mockSettlementRepository.findSettledOrderItemIds` 기본값 `[]`(기존 005 테스트 회귀 0 보장)

---

## Test Authoring Contract

> **5a Test Agent(AUTHORING) 입력 contract**. production canonical 심볼 명시(추측 단언 금지).

### Production canonical 심볼

| 심볼 | canonical 형태 |
|---|---|
| `SettlementRepository`(mock) | `findSettledOrderItemIds(orderItemIds)`·`createSettlement(data)`·`createItems(items)`·`findById(id)` |
| `SettlementService` | `createSettlement(sellerId, periodStart, periodEnd)` |
| `OrderService`(mock) | `getCompletedItemsForSettlement(sellerId, periodStart, periodEnd)` |
| 상수 | `COMMISSION_RATE='0.1'` |
| Decimal 단언 | `Prisma.Decimal` — `totalSales`·`commission`·`payoutAmount` `.toString()` 비교 |

### mock 재현 규약

- **settlement.service.spec(멱등성)**: `mockSettlementRepository.findSettledOrderItemIds` 기본값 `[]`(beforeEach). SC-001: 후보 3건(oi1·oi2·oi3 saleAmount 10000·23455·5000), `findSettledOrderItemIds.mockResolvedValue(['oi1','oi2'])` → `createSettlement` 인자 `totalSales='5000'`·`commission='500'`·`payout='4500'`, `findSettledOrderItemIds` 는 `['oi1','oi2','oi3']` 로 호출, `createItems` 인자 길이 1·`orderItemId='oi3'`. SC-002: 후보 oi1 1건, `findSettledOrderItemIds.mockResolvedValue(['oi1'])` → `totalSales='0'`·`payout='0'`, `createItems` 미호출.

### SC → 테스트 매핑

| SC-ID | 수용 기준 | 테스트 파일·describe | 비고 |
|---|---|---|---|
| SC-001 | 일부 기집계 제외 후 나머지만 집계 | settlement.service.spec.ts::createSettlement::when_some_items_already_settled... (1) | [env:unit] |
| SC-002 | 전체 기집계 → 0·createItems skip | settlement.service.spec.ts::createSettlement::when_all_items_already_settled... (1) | [env:unit] |
| SC-003 | orderItemId @unique 제약 | schema.prisma + migration.sql 구조 검증 | [env:static] |

---

## 구현 완료 기준

- [x] 모든 A·B 태스크 체크박스 완료(4단계), D 태스크 완료(5a)
- [x] `pnpm --filter backend test` 전체 PASSED — 005~007 회귀 0 + 008 신규 SC `[TypeScript/NestJS]`
- [x] `tsc --noEmit` 0 error
- [x] `SettlementItem.orderItemId @unique` 제약 schema/migration 반영(SC-003)
- [x] 적용 전 DB 중복 0건 확인 후 마이그레이션 적용(`migrate status` up-to-date)
- [x] `package.json` 신규 의존 0. AWS SDK 0
- [x] git status 의도치 않은 파일 없음
