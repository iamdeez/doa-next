# Project Context

> 이 문서는 프로젝트의 **현재 상태를 묘사**하는 살아있는 참조 문서다.
> 새로운 spec 설계 전 반드시 읽어 프로젝트 구조·흐름·용어를 숙지한다.
>
> - **갱신 시점**: spec 구현·검증 완료 후, `CHANGES.md` 작성과 같은 시점에 갱신한다.
> - **작성 원칙**: 현재 코드베이스의 사실만 기록한다. 미래 계획이나 설계 의도는 spec.md에 작성한다.
> - **constitution.md와의 구분**: constitution은 "어떻게 만들어야 하는가(원칙)"이고,
>   이 문서는 "현재 무엇이 존재하는가(사실)"다.

---

## 1. 프로젝트 개요

- **프로젝트명**: DOA Market (doa-next)
- **목적**: 기존 AWS 기반 MSA 18개 서비스 오픈마켓을 모듈러 모놀리스 + Fly.io로 재구축. AWS 의존 제거·비용 절감·운영 단순화.
- **현재 버전**: v1.0.0
- **주요 기술 스택**: Node.js + TypeScript, NestJS, Prisma, PostgreSQL 16, Turborepo

> 001~007 완료. `apps/backend`(NestJS **18모듈 전부 실구현** — auth·user·seller·product·inventory·cart·order·payment·coupon·review·shipping·settlement·search·notification·file·banner·stats·admin),
> Prisma **29테이블**·JWT·AdminGuard·ALS 트랜잭션·pg-boss·쿠폰(서버할인·이중사용방지)·리뷰(orderItem)·배송(송장·추적·상태전이)·정산(Decimal 집계)·검색·알림·파일(R2 Port+stub)·배너·통계·운영·Docker·CI 실재.
> 단위/통합 테스트: unit 239 PASS(25 suites) + e2e/static 84 PASS(16 suites). (005~007 경량 구현 후 정식 검증·문서화 + 008·009 후속 보강 완료.)
> **후속 보강 완료**: 008 정산 멱등성(SEC-FIND-005-01 해결), 009 알림 이벤트 연동(GAP-006-01 해결).
> **잔여 알려진 제약**: coupon `discountValue` 음수 검증 누락(SEC-001 Medium). file 메타 소유권 미검증·presign 입력 무검증(SEC-FIND-006-01/02 Low). admin audit log 부재(GAP-007-01). 마이그레이션 드리프트(GAP-005-03, accepted). 상세 §6.

---

## 2. 프로젝트 구조

### 디렉토리 레이아웃

> 실재 기준. `apps/console`·`apps/worker` 는 현재 스캐폴드(package.json + README)만 존재하며 실제 앱 초기화는 후속 단계.
> `mobile/customer-app`·`apps/backend/fly.toml` 은 아직 미존재(Stage 2~4).

```
doa-next/                      Turborepo 모노레포 루트
├── apps/
│   ├── backend/               NestJS 모듈러 모놀리스 (실구현)
│   │   ├── src/health/        헬스체크 (GET /health)
│   │   ├── src/shared/        auth(JwtStrategy·JwtAuthGuard·@CurrentUser)·config(jwt)·prisma(PrismaService)
│   │   ├── src/modules/       18개 NestJS 도메인 모듈 (전부 실구현)
│   │   ├── prisma/            schema.prisma (multiSchema) + migrations
│   │   └── Dockerfile         멀티스테이지 + HEALTHCHECK (fly.toml 은 Stage 2+)
│   ├── console/               Next.js seller·admin 웹 (스캐폴드만 — Stage 4 init)
│   └── worker/                pg-boss 워커 (스캐폴드만 — Stage 2+ 설정)
├── packages/
│   ├── shared-types/          OpenAPI 기반 공유 타입
│   ├── api-client/            웹 공통 API 클라이언트
│   └── ui/                    공유 UI 컴포넌트
├── (mobile/customer-app/      Flutter 고객 앱 — 미존재, Stage 4)
├── .github/workflows/ci.yml   CI (lint→typecheck→test→docker build)
├── docker-compose.yml         로컬 PostgreSQL 16
├── turbo.json
└── docs/specs/                SDD 산출물
```

