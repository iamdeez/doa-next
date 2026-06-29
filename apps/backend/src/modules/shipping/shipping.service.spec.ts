/**
 * ShippingService 단위 테스트 — 005-shipping [env:unit]
 *
 * 시나리오:
 *   - 송장 등록 Happy: APPROVED 판매자 → markShipped(preparing→shipped) + shipment/tracking 생성
 *   - 송장 등록 권한: 미승인 판매자 → 403, 주문 비소유/상태불일치 → OrderService 예외 전파
 *   - 배송 상태 업데이트: delivered → order markDelivered 호출, in_transit → 호출 안 함
 *   - 상태 업데이트 권한: 비소유 판매자 → 403, shipment 없음 → 404
 *   - 추적 조회 권한 3축: 구매자 본인 / 판매자 / 권한 없음(403)
 */

import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { ShipmentStatus } from '@prisma/client';
import { ShippingService } from './shipping.service';
import { ShippingRepository } from './shipping.repository';
import { PrismaService } from '../../shared/prisma/prisma.service';
import { OrderService } from '../order/order.service';
import { SellerService } from '../seller/seller.service';

// ── Mocks ────────────────────────────────────────────────────────────────────

const mockShippingRepository = {
  createShipment: jest.fn(),
  findById: jest.fn(),
  findByOrderId: jest.fn(),
  updateShipment: jest.fn(),
  appendTracking: jest.fn(),
  findTracking: jest.fn(),
};

const mockOrderService = {
  markShipped: jest.fn(),
  markDelivered: jest.fn(),
  getOrderOwnership: jest.fn(),
};

const mockSellerService = {
  getApprovedSeller: jest.fn(),
};

const mockPrismaService = {
  runInTransaction: jest.fn().mockImplementation((fn: () => unknown) => fn()),
  onAfterCommit: jest
    .fn()
    .mockImplementation((cb: () => unknown) => Promise.resolve(cb())),
  get tx() {
    return this;
  },
};

const mockEventEmitter = {
  emit: jest.fn(),
};

const SHIPMENT = {
  id: 'ship-1',
  orderId: 'order-1',
  status: ShipmentStatus.shipped,
  carrier: 'CJ',
  trackingNumber: '123456',
  shippedAt: new Date(),
  deliveredAt: null,
  createdAt: new Date(),
};

