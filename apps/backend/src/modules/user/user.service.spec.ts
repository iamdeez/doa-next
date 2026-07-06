/**
 * UserService 단위 테스트 — [env:unit]
 *
 * 대상 SC: SC-001, SC-003, SC-004, SC-005, SC-006, SC-007,
 *           SC-008, SC-009, SC-010, SC-012 (v1.0.0/002 spec) 계승
 *           SC-014, SC-015, SC-016, SC-017 (v1.1.0/017 spec 신규 — 위시리스트·최근 본 상품 요약 enrichment)
 * 검증 방법: Jest mock (UserRepository, ProductService)
 *
 * TDD Red: 구현 미완성 상태에서 작성된 테스트.
 *   - 서비스 메서드가 stub(빈 몸체)이므로 현재 FAIL 예상.
 *   - production 코드(T-B2) 구현 완료 후 Green 전환.
 *
 * §F 마이그레이션 017 (tasks.md T019, DI canonical — 최대 리스크):
 *   UserService 생성자에 ProductService 가 신규 주입되므로 Test.createTestingModule 의
 *   providers 에 { provide: ProductService, useValue: mockProductService } 를 반드시 추가한다.
 *   미추가 시 "Nest can't resolve dependencies of UserService" 로 전체 스위트가 DI 해소 실패한다.
 */

import { Test, TestingModule } from '@nestjs/testing';
import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';

import { Prisma } from '@prisma/client';

import { UserService } from './user.service';
import { UserRepository } from './user.repository';
import { ProductService } from '../product/product.service';

// ─────────────────────────────────────────────
// 상수 (plan.md T-B1 — MAX_PRODUCT_VIEWS=50)
// ─────────────────────────────────────────────
const MAX_PRODUCT_VIEWS = 50;

// ─────────────────────────────────────────────
// Mock 팩토리
// ─────────────────────────────────────────────
const mockUserRepository = {
  findUserById: jest.fn(),
  updateUser: jest.fn(),
  createAddress: jest.fn(),
  updateAddress: jest.fn(),
  deleteAddress: jest.fn(),
  deleteAddressWithReassign: jest.fn(),
  findAddressById: jest.fn(),
  findAddressesByUser: jest.fn(),
  setDefaultTx: jest.fn(),
  createWishlist: jest.fn(),
  deleteWishlist: jest.fn(),
  findWishlistsByUser: jest.fn(),
  upsertProductView: jest.fn(),
  findRecentViews: jest.fn(),
};

// 017: UserService 생성자 신규 DI (research.md — 순환 없음, ProductModule.exports 로 해소)
const mockProductService = {
  getPublicSummaries: jest.fn(),
};

// ─────────────────────────────────────────────
// 고정 픽스처
// ─────────────────────────────────────────────
const FIXED_USER_ID = 'user-fixed-id';
const FIXED_USER = {
  id: FIXED_USER_ID,
  email: 'test@example.com',
  name: 'Test User',
  phone: '010-1234-5678',
  password: '$2b$10$hashedPassword',
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
};
const FIXED_ADDRESS_ID = 'address-fixed-id';
const FIXED_ADDRESS = {
  id: FIXED_ADDRESS_ID,
  userId: FIXED_USER_ID,
  recipientName: '홍길동',
  phone: '010-0000-0000',
  zipCode: '12345',
  address1: '서울시 강남구',
  address2: null,
  isDefault: false,
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
};
const FIXED_PRODUCT_ID = 'product-fixed-id';

