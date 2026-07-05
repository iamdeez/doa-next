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
- **현재 버전**: v1.1.0
- **주요 기술 스택**: Node.js + TypeScript, NestJS, Prisma, PostgreSQL 16, Turborepo

> 001~007 완료. `apps/backend`(NestJS **18모듈 전부 실구현** — auth·user·seller·product·inventory·cart·order·payment·coupon·review·shipping·settlement·search·notification·file·banner·stats·admin),
> Prisma **33테이블**·JWT·AdminGuard·소셜로그인(카카오·구글·네이버)·ALS 트랜잭션·pg-boss·쿠폰(서버할인·이중사용방지)·리뷰(orderItem)·배송(송장·추적·상태전이)·정산(Decimal 집계·멱등)·검색·알림(이벤트 연동)·파일(R2 Port+stub)·배너·통계·운영(감사 로그)·Docker·CI 실재.
> 단위/통합 테스트: unit 404 PASS(40 suites) + static 60(13 suites) + e2e 125/127 PASS(24/26 suites, 019 5b 재검증 기준 — 잔존 2건은 GAP-019-05 known-limitation, §6 참조). (005~007 경량 구현 후 정식 검증·문서화 + 008~013 후속 보강 + 014~019 완료.) auth 보안 부채 5건(SEC-013-09/10/11·SEC-014-01/06) 018 에서 해소, 신규 SEC-018-01(Medium, 미확증 헤더 신뢰)만 잔존(§6).
> **후속 보강 완료**: 008 정산 멱등성(SEC-FIND-005-01), 009 알림 이벤트 연동(GAP-006-01), 010 쿠폰 할인값 검증(SEC-001), 011 파일 보안(SEC-FIND-006-01/02·GAP-006-02), 012 정산 completedAt(GAP-005-02), 013 관리자 감사 로그(GAP-007-01) 전부 해결. **추적 백로그 전부 소진**(잔여 SEC/GAP 0, GAP-005-03만 accepted).
> **잔여 알려진 제약**: 마이그레이션 드리프트(GAP-005-03, accepted) — §6. 그 외 신규 발견 시 각 spec gaps.md·§6 에 추적.

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
| `auth` | `users` | 로그인/JWT/Refresh/비밀번호 재설정 OTP(POST /auth/forgot-password·/auth/reset-password)·이메일 찾기(POST /auth/find-email, 마스킹 반환)/세션 · 소셜 로그인(POST /auth/social-login — 카카오·구글·**네이버** 3종. 네이버는 code-exchange(client_secret 서버 교환) 방식, 카카오·구글은 클라이언트 토큰 검증 방식(혼합). SocialAuthService 계정해석 3단계: providerId 매칭 재로그인→email 매칭 자동연동(카카오·구글 한정)→신규가입) · **`POST /auth/naver/state`(익명, CSRF state 발급)** — `OAuthStateService`(`social/oauth-state.service.ts`)가 state 발급(randomBytes(32) base64url·TTL 10분)·검증·원자적 1회성 소비(delete-on-consume). 네이버 code-exchange 는 로그인 전 이 엔드포인트로 발급받은 state 를 echo, 서버가 verify 이전 검증(SEC-015-02 하드닝, 016) |
| `user` | `users` | 프로필/배송지/찜(wishlist)/최근 본 상품/등급 · 위시리스트·최근 본 상품 응답에 상품 요약(title·price·thumbnailUrl) 인라인 조인(`ProductService.getPublicSummaries()` DI, UserModule→ProductModule import)·조회 불가 상품은 `productAvailable:false` 유지 — 017 |
| `seller` | `users` | 판매자 등록·심사·판매자 정보 · 신규 공개 `listSellers({status,cursor,take,q})`(admin 모듈 DI 소비)·repository `listByStatusPaginated()` — 017 |
| `product` | `products` | 상품/카테고리/옵션/이미지 · 판매자 소유 상품 상세 `GET /sellers/me/products/:id`(전 상태 허용, 404→403 assertOwner)·목록 cursor 페이지네이션+envelope 화·공개 요약 `getPublicSummaries(ids)`(user 모듈 DI 제공, ACTIVE/OUT_OF_STOCK 필터) — 017 |
| `inventory` | `products` | 재고/입출고 로그/SKU · 재고 조회/입고 응답 `{variantId, stock}` 구조화(getStockView·stockIn 반환형, breaking — 원시 숫자/void 대체) — 017 |
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
| `admin` | `admin` (audit) | 운영 — 판매자 승인 대기/승인(SellerService.approve 재사용)·사용자 목록 + 조치 감사 로그(admin_audit_logs, append-only) · 판매자 목록 조회 확장(상태 필터 PENDING/APPROVED/REJECTED·businessName 검색·cursor 페이지네이션, 응답 `{items,nextCursor}` envelope — 017) |

