import { ApiProperty } from '@nestjs/swagger';
import { SellerStatus } from '@prisma/client';

/** 판매자 프로필 응답 DTO (문서 전용). 관리자 승인 대기 목록·승인 처리 응답에 사용. */
export class SellerProfileResponse {
  @ApiProperty()
  id!: string;

  @ApiProperty({ description: 'cross-schema plain String — users.users.id (P-001)' })
  userId!: string;

  @ApiProperty()
  businessName!: string;

  @ApiProperty()
  businessNumber!: string;

  @ApiProperty()
  representativeName!: string;

  @ApiProperty({ required: false, nullable: true })
  contactPhone?: string | null;

  @ApiProperty({ required: false, nullable: true })
  businessAddress?: string | null;

  @ApiProperty({ enum: SellerStatus })
  status!: SellerStatus;

  @ApiProperty({ required: false, nullable: true })
  rejectReason?: string | null;

  @ApiProperty({ type: String, format: 'date-time' })
  createdAt!: string;
}
