import { ApiProperty } from '@nestjs/swagger';
import { BannerPosition } from '@prisma/client';

/** 배너 도메인 응답 DTO (문서 전용). */
export class BannerResponse {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  title!: string;

  @ApiProperty()
  imageUrl!: string;

  @ApiProperty({ required: false, nullable: true })
  linkUrl?: string | null;

  @ApiProperty({ enum: BannerPosition })
  position!: BannerPosition;

  @ApiProperty()
  sortOrder!: number;

  @ApiProperty()
  isActive!: boolean;

  @ApiProperty({ type: String, format: 'date-time', required: false, nullable: true })
  startsAt?: string | null;

  @ApiProperty({ type: String, format: 'date-time', required: false, nullable: true })
  endsAt?: string | null;

  @ApiProperty({ type: String, format: 'date-time' })
  createdAt!: string;
}
