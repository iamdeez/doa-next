/**
 * ProductService 단위 테스트 — [env:unit]
 *
 * 대상 SC: SC-019~029, SC-032~040 (v1.0.0/002 spec) 계승
 *          SC-006~011 (v1.1.0/017 spec 신규 — getMyProductDetail·listMyProducts envelope 화)
 * (SC-030,031 은 product.events.spec.ts — inventory.stock-changed 이벤트)
 * 검증 방법: Jest mock (ProductRepository, SellerService, InventoryService, EventEmitter2)
 *
 * §F 마이그레이션 017 (tasks.md T017): listMyProducts 기존 array 단언(L~663) →
 * envelope {items,nextCursor} 단언 + listBySeller(sellerId, cursor, take) 호출 인자 반영.
 */

import { Test, TestingModule } from '@nestjs/testing';
import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';

import { ProductService } from './product.service';
import { ProductRepository } from './product.repository';
import { SellerService } from '../seller/seller.service';
import { InventoryService } from '../inventory/inventory.service';

// ─────────────────────────────────────────────
// Mock 팩토리 (production Repository/Service 메서드명 그대로)
// ─────────────────────────────────────────────
const mockProductRepository = {
  findCategories: jest.fn(),
  findCategoryById: jest.fn(),
  createProduct: jest.fn(),
  findById: jest.fn(),
  updateProduct: jest.fn(),
  updateStatus: jest.fn(),
  createVariant: jest.fn(),
  findVariantById: jest.fn(),
  updateVariant: jest.fn(),
  deleteVariant: jest.fn(),
  addImage: jest.fn(),       // 호환 별칭 (실제는 createImage)
  createImage: jest.fn(),
  countImages: jest.fn(),
  deleteImage: jest.fn(),
  listPublic: jest.fn(),
  listBySeller: jest.fn(),
  findPublicSummariesByIds: jest.fn(),
};

const mockSellerService = {
  getApprovedSeller: jest.fn(),
};

const mockInventoryService = {
  initStock: jest.fn(),
};

const mockEventEmitter = {
  emit: jest.fn(),
};

// ─────────────────────────────────────────────
// 고정 픽스처
// ─────────────────────────────────────────────
const FIXED_USER_ID = 'user-fixed-id';
const FIXED_SELLER_ID = 'seller-fixed-id';
const FIXED_PRODUCT_ID = 'product-fixed-id';
const FIXED_CATEGORY_ID = 'category-fixed-id';
const FIXED_VARIANT_ID = 'variant-fixed-id';
const FIXED_IMAGE_ID = 'image-fixed-id';

const FIXED_APPROVED_SELLER = {
  id: FIXED_SELLER_ID,
  userId: FIXED_USER_ID,
  status: 'APPROVED',
};

const FIXED_CATEGORY = {
  id: FIXED_CATEGORY_ID,
  name: '전자제품',
};

const FIXED_PRODUCT_DRAFT = {
  id: FIXED_PRODUCT_ID,
  sellerId: FIXED_SELLER_ID,
  title: '테스트 상품',
  description: '상품 설명',
  price: '10000',
  categoryId: FIXED_CATEGORY_ID,
  status: 'DRAFT',
  images: [],
  variants: [],
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
};

const FIXED_PRODUCT_ACTIVE = { ...FIXED_PRODUCT_DRAFT, status: 'ACTIVE' };
const FIXED_PRODUCT_INACTIVE = { ...FIXED_PRODUCT_DRAFT, status: 'INACTIVE' };
const FIXED_PRODUCT_OOS = { ...FIXED_PRODUCT_DRAFT, status: 'OUT_OF_STOCK' };

const FIXED_VARIANT = {
  id: FIXED_VARIANT_ID,
  productId: FIXED_PRODUCT_ID,
  optionName: '색상',
  optionValue: '빨강',
  sku: 'SKU-001',
  price: '10000',
  stock: 10,
};

const FIXED_IMAGE = {
  id: FIXED_IMAGE_ID,
  productId: FIXED_PRODUCT_ID,
  url: 'https://example.com/image.jpg',
  displayOrder: 1,
};

