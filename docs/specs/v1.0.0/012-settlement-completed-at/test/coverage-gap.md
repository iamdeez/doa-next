---
작성: Test Agent (EXECUTION)
버전: v1.0
최종 수정: 2026-06-29 21:01
상태: 확정 (retroactive)
---

# Coverage Gap: 012-settlement-completed-at

## 목차

- [미커버 항목 목록](#미커버-항목-목록)
- [정산 집계 필터 전환 직접 테스트 부재 (상세)](#정산-집계-필터-전환-직접-테스트-부재-상세)
- [과거 completed 주문 completedAt=NULL 제외 (상세)](#과거-completed-주문-completedatnull-제외-상세)
- [신규 단위 테스트 수 기록](#신규-단위-테스트-수-기록)

---

## 미커버 항목 목록

> spec.md SC 중 SC-001·002 는 단위 테스트(갱신된 단언)로 직접 커버(PASS), SC-003·004 는 정적 코드/
> 스키마 검증으로 확인(VERIFIED). 아래는 직접 자동 단언이 없거나 그린필드 한계로 검증 대상이 없는 항목이다.

| 항목 | 미커버 시나리오 | 카테고리 | 검증 방법 | 담당 | 비고 |
|---|---|---|---|---|---|
| 정산 집계 필터 전환 직접 테스트 | `findCompletedItemsBySellerInPeriod` 가 completedAt 기준으로 기간 선별하는지 직접 단언 | (2) 설계(통합 한계) | 실 PostgreSQL 정산 집계 통합 테스트(completedAt 범위 선별) | 후속 spec | settlement.service.spec 이 OrderService mock — 직접 단언 부재. order.service.spec 의 completedAt 기록 단언으로 간접 커버(gaps.md GAP-012-01) |
| 과거 completed 주문 completedAt=NULL 제외 | 012 이전 completed 주문이 정산 필터에서 제외됨 | (3) 기능 미구현(범위 외) | 운영 데이터 이행 시 백필 + 검증 | 후속 spec | 그린필드(실 데이터 없음)라 실질 영향 없음 |

---

## 정산 집계 필터 전환 직접 테스트 부재 (상세)

**현상**: 정산 집계 `findCompletedItemsBySellerInPeriod` 의 기간 필터가 `createdAt → completedAt` 으로
전환되었으나(FR-004, SC-003), 이 필터가 `completedAt` 기준으로 올바르게 기간 내 항목을 선별하는지 직접
단언하는 자동 테스트가 없다.

**근본 원인 (테스트 토폴로지)**:
- 정산 흐름의 단위 테스트인 `settlement.service.spec` 은 `OrderService.getCompletedItemsForSettlement`
  를 **mock** 하여 정산 계산·멱등(008)을 검증한다. 따라서 그 하위 `OrderRepository.
  findCompletedItemsBySellerInPeriod` 의 where 필터(기준 컬럼)는 mock 경계 아래에 있어 단위 테스트로
  도달하지 않는다.
- `order.service.spec` 은 completed 전이 시 `completedAt` 이 기록되는지(SC-001·002)를 직접 단언하나,
  정산 집계가 그 `completedAt` 으로 필터링하는지는 단언하지 않는다(repository 직접 테스트 부재).

**위험도**: 낮음. 필터 전환은 단일 where 조건의 기준 컬럼 변경(`createdAt` → `completedAt`)이며 정적
코드 리뷰로 확인된다(SC-003). 전이 시각 기록은 단위 테스트로 직접 보장된다(SC-001·002).

**권장 수정 방향**: 실 PostgreSQL 로 (1) completedAt 이 기간 내인 completed 주문항목은 포함, (2) 기간
밖이거나 completedAt=NULL 인 주문은 제외됨을 검증하는 정산 집계 통합 테스트 추가(gaps.md GAP-012-01).

---

## 과거 completed 주문 completedAt=NULL 제외 (상세)

**현상**: 012 이전에 completed 로 전이된 주문은 `completedAt=NULL`(비파괴 추가, 백필 없음)이므로
`completedAt:{ gte, lte }` 필터에서 제외되어 정산 집계에 포함되지 않는다.

**근본 원인 (설계 결정·그린필드)**:
- nullable 컬럼을 백필 없이 추가했다(NFR-002 비파괴). 본 프로젝트는 실 운영 데이터가 없는 그린필드라
  012 적용 시점에 잔존 completed 주문이 없거나 무시 가능하다.

**위험도**: 낮음(그린필드). 운영 데이터 이행 시 상승 가능 — 백필 필요.

**권장 수정 방향**: 운영 데이터 이행 시 과거 completed 주문의 `completedAt` 을 마지막 completed 전이
이벤트 시각(`order_events` 의 toStatus=completed 행의 `createdAt`)으로 백필(범위 외, GAP-012-01).

---

## 신규 단위 테스트 수 기록

012 신규 단위 테스트는 **0건**이며, 실제 spec 파일 diff 를 직접 확인하여 확정했다(자가 보고 신뢰하지 않음):

| 파일 | 012 변경 | 신규 it() |
|---|---|---|
| `order.service.spec.ts` | 기존 `complete` 단언 갱신(+`{ completedAt: expect.any(Date) }`) + `autoConfirmDelivered` 단언 추가(`{ completedAt: now }`) | **0** |
| **합계** | 단언만 갱신(+12 -1) | **0** (011 baseline 253 = 012 253, 정합) |

> `order.service.spec.ts` 는 012 에서 새 `describe`/`it` 블록을 추가하지 않고 기존 테스트의 `updateStatus`
> 단언을 completedAt 포함하도록 갱신했다(TDD 관점 — 갱신 전 단언은 completedAt 미포함이라 012 production
> 변경 후에도 PASS 했을 것이나, 단언 강화로 completedAt 기록을 명시적으로 회귀 보호한다). 신규 suite·
> 테스트 0건이며 unit 합계(253)·e2e+static(16/84)에 변화가 없다. 본 카운트는 추적 정확성 목적이다.
