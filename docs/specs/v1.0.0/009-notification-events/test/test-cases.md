---
작성: Test Agent (AUTHORING)
버전: v1.0
최종 수정: 2026-06-29 19:01
상태: 확정 (retroactive)
---

# Test Cases: 009-notification-events

## 목차

- [SC × 시나리오 매트릭스](#sc--시나리오-매트릭스)
- [외부 의존성 명시](#외부-의존성-명시)
- [미커버 항목 (사전 분류)](#미커버-항목-사전-분류)

---

## SC × 시나리오 매트릭스

> 테스트 함수명은 실제 spec 파일의 `it('...')` 식별자 기준.
> 신규 단위 테스트: notification.events.spec **8** 케이스(SC-001~005). SC-006 은 기존 AppModule 부팅 e2e 묶음으로 확인(신규 e2e 미추가).

| SC-ID | 수용 기준 | Happy Path | Edge/Error Case | 테스트 파일·함수 | env 태그 |
|---|---|---|---|---|---|
| SC-001 | order.created → 구매자 ORDER_PLACED | `when_order_created_then_notify_buyer_ORDER_PLACED` | — | notification.events.spec.ts::onOrderCreated | [env:unit] |
| SC-002 | shipping.shipped → ORDER_SHIPPED / 해석 throw 격리 | `when_shipped_then_resolve_buyer_and_notify_ORDER_SHIPPED` | `when_ownership_resolution_throws_then_no_create_and_no_throw` | notification.events.spec.ts::onShipmentShipped | [env:unit] |
| SC-003 | settlement.created → SETTLEMENT_CREATED / null skip | `when_settlement_created_then_resolve_seller_user_and_notify` | `when_seller_userId_unresolved_then_no_create` | notification.events.spec.ts::onSettlementCreated | [env:unit] |
| SC-004 | review.created → REVIEW_RECEIVED / no seller skip | `when_review_created_then_resolve_seller_via_product_and_notify` | `when_product_has_no_seller_then_no_create` | notification.events.spec.ts::onReviewCreated | [env:unit] |
| SC-005 | create 실패 격리 | — | `create 실패가 핸들러 밖으로 전파되지 않는다 (격리)` | notification.events.spec.ts | [env:unit] |
| SC-006 | AppModule 부팅·순환 의존 없음 | NotificationModule imports Order/Seller/Product, EventsHandler provider → DI 해석 성공 | — | (기존 AppModule 부팅 e2e 묶음) | [env:integration] |

---

## 외부 의존성 명시

### fixture / mock

- `mockNotificationService`: `{ create }` jest.fn().
- `mockOrderService`: `{ getOrderOwnership }` jest.fn().
- `mockSellerService`: `{ getUserIdBySellerId }` jest.fn().
- `mockProductService`: `{ getSellerIdByProductId }` jest.fn().
- 페이로드: `OrderCreatedPayload{orderId, userId}`, `{orderId, sellerId}`(shipping), `SettlementCreatedPayload{settlementId, sellerId}`, `ReviewCreatedPayload{productId, rating, ...}`.

### 환경 변수

- 단위 테스트: 별도 환경 변수 불필요(전부 mock, DB·EventEmitter 연결 없음 — 핸들러 메서드 직접 호출).

### 외부 서비스

- 단위: DB·네트워크·EventEmitter2 연결 없음. 핸들러 메서드를 직접 호출하고 mock Service 반환을 단언.

---

## 미커버 항목 (사전 분류)

| 항목 | 미커버 사유 | 카테고리 | 권장 검증 방법 |
|---|---|---|---|
| 이벤트 발행 → DB 알림 생성 → 조회 end-to-end | 핸들러 단위 테스트(mock)로 수신자 해석·생성·격리를 직접 단언. 실제 EventEmitter2 디스패치 + DB insert + `GET /notifications` 조회의 통합 시나리오는 미작성 | (2) 통합 시나리오 | order/settlement 실 emit → 알림 생성 → 조회 e2e(실 PostgreSQL) 후속 보강 |
| order.created·settlement.created 실 emit 호출 | order.service.spec·settlement.service.spec 가 EventEmitter2 mock 으로 회귀만 보장. after-commit emit 호출 자체(인자 검증)는 핸들러 단위 테스트 범위 밖 | (1) 단위테스트 가능 | order/settlement service.spec 에 `emit(ORDER_EVENTS.CREATED, {...})` 호출 단언 추가 권장 |
| `getUserIdBySellerId`·`getSellerIdByProductId` 직접 단위 테스트 | 핸들러 spec 가 mock 반환으로 분기를 단언하나 해석 메서드의 findById→null 방어 자체는 직접 테스트 없음 | (1) 단위테스트 가능 | seller/product service.spec 에 해석 메서드 직접 테스트 추가 권장 |
