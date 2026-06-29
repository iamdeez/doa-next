---
작성: Spec Agent
버전: v1.0
최종 수정: 2026-06-29 17:30
상태: 확정 (retroactive)
---

# Spec Input: 005-shipping-settlement
> 수집 일시: 2026-06-29 | 맥락: 경량 모드 백엔드 진행 → 정식 SDD 문서화

## 수집 진행 상태

| 카테고리 | 상태 | 답변 완료 항목 |
|---|---|---|
| 1. 배경 및 목적 | 완료 | [Q1, Q2, Q3] |
| 2. 사용자 & 이해관계자 | 완료 | [Q4, Q5] |
| 3. 핵심 기능 | 완료 | [Q-A~E] |
| 4. 데이터 & 입출력 | 완료 | [Q-F, Q-G] |
| 5. 제약조건 | 완료 | [Q6, Q7] |
| 6. 예외 & 실패 시나리오 | 완료 | [Q8, Q9] |

## 원 요청 맥락

사용자 지시: **"경량 모드로 나머지 백엔드 진행"** — 003-commerce·004-review-coupon 완료 후, 남은
백엔드 도메인을 경량 모드(spec.md 1장으로 요구사항·수용 기준·구현 결과 통합)로 구현했다. 005는
배송(shipping)·정산(settlement) 도메인이다. 본 문서는 그 경량 산출물을 정식 SDD 포맷으로 보강하기
위한 입력 재구성이다.

## 질문 분석 근거 (Question Analysis Basis)

| 질문 ID | 요지 | 옵션·근거 | 채택 결과 |
|---|---|---|---|
| Q-A | 배송 송장 처리 범위 | A:번호 저장+수동 전이 / B:택배사 API 실시간 연동 | **A 채택**(택배사 연동 후속) |
| Q-B | 배송 상태머신 | shipping enum `preparing→shipped→in_transit→delivered` | **채택** |
| Q-C | 주문↔배송 전이 결합 | 송장 등록 시 주문 `preparing→shipped`, 배송완료 시 `shipped→delivered` | **채택**(OrderService DI 전이) |
| Q-D | 정산 집계 단위 | A:판매자×기간 completed 주문항목 / B:주문 단위 | **A 채택**(항목 단위 saleAmount) |
| Q-E | 정산 트리거 주체 | A:관리자 수동(AdminGuard) / B:배치 자동 | **A 채택**(관리자 수동, 배치 후속) |
| Q-F | 수수료율 | 플랫폼 수수료 10% 고정(`COMMISSION_RATE='0.1'`) | **채택** |
| Q-G | 정산 기간 기준 시각 | A:주문 `createdAt` / B:전용 `completedAt` | **A 채택**(completedAt 컬럼 부재로 단순화) |

## 카테고리별 수집 내용

### [카테고리 1] 배경 및 목적

Q1. 왜 만드는가?
- 003-commerce 주문 상태머신의 `preparing→shipped`·`shipped→delivered` 전이를 구동할 배송 도메인 부재.
- `completed` 주문항목 매출을 판매자에게 정산하는 흐름 부재.

Q2. 현재 어떻게?
- 미구현. shipping·settlement 모듈은 빈 스텁(골격만).

Q3. 성공 판단 기준
- APPROVED 판매자가 송장을 등록하면 주문이 `shipped`로 전이되고, 배송 완료 시 `delivered`로 전이된다.
- 구매자/판매자만 배송 추적을 조회한다(제3자 차단).
- 관리자가 판매자별 completed 매출을 집계하여 Decimal 정확도로 정산을 생성한다.

### [카테고리 2] 사용자 & 이해관계자

Q4. 사용자 역할
- APPROVED 판매자: 송장 등록·배송 상태 업데이트·본인 정산 조회.
- 인증된 고객(구매자): 배송 추적 조회.
- 관리자(AdminGuard): 정산 생성·전체 정산 조회.

Q5. 이해관계자
- 판매자: 매출 정산(수수료 차감 후 지급액)의 직접 당사자.
- settlement.events: 향후 정산 알림 이벤트 소비 대상(현재 스캐폴드만).

### [카테고리 3] 핵심 기능

**배송 Must:**
- 송장 등록(APPROVED 판매자, 주문 `preparing→shipped` 전이 + tracking append).
- 배송 상태 업데이트(`delivered` 시 주문 `shipped→delivered`).
- 배송 추적 조회(권한 3축: 구매자 본인 또는 판매자).

**정산 Must:**
- 관리자 정산 생성(판매자×기간 completed 주문항목 집계, Decimal 계산).
- 판매자 본인 정산 조회 / 관리자 전체 정산 조회.

**제외(Out of Scope):**
- 택배사 API 실시간 추적, 정산 지급 실행(이체), 정산 중복 집계 차단, 배송비·반품·교환.

### [카테고리 4] 데이터 & 입출력

**배송 데이터:**
- shipment: orderId(plain String), status(preparing|shipped|in_transit|delivered), carrier, trackingNumber, shippedAt?, deliveredAt?, createdAt.
- shipment_tracking(append-only): shipmentId(FK), status, description, occurredAt.

**정산 데이터:**
- settlement: sellerId(plain String), periodStart, periodEnd, totalSales/commission/payoutAmount(Decimal 12,2), status(pending|completed), createdAt.
- settlement_item: settlementId(FK), orderId/orderItemId(plain String), saleAmount/commissionAmount(Decimal 12,2).

**연동(P-001 DI 경계):**
- 주문 전이·소유권·집계: `OrderService.markShipped`·`markDelivered`·`getOrderOwnership`·`getCompletedItemsForSettlement`.
- 판매자 식별: `SellerService.getApprovedSeller`.

### [카테고리 5] 제약조건

Q6. 기술 스택 제약
- P-001: shipping/settlement Repository는 자기 소유 테이블만. 주문 데이터는 OrderService DI.
- P-005: 정산 금전 필드 Decimal, 부동소수점 금지. COMMISSION_RATE는 문자열 `'0.1'`.
- P-002/P-004: AWS 전용 SDK 신규 의존 0.

Q7. 성능: 특별한 P95 수치 제약 없음. 정산 집계는 관리자 수동 트리거(저빈도).

### [카테고리 6] 예외 & 실패 시나리오

Q8. 실패 시 동작
- 송장 등록 중 실패 → 트랜잭션 롤백 → 주문 전이·shipment·tracking 미반영.
- 정산 생성 중 실패 → 트랜잭션 롤백 → settlement·items 미반영.

Q9. 엣지 케이스
- 집계 항목 0건 → 금액 0 정산 생성(createItems 미호출).
- 정산 중복 집계: 멱등 미보장(GAP-005-01, admin-only 운영 위험으로 허용·기록).
- 미승인 판매자 송장/조회/정산조회 → 403.
