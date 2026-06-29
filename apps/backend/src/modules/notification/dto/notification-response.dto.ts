import { ApiProperty } from '@nestjs/swagger';
import { NotificationType } from '@prisma/client';

/** 알림 도메인 응답 DTO (문서 전용). */
export class NotificationResponse {
  @ApiProperty()
  id!: string;

  @ApiProperty({ description: 'cross-schema plain String — users.users.id (P-001)' })
  userId!: string;

  @ApiProperty({ enum: NotificationType })
  type!: NotificationType;

  @ApiProperty()
  title!: string;

  @ApiProperty()
  body!: string;

  @ApiProperty()
  isRead!: boolean;

  @ApiProperty({ type: String, format: 'date-time' })
  createdAt!: string;
}

/** GET /notifications — offset 페이지네이션. */
export class NotificationListResponse {
  @ApiProperty({ type: [NotificationResponse] })
  items!: NotificationResponse[];

  @ApiProperty()
  total!: number;

  @ApiProperty()
  page!: number;

  @ApiProperty()
  size!: number;
}

/** PATCH /notifications/read-all — 전체 읽음 처리 결과. */
export class MarkAllReadResponse {
  @ApiProperty({ description: '읽음 처리된 건수' })
  updated!: number;
}
