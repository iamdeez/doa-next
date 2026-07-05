/**
 * SecurityAuditLogger 단위 테스트 — [env:unit]
 *
 * 대상 SC: SC-014·015·016·017·019 (v1.1.0/018 spec) + SC-012·013 (v1.1.0/019 spec)
 * 검증 방법: Jest mock `PinoLogger`(nestjs-pino, 주입) — `warn` spy.
 *
 * Test Authoring Contract canonical (tasks.md):
 *   - `SecurityAuditLogger` 메서드 4종: `otpVerificationFailed(email)`,
 *     `rateLimitExceeded(endpoint, ip)`, `findEmailAccessed(phone, resultEmail)`,
 *     `findEmailNotFound(phone)`(v1.1.0/019 spec 신규 — FR-008/009/010).
 *   - 전부 best-effort(내부 warn 이 throw 해도 메서드는 throw 하지 않음).
 *   - 단위 테스트 주입 mock: `{ warn: jest.fn(), setContext: jest.fn() }`.
 *
 * 주의: maskEmail/maskPhone 은 기존(013/v1.1.0) 유틸 재사용 원칙(NFR-009)이므로
 * 마스킹 결과를 하드코딩하지 않고 실제 유틸 함수로 기대값을 계산한다(포맷 변경에도
 * 이 테스트가 결합되지 않도록).
 */

import { Test, TestingModule } from '@nestjs/testing';
import { PinoLogger } from 'nestjs-pino';
import { SecurityAuditLogger } from './security-audit.logger';
import { maskEmail, maskPhone } from '../../modules/auth/auth.util';

const makeMockPinoLogger = () => ({
  warn: jest.fn(),
  setContext: jest.fn(),
});

