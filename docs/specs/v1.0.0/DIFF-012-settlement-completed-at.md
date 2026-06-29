---
작성: Docs Agent
버전: v1.0
최종 수정: 2026-06-29 21:01
상태: 확정 (retroactive)
---

# Diff: 012-settlement-completed-at

## 목차

- [커밋 메시지용 한 줄 요약](#커밋-메시지용-한-줄-요약)
- [변경 요약](#변경-요약)
- [변경 파일 및 라인 수](#변경-파일-및-라인-수)
- [Diff](#diff)

## 커밋 메시지용 한 줄 요약

- **KO**: 012 정산 기간 기준 시각 전환 — Order.completedAt 추가 + completed 전이 2경로 기록 + 정산 필터 createdAt→completedAt (GAP-005-02)
- **EN**: 012 settlement period basis switch — add Order.completedAt, record on both completed transitions, settlement filter createdAt→completedAt (GAP-005-02)

## 변경 요약

- **schema — completedAt 컬럼(FR-001)**: `Order` 모델에 nullable `completedAt DateTime?`(주석: 구매
  확정 일시 — 정산 집계 기준 시각, 012 GAP-005-02) 추가. `deliveredAt`(005)와 동형.
- **migration 012(FR-001·NFR-002)**: `ALTER TABLE "orders"."orders" ADD COLUMN "completedAt"
  TIMESTAMP(3)`. 비파괴 nullable 추가(기존 행 NULL, 백필 없음 — migrate dev 적용).
- **order.repository — updateStatus extra(FR-001)**: `updateStatus(orderId, status, extra?)` 의 `extra`
  타입에 `completedAt?: Date` 추가(`data: { status, ...extra }`). 선택 속성 확장(비파괴).
- **order.repository — 정산 필터 전환(FR-004, GAP-005-02)**: `findCompletedItemsBySellerInPeriod` 의
  기간 필터를 `createdAt:{ gte, lte }` → `completedAt:{ gte, lte }` 로 전환. 시그니처·반환 형태 불변.
- **order.service — complete 기록(FR-002)**: `complete`(delivered→completed) 가 `updateStatus(orderId,
  completed, { completedAt: new Date() })` 로 전이 시점 기록.
- **order.service — autoConfirm 기록(FR-003)**: `autoConfirmDelivered(now)` 가 각 주문 `updateStatus(
  order.id, completed, { completedAt: now })` 로 주입된 now 기록(배치 일관성).
- **테스트**: `order.service.spec` 의 `complete`·`autoConfirmDelivered` 테스트 단언을 completedAt 포함
  하도록 갱신(신규 it() 0건 — unit 합계 불변 253).
- **해결**: GAP-005-02(정산 기간 기준 시각, Low~Medium) 완전 해결 — 정산 집계가 주문 생성 시각이 아닌
  구매 확정 시각 기준으로 기간 산정.

## 변경 파일 및 라인 수

> 범위: `apps/backend`. base `3735377`(011 정식 SDD 문서 커밋 — 코드는 011 완료 `88de003` 와 동일) →
> `35791d6`(012 완료). `git diff --numstat` 직접 카운트.

| 파일 | 추가 | 삭제 |
|---|---|---|
| `apps/backend/src/modules/order/order.service.spec.ts` | +12 | -1 |
| `apps/backend/src/modules/order/order.service.ts` | +6 | -2 |
| `apps/backend/src/modules/order/order.repository.ts` | +3 | -2 |
| `apps/backend/prisma/schema.prisma` | +2 | -0 |
| `apps/backend/prisma/migrations/20260629115624_012_order_completed_at/migration.sql` (신규) | +2 | -0 |

**합계 (apps/backend)**: 5 files changed, 25 insertions(+), 5 deletions(-).

> 본 012 SDD 문서 세트(`docs/specs/v1.0.0/012-settlement-completed-at/**`) 와 `CHANGES.md` 의 012 항목,
> 그리고 005 문서의 GAP-005-02 상태 갱신은 `35791d6` 코드 커밋 **이후** retroactive 로 별도 추가되었다
> (코드 diff 범위 외).

## Diff

> 전체 diff 는 본 문서에 박제하지 않는다 — **git 이 형상관리 SoT** 이며 전체 캡처는 중복·비효율이다.
> 변경 내용은 위 "변경 요약" · "변경 파일 및 라인 수" 절로 추적하고, 라인 단위 diff 가 필요하면 아래로 재생성한다:
>
> ```bash
> git diff 3735377 35791d6 -- apps/backend   # base commit: 3735377
> ```
