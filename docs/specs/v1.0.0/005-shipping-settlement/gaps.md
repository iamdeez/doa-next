---
작성: Design Agent → Security Agent → Docs Agent 누적
버전: v1.0
최종 수정: 2026-06-29 17:30
상태: 확정 (retroactive)
---

# Gaps — 005-shipping-settlement

> 기획/설계 공백 누적 기록. 3단계 이후 모든 Agent 가 누적.

## 목차

- [GAP-005-01](#gap-005-01)
- [GAP-005-02](#gap-005-02)
- [GAP-005-03](#gap-005-03)

---

## GAP-005-01

- **출처**: Security Agent (SEC-FIND-005-01) / Test Agent (coverage-gap)
- **유형**: 보안·정합성 취약점 (Medium) — 정산 멱등성 미보장
- **컨텍스트**: `settlement.service.ts` `createSettlement`, `order.service.ts` `getCompletedItemsForSettlement`, `order.repository.ts` `findCompletedItemsBySellerInPeriod`, `schema.prisma` `SettlementItem`
- **내용**: 정산 생성이 중복 집계를 차단하지 않는다. (1) `getCompletedItemsForSettlement` 가 기간 내 모든 `completed` 주문항목을 반환하며 이미 정산에 포함된 항목을 제외하지 않는다. (2) `SettlementItem.orderItemId` 에 unique 제약이 없다. 따라서 관리자가 동일/겹치는 기간으로 재정산 시 동일 `orderItemId` 가 복수 정산에 중복 집계되어 중복 지급액이 산정될 수 있다. 이를 막는 production 로직·테스트 모두 부재.
- **수정 방향**: (1) `SettlementItem.orderItemId @unique`. (2) `getCompletedItemsForSettlement` 에서 기집계 항목 제외. (3) 중복정산 거부 테스트 추가.
- **영향**: 중간 — admin-only 트리거이므로 외부 악용이 아닌 운영 절차 위험. 금전 정합성(P-005) 설계 공백.
- **상태**: OPEN — 후속 정산 보강 spec 위임. security-report.md SEC-FIND-005-01 과 동일 사안.

## GAP-005-02

- **출처**: Design Agent
- **유형**: 설계 한계 — 정산 기간 기준 시각
- **컨텍스트**: `order.repository.ts` `findCompletedItemsBySellerInPeriod`(ADR-007)
- **내용**: 정산 집계 기간 필터가 주문 `createdAt` 기준이다(`where:{createdAt:{gte:periodStart, lte:periodEnd}}`). 주문 *완료* 시각(전용 `completedAt` 컬럼)이 부재하여 단순화한 결과로, 주문 생성 시점과 완료(정산 대상) 시점이 다를 경우 정확한 정산 주기 산정에 한계가 있다.
- **수정 방향**: 주문에 `completedAt` 컬럼 추가 후 정산 집계를 완료 시각 기준으로 전환 검토.
- **영향**: 낮음~중간 — 정산 주기 경계 케이스의 집계 정확도. 보안 영향 없음.
- **상태**: ACKNOWLEDGED — 정확 정산주기 필요 시 후속 spec.

## GAP-005-03

- **출처**: Development Agent → Docs Agent 코드 검증 완료
- **유형**: 마이그레이션 드리프트
- **컨텍스트**: `prisma/migrations/20260629080659_005_shipping_settlement/migration.sql`
- **내용**: 005 마이그레이션 SQL 에 004(commerce.coupons·user_coupons·reviews + CouponIssuerType·CouponType·UserCouponStatus enum) 테이블 생성도 함께 캡처되어 있다. 004 모델이 `schema.prisma` 엔 존재했으나 004 시점에 별도 마이그레이션이 생성되지 않은 기존 드리프트가, 005 의 `prisma migrate dev` 실행 시 함께 잡힌 것이다.
- **코드 검증**: migration.sql 첫 5개 CreateEnum/CreateTable 이 `commerce.CouponIssuerType`·`CouponType`·`UserCouponStatus`·`commerce.coupons`·`user_coupons`·`reviews`(004) 이며, 그 뒤에 `orders.ShipmentStatus`·`settlements.SettlementStatus`·`shipments`·`shipment_tracking`·`settlements`·`settlement_items`(005) 가 이어진다. DB 는 정상 동기화 상태이며 기능 영향 없음.
- **수정 방향**: 마이그레이션 히스토리 정리(004 부분을 별도 마이그레이션으로 분리)는 백엔드 전체 완료 후 별도 검토.
- **영향**: 낮음 — DB 정상 동기화. 향후 마이그레이션 되돌리기 시 004 테이블도 영향받으므로 히스토리 정리 시 주의.
- **상태**: ACKNOWLEDGED — 백엔드 전체 완료 후 마이그레이션 히스토리 정리 검토.
