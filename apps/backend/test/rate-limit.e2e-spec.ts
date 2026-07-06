/**
 * Rate limit API 통합 테스트 — [env:integration]
 *
 * 대상 SC: SC-001·002·003·004·005·006 (v1.1.0/018 spec)
 * 검증 방법: `Test.createTestingModule({imports:[AppModule]})` 독립 앱 + supertest.
 *
 * 실행 전제 (옵션 A — plan.md §통합/운영 검증 defer 처리 확정):
 *   1. `docker compose up -d` (PostgreSQL 16)
 *   2. `pnpm --filter backend exec prisma migrate dev`
 *   3. `.env` 파일 환경변수 설정
 *   4. 본 테스트 실행: `pnpm --filter backend test:e2e`
 *
 * 격리 전략(research.md "엣지 케이스 및 한계" 참조):
 *   - 각 jest e2e 파일은 독립 Nest 앱(신규 인-메모리 throttler 스토리지)으로 기동되어
 *     파일 간 카운터가 격리된다.
 *   - 라우트별로 고유한 `X-Forwarded-For` 헤더를 사용해 다른 SC 테스트와 버킷을 분리한다
 *     (동일 IP·서로 다른 라우트는 handler 단위로 이미 격리되지만, 회귀 방어 목적으로
 *     명시적으로 SC 별 고유 IP 를 부여한다).
 *   - `main.ts` 와 동일하게 `app.set('trust proxy', 1)` 을 적용한다(SC-008 대상 설정 재현).
 *
 * 주의: `resolveClientIp` 는 req.ip 가 아닌 원 헤더(`x-forwarded-for`)를 직접 읽으므로,
 * 가드가 인지하는 요청 수는 컨트롤러 진입(DTO 검증) 이전 시점에 결정된다 — 각 요청의
 * 바디 유효성과 무관하게 guard 의 카운트가 먼저 수행되므로, N-1 번째까지의 응답 상태는
 * 단언하지 않고 N 번째(임계 초과) 응답만 429 로 단언한다.
 */

import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { NestExpressApplication } from '@nestjs/platform-express';
import * as request from 'supertest';

// AppModule: apps/backend/src/app.module.ts (구현 완료 시 존재)
import { AppModule } from '../src/app.module';

// ─────────────────────────────────────────────
// 헬퍼: 지정 횟수만큼 순차 요청 후 마지막 응답 반환
// ─────────────────────────────────────────────
async function fireSequential(
  app: INestApplication,
  count: number,
  buildRequest: (index: number) => request.Test,
): Promise<request.Response> {
  let lastResponse: request.Response | undefined;
  for (let i = 0; i < count; i++) {
    lastResponse = await buildRequest(i);
  }
  if (!lastResponse) {
    throw new Error('fireSequential: count must be >= 1');
  }
  return lastResponse;
}

