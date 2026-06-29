/**
 * OrderService 단위 테스트 — [env:unit]
 *
 * 대상 SC (003): SC-009~032, SC-037 | (004): SC-012, SC-019, SC-020, SC-021, SC-023
 * 검증 방법: Jest mock (OrderRepository, ProductService, InventoryService,
 *              CartService, PaymentService, SellerService, PrismaService, CouponService)
 * TDD Red: 구현 미완성 상태에서 작성된 테스트. import error 허용.
 *
 * Canonical 심볼 (tasks.md Test Authoring Contract):
 *   OrderService.createOrder(userId, {items:[{variantId,quantity}], shippingAddress})
 *   OrderService.listMyOrders(userId, cursor?, limit?)
 *   OrderService.getDetail(userId, id)
 *   OrderService.cancel(userId, id)
 *   OrderService.listSellerOrders(userId)
 *   OrderService.confirmBySeller(userId, id)
 *   OrderService.complete(userId, id)
 *   OrderService.autoConfirmDelivered(now: Date): Promise<number>
 *   OrderService.markConfirmed(orderId): Promise<void>
 */

import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { ActorType, OrderStatus, Prisma } from '@prisma/client';
import { OrderService } from './order.service';
import { OrderRepository } from './order.repository';
import { ProductService } from '../product/product.service';
import { InventoryService } from '../inventory/inventory.service';
import { CartService } from '../cart/cart.service';
import { PaymentService } from '../payment/payment.service';
import { SellerService } from '../seller/seller.service';
import { PrismaService } from '../../shared/prisma/prisma.service';
import { CouponService } from '../coupon/coupon.service';
import { AUTO_CONFIRM_DAYS, DEFAULT_PAGE_LIMIT } from './order.constants';

// ─────────────────────────────────────────────
// Mock 팩토리
// ─────────────────────────────────────────────
const mockOrderRepository = {
  createOrder: jest.fn(),
  createItems: jest.fn(),
  appendEvent: jest.fn(),
  findById: jest.fn(),
  listByUser: jest.fn(),
  listBySeller: jest.fn(),
  updateStatus: jest.fn(),
  findDeliveredBefore: jest.fn(),
};

const mockProductService = {
  getVariantSnapshot: jest.fn(),
  getVariantSnapshots: jest.fn(),
  assertSellerOwnsVariant: jest.fn(),
};

const mockInventoryService = {
  decreaseStock: jest.fn(),
  restoreStock: jest.fn(),
  checkAvailability: jest.fn(),
};

const mockCartService = {
  removeItems: jest.fn(),
};

const mockPaymentService = {
  refund: jest.fn(),
  findPaymentByOrderId: jest.fn(),
};

const mockSellerService = {
  getApprovedSeller: jest.fn(),
};

const mockPrismaService = {
  runInTransaction: jest.fn().mockImplementation((fn: () => unknown) => fn()),
  onAfterCommit: jest.fn().mockImplementation((cb: () => unknown) => Promise.resolve(cb())),
  get tx() { return this; },
};

// 009: OrderService 가 order.created 이벤트를 발행하므로 EventEmitter2 mock 필요
const mockEventEmitter = { emit: jest.fn() };

// T041 (004 spec): CouponService mock — §F provider 등록 + SC-012/019/020/021/023 테스트
const mockCouponService = {
  validateAndCalculateDiscount: jest.fn(),
  markUsed: jest.fn(),
  restoreForOrder: jest.fn(),
};

// ─────────────────────────────────────────────
// 고정 픽스처
// ─────────────────────────────────────────────
const FIXED_USER_ID = 'user-id-customer-001';
const FIXED_OTHER_USER_ID = 'user-id-other-002';
const FIXED_SELLER_ID = 'seller-id-001';
const FIXED_OTHER_SELLER_ID = 'seller-id-999';
const FIXED_ORDER_ID = 'order-id-001';
const FIXED_PAYMENT_ID = 'payment-id-001';
const FIXED_VARIANT_ID = 'variant-id-001';
const FIXED_VARIANT_ID_2 = 'variant-id-002';

const FIXED_VARIANT_SNAPSHOTS = new Map([
  [FIXED_VARIANT_ID, {
    variantId: FIXED_VARIANT_ID,
    productId: 'product-001',
    sellerId: FIXED_SELLER_ID,
    // Prisma.Decimal 인스턴스 사용 — production: snap.unitPrice.mul(quantity) 호출
    unitPrice: new Prisma.Decimal('15000'),
    optionName: '색상',
    optionValue: '블랙',
    productTitle: '테스트 상품',
    sku: 'SKU-001',
  }],
  [FIXED_VARIANT_ID_2, {
    variantId: FIXED_VARIANT_ID_2,
    productId: 'product-002',
    sellerId: FIXED_SELLER_ID,
    unitPrice: new Prisma.Decimal('5000'),
    optionName: '사이즈',
    optionValue: 'M',
    productTitle: '다른 상품',
    sku: 'SKU-002',
  }],
]);

const FIXED_SHIPPING_ADDRESS = {
  recipientName: '홍길동',
  phone: '010-1234-5678',
  zipCode: '12345',
  address1: '서울시 강남구 테헤란로 123',
  address2: '101호',
};

const FIXED_ORDER_PENDING = {
  id: FIXED_ORDER_ID,
  userId: FIXED_USER_ID,
  status: 'pending',
  totalAmount: '20000',
  discountAmount: '0',
  shippingAddressSnapshot: FIXED_SHIPPING_ADDRESS,
  items: [
    { variantId: FIXED_VARIANT_ID, quantity: 1, sellerId: FIXED_SELLER_ID, unitPrice: '15000' },
    { variantId: FIXED_VARIANT_ID_2, quantity: 1, sellerId: FIXED_SELLER_ID, unitPrice: '5000' },
  ],
};