> **구현 상태**: **18개 모듈 전부 실구현**(001~007). search·stats·admin 은 자체 트랜잭션 테이블 없이 타 도메인 Service 공개 메서드를 DI 경유로 조합하는 read-only/오케스트레이션 모듈이다(P-001 — repository 빈 클래스 또는 자기 스키마 집계만).
>
> **인프라(`src/infrastructure/pgboss/`)**: PgBossModule · OutboxRelay(payment_outbox → pg-boss relay) · AutoConfirmJob(배송완료 7일 후 자동 구매확정). `shared/prisma/PrismaService` 는 ALS(AsyncLocalStorage) tx-aware 확장(`runInTransaction`/`tx`/`onAfterCommit`) — cross-schema 단일 `$transaction` 참여. 결제: `PaymentGatewayPort` + stub(실 PG 후속), Idempotency-Key 멱등. 파일: `FileStoragePort` + `StubFileStorage`(실 R2 후속).

### 공통(shared)·인프라 모듈 (실구현)

| 모듈 | 위치 | 역할 |
|---|---|---|
| `health` | `src/health/` | 앱 alive 헬스체크 (GET /health, DB 미접근) |
| `shared/auth` | `src/shared/auth/` | JwtStrategy · JwtAuthGuard · OptionalJwtAuthGuard · `isAdminUserId(userId, rawEnv)` 헬퍼(`admin-ids.ts` — ADMIN_USER_IDS 파싱·fail-closed 순수 함수) · AdminGuard(`ADMIN_USER_IDS` env 기반, fail-closed — `isAdminUserId` 위임) · `@CurrentUser` 데코레이터 · `GET /auth/me` 응답에 `isAdmin: boolean` 노출 |
| `shared/config` | `src/shared/config/` | jwt.config (Access 15분 / Refresh 30일 상수) |
| `shared/prisma` | `src/shared/prisma/` | PrismaService · PrismaModule (DB 연결) |
| `MailerPort` | `src/infrastructure/mail/` | 이메일 발송 어댑터. abstract `MailerPort` + `SmtpMailer`(nodemailer, `NODE_ENV=production`)·`StubMailer`(무네트워크 테스트). auth 비밀번호 재설정 OTP 발송 DI 주입 |
| `social/` (auth 내부) | `src/modules/auth/social/` | `SocialProviderPort` 추상 + `KakaoProvider`(access_token_info app_id 대조)·`GoogleProvider`(tokeninfo aud+email_verified)·`StubSocialProvider`. `SocialProviderResolver` 가 provider 문자열→구현체 매핑(카카오·구글·**네이버 3종 활성**). `NaverProvider` 는 code-exchange 방식(`nid.naver.com/oauth2.0/token` 으로 client_secret 교환 → `openapi.naver.com/v1/nid/me` 프로필 조회) — 015 에서 와이어됨 |

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
├── schema: users      (users, refresh_tokens, sellers, addresses, wishlists, product_views, notifications, password_reset_otps, social_accounts, oauth_states)
├── schema: products   (categories, products, product_images, variants, inventory, inventory_logs)
├── schema: commerce   (carts, coupons, user_coupons, reviews)
├── schema: orders     (orders, order_items, order_events, shipments, shipment_tracking)
├── schema: payments   (payments, refunds, payment_outbox)
├── schema: settlements(settlements, settlement_items)
├── schema: admin      (banners, admin_audit_logs)
└── schema: files      (file_assets)
```

> **실재 상태**: **33개 테이블 실체화**(Prisma migrate 적용, 마이그레이션 16차) — `users` 10(+ notifications·password_reset_otps·social_accounts·oauth_states) · `products` 6 · `commerce` 4(carts·coupons·user_coupons·reviews) · `orders` 5(+ shipments·shipment_tracking) · `payments` 3(payments·refunds·payment_outbox) · `settlements` 2(settlements·settlement_items) · `admin` 2(banners·admin_audit_logs) · `files` 1(file_assets).
> Variant 가 옵션을 인라인 필드로 흡수(별도 options 테이블 없음). `order_events`·`inventory_logs`·`shipment_tracking` 은 append-only. 금전 필드(totalAmount·unitPrice·amount·totalSales·commission·payoutAmount·saleAmount 등)는 전부 Decimal(12,2)(P-005). cross-schema/cross-module 참조는 plain String(FK 미선언, P-001) — notifications.userId·file_assets.ownerId·banners 무참조·settlements.sellerId·settlement_items.orderItemId·shipments.orderId 등.
> notifications 는 `admin` 이 아닌 `users` 스키마에 위치한다(사용자 알림). admin 스키마는 banners·admin_audit_logs 2개(공지·시스템설정 테이블은 미도입 — 필요 시 후속).
> Refresh Token 은 원문이 아닌 SHA-256 해시(`tokenHash`)로 저장된다(ADR-003).
> `users.password_reset_otps`(013): 비밀번호 재설정 OTP — email·otpHash(SHA-256)·expiresAt·consumedAt·attempts·createdAt, `@@index([email, createdAt desc])`. OTP 평문 미저장(해시만). attempts 5회 초과 시 consumed 처리(SEC-001 브루트포스 차단).
> `users.social_accounts`(014): 소셜 계정 연동 — provider·providerId·userId·email·createdAt, `@@unique([provider, providerId])`·`@@index([userId])`·FK onDelete Cascade·`@@schema("users")`(마이그레이션 `20260701064209_add_social_accounts`). `users.users.password: String → String?`(ADR-005) — 소셜 전용 사용자(비밀번호 없음) 허용, 이메일+비밀번호 로그인 시 null 가드. **로그인 가능 provider(`SUPPORTED_PROVIDERS`): 카카오·구글·네이버 3종**. **email 자동연동(`AUTO_LINK_PROVIDERS`) 허용: 카카오·구글 2종만** — 네이버는 이메일 소유권 미검증(SEC-015-01)으로 자동연동 제외(재로그인·신규가입은 가능, 동일 이메일 요청은 409 Conflict).

> `users.oauth_states`(016): 네이버 code-exchange CSRF state — state(UNIQUE·base64url 256bit CSPRNG)·provider('naver')·expiresAt(TTL 10분)·createdAt, `@@index([expiresAt])`(만료 정리)·`@@map("oauth_states")`·`@@schema("users")`(마이그레이션 `20260703070000_add_oauth_states`). **FK 없음** — 익명 발급(로그인 이전, userId 미결정) 독립 엔티티. 1회성 소비는 조건부 `deleteMany`(row-level lock)로 원자화(ADR-003, replay 방어). 감사·PII 아님(delete-on-consume, consumedAt 미보유).

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
| ~~file 메타 소유권·입력 검증 부재 (SEC-FIND-006-01/02·GAP-006-02)~~ | **RESOLVED (011-file-security)** — `GET /files/:id` 소유자 전용(403), presign contentType allowlist(이미지 4종, 그 외 400), `POST /files/:id/confirm` PENDING→UPLOADED+size(멱등, size≤10MiB). 잔여(범위 외): confirm size 는 클라이언트 신뢰값 — 실 R2 HEAD 교차검증은 후속 | `file` | 011 |
| 마이그레이션 드리프트 (GAP-005-03, **수용/accepted**) | 005 마이그레이션 SQL 에 004(coupons·reviews) 테이블 생성 동반 캡처(004 모델이 schema 엔 있었으나 별도 마이그레이션 부재). **결정(2026-06-29)**: 그대로 둠 — `migrate deploy` 는 순서대로 전부 생성하여 정상 동작하고 `migrate status` up-to-date. 적용된 폴더 분할/개명은 `_prisma_migrations` 기록과 어긋나 환경을 깨뜨릴 위험이 라벨 불일치(cosmetic)보다 큼. 운영 배포 직전 필요 시에만 전체 squash 리셋 재검토 | `prisma/migrations` | 005 |
| ~~admin audit log 부재 (GAP-007-01)~~ | **RESOLVED (013-admin-audit-log)** — admin_audit_logs(append-only) + 판매자 승인 시 SELLER_APPROVE 기록 + `GET /admin/audit-logs`. 잔여(범위 외): 감사 대상이 승인 1종 — banner CRUD 등 추가 mutation 감사·기록 실패 격리는 후속. OBS-007-01(승인 라우트 이중 표면)은 유지(운영 라우트 일원화 후속 검토) | `admin` | 013 |
| ~~inventory 재고입고 소유권 미검증 (SEC-002)~~ | **RESOLVED (003-commerce)** — `assertSellerOwnsVariant`(variantId→product→seller 소유권 검증)를 inventory stock-in·getStock 에 적용 | `inventory`·`product` | 003-commerce FR-050/051 |
| cross-schema plain String 참조 (P-001·ADR-001) | users·products 스키마 간 FK 없음. Wishlist/ProductView.productId·Product.sellerId·InventoryLog.variantId 등 plain String 참조 → DB 수준 참조 무결성 없음(의도적), 삭제 시 고아 레코드 가능 — 위시리스트·최근 본 상품 조회 응답은 `productAvailable:false` 표시로 고아 참조를 **응답 레벨에서 흡수**(017 FR-012·ADR-007, `getPublicSummaries` ACTIVE/OUT_OF_STOCK 필터 미조회 시 항목 유지+표시). 스키마 레벨 참조 무결성 부재 자체는 잔존 | users·products 스키마 | 002-catalog·017 |
| ~~cursor 목록 API @Query 파라미터 DTO 미검증 (SEC-017-01, Low·비블로킹)~~ | **RESOLVED (019-security-quality-followups)** — 신규 공유 `ListQueryDto`/`AdminSellerListQueryDto`(class-validator)로 4개 엔드포인트(`admin/sellers/pending`·`admin/users`·`admin/audit-logs`·`sellers/me/products`) 전환, 수동 `parseInt` 전건 제거. `limit=abc` 등 비정수 입력 400 반환(SC-001~006 검증) | admin·seller·product 목록 컨트롤러 공통 | 017 발견 / 007 기원 / 019 해소 |
| pino-pretty 미설치 | 로컬 `NODE_ENV=development` 에서 pino-pretty transport 모듈 오류. e2e 는 `NODE_ENV=production`(JSON 로그) 우회 중. 해소: `pnpm add -D pino-pretty --filter backend` | `apps/backend` 로컬 dev 로그 | 001-skeleton-bootstrap |
| 검색 성능 한계 | PostgreSQL tsvector/pg_trgm은 OpenSearch 대비 성능·기능 열위. 트래픽 증가 시 Meilisearch 도입 필요 | `search` 모듈 | — |
| 단일 DB 단일 장애점 | Fly Postgres 단일 인스턴스. HA 옵션 미설정 시 장애 시 다운타임 발생 | 전체 | — |
| 이메일 알림 제공자 미결정 | notification 모듈의 이메일 발송 SaaS(Resend·Mailgun 등) 미선정 | `notification` 모듈 | [TBD] |
| 비용 추정 불확실 | 실제 트래픽·데이터 크기에 따라 Fly Postgres 요금 재산정 필요 | 인프라 | — |
| ~~소셜 신규가입 경로 orphan user 위험 (SEC-002/GAP-014-01, Medium)~~ | **RESOLVED (018-auth-security-hardening)** — path 3c 를 `runInTransaction` 으로 원자화(createUser+createSocialAccount 양쪽 롤백), P2002 폴백은 트랜잭션 외부 유지(SC-011 회귀 방지) | `auth` 모듈 | 014·018 |
| ~~소셜 로그인 아웃바운드 rate limit 부재 (SEC-004/GAP-014-06, Low)~~ | **RESOLVED (018)** — `@nestjs/throttler` 계층형 도입: social-login 10/60s·naver/state 20/60s `@Throttle` + 전역 20/60s 기본값(무효 토큰 대량 전송·oauth_states flooding 완화) | `auth` 모듈·운영 | 014·015·016·018 |
| 네이버 자동연동 이메일 소유권 미검증 (SEC-015-01, High → 자동연동 제외로 RESOLVED) | 네이버는 code-exchange 로 앱바인딩은 확보하나 프로필 email 소유권 검증 수단이 없다(구글 `email_verified` 대비 부재). 이메일 자동연동 시 공격자가 네이버 프로필 이메일을 victim 값으로 설정→로그인하면 계정 탈취 가능. 완화: `AUTO_LINK_PROVIDERS` 에서 네이버 제외(카카오·구글만). 재도입 시 서버측 이메일 소유권 검증(인증 링크 등) 필수 | `auth` 모듈 | 015-naver-code-exchange |
| ~~네이버 state(CSRF) 서버측 미검증 (SEC-015-02, Medium)~~ **RESOLVED (016)** | 서버측 state 발급(`OAuthStateService`, randomBytes(32) CSPRNG)·verify 이전 검증·원자적 delete-on-consume(row-level lock replay 방어)으로 원 위협모델(클라이언트 값 pass-through 미검증) 완전 제거. 잔존은 네이티브 앱의 `POST /auth/naver/state` 호출 배선(운영 셋업)만 | `auth` 모듈 | 016-naver-state-redirect-hardening |
| 네이버 redirect_uri — **코드레벨 RESOLVED (016)** / 잔존-권고(운영 확인 대기) (SEC-015-03, Low) | `NAVER_REDIRECT_URI` optional 조회·조건부 포함(fail-safe) 구현. 네이버 공식 문서상 실제 요구 여부는 `[TO-VERIFY]`(운영 셋업 범위). 완전 해소는 운영 크레덴셜 등록·공식 문서 확인 시점 | `auth` 모듈·운영 | 016-naver-state-redirect-hardening |
| ~~auth reset-password IP rate limit 부재 (SEC-002/GAP-013-09, Medium)~~ | **RESOLVED (018)** — forgot-password 5/60s·find-email 5/60s·reset-password 10/60s 개별 `@Throttle` IP rate limit(Fly-Client-IP 트래킹) 적용 | `auth` 모듈 | 013·018 |
| ~~resetPassword refresh token revoke 비원자 (SEC-003/GAP-013-10, Medium)~~ | **RESOLVED (018)** — `revokeAllRefreshTokensByUser` tx-aware 전환 + `resetPassword` 가 markOtpConsumed+revoke 를 단일 `runInTransaction` 통합(서버 비정상 종료 시 세션 미폐기 방지) | `auth` 모듈 | 013·018 |
| ~~auth 보안 감사 로그 부재 (SEC-004/GAP-013-11, Medium)~~ | **RESOLVED (018)** — `SecurityAuditLogger` 3종(otpVerificationFailed·rateLimitExceeded·findEmailAccessed) WARN 로깅 + maskEmail/maskPhone 마스킹, best-effort 내부 try/catch | `auth` 모듈·운영 | 013·018 |
| rate limit IP 트래킹의 클라이언트 헤더 신뢰 미검증 (SEC-018-01, Medium) | `resolveClientIp` 가 `Fly-Client-IP`→`X-Forwarded-For`→`req.ip` 순으로 `req.headers` 를 원시 신뢰하며, 이 값이 Fly 엣지 프록시에 의해 항상 재기입됨을 코드/공식문서로 확증하지 않았다(`main.ts` `trust proxy:1` 은 `req.ip` 계산에만 영향, 원시 헤더 접근과 무관). 미확증 시 (a) 임의 XFF 회전으로 rate limit 우회, (b) 피해자 IP 위조 poisoning 가능 — 완화 견고성 한정 이슈(rate limit 인프라 자체는 정상). 검증: PROC-014 #1(헤더 스푸핑 시도) + infra.md §8 Fly-Client-IP 재기입 공식문서 근거 확보 | `shared/security/client-ip.util.ts`·`main.ts`·운영 | 018 |
| ~~find-email 감사 로그 실패 케이스 미커버 (SEC-018-02, Low)~~ | **RESOLVED (019)** — `SecurityAuditLogger.findEmailNotFound` 신규(기존 3종과 동일 best-effort try/catch, `maskPhone` 마스킹) — `findEmail` 404 분기(NotFoundException 이전)에서 호출, enumeration 시도 탐지 사각 해소 | `auth` 모듈·운영 | 018 발견 / 019 해소 |
| ~~pino 요청 로그 redact 미설정 (SEC-018-03, Informational)~~ | **RESOLVED (019)** — `LoggerModule.forRoot({ pinoHttp })` 에 `redact: ['req.headers.authorization', 'req.headers.cookie']` 추가, HTTP 로그 JWT/쿠키 평문 노출 차단 | `app.module.ts` 로깅·운영 | 011(기원)·018(관찰)·019(해소) |
| `/auth/login`·`/auth/forgot-password` rate-limit 과 순차-다회 요청 e2e 의 구조적 충돌 (GAP-019-05, Low) | `test/auth.e2e-spec.ts::SC-027`(50회 로그인 P95)·`test/auth-recovery.e2e-spec.ts::SC-017`(forgot-password)가 `THROTTLE_DEFAULT_LIMIT=20/60s`·`THROTTLE_FORGOT_PASSWORD_LIMIT=5/60s`(NFR-001/003 의도 동작)와 산술 충돌해 전체 `--runInBand` 스위트에서 상시 FAIL. production 정상(회귀 아님) — `@SkipThrottle()` 부여는 보안 원칙 위반이라 해소 불가, 해소 경로는 테스트 하네스 재설계(quota 격리/리셋) | `test/auth.e2e-spec.ts`·`test/auth-recovery.e2e-spec.ts` | 019 발견 |

---

## 7. 갱신 이력

| 날짜 | 갱신 내용 | 관련 spec |
|---|---|---|
| 2026-06-29 | 008~013 후속 보강 — 추적 백로그 전부 소진. 정산 멱등성·알림 이벤트 연동·쿠폰 할인값 검증·파일 보안·정산 completedAt·관리자 감사 로그. 30테이블, unit 255. §6 제약 대부분 RESOLVED(GAP-005-03만 accepted) | 008~013 |
| 2026-07-01 | v1.1.0/013-flutter-customer-phase2 — auth 비밀번호 재설정 OTP·이메일 찾기(마스킹)·MailerPort(SMTP/nodemailer)·`GET /auth/me` name·`password_reset_otps` 신규(31테이블·14차)·OTP 브루트포스 차단(SEC-001). §2 auth·MailerPort·§4 데이터모델·§6 Medium 보안부채 3종(SEC-002~004) 등재 | 013-flutter-customer-phase2 |
| 2026-07-02 | v1.1.0/014-social-login — 소셜 로그인(카카오·구글, 클라이언트 토큰 검증·SocialProviderPort/Resolver·계정해석 3단계 자동연동)·`social_accounts` 신규(32테이블·15차)·`User.password` nullable. Naver 는 SEC-001(앱바인딩 검증 부재)로 완전 제외(별도 spec 이월). §2 auth·social/·§4 데이터모델·§6 SEC-002/004 등재 | 014-social-login |
| 2026-07-03 | v1.1.0/015-naver-code-exchange — 네이버 소셜 로그인 재도입(code-exchange: client_secret 서버 교환). 로그인 3종 활성(`SUPPORTED_PROVIDERS`)·자동연동은 카카오·구글 2종(`AUTO_LINK_PROVIDERS`, 네이버는 SEC-015-01 이메일 소유권 미검증으로 제외). DB 스키마 무변경(social_accounts 재사용). §2 auth·social/·§4 데이터모델·§6 SEC-015-01/02/03 등재 | 015-naver-code-exchange |
| 2026-07-03 | v1.1.0/016-naver-state-redirect-hardening — 네이버 code-exchange CSRF state 서버측 하드닝. `POST /auth/naver/state`(익명 발급)·`OAuthStateService`·`users.oauth_states` 신규(33테이블·16차)·verify 이전 state 검증·redirect_uri 조건부(NAVER_REDIRECT_URI). SEC-015-02 RESOLVED·SEC-015-03 코드 RESOLVED/잔존. §2 auth·§4·§6·§7 갱신 | 016-naver-state-redirect-hardening |
| 2026-07-05 | v1.1.0/019-security-quality-followups — 목록 조회 Query DTO 검증(SEC-017-01 RESOLVED)·find-email enumeration 감사로그(SEC-018-02 RESOLVED)·pino JWT/쿠키 redact(SEC-018-03 RESOLVED)·복합 인덱스(Product/Seller). 사이클 중 003/018 사전결함 2건 통합 수정(GAP-019-03 PrismaService.tx delegate 복원·GAP-019-04 GET 목록 rate-limit 예외). GAP-019-05(auth POST rate-limit vs 순차-다회 e2e 산술충돌, Low) known-limitation 등재. 테스트 카운트 갱신(unit 404·static 60·e2e 125/127). §1·§6·§7 갱신 | 019-security-quality-followups |
| 2026-06-29 | 005·006·007 반영 — 18개 도메인 전부 실구현(배송·정산·검색·알림·파일·배너·통계·운영), 29테이블. notifications 위치 정정(admin→users), file R2 Port+stub 정정, §6 신규 제약(SEC-FIND-005-01·006-01/02, GAP-005-03·006-01/02·007-01, OBS-007-01) 추가 | 005-shipping-settlement, 006-search-notification-file, 007-banner-stats-admin |
| (이전) | 001~004 골격·카탈로그·거래·리뷰쿠폰 | 001~004 |
