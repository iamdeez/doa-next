/**
 * 실 클라이언트 IP 를 해석한다(FR-004/NFR-008).
 * 우선순위: Fly-Client-IP 헤더 → X-Forwarded-For 첫 항목 → req.ip.
 * throttler 라이브러리에 미의존하는 순수 함수 — @nestjs/throttler 의 getTracker
 * 시그니처 변동 리스크를 흡수하는 테스트 seam(research.md "설계 흡수 전략").
 */
export function resolveClientIp(req: Record<string, unknown>): string {
  const headers = (req['headers'] ?? {}) as Record<string, unknown>;

  const flyClientIp = headers['fly-client-ip'];
  const flyClientIpValue = Array.isArray(flyClientIp) ? flyClientIp[0] : flyClientIp;
  if (typeof flyClientIpValue === 'string' && flyClientIpValue.trim().length > 0) {
    return flyClientIpValue.trim();
  }

  const forwardedFor = headers['x-forwarded-for'];
  const forwardedForValue = Array.isArray(forwardedFor) ? forwardedFor[0] : forwardedFor;
  if (typeof forwardedForValue === 'string' && forwardedForValue.trim().length > 0) {
    const first = forwardedForValue.split(',')[0]?.trim();
    if (first) {
      return first;
    }
  }

  const reqIp = req['ip'];
  if (typeof reqIp === 'string' && reqIp.trim().length > 0) {
    return reqIp;
  }

  return 'unknown';
}
