---
작성: Design Agent → Docs Agent 누적
버전: v1.0
최종 수정: 2026-06-29 21:01
상태: 확정 (retroactive)
---

# Gaps — 012-settlement-completed-at

> 기획/설계 공백 누적 기록. 3단계 이후 모든 Agent 가 누적.

## 목차

- [신규 GAP](#신규-gap)
- [해결한 선행 설계 공백](#해결한-선행-설계-공백)

---

## 신규 GAP

### GAP-012-01

- **출처**: Design Agent / Test Agent (research·coverage-gap)
- **유형**: 테스트 토폴로지 한계 (Low — 권고) — 정산 집계 필터 전환 직접 검증 부재 + 과거 completed
  주문 completedAt=NULL 제외
- **컨텍스트**: `order.repository.ts` `findCompletedItemsBySellerInPeriod`, `settlement.service.spec.ts`
  (OrderService mock), `Order.completedAt`(nullable, 백필 없음)
- **내용**: (1) 정산 집계 기간 필터를 `createdAt → completedAt` 으로 전환했으나, 이 필터가 completedAt
  기준으로 올바르게 기간 선별하는지 직접 단언하는 자동 테스트가 없다. `settlement.service.spec` 이
  `OrderService.getCompletedItemsForSettlement` 를 mock 하여 정산 계산을 검증하므로, 하위 repository 의
  where 필터(기준 컬럼)가 mock 경계 아래에 있어 단위 테스트로 도달하지 않는다. `order.service.spec` 의
  completedAt 기록 단언(SC-001·002)으로 전이 시각 기록은 보장되나, 필터 전환은 정적 코드 검증(SC-003)에
  의존한다. (2) 012 이전 completed 주문은 `completedAt=NULL`(비파괴 추가, 백필 없음)이라 정산 필터에서
  제외된다.
- **수정 방향**: (1) 실 PostgreSQL 로 completedAt 기준 기간 선별(기간 내 포함·기간 밖/NULL 제외)을
  검증하는 정산 집계 통합 테스트 추가. (2) 운영 데이터 이행 시 과거 completed 주문의 completedAt 백필
  (`order_events` 의 toStatus=completed 행 createdAt 기준).
- **영향**: 낮음 — 필터 전환은 단일 where 조건 기준 컬럼 변경으로 정적 리뷰로 확인되며, completed 전이
  시각 기록은 단위 테스트로 직접 보장된다. 과거 completed 주문 제외는 그린필드(실 데이터 없음)라 실질
  영향 없음.
- **상태**: OPEN — 정산 집계 통합 테스트·운영 데이터 백필은 후속 spec 위임(Low 권고). coverage-gap.md
  와 동일 사안.

---

## 해결한 선행 설계 공백

| 식별자 | 선행 spec | 등급 | 012 해결 | 상태 |
|---|---|---|---|---|
| GAP-005-02 | 005-shipping-settlement | Low~Medium | `Order.completedAt DateTime?` 추가 + completed 전이 2경로(`complete`·`autoConfirmDelivered`)에서 completedAt 기록 + `findCompletedItemsBySellerInPeriod` 기간 필터 `createdAt → completedAt` 전환. 정산 기준 시각을 구매 확정 시각으로 정밀화 | **RESOLVED (012, 커밋 35791d6)** |

> 005-shipping-settlement/gaps.md 의 GAP-005-02 상태가 본 spec 으로 RESOLVED(012) 갱신된다.
