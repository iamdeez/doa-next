-- 020-data-migration-cutover — Transform SQL (T001, Database Design Agent)
-- 위상 순서(ADR-005): users -> products -> commerce -> orders -> payments -> settlements -> admin -> files
-- 스키마 내부는 FK 부모-우선 순서 준수(research.md 로드위상 검증). cross-schema 는 plain String(FK 미강제)
-- 이므로 로드 순서가 무결성을 깨지 않는다 — 최종 무결성은 20_verify.sql 의 anti-join(SC-016)이 게이트.
--
-- 멱등성: 전 구문 `INSERT ... ON CONFLICT (id) DO UPDATE`(ADR-004) — 델타 재실행 안전.
-- (C)/(C″) 부류(전체 재적재) 테이블은 run.sh(T005) 가 migration_staging 테이블을 TRUNCATE 후 재적재하므로
-- 본 SQL 은 매 실행 시 스테이징 스냅샷 전체를 대상으로 UPSERT 한다(스크립트 재실행 시 자연 수렴).
--
-- enum casing 정규화: MAPPING-SPEC.md §5 표 기준 UPPER()/LOWER() 정규화 후 캐스팅.
-- ephemeral 4종(refresh_tokens·password_reset_otps·oauth_states·payment_outbox)은 본 SQL에 포함하지
-- 않는다(GAP-020-01 RESOLVED — MAPPING-SPEC.md §2 스킵 확정).

BEGIN;

-- ============================================================
-- 1. users 스키마
-- ============================================================

INSERT INTO users.users (id, email, password, name, phone, "createdAt")
SELECT id, email, password, name, phone, COALESCE("createdAt", now())
FROM migration_staging.stg_users_users
ON CONFLICT (id) DO UPDATE SET
  email = EXCLUDED.email, password = EXCLUDED.password, name = EXCLUDED.name, phone = EXCLUDED.phone;

INSERT INTO users.social_accounts (id, "userId", provider, "providerId", email, name, "createdAt")
SELECT id, "userId", provider, "providerId", email, name, COALESCE("createdAt", now())
FROM migration_staging.stg_users_social_accounts
ON CONFLICT (id) DO UPDATE SET
  provider = EXCLUDED.provider, "providerId" = EXCLUDED."providerId", email = EXCLUDED.email, name = EXCLUDED.name;

INSERT INTO users.sellers (id, "userId", "businessName", "businessNumber", "representativeName", "contactPhone", "businessAddress", status, "rejectReason", "createdAt")
SELECT id, "userId", "businessName", "businessNumber", "representativeName", "contactPhone", "businessAddress",
       UPPER(status)::users."SellerStatus", "rejectReason", COALESCE("createdAt", now())
FROM migration_staging.stg_users_sellers
ON CONFLICT (id) DO UPDATE SET
  status = EXCLUDED.status, "rejectReason" = EXCLUDED."rejectReason", "contactPhone" = EXCLUDED."contactPhone", "businessAddress" = EXCLUDED."businessAddress";

INSERT INTO users.addresses (id, "userId", "recipientName", phone, "zipCode", address1, address2, "isDefault", "createdAt")
SELECT id, "userId", "recipientName", phone, "zipCode", address1, address2, COALESCE("isDefault", false), COALESCE("createdAt", now())
FROM migration_staging.stg_users_addresses
ON CONFLICT (id) DO UPDATE SET
  "recipientName" = EXCLUDED."recipientName", phone = EXCLUDED.phone, "zipCode" = EXCLUDED."zipCode",
  address1 = EXCLUDED.address1, address2 = EXCLUDED.address2, "isDefault" = EXCLUDED."isDefault";

INSERT INTO users.wishlists (id, "userId", "productId", "createdAt")
SELECT id, "userId", "productId", COALESCE("createdAt", now())
FROM migration_staging.stg_users_wishlists
ON CONFLICT (id) DO UPDATE SET "productId" = EXCLUDED."productId";

INSERT INTO users.product_views (id, "userId", "productId", "viewedAt")
SELECT id, "userId", "productId", COALESCE("viewedAt", now())
FROM migration_staging.stg_users_product_views
ON CONFLICT (id) DO UPDATE SET "viewedAt" = EXCLUDED."viewedAt";

