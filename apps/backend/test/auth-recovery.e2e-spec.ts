/**
 * Auth 계정복구 API e2e 테스트 — [env:integration]
 *
 * 대상 SC: SC-015, SC-016, SC-017, SC-018, SC-020, SC-022, SC-023
 * 검증 방법: NestJS TestingModule + supertest + PrismaClient + StubMailer
 *
 * 실행 전제:
 *   1. docker compose up -d (PostgreSQL 16)
 *   2. pnpm --filter backend exec prisma migrate dev
 *   3. .env 파일 환경변수 설정 (DATABASE_URL, JWT_ACCESS_SECRET, JWT_REFRESH_SECRET)
 *   4. 실행: pnpm --filter backend test:e2e -- --testPathPattern=auth-recovery
 *
 * StubMailer:
 *   - NODE_ENV=test 또는 MAIL_DRIVER=stub 으로 SmtpMailer 대신 StubMailer 주입.
 *   - StubMailer.lastSent: { to: string; otp: string } | null 으로 발송 OTP 캡처.
 *
 * 주의 (AUTHORING — TDD Red):
 *   - 신규 라우트·MailerPort·StubMailer 미구현 → import error 허용.
 *   - 구현 완료 후 Green.
 */

import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import * as request from 'supertest';

// AppModule: apps/backend/src/app.module.ts (구현 완료 시 존재)
import { AppModule } from '../src/app.module';
// PrismaService
import { PrismaService } from '../src/shared/prisma/prisma.service';
// StubMailer: apps/backend/src/infrastructure/mail/stub.mailer.ts
import { StubMailer } from '../src/infrastructure/mail/stub.mailer';
// MailerPort DI 토큰
import { MailerPort } from '../src/infrastructure/mail/mailer.port';

// ─────────────────────────────────────────────
// 테스트용 픽스처
// ─────────────────────────────────────────────
const TEST_USER = {
  email: `test-recovery-e2e-${Date.now()}@example.com`,
  password: 'TestPassword123!',
  phone: `010${Math.floor(10000000 + Math.random() * 90000000)}`,
};

// ─────────────────────────────────────────────
// 헬퍼
// ─────────────────────────────────────────────

/** expiresAt을 과거로 설정한 OTP 레코드 seed — SC-018 만료 테스트용 */
async function seedExpiredOtp(
  prisma: PrismaService,
  email: string,
): Promise<void> {
  const crypto = require('crypto');
  const dummyHash = crypto.createHash('sha256').update('000000').digest('hex');
  await prisma.passwordResetOtp.create({
    data: {
      email,
      otpHash: dummyHash,
      expiresAt: new Date(Date.now() - 1000), // 이미 만료
      consumedAt: null,
    },
  });
}

