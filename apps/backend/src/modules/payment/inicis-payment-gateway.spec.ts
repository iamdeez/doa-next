/**
 * IniisisPaymentGateway 단위/게이트웨이 통합 테스트 — [env:integration]
 *
 * 대상 SC (021-payment-file-integration): SC-005, SC-016
 * 검증 방법: global fetch mock(네트워크 호출 없음) + ConfigService mock +
 *   NestJS Logger.prototype spy — 실제 이니시스 sandbox 크레덴셜 불요
 *   (게이트웨이 클래스 로직 단위 검증 — 옵션 A 대상인 SC-001~004 실 sandbox
 *   호출 검증과 구분됨. research.md §6/§10, tasks.md Test Authoring Contract 참조).
 *
 * Canonical 심볼 (tasks.md Test Authoring Contract·실측 소스 기준):
 *   IniisisPaymentGateway(configService: ConfigService)
 *   .charge({orderId,amount:Decimal,idempotencyKey,authToken?,authUrl?}): Promise<ChargeResult>
 *   .refund({paymentId,amount:Decimal,idempotencyKey,pgTransactionId?}): Promise<RefundResult>
 *
 * TDD Red 여부: 본 작성 시점에 production 파일이 이미 존재하여 아래 테스트는 실제
 *   구현(마스킹 로직·form-urlencoded payload)에 맞춰 작성되었다(4단계 Development 와
 *   PPG-1 병렬 진행 중 관측된 실측 소스 기준 — 이후 구현 변경 시 5b EXECUTION 이 재검증).
 */

import { ConfigService } from '@nestjs/config';
import { Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { IniisisPaymentGateway } from './inicis-payment-gateway';

const FIXED_MID = 'test-mid-should-not-appear-in-logs';
const FIXED_SIGN_KEY = 'test-sign-key-should-not-appear-in-logs';
const FIXED_API_BASE_URL = 'https://sandbox.inicis.example.com';

const mockConfigService = {
  get: jest.fn((key: string) => {
    if (key === 'inicis') {
      return {
        mid: FIXED_MID,
        signKey: FIXED_SIGN_KEY,
        apiBaseUrl: FIXED_API_BASE_URL,
      };
    }
    return null;
  }),
};

describe('IniisisPaymentGateway', () => {
  let gateway: IniisisPaymentGateway;
  let fetchSpy: jest.Mock;
  let logSpy: jest.SpyInstance;
  let errorSpy: jest.SpyInstance;
  let warnSpy: jest.SpyInstance;
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    fetchSpy = jest.fn();
    globalThis.fetch = fetchSpy as unknown as typeof fetch;

    logSpy = jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    errorSpy = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    warnSpy = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);

    gateway = new IniisisPaymentGateway(mockConfigService as unknown as ConfigService);
  });

  afterEach(() => {
    jest.restoreAllMocks();
    globalThis.fetch = originalFetch;
  });

  // ─────────────────────────────────────────────
  // SC-005: 부분 환불(요청액만) — 게이트웨이 레벨 (ADR-004)
  // ─────────────────────────────────────────────
  describe('SC-005: refund — 부분 환불(요청액만) 처리', () => {
    it('when_partial_amount_and_pgTransactionId_then_request_body_reflects_partial_amount_only', async () => {
      /**
       * SC-005 (FR-002 관련, ADR-004 — Port 구현체 레벨 부분금액 전달):
       * 원 결제액(30000) 중 부분 금액(10000)만 refund() 에 전달하면, 이니시스
       * 취소 요청 페이로드에 그 부분 금액(10000)과 원 거래ID(pgTransactionId)가
       * 포함되고, 원결제 전액(30000)은 요청 본문에 포함되지 않는다.
       */
      fetchSpy.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ resultCode: '0000', cancelTid: 'pg-cancel-001' }),
      });

      const result = await gateway.refund({
        paymentId: 'payment-id-001',
        amount: new Prisma.Decimal('10000'),
        idempotencyKey: 'refund:order-id-001',
        pgTransactionId: 'pg-txn-original-001',
      });

      expect(fetchSpy).toHaveBeenCalledTimes(1);
      const [, requestInit] = fetchSpy.mock.calls[0] as [string, { body?: string }];
      const requestBody = requestInit.body ?? '';
      const parsed = new URLSearchParams(requestBody);

      expect(parsed.get('price')).toBe('10000');
      expect(parsed.get('tid')).toBe('pg-txn-original-001');
      expect(requestBody).not.toContain('30000');

      expect(result).toEqual(
        expect.objectContaining({ success: true, pgRefundId: 'pg-cancel-001' }),
      );
    });
  });

  // ─────────────────────────────────────────────
  // SC-016: charge/refund — 요청·응답 로그에 자격증명·카드정보 미노출
  // ─────────────────────────────────────────────
  describe('SC-016: charge/refund — 로그에 MID·서명키 등 자격증명 미노출', () => {
    it('when_charge_then_mid_and_signKey_absent_from_all_log_output', async () => {
      /**
       * SC-016 (NFR-004 관련, ADR-007):
       * charge() 호출 시 요청/응답 로그(Logger.log/warn/error)에 MID·signKey 원문이
       * 그대로 노출되지 않아야 한다(구현체 마스킹 — maskSensitivePayload).
       */
      fetchSpy.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ resultCode: '0000', tid: 'pg-txn-002' }),
      });

      await gateway.charge({
        orderId: 'order-id-002',
        amount: new Prisma.Decimal('20000'),
        idempotencyKey: 'idem-key-002',
      });

      const allLoggedArgs = [...logSpy.mock.calls, ...warnSpy.mock.calls, ...errorSpy.mock.calls].flat();
      const combinedLog = allLoggedArgs
        .map((arg) => (typeof arg === 'string' ? arg : JSON.stringify(arg)))
        .join('\n');

      expect(combinedLog).not.toContain(FIXED_MID);
      expect(combinedLog).not.toContain(FIXED_SIGN_KEY);
      // 마스킹 결과 마커는 로그에 남아 있어야 함(민감 필드가 통째로 누락된 게 아니라 마스킹됐음을 확인)
      expect(combinedLog).toMatch(/\*\*\*/);
    });

    it('when_refund_then_mid_and_signKey_absent_from_all_log_output', async () => {
      fetchSpy.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ resultCode: '0000', cancelTid: 'pg-cancel-003' }),
      });

      await gateway.refund({
        paymentId: 'payment-id-003',
        amount: new Prisma.Decimal('5000'),
        idempotencyKey: 'refund:order-id-003',
        pgTransactionId: 'pg-txn-original-003',
      });

      const allLoggedArgs = [...logSpy.mock.calls, ...warnSpy.mock.calls, ...errorSpy.mock.calls].flat();
      const combinedLog = allLoggedArgs
        .map((arg) => (typeof arg === 'string' ? arg : JSON.stringify(arg)))
        .join('\n');

      expect(combinedLog).not.toContain(FIXED_MID);
      expect(combinedLog).not.toContain(FIXED_SIGN_KEY);
      expect(combinedLog).toMatch(/\*\*\*/);
    });
  });
});
