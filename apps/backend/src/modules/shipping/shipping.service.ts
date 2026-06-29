import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Shipment, ShipmentStatus, ShipmentTracking } from '@prisma/client';
import { PrismaService } from '../../shared/prisma/prisma.service';
import { OrderService } from '../order/order.service';
import { SellerService } from '../seller/seller.service';
import { ShippingRepository } from './shipping.repository';
import { SHIPPING_EVENTS } from './shipping.events';

@Injectable()
export class ShippingService {
  constructor(
    private readonly shippingRepository: ShippingRepository,
    private readonly prisma: PrismaService,
    private readonly orderService: OrderService,
    private readonly sellerService: SellerService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  // ── 송장 등록 ─────────────────────────────────────────────────────

  /**
   * APPROVED 판매자가 본인 주문항목의 송장을 등록한다.
   * order 상태 preparing → shipped 전이(OrderService DI)와 shipment·tracking 생성을
   * 단일 트랜잭션으로 처리 (ALS tx 전파로 원자성 보장, P-005 정합성).
   * 소유권·상태 검증은 OrderService.markShipped 가 담당 (preparing 아니면 400, 비소유 403).
   */
  async createShipment(
    userId: string,
    dto: { orderId: string; carrier: string; trackingNumber: string },
  ): Promise<Shipment> {
    const seller = await this.sellerService.getApprovedSeller(userId);
    const now = new Date();

    const shipment = await this.prisma.runInTransaction(async () => {
      // 주문 상태 전이 + 판매자 소유권/상태 검증 (preparing → shipped)
      await this.orderService.markShipped(dto.orderId, seller.id);

      const created = await this.shippingRepository.createShipment({
        orderId: dto.orderId,
        carrier: dto.carrier,
        trackingNumber: dto.trackingNumber,
        status: ShipmentStatus.shipped,
        shippedAt: now,
      });

      await this.shippingRepository.appendTracking({
        shipmentId: created.id,
        status: ShipmentStatus.shipped,
        description: `Shipment registered (${dto.carrier} ${dto.trackingNumber})`,
        occurredAt: now,
      });

      return created;
    });

    await this.prisma.onAfterCommit(() => {
      this.eventEmitter.emit(SHIPPING_EVENTS.SHIPPED, {
        shipmentId: shipment.id,
        orderId: shipment.orderId,
        sellerId: seller.id,
      });
    });

    return shipment;
  }

  // ── 배송 상태 업데이트 ────────────────────────────────────────────

  /**
   * 판매자가 배송 상태를 업데이트한다. delivered 전이 시 order 상태도 delivered 로 전이.
   * 권한: 해당 주문항목 판매자만. shipment·tracking·order 전이를 단일 트랜잭션으로 처리.
   */
  async updateStatus(
    userId: string,
    shipmentId: string,
    newStatus: ShipmentStatus,
    description?: string,
  ): Promise<Shipment> {
    const seller = await this.sellerService.getApprovedSeller(userId);

    const shipment = await this.shippingRepository.findById(shipmentId);
    if (!shipment) throw new NotFoundException('Shipment not found');

    // 판매자 소유권 검증 (해당 주문의 판매자여야 함)
    const ownership = await this.orderService.getOrderOwnership(shipment.orderId);
    if (!ownership.sellerIds.includes(seller.id)) {
      throw new ForbiddenException('Not your shipment');
    }

    const now = new Date();

    const updated = await this.prisma.runInTransaction(async () => {
      const result = await this.shippingRepository.updateShipment(shipmentId, {
        status: newStatus,
        ...(newStatus === ShipmentStatus.delivered ? { deliveredAt: now } : {}),
      });

      await this.shippingRepository.appendTracking({
        shipmentId,
        status: newStatus,
        description: description ?? `Status updated to ${newStatus}`,
        occurredAt: now,
      });

      // delivered 전이 시 주문도 delivered 로 (shipped → delivered, deliveredAt 기록)
      if (newStatus === ShipmentStatus.delivered) {
        await this.orderService.markDelivered(shipment.orderId, seller.id);
      }

      return result;
    });

    if (newStatus === ShipmentStatus.delivered) {
      await this.prisma.onAfterCommit(() => {
        this.eventEmitter.emit(SHIPPING_EVENTS.DELIVERED, {
          shipmentId,
          orderId: shipment.orderId,
          sellerId: seller.id,
        });
      });
    }

    return updated;
  }

  // ── 배송 추적 조회 ────────────────────────────────────────────────

  /**
   * 배송 추적 이력 조회. 권한 3축: 주문 구매자 본인 또는 해당 주문 판매자.
   * P-001: 주문 소유 정보는 OrderService.getOrderOwnership DI 경유로 획득.
   */
  async getTracking(
    userId: string,
    shipmentId: string,
  ): Promise<ShipmentTracking[]> {
    const shipment = await this.shippingRepository.findById(shipmentId);
    if (!shipment) throw new NotFoundException('Shipment not found');

    await this._assertCanViewOrder(userId, shipment.orderId);
    return this.shippingRepository.findTracking(shipmentId);
  }

  /**
   * 주문 기준 송장 조회 — 권한 3축(구매자 본인 또는 판매자). 송장 미존재 시 null.
   * ship 화면 재진입 시 기존 송장 상태 복구용 (GET /shipments?orderId=).
   */
  async getByOrder(userId: string, orderId: string): Promise<Shipment | null> {
    await this._assertCanViewOrder(userId, orderId);
    return this.shippingRepository.findByOrderId(orderId);
  }

  /** 권한 3축 검증 — 구매자 본인 또는 해당 주문 판매자. 미허가 시 403. */
  private async _assertCanViewOrder(userId: string, orderId: string): Promise<void> {
    const ownership = await this.orderService.getOrderOwnership(orderId);
    let authorized = ownership.userId === userId; // 구매자 본인
    if (!authorized) {
      // 판매자 축 — 미승인/미등록 판매자는 getApprovedSeller 가 throw 하므로 무시
      const sellerId = await this._resolveSellerId(userId);
      authorized = sellerId !== null && ownership.sellerIds.includes(sellerId);
    }
    if (!authorized) {
      throw new ForbiddenException('Not allowed to view this shipment');
    }
  }

  /** APPROVED 판매자면 sellerId, 아니면 null (권한 판정 보조). */
  private async _resolveSellerId(userId: string): Promise<string | null> {
    try {
      const seller = await this.sellerService.getApprovedSeller(userId);
      return seller.id;
    } catch {
      return null;
    }
  }
}
