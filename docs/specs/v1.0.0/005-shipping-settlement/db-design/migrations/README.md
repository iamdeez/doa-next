---
작성: Database Design Agent
버전: v1.0
최종 수정: 2026-06-29 17:30
상태: 확정 (retroactive)
---

# 005 마이그레이션 포인터

## 목차

- [실제 마이그레이션 위치](#실제-마이그레이션-위치)
- [포함 내용 요약](#포함-내용-요약)
- [마이그레이션 드리프트 주의](#마이그레이션-드리프트-주의)

---

## 실제 마이그레이션 위치

005 의 실제 적용 마이그레이션 SQL 은 Prisma 마이그레이션 디렉토리에 위치하며 git 이 형상관리
SoT 다. 본 문서는 전체 SQL 을 중복 박제하지 않고 경로·요약만 가리킨다.

```
apps/backend/prisma/migrations/20260629080659_005_shipping_settlement/migration.sql
```

전체 내용 확인:

```bash
cat apps/backend/prisma/migrations/20260629080659_005_shipping_settlement/migration.sql
```

테이블 정의·컬럼·인덱스·제약의 사람이 읽을 설명은 [../data-model.md](../data-model.md) 가 담당한다.

---

## 포함 내용 요약

해당 마이그레이션 파일이 생성하는 객체 (005 부분):

| 종류 | 객체 | 스키마 |
|---|---|---|
| Enum | `ShipmentStatus` (preparing, shipped, in_transit, delivered) | orders |
| Enum | `SettlementStatus` (pending, completed) | settlements |
| Table | `shipments` (orderId, status, carrier, trackingNumber, shippedAt?, deliveredAt?, createdAt) | orders |
| Table | `shipment_tracking` (shipmentId FK, status, description, occurredAt) | orders |
| Table | `settlements` (sellerId, periodStart, periodEnd, totalSales, commission, payoutAmount Decimal(12,2), status, createdAt) | settlements |
| Table | `settlement_items` (settlementId FK, orderId, orderItemId, saleAmount, commissionAmount Decimal(12,2)) | settlements |
| Index | `shipments_orderId_idx` | orders |
| Index | `shipment_tracking_shipmentId_occurredAt_idx` (occurredAt DESC) | orders |
| Index | `settlements_sellerId_createdAt_idx` (createdAt DESC) | settlements |
| Index | `settlement_items_settlementId_idx` | settlements |
| FK | `shipment_tracking.shipmentId → shipments.id` (CASCADE) | orders |
| FK | `settlement_items.settlementId → settlements.id` (CASCADE) | settlements |

---

## 마이그레이션 드리프트 주의

동일 마이그레이션 파일(`20260629080659_005_shipping_settlement/migration.sql`)에는 **004
(commerce.coupons·user_coupons·reviews + CouponIssuerType·CouponType·UserCouponStatus enum) 테이블
생성도 함께 캡처**되어 있다. 004 모델이 `schema.prisma` 엔 존재했으나 004 시점에 별도 마이그레이션이
생성되지 않은 기존 드리프트가, 005 의 `prisma migrate dev` 실행 시 함께 잡힌 것이다. DB 는 정상
동기화 상태이며 기능 영향은 없다. 마이그레이션 히스토리 정리는 백엔드 전체 완료 후 별도 검토한다
(GAP-005-03).
