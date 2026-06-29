---
작성: Spec Agent
버전: v1.0
최종 수정: 2026-06-29 19:01
상태: 확정 (retroactive)
---

# Spec Input: 008-settlement-idempotency

> 수집 일시: 2026-06-29 | 맥락: 005 보안 발견(SEC-FIND-005-01) 후속 보강 → 정식 SDD 문서화

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

사용자 지시: **005 보안 발견 후속 보강** — 005-shipping-settlement 의 SEC-FIND-005-01(정산 멱등성
미보장, Medium)을 해소하는 패치. 정산 후보에서 기집계 항목을 제외하고 `SettlementItem.orderItemId`
에 `@unique` 를 부여하여 중복 지급액 산정을 차단했다. 본 문서는 그 패치를 정식 SDD 포맷으로 보강하기
위한 입력 재구성이다.

## 질문 분석 근거 (Question Analysis Basis)

| 질문 ID | 요지 | 옵션·근거 | 채택 결과 |
|---|---|---|---|
| Q-A | 멱등 판정 위치 | A:order 후보 쿼리에서 제외 / B:settlement 모듈이 자기 테이블 조회 후 제외 | **B 채택**(P-001 경계 — `findSettledOrderItemIds`, order 메서드 불변) |
| Q-B | DB 제약 부여 | `SettlementItem.orderItemId @unique` 도입 여부 | **채택**(DB 수준 중복 차단, FR-002) |
| Q-C | 기집계 전체 시 동작 | A:정산 생성 거부(409) / B:금액 0 정산 생성·createItems 미호출 | **B 채택**(0 정산 생성, createItems skip — SC-002) |
| Q-D | 금액 재계산 타입 | Prisma.Decimal | **채택**(P-005, 부동소수점 금지) |

## 카테고리별 수집 내용

### [카테고리 1] 배경 및 목적

Q1. 왜 만드는가?
- 005 정산 생성이 멱등성을 보장하지 않아 동일/겹치는 기간 재정산 시 동일 주문항목이 복수 정산에
  중복 집계되어 과다 지급액이 산정될 수 있음(SEC-FIND-005-01, Medium).

Q2. 현재 어떻게? (008 이전)
- `getCompletedItemsForSettlement` 가 기간 내 모든 completed 항목 반환(기집계 제외 없음).
  `SettlementItem.orderItemId` 에 UNIQUE 제약 없음.

Q3. 성공 판단 기준
- 일부 기집계 시 해당 항목만 제외하고 나머지만 집계. 전체 기집계 시 금액 0·항목 미생성.
  동일 orderItemId 가 DB 수준에서 중복 insert 차단.

### [카테고리 2] 사용자 & 이해관계자

Q4. 사용자 역할
- 플랫폼 운영자(관리자/배치): 정산 생성 트리거. 멱등 보강의 직접 수혜자(운영 실수 방지).
- 판매자: 과다 지급액 미발생의 이해당사자.

### [카테고리 3] 핵심 기능

**Must:**
- `findSettledOrderItemIds(orderItemIds)`: settlement_items 자기 테이블 조회(P-001).
- `createSettlement`: 후보 중 기집계 제외 후 Decimal 재계산. 남은 항목 0이면 createItems skip.
- `SettlementItem.orderItemId @unique` + 008 마이그레이션.

**제외(Out of Scope):**
- 정산 취소/정정 시 @unique 점유 해제, 실 이체 연동, 정산 기간 정확화(completedAt 컬럼).

### [카테고리 4] 데이터 & 입출력

- `findSettledOrderItemIds(orderItemIds: string[]): Promise<string[]>` — `settlement_items` 에서
  `orderItemId IN (...)` 조회 후 매칭된 id 반환. 빈 입력은 즉시 `[]`.
- `createSettlement` 출력은 005 와 동일(`SettlementWithItems`). 멱등 제외로 items·금액이 달라질 수 있음.

### [카테고리 5] 제약조건

Q5. 기술 스택 제약
- P-001: 기집계 판정은 settlement 자기 테이블만. order 후보는 DI read-only.
- P-005: 금액 재계산 Prisma.Decimal(부동소수점 금지).
- 호환성: order/settlement 시그니처 불변(additive). 005 회귀 0.

### [카테고리 6] 예외 & 실패 시나리오

Q6. 엣지 케이스
- 후보 일부 기집계 → 나머지만 집계(SC-001). 후보 전체 기집계 → 금액 0·createItems skip(SC-002).
- 빈 후보 → `findSettledOrderItemIds([])` 즉시 `[]`, 금액 0.
- 동시 재정산 시 동일 orderItemId 중복 insert → DB `@unique` P2002(방어 심층화 — 자동 단언 테스트는
  없음, coverage-gap 기록).
