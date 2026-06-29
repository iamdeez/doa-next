import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  forwardRef,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { randomUUID } from 'node:crypto';
import { ActorType, Order, OrderStatus, PaymentStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../../shared/prisma/prisma.service';
import { ORDER_EVENTS } from './order.events';
import { CartService } from '../cart/cart.service';
import { InventoryService } from '../inventory/inventory.service';
import { ProductService } from '../product/product.service';
import { SellerService } from '../seller/seller.service';
import { PaymentService } from '../payment/payment.service';
import { CouponService } from '../coupon/coupon.service';
import { AUTO_CONFIRM_DAYS, DEFAULT_PAGE_LIMIT, MAX_PAGE_LIMIT } from './order.constants';
import { OrderRepository, OrderWithDetails, OrderItemWithOrder } from './order.repository';

@Injectable()
export class OrderService {
  constructor(
    private readonly orderRepository: OrderRepository,
    private readonly prisma: PrismaService,
    private readonly productService: ProductService,
    private readonly inventoryService: InventoryService,
    private readonly cartService: CartService,
    private readonly sellerService: SellerService,
    @Inject(forwardRef(() => PaymentService))
    private readonly paymentService: PaymentService,
    private readonly couponService: CouponService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  // ── 주문 생성 (T031) ───────────────────────────────────────────────

  /**
   * 주문 생성 — 단일 트랜잭션 원자성:
   * decreaseStock × N + order + order_items + order_events + cart.removeItems (ADR-009)
   */
  async createOrder(
    userId: string,
    dto: {
      items: Array<{ variantId: string; quantity: number }>;
      shippingAddress: object;
      userCouponId?: string;
    },
  ): Promise<OrderWithDetails> {
    const { items, shippingAddress, userCouponId } = dto;

    // 가용 재고 사전 확인 (트랜잭션 외부 — non-atomic, fast-path check)
    for (const item of items) {
      const available = await this.inventoryService.checkAvailability(
        item.variantId,
        item.quantity,
      );
      if (!available) {
        throw new ConflictException(
          `Insufficient stock for variant: ${item.variantId}`,
        );
      }
    }

    // 스냅샷 일괄 조회 — Map<variantId, VariantSnapshot>
    const snapshotMap = await this.productService.getVariantSnapshots(
      items.map((i) => i.variantId),
    );

    // orderId 사전 생성 (ADR-009: decreaseStock 로그에 같은 orderId 사용)
    const orderId = randomUUID();

    const totalAmount = items.reduce((acc, item) => {
      const snap = snapshotMap.get(item.variantId)!;
      return acc.add(snap.unitPrice.mul(item.quantity));
    }, new Prisma.Decimal(0));

    // 쿠폰 검증·할인 계산 (트랜잭션 외부 pre-tx — 상태 변경 없음, FR-011·FR-012)
    let discountAmount = new Prisma.Decimal(0);
    let couponMeta: { userCouponId: string; couponId: string } | null = null;
    if (userCouponId) {
      const result = await this.couponService.validateAndCalculateDiscount(
        userCouponId,
        userId,
        totalAmount,
      );
      discountAmount = result.discountAmount;
      couponMeta = { userCouponId: result.userCouponId, couponId: result.couponId };
    }

    await this.prisma.runInTransaction(async () => {
      // 1. 쿠폰 이중사용 방지 조건부 UPDATE (트랜잭션 내부, ADR-002, FR-013)
      if (couponMeta) {
        await this.couponService.markUsed(
          couponMeta.userCouponId,
          couponMeta.couponId,
          orderId,
          userId,
          discountAmount,
        );
      }

      // 2. 재고 차감 (원자적 — conditionalDecrement)
      for (const item of items) {
        await this.inventoryService.decreaseStock(
          item.variantId,
          item.quantity,
          orderId,
        );
      }

      // 3. 주문 생성
      await this.orderRepository.createOrder({
        id: orderId,
        userId,
        totalAmount,
        discountAmount,
        shippingAddressSnapshot: shippingAddress,
      });

      // 4. 주문 항목 생성
      const orderItems = items.map((item) => {
        const snap = snapshotMap.get(item.variantId)!;
        return {
          orderId,
          variantId: snap.variantId,
          productId: snap.productId,
          sellerId: snap.sellerId,
          quantity: item.quantity,
          unitPrice: snap.unitPrice,
          optionName: snap.optionName,
          optionValue: snap.optionValue,
          productTitle: snap.productTitle,
          sku: snap.sku,
        };
      });
      await this.orderRepository.createItems(orderItems);

      // 5. 주문 이벤트 기록
      await this.orderRepository.appendEvent({
        orderId,
        fromStatus: null,
        toStatus: OrderStatus.pending,
        actorType: ActorType.CUSTOMER,
        actorId: userId,
      });

      // 6. 장바구니에서 주문된 항목 제거 (동일 트랜잭션 내)
      await this.cartService.removeItems(userId, items.map((i) => i.variantId));
    });

    // 주문 생성 도메인 이벤트 (009 알림 연동, additive) — 커밋 후 발행.
    // 알림(ORDER_PLACED) 구독자가 userId(구매자)로 수신자 해석. 발행 실패는 주문에 영향 없음.
    await this.prisma.onAfterCommit(() => {
      this.eventEmitter.emit(ORDER_EVENTS.CREATED, { orderId, userId });
    });

    const order = await this.orderRepository.findById(orderId);
    return order!;
  }

  // ── 구매자 조회·취소 (T032) ────────────────────────────────────────

  async listMyOrders(
    userId: string,
    cursor?: string,
    limit?: number,
  ): Promise<{ items: Order[]; nextCursor: string | null }> {
    const take = Math.min(Math.max(limit ?? DEFAULT_PAGE_LIMIT, 1), MAX_PAGE_LIMIT);
    return this.orderRepository.listByUser(userId, cursor, take);
  }

  async getDetail(userId: string, orderId: string): Promise<OrderWithDetails> {
    const order = await this.orderRepository.findById(orderId);
    if (!order) throw new NotFoundException('Order not found');
    if (order.userId !== userId) throw new ForbiddenException('Not your order');
    return order;
  }

  /**
   * 주문 취소 — 구매자 본인만 가능.
   * pending/confirmed 상태만 취소 허용 (preparing 이후 → 400).
   * 결제가 존재하는 경우(confirmed 단계 진입 = 결제 완료 후 확정) 환불 처리.
   */
  async cancel(userId: string, orderId: string): Promise<void> {
    const order = await this.orderRepository.findById(orderId);
    if (!order) throw new NotFoundException('Order not found');
    if (order.userId !== userId) throw new ForbiddenException('Not your order');

    const cancellable: OrderStatus[] = [OrderStatus.pending, OrderStatus.confirmed];
    if (!cancellable.includes(order.status)) {
      throw new BadRequestException(`Cannot cancel order with status: ${order.status}`);
    }

    // P-001 경계: findById 의 payments 는 항상 [] (cross-schema 직접 join 불가).
    // orderId 로 결제를 직접 조회하여 completed 상태인 경우 환불.
    const payment = await this.paymentService.findPaymentByOrderId(orderId);

    await this.prisma.runInTransaction(async () => {
      // 결제 환불 — completed 상태 결제가 있으면 환불
      if (payment && payment.status === PaymentStatus.completed) {
        await this.paymentService.refund(payment.id, `refund:${orderId}`);
      }

      // 쿠폰 복원 (FR-016) — 주문에 쿠폰이 없었으면 updateMany count=0 으로 no-op
      await this.couponService.restoreForOrder(orderId);

      // 재고 복원
      for (const item of order.items) {
        await this.inventoryService.restoreStock(
          item.variantId,
          item.quantity,
          orderId,
        );
      }

      // 주문 상태 변경
      await this.orderRepository.updateStatus(orderId, OrderStatus.cancelled);

      // 이벤트 기록
      await this.orderRepository.appendEvent({
        orderId,
        fromStatus: order.status,
        toStatus: OrderStatus.cancelled,
        actorType: ActorType.CUSTOMER,
        actorId: userId,
      });
    });
  }

  // ── 판매자·시스템 액션 (T033) ──────────────────────────────────────

  /** 판매자 주문 목록 — userId → sellerId 변환 후 조회 */
  async listSellerOrders(userId: string): Promise<Order[]> {
    const seller = await this.sellerService.getApprovedSeller(userId);
    return this.orderRepository.listBySeller(seller.id);
  }

  /** 판매자 주문 확인 — pending → preparing */
  async confirmBySeller(userId: string, orderId: string): Promise<void> {
    const seller = await this.sellerService.getApprovedSeller(userId);
    const order = await this.orderRepository.findById(orderId);
    if (!order) throw new NotFoundException('Order not found');

    // 판매자 소유 검증 — items 중 하나라도 해당 sellerId 여야 함
    const hasSellersItem = order.items.some((i) => i.sellerId === seller.id);
    if (!hasSellersItem) throw new ForbiddenException('Not your order');

    if (order.status !== OrderStatus.confirmed) {
      throw new BadRequestException(
        `Cannot confirm order with status: ${order.status}`,
      );
    }

    await this.orderRepository.updateStatus(orderId, OrderStatus.preparing);
    await this.orderRepository.appendEvent({
      orderId,
      fromStatus: order.status,
      toStatus: OrderStatus.preparing,
      actorType: ActorType.SELLER,
      actorId: seller.id,
    });
  }

  /**
   * 구매 확정 (구매자) — delivered → completed.
   * 배송 완료 상태의 주문을 구매자가 직접 확정.
   */
  async complete(userId: string, orderId: string): Promise<void> {
    const order = await this.orderRepository.findById(orderId);
    if (!order) throw new NotFoundException('Order not found');
    if (order.userId !== userId) throw new ForbiddenException('Not your order');

    if (order.status !== OrderStatus.delivered) {
      throw new BadRequestException(
        `Cannot complete order with status: ${order.status}`,
      );
    }

    await this.orderRepository.updateStatus(orderId, OrderStatus.completed, {
      completedAt: new Date(),
    });
    await this.orderRepository.appendEvent({
      orderId,
      fromStatus: order.status,
      toStatus: OrderStatus.completed,
      actorType: ActorType.CUSTOMER,
      actorId: userId,
    });
  }

  // ── 리뷰 연동 (T022) ──────────────────────────────────────────────────

  /**
   * orderItemId 로 OrderItem + 상위 Order 조회.
   * ReviewService 가 DI 경유로 소비 (P-001: cross-schema 직접 접근 금지).
   */
  async getOrderItemForReview(orderItemId: string): Promise<OrderItemWithOrder | null> {
    return this.orderRepository.findOrderItemWithOrder(orderItemId);
  }

  /**
   * 자동확정 대상 조회 + 일괄 처리.
   * pg-boss AutoConfirmJob 에서 호출 (SYSTEM actorType).
   * delivered 상태 주문을 completed 로 전이 (FR-027: 배송완료 7일 후 자동 구매확정).
   * @returns 처리된 주문 수
   */
  async autoConfirmDelivered(now: Date): Promise<number> {
    const cutoff = new Date(now);
    cutoff.setDate(cutoff.getDate() - AUTO_CONFIRM_DAYS);

    const orders = await this.orderRepository.findDeliveredBefore(cutoff);
    for (const order of orders) {
      // delivered → completed (SYSTEM actor — markConfirmed 는 pending→confirmed 전용)
      await this.orderRepository.updateStatus(order.id, OrderStatus.completed, {
        completedAt: now,
      });
      await this.orderRepository.appendEvent({
        orderId: order.id,
        fromStatus: OrderStatus.delivered,
        toStatus: OrderStatus.completed,
        actorType: ActorType.SYSTEM,
      });
    }
    return orders.length;
  }

  // ── 배송 연동 (005-shipping) ─────────────────────────────────────────

  /**
   * 송장 등록에 따른 주문 상태 전이 — preparing → shipped.
   * ShippingService 가 DI 경유로 호출 (P-001: cross-schema 직접 접근 금지).
   * 판매자 소유권 검증(items 중 sellerId 일치) 포함. shipping 트랜잭션 내부에서 호출되어 원자성 보장.
   */
  async markShipped(orderId: string, sellerId: string): Promise<void> {
    const order = await this.orderRepository.findById(orderId);
    if (!order) throw new NotFoundException('Order not found');

    const hasSellersItem = order.items.some((i) => i.sellerId === sellerId);
    if (!hasSellersItem) throw new ForbiddenException('Not your order');

    if (order.status !== OrderStatus.preparing) {
      throw new BadRequestException(
        `Cannot ship order with status: ${order.status}`,
      );
    }

    await this.orderRepository.updateStatus(orderId, OrderStatus.shipped);
    await this.orderRepository.appendEvent({
      orderId,
      fromStatus: order.status,
      toStatus: OrderStatus.shipped,
      actorType: ActorType.SELLER,
      actorId: sellerId,
    });
  }

  /**
   * 배송 완료에 따른 주문 상태 전이 — shipped → delivered (deliveredAt 기록).
   * ShippingService 가 배송 상태를 delivered 로 업데이트할 때 DI 경유로 호출.
   * 멱등: 이미 delivered 이상이면 no-op.
   */
  async markDelivered(orderId: string, sellerId: string): Promise<void> {
    const order = await this.orderRepository.findById(orderId);
    if (!order) throw new NotFoundException('Order not found');

    const hasSellersItem = order.items.some((i) => i.sellerId === sellerId);
    if (!hasSellersItem) throw new ForbiddenException('Not your order');

    if (order.status === OrderStatus.delivered) return; // 멱등

    if (order.status !== OrderStatus.shipped) {
      throw new BadRequestException(
        `Cannot mark delivered for order with status: ${order.status}`,
      );
    }

    await this.orderRepository.updateStatus(orderId, OrderStatus.delivered, {
      deliveredAt: new Date(),
    });
    await this.orderRepository.appendEvent({
      orderId,
      fromStatus: order.status,
      toStatus: OrderStatus.delivered,
      actorType: ActorType.SELLER,
      actorId: sellerId,
    });
  }

  /**
   * 주문 접근 권한 정보 — 배송 추적 조회 권한 3축 판정용 (구매자 본인 또는 판매자).
   * ShippingService 가 DI 경유로 소비 (P-001 경계 준수).
   */
  async getOrderOwnership(
    orderId: string,
  ): Promise<{ userId: string; sellerIds: string[] }> {
    const order = await this.orderRepository.findById(orderId);
    if (!order) throw new NotFoundException('Order not found');
    const sellerIds = [...new Set(order.items.map((i) => i.sellerId))];
    return { userId: order.userId, sellerIds };
  }

  // ── 정산 연동 (005-settlement) ───────────────────────────────────────

  /**
   * 정산 집계용 — 판매자의 기간 내 completed 주문항목 매출 명세 반환.
   * SettlementService 가 DI 경유로 소비 (P-001: settlements 모듈이 orders 스키마 직접 접근 금지).
   * saleAmount = unitPrice × quantity (Decimal 정확 계산).
   */
  async getCompletedItemsForSettlement(
    sellerId: string,
    periodStart: Date,
    periodEnd: Date,
  ): Promise<Array<{ orderId: string; orderItemId: string; saleAmount: Prisma.Decimal }>> {
    const rows = await this.orderRepository.findCompletedItemsBySellerInPeriod(
      sellerId,
      periodStart,
      periodEnd,
    );
    return rows.map((r) => ({
      orderId: r.orderId,
      orderItemId: r.orderItemId,
      saleAmount: new Prisma.Decimal(r.unitPrice).mul(r.quantity),
    }));
  }

  /**
   * 구매 확정 처리 — pending → confirmed.
   * ADR-007: OutboxRelay 에서 payment.completed 이벤트 수신 후 호출.
   * actorType=SYSTEM. 이미 confirmed 이면 멱등 처리.
   */
  async markConfirmed(orderId: string): Promise<void> {
    const order = await this.orderRepository.findById(orderId);
    if (!order) return; // 멱등성: 없으면 무시
    if (order.status === OrderStatus.confirmed) return; // 이미 확정됨

    await this.orderRepository.updateStatus(orderId, OrderStatus.confirmed);
    await this.orderRepository.appendEvent({
      orderId,
      fromStatus: order.status,
      toStatus: OrderStatus.confirmed,
      actorType: ActorType.SYSTEM,
    });
  }

  // ── 통계 집계 (007-stats, additive 공개 메서드) ──────────────────────
  // StatsService 가 DI 경유로 소비 (P-001: stats 모듈은 orders 스키마 직접 접근 금지).

  /** 전체 주문 수 — 플랫폼 통계. */
  async countAllOrders(): Promise<number> {
    return this.orderRepository.countAll();
  }

  /** completed 주문 수 — 플랫폼 통계. */
  async countCompletedOrders(): Promise<number> {
    return this.orderRepository.countCompleted();
  }

  /** completed 주문 총 매출 (P-005: Decimal). */
  async sumCompletedSales(): Promise<Prisma.Decimal> {
    return this.orderRepository.sumCompletedTotalAmount();
  }

  /** 판매자 본인 completed 매출 요약 — 매출 합계(Decimal) + 주문 건수. */
  async getSellerSalesSummary(
    sellerId: string,
  ): Promise<{ salesTotal: Prisma.Decimal; orderCount: number }> {
    return this.orderRepository.getSellerCompletedSummary(sellerId);
  }
}
