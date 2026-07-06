import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Prisma, ProductStatus } from '@prisma/client';
import { InventoryService } from '../inventory/inventory.service';
import { SellerService } from '../seller/seller.service';
import { DEFAULT_PAGE_LIMIT, MAX_PAGE_LIMIT, MAX_PRODUCT_IMAGES } from './product.constants';
import { ProductRepository } from './product.repository';

export interface ProductListResult {
  items: unknown[];
  nextCursor: string | null;
}

export interface VariantSnapshot {
  variantId: string;
  productId: string;
  sellerId: string;
  unitPrice: Prisma.Decimal;
  optionName: string;
  optionValue: string;
  productTitle: string;
  sku: string;
}

/** getPublicSummaries 반환 값 — 위시리스트·최근 본 상품 enrichment 용 (017). */
export interface ProductSummaryView {
  productId: string;
  title: string;
  price: Prisma.Decimal;
  thumbnailUrl: string | null;
}

@Injectable()
export class ProductService {
  constructor(
    private readonly productRepository: ProductRepository,
    private readonly sellerService: SellerService,
    private readonly inventoryService: InventoryService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  // ── Category ──────────────────────────────────────────────────────

  async listCategories() {
    return this.productRepository.findCategories();
  }

  // ── Product CRUD ──────────────────────────────────────────────────

  async createProduct(
    userId: string,
    data: {
      categoryId: string;
      title: string;
      description?: string;
      price: number | string;
    },
  ) {
    const seller = await this.sellerService.getApprovedSeller(userId);
    const category = await this.productRepository.findCategoryById(data.categoryId);
    if (!category) throw new BadRequestException('Category not found');

    return this.productRepository.createProduct({
      sellerId: seller.id,
      ...data,
      price: new Prisma.Decimal(data.price),
    });
  }

  async updateProduct(
    userId: string,
    productId: string,
    data: {
      categoryId?: string;
      title?: string;
      description?: string | null;
      price?: number | string;
    },
  ) {
    const product = await this.productRepository.findById(productId);
    if (!product) throw new NotFoundException('Product not found');

    await this.assertOwner(userId, product.sellerId);

    const updateData: Parameters<ProductRepository['updateProduct']>[1] = { ...data };
    if (data.price !== undefined) {
      updateData.price = new Prisma.Decimal(data.price);
    }
    return this.productRepository.updateProduct(productId, updateData);
  }

  async publish(userId: string, productId: string) {
    const product = await this.productRepository.findById(productId);
    if (!product) throw new NotFoundException('Product not found');
    await this.assertOwner(userId, product.sellerId);

    if (product.status !== ProductStatus.DRAFT && product.status !== ProductStatus.INACTIVE) {
      throw new BadRequestException(`Cannot publish product with status ${product.status}`);
    }
    return this.productRepository.updateStatus(productId, ProductStatus.ACTIVE);
  }

  async deactivate(userId: string, productId: string) {
    const product = await this.productRepository.findById(productId);
    if (!product) throw new NotFoundException('Product not found');
    await this.assertOwner(userId, product.sellerId);

    if (
      product.status !== ProductStatus.ACTIVE &&
      product.status !== ProductStatus.OUT_OF_STOCK
    ) {
      throw new BadRequestException(`Cannot deactivate product with status ${product.status}`);
    }
    return this.productRepository.updateStatus(productId, ProductStatus.INACTIVE);
  }

  // ── Variant ───────────────────────────────────────────────────────

  async addVariant(
    userId: string,
    productId: string,
    data: {
      optionName: string;
      optionValue: string;
      sku: string;
      price: number | string;
      initialStock?: number;
    },
  ) {
    const product = await this.productRepository.findById(productId);
    if (!product) throw new NotFoundException('Product not found');
    await this.assertOwner(userId, product.sellerId);

    const variant = await this.productRepository.createVariant({
      productId,
      optionName: data.optionName,
      optionValue: data.optionValue,
      sku: data.sku,
      price: new Prisma.Decimal(data.price),
    });

    const initialStock = data.initialStock ?? 0;
    await this.inventoryService.initStock(variant.id, productId, initialStock);

    return variant;
  }

  async updateVariant(
    userId: string,
    productId: string,
    variantId: string,
    data: {
      optionName?: string;
      optionValue?: string;
      sku?: string;
      price?: number | string;
    },
  ) {
    const product = await this.productRepository.findById(productId);
    if (!product) throw new NotFoundException('Product not found');
    await this.assertOwner(userId, product.sellerId);

    const variant = await this.productRepository.findVariantById(variantId);
    if (!variant || variant.productId !== productId) throw new NotFoundException('Variant not found');

    const updateData: Parameters<ProductRepository['updateVariant']>[1] = { ...data };
    if (data.price !== undefined) {
      updateData.price = new Prisma.Decimal(data.price);
    }
    return this.productRepository.updateVariant(variantId, updateData);
  }

  async deleteVariant(userId: string, productId: string, variantId: string) {
    const product = await this.productRepository.findById(productId);
    if (!product) throw new NotFoundException('Product not found');
    await this.assertOwner(userId, product.sellerId);

    const variant = await this.productRepository.findVariantById(variantId);
    if (!variant || variant.productId !== productId) throw new NotFoundException('Variant not found');

    await this.productRepository.deleteVariant(variantId);
  }

  // ── Image ─────────────────────────────────────────────────────────

  async addImage(
    userId: string,
    productId: string,
    data: { url: string; displayOrder?: number },
  ) {
    const product = await this.productRepository.findById(productId);
    if (!product) throw new NotFoundException('Product not found');
    await this.assertOwner(userId, product.sellerId);

    const count = await this.productRepository.countImages(productId);
    if (count >= MAX_PRODUCT_IMAGES) {
      throw new BadRequestException(`Maximum ${MAX_PRODUCT_IMAGES} images per product`);
    }
    return this.productRepository.createImage({ productId, ...data });
  }

  async deleteImage(userId: string, productId: string, imageId: string) {
    const product = await this.productRepository.findById(productId);
    if (!product) throw new NotFoundException('Product not found');
    await this.assertOwner(userId, product.sellerId);
    await this.productRepository.deleteImage(imageId);
  }

  // ── Public listing ────────────────────────────────────────────────

  async listPublic(cursor: string | undefined, limit: number | undefined): Promise<ProductListResult> {
    const take = Math.min(Math.max(limit ?? DEFAULT_PAGE_LIMIT, 1), MAX_PAGE_LIMIT);
    const items = await this.productRepository.listPublic(cursor, take);
    const nextCursor = items.length === take ? items[items.length - 1].id : null;
    return { items, nextCursor };
  }

  /**
   * 006-search 지원: 검색/필터 결과 조회 (offset 페이지네이션).
   * search 도메인이 DI 로 호출하는 read-only 공개 메서드 (P-001 — products 스키마 소유자 경유).
   * 가격은 number/string 으로 받아 Decimal 로 변환. skip/take/sort 는 호출 측에서 정규화하여 전달.
   */
  async searchProducts(params: {
    q?: string;
    categoryId?: string;
    minPrice?: number | string;
    maxPrice?: number | string;
    sort: 'latest' | 'price_asc' | 'price_desc';
    skip: number;
    take: number;
  }): Promise<{ items: unknown[]; total: number }> {
    return this.productRepository.searchProducts({
      q: params.q,
      categoryId: params.categoryId,
      minPrice: params.minPrice !== undefined ? new Prisma.Decimal(params.minPrice) : undefined,
      maxPrice: params.maxPrice !== undefined ? new Prisma.Decimal(params.maxPrice) : undefined,
      sort: params.sort,
      skip: params.skip,
      take: params.take,
    });
  }

  async getDetail(productId: string, user?: { userId: string }) {
    const product = await this.productRepository.findById(productId);
    if (
      !product ||
      (product.status !== ProductStatus.ACTIVE && product.status !== ProductStatus.OUT_OF_STOCK)
    ) {
      throw new NotFoundException('Product not found');
    }

    if (user) {
      this.eventEmitter.emit('product.viewed', { userId: user.userId, productId });
    }

    return product;
  }

  /**
   * 승인 판매자 본인 상품 상세 — 상태 무관, variants·images 포함 (017).
   * 분기 순서 고정: 존재 확인(404) → 소유권 확인(403, updateProduct/publish 와 동일 관례).
   */
  async getMyProductDetail(userId: string, productId: string) {
    const product = await this.productRepository.findById(productId);
    if (!product) throw new NotFoundException('Product not found');
    await this.assertOwner(userId, product.sellerId);
    return product;
  }

  /** 승인 판매자 본인 상품 목록 — cursor 페이지네이션 (017). */
  async listMyProducts(
    userId: string,
    cursor?: string,
    limit?: number,
  ): Promise<ProductListResult> {
    const seller = await this.sellerService.getApprovedSeller(userId);
    const take = Math.min(Math.max(limit ?? DEFAULT_PAGE_LIMIT, 1), MAX_PAGE_LIMIT);
    const items = await this.productRepository.listBySeller(seller.id, cursor, take);
    const nextCursor = items.length === take ? items[items.length - 1].id : null;
    return { items, nextCursor };
  }

  /**
   * 공개 조회 가능(ACTIVE·OUT_OF_STOCK) 상품 요약 일괄 조회 (017).
   * user 모듈이 위시리스트·최근 본 상품 enrichment 를 위해 DI 로 소비하는 공개 메서드(모듈 경계 — 직접 쿼리 금지).
   * 조회 불가(DRAFT·INACTIVE·삭제·미존재) 상품은 반환 Map 에서 누락 — 호출 측이 productAvailable 판정.
   */
  async getPublicSummaries(productIds: string[]): Promise<Map<string, ProductSummaryView>> {
    const products = await this.productRepository.findPublicSummariesByIds(productIds);
    const result = new Map<string, ProductSummaryView>();
    for (const product of products) {
      result.set(product.id, {
        productId: product.id,
        title: product.title,
        price: product.price,
        thumbnailUrl: product.images[0]?.url ?? null,
      });
    }
    return result;
  }

  /**
   * productId → 판매자 sellerId 해석 (009 알림 연동, additive read-only).
   * NotificationEventsHandler 가 리뷰 알림 수신자(판매자) 해석에 사용. 미존재 시 null.
   */
  async getSellerIdByProductId(productId: string): Promise<string | null> {
    const product = await this.productRepository.findById(productId);
    return product?.sellerId ?? null;
  }

  // ── Commerce 지원 (cart·order) ────────────────────────────────────

  /**
   * 주문/장바구니 스냅샷 생성용: 단일 variant 조회.
   * variant 가 없거나 ACTIVE/OUT_OF_STOCK 아닌 상품이면 NotFoundException.
   */
  async getVariantSnapshot(variantId: string): Promise<VariantSnapshot> {
    const variant = await this.productRepository.findVariantWithProduct(variantId);
    if (!variant) throw new NotFoundException(`Variant not found: ${variantId}`);
    return {
      variantId: variant.id,
      productId: variant.productId,
      sellerId: variant.product.sellerId,
      unitPrice: variant.price,
      optionName: variant.optionName,
      optionValue: variant.optionValue,
      productTitle: variant.product.title,
      sku: variant.sku,
    };
  }

  /**
   * 주문 생성용: 복수 variant 일괄 스냅샷.
   * 누락된 variantId 가 있으면 NotFoundException.
   * 반환: Map<variantId, VariantSnapshot> — O(1) 조회용.
   */
  async getVariantSnapshots(variantIds: string[]): Promise<Map<string, VariantSnapshot>> {
    const variants = await this.productRepository.findVariantsWithProduct(variantIds);
    const found = new Set(variants.map((v) => v.id));
    const missing = variantIds.filter((id) => !found.has(id));
    if (missing.length > 0) {
      throw new NotFoundException(`Variants not found: ${missing.join(', ')}`);
    }
    const result = new Map<string, VariantSnapshot>();
    for (const variant of variants) {
      result.set(variant.id, {
        variantId: variant.id,
        productId: variant.productId,
        sellerId: variant.product.sellerId,
        unitPrice: variant.price,
        optionName: variant.optionName,
        optionValue: variant.optionValue,
        productTitle: variant.product.title,
        sku: variant.sku,
      });
    }
    return result;
  }

  /**
   * SEC-002: variantId → product.sellerId → 현재 사용자 seller 소유 검증.
   * 소유자가 아닌 경우 ForbiddenException.
   */
  async assertSellerOwnsVariant(userId: string, variantId: string): Promise<void> {
    const variant = await this.productRepository.findVariantWithProduct(variantId);
    if (!variant) throw new NotFoundException(`Variant not found: ${variantId}`);
    await this.assertOwner(userId, variant.product.sellerId);
  }

  // ── Private helpers ───────────────────────────────────────────────

  /**
   * 상품 소유 검증: 현재 사용자의 sellerId 가 product.sellerId 와 일치해야 함 (cross-schema plain String 비교).
   * 불일치 시 ForbiddenException.
   */
  private async assertOwner(userId: string, productSellerId: string): Promise<void> {
    // sellerId 는 cross-schema plain String — SellerService DI 로 검증
    const seller = await this.sellerService.getApprovedSeller(userId);
    if (seller.id !== productSellerId) {
      throw new ForbiddenException('You do not own this product');
    }
  }
}
