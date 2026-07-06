import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerModule } from '@nestjs/throttler';
import { FlyThrottlerGuard } from './fly-throttler.guard';
import { SecurityAuditLogger } from './security-audit.logger';
import { THROTTLE_DEFAULT_LIMIT, THROTTLE_TTL_MS } from './throttle.constants';

/**
 * 공통 보안 인프라 모듈(ADR-010) — 전역 rate limit 가드 + 보안 감사 로거.
 * 4계층 도메인 모듈이 아닌 shared 인프라 모듈(P-001 — DB 미접근).
 */
@Module({
  imports: [
    ThrottlerModule.forRoot([
      { name: 'default', ttl: THROTTLE_TTL_MS, limit: THROTTLE_DEFAULT_LIMIT },
    ]),
  ],
  providers: [
    SecurityAuditLogger,
    {
      provide: APP_GUARD,
      useClass: FlyThrottlerGuard,
    },
  ],
  exports: [SecurityAuditLogger, ThrottlerModule],
})
export class SecurityModule {}
