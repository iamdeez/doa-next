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
  UseGuards,
} from '@nestjs/common';
import { ApiOkResponse } from '@nestjs/swagger';
import { AdminGuard } from '../../shared/auth/admin.guard';
import { JwtAuthGuard } from '../../shared/auth/jwt-auth.guard';
import { BannerService, UpdateBannerInput } from './banner.service';
import { CreateBannerDto } from './dto/create-banner.dto';
import { UpdateBannerDto } from './dto/update-banner.dto';
import { BannerResponse } from './dto/banner-response.dto';

// ── 관리자 배너 관리 API ─────────────────────────────────────────────

@Controller('admin/banners')
@UseGuards(JwtAuthGuard, AdminGuard)
export class AdminBannerController {
  constructor(private readonly bannerService: BannerService) {}

  /** POST /admin/banners — 배너 생성 */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOkResponse({ type: BannerResponse })
  async create(@Body() dto: CreateBannerDto) {
    return this.bannerService.create({
      title: dto.title,
      imageUrl: dto.imageUrl,
      linkUrl: dto.linkUrl,
      position: dto.position,
      sortOrder: dto.sortOrder,
      isActive: dto.isActive,
      startsAt: dto.startsAt ? new Date(dto.startsAt) : undefined,
      endsAt: dto.endsAt ? new Date(dto.endsAt) : undefined,
    });
  }

  /** PATCH /admin/banners/:id — 배너 부분 수정 */
  @Patch(':id')
  @ApiOkResponse({ type: BannerResponse })
  async update(@Param('id') id: string, @Body() dto: UpdateBannerDto) {
    // 전달된 키만 반영 (PATCH 시맨틱) — undefined 필드는 전파하지 않는다.
    const input: UpdateBannerInput = {};
    if (dto.title !== undefined) input.title = dto.title;
    if (dto.imageUrl !== undefined) input.imageUrl = dto.imageUrl;
    if (dto.linkUrl !== undefined) input.linkUrl = dto.linkUrl;
    if (dto.position !== undefined) input.position = dto.position;
    if (dto.sortOrder !== undefined) input.sortOrder = dto.sortOrder;
    if (dto.isActive !== undefined) input.isActive = dto.isActive;
    if (dto.startsAt !== undefined) {
      input.startsAt = dto.startsAt === null ? null : new Date(dto.startsAt);
    }
    if (dto.endsAt !== undefined) {
      input.endsAt = dto.endsAt === null ? null : new Date(dto.endsAt);
    }
    return this.bannerService.update(id, input);
  }

  /** DELETE /admin/banners/:id — 배너 삭제 */
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@Param('id') id: string) {
    await this.bannerService.remove(id);
  }

  /** GET /admin/banners — 전체 목록 (관리자) */
  @Get()
  @ApiOkResponse({ type: [BannerResponse] })
  async listAll() {
    return this.bannerService.listAll();
  }
}

// ── 공개 배너 조회 API ───────────────────────────────────────────────

@Controller('banners')
export class BannerController {
  constructor(private readonly bannerService: BannerService) {}

  /** GET /banners — 활성 + 노출기간 내 배너만 sortOrder 순 (공개, 인증 불필요) */
  @Get()
  @ApiOkResponse({ type: [BannerResponse] })
  async listPublic() {
    return this.bannerService.listPublic();
  }
}
