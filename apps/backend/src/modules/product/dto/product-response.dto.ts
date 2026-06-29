import { ApiProperty } from '@nestjs/swagger';
import { ProductStatus } from '@prisma/client';

/**
 * 상품 도메인 공개 읽기 응답 DTO (문서 전용 — 런타임 변환 없음).
 *
 * 컨트롤러는 Prisma 엔티티를 그대로 반환하므로 이 클래스들은 OpenAPI 응답 스키마
 * 생성만을 목적으로 한다(@ApiOkResponse({ type })로 라우트에 부착). 프론트 codegen
 * (openapi-typescript)이 이 스키마를 타입으로 가져가 전이형 view 타입을 점진 대체한다.
 *
 * 금전 필드(price)는 Prisma Decimal → JSON 직렬화상 **문자열**이다(P-005, NFR-004).
 */
export class ProductImageResponse {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  productId!: string;

  @ApiProperty()
  url!: string;

  @ApiProperty()
  displayOrder!: number;
}

export class VariantResponse {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  productId!: string;

  @ApiProperty()
  optionName!: string;

  @ApiProperty()
  optionValue!: string;

  @ApiProperty()
  sku!: string;

  @ApiProperty({ type: String, example: '30000.00', description: '금전 — Decimal 직렬화 문자열 (P-005)' })
  price!: string;
}

export class CategoryResponse {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty()
  slug!: string;

  @ApiProperty()
  displayOrder!: number;
}

/** 목록/검색 카드 공통 상품 필드. */
export class ProductSummaryResponse {
  @ApiProperty()
  id!: string;

  @ApiProperty({ description: 'cross-schema plain String — users.sellers.id (P-001)' })
  sellerId!: string;

  @ApiProperty()
  categoryId!: string;

  @ApiProperty()
  title!: string;

  @ApiProperty({ required: false, nullable: true })
  description?: string | null;

  @ApiProperty({ type: String, example: '30000.00', description: '금전 — Decimal 직렬화 문자열 (P-005)' })
  price!: string;

  @ApiProperty({ enum: ProductStatus })
  status!: ProductStatus;

  @ApiProperty({ type: String, format: 'date-time' })
  createdAt!: string;
}

/** GET /search/products 항목 — 카드 썸네일용 images 포함. */
export class ProductCardResponse extends ProductSummaryResponse {
  @ApiProperty({ type: [ProductImageResponse] })
  images!: ProductImageResponse[];
}

/** GET /products/:id — 상세(images + variants 포함). */
export class ProductDetailResponse extends ProductSummaryResponse {
  @ApiProperty({ type: [ProductImageResponse] })
  images!: ProductImageResponse[];

  @ApiProperty({ type: [VariantResponse] })
  variants!: VariantResponse[];
}

/** GET /products — cursor 페이지네이션 목록. */
export class ProductListResponse {
  @ApiProperty({ type: [ProductSummaryResponse] })
  items!: ProductSummaryResponse[];

  @ApiProperty({ type: String, required: false, nullable: true, description: '다음 페이지 cursor (없으면 null)' })
  nextCursor!: string | null;
}

/** GET /search/products — offset 페이지네이션 결과. */
export class SearchProductsResponse {
  @ApiProperty({ type: [ProductCardResponse] })
  items!: ProductCardResponse[];

  @ApiProperty()
  total!: number;

  @ApiProperty()
  page!: number;

  @ApiProperty()
  size!: number;
}
