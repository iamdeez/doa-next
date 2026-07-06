import { Injectable } from '@nestjs/common';
import {
  Category,
  Prisma,
  Product,
  ProductImage,
  ProductStatus,
  Variant,
} from '@prisma/client';
import { PrismaService } from '../../shared/prisma/prisma.service';

// P-001: products 스키마(products.categories, products.products, products.product_images, products.variants)에만 접근.
// inventory 접근은 InventoryService DI 경유. user/seller 직접 접근 없음.

@Injectable()
export class ProductRepository {
  constructor(private readonly prisma: PrismaService) {}

  // ── Category ──────────────────────────────────────────────────────

  async findCategories(): Promise<Category[]> {
    return this.prisma.category.findMany({ orderBy: { displayOrder: 'asc' } });
  }

  async findCategoryById(id: string): Promise<Category | null> {
    return this.prisma.category.findUnique({ where: { id } });
  }

  // ── Product ───────────────────────────────────────────────────────

  async createProduct(data: {
    sellerId: string;
    categoryId: string;
    title: string;
    description?: string;
    price: Prisma.Decimal | number | string;
  }): Promise<Product> {
    return this.prisma.product.create({ data: { ...data, status: ProductStatus.DRAFT } });
  }

  async findById(id: string): Promise<(Product & { images: ProductImage[]; variants: Variant[] }) | null> {
    return this.prisma.product.findUnique({
      where: { id },
      include: { images: { orderBy: { displayOrder: 'asc' } }, variants: true },
    });
  }

  async updateProduct(
    id: string,
    data: {
      categoryId?: string;
      title?: string;
      description?: string | null;
      price?: Prisma.Decimal | number | string;
    },
  ): Promise<Product> {
    return this.prisma.product.update({ where: { id }, data });
  }

  async updateStatus(id: string, status: ProductStatus): Promise<Product> {
    return this.prisma.product.update({ where: { id }, data: { status } });
  }

  /**
   * 공개 상품 목록 (cursor 기반 페이지네이션, ADR-007, NFR-001):
   * status IN [ACTIVE, OUT_OF_STOCK], orderBy [createdAt desc, id desc].
   */
  async listPublic(
    cursor: string | undefined,
    take: number,
  ): Promise<Product[]> {
    return this.prisma.product.findMany({
      where: { status: { in: [ProductStatus.ACTIVE, ProductStatus.OUT_OF_STOCK] } },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      cursor: cursor ? { id: cursor } : undefined,
      skip: cursor ? 1 : 0,
      take,
    });
  }

  /**
   * 판매자 본인 상품 목록 — cursor 페이지네이션 (017).
   * cursor/take 미지정 시 전체 반환(하위 호환). orderBy 에 id 2차키를 추가해 cursor 안정성을 보장한다.
   */
  async listBySeller(sellerId: string, cursor?: string, take?: number): Promise<Product[]> {
    return this.prisma.product.findMany({
      where: { sellerId },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      cursor: cursor ? { id: cursor } : undefined,
      skip: cursor ? 1 : 0,
      take,
    });
  }

  /**
   * 공개 조회 가능(ACTIVE·OUT_OF_STOCK) 상품 요약 일괄 조회 — 단일 in 쿼리로 N+1 회피 (017).
   * 대표 이미지(displayOrder 최소 1건)만 include. 조회 불가 상품은 결과에서 자연 누락(호출 측이 판정).
   */
  async findPublicSummariesByIds(
    ids: string[],
  ): Promise<(Product & { images: ProductImage[] })[]> {
    return this.prisma.product.findMany({
      where: { id: { in: ids }, status: { in: [ProductStatus.ACTIVE, ProductStatus.OUT_OF_STOCK] } },
      include: { images: { orderBy: { displayOrder: 'asc' }, take: 1 } },
    });
  }

  /**
   * 검색/필터 (006-search, offset 페이지네이션):
   * 공개 상품(ACTIVE+OUT_OF_STOCK)만 대상. 키워드는 title 부분일치(대소문자 무시).
   * 정렬: latest(최신순) | price_asc | price_desc.
   * items + total 동시 반환 — 페이지 메타 계산용.
   */
  async searchProducts(params: {
    q?: string;
    categoryId?: string;
    minPrice?: Prisma.Decimal;
    maxPrice?: Prisma.Decimal;
    sort: 'latest' | 'price_asc' | 'price_desc';
    skip: number;
    take: number;
  }): Promise<{ items: (Product & { images: ProductImage[] })[]; total: number }> {
    const priceFilter: Prisma.DecimalFilter = {};
    if (params.minPrice !== undefined) priceFilter.gte = params.minPrice;
    if (params.maxPrice !== undefined) priceFilter.lte = params.maxPrice;

    const where: Prisma.ProductWhereInput = {
      status: { in: [ProductStatus.ACTIVE, ProductStatus.OUT_OF_STOCK] },
      ...(params.q ? { title: { contains: params.q, mode: 'insensitive' } } : {}),
      ...(params.categoryId ? { categoryId: params.categoryId } : {}),
      ...(Object.keys(priceFilter).length > 0 ? { price: priceFilter } : {}),
    };

    const orderBy: Prisma.ProductOrderByWithRelationInput[] =
      params.sort === 'price_asc'
        ? [{ price: 'asc' }, { id: 'desc' }]
        : params.sort === 'price_desc'
          ? [{ price: 'desc' }, { id: 'desc' }]
          : [{ createdAt: 'desc' }, { id: 'desc' }];

    const [items, total] = await Promise.all([
      this.prisma.product.findMany({
        where,
        orderBy,
        skip: params.skip,
        take: params.take,
        include: { images: { orderBy: { displayOrder: 'asc' } } },
      }),
      this.prisma.product.count({ where }),
    ]);

    return { items, total };
  }

  // ── Variant ───────────────────────────────────────────────────────

  async findVariantById(id: string): Promise<Variant | null> {
    return this.prisma.variant.findUnique({ where: { id } });
  }

  async findVariantWithProduct(
    id: string,
  ): Promise<(Variant & { product: Product }) | null> {
    return this.prisma.variant.findUnique({
      where: { id },
      include: { product: true },
    });
  }

  async findVariantsWithProduct(
    ids: string[],
  ): Promise<(Variant & { product: Product })[]> {
    return this.prisma.variant.findMany({
      where: { id: { in: ids } },
      include: { product: true },
    });
  }

  async createVariant(data: {
    productId: string;
    optionName: string;
    optionValue: string;
    sku: string;
    price: Prisma.Decimal | number | string;
  }): Promise<Variant> {
    return this.prisma.variant.create({ data });
  }

  async updateVariant(
    id: string,
    data: {
      optionName?: string;
      optionValue?: string;
      sku?: string;
      price?: Prisma.Decimal | number | string;
    },
  ): Promise<Variant> {
    return this.prisma.variant.update({ where: { id }, data });
  }

  async deleteVariant(id: string): Promise<void> {
    await this.prisma.variant.delete({ where: { id } });
  }

  // ── ProductImage ─────────────────────────────────────────────────

  async countImages(productId: string): Promise<number> {
    return this.prisma.productImage.count({ where: { productId } });
  }

  async createImage(data: {
    productId: string;
    url: string;
    displayOrder?: number;
  }): Promise<ProductImage> {
    return this.prisma.productImage.create({ data });
  }

  async deleteImage(id: string): Promise<void> {
    await this.prisma.productImage.delete({ where: { id } });
  }
}
