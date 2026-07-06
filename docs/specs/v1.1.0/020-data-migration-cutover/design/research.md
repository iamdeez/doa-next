---
작성: Design Agent
버전: v1.0
최종 수정: 2026-07-05 21:35
상태: 확정
---

# Research: 020-data-migration-cutover

## 목차

- [분석 범위 게이트 결과](#분석-범위-게이트-결과)
- [기존 코드베이스 분석](#기존-코드베이스-분석)
  - [타깃 스키마 실측 — 33테이블 전수 인벤토리](#타깃-스키마-실측--33테이블-전수-인벤토리)
  - [델타 캡처 per-table 분류 (ADR-004 3분기 실측 근거)](#델타-캡처-per-table-분류-adr-004-3분기-실측-근거)
  - [금전 필드 인벤토리 (S4-b 합계 대조 대상)](#금전-필드-인벤토리-s4-b-합계-대조-대상)
  - [교차 참조 인벤토리 (S4-4 anti-join 대상)](#교차-참조-인벤토리-s4-4-anti-join-대상)
  - [로드 위상 순서 검증 (ADR-005)](#로드-위상-순서-검증-adr-005)
- [영향 범위 분석](#영향-범위-분석)
- [§F production 시그니처 변경 — 호출 측 식별 (PROC-001)](#f-production-시그니처-변경--호출-측-식별-proc-001)
- [외부 도구 실제 동작 확인](#외부-도구-실제-동작-확인)
- [인정되는 한계 및 안전망 (PATCH-A07)](#인정되는-한계-및-안전망-patch-a07)
- [배포 환경 영향 추정 (PATCH-A10)](#배포-환경-영향-추정-patch-a10)
- [context.md 부정합 사전 점검 (PATCH-A11)](#contextmd-부정합-사전-점검-patch-a11)
- [기술 선택 조사](#기술-선택-조사)
- [엣지 케이스 및 한계](#엣지-케이스-및-한계)
- [DB Design Agent 위임 계약](#db-design-agent-위임-계약)

---

## 분석 범위 게이트 결과

> 03-design.md "분석 우선순위 게이트" 적용 — plan.md 핵심 설계의 변경 대상에만 분석을 한정.

- **변경 대상(신규 산출물)**: 이관 러너 스크립트(`scripts/migration/`)·매핑 명세(DB Design)·검증 하네스 SQL·컷오버 런북·사전평가 리포트. **기존 앱 코드 무변경**(P-007), **`schema.prisma` 무변경**(타깃 33테이블 이미 존재).
- **§A(계층 구조)**: 이관 러너는 NestJS 도메인 모듈 상속 트리 밖의 out-of-band 도구 → 앱 클래스 계층 분석 비해당. 대신 **타깃 스키마 33테이블 구조 실측**이 핵심(아래).
- **§B(API 영향)**: 앱 HTTP API 신설·변경 0건. §F 로 별도 확인(결론: 앱 production 시그니처 변경 0).
- **§C(동시성)**: 이관 러너는 단일 실행 주체(ASM-011)의 순차 실행. UPSERT 멱등(ADR-004)으로 재시도 안전. 앱 런타임 공유상태와 무관(러너는 raw node-postgres/psql — NestJS `PrismaService` ALS tx 경로 미사용). 상세 [엣지 케이스](#엣지-케이스-및-한계).
- **§D(다단계 병렬)**: plan.md 는 Extract→Load→Transform→Verify 4단계를 정의하나 **재시도 stateful buffer 재사용**이 아니라 스테이징 영속 + UPSERT 멱등으로 재시도를 흡수한다(§D 2-stage 분리 트리거 비해당). 단계 분리 목적은 "네트워크 바운드 추출을 윈도우 밖으로 이동"(plan S1)이며 병렬화가 아님 → §D 심화 분석 생략.
- **§E(동일 가드 통합)**: 이관은 조건 분기 결정 로직이 아니라 데이터 매핑이므로 비해당.
- **§F(시그니처 변경)**: plan.md 는 앱 production 메서드 시그니처 변경을 명시하지 않으나, 팀리드 지시로 **앱 점검모드 503 훅 in-scope 여부**를 확인 → [아래 §F](#f-production-시그니처-변경--호출-측-식별-proc-001).
- **외부 라이브러리**: 신규 npm 의존성 0(표준 `pg_dump`/`psql`/`COPY` CLI + 기존 전이의존 `pg`). 신규 라이브러리 API 검증 비해당. 표준 PostgreSQL 도구 동작만 [외부 도구 실제 동작](#외부-도구-실제-동작-확인) 에서 확인.

---

## 기존 코드베이스 분석

> context.md §2(핵심 모듈)·§4(데이터 모델) 를 기준선으로 참조. 본 절은 **이관 관점의 타깃 스키마 실측**(context.md 미기재 per-table timestamp/mutability 인벤토리)을 산출한다.

### 타깃 스키마 실측 — 33테이블 전수 인벤토리

`apps/backend/prisma/schema.prisma`(전문 실측) 기준. 각 테이블의 **timestamp 컬럼**·**변경(mutation) 프로파일**·**동일 스키마 FK 자식**을 산출. 이관 델타 전략(ADR-004)·로드 순서(ADR-005)·검증(S4)의 근거다.

| # | 스키마 | 테이블(@@map) | 모델 | timestamp 컬럼 | 변경 프로파일 | 동일 스키마 FK(자식) |
|---|---|---|---|---|---|---|
| 1 | users | users | User | `createdAt` | UPDATE(name·phone·password·email) | refresh_tokens·social_accounts·sellers·addresses·wishlists·product_views |
| 2 | users | social_accounts | SocialAccount | `createdAt` | INSERT 위주(+user Cascade delete) | — (users 자식) |
| 3 | users | refresh_tokens | RefreshToken | `createdAt`·`expiresAt` | **UPDATE(revoked flip)**·INSERT·만료 | — (users 자식) |
| 4 | users | sellers | Seller | `createdAt` | UPDATE(status·rejectReason·프로필) | — (users 자식) |
| 5 | users | addresses | Address | `createdAt` | UPDATE(isDefault·필드)·INSERT·DELETE | — (users 자식) |
| 6 | users | wishlists | Wishlist | `createdAt` | INSERT+**DELETE**(찜 해제), UPDATE 없음 | — (users 자식) |
| 7 | users | product_views | ProductView | `viewedAt` | **UPSERT(viewedAt 갱신)** | — (users 자식) |
| 8 | users | password_reset_otps | PasswordResetOtp | `createdAt`·`expiresAt`·`consumedAt` | UPDATE(consumedAt·attempts), TTL 10분 ephemeral | — |
| 9 | users | oauth_states | OAuthState | `createdAt`·`expiresAt` | INSERT+**delete-on-consume**, TTL 10분 ephemeral | — |
| 10 | users | notifications | Notification | `createdAt` | UPDATE(isRead flip) | — |
| 11 | products | categories | Category | **없음** | seed(8건)·거의 정적 | products |
| 12 | products | products | Product | `createdAt` | UPDATE(status·price·title·description) | product_images·variants·inventories |
| 13 | products | product_images | ProductImage | **없음** | INSERT+DELETE·displayOrder UPDATE | — (products 자식) |
| 14 | products | variants | Variant | **없음** | UPDATE(price)·INSERT | inventory |
| 15 | products | inventory | Inventory | **없음** | **UPDATE(quantity) 빈번** | — (variant 자식) |
| 16 | products | inventory_logs | InventoryLog | `createdAt` | **append-only**(FR-032) | — |
| 17 | commerce | carts | Cart | `createdAt`·**`updatedAt`** | UPDATE(items JSON) | — |
| 18 | commerce | coupons | Coupon | `createdAt` | UPDATE(issuedCount increment) | user_coupons |
| 19 | commerce | user_coupons | UserCoupon | `createdAt` | UPDATE(status unused→used·usedOrderId) | — (coupons 자식) |
| 20 | commerce | reviews | Review | `createdAt`·**`updatedAt`** | UPDATE(content·rating 수정) | — |
| 21 | orders | orders | Order | `createdAt`·`deliveredAt`·`completedAt` | **UPDATE(status 전이·deliveredAt·completedAt)** | order_items·order_events |
| 22 | orders | order_items | OrderItem | **없음** | INSERT(불변 스냅샷) | — (orders 자식) |
| 23 | orders | order_events | OrderEvent | `createdAt` | **append-only**(FR-028) | — (orders 자식) |
| 24 | orders | shipments | Shipment | `createdAt`·`shippedAt`·`deliveredAt` | UPDATE(status·shippedAt·deliveredAt) | shipment_tracking |
| 25 | orders | shipment_tracking | ShipmentTracking | `occurredAt` | **append-only** | — (shipment 자식) |
| 26 | payments | payments | Payment | `createdAt` | **UPDATE(status·pgTransactionId·failureReason)** | refunds·payment_outbox |
| 27 | payments | refunds | Refund | `createdAt` | UPDATE(status)·INSERT | — (payment 자식) |
| 28 | payments | payment_outbox | PaymentOutbox | `createdAt`·`processedAt` | UPDATE(status pending→processed). **컷오버 전 pending=0 드레인**(ADR-008) | — (payment 자식) |
| 29 | settlements | settlements | Settlement | `createdAt` | UPDATE(status pending→completed) | settlement_items |
| 30 | settlements | settlement_items | SettlementItem | **없음** | INSERT(불변) | — (settlement 자식) |
| 31 | admin | banners | Banner | `createdAt` | UPDATE(isActive·필드·sortOrder) | — |
| 32 | admin | admin_audit_logs | AdminAuditLog | `createdAt` | **append-only**(013) | — |
| 33 | files | file_assets | FileAsset | `createdAt` | UPDATE(status PENDING→UPLOADED·size). **메타만**(FR-017) | — |

### 델타 캡처 per-table 분류 (ADR-004 3분기 실측 근거)

위 인벤토리로 plan.md ADR-004 의 3분기를 **per-table 확정**한다. (레거시 소스 컬럼은 [TO-VERIFY] — DB Design 매핑 명세에서 레거시측 대응 timestamp 를 실측 확정. 아래는 **타깃 기준 mutability**로 최소 델타 요건을 산정.)

| 부류 | 정의 | 타깃 테이블 | 델타 방식 |
|---|---|---|---|
| **(A) append-only** | INSERT 만·UPDATE/DELETE 없음 | inventory_logs·order_events·shipment_tracking·admin_audit_logs·social_accounts | `createdAt` 워터마크 증분(사전복사 이후 신규 행) |
| **(A′) append-only + timestamp 부재** | INSERT 불변이나 자체 timestamp 없음 | order_items·settlement_items | **부모 join 증분**(order/settlement `createdAt` 기준) 또는 부모와 함께 full re-copy. **id 워터마크 불가**(cuid 비단조 — [엣지](#엣지-케이스-및-한계) 참조) |
| **(B) 갱신형 + 갱신 timestamp 보유** | UPDATE 있고 갱신 시각 컬럼 존재 | carts(`updatedAt`)·reviews(`updatedAt`)·product_views(`viewedAt`) | 갱신 timestamp 워터마크 증분 |
| **(C) 갱신형 + 갱신 timestamp 부재** | UPDATE 있으나 `updatedAt` 미보유 → 증분 캡처 불가 | users·sellers·addresses·products·coupons·user_coupons·orders·payments·refunds·settlements·banners·file_assets·notifications·shipments·refresh_tokens | **윈도우 내 full re-copy**(스테이징 truncate+재적재→재변환) |
| **(C″) timestamp 완전 부재 + 갱신형** | timestamp 컬럼 자체가 없어 증분 원천 불가 | categories·product_images·variants·inventory | **full re-copy 강제**(다른 선택지 없음). categories 는 seed(소량) |
| **(E) ephemeral(migrate-vs-reissue 미결)** | TTL 짧음·세션/CSRF/OTP 성격 | refresh_tokens·password_reset_otps·oauth_states·payment_outbox(pending) | **정책 미결 → GAP-020-01**. 스킵·재발급 권고안 포함, DB Design 매핑 명세가 확정 |

**핵심 발견(60분 윈도우 최대 변수)**:

1. **6개 테이블은 timestamp 컬럼이 전혀 없다**(categories·product_images·variants·inventory·order_items·settlement_items) → 증분 델타 불가, **full re-copy 강제**. 이 중 `inventory`(variant 당 1행, quantity 빈번 갱신)·`variants`·`product_images` 는 상품 수에 비례하여 대량일 수 있다 → 사전평가(FR-011) 필수 측정 대상.
2. **(C)+(C″) full re-copy 총량이 윈도우 예산의 지배 변수**다. 대형 예상 테이블: `users`·`products`·`variants`·`inventory`·`orders`·`order_items`·`payments`. 이들의 합산 행수·용량이 NFR-005(검증·GO 판단 T+50분) 안전마진을 위협하면 **FR-012 사용자 재확인**(부분 사전이관 fallback — plan PATCH-A06 ASM-001).
3. **cuid PK 는 시간 단조(monotonic)가 아니다** → append-only 델타에 `id > watermark` 증분을 쓸 수 없다. 반드시 `createdAt` 기준. `order_items`·`settlement_items` 는 createdAt 조차 없어 **부모(order/settlement) 기준 join 증분**이 유일 경로(또는 부모와 동반 full re-copy). — DB Design 변환 SQL 에 이 제약 명시 필요.
4. **삭제(hard delete) 미탐지**: (A)·(A′)·(B) 증분은 삭제를 못 잡는다(wishlists·addresses 는 DELETE 발생). 안전망 = **S4-a 레코드 수 대조(NFR-002 불일치 0건)** NO-GO 게이트. (C)/(C″) full re-copy 는 삭제를 자연 반영.

### 금전 필드 인벤토리 (S4-b 합계 대조 대상)

전부 `Decimal(12,2)`(P-005 — byte-exact 복사, 부동소수점 미개입). **SC-006 필수 3종**과 **확장 대조 대상**을 구분.

| 등급 | 스키마.테이블.컬럼 |
|---|---|
| **SC-006 필수** | `orders.orders.totalAmount` · `payments.payments.amount` · `settlements.settlements.payoutAmount` |
| 확장(권고) | `orders.orders.discountAmount` · `orders.order_items.unitPrice`(×quantity) · `payments.refunds.amount` · `settlements.settlements.totalSales`·`commission` · `settlements.settlement_items.saleAmount`·`commissionAmount` · `products.products.price` · `products.variants.price` · `commerce.coupons.discountValue`·`maxDiscountAmount`·`minOrderAmount` |

> 합계 대조는 `SUM(col)` 을 `Decimal` 그대로 비교(NFR-003 오차 0원). 비-1:1(병합) 테이블은 매핑 명세의 "대응 소스 집합" 기준 기대식(FR-010).

### 교차 참조 인벤토리 (S4-4 anti-join 대상)

신규 시스템은 cross-schema/cross-module 참조를 **plain String(FK 미선언, P-001·context.md §6)** 으로 둔다 → DB 가 참조 무결성을 강제하지 않으므로 **anti-join 이 유일한 무결성 게이트**(SC-016).

**SC-016 핵심(orders·payments·settlements 강결합)**:

| 참조 | 소스 컬럼 | 타깃 | 종류 |
|---|---|---|---|
| 결제→주문 | `payments.payments.orderId` | `orders.orders.id` | cross-schema plain String |
| 환불→결제 | `payments.refunds.paymentId` | `payments.payments.id` | **동일 스키마 FK(실 제약)** |
| 정산항목→주문항목 | `settlements.settlement_items.orderItemId` | `orders.order_items.id` | cross-schema plain String(@unique) |
| 정산항목→주문 | `settlements.settlement_items.orderId` | `orders.orders.id` | cross-schema plain String |
| 정산→판매자 | `settlements.settlements.sellerId` | `users.sellers.id` | cross-schema plain String |
| 주문항목→주문 | `orders.order_items.orderId` | `orders.orders.id` | 동일 스키마 FK(실 제약) |

**확장 anti-join(권고, 전 스키마 논리 무결성)**: `order_items.{variantId→products.variants, productId→products.products, sellerId→users.sellers}` · `reviews.{orderItemId→order_items, orderId→orders, userId→users, productId→products, sellerId→sellers}` · `user_coupons.{userId→users, usedOrderId→orders}` · `coupons.issuerId→{users.users|users.sellers}` · `wishlists.productId`·`product_views.productId→products.products` · `carts.userId`·`notifications.userId`·`file_assets.ownerId→users.users` · `shipments.orderId→orders.orders` · `inventory_logs.{variantId·productId→products}`.

### 로드 위상 순서 검증 (ADR-005)

ADR-005 순서: `users→products→commerce→orders→payments→settlements→admin→files`.

**검증 결과(schema.prisma 실측)**:
- **동일 스키마 FK(실 제약)는 스키마 내부 순서가 강제**된다: categories→products→variants→inventory / products→product_images·inventory_logs(plain) / orders→order_items·order_events / shipments→shipment_tracking / payments→refunds·payment_outbox / settlements→settlement_items / coupons→user_coupons / users→(refresh_tokens·social_accounts·sellers·addresses·wishlists·product_views). 변환 SQL 은 이 부모→자식 순서를 준수해야 한다(FK violation 방지).
- **cross-schema 참조는 plain String(FK 미강제)** 이므로 스키마 간 로드 순서가 무결성을 깨지 않는다. 예: `commerce.reviews.orderItemId→orders.order_items`, `commerce.user_coupons.usedOrderId→orders.orders` 는 commerce 를 orders **이전**에 로드해도(ADR-005 순서상 commerce<orders) DB 오류 없음 — **cross-schema FK 부재로 forward reference 가 허용**된다.
- **결론**: ADR-005 위상 순서는 (a) 동일 스키마 FK 부모-우선, (b) 운영 가독성 목적이며, cross-schema 논리 무결성은 **로드 시점이 아니라 로드 완료 후 S4-4 anti-join** 으로 검증한다(orphan 0 게이트). 이 설계 발견은 변환 SQL 순서 제약을 "스키마 내부 FK 순서 준수 + 스키마 간은 anti-join 사후 검증"으로 명확화한다.

---

## 영향 범위 분석

| 파일/디렉토리(예정) | 변경 유형 | 영향 내용 | 소유 |
|---|---|---|---|
| `scripts/migration/` (신규 디렉토리, repo root) | 신규 | 추출·스테이징 로드·변환 UPSERT·델타·검증 하네스 SQL + 러너 오케스트레이션. 앱 빌드 대상 밖(out-of-band, P-007) | Development(4) B·C |
| `scripts/migration/RUNBOOK.md` | 신규 | FR-013 컷오버 런북(단계·담당자·체크포인트·롤백 트리거·D-3 공지·PoNR·재확인) | Development(4) C |
| `scripts/migration/PRE-ASSESSMENT.md` | 신규 | FR-011 사전평가 리포트 템플릿(테이블별 행수·용량·예상소요·여유율) | Development(4) C |
| `db-design/mapping-spec.md` | 신규 | FR-009/010 레거시↔신규 필드 단위 매핑표 + 비-1:1 변환 규칙 + per-table 델타 분류 확정 | **DB Design Agent** A |
| `db-design/data-model.md` | 신규 | `migration_staging` 스키마 DDL(레거시 raw + `verification_runs` 감사 테이블) | **DB Design Agent** A |
| `apps/backend/test/static/*.spec.ts`(신규) | 신규 | 정적 검증(런북·매핑·sslmode 설정 완결성 파싱) | Test(5a AUTHORING) D |
| `apps/backend/prisma/schema.prisma` | **무변경** | 타깃 33테이블 이미 존재. 이관은 데이터만 | — |
| 기존 18개 도메인 모듈·`PrismaService` | **무변경** | 앱 런타임 코드 변경 0(P-007). 러너는 앱 코드 미참조 | — |

> `migration_staging`·`verification_runs` 는 **Prisma 마이그레이션이 아니다**(러너가 생성·컷오버 후 DROP 하는 임시 객체). 019 A-layer(schema.prisma 인덱스=Prisma 마이그레이션)와 달리, 본 spec 의 A-layer 는 **러너 실행 시점 raw SQL DDL**이다 → `schema.prisma`·`_prisma_migrations` 무관(GAP-005-03 드리프트와 무영향).

---

## §F production 시그니처 변경 — 호출 측 식별 (PROC-001)

> 팀리드 지시: 앱 점검모드 503(ADR-003)이 기존 앱에 어떤 훅을 요구하는지 in-scope 여부 점검.

- **변경되는 앱 production 메서드**: **0건**. 본 spec 은 신규 마이그레이션 도구(`scripts/migration/`)·런북 신설이 주이며, NestJS 도메인 모듈·`PrismaService`·컨트롤러 시그니처를 변경하지 않는다(P-007, plan 영향 파일 "무변경").
- **FR-003 쓰기 차단(503 점검모드)의 대상 = 레거시 18서비스** (신규 시스템 아님). 컷오버 시퀀스(plan S2)상 신규 시스템은 단계 5(GO)에서 **비로소 트래픽을 받으며**, 그 이전에는 실 사용자 요청이 도달하지 않는다. 따라서:
  - 레거시측 쓰기 차단 = **DB read-only(하드) + 레거시 앱 점검모드 503(UX)** — 이는 **사용자 환경(레거시 AWS)** 에서 수행되는 out-of-band 조치이며 신규 코드베이스에 훅이 필요 없다(런북 절차 항목).
  - 신규 시스템측 = GO 이전 테스트 쓰기 금지를 **런북 경고**로 다룸(premature PoNR 방지). 코드 훅 불요.
- **결론(in-scope 판정)**: 앱 점검모드 503 은 **신규 NestJS 앱의 in-scope 코드 변경을 요구하지 않는다.** 호출 측 테스트 마이그레이션 대상 0건. §F BLOCKED(SCOPE_VIOLATION) 사유 없음.
- **동적 호출 한계**: 본 결론은 신규 앱 무변경 전제. 만약 후속 논의에서 "신규 시스템 점검모드 엔드포인트"가 추가 요구되면 별도 spec(범위 외). 현 spec 은 레거시 차단으로 완결.

---

## 외부 도구 실제 동작 확인

> plan.md "외부 도구 동작 검증"과 cross-check. 표준 PostgreSQL 16 도구 동작(공식 문서 근거). 신규 npm 의존성 0.

- **논리적 복제(logical replication) = 동일 스키마 전제**: publication/subscription 은 소스·타깃 컬럼 구조 일치 요구 → 재구조화(비-1:1) 이관 불가 → ADR-001 배제(확인).
- **`pg_dump --data-only` + `COPY`**: 데이터만 추출·적재, 제약·트리거 미포함(스테이징 raw 적재에 부합). COPY 는 트랜잭션 단위 원자 적재. `--table=schema.table` 로 테이블 단위 추출 가능.
- **`\copy (SELECT ...) TO`**: 컬럼 선택·필터(델타 워터마크 `WHERE createdAt > $watermark`) 추출에 사용. 클라이언트측 스트리밍이라 대용량에 서버 슈퍼유저 권한 불요.
- **`INSERT … ON CONFLICT (id) DO UPDATE` 멱등**: 델타 재실행 시 PK 충돌을 UPDATE 로 흡수 → 재시도 안전(ADR-004). 타깃 PK = cuid(문자열) 이므로 충돌 키는 `id`.
- **`sslmode=require`(NFR-004)**: 접속 문자열/`PGSSLMODE` 환경변수로 강제. `require` 이상(verify-ca/verify-full) 은 CA 검증 추가 — 레거시 RDS 는 `require`, 타깃 Fly Postgres 도 `require` 이상 지원(ADR-009). Security Agent 감사 대상.
- **실행 위치 — Fly one-off machine(ADR-002)**: `fly machine run <image> --command ...` 또는 `fly ssh console` 로 타깃 Postgres 동일 리전 co-located 일회성 실행. 이관 종료 후 머신 폐기. **Fly 전용 API 에 이관 로직 결합 없음**(P-004) — 실행 위치만 인프라 결정, 스크립트는 표준 psql/pg 로 로컬·타 환경에서도 동일 실행.

---

## 인정되는 한계 및 안전망 (PATCH-A07)

| 한계(silent failure 가능) | 안전망 설계 |
|---|---|
| hard delete 미탐지((A)/(A′)/(B) 증분) | S4-a 레코드 수 대조(NFR-002 불일치 0건) NO-GO 게이트 |
| updatedAt 부재 대다수 테이블 → 증분 불가 | (C)/(C″) full re-copy 흡수(ADR-004). full re-copy 총량은 사전평가(FR-011)로 예산 관리 |
| cuid 비단조 → id 워터마크 무효 | append-only 델타는 `createdAt` 기준. timestamp 없는 immutable child(order_items·settlement_items)는 부모 join 증분 |
| 레거시 숨은 쓰기 경로(배치·크론) | DB read-only 하드 차단(ADR-003)으로 흡수. 앱 점검모드 단독 불충분 |
| cross-schema 참조 무결성 DB 미강제 | S4-4 anti-join(orphan 0) 유일 게이트(SC-016) |
| 실 레거시 규모·DDL 파이프라인 접근 불가 | [TO-VERIFY] 마커 + DB Design/옵션 A 사용자 실측 위임 |

---

## 배포 환경 영향 추정 (PATCH-A10)

infra.md §8 cross-reference. 컷오버 = 배포 운영이므로 영향 큼.

| 환경 특이성(infra.md §8) | 컷오버 영향 | 안전망(런북 반영) |
|---|---|---|
| Fly Postgres 단일 장애점 | 이관 중/직후 DB 장애 시 전체 다운 | **컷오버 직전 자동 백업+PITR 활성 확인** 런북 사전점검. HA 도입 자체는 범위 외(spec.md) → Deploy Agent 검토 |
| scale-to-zero 콜드 스타트 | 전환 직후 첫 요청 지연 | 컷오버 시 최소 1인스턴스 유지 설정 권고(런북) |
| pg-boss `pgboss` 스키마 CREATE 권한 | 러너 사용자도 `migration_staging` CREATE 권한 필요 | 런북 사전점검(러너 DB 사용자 CREATE 권한 확인) |
| `prisma migrate deploy`(release command) | 이관 전 타깃 마이그레이션 최신 전제 | 런북: `prisma migrate status` up-to-date 확인. GAP-005-03(accepted) 무영향(순차 생성 정상) |
| DNS/LB 트래픽 전환 전파 지연 | 단계 5 전환 지연(사후검증 시나리오 d) | 전파 확인·smoke 절차 런북 명시 → Deploy Agent |
| pg-boss OutboxRelay 유령 재발행 | 이관된 payment_outbox pending 행이 컷오버 후 재발행 | 레거시 outbox pending=0 드레인 전제(ADR-008) + 타깃 pending 0 확인 런북 체크포인트 |

---

## context.md 부정합 사전 점검 (PATCH-A11)

본 spec 은 **앱 코드·스키마 무변경**(P-007)이므로 context.md §2 핵심 모듈·§4 데이터 모델 정의를 변경하지 않는다 → 부정합 발생 항목 **없음**.

- 컷오버 실행 **완료 후**(사용자 환경) context.md §7 갱신·§6 "단일 DB 단일 장애점" 제약 재평가가 필요할 수 있으나, 이는 파이프라인 종료 후 사후 운영 추적(spec.md "사후 운영 검증 피드백 사이클")이며 본 3단계 산출물 변경 대상 아님.
- 신규 등재 후보(컷오버 완료 시): 레거시 해체 별도 spec 참조·`migration_staging` 폐기 확인 — 6단계 Docs Agent/사후 추적.

---

## 기술 선택 조사

- **스테이징 기반 ETL(ADR-001)**: pg_restore 직접 복원(비-1:1 불가)·논리 복제(동일 스키마 전제)·AWS DMS(P-002 위반) 대비, **추출→스테이징→변환 UPSERT** 가 재구조화·멱등·디버깅(원본 대조) 모두 충족. 신규 의존성 0.
- **변환 실행 = raw SQL/COPY(Prisma ORM 미사용)**: Prisma 는 타깃 스키마 SoT 로만 참조. ORM 경로는 처리량 부적합(60분 예산) + 부작용(이벤트·outbox·PG stub) 유발 → 벌크 SQL 직접.
- **러너 = 순수 node-postgres/psql, NestJS `PrismaService` 미사용**: 러너는 앱 ALS tx-aware `PrismaService`(context §2)를 사용하지 않는다 → 앱 런타임 훅·outbox relay 미개입(P-005 예외 근거와 정합). PROC-013-01(tx-aware 심볼 e2e 매핑)은 러너가 `PrismaService.tx` 를 미사용하므로 비해당.

---

## 엣지 케이스 및 한계

- **cuid PK 비단조**: `@default(cuid())` 는 시간 정렬 보장이 없다 → append-only 증분에 `WHERE id > $last` 사용 금지. 반드시 `createdAt`/`occurredAt`/`viewedAt` 워터마크. `order_items`·`settlement_items` 는 timestamp 부재 → 부모(order/settlement)의 createdAt join 으로 증분하거나 부모와 동반 full re-copy.
- **동시성**: 러너 단일 실행 주체 순차 실행(ASM-011). UPSERT 멱등(ADR-004)으로 재시도 안전. 스테이징 단일 소유 → 레이스 없음. 병렬 러너 도입 시 per-스키마 파티션 격리 필요(본 spec 미채택).
- **스테이징 생명주기**: 이관·검증 종료 후 `migration_staging` DROP. PoNR 이전엔 재시도 대비 보존, 컷오버 성공 확정(ASM-003 7일 무장애) 후 정리.
- **ephemeral 테이블 이관 정책 미결(GAP-020-01)**: refresh_tokens·password_reset_otps·oauth_states·payment_outbox(pending) 는 세션/CSRF/OTP/운영 큐 성격. 이관 시 (a) 신규 JWT secret 하 refresh token 무의미 가능, (b) TTL 10분 OTP/state 는 컷오버 시점 대부분 만료, (c) outbox pending 은 드레인(ADR-008) → **스킵·재발급 권고**. SC-005 "대상 테이블" 집합 정의에 직결 → DB Design 매핑 명세가 명시 확정 필요.
- **비-1:1 카운트 기대식**: 병합/분할 테이블은 단순 count 비교 불가 → 매핑 명세의 "대응 소스 집합" 기준 기대 카운트식(FR-010). SC-005 는 이 기대식 기준 대조.

---

## DB Design Agent 위임 계약

> 레거시 18서비스 실 DDL·행수는 파이프라인 접근 불가 → DB Design Agent 가 매핑 명세로 실측·확정. 본 research 는 **타깃 계약**(신규에서 무엇이 채워져야 하는가)을 확정하고 아래를 위임한다.

DB Design Agent(3단계 후/4단계 전) 산출물이 **확정**할 [TO-VERIFY] 항목:

1. 레거시 18서비스 각 테이블·컬럼 → 신규 33테이블 필드 단위 매핑표(FR-009, SC-011 완결성 = 33테이블 전부 최소 1회 등장).
2. 비-1:1(병합·분할·재구조화) 항목의 변환 규칙(FR-010, SC-012) — 예: variant 옵션 인라인 흡수, cross-schema plain String 재구성.
3. per-table 델타 분류 **최종 확정**(위 [분류표](#델타-캡처-per-table-분류-adr-004-3분기-실측-근거)에 레거시측 timestamp 컬럼 실측 반영).
4. **ephemeral 테이블 이관-vs-스킵 정책 확정**(GAP-020-01) → SC-005 "대상 테이블" 집합 정의.
5. `migration_staging` DDL(레거시 raw 테이블) + `verification_runs` 감사 테이블 DDL(NFR-006, SC-022).
6. 변환 UPSERT SQL 설계(위상 순서 — 스키마 내부 FK 부모-우선 준수) + S4 검증 SQL(count 기대식·Decimal sum·매핑후 sample checksum·anti-join).
7. 비-1:1 테이블 count 기대식(S4-a 대조 근거).
