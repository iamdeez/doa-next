import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import { createHash } from 'crypto';
import { ChargeResult, PaymentGatewayPort, RefundResult } from './payment-gateway.port';
import { InicisConfig } from './inicis.config';

/**
 * [TO-VERIFY] 이니시스 표준결제 승인(approve)/취소(refund) API 상대경로.
 *
 * 이니시스 표준(호스팅) 결제창은 통상 트랜잭션별 동적 승인 URL(authUrl)을 1단계 결제창
 * 콜백으로 반환하며, 가맹점 서버는 그 URL 로 2단계 승인 요청을 보낸다(research.md §4-1).
 * charge() 는 authUrl 이 전달되면 이를 우선 사용하고, 미전달 시(서버 단독 sandbox 호출 등)
 * INICIS_API_BASE_URL 에 아래 fallback 경로를 이어붙인다. 정확한 경로·파라미터명은
 * 이니시스 개발자센터 공식문서로 최종 확정 필요(GAP-021-02).
 */
const FALLBACK_APPROVAL_PATH = '/std/pay/api/approve';
const FALLBACK_CANCEL_PATH = '/std/pay/api/refund';

/**
 * fetch 타임아웃(ms) — GAP-021-04: native fetch(undici) 는 기본적으로 장시간(~5분) 소켓을
 * 점유할 수 있어 PG 응답 지연 시 후속 결제 요청이 연쇄 지연될 위험이 있다. NFR-001(결제 API
 * P95 ≤2,000ms)을 고려하되 정상 승인까지 끊기지 않도록 여유를 둔 상한(10초)을 둔다.
 * 타임아웃 발생 시 예외를 던지지 않고 charge/refund 의 기존 catch 분기로 흘러
 * ADR-008(payment=failed 기록 + 멱등키 재요청) 계약을 그대로 활용한다(신규 재시도 로직 없음).
 */
const FETCH_TIMEOUT_MS = 10_000;

/** 로그 마스킹 대상 필드명(소문자 비교) — NFR-004/SC-016: MID·서명키·API키·카드 관련 정보 미노출 */
const SENSITIVE_FIELD_NAMES = new Set([
  'mid',
  'signkey',
  'signature',
  'apikey',
  'apiiv',
  'authtoken',
  'cardno',
  'cardnumber',
  'cardnum',
]);

const MASK_VALUE = '***';

function maskSensitivePayload(payload: Record<string, unknown>): Record<string, unknown> {
  const masked: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(payload)) {
    masked[key] = SENSITIVE_FIELD_NAMES.has(key.toLowerCase()) ? MASK_VALUE : value;
  }
  return masked;
}

/** payload 의 undefined/null 필드를 제외하고 application/x-www-form-urlencoded 본문으로 직렬화 */
function toFormBody(payload: Record<string, unknown>): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(payload)) {
    if (value !== undefined && value !== null) {
      params.set(key, String(value));
    }
  }
  return params.toString();
}

interface InicisApproveResponse {
  resultCode: string;
  resultMsg?: string;
  tid?: string;
}

interface InicisCancelResponse {
  resultCode: string;
  resultMsg?: string;
  tid?: string;
  cancelTid?: string;
}

/**
 * KG이니시스 표준결제 실연동 (FR-001~003·NFR-004).
 *
 * HTTP=native fetch(Node 20 내장, 소셜 provider 와 동일 패턴 — ADR-003), 서명=native crypto.
 * 필수 env(MID·signKey·apiBaseUrl) 부재 시 생성 시점에 에러(PAYMENT_PROVIDER=inicis 선택
 * 시에만 이 클래스가 생성되므로 stub 부팅에는 영향 없음 — payment.module.ts 참조).
 */
@Injectable()
export class IniisisPaymentGateway implements PaymentGatewayPort {
  private readonly logger = new Logger(IniisisPaymentGateway.name);
  private readonly config: InicisConfig & {
    mid: string;
    signKey: string;
    apiBaseUrl: string;
  };

  constructor(configService: ConfigService) {
    const raw = configService.get<InicisConfig>('inicis') ?? {};
    if (!raw.mid || !raw.signKey || !raw.apiBaseUrl) {
      throw new Error(
        'IniisisPaymentGateway requires INICIS_MID, INICIS_SIGN_KEY, INICIS_API_BASE_URL (PAYMENT_PROVIDER=inicis)',
      );
    }
    this.config = raw as typeof this.config;
  }

