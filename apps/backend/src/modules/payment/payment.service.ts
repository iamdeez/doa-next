import {
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  forwardRef,
} from '@nestjs/common';
import { Payment, PaymentStatus, Prisma, Refund } from '@prisma/client';
import { PrismaService } from '../../shared/prisma/prisma.service';
import { OrderRepository } from '../order/order.repository';
import { PAYMENT_GATEWAY, PaymentGatewayPort, RefundResult } from './payment-gateway.port';
import { PaymentRepository } from './payment.repository';

export { RefundResult };

@Injectable()
export class PaymentService {
  constructor(
    private readonly paymentRepository: PaymentRepository,
    private readonly prisma: PrismaService,
    @Inject(forwardRef(() => OrderRepository))
    private readonly orderRepository: OrderRepository,
    @Inject(PAYMENT_GATEWAY)
    private readonly gateway: PaymentGatewayPort,
  ) {}

  /**
   * 결제 생성 (T042).
   * - 주문 소유권 검증 (order.userId === userId)
   * - idempotencyKey 동일 키 재요청 → 기존 결과 반환 (ADR-006)
   * - 금액은 order.totalAmount 에서 취득 (외부 입력 불신)
   * - 성공 시 payment(completed) + payment_outbox 동일 tx (ADR-008)
   * - 실패 시 payment(failed) + outbox 미기록 — 예외 없이 반환
   */
  async pay(
    userId: string,
    orderId: string,
    idempotencyKey: string,
    /** 표준(호스팅) 결제창 1단계 인증 결과 토큰 (GAP-021-02) — optional, 미전달 시 기존 동작 불변 */
    authToken?: string,
  ): Promise<{ paymentId: string; status: PaymentStatus }> {
    // 소유권 검증
    const order = await this.orderRepository.findById(orderId);
    if (!order) throw new NotFoundException('Order not found');
    if (order.userId !== userId) throw new ForbiddenException('Not your order');

    // 멱등성: 동일 key 재요청 시 기존 결과 반환
    const existing = await this.paymentRepository.findByIdempotencyKey(idempotencyKey);
    if (existing) {
      return { paymentId: existing.id, status: existing.status };
    }

    // 실결제 금액: totalAmount - discountAmount (FR-013, SEC-FIND-004: 외부 금액 입력 불신)
    const amount = new Prisma.Decimal(order.totalAmount.toString()).minus(order.discountAmount);

    // PG 결제 요청 (트랜잭션 외부 — PG 호출은 롤백 불가)
    const chargeResult = await this.gateway.charge({ orderId, amount, idempotencyKey, authToken });

    const status = chargeResult.success ? PaymentStatus.completed : PaymentStatus.failed;

    // 결제 기록 (+ outbox) 원자적 저장
    const payment = await this.prisma.runInTransaction(async () => {
      const p = await this.paymentRepository.createPayment({
        orderId,
        userId,
        amount,
        idempotencyKey,
        status,
        pgTransactionId: chargeResult.pgTransactionId,
        failureReason: chargeResult.failureReason,
      });

      if (status === PaymentStatus.completed) {
        await this.paymentRepository.createOutbox({
          paymentId: p.id,
          eventType: 'payment.completed',
          payload: { orderId, paymentId: p.id, amount: amount.toString() },
        });
      }

      return p;
    });

    return { paymentId: payment.id, status: payment.status };
  }

  /**
   * 환불 처리 (T043).
   * - paymentId: 환불 대상 결제 ID
   * - idempotencyKey: 'refund:{orderId}' 형식 — 이중환불 guard (ADR-008)
   * - 동일 key 재요청 → 기존 결과 반환 (멱등)
   * - payment.status=refunded 상태에서 다른 key → ConflictException(409)
   */
  async refund(paymentId: string, idempotencyKey: string): Promise<Refund | undefined> {
    // 멱등성: 동일 key 재요청 시 기존 결과 반환
    const existingRefund = await this.paymentRepository.findRefundByKey(idempotencyKey);
    if (existingRefund) {
      return existingRefund;
    }

    // orderId 추출 — idempotencyKey 형식: 'refund:{orderId}'
    const orderId = idempotencyKey.replace(/^refund:/, '');

    const payment = await this.paymentRepository.findByOrderId(orderId);
    if (!payment) throw new NotFoundException('Payment not found for order');

    // 이미 다른 key 로 환불 완료 → ConflictException
    if (payment.status === PaymentStatus.refunded) {
      throw new ConflictException('Order already refunded');
    }

    if (payment.status !== PaymentStatus.completed) {
      throw new ConflictException('Payment is not completed, cannot refund');
    }

    // PG 환불 요청 (트랜잭션 외부) — pgTransactionId: 이니시스 취소 대상 원 거래ID (ADR-002)
    const refundResult = await this.gateway.refund({
      paymentId,
      amount: payment.amount,
      idempotencyKey,
      pgTransactionId: payment.pgTransactionId ?? undefined,
    });

    // 환불 기록 + 상태 변경 + outbox 원자적 저장
    const refund = await this.prisma.runInTransaction(async () => {
      const r = await this.paymentRepository.createRefund({
        paymentId,
        amount: payment.amount,
        idempotencyKey,
        status: refundResult.success ? 'refunded' : 'failed',
        pgRefundId: refundResult.pgRefundId,
      });

      await this.paymentRepository.updateStatus(
        paymentId,
        refundResult.success ? PaymentStatus.refunded : PaymentStatus.failed,
      );

      if (refundResult.success) {
        await this.paymentRepository.createOutbox({
          paymentId,
          eventType: 'payment.refunded',
          payload: { orderId, paymentId, amount: payment.amount.toString() },
        });
      }

      return r;
    });

    return refund;
  }

  /** orderId 로 결제 조회 — OrderService cancel() 에서 환불 대상 확인용 */
  async findPaymentByOrderId(orderId: string): Promise<Payment | null> {
    return this.paymentRepository.findByOrderId(orderId);
  }
}