### 레이어 구조 (apps/backend)

```
HTTP 요청
    ↓
Controller (HTTP 라우팅·입력 검증)
    ↓
Service (도메인 로직)
    ↓
Repository (Prisma·DB 접근 — 자기 스키마만)
    ↑ ↓ (도메인 이벤트)
Events (발행/구독 — NestJS EventEmitter)
```

### 핵심 도메인 모듈 목록

| 모듈 | 담당 스키마 | 역할 |
|---|---|---|
| `auth` | `users` | 로그인/JWT/Refresh/비밀번호 재설정/세션 |
| `user` | `users` | 프로필/배송지/찜(wishlist)/최근 본 상품/등급 |
| `seller` | `users` | 판매자 등록·심사·판매자 정보 |
| `product` | `products` | 상품/카테고리/옵션/이미지 |
| `inventory` | `products` | 재고/입출고 로그/SKU |
| `cart` | `commerce` | 장바구니 (JSONB items) |
| `coupon` | `commerce` | 쿠폰 발급·사용 |
| `review` | `commerce` | 리뷰·평점 |
| `order` | `orders` | 주문 생성·상태 전이·주문항목 |
| `payment` | `payments` | 결제·환불 (PG 연동) |
| `shipping` | `orders` | 배송·송장·배송추적 |
| `settlement` | `settlements` | 판매자 정산 |
| `search` | (자체 테이블 없음) | 상품 검색 질의 — `ProductService` DI 경유 read-only (offset 페이지네이션·키워드·가격·정렬) |
| `notification` | `users` | 인앱 알림 (notifications 테이블). `create()` 공개 진입점 — 이벤트 연동은 후속(GAP-006-01) |
| `file` | `files` | 파일 메타데이터·presign (file_assets). R2는 `FileStoragePort` + `StubFileStorage`(무네트워크) |
| `banner` | `admin` | 배너 노출 (banners 테이블) — 관리자 CRUD + 공개 노출(활성·기간 필터) |
| `stats` | (자체 테이블 없음) | 집계·통계 — order/user/seller Service 공개 메서드 DI 조합 (매출 Decimal) |
| `admin` | (자체 테이블 없음) | 운영 — 판매자 승인 대기/승인(기존 SellerService.approve 재사용)·사용자 목록 |

> **구현 상태**: **18개 모듈 전부 실구현**(001~007). search·stats·admin 은 자체 트랜잭션 테이블 없이 타 도메인 Service 공개 메서드를 DI 경유로 조합하는 read-only/오케스트레이션 모듈이다(P-001 — repository 빈 클래스 또는 자기 스키마 집계만).
>
> **인프라(`src/infrastructure/pgboss/`)**: PgBossModule · OutboxRelay(payment_outbox → pg-boss relay) · AutoConfirmJob(배송완료 7일 후 자동 구매확정). `shared/prisma/PrismaService` 는 ALS(AsyncLocalStorage) tx-aware 확장(`runInTransaction`/`tx`/`onAfterCommit`) — cross-schema 단일 `$transaction` 참여. 결제: `PaymentGatewayPort` + stub(실 PG 후속), Idempotency-Key 멱등. 파일: `FileStoragePort` + `StubFileStorage`(실 R2 후속).

### 공통(shared)·인프라 모듈 (실구현)

| 모듈 | 위치 | 역할 |
|---|---|---|
| `health` | `src/health/` | 앱 alive 헬스체크 (GET /health, DB 미접근) |
| `shared/auth` | `src/shared/auth/` | JwtStrategy · JwtAuthGuard · OptionalJwtAuthGuard · AdminGuard(`ADMIN_USER_IDS` env 기반, fail-closed) · `@CurrentUser` 데코레이터 |
| `shared/config` | `src/shared/config/` | jwt.config (Access 15분 / Refresh 30일 상수) |
| `shared/prisma` | `src/shared/prisma/` | PrismaService · PrismaModule (DB 연결) |

---

## 3. 이벤트 및 데이터 흐름

### 3.1 주요 처리 흐름

