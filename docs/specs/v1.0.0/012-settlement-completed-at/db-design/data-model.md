---
작성: Database Design Agent
버전: v1.0
최종 수정: 2026-06-29 21:01
상태: 확정 (retroactive)
---

# Data Model: 012-settlement-completed-at

## 목차

- [DB 선택 및 근거](#db-선택-및-근거)
- [변경 대상 테이블](#변경-대상-테이블)
  - [orders (completedAt 컬럼 추가)](#orders-completedat-컬럼-추가)
- [데이터 무결성 규칙](#데이터-무결성-규칙)
- [마이그레이션 계획](#마이그레이션-계획)
- [적용 특이사항](#적용-특이사항)
- [롤백 전략](#롤백-전략)

---

## DB 선택 및 근거

- **DB**: PostgreSQL 16 — 단일 인스턴스(P-003). 005 와 동일 DB·Prisma multiSchema 구조 승계.
- **변경 성격**: 신규 테이블·enum·인덱스·제약 **없음**. 기존 `orders.orders` 테이블에 nullable
  `completedAt DateTime?`(PostgreSQL `TIMESTAMP(3)` NULL) **컬럼 1종만 추가**한다.
- **ORM**: Prisma `^6.19.0` multiSchema — `@@schema("orders")` 태그(005 기존).
- **목적**: 구매 확정(completed) 일시를 저장하여, 정산 집계 기간 필터를 주문 생성(`createdAt`) 대신 구매
  확정(`completedAt`) 기준으로 전환(FR-001·FR-004, GAP-005-02 해결).

---

## 변경 대상 테이블

### orders (completedAt 컬럼 추가)

003-commerce 에서 정의되고 005 에서 `deliveredAt` 가 추가된 주문 테이블. 012 는 `completedAt` 을 추가한다.

| 컬럼명 | 타입 | 정의 spec | 012 변경 |
|---|---|---|---|
| `id` | String | PK, `@default(cuid())` | — |
| `userId` | String | cross-schema plain(users.users.id) | — |
| `status` | OrderStatus enum | 003 | — |
| `totalAmount` | Decimal `@db.Decimal(12,2)` | 금전(P-005) | — |
| `discountAmount` | Decimal `@db.Decimal(12,2)` | 금전(P-005) | — |
| `deliveredAt` | DateTime? | 005 (자동 구매 확정 기준) | — |
| `completedAt` | DateTime? | — | **신규 추가** (구매 확정 일시 — 정산 집계 기준 시각) |
| `createdAt` | DateTime `@default(now())` | 003 | — |

```prisma
model Order {
  id                      String      @id @default(cuid())
  /// cross-schema plain String — users.users.id 참조하지만 FK 미선언 (P-001 경계)
  userId                  String
  status                  OrderStatus @default(pending)
  totalAmount             Decimal     @db.Decimal(12, 2)
  discountAmount          Decimal     @default(0) @db.Decimal(12, 2)
  shippingAddressSnapshot Json
  /// 배송 완료 일시 — 자동 구매 확정 기준 (FR-027)
  deliveredAt             DateTime?
  /// 구매 확정(completed) 일시 — 정산 집계 기준 시각 (012 GAP-005-02)
  completedAt             DateTime?
  createdAt               DateTime    @default(now())
  items                   OrderItem[]
  events                  OrderEvent[]

  @@index([userId, createdAt(sort: Desc), id(sort: Desc)])
  @@map("orders")
  @@schema("orders")
}
```

> `completedAt` 은 nullable(`DateTime?`)이며 `deliveredAt`(005)와 동형이다. 비파괴 `ADD COLUMN` 으로
> 기존 행에 NULL 백필 없이 적용된다.

---

## 데이터 무결성 규칙

### 기록 규칙 (애플리케이션 레벨)

- `completedAt` 은 completed 전이 2경로에서만 기록된다:
  - `OrderService.complete`(구매자 직접 확정) → `new Date()`(전이 시점).
  - `OrderService.autoConfirmDelivered(now)`(시스템 자동 확정) → 주입된 `now`(배치 일관성).
- 두 경로 모두 `updateStatus(orderId, completed, { completedAt })` 로 status 전이와 동시에 기록한다.
  completed 외 전이(`confirmed`·`preparing`·`shipped`·`cancelled`)는 `completedAt` 을 기록하지 않는다.

### NULL 의미

- `completedAt = NULL`: 아직 구매 확정되지 않았거나, 012 이전에 completed 로 전이된 주문(백필 미적용).
  정산 집계 필터(`completedAt:{ gte, lte }`)는 NULL 행을 제외한다(범위 외 — gaps.md GAP-012-01 주의).

---

## 마이그레이션 계획

### 마이그레이션 파일

| 파일 | 위치 | 내용 |
|---|---|---|
| `20260629115624_012_order_completed_at/migration.sql` | `apps/backend/prisma/migrations/` | Up: `ALTER TABLE "orders"."orders" ADD COLUMN "completedAt" TIMESTAMP(3)`. 신규 테이블·enum·인덱스 0. |

> 실제 적용 마이그레이션 SQL 은 git 이 형상관리 SoT 다. 본 폴더의 [migrations/README.md](migrations/README.md)
> 가 그 경로·요약·적용 특이사항을 가리킨다(전체 SQL 중복 회피).

### 마이그레이션 순서

1. `orders.orders` 에 nullable `completedAt TIMESTAMP(3)` 컬럼 추가(비파괴 — 기존 행 NULL).
2. `prisma migrate status` up-to-date 확인.

---

## 적용 특이사항

- **비파괴 nullable 추가**: nullable 컬럼 `ADD COLUMN` 은 데이터 손실 경고 없이 적용된다(008 의 UNIQUE
  제약 추가와 달리 비-TTY 프롬프트 이슈 없음). 따라서 `prisma migrate dev` 로 정상 적용했다.
- **백필 없음**: 기존 행은 `completedAt=NULL` 로 유지된다. 그린필드(실 운영 데이터 없음)라 잔존 completed
  주문 백필이 불필요하다(운영 데이터 이행 시에는 별도 백필 필요 — 범위 외).

---

## 롤백 전략

### DB 레벨 롤백

```sql
-- Down: completedAt 컬럼 제거 → 011 완료 기준 복원
ALTER TABLE "orders"."orders" DROP COLUMN "completedAt";
```

### 애플리케이션 레벨 롤백

- **비파괴성**: nullable 컬럼만 추가했으므로 기존 행 데이터 영향 없음. COLUMN DROP 으로 즉시 복원 가능.
- **하위 호환성**: schema.prisma 에서 `completedAt` 제거 + `prisma generate` 재실행 시 애플리케이션이
  012 이전으로 복원 가능(단 `order.service` 의 completedAt 기록·`order.repository` 의 필터 전환도 함께
  되돌려야 GAP-005-02 미해결 상태로 회귀 — `createdAt` 기준 필터로 복원).
- **데이터 손실 범위**: COLUMN DROP 시 기록된 `completedAt` 값이 손실된다(기록 시각 데이터). 단 status·
  정산 금액에는 영향 없음.
