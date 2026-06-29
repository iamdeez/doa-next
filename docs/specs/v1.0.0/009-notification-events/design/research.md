---
작성: Design Agent
버전: v1.0
최종 수정: 2026-06-29 19:01
상태: 확정 (retroactive)
---

# Research: 009-notification-events

## 목차

- [분석 우선순위 게이트 결과](#분석-우선순위-게이트-결과)
- [기존 코드베이스 분석](#기존-코드베이스-분석)
  - [클래스·모듈 계층 구조](#클래스모듈-계층-구조)
  - [영향 범위 분석 (호출 측 전수 목록)](#영향-범위-분석-호출-측-전수-목록)
  - [공유 상태·동시성 분석](#공유-상태동시성-분석)
- [영향 파일 목록](#영향-파일-목록)
- [외부 라이브러리 API 실제 동작 확인](#외부-라이브러리-api-실제-동작-확인)
- [기술 선택 조사](#기술-선택-조사)
- [엣지 케이스 및 한계](#엣지-케이스-및-한계)

---

## 분석 우선순위 게이트 결과

- **변경 대상 모듈(plan §핵심 설계)**: `notification`(events 핸들러 신규·module 수정), `order`(events·service additive emit), `settlement`(events·service additive emit), `seller`/`product`(read-only 해석 메서드). review 모듈은 **변경 없음**(004 `review.created` emit 재사용).
- §A·B·C 분석은 위 모듈로 한정.
- §D(다단계 병렬 파이프라인): 미해당.
- §E(동일 가드 결정 통합): 미해당(009 는 라우트·가드를 추가하지 않음 — 이벤트 핸들러).
- 외부 라이브러리 검증(§4): **신규 라이브러리 0건**. 기존 `@nestjs/event-emitter`(EventEmitter2·@OnEvent)만 신규 사용 패턴 — 아래 검증.
- §F(production 시그니처 변경): **해당 없음** — order/settlement emit·seller/product 해석 메서드는 전부 신규 additive. 기존 메서드 시그니처 불변. `OrderService.getOrderOwnership`(005)는 재사용(시그니처 불변).

---

## 기존 코드베이스 분석

> context.md §2 핵심 모듈 목록을 기준선. 본 절은 변경 대상 한정 정밀 분석.

### 클래스·모듈 계층 구조

- **OOP 상속/추상 클래스 없음**: `NotificationEventsHandler` 는 NestJS `@Injectable()` concrete 클래스(`@OnEvent` 메서드 4종 + private `safeNotify`). `Logger` 는 NestJS 기본.
- **모듈 DI 토폴로지(실측)**:
  - `NotificationEventsHandler` 생성자: `NotificationService`, `OrderService`, `SellerService`, `ProductService`.
  - `NotificationModule.imports`: `AuthSharedModule, OrderModule, SellerModule, ProductModule`. providers: `[NotificationService, NotificationRepository, NotificationEventsHandler]`. exports: `[NotificationService]`.
  - `OrderService` 생성자(009 변경): `EventEmitter2` 추가 주입(order.created emit).
  - `SettlementService` 생성자(009 변경): `EventEmitter2` 추가 주입(settlement.created emit). (008 시점에는 미주입 — 009 가 추가)
- **순환 DI 점검(신규 의존 관계)**:
  | 관계 | 방향 | 순환? |
  |---|---|---|
  | notification → order/seller/product | NotificationModule imports, EventsHandler uses Service | 도메인 모듈은 notification 미import → **순환 없음** |
  - 결론: forwardRef 신규 도입 불필요. notification → 도메인은 단방향. AppModule 부팅으로 검증.

### 영향 범위 분석 (호출 측 전수 목록)

- **`NotificationEventsHandler`(신규)**: AppModule 부팅 시 `@OnEvent` 데코레이터가 EventEmitter2 에 자동 구독 등록. 직접 호출 측 0(이벤트 구동).
- **`OrderService.createOrder`(009 변경)**: after-commit `order.created` emit 추가(additive). 기존 주문 생성 흐름·반환값 불변. 기존 order 단위 테스트는 `EventEmitter2` mock provider 추가로 통과(회귀 0).
- **`SettlementService.createSettlement`(009 변경)**: after-commit `settlement.created` emit 추가(additive). 008 멱등 필터와 동일 메서드에 누적. 기존 settlement 단위 테스트는 `EventEmitter2`·`onAfterCommit` mock 추가로 통과(회귀 0).
- **`SellerService.getUserIdBySellerId`·`ProductService.getSellerIdByProductId`(신규)**: NotificationEventsHandler 만 호출(신규). 기존 시그니처 불변.
- **`OrderService.getOrderOwnership`(재사용)**: 005 시점부터 존재. 009 변경 없음(ORDER_SHIPPED 수신자 해석에 소비).
- **review 모듈**: 변경 0. `review.created`(004 emit) 를 NotificationEventsHandler 가 구독만 함.

### 공유 상태·동시성 분석

- **공유 자원**: `users.notifications`(알림 — notification 모듈 소유, 006). 009 는 생성(insert)만 수행.
- **이벤트 발행 시점**: `order.created`·`settlement.created` 는 `onAfterCommit`(커밋 후) 발행 → 구독자가 미커밋 데이터를 읽지 않는다. emit 자체는 인-프로세스 동기 디스패치(EventEmitter2 기본).
- **실패 격리**: `safeNotify` 의 try/catch 가 핸들러 예외를 흡수하여 발행 측(주문·배송·정산·리뷰)으로 전파되지 않는다. 알림 생성 실패가 원 트랜잭션을 롤백하지 않는다(after-commit + 격리).
- **캐싱 컴포넌트 없음**: 수신자 해석은 매 이벤트 실시간 조회(캐시 미도입 — 부재가 곧 상태). Check-Then-Act·캐시 무효화 검토 비해당.

---

## 영향 파일 목록

| 파일 | 변경 유형 | 영향 내용 | 레이어 |
|---|---|---|---|
| `src/modules/notification/notification.events.ts` | 신규 구현 | NotificationEventsHandler(@OnEvent 4종 + safeNotify) | C |
| `src/modules/notification/notification.events.spec.ts` | 신규 | 핸들러 단위 테스트 8건 | D |
| `src/modules/notification/notification.module.ts` | 수정 | imports(Order·Seller·Product) + EventsHandler provider | C |
| `src/modules/order/order.events.ts` | 수정(additive) | OrderCreatedPayload | B |
| `src/modules/order/order.service.ts` | 수정(additive) | order.created after-commit emit + EventEmitter2 DI | B |
| `src/modules/order/order.service.spec.ts` | 수정 | EventEmitter2 mock | D |
| `src/modules/product/product.service.ts` | 수정(additive) | getSellerIdByProductId | B |
| `src/modules/seller/seller.service.ts` | 수정(additive) | getUserIdBySellerId | B |
| `src/modules/settlement/settlement.events.ts` | 수정(additive) | SETTLEMENT_EVENTS.CREATED + SettlementCreatedPayload | B |
| `src/modules/settlement/settlement.service.ts` | 수정(additive) | settlement.created after-commit emit + EventEmitter2 DI | B |
| `src/modules/settlement/settlement.service.spec.ts` | 수정 | EventEmitter2·onAfterCommit mock | D |

> `package.json`·`prisma/schema.prisma` 변경 0건. review 모듈 변경 0건.

---

## 외부 라이브러리 API 실제 동작 확인

- **신규 외부 라이브러리: 없음 — 해당 없음**.
- **`@nestjs/event-emitter`(`@OnEvent`·EventEmitter2)**: `@OnEvent('event.name')` 데코레이터가 핸들러 메서드를 EventEmitter2 에 구독 등록(AppModule 부팅 시). `eventEmitter.emit('event.name', payload)` 가 동기 디스패치. order/settlement 은 `onAfterCommit(() => emit(...))` 로 커밋 후 발행. 003 부터 사용된 기존 패턴.
- **`PrismaService.onAfterCommit`**: 003 ALS 기반 tx-aware 확장(기존). 트랜잭션 커밋 후 콜백 등록. order.created·settlement.created emit 에 사용.
- **수신자 해석 메서드**: `sellerRepository.findById(sellerId)?.userId ?? null`, `productRepository.findById(productId)?.sellerId ?? null` — 표준 Prisma findById + null 방어.

가정-실제 불일치 현재 미발견.

---

## 기술 선택 조사

| 결정 | 채택 | 근거 |
|---|---|---|
| 알림 생성 호출 위치 | 구독자(@OnEvent) 핸들러 | 결합도·회귀 최소화(ADR-001). publisher 직접 삽입 회피 |
| 수신자 해석 | read-only Service DI | P-001 경계 유지(ADR-002). 핸들러 직접 쿼리 회피 |
| 알림 실패 처리 | safeNotify(try/catch + Logger) | 원 흐름 무영향(ADR-003) |
| 수신자 미해석 | 알림 생략(`if (!x) return`) | 잘못된 수신자 회피(ADR-004) |
| emit 시점 | 커밋 후(onAfterCommit) | 미커밋 데이터 구독·롤백 위험 회피(ADR-005) |
| 모듈 import 방향 | notification → 도메인(단방향) | 순환 의존 회피(ADR-006) |

---

## 엣지 케이스 및 한계

- **ORDER_PLACED**: `order.created.userId` 직접 사용(구매자) — 별도 해석 불필요(테스트 `when_order_created_then_notify_buyer_ORDER_PLACED`).
- **ORDER_SHIPPED 해석 예외**: `getOrderOwnership` 가 throw 하면 `safeNotify` 가 흡수 → 알림 미생성·전파 없음(테스트 `when_ownership_resolution_throws_then_no_create_and_no_throw`).
- **SETTLEMENT_CREATED 미해석**: `getUserIdBySellerId` 가 `null` 이면 `if (!userId) return` → 알림 생략(테스트 `when_seller_userId_unresolved_then_no_create`).
- **REVIEW_RECEIVED 무판매자**: `getSellerIdByProductId` 가 `null` 이면 알림 생략(테스트 `when_product_has_no_seller_then_no_create`). sellerId 해석 후 userId 도 null 가드.
- **create() 예외 격리**: `notificationService.create` 가 throw 해도 핸들러 밖으로 전파 안 됨(테스트 `create 실패가 핸들러 밖으로 전파되지 않는다 (격리)`).
- **순환 의존 부재(한계 검증)**: NotificationModule → Order/Seller/Product 단방향. AppModule 부팅(기존 e2e 묶음)으로 DI 그래프 해석 성공 확인. 009 전용 신규 e2e 미추가.
- **e2e 통합 시나리오 부재(한계)**: 이벤트 발행 → DB 알림 생성 → 조회의 end-to-end 테스트 미작성(GAP 아님 — 핸들러 단위 테스트로 분기 직접 커버, coverage-gap 권고).
