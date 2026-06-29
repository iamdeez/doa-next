---
작성: Design Agent
버전: v1.0
최종 수정: 2026-06-29 21:01
상태: 확정 (retroactive — 전 태스크 구현 완료)
---

# Tasks: 012-settlement-completed-at

> Branch: 012-settlement-completed-at | Date: 2026-06-29 | Plan: [../planning/plan.md](../planning/plan.md)

## 목차

- [전제 조건](#전제-조건)
- [태스크 목록](#태스크-목록)
- [Test Authoring Contract](#test-authoring-contract)
- [구현 완료 기준](#구현-완료-기준)

---

## 전제 조건

- [x] spec.md 의 모든 [NEEDS CLARIFICATION] 항목 해소(미결 사항: 없음)
- [x] plan.md Constitution Gates(P-001~P-007) 통과(예외 0건)
- [x] CHANGES.md 의 이전 작업(011-file-security) "후속 작업 시 주의사항" 확인
- [x] DB Design Agent 활성(`Order.completedAt` 컬럼 추가 + 마이그레이션 012 — db-design/data-model.md)

> A = 데이터(schema·migration·repository), B = 도메인(service), D = 테스트(5a).
> 레이어 A→B→D 의존 순.

---

## 태스크 목록

> 레이어: A 데이터 / B 도메인 / D 테스트(5a).

### Step 1. 스키마·마이그레이션 (A — DB Design Agent 산출)

- [x] **T001** — `Order.completedAt DateTime?` 컬럼 추가
  - 레이어: A
  - 구현 파일: `apps/backend/prisma/schema.prisma`
  - 관련 요구사항: FR-001
  - 상세: `Order` 모델에 `completedAt DateTime?`(주석: 구매 확정 일시 — 정산 집계 기준 시각, 012
    GAP-005-02) 추가. `deliveredAt DateTime?`(005)와 동형 nullable.
  - 완료 기준: `prisma generate` 후 `Order.completedAt` 필드 생성.

- [x] **T002** — 마이그레이션 012 생성·적용
  - 레이어: A
  - 구현 파일: `apps/backend/prisma/migrations/20260629115624_012_order_completed_at/migration.sql`
  - 관련 요구사항: FR-001, NFR-002
  - 상세: `ALTER TABLE "orders"."orders" ADD COLUMN "completedAt" TIMESTAMP(3)`. 비파괴 nullable 컬럼
    추가 — `migrate dev` 적용(기존 행 NULL, 백필 없음).
  - 완료 기준: `prisma migrate status` up-to-date.

### Step 2. repository (A — extra·필터)

- [x] **T003** — `updateStatus` extra 타입에 `completedAt?: Date` 추가
  - 레이어: A
  - 구현 파일: `apps/backend/src/modules/order/order.repository.ts`
  - 관련 요구사항: FR-001
  - 상세: `updateStatus(orderId, status, extra?: { deliveredAt?: Date; completedAt?: Date })` —
    `data: { status, ...extra }`. 선택 속성 확장(비파괴).
  - 완료 기준: `complete`·`autoConfirmDelivered` 가 `{ completedAt }` 전달 가능.

- [x] **T004** — `findCompletedItemsBySellerInPeriod` 필터 `createdAt → completedAt` 전환
  - 레이어: A
  - 구현 파일: `apps/backend/src/modules/order/order.repository.ts`
  - 관련 요구사항: FR-004
  - 상세: `where:{ status: completed, completedAt:{ gte: periodStart, lte: periodEnd }, items:{ some:{
    sellerId } } }`. 시그니처·반환 형태 불변, 기준 컬럼만 전환(주석: 012 GAP-005-02).
  - 완료 기준: 정산 집계가 구매 확정 시각 기준 기간 선별(GAP-005-02 해결).

### Step 3. service 전이 시각 기록 (B)

- [x] **T005** — `complete` completedAt 기록
  - 레이어: B
  - 구현 파일: `apps/backend/src/modules/order/order.service.ts`
  - 관련 요구사항: FR-002
  - 상세: `updateStatus(orderId, OrderStatus.completed, { completedAt: new Date() })`(delivered→completed
    전이 시점).
  - 완료 기준: 구매자 직접 구매 확정 시 completedAt 기록.

- [x] **T006** — `autoConfirmDelivered` completedAt 기록
  - 레이어: B
  - 구현 파일: `apps/backend/src/modules/order/order.service.ts`
  - 관련 요구사항: FR-003
  - 상세: 각 대상 주문 `updateStatus(order.id, OrderStatus.completed, { completedAt: now })`(주입된 now —
    배치 일관성).
  - 완료 기준: 시스템 자동 확정 시 completedAt=now 기록.

### Step 4. 테스트 (D 레이어 — 5a Test Agent AUTHORING)

> 본 Step 은 **5a Test Agent(AUTHORING)** 가 작성. 012 는 신규 it() 를 추가하지 않고 기존 `complete`·
> `autoConfirm` 테스트의 `updateStatus` 단언을 completedAt 포함하도록 **갱신**한다(TDD Red — 기존 단언이
> completedAt 미포함이면 FAIL).

- [x] **T007** — `complete`·`autoConfirm` 단언 갱신 (`order.service.spec.ts`) — SC-001·002
  - 기존 `complete` 테스트: `updateStatus` 단언을 `(FIXED_ORDER_ID, 'completed', { completedAt:
    expect.any(Date) })` 로 갱신(SC-001)
  - 기존 `autoConfirmDelivered` 테스트: `updateStatus('order-auto-001', 'completed', { completedAt: now })`
    단언 추가(SC-002)
  - 신규 it() 0건(단언만 갱신 — unit 합계 불변 253)

---

## Test Authoring Contract

> **5a Test Agent(AUTHORING) 입력 contract**. production canonical 심볼 명시(추측 단언 금지).

### Production canonical 심볼

| 심볼 | canonical 형태 |
|---|---|
| `OrderService` | `complete(userId, orderId)`·`autoConfirmDelivered(now)` |
| `OrderRepository`(mock) | `updateStatus(orderId, status, extra?)`·`findDeliveredBefore(cutoff)`·`appendEvent(...)`·`findById(id)` |
| enum | `OrderStatus`(`@prisma/client`) — `delivered`·`completed` |
| 식별자 상수(기존) | `FIXED_USER_ID`·`FIXED_ORDER_ID`(complete 테스트), `'order-auto-001'`·`now`(autoConfirm 테스트) |

### mock 재현 규약

- **complete(SC-001)**: `mockOrderRepository.findById.mockResolvedValue({ status: 'delivered', userId:
  FIXED_USER_ID })` → `service.complete(FIXED_USER_ID, FIXED_ORDER_ID)` →
  `expect(mockOrderRepository.updateStatus).toHaveBeenCalledWith(FIXED_ORDER_ID, 'completed', {
  completedAt: expect.any(Date) })`.
- **autoConfirm(SC-002)**: `mockOrderRepository.findDeliveredBefore.mockResolvedValue(eligibleOrders)`
  (`order-auto-001` 포함) → `service.autoConfirmDelivered(now)` →
  `expect(mockOrderRepository.updateStatus).toHaveBeenCalledWith('order-auto-001', 'completed', {
  completedAt: now })`.

### SC → 테스트 매핑

| SC-ID | 수용 기준 | 테스트 파일·describe | 비고 |
|---|---|---|---|
| SC-001 | complete 시 completedAt 기록 | order.service.spec.ts::complete (갱신) | [env:unit] |
| SC-002 | autoConfirm 시 completedAt=now 기록 | order.service.spec.ts::autoConfirmDelivered (갱신) | [env:unit] |
| SC-003 | 정산 필터 completedAt 기준 | (정적) order.repository.ts findCompletedItemsBySellerInPeriod | [env:static] 직접 단언 부재(GAP-012-01) |
| SC-004 | completedAt 컬럼·extra 타입 | (정적) schema.prisma·migration·updateStatus extra | [env:static] |

---

## 구현 완료 기준

- [x] 모든 A·B 태스크 체크박스 완료(4단계), D 태스크 완료(5a)
- [x] `pnpm --filter backend test` 전체 PASSED — 005~011 회귀 0 + 012 갱신 단언 PASS `[TypeScript/NestJS]`
- [x] `tsc --noEmit` 0 error
- [x] 마이그레이션 012 적용(`migrate status` up-to-date — `Order.completedAt` 컬럼 추가)
- [x] completed 전이 2경로(`complete`·`autoConfirmDelivered`) 모두 completedAt 기록 확인
- [x] `findCompletedItemsBySellerInPeriod` 필터 `completedAt` 기준 전환 확인(grep)
- [x] `package.json` 신규 의존 0
- [x] git status 의도치 않은 파일 없음
