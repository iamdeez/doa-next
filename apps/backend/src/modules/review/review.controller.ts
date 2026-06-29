import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiOkResponse } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../shared/auth/jwt-auth.guard';
import { AuthenticatedUser } from '../../shared/auth/jwt.strategy';
import { ReviewService } from './review.service';
import { CreateReviewDto } from './dto/create-review.dto';
import { UpdateReviewDto } from './dto/update-review.dto';
import { ListReviewsDto } from './dto/list-review.dto';
import { ReviewListResponse, ReviewResponse } from './dto/review-response.dto';

interface AuthenticatedRequest {
  user: AuthenticatedUser;
}

// ── 리뷰 CRUD (인증 필요) ──────────────────────────────────────────────────

@Controller('reviews')
@UseGuards(JwtAuthGuard)
export class ReviewController {
  constructor(private readonly reviewService: ReviewService) {}

  /** POST /reviews — 리뷰 작성 (FR-021~FR-023) */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOkResponse({ type: ReviewResponse })
  async createReview(
    @Req() req: AuthenticatedRequest,
    @Body() dto: CreateReviewDto,
  ) {
    return this.reviewService.createReview(req.user.userId, {
      orderItemId: dto.orderItemId,
      rating: dto.rating,
      content: dto.content,
    });
  }

  /** PATCH /reviews/:id — 리뷰 수정 (FR-024) */
  @Patch(':id')
  @ApiOkResponse({ type: ReviewResponse })
  async updateReview(
    @Req() req: AuthenticatedRequest,
    @Param('id') reviewId: string,
    @Body() dto: UpdateReviewDto,
  ) {
    return this.reviewService.updateReview(req.user.userId, reviewId, dto);
  }

  /** DELETE /reviews/:id — 리뷰 삭제 (FR-024) */
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteReview(
    @Req() req: AuthenticatedRequest,
    @Param('id') reviewId: string,
  ) {
    await this.reviewService.deleteReview(req.user.userId, reviewId);
  }

  /** GET /reviews/me — 내 리뷰 목록 (FR-026) */
  @Get('me')
  @ApiOkResponse({ type: ReviewListResponse })
  async listMyReviews(
    @Req() req: AuthenticatedRequest,
    @Query() query: ListReviewsDto,
  ) {
    return this.reviewService.listMyReviews(
      req.user.userId,
      query.cursor,
      query.take,
    );
  }
}

// ── 상품별 리뷰 목록 (인증 불필요) ────────────────────────────────────────

@Controller('products/:productId/reviews')
export class ProductReviewController {
  constructor(private readonly reviewService: ReviewService) {}

  /** GET /products/:productId/reviews — 상품 리뷰 목록 (FR-025) */
  @Get()
  @ApiOkResponse({ type: ReviewListResponse })
  async listProductReviews(
    @Param('productId') productId: string,
    @Query() query: ListReviewsDto,
  ) {
    return this.reviewService.listProductReviews(productId, query.cursor, query.take);
  }
}