```
[고객 Flutter 앱 / 판매자·관리자 콘솔 웹]
    ↓ HTTPS REST
[NestJS Controller]
    ↓
[Service (도메인 로직)]
    ↓
[Repository (Prisma → PostgreSQL)]
    ↓ (선택: 도메인 이벤트 발행)
[EventEmitter → 구독 모듈 Service 호출]
    ↓ (유실 불가 작업)
[outbox 기록 → pg-boss 워커 폴링]
```

### 3.2 이벤트 흐름

| 이벤트 | 발행 모듈 | 구독 모듈 | 처리 방식 |
|---|---|---|---|
| `product.created` / `product.updated` | `product` | `search`, `stats` | 인-프로세스 EventEmitter |
| `order.created` | `order` | `inventory`, `notification`, `stats` | 인-프로세스 EventEmitter |
| `order.completed` | `order` | `settlement`, `review`, `stats` | outbox + pg-boss (유실 불가) |
| `payment.completed` | `payment` | `order`, `settlement`, `notification` | outbox + pg-boss |
| `payment.refunded` | `payment` | `order`, `settlement`, `notification` | outbox + pg-boss |
| `coupon.used` | `coupon` | `stats` | 인-프로세스 EventEmitter |
| `file.uploaded` | `file` | — | 인-프로세스 (후처리 시 pg-boss) |
| `inventory.stock-changed` | `inventory` | `product` | 인-프로세스 (ProductEventsHandler — ACTIVE↔OUT_OF_STOCK 자동 전이, FR-023/024). **002 실구현** |
| `product.viewed` | `product` | `user` | 인-프로세스 (UserEventsHandler — 최근 본 상품 기록, FR-009). **002 실구현** |

### 3.3 상태 흐름 (state machine)

**주문(Order)**:
```
pending → confirmed → preparing → shipped → delivered → completed
                ↘ cancelled
```
- `pending → confirmed`: payment.completed 이벤트 수신
- `confirmed → preparing`: 판매자 주문 확인
- `preparing → shipped`: 판매자 송장 등록
- `shipped → delivered`: 배송 추적 상태 업데이트
- `delivered → completed`: 구매 확정 (자동 N일 후 또는 수동)
- `* → cancelled`: 취소 요청 + 환불 처리

**결제(Payment)**:
```
pending → completed
       ↘ failed
completed → refund_pending → refunded
```

### 3.4 외부 시스템 연동

| 시스템 | 연동 방식 | 담당 모듈 | 주의사항 |
|---|---|---|---|
| Cloudflare R2 | `FileStoragePort` 인터페이스 + `StubFileStorage`(현재 무네트워크 stub, 결정적 URL) | `file` | 실 R2 연동은 후속 — Port 구현체 교체 방식. AWS SDK 미사용(P-002) |
| PG사(결제) | REST API (PG사별 SDK) | `payment` | 멱등성 키 필수 |
| 이메일(알림) | SMTP 또는 외부 SaaS | `notification` | [TBD] — 골격 구축 후 결정 |
| 푸시(알림) | FCM | `notification` | Flutter 앱 대상 |

---

## 4. 데이터 모델

### 스키마 분리 구조

```
postgres (단일 인스턴스, Fly Postgres)
├── schema: users      (users, refresh_tokens, sellers, addresses, wishlists, product_views)
├── schema: products   (categories, products, product_images, variants, inventory, inventory_logs)
├── schema: users      (users, refresh_tokens, sellers, addresses, wishlists, product_views, notifications)
├── schema: products   (categories, products, product_images, variants, inventory, inventory_logs)
├── schema: commerce   (carts, coupons, user_coupons, reviews)
├── schema: orders     (orders, order_items, order_events, shipments, shipment_tracking)
├── schema: payments   (payments, refunds, payment_outbox)
├── schema: settlements(settlements, settlement_items)
├── schema: admin      (banners)
└── schema: files      (file_assets)
```

