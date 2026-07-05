import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiOkResponse } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import { AdminGuard } from '../../shared/auth/admin.guard';
import { JwtAuthGuard } from '../../shared/auth/jwt-auth.guard';
import { CurrentUser } from '../../shared/auth/current-user.decorator';
import { AuthenticatedUser } from '../../shared/auth/jwt.strategy';
import { ListQueryDto } from '../../shared/dto/list-query.dto';
import { AdminService } from './admin.service';
import { SellerProfileResponse } from '../seller/dto/seller-response.dto';
import { AdminSellerListQueryDto } from './dto/admin-seller-list-query.dto';
import {
  AdminAuditLogResponse,
  AdminSellerListResponse,
  AdminUserListResponse,
} from './dto/admin-response.dto';

// ── 관리자 운영 API (운영 조회/조치) ─────────────────────────────────

@Controller('admin')
@UseGuards(JwtAuthGuard, AdminGuard)
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  /**
   * GET /admin/sellers/pending — 판매자 목록 (017).
   * status 미지정 시 PENDING(하위 호환). cursor·limit·q(businessName 부분 일치) 지원.
   */
  @Get('sellers/pending')
  @SkipThrottle()
  @ApiOkResponse({ type: AdminSellerListResponse })
  async listPendingSellers(@Query() query: AdminSellerListQueryDto) {
    return this.adminService.listSellers(
      query.status,
      query.cursor,
      query.limit,
      query.q,
    );
  }

  /** POST /admin/sellers/:id/approve — 판매자 승인 (seller 도메인 재사용) + 감사 로그 기록 */
  @Post('sellers/:id/approve')
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ type: SellerProfileResponse })
  async approveSeller(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') sellerId: string,
  ) {
    return this.adminService.approveSeller(user.userId, sellerId);
  }

  /** GET /admin/users — 사용자 목록 (cursor 페이지네이션) */
  @Get('users')
  @SkipThrottle()
  @ApiOkResponse({ type: AdminUserListResponse })
  async listUsers(@Query() query: ListQueryDto) {
    return this.adminService.listUsers(query.cursor, query.limit);
  }

  /** GET /admin/audit-logs — 관리자 조치 감사 로그 (최신순, 013) */
  @Get('audit-logs')
  @SkipThrottle()
  @ApiOkResponse({ type: [AdminAuditLogResponse] })
  async listAuditLogs(@Query() query: ListQueryDto) {
    return this.adminService.listAuditLogs(query.limit);
  }
}