  async charge(params: {
    orderId: string;
    amount: Prisma.Decimal;
    idempotencyKey: string;
    authToken?: string;
    authUrl?: string;
  }): Promise<ChargeResult> {
    const { orderId, amount, idempotencyKey, authToken, authUrl } = params;

    // FR-003: 멱등성 키를 이니시스 승인 요청 페이로드에 포함(이니시스 필드 매핑은 [TO-VERIFY])
    const payload: Record<string, unknown> = {
      mid: this.config.mid,
      moid: orderId,
      idempotencyKey,
      price: amount.toString(),
      authToken,
      signature: this.buildSignature({ amount, authToken }),
    };

    const endpoint = authUrl ?? `${this.config.apiBaseUrl}${FALLBACK_APPROVAL_PATH}`;

    try {
      this.logger.log(
        `charge request ${JSON.stringify(maskSensitivePayload(payload))}`,
      );

      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: toFormBody(payload),
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      });

      const data = (await res.json()) as InicisApproveResponse;

      this.logger.log(
        `charge response ${JSON.stringify(maskSensitivePayload(data as unknown as Record<string, unknown>))}`,
      );

      if (!res.ok || data.resultCode !== '0000') {
        return { success: false, failureReason: data.resultMsg ?? `HTTP ${res.status}` };
      }

      return { success: true, pgTransactionId: data.tid };
    } catch (err) {
      // 타임아웃/네트워크 오류(FR-004) — 예외를 던지지 않고 실패로 반환하여
      // payment.service.pay 의 기존 실패분기(status=failed)·멱등 재요청 계약을 그대로 활용(ADR-008)
      this.logger.error(
        `charge failed orderId=${orderId} key=${idempotencyKey}`,
        err instanceof Error ? err.stack : undefined,
      );
      return {
        success: false,
        failureReason: err instanceof Error ? err.message : 'Unknown error',
      };
    }
  }

  async refund(params: {
    paymentId: string;
    amount: Prisma.Decimal;
    idempotencyKey: string;
    pgTransactionId?: string;
  }): Promise<RefundResult> {
    const { paymentId, amount, idempotencyKey, pgTransactionId } = params;

    // FR-003: 멱등성 키를 이니시스 취소 요청 페이로드에 포함
    const payload: Record<string, unknown> = {
      mid: this.config.mid,
      tid: pgTransactionId,
      idempotencyKey,
      price: amount.toString(),
      signature: this.buildSignature({ amount, authToken: pgTransactionId }),
    };

    const endpoint = `${this.config.apiBaseUrl}${FALLBACK_CANCEL_PATH}`;

    try {
      this.logger.log(
        `refund request ${JSON.stringify(maskSensitivePayload(payload))}`,
      );

      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: toFormBody(payload),
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      });

      const data = (await res.json()) as InicisCancelResponse;

      this.logger.log(
        `refund response ${JSON.stringify(maskSensitivePayload(data as unknown as Record<string, unknown>))}`,
      );

      if (!res.ok || data.resultCode !== '0000') {
        return { success: false };
      }

      return { success: true, pgRefundId: data.cancelTid ?? data.tid };
    } catch (err) {
      this.logger.error(
        `refund failed paymentId=${paymentId} key=${idempotencyKey}`,
        err instanceof Error ? err.stack : undefined,
      );
      return { success: false };
    }
  }

  /**
   * [TO-VERIFY] 서명(hash) 생성 알고리즘 — 대상 필드·순서·SHA-256/512 여부는 이니시스
   * 공식 개발자센터 규격으로 확정 필요(research.md §4-3). signKey 는 반환값(hex)에만
   * 기여하며 로그에는 노출하지 않는다(NFR-004 — signature 필드 자체도 마스킹 대상).
   */
  private buildSignature(input: { amount: Prisma.Decimal; authToken?: string }): string {
    const material = `${input.authToken ?? ''}${this.config.mid}${input.amount.toString()}${this.config.signKey}`;
    return createHash('sha256').update(material).digest('hex');
  }
}
