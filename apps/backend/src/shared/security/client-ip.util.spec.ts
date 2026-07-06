/**
 * resolveClientIp 단위 테스트 — [env:unit]
 *
 * 대상 SC: SC-009 (v1.1.0/018 spec, FR-004)
 * 검증 방법: mock req(다양한 헤더 조합) → resolveClientIp(req) 직접 호출
 *
 * Test Authoring Contract canonical (tasks.md):
 *   `resolveClientIp(req): string`, 파일 `shared/security/client-ip.util.ts`,
 *   throttler 미의존 순수 함수. 우선순위: Fly-Client-IP → X-Forwarded-For 첫 항목 → req.ip.
 */

import { resolveClientIp } from './client-ip.util';

function makeReq(overrides: {
  headers?: Record<string, unknown>;
  ip?: string;
}): Record<string, unknown> {
  return {
    headers: overrides.headers ?? {},
    ip: overrides.ip,
  };
}

describe('resolveClientIp', () => {
  // ─────────────────────────────────────────────
  // SC-009: 상이 X-Forwarded-For → 상이 tracker (Edge)
  // ─────────────────────────────────────────────
  describe('SC-009 (v1.1.0/018 spec): 동일 프록시·상이 X-Forwarded-For → 상이 버킷 값 (FR-004)', () => {
    it('test_SC009_018_different_xff_headers_yield_different_tracker_values', () => {
      /**
       * SC-009 (v1.1.0/018 spec): 동일 프록시 연결에서 서로 다른 X-Forwarded-For
       * 클라이언트 IP 헤더 값으로 요청을 보내면 각각 독립적인 rate limit 버킷으로
       * 카운트된다 — resolveClientIp 반환값(tracker 문자열) 자체가 상이해야 한다.
       */
      const reqA = makeReq({ headers: { 'x-forwarded-for': '203.0.113.1' } });
      const reqB = makeReq({ headers: { 'x-forwarded-for': '203.0.113.2' } });

      const trackerA = resolveClientIp(reqA);
      const trackerB = resolveClientIp(reqB);

      expect(trackerA).toBe('203.0.113.1');
      expect(trackerB).toBe('203.0.113.2');
      expect(trackerA).not.toBe(trackerB);
    });
  });

  // ─────────────────────────────────────────────
  // 우선순위: Fly-Client-IP > X-Forwarded-For > req.ip
  // ─────────────────────────────────────────────
  describe('SC-009 보조: Fly-Client-IP 우선·XFF fallback·req.ip 최종 fallback (NFR-008)', () => {
    it('test_SC009_018_fly_client_ip_takes_priority_over_xff', () => {
      /** Fly-Client-IP 헤더가 있으면 X-Forwarded-For 보다 우선한다. */
      const req = makeReq({
        headers: {
          'fly-client-ip': '198.51.100.9',
          'x-forwarded-for': '203.0.113.1',
        },
        ip: '127.0.0.1',
      });

      expect(resolveClientIp(req)).toBe('198.51.100.9');
    });

    it('test_SC009_018_xff_fallback_when_no_fly_client_ip', () => {
      /** Fly-Client-IP 미존재 시 X-Forwarded-For 첫 항목을 사용한다. */
      const req = makeReq({
        headers: { 'x-forwarded-for': '203.0.113.5, 10.0.0.1' },
        ip: '127.0.0.1',
      });

      expect(resolveClientIp(req)).toBe('203.0.113.5');
    });

    it('test_SC009_018_req_ip_final_fallback_when_no_headers', () => {
      /** 헤더가 전혀 없으면 req.ip 로 최종 fallback 한다. */
      const req = makeReq({ headers: {}, ip: '10.10.10.10' });

      expect(resolveClientIp(req)).toBe('10.10.10.10');
    });

    it('test_SC009_018_returns_unknown_when_no_headers_and_no_req_ip', () => {
      /** 헤더·req.ip 모두 없으면 'unknown' 을 반환한다(undefined 반환 금지). */
      const req = makeReq({ headers: {} });

      expect(resolveClientIp(req)).toBe('unknown');
    });
  });

  // ─────────────────────────────────────────────
  // 배열 방어 케이스 (Edge)
  // ─────────────────────────────────────────────
  describe('SC-009 보조: 헤더 배열 값 방어 (다중 헤더 파싱 엣지케이스)', () => {
    it('test_SC009_018_array_fly_client_ip_uses_first_element', () => {
      /** Fly-Client-IP 가 배열로 전달되는 경우 첫 요소를 사용한다. */
      const req = makeReq({ headers: { 'fly-client-ip': ['198.51.100.20', '198.51.100.21'] } });

      expect(resolveClientIp(req)).toBe('198.51.100.20');
    });

    it('test_SC009_018_array_xff_uses_first_element', () => {
      /** X-Forwarded-For 가 배열로 전달되는 경우 첫 요소를 사용한다. */
      const req = makeReq({ headers: { 'x-forwarded-for': ['203.0.113.30', '203.0.113.31'] } });

      expect(resolveClientIp(req)).toBe('203.0.113.30');
    });

    it('test_SC009_018_empty_string_headers_fall_through_to_req_ip', () => {
      /** 빈 문자열 헤더는 무시하고 다음 우선순위로 진행한다. */
      const req = makeReq({
        headers: { 'fly-client-ip': '', 'x-forwarded-for': '   ' },
        ip: '172.16.0.1',
      });

      expect(resolveClientIp(req)).toBe('172.16.0.1');
    });
  });
});
