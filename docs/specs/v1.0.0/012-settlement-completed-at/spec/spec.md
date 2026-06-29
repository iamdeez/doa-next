---
작성: Spec Agent
버전: v1.0
최종 수정: 2026-06-29 21:01
상태: 확정 (구현 완료 — retroactive 문서화)
---

# Spec: 012-settlement-completed-at

> Branch: 012-settlement-completed-at | Date: 2026-06-29 | Version: v1.0.0
>
> 본 문서는 이미 구현·검증이 완료된 코드(커밋 `35791d6`, base `3735377`)를 근거로 정식 SDD
> 포맷으로 retroactive 작성되었다. 모든 요구사항·수용 기준은 실제 구현된 `order` 모듈의 정산 기준
> 시각 전환 코드(`Order.completedAt` 컬럼·`complete`/`autoConfirmDelivered` 의 completedAt 기록·
> `OrderRepository.updateStatus` extra·`findCompletedItemsBySellerInPeriod` 필터 전환)와 단위 테스트
> (`order.service.spec.ts` 단언 갱신)에서 확인한 사실을 기준으로 한다.

## 목차

- [배경 및 목적](#배경-및-목적)
- [선행 spec 영향 추적](#선행-spec-영향-추적)
- [사용자 스토리](#사용자-스토리)
- [기능 요구사항](#기능-요구사항)
- [비기능 요구사항](#비기능-요구사항)
- [수용 기준](#수용-기준)
- [요구사항 구조화 매트릭스](#요구사항-구조화-매트릭스)
- [해결된 선행 설계 공백](#해결된-선행-설계-공백)
- [범위 외](#범위-외)
- [미결 사항](#미결-사항)

---

## 배경 및 목적

005-shipping-settlement 의 설계 단계에서 정산 집계 기간 필터의 기준 시각에 대한 한계가 식별되었다
(GAP-005-02, Low~Medium).

- **GAP-005-02 (설계 한계 — 정산 기간 기준 시각)**: 정산 집계 기간 필터가 주문 `createdAt`(주문 생성일)
  기준이었다(`findCompletedItemsBySellerInPeriod` 의 `where:{ createdAt:{ gte:periodStart, lte:periodEnd } }`).
  주문 *완료*(구매 확정 = 정산 대상) 시각을 담는 전용 컬럼이 부재하여 생성일로 단순화한 결과로, 주문
  생성 시점과 완료 시점이 다를 경우(예: 월말 주문이 익월 초에 구매 확정) 정확한 정산 주기 산정에 한계가
  있었다. 005 시점에는 `completedAt` 컬럼이 없어 ACKNOWLEDGED 로 후속 spec 에 위임되었다.

012 는 이 공백을 **주문에 `completedAt` 컬럼을 추가하고, completed 전이 시 이를 기록하며, 정산 집계
기간 필터를 `createdAt` → `completedAt` 으로 전환**하여 해소한다. completed 전이는 두 경로(구매자
직접 구매확정 `complete`, 시스템 자동확정 `autoConfirmDelivered`) 모두에서 `completedAt` 을 기록하며,
정산 집계는 이 구매 확정 시각을 기준으로 기간을 산정한다.

> 단순화 결정: `completedAt` 은 `Order.deliveredAt`(배송 완료 일시, 005)과 동형의 nullable `DateTime?`
> 컬럼으로 추가하며, 기존 정산 흐름·계산 로직은 변경하지 않는다. 기간 필터의 **기준 컬럼만** 전환한다.

---

## 선행 spec 영향 추적

| 선행 spec | 식별된 연동 항목 | 인지 시점 | 식별 경로 |
|---|---|---|---|
| v1.0.0/005-shipping-settlement | 정산 집계 기간 필터가 주문 `createdAt` 기준(GAP-005-02, Low~Medium — 생성 시점과 완료 시점 상이 시 정산 주기 부정확). 012 가 `Order.completedAt` 추가 + completed 전이 시 기록 + 필터를 `completedAt` 기준으로 전환하여 해결. | 2026-06-29 | order.repository.ts `findCompletedItemsBySellerInPeriod`·order.service.ts `complete`/`autoConfirmDelivered` |

---

## 사용자 스토리

- **US-001**: 판매자로서, 내 정산이 주문이 *접수된* 날이 아니라 구매자가 *구매를 확정한* 날 기준으로
  집계되어, 월말에 접수되고 익월에 확정된 주문이 올바른 정산 주기에 포함되기를 원한다.
- **US-002**: 플랫폼 운영자로서, 구매 확정 경로가 구매자 직접 확정이든 시스템 자동 확정이든 동일하게
  구매 확정 시각(`completedAt`)이 기록되어, 정산 기준 시각이 누락 없이 일관되게 산정되기를 원한다.

---

## 기능 요구사항

- **FR-001**: `Order` 모델에 nullable `completedAt DateTime?` 컬럼을 추가하여 구매 확정(completed) 일시를
  기록한다. `OrderRepository.updateStatus(orderId, status, extra?)` 의 `extra` 타입에 `completedAt?: Date`
  를 추가하여 status 갱신과 함께 `completedAt` 을 기록할 수 있게 한다(기존 `deliveredAt?: Date` 와 동형).

- **FR-002**: 구매자 직접 구매 확정 `OrderService.complete(userId, orderId)`(delivered→completed 전이)가
  `orderRepository.updateStatus(orderId, OrderStatus.completed, { completedAt: new Date() })` 로 구매 확정
  시각을 기록한다(전이 시점의 현재 시각).

- **FR-003**: 시스템 자동 구매 확정 `OrderService.autoConfirmDelivered(now)`(delivered→completed 일괄
  전이)가 각 주문에 대해 `orderRepository.updateStatus(order.id, OrderStatus.completed, { completedAt: now })`
  로 구매 확정 시각을 기록한다(주입된 `now` 기준 — 배치 실행 시각 일관성).

- **FR-004**: 정산 집계용 `OrderRepository.findCompletedItemsBySellerInPeriod(sellerId, periodStart,
  periodEnd)` 의 기간 필터를 `createdAt:{ gte, lte }` → `completedAt:{ gte, lte }` 로 전환한다. 정산
  집계가 주문 생성 시각이 아닌 구매 확정 시각 기준으로 기간 내 항목을 선별한다(GAP-005-02 해결).

---

## 비기능 요구사항

- **NFR-001** (정산 정합성 / P-005): 정산 집계 기간 기준 시각을 "주문 생성"에서 "구매 확정"으로 정렬하여,
  주문 생성·완료 시점이 다른 경우의 정산 주기 귀속 오차를 제거한다. 금액 계산 로직(`saleAmount =
  unitPrice × quantity`, Decimal)은 변경하지 않으며 기준 시각만 정밀화한다.

- **NFR-002** (호환성 / 비파괴 마이그레이션): `completedAt` 은 nullable(`DateTime?`) 컬럼으로 추가되어
  기존 행에 NULL 백필 없이 적용 가능하다(`ADD COLUMN ... TIMESTAMP(3)` — 비파괴). `updateStatus` 의
  `extra` 는 선택 인자로 추가되어 기존 호출 측(전이 시 extra 미전달 경로)은 변경 없이 동작한다.

- **NFR-003** (외부 의존 무): 012 는 신규 npm 의존을 0건 추가한다. 기존 Prisma·`@prisma/client`
  (`OrderStatus`·`Prisma`)만 사용하며, 신규 라이브러리·환경변수가 없다.

---

## 수용 기준

> **환경 태그 규약**:
> | 태그 | 의미 |
> |---|---|
> | `[env:unit]` | 단위 테스트(mock)로 판정 가능 |
> | `[env:static]` | 정적 코드 검증(코드 리뷰·grep)으로 판정 (자동 단언 부재) |

- **SC-001** (`FR-002` 관련): 구매자가 delivered 주문을 `complete` 로 구매 확정하면 `updateStatus` 가
  `completedAt` 을 포함하여 호출된다 — `complete(userId, orderId)` →
  `updateStatus(orderId, 'completed', { completedAt: expect.any(Date) })`. [env:unit]

- **SC-002** (`FR-003` 관련): 시스템 자동 확정(`autoConfirmDelivered(now)`)이 대상 주문을 completed 로
  전이하면 `updateStatus` 가 주입된 `now` 를 `completedAt` 으로 기록하며 호출된다 —
  `updateStatus('order-auto-001', 'completed', { completedAt: now })`. [env:unit]

- **SC-003** (`FR-004` 관련): 정산 집계 `findCompletedItemsBySellerInPeriod` 의 기간 필터가
  `completedAt:{ gte: periodStart, lte: periodEnd }` 기준이다(`createdAt` 아님) — 구매 확정 시각 기준
  집계. [env:static] (직접 단위/통합 테스트 부재 — coverage-gap.md·GAP-012-01 참조)

- **SC-004** (`FR-001` 관련): `Order.completedAt DateTime?` 컬럼이 schema·마이그레이션에 존재하며
  `updateStatus` 의 `extra` 타입이 `completedAt?: Date` 를 수용한다 — 마이그레이션 012
  (`ADD COLUMN "completedAt" TIMESTAMP(3)`) 비파괴 적용. [env:static]

---

## 요구사항 구조화 매트릭스

> 매핑 누락(SC 없는 FR/NFR, FR/NFR 없는 SC) 0건이 완료 조건.
> MoSCoW: Must / Should / Could / Won't

| US-ID | FR-ID | NFR-ID | SC-ID | [env:*] | MoSCoW |
|---|---|---|---|---|---|
| US-002 | FR-001 | NFR-002 | SC-004 | static | Must |
| US-002 | FR-002 | NFR-001 | SC-001 | unit | Must |
| US-002 | FR-003 | NFR-001 | SC-002 | unit | Must |
| US-001 | FR-004 | NFR-001 | SC-003 | static | Must |

> 모든 FR(FR-001~004)이 SC 로 직접 대응되며, 매핑 누락 0건이다. SC-001·002 는 단위 테스트
> (`order.service.spec.ts` 의 갱신된 단언)로 직접 검증되고, SC-003·004(필터 전환·스키마)는 정적
> 코드/마이그레이션 검증으로 판정된다(settlement.service.spec 이 OrderService 를 mock 하므로 필터
> 전환의 직접 자동 단언이 부재 — GAP-012-01, coverage-gap.md). NFR-003(외부 의존 무)은 신규 의존
> 0건으로 충족하며 별도 SC 없음(부재가 곧 상태).

---

## 해결된 선행 설계 공백

| 식별자 | 선행 spec | 등급 | 012 해결 내용 | 상태 |
|---|---|---|---|---|
| GAP-005-02 | 005-shipping-settlement | Low~Medium | `Order.completedAt DateTime?` 추가 + completed 전이 2경로(`complete`·`autoConfirmDelivered`)에서 completedAt 기록 + `findCompletedItemsBySellerInPeriod` 기간 필터 `createdAt → completedAt` 전환. 정산 기준 시각을 구매 확정 시각으로 정밀화(FR-001~004, SC-001~004) | **RESOLVED (012, 커밋 35791d6)** |

> 005-shipping-settlement/gaps.md 의 GAP-005-02 상태가 본 spec 으로 RESOLVED(012) 갱신된다.

---

## 범위 외

- **본 변경 이전 completed 주문의 completedAt 백필**: 012 이전에 completed 로 전이된 주문이 있다면
  `completedAt=NULL` 이며, 정산 집계(`completedAt` 기준 필터)에서 제외된다. 본 프로젝트는 그린필드(실
  운영 데이터 없음)이므로 영향이 없으나, 과거 completed 주문의 `completedAt` 백필 스크립트는 본 spec
  범위 외다(운영 데이터 마이그레이션 후속).
- **정산 집계 필터 전환의 실 DB 통합 테스트**: 정산 집계가 `completedAt` 기준으로 올바르게 기간 선별을
  수행하는지 실 PostgreSQL 로 검증하는 통합 테스트는 본 spec 범위 외다. `settlement.service.spec` 이
  `OrderService` 를 mock 하므로 필터 전환의 직접 단위 단언이 부재하며, `order.service.spec` 의
  completedAt 기록 단언으로 간접 커버한다(GAP-012-01, coverage-gap.md — 후속 통합 테스트 권고).
- **completedAt 기반 인덱스 추가**: 정산 집계가 `completedAt` 범위 필터를 사용하나, 별도 `completedAt`
  인덱스 추가는 본 spec 범위 외다(현재 데이터량에서 불필요 — 필요 시 후속 성능 spec).

---

## 미결 사항

없음 — 본 spec 은 구현 완료 코드를 기준으로 retroactive 작성되었으며, 모든 요구사항·수용 기준이 실제
구현과 대조 확인되었다. 012 는 정산 필터 전환의 직접 통합 테스트 부재를 Low 등급 잔여 권고로 남기되
(GAP-012-01), 005 의 GAP-005-02 를 RESOLVED 처리한다.
