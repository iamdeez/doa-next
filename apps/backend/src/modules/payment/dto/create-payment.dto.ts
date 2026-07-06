import { IsOptional, IsString, IsUUID } from 'class-validator';

export class CreatePaymentDto {
  @IsString()
  orderId!: string;

  /** 클라이언트 생성 UUID v4 — 멱등성 보장 (ADR-006). 헤더 미전달 시 body 값 사용. */
  @IsUUID(4)
  idempotencyKey!: string;

  /**
   * 표준(호스팅) 결제창 1단계 인증 결과 토큰 (GAP-021-02) — optional.
   * 미전달 시 IniisisPaymentGateway.charge 가 INICIS_API_BASE_URL fallback 경로를 사용(stub 은 무시).
   */
  @IsOptional()
  @IsString()
  authToken?: string;
}
