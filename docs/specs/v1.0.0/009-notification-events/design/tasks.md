---
작성: Design Agent
버전: v1.0
최종 수정: 2026-06-29 19:01
상태: 확정 (retroactive — 전 태스크 구현 완료)
---

# Tasks: 009-notification-events

> Branch: 009-notification-events | Date: 2026-06-29 | Plan: [../planning/plan.md](../planning/plan.md)

## 목차

- [전제 조건](#전제-조건)
- [태스크 목록](#태스크-목록)
- [Test Authoring Contract](#test-authoring-contract)
- [구현 완료 기준](#구현-완료-기준)

---

## 전제 조건

- [x] spec.md 의 모든 [NEEDS CLARIFICATION] 항목 해소(미결 사항: 없음)
- [x] plan.md Constitution Gates(P-001~P-007) 통과(예외 0건, P-005 해당 없음)
- [x] CHANGES.md 의 이전 작업(008-settlement-idempotency) "후속 작업 시 주의사항" 확인
- [x] Database Design Agent 비활성(스키마 변경 없음 — 006 Notification 테이블·enum 재사용, 마이그레이션 0)

> A·B·C 레이어 = **4단계 Development Agent**. D 레이어 = **5a Test Agent(AUTHORING)**.

---

## 태스크 목록

> 레이어: B 도메인(emit·해석 메서드) / C 인터페이스(핸들러·module wiring) / D 테스트(5a).

### Step 1. 수신자 해석 read-only 메서드 (B, additive)

- [x] **T001** `[P]` — seller.service.getUserIdBySellerId
  - 레이어: B
  - 구현 파일: `apps/backend/src/modules/seller/seller.service.ts`
  - 관련 요구사항: FR-003·004
  - 상세: `getUserIdBySellerId(sellerId): Promise<string|null>` — `sellerRepository.findById(sellerId)?.userId ?? null`.
  - 완료 기준: read-only. sellers 자기 스키마. 미존재 시 null.

- [x] **T002** `[P]` — product.service.getSellerIdByProductId
  - 레이어: B
  - 구현 파일: `apps/backend/src/modules/product/product.service.ts`
  - 관련 요구사항: FR-004
  - 상세: `getSellerIdByProductId(productId): Promise<string|null>` — `productRepository.findById(productId)?.sellerId ?? null`.
  - 완료 기준: read-only. products 자기 스키마. 미존재 시 null.

### Step 2. 도메인 이벤트 발행 (B, additive after-commit)

- [x] **T003** — order.created emit + OrderCreatedPayload
  - 레이어: B
  - 구현 파일: `apps/backend/src/modules/order/order.events.ts`, `order.service.ts`
  - 관련 요구사항: FR-001
  - 상세: `OrderCreatedPayload{orderId, userId}`. `createOrder` 의 트랜잭션 커밋 후 `onAfterCommit(() => emit(ORDER_EVENTS.CREATED, {orderId, userId}))`. `EventEmitter2` 생성자 주입.
  - 완료 기준: additive after-commit. 주문 흐름·반환값 불변(회귀 0).

- [x] **T004** — settlement.created emit + SettlementCreatedPayload
  - 레이어: B
  - 구현 파일: `apps/backend/src/modules/settlement/settlement.events.ts`, `settlement.service.ts`
  - 관련 요구사항: FR-003
  - 상세: `SETTLEMENT_EVENTS.CREATED='settlement.created'`, `SettlementCreatedPayload{settlementId, sellerId}`. `createSettlement` 의 정산 트랜잭션 커밋 후 `onAfterCommit(() => emit(SETTLEMENT_EVENTS.CREATED, {settlementId, sellerId}))`. `EventEmitter2` 주입. (008 멱등 필터와 동일 메서드에 누적)
  - 완료 기준: additive after-commit. 정산 흐름 불변. emit 은 식별자만(금액 미포함).

### Step 3. NotificationEventsHandler + module wiring (C)

- [x] **T005** — notification.events.ts 핸들러
  - 레이어: C
  - 구현 파일: `apps/backend/src/modules/notification/notification.events.ts`
  - 관련 요구사항: FR-001~005
  - 상세: `@Injectable() NotificationEventsHandler` — `@OnEvent(ORDER_EVENTS.CREATED)` onOrderCreated(payload.userId 직접 ORDER_PLACED), `@OnEvent(SHIPPING_EVENTS.SHIPPED)` onShipmentShipped(getOrderOwnership.userId ORDER_SHIPPED), `@OnEvent(SETTLEMENT_EVENTS.CREATED)` onSettlementCreated(getUserIdBySellerId ?? skip SETTLEMENT_CREATED), `@OnEvent('review.created')` onReviewCreated(getSellerIdByProductId → getUserIdBySellerId ?? skip REVIEW_RECEIVED). private `safeNotify(event, fn)` try/catch + Logger.error.
  - 완료 기준: 수신자 해석 read-only DI(P-001). null → 생략. 예외 격리.

- [x] **T006** — notification.module wiring
  - 레이어: C
  - 구현 파일: `apps/backend/src/modules/notification/notification.module.ts`
  - 관련 요구사항: FR-001~004, NFR-002
  - 상세: imports `[AuthSharedModule, OrderModule, SellerModule, ProductModule]`, providers 에 `NotificationEventsHandler` 추가, exports `[NotificationService]` 유지.
  - 완료 기준: 단방향 import(순환 없음). AppModule 부팅 정상(SC-006).

### Step 4. 테스트 (D 레이어 — 5a Test Agent AUTHORING)

- [x] **T007** — notification.events.spec.ts (8 케이스 — SC-001~005)
  - onOrderCreated 1(SC-001), onShipmentShipped 2(SC-002), onSettlementCreated 2(SC-003), onReviewCreated 2(SC-004), 격리 1(SC-005).
- [x] **T008** `[P]` — 기존 spec mock 보강
  - order.service.spec(EventEmitter2 mock), settlement.service.spec(EventEmitter2·onAfterCommit mock) — 회귀 0 보장.

---

## Test Authoring Contract

> **5a Test Agent(AUTHORING) 입력 contract**. production canonical 심볼 명시(추측 단언 금지).

### Production canonical 심볼

| 심볼 | canonical 형태 |
|---|---|
| `NotificationEventsHandler` | `onOrderCreated(p)`·`onShipmentShipped(p)`·`onSettlementCreated(p)`·`onReviewCreated(p)` |
| `NotificationService`(mock) | `create(userId, type, title, body)` |
| `OrderService`(mock) | `getOrderOwnership(orderId): {userId}` |
| `SellerService`(mock) | `getUserIdBySellerId(sellerId): string\|null` |
| `ProductService`(mock) | `getSellerIdByProductId(productId): string\|null` |
| enum 리터럴 | `NotificationType.ORDER_PLACED`·`ORDER_SHIPPED`·`SETTLEMENT_CREATED`·`REVIEW_RECEIVED` |
| 이벤트 상수 | `ORDER_EVENTS.CREATED`·`SHIPPING_EVENTS.SHIPPED`·`SETTLEMENT_EVENTS.CREATED`·`'review.created'` |

### mock 재현 규약

- **notification.events.spec**: `mockNotificationService`·`mockOrderService`·`mockSellerService`·`mockProductService`. onOrderCreated → `create(userId, ORDER_PLACED, ...)`. onShipmentShipped → `getOrderOwnership` 성공 시 `create(ownership.userId, ORDER_SHIPPED)`; throw 시 create 미호출·핸들러 throw 안 함. onSettlementCreated → `getUserIdBySellerId` 반환 시 `create(userId, SETTLEMENT_CREATED)`; null 시 create 미호출. onReviewCreated → `getSellerIdByProductId` → `getUserIdBySellerId` 반환 시 `create(userId, REVIEW_RECEIVED)`; sellerId null 시 create 미호출. 격리 → `create` reject 시 핸들러가 throw 안 함.

### SC → 테스트 매핑

| SC-ID | 수용 기준 | 테스트 파일·함수 | 비고 |
|---|---|---|---|
| SC-001 | order.created → 구매자 ORDER_PLACED | notification.events.spec.ts::onOrderCreated::when_order_created_then_notify_buyer_ORDER_PLACED | [env:unit] |
| SC-002 | shipping.shipped → ORDER_SHIPPED / 해석 throw 격리 | onShipmentShipped::when_shipped_then_resolve_buyer_and_notify_ORDER_SHIPPED, when_ownership_resolution_throws_then_no_create_and_no_throw | [env:unit] |
| SC-003 | settlement.created → SETTLEMENT_CREATED / null skip | onSettlementCreated::when_settlement_created_then_resolve_seller_user_and_notify, when_seller_userId_unresolved_then_no_create | [env:unit] |
| SC-004 | review.created → REVIEW_RECEIVED / no seller skip | onReviewCreated::when_review_created_then_resolve_seller_via_product_and_notify, when_product_has_no_seller_then_no_create | [env:unit] |
| SC-005 | create 실패 격리 | notification.events.spec.ts::create 실패가 핸들러 밖으로 전파되지 않는다 (격리) | [env:unit] |
| SC-006 | AppModule 부팅·순환 없음 | 기존 AppModule 부팅 e2e 묶음(신규 e2e 미추가) | [env:integration] |

---

## 구현 완료 기준

- [x] 모든 A·B·C 태스크 체크박스 완료(4단계), D 태스크 완료(5a)
- [x] `pnpm --filter backend test` 전체 PASSED — 003~008 회귀 0 + 009 신규 SC `[TypeScript/NestJS]`
- [x] `tsc --noEmit` 0 error — NestJS DI 순환(notification → 도메인 단방향) 미발생
- [x] AppModule 부팅 PASS — NotificationModule imports Order/Seller/Product, EventsHandler provider(SC-006)
- [x] `package.json` 신규 의존 0. `prisma/schema.prisma` 변경 0(마이그레이션 0)
- [x] git status 의도치 않은 파일 없음
