import {
  Controller,
  Get,
  Param,
  Patch,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiOkResponse } from '@nestjs/swagger';
import { CurrentUser } from '../../shared/auth/current-user.decorator';
import { JwtAuthGuard } from '../../shared/auth/jwt-auth.guard';
import { AuthenticatedUser } from '../../shared/auth/jwt.strategy';
import { ListNotificationsDto } from './dto/list-notifications.dto';
import { NotificationService } from './notification.service';
import {
  MarkAllReadResponse,
  NotificationListResponse,
  NotificationResponse,
} from './dto/notification-response.dto';

/** /notifications — 본인 알림 조회·읽음 처리 (인증 필수) */
@Controller('notifications')
@UseGuards(JwtAuthGuard)
export class NotificationController {
  constructor(private readonly notificationService: NotificationService) {}

  /** GET /notifications — 본인 알림 목록 (미읽음 우선/최신순) */
  @Get()
  @ApiOkResponse({ type: NotificationListResponse })
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: ListNotificationsDto,
  ) {
    return this.notificationService.list(user.userId, query.page, query.size);
  }

  /** PATCH /notifications/read-all — 본인 전체 읽음 */
  @Patch('read-all')
  @ApiOkResponse({ type: MarkAllReadResponse })
  markAllRead(@CurrentUser() user: AuthenticatedUser) {
    return this.notificationService.markAllRead(user.userId);
  }

  /** PATCH /notifications/:id/read — 본인 알림 읽음 처리 */
  @Patch(':id/read')
  @ApiOkResponse({ type: NotificationResponse })
  markRead(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    return this.notificationService.markRead(user.userId, id);
  }
}
