-- 020-data-migration-cutover — Staging DDL (T001, Database Design Agent)
-- 대상: FR-009/010, NFR-006, SC-022. 참조: ../MAPPING-SPEC.md §4(PK 보존)·§6(델타 분류)·§8(비-1:1)
--
-- 스테이징 원칙: 각 stg_* 테이블은 타깃 스키마와 동일한 컬럼 shape 를 갖되(§4), id/참조 컬럼은
-- 전부 TEXT(레거시 PK 표현 형식 미상 수용) + 전 컬럼 nullable(추출 단계 결측 허용, 최종 제약은
-- 10_transform.sql 의 타깃 INSERT 시점에 강제). 레거시 원본 컬럼명은 extract.sh(T002) 의
-- `\copy (SELECT legacy_col AS "targetCol", ...) TO` 별칭으로 이 shape 에 맞춰진다.
--
-- 컷오버 종료 후 처리: `DROP SCHEMA migration_staging CASCADE;` (plan.md 기타고려사항 — 스테이징 생명주기)

CREATE SCHEMA IF NOT EXISTS migration_staging;

-- ============================================================
-- 감사 테이블 (ADR-010, NFR-006, SC-022)
-- ============================================================

CREATE TABLE IF NOT EXISTS migration_staging.verification_runs (
  id            TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  phase         TEXT NOT NULL,              -- 'precopy' | 'delta' | 'verify' | 'cutover'
  step          TEXT NOT NULL,              -- 예: 'extract:users.users' | 'verify:count' | 'verify:sum' | 'verify:checksum' | 'verify:antijoin'
  target_table  TEXT,                       -- 'schema.table' 형식, 단계 전체 요약 행은 NULL
  started_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at   TIMESTAMPTZ,
  status        TEXT NOT NULL DEFAULT 'running',  -- 'running' | 'pass' | 'fail'
  detail        JSONB,                      -- 카운트/합계/불일치 상세 (PII·자격증명 원문 금지 — ADR-009)
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_verification_runs_phase ON migration_staging.verification_runs (phase, started_at);

-- ============================================================
-- users 스키마 — staging (7테이블. refresh_tokens·password_reset_otps·oauth_states 스킵)
-- ============================================================

CREATE TABLE IF NOT EXISTS migration_staging.stg_users_users (
  id         TEXT,
  email      TEXT,
  password   TEXT,
  name       TEXT,
  phone      TEXT,
  "createdAt" TIMESTAMPTZ,
  _loaded_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS migration_staging.stg_users_social_accounts (
  id          TEXT,
  "userId"    TEXT,
  provider    TEXT,
  "providerId" TEXT,
  email       TEXT,
  name        TEXT,
  "createdAt" TIMESTAMPTZ,
  _loaded_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS migration_staging.stg_users_sellers (
  id                 TEXT,
  "userId"           TEXT,
  "businessName"     TEXT,
  "businessNumber"   TEXT,
  "representativeName" TEXT,
  "contactPhone"     TEXT,
  "businessAddress"  TEXT,
  status             TEXT,   -- 레거시 원문(casing 무관) — 변환 시 §5 정규화
  "rejectReason"      TEXT,
  "createdAt"        TIMESTAMPTZ,
  _loaded_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS migration_staging.stg_users_addresses (
  id             TEXT,
  "userId"       TEXT,
  "recipientName" TEXT,
  phone          TEXT,
  "zipCode"      TEXT,
  address1       TEXT,
  address2       TEXT,
  "isDefault"    BOOLEAN,
  "createdAt"    TIMESTAMPTZ,
  _loaded_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS migration_staging.stg_users_wishlists (
  id          TEXT,
  "userId"    TEXT,
  "productId" TEXT,
  "createdAt" TIMESTAMPTZ,
  _loaded_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS migration_staging.stg_users_product_views (
  id          TEXT,
  "userId"    TEXT,
  "productId" TEXT,
  "viewedAt"  TIMESTAMPTZ,
  _loaded_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS migration_staging.stg_users_notifications (
  id          TEXT,
  "userId"    TEXT,
  type        TEXT,   -- 변환 시 §5 정규화
  title       TEXT,
  body        TEXT,
  "isRead"    BOOLEAN,
  "createdAt" TIMESTAMPTZ,
  _loaded_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- products 스키마 — staging (6테이블)
-- ============================================================

CREATE TABLE IF NOT EXISTS migration_staging.stg_products_categories (
  id             TEXT,
  name           TEXT,
  slug           TEXT,
  "displayOrder" INT,
  _loaded_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS migration_staging.stg_products_products (
  id          TEXT,
  "sellerId"  TEXT,
  "categoryId" TEXT,
  title       TEXT,
  description TEXT,
  price       NUMERIC(12,2),
  status      TEXT,   -- 변환 시 §5 정규화
  "createdAt" TIMESTAMPTZ,
  _loaded_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS migration_staging.stg_products_product_images (
  id             TEXT,
  "productId"    TEXT,
  url            TEXT,
  "displayOrder" INT,
  _loaded_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS migration_staging.stg_products_variants (
  id           TEXT,
  "productId"  TEXT,
  "optionName"  TEXT,
  "optionValue" TEXT,
  sku          TEXT,
  price        NUMERIC(12,2),
  _loaded_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS migration_staging.stg_products_inventory (
  id          TEXT,
  "variantId" TEXT,
  "productId" TEXT,
  quantity    INT,
  _loaded_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS migration_staging.stg_products_inventory_logs (
  id          TEXT,
  "variantId" TEXT,
  "productId" TEXT,
  type        TEXT,   -- 변환 시 §5 정규화
  delta       INT,
  "orderId"   TEXT,
  "createdAt" TIMESTAMPTZ,
  _loaded_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- commerce 스키마 — staging (4테이블. carts 는 2단 구조 — §8-1)
-- ============================================================

-- 카트 자체(소유자·타임스탬프) — items 배열은 stg_commerce_cart_items 에서 집계
CREATE TABLE IF NOT EXISTS migration_staging.stg_commerce_carts (
  "userId"    TEXT,
  "createdAt" TIMESTAMPTZ,
  "updatedAt" TIMESTAMPTZ,
  _loaded_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 카트 아이템(레거시 관계형 원본 그대로, N행) — 10_transform.sql 에서 json_agg
CREATE TABLE IF NOT EXISTS migration_staging.stg_commerce_cart_items (
  "cartOwnerUserId" TEXT,
  "variantId"       TEXT,
  "productId"       TEXT,
  "sellerId"        TEXT,
  quantity          INT,
  "unitPrice"       NUMERIC(12,2),
  "optionName"      TEXT,
  "optionValue"     TEXT,
  "productTitle"    TEXT,
  sku               TEXT,
  _loaded_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS migration_staging.stg_commerce_coupons (
  id                  TEXT,
  "issuerType"        TEXT,   -- 변환 시 §5 정규화
  "issuerId"          TEXT,
  type                TEXT,   -- 변환 시 §5 정규화
  "discountValue"     NUMERIC(12,2),
  "maxDiscountAmount" NUMERIC(12,2),
  "minOrderAmount"    NUMERIC(12,2),
  "expiresAt"         TIMESTAMPTZ,
  "totalQuantity"     INT,
  "issuedCount"       INT,
  description         TEXT,
  "createdAt"         TIMESTAMPTZ,
  _loaded_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS migration_staging.stg_commerce_user_coupons (
  id            TEXT,
  "couponId"    TEXT,
  "userId"      TEXT,
  status        TEXT,   -- 변환 시 §5 정규화 (소문자 — 타 커머스 enum 과 반대 주의)
  "usedOrderId" TEXT,
  "createdAt"   TIMESTAMPTZ,
  _loaded_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS migration_staging.stg_commerce_reviews (
  id            TEXT,
  "orderItemId" TEXT,
  "orderId"     TEXT,
  "userId"      TEXT,
  "productId"   TEXT,
  "sellerId"    TEXT,
  rating        INT,
  content       TEXT,
  "createdAt"   TIMESTAMPTZ,
  "updatedAt"   TIMESTAMPTZ,
  _loaded_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- orders 스키마 — staging (5테이블. orders 는 배송지 개별 컬럼 — §8-4)
-- ============================================================

CREATE TABLE IF NOT EXISTS migration_staging.stg_orders_orders (
  id                TEXT,
  "userId"          TEXT,
  status            TEXT,   -- 변환 시 §5 정규화
  "totalAmount"     NUMERIC(12,2),
  "discountAmount"  NUMERIC(12,2),
  "shipRecipientName" TEXT,  -- shippingAddressSnapshot 조립 원천(§8-4) — [TO-VERIFY] 레거시 실제 저장 방식
  "shipPhone"       TEXT,
  "shipZipCode"     TEXT,
  "shipAddress1"    TEXT,
  "shipAddress2"    TEXT,
  "deliveredAt"     TIMESTAMPTZ,
  "completedAt"     TIMESTAMPTZ,
  "createdAt"       TIMESTAMPTZ,
  _loaded_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS migration_staging.stg_orders_order_items (
  id             TEXT,
  "orderId"      TEXT,
  "variantId"    TEXT,
  "productId"    TEXT,
  "sellerId"     TEXT,
  quantity       INT,
  "unitPrice"    NUMERIC(12,2),
  "optionName"   TEXT,
  "optionValue"  TEXT,
  "productTitle" TEXT,
  sku            TEXT,
  _loaded_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS migration_staging.stg_orders_order_events (
  id           TEXT,
  "orderId"    TEXT,
  "fromStatus" TEXT,
  "toStatus"   TEXT,
  "actorType"  TEXT,   -- 변환 시 §5 정규화
  "actorId"    TEXT,
  "createdAt"  TIMESTAMPTZ,
  _loaded_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS migration_staging.stg_orders_shipments (
  id               TEXT,
  "orderId"        TEXT,
  status           TEXT,   -- 변환 시 §5 정규화
  carrier          TEXT,
  "trackingNumber" TEXT,
  "shippedAt"      TIMESTAMPTZ,
  "deliveredAt"    TIMESTAMPTZ,
  "createdAt"      TIMESTAMPTZ,
  _loaded_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS migration_staging.stg_orders_shipment_tracking (
  id           TEXT,
  "shipmentId" TEXT,
  status       TEXT,   -- 변환 시 §5 정규화
  description  TEXT,
  "occurredAt" TIMESTAMPTZ,
  _loaded_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- payments 스키마 — staging (2테이블. payment_outbox 스킵)
-- ============================================================

CREATE TABLE IF NOT EXISTS migration_staging.stg_payments_payments (
  id                TEXT,
  "orderId"         TEXT,
  "userId"          TEXT,
  amount            NUMERIC(12,2),
  status            TEXT,   -- 변환 시 §5 정규화
  "idempotencyKey"  TEXT,
  "pgTransactionId" TEXT,
  "failureReason"   TEXT,
  "createdAt"       TIMESTAMPTZ,
  _loaded_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS migration_staging.stg_payments_refunds (
  id               TEXT,
  "paymentId"      TEXT,
  amount           NUMERIC(12,2),
  "idempotencyKey" TEXT,
  status           TEXT,
  "pgRefundId"     TEXT,
  "createdAt"      TIMESTAMPTZ,
  _loaded_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- settlements 스키마 — staging (2테이블)
-- ============================================================

CREATE TABLE IF NOT EXISTS migration_staging.stg_settlements_settlements (
  id            TEXT,
  "sellerId"    TEXT,
  "periodStart" TIMESTAMPTZ,
  "periodEnd"   TIMESTAMPTZ,
  "totalSales"  NUMERIC(12,2),
  commission    NUMERIC(12,2),
  "payoutAmount" NUMERIC(12,2),
  status        TEXT,   -- 변환 시 §5 정규화
  "createdAt"   TIMESTAMPTZ,
  _loaded_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS migration_staging.stg_settlements_settlement_items (
  id                 TEXT,
  "settlementId"     TEXT,
  "orderId"          TEXT,
  "orderItemId"      TEXT,
  "saleAmount"       NUMERIC(12,2),
  "commissionAmount" NUMERIC(12,2),
  _loaded_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- admin 스키마 — staging (2테이블)
-- ============================================================

CREATE TABLE IF NOT EXISTS migration_staging.stg_admin_banners (
  id          TEXT,
  title       TEXT,
  "imageUrl"  TEXT,
  "linkUrl"   TEXT,
  position    TEXT,   -- 변환 시 §5 정규화
  "sortOrder" INT,
  "isActive"  BOOLEAN,
  "startsAt"  TIMESTAMPTZ,
  "endsAt"    TIMESTAMPTZ,
  "createdAt" TIMESTAMPTZ,
  _loaded_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS migration_staging.stg_admin_admin_audit_logs (
  id           TEXT,
  "adminId"    TEXT,
  action       TEXT,
  "targetType" TEXT,
  "targetId"   TEXT,
  "createdAt"  TIMESTAMPTZ,
  _loaded_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- files 스키마 — staging (1테이블. 물리 테이블명 files.files — MAPPING-SPEC §1 발견사항)
-- ============================================================

CREATE TABLE IF NOT EXISTS migration_staging.stg_files_files (
  id            TEXT,
  "ownerId"     TEXT,
  purpose       TEXT,   -- 변환 시 §5 정규화
  key           TEXT,
  url           TEXT,
  "contentType" TEXT,
  size          INT,
  status        TEXT,   -- 변환 시 §5 정규화
  "createdAt"   TIMESTAMPTZ,
  _loaded_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