// ─────────────────────────────────────────────
// 테스트 스위트
// ─────────────────────────────────────────────
describe('Auth Recovery API (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let stubMailer: StubMailer;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(MailerPort)
      .useClass(StubMailer)
      .compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }),
    );
    await app.init();

    prisma = moduleFixture.get<PrismaService>(PrismaService);
    stubMailer = moduleFixture.get<StubMailer>(MailerPort);

    // 테스트 사용자 등록 (직접 DB insert — 비밀번호 bcrypt hash)
    const bcrypt = require('bcrypt');
    const hashedPw = await bcrypt.hash(TEST_USER.password, 10);
    await prisma.user.upsert({
      where: { email: TEST_USER.email },
      update: { phone: TEST_USER.phone },
      create: {
        email: TEST_USER.email,
        password: hashedPw,
        phone: TEST_USER.phone,
        name: 'E2E Test User',
      },
    });
  });

  afterAll(async () => {
    // 정리: 테스트 사용자·OTP 삭제
    await prisma.passwordResetOtp.deleteMany({ where: { email: TEST_USER.email } });
    await prisma.user.deleteMany({ where: { email: TEST_USER.email } });
    await app.close();
  });

  beforeEach(() => {
    stubMailer.lastSent = null;
  });

  // ─────────────────────────────────────────────
  // SC-015: forgot-password 가입 이메일 → 200
  // ─────────────────────────────────────────────
  describe('SC-015: POST /auth/forgot-password — 가입 이메일 200 (FR-011)', () => {
    it('test_forgot_registered_returns_200', async () => {
      /**
       * SC-015 Happy Path:
       * 등록된 이메일로 POST /auth/forgot-password → 200.
       * StubMailer.lastSent 에 OTP 캡처 확인.
       */
      // 이전 OTP 제거 (rate-limit 회피)
      await prisma.passwordResetOtp.deleteMany({ where: { email: TEST_USER.email } });

      const res = await request(app.getHttpServer())
        .post('/auth/forgot-password')
        .send({ email: TEST_USER.email })
        .expect(200);

      expect(res.body).toBeDefined();
      // StubMailer 발송 확인
      expect(stubMailer.lastSent).not.toBeNull();
      expect(stubMailer.lastSent?.to).toBe(TEST_USER.email);
      expect(stubMailer.lastSent?.otp).toMatch(/^\d{6}$/);

      // OTP DB 생성 확인
      const otps = await prisma.passwordResetOtp.findMany({
        where: { email: TEST_USER.email },
        orderBy: { createdAt: 'desc' },
      });
      expect(otps.length).toBeGreaterThanOrEqual(1);
    });
  });

  // ─────────────────────────────────────────────
  // SC-016: forgot-password 미가입 이메일 → 404
  // ─────────────────────────────────────────────
  describe('SC-016: POST /auth/forgot-password — 미가입 이메일 4xx (FR-011)', () => {
    it('test_forgot_unregistered_returns_404', async () => {
      /**
       * SC-016 Error Case:
       * 미가입 이메일 → 404 Not Found.
       */
      await request(app.getHttpServer())
        .post('/auth/forgot-password')
        .send({ email: `notexist-${Date.now()}@example.com` })
        .expect(404);

      expect(stubMailer.lastSent).toBeNull();
    });
  });

  // ─────────────────────────────────────────────
  // SC-020: 1분 이내 2회 요청 → 429
  // ─────────────────────────────────────────────
  describe('SC-020: POST /auth/forgot-password — 1분 이내 2회 → 429 (NFR-003)', () => {
    it('test_forgot_twice_returns_429', async () => {
      /**
       * SC-020 Error Case (NFR-003):
       * 동일 이메일 1분 이내 2회 요청 시 2회차 → 429 TooManyRequests.
       */
      // 이전 OTP 제거
      await prisma.passwordResetOtp.deleteMany({ where: { email: TEST_USER.email } });

      // 1회차 → 200
      await request(app.getHttpServer())
        .post('/auth/forgot-password')
        .send({ email: TEST_USER.email })
        .expect(200);

      // 2회차 (1분 이내) → 429
      await request(app.getHttpServer())
        .post('/auth/forgot-password')
        .send({ email: TEST_USER.email })
        .expect(429);
    });
  });

  // ─────────────────────────────────────────────
  // SC-017: reset-password 유효 OTP → 200
  // ─────────────────────────────────────────────
  describe('SC-017: POST /auth/reset-password — 유효 OTP 비밀번호 변경 (FR-012)', () => {
    it('test_reset_valid_otp_changes_password', async () => {
      /**
       * SC-017 Happy Path:
       * 유효 OTP·이메일·새 비밀번호 → 200 + OTP consumed.
       */
      // 이전 OTP 제거 후 새 OTP 발급
      await prisma.passwordResetOtp.deleteMany({ where: { email: TEST_USER.email } });

      await request(app.getHttpServer())
        .post('/auth/forgot-password')
        .send({ email: TEST_USER.email })
        .expect(200);

      const sentOtp = stubMailer.lastSent?.otp;
      expect(sentOtp).toBeDefined();

      const newPassword = 'NewPassword456!';
      await request(app.getHttpServer())
        .post('/auth/reset-password')
        .send({ email: TEST_USER.email, otp: sentOtp, newPassword })
        .expect(200);

      // OTP consumed 확인
      const otp = await prisma.passwordResetOtp.findFirst({
        where: { email: TEST_USER.email },
        orderBy: { createdAt: 'desc' },
      });
      expect(otp?.consumedAt).not.toBeNull();

      // 변경된 비밀번호로 로그인 가능 확인
      await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: TEST_USER.email, password: newPassword })
        .expect(200);

      // 복원: 원래 비밀번호로 되돌리기 (다른 테스트 격리)
      // 소비된 OTP 가 60s 이내 createdAt 으로 잔존하면 rate limit(429) 발생 — [B] 수정
      await prisma.passwordResetOtp.deleteMany({ where: { email: TEST_USER.email } });
      await request(app.getHttpServer())
        .post('/auth/forgot-password')
        .send({ email: TEST_USER.email })
        .expect(200);

      const restoreOtp = stubMailer.lastSent?.otp;
      if (restoreOtp) {
        await request(app.getHttpServer())
          .post('/auth/reset-password')
          .send({ email: TEST_USER.email, otp: restoreOtp, newPassword: TEST_USER.password })
          .expect(200);
      }
    });
  });

  // ─────────────────────────────────────────────
  // SC-018: 만료 OTP → 400
  // ─────────────────────────────────────────────
  describe('SC-018: POST /auth/reset-password — 만료 OTP (NFR-002)', () => {
    it('test_reset_expired_otp_rejected', async () => {
      /**
       * SC-018 Edge/Error Case (NFR-002):
       * expiresAt 과거인 OTP seed → 400(4xx).
       */
      await prisma.passwordResetOtp.deleteMany({ where: { email: TEST_USER.email } });
      await seedExpiredOtp(prisma, TEST_USER.email);

      await request(app.getHttpServer())
        .post('/auth/reset-password')
        .send({ email: TEST_USER.email, otp: '000000', newPassword: 'AnyPass123!' })
        .expect(400);
    });
  });

  // ─────────────────────────────────────────────
  // SC-022: find-email 등록 phone → 마스킹 이메일
  // ─────────────────────────────────────────────
  describe('SC-022: POST /auth/find-email — 마스킹 이메일 반환 (FR-015)', () => {
    it('test_find_email_returns_masked', async () => {
      /**
       * SC-022 Happy Path:
       * 등록된 전화번호 → 200 + { email: 마스킹 }.
       * NFR-004: 앞 2자 + ** + @ + 도메인 형태.
       */
      const res = await request(app.getHttpServer())
        .post('/auth/find-email')
        .send({ phone: TEST_USER.phone })
        .expect(200);

      expect(res.body).toHaveProperty('email');
      const maskedEmail: string = res.body.email;
      // 마스킹 형태 확인: te**@example.com 패턴
      expect(maskedEmail).toMatch(/^.{1,2}\*\*@.+$/);
    });
  });

  // ─────────────────────────────────────────────
  // SC-023: find-email 미등록 phone → 404
  // ─────────────────────────────────────────────
  describe('SC-023: POST /auth/find-email — 미등록 phone 404 (FR-015)', () => {
    it('test_find_email_unregistered_404', async () => {
      /**
       * SC-023 Error Case:
       * 미등록 전화번호 → 404 Not Found.
       */
      await request(app.getHttpServer())
        .post('/auth/find-email')
        .send({ phone: '01000000000' })
        .expect(404);
    });
  });
});
