-- CreateIndex
-- 판매자 상품 목록 cursor 페이지네이션(ProductRepository.listBySeller) 커버 (FR-006, ADR-003, 019)
CREATE INDEX "products_sellerId_createdAt_id_idx" ON "products"."products"("sellerId", "createdAt" DESC, "id" DESC);

-- CreateIndex
-- 관리자 판매자 목록 cursor 페이지네이션(SellerRepository.listByStatusPaginated) 커버 (FR-007, ADR-003, 019)
CREATE INDEX "sellers_status_createdAt_id_idx" ON "users"."sellers"("status", "createdAt" DESC, "id" DESC);