describe('UserService', () => {
  let service: UserService;

  beforeEach(async () => {
    jest.clearAllMocks();
    // 017: enrichment 무관 기존 테스트 회귀 방지용 안전 기본값(빈 Map) — 필요 시 개별 테스트에서 override
    mockProductService.getPublicSummaries.mockResolvedValue(new Map());

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UserService,
        { provide: UserRepository, useValue: mockUserRepository },
        // 017 §F: ProductService DI 필수 — 미추가 시 전체 스위트 compile FAIL (tasks.md Test Authoring Contract)
        { provide: ProductService, useValue: mockProductService },
      ],
    }).compile();

    service = module.get<UserService>(UserService);
  });

  // ─────────────────────────────────────────────
  // SC-001: GET /users/me → {id,email,name,phone} (password 제외)
  // ─────────────────────────────────────────────
  describe('SC-001: getProfile — password 제외 필드 반환', () => {
    it('when_get_me_then_profile_without_password', async () => {
      /**
       * SC-001 (FR-001 관련):
       * 인증된 사용자의 프로필 조회 시 {id,email,name,phone} 반환.
       * password 필드는 응답에 포함되지 않아야 한다.
       */
      mockUserRepository.findUserById.mockResolvedValue(FIXED_USER);

      const result = await (service as any).getProfile(FIXED_USER_ID);

      expect(mockUserRepository.findUserById).toHaveBeenCalledWith(FIXED_USER_ID);
      expect(result).toBeDefined();
      expect(result.id).toBe(FIXED_USER_ID);
      expect(result.email).toBe(FIXED_USER.email);
      expect(result.name).toBe(FIXED_USER.name);
      expect(result.phone).toBe(FIXED_USER.phone);
      // password 는 응답에 포함되면 안 됨
      expect(result.password).toBeUndefined();
    });
  });

  // ─────────────────────────────────────────────
  // SC-003: PATCH /users/me → {name,phone} 수정 반영
  // ─────────────────────────────────────────────
  describe('SC-003: updateProfile — name/phone 수정 반영', () => {
    it('when_update_profile_then_persisted', async () => {
      /**
       * SC-003 (FR-002 관련):
       * 인증된 사용자가 name/phone 수정 시 DB에 반영된 업데이트 프로필 반환.
       */
      const updateDto = { name: '새이름', phone: '010-9999-8888' };
      const updatedUser = { ...FIXED_USER, ...updateDto, password: undefined };
      mockUserRepository.updateUser.mockResolvedValue(updatedUser);

      const result = await (service as any).updateProfile(FIXED_USER_ID, updateDto);

      expect(mockUserRepository.updateUser).toHaveBeenCalledWith(
        FIXED_USER_ID,
        updateDto,
      );
      expect(result).toBeDefined();
      expect(result.name).toBe('새이름');
      expect(result.phone).toBe('010-9999-8888');
    });
  });

  // ─────────────────────────────────────────────
  // SC-004: POST /users/me/addresses → 201 생성
  // ─────────────────────────────────────────────
  describe('SC-004: createAddress — 배송지 생성 201', () => {
    it('when_create_address_then_201_created', async () => {
      /**
       * SC-004 (FR-003 관련):
       * 인증된 사용자가 배송지를 등록하면 새 배송지 레코드가 생성된다.
       */
      const createDto = {
        recipientName: '홍길동',
        phone: '010-0000-0000',
        zipCode: '12345',
        address1: '서울시 강남구',
      };
      mockUserRepository.createAddress.mockResolvedValue({
        ...FIXED_ADDRESS,
        ...createDto,
      });

      const result = await (service as any).createAddress(FIXED_USER_ID, createDto);

      expect(mockUserRepository.createAddress).toHaveBeenCalledWith(
        FIXED_USER_ID,
        createDto,
      );
      expect(result).toBeDefined();
      expect(result.recipientName).toBe('홍길동');
    });
  });

  // ─────────────────────────────────────────────
  // SC-005: PATCH /users/me/addresses/:id — 본인 OK / 타인 403
  // ─────────────────────────────────────────────
  describe('SC-005: updateAddress — 본인 수정 OK / 타인 403', () => {
    it('when_update_own_address_then_ok', async () => {
      /**
       * SC-005 (FR-004 관련):
       * 본인 배송지 수정 시 DB에 반영된 배송지 반환.
       */
      const updateDto = { address1: '수정된 주소' };
      mockUserRepository.findAddressById.mockResolvedValue(FIXED_ADDRESS);
      mockUserRepository.updateAddress.mockResolvedValue({
        ...FIXED_ADDRESS,
        ...updateDto,
      });

      const result = await (service as any).updateAddress(
        FIXED_USER_ID,
        FIXED_ADDRESS_ID,
        updateDto,
      );

      expect(result).toBeDefined();
    });

    it('when_update_others_address_then_403', async () => {
      /**
       * SC-005 (FR-004 관련):
       * 타인 배송지 수정 시도 시 ForbiddenException (403).
       * address.userId !== userId → throw ForbiddenException.
       */
      const othersAddress = { ...FIXED_ADDRESS, userId: 'other-user-id' };
      mockUserRepository.findAddressById.mockResolvedValue(othersAddress);

      await expect(
        (service as any).updateAddress(FIXED_USER_ID, FIXED_ADDRESS_ID, {}),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  // ─────────────────────────────────────────────
  // SC-006: DELETE 기본배송지 → 최근 생성 자동 재지정
  // ─────────────────────────────────────────────
  describe('SC-006: deleteAddress — 기본배송지 삭제 자동 재지정', () => {
    it('when_delete_default_address_then_reassign_latest', async () => {
      /**
       * SC-006 (FR-005 관련):
       * 기본 배송지(isDefault=true) 삭제 시, 나머지 배송지 중
       * 가장 최근 생성된 것이 자동으로 기본 배송지로 지정된다.
       * 재지정은 단일 트랜잭션 내에서 수행된다.
       */
      const defaultAddress = { ...FIXED_ADDRESS, isDefault: true };
      const otherAddress = {
        id: 'other-addr-id',
        userId: FIXED_USER_ID,
        isDefault: false,
        createdAt: new Date('2026-01-02T00:00:00.000Z'),
      };

      mockUserRepository.findAddressById.mockResolvedValue(defaultAddress);
      mockUserRepository.deleteAddressWithReassign.mockResolvedValue(undefined);

      await (service as any).deleteAddress(FIXED_USER_ID, FIXED_ADDRESS_ID);

      // deleteAddressWithReassign(재지정 포함 삭제) 호출 확인
      expect(mockUserRepository.deleteAddressWithReassign).toHaveBeenCalledWith(
        FIXED_USER_ID,
        FIXED_ADDRESS_ID,
        true, // wasDefault
      );
    });
  });

  // ─────────────────────────────────────────────
  // SC-007: PATCH default → 이전 기본 배송지 해제
  // ─────────────────────────────────────────────
  describe('SC-007: setDefaultAddress — 기본 배송지 단일성 보장', () => {
    it('when_set_default_then_previous_unset', async () => {
      /**
       * SC-007 (FR-006 관련):
       * 기본 배송지 지정 시 이전 기본 배송지의 isDefault가 false로 해제된다.
       * 트랜잭션 내에서 updateMany(isDefault=false) 후 대상 update(isDefault=true).
       */
      mockUserRepository.findAddressById.mockResolvedValue(FIXED_ADDRESS);
      mockUserRepository.setDefaultTx = jest.fn().mockResolvedValue(undefined);

      await (service as any).setDefaultAddress(FIXED_USER_ID, FIXED_ADDRESS_ID);

      // setDefaultTx 호출 확인 (트랜잭션 내 단일성 보장)
      expect(mockUserRepository.setDefaultTx).toHaveBeenCalled();
    });
  });

  // ─────────────────────────────────────────────
  // SC-008: 찜 추가 / 중복 409
  // ─────────────────────────────────────────────
  describe('SC-008: addWishlist — 추가 성공 / 중복 409', () => {
    it('when_add_wishlist_then_added', async () => {
      /**
       * SC-008 (FR-007 관련):
       * 찜 추가 성공 시 생성된 wishlist 레코드 반환.
       */
      const wishlistRecord = {
        userId: FIXED_USER_ID,
        productId: FIXED_PRODUCT_ID,
      };
      mockUserRepository.createWishlist.mockResolvedValue(wishlistRecord);

      const result = await (service as any).addWishlist(
        FIXED_USER_ID,
        FIXED_PRODUCT_ID,
      );

      expect(mockUserRepository.createWishlist).toHaveBeenCalledWith(
        FIXED_USER_ID,
        FIXED_PRODUCT_ID,
      );
      expect(result).toBeDefined();
    });

    it('when_add_wishlist_dup_then_conflict_409', async () => {
      /**
       * SC-008 (FR-007 관련):
       * 이미 찜한 상품에 재요청 시 ConflictException (409).
       * @@unique([userId,productId]) 위반 → Prisma P2002 → ConflictException.
       */
      // instanceof Prisma.PrismaClientKnownRequestError 검사를 통과하려면
      // 실제 생성자 사용이 필요하다 (plain Error + code 속성으로는 검사 실패).
      const prismaUniqueError = new Prisma.PrismaClientKnownRequestError(
        'Unique constraint failed',
        { code: 'P2002', clientVersion: '0.0.0' },
      );
      mockUserRepository.createWishlist.mockRejectedValue(prismaUniqueError);

      await expect(
        (service as any).addWishlist(FIXED_USER_ID, FIXED_PRODUCT_ID),
      ).rejects.toThrow(ConflictException);
    });
  });

  // ─────────────────────────────────────────────
  // SC-009: 찜 제거 → 204
  // ─────────────────────────────────────────────
  describe('SC-009: removeWishlist — 찜 제거 204', () => {
    it('when_remove_wishlist_then_204', async () => {
      /**
       * SC-009 (FR-007 관련):
       * 찜 목록에서 상품 제거. 반환 없음(void).
       */
      mockUserRepository.deleteWishlist.mockResolvedValue(undefined);

      await expect(
        (service as any).removeWishlist(FIXED_USER_ID, FIXED_PRODUCT_ID),
      ).resolves.toBeUndefined();

      expect(mockUserRepository.deleteWishlist).toHaveBeenCalledWith(
        FIXED_USER_ID,
        FIXED_PRODUCT_ID,
      );
    });
  });

  // ─────────────────────────────────────────────
  // SC-010: GET /users/me/wishlist → 찜 목록
  // ─────────────────────────────────────────────
  describe('SC-010: listWishlist — 찜 목록 반환', () => {
    it('when_list_wishlist_then_items', async () => {
      /**
       * SC-010 (FR-008 관련):
       * 찜 목록 조회 시 해당 사용자의 wishlist 배열 반환.
       */
      const wishlists = [
        { userId: FIXED_USER_ID, productId: 'product-1' },
        { userId: FIXED_USER_ID, productId: 'product-2' },
      ];
      mockUserRepository.findWishlistsByUser.mockResolvedValue(wishlists);

      const result = await (service as any).listWishlist(FIXED_USER_ID);

      expect(mockUserRepository.findWishlistsByUser).toHaveBeenCalledWith(
        FIXED_USER_ID,
      );
      expect(result).toHaveLength(2);
    });
  });

  // ─────────────────────────────────────────────
  // SC-012: 최근 본 상품 최신순 50 상한
  // ─────────────────────────────────────────────
  describe('SC-012: listRecentViews — 최신순 최대 50개', () => {
    it('when_views_over_50_then_latest_50', async () => {
      /**
       * SC-012 (FR-010 관련):
       * 최근 본 상품 조회 시 MAX_PRODUCT_VIEWS(50) 상한으로 최신순 반환.
       * findRecentViews(userId, MAX_PRODUCT_VIEWS) 호출 확인.
       */
      const mockViews = Array.from({ length: 50 }, (_, i) => ({
        userId: FIXED_USER_ID,
        productId: `product-${i}`,
        viewedAt: new Date(Date.now() - i * 1000),
      }));
      mockUserRepository.findRecentViews.mockResolvedValue(mockViews);

      const result = await (service as any).listRecentViews(FIXED_USER_ID);

      expect(mockUserRepository.findRecentViews).toHaveBeenCalledWith(
        FIXED_USER_ID,
        MAX_PRODUCT_VIEWS,
      );
      expect(result).toHaveLength(50);
    });
  });

  // ─────────────────────────────────────────────
  // SC-014 (v1.1.0/017 spec): listWishlist — ACTIVE 상품 요약 enrichment
  // ─────────────────────────────────────────────
  describe('SC-014: listWishlist — ACTIVE 상품 요약(title·price·thumbnailUrl) 포함', () => {
    it('when_wishlist_item_references_active_product_then_summary_included', async () => {
      /**
       * SC-014 (FR-010 관련, v1.1.0/017 spec):
       * 위시리스트에 담긴 ACTIVE 상태 상품을 조회하면, 각 항목에 title·price·대표 이미지 URL
       * 이 포함되어 반환된다.
       * production: findWishlistsByUser → productService.getPublicSummaries(ids) →
       *   summaries.get(productId) 존재 시 productAvailable=true·product={title,price,thumbnailUrl}.
       */
      const wishlists = [
        { id: 'w1', userId: FIXED_USER_ID, productId: FIXED_PRODUCT_ID, createdAt: new Date() },
      ];
      mockUserRepository.findWishlistsByUser.mockResolvedValue(wishlists);
      mockProductService.getPublicSummaries.mockResolvedValue(
        new Map([
          [
            FIXED_PRODUCT_ID,
            { productId: FIXED_PRODUCT_ID, title: '테스트 상품', price: '10000', thumbnailUrl: 'https://example.com/img.jpg' },
          ],
        ]),
      );

      const result = await (service as any).listWishlist(FIXED_USER_ID);

      expect(mockProductService.getPublicSummaries).toHaveBeenCalledWith([FIXED_PRODUCT_ID]);
      expect(result[0].productAvailable).toBe(true);
      expect(result[0].product).toMatchObject({
        title: '테스트 상품',
        price: '10000',
        thumbnailUrl: 'https://example.com/img.jpg',
      });
    });
  });

  // ─────────────────────────────────────────────
  // SC-015 (v1.1.0/017 spec): listRecentViews — 상품 요약 enrichment
  // ─────────────────────────────────────────────
  describe('SC-015: listRecentViews — 상품 요약(title·price·thumbnailUrl) 포함', () => {
    it('when_recent_view_references_active_product_then_summary_included', async () => {
      /**
       * SC-015 (FR-011 관련, v1.1.0/017 spec):
       * 최근 본 상품 목록 조회 시 각 항목에 title·price·대표 이미지 URL 이 포함되어 반환된다.
       */
      const views = [
        { id: 'v1', userId: FIXED_USER_ID, productId: FIXED_PRODUCT_ID, viewedAt: new Date() },
      ];
      mockUserRepository.findRecentViews.mockResolvedValue(views);
      mockProductService.getPublicSummaries.mockResolvedValue(
        new Map([
          [
            FIXED_PRODUCT_ID,
            { productId: FIXED_PRODUCT_ID, title: '테스트 상품', price: '10000', thumbnailUrl: null },
          ],
        ]),
      );

      const result = await (service as any).listRecentViews(FIXED_USER_ID);

      expect(mockProductService.getPublicSummaries).toHaveBeenCalledWith([FIXED_PRODUCT_ID]);
      expect(result[0].productAvailable).toBe(true);
      expect(result[0].product).toMatchObject({ title: '테스트 상품', price: '10000', thumbnailUrl: null });
    });
  });

  // ─────────────────────────────────────────────
  // SC-016 (v1.1.0/017 spec): listWishlist — 조회 불가 상품 항목 유지·표시
  // ─────────────────────────────────────────────
  describe('SC-016: listWishlist — 삭제/DRAFT/INACTIVE 상품 항목 유지 + productAvailable=false', () => {
    it('when_wishlist_item_references_unavailable_product_then_item_kept_with_flag', async () => {
      /**
       * SC-016 (FR-012 관련, v1.1.0/017 spec) Edge:
       * 위시리스트에 담긴 상품이 삭제되었거나 DRAFT/INACTIVE 상태인 경우, 해당 위시리스트 항목은
       * 응답에서 누락되지 않고 productAvailable:false + product:null 로 유지된다(무음 필터링 금지, ASM-005).
       * production: getPublicSummaries 는 ACTIVE/OUT_OF_STOCK 만 조회 가능 → 조회 불가 상품은 Map 에서 자연 누락.
       */
      const unavailableProductId = 'draft-or-deleted-product-id';
      const wishlists = [
        { id: 'w1', userId: FIXED_USER_ID, productId: unavailableProductId, createdAt: new Date() },
      ];
      mockUserRepository.findWishlistsByUser.mockResolvedValue(wishlists);
      // 조회 불가 상품은 Map 에 없음(빈 Map)
      mockProductService.getPublicSummaries.mockResolvedValue(new Map());

      const result = await (service as any).listWishlist(FIXED_USER_ID);

      // 항목 자체는 누락되지 않고 유지됨
      expect(result).toHaveLength(1);
      expect(result[0].productId).toBe(unavailableProductId);
      expect(result[0].productAvailable).toBe(false);
      expect(result[0].product).toBeNull();
    });
  });

  // ─────────────────────────────────────────────
  // SC-017 (v1.1.0/017 spec): listRecentViews — 조회 불가 상품 항목 유지·표시
  // ─────────────────────────────────────────────
  describe('SC-017: listRecentViews — 조회 불가 상품 항목 유지 + productAvailable=false', () => {
    it('when_recent_view_references_unavailable_product_then_item_kept_with_flag', async () => {
      /**
       * SC-017 (FR-012 관련, v1.1.0/017 spec) Edge:
       * 최근 본 상품 목록에서도 동일하게, 참조 상품이 조회 불가 상태인 항목이 누락 없이 유지되고
       * 조회 불가 여부가 표시된다.
       */
      const unavailableProductId = 'inactive-or-deleted-product-id';
      const views = [
        { id: 'v1', userId: FIXED_USER_ID, productId: unavailableProductId, viewedAt: new Date() },
      ];
      mockUserRepository.findRecentViews.mockResolvedValue(views);
      mockProductService.getPublicSummaries.mockResolvedValue(new Map());

      const result = await (service as any).listRecentViews(FIXED_USER_ID);

      expect(result).toHaveLength(1);
      expect(result[0].productId).toBe(unavailableProductId);
      expect(result[0].productAvailable).toBe(false);
      expect(result[0].product).toBeNull();
    });
  });
});
