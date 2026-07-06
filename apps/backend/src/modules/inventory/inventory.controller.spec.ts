/**
 * InventoryController 단위 테스트 — [env:unit] (SEC-002 소유권 검증)
 *
 * 대상 SC: SC-042, SC-043, SC-044 (v1.0.0/002 spec)(v1.0.0/003 spec) 계승
 *          SC-012/013 (v1.1.0/017 spec 신규 — getStockView·stockIn 응답 구조화 배선)
 * 검증 방법: Jest mock (InventoryService, SellerService, ProductService)
 *
 * SEC-002 개요 (FR-050/051):
 *   stockIn·getStock 에서 APPROVED 판매자 검증 후,
 *   assertSellerOwnsVariant(userId, variantId)로 소유권 검증.
 *   소유하지 않은 variantId → ForbiddenException(403).
 *
 * Canonical 심볼 (tasks.md Test Authoring Contract):
 *   ProductService.assertSellerOwnsVariant(userId, variantId): Promise<void> (ForbiddenException)
 *   SellerService.getApprovedSeller(userId): Promise<Seller>
 *
 * §F 마이그레이션 017 (tasks.md T018): getStock 라우트가 내부적으로
 * inventoryService.getStockView 를 호출하도록 전환 — mock 대상을 getStock → getStockView 로 갱신.
 */

