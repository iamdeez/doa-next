import { ApiProperty } from '@nestjs/swagger';

/**
 * 관리자 도메인 응답 DTO (문서 전용). 사용자 목록은 password 등 민감 필드 제외 안전 요약.
 */
export class AdminUserResponse {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  email!: string;

  @ApiProperty({ required: false, nullable: true })
  name?: string | null;

  @ApiProperty({ required: false, nullable: true })
  phone?: string | null;

  @ApiProperty({ type: String, format: 'date-time' })
  createdAt!: string;
}

/** GET /admin/users — cursor 페이지네이션. */
export class AdminUserListResponse {
  @ApiProperty({ type: [AdminUserResponse] })
  items!: AdminUserResponse[];

  @ApiProperty({ type: String, required: false, nullable: true })
  nextCursor!: string | null;
}

/** GET /admin/audit-logs — append-only 감사 로그(013). */
export class AdminAuditLogResponse {
  @ApiProperty()
  id!: string;

  @ApiProperty({ description: '조치 수행 관리자 userId (P-001)' })
  adminId!: string;

  @ApiProperty({ description: '조치 종류 (예: SELLER_APPROVE)' })
  action!: string;

  @ApiProperty({ description: '대상 엔티티 종류 (예: SELLER, BANNER, USER)' })
  targetType!: string;

  @ApiProperty()
  targetId!: string;

  @ApiProperty({ type: String, format: 'date-time' })
  createdAt!: string;
}
