-- 020-data-migration-cutover — Verify SQL (T001, Database Design Agent)
-- 4종 검증: (a) 레코드 수 대조 (b) Decimal 합계 대조 (c) 매핑후 sample checksum (d) anti-join
-- 참조: ../MAPPING-SPEC.md §6(카운트 기대식)·§9(금전 합계)·§10(anti-join)
--
-- 실행 전제: 10_transform.sql 완료 직후, 동일 트랜잭션 밖(read-only 스냅샷)에서 실행.
-- GO 게이트(FR-006): 아래 (a)~(d) 전 항목이 verification_runs 에 status='pass' 로 기록되어야
-- run.sh(T005)의 GO/NO-GO 판단이 GO 로 진행한다. 하나라도 'fail' 이면 NO-GO(FR-007).
--
-- 대조 범위(§0 중요 caveat): 본 SQL 은 타깃 Postgres 인스턴스 내부에서 **staging↔target** 일치를
-- 검증한다(변환 로직 무결성). staging↔레거시 원본 일치는 extract.sh(T002) 추출 로그의 레거시측
-- count(옵션 A, 사용자 실행)와 대조해야 완전한 NFR-002 판정이 된다 — run.sh 가 양쪽 결과를 합산.

-- ============================================================
-- (a) 레코드 수 대조 — SC-005·NFR-002 (스킵 4종 제외, MAPPING-SPEC §3 대상 29테이블)
-- ============================================================

INSERT INTO migration_staging.verification_runs (phase, step, target_table, status, detail, finished_at)
SELECT 'verify', 'count', t.name,
       CASE WHEN t.staging_count = t.target_count THEN 'pass' ELSE 'fail' END,
       jsonb_build_object('staging_count', t.staging_count, 'target_count', t.target_count),
       now()
FROM (
  SELECT 'users.users' AS name, (SELECT count(*) FROM migration_staging.stg_users_users) AS staging_count, (SELECT count(*) FROM users.users) AS target_count
  UNION ALL SELECT 'users.social_accounts', (SELECT count(*) FROM migration_staging.stg_users_social_accounts), (SELECT count(*) FROM users.social_accounts)
  UNION ALL SELECT 'users.sellers', (SELECT count(*) FROM migration_staging.stg_users_sellers), (SELECT count(*) FROM users.sellers)
  UNION ALL SELECT 'users.addresses', (SELECT count(*) FROM migration_staging.stg_users_addresses), (SELECT count(*) FROM users.addresses)
  UNION ALL SELECT 'users.wishlists', (SELECT count(*) FROM migration_staging.stg_users_wishlists), (SELECT count(*) FROM users.wishlists)
  UNION ALL SELECT 'users.product_views', (SELECT count(*) FROM migration_staging.stg_users_product_views), (SELECT count(*) FROM users.product_views)
  UNION ALL SELECT 'users.notifications', (SELECT count(*) FROM migration_staging.stg_users_notifications), (SELECT count(*) FROM users.notifications)
  UNION ALL SELECT 'products.categories', (SELECT count(*) FROM migration_staging.stg_products_categories), (SELECT count(*) FROM products.categories)
  UNION ALL SELECT 'products.products', (SELECT count(*) FROM migration_staging.stg_products_products), (SELECT count(*) FROM products.products)
  UNION ALL SELECT 'products.product_images', (SELECT count(*) FROM migration_staging.stg_products_product_images), (SELECT count(*) FROM products.product_images)
  UNION ALL SELECT 'products.variants', (SELECT count(*) FROM migration_staging.stg_products_variants), (SELECT count(*) FROM products.variants)
  UNION ALL SELECT 'products.inventory', (SELECT count(*) FROM migration_staging.stg_products_inventory), (SELECT count(*) FROM products.inventory)
  UNION ALL SELECT 'products.inventory_logs', (SELECT count(*) FROM migration_staging.stg_products_inventory_logs), (SELECT count(*) FROM products.inventory_logs)
  -- carts: 비-1:1(§8-1) — staging 카운트는 "소유자 distinct" 기준(아이템 행수 아님)
  UNION ALL SELECT 'commerce.carts',
    (SELECT count(DISTINCT "userId") FROM migration_staging.stg_commerce_carts),
    (SELECT count(*) FROM commerce.carts)
  UNION ALL SELECT 'commerce.coupons', (SELECT count(*) FROM migration_staging.stg_commerce_coupons), (SELECT count(*) FROM commerce.coupons)
  UNION ALL SELECT 'commerce.user_coupons', (SELECT count(*) FROM migration_staging.stg_commerce_user_coupons), (SELECT count(*) FROM commerce.user_coupons)
  UNION ALL SELECT 'commerce.reviews', (SELECT count(*) FROM migration_staging.stg_commerce_reviews), (SELECT count(*) FROM commerce.reviews)
  UNION ALL SELECT 'orders.orders', (SELECT count(*) FROM migration_staging.stg_orders_orders), (SELECT count(*) FROM orders.orders)
  UNION ALL SELECT 'orders.order_items', (SELECT count(*) FROM migration_staging.stg_orders_order_items), (SELECT count(*) FROM orders.order_items)
  UNION ALL SELECT 'orders.order_events', (SELECT count(*) FROM migration_staging.stg_orders_order_events), (SELECT count(*) FROM orders.order_events)
  UNION ALL SELECT 'orders.shipments', (SELECT count(*) FROM migration_staging.stg_orders_shipments), (SELECT count(*) FROM orders.shipments)
  UNION ALL SELECT 'orders.shipment_tracking', (SELECT count(*) FROM migration_staging.stg_orders_shipment_tracking), (SELECT count(*) FROM orders.shipment_tracking)
  UNION ALL SELECT 'payments.payments', (SELECT count(*) FROM migration_staging.stg_payments_payments), (SELECT count(*) FROM payments.payments)
  UNION ALL SELECT 'payments.refunds', (SELECT count(*) FROM migration_staging.stg_payments_refunds), (SELECT count(*) FROM payments.refunds)
  UNION ALL SELECT 'settlements.settlements', (SELECT count(*) FROM migration_staging.stg_settlements_settlements), (SELECT count(*) FROM settlements.settlements)
  UNION ALL SELECT 'settlements.settlement_items', (SELECT count(*) FROM migration_staging.stg_settlements_settlement_items), (SELECT count(*) FROM settlements.settlement_items)
  UNION ALL SELECT 'admin.banners', (SELECT count(*) FROM migration_staging.stg_admin_banners), (SELECT count(*) FROM admin.banners)
  UNION ALL SELECT 'admin.admin_audit_logs', (SELECT count(*) FROM migration_staging.stg_admin_admin_audit_logs), (SELECT count(*) FROM admin.admin_audit_logs)
  UNION ALL SELECT 'files.files', (SELECT count(*) FROM migration_staging.stg_files_files), (SELECT count(*) FROM files.files)
) t;

