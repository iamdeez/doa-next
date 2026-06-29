---
작성: Spec Agent
버전: v1.0
최종 수정: 2026-06-29 21:01
상태: 확정 (retroactive)
---

# Spec Input: 012-settlement-completed-at

> 수집 일시: 2026-06-29 | 맥락: 005 설계 공백(GAP-005-02 — 정산 기간 기준 시각) 후속 보강 → 정식 SDD
> 문서화

## 목차

- [수집 진행 상태](#수집-진행-상태)
- [원 요청 맥락](#원-요청-맥락)
- [질문 분석 근거](#질문-분석-근거-question-analysis-basis)
- [카테고리별 수집 내용](#카테고리별-수집-내용)

## 수집 진행 상태

| 카테고리 | 상태 | 답변 완료 항목 |
|---|---|---|
| 1. 배경 및 목적 | 완료 | [Q1, Q2, Q3] |
| 2. 사용자 & 이해관계자 | 완료 | [Q4] |
| 3. 핵심 기능 | 완료 | [Q-A~C] |
| 4. 데이터 & 입출력 | 완료 | [Q-D] |
| 5. 제약조건 | 완료 | [Q5] |
| 6. 예외 & 실패 시나리오 | 완료 | [Q6] |

## 원 요청 맥락

사용자 지시: **005 정산 기간 기준 시각 보강** — 005-shipping-settlement 의 GAP-005-02(정산 집계 기간
필터가 주문 `createdAt` 기준이라 주문 생성·완료 시점이 다를 때 정산 주기 부정확)를 해소하는 패치.
주문에 `completedAt` 컬럼을 추가하고(`Order.completedAt DateTime?`), 구매 확정(completed) 전이 두 경로
(구매자 직접 확정 `complete`, 시스템 자동 확정 `autoConfirmDelivered`) 모두에서 `completedAt` 을 기록하며,
정산 집계 필터(`findCompletedItemsBySellerInPeriod`)를 `createdAt` → `completedAt` 기준으로 전환했다.
본 문서는 그 패치를 정식 SDD 포맷으로 보강하기 위한 입력 재구성이다.

## 질문 분석 근거 (Question Analysis Basis)

| 질문 ID | 요지 | 옵션·근거 | 채택 결과 |
|---|---|---|---|
| Q-A | 정산 기준 시각 컬럼 | A:기존 `createdAt` 유지 / B:신규 `completedAt` 추가 | **B 채택**(주문 생성 시각 ≠ 구매 확정 시각 — 정산 대상은 구매 확정 시점. 전용 컬럼으로 정밀화) |
| Q-B | completedAt 기록 경로 | A:구매자 직접 확정만 / B:자동 확정 포함 양 경로 | **B 채택**(completed 전이는 `complete`·`autoConfirmDelivered` 2경로 — 누락 없이 양쪽 기록해야 필터 정합) |
| Q-C | 자동 확정 시 시각 | A:`new Date()` 개별 / B:주입된 `now` | **B 채택**(autoConfirmDelivered 는 `now` 인자를 받아 cutoff 계산에 사용 — 동일 배치의 모든 주문에 일관된 `now` 기록) |
| Q-D | completedAt 컬럼 nullable | A:NOT NULL + 백필 / B:nullable `DateTime?` | **B 채택**(`deliveredAt` 와 동형 nullable — 비파괴 `ADD COLUMN`, 그린필드 백필 불필요) |

## 카테고리별 수집 내용

### [카테고리 1] 배경 및 목적

Q1. 왜 만드는가?
- 005 의 정산 설계 공백 해소(GAP-005-02): 정산 집계 기간 필터가 주문 `createdAt` 기준이라, 주문 생성
  시점과 구매 확정(정산 대상) 시점이 다를 경우 정산 주기 귀속이 부정확.

Q2. 현재 어떻게? (012 이전)
- `Order` 에 `completedAt` 컬럼 없음. `complete`/`autoConfirmDelivered` 가 status 만 completed 로 전이
  (시각 미기록). `findCompletedItemsBySellerInPeriod` 가 `where:{ createdAt:{ gte, lte } }` 로 주문
  생성일 기준 기간 필터.

Q3. 성공 판단 기준
- `Order.completedAt` 컬럼 존재. `complete` → `completedAt=new Date()`, `autoConfirmDelivered` →
  `completedAt=now` 기록. 정산 필터가 `completedAt:{ gte, lte }` 기준.

### [카테고리 2] 사용자 & 이해관계자

Q4. 사용자 역할
- 판매자: 정산 집계의 직접 대상. 정산 주기 정확도의 수혜자.
- 플랫폼 운영자: completed 전이 양 경로의 시각 기록 일관성 이해당사자.
- 시스템(pg-boss AutoConfirmJob): `autoConfirmDelivered(now)` 호출자 — 자동 확정 경로의 시각 주입.

### [카테고리 3] 핵심 기능

**Must:**
- `Order.completedAt DateTime?` 컬럼 추가(nullable, `deliveredAt` 와 동형).
- `OrderRepository.updateStatus(orderId, status, extra?)` 의 `extra` 타입에 `completedAt?: Date` 추가.
- `complete(userId, orderId)`: `updateStatus(orderId, completed, { completedAt: new Date() })`.
- `autoConfirmDelivered(now)`: 각 주문 `updateStatus(order.id, completed, { completedAt: now })`.
- `findCompletedItemsBySellerInPeriod`: 기간 필터 `createdAt` → `completedAt` 전환.

**제외(Out of Scope):**
- 본 변경 이전 completed 주문의 completedAt 백필, 정산 필터 전환 실 DB 통합 테스트, completedAt 인덱스 추가.

### [카테고리 4] 데이터 & 입출력

- `Order.completedAt`: nullable `DateTime?`(Prisma) / `TIMESTAMP(3)` NULL(PostgreSQL).
- `updateStatus(orderId, status, extra?: { deliveredAt?: Date; completedAt?: Date }): Promise<Order>` —
  `data: { status, ...extra }`.
- `findCompletedItemsBySellerInPeriod(sellerId, periodStart, periodEnd)` — `where:{ status: completed,
  completedAt:{ gte: periodStart, lte: periodEnd }, items:{ some:{ sellerId } } }`.

### [카테고리 5] 제약조건

Q5. 기술 스택 제약
- P-005: 정산 정합성 — 금액 계산(`unitPrice × quantity`, Decimal) 불변, 기준 시각만 정밀화.
- 호환성: `completedAt` nullable 추가(비파괴 `ADD COLUMN`), `updateStatus` extra 선택 인자 추가
  (기존 호출 측 불변).
- 신규 의존성 0. 환경변수 0.

### [카테고리 6] 예외 & 실패 시나리오

Q6. 엣지 케이스
- 본 변경 이전 completed 주문 → `completedAt=NULL` → 정산 집계 제외(그린필드라 영향 없음 — 범위 외).
- 정산 필터 전환의 직접 단언 부재(settlement.service.spec 이 OrderService mock) → order.service.spec 의
  completedAt 기록 단언으로 간접 커버, 실 DB 통합 테스트 후속 권고(GAP-012-01).