> **실재 상태**: **29개 테이블 실체화**(Prisma migrate 적용, 마이그레이션 6차) — `users` 7(+ notifications) · `products` 6 · `commerce` 4(carts·coupons·user_coupons·reviews) · `orders` 5(+ shipments·shipment_tracking) · `payments` 3(payments·refunds·payment_outbox) · `settlements` 2(settlements·settlement_items) · `admin` 1(banners) · `files` 1(file_assets).
> Variant 가 옵션을 인라인 필드로 흡수(별도 options 테이블 없음). `order_events`·`inventory_logs`·`shipment_tracking` 은 append-only. 금전 필드(totalAmount·unitPrice·amount·totalSales·commission·payoutAmount·saleAmount 등)는 전부 Decimal(12,2)(P-005). cross-schema/cross-module 참조는 plain String(FK 미선언, P-001) — notifications.userId·file_assets.ownerId·banners 무참조·settlements.sellerId·settlement_items.orderItemId·shipments.orderId 등.
> notifications 는 `admin` 이 아닌 `users` 스키마에 위치한다(사용자 알림). admin 스키마는 banners 1개뿐(공지·시스템설정·audit_logs 는 미도입 — GAP-007-01).
> Refresh Token 은 원문이 아닌 SHA-256 해시(`tokenHash`)로 저장된다(ADR-003).

**주요 설계 결정 (비도출 지식)**:
- `cart`: `user_id + JSONB items` 구조로 DynamoDB Carts 테이블 대체.
- `orders.order_events`: 이벤트 소싱 유지 (append-only). 주문 상태 변경 이력 보존.
- `orders` 스키마: 트래픽 증가 시 월별 파티셔닝 적용 가능하도록 설계 계승.
- `users.product_views`: 인-앱 캐시 + 배치 flush 방식으로 DynamoDB ProductViews 대체 가능.
- 세션: JWT stateless (Refresh Token은 `users.refresh_tokens` 테이블로 관리).

---

## 5. 도메인 용어 사전 (Glossary)

| 용어 | 정의 | 사용 금지 동의어 |
|---|---|---|
| 모듈 | NestJS `@Module()`로 정의된 도메인 단위. 18개. | 서비스(MSA 문맥), 마이크로서비스 |
| 스키마 | PostgreSQL 내 도메인별 네임스페이스 (`users`, `products` 등) | 데이터베이스 (단일 인스턴스) |
| 도메인 이벤트 | 모듈 간 비동기 통신 단위. NestJS EventEmitter 또는 pg-boss outbox로 처리 | 메시지, 큐 메시지 |
| outbox | 트랜잭션 내 도메인 이벤트를 DB에 기록하고 pg-boss 워커가 폴링 처리하는 패턴 | 트랜잭셔널 outbox |
| 콘솔(console) | 판매자(seller) + 관리자(admin) 통합 Next.js 웹 (`apps/console`) | 어드민, 대시보드 |
| 고객 앱 | Flutter 기반 iOS/Android 쇼핑 앱 (`mobile/customer-app`) | 유저 앱, user-app |
| 워커(worker) | pg-boss 백그라운드 잡 처리 프로세스 (`apps/worker`) | 컨슈머, 큐 워커 |
| strangler | 특정 모듈이 병목 시 해당 모듈만 별도 서비스로 분리하는 점진적 전환 패턴 | — |
| cursor 페이지네이션 | OFFSET 대신 마지막 항목 id를 cursor로 사용하는 무한 스크롤형 목록 패턴 (ADR-007·NFR-001) | 오프셋 페이지네이션 |
| variant | 상품 옵션 조합별 SKU 단위 (optionName·optionValue 인라인 흡수). 재고는 variant 단위로 관리 | (SKU와 혼용 주의) |
| append-only | inventory_logs 등 이력 테이블은 INSERT만 허용, UPDATE·DELETE 금지 (이력 보존) | — |

---

## 6. 알려진 제약 및 기술 부채

