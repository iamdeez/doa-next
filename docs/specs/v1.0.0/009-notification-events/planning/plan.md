---
작성: Planning Agent
버전: v1.0
최종 수정: 2026-06-29 19:01
상태: 확정 (retroactive)
---

# Plan: 009-notification-events

> Branch: 009-notification-events | Date: 2026-06-29 | Spec: [../spec/spec.md](../spec/spec.md)

## 목차

- [사전 검증 (Constitution Gates)](#사전-검증-constitution-gates)
- [기술 컨텍스트](#기술-컨텍스트)
- [사전 영향도 분석 결과](#사전-영향도-분석-결과)
- [핵심 설계](#핵심-설계)
- [결정 기록 (ADRs)](#결정-기록-adrs)
- [인터페이스 계약](#인터페이스-계약)
- [데이터 모델](#데이터-모델)
- [테스트 전략](#테스트-전략)
- [기타 고려사항](#기타-고려사항)

---

## 사전 검증 (Constitution Gates)

> `constitution.md`(P-001~P-007) 존재 → 해당 조항을 Gates 로 사용한다(constitution 우선). spec.md NFR
> (NFR-001~003)은 P-001 등을 하위 구체화하며 충돌(완화) 없음.

- [x] **P-001 모듈 경계 원칙**: [Pass 기준: NotificationEventsHandler 가 타 도메인 테이블을 직접 쿼리하지 않음]
  → PASS. 수신자 해석은 `OrderService.getOrderOwnership`·`SellerService.getUserIdBySellerId`·`ProductService.getSellerIdByProductId` read-only 공개 메서드 DI 경유만. 각 해석 메서드는 자기 모듈 repository(자기 스키마)만 조회. cross-schema 참조(sellerId·productId·orderId)는 plain String.
- [x] **P-002 AWS 의존 금지 / 외부 의존 추상화 원칙**: [Pass 기준: `@aws-sdk/*` 및 신규 npm 의존 0건]
  → PASS. 신규 npm 의존 0건. `@nestjs/event-emitter`(인-프로세스, 기존)만 사용. 외부 메시지 브로커·푸시 SDK 0.
- [x] **P-003 단일 DB 원칙**: [Pass 기준: 단일 PostgreSQL 외 외부 저장소 0건]
  → PASS. 스키마 변경 0(006 `users.notifications`·`NotificationType` 재사용). 마이그레이션 0. 외부 저장소·큐 0.
- [x] **P-004 클라우드 중립 원칙**: [Pass 기준: 클라우드 전용 API 결합 0건]
  → PASS. 인-프로세스 EventEmitter2 + Prisma 만. 클라우드 전용 알림 SDK 미사용.
- [x] **P-005 결제·정산 정합성 원칙**: [Pass 기준: 금전 수치 Decimal — 해당 없음]
  → PASS (해당 없음). 009 는 금전 필드를 만들거나 변경하지 않는다. settlement.created emit 은 식별자(settlementId·sellerId)만 전달하며 금액은 포함하지 않는다.
- [x] **P-006 테스트 원칙**: [Pass 기준: SC-XXX 없는 FR-XXX 0건]
  → PASS. FR-001~006·NFR-001~003 전부 SC 매핑 존재. FR-001~005 단위(SC-001~005), FR-006 은 SC-003·004 로 간접 검증, NFR-002 는 SC-006(부팅).
- [x] **P-007 스펙 범위 원칙**: [Pass 기준: spec.md 범위 외 변경 파일 0건]
  → PASS. 변경 범위 = notification(events 핸들러·module·spec) + order(events·service·spec) + product/seller(해석 메서드) + settlement(events·service·spec). 전부 FR-001~006 추적 가능. 범위 외 리팩토링 0.

**스코프 추적 (P-007 — cross-cutting 변경의 FR 근거)**:

| 변경 대상 | 변경 성격 | 근거 FR | 비파괴성 |
|---|---|---|---|
| `order.service.ts`/`order.events.ts` | order.created after-commit emit + OrderCreatedPayload | FR-001 | additive — 주문 흐름 불변 |
| `settlement.service.ts`/`settlement.events.ts` | settlement.created after-commit emit + SettlementCreatedPayload | FR-003 | additive — 정산 흐름 불변 |
| `seller.service.ts` | getUserIdBySellerId(read-only) | FR-003·004 | additive — sellers 자기 스키마 |
| `product.service.ts` | getSellerIdByProductId(read-only) | FR-004 | additive — products 자기 스키마 |
| `notification.module.ts` | imports(Order·Seller·Product) + EventsHandler provider | FR-001~004 | additive — 단방향 import |

> **예외 사항**: 없음. P-001~P-007 전부 통과(예외 0건, P-005 해당 없음).

> **Gates 판정**: 전부 통과(예외 0건). Design Agent(3단계) 진입 가능.

---

## 기술 컨텍스트

> 003~008 의 확정 스택을 재확정. 009 고유 변경만 명시.

- **언어 / 런타임**: TypeScript 5.4 / Node.js 20.x. pnpm + Turborepo.
- **백엔드 프레임워크**: NestJS 11.x. 인-프로세스 이벤트는 `@nestjs/event-emitter`(EventEmitter2·`@OnEvent`).
- **이벤트 발행**: `order.created`·`settlement.created` 는 `PrismaService.onAfterCommit`(커밋 후 콜백)에서 `eventEmitter.emit`. `shipping.shipped`(005)·`review.created`(004)는 기존 emit 재사용.
- **수신자 해석**: read-only Service DI — `OrderService.getOrderOwnership`(005)·`SellerService.getUserIdBySellerId`(009)·`ProductService.getSellerIdByProductId`(009).
- **실패 격리**: `safeNotify(event, fn)` — try/catch + `Logger.error`. 알림 실패가 원 흐름에 전파되지 않음.
- **ORM / DB**: 스키마 변경 0(006 `users.notifications`·`NotificationType` 재사용). 마이그레이션 0.
- **테스트 프레임워크**: Jest(`*.spec.ts`, src rootDir). 단위([env:unit] — SC-001~005). 통합 부팅([env:integration] — SC-006, 기존 AppModule 부팅 e2e 묶음).
- **환경변수**: 신규 0.
- **신규 의존성**: 0건.

---

## 사전 영향도 분석 결과

> 상세는 [../design/research.md](../design/research.md) 참조. 본 절은 영향 파일 요약.

### 영향 파일 목록

| 파일 | 변경 유형 | 영향 내용 | 레이어 |
|---|---|---|---|
| `src/modules/notification/notification.events.ts` | 신규 구현 | `NotificationEventsHandler`(@OnEvent 4종 + safeNotify) | C |
| `src/modules/notification/notification.events.spec.ts` | 신규 | 핸들러 단위 테스트 8건(SC-001~005) | D |
| `src/modules/notification/notification.module.ts` | 수정 | imports(Order·Seller·Product) + EventsHandler provider | C |
| `src/modules/order/order.events.ts` | 수정(additive) | OrderCreatedPayload(+ ORDER_EVENTS 보강) | B |
| `src/modules/order/order.service.ts` | 수정(additive) | createOrder after-commit `order.created` emit + EventEmitter2 DI | B |
| `src/modules/order/order.service.spec.ts` | 수정 | EventEmitter2 mock provider 추가 | D |
| `src/modules/product/product.service.ts` | 수정(additive) | getSellerIdByProductId(read-only) | B |
| `src/modules/seller/seller.service.ts` | 수정(additive) | getUserIdBySellerId(read-only) | B |
| `src/modules/settlement/settlement.events.ts` | 수정(additive) | SETTLEMENT_EVENTS.CREATED + SettlementCreatedPayload | B |
| `src/modules/settlement/settlement.service.ts` | 수정(additive) | createSettlement after-commit `settlement.created` emit + EventEmitter2 DI | B |
| `src/modules/settlement/settlement.service.spec.ts` | 수정 | EventEmitter2·onAfterCommit mock 추가 | D |

> `package.json` 변경 0건. `prisma/schema.prisma` 변경 0건(마이그레이션 0). review 모듈 변경 0건(기존 `review.created` emit 재사용).

---

## 핵심 설계

### 0. 모듈 간 통신 토폴로지 (P-001 / NFR-002 핵심)

```
[publisher]                         [NotificationEventsHandler 구독]        [수신자 해석 DI]
order.created   (009 emit) ──┐
shipping.shipped(005 emit) ──┤──→  @OnEvent 4종  ──→  notificationService.create(userId, type, ...)
settlement.created(009 emit)─┤            │
review.created  (004 emit) ──┘            ├─ ORDER_PLACED      : payload.userId (직접)
                                          ├─ ORDER_SHIPPED     : OrderService.getOrderOwnership(orderId).userId
                                          ├─ SETTLEMENT_CREATED: SellerService.getUserIdBySellerId(sellerId)
                                          └─ REVIEW_RECEIVED   : ProductService.getSellerIdByProductId → SellerService.getUserIdBySellerId

NotificationModule imports [Order, Seller, Product]  (단방향 — 도메인은 notification 미import → 순환 없음)
```

### 1. NotificationEventsHandler (FR-001~005)

```ts
@OnEvent(ORDER_EVENTS.CREATED)   onOrderCreated(p)      → safeNotify(create(p.userId, ORDER_PLACED, ...))
@OnEvent(SHIPPING_EVENTS.SHIPPED) onShipmentShipped(p)  → safeNotify(getOrderOwnership(p.orderId).userId → create ORDER_SHIPPED)
@OnEvent(SETTLEMENT_EVENTS.CREATED) onSettlementCreated(p) → safeNotify(getUserIdBySellerId(p.sellerId) ?? skip → create SETTLEMENT_CREATED)
@OnEvent('review.created')        onReviewCreated(p)    → safeNotify(getSellerIdByProductId → getUserIdBySellerId ?? skip → create REVIEW_RECEIVED)

private safeNotify(event, fn):  try { await fn() } catch(err) { logger.error(`알림 생성 실패 (event=${event}): ...`) }
```

- **수신자 해석 실패(null)**: settlement/review 핸들러는 `if (!userId) return`(또는 `!sellerId`)으로 알림 생략.
- **예외 격리**: 모든 핸들러가 `safeNotify` 래퍼 안에서 실행 → create·해석 예외가 발행 측으로 전파되지 않음.

### 2. additive emit (FR-001·003)

- **order.created**: `createOrder` 의 `runInTransaction` 완료 후 `onAfterCommit(() => emit(ORDER_EVENTS.CREATED, {orderId, userId}))`.
- **settlement.created**: `createSettlement` 의 정산 트랜잭션 완료 후 `onAfterCommit(() => emit(SETTLEMENT_EVENTS.CREATED, {settlementId, sellerId}))`.
- 커밋 후 발행이므로 알림 구독자가 커밋되지 않은 데이터를 읽지 않으며, 발행/알림 실패가 원 트랜잭션을 롤백하지 않는다.

### 3. read-only 해석 메서드 (FR-006)

```ts
SellerService.getUserIdBySellerId(sellerId): Promise<string|null>   // sellerRepository.findById(sellerId)?.userId ?? null
ProductService.getSellerIdByProductId(productId): Promise<string|null> // productRepository.findById(productId)?.sellerId ?? null
```

---

## 결정 기록 (ADRs)

| ADR-ID | 결정 항목 | 채택안 | 대안(검토했으나 미채택) | 근거(spec FR/NFR) | 영향 범위 |
|---|---|---|---|---|---|
| ADR-001 | 알림 생성 호출 위치 | 구독자(`@OnEvent`) 핸들러 | publisher 에 create() 직접 삽입(결합도·회귀 증가) | NFR-002 | notification.events |
| ADR-002 | 수신자 해석 | read-only Service DI(getOrderOwnership·getUserIdBySellerId·getSellerIdByProductId) | 핸들러가 타 도메인 테이블 직접 쿼리(P-001 위반) | P-001, NFR-001, FR-006 | seller/product/order service |
| ADR-003 | 알림 실패 처리 | safeNotify(try/catch + Logger) | 예외 전파(원 흐름 깨짐) | FR-005, NFR-003 | notification.events |
| ADR-004 | 수신자 미해석(null) | 알림 생략(`if (!userId) return`) | 기본 수신자 지정(잘못된 수신자) | FR-003·004 | notification.events |
| ADR-005 | emit 시점 | 커밋 후(`onAfterCommit`) | 트랜잭션 내 emit(미커밋 데이터 구독·롤백 위험) | FR-001·003 | order/settlement service |
| ADR-006 | 모듈 import 방향 | NotificationModule → Order/Seller/Product(단방향) | 도메인 모듈이 notification import(순환) | NFR-002 | notification.module |

---

## 인터페이스 계약

### 009 신규/변경 인터페이스 (additive)

```ts
// SellerService (009 신규 read-only)
getUserIdBySellerId(sellerId: string): Promise<string | null>;
// ProductService (009 신규 read-only)
getSellerIdByProductId(productId: string): Promise<string | null>;
// OrderService.getOrderOwnership (005 — 009 재사용)
getOrderOwnership(orderId: string): Promise<{ userId: string; ... }>;
// 페이로드 타입 (009 신규/기존)
interface OrderCreatedPayload { orderId: string; userId: string; }          // 009 신규
interface SettlementCreatedPayload { settlementId: string; sellerId: string; } // 009 신규
// shipping.shipped{orderId, sellerId} (005), review.created{productId,...} (004) — 재사용
```

### 하위 호환성 / 방어 코드

- order.created·settlement.created emit 은 after-commit additive → 기존 주문·정산 흐름 불변(005~008 회귀 0).
- `getUserIdBySellerId`·`getSellerIdByProductId` 는 미존재 시 `null` 반환(방어) → 핸들러가 `if (!x) return` 으로 알림 생략.
- `safeNotify` 가 모든 핸들러 예외를 catch → 발행 측 전파 차단.

---

## 데이터 모델

> 상세는 [../db-design/data-model.md](../db-design/data-model.md) 참조.

**스키마 변경 없음.** 009 는 006 의 `users.notifications` 테이블과 `NotificationType` enum(ORDER_PLACED·
ORDER_SHIPPED·SETTLEMENT_CREATED·REVIEW_RECEIVED)을 그대로 재사용한다. 신규 테이블·컬럼·enum·인덱스 0,
마이그레이션 0. Database Design Agent 비활성(selection-phases.md: N).

---

## 테스트 전략

### SC↔테스트 매핑 (요약)

| SC 식별자 | 수준 | 유형 | 시나리오 요약 | 기대 결과 |
|---|---|---|---|---|
| SC-001 | 단위 | Happy | order.created → 구매자 ORDER_PLACED | create(userId, ORDER_PLACED) |
| SC-002 | 단위 | Happy/Error | shipping.shipped → getOrderOwnership → ORDER_SHIPPED; 해석 throw → no create·no throw | 격리 |
| SC-003 | 단위 | Happy/Edge | settlement.created → getUserIdBySellerId → SETTLEMENT_CREATED; null → no create | 생략 |
| SC-004 | 단위 | Happy/Edge | review.created → getSellerIdByProductId → getUserIdBySellerId → REVIEW_RECEIVED; no seller → no create | 생략 |
| SC-005 | 단위 | Error | create() throw → 핸들러 밖 전파 없음 | safeNotify 격리 |
| SC-006 | 통합 | Happy | AppModule 부팅 — NotificationModule imports Order/Seller/Product, EventsHandler provider, 순환 없음 | DI 해석 성공 |

### smoke_tests

- 필요 여부: Y (통합 부팅 — 기존 묶음). 009 는 `NotificationModule` 에 신규 import(Order/Seller/Product)와 provider(EventsHandler)를 추가한다. 기존 AppModule 부팅 e2e 묶음(16 suites/84)이 DI 그래프(순환 의존 없음)를 해석하여 부팅 성공을 확인한다(SC-006). 009 전용 신규 e2e 테스트는 추가하지 않았다(coverage-gap 기록).

---

## 기타 고려사항

- **순환 의존 회피(NFR-002)**: NotificationModule 이 Order/Seller/Product 를 import 하고, 그 역방향(도메인 → notification)이 없으므로 forwardRef 불필요. AppModule 부팅이 순환 부재를 검증한다.
- **after-commit 발행 순서**: 008(멱등성)과 009(emit)가 동일 `settlement.service.ts` 에 누적됐다. 멱등 제외 후 정산 생성 → 커밋 → `onAfterCommit` 으로 settlement.created emit 순서. emit 은 식별자만 전달하며 금액을 포함하지 않는다.
- **e2e 통합 시나리오 부재(한계)**: 이벤트 발행 → DB 알림 생성 → `GET /notifications` 조회의 end-to-end 테스트는 미작성(coverage-gap.md). 핸들러 단위 테스트(mock)로 수신자 해석·생성·격리를 직접 단언한다.
