import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { ChargeResult, PaymentGatewayPort, RefundResult } from './payment-gateway.port';

/**
 * PG 연동 스텁 구현 — 항상 성공 반환.
 * 실제 PG 연동 시 이 클래스를 교체하거나 별도 구현체를 PAYMENT_GATEWAY 토큰으로 바인딩.
 */
@Injectable()
export class StubPaymentGateway implements PaymentGatewayPort {
  private readonly logger = new Logger(StubPaymentGateway.name);

  async charge(params: {
    orderId: string;
    amount: Prisma.Decimal;
    idempotencyKey: string;
    authToken?: string;
  }): Promise<ChargeResult> {
    this.logger.log(
      `[STUB] charge orderId=${params.orderId} amount=${params.amount} key=${params.idempotencyKey}`,
    );
    return {
      success: true,
      pgTransactionId: `stub-tx-${params.idempotencyKey}`,
    };
  }

  async refund(params: {
    paymentId: string;
    amount: Prisma.Decimal;
    idempotencyKey: string;
    pgTransactionId?: string;
  }): Promise<RefundResult> {
    this.logger.log(
      `[STUB] refund paymentId=${params.paymentId} amount=${params.amount} key=${params.idempotencyKey}`,
    );
    return {
      success: true,
      pgRefundId: `stub-refund-${params.idempotencyKey}`,
    };
  }
}
