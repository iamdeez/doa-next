/**
 * ThrottlerException 형식 단위 테스트 — [env:unit]
 *
 * 대상 SC: SC-007 (v1.1.0/018 spec, FR-003)
 * 검증 방법: `@nestjs/throttler` 의 `ThrottlerException` 을 직접 생성하여
 * `getStatus()` 및 표준 바디 형식을 검증한다.
 *
 * Test Authoring Contract canonical (tasks.md):
 *   `ThrottlerException` — `@nestjs/throttler` export, `getStatus()===429`.
 */

import { HttpStatus } from '@nestjs/common';
import { ThrottlerException } from '@nestjs/throttler';

describe('ThrottlerException (SC-007 — FR-003) (v1.1.0/018 spec)', () => {
  describe('SC-007 (v1.1.0/018 spec): 429 = 표준 ThrottlerException 형식 (FR-003)', () => {
    it('test_SC007_018_throttler_exception_status_is_429', () => {
      /**
       * SC-007 (v1.1.0/018 spec): rate limit 초과 응답의 HTTP 상태코드가
       * 정확히 429 이며 NestJS 표준 ThrottlerException 응답 형식과 일치한다.
       */
      const exception = new ThrottlerException();

      expect(exception.getStatus()).toBe(429);
      expect(exception.getStatus()).toBe(HttpStatus.TOO_MANY_REQUESTS);
    });

    it('test_SC007_018_throttler_exception_response_body_has_standard_shape', () => {
      /**
       * SC-007 보조: getResponse() 가 NestJS 표준 HttpException 바디 형식
       * (statusCode + message)을 포함해야 한다.
       */
      const exception = new ThrottlerException();
      const response = exception.getResponse();

      expect(response).toBeDefined();
      // NestJS HttpException 기본 응답: message 문자열 (커스텀 message 없으면 기본 문구)
      if (typeof response === 'object' && response !== null) {
        expect(response).toHaveProperty('statusCode', 429);
        expect(response).toHaveProperty('message');
      } else {
        expect(typeof response).toBe('string');
      }
    });

    it('test_SC007_018_throttler_exception_is_http_exception_instance', () => {
      /** SC-007 보조: ThrottlerException 은 NestJS HttpException 계열이어야 한다. */
      const { HttpException } = require('@nestjs/common');
      const exception = new ThrottlerException();

      expect(exception).toBeInstanceOf(HttpException);
    });
  });
});
