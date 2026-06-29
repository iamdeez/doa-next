import { Injectable } from '@nestjs/common';
import { ActorType, Order, OrderEvent, OrderItem, OrderStatus, Prisma } from '@prisma/client';
// OrderItemWithOrder: review 모듈이 getOrderItemForReview DI 경유로 소비 (P-001 경계 준수)
export type OrderItemWithOrder = OrderItem & { order: Order };
import { PrismaService } from '../../shared/prisma/prisma.service';

// P-001: orders 스키마(orders.orders, orders.order_items, orders.order_events)에만 접근.
// variantId·productId·sellerId·orderId(payments) 는 cross-schema plain String — FK 미선언.

export type PaymentSummary = { id: string; status: string };
export type OrderWithItems = Order & { items: OrderItem[] };
export type OrderWithDetails = Order & {
  items: OrderItem[];
  events: OrderEvent[];
  /** 결제 내역 — cross-schema plain String 기반으로 서비스 레이어에서 보강. findById 기본값 [] */
  payments: PaymentSummary[];
};

@Injectable()
export class OrderRepository {
  constructor(private readonly prisma: PrismaService) {}

  async createOrder(data: {
    id: string;
    userId: string;
    totalAmount: Prisma.Decimal;
    discountAmount: Prisma.Decimal;
    shippingAddressSnapshot: object;
  }): Promise<Order> {
    return this.prisma.tx.order.create({
      data: {
        id: data.id,
        userId: data.userId,
        totalAmount: data.totalAmount,
        discountAmount: data.discountAmount,
        shippingAddressSnapshot: data.shippingAddressSnapshot,
        status: OrderStatus.pending,
      },
    });
  }

  async createItems(
    items: Array<{
      orderId: string;
      variantId: string;
      productId: string;
      sellerId: string;
      quantity: number;
      unitPrice: Prisma.Decimal;
      optionName: string;
      optionValue: string;
      productTitle: string;
      sku: string;
    }>,
  ): Promise<void> {
    await this.prisma.tx.orderItem.createMany({ data: items });
  }

  async appendEvent(data: {
    orderId: string;
    fromStatus: string | null;
    toStatus: string;
    actorType: ActorType;
    actorId?: string;
  }): Promise<OrderEvent> {
    return this.prisma.tx.orderEvent.create({ data });
  }

  async findById(id: string): Promise<OrderWithDetails | null> {
    const order = await this.prisma.tx.order.findUnique({
      where: { id },
      include: { items: true, events: { orderBy: { createdAt: 'desc' } } },
    });
    if (!order) return null;
    // payments 는 cross-schema — plain String FK 로 별도 조회 없이 빈 배열 기본값.
    // 실결제 연동은 PaymentService.findByOrderId 경유 또는 SC-024 테스트 목업 참조.
    return { ...order, payments: [] };
  }

  /** 구매자 주문 목록 — cursor 기반 페이지네이션. nextCursor 포함하여 반환. */
  async listByUser(
    userId: string,
    cursor: string | undefined,
    take: number,
  ): Promise<{ items: Order[]; nextCursor: string | null }> {
    const items = await this.prisma.tx.order.findMany({
      where: { userId },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      cursor: cursor ? { id: cursor } : undefined,
      skip: cursor ? 1 : 0,
      take,
    });
    const nextCursor = items.length === take ? items[items.length - 1].id : null;
    return { items, nextCursor };
  }

  /** 판매자 주문 목록 — sellerId 기준 items 에서 orderId 조회 후 orders 반환 */
  async listBySeller(sellerId: string): Promise<Order[]> {
    const orderIds = await this.prisma.tx.orderItem.findMany({
      where: { sellerId },
      select: { orderId: true },
      distinct: ['orderId'],
    });
    const ids = orderIds.map((r) => r.orderId);

    return this.prisma.tx.order.findMany({
      where: { id: { in: ids } },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    });
  }

  async updateStatus(
    orderId: string,
    status: OrderStatus,
    extra?: { deliveredAt?: Date; completedAt?: Date },
  ): Promise<Order> {
    return this.prisma.tx.order.update({
      where: { id: orderId },
      data: { status, ...extra },
    });
  }