describe('ProductService', () => {
  let service: ProductService;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ProductService,
        { provide: ProductRepository, useValue: mockProductRepository },
        { provide: SellerService, useValue: mockSellerService },
        { provide: InventoryService, useValue: mockInventoryService },
        { provide: EventEmitter2, useValue: mockEventEmitter },
      ],
    }).compile();

    service = module.get<ProductService>(ProductService);
  });

  // ─────────────────────────────────────────────
  // SC-019: PENDING 판매자 POST /products → 403
  // ─────────────────────────────────────────────
  describe('SC-019: createProduct — PENDING 판매자 403', () => {
    it('when_pending_seller_creates_product_then_403', async () => {
      /**
       * SC-019 (FR-017 관련):
       * PENDING 상태 판매자가 POST /products 시도 시 ForbiddenException (403).
       * getApprovedSeller → ForbiddenException (PENDING/REJECTED 모두 해당).
       */
      mockSellerService.getApprovedSeller.mockRejectedValue(
        new ForbiddenException('Seller is not approved'),
      );

      await expect(
        service.createProduct(FIXED_USER_ID, {
          categoryId: FIXED_CATEGORY_ID,
          title: '상품',
          price: '10000',
        }),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  // ─────────────────────────────────────────────
  // SC-020: REJECTED 판매자 POST /products → 403
  // ─────────────────────────────────────────────
  describe('SC-020: createProduct — REJECTED 판매자 403', () => {
    it('when_rejected_seller_creates_product_then_403', async () => {
      /**
       * SC-020 (FR-017 관련):
       * REJECTED 상태 판매자가 POST /products 시도 시 ForbiddenException (403).
       */
      mockSellerService.getApprovedSeller.mockRejectedValue(
        new ForbiddenException('Seller is not approved'),
      );

      await expect(
        service.createProduct(FIXED_USER_ID, {
          categoryId: FIXED_CATEGORY_ID,
          title: '상품',
          price: '10000',
        }),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  // ─────────────────────────────────────────────
  // SC-021: GET /categories → 인증 없이 목록 반환
  // ─────────────────────────────────────────────
  describe('SC-021: listCategories — 비인증 허용 목록 반환', () => {
    it('when_get_categories_no_auth_then_list', async () => {
      /**
       * SC-021 (FR-018 관련):
       * GET /categories 는 인증 없이 호출 가능. 카테고리 목록 반환.
       */
      const categories = [
        { id: 'cat-1', name: '전자제품' },
        { id: 'cat-2', name: '의류' },
      ];
      mockProductRepository.findCategories.mockResolvedValue(categories);

      const result = await service.listCategories();

      expect(mockProductRepository.findCategories).toHaveBeenCalled();
      expect(result).toHaveLength(2);
    });
  });

  // ─────────────────────────────────────────────
  // SC-022: APPROVED 판매자 POST /products → DRAFT
  // ─────────────────────────────────────────────
  describe('SC-022: createProduct — APPROVED 판매자 DRAFT 생성', () => {
    it('when_approved_seller_creates_product_then_draft', async () => {
      /**
       * SC-022 (FR-019 관련):
       * APPROVED 판매자가 POST /products 시 DRAFT 상태 상품 생성.
       * production createProduct()는 getApprovedSeller → findCategoryById → createProduct({sellerId,...}).
       */
      mockSellerService.getApprovedSeller.mockResolvedValue(FIXED_APPROVED_SELLER);
      mockProductRepository.findCategoryById.mockResolvedValue(FIXED_CATEGORY);
      mockProductRepository.createProduct.mockResolvedValue(FIXED_PRODUCT_DRAFT);

      const result = await service.createProduct(FIXED_USER_ID, {
        categoryId: FIXED_CATEGORY_ID,
        title: '테스트 상품',
        price: '10000',
      });

      expect(result).toBeDefined();
      expect(result.status).toBe('DRAFT');
      // production은 단일 객체로 호출: {sellerId, categoryId, title, price: Decimal}
      expect(mockProductRepository.createProduct).toHaveBeenCalledWith(
        expect.objectContaining({
          sellerId: FIXED_SELLER_ID,
          title: '테스트 상품',
          categoryId: FIXED_CATEGORY_ID,
        }),
      );
    });
  });

  // ─────────────────────────────────────────────
  // SC-023: 비승인 판매자 POST /products → 403
  // ─────────────────────────────────────────────
  describe('SC-023: createProduct — 비승인 판매자 403', () => {
    it('when_non_approved_seller_then_403', async () => {
      /**
       * SC-023 (FR-019 관련):
       * PENDING/REJECTED 판매자가 상품 등록 시도 시 ForbiddenException (403).
       */
      mockSellerService.getApprovedSeller.mockRejectedValue(
        new ForbiddenException('Seller is not approved'),
      );

      await expect(
        service.createProduct(FIXED_USER_ID, {
          categoryId: FIXED_CATEGORY_ID,
          title: '상품',
          price: '10000',
        }),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  // ─────────────────────────────────────────────
  // SC-024: APPROVED 판매자 PATCH 본인 상품 → DB 반영
  // ─────────────────────────────────────────────
  describe('SC-024: updateProduct — 본인 상품 수정 DB 반영', () => {
    it('when_approved_seller_updates_own_product_then_ok', async () => {
      /**
       * SC-024 (FR-020 관련):
       * APPROVED 판매자가 본인 상품 PATCH 시 DB 반영.
       * production: findById → assertOwner(getApprovedSeller) → updateProduct.
       */
      mockProductRepository.findById.mockResolvedValue(FIXED_PRODUCT_DRAFT);
      mockSellerService.getApprovedSeller.mockResolvedValue(FIXED_APPROVED_SELLER);
      const updateDto = { title: '수정된 제목' };
      mockProductRepository.updateProduct.mockResolvedValue({
        ...FIXED_PRODUCT_DRAFT,
        ...updateDto,
      });

      const result = await service.updateProduct(
        FIXED_USER_ID,
        FIXED_PRODUCT_ID,
        updateDto,
      );

      expect(result).toBeDefined();
      expect(mockProductRepository.updateProduct).toHaveBeenCalled();
    });
  });

  // ─────────────────────────────────────────────
  // SC-025: 타인 상품 PATCH → 403
  // ─────────────────────────────────────────────
  describe('SC-025: updateProduct — 타인 상품 수정 403', () => {
    it('when_seller_updates_others_product_then_403', async () => {
      /**
       * SC-025 (FR-020 관련):
       * 판매자가 타인 상품 수정 시도 시 ForbiddenException (403).
       * product.sellerId(FIXED_SELLER_ID) !== seller.id(other-seller-id) → ForbiddenException.
       */
      const othersProduct = { ...FIXED_PRODUCT_DRAFT, sellerId: FIXED_SELLER_ID };
      mockProductRepository.findById.mockResolvedValue(othersProduct);
      const othersSellerApproved = { id: 'other-seller-id', userId: 'other-user-id' };
      mockSellerService.getApprovedSeller.mockResolvedValue(othersSellerApproved);

      await expect(
        service.updateProduct('other-user-id', FIXED_PRODUCT_ID, {}),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  // ─────────────────────────────────────────────
  // SC-026: DRAFT → ACTIVE (publish)
  // ─────────────────────────────────────────────
  describe('SC-026: publishProduct — DRAFT → ACTIVE', () => {
    it('when_publish_draft_product_then_active', async () => {
      /**
       * SC-026 (FR-021 관련):
       * DRAFT 상태 상품을 publish 하면 ACTIVE 로 전환.
       * production: publish() → findById → assertOwner → updateStatus(ACTIVE).
       */
      mockProductRepository.findById.mockResolvedValue(FIXED_PRODUCT_DRAFT);
      mockSellerService.getApprovedSeller.mockResolvedValue(FIXED_APPROVED_SELLER);
      mockProductRepository.updateStatus.mockResolvedValue({
        ...FIXED_PRODUCT_DRAFT,
        status: 'ACTIVE',
      });

      const result = await service.publish(FIXED_USER_ID, FIXED_PRODUCT_ID);

      expect(result).toBeDefined();
      expect(result.status).toBe('ACTIVE');
      expect(mockProductRepository.updateStatus).toHaveBeenCalledWith(
        FIXED_PRODUCT_ID,
        'ACTIVE',
      );
    });
  });

  // ─────────────────────────────────────────────
  // SC-027: INACTIVE → ACTIVE (publish)
  // ─────────────────────────────────────────────
  describe('SC-027: publishProduct — INACTIVE → ACTIVE', () => {
    it('when_publish_inactive_product_then_active', async () => {
      /**
       * SC-027 (FR-021 관련):
       * INACTIVE 상태 상품을 publish 하면 ACTIVE 로 전환.
       */
      mockProductRepository.findById.mockResolvedValue(FIXED_PRODUCT_INACTIVE);
      mockSellerService.getApprovedSeller.mockResolvedValue(FIXED_APPROVED_SELLER);
      mockProductRepository.updateStatus.mockResolvedValue({
        ...FIXED_PRODUCT_INACTIVE,
        status: 'ACTIVE',
      });

      const result = await service.publish(FIXED_USER_ID, FIXED_PRODUCT_ID);

      expect(result.status).toBe('ACTIVE');
    });
  });

  // ─────────────────────────────────────────────
  // SC-028: ACTIVE → INACTIVE (deactivate)
  // ─────────────────────────────────────────────
  describe('SC-028: deactivateProduct — ACTIVE → INACTIVE', () => {
    it('when_deactivate_active_product_then_inactive', async () => {
      /**
       * SC-028 (FR-022 관련):
       * ACTIVE 상태 상품을 deactivate 하면 INACTIVE 로 전환.
       */
      mockProductRepository.findById.mockResolvedValue(FIXED_PRODUCT_ACTIVE);
      mockSellerService.getApprovedSeller.mockResolvedValue(FIXED_APPROVED_SELLER);
      mockProductRepository.updateStatus.mockResolvedValue({
        ...FIXED_PRODUCT_ACTIVE,
        status: 'INACTIVE',
      });

      const result = await service.deactivate(FIXED_USER_ID, FIXED_PRODUCT_ID);

      expect(result.status).toBe('INACTIVE');
      expect(mockProductRepository.updateStatus).toHaveBeenCalledWith(
        FIXED_PRODUCT_ID,
        'INACTIVE',
      );
    });
  });

  // ─────────────────────────────────────────────
  // SC-029: OUT_OF_STOCK → INACTIVE (deactivate)
  // ─────────────────────────────────────────────
  describe('SC-029: deactivateProduct — OUT_OF_STOCK → INACTIVE', () => {
    it('when_deactivate_oos_product_then_inactive', async () => {
      /**
       * SC-029 (FR-022 관련):
       * OUT_OF_STOCK 상태 상품을 deactivate 하면 INACTIVE 로 전환.
       */
      mockProductRepository.findById.mockResolvedValue(FIXED_PRODUCT_OOS);
      mockSellerService.getApprovedSeller.mockResolvedValue(FIXED_APPROVED_SELLER);
      mockProductRepository.updateStatus.mockResolvedValue({
        ...FIXED_PRODUCT_OOS,
        status: 'INACTIVE',
      });

      const result = await service.deactivate(FIXED_USER_ID, FIXED_PRODUCT_ID);

      expect(result.status).toBe('INACTIVE');
    });
  });

  // ─────────────────────────────────────────────
  // SC-032: variant 추가
  // ─────────────────────────────────────────────
  describe('SC-032: addVariant — variant 생성', () => {
    it('when_approved_seller_adds_variant_then_created', async () => {
      /**
       * SC-032 (FR-025 관련):
       * APPROVED 판매자가 POST /products/:id/variants 시 variant 생성.
       * production addVariant(): findById → assertOwner → createVariant({...}) → inventoryService.initStock.
       */
      mockProductRepository.findById.mockResolvedValue(FIXED_PRODUCT_DRAFT);
      mockSellerService.getApprovedSeller.mockResolvedValue(FIXED_APPROVED_SELLER);
      mockProductRepository.createVariant.mockResolvedValue(FIXED_VARIANT);
      mockInventoryService.initStock.mockResolvedValue(undefined);

      const dto = {
        optionName: '색상',
        optionValue: '빨강',
        sku: 'SKU-001',
        price: '10000',
        initialStock: 0,
      };
      const result = await service.addVariant(
        FIXED_USER_ID,
        FIXED_PRODUCT_ID,
        dto,
      );

      expect(result).toBeDefined();
      expect(result.sku).toBe('SKU-001');
      // production createVariant는 단일 객체로 호출: {productId, optionName, optionValue, sku, price: Decimal}
      expect(mockProductRepository.createVariant).toHaveBeenCalledWith(
        expect.objectContaining({
          productId: FIXED_PRODUCT_ID,
          optionName: '색상',
          sku: 'SKU-001',
        }),
      );
    });
  });

  // ─────────────────────────────────────────────
  // SC-033: variant 수정
  // ─────────────────────────────────────────────
  describe('SC-033: updateVariant — variant 정보 수정', () => {
    it('when_approved_seller_updates_variant_then_db_updated', async () => {
      /**
       * SC-033 (FR-025 관련):
       * APPROVED 판매자가 PATCH /products/:id/variants/:variantId 시 DB 반영.
       * production: findById → assertOwner → findVariantById → updateVariant.
       */
      mockProductRepository.findById.mockResolvedValue(FIXED_PRODUCT_DRAFT);
      mockSellerService.getApprovedSeller.mockResolvedValue(FIXED_APPROVED_SELLER);
      mockProductRepository.findVariantById.mockResolvedValue(FIXED_VARIANT);
      const updateDto = { price: '15000' };
      mockProductRepository.updateVariant.mockResolvedValue({
        ...FIXED_VARIANT,
        ...updateDto,
      });

      const result = await service.updateVariant(
        FIXED_USER_ID,
        FIXED_PRODUCT_ID,
        FIXED_VARIANT_ID,
        updateDto,
      );

      expect(result).toBeDefined();
      expect(mockProductRepository.updateVariant).toHaveBeenCalled();
    });
  });

  // ─────────────────────────────────────────────
  // SC-034: variant 삭제
  // ─────────────────────────────────────────────
  describe('SC-034: deleteVariant — variant 삭제', () => {
    it('when_approved_seller_deletes_variant_then_deleted', async () => {
      /**
       * SC-034 (FR-025 관련):
       * APPROVED 판매자가 DELETE /products/:id/variants/:variantId 시 삭제.
       * production: findById → assertOwner → findVariantById → deleteVariant.
       */
      mockProductRepository.findById.mockResolvedValue(FIXED_PRODUCT_DRAFT);
      mockSellerService.getApprovedSeller.mockResolvedValue(FIXED_APPROVED_SELLER);
      mockProductRepository.findVariantById.mockResolvedValue(FIXED_VARIANT);
      mockProductRepository.deleteVariant.mockResolvedValue(undefined);

      await expect(
        service.deleteVariant(FIXED_USER_ID, FIXED_PRODUCT_ID, FIXED_VARIANT_ID),
      ).resolves.toBeUndefined();

      expect(mockProductRepository.deleteVariant).toHaveBeenCalledWith(FIXED_VARIANT_ID);
    });
  });

  // ─────────────────────────────────────────────
  // SC-035: 이미지 추가
  // ─────────────────────────────────────────────
  describe('SC-035: addImage — 상품 이미지 URL 추가', () => {
    it('when_approved_seller_adds_image_then_created', async () => {
      /**
       * SC-035 (FR-026 관련):
       * APPROVED 판매자가 POST /products/:id/images 시 product_images 레코드 생성.
       * production addImage(): findById → assertOwner → countImages → createImage({productId,...}).
       */
      mockProductRepository.findById.mockResolvedValue(FIXED_PRODUCT_DRAFT);
      mockSellerService.getApprovedSeller.mockResolvedValue(FIXED_APPROVED_SELLER);
      mockProductRepository.countImages.mockResolvedValue(0);
      mockProductRepository.createImage.mockResolvedValue(FIXED_IMAGE);

      const dto = { url: 'https://example.com/image.jpg', displayOrder: 1 };
      const result = await service.addImage(FIXED_USER_ID, FIXED_PRODUCT_ID, dto);

      expect(result).toBeDefined();
      expect(result.url).toBe('https://example.com/image.jpg');
      // production createImage는 단일 객체로 호출: {productId, ...dto}
      expect(mockProductRepository.createImage).toHaveBeenCalledWith(
        expect.objectContaining({
          productId: FIXED_PRODUCT_ID,
          url: 'https://example.com/image.jpg',
        }),
      );
    });
  });

  // ─────────────────────────────────────────────
  // SC-036: 이미지 10개 초과 → 400
  // ─────────────────────────────────────────────
  describe('SC-036: addImage — 이미지 10개 초과 400', () => {
    it('when_image_count_at_10_then_400', async () => {
      /**
       * SC-036 (FR-026 관련):
       * 상품 이미지가 10개인 상태에서 추가 요청 시 BadRequestException (400).
       */
      mockProductRepository.findById.mockResolvedValue(FIXED_PRODUCT_DRAFT);
      mockSellerService.getApprovedSeller.mockResolvedValue(FIXED_APPROVED_SELLER);
      mockProductRepository.countImages.mockResolvedValue(10); // 이미 10개

      await expect(
        service.addImage(FIXED_USER_ID, FIXED_PRODUCT_ID, {
          url: 'https://example.com/11th.jpg',
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  // ─────────────────────────────────────────────
  // SC-037: 이미지 삭제
  // ─────────────────────────────────────────────
  describe('SC-037: deleteImage — 상품 이미지 삭제', () => {
    it('when_approved_seller_deletes_image_then_deleted', async () => {
      /**
       * SC-037 (FR-026 관련):
       * APPROVED 판매자가 DELETE /products/:id/images/:imageId 시 이미지 삭제.
       */
      mockProductRepository.findById.mockResolvedValue(FIXED_PRODUCT_DRAFT);
      mockSellerService.getApprovedSeller.mockResolvedValue(FIXED_APPROVED_SELLER);
      mockProductRepository.deleteImage.mockResolvedValue(undefined);

      await expect(
        service.deleteImage(FIXED_USER_ID, FIXED_PRODUCT_ID, FIXED_IMAGE_ID),
      ).resolves.toBeUndefined();

      expect(mockProductRepository.deleteImage).toHaveBeenCalledWith(FIXED_IMAGE_ID);
    });
  });

  // ─────────────────────────────────────────────
  // SC-038: cursor 페이지네이션 — ACTIVE/OOS 노출, DRAFT/INACTIVE 제외
  // ─────────────────────────────────────────────
  describe('SC-038: listProductsPublic — cursor 페이지네이션', () => {
    it('when_list_products_then_only_active_and_oos', async () => {
      /**
       * SC-038 (FR-027 관련):
       * GET /products?limit=20 시 ACTIVE/OUT_OF_STOCK 만 노출.
       * production listPublic(cursor, limit): listPublic 필터는 repo 내부 WHERE 절로 처리.
       * service는 listPublic(cursor, take) → {items, nextCursor} 반환.
       */
      const activeProducts = [
        { ...FIXED_PRODUCT_ACTIVE, id: 'p-1' },
        { ...FIXED_PRODUCT_OOS, id: 'p-2' },
      ];
      mockProductRepository.listPublic.mockResolvedValue(activeProducts);

      const result = await service.listPublic(undefined, 20);

      expect(mockProductRepository.listPublic).toHaveBeenCalledWith(undefined, 20);
      expect(result.items).toHaveLength(2);
      result.items.forEach((item: any) => {
        expect(['ACTIVE', 'OUT_OF_STOCK']).toContain(item.status);
      });
    });

    it('when_list_products_first_page_no_cursor', async () => {
      /**
       * SC-038 (FR-027 관련):
       * cursor 없는 첫 페이지 조회.
       */
      mockProductRepository.listPublic.mockResolvedValue([]);

      await service.listPublic(undefined, 20);

      expect(mockProductRepository.listPublic).toHaveBeenCalledWith(undefined, 20);
    });
  });

  // ─────────────────────────────────────────────
  // SC-039: 상품 단건 조회 — ACTIVE/OOS 가능, DRAFT/INACTIVE 404
  // ─────────────────────────────────────────────
  describe('SC-039: getProductPublic — ACTIVE/OOS 조회 / DRAFT/INACTIVE 404', () => {
    it('when_get_active_product_then_detail', async () => {
      /**
       * SC-039 (FR-028 관련):
       * GET /products/:id 로 ACTIVE 상품 조회 시 상세 반환.
       * production getDetail(productId, user?) uses findById + status filter.
       */
      mockProductRepository.findById.mockResolvedValue(FIXED_PRODUCT_ACTIVE);

      const result = await service.getDetail(FIXED_PRODUCT_ID);

      expect(result).toBeDefined();
      expect(result.status).toBe('ACTIVE');
    });

    it('when_get_draft_product_then_404', async () => {
      /**
       * SC-039 (FR-028 관련):
       * DRAFT 상품 단건 조회 시 NotFoundException (404).
       * production: status !== ACTIVE && status !== OUT_OF_STOCK → NotFoundException.
       * null 반환도 동일하게 404 처리됨.
       */
      mockProductRepository.findById.mockResolvedValue(null);

      await expect(
        service.getDetail(FIXED_PRODUCT_ID),
      ).rejects.toThrow(NotFoundException);
    });

    it('when_get_inactive_product_then_404', async () => {
      /**
       * SC-039 (FR-028 관련):
       * INACTIVE 상품 단건 조회 시 NotFoundException (404).
       */
      mockProductRepository.findById.mockResolvedValue(null);

      await expect(
        service.getDetail('inactive-product-id'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // ─────────────────────────────────────────────
  // SC-006/007 (v1.1.0/017 spec): getMyProductDetail — 소유 상품 상세(전 상태) variants·images 포함
  // ─────────────────────────────────────────────
  describe('SC-006/007: getMyProductDetail — 소유 상품 상세(전 상태 허용)', () => {
    const FIXED_PRODUCT_WITH_RELATIONS = {
      ...FIXED_PRODUCT_DRAFT,
      images: [FIXED_IMAGE],
      variants: [FIXED_VARIANT],
    };

    it('when_owner_gets_own_DRAFT_product_then_detail_with_variants_images(SC-006)', async () => {
      /**
       * SC-006 (FR-004 관련, v1.1.0/017 spec):
       * 승인된 판매자가 자신 소유의 DRAFT 상태 상품을 ID로 상세 조회하면
       * variants·images 가 포함된 응답이 반환된다.
       * production getMyProductDetail(userId, productId):
       *   findById(productId) → assertOwner(userId, product.sellerId) → return product.
       */
      mockProductRepository.findById.mockResolvedValue(FIXED_PRODUCT_WITH_RELATIONS);
      mockSellerService.getApprovedSeller.mockResolvedValue(FIXED_APPROVED_SELLER);

      const result = await service.getMyProductDetail(FIXED_USER_ID, FIXED_PRODUCT_ID);

      expect(mockProductRepository.findById).toHaveBeenCalledWith(FIXED_PRODUCT_ID);
      expect(result.status).toBe('DRAFT');
      expect(result.variants).toEqual([FIXED_VARIANT]);
      expect(result.images).toEqual([FIXED_IMAGE]);
    });

    it.each([
      ['ACTIVE', { ...FIXED_PRODUCT_WITH_RELATIONS, status: 'ACTIVE' }],
      ['OUT_OF_STOCK', { ...FIXED_PRODUCT_WITH_RELATIONS, status: 'OUT_OF_STOCK' }],
      ['INACTIVE', { ...FIXED_PRODUCT_WITH_RELATIONS, status: 'INACTIVE' }],
    ])(
      'when_owner_gets_own_%s_product_then_detail_with_variants_images(SC-007)',
      async (_status, product) => {
        /**
         * SC-007 (FR-004 관련, v1.1.0/017 spec) Edge:
         * ACTIVE/OUT_OF_STOCK/INACTIVE 상태 상품도 동일하게 variants·images 포함 응답.
         * (getDetail 의 ACTIVE/OUT_OF_STOCK 전용 필터와 달리 getMyProductDetail 은 전 상태 허용)
         */
        mockProductRepository.findById.mockResolvedValue(product);
        mockSellerService.getApprovedSeller.mockResolvedValue(FIXED_APPROVED_SELLER);

        const result = await service.getMyProductDetail(FIXED_USER_ID, FIXED_PRODUCT_ID);

        expect(result.variants).toEqual([FIXED_VARIANT]);
        expect(result.images).toEqual([FIXED_IMAGE]);
      },
    );
  });

  // ─────────────────────────────────────────────
  // SC-008/009 (v1.1.0/017 spec): getMyProductDetail — 비소유/미존재 거부
  // ─────────────────────────────────────────────
  describe('SC-008/009: getMyProductDetail — 비소유 403 / 미존재 404', () => {
    it('when_non_owner_gets_product_then_403(SC-008)', async () => {
      /**
       * SC-008 (FR-005 관련, v1.1.0/017 spec) Error:
       * 판매자가 소유하지 않은 상품 ID로 조회 시도 시 ForbiddenException(403).
       * production: findById → OK(존재) → assertOwner → seller.id !== product.sellerId → Forbidden.
       */
      mockProductRepository.findById.mockResolvedValue({
        ...FIXED_PRODUCT_DRAFT,
        sellerId: 'other-seller-id',
        images: [],
        variants: [],
      });
      mockSellerService.getApprovedSeller.mockResolvedValue(FIXED_APPROVED_SELLER); // FIXED_SELLER_ID

      await expect(
        service.getMyProductDetail(FIXED_USER_ID, FIXED_PRODUCT_ID),
      ).rejects.toThrow(ForbiddenException);
    });

    it('when_product_not_found_then_404(SC-009)', async () => {
      /**
       * SC-009 (FR-005 관련, v1.1.0/017 spec) Error:
       * 존재하지 않는 상품 ID로 조회 시도 시 NotFoundException(404).
       * production: findById → null → NotFoundException (404→403 분기 순서 고정 — assertOwner 호출 전 차단).
       */
      mockProductRepository.findById.mockResolvedValue(null);

      await expect(
        service.getMyProductDetail(FIXED_USER_ID, 'nonexistent-product-id'),
      ).rejects.toThrow(NotFoundException);

      // 404 가 403 보다 먼저 판정 — assertOwner(getApprovedSeller) 미호출
      expect(mockSellerService.getApprovedSeller).not.toHaveBeenCalled();
    });
  });

  // ─────────────────────────────────────────────
  // SC-010/011 (v1.1.0/017 spec): listMyProducts — 페이지네이션 envelope 화
  // §F 마이그레이션 — 기존 SC-040(array 단언) 을 envelope 단언으로 재작성
  // ─────────────────────────────────────────────
  describe('SC-010/011: listMyProducts — cursor 페이지네이션 + envelope {items,nextCursor}', () => {
    it('when_seller_lists_own_products_with_limit_then_paginated_envelope(SC-010)', async () => {
      /**
       * SC-010 (FR-006 관련, v1.1.0/017 spec) Edge:
       * limit 지정 조회 시 items ≤ limit, 다음 페이지 존재 여부가 nextCursor 로 표현.
       * production listMyProducts(userId, cursor?, limit?):
       *   getApprovedSeller → take 클램프 → listBySeller(seller.id, cursor, take) → envelope.
       */
      mockSellerService.getApprovedSeller.mockResolvedValue(FIXED_APPROVED_SELLER);
      const twoProducts = [FIXED_PRODUCT_DRAFT, FIXED_PRODUCT_ACTIVE];
      mockProductRepository.listBySeller.mockResolvedValue(twoProducts);

      const result = await service.listMyProducts(FIXED_USER_ID, undefined, 2);

      expect(mockProductRepository.listBySeller).toHaveBeenCalledWith(
        FIXED_SELLER_ID,
        undefined,
        2,
      );
      expect(result.items).toHaveLength(2);
      // items.length === take → 다음 페이지 존재 가능성 → nextCursor = 마지막 항목 id
      expect(result.nextCursor).toBe(FIXED_PRODUCT_ACTIVE.id);
    });

    it('when_last_page_then_nextCursor_null(SC-010)', async () => {
      /**
       * SC-010 (FR-006 관련, v1.1.0/017 spec) Edge:
       * 반환 개수가 take 미만이면(마지막 페이지) nextCursor 는 null.
       */
      mockSellerService.getApprovedSeller.mockResolvedValue(FIXED_APPROVED_SELLER);
      mockProductRepository.listBySeller.mockResolvedValue([FIXED_PRODUCT_DRAFT]);

      const result = await service.listMyProducts(FIXED_USER_ID, undefined, 2);

      expect(result.nextCursor).toBeNull();
    });

    it('when_response_returned_then_envelope_shape(SC-011)', async () => {
      /**
       * SC-011 (FR-007 관련, v1.1.0/017 spec):
       * 판매자 상품 목록 응답이 {items, nextCursor} envelope 형태임을 확인
       * (FR-002 관리자 판매자 목록과 동일 envelope — admin.service.spec.ts 에서 교차 확인).
       */
      mockSellerService.getApprovedSeller.mockResolvedValue(FIXED_APPROVED_SELLER);
      mockProductRepository.listBySeller.mockResolvedValue([FIXED_PRODUCT_DRAFT]);

      const result = await service.listMyProducts(FIXED_USER_ID);

      expect(result).toHaveProperty('items');
      expect(result).toHaveProperty('nextCursor');
      expect(Array.isArray(result.items)).toBe(true);
    });
  });

  // ─────────────────────────────────────────────
  // getPublicSummaries (FR-010/011 관련, v1.1.0/017 spec) — SC-014/015 신뢰성 보강
  // user.service.spec.ts 는 ProductService 를 mock 하므로, 본 실제 구현(Map 변환·thumbnailUrl
  // 추출·빈 입력 방어)의 직접 단위 검증은 여기(ProductService 소유 파일)에서 수행한다.
  // (SC 번호 미할당 — 신규 공개 메서드의 내부 정확성 보강, 별도 SC-XXX 미부여)
  // ─────────────────────────────────────────────
  describe('getPublicSummaries — 공개 상품 요약 일괄 조회 (v1.1.0/017 spec)', () => {
    it('when_products_found_then_map_keyed_by_productId_with_thumbnail', async () => {
      /**
       * (FR-010/011 관련, v1.1.0/017 spec):
       * findPublicSummariesByIds 결과를 productId → {productId,title,price,thumbnailUrl} Map 으로 변환.
       * 대표 이미지(첫 이미지)의 url 을 thumbnailUrl 로 사용.
       */
      mockProductRepository.findPublicSummariesByIds.mockResolvedValue([
        { ...FIXED_PRODUCT_ACTIVE, images: [FIXED_IMAGE] },
      ]);

      const result = await service.getPublicSummaries([FIXED_PRODUCT_ID]);

      expect(mockProductRepository.findPublicSummariesByIds).toHaveBeenCalledWith([FIXED_PRODUCT_ID]);
      expect(result.get(FIXED_PRODUCT_ID)).toMatchObject({
        productId: FIXED_PRODUCT_ID,
        title: FIXED_PRODUCT_ACTIVE.title,
        thumbnailUrl: FIXED_IMAGE.url,
      });
    });

    it('when_product_has_no_images_then_thumbnailUrl_null', async () => {
      /**
       * (FR-010/011 관련, v1.1.0/017 spec) Edge:
       * 이미지가 없는 상품은 thumbnailUrl:null (DTO nullable).
       */
      mockProductRepository.findPublicSummariesByIds.mockResolvedValue([
        { ...FIXED_PRODUCT_ACTIVE, images: [] },
      ]);

      const result = await service.getPublicSummaries([FIXED_PRODUCT_ID]);

      expect(result.get(FIXED_PRODUCT_ID)?.thumbnailUrl).toBeNull();
    });

    it('when_ids_empty_then_returns_empty_map', async () => {
      /**
       * (FR-010/011 관련, v1.1.0/017 spec) Edge:
       * 빈 배열 입력 시 빈 Map 반환(위시리스트/최근 본 상품이 비어있는 경우 안전 방어).
       */
      mockProductRepository.findPublicSummariesByIds.mockResolvedValue([]);

      const result = await service.getPublicSummaries([]);

      expect(result.size).toBe(0);
    });

    it('when_some_ids_unavailable_then_map_omits_them', async () => {
      /**
       * (FR-010/011·FR-012 관련, v1.1.0/017 spec) Edge:
       * 조회 불가(DRAFT/INACTIVE/삭제/미존재) 상품은 repository 가 자연 누락시키므로
       * 반환 Map 에도 해당 productId 가 없다 — 호출 측(UserService)이 productAvailable 판정.
       */
      mockProductRepository.findPublicSummariesByIds.mockResolvedValue([
        { ...FIXED_PRODUCT_ACTIVE, images: [] },
      ]); // 요청 2건 중 1건만 조회 가능 상태로 응답

      const result = await service.getPublicSummaries([FIXED_PRODUCT_ID, 'unavailable-id']);

      expect(result.has(FIXED_PRODUCT_ID)).toBe(true);
      expect(result.has('unavailable-id')).toBe(false);
    });
  });
});
