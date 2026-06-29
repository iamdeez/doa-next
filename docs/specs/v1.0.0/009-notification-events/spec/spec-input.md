---
작성: Spec Agent
버전: v1.0
최종 수정: 2026-06-29 19:01
상태: 확정 (retroactive)
---

# Spec Input: 009-notification-events

> 수집 일시: 2026-06-29 | 맥락: 006 기능 공백(GAP-006-01) 후속 연동 → 정식 SDD 문서화

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
| 3. 핵심 기능 | 완료 | [Q-A~E] |
| 4. 데이터 & 입출력 | 완료 | [Q-F] |
| 5. 제약조건 | 완료 | [Q5] |
| 6. 예외 & 실패 시나리오 | 완료 | [Q6] |

## 원 요청 맥락

사용자 지시: **006 기능 공백 후속 연동** — 006-search-notification-file 의 GAP-006-01(알림 도메인
이벤트 미연동)을 해소하는 패치. 도메인 이벤트(주문·배송·정산·리뷰)를 구독하는 핸들러를 추가하여
`NotificationType` 4종의 실제 생성 경로를 확보했다. 본 문서는 그 패치를 정식 SDD 포맷으로 보강하기
위한 입력 재구성이다.

## 질문 분석 근거 (Question Analysis Basis)

| 질문 ID | 요지 | 옵션·근거 | 채택 결과 |
|---|---|---|---|
| Q-A | 알림 생성 호출 위치 | A:publisher 에 직접 삽입 / B:구독자(@OnEvent) 핸들러 | **B 채택**(구독자 패턴 — 결합도·회귀 최소화) |
| Q-B | 수신자 해석 방식 | A:핸들러가 타 도메인 테이블 직접 쿼리 / B:read-only Service DI | **B 채택**(P-001, getOrderOwnership·getUserIdBySellerId·getSellerIdByProductId) |
| Q-C | 알림 실패 처리 | A:예외 전파 / B:격리(try/catch+Logger) | **B 채택**(safeNotify — 원 흐름 무영향) |
| Q-D | 수신자 미해석(null) 시 | A:기본 수신자 / B:알림 생략 | **B 채택**(생략 — 잘못된 수신자 회피) |
| Q-E | emit 시점 | A:트랜잭션 내 / B:커밋 후(onAfterCommit) | **B 채택**(order.created·settlement.created after-commit) |
| Q-F | 스키마 변경 | 신규 테이블·컬럼 필요 여부 | **불필요**(006 Notification 테이블·enum 재사용, 마이그레이션 0) |

## 카테고리별 수집 내용

### [카테고리 1] 배경 및 목적

Q1. 왜 만드는가?
- 006 에서 `NotificationService.create()`·`NotificationType` 4종이 정의됐으나 도메인 이벤트 연동이
  미구현이라 알림이 실제로 생성되는 경로가 없었음(GAP-006-01).

Q2. 현재 어떻게? (009 이전)
- `NotificationType` enum 4종 열거됨. 그러나 order/shipping/settlement/review 어디서도
  `create()` 를 호출하지 않음(호출 측 0).

Q3. 성공 판단 기준
- 4종 이벤트(order.created·shipping.shipped·settlement.created·review.created)가 각각 올바른 수신자
  (구매자/판매자)에게 알림을 생성. 알림 실패가 원 흐름에 전파되지 않음.

### [카테고리 2] 사용자 & 이해관계자

Q4. 사용자 역할
- 구매자: ORDER_PLACED·ORDER_SHIPPED 수신자.
- 판매자: SETTLEMENT_CREATED·REVIEW_RECEIVED 수신자.
- 운영자: 알림 실패가 핵심 흐름을 깨지 않기를 원하는 이해당사자.

### [카테고리 3] 핵심 기능

**Must:**
- `NotificationEventsHandler`(@Injectable, @OnEvent 4종) — order.created·shipping.shipped·
  settlement.created·review.created 구독.
- 수신자 해석: getOrderOwnership(005)·getUserIdBySellerId(009 신규)·getSellerIdByProductId(009 신규).
- order.created·settlement.created emit(after-commit, additive).
- safeNotify 격리(try/catch + Logger).

**제외(Out of Scope):**
- push/email/SMS 채널, e2e 통합 시나리오 테스트, 재시도·전달 보장, 수신자 해석 캐싱.

### [카테고리 4] 데이터 & 입출력

- 페이로드 타입: `OrderCreatedPayload{orderId, userId}`, `SettlementCreatedPayload{settlementId, sellerId}`.
  `shipping.shipped{orderId, sellerId}`(005), `ReviewCreatedPayload{productId, ...}`(004).
- read-only 해석: `getUserIdBySellerId(sellerId): string|null`, `getSellerIdByProductId(productId): string|null`.
- 스키마 변경 없음 — 006 `users.notifications` 테이블·`NotificationType` enum 재사용. 마이그레이션 0.

### [카테고리 5] 제약조건

Q5. 기술 스택 제약
- P-001: 수신자 해석은 read-only Service DI 만. 핸들러가 타 도메인 테이블 직접 쿼리 금지.
- 구독자 패턴: NotificationModule 이 Order/Seller/Product import. 역방향 import 0(순환 의존 없음).
- 호환성: order/settlement emit additive, 해석 메서드 신규. 005~008 회귀 0.

### [카테고리 6] 예외 & 실패 시나리오

Q6. 엣지 케이스
- 소유권 해석 예외(ORDER_SHIPPED) → 알림 생략·전파 없음(SC-002).
- 판매자 userId 미해석(SETTLEMENT_CREATED) → 알림 생략(SC-003).
- 상품에 판매자 없음(REVIEW_RECEIVED) → 알림 생략(SC-004).
- create() 예외 → safeNotify 격리(SC-005).
