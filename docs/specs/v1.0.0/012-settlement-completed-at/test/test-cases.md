---
작성: Test Agent (AUTHORING)
버전: v1.0
최종 수정: 2026-06-29 21:01
상태: 확정 (retroactive)
---

# Test Cases: 012-settlement-completed-at

## 목차

- [SC × 시나리오 매트릭스](#sc--시나리오-매트릭스)
- [케이스 상세](#케이스-상세)
- [외부 의존성 명시](#외부-의존성-명시)
- [미커버 항목 (사전 분류)](#미커버-항목-사전-분류)

---

## SC × 시나리오 매트릭스

> 테스트 함수명은 실제 spec 파일의 기존 `describe`/`it` 식별자 기준.
> 012 는 **신규 it() 를 추가하지 않고** 기존 `complete`·`autoConfirmDelivered` 테스트의 `updateStatus`
> 단언을 completedAt 포함하도록 **갱신**한다(unit 합계 불변 253). SC-003·004 는 정적 코드/스키마 검증.

| SC-ID | 수용 기준 | Happy Path | Edge Case | 테스트 파일·함수 | env 태그 |
|---|---|---|---|---|---|
| SC-001 | complete 시 completedAt 기록 | complete 단언 갱신(`{ completedAt: expect.any(Date) }`) | — | order.service.spec.ts::complete | [env:unit] |
| SC-002 | autoConfirm 시 completedAt=now 기록 | autoConfirm 단언 추가(`{ completedAt: now }`) | — | order.service.spec.ts::autoConfirmDelivered | [env:unit] |
| SC-003 | 정산 필터 completedAt 기준 | — | — | (정적) order.repository.ts::findCompletedItemsBySellerInPeriod | [env:static] |
| SC-004 | completedAt 컬럼·extra 타입 | — | — | (정적) schema.prisma·migration·updateStatus extra | [env:static] |

---

## 케이스 상세

### SC-001 (order.service.spec.ts :: complete — 단언 갱신)

- 선행: `mockOrderRepository.findById.mockResolvedValue({ status: 'delivered', userId: FIXED_USER_ID })`
  (delivered 상태, 본인 소유).
- 입력: `service.complete(FIXED_USER_ID, FIXED_ORDER_ID)`.
- 단언(012 갱신): `expect(mockOrderRepository.updateStatus).toHaveBeenCalledWith(FIXED_ORDER_ID,
  'completed', { completedAt: expect.any(Date) })`.
  - 012 이전: `updateStatus(FIXED_ORDER_ID, 'completed')`(extra 없음) → 갱신으로 completedAt 단언 추가.

### SC-002 (order.service.spec.ts :: autoConfirmDelivered — 단언 추가)

- 선행: `mockOrderRepository.findDeliveredBefore.mockResolvedValue(eligibleOrders)`(`order-auto-001` 포함),
  `now` 고정 Date.
- 입력: `service.autoConfirmDelivered(now)`.
- 단언(012 추가): `expect(mockOrderRepository.updateStatus).toHaveBeenCalledWith('order-auto-001',
  'completed', { completedAt: now })`(주입된 now 기록). 기존 `findDeliveredBefore` 호출 단언·`count`
  단언은 유지.

### SC-003 (정적 — 정산 필터 기준 컬럼)

- 검증 방법: `order.repository.ts` `findCompletedItemsBySellerInPeriod` 코드 리뷰/grep.
- 확인 사실: `where:{ status: completed, completedAt:{ gte: periodStart, lte: periodEnd }, items:{ some:{
  sellerId } } }` — 기간 필터가 `completedAt` 기준(`createdAt` 아님). 주석 `// 정산 기준 시각 = 구매 확정
  (completed) 일시 (012 GAP-005-02)`.
- 자동 단언 부재: `settlement.service.spec` 이 `OrderService` 를 mock 하여 필터 전환을 직접 단언하는
  자동 테스트가 없다(GAP-012-01). SC-001·002 의 completedAt 기록 단언이 전이 시각 기록을 간접 보장.

### SC-004 (정적 — completedAt 컬럼·extra 타입)

- 검증 방법: `schema.prisma`·마이그레이션 012·`order.repository.ts` 코드 리뷰.
- 확인 사실: `Order.completedAt DateTime?` 필드 존재, 마이그레이션 012 `ADD COLUMN "completedAt"
  TIMESTAMP(3)`, `updateStatus(orderId, status, extra?: { deliveredAt?: Date; completedAt?: Date })`.

---

## 외부 의존성 명시

### fixture / mock

- `mockOrderRepository`: `findById`·`findDeliveredBefore`·`updateStatus`·`appendEvent` jest.fn(). SC-001·002
  는 `updateStatus` 의 `completedAt` 인자 단언.
- 식별자 상수(기존): `FIXED_USER_ID`·`FIXED_ORDER_ID`(complete), `'order-auto-001'`·`now`(autoConfirm).
- enum: `OrderStatus`(`@prisma/client`) — `delivered`·`completed`.

### 환경 변수

- 단위 테스트: 별도 환경 변수 불필요(전부 mock, DB 연결 없음).

### 외부 서비스

- 단위: DB·네트워크 연결 없음. 전부 mock. SC-003·004 는 정적 코드/스키마 검증(테스트 실행 아님).

---

## 미커버 항목 (사전 분류)

| 항목 | 미커버 사유 | 카테고리 | 권장 검증 방법 |
|---|---|---|---|
| 정산 집계 필터 전환 직접 단언 | `settlement.service.spec` 이 `OrderService` 를 mock 하여 `findCompletedItemsBySellerInPeriod` 의 completedAt 기준 필터를 직접 단언하지 못함. order.service.spec 의 completedAt 기록 단언으로 간접 커버 | (2) 설계(통합 한계) | 실 PostgreSQL 로 completedAt 기준 기간 선별 검증하는 정산 집계 통합 테스트 |
| 과거 completed 주문 completedAt=NULL 제외 | 본 변경 이전 completed 주문이 정산 필터에서 제외됨 — 그린필드라 실 데이터 없음 | (3) 기능 미구현(범위 외) | 운영 데이터 이행 시 백필 스크립트 + 검증 |
