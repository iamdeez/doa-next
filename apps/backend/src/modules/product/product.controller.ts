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
  UseGuards,
} from '@nestjs/common';
import { ApiOkResponse } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../shared/auth/jwt-auth.guard';
import { OptionalJwtAuthGuard } from '../../shared/auth/optional-jwt-auth.guard';
import { CurrentUser } from '../../shared/auth/current-user.decorator';
import { AuthenticatedUser } from '../../shared/auth/jwt.strategy';
import {
  CategoryResponse,
  ProductDetailResponse,
  ProductListResponse,
} from './dto/product-response.dto';
import { AddImageDto } from './dto/add-image.dto';
import { CreateProductDto } from './dto/create-product.dto';
import { CreateVariantDto } from './dto/create-variant.dto';
import { ListProductsDto } from './dto/list-products.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { UpdateVariantDto } from './dto/update-variant.dto';
import { ProductService } from './product.service';

/** /categories — 인증 불필요 */
@Controller('categories')
export class CategoriesController {
  constructor(private readonly productService: ProductService) {}

  @Get()
  @ApiOkResponse({ type: [CategoryResponse] })
  listCategories() {
    return this.productService.listCategories();
  }
}

/** /sellers/me/products — 승인 판매자 본인 상품 목록 */
@Controller('sellers/me')
@UseGuards(JwtAuthGuard)
export class SellerProductController {
  constructor(private readonly productService: ProductService) {}

  @Get('products')
  listMyProducts(@CurrentUser() user: AuthenticatedUser) {
    return this.productService.listMyProducts(user.userId);
  }
}

/** /products — 상품 CRUD 및 public 조회 */
@Controller('products')
export class ProductController {
  constructor(private readonly productService: ProductService) {}

  // ── Public endpoints (no auth) ───────────────────────────────────────

  /** GET /products — cursor 기반 공개 목록 (ACTIVE+OUT_OF_STOCK) */
  @Get()
  @ApiOkResponse({ type: ProductListResponse })
  listPublic(@Query() query: ListProductsDto) {
    return this.productService.listPublic(query.cursor, query.limit);
  }

  /** GET /products/:id — 상세 조회, 인증 시 조회 기록 */
  @Get(':id')
  @UseGuards(OptionalJwtAuthGuard)
  @ApiOkResponse({ type: ProductDetailResponse })
  getDetail(
    @Param('id') productId: string,
    @CurrentUser() user?: AuthenticatedUser,
  ) {
    return this.productService.getDetail(productId, user);
  }

  // ── Authenticated endpoints ──────────────────────────────────────────

  /** POST /products — DRAFT 상품 생성 (APPROVED 판매자만) */
  @Post()
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.CREATED)
  createProduct(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateProductDto,
  ) {
    return this.productService.createProduct(user.userId, dto);
  }

  /** PATCH /products/:id — 상품 수정 (소유자만) */
  @Patch(':id')
  @UseGuards(JwtAuthGuard)
  updateProduct(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') productId: string,
    @Body() dto: UpdateProductDto,
  ) {
    return this.productService.updateProduct(user.userId, productId, dto);
  }

  /** PATCH /products/:id/publish — DRAFT/INACTIVE → ACTIVE */
  @Patch(':id/publish')
  @UseGuards(JwtAuthGuard)
  publish(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') productId: string,
  ) {
    return this.productService.publish(user.userId, productId);
  }

  /** PATCH /products/:id/deactivate — ACTIVE/OUT_OF_STOCK → INACTIVE */
  @Patch(':id/deactivate')
  @UseGuards(JwtAuthGuard)
  deactivate(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') productId: string,
  ) {
    return this.productService.deactivate(user.userId, productId);
  }

  // ── Variants ─────────────────────────────────────────────────────────

  /** POST /products/:id/variants — variant 생성 + initStock */
  @Post(':id/variants')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.CREATED)
  addVariant(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') productId: string,
    @Body() dto: CreateVariantDto,
  ) {
    return this.productService.addVariant(user.userId, productId, dto);
  }

  /** PATCH /products/:id/variants/:variantId — variant 수정 */
  @Patch(':id/variants/:variantId')
  @UseGuards(JwtAuthGuard)
  updateVariant(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') productId: string,
    @Param('variantId') variantId: string,
    @Body() dto: UpdateVariantDto,
  ) {
    return this.productService.updateVariant(user.userId, productId, variantId, dto);
  }

  /** DELETE /products/:id/variants/:variantId — variant 삭제 */
  @Delete(':id/variants/:variantId')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  deleteVariant(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') productId: string,
    @Param('variantId') variantId: string,
  ) {
    return this.productService.deleteVariant(user.userId, productId, variantId);
  }

  // ── Images ───────────────────────────────────────────────────────────

  /** POST /products/:id/images — 이미지 추가, 10개 초과 → 400 */
  @Post(':id/images')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.CREATED)
  addImage(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') productId: string,
    @Body() dto: AddImageDto,
  ) {
    return this.productService.addImage(user.userId, productId, dto);
  }

  /** DELETE /products/:id/images/:imageId — 이미지 삭제 */
  @Delete(':id/images/:imageId')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  deleteImage(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') productId: string,
    @Param('imageId') imageId: string,
  ) {
    return this.productService.deleteImage(user.userId, productId, imageId);
  }
}
