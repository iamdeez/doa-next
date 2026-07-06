import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiOkResponse } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../shared/auth/jwt-auth.guard';
import { CurrentUser } from '../../shared/auth/current-user.decorator';
import { AuthenticatedUser } from '../../shared/auth/jwt.strategy';
import { ProductService } from '../product/product.service';
import { SellerService } from '../seller/seller.service';
import { InventoryStockResponse } from './dto/inventory-stock-response.dto';
import { StockInDto } from './dto/stock-in.dto';
import { InventoryService } from './inventory.service';

@Controller('inventory')
@UseGuards(JwtAuthGuard)
export class InventoryController {
  constructor(
    private readonly inventoryService: InventoryService,
    private readonly sellerService: SellerService,
    private readonly productService: ProductService,
  ) {}

  /**
   * POST /inventory/:variantId/stock-in — 재고 입고, 응답 구조화 (017 — APPROVED 판매자 + 소유
   * variant, SEC-002). 상태코드 200 불변(기존 계약 유지, body 만 확장).
   */
  @Post(':variantId/stock-in')
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ type: InventoryStockResponse })
  async stockIn(
    @CurrentUser() user: AuthenticatedUser,
    @Param('variantId') variantId: string,
    @Body() dto: StockInDto,
  ) {
    // APPROVED 판매자 검증
    await this.sellerService.getApprovedSeller(user.userId);
    // SEC-002: variantId → product.sellerId 소유권 검증
    await this.productService.assertSellerOwnsVariant(user.userId, variantId);
    return this.inventoryService.stockIn(variantId, dto.quantity);
  }

  /**
   * GET /inventory/:variantId/stock — 재고 수량 조회, 응답 구조화 (017 — APPROVED 판매자 + 소유
   * variant, SEC-002).
   */
  @Get(':variantId/stock')
  @ApiOkResponse({ type: InventoryStockResponse })
  async getStock(
    @CurrentUser() user: AuthenticatedUser,
    @Param('variantId') variantId: string,
  ) {
    await this.sellerService.getApprovedSeller(user.userId);
    // SEC-002: 소유권 검증
    await this.productService.assertSellerOwnsVariant(user.userId, variantId);
    return this.inventoryService.getStockView(variantId);
  }
}
