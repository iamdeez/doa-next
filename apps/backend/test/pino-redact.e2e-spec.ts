/**
 * pino HTTP 로그 redact 통합 테스트 — [env:integration] (v1.1.0/019 spec)
 *
 * 대상 SC: SC-014 (FR-011, Authorization 헤더), SC-015 (FR-012, Cookie 헤더)
 * 검증 방법 (GAP-019-01 canonical, research.md "테스트 하네스 조사" 참조):
 *   요청 처리 구간에 한해 `process.stdout.write` 를 spy 로 가로채, Authorization·Cookie
 *   헤더를 포함한 경량 요청(`GET /health`)을 보낸 뒤 캡처된 라인에서
 *   (a) `[Redacted]` 마커 존재, (b) 원본 토큰/쿠키 문자열 부재를 단언한다.
 *   `setup-env.js` 가 `NODE_ENV=production` 을 강제하므로 `app.module.ts` 의
 *   `pino-pretty` transport 분기가 비활성화되어 JSON 라인으로 기록된다 — 포맷 무관하게
 *   `[Redacted]` 토큰 존재 여부만 단언한다(research.md 지침).
 *
 * 격리(research.md "엣지 케이스 및 한계"): 전역 `process.stdout.write` 를 건드리므로
 *   각 테스트가 자체 `try/finally` 로 즉시 원복한다. 각 e2e 파일은 독립 jest worker
 *   프로세스로 실행되어 다른 파일과 전역 상태 간섭이 없다.
 *
 * 실행 전제:
 *   1. docker compose up -d (PostgreSQL 16)
 *   2. pnpm --filter backend exec prisma migrate dev
 *   3. .env 환경변수 설정 (DATABASE_URL, JWT_ACCESS_SECRET)
 *   4. pnpm --filter backend test:e2e -- pino-redact
 */

import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import * as request from 'supertest';

// AppModule: apps/backend/src/app.module.ts
import { AppModule } from '../src/app.module';

const FAKE_ACCESS_TOKEN = 'redact-test-secret-token-should-not-appear-019';
const FAKE_COOKIE_VALUE = 'session=redact-test-cookie-should-not-appear-019';

function isEnvReady(): boolean {
  return !!(process.env.DATABASE_URL && process.env.JWT_ACCESS_SECRET);
}

/**
 * 요청 구간 한정 stdout 캡처. 반드시 `restore()` 로 원본 `stdout.write` 를
 * 복원해야 한다(전역 상태 오염 방지 — research.md 격리 원칙).
 */
function captureStdout(): { restore: () => void; lines: () => string[] } {
  const chunks: string[] = [];
  const original = process.stdout.write.bind(process.stdout);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (process.stdout as any).write = (chunk: any, ...args: any[]): boolean => {
    chunks.push(typeof chunk === 'string' ? chunk : chunk.toString('utf-8'));
    return original(chunk, ...args);
  };
  return {
    restore: () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (process.stdout as any).write = original;
    },
    lines: () => chunks.join('').split('\n').filter((l) => l.length > 0),
  };
}

describe('SC-014/015: HTTP 요청 로그 Authorization/Cookie 헤더 redact', () => {
  let app: INestApplication;

  beforeAll(async () => {
    if (!isEnvReady()) return;

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    if (!app) return;
    await app.close();
  });

  function skipIfEnvNotReady(): boolean {
    if (!isEnvReady() || !app) {
      console.warn(
        'SC-014/015 SKIP: DATABASE_URL/JWT_ACCESS_SECRET 미설정.\n' +
          '  docker compose up -d && pnpm --filter backend exec prisma migrate dev\n' +
          '  DATABASE_URL=... JWT_ACCESS_SECRET=... pnpm --filter backend test:e2e -- pino-redact',
      );
      return true;
    }
    return false;
  }

  describe('SC-014 (FR-011): Authorization 헤더 redact', () => {
    it('test_SC014_authorization_header_redacted_in_pino_log', async () => {
      if (skipIfEnvNotReady()) return;

      const capture = captureStdout();
      try {
        await request(app.getHttpServer())
          .get('/health')
          .set('Authorization', `Bearer ${FAKE_ACCESS_TOKEN}`);
      } finally {
        capture.restore();
      }

      const lines = capture.lines();

      // (a) redact 마커 존재
      expect(lines.some((l) => l.includes('[Redacted]'))).toBe(true);
      // (b) 원본 토큰 값 부재
      expect(lines.some((l) => l.includes(FAKE_ACCESS_TOKEN))).toBe(false);
    });
  });

  describe('SC-015 (FR-012): Cookie 헤더 redact', () => {
    it('test_SC015_cookie_header_redacted_in_pino_log', async () => {
      if (skipIfEnvNotReady()) return;

      const capture = captureStdout();
      try {
        await request(app.getHttpServer()).get('/health').set('Cookie', FAKE_COOKIE_VALUE);
      } finally {
        capture.restore();
      }

      const lines = capture.lines();

      // (a) redact 마커 존재
      expect(lines.some((l) => l.includes('[Redacted]'))).toBe(true);
      // (b) 원본 쿠키 값 부재
      expect(lines.some((l) => l.includes(FAKE_COOKIE_VALUE))).toBe(false);
    });
  });
});