INSERT INTO users.notifications (id, "userId", type, title, body, "isRead", "createdAt")
SELECT id, "userId", UPPER(type)::users."NotificationType", title, body, COALESCE("isRead", false), COALESCE("createdAt", now())
FROM migration_staging.stg_users_notifications
ON CONFLICT (id) DO UPDATE SET "isRead" = EXCLUDED."isRead";

-- ============================================================
-- 2. products 스키마
-- ============================================================

INSERT INTO products.categories (id, name, slug, "displayOrder")
SELECT id, name, slug, COALESCE("displayOrder", 0)
FROM migration_staging.stg_products_categories
ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, slug = EXCLUDED.slug, "displayOrder" = EXCLUDED."displayOrder";

INSERT INTO products.products (id, "sellerId", "categoryId", title, description, price, status, "createdAt")
SELECT id, "sellerId", "categoryId", title, description, price,
       UPPER(status)::products."ProductStatus", COALESCE("createdAt", now())
FROM migration_staging.stg_products_products
ON CONFLICT (id) DO UPDATE SET
  title = EXCLUDED.title, description = EXCLUDED.description, price = EXCLUDED.price, status = EXCLUDED.status;

INSERT INTO products.product_images (id, "productId", url, "displayOrder")
SELECT id, "productId", url, COALESCE("displayOrder", 0)
FROM migration_staging.stg_products_product_images
ON CONFLICT (id) DO UPDATE SET url = EXCLUDED.url, "displayOrder" = EXCLUDED."displayOrder";

-- 주의(MAPPING-SPEC §8-3): 레거시가 옵션 마스터 분리 구조일 경우 이 SELECT 에 join 추가 필요(가정 확인 전 미포함)
INSERT INTO products.variants (id, "productId", "optionName", "optionValue", sku, price)
SELECT id, "productId", "optionName", "optionValue", sku, price
FROM migration_staging.stg_products_variants
ON CONFLICT (id) DO UPDATE SET price = EXCLUDED.price, "optionName" = EXCLUDED."optionName", "optionValue" = EXCLUDED."optionValue";

INSERT INTO products.inventory (id, "variantId", "productId", quantity)
SELECT id, "variantId", "productId", COALESCE(quantity, 0)
FROM migration_staging.stg_products_inventory
ON CONFLICT (id) DO UPDATE SET quantity = EXCLUDED.quantity;

INSERT INTO products.inventory_logs (id, "variantId", "productId", type, delta, "orderId", "createdAt")
SELECT id, "variantId", "productId", UPPER(type)::products."InventoryLogType", delta, "orderId", COALESCE("createdAt", now())
FROM migration_staging.stg_products_inventory_logs
ON CONFLICT (id) DO NOTHING;  -- append-only(FR-032) — 갱신 없음, 중복만 흡수

-- ============================================================
-- 3. commerce 스키마
-- ============================================================

-- carts: 비-1:1(§8-1) — cart_items 를 json_agg 로 조립. 카트 PK 는 참조 대상이 아니므로
-- userId 충돌 기준 UPSERT(id 는 존재 시 유지, 신규 시 신규 발급 — gen_random_uuid 확장 필요 시 활성화)
INSERT INTO commerce.carts (id, "userId", items, "createdAt", "updatedAt")
SELECT
  COALESCE(existing.id, gen_random_uuid()::text),
  c."userId",
  COALESCE(items_agg.items, '[]'::jsonb),
  COALESCE(c."createdAt", now()),
  COALESCE(c."updatedAt", now())
FROM migration_staging.stg_commerce_carts c
LEFT JOIN commerce.carts existing ON existing."userId" = c."userId"
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

INSERT INTO commerce.coupons (id, "issuerType", "issuerId", type, "discountValue", "maxDiscountAmount", "minOrderAmount", "expiresAt", "totalQuantity", "issuedCount", description, "createdAt")
SELECT id, UPPER("issuerType")::commerce."CouponIssuerType", "issuerId", UPPER(type)::commerce."CouponType",
       "discountValue", "maxDiscountAmount", "minOrderAmount", "expiresAt", "totalQuantity", COALESCE("issuedCount", 0),
       description, COALESCE("createdAt", now())
