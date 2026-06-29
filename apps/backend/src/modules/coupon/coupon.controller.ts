import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { ApiOkResponse } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../shared/auth/jwt-auth.guard';
import { AdminGuard } from '../../shared/auth/admin.guard';
import { AuthenticatedUser } from '../../shared/auth/jwt.strategy';
import { CouponService } from './coupon.service';
import { CreateCouponDto } from './dto/create-coupon.dto';
import { IssueCouponDto } from './dto/issue-coupon.dto';
import { ListCouponsDto, ListUserCouponsDto } from './dto/list-coupon.dto';
import {
  CouponListResponse,
  CouponResponse,
  UserCouponResponse,
} from './dto/coupon-response.dto';

interface AuthenticatedRequest {
  user: AuthenticatedUser;
}

// ── 관리자 쿠폰 API ─────────────────────────────────────────────────────────

@Controller('admin/coupons')
@UseGuards(JwtAuthGuard, AdminGuard)
export class AdminCouponController {
  constructor(private readonly couponService: CouponService) {}

  /** POST /admin/coupons — 관리자 쿠폰 생성 (FR-001) */
  @Post()
  @ApiOkResponse({ type: CouponResponse })
  async createCoupon(
    @Req() req: AuthenticatedRequest,
    @Body() dto: CreateCouponDto,
  ) {
    return this.couponService.createCoupon(req.user.userId, {
      type: dto.type,
      discountValue: new Prisma.Decimal(dto.discountValue),
      maxDiscountAmount: dto.maxDiscountAmount
        ? new Prisma.Decimal(dto.maxDiscountAmount)
        : null,
      minOrderAmount: dto.minOrderAmount
        ? new Prisma.Decimal(dto.minOrderAmount)
        : null,
      expiresAt: new Date(dto.expiresAt),
      totalQuantity: dto.totalQuantity ?? null,
      description: dto.description ?? null,
    });
  }

  /** GET /admin/coupons — 관리자 쿠폰 목록 (FR-007) */
  @Get()
  @ApiOkResponse({ type: CouponListResponse })
  async listCoupons(
    @Req() req: AuthenticatedRequest,
    @Query() query: ListCouponsDto,
  ) {
    return this.couponService.listAdminCoupons(
      req.user.userId,
      query.cursor,
      query.take,
    );
  }

  /** POST /admin/coupons/:id/issue — 관리자 발급 (FR-003) */
  @Post(':id/issue')
  @ApiOkResponse({ type: UserCouponResponse })
  async issueCoupon(
    @Req() req: AuthenticatedRequest,
    @Param('id') couponId: string,
    @Body() dto: IssueCouponDto,
  ) {
    return this.couponService.issueByAdmin(
      req.user.userId,
      couponId,
      dto.targetUserId,
    );
  }
}

// ── 판매자 쿠폰 API ─────────────────────────────────────────────────────────

@Controller('sellers/me/coupons')
@UseGuards(JwtAuthGuard)
export class SellerCouponController {
  constructor(private readonly couponService: CouponService) {}

  /** POST /sellers/me/coupons — 판매자 쿠폰 생성 (FR-002) */
  @Post()
  @ApiOkResponse({ type: CouponResponse })
  async createCoupon(
    @Req() req: AuthenticatedRequest,
    @Body() dto: CreateCouponDto,
  ) {
    return this.couponService.createSellerCoupon(req.user.userId, {
      type: dto.type,
      discountValue: new Prisma.Decimal(dto.discountValue),
      maxDiscountAmount: dto.maxDiscountAmount
        ? new Prisma.Decimal(dto.maxDiscountAmount)
        : null,
      minOrderAmount: dto.minOrderAmount
        ? new Prisma.Decimal(dto.minOrderAmount)
        : null,
      expiresAt: new Date(dto.expiresAt),
      totalQuantity: dto.totalQuantity ?? null,
      description: dto.description ?? null,
    });
  }

  /** GET /sellers/me/coupons — 판매자 쿠폰 목록 (FR-006) */
  @Get()
  @ApiOkResponse({ type: CouponListResponse })
  async listCoupons(
    @Req() req: AuthenticatedRequest,
    @Query() query: ListCouponsDto,
  ) {
    return this.couponService.listSellerCoupons(
      req.user.userId,
      query.cursor,
      query.take,
    );
  }

  /** POST /sellers/me/coupons/:id/issue — 판매자 발급 (FR-004) */
  @Post(':id/issue')
  @ApiOkResponse({ type: UserCouponResponse })
  async issueCoupon(
    @Req() req: AuthenticatedRequest,
    @Param('id') couponId: string,
    @Body() dto: IssueCouponDto,
  ) {
    return this.couponService.issueBySeller(
      req.user.userId,
      couponId,
      dto.targetUserId,
    );
  }
}

// ── 사용자 쿠폰 API ─────────────────────────────────────────────────────────

@Controller('users/me/coupons')
@UseGuards(JwtAuthGuard)
export class UserCouponController {
  constructor(private readonly couponService: CouponService) {}

  /** GET /users/me/coupons — 내 쿠폰 목록 (FR-005) */
  @Get()
  @ApiOkResponse({ type: [UserCouponResponse] })
  async listMyCoupons(
    @Req() req: AuthenticatedRequest,
    @Query() query: ListUserCouponsDto,
  ) {
    return this.couponService.listMyCoupons(req.user.userId, query.status);
  }
}
