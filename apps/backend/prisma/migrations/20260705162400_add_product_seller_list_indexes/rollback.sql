-- Rollback (참조용, 수동 실행) — 20260705162400_add_product_seller_list_indexes
-- 순수 인덱스 추가 마이그레이션이므로 DROP INDEX만으로 완전 원복 가능 (데이터 손실 없음).

DROP INDEX IF EXISTS "products"."products_sellerId_createdAt_id_idx";
DROP INDEX IF EXISTS "users"."sellers_status_createdAt_id_idx";
