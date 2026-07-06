import { Injectable } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { maskEmail, maskPhone } from '../../modules/auth/auth.util';

/**
 * 보안 감사 로그(FR-007·008·009·010). WARN 수준 구조적 로그(event 필드 기반).
 * 전 메서드 best-effort — 로깅 실패가 원 요청 처리 흐름을 차단하지 않는다(FR-010).
 */
@Injectable()
export class SecurityAuditLogger {
  constructor(private readonly logger: PinoLogger) {
    this.logger.setContext('SecurityAudit');
  }

  /** OTP 검증 실패 이벤트(FR-007/SC-014). */
  otpVerificationFailed(email: string): void {
    try {
      this.logger.warn(
        { event: 'otp_verification_failed', email: maskEmail(email) },
        'OTP verification failed',
      );
    } catch {
      /* best-effort: 로깅 실패가 원 흐름 차단 금지 */
    }
  }

  /** rate limit 위반(429) 이벤트(FR-008/SC-015). */
  rateLimitExceeded(endpoint: string, ip: string): void {
    try {
      this.logger.warn({ event: 'rate_limit_exceeded', endpoint, ip }, 'Rate limit exceeded');
    } catch {
      /* best-effort: 로깅 실패가 원 흐름 차단 금지 */
    }
  }

  /** find-email PII 조회 이벤트(FR-009/SC-016). */
  findEmailAccessed(phone: string, resultEmail: string): void {
    try {
      this.logger.warn(
        { event: 'find_email_access', phone: maskPhone(phone), email: maskEmail(resultEmail) },
        'find-email accessed',
      );
    } catch {
      /* best-effort: 로깅 실패가 원 흐름 차단 금지 */
    }
  }

  /** find-email 미등록 전화번호 조회(404) 이벤트 — enumeration 탐지(FR-008/009). */
  findEmailNotFound(phone: string): void {
    try {
      this.logger.warn(
        { event: 'find_email_not_found', phone: maskPhone(phone) },
        'find-email not found',
      );
    } catch {
      /* best-effort: 로깅 실패가 원 흐름 차단 금지 */
    }
  }
}
