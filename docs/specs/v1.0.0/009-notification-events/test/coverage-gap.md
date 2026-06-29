---
작성: Test Agent (EXECUTION)
버전: v1.0
최종 수정: 2026-06-29 19:01
상태: 확정 (retroactive)
---

# Coverage Gap: 009-notification-events

## 목차

- [미커버 항목 목록](#미커버-항목-목록)
- [이벤트→알림 생성→조회 e2e 부재 (상세)](#이벤트알림-생성조회-e2e-부재-상세)
- [신규 단위 테스트 수 기록](#신규-단위-테스트-수-기록)

---

## 미커버 항목 목록

> 모든 spec.md SC(SC-001~006)는 커버(SC-001~005 직접, SC-006 간접). 아래는 SC 로 정의되지 않았거나
> 기존 묶음으로 간접 커버되어 009 전용 신규 테스트가 없는 항목이다.

| 항목 | 미커버 시나리오 | 카테고리 | 검증 방법 | 담당 | 비고 |
|---|---|---|---|---|---|
| 이벤트→DB 알림 생성→조회 e2e | 실 EventEmitter2 디스패치 + DB insert + `GET /notifications` 조회 통합 | (2) 통합 시나리오 | order/settlement 실 emit → 알림 생성 → 조회 e2e(실 PostgreSQL) | 후속 보강 | 핸들러 단위 테스트로 분기 직접 커버 |
| SC-006 AppModule 부팅 009 전용 e2e | NotificationModule 신규 import·provider 부팅 단독 검증 | (2) 통합(간접 커버) | 기존 AppModule 부팅 e2e 묶음이 DI 그래프 해석 성공으로 간접 확인 | 후속 보강(선택) | 009 전용 신규 e2e 미추가 |
| order.created·settlement.created 실 emit 호출 단언 | after-commit emit 인자(`{orderId,userId}`·`{settlementId,sellerId}`) 직접 검증 | (1) 단위테스트 가능 | order/settlement service.spec 에 emit 호출 단언 추가 | 개발 | 현재 service.spec 은 EventEmitter2 mock 으로 회귀만 보장 |
| `getUserIdBySellerId`·`getSellerIdByProductId` 직접 단위 테스트 | findById→null 방어·매핑 직접 검증 | (1) 단위테스트 가능 | seller/product service.spec 에 해석 메서드 직접 테스트 추가 | 개발 | 핸들러 spec mock 반환으로 간접 커버 |

> 카테고리 (1) 항목이 2건 — emit 호출 단언·해석 메서드 직접 테스트. 둘 다 핸들러 단위 테스트·회귀
> 보장으로 간접 확인되며 기능 결함 위험은 낮으나, 직접 단위 검증은 후속 보강 권장.

---

## 이벤트→알림 생성→조회 e2e 부재 (상세)

**현상**: 009 의 핸들러 단위 테스트는 이벤트별 수신자 해석·알림 생성·실패 격리를 mock 으로 직접
단언한다. 그러나 실제 `eventEmitter.emit` 디스패치 → `NotificationEventsHandler` 실행 → `users.notifications`
insert → `GET /notifications` 조회로 이어지는 **end-to-end 통합 시나리오 테스트는 없다**.

**근본 원인 (코드 근거)**:
- 핸들러 단위 테스트(`notification.events.spec.ts`)는 `NotificationEventsHandler` 의 메서드를 직접
  호출하고 mock Service 반환을 단언한다(EventEmitter2 디스패치·DB insert 미경유).
- 009 는 SC-006(부팅)을 기존 AppModule 부팅 e2e 묶음으로 간접 확인하며, 009 전용 신규 e2e 를 추가하지
  않았다.

**위험도**: Low. 핸들러의 4종 분기·수신자 해석·null 생략·예외 격리가 단위 테스트로 직접 커버되어 핵심
로직 결함 위험은 낮다. 부팅·DI 순환 부재는 기존 부팅 묶음으로 확인된다.

**권장 수정 방향 (후속 보강)**: order/settlement 실 emit → 알림 생성 → `GET /notifications` 조회의
통합 시나리오 테스트(실 PostgreSQL + AppModule)를 추가하여 end-to-end 경로를 검증.

---

## 신규 단위 테스트 수 기록

009 신규 단위 테스트는 **8건**이며, 실제 spec 파일의 `it()` 를 직접 카운트하여 확정했다(자가 보고
신뢰하지 않음):

| 파일 | 케이스 수 | 구성 |
|---|---|---|
| `notification.events.spec.ts` | 8 | onOrderCreated 1 + onShipmentShipped 2 + onSettlementCreated 2 + onReviewCreated 2 + 격리 1 |
| **합계** | **8** | 008 baseline 231 + 8 = 239 unit (정합) |

> `order.service.spec.ts`·`settlement.service.spec.ts` 의 009 변경은 `EventEmitter2`(settlement 은
> `onAfterCommit` 도) mock provider 추가일 뿐 신규 `it()` 케이스가 아니다(회귀 0 보장). e2e+static(16/84)
> 에는 변화가 없다. 본 카운트는 추적 정확성 목적이다.
