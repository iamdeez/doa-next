import { Prisma } from '@prisma/client';

/** PG 연동 인터페이스 — P-002: AWS SDK 미사용. P-004: cloud neutral. */
export interface ChargeResult {
  success: boolean;
  pgTransactionId?: string;
  failureReason?: string;
}

export interface RefundResult {
  success: boolean;
  pgRefundId?: string;
}

export interface PaymentGatewayPort {
  charge(params: {
    orderId: string;
    amount: Prisma.Decimal;
    idempotencyKey: string;
    /**
     * 표준(호스팅) 결제창 1단계 인증 결과 토큰 — GAP-021-02. optional (컨트롤러가 아직
     * 클라이언트로부터 수신·전달하지 않으므로 stub·기존 charge 호출부는 회귀 없음).
     * [TO-VERIFY] 정확한 필드명·활용법은 이니시스 공식 개발자센터 문서로 확정 필요.
     */
    authToken?: string;
  }): Promise<ChargeResult>;

  refund(params: {
    paymentId: string;
    amount: Prisma.Decimal;
    idempotencyKey: string;
    /** PG 취소 대상 원 거래ID (ADR-002) — optional, StubPaymentGateway 는 무시 */
    pgTransactionId?: string;
  }): Promise<RefundResult>;
}

/** DI 토큰 */
export const PAYMENT_GATEWAY = 'PAYMENT_GATEWAY' as const;