| 항목 | 내용 | 영향 범위 | 관련 spec |
|---|---|---|---|
| ~~정산 중복집계 미차단 (SEC-FIND-005-01)~~ | **RESOLVED (008-settlement-idempotency)** — `SettlementItem.orderItemId @unique`(DB 차단) + `findSettledOrderItemIds` 로 기집계 항목 제외 후 재계산 + 멱등성 테스트 2건 | `settlement` | 008 |
| ~~알림 이벤트 미연동 (GAP-006-01)~~ | **RESOLVED (009-notification-events)** — `NotificationEventsHandler` 가 order.created·shipping.shipped·settlement.created·review.created 구독→수신자 해석(read-only DI)→알림 생성. 실패 격리(safeNotify) | `notification` | 009 |
| file 메타 소유권·입력 검증 부재 (SEC-FIND-006-01/02, Low) | `GET /files/:id` 소유권 미검증(공개 URL 모델과 정합), presign contentType allowlist·크기상한 미적용, PENDING→UPLOADED confirm 부재(고아 누적, GAP-006-02) | `file` | 006 후속 |
| 마이그레이션 드리프트 (GAP-005-03, **수용/accepted**) | 005 마이그레이션 SQL 에 004(coupons·reviews) 테이블 생성 동반 캡처(004 모델이 schema 엔 있었으나 별도 마이그레이션 부재). **결정(2026-06-29)**: 그대로 둠 — `migrate deploy` 는 순서대로 전부 생성하여 정상 동작하고 `migrate status` up-to-date. 적용된 폴더 분할/개명은 `_prisma_migrations` 기록과 어긋나 환경을 깨뜨릴 위험이 라벨 불일치(cosmetic)보다 큼. 운영 배포 직전 필요 시에만 전체 squash 리셋 재검토 | `prisma/migrations` | 005 |
| admin audit log·운영 라우트 (GAP-007-01, OBS-007-01) | 관리자 액션 추적 audit_logs 테이블 미도입. 판매자 승인이 `PATCH /sellers/:id/approve`·`POST /admin/sellers/:id/approve` 두 라우트로 노출(로직은 단일 재사용) | `admin`·`seller` | 007 후속 |
| ~~inventory 재고입고 소유권 미검증 (SEC-002)~~ | **RESOLVED (003-commerce)** — `assertSellerOwnsVariant`(variantId→product→seller 소유권 검증)를 inventory stock-in·getStock 에 적용 | `inventory`·`product` | 003-commerce FR-050/051 |
| cross-schema plain String 참조 (P-001·ADR-001) | users·products 스키마 간 FK 없음. Wishlist/ProductView.productId·Product.sellerId·InventoryLog.variantId 등 plain String 참조 → DB 수준 참조 무결성 없음(의도적), 삭제 시 고아 레코드 가능 | users·products 스키마 | 002-catalog |
| pino-pretty 미설치 | 로컬 `NODE_ENV=development` 에서 pino-pretty transport 모듈 오류. e2e 는 `NODE_ENV=production`(JSON 로그) 우회 중. 해소: `pnpm add -D pino-pretty --filter backend` | `apps/backend` 로컬 dev 로그 | 001-skeleton-bootstrap |
| 검색 성능 한계 | PostgreSQL tsvector/pg_trgm은 OpenSearch 대비 성능·기능 열위. 트래픽 증가 시 Meilisearch 도입 필요 | `search` 모듈 | — |
| 단일 DB 단일 장애점 | Fly Postgres 단일 인스턴스. HA 옵션 미설정 시 장애 시 다운타임 발생 | 전체 | — |
| 이메일 알림 제공자 미결정 | notification 모듈의 이메일 발송 SaaS(Resend·Mailgun 등) 미선정 | `notification` 모듈 | [TBD] |
| 비용 추정 불확실 | 실제 트래픽·데이터 크기에 따라 Fly Postgres 요금 재산정 필요 | 인프라 | — |

---

## 7. 갱신 이력

| 날짜 | 갱신 내용 | 관련 spec |
|---|---|---|
| 2026-06-29 | 005·006·007 반영 — 18개 도메인 전부 실구현(배송·정산·검색·알림·파일·배너·통계·운영), 29테이블. notifications 위치 정정(admin→users), file R2 Port+stub 정정, §6 신규 제약(SEC-FIND-005-01·006-01/02, GAP-005-03·006-01/02·007-01, OBS-007-01) 추가 | 005-shipping-settlement, 006-search-notification-file, 007-banner-stats-admin |
| (이전) | 001~004 골격·카탈로그·거래·리뷰쿠폰 | 001~004 |