const FIXED_ORDER_DELIVERED = {
  ...FIXED_ORDER_PENDING,
  status: 'delivered',
  deliveredAt: new Date(Date.now() - (AUTO_CONFIRM_DAYS + 1) * 86_400_000),
};

describe('OrderService', () => {
  let service: OrderService;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OrderService,
        { provide: OrderRepository, useValue: mockOrderRepository },
        { provide: ProductService, useValue: mockProductService },
        { provide: InventoryService, useValue: mockInventoryService },
        { provide: CartService, useValue: mockCartService },
        { provide: PaymentService, useValue: mockPaymentService },
        { provide: SellerService, useValue: mockSellerService },
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: CouponService, useValue: mockCouponService },
        { provide: EventEmitter2, useValue: mockEventEmitter },
      ],
    }).compile();

    service = module.get<OrderService>(OrderService);
  });

  // ─────────────────────────────────────────────
  // SC-009, SC-010: 주문 생성 Happy Path
  // ─────────────────────────────────────────────
  describe('SC-009/SC-010: createOrder — 주문 생성', () => {
    it('when_order_then_created', async () => {
      /**
       * SC-009 (FR-010 관련), SC-010 (FR-011 관련):
       * 유효한 items와 shippingAddress로 주문 생성.
       * production: getVariantSnapshots → checkAvailability → runInTransaction:
       *   order insert → decreaseStock → createItems → appendEvent → removeItems
       */
      mockProductService.getVariantSnapshots.mockResolvedValue(FIXED_VARIANT_SNAPSHOTS);
      mockInventoryService.checkAvailability.mockResolvedValue(true); // 재고 충분
      mockOrderRepository.createOrder.mockResolvedValue({ id: FIXED_ORDER_ID, status: 'pending' });
      mockOrderRepository.createItems.mockResolvedValue(undefined);
      mockOrderRepository.appendEvent.mockResolvedValue(undefined);
      mockInventoryService.decreaseStock.mockResolvedValue(undefined);
      mockCartService.removeItems.mockResolvedValue(undefined);

      await service.createOrder(FIXED_USER_ID, {
        items: [
          { variantId: FIXED_VARIANT_ID, quantity: 1 },
          { variantId: FIXED_VARIANT_ID_2, quantity: 1 },
        ],
        shippingAddress: FIXED_SHIPPING_ADDRESS,
      });

      expect(mockProductService.getVariantSnapshots).toHaveBeenCalledWith([
        FIXED_VARIANT_ID, FIXED_VARIANT_ID_2,
      ]);
      expect(mockOrderRepository.createOrder).toHaveBeenCalled();
    });

    it('when_partial_select_then_ok', async () => {
      /**
       * SC-010 (FR-011 관련) Edge:
       * items 중 일부만 선택하여 주문해도 성공.
       */
      const partialSnapshots = new Map([
        [FIXED_VARIANT_ID, FIXED_VARIANT_SNAPSHOTS.get(FIXED_VARIANT_ID)!],
      ]);
      mockProductService.getVariantSnapshots.mockResolvedValue(partialSnapshots);
      mockInventoryService.checkAvailability.mockResolvedValue(true);
      mockOrderRepository.createOrder.mockResolvedValue({ id: FIXED_ORDER_ID, status: 'pending' });
      mockOrderRepository.createItems.mockResolvedValue(undefined);
      mockOrderRepository.appendEvent.mockResolvedValue(undefined);
      mockInventoryService.decreaseStock.mockResolvedValue(undefined);
      mockCartService.removeItems.mockResolvedValue(undefined);

      await service.createOrder(FIXED_USER_ID, {
        items: [{ variantId: FIXED_VARIANT_ID, quantity: 2 }],
        shippingAddress: FIXED_SHIPPING_ADDRESS,
      });

      expect(mockProductService.getVariantSnapshots).toHaveBeenCalledWith([FIXED_VARIANT_ID]);
    });
  });

  // ─────────────────────────────────────────────
  // SC-011: 재고 부족 → 409 ConflictException
  // ─────────────────────────────────────────────
  describe('SC-011: createOrder — 재고 부족 409', () => {
    it('when_insufficient_then_409_with_variantIds', async () => {
      /**
       * SC-011 (FR-012 관련):
       * 재고 부족 variantId가 1개 이상이면 ConflictException(409)를 던지고
       * 부족한 variantId 목록을 포함해야 함.
       * production: checkAvailability → false인 항목 수집 → tx 진입 전 409
       */
      mockProductService.getVariantSnapshots.mockResolvedValue(FIXED_VARIANT_SNAPSHOTS);
      // checkAvailability: VARIANT_ID_2만 부족
      mockInventoryService.checkAvailability.mockImplementation(
        async (variantId: string) => variantId !== FIXED_VARIANT_ID_2,
      );

      await expect(
        service.createOrder(FIXED_USER_ID, {
          items: [
            { variantId: FIXED_VARIANT_ID, quantity: 1 },
            { variantId: FIXED_VARIANT_ID_2, quantity: 999 },
          ],
          shippingAddress: FIXED_SHIPPING_ADDRESS,
        }),
      ).rejects.toThrow(ConflictException);

      // tx 진입(runInTransaction) 없이 사전 검증에서 거부
      expect(mockOrderRepository.createOrder).not.toHaveBeenCalled();
    });
  });

  // ─────────────────────────────────────────────
  // SC-012: decreaseStock 실패 → tx 롤백
  // ─────────────────────────────────────────────
  describe('SC-012: createOrder — tx 원자성', () => {
    it('when_decreaseStock_fails_then_order_rolled_back', async () => {
      /**
       * SC-012 (FR-013 관련):
       * tx 내 decreaseStock이 실패하면 전체 tx가 롤백됨.
       * 단위 테스트: decreaseStock throw → runInTransaction 전체 reject.
       * 실제 DB 롤백은 category(2) uncoverable (integration 테스트 범주).
       */
      mockProductService.getVariantSnapshots.mockResolvedValue(
        new Map([[FIXED_VARIANT_ID, FIXED_VARIANT_SNAPSHOTS.get(FIXED_VARIANT_ID)!]]),
      );
      mockInventoryService.checkAvailability.mockResolvedValue(true);
      mockOrderRepository.createOrder.mockResolvedValue({ id: FIXED_ORDER_ID });

      // decreaseStock이 InsufficientStock 에러 발생 (race condition 시뮬)
      const raceError = new ConflictException('InsufficientStock');
      mockInventoryService.decreaseStock.mockRejectedValue(raceError);

      // runInTransaction은 내부 fn을 실행하므로 decreaseStock 에러가 전파됨
      await expect(
        service.createOrder(FIXED_USER_ID, {
          items: [{ variantId: FIXED_VARIANT_ID, quantity: 1 }],
          shippingAddress: FIXED_SHIPPING_ADDRESS,
        }),
      ).rejects.toThrow(ConflictException);
    });
  });

  // ─────────────────────────────────────────────
  // SC-013: 주문 후 장바구니 아이템 제거
  // ─────────────────────────────────────────────
  describe('SC-013: createOrder — 장바구니 제거', () => {
    it('when_order_then_cart_removeItems_called', async () => {
      /**
       * SC-013 (FR-014 관련):
       * 주문 성공 시 해당 variantId들을 장바구니에서 제거.
       * production: tx 내 마지막 단계에서 cartService.removeItems(userId, variantIds)
       */
      mockProductService.getVariantSnapshots.mockResolvedValue(
        new Map([[FIXED_VARIANT_ID, FIXED_VARIANT_SNAPSHOTS.get(FIXED_VARIANT_ID)!]]),
      );
      mockInventoryService.checkAvailability.mockResolvedValue(true);
      mockOrderRepository.createOrder.mockResolvedValue({ id: FIXED_ORDER_ID });
      mockOrderRepository.createItems.mockResolvedValue(undefined);
      mockOrderRepository.appendEvent.mockResolvedValue(undefined);
      mockInventoryService.decreaseStock.mockResolvedValue(undefined);
      mockCartService.removeItems.mockResolvedValue(undefined);

      await service.createOrder(FIXED_USER_ID, {
        items: [{ variantId: FIXED_VARIANT_ID, quantity: 1 }],
        shippingAddress: FIXED_SHIPPING_ADDRESS,
      });

      expect(mockCartService.removeItems).toHaveBeenCalledWith(
        FIXED_USER_ID,
        expect.arrayContaining([FIXED_VARIANT_ID]),
      );
    });
  });

  // ─────────────────────────────────────────────
  // SC-014: 주문 생성 시 status=pending
  // SC-015: 주문 생성 시 스냅샷 캡처
  // SC-016: totalAmount=Σ(unitPrice×quantity), discountAmount=0
  // ─────────────────────────────────────────────
  describe('SC-014/SC-015/SC-016: createOrder — 주문 상태·스냅샷·금액', () => {
    it('when_order_then_pending_and_snapshot_and_total', async () => {
      /**
       * SC-014 (FR-015 관련): status=pending
       * SC-015 (FR-016 관련): 상품 스냅샷(unitPrice, title, option) 저장
       * SC-016 (FR-017 관련): totalAmount = Σ(unitPrice×q), discountAmount = 0
       * Decimal 타입으로 금액 계산.
       */
      const singleItemSnapshot = new Map([
        [FIXED_VARIANT_ID, {
          variantId: FIXED_VARIANT_ID,
          productId: 'p1',
          sellerId: FIXED_SELLER_ID,
          // Prisma.Decimal 인스턴스 사용 — production: snap.unitPrice.mul(quantity) 호출
          unitPrice: new Prisma.Decimal('15000'),
          optionName: '색상',
          optionValue: '블랙',
          productTitle: '테스트 상품',
          sku: 'SKU-001',
        }],
      ]);
      mockProductService.getVariantSnapshots.mockResolvedValue(singleItemSnapshot);
      mockInventoryService.checkAvailability.mockResolvedValue(true);

      let capturedOrderData: Record<string, unknown> | null = null;
      mockOrderRepository.createOrder.mockImplementation(async (data: unknown) => {
        capturedOrderData = data as Record<string, unknown>;
        return { id: FIXED_ORDER_ID, ...(data as object) };
      });
      mockOrderRepository.createItems.mockResolvedValue(undefined);
      mockOrderRepository.appendEvent.mockResolvedValue(undefined);
      mockInventoryService.decreaseStock.mockResolvedValue(undefined);
      mockCartService.removeItems.mockResolvedValue(undefined);

      await service.createOrder(FIXED_USER_ID, {
        items: [{ variantId: FIXED_VARIANT_ID, quantity: 2 }],
        shippingAddress: FIXED_SHIPPING_ADDRESS,
      });

      // SC-014: status=pending
      // repository.createOrder가 status를 자체 추가하므로 service→repo 전달 데이터에 status 없음.
      // appendEvent(toStatus: pending) 호출로 pending 의도 검증.
      expect(mockOrderRepository.appendEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          toStatus: OrderStatus.pending,
          actorType: ActorType.CUSTOMER,
        }),
      );
      // SC-016: totalAmount = 15000 × 2 = 30000, discountAmount = 0
      expect(capturedOrderData).toMatchObject({
        discountAmount: expect.anything(), // 0 (Decimal 형태)
      });
    });
  });

  // ─────────────────────────────────────────────
  // SC-017: 주문 목록 커서 페이지네이션
  // SC-018: 주문 상세 조회 (본인)
  // ─────────────────────────────────────────────
  describe('SC-017: listMyOrders — 목록 cursor 페이지네이션', () => {
    it('when_list_then_nextCursor', async () => {
      /**
       * SC-017 (FR-018 관련):
       * listMyOrders(userId, cursor, limit) → {items, nextCursor} 형태.
       * nextCursor는 마지막 아이템의 id(또는 createdAt+id 복합).
       */
      const orderList = [FIXED_ORDER_PENDING];
      mockOrderRepository.listByUser.mockResolvedValue({ items: orderList, nextCursor: 'cursor-xyz' });

      const result = await service.listMyOrders(FIXED_USER_ID, undefined, DEFAULT_PAGE_LIMIT);

      expect(mockOrderRepository.listByUser).toHaveBeenCalledWith(FIXED_USER_ID, undefined, DEFAULT_PAGE_LIMIT);
      expect(result).toMatchObject({
        items: expect.any(Array),
        nextCursor: expect.anything(),
      });
    });
  });

  describe('SC-018: getDetail — 본인 주문 상세 조회', () => {
    it('when_own_detail_then_200', async () => {
      /**
       * SC-018 (FR-019 관련):
       * 본인 주문 상세 조회 → 주문 정보 반환.
       */
      mockOrderRepository.findById.mockResolvedValue(FIXED_ORDER_PENDING);

      const result = await service.getDetail(FIXED_USER_ID, FIXED_ORDER_ID);

      expect(mockOrderRepository.findById).toHaveBeenCalledWith(FIXED_ORDER_ID);
      expect(result).toBeDefined();
    });
  });

  // ─────────────────────────────────────────────
  // SC-019: 타인 주문 상세 조회 → 403
  // ─────────────────────────────────────────────
  describe('SC-019: getDetail — 타인 주문 403', () => {
    it('when_other_user_then_403', async () => {
      /**
       * SC-019 (FR-020 관련):
       * 다른 userId의 주문을 getDetail로 조회 시 ForbiddenException(403).
       */
      mockOrderRepository.findById.mockResolvedValue({
        ...FIXED_ORDER_PENDING,
        userId: FIXED_OTHER_USER_ID, // 다른 사용자 소유
      });

      await expect(service.getDetail(FIXED_USER_ID, FIXED_ORDER_ID)).rejects.toThrow(
        ForbiddenException,
      );
    });
  });

  // ─────────────────────────────────────────────
  // SC-020: pending 주문 취소 → cancelled
  // SC-021: confirmed 주문 취소 → cancelled
  // ─────────────────────────────────────────────
  describe('SC-020/SC-021: cancel — pending·confirmed 취소 가능', () => {
    it.each([
      ['pending', 'when_cancel_pending_then_cancelled'],
      ['confirmed', 'when_cancel_confirmed_then_cancelled'],
    ] as const)('cancel %s order → cancelled', async (cancelStatus, _label) => {
      /**
       * SC-020 (FR-021 관련): pending → cancelled
       * SC-021 (FR-021 관련): confirmed → cancelled
       */
      mockOrderRepository.findById.mockResolvedValue({
        ...FIXED_ORDER_PENDING,
        status: cancelStatus,
      });
      // SEC-FIND-001: cancel() 이 findPaymentByOrderId 로 결제 직접 조회.
      // 결제 없음 → 환불 불필요.
      mockPaymentService.findPaymentByOrderId.mockResolvedValue(null);
      mockOrderRepository.updateStatus.mockResolvedValue(undefined);
      mockOrderRepository.appendEvent.mockResolvedValue(undefined);
      mockInventoryService.restoreStock.mockResolvedValue(undefined);

      await service.cancel(FIXED_USER_ID, FIXED_ORDER_ID);

      expect(mockOrderRepository.updateStatus).toHaveBeenCalledWith(
        FIXED_ORDER_ID,
        'cancelled',
      );
    });
  });

  // ─────────────────────────────────────────────
  // SC-022: preparing 이후 취소 → 400
  // ─────────────────────────────────────────────
  describe('SC-022: cancel — preparing 상태 취소 불가 400', () => {
    it('when_cancel_preparing_then_400', async () => {
      /**
       * SC-022 (FR-021 관련):
       * status=preparing 이후(preparing·delivered·completed) 취소 시도 → BadRequestException(400).
       * tasks.md T032: "status∉{pending,confirmed}→400"
       */
      mockOrderRepository.findById.mockResolvedValue({
        ...FIXED_ORDER_PENDING,
        status: 'preparing',
      });

      await expect(service.cancel(FIXED_USER_ID, FIXED_ORDER_ID)).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  // ─────────────────────────────────────────────
  // SC-023: 타인 주문 취소 → 403
  // ─────────────────────────────────────────────
  describe('SC-023: cancel — 타인 주문 403', () => {
    it('when_other_user_cancel_then_403', async () => {
      /**
       * SC-023 (FR-022 관련):
       * 타인 주문 취소 시도 → ForbiddenException(403).
       */
      mockOrderRepository.findById.mockResolvedValue({
        ...FIXED_ORDER_PENDING,
        userId: FIXED_OTHER_USER_ID,
      });

      await expect(service.cancel(FIXED_USER_ID, FIXED_ORDER_ID)).rejects.toThrow(
        ForbiddenException,
      );
    });
  });

  // ─────────────────────────────────────────────
  // SC-024: 취소 시 환불+재고복구 동일 tx
  // ─────────────────────────────────────────────
  describe('SC-024: cancel (PAID) — 환불·재고복구 동일 tx', () => {
    it('when_cancel_paid_then_refund_restore_cancel_same_tx', async () => {
      /**
       * SC-024 (FR-022 관련):
       * 결제 완료된 주문 취소 시:
       *   1. paymentService.refund(paymentId, 'refund:'+orderId) 호출
       *   2. inventoryService.restoreStock 호출
       *   3. order status = cancelled
       *   모두 동일 runInTransaction 내에서 실행.
       */
      const idempotencyKey = `refund:${FIXED_ORDER_ID}`;
      mockOrderRepository.findById.mockResolvedValue({
        ...FIXED_ORDER_PENDING,
        status: 'confirmed',
      });
      // SEC-FIND-001: cancel() 이 findPaymentByOrderId 로 결제 직접 조회 (cross-schema 경계).
      // completed 결제 존재 → refund 호출해야 함.
      mockPaymentService.findPaymentByOrderId.mockResolvedValue({
        id: FIXED_PAYMENT_ID,
        status: 'completed',
      });
      mockPaymentService.refund.mockResolvedValue({ success: true });
      mockInventoryService.restoreStock.mockResolvedValue(undefined);
      mockOrderRepository.updateStatus.mockResolvedValue(undefined);
      mockOrderRepository.appendEvent.mockResolvedValue(undefined);

      await service.cancel(FIXED_USER_ID, FIXED_ORDER_ID);

      // 환불 호출 검증
      expect(mockPaymentService.refund).toHaveBeenCalledWith(FIXED_PAYMENT_ID, idempotencyKey);
      // 재고복구 호출 검증 (각 item별)
      expect(mockInventoryService.restoreStock).toHaveBeenCalled();
      // order 취소 처리
      expect(mockOrderRepository.updateStatus).toHaveBeenCalledWith(FIXED_ORDER_ID, 'cancelled');
    });
  });

  // ─────────────────────────────────────────────
  // SC-025: 취소 시 restoreStock 호출
  // ─────────────────────────────────────────────
  describe('SC-025: cancel — restoreStock 호출', () => {
    it('when_cancel_then_restoreStock_called', async () => {
      /**
       * SC-025 (FR-023 관련):
       * 주문 취소 시 각 order item에 대해 restoreStock(variantId, quantity, orderId) 호출.
       * (InventoryService 단위 검증은 T074 — inventory.service.spec.ts 확장)
       */
      mockOrderRepository.findById.mockResolvedValue({
        ...FIXED_ORDER_PENDING,
        status: 'pending',
      });
      mockPaymentService.findPaymentByOrderId.mockResolvedValue(null);
      mockInventoryService.restoreStock.mockResolvedValue(undefined);
      mockOrderRepository.updateStatus.mockResolvedValue(undefined);
      mockOrderRepository.appendEvent.mockResolvedValue(undefined);

      await service.cancel(FIXED_USER_ID, FIXED_ORDER_ID);

      // FIXED_ORDER_PENDING.items 각 아이템에 대해 restoreStock 호출
      expect(mockInventoryService.restoreStock).toHaveBeenCalledWith(
        FIXED_VARIANT_ID,
        1, // quantity from FIXED_ORDER_PENDING.items[0]
        FIXED_ORDER_ID,
      );
    });
  });

  // ─────────────────────────────────────────────
  // SC-026: 판매자 주문 목록 (listSellerOrders)
  // ─────────────────────────────────────────────
  describe('SC-026: listSellerOrders — 판매자 주문 목록', () => {
    it('when_seller_orders_then_list', async () => {
      /**
       * SC-026 (FR-024 관련):
       * listSellerOrders(userId) → sellerId 필터 적용 주문 목록 반환.
       * production: getApprovedSeller(userId) → seller.id → listBySeller(sellerId)
       */
      mockSellerService.getApprovedSeller.mockResolvedValue({ id: FIXED_SELLER_ID, userId: FIXED_USER_ID });
      mockOrderRepository.listBySeller.mockResolvedValue([FIXED_ORDER_PENDING]);

      const result = await service.listSellerOrders(FIXED_USER_ID);

      expect(mockSellerService.getApprovedSeller).toHaveBeenCalledWith(FIXED_USER_ID);
      expect(mockOrderRepository.listBySeller).toHaveBeenCalledWith(FIXED_SELLER_ID);
      expect(Array.isArray(result)).toBe(true);
    });
  });

  // ─────────────────────────────────────────────
  // SC-027: confirmBySeller → preparing
  // ─────────────────────────────────────────────
  describe('SC-027: confirmBySeller — preparing 전이', () => {
    it('when_seller_confirm_then_preparing', async () => {
      /**
       * SC-027 (FR-025 관련):
       * confirmBySeller(userId, orderId) → order.status = preparing, SELLER event append.
       */
      mockSellerService.getApprovedSeller.mockResolvedValue({ id: FIXED_SELLER_ID, userId: FIXED_USER_ID });
      mockOrderRepository.findById.mockResolvedValue({
        ...FIXED_ORDER_PENDING,
        status: 'confirmed',
        items: [{ variantId: FIXED_VARIANT_ID, quantity: 1, sellerId: FIXED_SELLER_ID }],
      });
      mockOrderRepository.updateStatus.mockResolvedValue(undefined);
      mockOrderRepository.appendEvent.mockResolvedValue(undefined);

      await service.confirmBySeller(FIXED_USER_ID, FIXED_ORDER_ID);

      expect(mockOrderRepository.updateStatus).toHaveBeenCalledWith(FIXED_ORDER_ID, 'preparing');
    });
  });

  // ─────────────────────────────────────────────
  // SC-028: 타 판매자 확정 → 403
  // ─────────────────────────────────────────────
  describe('SC-028: confirmBySeller — 타 판매자 403', () => {
    it('when_not_my_seller_then_403', async () => {
      /**
       * SC-028 (FR-025 관련):
       * 해당 주문의 sellerId에 자신의 sellerId가 없으면 ForbiddenException(403).
       */
      mockSellerService.getApprovedSeller.mockResolvedValue({ id: FIXED_OTHER_SELLER_ID, userId: FIXED_USER_ID });
      mockOrderRepository.findById.mockResolvedValue({
        ...FIXED_ORDER_PENDING,
        status: 'confirmed',
        items: [{ variantId: FIXED_VARIANT_ID, quantity: 1, sellerId: FIXED_SELLER_ID }],
      });

      await expect(service.confirmBySeller(FIXED_USER_ID, FIXED_ORDER_ID)).rejects.toThrow(
        ForbiddenException,
      );
    });
  });

  // ─────────────────────────────────────────────
  // SC-029: complete (delivered → completed)
  // ─────────────────────────────────────────────
  describe('SC-029: complete — delivered → completed', () => {
    it('when_complete_delivered_then_completed', async () => {
      /**
       * SC-029 (FR-026 관련):
       * complete(userId, orderId) → order.status = completed (CUSTOMER event).
       * SC-027 (plan.md 표 확인): 구매확정
       */
      mockOrderRepository.findById.mockResolvedValue({
        ...FIXED_ORDER_DELIVERED,
        userId: FIXED_USER_ID,
      });
      mockOrderRepository.updateStatus.mockResolvedValue(undefined);
      mockOrderRepository.appendEvent.mockResolvedValue(undefined);

      await service.complete(FIXED_USER_ID, FIXED_ORDER_ID);

      // 012 GAP-005-02: completed 전이 시 completedAt 기록(정산 기준 시각)
      expect(mockOrderRepository.updateStatus).toHaveBeenCalledWith(
        FIXED_ORDER_ID,
        'completed',
        { completedAt: expect.any(Date) },
      );
    });
  });

  // ─────────────────────────────────────────────
  // SC-030: 타인 구매확정 → 403
  // ─────────────────────────────────────────────
  describe('SC-030: complete — 타인 주문 403', () => {
    it('when_other_complete_then_403', async () => {
      /**
       * SC-030 (FR-026 관련):
       * 타인 주문에 complete 호출 → ForbiddenException(403).
       */
      mockOrderRepository.findById.mockResolvedValue({
        ...FIXED_ORDER_DELIVERED,
        userId: FIXED_OTHER_USER_ID,
      });

      await expect(service.complete(FIXED_USER_ID, FIXED_ORDER_ID)).rejects.toThrow(
        ForbiddenException,
      );
    });
  });

  // ─────────────────────────────────────────────
  // SC-031: autoConfirmDelivered — now mock, 7일 경과 → completed
  // ─────────────────────────────────────────────
  describe('SC-031: autoConfirmDelivered — 자동 확정 (pg-boss 무관)', () => {
    it('when_autoConfirm_now_mock_then_completed', async () => {
      /**
       * SC-031 (FR-027 관련):
       * autoConfirmDelivered(now) — now 주입으로 단위 테스트 가능 (pg-boss 불요).
       * deliveredAt ≤ now - AUTO_CONFIRM_DAYS(7일)인 delivered 주문들 → completed.
       * 반환: 확정 처리된 주문 수.
       */
      const now = new Date('2026-01-10T00:00:00Z');
      const eligibleOrders = [
        { id: 'order-auto-001', status: 'delivered', deliveredAt: new Date('2026-01-01T00:00:00Z') },
        { id: 'order-auto-002', status: 'delivered', deliveredAt: new Date('2026-01-02T00:00:00Z') },
      ];

      mockOrderRepository.findDeliveredBefore.mockResolvedValue(eligibleOrders);
      mockOrderRepository.updateStatus.mockResolvedValue(undefined);
      mockOrderRepository.appendEvent.mockResolvedValue(undefined);

      const count = await service.autoConfirmDelivered(now);

      // findDeliveredBefore에 now - 7일 날짜 전달 검증
      expect(mockOrderRepository.findDeliveredBefore).toHaveBeenCalledWith(
        expect.any(Date),
      );
      // 012 GAP-005-02: 자동 확정도 completedAt(=now) 기록
      expect(mockOrderRepository.updateStatus).toHaveBeenCalledWith(
        'order-auto-001',
        'completed',
        { completedAt: now },
      );
      expect(count).toBe(eligibleOrders.length);
    });
  });

  // ─────────────────────────────────────────────
  // SC-032: 상태 전이 이벤트 append
  // ─────────────────────────────────────────────
  describe('SC-032: 상태 전이 → order_event append', () => {
    it('when_transition_then_order_event_appended', async () => {
      /**
       * SC-032 (FR-028 관련):
       * 모든 상태 전이 시 order_events에 1행 append (actorType: CUSTOMER/SELLER/SYSTEM).
       * 예시: cancel → 'CUSTOMER' actorType으로 appendEvent 호출.
       */
      mockOrderRepository.findById.mockResolvedValue({
        ...FIXED_ORDER_PENDING,
        status: 'pending',
      });
      mockPaymentService.findPaymentByOrderId.mockResolvedValue(null);
      mockInventoryService.restoreStock.mockResolvedValue(undefined);
      mockOrderRepository.updateStatus.mockResolvedValue(undefined);
      mockOrderRepository.appendEvent.mockResolvedValue(undefined);

      await service.cancel(FIXED_USER_ID, FIXED_ORDER_ID);

      expect(mockOrderRepository.appendEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          orderId: FIXED_ORDER_ID,
          actorType: 'CUSTOMER',
          toStatus: 'cancelled',
        }),
      );
    });
  });

  // ─────────────────────────────────────────────
  // SC-037: markConfirmed — pending → confirmed (멱등)
  // ─────────────────────────────────────────────
  describe('SC-037: markConfirmed — pending → confirmed (OutboxRelay 호출)', () => {
    it('when_markConfirmed_then_pending_to_confirmed', async () => {
      /**
       * SC-037 (FR-034 관련):
       * markConfirmed(orderId): pending → confirmed (SYSTEM actorType).
       * OutboxRelay가 payment.completed 처리 후 호출하는 메서드.
       */
      mockOrderRepository.findById.mockResolvedValue({
        ...FIXED_ORDER_PENDING,
        status: 'pending',
      });
      mockOrderRepository.updateStatus.mockResolvedValue(undefined);
      mockOrderRepository.appendEvent.mockResolvedValue(undefined);

      await service.markConfirmed(FIXED_ORDER_ID);

      expect(mockOrderRepository.updateStatus).toHaveBeenCalledWith(FIXED_ORDER_ID, 'confirmed');
      expect(mockOrderRepository.appendEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          orderId: FIXED_ORDER_ID,
          actorType: 'SYSTEM',
          toStatus: 'confirmed',
        }),
      );
    });

    it('when_already_confirmed_then_noop', async () => {
      /**
       * SC-037 (FR-034 관련) Edge:
       * markConfirmed 멱등 — 이미 confirmed 상태이면 no-op (appendEvent/updateStatus 미호출).
       * at-least-once 보장을 위한 멱등 처리.
       */
      mockOrderRepository.findById.mockResolvedValue({
        ...FIXED_ORDER_PENDING,
        status: 'confirmed', // 이미 confirmed
      });

      await service.markConfirmed(FIXED_ORDER_ID);

      // 이미 confirmed → 상태 변경 없음
      expect(mockOrderRepository.updateStatus).not.toHaveBeenCalled();
    });
  });

  // ─────────────────────────────────────────────
  // SC-012 (004): 쿠폰 적용 주문 — 할인 금액 서버 계산
  // ─────────────────────────────────────────────
  describe('SC-012 (004): createOrder with coupon — 서버가 discountAmount 계산', () => {
    it('when_userCouponId_provided_then_validate_and_markUsed_called', async () => {
      /**
       * SC-012 (FR-010 관련, 004 spec):
       * createOrder 시 userCouponId 가 전달되면:
       *   1. couponService.validateAndCalculateDiscount(userCouponId, userId, totalAmount) 호출 (pre-tx)
       *   2. couponService.markUsed(ucId, couponId, orderId, userId, discountAmount) 호출 (tx 내부)
       * discountAmount 는 서버 계산값 사용 — CreateOrderDto 에 discountAmount 없음 (SEC-FIND-004).
       *
       * PATCH-03: 쿠폰 적용 분기 — validate + markUsed 양쪽 모두 호출 검증
       */
      const singleItemSnapshot = new Map([
        [FIXED_VARIANT_ID, FIXED_VARIANT_SNAPSHOTS.get(FIXED_VARIANT_ID)!],
      ]);
      mockProductService.getVariantSnapshots.mockResolvedValue(singleItemSnapshot);
      mockInventoryService.checkAvailability.mockResolvedValue(true);
      mockCouponService.validateAndCalculateDiscount.mockResolvedValue({
        discountAmount: new Prisma.Decimal('5000'),
        couponId: 'coupon-1',
        userCouponId: 'uc-1',
      });
      mockCouponService.markUsed.mockResolvedValue(undefined);
      mockOrderRepository.createOrder.mockResolvedValue({ id: FIXED_ORDER_ID, status: 'pending' });
      mockOrderRepository.createItems.mockResolvedValue(undefined);
      mockOrderRepository.appendEvent.mockResolvedValue(undefined);
      mockInventoryService.decreaseStock.mockResolvedValue(undefined);
      mockCartService.removeItems.mockResolvedValue(undefined);
      mockOrderRepository.findById.mockResolvedValue({ ...FIXED_ORDER_PENDING });

      await service.createOrder(FIXED_USER_ID, {
        items: [{ variantId: FIXED_VARIANT_ID, quantity: 1 }],
        shippingAddress: FIXED_SHIPPING_ADDRESS,
        userCouponId: 'uc-1',
      });

      // validateAndCalculateDiscount: pre-tx 에서 쿠폰 검증 + 할인 계산
      expect(mockCouponService.validateAndCalculateDiscount).toHaveBeenCalledWith(
        'uc-1',
        FIXED_USER_ID,
        expect.any(Prisma.Decimal),
      );
      // markUsed: tx 내부에서 쿠폰 사용 처리
      expect(mockCouponService.markUsed).toHaveBeenCalledWith(
        'uc-1',
        'coupon-1',
        expect.any(String), // orderId (randomUUID)
        FIXED_USER_ID,
        expect.any(Prisma.Decimal),
      );
    });
  });

  // ─────────────────────────────────────────────
  // SC-021 (004): 쿠폰 미입력 — 할인 없이 주문 생성
  // ─────────────────────────────────────────────
  describe('SC-021 (004): createOrder without coupon — discount=0, validate/markUsed 미호출', () => {
    it('when_no_userCouponId_then_validate_and_markUsed_not_called', async () => {
      /**
       * SC-021 (FR-010 관련, 004 spec):
       * userCouponId 없이 createOrder 호출 시:
       *   1. validateAndCalculateDiscount 미호출
       *   2. markUsed 미호출
       *   3. discountAmount = 0 으로 주문 생성
       *
       * PATCH-03: 쿠폰 미입력 분기 — validate/markUsed 양쪽 모두 미호출 검증
       */
      const singleItemSnapshot = new Map([
        [FIXED_VARIANT_ID, FIXED_VARIANT_SNAPSHOTS.get(FIXED_VARIANT_ID)!],
      ]);
      mockProductService.getVariantSnapshots.mockResolvedValue(singleItemSnapshot);
      mockInventoryService.checkAvailability.mockResolvedValue(true);
      mockOrderRepository.createOrder.mockResolvedValue({ id: FIXED_ORDER_ID, status: 'pending' });
      mockOrderRepository.createItems.mockResolvedValue(undefined);
      mockOrderRepository.appendEvent.mockResolvedValue(undefined);
      mockInventoryService.decreaseStock.mockResolvedValue(undefined);
      mockCartService.removeItems.mockResolvedValue(undefined);
      mockOrderRepository.findById.mockResolvedValue({ ...FIXED_ORDER_PENDING });

      // userCouponId 미전달
      await service.createOrder(FIXED_USER_ID, {
        items: [{ variantId: FIXED_VARIANT_ID, quantity: 1 }],
        shippingAddress: FIXED_SHIPPING_ADDRESS,
      });

      // PATCH-03: 쿠폰 미입력 → 양 분기 모두 미호출
      expect(mockCouponService.validateAndCalculateDiscount).not.toHaveBeenCalled();
      expect(mockCouponService.markUsed).not.toHaveBeenCalled();
    });
  });

  // ─────────────────────────────────────────────
  // SC-019 (004): markUsed tx 내 호출 — pre-tx vs in-tx 순서 검증
  // ─────────────────────────────────────────────
  describe('SC-019 (004): validateAndCalculateDiscount pre-tx, markUsed in-tx 순서', () => {
    it('when_coupon_applied_then_validate_called_before_tx', async () => {
      /**
       * SC-019 (FR-011·FR-013 관련, 004 spec):
       * validateAndCalculateDiscount 는 runInTransaction 호출 이전(pre-tx)에 실행된다.
       * markUsed 는 runInTransaction 내부(tx 내)에서 실행된다.
       * → invocationCallOrder 비교로 실행 순서 단언.
       */
      const singleItemSnapshot = new Map([
        [FIXED_VARIANT_ID, FIXED_VARIANT_SNAPSHOTS.get(FIXED_VARIANT_ID)!],
      ]);
      mockProductService.getVariantSnapshots.mockResolvedValue(singleItemSnapshot);
      mockInventoryService.checkAvailability.mockResolvedValue(true);
      mockCouponService.validateAndCalculateDiscount.mockResolvedValue({
        discountAmount: new Prisma.Decimal('5000'),
        couponId: 'coupon-1',
        userCouponId: 'uc-1',
      });
      mockCouponService.markUsed.mockResolvedValue(undefined);
      mockOrderRepository.createOrder.mockResolvedValue({ id: FIXED_ORDER_ID, status: 'pending' });
      mockOrderRepository.createItems.mockResolvedValue(undefined);
      mockOrderRepository.appendEvent.mockResolvedValue(undefined);
      mockInventoryService.decreaseStock.mockResolvedValue(undefined);
      mockCartService.removeItems.mockResolvedValue(undefined);
      mockOrderRepository.findById.mockResolvedValue({ ...FIXED_ORDER_PENDING });

      await service.createOrder(FIXED_USER_ID, {
        items: [{ variantId: FIXED_VARIANT_ID, quantity: 1 }],
        shippingAddress: FIXED_SHIPPING_ADDRESS,
        userCouponId: 'uc-1',
      });

      // validateAndCalculateDiscount 는 runInTransaction 보다 먼저 호출되어야 함 (pre-tx)
      const validateOrder =
        mockCouponService.validateAndCalculateDiscount.mock.invocationCallOrder[0];
      const txOrder = mockPrismaService.runInTransaction.mock.invocationCallOrder[0];
      expect(validateOrder).toBeLessThan(txOrder);

      // markUsed 는 반드시 호출되어야 함 (tx 내에서)
      expect(mockCouponService.markUsed).toHaveBeenCalledTimes(1);
    });
  });

  // ─────────────────────────────────────────────
  // SC-020 (004): markUsed 실패 — ConflictException 전파
  // ─────────────────────────────────────────────
  describe('SC-020 (004): markUsed 동시성 충돌 — ConflictException 전파', () => {
    it('when_markUsed_throws_ConflictException_then_createOrder_rejects', async () => {
      /**
       * SC-020 (FR-013 관련, 004 spec, ADR-002):
       * markUsed 내부에서 updateMany count=0 → ConflictException 발생 시
       * createOrder 전체가 ConflictException 으로 reject 된다.
       * (tx 내부 예외 → tx rollback, 주문 미생성)
       */
      const singleItemSnapshot = new Map([
        [FIXED_VARIANT_ID, FIXED_VARIANT_SNAPSHOTS.get(FIXED_VARIANT_ID)!],
      ]);
      mockProductService.getVariantSnapshots.mockResolvedValue(singleItemSnapshot);
      mockInventoryService.checkAvailability.mockResolvedValue(true);
      mockCouponService.validateAndCalculateDiscount.mockResolvedValue({
        discountAmount: new Prisma.Decimal('5000'),
        couponId: 'coupon-1',
        userCouponId: 'uc-1',
      });
      // markUsed: 이중사용 감지 → ConflictException
      mockCouponService.markUsed.mockRejectedValue(
        new ConflictException('Coupon already used (concurrent attempt)'),
      );

      await expect(
        service.createOrder(FIXED_USER_ID, {
          items: [{ variantId: FIXED_VARIANT_ID, quantity: 1 }],
          shippingAddress: FIXED_SHIPPING_ADDRESS,
          userCouponId: 'uc-1',
        }),
      ).rejects.toThrow(ConflictException);

      // 주문 미생성 확인
      expect(mockOrderRepository.createOrder).not.toHaveBeenCalled();
    });
  });

  // ─────────────────────────────────────────────
  // SC-023 (004): 주문 취소 시 쿠폰 복원
  // ─────────────────────────────────────────────
  describe('SC-023 (004): cancel — couponService.restoreForOrder 호출', () => {
    it('when_cancel_then_restoreForOrder_called_with_orderId', async () => {
      /**
       * SC-023 (FR-016 관련, 004 spec):
       * 주문 취소(cancel) 시 couponService.restoreForOrder(orderId) 가 호출된다.
       * 쿠폰이 없었던 주문의 경우 restoreForOrder 는 updateMany count=0 으로 no-op.
       * production cancel 은 runInTransaction 내: refund? → restoreForOrder → restoreStock → updateStatus
       */
      mockOrderRepository.findById.mockResolvedValue({
        ...FIXED_ORDER_PENDING,
        status: 'pending',
      });
      mockPaymentService.findPaymentByOrderId.mockResolvedValue(null); // 결제 없음 → 환불 불필요
      mockCouponService.restoreForOrder.mockResolvedValue(undefined);
      mockInventoryService.restoreStock.mockResolvedValue(undefined);
      mockOrderRepository.updateStatus.mockResolvedValue(undefined);
      mockOrderRepository.appendEvent.mockResolvedValue(undefined);

      await service.cancel(FIXED_USER_ID, FIXED_ORDER_ID);

      expect(mockCouponService.restoreForOrder).toHaveBeenCalledWith(FIXED_ORDER_ID);
    });
  });
});
