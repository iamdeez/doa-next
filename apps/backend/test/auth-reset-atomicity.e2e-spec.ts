/**
 * resetPassword 원자성(revoke 실패 → 비밀번호 롤백) e2e 테스트 — [env:integration]
 *
 * 대상 SC: SC-013 (v1.1.0/018 spec, FR-006)
 * 검증 방법: 실 PostgreSQL + NestJS TestingModule + supertest + PrismaClient.
 *
 * 실행 전제 (옵션 A — plan.md §통합/운영 검증 defer 처리 확정):
 *   1. docker compose up -d (PostgreSQL 16)
 *   2. pnpm --filter backend exec prisma migrate dev
 *   3. .env 파일 환경변수 설정
 *   4. 실행: pnpm --filter backend test:e2e -- --testPathPattern=auth-reset-atomicity
 *
 * PROC-013-01(tasks.md): 단위 mock 은 tx/root 분기를 은폐할 수 있어(mockPrismaService.
 * runInTransaction 이 콜백을 그대로 실행) 실 트랜잭션 롤백은 e2e 로만 검증 가능하다.
 * `AuthRepository.revokeAllRefreshTokensByUser` 를 실패하도록 강제하여,
 * `resetPassword()` 내부 `runInTransaction` 콜백이 markOtpConsumed(비밀번호 변경 포함)
 * 까지 함께 롤백하는지 — 재설정 **이전** 비밀번호로 로그인 가능한지로 검증한다.
 */

import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import * as request from 'supertest';
import { createHash } from 'node:crypto';

// AppModule: apps/backend/src/app.module.ts (구현 완료 시 존재)
import { AppModule } from '../src/app.module';
// PrismaService
import { PrismaService } from '../src/shared/prisma/prisma.service';
// AuthRepository: revokeAllRefreshTokensByUser 강제 실패 대상
import { AuthRepository } from '../src/modules/auth/auth.repository';

// ─────────────────────────────────────────────
// 테스트용 픽스처
// ─────────────────────────────────────────────
const TEST_USER = {
  email: `test-reset-atomicity-e2e-${Date.now()}@example.com`,
  oldPassword: 'OldPassword123!',
  newPassword: 'NewPassword456!',
};

const PLAIN_OTP = '654321';

describe('Auth resetPassword 원자성 (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let authRepository: AuthRepository;
  let revokeSpy: jest.SpyInstance;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }));
    await app.init();

    prisma = moduleFixture.get<PrismaService>(PrismaService);
    authRepository = moduleFixture.get<AuthRepository>(AuthRepository);

    // 테스트 사용자 seed — 기존(재설정 이전) 비밀번호로 로그인 가능해야 함
    const bcrypt = require('bcrypt');
    const hashedOldPassword = await bcrypt.hash(TEST_USER.oldPassword, 10);
    await prisma.user.upsert({
      where: { email: TEST_USER.email },
      update: { password: hashedOldPassword },
      create: {
        email: TEST_USER.email,
        password: hashedOldPassword,
        name: 'E2E Reset Atomicity User',
      },
    });

    // 유효 OTP seed — resetPassword() 의 hashToken(sha256) 과 동일 알고리즘
    const otpHash = createHash('sha256').update(PLAIN_OTP).digest('hex');
    await prisma.passwordResetOtp.create({
      data: {
        email: TEST_USER.email,
        otpHash,
        expiresAt: new Date(Date.now() + 10 * 60 * 1000), // 10분 후 만료
        consumedAt: null,
      },
    });
  });

  afterAll(async () => {
    // 정리: 테스트 사용자·OTP·refreshToken 삭제
    await prisma.passwordResetOtp.deleteMany({ where: { email: TEST_USER.email } });
    await prisma.refreshToken.deleteMany({ where: { user: { email: TEST_USER.email } } });
    await prisma.user.deleteMany({ where: { email: TEST_USER.email } });
    await app.close();
  });

  afterEach(() => {
    revokeSpy?.mockRestore();
  });

  // ─────────────────────────────────────────────
  // SC-013: revokeAllRefreshTokensByUser 실패 → 비밀번호도 함께 롤백
  // ─────────────────────────────────────────────
  describe('SC-013 (v1.1.0/018 spec): revoke 실패 시 비밀번호 변경도 롤백 (FR-006)', () => {
    it('test_SC013_018_revoke_failure_rolls_back_password_change', async () => {
      /**
       * SC-013 (v1.1.0/018 spec): revokeAllRefreshTokensByUser 가 실패하도록
       * 강제하면 비밀번호 변경도 함께 롤백되어, 재설정 이전 비밀번호로 로그인
       * 가능한 상태가 유지된다.
       */
      // 사전 확인: 기존 비밀번호로 로그인 가능한 baseline 확립
      const baselineLogin = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: TEST_USER.email, password: TEST_USER.oldPassword });
      expect(baselineLogin.status).toBe(200);

      // revokeAllRefreshTokensByUser 강제 실패
      revokeSpy = jest
        .spyOn(authRepository, 'revokeAllRefreshTokensByUser')
        .mockRejectedValue(new Error('forced revoke failure (SC-013 e2e)'));

      // 비밀번호 재설정 시도 — revoke 실패로 트랜잭션 전체 롤백되어야 함
      const resetResponse = await request(app.getHttpServer())
        .post('/auth/reset-password')
        .send({
          email: TEST_USER.email,
          otp: PLAIN_OTP,
          newPassword: TEST_USER.newPassword,
        });

      // resetPassword() 는 revoke 실패를 catch 하지 않으므로 원 요청이 실패해야 한다
      expect(resetResponse.status).toBeGreaterThanOrEqual(400);

      // 롤백 검증: 재설정 "이전" 비밀번호로 로그인 성공
      const loginWithOldPassword = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: TEST_USER.email, password: TEST_USER.oldPassword });
      expect(loginWithOldPassword.status).toBe(200);

      // 재설정 "이후" 비밀번호로는 로그인 실패해야 함(커밋되지 않았음을 재확인)
      const loginWithNewPassword = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: TEST_USER.email, password: TEST_USER.newPassword });
      expect(loginWithNewPassword.status).toBe(401);
    }, 30000);
  });
});
