---
작성: Database Design Agent
버전: v1.0
최종 수정: 2026-06-29 17:30
상태: 확정 (retroactive)
---

# Data Model: 005-shipping-settlement

## 목차

- [DB 선택 및 근거](#db-선택-및-근거)
- [엔티티 관계도 (ERD)](#엔티티-관계도-erd)
- [테이블 정의](#테이블-정의)
  - [enum 정의](#enum-정의)
  - [shipments](#shipments)
  - [shipment_tracking](#shipment_tracking)
  - [settlements](#settlements)
  - [settlement_items](#settlement_items)
- [인덱스 전략](#인덱스-전략)
- [데이터 무결성 규칙](#데이터-무결성-규칙)
- [마이그레이션 계획](#마이그레이션-계획)
- [롤백 전략](#롤백-전략)

---

## DB 선택 및 근거

- **DB**: PostgreSQL 16 — 단일 인스턴스(P-003). 003/004 와 동일 DB 인스턴스·Prisma multiSchema 구조 승계.
- **스키마**:
  - 배송 2테이블(`shipments`·`shipment_tracking`)은 물리적으로 기존 `orders` 스키마에 배치한다. 단, 논리적 소유는 shipping 모듈이며 order 모듈 소유 테이블(`orders`·`order_items`·`order_events`)에 대한 직접 Prisma 쿼리는 발행하지 않는다(P-001·ADR-001).
  - 정산 2테이블(`settlements`·`settlement_items`)은 신규 `settlements` 스키마에 배치한다(ADR-002).
- **ORM**: Prisma `^6.19.0` multiSchema — `@@schema("orders")` / `@@schema("settlements")` 태그로 스키마 분리.
- **cross-schema/cross-module 참조 전략**: `shipments.orderId`(orders.orders.id)·`settlements.sellerId`(users.sellers.id)·`settlement_items.orderId/orderItemId`(orders)는 plain String 필드로만 참조하고 Prisma `@relation` 미선언(P-001·003 패턴 승계). 동일 스키마/모듈 내 FK(`shipment_tracking.shipmentId → shipments.id`, `settlement_items.settlementId → settlements.id`)만 정식 선언한다.
- **금전 필드 타입**: `Decimal @db.Decimal(12,2)` 전용(P-005·NFR-001). `Float` 미사용. 정산 계산 중간 과정도 `Prisma.Decimal` 산술만 허용(`COMMISSION_RATE='0.1'` 문자열).

---

## 엔티티 관계도 (ERD)

```
[orders 스키마 — shipping 모듈 논리 소유]

Shipment (shipments)
  │  id PK
  │  orderId: String            — 주문 ID (plain String, cross-module: orders.orders.id, FK 미선언)
  │  status: ShipmentStatus     — preparing | shipped | in_transit | delivered (default preparing)
  │  carrier: String            — 택배사
  │  trackingNumber: String     — 운송장 번호
  │  shippedAt: DateTime?        — 발송 일시 (송장 등록 시 기록)
  │  deliveredAt: DateTime?      — 배송 완료 일시 (delivered 전이 시 기록)
  │  createdAt: DateTime
  │
  └──1:N──▶ ShipmentTracking (shipment_tracking)  [append-only]
              id PK
              shipmentId FK → shipments.id  (동일 모듈 정식 FK, ON DELETE CASCADE)
              status: ShipmentStatus  — 이력 시점 상태
              description: String     — 추적 설명
              occurredAt: DateTime    — 이력 발생 일시 (default now)

[settlements 스키마 — settlement 모듈 소유]

Settlement (settlements)
  │  id PK
  │  sellerId: String           — 판매자 ID (plain String, cross-schema: users.sellers.id)
  │  periodStart: DateTime       — 정산 기간 시작
  │  periodEnd: DateTime         — 정산 기간 종료
  │  totalSales: Decimal(12,2)   — 기간 총 매출 (Σ saleAmount)
  │  commission: Decimal(12,2)   — 플랫폼 수수료 (totalSales × 0.1, HALF_UP)
  │  payoutAmount: Decimal(12,2) — 실 지급액 (totalSales − commission)
  │  status: SettlementStatus    — pending | completed (default pending)
  │  createdAt: DateTime
  │
  └──1:N──▶ SettlementItem (settlement_items)
              id PK
              settlementId FK → settlements.id  (동일 스키마 정식 FK, ON DELETE CASCADE)
              orderId: String           (plain String, cross-schema: orders.orders.id)
              orderItemId: String       (plain String, cross-schema: orders.order_items.id)
              saleAmount: Decimal(12,2)       — 항목 매출 (unitPrice × quantity)
              commissionAmount: Decimal(12,2) — 항목 수수료 (saleAmount × 0.1, HALF_UP)

[cross-schema/cross-module 의존 (plain String, FK 미선언)]
shipments.orderId            → orders.orders.id
settlements.sellerId         → users.sellers.id
settlement_items.orderId     → orders.orders.id
settlement_items.orderItemId → orders.order_items.id
```

---

## 테이블 정의

### enum 정의

| enum | 스키마 | 값 | 근거 |
|---|---|---|---|
| `ShipmentStatus` | orders | `preparing`, `shipped`, `in_transit`, `delivered` | 배송 전이(FR-001/002). preparing(기본)→shipped(송장 등록)→in_transit(중간)→delivered(완료) |
| `SettlementStatus` | settlements | `pending`, `completed` | pending: 집계 완료·지급 대기(생성 기본값). completed: 지급 완료(지급 실행은 본 spec 범위 외) |

### shipments

배송 송장 마스터 레코드. shipping 모듈 소유(논리), `orders` 스키마(물리).

| 컬럼명 | 타입 | 제약조건 | 설명 |
|---|---|---|---|
| `id` | String | PK, `@default(cuid())` | 배송 ID |
| `orderId` | String | NOT NULL | 주문 ID — plain String (cross-module: orders.orders.id, FK 미선언 P-001) |
| `status` | ShipmentStatus | NOT NULL, DEFAULT preparing | 배송 상태 |
| `carrier` | String | NOT NULL | 택배사 |
| `trackingNumber` | String | NOT NULL | 운송장 번호 |
| `shippedAt` | DateTime | NULL 허용 | 발송 일시. 송장 등록(createShipment) 시 now 기록 |
| `deliveredAt` | DateTime | NULL 허용 | 배송 완료 일시. delivered 전이(updateStatus) 시 now 기록 |
| `createdAt` | DateTime | NOT NULL, `@default(now())` | 생성 일시 |

```prisma
model Shipment {
  id             String             @id @default(cuid())
  /// cross-module plain String — orders.orders.id 참조하지만 FK 미선언 (P-001 모듈 경계).
  orderId        String
  status         ShipmentStatus     @default(preparing)
  carrier        String
  trackingNumber String
  shippedAt      DateTime?
  deliveredAt    DateTime?
  createdAt      DateTime           @default(now())
  tracking       ShipmentTracking[]

  @@index([orderId])
  @@map("shipments")
  @@schema("orders")
}
```

### shipment_tracking

배송 추적 이력. **append-only** — UPDATE/DELETE 미사용(ADR-006). 이력 무결성 보장.

| 컬럼명 | 타입 | 제약조건 | 설명 |
|---|---|---|---|
| `id` | String | PK, `@default(cuid())` | 추적 이력 ID |
| `shipmentId` | String | NOT NULL, FK → shipments.id | 동일 모듈 정식 FK(ON DELETE CASCADE) |
| `status` | ShipmentStatus | NOT NULL | 이력 시점의 배송 상태 |
| `description` | String | NOT NULL | 추적 설명(예: "Shipment registered (CJ 123456)", "Status updated to delivered") |
| `occurredAt` | DateTime | NOT NULL, `@default(now())` | 이력 발생 일시 |

```prisma
model ShipmentTracking {
  id          String         @id @default(cuid())
  shipmentId  String
  status      ShipmentStatus
  description String
  occurredAt  DateTime       @default(now())
  shipment    Shipment       @relation(fields: [shipmentId], references: [id], onDelete: Cascade)

  @@index([shipmentId, occurredAt(sort: Desc)])
  @@map("shipment_tracking")
  @@schema("orders")
}
```

### settlements

판매자 정산. 기간별 집계 레코드. settlement 모듈 소유, 신규 `settlements` 스키마.

| 컬럼명 | 타입 | 제약조건 | 설명 |
|---|---|---|---|
| `id` | String | PK, `@default(cuid())` | 정산 ID |
| `sellerId` | String | NOT NULL | 판매자 ID — plain String (cross-schema: users.sellers.id, P-001) |
| `periodStart` | DateTime | NOT NULL | 정산 기간 시작 |
| `periodEnd` | DateTime | NOT NULL | 정산 기간 종료 |
| `totalSales` | Decimal(12,2) | NOT NULL | 기간 총 매출 (Σ saleAmount). 금전 필드(P-005) |
| `commission` | Decimal(12,2) | NOT NULL | 플랫폼 수수료 (totalSales × COMMISSION_RATE, HALF_UP 2자리). 금전 필드 |
| `payoutAmount` | Decimal(12,2) | NOT NULL | 실 지급액 (totalSales − commission). 금전 필드 |
| `status` | SettlementStatus | NOT NULL, DEFAULT pending | 정산 상태 |
| `createdAt` | DateTime | NOT NULL, `@default(now())` | 생성 일시 |

```prisma
model Settlement {
  id           String           @id @default(cuid())
  /// cross-schema plain String — users.sellers.id 참조하지만 FK 미선언 (P-001 경계)
  sellerId     String
  periodStart  DateTime
  periodEnd    DateTime
  /// 금전 필드 — 정산 기간 총 매출 (P-005)
  totalSales   Decimal          @db.Decimal(12, 2)
  /// 금전 필드 — 플랫폼 수수료 (P-005)
  commission   Decimal          @db.Decimal(12, 2)
  /// 금전 필드 — 실 지급액 = totalSales - commission (P-005)
  payoutAmount Decimal          @db.Decimal(12, 2)
  status       SettlementStatus @default(pending)
  createdAt    DateTime         @default(now())
  items        SettlementItem[]

  @@index([sellerId, createdAt(sort: Desc)])
  @@map("settlements")
  @@schema("settlements")
}
```

### settlement_items

정산 항목. 정산에 포함된 completed 주문항목 단위 매출 명세.

| 컬럼명 | 타입 | 제약조건 | 설명 |
|---|---|---|---|
| `id` | String | PK, `@default(cuid())` | 정산 항목 ID |
| `settlementId` | String | NOT NULL, FK → settlements.id | 동일 스키마 정식 FK(ON DELETE CASCADE) |
| `orderId` | String | NOT NULL | 주문 ID — plain String (cross-schema: orders.orders.id, P-001) |
| `orderItemId` | String | NOT NULL | 주문항목 ID — plain String (cross-schema: orders.order_items.id, P-001). **UNIQUE 미선언** → 중복 집계 가능(GAP-005-01) |
| `saleAmount` | Decimal(12,2) | NOT NULL | 항목 매출 (unitPrice × quantity). 금전 필드(P-005) |
| `commissionAmount` | Decimal(12,2) | NOT NULL | 항목 수수료 (saleAmount × COMMISSION_RATE, HALF_UP). 금전 필드 |

```prisma
model SettlementItem {
  id               String     @id @default(cuid())
  settlementId     String
  /// cross-schema plain String — orders.orders.id (P-001 경계)
  orderId          String
  /// cross-schema plain String — orders.order_items.id (P-001 경계)
  orderItemId      String
  /// 금전 필드 — 항목 매출 = unitPrice × quantity (P-005)
  saleAmount       Decimal    @db.Decimal(12, 2)
  /// 금전 필드 — 항목 수수료 = saleAmount × COMMISSION_RATE (P-005)
  commissionAmount Decimal    @db.Decimal(12, 2)
  settlement       Settlement @relation(fields: [settlementId], references: [id], onDelete: Cascade)

  @@index([settlementId])
  @@map("settlement_items")
  @@schema("settlements")
}
```

> **orderItemId UNIQUE 미선언 — 설계 한계(GAP-005-01)**: `settlement_items.orderItemId` 에 unique 제약이 없고 `getCompletedItemsForSettlement` 가 기집계 항목을 제외하지 않는다. 따라서 동일/겹치는 기간으로 재정산 시 동일 주문항목이 중복 집계되어 중복 지급액이 산정될 수 있다. 트리거가 admin-only(`AdminGuard`)이므로 운영 절차 위험으로 분류하여 본 spec 에서는 허용·기록한다. 후속 정산 보강 spec 에서 unique 제약 또는 기집계 제외 로직 추가 검토.

---

## 인덱스 전략

| 인덱스 | 대상 테이블 | 컬럼 | 목적 | 관련 FR |
|---|---|---|---|---|
| `shipments_orderId_idx` | shipments | `(orderId)` | 주문 기준 배송 조회 (상태 업데이트·추적 조회) | FR-002·003 |
| `shipment_tracking_shipmentId_occurredAt_idx` | shipment_tracking | `(shipmentId, occurredAt DESC)` | 배송 추적 이력 최신순 조회 | FR-003·SC-003 |
| `settlements_sellerId_createdAt_idx` | settlements | `(sellerId, createdAt DESC)` | 판매자 본인 정산 내역 최신순 조회 | FR-006·SC-006 |
| `settlement_items_settlementId_idx` | settlement_items | `(settlementId)` | 정산 상세(항목) 조회(findById include) | FR-004 |

**선택 근거**:
- `(shipmentId, occurredAt DESC)` 복합 인덱스: 추적 조회가 항상 `WHERE shipmentId=? ORDER BY occurredAt DESC` 패턴(append-only 이력 최신순). 복합 인덱스로 스캔.
- `(sellerId, createdAt DESC)` 복합 인덱스: 판매자 정산 조회가 `WHERE sellerId=? ORDER BY createdAt DESC` 패턴.
- `(orderId)` 단일 인덱스: 배송 조회·정산 집계 시 주문 기준 단일 조건.

---

## 데이터 무결성 규칙

### NOT NULL / DEFAULT

| 테이블 | 컬럼 | 규칙 |
|---|---|---|
| shipments | orderId, status, carrier, trackingNumber | NOT NULL |
| shipments | status | DEFAULT 'preparing' |
| shipment_tracking | shipmentId, status, description | NOT NULL |
| shipment_tracking | occurredAt | DEFAULT now() |
| settlements | sellerId, periodStart, periodEnd, totalSales, commission, payoutAmount | NOT NULL |
| settlements | status | DEFAULT 'pending' |
| settlement_items | settlementId, orderId, orderItemId, saleAmount, commissionAmount | NOT NULL |

### UNIQUE 제약

본 spec 의 4테이블에는 UNIQUE 제약을 선언하지 않는다.

> **`settlement_items.orderItemId` UNIQUE 의도적 미선언**: 정산 멱등성(동일 항목 중복 집계 차단)을 구현하지 않은 결과다. 부재가 곧 한계이며, 그 이유(admin-only 트리거 운영 위험으로 분류하여 본 spec 범위 외)는 GAP-005-01 에 기록한다.

### 참조 무결성 (FK)

| 테이블 | FK 컬럼 | 참조 | ON DELETE | 근거 |
|---|---|---|---|---|
| shipment_tracking | shipmentId | `orders.shipments.id` | CASCADE | shipment 삭제 시 추적 이력 동반 삭제 |
| settlement_items | settlementId | `settlements.settlements.id` | CASCADE | settlement 삭제 시 항목 동반 삭제 |

> **cross-schema 참조 무결성 부재**: `shipments.orderId`·`settlements.sellerId`·`settlement_items.orderId/orderItemId`(plain String 필드)는 DB FK 미선언(P-001·003 패턴 승계). 고아 레코드 방지는 앱 레벨 서비스 DI 경계로 관리.

### CHECK 제약

- 금전 필드 비음수: 정산액은 서버가 `completed` 주문항목 매출에서 계산하므로 음수가 발생하지 않는다(`unitPrice × quantity ≥ 0`, commission ≤ totalSales). 별도 DB CHECK 미선언(Prisma 미지원).

### 롤백 관련 무결성

- 송장 등록·배송 완료·정산 생성은 각각 `runInTransaction` 단일 원자 연산. 실패 시 전체 롤백(부분 반영 없음).

---

## 마이그레이션 계획

### 마이그레이션 파일

| 파일 | 위치 | 내용 |
|---|---|---|
| `20260629080659_005_shipping_settlement/migration.sql` | `apps/backend/prisma/migrations/` | Up: ShipmentStatus·SettlementStatus enum + shipments·shipment_tracking·settlements·settlement_items 4테이블 + 인덱스 + FK. **(주의) 동일 마이그레이션에 004 commerce 테이블 생성도 함께 캡처됨** — 004 모델이 schema.prisma 엔 있었으나 별도 마이그레이션이 없던 기존 드리프트가 `migrate dev` 에서 함께 잡힌 것(GAP-005-03). DB 정상 동기화 상태. |

> db-design 산출물 SQL 사본은 본 spec 에서 별도 박제하지 않는다. 실제 적용 마이그레이션은 `apps/backend/prisma/migrations/20260629080659_005_shipping_settlement/migration.sql` 이 SoT 다. 본 폴더의 [migrations/README.md](migrations/README.md) 가 그 경로·요약을 가리킨다(전체 SQL 중복 회피).

### 마이그레이션 순서 (005 부분)

1. enum 2종 생성 (`orders.ShipmentStatus`, `settlements.SettlementStatus`)
2. `orders.shipments` 테이블 생성
3. `orders.shipment_tracking` 테이블 생성 (shipmentId FK → shipments.id)
4. `settlements.settlements` 테이블 생성
5. `settlements.settlement_items` 테이블 생성 (settlementId FK → settlements.id)
6. 인덱스 4종 생성

> DOWN 시 역순. `shipment_tracking`·`settlement_items`(FK 보유)를 부모 테이블보다 먼저 DROP.

---

## 롤백 전략

### DB 레벨 롤백

마이그레이션 Down 으로 005 테이블·enum 을 제거하여 004 완료 기준으로 복원한다.

```sql
-- Down 실행 순서 (역순 DROP, 005 부분)
DROP TABLE "settlements"."settlement_items";
DROP TABLE "settlements"."settlements";
DROP TABLE "orders"."shipment_tracking";
DROP TABLE "orders"."shipments";
DROP TYPE "settlements"."SettlementStatus";
DROP TYPE "orders"."ShipmentStatus";
-- (신규 settlements 스키마 자체 제거는 별도 운영 판단)
```

### 애플리케이션 레벨 롤백

- **비파괴성**: 신규 4테이블 + 신규 settlements 스키마이므로 기존 테이블에 영향 없음. shipping 테이블은 orders 스키마에 추가되나 order 모듈 기존 테이블 불변.
- **하위 호환성**: schema.prisma 에서 신규 모델 4개·enum 2개 제거 후 `prisma generate` 재실행하면 애플리케이션 코드가 005 이전으로 복원 가능(단 shipping/settlement 모듈 코드도 함께 제거 필요).
- **데이터 손실 범위**: Down 실행 시 `shipments`·`shipment_tracking`·`settlements`·`settlement_items` 의 모든 데이터 소실. 프로덕션 적용 전 백업 필수.
- **마이그레이션 드리프트 주의(GAP-005-03)**: 005 마이그레이션에 004 테이블 생성이 함께 들어 있으므로, 이 마이그레이션을 단순 되돌리면 004 테이블도 영향받는다. 히스토리 정리는 백엔드 전체 완료 후 별도 검토.