import { ForbiddenException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { InventoryController } from './inventory.controller';
import { InventoryService } from './inventory.service';
import { SellerService } from '../seller/seller.service';
import { ProductService } from '../product/product.service';

// ─────────────────────────────────────────────
// Mock 팩토리
// ─────────────────────────────────────────────
const mockInventoryService = {
  stockIn: jest.fn(),
  getStock: jest.fn(),
  getStockView: jest.fn(),
  checkAvailability: jest.fn(),
  decreaseStock: jest.fn(),
  restoreStock: jest.fn(),
};

const mockSellerService = {
  getApprovedSeller: jest.fn(),
};

const mockProductService = {
  assertSellerOwnsVariant: jest.fn(),
  getVariantSnapshot: jest.fn(),
  getVariantSnapshots: jest.fn(),
};

// ─────────────────────────────────────────────
// 고정 픽스처
// ─────────────────────────────────────────────
const FIXED_USER_ID = 'user-id-seller-001';
const FIXED_OTHER_USER_ID = 'user-id-other-seller';
const FIXED_SELLER = { id: 'seller-id-001', userId: FIXED_USER_ID, status: 'APPROVED' };
const FIXED_VARIANT_ID = 'variant-id-001';

/** CurrentUser 시뮬 헬퍼 — controller 메서드를 직접 호출 */
const simulateUser = (userId: string) => ({ userId, email: `${userId}@test.com` });

describe('InventoryController (SEC-002 소유권 검증)', () => {
  let controller: InventoryController;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [InventoryController],
      providers: [
        { provide: InventoryService, useValue: mockInventoryService },
        { provide: SellerService, useValue: mockSellerService },
        { provide: ProductService, useValue: mockProductService },
      ],
    }).compile();

    controller = module.get<InventoryController>(InventoryController);
  });

  // ─────────────────────────────────────────────
  // SC-043: 본인 variant stockIn → 정상 처리
  // ─────────────────────────────────────────────
  describe('SC-043: stockIn — 소유한 variant 재고 입고 성공', () => {
    it('when_own_variant_then_stock_increased', async () => {
      /**
       * SC-043 (FR-050 관련):
       * 본인 소유 variant에 stockIn 호출 → 정상 처리.
       * production 흐름:
       *   getApprovedSeller(user.userId) → OK
       *   assertSellerOwnsVariant(user.userId, variantId) → OK (no throw)
       *   inventoryService.stockIn(variantId, quantity) → OK
       */
      mockSellerService.getApprovedSeller.mockResolvedValue(FIXED_SELLER);
      mockProductService.assertSellerOwnsVariant.mockResolvedValue(undefined); // 소유 OK
      // 017: stockIn 응답이 구조화된 객체로 변경 (기존 void 대체)
      mockInventoryService.stockIn.mockResolvedValue({ variantId: FIXED_VARIANT_ID, stock: 15 });

      const dto = { quantity: 5 };
      const result = await controller.stockIn(
        simulateUser(FIXED_USER_ID) as never,
        FIXED_VARIANT_ID,
        dto as never,
      );

      // assertSellerOwnsVariant 호출 확인 (SEC-002)
      expect(mockProductService.assertSellerOwnsVariant).toHaveBeenCalledWith(
        FIXED_USER_ID,
        FIXED_VARIANT_ID,
      );
      // 기존 stockIn 동작 유지
      expect(mockInventoryService.stockIn).toHaveBeenCalledWith(FIXED_VARIANT_ID, 5);
      // SC-013 (v1.1.0/017 spec): 컨트롤러가 구조화된 응답을 그대로 전달
      expect(result).toEqual({ variantId: FIXED_VARIANT_ID, stock: 15 });
    });
  });

  // ─────────────────────────────────────────────
  // SC-042: 타 판매자 variant stockIn → 403
  // ─────────────────────────────────────────────
  describe('SC-042: stockIn — 타 판매자 variant 403', () => {
    it('when_other_seller_variant_then_403', async () => {
      /**
       * SC-042 (FR-051 관련):
       * 자신의 것이 아닌 variant에 stockIn 시도 → ForbiddenException(403).
       * production: assertSellerOwnsVariant throw ForbiddenException
       */
      mockSellerService.getApprovedSeller.mockResolvedValue(FIXED_SELLER);
      // 타 판매자 소유 variant → ForbiddenException
      mockProductService.assertSellerOwnsVariant.mockRejectedValue(
        new ForbiddenException('Variant does not belong to this seller'),
      );

      const dto = { quantity: 5 };
      await expect(
        controller.stockIn(simulateUser(FIXED_USER_ID) as never, FIXED_VARIANT_ID, dto as never),
      ).rejects.toThrow(ForbiddenException);

      // inventoryService.stockIn은 호출되지 않아야 함 (소유권 차단)
      expect(mockInventoryService.stockIn).not.toHaveBeenCalled();
    });

    it('when_other_seller_user_then_403_from_assert', async () => {
      /**
       * SC-042 (FR-051 관련) Edge:
       * 다른 userId로 요청 시에도 assertSellerOwnsVariant가 403 반환.
       */
      mockSellerService.getApprovedSeller.mockResolvedValue({
        id: 'other-seller-id',
        userId: FIXED_OTHER_USER_ID,
        status: 'APPROVED',
      });
      mockProductService.assertSellerOwnsVariant.mockRejectedValue(
        new ForbiddenException('Variant does not belong to this seller'),
      );

      const dto = { quantity: 10 };
      await expect(
        controller.stockIn(simulateUser(FIXED_OTHER_USER_ID) as never, FIXED_VARIANT_ID, dto as never),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  // ─────────────────────────────────────────────
  // SC-044: getStock — 타 판매자 variant 403
  // ─────────────────────────────────────────────
  describe('SC-044: getStock — 타 판매자 variant 조회 403', () => {
    it('when_other_seller_getstock_then_403', async () => {
      /**
       * SC-044 (FR-051 관련):
       * 타 판매자 소유 variant 재고 조회 시 ForbiddenException(403).
       * production: assertSellerOwnsVariant → throw ForbiddenException
       * T015 명시: "소유권 검증을 getStock(0 반환)보다 먼저" 수행.
       */
      mockSellerService.getApprovedSeller.mockResolvedValue(FIXED_SELLER);
      mockProductService.assertSellerOwnsVariant.mockRejectedValue(
        new ForbiddenException('Variant does not belong to this seller'),
      );

      await expect(
        controller.getStock(simulateUser(FIXED_USER_ID) as never, FIXED_VARIANT_ID),
      ).rejects.toThrow(ForbiddenException);

      // inventoryService.getStockView 는 호출되지 않아야 함 (소유권 차단 우선, 017: getStock→getStockView 전환)
      expect(mockInventoryService.getStockView).not.toHaveBeenCalled();
    });

    it('when_own_variant_getstock_then_structured_response(SC-012)', async () => {
      /**
       * SC-012 (FR-008 관련, v1.1.0/017 spec):
       * 본인 소유 variant 재고 조회 → { variantId, stock } 구조화된 응답 반환.
       * §F 마이그레이션: 컨트롤러가 getStock 대신 getStockView 를 호출하도록 전환.
       */
      mockSellerService.getApprovedSeller.mockResolvedValue(FIXED_SELLER);
      mockProductService.assertSellerOwnsVariant.mockResolvedValue(undefined);
      mockInventoryService.getStockView.mockResolvedValue({
        variantId: FIXED_VARIANT_ID,
        stock: 42,
      });

      const result = await controller.getStock(simulateUser(FIXED_USER_ID) as never, FIXED_VARIANT_ID);

      expect(mockProductService.assertSellerOwnsVariant).toHaveBeenCalledWith(
        FIXED_USER_ID,
        FIXED_VARIANT_ID,
      );
      expect(mockInventoryService.getStockView).toHaveBeenCalledWith(FIXED_VARIANT_ID);
      expect(result).toEqual({ variantId: FIXED_VARIANT_ID, stock: 42 });
    });
  });
});
