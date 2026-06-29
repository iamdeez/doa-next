import { Injectable } from '@nestjs/common';
import { Shipment, ShipmentStatus, ShipmentTracking } from '@prisma/client';
import { PrismaService } from '../../shared/prisma/prisma.service';

// P-001: shipping 모듈은 자신의 소유 테이블(orders.shipments, orders.shipment_tracking)에만 접근.
// order/order_items/order_events 등 order 모듈 소유 테이블은 OrderService DI 경유로만 접근.
// orderId 는 cross-module plain String (P-001 경계).

@Injectable()
export class ShippingRepository {
  constructor(private readonly prisma: PrismaService) {}

  // ── Shipment ──────────────────────────────────────────────────────

  async createShipment(data: {
    orderId: string;
    carrier: string;
    trackingNumber: string;
    status: ShipmentStatus;
    shippedAt?: Date | null;
  }): Promise<Shipment> {
    return this.prisma.tx.shipment.create({ data });
  }

  async findById(id: string): Promise<Shipment | null> {
    return this.prisma.tx.shipment.findUnique({ where: { id } });
  }

  /** 주문 기준 최신 송장 1건 (현재 주문당 1건). 미존재 시 null. */
  async findByOrderId(orderId: string): Promise<Shipment | null> {
    return this.prisma.tx.shipment.findFirst({
      where: { orderId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async updateShipment(
    id: string,
    data: {
      status?: ShipmentStatus;
      shippedAt?: Date | null;
      deliveredAt?: Date | null;
    },
  ): Promise<Shipment> {
    return this.prisma.tx.shipment.update({ where: { id }, data });
  }

  // ── ShipmentTracking (append-only) ────────────────────────────────

  async appendTracking(data: {
    shipmentId: string;
    status: ShipmentStatus;
    description: string;
    occurredAt?: Date;
  }): Promise<ShipmentTracking> {
    return this.prisma.tx.shipmentTracking.create({ data });
  }

  async findTracking(shipmentId: string): Promise<ShipmentTracking[]> {
    return this.prisma.tx.shipmentTracking.findMany({
      where: { shipmentId },
      orderBy: { occurredAt: 'desc' },
    });
  }
}
