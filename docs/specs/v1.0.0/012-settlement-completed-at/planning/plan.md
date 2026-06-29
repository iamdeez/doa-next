---
작성: Planning Agent
버전: v1.0
최종 수정: 2026-06-29 21:01
상태: 확정 (retroactive)
---

# Plan: 012-settlement-completed-at

> Branch: 012-settlement-completed-at | Date: 2026-06-29 | Spec: [../spec/spec.md](../spec/spec.md)

## 목차

- [사전 검증 (Constitution Gates)](#사전-검증-constitution-gates)
- [기술 컨텍스트](#기술-컨텍스트)
- [사전 영향도 분석 결과](#사전-영향도-분석-결과)
- [핵심 설계](#핵심-설계)
- [결정 기록 (ADRs)](#결정-기록-adrs)
- [인터페이스 계약](#인터페이스-계약)
- [데이터 모델](#데이터-모델)
- [테스트 전략](#테스트-전략)
- [기타 고려사항](#기타-고려사항)

---

## 사전 검증 (Constitution Gates)

> `constitution.md`(P-001~P-007) 존재 → 해당 조항을 Gates 로 사용한다(constitution 우선). spec.md NFR
> (NFR-001~003)은 P-005 정산 정합성·P-002 외부 의존 추상화를 구체화하며 충돌(완화) 없음.

- [x] **P-001 모듈 경계 원칙**: [Pass 기준: order 모듈이 자기 소유 스키마(orders.*) 외 타 도메인 모델을 직접 참조하지 않음]
  → PASS. `completedAt` 은 `orders.orders` 자기 테이블 컬럼. `complete`·`autoConfirmDelivered`·`findCompletedItemsBySellerInPeriod` 는 전부 orders 스키마 내 접근. 정산(settlements) 모듈은 `getCompletedItemsForSettlement` DI 경유 소비(직접 접근 없음 — 005 경계 유지).
- [x] **P-002 AWS 의존 금지 / 외부 의존 추상화 원칙**: [Pass 기준: `@aws-sdk/*` 및 신규 npm 의존 0건]
  → PASS. 신규 npm 의존 0건(`package.json` 변경 없음). 기존 Prisma·`@prisma/client`(`OrderStatus`·`Prisma`)만.
- [x] **P-003 단일 DB 원칙**: [Pass 기준: 단일 PostgreSQL 외 외부 저장소 0건]
  → PASS. 단일 PostgreSQL. `Order.completedAt` 단일 컬럼 추가(비파괴 `ADD COLUMN`).
- [x] **P-004 클라우드 중립 원칙**: [Pass 기준: 클라우드 전용 API 결합 0건]
  → PASS. 순수 Prisma 컬럼·service 로직. 클라우드 전용 API 0.
- [x] **P-005 결제·정산 정합성 원칙**: [Pass 기준: 금전 수치 Decimal, 정산 기준의 정확성]
  → PASS(직접 충족). 금액 계산(`saleAmount = unitPrice × quantity`, Decimal) 불변. 정산 기준 *시각*을 주문 생성 → 구매 확정으로 정밀화하여 정산 주기 귀속 정확도를 **개선**(GAP-005-02 해결). `completedAt` 은 `DateTime`(시각, 금전 아님).
- [x] **P-006 테스트 원칙**: [Pass 기준: SC-XXX 없는 FR-XXX 0건]
  → PASS. FR-001→SC-004, FR-002→SC-001, FR-003→SC-002, FR-004→SC-003. SC-001·002 단위 직접, SC-003·004 정적 검증(필터 전환 직접 단언 부재는 GAP-012-01 기록).
- [x] **P-007 스펙 범위 원칙**: [Pass 기준: spec.md 범위 외 변경 파일 0건]
  → PASS. 변경 범위 = schema.prisma(completedAt)·migration 012·order.service(complete·autoConfirm completedAt 기록)·order.repository(updateStatus extra·필터 전환)·order.service.spec(단언 갱신). 전부 FR-001~004 추적 가능. 범위 외 리팩토링 0.

> **예외 사항**: 없음. P-001~P-007 전부 통과(예외 0건).

> **Gates 판정**: P-001~P-007 전부 통과(예외 0건). Design Agent(3단계) → Database Design Agent(컬럼·마이그레이션) 진입 가능.

---

## 기술 컨텍스트

> 005 의 확정 스택을 재확정. 012 고유 변경만 명시.

- **언어 / 런타임**: TypeScript 5.4 / Node.js 20.x. pnpm + Turborepo.
- **백엔드 프레임워크**: NestJS 11.x. order 모듈 3계층(controller·service·repository).
- **ORM / DB**: Prisma `^6.19.0` multiSchema + PostgreSQL 16. **DB 스키마 변경: `Order.completedAt
  DateTime?` 1컬럼 추가** — 비파괴 마이그레이션 012(`ADD COLUMN "completedAt" TIMESTAMP(3)`).
- **정산 연동**: `SettlementService` 가 `OrderService.getCompletedItemsForSettlement` DI 경유 소비
  (005 경계). 012 는 그 하위 repository 필터 기준 컬럼만 전환(외부 계약 시그니처 불변).
- **자동 확정**: pg-boss `AutoConfirmJob` 이 `autoConfirmDelivered(now)` 호출(005/004 기존). `now` 주입값을
  `completedAt` 으로 기록.
- **테스트 프레임워크**: Jest(`*.spec.ts`, src rootDir). 단위([env:unit] — SC-001·002), 정적([env:static]
  — SC-003·004).
- **환경변수**: 신규 0. **신규 의존성**: 0건.

---

## 사전 영향도 분석 결과

> 상세는 [../design/research.md](../design/research.md) 참조. 본 절은 영향 파일 요약.

### 영향 파일 목록

| 파일 | 변경 유형 | 영향 내용 | 레이어 |
|---|---|---|---|
| `prisma/schema.prisma` | 수정 | `Order.completedAt DateTime?`(주석 포함) 추가 | A(스키마) |
| `prisma/migrations/20260629115624_012_order_completed_at/migration.sql` | 신규 | `ALTER TABLE "orders"."orders" ADD COLUMN "completedAt" TIMESTAMP(3)` | A(마이그레이션) |
| `src/modules/order/order.repository.ts` | 수정 | `updateStatus` extra 타입에 `completedAt?: Date` 추가 + `findCompletedItemsBySellerInPeriod` 필터 `createdAt → completedAt` 전환 | A |
| `src/modules/order/order.service.ts` | 수정 | `complete` → `{ completedAt: new Date() }`, `autoConfirmDelivered` → `{ completedAt: now }` 기록 | B |
| `src/modules/order/order.service.spec.ts` | 수정 | `complete`·`autoConfirm` 단언이 `completedAt` 포함하도록 갱신(신규 it() 없음) | D |

> `order.controller.ts`·`settlement.service.ts`·`settlement.repository.ts`·`order.constants.ts` 변경 0건
> (외부 계약·정산 계산·자동확정 일수 불변).

---

## 핵심 설계

### 1. completedAt 컬럼 추가 (FR-001 — 정산 기준 시각 저장)

```prisma
model Order {
  ...
  deliveredAt   DateTime?   // 배송 완료 일시 (005)
  completedAt   DateTime?   // 구매 확정(completed) 일시 — 정산 집계 기준 시각 (012 GAP-005-02)
  ...
}
```

- `deliveredAt` 와 동형의 nullable `DateTime?`. 비파괴 `ADD COLUMN`(기존 행 NULL, 백필 불필요).

### 2. completed 전이 양 경로 completedAt 기록 (FR-002·003)

```
complete(userId, orderId):              # 구매자 직접 구매 확정 (delivered → completed)
  ...소유권·상태 검증...
  updateStatus(orderId, completed, { completedAt: new Date() })

autoConfirmDelivered(now):              # 시스템 자동 확정 (delivered → completed 일괄)
  for order in findDeliveredBefore(cutoff):
    updateStatus(order.id, completed, { completedAt: now })
```

- 두 경로 모두 completed 전이 시 `completedAt` 기록. `complete` 는 전이 시점 `new Date()`,
  `autoConfirmDelivered` 는 배치 일관성을 위해 주입된 `now`. `updateStatus` 의 `extra` 가 `deliveredAt`·
  `completedAt` 을 선택적으로 수용(`data: { status, ...extra }`).

### 3. 정산 집계 필터 기준 컬럼 전환 (FR-004 — GAP-005-02 해결)

```
findCompletedItemsBySellerInPeriod(sellerId, periodStart, periodEnd):
  orders = order.findMany({
    where: {
      status: completed,
      completedAt: { gte: periodStart, lte: periodEnd },   # 012: createdAt → completedAt
      items: { some: { sellerId } },
    },
    include: { items: { where: { sellerId } } },
  })
  return orders.flatMap(o => o.items.map(i => ({ orderId, orderItemId, unitPrice, quantity })))
```

- 기간 필터의 **기준 컬럼만** `createdAt` → `completedAt` 으로 전환. 반환 형태·계산은 불변. 정산 집계가
  구매 확정 시각 기준으로 기간 내 항목을 선별.

---

## 결정 기록 (ADRs)

| ADR-ID | 결정 항목 | 채택안 | 대안(검토했으나 미채택) | 근거(spec FR/NFR) | 영향 범위 |
|---|---|---|---|---|---|
| ADR-001 | 정산 기준 시각 컬럼 | 신규 `completedAt DateTime?` | 기존 `createdAt` 유지 | FR-001, NFR-001 (주문 생성 ≠ 구매 확정 — 정산 대상은 확정 시점) | schema·order.repository |
| ADR-002 | completedAt 기록 경로 | completed 전이 2경로(`complete`·`autoConfirmDelivered`) 모두 | 구매자 직접 확정만 | FR-002·003 (자동 확정 누락 시 필터 부정합) | order.service |
| ADR-003 | 자동 확정 시 시각 | 주입된 `now` | 경로별 `new Date()` | FR-003 (배치 내 모든 주문에 일관된 확정 시각) | order.service |
| ADR-004 | completedAt nullable | nullable `DateTime?`(비파괴 ADD COLUMN) | NOT NULL + 백필 | NFR-002 (`deliveredAt` 동형, 그린필드 백필 불필요) | schema·migration |
| ADR-005 | 필터 전환 검증 방식 | order.service.spec completedAt 기록 단언(간접) + 정적 코드 검증 | settlement 실 DB 통합 테스트 | FR-004 (settlement.service.spec 이 OrderService mock — 직접 단언 부재, GAP-012-01) | order.service.spec |

---

## 인터페이스 계약

### 012 변경 인터페이스

```ts
// OrderRepository.updateStatus — extra 타입에 completedAt 추가(선택 인자 확장, 비파괴)
updateStatus(
  orderId: string,
  status: OrderStatus,
  extra?: { deliveredAt?: Date; completedAt?: Date },   // 012: completedAt 추가
): Promise<Order>;

// OrderRepository.findCompletedItemsBySellerInPeriod — 시그니처 불변, 내부 필터 기준 컬럼 전환
findCompletedItemsBySellerInPeriod(
  sellerId: string, periodStart: Date, periodEnd: Date,
): Promise<Array<{ orderId: string; orderItemId: string; unitPrice: Prisma.Decimal; quantity: number }>>;
// where: completedAt(012, was createdAt) gte periodStart, lte periodEnd

// OrderService.complete / autoConfirmDelivered — 외부 시그니처 불변, completedAt 기록 추가(내부)
complete(userId: string, orderId: string): Promise<void>;          // updateStatus(.., { completedAt: new Date() })
autoConfirmDelivered(now: Date): Promise<number>;                  // updateStatus(.., { completedAt: now })
```

### 하위 호환성 / 방어 코드

- **`updateStatus` extra 확장(비파괴)**: `extra` 는 선택 인자이며 `completedAt` 도 선택 속성. 전이 시
  extra 를 전달하지 않는 기존 호출(`confirmBySeller`·`markShipped`·`cancel`·`markConfirmed`)은 변경
  없이 동작(`...extra` 가 `undefined` 전개 → no-op).
- **`findCompletedItemsBySellerInPeriod` 시그니처 불변**: 호출 측(`OrderService.getCompletedItemsForSettlement`
  → `SettlementService`)은 변경 없음. 내부 where 기준 컬럼만 전환되어 외부 계약·반환 형태 불변(005 경계 유지).
- **`completedAt` nullable**: 기존 행·extra 미전달 전이는 NULL 유지. 정산 필터는 `completedAt` 이 NULL 인
  과거 completed 주문을 자동 제외(범위 외 — 그린필드 영향 없음).

---

## 데이터 모델

> 상세는 [../db-design/data-model.md](../db-design/data-model.md) 참조.

`Order` 모델에 nullable `completedAt DateTime?` 컬럼 1종을 추가한다(비파괴 `ADD COLUMN`). 마이그레이션
012(`20260629115624_012_order_completed_at`)가 `ALTER TABLE "orders"."orders" ADD COLUMN "completedAt"
TIMESTAMP(3)` 를 적용한다. 신규 테이블·enum·인덱스·제약은 없다. Database Design Agent 활성(컬럼 추가·
마이그레이션 생성).

---

## 테스트 전략

### SC↔테스트 매핑 (요약)

| SC 식별자 | 수준 | 유형 | 시나리오 요약 | 입력 | 기대 결과 |
|---|---|---|---|---|---|
| SC-001 | 단위 | Happy | complete 시 completedAt 기록 | `complete(userId, orderId)`(delivered) | `updateStatus(orderId, 'completed', { completedAt: expect.any(Date) })` |
| SC-002 | 단위 | Happy | autoConfirm 시 completedAt=now 기록 | `autoConfirmDelivered(now)` | `updateStatus('order-auto-001', 'completed', { completedAt: now })` |
| SC-003 | 정적 | 코드검증 | 정산 필터 completedAt 기준 | `findCompletedItemsBySellerInPeriod` where | `completedAt:{ gte, lte }`(createdAt 아님) |
| SC-004 | 정적 | 스키마검증 | completedAt 컬럼·extra 타입 | schema·migration·updateStatus extra | `Order.completedAt DateTime?` + `extra.completedAt?: Date` |

### smoke_tests

- 필요 여부: N. 012 는 005 의 기존 order·정산 흐름에 `completedAt` 컬럼·기록·필터 기준 전환을 더하는
  패치이며 신규 모듈·AppModule 와이어링·라우트 변경이 없다. 단위 테스트(mock)로 completed 전이 양
  경로의 completedAt 기록을 직접 단언하고, 필터 전환은 정적 코드 검증으로 확인한다(직접 통합 테스트는
  GAP-012-01 후속 권고). 005~011 기존 e2e 부팅은 회귀 0 으로 유지된다.

---

## 기타 고려사항

- **completed 전이 경로 전수 확인**: `OrderStatus.completed` 로 전이하는 경로는 `complete`(구매자)·
  `autoConfirmDelivered`(시스템) 2개뿐이다(grep `OrderStatus.completed` — 전이 호출 2건, 나머지는 조회
  필터 `status: completed`). 두 경로 모두 `completedAt` 을 기록하므로 정산 필터 기준 시각의 누락이 없다
  (ADR-002).
- **과거 completed 주문의 NULL completedAt**: 012 이전 completed 주문은 `completedAt=NULL` 이므로
  `completedAt` 기준 정산 필터에서 제외된다. 그린필드(실 운영 데이터 없음)라 영향이 없으나, 운영 데이터
  이행 시 백필이 필요하다(범위 외 — gaps.md GAP-012-01 주의).
- **필터 전환 검증의 간접성**: `settlement.service.spec` 이 `OrderService` 를 mock 하여 정산 집계의 필터
  전환을 직접 단언하지 못한다. 012 는 `order.service.spec` 의 completedAt 기록 단언(SC-001·002)으로 전이
  시각이 올바르게 기록됨을 보장하고, 필터 기준 컬럼 전환은 정적 코드 검증(SC-003)으로 확인한다. 실 DB
  통합 테스트(completedAt 기준 기간 선별)는 후속 권고다(coverage-gap.md).
- **금액 정합성 불변**: 012 는 정산 기준 *시각*만 정밀화하며 금액 계산(`unitPrice × quantity`, Decimal)·
  커미션·정산 멱등(008)은 변경하지 않는다. P-005 의 금전 정합성 자체에는 영향이 없다.