-- ============================================================
-- (b) 금전 합계 대조 — SC-006(필수 3종) + 확장(§9)
-- ============================================================

INSERT INTO migration_staging.verification_runs (phase, step, target_table, status, detail, finished_at)
SELECT 'verify', 'sum', s.name,
       CASE WHEN s.staging_sum = s.target_sum THEN 'pass' ELSE 'fail' END,
       jsonb_build_object('staging_sum', s.staging_sum, 'target_sum', s.target_sum, 'required', s.required),
       now()
FROM (
  -- SC-006 필수 3종
  SELECT 'orders.orders.totalAmount' AS name,
         (SELECT COALESCE(SUM("totalAmount"), 0) FROM migration_staging.stg_orders_orders) AS staging_sum,
         (SELECT COALESCE(SUM("totalAmount"), 0) FROM orders.orders) AS target_sum, true AS required
  UNION ALL SELECT 'payments.payments.amount',
         (SELECT COALESCE(SUM(amount), 0) FROM migration_staging.stg_payments_payments),
         (SELECT COALESCE(SUM(amount), 0) FROM payments.payments), true
  UNION ALL SELECT 'settlements.settlements.payoutAmount',
         (SELECT COALESCE(SUM("payoutAmount"), 0) FROM migration_staging.stg_settlements_settlements),
         (SELECT COALESCE(SUM("payoutAmount"), 0) FROM settlements.settlements), true
  -- 확장(권고)
  UNION ALL SELECT 'orders.orders.discountAmount',
         (SELECT COALESCE(SUM("discountAmount"), 0) FROM migration_staging.stg_orders_orders),
         (SELECT COALESCE(SUM("discountAmount"), 0) FROM orders.orders), false
  UNION ALL SELECT 'orders.order_items.unitPrice_x_quantity',
         (SELECT COALESCE(SUM("unitPrice" * quantity), 0) FROM migration_staging.stg_orders_order_items),
         (SELECT COALESCE(SUM("unitPrice" * quantity), 0) FROM orders.order_items), false
  UNION ALL SELECT 'payments.refunds.amount',
         (SELECT COALESCE(SUM(amount), 0) FROM migration_staging.stg_payments_refunds),
         (SELECT COALESCE(SUM(amount), 0) FROM payments.refunds), false
  UNION ALL SELECT 'settlements.settlements.totalSales',
         (SELECT COALESCE(SUM("totalSales"), 0) FROM migration_staging.stg_settlements_settlements),
         (SELECT COALESCE(SUM("totalSales"), 0) FROM settlements.settlements), false
  UNION ALL SELECT 'settlements.settlements.commission',
         (SELECT COALESCE(SUM(commission), 0) FROM migration_staging.stg_settlements_settlements),
         (SELECT COALESCE(SUM(commission), 0) FROM settlements.settlements), false
  UNION ALL SELECT 'settlements.settlement_items.saleAmount',
         (SELECT COALESCE(SUM("saleAmount"), 0) FROM migration_staging.stg_settlements_settlement_items),
         (SELECT COALESCE(SUM("saleAmount"), 0) FROM settlements.settlement_items), false
  UNION ALL SELECT 'settlements.settlement_items.commissionAmount',
         (SELECT COALESCE(SUM("commissionAmount"), 0) FROM migration_staging.stg_settlements_settlement_items),
         (SELECT COALESCE(SUM("commissionAmount"), 0) FROM settlements.settlement_items), false
  UNION ALL SELECT 'products.products.price',
         (SELECT COALESCE(SUM(price), 0) FROM migration_staging.stg_products_products),
         (SELECT COALESCE(SUM(price), 0) FROM products.products), false
  UNION ALL SELECT 'products.variants.price',
         (SELECT COALESCE(SUM(price), 0) FROM migration_staging.stg_products_variants),
         (SELECT COALESCE(SUM(price), 0) FROM products.variants), false
  UNION ALL SELECT 'commerce.coupons.discountValue',
         (SELECT COALESCE(SUM("discountValue"), 0) FROM migration_staging.stg_commerce_coupons),
         (SELECT COALESCE(SUM("discountValue"), 0) FROM commerce.coupons), false
) s;

