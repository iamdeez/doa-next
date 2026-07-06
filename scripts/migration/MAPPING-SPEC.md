---
작성: Database Design Agent
버전: v1.0
최종 수정: 2026-07-05 21:40 (spawn 기준 — date 도구 미제공, §10/PROC-016-02)
상태: 확정
---

# Mapping Spec: 020-data-migration-cutover

> Branch: 020-data-migration-cutover | Plan: [../../docs/specs/v1.1.0/020-data-migration-cutover/planning/plan.md](../../docs/specs/v1.1.0/020-data-migration-cutover/planning/plan.md) | Research: [../../docs/specs/v1.1.0/020-data-migration-cutover/design/research.md](../../docs/specs/v1.1.0/020-data-migration-cutover/design/research.md)

## 목차

- [0. 작성 원칙 · 표기법](#0-작성-원칙--표기법)
- [1. 발견 사항 (코드 실측 — 문서 정정 필요)](#1-발견-사항-코드-실측--문서-정정-필요)
- [2. Ephemeral 테이블 이관 정책 확정 (GAP-020-01 RESOLVED)](#2-ephemeral-테이블-이관-정책-확정-gap-020-01-resolved)
- [3. SC-005 대상 테이블 집합](#3-sc-005-대상-테이블-집합)
- [4. PK 보존 전략](#4-pk-보존-전략)
- [5. Enum 값 casing 참조표](#5-enum-값-casing-참조표)
- [6. 델타 캡처 per-table 최종 분류](#6-델타-캡처-per-table-최종-분류)
- [7. 필드 단위 매핑표 (33테이블 전수)](#7-필드-단위-매핑표-33테이블-전수)
  - [7.1 users 스키마](#71-users-스키마)
  - [7.2 products 스키마](#72-products-스키마)
  - [7.3 commerce 스키마](#73-commerce-스키마)
  - [7.4 orders 스키마](#74-orders-스키마)
  - [7.5 payments 스키마](#75-payments-스키마)
  - [7.6 settlements 스키마](#76-settlements-스키마)
  - [7.7 admin 스키마](#77-admin-스키마)
  - [7.8 files 스키마](#78-files-스키마)
- [8. 비-1:1 변환 규칙 상세 (SC-012)](#8-비-11-변환-규칙-상세-sc-012)
- [9. 금전 합계 대조 대상 (SC-006)](#9-금전-합계-대조-대상-sc-006)
- [10. 교차 참조 anti-join 대상 (SC-016)](#10-교차-참조-anti-join-대상-sc-016)
- [11. SC-011 완결성 자가 검증](#11-sc-011-완결성-자가-검증)

---

## 0. 작성 원칙 · 표기법

- **타깃側**: `apps/backend/prisma/schema.prisma` 전문 실측(2026-07-05 기준, 33테이블·전 컬럼·타입·nullable·default·enum·FK) 을 유일한 근거로 사용한다. 추측 금지(constitution 정확성 원칙).
- **레거시側**: 본 파이프라인은 레거시 18서비스 실 DDL 에 접근 불가하다(spec.md "사후 검증 활동 실행 방식" 옵션 A). 레거시 셀은 `[TO-VERIFY: 레거시 <서비스>.<테이블>.<컬럼> — 사용자/오너 확인]` 마커로 표기하며, **레거시 실제 컬럼명·타입을 지어내지 않는다**.
- **레거시 서비스명 표기 관례**: spec.md·context.md 는 "레거시 18개 서비스"가 신규 18개 NestJS 모듈과 도메인 경계가 대응한다는 것만 확인 가능(1:1 서비스명 확정 아님). 본 문서는 신규 모듈명 기준 `<module>-service` 표기(예: `auth-service`·`order-service`)를 **자리표시 관례**로 사용한다 — 실제 레거시 서비스명·엔드포인트와 무관하며, 사용자가 실행 시 실제 서비스명으로 치환한다.
- **완결성 기준(SC-011)**: 신규 33테이블 전부가 본 문서에 최소 1회 등장해야 한다(스킵 대상도 "스킵 확정" 행으로 등장 — §3 참조).
- **비-1:1 표기(SC-012)**: "1:1여부" 열에 "아님"으로 표기된 모든 항목은 [§8](#8-비-11-변환-규칙-상세-sc-012)에 변환 규칙이 기재되어야 한다(누락 0).

---

## 1. 발견 사항 (코드 실측 — 문서 정정 필요)

`schema.prisma` L768-784 실측 결과, `FileAsset` 모델의 실제 테이블 매핑은 `@@map("files")`다 — 즉 **물리 테이블명은 `files.files`이며, `files.file_assets`가 아니다.** `context.md §4`("schema: files (file_assets)")·`plan.md`·`research.md`·`gaps.md`가 전부 `file_assets`로 표기하고 있어 코드-문서 불일치가 존재한다.

- **영향**: 본 문서 및 `sql/*.sql`은 **실제 물리 테이블명 `files.files`**를 사용한다(정확성 원칙 우선). `file_assets`라는 이름의 테이블은 DB에 존재하지 않으므로, 검증 SQL이 `file_assets`를 참조하면 관계 없음(relation does not exist) 오류가 발생했을 것이다.
- **후속 조치**: `context.md §4` 정정은 본 spec 산출물 범위 밖(Design/DB Design은 문서 산출물 소유자가 아님) — Docs/Retrospective 단계에서 `context.md` 갱신 시 반영 필요. gaps.md에 GAP-020-02로 기록한다(§ 참조).

---

## 2. Ephemeral 테이블 이관 정책 확정 (GAP-020-01 RESOLVED)

research.md §엣지케이스·gaps.md GAP-020-01의 4종 ephemeral 테이블에 대해 아래와 같이 **스킵**을 확정한다.

| 테이블 | 성격 | 확정 정책 | 근거 |
|---|---|---|---|
| `users.refresh_tokens` | 세션 토큰(`tokenHash` SHA-256) | **이관 스킵** | 신규 시스템은 별도 JWT secret 하에 새로 로그인하며, 레거시 refresh token 은 신규 토큰 검증 경로에서 무의미. 컷오버 후 재로그인으로 재발급 |
| `users.password_reset_otps` | TTL 10분 OTP | **이관 스킵** | 컷오버 시점 대부분 만료 상태. 미만료분도 짧은 TTL 로 재발급 비용 낮음 |
| `users.oauth_states` | TTL 10분 CSRF nonce | **이관 스킵** | 로그인 플로우 진행 중(익명) 데이터로 세션 간 연속성 없음. delete-on-consume 설계상 컷오버 시점 잔존분은 미완결 로그인 시도 |
| `payments.payment_outbox` | at-least-once relay 큐(pending→processed) | **이관 전체 스킵** | ADR-008 에 따라 컷오버 전 레거시 pending=0 드레인이 전제(런북 체크포인트). processed 이력은 relay 완료 후 소비 가치가 없는 내부 구현 디테일이므로 이력 이관도 하지 않음(단순화, 감사 필요 시 별도 아카이브로 대체 가능 — 범위 외) |

> 위 4종은 §7 매핑표에도 "스킵 확정" 행으로 등장한다(SC-011 완결성 요건 충족). `10_transform.sql`·`20_verify.sql` 은 이 4종에 대한 INSERT/count 로직을 포함하지 않는다.

---

## 3. SC-005 대상 테이블 집합

SC-005("모든 대상 테이블 레코드 수 100% 일치")의 "대상 테이블" = **신규 33테이블 - §2 스킵 4종 = 29테이블**.

대상 29테이블은 [§6 델타 분류표](#6-델타-캡처-per-table-최종-분류)·[§7 매핑표](#7-필드-단위-매핑표-33테이블-전수)의 "스킵 아님" 행 전부와 일치한다(교차 검증: 29 = 33 - 4).

---

## 4. PK 보존 전략

레거시 원본 식별자(정수 시퀀스 또는 UUID 등, 레거시 PK 타입 [TO-VERIFY])는 **문자열로 캐스팅하여 타깃 `id` 컬럼(Prisma `String @default(cuid())`)에 그대로 이관**한다. 신규 cuid 재발급을 금지한다.

- **근거**: 신규 시스템은 cross-schema 참조를 plain String(FK 미선언, P-001)으로 둔다(예: `Wishlist.productId → Product.id`). 참조하는 쪽과 참조받는 쪽이 **같은 원본 식별자**를 유지해야만 이관 후에도 논리적 참조가 끊어지지 않는다. ID 를 재발급하면 모든 cross-reference 를 별도 치환 테이블로 추적해야 하는 불필요한 복잡도가 발생한다(미채택).
- **주의**: 레거시 PK 가 서비스별로 auto-increment 정수를 사용했다면, 서로 다른 스키마 간 값 충돌은 문제되지 않는다(각 타깃 테이블은 자신의 PK 스페이스만 가짐). 단, **동일 엔티티를 가리키는 모든 cross-reference 컬럼(예: `OrderItem.productId`·`Wishlist.productId`·`ProductView.productId`)은 반드시 동일한 원본 `Product.id` 값을 사용해야 한다** — 추출(extract.sh) 단계에서 이 일관성이 깨지지 않도록 소스 조인 시 동일 원본 키를 사용한다.
- **스테이징 컬럼 타입**: 모든 staging 테이블의 `id`(및 FK 성격의 참조 컬럼)는 `TEXT`로 선언한다(레거시 PK 표현 형식 미상 — 정수/UUID 모두 수용).

---

## 5. Enum 값 casing 참조표

`schema.prisma` 실측 결과 **enum 값 casing 이 enum 타입별로 다르다**(변환 SQL 이 레거시 enum 문자열을 정규화 없이 그대로 삽입하면 CHECK 제약(Postgres enum) 위반으로 전체 INSERT 가 실패한다 — 변환 SQL 필수 점검 항목).

| Enum | 값 (실제 casing) | 사용 테이블 |
|---|---|---|
| `SellerStatus` | `PENDING`·`APPROVED`·`REJECTED` (대문자) | sellers |
| `ProductStatus` | `DRAFT`·`ACTIVE`·`OUT_OF_STOCK`·`INACTIVE` (대문자) | products |
| `InventoryLogType` | `STOCK_IN`·`DECREASE`·`INIT`·`RESTORE` (대문자) | inventory_logs |
| `CouponIssuerType` | `ADMIN`·`SELLER` (대문자) | coupons |
| `CouponType` | `FIXED`·`PERCENTAGE` (대문자) | coupons |
| `UserCouponStatus` | `unused`·`used`·`expired` (소문자) | user_coupons |
| `OrderStatus` | `pending`·`confirmed`·`preparing`·`shipped`·`delivered`·`completed`·`cancelled` (소문자) | orders |
| `ActorType` | `CUSTOMER`·`SELLER`·`ADMIN`·`SYSTEM` (대문자) | order_events |
| `ShipmentStatus` | `preparing`·`shipped`·`in_transit`·`delivered` (소문자) | shipments·shipment_tracking |
| `PaymentStatus` | `pending`·`completed`·`failed`·`refund_pending`·`refunded` (소문자) | payments |
| `SettlementStatus` | `pending`·`completed` (소문자) | settlements |
| `FilePurpose` | `PRODUCT_IMAGE`·`REVIEW_IMAGE`·`PROFILE` (대문자) | files |
| `FileStatus` | `PENDING`·`UPLOADED` (대문자) | files |
| `BannerPosition` | `MAIN_TOP`·`MAIN_MIDDLE`·`MAIN_BOTTOM`·`SIDEBAR` (대문자) | banners |
| `NotificationType` | `ORDER_PLACED`·`ORDER_SHIPPED`·`SETTLEMENT_CREATED`·`REVIEW_RECEIVED` (대문자) | notifications |

> 변환 규칙: `10_transform.sql`은 레거시 원문 enum 문자열을 `UPPER()`/`LOWER()` 정규화 후 위 표의 정확한 값과 매칭한다. 매칭 실패(신규 미정의 값) 시 해당 행을 `verification_runs`에 이상 항목으로 기록하고 변환을 중단하지 않되(파티션 실패), 검증 단계(S4-a count)에서 불일치로 드러나 NO-GO 게이트가 작동한다.

---

## 6. 델타 캡처 per-table 최종 분류

research.md 델타 분류(타깃 기준 확정)를 승계하며, 스킵 4종 제외 + 카운트 기대식을 확정한다. 레거시측 워터마크 컬럼명은 [TO-VERIFY](추출 시 사용자/오너가 `extract.sh` 파라미터로 주입).

| # | 스키마.테이블 | 부류 | 타깃 워터마크 | 카운트 기대식 |
|---|---|---|---|---|
| 1 | users.users | (C) | 없음→full re-copy | `COUNT(target)=COUNT(stg_users_users)` |
| 2 | users.social_accounts | (A) | `createdAt` | `COUNT(target)=COUNT(stg_users_social_accounts)` (레거시 대응 불명 — §7.1 주 참조, 0건 가능) |
| 3 | users.sellers | (C) | 없음→full re-copy | `COUNT(target)=COUNT(stg_users_sellers)` |
| 4 | users.addresses | (C) | 없음→full re-copy(DELETE 발생) | `COUNT(target)=COUNT(stg_users_addresses)` |
| 5 | users.wishlists | (A, but DELETE 발생) | `createdAt` (삭제 미탐지 — count 대조로 흡수) | `COUNT(target)=COUNT(stg_users_wishlists)` |
| 6 | users.product_views | (B) | `viewedAt`(UPSERT) | `COUNT(target)=COUNT(stg_users_product_views)` |
| 7 | users.notifications | (C) | 없음(isRead flip)→full re-copy | `COUNT(target)=COUNT(stg_users_notifications)` |
| 8 | products.categories | (C″) | 없음(정적 seed) | `COUNT(target)=COUNT(stg_products_categories)` |
| 9 | products.products | (C) | 없음→full re-copy | `COUNT(target)=COUNT(stg_products_products)` |
| 10 | products.product_images | (C″) | 없음→full re-copy | `COUNT(target)=COUNT(stg_products_product_images)` |
| 11 | products.variants | (C″) | 없음→full re-copy | `COUNT(target)=COUNT(stg_products_variants)` |
| 12 | products.inventory | (C″) | 없음→full re-copy(quantity 빈번) | `COUNT(target)=COUNT(stg_products_inventory)` |
| 13 | products.inventory_logs | (A) | `createdAt` | `COUNT(target)=COUNT(stg_products_inventory_logs)` |
| 14 | commerce.carts | (B, 비-1:1) | `updatedAt` | `COUNT(target)=COUNT(DISTINCT stg_commerce_cart_items.cartOwnerUserId ∪ stg_commerce_carts.userId)` — §8-1 참조 |
| 15 | commerce.coupons | (C) | 없음(issuedCount)→full re-copy | `COUNT(target)=COUNT(stg_commerce_coupons)` |
| 16 | commerce.user_coupons | (C) | 없음→full re-copy | `COUNT(target)=COUNT(stg_commerce_user_coupons)` |
| 17 | commerce.reviews | (B) | `updatedAt` | `COUNT(target)=COUNT(stg_commerce_reviews)` |
| 18 | orders.orders | (C) | 없음(status 전이)→full re-copy | `COUNT(target)=COUNT(stg_orders_orders)` |
| 19 | orders.order_items | (A′) | 없음→부모(order) join 증분 또는 동반 full re-copy | `COUNT(target)=COUNT(stg_orders_order_items)` |
| 20 | orders.order_events | (A) | `createdAt` | `COUNT(target)=COUNT(stg_orders_order_events)` |
| 21 | orders.shipments | (C) | 없음→full re-copy | `COUNT(target)=COUNT(stg_orders_shipments)` |
| 22 | orders.shipment_tracking | (A) | `occurredAt` | `COUNT(target)=COUNT(stg_orders_shipment_tracking)` |
| 23 | payments.payments | (C) | 없음(status 전이)→full re-copy | `COUNT(target)=COUNT(stg_payments_payments)` |
| 24 | payments.refunds | (C) | 없음(status)→full re-copy | `COUNT(target)=COUNT(stg_payments_refunds)` |
| 25 | settlements.settlements | (C) | 없음(status)→full re-copy | `COUNT(target)=COUNT(stg_settlements_settlements)` |
| 26 | settlements.settlement_items | (A′) | 없음→부모(settlement) join 증분 | `COUNT(target)=COUNT(stg_settlements_settlement_items)` |
| 27 | admin.banners | (C) | 없음→full re-copy | `COUNT(target)=COUNT(stg_admin_banners)` (레거시 대응 [TO-VERIFY]) |
| 28 | admin.admin_audit_logs | (A) | `createdAt` | `COUNT(target)=COUNT(stg_admin_admin_audit_logs)` (레거시 대응 불명 — 0건 가능, §7.7 참조) |
| 29 | files.files | (C) | 없음(status)→full re-copy | `COUNT(target)=COUNT(stg_files_files)`(메타만, FR-017) |
| — | users.refresh_tokens | (E) | — | **스킵 — SC-005 대상 제외** |
| — | users.password_reset_otps | (E) | — | **스킵 — SC-005 대상 제외** |
| — | users.oauth_states | (E) | — | **스킵 — SC-005 대상 제외** |
| — | payments.payment_outbox | (E) | — | **스킵 — SC-005 대상 제외** |

> **60분 예산 최대 변수(research 승계)**: (C)/(C″) full re-copy 대상 — 특히 `products.products`·`variants`·`inventory`·`orders.orders`·`orders.order_items`·`payments.payments`·`users.users` — 의 실측 행수·소요는 `PRE-ASSESSMENT.md`(T009, Development)가 산정한다. 본 표는 분류·정책만 확정.

---

## 7. 필드 단위 매핑표 (33테이블 전수)

각 표의 열: `신규컬럼 / 타입(nullable) / 레거시 대응 / 1:1여부 / 변환규칙 요약`. "변환규칙 요약"이 "—"인 행은 1:1 직접 복사(타입 그대로, PK 는 §4 규칙).

### 7.1 users 스키마

**users.users** (User) — 레거시 대응: `[TO-VERIFY: auth-service.users]`

| 신규컬럼 | 타입 | 레거시 대응 | 1:1 | 변환규칙 |
|---|---|---|---|---|
| id | String(cuid) | `[TO-VERIFY: auth-service.users.id]` | 1:1 | §4 PK 보존 |
| email | String @unique | `[TO-VERIFY: auth-service.users.email]` | 1:1 | — |
| password | String? (bcrypt) | `[TO-VERIFY: auth-service.users.password_hash]` | 1:1 | 레거시도 해시 저장 전제(평문이면 재해시 필요 — 확인 필요) |
| name | String? | `[TO-VERIFY: .name]` | 1:1 | — |
| phone | String? | `[TO-VERIFY: .phone]` | 1:1 | — |
| createdAt | DateTime | `[TO-VERIFY: .created_at]` | 1:1 | — |

**users.social_accounts** (SocialAccount) — 레거시 대응: **불명(신규기능 가능성)**

| 신규컬럼 | 타입 | 레거시 대응 | 1:1 | 변환규칙 |
|---|---|---|---|---|
| id·userId·provider·providerId·email·name·createdAt | — | `[TO-VERIFY: 레거시에 소셜연동 대응 테이블 존재 여부 자체가 불명]` | 아님 | §8-2. 카카오·구글·네이버 소셜 로그인은 014~016(v1.1.0)에서 신규 도입된 기능이다(context.md 갱신이력). 레거시 AWS 시스템이 동등 기능을 가졌는지 확인 필요 — 없으면 이관 대상 0건(신규 기능, count baseline=0) |

**users.sellers** (Seller) — 레거시 대응: `[TO-VERIFY: seller-service.sellers]`

| 신규컬럼 | 타입 | 레거시 대응 | 1:1 | 변환규칙 |
|---|---|---|---|---|
| id·userId·businessName·businessNumber·representativeName·contactPhone·businessAddress·rejectReason·createdAt | — | `[TO-VERIFY: seller-service.sellers.*]` | 1:1 | — |
| status | `SellerStatus`(대문자, §5) | `[TO-VERIFY: .status]` | 1:1 | enum casing 정규화(§5) |

**users.addresses** (Address) — 레거시 대응: `[TO-VERIFY: user-service.addresses]`

| 신규컬럼 | 타입 | 레거시 대응 | 1:1 | 변환규칙 |
|---|---|---|---|---|
| id·userId·recipientName·phone·zipCode·address1·address2·isDefault·createdAt | — | `[TO-VERIFY: user-service.addresses.*]` | 1:1 | — |

**users.wishlists** (Wishlist) — 레거시 대응: `[TO-VERIFY: user-service.wishlists]`

| 신규컬럼 | 타입 | 레거시 대응 | 1:1 | 변환규칙 |
|---|---|---|---|---|
| id·userId·createdAt | — | `[TO-VERIFY: .*]` | 1:1 | — |
| productId | String(cross-schema plain) | `[TO-VERIFY: .product_id]` | 1:1 | §4 PK 보존 — `products.products.id`와 동일 원본 키 사용 필수(SC-016 확장 anti-join 대상) |

**users.product_views** (ProductView) — 레거시 대응: `[TO-VERIFY: user-service.product_views]`

| 신규컬럼 | 타입 | 레거시 대응 | 1:1 | 변환규칙 |
|---|---|---|---|---|
| id·userId·viewedAt | — | `[TO-VERIFY: .*]` | 1:1 | — |
| productId | String(cross-schema plain) | `[TO-VERIFY: .product_id]` | 1:1 | §4 PK 보존 |

**users.notifications** (Notification) — 레거시 대응: `[TO-VERIFY: notification-service.notifications]`

| 신규컬럼 | 타입 | 레거시 대응 | 1:1 | 변환규칙 |
|---|---|---|---|---|
| id·userId·title·body·isRead·createdAt | — | `[TO-VERIFY: .*]` | 1:1 | — |
| type | `NotificationType`(대문자, §5) | `[TO-VERIFY: .type]` | 1:1 | enum casing 정규화 |

**users.refresh_tokens** — **스킵 확정(§2)**
**users.password_reset_otps** — **스킵 확정(§2)**
**users.oauth_states** — **스킵 확정(§2)**

### 7.2 products 스키마

**products.categories** (Category) — 레거시 대응: `[TO-VERIFY: product-service.categories]`

| 신규컬럼 | 타입 | 레거시 대응 | 1:1 | 변환규칙 |
|---|---|---|---|---|
| id·name·slug·displayOrder | — | `[TO-VERIFY: .*]` | 1:1 | 8건 seed(ADR-010) — 레거시 대응 없으면 신규 seed 유지, 이관 스킵 가능(운영 확인) |

**products.products** (Product) — 레거시 대응: `[TO-VERIFY: product-service.products]`

| 신규컬럼 | 타입 | 레거시 대응 | 1:1 | 변환규칙 |
|---|---|---|---|---|
| id·categoryId·title·description·createdAt | — | `[TO-VERIFY: .*]` | 1:1 | — |
| sellerId | String(cross-schema plain) | `[TO-VERIFY: .seller_id]` | 1:1 | §4 PK 보존 — `users.sellers.id`와 동일 원본 키 |
| price | Decimal(12,2) | `[TO-VERIFY: .price]` | 1:1 | Decimal byte-exact(P-005) — SUM 확장 대조 대상(§9) |
| status | `ProductStatus`(대문자, §5) | `[TO-VERIFY: .status]` | 1:1 | enum casing 정규화 |

**products.product_images** (ProductImage) — 레거시 대응: `[TO-VERIFY: product-service.product_images]`

| 신규컬럼 | 타입 | 레거시 대응 | 1:1 | 변환규칙 |
|---|---|---|---|---|
| id·productId·url·displayOrder | — | `[TO-VERIFY: .*]` | 1:1 | — |

**products.variants** (Variant) — 레거시 대응: `[TO-VERIFY: product-service.variants]` **(가정 — §8-3 참조)**

| 신규컬럼 | 타입 | 레거시 대응 | 1:1 | 변환규칙 |
|---|---|---|---|---|
| id·productId·sku·createdAt(없음) | — | `[TO-VERIFY: .*]` | **가정: 1:1** | §8-3. Variant 는 옵션을 인라인 흡수(context.md §4) — 레거시가 이미 SKU 단위 1행 구조였다고 가정. 레거시가 옵션 마스터/조합 분리 구조라면 T001 재작업 필요(운영 확인) |
| optionName·optionValue | String | `[TO-VERIFY: .option_name/.option_value 또는 별도 옵션 테이블 join]` | **가정: 1:1** | 상동 |
| price | Decimal(12,2) | `[TO-VERIFY: .price]` | 1:1 | Decimal byte-exact — SUM 확장 대조(§9) |

**products.inventory** (Inventory) — 레거시 대응: `[TO-VERIFY: inventory-service.inventory]`

| 신규컬럼 | 타입 | 레거시 대응 | 1:1 | 변환규칙 |
|---|---|---|---|---|
| id·quantity | — | `[TO-VERIFY: .*]` | 1:1 | quantity 는 컷오버 시점 최신값(윈도우 개시로 동결) |
| variantId | String @unique | `[TO-VERIFY: .variant_id]` | 1:1 | §4 PK 보존 — `products.variants.id` 동일 원본 키 |
| productId | String | `[TO-VERIFY: .product_id]` | 1:1 | §4 PK 보존 |

**products.inventory_logs** (InventoryLog) — 레거시 대응: `[TO-VERIFY: inventory-service.inventory_logs]`

| 신규컬럼 | 타입 | 레거시 대응 | 1:1 | 변환규칙 |
|---|---|---|---|---|
| id·delta·orderId·createdAt | — | `[TO-VERIFY: .*]` | 1:1 | append-only — createdAt 워터마크 증분(부류 A) |
| variantId·productId | String(plain, Cascade 미적용) | `[TO-VERIFY: .*]` | 1:1 | §4 PK 보존 — 삭제된 variant/product 이력도 보존(참조 무결성 검증 대상 아님, §10 확장 anti-join도 "권고"로만 취급) |
| type | `InventoryLogType`(대문자, §5) | `[TO-VERIFY: .type]` | 1:1 | enum casing 정규화 |

### 7.3 commerce 스키마

**commerce.carts** (Cart) — 레거시 대응: `[TO-VERIFY: cart-service.carts + cart_items]` **(비-1:1 — §8-1 참조)**

| 신규컬럼 | 타입 | 레거시 대응 | 1:1 | 변환규칙 |
|---|---|---|---|---|
| id | String(cuid) | 신규 발급(카트는 이관 시점 신규 PK 허용 — 카트는 참조되는 대상이 아니므로 §4 예외) | 아님 | §8-1 |
| userId | String @unique(cross-schema) | `[TO-VERIFY: cart-service.carts.user_id]` | 1:1 | §4 PK 보존(참조 무결성 대상) |
| items | Json | `[TO-VERIFY: cart-service.cart_items.*]` (N행) | **아님** | §8-1. `json_agg`로 아이템 배열 조립 |
| createdAt·updatedAt | DateTime | `[TO-VERIFY: .*]` | 1:1 | — |

**commerce.coupons** (Coupon) — 레거시 대응: `[TO-VERIFY: coupon-service.coupons]`

| 신규컬럼 | 타입 | 레거시 대응 | 1:1 | 변환규칙 |
|---|---|---|---|---|
| id·expiresAt·totalQuantity·issuedCount·description·createdAt | — | `[TO-VERIFY: .*]` | 1:1 | — |
| issuerType | `CouponIssuerType`(대문자, §5) | `[TO-VERIFY: .issuer_type]` | 1:1 | enum casing 정규화 |
| issuerId | String(cross-schema, 다형) | `[TO-VERIFY: .issuer_id]` | 1:1 | §4 PK 보존. ADMIN→관리자 userId, SELLER→`users.sellers.id` (issuerType 값에 따라 참조 대상 스키마 상이 — anti-join §10 확장 항목에서 조건부 분기 필요) |
| type | `CouponType`(대문자, §5) | `[TO-VERIFY: .type]` | 1:1 | enum casing 정규화 |
| discountValue·maxDiscountAmount·minOrderAmount | Decimal(12,2)? | `[TO-VERIFY: .*]` | 1:1 | Decimal byte-exact — 확장 SUM 대조(§9) |

**commerce.user_coupons** (UserCoupon) — 레거시 대응: `[TO-VERIFY: coupon-service.user_coupons]`

| 신규컬럼 | 타입 | 레거시 대응 | 1:1 | 변환규칙 |
|---|---|---|---|---|
| id·couponId·createdAt | — | `[TO-VERIFY: .*]` | 1:1 | couponId 는 §4 PK 보존(commerce.coupons.id 동일 원본 키) |
| userId | String(cross-schema) | `[TO-VERIFY: .user_id]` | 1:1 | §4 PK 보존 |
| usedOrderId | String?(cross-schema) | `[TO-VERIFY: .used_order_id]` | 1:1 | §4 PK 보존 — `orders.orders.id` 동일 원본 키(SC-016 확장 anti-join) |
| status | `UserCouponStatus`(소문자, §5) | `[TO-VERIFY: .status]` | 1:1 | enum casing 정규화(대소문자 주의 — 타 커머스 enum 과 반대) |

**commerce.reviews** (Review) — 레거시 대응: `[TO-VERIFY: review-service.reviews]`

| 신규컬럼 | 타입 | 레거시 대응 | 1:1 | 변환규칙 |
|---|---|---|---|---|
| id·rating·content·createdAt·updatedAt | — | `[TO-VERIFY: .*]` | 1:1 | — |
| orderItemId | String @unique(cross-schema) | `[TO-VERIFY: .order_item_id]` | 1:1 | §4 PK 보존 — `orders.order_items.id` 동일 원본 키 |
| orderId·userId·productId·sellerId | String(cross-schema) | `[TO-VERIFY: .*]` | 1:1 | §4 PK 보존(각각 orders.orders/users.users/products.products/users.sellers 동일 원본 키) |

### 7.4 orders 스키마

**orders.orders** (Order) — 레거시 대응: `[TO-VERIFY: order-service.orders]` **(shippingAddressSnapshot 비-1:1 — §8-4 참조)**

| 신규컬럼 | 타입 | 레거시 대응 | 1:1 | 변환규칙 |
|---|---|---|---|---|
| id·deliveredAt·completedAt·createdAt | — | `[TO-VERIFY: .*]` | 1:1 | — |
| userId | String(cross-schema) | `[TO-VERIFY: .user_id]` | 1:1 | §4 PK 보존 |
| status | `OrderStatus`(소문자, §5) | `[TO-VERIFY: .status]` | 1:1 | enum casing 정규화 |
| totalAmount·discountAmount | Decimal(12,2) | `[TO-VERIFY: .*]` | 1:1 | Decimal byte-exact — **SC-006 필수 대조 대상**(totalAmount, §9) |
| shippingAddressSnapshot | Json | `[TO-VERIFY: order-service.orders.ship_* 개별 컬럼 또는 별도 스냅샷 저장]` | **아님** | §8-4. `jsonb_build_object`로 조립 |

**orders.order_items** (OrderItem) — 레거시 대응: `[TO-VERIFY: order-service.order_items]`

| 신규컬럼 | 타입 | 레거시 대응 | 1:1 | 변환규칙 |
|---|---|---|---|---|
| id·quantity·optionName·optionValue·productTitle·sku | — | `[TO-VERIFY: .*]` (스냅샷 필드 — 레거시도 주문 시점 스냅샷 저장 전제) | 1:1 | — |
| orderId | String(동일스키마 FK) | `[TO-VERIFY: .order_id]` | 1:1 | §4 PK 보존, FK 부모(orders.orders) 선행 로드 필수 |
| variantId·productId·sellerId | String(cross-schema) | `[TO-VERIFY: .*]` | 1:1 | §4 PK 보존 |
| unitPrice | Decimal(12,2) | `[TO-VERIFY: .unit_price]` | 1:1 | Decimal byte-exact — 확장 SUM 대조(§9) |

**orders.order_events** (OrderEvent) — 레거시 대응: `[TO-VERIFY: order-service.order_events]`

| 신규컬럼 | 타입 | 레거시 대응 | 1:1 | 변환규칙 |
|---|---|---|---|---|
| id·fromStatus·toStatus·actorId·createdAt | — | `[TO-VERIFY: .*]` | 1:1 | append-only — createdAt 워터마크 증분(부류 A). fromStatus/toStatus 는 target 도 String(enum 아님) — 레거시 원문 그대로 복사 |
| orderId | String(동일스키마 FK) | `[TO-VERIFY: .order_id]` | 1:1 | §4 PK 보존 |
| actorType | `ActorType`(대문자, §5) | `[TO-VERIFY: .actor_type]` | 1:1 | enum casing 정규화 |

**orders.shipments** (Shipment) — 레거시 대응: `[TO-VERIFY: shipping-service.shipments]`

| 신규컬럼 | 타입 | 레거시 대응 | 1:1 | 변환규칙 |
|---|---|---|---|---|
| id·carrier·trackingNumber·shippedAt·deliveredAt·createdAt | — | `[TO-VERIFY: .*]` | 1:1 | — |
| orderId | String(cross-module plain) | `[TO-VERIFY: .order_id]` | 1:1 | §4 PK 보존 |
| status | `ShipmentStatus`(소문자, §5) | `[TO-VERIFY: .status]` | 1:1 | enum casing 정규화 |

**orders.shipment_tracking** (ShipmentTracking) — 레거시 대응: `[TO-VERIFY: shipping-service.shipment_tracking]`

| 신규컬럼 | 타입 | 레거시 대응 | 1:1 | 변환규칙 |
|---|---|---|---|---|
| id·description·occurredAt | — | `[TO-VERIFY: .*]` | 1:1 | append-only — occurredAt 워터마크 증분(부류 A) |
| shipmentId | String(동일모듈 FK) | `[TO-VERIFY: .shipment_id]` | 1:1 | §4 PK 보존 |
| status | `ShipmentStatus`(소문자, §5) | `[TO-VERIFY: .status]` | 1:1 | enum casing 정규화 |

### 7.5 payments 스키마

**payments.payments** (Payment) — 레거시 대응: `[TO-VERIFY: payment-service.payments]`

| 신규컬럼 | 타입 | 레거시 대응 | 1:1 | 변환규칙 |
|---|---|---|---|---|
| id·idempotencyKey·pgTransactionId·failureReason·createdAt | — | `[TO-VERIFY: .*]` | 1:1 | idempotencyKey UNIQUE — 레거시 중복값 존재 시 변환 실패(사전 dedup 필요, 사용자 확인) |
| orderId | String @unique(cross-schema) | `[TO-VERIFY: .order_id]` | 1:1 | §4 PK 보존 — `orders.orders.id` 동일 원본 키(**SC-016 핵심 anti-join**) |
| userId | String(cross-schema) | `[TO-VERIFY: .user_id]` | 1:1 | §4 PK 보존 |
| amount | Decimal(12,2) | `[TO-VERIFY: .amount]` | 1:1 | Decimal byte-exact — **SC-006 필수 대조 대상**(§9) |
| status | `PaymentStatus`(소문자, §5) | `[TO-VERIFY: .status]` | 1:1 | enum casing 정규화 |

**payments.refunds** (Refund) — 레거시 대응: `[TO-VERIFY: payment-service.refunds]`

| 신규컬럼 | 타입 | 레거시 대응 | 1:1 | 변환규칙 |
|---|---|---|---|---|
| id·idempotencyKey·pgRefundId·status·createdAt | — | `[TO-VERIFY: .*]` | 1:1 | — |
| paymentId | String(동일스키마 FK) | `[TO-VERIFY: .payment_id]` | 1:1 | §4 PK 보존 — **SC-016 핵심 anti-join**(payments.payments.id) |
| amount | Decimal(12,2) | `[TO-VERIFY: .amount]` | 1:1 | Decimal byte-exact — 확장 SUM 대조(§9) |

**payments.payment_outbox** — **스킵 확정(§2)**

### 7.6 settlements 스키마

**settlements.settlements** (Settlement) — 레거시 대응: `[TO-VERIFY: settlement-service.settlements]`

| 신규컬럼 | 타입 | 레거시 대응 | 1:1 | 변환규칙 |
|---|---|---|---|---|
| id·periodStart·periodEnd·createdAt | — | `[TO-VERIFY: .*]` | 1:1 | — |
| sellerId | String(cross-schema) | `[TO-VERIFY: .seller_id]` | 1:1 | §4 PK 보존 — **SC-016 핵심 anti-join**(users.sellers.id) |
| totalSales·commission·payoutAmount | Decimal(12,2) | `[TO-VERIFY: .*]` | 1:1 | Decimal byte-exact — **payoutAmount는 SC-006 필수 대조 대상**, totalSales·commission은 확장(§9) |
| status | `SettlementStatus`(소문자, §5) | `[TO-VERIFY: .status]` | 1:1 | enum casing 정규화 |

**settlements.settlement_items** (SettlementItem) — 레거시 대응: `[TO-VERIFY: settlement-service.settlement_items]`

| 신규컬럼 | 타입 | 레거시 대응 | 1:1 | 변환규칙 |
|---|---|---|---|---|
| id | — | `[TO-VERIFY: .*]` | 1:1 | append-only(부모 join 증분, 부류 A′) |
| settlementId | String(동일모듈 FK) | `[TO-VERIFY: .settlement_id]` | 1:1 | §4 PK 보존 |
| orderId·orderItemId | String(cross-schema, orderItemId @unique) | `[TO-VERIFY: .*]` | 1:1 | §4 PK 보존 — **SC-016 핵심 anti-join**(orders.orders.id·orders.order_items.id) |
| saleAmount·commissionAmount | Decimal(12,2) | `[TO-VERIFY: .*]` | 1:1 | Decimal byte-exact — 확장 SUM 대조(§9) |

### 7.7 admin 스키마

**admin.banners** (Banner) — 레거시 대응: `[TO-VERIFY: banner-service.banners]`

| 신규컬럼 | 타입 | 레거시 대응 | 1:1 | 변환규칙 |
|---|---|---|---|---|
| id·title·imageUrl·linkUrl·sortOrder·isActive·startsAt·endsAt·createdAt | — | `[TO-VERIFY: .*]` | 1:1 | — |
| position | `BannerPosition`(대문자, §5) | `[TO-VERIFY: .position]` | 1:1 | enum casing 정규화 |

**admin.admin_audit_logs** (AdminAuditLog) — 레거시 대응: **불명(신규기능 가능성)**

| 신규컬럼 | 타입 | 레거시 대응 | 1:1 | 변환규칙 |
|---|---|---|---|---|
| id·adminId·action·targetType·targetId·createdAt | — | `[TO-VERIFY: 레거시에 감사 로그 대응 테이블 존재 여부 자체가 불명]` | 1:1(가정) | 관리자 감사 로그는 013(v1.1.0)에서 신규 도입(GAP-007-01). 레거시 대응 없으면 이관 대상 0건(신규 기능, count baseline=0) |

### 7.8 files 스키마

**files.files** (FileAsset, `@@map("files")` — §1 발견사항 참조) — 레거시 대응: `[TO-VERIFY: file-service.file_assets 또는 동등 메타 테이블]`

| 신규컬럼 | 타입 | 레거시 대응 | 1:1 | 변환규칙 |
|---|---|---|---|---|
| id·key·url·contentType·size·createdAt | — | `[TO-VERIFY: .*]` | 1:1 | 메타데이터만(FR-017) — 실 바이너리(R2 객체) 이관은 범위 외(신규 `StubFileStorage`, ASM-012) |
| ownerId | String(cross-schema) | `[TO-VERIFY: .owner_id]` | 1:1 | §4 PK 보존 |
| purpose | `FilePurpose`(대문자, §5) | `[TO-VERIFY: .purpose]` | 1:1 | enum casing 정규화 |
| status | `FileStatus`(대문자, §5) | `[TO-VERIFY: .status]` | 1:1 | enum casing 정규화. 이관 시점 PENDING 잔존 행은 실 업로드 미완료 레코드 — 검증 대상에는 포함(count), 실 파일 존재 여부는 검증 범위 외 |

---

## 8. 비-1:1 변환 규칙 상세 (SC-012)

### 8-1. commerce.carts — 관계형 cart_items → JSONB 배열

레거시(가정: `cart-service.carts` + `cart-service.cart_items` 관계형 N행) → 타깃 `commerce.carts.items`(JSONB 배열, 카트 1건당 1행).

```sql
-- 개념 예시(10_transform.sql 본SQL과 동일 로직)
INSERT INTO commerce.carts (id, "userId", items, "createdAt", "updatedAt")
SELECT
  gen_random_uuid()::text,                 -- 카트 자체는 참조 대상 아님 — 신규 PK 허용(§7.3 예외)
  c."userId",
  COALESCE(items_agg.items, '[]'::jsonb),
  c."createdAt", c."updatedAt"
FROM migration_staging.stg_commerce_carts c
LEFT JOIN (
  SELECT "cartOwnerUserId",
         jsonb_agg(jsonb_build_object(
           'variantId', "variantId", 'productId', "productId", 'sellerId', "sellerId",
           'quantity', quantity, 'unitPrice', "unitPrice",
           'optionName', "optionName", 'optionValue', "optionValue",
           'productTitle', "productTitle", 'sku', sku
         )) AS items
  FROM migration_staging.stg_commerce_cart_items
  GROUP BY "cartOwnerUserId"
) items_agg ON items_agg."cartOwnerUserId" = c."userId"
ON CONFLICT ("userId") DO UPDATE SET items = EXCLUDED.items, "updatedAt" = EXCLUDED."updatedAt";
```

- **카운트 기대식**: `COUNT(target commerce.carts) = COUNT(DISTINCT 레거시 cart 소유자)` — 레거시 `cart_items` 행 수와는 다르다(1:1 오인 금지).

### 8-2. users.social_accounts — 레거시 대응 여부 자체가 불명

소셜 로그인은 014~016(v1.1.0)에서 신규 도입되었다. 레거시 AWS 시스템이 소셜 로그인을 지원했는지 자체가 확인 대상이다.

- **확인 필요**: 레거시에 동등 기능(카카오/구글/네이버 연동 계정 테이블)이 있는가?
- **없을 경우**: 이관 대상 0건 — SC-005 카운트 대조는 "레거시=0, 신규=0"으로 자연 충족(스킵과 다름 — 대상 테이블 집합에는 포함, 단 실제 이관 행이 없을 뿐).
- **있을 경우**: `[TO-VERIFY]` 컬럼을 실측 후 T001 재작업(본 spec 완료 후 발견 시 사후 운영 검증 피드백 사이클, spec.md 절차 준용).

### 8-3. products.variants — 옵션 인라인 흡수 (가정 — 운영 확인 필요)

타깃 `Variant`는 `optionName`·`optionValue`를 인라인 필드로 보유(별도 옵션 마스터 테이블 없음, context.md §4). 본 문서는 **레거시도 이미 SKU(옵션 조합) 단위 1행 구조였다**고 가정하여 1:1로 취급했다.

- **가정이 틀릴 경우**(레거시가 `product_options`(옵션 마스터) + `variant_option_values`(조합) 분리 구조라면): `10_transform.sql`에 아래 형태의 조인이 추가로 필요하다(현재 SQL에는 **미포함** — 확인 후 T001 재작업 대상):
  ```sql
  -- 레거시가 옵션 분리 구조인 경우의 예시(현재 채택 안 함 — 가정 확인 후 결정)
  -- SELECT v.id, v."productId", v.sku, v.price,
  --        string_agg(o.option_name, ',') AS "optionName", ...
  -- FROM legacy_variants v JOIN legacy_variant_options o ON ...
  ```
- 이 가정은 [TO-VERIFY] 항목이며 GAP 후보다(사용자 확인 시 확정).

### 8-4. orders.orders.shippingAddressSnapshot — 개별 컬럼 → JSONB 스냅샷

레거시(가정: 배송지 개별 컬럼 또는 `Address` 참조) → 타깃 JSONB 스냅샷.

```sql
-- 개념 예시
INSERT INTO orders.orders (..., "shippingAddressSnapshot", ...)
SELECT ...,
  jsonb_build_object(
    'recipientName', s."shipRecipientName", 'phone', s."shipPhone",
    'zipCode', s."shipZipCode", 'address1', s."shipAddress1", 'address2', s."shipAddress2"
  ),
  ...
FROM migration_staging.stg_orders_orders s
ON CONFLICT (id) DO UPDATE SET ...;
```

- 레거시가 주문 시점에 배송지를 스냅샷 컬럼으로 이미 저장했다고 가정(대부분 커머스 시스템의 공통 관행). 레거시가 `Address` 테이블 참조 방식(스냅샷 아님)이었다면, 이관 시점 참조된 `Address` 레코드를 join하여 스냅샷을 사후 구성해야 한다 — `[TO-VERIFY]`.

---

## 9. 금전 합계 대조 대상 (SC-006)

research.md 인벤토리를 승계. 전부 `Decimal(12,2)`(P-005 byte-exact).

| 등급 | 스키마.테이블.컬럼 |
|---|---|
| **SC-006 필수 3종** | `orders.orders.totalAmount` · `payments.payments.amount` · `settlements.settlements.payoutAmount` |
| 확장(권고) | `orders.orders.discountAmount` · `orders.order_items.unitPrice×quantity` · `payments.refunds.amount` · `settlements.settlements.totalSales`·`commission` · `settlements.settlement_items.saleAmount`·`commissionAmount` · `products.products.price` · `products.variants.price` · `commerce.coupons.discountValue`·`maxDiscountAmount`·`minOrderAmount` |

---

## 10. 교차 참조 anti-join 대상 (SC-016)

**핵심(orders·payments·settlements 강결합, GO 게이트 필수)**:

| 참조 | 소스 | 타깃 | 종류 |
|---|---|---|---|
| 결제→주문 | `payments.payments.orderId` | `orders.orders.id` | cross-schema plain String |
| 환불→결제 | `payments.refunds.paymentId` | `payments.payments.id` | 동일 스키마 FK(실 제약) |
| 정산항목→주문항목 | `settlements.settlement_items.orderItemId` | `orders.order_items.id` | cross-schema plain String(@unique) |
| 정산항목→주문 | `settlements.settlement_items.orderId` | `orders.orders.id` | cross-schema plain String |
| 정산→판매자 | `settlements.settlements.sellerId` | `users.sellers.id` | cross-schema plain String |
| 주문항목→주문 | `orders.order_items.orderId` | `orders.orders.id` | 동일 스키마 FK(실 제약) |

**확장(권고, GO 게이트 비필수)**: `order_items.{variantId→products.variants, productId→products.products, sellerId→users.sellers}` · `reviews.{orderItemId→order_items, orderId→orders, userId→users, productId→products, sellerId→sellers}` · `user_coupons.{userId→users, usedOrderId→orders}` · `coupons.issuerId→{users.users|users.sellers}`(issuerType 조건부 분기) · `wishlists.productId`·`product_views.productId→products.products` · `carts.userId`·`notifications.userId`·`files.ownerId→users.users` · `shipments.orderId→orders.orders` · `inventory_logs.{variantId·productId→products}`.

---

## 11. SC-011 완결성 자가 검증

33테이블 전수 등장 여부(§6·§7 교차 확인):

users(10): users✓ social_accounts✓ refresh_tokens✓(스킵) sellers✓ addresses✓ wishlists✓ product_views✓ password_reset_otps✓(스킵) oauth_states✓(스킵) notifications✓
products(6): categories✓ products✓ product_images✓ variants✓ inventory✓ inventory_logs✓
commerce(4): carts✓ coupons✓ user_coupons✓ reviews✓
orders(5): orders✓ order_items✓ order_events✓ shipments✓ shipment_tracking✓
payments(3): payments✓ refunds✓ payment_outbox✓(스킵)
settlements(2): settlements✓ settlement_items✓
admin(2): banners✓ admin_audit_logs✓
files(1): files✓

**합계 33/33 — 누락 0(SC-011 충족).** "1:1 아님" 표기 3건(commerce.carts·orders.orders.shippingAddressSnapshot·products.variants 가정)은 전부 §8에 변환 규칙 기재(SC-012 충족, 누락 0).