  /** 자동확정 대상 조회: delivered 상태 + deliveredAt < cutoff */
  async findDeliveredBefore(cutoff: Date): Promise<Order[]> {
    return this.prisma.tx.order.findMany({
      where: {
        status: OrderStatus.delivered,
        deliveredAt: { lt: cutoff },
      },
    });
  }

  /**
   * orderItem + 상위 order 조회 — review 생성 시 completed 상태 검증 용도 (FR-021).
   * P-001: orders 스키마 내 join — cross-schema 참조 없음.
   */
  async findOrderItemWithOrder(orderItemId: string): Promise<OrderItemWithOrder | null> {
    return this.prisma.tx.orderItem.findUnique({
      where: { id: orderItemId },
      include: { order: true },
    });
  }

  /**
   * 정산 집계용 — 특정 판매자의 completed 주문항목을 기간 내(주문 생성일 기준) 조회.
   * P-001: orders 스키마 내 join (order + order_items). settlement 모듈이 OrderService DI 경유로 소비.
   */
  async findCompletedItemsBySellerInPeriod(
    sellerId: string,
    periodStart: Date,
    periodEnd: Date,
  ): Promise<Array<{ orderId: string; orderItemId: string; unitPrice: Prisma.Decimal; quantity: number }>> {
    const orders = await this.prisma.tx.order.findMany({
      where: {
        status: OrderStatus.completed,
        // 정산 기준 시각 = 구매 확정(completed) 일시 (012 GAP-005-02)
        completedAt: { gte: periodStart, lte: periodEnd },
        items: { some: { sellerId } },
      },
      include: { items: { where: { sellerId } } },
    });

    return orders.flatMap((order) =>
      order.items.map((item) => ({
        orderId: order.id,
        orderItemId: item.id,
        unitPrice: item.unitPrice,
        quantity: item.quantity,
      })),
    );
  }

  // ── 통계 집계 (007-stats, additive) ─────────────────────────────────
  // P-001: orders 스키마 내 집계만 수행. StatsService 가 OrderService DI 경유로 소비.
  // 접근자: this.prisma.order (루트 클라이언트 직접). 통계 집계는 트랜잭션 외부 조회이며,
  // tx 게터는 트랜잭션 외부에서 모델 델리게이트가 해소되지 않으므로 직접 접근으로 정확히 조회한다.

  /** 전체 주문 수 — 플랫폼 통계용. */
  async countAll(): Promise<number> {
    return this.prisma.order.count();
  }

  /** completed 상태 주문 수 — 플랫폼 통계용. */
  async countCompleted(): Promise<number> {
    return this.prisma.order.count({
      where: { status: OrderStatus.completed },
    });
  }

  /**
   * completed 주문의 totalAmount 합계 — 플랫폼 총 매출 (P-005: Decimal).
   * 주문이 없으면 0 반환.
   */
  async sumCompletedTotalAmount(): Promise<Prisma.Decimal> {
    const agg = await this.prisma.order.aggregate({
      where: { status: OrderStatus.completed },
      _sum: { totalAmount: true },
    });
    return agg._sum.totalAmount ?? new Prisma.Decimal(0);
  }

  /**
   * 판매자별 completed 매출 요약 — saleAmount = Σ(unitPrice × quantity), 주문 건수.
   * orders 스키마 내 order + order_items join (P-001). saleAmount 는 Decimal 정확 계산.
   */
  async getSellerCompletedSummary(
    sellerId: string,
  ): Promise<{ salesTotal: Prisma.Decimal; orderCount: number }> {
    const orders = await this.prisma.order.findMany({
      where: {
        status: OrderStatus.completed,
        items: { some: { sellerId } },
      },
      include: { items: { where: { sellerId } } },
    });

    const salesTotal = orders.reduce((acc, order) => {
      const orderSum = order.items.reduce(
        (s, item) => s.add(new Prisma.Decimal(item.unitPrice).mul(item.quantity)),
        new Prisma.Decimal(0),
      );
      return acc.add(orderSum);
    }, new Prisma.Decimal(0));

    return { salesTotal, orderCount: orders.length };
  }
}