FROM migration_staging.stg_commerce_coupons
ON CONFLICT (id) DO UPDATE SET "issuedCount" = EXCLUDED."issuedCount", description = EXCLUDED.description;

INSERT INTO commerce.user_coupons (id, "couponId", "userId", status, "usedOrderId", "createdAt")
SELECT id, "couponId", "userId", LOWER(status)::commerce."UserCouponStatus", "usedOrderId", COALESCE("createdAt", now())
FROM migration_staging.stg_commerce_user_coupons
ON CONFLICT (id) DO UPDATE SET status = EXCLUDED.status, "usedOrderId" = EXCLUDED."usedOrderId";

INSERT INTO commerce.reviews (id, "orderItemId", "orderId", "userId", "productId", "sellerId", rating, content, "createdAt", "updatedAt")
SELECT id, "orderItemId", "orderId", "userId", "productId", "sellerId", rating, content, COALESCE("createdAt", now()), COALESCE("updatedAt", now())
FROM migration_staging.stg_commerce_reviews
ON CONFLICT (id) DO UPDATE SET rating = EXCLUDED.rating, content = EXCLUDED.content, "updatedAt" = EXCLUDED."updatedAt";

-- ============================================================
-- 4. orders 스키마
-- ============================================================

-- orders: shippingAddressSnapshot 비-1:1(§8-4) — 개별 컬럼을 jsonb_build_object 로 조립
INSERT INTO orders.orders (id, "userId", status, "totalAmount", "discountAmount", "shippingAddressSnapshot", "deliveredAt", "completedAt", "createdAt")
SELECT id, "userId", LOWER(status)::orders."OrderStatus", "totalAmount", COALESCE("discountAmount", 0),
       jsonb_build_object(
         'recipientName', "shipRecipientName", 'phone', "shipPhone", 'zipCode', "shipZipCode",
         'address1', "shipAddress1", 'address2', "shipAddress2"
       ),
       "deliveredAt", "completedAt", COALESCE("createdAt", now())
FROM migration_staging.stg_orders_orders
ON CONFLICT (id) DO UPDATE SET
  status = EXCLUDED.status, "deliveredAt" = EXCLUDED."deliveredAt", "completedAt" = EXCLUDED."completedAt";

INSERT INTO orders.order_items (id, "orderId", "variantId", "productId", "sellerId", quantity, "unitPrice", "optionName", "optionValue", "productTitle", sku)
SELECT id, "orderId", "variantId", "productId", "sellerId", quantity, "unitPrice", "optionName", "optionValue", "productTitle", sku
FROM migration_staging.stg_orders_order_items
ON CONFLICT (id) DO NOTHING;  -- 불변 스냅샷(주문 시점 고정) — 갱신 없음

INSERT INTO orders.order_events (id, "orderId", "fromStatus", "toStatus", "actorType", "actorId", "createdAt")
SELECT id, "orderId", "fromStatus", "toStatus", UPPER("actorType")::orders."ActorType", "actorId", COALESCE("createdAt", now())
FROM migration_staging.stg_orders_order_events
ON CONFLICT (id) DO NOTHING;  -- append-only(FR-028)

INSERT INTO orders.shipments (id, "orderId", status, carrier, "trackingNumber", "shippedAt", "deliveredAt", "createdAt")
SELECT id, "orderId", LOWER(status)::orders."ShipmentStatus", carrier, "trackingNumber", "shippedAt", "deliveredAt", COALESCE("createdAt", now())
FROM migration_staging.stg_orders_shipments
ON CONFLICT (id) DO UPDATE SET status = EXCLUDED.status, "shippedAt" = EXCLUDED."shippedAt", "deliveredAt" = EXCLUDED."deliveredAt";

INSERT INTO orders.shipment_tracking (id, "shipmentId", status, description, "occurredAt")
SELECT id, "shipmentId", LOWER(status)::orders."ShipmentStatus", description, COALESCE("occurredAt", now())
FROM migration_staging.stg_orders_shipment_tracking
ON CONFLICT (id) DO NOTHING;  -- append-only

