---
작성: Design Agent
버전: v1.0
최종 수정: 2026-06-29 21:01
상태: 확정 (retroactive)
---

# Research: 012-settlement-completed-at

## 목차

- [분석 우선순위 게이트 결과](#분석-우선순위-게이트-결과)
- [선행 발견(005) 분석](#선행-발견005-분석)
- [기존 코드베이스 분석](#기존-코드베이스-분석)
  - [클래스·모듈 계층 구조](#클래스모듈-계층-구조)
  - [completed 전이 경로 전수](#completed-전이-경로-전수)
  - [영향 범위 분석 (호출 측 전수 목록)](#영향-범위-분석-호출-측-전수-목록)
- [영향 파일 목록](#영향-파일-목록)
- [createdAt → completedAt 전환 근거](#createdat--completedat-전환-근거)
- [null completedAt 처리](#null-completedat-처리)
- [엣지 케이스 및 한계](#엣지-케이스-및-한계)

---

## 분석 우선순위 게이트 결과

- **변경 대상 모듈(plan §핵심 설계)**: `order`(schema `Order.completedAt` 추가, repository `updateStatus`
  extra·`findCompletedItemsBySellerInPeriod` 필터 전환, service `complete`·`autoConfirmDelivered`
  completedAt 기록), `prisma/migrations`(012). controller·settlement·constants **변경 없음**.
- §A·B·C 분석은 order.service·order.repository·schema.prisma 로 한정.
- §D(다단계 병렬 파이프라인): 미해당.
- §E(동일 가드 결정 통합): 미해당(인가 변경 없음).
- 외부 라이브러리 검증(§4): **신규 라이브러리 0건**. 기존 Prisma·`@prisma/client` 만.
- §F(production 시그니처 변경): **부분 해당** — `OrderRepository.updateStatus` 의 `extra` 타입에
  `completedAt?: Date` 추가(선택 속성 확장 — 비파괴, 기존 호출 측 영향 0). `complete`·`autoConfirmDelivered`·
  `findCompletedItemsBySellerInPeriod` 외부 시그니처 불변.

---

## 선행 발견(005) 분석

> 005-shipping-settlement 의 설계 한계 GAP-005-02(정산 기간 기준 시각) — 012 가 해결 대상.

| 항목 | 005 상태 (한계) | 코드 근거 |
|---|---|---|
| 정산 기간 기준 시각 (GAP-005-02) | 정산 집계 기간 필터가 주문 `createdAt` 기준. 주문 *완료*(구매 확정) 시각 전용 컬럼 부재로 생성일로 단순화 | `order.repository.ts`(005) `findCompletedItemsBySellerInPeriod` `where:{ createdAt:{ gte, lte } }` |

**정산 주기 귀속 한계(005)**: 주문이 월말(예: 1/31)에 접수되고 구매 확정이 익월 초(예: 2/2)에 이뤄지면,
정산 대상(구매 확정)은 2월이지만 `createdAt` 기준 필터는 이 주문을 1월 정산에 귀속시킨다. 주문 생성과
구매 확정 시점이 다를수록 정산 주기 경계의 집계 정확도가 떨어진다.

---

## 기존 코드베이스 분석

> context.md §2 핵심 모듈 목록을 기준선. 본 절은 변경 대상 한정 정밀 분석.

### 클래스·모듈 계층 구조

- **OOP 상속/추상 클래스 없음**: 변경 대상은 NestJS `@Injectable()` concrete 클래스(`OrderService`·
  `OrderRepository`). DI 의존 추가 없음(012 는 새 의존 0).
- **schema 변경**: `Order` 모델에 `completedAt DateTime?` 1컬럼 추가. 기존 `deliveredAt DateTime?`(005)와
  동형. import·신규 패키지 없음.
- **마이그레이션**: `20260629115624_012_order_completed_at/migration.sql`(`ADD COLUMN`).

### completed 전이 경로 전수

`OrderStatus.completed` 로의 *전이*(updateStatus 호출)는 정확히 2경로다(grep 확인):

| 경로 | 메서드 | actorType | 012 전이 시각 |
|---|---|---|---|
| 구매자 직접 구매 확정 | `complete(userId, orderId)` (delivered → completed) | CUSTOMER | `new Date()`(전이 시점) |
| 시스템 자동 확정 | `autoConfirmDelivered(now)` (delivered → completed 일괄) | SYSTEM | 주입된 `now`(배치 일관성) |

> 나머지 `status: completed` 출현은 전부 *조회 필터*(`findCompletedItemsBySellerInPeriod`·`countCompleted`·
> `sumCompletedTotalAmount`·`getSellerCompletedSummary`)이며 전이가 아니다. 두 전이 경로 모두 completedAt
> 을 기록하므로 정산 필터 기준 시각의 누락이 없다.

### 영향 범위 분석 (호출 측 전수 목록)

- **`OrderRepository.updateStatus`(extra 확장)**: 호출 측은 `complete`·`autoConfirmDelivered`(012 가
  completedAt 전달)·`confirmBySeller`·`cancel`·`markShipped`·`markDelivered`·`markConfirmed`. extra 가
  선택 인자·선택 속성이므로 completedAt 미전달 경로(`confirmBySeller`·`cancel`·`markShipped`·`markConfirmed`)는
  변경 없이 동작(`markDelivered` 는 005 기존 `{ deliveredAt }` 전달). 비파괴 확장.
- **`OrderRepository.findCompletedItemsBySellerInPeriod`(내부 필터 전환)**: 외부 시그니처·반환 형태 불변.
  호출 측 `OrderService.getCompletedItemsForSettlement` → `SettlementService` 변경 없이 동작. where
  기준 컬럼만 `createdAt → completedAt`.
- **`OrderService.complete`·`autoConfirmDelivered`(내부 변경)**: 외부 시그니처 불변. controller·
  AutoConfirmJob 호출 측 변경 없음.

---

## 영향 파일 목록

| 파일 | 변경 유형 | 영향 내용 | 레이어 |
|---|---|---|---|
| `prisma/schema.prisma` | 수정 | `Order.completedAt DateTime?`(주석 포함, +2) | A |
| `prisma/migrations/20260629115624_012_order_completed_at/migration.sql` | 신규 | `ALTER TABLE "orders"."orders" ADD COLUMN "completedAt" TIMESTAMP(3)`(+2) | A |
| `src/modules/order/order.repository.ts` | 수정 | `updateStatus` extra `completedAt?: Date` + 필터 `createdAt → completedAt`(+3 -2) | A |
| `src/modules/order/order.service.ts` | 수정 | `complete`·`autoConfirmDelivered` completedAt 기록(+6 -2) | B |
| `src/modules/order/order.service.spec.ts` | 수정 | `complete`·`autoConfirm` 단언 갱신(신규 it() 없음, +12 -1) | D |

> `order.controller.ts`·`settlement.service.ts`·`settlement.repository.ts`·`order.constants.ts`·
> `package.json` 변경 0건.

---

## createdAt → completedAt 전환 근거

- **정산 대상 = 구매 확정 항목**: 정산은 구매 확정(completed)된 주문항목의 매출을 판매자에게 지급한다.
  따라서 정산 주기 귀속의 자연스러운 기준 시각은 주문이 *접수된* `createdAt` 이 아니라 구매가 *확정된*
  `completedAt` 이다.
- **005 가 createdAt 을 쓴 이유**: 005 시점에 `completedAt` 전용 컬럼이 없어, completed 상태 필터
  (`status: completed`)에 시각 범위는 생성일(`createdAt`)로 단순화했다(GAP-005-02 로 명시 기록·후속 위임).
- **012 전환**: `completedAt` 컬럼을 추가하고 전이 시 기록하면, 정산 필터를 `completedAt:{ gte, lte }`
  로 전환하여 구매 확정 시각 기준 기간 선별이 가능하다. 반환 형태·금액 계산은 불변이므로 기존 정산
  계산·멱등(008)에 영향이 없다.

---

## null completedAt 처리

- **본 변경 이전 completed 주문**: 012 이전에 completed 로 전이된 주문은 `completedAt=NULL`(컬럼 nullable,
  백필 없음)이다. `completedAt:{ gte, lte }` 필터는 NULL 행을 매칭하지 않으므로 이 주문들은 정산 집계에서
  **제외**된다.
- **그린필드 영향 없음**: 본 프로젝트는 실 운영 데이터가 없는 그린필드이므로, 012 적용 시점에 잔존하는
  completed 주문이 없거나 무시 가능하다. 운영 데이터 이행 시에는 과거 completed 주문의 `completedAt`
  백필(예: 마지막 completed 전이 이벤트의 `createdAt` 으로)이 필요하다(범위 외 — GAP-012-01 주의).
- **전이 후 신규 주문**: 012 적용 후 completed 전이되는 모든 주문은 양 경로에서 `completedAt` 을 기록하므로
  정산 필터에 정상 포함된다.

---

## 엣지 케이스 및 한계

- **자동 확정 배치의 now 일관성**: `autoConfirmDelivered(now)` 는 cutoff 계산(`now - AUTO_CONFIRM_DAYS`)과
  `completedAt` 기록에 동일한 주입 `now` 를 사용한다. 배치 내 모든 주문이 같은 확정 시각을 가져 정산 주기
  경계에서 일관된다(ADR-003).
- **completed 전이 멱등 경계**: `complete` 는 `status !== delivered` 면 400 으로 거부하므로 이미 completed
  인 주문에 재기록되지 않는다. `autoConfirmDelivered` 는 `findDeliveredBefore(cutoff)`(delivered 만)를
  대상으로 하므로 이미 completed 인 주문을 재처리하지 않는다(completedAt 덮어쓰기 없음).
- **정산 필터 전환 검증의 간접성(한계)**: `settlement.service.spec` 이 `OrderService` 를 mock 하여 필터
  전환을 직접 단언하는 자동 테스트가 없다. `order.service.spec` 의 completedAt 기록 단언(SC-001·002)이
  전이 시각 기록을 보장하고, 필터 기준 컬럼은 정적 코드 검증(SC-003)으로 확인한다. 실 DB 통합 테스트는
  후속 권고다(GAP-012-01, coverage-gap.md).

가정-실제 불일치 현재 미발견.