describe('Rate limit (e2e)', () => {
  let app: NestExpressApplication;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication<NestExpressApplication>();
    // main.ts 와 동일 설정 재현(SC-008 대상 — trust proxy).
    app.set('trust proxy', 1);
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  // ─────────────────────────────────────────────
  // SC-001: 전역 기본값 라우트(/auth/login) 21번째 → 429
  // ─────────────────────────────────────────────
  describe('SC-001 (v1.1.0/018 spec): /auth/login 21회째 요청 → 429 (FR-001·NFR-001)', () => {
    it('test_SC001_018_login_21st_request_returns_429', async () => {
      /**
       * SC-001 (v1.1.0/018 spec): 전역 기본값만 적용되는 라우트(개별 override 없는
       * 엔드포인트, 예: POST /auth/login)에 동일 클라이언트 IP 로 60초 이내 21번째
       * 요청 시 429 를 반환한다.
       */
      const xff = '203.18.1.1';

      const finalResponse = await fireSequential(app, 21, (i) =>
        request(app.getHttpServer())
          .post('/auth/login')
          .set('X-Forwarded-For', xff)
          .send({ email: `sc001-${i}@example.com`, password: 'anyPassword123!' }),
      );

      expect(finalResponse.status).toBe(429);
    }, 30000);
  });

  // ─────────────────────────────────────────────
  // SC-002: /auth/social-login 11번째 → 429
  // ─────────────────────────────────────────────
  describe('SC-002 (v1.1.0/018 spec): /auth/social-login 11회째 요청 → 429 (FR-002·NFR-002)', () => {
    it('test_SC002_018_social_login_11th_request_returns_429', async () => {
      /**
       * SC-002 (v1.1.0/018 spec): POST /auth/social-login 에 동일 클라이언트 IP 로
       * 60초 이내 11번째 요청 시 429 를 반환한다.
       */
      const xff = '203.18.2.1';

      const finalResponse = await fireSequential(app, 11, () =>
        request(app.getHttpServer())
          .post('/auth/social-login')
          .set('X-Forwarded-For', xff)
          .send({ provider: 'kakao', token: 'dummy-token' }),
      );

      expect(finalResponse.status).toBe(429);
    }, 30000);
  });

  // ─────────────────────────────────────────────
  // SC-003: /auth/naver/state 21번째 → 429
  // ─────────────────────────────────────────────
  describe('SC-003 (v1.1.0/018 spec): /auth/naver/state 21회째 요청 → 429 (FR-002·NFR-003)', () => {
    it('test_SC003_018_naver_state_21st_request_returns_429', async () => {
      /**
       * SC-003 (v1.1.0/018 spec): POST /auth/naver/state 에 동일 클라이언트 IP 로
       * 60초 이내 21번째 요청 시 429 를 반환한다.
       */
      const xff = '203.18.3.1';

      const finalResponse = await fireSequential(app, 21, () =>
        request(app.getHttpServer()).post('/auth/naver/state').set('X-Forwarded-For', xff).send(),
      );

      expect(finalResponse.status).toBe(429);
    }, 30000);
  });

  // ─────────────────────────────────────────────
  // SC-004: /auth/forgot-password 상이 email·동일 IP 6번째 → 429
  // ─────────────────────────────────────────────
  describe('SC-004 (v1.1.0/018 spec): /auth/forgot-password 상이 email·동일 IP 6회째 → 429 (FR-002·NFR-004)', () => {
    it('test_SC004_018_forgot_password_6th_request_different_emails_returns_429', async () => {
      /**
       * SC-004 (v1.1.0/018 spec): POST /auth/forgot-password 에 서로 다른 이메일을
       * 대상으로 하더라도 동일 클라이언트 IP 로 60초 이내 6번째 요청 시 429 를
       * 반환한다(기존 per-email 60초 제한과 독립적으로 IP 레벨에서 차단됨을 검증).
       */
      const xff = '203.18.4.1';

      const finalResponse = await fireSequential(app, 6, (i) =>
        request(app.getHttpServer())
          .post('/auth/forgot-password')
          .set('X-Forwarded-For', xff)
          .send({ email: `sc004-distinct-${i}@example.com` }),
      );

      expect(finalResponse.status).toBe(429);
    }, 30000);
  });

  // ─────────────────────────────────────────────
  // SC-005: /auth/find-email 6번째 → 429
  // ─────────────────────────────────────────────
  describe('SC-005 (v1.1.0/018 spec): /auth/find-email 6회째 요청 → 429 (FR-002·NFR-005)', () => {
    it('test_SC005_018_find_email_6th_request_returns_429', async () => {
      /**
       * SC-005 (v1.1.0/018 spec): POST /auth/find-email 에 동일 클라이언트 IP 로
       * 60초 이내 6번째 요청 시 429 를 반환한다.
       */
      const xff = '203.18.5.1';

      const finalResponse = await fireSequential(app, 6, () =>
        request(app.getHttpServer())
          .post('/auth/find-email')
          .set('X-Forwarded-For', xff)
          .send({ phone: '01099998888' }),
      );

      expect(finalResponse.status).toBe(429);
    }, 30000);
  });

  // ─────────────────────────────────────────────
  // SC-006: /auth/reset-password 11번째 → 429
  // ─────────────────────────────────────────────
  describe('SC-006 (v1.1.0/018 spec): /auth/reset-password 11회째 요청 → 429 (FR-002·NFR-006)', () => {
    it('test_SC006_018_reset_password_11th_request_returns_429', async () => {
      /**
       * SC-006 (v1.1.0/018 spec): POST /auth/reset-password 에 동일 클라이언트 IP 로
       * 60초 이내 11번째 요청 시 429 를 반환한다.
       */
      const xff = '203.18.6.1';

      const finalResponse = await fireSequential(app, 11, () =>
        request(app.getHttpServer())
          .post('/auth/reset-password')
          .set('X-Forwarded-For', xff)
          .send({ email: 'sc006@example.com', otp: '000000', newPassword: 'ArbitraryPass1!' }),
      );

      expect(finalResponse.status).toBe(429);
    }, 30000);
  });
});
