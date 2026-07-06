import { ApiProperty } from '@nestjs/swagger';

/**
 * 사용자 도메인 읽기 응답 DTO (문서 전용 — 런타임 변환 없음).
 * 프로필은 password 등 민감 필드를 제외한 안전 요약만 반환한다.
 * 찜·최근 본 상품은 상품 요약(제목·가격·대표 이미지)을 포함한다(P-001 경계 —
 * ProductService.getPublicSummaries DI 조회, 017). 조회 불가 상품은
 * productAvailable:false + product:null 로 표시(데이터 유실로 오인되지 않도록 무음 필터링하지 않음).
 */
export class UserProfileResponse {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  email!: string;

  @ApiProperty({ required: false, nullable: true })
  name?: string | null;

  @ApiProperty({ required: false, nullable: true })
  phone?: string | null;
}

export class AddressResponse {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  userId!: string;

  @ApiProperty()
  recipientName!: string;

  @ApiProperty()
  phone!: string;

  @ApiProperty()
  zipCode!: string;

  @ApiProperty()
  address1!: string;

  @ApiProperty({ required: false, nullable: true })
  address2?: string | null;

  @ApiProperty()
  isDefault!: boolean;

  @ApiProperty({ type: String, format: 'date-time' })
  createdAt!: string;
}

/** 위시리스트·최근 본 상품 항목에 병합되는 상품 요약 (017). */
export class WishlistProductSummary {
  @ApiProperty()
  title!: string;

  @ApiProperty({ type: String, example: '30000.00', description: '금전 — Decimal 직렬화 문자열 (P-005)' })
  price!: string;

  @ApiProperty({ required: false, nullable: true })
  thumbnailUrl!: string | null;
}

/** GET /users/me/wishlist — 찜 항목(productId + 상품 요약, P-001). */
export class WishlistResponse {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  userId!: string;

  @ApiProperty({ description: 'cross-schema plain String — products.products.id (P-001)' })
  productId!: string;

  @ApiProperty({ type: String, format: 'date-time' })
  createdAt!: string;

  @ApiProperty({ description: '상품 조회 가능 여부 — false 면 삭제·DRAFT·INACTIVE 등' })
  productAvailable!: boolean;

  @ApiProperty({ required: false, nullable: true, type: () => WishlistProductSummary })
  product?: WishlistProductSummary | null;
}

/** GET /users/me/recent-views — 최근 본 상품(productId + 상품 요약, P-001). */
export class RecentViewResponse {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  userId!: string;

  @ApiProperty({ description: 'cross-schema plain String — products.products.id (P-001)' })
  productId!: string;

  @ApiProperty({ type: String, format: 'date-time' })
  viewedAt!: string;

  @ApiProperty({ description: '상품 조회 가능 여부 — false 면 삭제·DRAFT·INACTIVE 등' })
  productAvailable!: boolean;

  @ApiProperty({ required: false, nullable: true, type: () => WishlistProductSummary })
  product?: WishlistProductSummary | null;
}
