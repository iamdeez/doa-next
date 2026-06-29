import { ApiProperty } from '@nestjs/swagger';

/**
 * 통계 도메인 응답 DTO (문서 전용). 금전 필드(totalSales·salesTotal)는 Decimal → 문자열(P-005).
 */
export class PlatformOverviewResponse {
  @ApiProperty()
  totalOrders!: number;

  @ApiProperty()
  completedOrders!: number;

  @ApiProperty({ type: String, example: '1000000.00', description: '금전 — 완료 주문 총 매출 (P-005)' })
  totalSales!: string;

  @ApiProperty()
  totalUsers!: number;

  @ApiProperty()
  totalSellers!: number;
}

export class SellerStatsResponse {
  @ApiProperty({ type: String, example: '500000.00', description: '금전 — 판매자 매출 합계 (P-005)' })
  salesTotal!: string;

  @ApiProperty()
  orderCount!: number;
}
