---
작성: Database Design Agent
버전: v1.0
최종 수정: 2026-06-29 19:01
상태: 확정 (retroactive)
---

# Data Model: 008-settlement-idempotency

## 목차

- [DB 선택 및 근거](#db-선택-및-근거)
- [변경 대상 테이블](#변경-대상-테이블)
  - [settlement_items (orderItemId @unique 추가)](#settlement_items-orderitemid-unique-추가)
- [데이터 무결성 규칙](#데이터-무결성-규칙)
- [마이그레이션 계획](#마이그레이션-계획)
- [적용 특이사항](#적용-특이사항)
- [롤백 전략](#롤백-전략)

---

## DB 선택 및 근거

- **DB**: PostgreSQL 16 — 단일 인스턴스(P-003). 005 와 동일 DB·Prisma multiSchema 구조 승계.
- **변경 성격**: 신규 테이블·컬럼·enum **없음**. 기존 `settlements.settlement_items` 테이블의
  `orderItemId` 컬럼에 **UNIQUE 제약(`@unique`)만 추가**한다.
- **ORM**: Prisma `^6.19.0` multiSchema — `@@schema("settlements")` 태그(005 기존).
- **목적**: 동일 주문항목(`orderItemId`)이 복수 정산의 `settlement_items` 에 중복 집계되는 것을 DB
  수준에서 차단(FR-002, SEC-FIND-005-01 해결의 일부).

---

## 변경 대상 테이블

### settlement_items (orderItemId @unique 추가)

005 에서 정의된 정산 항목 테이블. 008 은 `orderItemId` 에 UNIQUE 제약을 추가한다.

| 컬럼명 | 타입 | 005 제약 | 008 변경 |
|---|---|---|---|
| `id` | String | PK, `@default(cuid())` | — |
| `settlementId` | String | FK(settlement, onDelete Cascade) | — |
| `orderId` | String | cross-schema plain String(orders.orders.id) | — |
| `orderItemId` | String | cross-schema plain String(orders.order_items.id) | **`@unique` 추가** |
| `saleAmount` | Decimal `@db.Decimal(12,2)` | 금전(P-005) | — |
| `commissionAmount` | Decimal `@db.Decimal(12,2)` | 금전(P-005) | — |

```prisma
model SettlementItem {
  id               String     @id @default(cuid())
  settlementId     String
  /// cross-schema plain String — orders.orders.id (P-001 경계)
  orderId          String
  /// cross-schema plain String — orders.order_items.id (P-001 경계)
  /// @unique: 동일 주문항목 중복 정산 DB 수준 차단 (008 SEC-FIND-005-01)
  orderItemId      String     @unique
  saleAmount       Decimal    @db.Decimal(12, 2)
  commissionAmount Decimal    @db.Decimal(12, 2)
  settlement       Settlement @relation(fields: [settlementId], references: [id], onDelete: Cascade)

  @@index([settlementId])
  @@map("settlement_items")
  @@schema("settlements")
}
```

> `orderItemId` 는 cross-schema plain String(P-001 경계)이며 FK 가 아니다(orders 스키마 참조). UNIQUE
> 제약은 settlement_items 테이블 내에서 동일 `orderItemId` 의 복수 행을 차단할 뿐, orders 스키마와의
> FK 관계를 만들지 않는다.

---

## 데이터 무결성 규칙

### UNIQUE 제약 (008 신규)

| 테이블 | 컬럼 | 인덱스명 | 효과 |
|---|---|---|---|
| settlement_items | `orderItemId` | `settlement_items_orderItemId_key` | 동일 `orderItemId` 의 두 번째 insert → P2002(Unique constraint failed). 애플리케이션 멱등 필터를 우회한 경합(동시 재정산)에서도 DB 수준 중복 차단 |

### 멱등/원자성 관련

- 정산 생성은 `settlement` + `settlement_items` 단일 트랜잭션(005 패턴). 008 의 UNIQUE 제약은 이
  트랜잭션 내 `createMany` 가 동일 `orderItemId` 를 두 번 쓰려 할 때 트랜잭션을 P2002 로 실패시킨다.
- 애플리케이션 레벨 멱등 필터(`findSettledOrderItemIds` → filter)가 1차 방어, UNIQUE 제약이 2차
  방어(방어 심층화).

---

## 마이그레이션 계획

### 마이그레이션 파일

| 파일 | 위치 | 내용 |
|---|---|---|
| `20260629183631_008_settlement_item_orderitem_unique/migration.sql` | `apps/backend/prisma/migrations/` | Up: `CREATE UNIQUE INDEX "settlement_items_orderItemId_key" ON "settlements"."settlement_items"("orderItemId")`. 신규 테이블·컬럼 0. |

> 실제 적용 마이그레이션 SQL 은 git 이 형상관리 SoT 다. 본 폴더의 [migrations/README.md](migrations/README.md)
> 가 그 경로·요약·적용 특이사항을 가리킨다(전체 SQL 중복 회피).

### 마이그레이션 순서

1. `settlement_items` 의 기존 `orderItemId` 중복 데이터 0건 확인(적용 전제 — UNIQUE 위반 방지).
2. `settlement_items_orderItemId_key` UNIQUE INDEX 생성.

---

## 적용 특이사항

- `prisma migrate dev` 는 기존 테이블에 UNIQUE 제약을 추가할 때 **데이터 손실 경고**를 출력하며 비-TTY
  환경(자동 실행)에서는 확인 프롬프트 없이 실패한다. 따라서 마이그레이션 폴더를 **수동 생성**한 뒤
  `prisma migrate deploy` 로 적용했다.
- 적용 전 `settlement_items` 의 `orderItemId` **중복 0건을 직접 확인**한 후 UNIQUE INDEX 를 생성하여,
  기존 데이터에 의한 제약 위반이 발생하지 않도록 했다.

---

## 롤백 전략

### DB 레벨 롤백

```sql
-- Down: UNIQUE INDEX 제거 → 007 완료 기준 복원
DROP INDEX "settlements"."settlement_items_orderItemId_key";
```

### 애플리케이션 레벨 롤백

- **비파괴성**: 기존 테이블에 제약만 추가했으므로 행 데이터 영향 없음. INDEX DROP 으로 즉시 복원 가능.
- **하위 호환성**: schema.prisma 에서 `@unique` 제거 후 `prisma generate` 재실행 시 애플리케이션이
  008 이전으로 복원 가능(단 settlement.service 멱등 필터·settlement.repository.findSettledOrderItemIds
  도 함께 제거해야 SEC-FIND-005-01 미해결 상태로 회귀).
- **데이터 손실 범위**: INDEX DROP 은 데이터 손실 없음(제약만 제거).