-- GO 게이트는 required=true 3건 전부 'pass' 를 AND 조건으로 사용(FR-006). 확장 항목은 권고(회귀 관찰용).

-- ============================================================
-- (c) 매핑후 sample checksum — SC-007 (스키마당 ≥100 또는 1%, staging<->target id join 후 md5 비교)
-- ============================================================
-- 패턴: 스키마별 대표 테이블 1개에 대해 구현. 나머지 테이블도 동일 패턴(정규화 projection 컬럼만 교체)으로
-- 확장 가능 — run.sh 실행 시 필요 스키마 전 테이블에 동일 블록을 복제 적용한다.

INSERT INTO migration_staging.verification_runs (phase, step, target_table, status, detail, finished_at)
SELECT 'verify', 'checksum', c.name,
       CASE WHEN c.mismatch_count = 0 THEN 'pass' ELSE 'fail' END,
       jsonb_build_object('sample_size', c.sample_size, 'mismatch_count', c.mismatch_count),
       now()
FROM (
  SELECT 'users (sample: users.users)' AS name,
         count(*) AS sample_size,
         count(*) FILTER (WHERE stg_hash <> tgt_hash) AS mismatch_count
  FROM (
    SELECT s.id,
           md5(concat_ws('|', s.email, s.name, s.phone)) AS stg_hash,
           md5(concat_ws('|', t.email, t.name, t.phone)) AS tgt_hash
    FROM migration_staging.stg_users_users s
    JOIN users.users t ON t.id = s.id
    ORDER BY random()
    LIMIT GREATEST(100, (SELECT ceil(count(*) * 0.01) FROM migration_staging.stg_users_users)::int)
  ) sample
  UNION ALL
  SELECT 'products (sample: products.products)',
         count(*), count(*) FILTER (WHERE stg_hash <> tgt_hash)
  FROM (
    SELECT s.id,
           md5(concat_ws('|', s.title, s.price::text, s.status)) AS stg_hash,
           md5(concat_ws('|', t.title, t.price::text, UPPER(t.status::text))) AS tgt_hash
    FROM migration_staging.stg_products_products s
    JOIN products.products t ON t.id = s.id
    ORDER BY random()
    LIMIT GREATEST(100, (SELECT ceil(count(*) * 0.01) FROM migration_staging.stg_products_products)::int)
  ) sample
  UNION ALL
  SELECT 'commerce (sample: commerce.reviews)',
         count(*), count(*) FILTER (WHERE stg_hash <> tgt_hash)
  FROM (
    SELECT s.id,
           md5(concat_ws('|', s.rating::text, s.content)) AS stg_hash,
           md5(concat_ws('|', t.rating::text, t.content)) AS tgt_hash
    FROM migration_staging.stg_commerce_reviews s
    JOIN commerce.reviews t ON t.id = s.id
    ORDER BY random()
    LIMIT GREATEST(100, (SELECT ceil(count(*) * 0.01) FROM migration_staging.stg_commerce_reviews)::int)
  ) sample
  UNION ALL
  SELECT 'orders (sample: orders.orders)',
         count(*), count(*) FILTER (WHERE stg_hash <> tgt_hash)
  FROM (
    SELECT s.id,
           md5(concat_ws('|', s."totalAmount"::text, s.status)) AS stg_hash,
           md5(concat_ws('|', t."totalAmount"::text, LOWER(t.status::text))) AS tgt_hash
    FROM migration_staging.stg_orders_orders s
    JOIN orders.orders t ON t.id = s.id
    ORDER BY random()
    LIMIT GREATEST(100, (SELECT ceil(count(*) * 0.01) FROM migration_staging.stg_orders_orders)::int)
  ) sample
  UNION ALL
  SELECT 'payments (sample: payments.payments)',
         count(*), count(*) FILTER (WHERE stg_hash <> tgt_hash)
  FROM (
    SELECT s.id,
           md5(concat_ws('|', s.amount::text, s.status)) AS stg_hash,
           md5(concat_ws('|', t.amount::text, LOWER(t.status::text))) AS tgt_hash
    FROM migration_staging.stg_payments_payments s
    JOIN payments.payments t ON t.id = s.id
    ORDER BY random()
    LIMIT GREATEST(100, (SELECT ceil(count(*) * 0.01) FROM migration_staging.stg_payments_payments)::int)
  ) sample
  UNION ALL
  SELECT 'settlements (sample: settlements.settlements)',
         count(*), count(*) FILTER (WHERE stg_hash <> tgt_hash)
  FROM (
    SELECT s.id,
           md5(concat_ws('|', s."payoutAmount"::text, s.status)) AS stg_hash,
           md5(concat_ws('|', t."payoutAmount"::text, LOWER(t.status::text))) AS tgt_hash
    FROM migration_staging.stg_settlements_settlements s
    JOIN settlements.settlements t ON t.id = s.id
    ORDER BY random()
    LIMIT GREATEST(100, (SELECT ceil(count(*) * 0.01) FROM migration_staging.stg_settlements_settlements)::int)
  ) sample
  UNION ALL
  SELECT 'admin (sample: admin.banners)',
         count(*), count(*) FILTER (WHERE stg_hash <> tgt_hash)
  FROM (
    SELECT s.id,
           md5(concat_ws('|', s.title, s."isActive"::text)) AS stg_hash,
           md5(concat_ws('|', t.title, t."isActive"::text)) AS tgt_hash
    FROM migration_staging.stg_admin_banners s
    JOIN admin.banners t ON t.id = s.id
    ORDER BY random()
    LIMIT GREATEST(100, (SELECT ceil(count(*) * 0.01) FROM migration_staging.stg_admin_banners)::int)
  ) sample
  UNION ALL
  SELECT 'files (sample: files.files, 메타만 FR-017)',
         count(*), count(*) FILTER (WHERE stg_hash <> tgt_hash)
  FROM (
    SELECT s.id,
           md5(concat_ws('|', s.key, s."contentType", s.size::text)) AS stg_hash,
           md5(concat_ws('|', t.key, t."contentType", t.size::text)) AS tgt_hash
    FROM migration_staging.stg_files_files s
    JOIN files.files t ON t.id = s.id
    ORDER BY random()
    LIMIT GREATEST(100, (SELECT ceil(count(*) * 0.01) FROM migration_staging.stg_files_files)::int)
  ) sample
) c;

