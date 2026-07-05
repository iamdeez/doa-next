/**
 * AuthService 단위 테스트 — [env:unit]
 *
 * 대상 SC: SC-001, SC-002(보조), SC-004(name 필드), SC-010, SC-013, SC-014, SC-016, SC-017
 *          + SC-015~018·SC-020(forgotPassword), SC-017~018(resetPassword), SC-022~023(findEmail)
 *          [013-flutter-customer-phase2 확장]
 * 검증 방법: Jest mock (AuthRepository·JwtService·ConfigService·bcrypt·MailerPort)
 *
 * 주의 (PROC-001 — TS 버전):
 *   - mock 객체의 필드 값은 실제 타입에 맞게 설정한다.
 *   - bcrypt.compare 는 jest.spyOn 으로 module-level mock 처리.
 *   - signAsync 호출 인자(expiresIn)를 정확히 검증한다.
 *   - getProfile isAdmin 테스트 시 process.env['ADMIN_USER_IDS'] 를 설정·복원한다.
 *   - MailerPort mock: sendOtpEmail 부수효과 검증용.
 *
 * [§F 마이그레이션, v1.1.0/018 spec — SC-012·014·016·017·020] AuthService 생성자에
 * PrismaService·SecurityAuditLogger 2개 인자가 추가되어(총 6인자) DI mock 을 등록한다.
 * `runInTransaction: jest.fn(async (fn) => fn())` 로 콜백을 실제 실행하여 resetPassword
 * 내부 두 repo 호출이 기존과 동일하게 유지되도록 한다(Test Authoring Contract canonical).
 * SC-012(동일 tx 경계)·SC-014(OTP 실패 감사로그)·SC-016(find-email 감사로그)·
 * SC-017(best-effort 원 응답 불변)은 파일 하단에 신규 추가한다.
 */

