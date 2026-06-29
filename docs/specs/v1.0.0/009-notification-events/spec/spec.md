---
작성: Spec Agent
버전: v1.0
최종 수정: 2026-06-29 19:01
상태: 확정 (구현 완료 — retroactive 문서화)
---

# Spec: 009-notification-events

> Branch: 009-notification-events | Date: 2026-06-29 | Version: v1.0.0
>
> 본 문서는 이미 구현·검증이 완료된 코드(커밋 `b3793fa`, base `e97a142`)를 근거로 정식 SDD
> 포맷으로 retroactive 작성되었다. 모든 요구사항·수용 기준은 실제 구현된 `NotificationEventsHandler`
> (`@OnEvent` 4종)·도메인 이벤트 발행(order.created·settlement.created)·수신자 해석 read-only
> 메서드(`getUserIdBySellerId`·`getSellerIdByProductId`)에서 확인한 사실을 기준으로 한다.

## 목차

- [배경 및 목적](#배경-및-목적)
- [선행 spec 영향 추적](#선행-spec-영향-추적)
- [사용자 스토리](#사용자-스토리)
- [기능 요구사항](#기능-요구사항)
- [비기능 요구사항](#비기능-요구사항)
- [수용 기준](#수용-기준)
- [요구사항 구조화 매트릭스](#요구사항-구조화-매트릭스)
- [이벤트 → 수신자 매핑](#이벤트--수신자-매핑)
- [해결된 선행 공백](#해결된-선행-공백)
- [범위 외](#범위-외)
- [미결 사항](#미결-사항)

---

## 배경 및 목적

006-search-notification-file 에서 `NotificationService.create()` 공개 진입점과 `NotificationType` enum
4종(`ORDER_PLACED`·`ORDER_SHIPPED`·`SETTLEMENT_CREATED`·`REVIEW_RECEIVED`)이 정의되었으나, 주문·배송·
정산·리뷰 도메인 이벤트에서 이를 호출하는 **연동이 미구현**이었다(GAP-006-01, Low). 따라서 알림이
실제로 생성되는 경로가 없었다(공개 진입점만 제공).

009 는 이 공백을 **구독자 패턴**으로 해소한다. 알림 생성 로직을 publisher(order·shipping·settlement·
review)에 직접 끼워넣지 않고, 신규 `NotificationEventsHandler`(`@Injectable`, `@OnEvent` 4종)가
도메인 이벤트를 구독하여 알림을 생성한다. 이로써 결합도·회귀 위험을 최소화한다.

수신자(`users.users.id`) 해석은 타 도메인 Service 의 **read-only 공개 메서드 DI** 로만 수행한다(P-001):

- `order.created{orderId, userId}` → 구매자 `ORDER_PLACED`(userId 직접).
- `shipping.shipped{orderId, sellerId}` → `OrderService.getOrderOwnership(orderId).userId` → 구매자 `ORDER_SHIPPED`.
- `settlement.created{settlementId, sellerId}` → `SellerService.getUserIdBySellerId(sellerId)` → 판매자 `SETTLEMENT_CREATED`.
- `review.created{productId, ...}` → `ProductService.getSellerIdByProductId(productId)` → `SellerService.getUserIdBySellerId(sellerId)` → 판매자 `REVIEW_RECEIVED`.

알림은 부가 기능이므로 생성·해석 실패가 원 흐름(주문·배송·정산·리뷰)에 전파되지 않도록 `safeNotify`
(try/catch + Logger)로 격리하며, 수신자 해석 실패(null)는 알림을 생략한다.

---

## 선행 spec 영향 추적

| 선행 spec | 식별된 연동 항목 | 인지 시점 | 식별 경로 |
|---|---|---|---|
| v1.0.0/006-search-notification-file | `NotificationService.create()` export·`NotificationType` 4종이 정의됐으나 도메인 이벤트 연동 미구현(GAP-006-01). 009 가 `NotificationEventsHandler` 로 4종 이벤트를 구독하여 알림 생성 경로 확보. | 2026-06-29 | notification.service.ts·NotificationType enum |
| v1.0.0/003-commerce (order) | `ORDER_PLACED`·`ORDER_SHIPPED` 알림이 주문 소유자(구매자) 해석 필요. 009 가 order.created emit(after-commit, additive) 추가 + `OrderService.getOrderOwnership`(005 존재) DI 소비. | 2026-06-29 | order.service.ts·order.events.ts |
| v1.0.0/005-shipping-settlement | `shipping.shipped`(005 emit) 구독 → ORDER_SHIPPED. `settlement.created` emit(009 additive, after-commit) 추가 → SETTLEMENT_CREATED. | 2026-06-29 | shipping.events.ts·settlement.service.ts |
| v1.0.0/004-review-coupon | `review.created`(004 emit, 6필드) 구독 → REVIEW_RECEIVED. 009 는 review 모듈을 변경하지 않고 기존 이벤트만 소비. | 2026-06-29 | review.events.ts ReviewCreatedPayload |

---

## 사용자 스토리

- **US-001**: 구매자로서, 주문이 접수되면 `ORDER_PLACED` 알림을, 상품이 발송되면 `ORDER_SHIPPED`
  알림을 받고 싶다.
- **US-002**: 판매자로서, 정산이 생성되면 `SETTLEMENT_CREATED` 알림을, 내 상품에 리뷰가 등록되면
  `REVIEW_RECEIVED` 알림을 받고 싶다.
- **US-003**: 운영자로서, 알림 생성·수신자 해석이 실패하더라도 주문·배송·정산·리뷰의 핵심 흐름은
  정상 완료되기를 원한다(알림은 부가 기능).

---

## 기능 요구사항

- **FR-001** (ORDER_PLACED): `OrderService.createOrder` 가 주문 생성 트랜잭션 **커밋 후**
  (`onAfterCommit`) `order.created{orderId, userId}`(additive emit)를 발행한다.
  `NotificationEventsHandler.onOrderCreated` 가 이를 구독하여 구매자(`payload.userId`)에게
  `ORDER_PLACED` 알림을 생성한다.

- **FR-002** (ORDER_SHIPPED): `NotificationEventsHandler.onShipmentShipped` 가 `shipping.shipped{orderId,
  sellerId}`(005 emit)를 구독하여 `OrderService.getOrderOwnership(orderId).userId` 로 구매자를 해석한
  뒤 `ORDER_SHIPPED` 알림을 생성한다.

- **FR-003** (SETTLEMENT_CREATED): `SettlementService.createSettlement` 가 정산 생성 트랜잭션 **커밋
  후**(`onAfterCommit`) `settlement.created{settlementId, sellerId}`(additive emit)를 발행한다.
  `NotificationEventsHandler.onSettlementCreated` 가 이를 구독하여 `SellerService.getUserIdBySellerId(sellerId)`
  로 판매자 userId 를 해석한 뒤 `SETTLEMENT_CREATED` 알림을 생성한다. 해석 결과가 `null` 이면 알림을
  생략한다.

- **FR-004** (REVIEW_RECEIVED): `NotificationEventsHandler.onReviewCreated` 가 `review.created{productId,
  ...}`(004 emit)를 구독하여 `ProductService.getSellerIdByProductId(productId)` → `SellerService.getUserIdBySellerId(sellerId)`
  로 판매자 userId 를 해석한 뒤 `REVIEW_RECEIVED` 알림을 생성한다. 중간 해석 결과(sellerId 또는
  userId)가 `null` 이면 알림을 생략한다.

- **FR-005** (실패 격리): 모든 핸들러는 `safeNotify(event, fn)`(try/catch + `Logger.error`)로 감싸여
  실행된다. 알림 생성·수신자 해석에서 예외가 발생해도 이벤트 발행 측(주문·배송·정산·리뷰)으로 전파되지
  않으며, 원 트랜잭션·흐름은 정상 완료된다.

- **FR-006** (수신자 해석 read-only 메서드): 수신자 해석을 위해 additive read-only 공개 메서드를
  추가한다 — `SellerService.getUserIdBySellerId(sellerId): Promise<string | null>`(sellerRepository.findById
  의 userId 반환), `ProductService.getSellerIdByProductId(productId): Promise<string | null>`
  (productRepository.findById 의 sellerId 반환).

---

## 비기능 요구사항

- **NFR-001** (P-001 모듈 경계): 수신자(`users.users.id`) 해석은 타 도메인 Service 의 read-only 공개
  메서드 DI 경유로만 수행한다(`OrderService.getOrderOwnership`·`SellerService.getUserIdBySellerId`·
  `ProductService.getSellerIdByProductId`). `NotificationEventsHandler` 는 타 도메인 테이블을 직접
  쿼리하지 않는다. cross-schema 참조(sellerId·productId·orderId)는 plain String.

- **NFR-002** (구독자 패턴 / 결합도·순환 의존): 알림 생성 호출을 publisher(order·shipping·settlement·
  review)에 직접 삽입하지 않는다 — `NotificationEventsHandler` 가 `@OnEvent` 으로 구독한다.
  `NotificationModule` 이 `OrderModule`·`SellerModule`·`ProductModule` 을 import 하며,
  order·seller·product 어느 것도 notification 을 import 하지 않아 **순환 의존이 없다**(AppModule 부팅으로
  DI 그래프 검증).

- **NFR-003** (호환성 / additive): order.created·settlement.created emit 은 after-commit additive 이며
  기존 주문·정산 흐름을 변경하지 않는다. `getUserIdBySellerId`·`getSellerIdByProductId` 는 신규 read-only
  공개 메서드(기존 시그니처 불변). 005~008 회귀 0. 스키마 변경 없음(마이그레이션 불필요).

---

## 수용 기준

> **환경 태그 규약**:
> | 태그 | 의미 |
> |---|---|
> | `[env:unit]` | 단위 테스트(mock)로 판정 가능 |
> | `[env:integration]` | AppModule 부팅(DI 그래프) 기반 통합 부팅 테스트로 판정 |

- **SC-001** (`FR-001` 관련): `onOrderCreated` 가 `order.created` 페이로드의 `userId`(구매자)에게
  `ORDER_PLACED` 알림을 생성한다(`notificationService.create` 호출). [env:unit]

- **SC-002** (`FR-002`·`FR-005` 관련): `onShipmentShipped` 가 `getOrderOwnership(orderId).userId` 로
  구매자를 해석하여 `ORDER_SHIPPED` 알림을 생성하고, 소유권 해석이 예외를 던지면 알림을 생성하지
  않으며 핸들러 밖으로 예외를 전파하지 않는다. [env:unit]

- **SC-003** (`FR-003` 관련): `onSettlementCreated` 가 `getUserIdBySellerId(sellerId)` 로 판매자 userId
  를 해석하여 `SETTLEMENT_CREATED` 알림을 생성하고, userId 가 `null`(미해석)이면 알림을 생성하지
  않는다. [env:unit]

- **SC-004** (`FR-004` 관련): `onReviewCreated` 가 `getSellerIdByProductId(productId)` →
  `getUserIdBySellerId(sellerId)` 로 판매자를 해석하여 `REVIEW_RECEIVED` 알림을 생성하고, 상품에
  판매자가 없으면(sellerId `null`) 알림을 생성하지 않는다. [env:unit]

- **SC-005** (`FR-005` 관련): `notificationService.create` 가 예외를 던져도 핸들러 밖으로 전파되지
  않는다(`safeNotify` 격리). [env:unit]

- **SC-006** (`NFR-002` 관련): `NotificationModule` 이 `OrderModule`·`SellerModule`·`ProductModule` 을
  import 하고 `NotificationEventsHandler` 를 provider 로 등록한 상태로 AppModule 이 정상 부팅한다(순환
  의존 없음 — DI 그래프 해석 성공). [env:integration]

---

## 요구사항 구조화 매트릭스

> 매핑 누락(SC 없는 FR/NFR, FR/NFR 없는 SC) 0건이 완료 조건.
> MoSCoW: Must / Should / Could / Won't

| US-ID | FR-ID | NFR-ID | SC-ID | [env:*] | MoSCoW |
|---|---|---|---|---|---|
| US-001 | FR-001 | NFR-001 | SC-001 | unit | Must |
| US-001 | FR-002 | NFR-001 | SC-002 | unit | Must |
| US-002 | FR-003 | NFR-001 | SC-003 | unit | Must |
| US-002 | FR-004 | NFR-001 | SC-004 | unit | Must |
| US-003 | FR-005 | — | SC-002, SC-005 | unit | Must |
| — | FR-006 | NFR-001 | SC-003, SC-004 | unit | Must |
| — | — | NFR-002 | SC-006 | integration | Must |

> NFR-003(additive 호환성·스키마 무변경)은 005~008 회귀 0(전체 PASS) + 마이그레이션 0 으로 충족하며
> 별도 신규 SC 없음(부재가 곧 상태). SC-006(AppModule 부팅·순환 의존 없음)은 기존 AppModule 부팅 e2e
> 묶음으로 확인되며 009 전용 신규 e2e 는 추가하지 않았다(coverage-gap.md 기록).

---

## 이벤트 → 수신자 매핑

| 도메인 이벤트 | 발행 시점 | NotificationType | 수신자 | 수신자 해석 경로 | 해석 실패 시 | FR/SC |
|---|---|---|---|---|---|---|
| `order.created{orderId, userId}` | createOrder 커밋 후(009 additive emit) | ORDER_PLACED | 구매자 | `payload.userId`(직접) | — | FR-001 / SC-001 |
| `shipping.shipped{orderId, sellerId}` | markShipped(005 emit) | ORDER_SHIPPED | 구매자 | `OrderService.getOrderOwnership(orderId).userId` | 예외 → 알림 생략(전파 없음) | FR-002·005 / SC-002 |
| `settlement.created{settlementId, sellerId}` | createSettlement 커밋 후(009 additive emit) | SETTLEMENT_CREATED | 판매자 | `SellerService.getUserIdBySellerId(sellerId)` | null → 알림 생략 | FR-003 / SC-003 |
| `review.created{productId, ...}` | createReview(004 emit) | REVIEW_RECEIVED | 판매자 | `ProductService.getSellerIdByProductId` → `SellerService.getUserIdBySellerId` | null → 알림 생략 | FR-004 / SC-004 |

> 알림 본문: 각 핸들러가 한국어 title·body 를 구성하여 `NotificationService.create(userId, type, title, body)`
> 호출. 본문에 orderId·settlementId·productId·rating 등 식별자를 포함한다.

---

## 해결된 선행 공백

| 식별자 | 선행 spec | 등급 | 009 해결 내용 | 상태 |
|---|---|---|---|---|
| GAP-006-01 | 006-search-notification-file | Low | `NotificationEventsHandler`(@OnEvent 4종)가 order.created·shipping.shipped·settlement.created·review.created 를 구독하여 알림 생성. `NotificationType` 4종 전부 실제 생성 경로 확보 | **RESOLVED (009, 커밋 b3793fa)** |

---

## 범위 외

- **알림 전달 채널(push/email/SMS)**: 009 는 `users.notifications` 레코드 생성(인-앱 알림)까지만 다룬다.
  외부 푸시·이메일·SMS 전달 채널 연동은 범위 외다.
- **이벤트→알림 생성→조회 통합(e2e) 테스트**: 핸들러 단위 테스트(mock)로 이벤트별 수신자 해석·생성·
  격리를 직접 단언한다. 실제 이벤트 발행 → DB 알림 생성 → `GET /notifications` 조회의 end-to-end
  통합 시나리오 테스트는 추가하지 않았다(coverage-gap.md — 후속 보강 권고).
- **알림 재시도·전달 보장**: `safeNotify` 는 실패를 격리(로깅)할 뿐 재시도하지 않는다. at-least-once
  전달 보장(outbox·재시도 큐)은 범위 외다.
- **수신자 해석 캐싱**: 매 이벤트마다 Service DI 조회를 수행하며 캐시를 두지 않는다(부재가 곧 상태).

---

## 미결 사항

없음 — 본 spec 은 구현 완료 코드를 기준으로 retroactive 작성되었으며, 모든 요구사항·수용 기준이 실제
구현과 대조 확인되었다. 009 는 신규 GAP 을 남기지 않는다(gaps.md: NONE). GAP-006-01 은 본 spec 에서
RESOLVED 처리된다.
