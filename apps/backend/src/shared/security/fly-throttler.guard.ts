import { ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import {
  InjectThrottlerOptions,
  InjectThrottlerStorage,
  ThrottlerGuard,
  ThrottlerLimitDetail,
  ThrottlerModuleOptions,
  ThrottlerStorage,
} from '@nestjs/throttler';
import { resolveClientIp } from './client-ip.util';
import { SecurityAuditLogger } from './security-audit.logger';

/**
 * Fly.io 프록시 배포 환경에서 실 클라이언트 IP 로 rate limit 을 판정하는 가드(FR-004/ADR-003).
 * 429 발생 시 보안 감사 로그를 기록한다(FR-008/ADR-008).
 */
@Injectable()
export class FlyThrottlerGuard extends ThrottlerGuard {
  constructor(
    @InjectThrottlerOptions() options: ThrottlerModuleOptions,
    @InjectThrottlerStorage() storageService: ThrottlerStorage,
    reflector: Reflector,
    private readonly securityAuditLogger: SecurityAuditLogger,
  ) {
    super(options, storageService, reflector);
  }

  protected override async getTracker(req: Record<string, unknown>): Promise<string> {
    return resolveClientIp(req);
  }

  protected override async throwThrottlingException(
    context: ExecutionContext,
    throttlerLimitDetail: ThrottlerLimitDetail,
  ): Promise<void> {
    const { req } = this.getRequestResponse(context);
    const endpoint =
      (req['route'] as { path?: string } | undefined)?.path ??
      (req['originalUrl'] as string | undefined) ??
      'unknown';
    this.securityAuditLogger.rateLimitExceeded(endpoint, throttlerLimitDetail.tracker);
    await super.throwThrottlingException(context, throttlerLimitDetail);
  }
}
