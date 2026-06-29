import { ApiProperty } from '@nestjs/swagger';

/**
 * 리뷰 도메인 읽기 응답 DTO (문서 전용 — 런타임 변환 없음).
 * 모든 cross-schema 참조는 plain String(P-001 경계).
 */
export class ReviewResponse {
  @ApiProperty()
  id!: string;

  @ApiProperty({ description: 'orders.order_items.id — 1 orderItem 1 리뷰 (P-001)' })
  orderItemId!: string;

  @ApiProperty()
  orderId!: string;

  @ApiProperty()
  userId!: string;

  @ApiProperty()
  productId!: string;

  @ApiProperty({ description: 'users.sellers.id (P-001)' })
  sellerId!: string;

  @ApiProperty({ minimum: 1, maximum: 5, description: '평점 1~5' })
  rating!: number;

  @ApiProperty()
  content!: string;

  @ApiProperty({ type: String, format: 'date-time' })
  createdAt!: string;

  @ApiProperty({ type: String, format: 'date-time' })
  updatedAt!: string;
}

/** GET /products/:id/reviews · GET /reviews/me — cursor 페이지네이션. */
export class ReviewListResponse {
  @ApiProperty({ type: [ReviewResponse] })
  items!: ReviewResponse[];

  @ApiProperty({ type: String, required: false, nullable: true })
  nextCursor!: string | null;
}