describe('ShippingService', () => {
  let service: ShippingService;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ShippingService,
        { provide: ShippingRepository, useValue: mockShippingRepository },
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: OrderService, useValue: mockOrderService },
        { provide: SellerService, useValue: mockSellerService },
        { provide: EventEmitter2, useValue: mockEventEmitter },
      ],
    }).compile();

    service = module.get<ShippingService>(ShippingService);
  });

  // ── 송장 등록 ───────────────────────────────────────────────────────────

  describe('createShipment', () => {
    it('when_approved_seller_registers_shipment_then_order_marked_shipped_and_shipment_created', async () => {
      mockSellerService.getApprovedSeller.mockResolvedValue({
        id: 'seller-1',
        userId: 'seller-user-1',
      });
      mockOrderService.markShipped.mockResolvedValue(undefined);
      mockShippingRepository.createShipment.mockResolvedValue(SHIPMENT);
      mockShippingRepository.appendTracking.mockResolvedValue({});

      const result = await service.createShipment('seller-user-1', {
        orderId: 'order-1',
        carrier: 'CJ',
        trackingNumber: '123456',
      });

      // order 전이는 OrderService DI 경유 (P-001) — seller.id 로 호출
      expect(mockOrderService.markShipped).toHaveBeenCalledWith('order-1', 'seller-1');
      // shipment 는 shipped 상태 + shippedAt 으로 생성
      expect(mockShippingRepository.createShipment).toHaveBeenCalledWith(
        expect.objectContaining({
          orderId: 'order-1',
          carrier: 'CJ',
          trackingNumber: '123456',
          status: ShipmentStatus.shipped,
        }),
      );
      expect(mockShippingRepository.appendTracking).toHaveBeenCalledWith(
        expect.objectContaining({
          shipmentId: 'ship-1',
          status: ShipmentStatus.shipped,
        }),
      );
      expect(mockEventEmitter.emit).toHaveBeenCalledWith(
        'shipping.shipped',
        expect.objectContaining({ shipmentId: 'ship-1', orderId: 'order-1' }),
      );
      expect(result).toEqual(SHIPMENT);
    });

    it('when_non_approved_seller_then_ForbiddenException', async () => {
      mockSellerService.getApprovedSeller.mockRejectedValue(
        new ForbiddenException('Seller is not approved'),
      );

      await expect(
        service.createShipment('user-1', {
          orderId: 'order-1',
          carrier: 'CJ',
          trackingNumber: '123456',
        }),
      ).rejects.toThrow(ForbiddenException);
      expect(mockShippingRepository.createShipment).not.toHaveBeenCalled();
    });

    it('when_order_not_in_preparing_then_OrderService_error_propagates_and_no_shipment', async () => {
      mockSellerService.getApprovedSeller.mockResolvedValue({
        id: 'seller-1',
        userId: 'seller-user-1',
      });
      mockOrderService.markShipped.mockRejectedValue(
        new BadRequestException('Cannot ship order with status: pending'),
      );

      await expect(
        service.createShipment('seller-user-1', {
          orderId: 'order-1',
          carrier: 'CJ',
          trackingNumber: '123456',
        }),
      ).rejects.toThrow(BadRequestException);
      expect(mockShippingRepository.createShipment).not.toHaveBeenCalled();
    });
  });

  // ── 배송 상태 업데이트 ──────────────────────────────────────────────────

  describe('updateStatus', () => {
    it('when_status_delivered_then_order_marked_delivered', async () => {
      mockSellerService.getApprovedSeller.mockResolvedValue({
        id: 'seller-1',
        userId: 'seller-user-1',
      });
      mockShippingRepository.findById.mockResolvedValue(SHIPMENT);
      mockOrderService.getOrderOwnership.mockResolvedValue({
        userId: 'customer-1',
        sellerIds: ['seller-1'],
      });
      mockShippingRepository.updateShipment.mockResolvedValue({
        ...SHIPMENT,
        status: ShipmentStatus.delivered,
      });
      mockShippingRepository.appendTracking.mockResolvedValue({});
      mockOrderService.markDelivered.mockResolvedValue(undefined);

      await service.updateStatus('seller-user-1', 'ship-1', ShipmentStatus.delivered);

      expect(mockShippingRepository.updateShipment).toHaveBeenCalledWith(
        'ship-1',
        expect.objectContaining({ status: ShipmentStatus.delivered }),
      );
      expect(mockOrderService.markDelivered).toHaveBeenCalledWith('order-1', 'seller-1');
      expect(mockEventEmitter.emit).toHaveBeenCalledWith(
        'shipping.delivered',
        expect.objectContaining({ orderId: 'order-1' }),
      );
    });

    it('when_status_in_transit_then_order_not_marked_delivered', async () => {
      mockSellerService.getApprovedSeller.mockResolvedValue({
        id: 'seller-1',
        userId: 'seller-user-1',
      });
      mockShippingRepository.findById.mockResolvedValue(SHIPMENT);
      mockOrderService.getOrderOwnership.mockResolvedValue({
        userId: 'customer-1',
        sellerIds: ['seller-1'],
      });
      mockShippingRepository.updateShipment.mockResolvedValue({
        ...SHIPMENT,
        status: ShipmentStatus.in_transit,
      });
      mockShippingRepository.appendTracking.mockResolvedValue({});

      await service.updateStatus('seller-user-1', 'ship-1', ShipmentStatus.in_transit);

      expect(mockOrderService.markDelivered).not.toHaveBeenCalled();
    });

    it('when_seller_not_owner_then_ForbiddenException', async () => {
      mockSellerService.getApprovedSeller.mockResolvedValue({
        id: 'seller-2',
        userId: 'seller-user-2',
      });
      mockShippingRepository.findById.mockResolvedValue(SHIPMENT);
      mockOrderService.getOrderOwnership.mockResolvedValue({
        userId: 'customer-1',
        sellerIds: ['seller-1'],
      });

      await expect(
        service.updateStatus('seller-user-2', 'ship-1', ShipmentStatus.delivered),
      ).rejects.toThrow(ForbiddenException);
      expect(mockShippingRepository.updateShipment).not.toHaveBeenCalled();
    });

    it('when_shipment_not_found_then_NotFoundException', async () => {
      mockSellerService.getApprovedSeller.mockResolvedValue({
        id: 'seller-1',
        userId: 'seller-user-1',
      });
      mockShippingRepository.findById.mockResolvedValue(null);

      await expect(
        service.updateStatus('seller-user-1', 'ship-x', ShipmentStatus.delivered),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // ── 배송 추적 조회 (권한 3축) ───────────────────────────────────────────

  describe('getTracking', () => {
    const TRACKING = [
      { id: 't1', shipmentId: 'ship-1', status: ShipmentStatus.shipped, description: 'x', occurredAt: new Date() },
    ];

    it('when_customer_owner_then_returns_tracking', async () => {
      mockShippingRepository.findById.mockResolvedValue(SHIPMENT);
      mockOrderService.getOrderOwnership.mockResolvedValue({
        userId: 'customer-1',
        sellerIds: ['seller-1'],
      });
      mockShippingRepository.findTracking.mockResolvedValue(TRACKING);

      const result = await service.getTracking('customer-1', 'ship-1');

      expect(result).toEqual(TRACKING);
      // 구매자 본인이면 판매자 조회 불필요
      expect(mockSellerService.getApprovedSeller).not.toHaveBeenCalled();
    });

    it('when_seller_of_order_then_returns_tracking', async () => {
      mockShippingRepository.findById.mockResolvedValue(SHIPMENT);
      mockOrderService.getOrderOwnership.mockResolvedValue({
        userId: 'customer-1',
        sellerIds: ['seller-1'],
      });
      mockSellerService.getApprovedSeller.mockResolvedValue({
        id: 'seller-1',
        userId: 'seller-user-1',
      });
      mockShippingRepository.findTracking.mockResolvedValue(TRACKING);

      const result = await service.getTracking('seller-user-1', 'ship-1');

      expect(result).toEqual(TRACKING);
    });

    it('when_neither_customer_nor_seller_then_ForbiddenException', async () => {
      mockShippingRepository.findById.mockResolvedValue(SHIPMENT);
      mockOrderService.getOrderOwnership.mockResolvedValue({
        userId: 'customer-1',
        sellerIds: ['seller-1'],
      });
      // 미승인/타 판매자 → getApprovedSeller throw
      mockSellerService.getApprovedSeller.mockRejectedValue(
        new ForbiddenException('Seller is not approved'),
      );

      await expect(
        service.getTracking('stranger-1', 'ship-1'),
      ).rejects.toThrow(ForbiddenException);
      expect(mockShippingRepository.findTracking).not.toHaveBeenCalled();
    });

    it('when_shipment_not_found_then_NotFoundException', async () => {
      mockShippingRepository.findById.mockResolvedValue(null);

      await expect(
        service.getTracking('customer-1', 'ship-x'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('getByOrder (주문 기준 송장 조회 — 갭 보강)', () => {
    it('when_seller_then_returns_shipment_or_null', async () => {
      mockOrderService.getOrderOwnership.mockResolvedValue({
        userId: 'customer-1',
        sellerIds: ['seller-1'],
      });
      mockSellerService.getApprovedSeller.mockResolvedValue({
        id: 'seller-1',
        userId: 'seller-user-1',
      });
      mockShippingRepository.findByOrderId.mockResolvedValue(SHIPMENT);

      const result = await service.getByOrder('seller-user-1', 'order-1');

      expect(mockShippingRepository.findByOrderId).toHaveBeenCalledWith('order-1');
      expect(result).toBe(SHIPMENT);
    });

    it('when_buyer_and_no_shipment_then_null', async () => {
      mockOrderService.getOrderOwnership.mockResolvedValue({
        userId: 'customer-1',
        sellerIds: ['seller-1'],
      });
      mockShippingRepository.findByOrderId.mockResolvedValue(null);

      const result = await service.getByOrder('customer-1', 'order-1');
      expect(result).toBeNull();
    });

    it('when_stranger_then_ForbiddenException', async () => {
      mockOrderService.getOrderOwnership.mockResolvedValue({
        userId: 'customer-1',
        sellerIds: ['seller-1'],
      });
      mockSellerService.getApprovedSeller.mockRejectedValue(
        new ForbiddenException('Seller is not approved'),
      );

      await expect(service.getByOrder('stranger-1', 'order-1')).rejects.toThrow(
        ForbiddenException,
      );
      expect(mockShippingRepository.findByOrderId).not.toHaveBeenCalled();
    });
  });
});