-- ============================================================
-- (d) 교차 참조 anti-join — SC-016(핵심, GO 게이트 필수) + 확장(권고)
-- ============================================================

-- 핵심 6종(orders·payments·settlements 강결합, MAPPING-SPEC §10)
INSERT INTO migration_staging.verification_runs (phase, step, target_table, status, detail, finished_at)
SELECT 'verify', 'antijoin', a.name,
       CASE WHEN a.orphan_count = 0 THEN 'pass' ELSE 'fail' END,
       jsonb_build_object('orphan_count', a.orphan_count, 'core', true),
       now()
FROM (
  SELECT 'payments.payments.orderId -> orders.orders.id' AS name, count(*) AS orphan_count
  FROM payments.payments p LEFT JOIN orders.orders o ON o.id = p."orderId" WHERE o.id IS NULL
  UNION ALL
  SELECT 'payments.refunds.paymentId -> payments.payments.id', count(*)
  FROM payments.refunds r LEFT JOIN payments.payments p ON p.id = r."paymentId" WHERE p.id IS NULL
  UNION ALL
  SELECT 'settlements.settlement_items.orderItemId -> orders.order_items.id', count(*)
  FROM settlements.settlement_items si LEFT JOIN orders.order_items oi ON oi.id = si."orderItemId" WHERE oi.id IS NULL
  UNION ALL
  SELECT 'settlements.settlement_items.orderId -> orders.orders.id', count(*)
  FROM settlements.settlement_items si LEFT JOIN orders.orders o ON o.id = si."orderId" WHERE o.id IS NULL
  UNION ALL
  SELECT 'settlements.settlements.sellerId -> users.sellers.id', count(*)
  FROM settlements.settlements st LEFT JOIN users.sellers se ON se.id = st."sellerId" WHERE se.id IS NULL
  UNION ALL
  SELECT 'orders.order_items.orderId -> orders.orders.id', count(*)
  FROM orders.order_items oi LEFT JOIN orders.orders o ON o.id = oi."orderId" WHERE o.id IS NULL
) a;

