import { ApiProperty } from '@nestjs/swagger';
import { CouponIssuerType, CouponType, UserCouponStatus } from '@prisma/client';

/**
 * 쿠폰 도메인 읽기 응답 DTO (문서 전용 — 런타임 변환 없음).
 * 금전 필드(discountValue·maxDiscountAmount·minOrderAmount)는 Decimal → 문자열(P-005).
 * PERCENTAGE 쿠폰의 discountValue 는 할인율(정수 1~100)이나 직렬화상 문자열이다.
 */
export class CouponResponse {
  @ApiProperty()
  id!: string;

  @ApiProperty({ enum: CouponIssuerType })
  issuerType!: CouponIssuerType;

  @ApiProperty({ description: 'ADMIN: admin userId, SELLER: users.sellers.id (P-001)' })
  issuerId!: string;

  @ApiProperty({ enum: CouponType })
  type!: CouponType;

  @ApiProperty({ type: String, example: '5000.00', description: '금전/할인율 — Decimal 직렬화 문자열 (P-005)' })
  discountValue!: string;

  @ApiProperty({ type: String, required: false, nullable: true, description: '금전 — PERCENTAGE 최대 할인 상한 (P-005)' })
  maxDiscountAmount?: string | null;

  @ApiProperty({ type: String, required: false, nullable: true, description: '금전 — 최소 주문 금액 (P-005)' })
  minOrderAmount?: string | null;

  @ApiProperty({ type: String, format: 'date-time' })
  expiresAt!: string;

  @ApiProperty({ required: false, nullable: true, description: '발급 한도 (null=무제한)' })
  totalQuantity?: number | null;

  @ApiProperty()
  issuedCount!: number;

  @ApiProperty({ required: false, nullable: true })
  description?: string | null;

  @ApiProperty({ type: String, format: 'date-time' })
  createdAt!: string;
}

/** GET /sellers/me/coupons · GET /admin/coupons — cursor 페이지네이션. */
export class CouponListResponse {
  @ApiProperty({ type: [CouponResponse] })
  items!: CouponResponse[];

  @ApiProperty({ type: String, required: false, nullable: true })
  nextCursor!: string | null;
}

/** GET /users/me/coupons — 보유 쿠폰(마스터 coupon 포함). 배열 반환. */
export class UserCouponResponse {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  couponId!: string;

  @ApiProperty({ enum: UserCouponStatus })
  status!: UserCouponStatus;

  @ApiProperty({ required: false, nullable: true, description: '사용된 주문 id (FR-016)' })
  usedOrderId?: string | null;

  @ApiProperty({ type: String, format: 'date-time' })
  createdAt!: string;

  @ApiProperty({ type: CouponResponse })
  coupon!: CouponResponse;
}