import { Test, TestingModule } from '@nestjs/testing';
import {
  ConflictException,
  HttpException,
  HttpStatus,
  NotFoundException,
  BadRequestException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { PinoLogger } from 'nestjs-pino';
import * as bcrypt from 'bcrypt';

import { AuthService } from './auth.service';
import { AuthRepository } from './auth.repository';
// MailerPort: apps/backend/src/infrastructure/mail/mailer.port.ts (구현 완료 시 존재)
import { MailerPort } from '../../infrastructure/mail/mailer.port';
import { PrismaService } from '../../shared/prisma/prisma.service';
import { SecurityAuditLogger } from '../../shared/security/security-audit.logger';

// ─────────────────────────────────────────────
// 상수 (plan.md·tasks.md T-B1 상수화 원칙 — 매직넘버 금지)
// ─────────────────────────────────────────────
const JWT_ACCESS_TTL_SECONDS = 900;          // NFR-003: 15분
const JWT_REFRESH_TTL_DAYS = 30;             // NFR-004: 30일
const JWT_REFRESH_TTL_SECONDS = JWT_REFRESH_TTL_DAYS * 24 * 60 * 60; // 2592000

// ─────────────────────────────────────────────
// Mock 팩토리
// ─────────────────────────────────────────────
const mockAuthRepository = {
  findUserByEmail: jest.fn(),
  createUser: jest.fn(),
  findUserById: jest.fn(),
  createRefreshToken: jest.fn(),
  findRefreshTokenByHash: jest.fn(),
  revokeRefreshToken: jest.fn(),
  // 013 확장: OTP·phone 관련
  createOtp: jest.fn(),
  findLatestOtpByEmail: jest.fn(),
  markOtpConsumed: jest.fn(),
  findFirstUserByPhone: jest.fn(),
  revokeAllRefreshTokensByUser: jest.fn(),
  // SEC-001: OTP 브루트포스 차단 메서드
  incrementOtpAttempts: jest.fn(),
};

const mockMailerPort = {
  sendOtpEmail: jest.fn(),
};

// v1.1.0/018 SC-012·020: 콜백을 실제 실행(fn())하여 resetPassword 내부 두 repo 호출이
// 기존과 동일하게 유지되도록 한다(Test Authoring Contract canonical).
const mockPrismaService = {
  runInTransaction: jest.fn(async (fn: () => unknown) => fn()),
  tx: {},
};

// v1.1.0/018 SC-014·016·017 + v1.1.0/019 SC-011·013: best-effort 감사 로거 —
// 호출 여부·인자만 spy. [§F 마이그레이션, v1.1.0/019 spec] findEmailNotFound 추가
// — 미추가 시 test_find_email_unregistered_404(§F 기존 테스트)가 production
// `this.securityAuditLogger.findEmailNotFound(phone)` 호출에서 `undefined()`
// TypeError 로 회귀한다(tasks.md Test Authoring Contract §F 항목).
const mockSecurityAuditLogger = {
  otpVerificationFailed: jest.fn(),
  rateLimitExceeded: jest.fn(),
  findEmailAccessed: jest.fn(),
  findEmailNotFound: jest.fn(),
};

const mockJwtService = {
  signAsync: jest.fn(),
  verifyAsync: jest.fn(),
  verify: jest.fn(),
  decode: jest.fn(),
};

const mockConfigService = {
  get: jest.fn((key: string) => {
    const config: Record<string, unknown> = {
      JWT_ACCESS_SECRET: 'test-access-secret',
      JWT_REFRESH_SECRET: 'test-refresh-secret',
      JWT_ACCESS_TTL: JWT_ACCESS_TTL_SECONDS,
      JWT_REFRESH_TTL: `${JWT_REFRESH_TTL_DAYS}d`,
    };
    return config[key] ?? null;
  }),
};

// 고정 유저 픽스처
const FIXED_USER = {
  id: 'user-fixed-id',
  email: 'test@example.com',
  password: '$2b$10$hashedPassword',   // bcrypt 해시 형태
  name: 'Test User',
  phone: '01012345678',
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
};

// OTP 픽스처 (013 확장)
const OTP_TTL_MIN = 10;
const OTP_RESEND_WINDOW_SEC = 60;

// OTP_MAX_ATTEMPTS: auth.constants.ts 와 동일값 — 상수 import 없이 로컬 정의(테스트 격리)
const OTP_MAX_ATTEMPTS = 5;

function makeOtpRecord(overrides: Partial<{
  id: string;
  email: string;
  otpHash: string;
  expiresAt: Date;
  consumedAt: Date | null;
  attempts: number;
  createdAt: Date;
}> = {}) {
  return {
    id: 'otp-id-001',
    email: FIXED_USER.email,
    otpHash: 'sha256hashvalue',
    expiresAt: new Date(Date.now() + OTP_TTL_MIN * 60 * 1000),
    consumedAt: null,
    attempts: 0,
    createdAt: new Date(),
    ...overrides,
  };
}

describe('AuthService', () => {
  let service: AuthService;
  let savedAdminUserIds: string | undefined;

  beforeEach(async () => {
    jest.clearAllMocks();
    // process.env 격리: 각 테스트 전 현재 값 저장
    savedAdminUserIds = process.env['ADMIN_USER_IDS'];

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: AuthRepository, useValue: mockAuthRepository },
        { provide: JwtService, useValue: mockJwtService },
        { provide: ConfigService, useValue: mockConfigService },
        { provide: MailerPort, useValue: mockMailerPort },
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: SecurityAuditLogger, useValue: mockSecurityAuditLogger },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
  });

  afterEach(() => {
    // process.env 복원: 테스트 간 격리 보장
    if (savedAdminUserIds === undefined) {
      delete process.env['ADMIN_USER_IDS'];
    } else {
      process.env['ADMIN_USER_IDS'] = savedAdminUserIds;
    }
  });

  // ─────────────────────────────────────────────
  // SC-001: getProfile 반환에 isAdmin 포함
  // ─────────────────────────────────────────────
  describe('SC-001: getProfile 응답에 isAdmin 포함 (FR-001) (v1.1.0/012 spec)', () => {
    it('when_getProfile_then_isAdmin_in_response', async () => {
      /**
       * SC-001 (FR-001 관련) (v1.1.0/012 spec):
       * getProfile(userId) 반환 객체에 isAdmin: boolean 필드가 포함되어야 한다.
       * ADMIN_USER_IDS 미설정 → isAdmin: false (fail-closed).
       */
      delete process.env['ADMIN_USER_IDS'];
      mockAuthRepository.findUserById.mockResolvedValue(FIXED_USER);

      const result = await service.getProfile(FIXED_USER.id);

      // isAdmin 필드 존재 + boolean 타입 확인
      expect(result).toHaveProperty('isAdmin');
      expect(typeof result.isAdmin).toBe('boolean');
    });

    it('when_getProfile_admin_user_then_isAdmin_true', async () => {
      /**
       * SC-001 보조 + SC-002 (FR-001 관련) (v1.1.0/012 spec):
       * ADMIN_USER_IDS에 userId 포함 시 getProfile 응답의 isAdmin = true.
       */
      process.env['ADMIN_USER_IDS'] = FIXED_USER.id;
      mockAuthRepository.findUserById.mockResolvedValue(FIXED_USER);

      const result = await service.getProfile(FIXED_USER.id);

      expect(result.isAdmin).toBe(true);
    });

    it('when_getProfile_non_admin_user_then_isAdmin_false', async () => {
      /**
       * SC-001 보조 + SC-002 (FR-001 관련) (v1.1.0/012 spec):
       * ADMIN_USER_IDS에 userId 미포함 시 getProfile 응답의 isAdmin = false.
       */
      process.env['ADMIN_USER_IDS'] = 'other-admin-id';
      mockAuthRepository.findUserById.mockResolvedValue(FIXED_USER);

      const result = await service.getProfile(FIXED_USER.id);

      expect(result.isAdmin).toBe(false);
    });
  });

  // ─────────────────────────────────────────────
  // SC-010: 중복 이메일 → ConflictException (409)
  // ─────────────────────────────────────────────
  describe('SC-010: 중복 이메일 → ConflictException (409) (v1.0.0/001 spec)', () => {
    it('when_duplicate_email_then_conflict_409', async () => {
      /**
       * SC-010 (FR-008 관련) (v1.0.0/001 spec):
       * 이미 가입된 이메일로 register 호출 시 ConflictException (HTTP 409) 발생.
       * AuthService.register: findUserByEmail → 존재 시 ConflictException throw.
       */
      mockAuthRepository.findUserByEmail.mockResolvedValue(FIXED_USER);

      await expect(
        service.register({ email: FIXED_USER.email, password: 'anyPassword123' }),
      ).rejects.toThrow(ConflictException);

      expect(mockAuthRepository.findUserByEmail).toHaveBeenCalledWith(FIXED_USER.email);
      // 중복 이메일 감지 후 createUser 호출되지 않아야 함
      expect(mockAuthRepository.createUser).not.toHaveBeenCalled();
    });
  });

  // ─────────────────────────────────────────────
  // SC-013: 잘못된 비밀번호 → UnauthorizedException (401)
  // ─────────────────────────────────────────────
  describe('SC-013: 잘못된 비밀번호 → UnauthorizedException (401) (v1.0.0/001 spec)', () => {
    it('when_wrong_password_then_unauthorized_401', async () => {
      /**
       * SC-013 (FR-009 관련) (v1.0.0/001 spec):
       * 잘못된 비밀번호로 login 호출 시 UnauthorizedException (HTTP 401) 발생.
       * AuthService.login: findUserByEmail → bcrypt.compare(false) → UnauthorizedException.
       */
      mockAuthRepository.findUserByEmail.mockResolvedValue(FIXED_USER);
      jest.spyOn(bcrypt, 'compare').mockImplementation(() => Promise.resolve(false));

      await expect(
        service.login({ email: FIXED_USER.email, password: 'wrongPassword' }),
      ).rejects.toThrow(UnauthorizedException);

      expect(mockAuthRepository.findUserByEmail).toHaveBeenCalledWith(FIXED_USER.email);
    });

    it('when_nonexistent_user_login_then_unauthorized_401', async () => {
      /**
       * SC-013 보조: 존재하지 않는 사용자로 login 시 UnauthorizedException.
       * 사용자 미조회 → 401 (타이밍 공격 완화: 동일 예외 반환).
       */
      mockAuthRepository.findUserByEmail.mockResolvedValue(null);

      await expect(
        service.login({ email: 'nouser@example.com', password: 'anyPassword' }),
      ).rejects.toThrow(UnauthorizedException);
    });
  });

  // ─────────────────────────────────────────────
  // SC-014: login → access token exp = iat + 900s
  // ─────────────────────────────────────────────
  describe('SC-014: login access token exp = iat + 900s (NFR-003) (v1.0.0/001 spec)', () => {
    it('when_login_then_access_exp_iat_plus_900', async () => {
      /**
       * SC-014 (FR-009, NFR-003 관련) (v1.0.0/001 spec):
       * login 성공 시 발급하는 Access Token의 expiresIn이 JWT_ACCESS_TTL_SECONDS(900) 과 동일해야 한다.
       * 검증: signAsync 호출 시 options.expiresIn === 900 (또는 '15m' 등 900s 상당값).
       *
       * signAsync 는 두 번 호출됨: 첫 번째 = access token, 두 번째 = refresh token.
       * access token 발급 호출의 expiresIn 이 900(또는 '15m') 인지 확인.
       */
      mockAuthRepository.findUserByEmail.mockResolvedValue(FIXED_USER);
      jest.spyOn(bcrypt, 'compare').mockImplementation(() => Promise.resolve(true));
      mockJwtService.signAsync
        .mockResolvedValueOnce('mock.access.token')
        .mockResolvedValueOnce('mock.refresh.token');
      mockAuthRepository.createRefreshToken.mockResolvedValue(undefined);

      await service.login({ email: FIXED_USER.email, password: 'correctPassword' });

      // signAsync 가 최소 1회 호출되어야 함
      expect(mockJwtService.signAsync).toHaveBeenCalled();

      // Access token 발급 호출: expiresIn 이 JWT_ACCESS_TTL_SECONDS(900) 또는 '15m'
      const signCalls = mockJwtService.signAsync.mock.calls as Array<[unknown, { expiresIn?: number | string }?]>;
      const accessTokenCall = signCalls.find(
        ([, opts]) =>
          opts?.expiresIn === JWT_ACCESS_TTL_SECONDS ||
          opts?.expiresIn === '15m' ||
          opts?.expiresIn === '900s',
      );
      expect(accessTokenCall).toBeDefined();
    });
  });

  // ─────────────────────────────────────────────
  // SC-016: 만료·무효 refresh → UnauthorizedException (401)
  // ─────────────────────────────────────────────
  describe('SC-016: 만료·무효 Refresh Token → UnauthorizedException (401) (v1.0.0/001 spec)', () => {
    it('when_expired_or_revoked_refresh_then_401 (JWT signature expired)', async () => {
      /**
       * SC-016 (FR-010 관련) (v1.0.0/001 spec):
       * 만료된 Refresh Token JWT (서명 검증 실패) 로 refresh 호출 시 UnauthorizedException 발생.
       * AuthService.refresh: JwtService.verifyAsync throw → catch → UnauthorizedException.
       */
      mockJwtService.verifyAsync.mockRejectedValue(new Error('jwt expired'));

      await expect(
        service.refresh({ refreshToken: 'expired.jwt.token' }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('when_expired_or_revoked_refresh_then_401 (revoked in DB)', async () => {
      /**
       * SC-016 (FR-010 관련):
       * JWT 서명은 유효하나 DB에서 해당 tokenHash가 없거나 revoked=true인 경우 401.
       * AuthService.refresh: verifyAsync 성공 → findRefreshTokenByHash 조회 → null 반환 → 401.
       */
      mockJwtService.verifyAsync.mockResolvedValue({
        sub: FIXED_USER.id,
        email: FIXED_USER.email,
        jti: 'some-uuid',
        exp: Math.floor(Date.now() / 1000) + 3600,
      });
      // DB에서 토큰을 찾을 수 없음 (revoked 또는 미존재)
      mockAuthRepository.findRefreshTokenByHash.mockResolvedValue(null);

      await expect(
        service.refresh({ refreshToken: 'valid.sig.but.revoked.token' }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('when_expired_or_revoked_refresh_then_401 (revoked=true flag)', async () => {
      /**
       * SC-016 보조: revoked=true 상태인 토큰으로 refresh 시도 → 401.
       */
      mockJwtService.verifyAsync.mockResolvedValue({
        sub: FIXED_USER.id,
        email: FIXED_USER.email,
        jti: 'another-uuid',
        exp: Math.floor(Date.now() / 1000) + 3600,
      });
      mockAuthRepository.findRefreshTokenByHash.mockResolvedValue({
        id: 'token-row-id',
        userId: FIXED_USER.id,
        tokenHash: 'sha256hashvalue',
        expiresAt: new Date(Date.now() + 86400000),
        revoked: true,  // 무효화됨
        createdAt: new Date(),
      });

      await expect(
        service.refresh({ refreshToken: 'revoked.flag.token' }),
      ).rejects.toThrow(UnauthorizedException);
    });
  });

  // ─────────────────────────────────────────────
  // SC-004: getProfile 반환에 name 필드 포함 (013 확장)
  // ─────────────────────────────────────────────
  describe('SC-004: getProfile 응답에 name 필드 포함 (FR-003 관련) (v1.1.0/013 spec)', () => {
    it('when_getProfile_then_name_in_response', async () => {
      /**
       * SC-004 (FR-003 관련) (v1.1.0/013 spec):
       * getProfile(userId) 반환 객체에 name: string | null 필드가 포함되어야 한다.
       * ADR-002: GET /auth/me additive name 추가.
       */
      delete process.env['ADMIN_USER_IDS'];
      mockAuthRepository.findUserById.mockResolvedValue(FIXED_USER);

      const result = await service.getProfile(FIXED_USER.id);

      expect(result).toHaveProperty('name');
      // FIXED_USER.name = 'Test User'
      expect(result.name).toBe('Test User');
    });

    it('when_getProfile_user_null_name_then_name_null', async () => {
      /**
       * SC-004 보조 (v1.1.0/013 spec): name이 null인 사용자도 name: null로 반환.
       */
      const userNoName = { ...FIXED_USER, name: null };
      mockAuthRepository.findUserById.mockResolvedValue(userNoName);

      const result = await service.getProfile(FIXED_USER.id);

      expect(result.name).toBeNull();
    });
  });

  // ─────────────────────────────────────────────
  // SC-015/016/020: forgotPassword (013 확장)
  // ─────────────────────────────────────────────
  describe('SC-015/016/020: forgotPassword (FR-011, NFR-003 관련)', () => {
    it('test_forgot_registered_returns_200 — 정상: createOtp + sendOtpEmail 호출', async () => {
      /**
       * SC-015 Happy Path (단위 분기 검증) (v1.1.0/013 spec):
       * 등록된 이메일로 forgotPassword 호출 시
       * createOtp + mailer.sendOtpEmail 이 각각 1회 호출되고 void 반환(200).
       * rate-limit 없음: findLatestOtpByEmail = null (이전 OTP 없음).
       */
      mockAuthRepository.findUserByEmail.mockResolvedValue(FIXED_USER);
      mockAuthRepository.findLatestOtpByEmail.mockResolvedValue(null);
      mockAuthRepository.createOtp.mockResolvedValue(makeOtpRecord());
      mockMailerPort.sendOtpEmail.mockResolvedValue(undefined);

      await expect(service.forgotPassword(FIXED_USER.email)).resolves.toBeUndefined();

      expect(mockAuthRepository.createOtp).toHaveBeenCalledTimes(1);
      expect(mockMailerPort.sendOtpEmail).toHaveBeenCalledTimes(1);
      expect(mockMailerPort.sendOtpEmail).toHaveBeenCalledWith(
        FIXED_USER.email,
        expect.any(String), // 6자리 OTP
      );
    });

    it('test_forgot_unregistered_returns_404 — 미가입 이메일 → NotFoundException', async () => {
      /**
       * SC-016 Error Case (v1.1.0/013 spec):
       * 미가입 이메일로 forgotPassword → NotFoundException (HTTP 404).
       */
      mockAuthRepository.findUserByEmail.mockResolvedValue(null);

      await expect(service.forgotPassword('notexist@example.com')).rejects.toThrow(
        NotFoundException,
      );

      expect(mockAuthRepository.createOtp).not.toHaveBeenCalled();
      expect(mockMailerPort.sendOtpEmail).not.toHaveBeenCalled();
    });

    it('test_forgot_twice_returns_429 — 1분 이내 재발송 → 429 TooManyRequests', async () => {
      /**
       * SC-020 Error Case (NFR-003) (v1.1.0/013 spec):
       * 1분 이내 이전 OTP 존재 시 HttpException(429) 발생.
       * findLatestOtpByEmail.createdAt > now - OTP_RESEND_WINDOW_SEC(60).
       */
      mockAuthRepository.findUserByEmail.mockResolvedValue(FIXED_USER);
      // createdAt = 30초 전 → rate-limit 범위 내
      const recentOtp = makeOtpRecord({
        createdAt: new Date(Date.now() - 30_000),
      });
      mockAuthRepository.findLatestOtpByEmail.mockResolvedValue(recentOtp);

      await expect(service.forgotPassword(FIXED_USER.email)).rejects.toThrow(HttpException);

      // HTTP 429 확인
      try {
        await service.forgotPassword(FIXED_USER.email);
      } catch (e) {
        if (e instanceof HttpException) {
          expect(e.getStatus()).toBe(HttpStatus.TOO_MANY_REQUESTS);
        }
      }
    });
  });

  // ─────────────────────────────────────────────
  // SC-017/018: resetPassword (013 확장)
  // ─────────────────────────────────────────────
  describe('SC-017/018: resetPassword (FR-012, NFR-002 관련)', () => {
    it('test_reset_valid_otp_changes_password — 정상: 비밀번호 변경 + OTP consumed', async () => {
      /**
       * SC-017 Happy Path (v1.1.0/013 spec):
       * 유효한 OTP·이메일·새 비밀번호 → void 반환(200).
       * markOtpConsumed + revokeAllRefreshTokensByUser 호출.
       */
      const PLAIN_OTP = '123456';
      // otpHash = sha256('123456') — production 구현 동일 알고리즘
      const crypto = require('crypto');
      const hash = crypto.createHash('sha256').update(PLAIN_OTP).digest('hex');

      mockAuthRepository.findUserByEmail.mockResolvedValue(FIXED_USER);
      mockAuthRepository.findLatestOtpByEmail.mockResolvedValue(
        makeOtpRecord({ otpHash: hash }),
      );
      mockAuthRepository.markOtpConsumed.mockResolvedValue(undefined);
      mockAuthRepository.revokeAllRefreshTokensByUser.mockResolvedValue(undefined);
      jest.spyOn(bcrypt, 'hash').mockImplementation(() => Promise.resolve('$2b$10$newHash'));

      await expect(
        service.resetPassword(FIXED_USER.email, PLAIN_OTP, 'NewPassword123!'),
      ).resolves.toBeUndefined();

      expect(mockAuthRepository.markOtpConsumed).toHaveBeenCalledTimes(1);
      expect(mockAuthRepository.revokeAllRefreshTokensByUser).toHaveBeenCalledTimes(1);
    });

    it('when_no_otp_then_400 — OTP 없음 → BadRequestException', async () => {
      /**
       * SC-018 Error (no OTP) (v1.1.0/013 spec):
       * findLatestOtpByEmail = null → BadRequestException(400).
       */
      mockAuthRepository.findUserByEmail.mockResolvedValue(FIXED_USER);
      mockAuthRepository.findLatestOtpByEmail.mockResolvedValue(null);

      await expect(
        service.resetPassword(FIXED_USER.email, '000000', 'anyPass'),
      ).rejects.toThrow(BadRequestException);
    });

    it('test_reset_expired_otp_rejected — 만료 OTP → BadRequestException', async () => {
      /**
       * SC-018 Edge/Error Case (NFR-002) (v1.1.0/013 spec):
       * 발급 후 10분 경과 OTP(expiresAt 과거) → BadRequestException(400).
       */
      mockAuthRepository.findUserByEmail.mockResolvedValue(FIXED_USER);
      mockAuthRepository.findLatestOtpByEmail.mockResolvedValue(
        makeOtpRecord({
          expiresAt: new Date(Date.now() - 1000), // 이미 만료
        }),
      );

      await expect(
        service.resetPassword(FIXED_USER.email, '000000', 'anyPass'),
      ).rejects.toThrow(BadRequestException);
    });

    it('when_consumed_otp_then_400 — 이미 소비된 OTP → BadRequestException', async () => {
      /**
       * SC-018 보조 (v1.1.0/013 spec): consumedAt != null → 400 재사용 차단.
       */
      mockAuthRepository.findUserByEmail.mockResolvedValue(FIXED_USER);
      mockAuthRepository.findLatestOtpByEmail.mockResolvedValue(
        makeOtpRecord({ consumedAt: new Date() }),
      );

      await expect(
        service.resetPassword(FIXED_USER.email, '000000', 'anyPass'),
      ).rejects.toThrow(BadRequestException);
    });

    it('when_otp_mismatch_then_400 — OTP 불일치 → BadRequestException', async () => {
      /**
       * SC-018 보조 (v1.1.0/013 spec): sha256(입력) !== otpHash → 400.
       * SEC-001: incrementOtpAttempts 호출, attempts < OTP_MAX_ATTEMPTS → markOtpConsumed 미호출.
       */
      mockAuthRepository.findUserByEmail.mockResolvedValue(FIXED_USER);
      mockAuthRepository.findLatestOtpByEmail.mockResolvedValue(
        makeOtpRecord({ otpHash: 'correcthash' }),
      );
      // 1회 불일치: attempts=1 < OTP_MAX_ATTEMPTS(5) → 무효화 없음
      mockAuthRepository.incrementOtpAttempts.mockResolvedValue(makeOtpRecord({ attempts: 1 }));

      await expect(
        service.resetPassword(FIXED_USER.email, '999999', 'anyPass'),
      ).rejects.toThrow(BadRequestException);

      expect(mockAuthRepository.incrementOtpAttempts).toHaveBeenCalledWith('otp-id-001');
      expect(mockAuthRepository.markOtpConsumed).not.toHaveBeenCalled();
    });
  });

  // ─────────────────────────────────────────────
  // SEC-001 regression: OTP 브루트포스 차단
  // ─────────────────────────────────────────────
  describe('SEC-001 regression: OTP 브루트포스 차단 (5회 시도 → 무효화)', () => {
    it('test_otp_5th_wrong_attempt_invalidates_otp', async () => {
      /**
       * SEC-001 regression (GAP-013-08):
       * 5번째 잘못된 OTP 시도 시 attempts 가 OTP_MAX_ATTEMPTS(5) 에 도달하면
       * markOtpConsumed 가 호출되어 OTP 가 무효화(consumed 처리)된다.
       * 이후 올바른 OTP 로도 재설정 불가 — consumedAt 체크로 거부.
       */
      // 5번째 잘못된 시도: incrementOtpAttempts 반환값 = attempts: 5 (max)
      mockAuthRepository.findLatestOtpByEmail.mockResolvedValue(
        makeOtpRecord({ otpHash: 'correcthash_not_matching_input' }),
      );
      mockAuthRepository.incrementOtpAttempts.mockResolvedValue(
        makeOtpRecord({ attempts: OTP_MAX_ATTEMPTS }),
      );
      mockAuthRepository.markOtpConsumed.mockResolvedValue(undefined);

      await expect(
        service.resetPassword(FIXED_USER.email, '000000', 'anyPass'),
      ).rejects.toThrow(BadRequestException);

      // attempts 증가 후 max 도달 → markOtpConsumed 호출(무효화)
      expect(mockAuthRepository.incrementOtpAttempts).toHaveBeenCalledWith('otp-id-001');
      expect(mockAuthRepository.markOtpConsumed).toHaveBeenCalledWith('otp-id-001');
    });

    it('test_otp_after_invalidation_correct_otp_also_rejected', async () => {
      /**
       * SEC-001 regression — 무효화 이후 검증:
       * 이미 consumedAt 이 설정된(무효화된) OTP 레코드에 올바른 OTP 를 제출해도
       * "OTP already used" BadRequestException 이 발생한다(새 OTP 발급 필요).
       */
      const PLAIN_OTP = '123456';
      const crypto = require('crypto');
      const hash = crypto.createHash('sha256').update(PLAIN_OTP).digest('hex');

      // consumedAt 이 설정된 레코드 — 이전 max attempts 도달로 무효화된 상태
      mockAuthRepository.findLatestOtpByEmail.mockResolvedValue(
        makeOtpRecord({ otpHash: hash, consumedAt: new Date() }),
      );

      await expect(
        service.resetPassword(FIXED_USER.email, PLAIN_OTP, 'NewPass123!'),
      ).rejects.toThrow(BadRequestException);

      // 무효화 상태이므로 incrementOtpAttempts 가 호출되지 않아야 함
      expect(mockAuthRepository.incrementOtpAttempts).not.toHaveBeenCalled();
    });
  });

  // ─────────────────────────────────────────────
  // SC-022/023: findEmail (013 확장)
  // ─────────────────────────────────────────────
  describe('SC-022/023: findEmail (FR-015, NFR-004 관련)', () => {
    it('test_find_email_returns_masked — 등록 phone → 마스킹 이메일 반환', async () => {
      /**
       * SC-022 Happy Path (v1.1.0/013 spec):
       * 등록된 전화번호로 findEmail → { email: 'te**@example.com' } 형태 반환.
       */
      mockAuthRepository.findFirstUserByPhone.mockResolvedValue(FIXED_USER);

      const result = await service.findEmail(FIXED_USER.phone!);

      expect(result).toHaveProperty('email');
      // maskEmail('test@example.com') → 'te**@example.com'
      expect(result.email).toBe('te**@example.com');
    });

    it('test_find_email_unregistered_404 — 미등록 phone → NotFoundException', async () => {
      /**
       * SC-023 Error Case (v1.1.0/013 spec):
       * 미등록 전화번호로 findEmail → NotFoundException (HTTP 404).
       *
       * [§F 마이그레이션, v1.1.0/019 spec]: T003 배선으로 이 경로에서
       * `securityAuditLogger.findEmailNotFound(phone)` 이 throw 이전에 호출된다
       * (mockSecurityAuditLogger.findEmailNotFound 미등록 시 TypeError 회귀 —
       * 상세 검증은 아래 SC-011 참조).
       */
      mockAuthRepository.findFirstUserByPhone.mockResolvedValue(null);

      await expect(service.findEmail('01099999999')).rejects.toThrow(NotFoundException);
    });
  });

  // ─────────────────────────────────────────────
  // SC-011 (v1.1.0/019 spec, FR-008): 미등록 phone → findEmailNotFound 호출 + 404
  // ─────────────────────────────────────────────
  describe('SC-011 (v1.1.0/019 spec): find-email 미등록 전화번호 → findEmailNotFound 1회 호출 + NotFoundException (FR-008)', () => {
    it('test_SC011_019_find_email_unregistered_calls_findEmailNotFound_and_throws_404', async () => {
      /**
       * SC-011 (v1.1.0/019 spec): 존재하지 않는 전화번호로 findEmail 호출 시
       * `SecurityAuditLogger.findEmailNotFound(phone)` 이 1회 호출되고, 이어서
       * `NotFoundException`(404)이 그대로 반환됨을 검증한다
       * (T003 — `throw NotFoundException` 이전에 삽입, 시그니처·반환 타입 불변).
       */
      mockAuthRepository.findFirstUserByPhone.mockResolvedValue(null);

      await expect(service.findEmail('01099999999')).rejects.toThrow(NotFoundException);

      expect(mockSecurityAuditLogger.findEmailNotFound).toHaveBeenCalledTimes(1);
      expect(mockSecurityAuditLogger.findEmailNotFound).toHaveBeenCalledWith('01099999999');
      // 성공 경로 감사 이벤트(findEmailAccessed)는 호출되지 않아야 한다(회귀 방지)
      expect(mockSecurityAuditLogger.findEmailAccessed).not.toHaveBeenCalled();
    });
  });

  // ─────────────────────────────────────────────
  // SC-017: login → refresh token 만료 = +30d
  // ─────────────────────────────────────────────
  describe('SC-017: login refresh token 만료 = +30d (NFR-004) (v1.0.0/001 spec)', () => {
    it('when_login_then_refresh_expiry_plus_30d', async () => {
      /**
       * SC-017 (FR-009, NFR-004 관련) (v1.0.0/001 spec):
       * login 성공 시 DB에 저장되는 RefreshToken의 expiresAt이
       * 발급 시점으로부터 30일(JWT_REFRESH_TTL_DAYS) 후여야 한다.
       *
       * 검증 방법:
       *   - createRefreshToken 호출 인자 중 expiresAt (Date 타입) 확인
       *   - expiresAt ≈ now + 30d (±5초 오차 허용)
       *   OR signAsync 호출 시 expiresIn이 '30d' 또는 JWT_REFRESH_TTL_SECONDS(2592000) 인지 확인
       */
      mockAuthRepository.findUserByEmail.mockResolvedValue(FIXED_USER);
      jest.spyOn(bcrypt, 'compare').mockImplementation(() => Promise.resolve(true));
      mockJwtService.signAsync
        .mockResolvedValueOnce('mock.access.token')
        .mockResolvedValueOnce('mock.refresh.token');
      mockAuthRepository.createRefreshToken.mockResolvedValue(undefined);

      const beforeMs = Date.now();
      await service.login({ email: FIXED_USER.email, password: 'correctPassword' });
      const afterMs = Date.now();

      // Approach 1: signAsync 로 refresh token 발급 시 expiresIn = '30d' 또는 2592000
      const signCalls = mockJwtService.signAsync.mock.calls as Array<[unknown, { expiresIn?: number | string }?]>;
      const refreshTokenCall = signCalls.find(
        ([, opts]) =>
          opts?.expiresIn === '30d' ||
          opts?.expiresIn === JWT_REFRESH_TTL_SECONDS ||
          opts?.expiresIn === `${JWT_REFRESH_TTL_DAYS}d`,
      );

      // Approach 2: createRefreshToken 호출 시 expiresAt ≈ now + 30d
      const expectedMinMs = beforeMs + JWT_REFRESH_TTL_SECONDS * 1000;
      const expectedMaxMs = afterMs + JWT_REFRESH_TTL_SECONDS * 1000;

      if (mockAuthRepository.createRefreshToken.mock.calls.length > 0) {
        // createRefreshToken(tokenHash, expiresAt, userId) 시그니처 기준
        const createRefreshArgs = mockAuthRepository.createRefreshToken.mock.calls[0] as [string, Date, string];
        const expiresAt = createRefreshArgs[1];
        if (expiresAt instanceof Date) {
          const toleranceMs = 10_000; // 10초 오차 허용
          expect(expiresAt.getTime()).toBeGreaterThanOrEqual(expectedMinMs - toleranceMs);
          expect(expiresAt.getTime()).toBeLessThanOrEqual(expectedMaxMs + toleranceMs);
        } else {
          // createRefreshToken 인자가 Date 타입이 아니면 signAsync 옵션으로 검증
          expect(refreshTokenCall).toBeDefined();
        }
      } else {
        // createRefreshToken 미호출인 경우 → signAsync 의 expiresIn 으로 검증
        expect(refreshTokenCall).toBeDefined();
      }
    });
  });

  // ── SC-004 (FR-007, NFR-003): password=null 사용자 이메일 로그인 → 401 ─────
  describe('SC-004 (v1.1.0/014 spec): password=null 사용자 이메일+비밀번호 로그인 거부', () => {
    it('test_SC004_014_null_password_user_login_returns_401', async () => {
      /**
       * SC-004 (v1.1.0/014 spec): SC-003 경로로 생성된 신규 사용자의 password가
       * null이며, 해당 계정으로 이메일+비밀번호 로그인 시도 시 오류가 반환된다.
       *
       * (PROC-R04) spec SC-004 원문: 오류 반환 → UnauthorizedException.
       * null 가드: bcrypt.compare 에 null 전달하지 않음을 검증(NFR-003, ADR-005).
       *
       * PROC-003: findUserByEmail 이 password=null 사용자를 반환하는 경로를 재현.
       * null 가드가 bcrypt.compare 를 통과시키지 않음을 확인.
       */
      const socialOnlyUser = {
        ...FIXED_USER,
        id: 'social-user-001',
        email: 'social@example.com',
        password: null as string | null,
      };

      mockAuthRepository.findUserByEmail.mockResolvedValue(socialOnlyUser);
      // bcrypt.compare 는 null 가드 이전에 호출되어선 안 된다(NFR-003)
      const bcryptSpy = jest.spyOn(bcrypt, 'compare');

      await expect(
        service.login({ email: 'social@example.com', password: 'anyPassword123!' }),
      ).rejects.toThrow(UnauthorizedException);

      // null 가드가 bcrypt.compare 이전에 작동해야 한다
      expect(bcryptSpy).not.toHaveBeenCalled();
    });
  });

  // ── SC-012 (v1.1.0/018 spec, FR-006): revoke 가 markOtpConsumed 와 동일 tx ─
  describe('SC-012 (v1.1.0/018 spec): revoke 가 markOtpConsumed 와 동일 트랜잭션 컨텍스트 내에서 실행 (FR-006)', () => {
    it('test_SC012_018_reset_password_wraps_markOtpConsumed_and_revoke_in_single_transaction', async () => {
      /**
       * SC-012 (v1.1.0/018 spec): resetPassword() 실행 시 revokeAllRefreshTokensByUser
       * 호출이 markOtpConsumed 와 동일 트랜잭션 컨텍스트 내에서 실행됨을 검증한다
       * (트랜잭션 경계 mock/spy 단언). PrismaService mock 의 runInTransaction 이
       * 콜백을 실제 실행(fn())하므로, 두 repo 호출의 invocationCallOrder 로
       * "runInTransaction 진입 이후에 두 호출이 순서대로 발생"함을 확인한다.
       */
      const crypto = require('crypto');
      const PLAIN_OTP = '111111';
      const hash = crypto.createHash('sha256').update(PLAIN_OTP).digest('hex');

      mockAuthRepository.findUserByEmail.mockResolvedValue(FIXED_USER);
      mockAuthRepository.findLatestOtpByEmail.mockResolvedValue(
        makeOtpRecord({ otpHash: hash }),
      );
      mockAuthRepository.markOtpConsumed.mockResolvedValue(undefined);
      mockAuthRepository.revokeAllRefreshTokensByUser.mockResolvedValue(undefined);
      jest.spyOn(bcrypt, 'hash').mockImplementation(() => Promise.resolve('$2b$10$newHash'));

      await service.resetPassword(FIXED_USER.email, PLAIN_OTP, 'NewPassword123!');

      // runInTransaction 1회, 내부에서 두 repo 호출 각 1회(원자화 경계 — SC-020 회귀축)
      expect(mockPrismaService.runInTransaction).toHaveBeenCalledTimes(1);
      expect(mockAuthRepository.markOtpConsumed).toHaveBeenCalledTimes(1);
      expect(mockAuthRepository.revokeAllRefreshTokensByUser).toHaveBeenCalledTimes(1);

      // 경계 단언: 두 repo 호출 모두 runInTransaction 진입 이후 순서대로 발생
      const txOrder = mockPrismaService.runInTransaction.mock.invocationCallOrder[0];
      const markOrder = mockAuthRepository.markOtpConsumed.mock.invocationCallOrder[0];
      const revokeOrder =
        mockAuthRepository.revokeAllRefreshTokensByUser.mock.invocationCallOrder[0];

      expect(markOrder).toBeGreaterThan(txOrder);
      expect(revokeOrder).toBeGreaterThan(markOrder);
    });
  });

  // ── SC-014 (v1.1.0/018 spec, FR-007): OTP 불일치 시 감사 로거 wiring ────────
  describe('SC-014 (v1.1.0/018 spec): OTP 불일치 시 securityAuditLogger.otpVerificationFailed 1회 (FR-007)', () => {
    it('test_SC014_018_otp_mismatch_calls_security_audit_logger_once', async () => {
      /**
       * SC-014 (v1.1.0/018 spec): OTP 값 불일치 시 WARN 수준 로그가 1건 기록되고
       * 로그 메시지에 이메일이 마스킹된 형태로 포함됨을 검증한다 — 이 파일에서는
       * wiring(호출 여부·인자)만 검증하고, 마스킹 자체는 T016
       * security-audit.logger.spec.ts 에서 검증한다.
       */
      mockAuthRepository.findUserByEmail.mockResolvedValue(FIXED_USER);
      mockAuthRepository.findLatestOtpByEmail.mockResolvedValue(
        makeOtpRecord({ otpHash: 'correcthash-not-matching' }),
      );
      mockAuthRepository.incrementOtpAttempts.mockResolvedValue(makeOtpRecord({ attempts: 1 }));

      await expect(
        service.resetPassword(FIXED_USER.email, '999999', 'anyPass'),
      ).rejects.toThrow(BadRequestException);

      expect(mockSecurityAuditLogger.otpVerificationFailed).toHaveBeenCalledTimes(1);
      expect(mockSecurityAuditLogger.otpVerificationFailed).toHaveBeenCalledWith(
        FIXED_USER.email,
      );
    });
  });

  // ── SC-016 (v1.1.0/018 spec, FR-009): find-email 시 감사 로거 wiring ────────
  describe('SC-016 (v1.1.0/018 spec): find-email 호출 시 securityAuditLogger.findEmailAccessed 1회 (FR-009)', () => {
    it('test_SC016_018_find_email_calls_security_audit_logger_once', async () => {
      /**
       * SC-016 (v1.1.0/018 spec): find-email 호출 시 WARN 수준 로그가 1건
       * 기록되고 조회 전화번호·반환 이메일이 마스킹된 형태로 포함됨을 검증한다 —
       * 이 파일에서는 wiring(호출 여부·인자)만 검증한다(마스킹은 T016 담당).
       */
      mockAuthRepository.findFirstUserByPhone.mockResolvedValue(FIXED_USER);

      const result = await service.findEmail(FIXED_USER.phone!);

      expect(result.email).toBe('te**@example.com');
      expect(mockSecurityAuditLogger.findEmailAccessed).toHaveBeenCalledTimes(1);
      expect(mockSecurityAuditLogger.findEmailAccessed).toHaveBeenCalledWith(
        FIXED_USER.phone,
        FIXED_USER.email,
      );
    });
  });

  // ── SC-017 (v1.1.0/018 spec, FR-010): PinoLogger.warn throw 해도 원 응답 불변 ──
  describe('SC-017 (v1.1.0/018 spec): PinoLogger.warn throw 해도 원 응답 불변 (FR-010, best-effort)', () => {
    /**
     * GAP-018-02 정정 (5b [B] 판정 반영): plan.md 테스트 전략표(SC-017 행)의
     * Input 은 `PinoLogger.warn` throw mock 이다 — `SecurityAuditLogger` 자체는
     * 내부 try/catch(security-audit.logger.ts) 로 이 예외를 항상 삼키므로,
     * `SecurityAuditLogger` 인스턴스가 throw 하는 것은 production 에서 도달
     * 불가능한 분기다(ADR-007, call-site 중복 방어 배제). 이전 판(2건)은
     * `SecurityAuditLogger` 전체를 mock 하여 그 보장을 무력화한 뒤 단언하는
     * 전제 조건 오류였다 — 여기서는 **실제 `SecurityAuditLogger` 인스턴스**를
     * `PinoLogger.warn` throw mock 과 함께 구성해 plan.md Input 과 정확히
     * 일치하는 end-to-end wiring 시나리오로 재작성한다. 로거 계층 자체의
     * best-effort 보장은 `security-audit.logger.spec.ts`(SC-017, 3건)가 이미
     * 커버하며, 이 describe 는 AuthService 콜사이트까지 포함한 wiring 을
     * 추가로 검증한다(상호보완, 중복 아님).
     */
    let realSecurityAuditLogger: SecurityAuditLogger;
    let mockPinoLogger: { warn: jest.Mock; setContext: jest.Mock };
    let serviceWithRealLogger: AuthService;

    beforeEach(async () => {
      mockPinoLogger = {
        warn: jest.fn(() => {
          throw new Error('pino transport failure (SC-017 e2e-style unit)');
        }),
        setContext: jest.fn(),
      };
      realSecurityAuditLogger = new SecurityAuditLogger(mockPinoLogger as unknown as PinoLogger);

      const module: TestingModule = await Test.createTestingModule({
        providers: [
          AuthService,
          { provide: AuthRepository, useValue: mockAuthRepository },
          { provide: JwtService, useValue: mockJwtService },
          { provide: ConfigService, useValue: mockConfigService },
          { provide: MailerPort, useValue: mockMailerPort },
          { provide: PrismaService, useValue: mockPrismaService },
          { provide: SecurityAuditLogger, useValue: realSecurityAuditLogger },
        ],
      }).compile();

      serviceWithRealLogger = module.get<AuthService>(AuthService);
    });

    it('test_SC017_018_reset_password_otp_mismatch_unaffected_by_logger_throw', async () => {
      /**
       * SC-017 (v1.1.0/018 spec): `PinoLogger.warn` 이 예외를 던지도록 mock
       * 하더라도(실제 `SecurityAuditLogger` 인스턴스 경유) OTP 검증 처리의
       * 원 응답(상태코드·바디)이 로깅 미적용 시와 동일하게 유지되어야 한다
       * (FR-010 — 로깅은 원 요청 흐름을 차단하지 않는다).
       */
      mockAuthRepository.findUserByEmail.mockResolvedValue(FIXED_USER);
      mockAuthRepository.findLatestOtpByEmail.mockResolvedValue(
        makeOtpRecord({ otpHash: 'correcthash-not-matching' }),
      );
      mockAuthRepository.incrementOtpAttempts.mockResolvedValue(makeOtpRecord({ attempts: 1 }));

      // 원 응답(BadRequestException — OTP 불일치)이 로깅 실패와 무관하게 유지되어야 함
      await expect(
        serviceWithRealLogger.resetPassword(FIXED_USER.email, '999999', 'anyPass'),
      ).rejects.toThrow(BadRequestException);

      // 로거 wiring 자체는 실제 호출되었음을 확인(로깅 시도가 실제로 일어났는지)
      expect(mockPinoLogger.warn).toHaveBeenCalledTimes(1);
    });

    it('test_SC017_018_find_email_unaffected_by_logger_throw', async () => {
      /**
       * SC-017 보조 (v1.1.0/018 spec): find-email 원 응답(마스킹 이메일)이
       * `PinoLogger.warn` 의 throw(실제 `SecurityAuditLogger` 인스턴스 경유)와
       * 무관하게 유지되어야 한다.
       */
      mockAuthRepository.findFirstUserByPhone.mockResolvedValue(FIXED_USER);

      const result = await serviceWithRealLogger.findEmail(FIXED_USER.phone!);

      expect(result.email).toBe('te**@example.com');
      expect(mockPinoLogger.warn).toHaveBeenCalledTimes(1);
    });
  });

  // ── SC-013 (v1.1.0/019 spec, FR-010): find-email 미등록 경로 — 로거 예외 발생해도 원 응답 불변 ──
  describe('SC-013 (v1.1.0/019 spec): find-email 미등록 경로 — PinoLogger.warn throw 해도 404 응답 불변 (FR-010, best-effort)', () => {
    /**
     * (PATCH-018-01 준수) `SecurityAuditLogger` 는 전 메서드 best-effort(내부
     * try/catch)이므로 `SecurityAuditLogger` 전체를 mock 하여 강제 throw 시키지
     * 않는다 — production 에서 도달 불가능한 분기를 전제하는 오류다(GAP-018-02
     * 정정 방식과 동일 원칙, PATCH-03). 실제 `SecurityAuditLogger` 인스턴스 +
     * `PinoLogger.warn` throw mock 조합으로 재현한다(SC-017 018 스타일 재사용).
     */
    let realSecurityAuditLogger: SecurityAuditLogger;
    let mockPinoLogger: { warn: jest.Mock; setContext: jest.Mock };
    let serviceWithRealLogger: AuthService;

    beforeEach(async () => {
      mockPinoLogger = {
        warn: jest.fn(() => {
          throw new Error('pino transport failure (SC-013 019 unit)');
        }),
        setContext: jest.fn(),
      };
      realSecurityAuditLogger = new SecurityAuditLogger(mockPinoLogger as unknown as PinoLogger);

      const module: TestingModule = await Test.createTestingModule({
        providers: [
          AuthService,
          { provide: AuthRepository, useValue: mockAuthRepository },
          { provide: JwtService, useValue: mockJwtService },
          { provide: ConfigService, useValue: mockConfigService },
          { provide: MailerPort, useValue: mockMailerPort },
          { provide: PrismaService, useValue: mockPrismaService },
          { provide: SecurityAuditLogger, useValue: realSecurityAuditLogger },
        ],
      }).compile();

      serviceWithRealLogger = module.get<AuthService>(AuthService);
    });

    it('test_SC013_019_find_email_unregistered_unaffected_by_logger_throw', async () => {
      /**
       * SC-013 (v1.1.0/019 spec): `findEmailNotFound` 내부에서 `PinoLogger.warn` 이
       * 예외를 던지더라도(실제 `SecurityAuditLogger` 인스턴스 경유) `findEmail` 은
       * 정상적으로 `NotFoundException`(404)을 반환해야 한다(차단 없음, FR-010).
       */
      mockAuthRepository.findFirstUserByPhone.mockResolvedValue(null);

      await expect(
        serviceWithRealLogger.findEmail('01099999999'),
      ).rejects.toThrow(NotFoundException);

      // 로거 wiring 자체는 실제 호출되었음(로깅 시도가 실제로 일어났는지)
      expect(mockPinoLogger.warn).toHaveBeenCalledTimes(1);
    });
  });
});