-- 확장(권고, GO 게이트 비필수 — 참조 검증 목적. 대표 항목만 구현, 나머지는 동일 패턴으로 확장)
INSERT INTO migration_staging.verification_runs (phase, step, target_table, status, detail, finished_at)
SELECT 'verify', 'antijoin', a.name,
       CASE WHEN a.orphan_count = 0 THEN 'pass' ELSE 'fail' END,
       jsonb_build_object('orphan_count', a.orphan_count, 'core', false),
       now()
FROM (
  SELECT 'orders.order_items.productId -> products.products.id' AS name, count(*) AS orphan_count
  FROM orders.order_items oi LEFT JOIN products.products p ON p.id = oi."productId" WHERE p.id IS NULL
  UNION ALL
  SELECT 'orders.order_items.variantId -> products.variants.id', count(*)
  FROM orders.order_items oi LEFT JOIN products.variants v ON v.id = oi."variantId" WHERE v.id IS NULL
  UNION ALL
  SELECT 'commerce.reviews.orderItemId -> orders.order_items.id', count(*)
  FROM commerce.reviews r LEFT JOIN orders.order_items oi ON oi.id = r."orderItemId" WHERE oi.id IS NULL
  UNION ALL
  SELECT 'commerce.user_coupons.usedOrderId -> orders.orders.id', count(*)
  FROM commerce.user_coupons uc LEFT JOIN orders.orders o ON o.id = uc."usedOrderId" WHERE uc."usedOrderId" IS NOT NULL AND o.id IS NULL
  UNION ALL
  SELECT 'users.wishlists.productId -> products.products.id', count(*)
  FROM users.wishlists w LEFT JOIN products.products p ON p.id = w."productId" WHERE p.id IS NULL
  UNION ALL
  SELECT 'files.files.ownerId -> users.users.id', count(*)
  FROM files.files f LEFT JOIN users.users u ON u.id = f."ownerId" WHERE u.id IS NULL
) a;

-- ============================================================
-- 종합 판정 조회(run.sh 가 이 결과로 GO/NO-GO 최종 판단, FR-006/007)
-- ============================================================

SELECT phase, step,
       count(*) FILTER (WHERE status = 'fail') AS fail_count,
       count(*) FILTER (WHERE status = 'pass') AS pass_count
FROM migration_staging.verification_runs
WHERE phase = 'verify' AND started_at > now() - interval '1 hour'
GROUP BY phase, step
ORDER BY step;