-- ============================================================
-- 5. payments 스키마 (P-005 예외 — 런타임 결제경로 우회 직접 삽입, ADR-008)
-- ============================================================

INSERT INTO payments.payments (id, "orderId", "userId", amount, status, "idempotencyKey", "pgTransactionId", "failureReason", "createdAt")
SELECT id, "orderId", "userId", amount, LOWER(status)::payments."PaymentStatus", "idempotencyKey", "pgTransactionId", "failureReason", COALESCE("createdAt", now())
FROM migration_staging.stg_payments_payments
ON CONFLICT (id) DO UPDATE SET status = EXCLUDED.status, "pgTransactionId" = EXCLUDED."pgTransactionId", "failureReason" = EXCLUDED."failureReason";

INSERT INTO payments.refunds (id, "paymentId", amount, "idempotencyKey", status, "pgRefundId", "createdAt")
SELECT id, "paymentId", amount, "idempotencyKey", status, "pgRefundId", COALESCE("createdAt", now())
FROM migration_staging.stg_payments_refunds
ON CONFLICT (id) DO UPDATE SET status = EXCLUDED.status, "pgRefundId" = EXCLUDED."pgRefundId";

-- payment_outbox: 스킵 확정(GAP-020-01 RESOLVED, MAPPING-SPEC §2) — 본 SQL 미포함

-- ============================================================
-- 6. settlements 스키마
-- ============================================================

INSERT INTO settlements.settlements (id, "sellerId", "periodStart", "periodEnd", "totalSales", commission, "payoutAmount", status, "createdAt")
SELECT id, "sellerId", "periodStart", "periodEnd", "totalSales", commission, "payoutAmount",
       LOWER(status)::settlements."SettlementStatus", COALESCE("createdAt", now())
FROM migration_staging.stg_settlements_settlements
ON CONFLICT (id) DO UPDATE SET status = EXCLUDED.status;

INSERT INTO settlements.settlement_items (id, "settlementId", "orderId", "orderItemId", "saleAmount", "commissionAmount")
SELECT id, "settlementId", "orderId", "orderItemId", "saleAmount", "commissionAmount"
FROM migration_staging.stg_settlements_settlement_items
ON CONFLICT (id) DO NOTHING;  -- 불변(008 SEC-FIND-005-01 orderItemId @unique 준수)

-- ============================================================
-- 7. admin 스키마
-- ============================================================

INSERT INTO admin.banners (id, title, "imageUrl", "linkUrl", position, "sortOrder", "isActive", "startsAt", "endsAt", "createdAt")
SELECT id, title, "imageUrl", "linkUrl", UPPER(position)::admin."BannerPosition", COALESCE("sortOrder", 0),
       COALESCE("isActive", true), "startsAt", "endsAt", COALESCE("createdAt", now())
FROM migration_staging.stg_admin_banners
ON CONFLICT (id) DO UPDATE SET "isActive" = EXCLUDED."isActive", "sortOrder" = EXCLUDED."sortOrder";

INSERT INTO admin.admin_audit_logs (id, "adminId", action, "targetType", "targetId", "createdAt")
SELECT id, "adminId", action, "targetType", "targetId", COALESCE("createdAt", now())
FROM migration_staging.stg_admin_admin_audit_logs
ON CONFLICT (id) DO NOTHING;  -- append-only(013)

-- ============================================================
-- 8. files 스키마 (물리 테이블명 files.files — MAPPING-SPEC §1 발견사항, file_assets 아님)
-- ============================================================

INSERT INTO files.files (id, "ownerId", purpose, key, url, "contentType", size, status, "createdAt")
SELECT id, "ownerId", UPPER(purpose)::files."FilePurpose", key, url, "contentType", COALESCE(size, 0),
       UPPER(status)::files."FileStatus", COALESCE("createdAt", now())
FROM migration_staging.stg_files_files
ON CONFLICT (id) DO UPDATE SET status = EXCLUDED.status, size = EXCLUDED.size;

COMMIT;