describe('SecurityAuditLogger', () => {
  let service: SecurityAuditLogger;
  let mockLogger: ReturnType<typeof makeMockPinoLogger>;

  beforeEach(async () => {
    mockLogger = makeMockPinoLogger();

    const module: TestingModule = await Test.createTestingModule({
      providers: [SecurityAuditLogger, { provide: PinoLogger, useValue: mockLogger }],
    }).compile();

    service = module.get<SecurityAuditLogger>(SecurityAuditLogger);
  });

  // ─────────────────────────────────────────────
  // SC-014: OTP 불일치 → WARN 1건, email 마스킹 (FR-007·NFR-009)
  // ─────────────────────────────────────────────
  describe('SC-014 (v1.1.0/018 spec): otpVerificationFailed — WARN 1건 + email 마스킹 (FR-007·NFR-009)', () => {
    it('test_SC014_018_otp_verification_failed_logs_warn_with_masked_email', () => {
      /**
       * SC-014 (v1.1.0/018 spec): OTP 값 불일치 시 WARN 수준 로그가 1건 기록되고
       * 로그 메시지에 이메일이 마스킹된 형태로 포함됨을 검증한다.
       */
      const email = 'otp-fail-user@example.com';
      const expectedMasked = maskEmail(email);

      service.otpVerificationFailed(email);

      expect(mockLogger.warn).toHaveBeenCalledTimes(1);
      const [payload] = mockLogger.warn.mock.calls[0] as [Record<string, unknown>, string];
      expect(payload['event']).toBe('otp_verification_failed');
      expect(payload['email']).toBe(expectedMasked);
      // 원본(비마스킹) 이메일이 payload 에 없어야 함
      expect(JSON.stringify(payload)).not.toContain(email);
    });
  });

  // ─────────────────────────────────────────────
  // SC-015: rate limit 초과(429) → WARN 1건, endpoint+ip 포함 (FR-008)
  // ─────────────────────────────────────────────
  describe('SC-015 (v1.1.0/018 spec): rateLimitExceeded — WARN 1건 + endpoint·ip 포함 (FR-008)', () => {
    it('test_SC015_018_rate_limit_exceeded_logs_warn_with_endpoint_and_ip', () => {
      /**
       * SC-015 (v1.1.0/018 spec): rate limit 초과(429) 발생 시 WARN 수준 로그가
       * 1건 기록되고 대상 엔드포인트·클라이언트 IP 정보가 포함됨을 검증한다.
       */
      const endpoint = '/auth/social-login';
      const ip = '203.0.113.10';

      service.rateLimitExceeded(endpoint, ip);

      expect(mockLogger.warn).toHaveBeenCalledTimes(1);
      const [payload] = mockLogger.warn.mock.calls[0] as [Record<string, unknown>, string];
      expect(payload['event']).toBe('rate_limit_exceeded');
      expect(payload['endpoint']).toBe(endpoint);
      expect(payload['ip']).toBe(ip);
    });
  });

  // ─────────────────────────────────────────────
  // SC-016: find-email 접근 → WARN 1건, phone/email 마스킹 (FR-009·NFR-009)
  // ─────────────────────────────────────────────
  describe('SC-016 (v1.1.0/018 spec): findEmailAccessed — WARN 1건 + phone·email 마스킹 (FR-009·NFR-009)', () => {
    it('test_SC016_018_find_email_accessed_logs_warn_with_masked_phone_and_email', () => {
      /**
       * SC-016 (v1.1.0/018 spec): find-email 호출 시 WARN 수준 로그가 1건 기록되고
       * 조회 전화번호·반환 이메일이 마스킹된 형태로 포함됨을 검증한다.
       */
      const phone = '01012345678';
      const resultEmail = 'found-user@example.com';
      const expectedMaskedPhone = maskPhone(phone);
      const expectedMaskedEmail = maskEmail(resultEmail);

      service.findEmailAccessed(phone, resultEmail);

      expect(mockLogger.warn).toHaveBeenCalledTimes(1);
      const [payload] = mockLogger.warn.mock.calls[0] as [Record<string, unknown>, string];
      expect(payload['event']).toBe('find_email_access');
      expect(payload['phone']).toBe(expectedMaskedPhone);
      expect(payload['email']).toBe(expectedMaskedEmail);
      expect(JSON.stringify(payload)).not.toContain(phone);
      expect(JSON.stringify(payload)).not.toContain(resultEmail);
    });
  });

  // ─────────────────────────────────────────────
  // SC-017: 로거 throw 해도 원 응답 불변 (best-effort, FR-010)
  // ─────────────────────────────────────────────
  describe('SC-017 (v1.1.0/018 spec): 로거 throw 해도 메서드는 throw 하지 않음 (best-effort, FR-010)', () => {
    it('test_SC017_018_otp_verification_failed_swallows_logger_throw', () => {
      /**
       * SC-017 (v1.1.0/018 spec): 보안 감사 로그 기록 로직이 예외를 던지도록 mock
       * 하더라도 원 처리 흐름이 영향받지 않아야 한다 — otpVerificationFailed 자체가
       * throw 하지 않음을 확인(best-effort).
       */
      mockLogger.warn.mockImplementation(() => {
        throw new Error('pino transport failure');
      });

      expect(() => service.otpVerificationFailed('any@example.com')).not.toThrow();
    });

    it('test_SC017_018_rate_limit_exceeded_swallows_logger_throw', () => {
      /** SC-017 보조: rateLimitExceeded 도 동일하게 best-effort. */
      mockLogger.warn.mockImplementation(() => {
        throw new Error('pino transport failure');
      });

      expect(() => service.rateLimitExceeded('/auth/login', '10.0.0.1')).not.toThrow();
    });

    it('test_SC017_018_find_email_accessed_swallows_logger_throw', () => {
      /** SC-017 보조: findEmailAccessed 도 동일하게 best-effort. */
      mockLogger.warn.mockImplementation(() => {
        throw new Error('pino transport failure');
      });

      expect(() => service.findEmailAccessed('01099999999', 'any@example.com')).not.toThrow();
    });
  });

  // ─────────────────────────────────────────────
  // SC-019: 로그 문자열에 비마스킹 email/phone 패턴 부재 (NFR-009)
  // ─────────────────────────────────────────────
  describe('SC-019 (v1.1.0/018 spec): 로그 payload 에 비마스킹 email/phone 정규식 매치 0건 (NFR-009)', () => {
    // 원본(비마스킹) 이메일 로컬파트 전체 노출 여부를 정규식으로 검증.
    const RAW_EMAIL_LOCAL_PATTERN = /findemail-raw-local-part-should-not-appear/;

    it('test_SC019_018_otp_verification_failed_no_raw_email_pattern', () => {
      /**
       * SC-019 (v1.1.0/018 spec): 감사 로그로 출력되는 문자열에 원본(비마스킹)
       * 이메일 패턴이 포함되지 않음을 정규식 기반으로 검증한다.
       */
      const email = 'raw-local-part-should-not-appear@example.com';

      service.otpVerificationFailed(email);

      const serialized = JSON.stringify(mockLogger.warn.mock.calls[0]);
      expect(serialized).not.toMatch(/raw-local-part-should-not-appear@example\.com/);
      expect(RAW_EMAIL_LOCAL_PATTERN.test(serialized)).toBe(false);
    });

    it('test_SC019_018_find_email_accessed_no_raw_phone_or_email_pattern', () => {
      /** SC-019 보조: findEmailAccessed 도 원본 phone/email 정규식 매치 0건. */
      const phone = '01055551234';
      const resultEmail = 'raw-phone-should-not-appear@example.com';

      service.findEmailAccessed(phone, resultEmail);

      const serialized = JSON.stringify(mockLogger.warn.mock.calls[0]);
      expect(serialized).not.toContain(phone);
      expect(serialized).not.toContain(resultEmail);
      // 원본 전체 자릿수 연속 노출(비마스킹) 여부 정규식 검증
      expect(new RegExp(phone).test(serialized)).toBe(false);
    });
  });

  // ─────────────────────────────────────────────
  // SC-012 (v1.1.0/019 spec): findEmailNotFound — WARN 1건 + phone 마스킹 (FR-008·FR-009)
  // ─────────────────────────────────────────────
  describe('SC-012 (v1.1.0/019 spec): findEmailNotFound — WARN 1건 + phone 마스킹 (FR-008·FR-009)', () => {
    it('test_SC012_019_find_email_not_found_logs_warn_with_masked_phone', () => {
      /**
       * SC-012 (v1.1.0/019 spec): find-email 미등록 전화번호(404) 감사 이벤트가
       * WARN 수준 로그로 1건 기록되고, 로그에 원본 전화번호가 아닌 `maskPhone`
       * 마스킹 결과만 포함됨을 검증한다.
       */
      const phone = '01000000000';
      const expectedMaskedPhone = maskPhone(phone);

      service.findEmailNotFound(phone);

      expect(mockLogger.warn).toHaveBeenCalledTimes(1);
      const [payload] = mockLogger.warn.mock.calls[0] as [Record<string, unknown>, string];
      expect(payload['event']).toBe('find_email_not_found');
      expect(payload['phone']).toBe(expectedMaskedPhone);
      // 원본(비마스킹) 전화번호가 payload 에 없어야 함
      expect(JSON.stringify(payload)).not.toContain(phone);
    });
  });

  // ─────────────────────────────────────────────
  // SC-013 (v1.1.0/019 spec): findEmailNotFound — 로거 예외 발생해도 메서드는 throw 하지 않음 (best-effort, FR-010)
  // ─────────────────────────────────────────────
  describe('SC-013 (v1.1.0/019 spec): findEmailNotFound — 로거 throw 해도 메서드는 throw 하지 않음 (best-effort, FR-010)', () => {
    it('test_SC013_019_find_email_not_found_swallows_logger_throw', () => {
      /**
       * SC-013 (v1.1.0/019 spec): 감사 로그 기록 로직(`PinoLogger.warn`)이 예외를
       * 던지도록 mock 하더라도 `findEmailNotFound` 자체는 throw 하지 않아야 한다
       * (best-effort, FR-010 — 내부 try/catch).
       */
      mockLogger.warn.mockImplementation(() => {
        throw new Error('pino transport failure');
      });

      expect(() => service.findEmailNotFound('01099999999')).not.toThrow();
    });
  });
});
