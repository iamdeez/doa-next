import {
  BadRequestException,
  ConflictException,
  HttpException,
  HttpStatus,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { createHash, randomInt, randomUUID } from 'node:crypto';
import {
  JWT_ACCESS_TTL_SECONDS,
  JWT_REFRESH_TTL_DAYS,
} from '../../shared/config/jwt.config';
import { isAdminUserId } from '../../shared/auth/admin-ids';
import { MailerPort } from '../../infrastructure/mail/mailer.port';
import { PrismaService } from '../../shared/prisma/prisma.service';
import { SecurityAuditLogger } from '../../shared/security/security-audit.logger';
import { AuthRepository } from './auth.repository';
import { OTP_LENGTH, OTP_MAX_ATTEMPTS, OTP_RESEND_WINDOW_SEC, OTP_TTL_MIN } from './auth.constants';
import { maskEmail } from './auth.util';

// 비밀번호 bcrypt cost factor (ADR-001: cost 10~12)
// cost 10 선택 이유: cost 12 에서 P95 859ms → NFR-002(500ms) 초과.
// cost 10 은 ADR-001 허용 범위 내이며 P95 목표 충족.
const BCRYPT_SALT_ROUNDS = 10;

interface JwtPayload {
  sub: string;
  email: string;
  jti?: string;
}

export interface UserProfile {
  id: string;
  email: string;
  name?: string | null;
  createdAt: Date;
  isAdmin: boolean;
}

export interface RegisterResult {
  id: string;
  email: string;
}

export interface LoginResult {
  accessToken: string;
  refreshToken: string;
}

export interface RefreshResult {
  accessToken: string;
}

export interface FindEmailResult {
  email: string;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly authRepository: AuthRepository,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly mailer: MailerPort,
    private readonly prisma: PrismaService,
    private readonly securityAuditLogger: SecurityAuditLogger,
  ) {}

  // ──────────────────────────────────────────────
  // register
  // ──────────────────────────────────────────────

  async register(input: { email: string; password: string }): Promise<RegisterResult> {
    const existing = await this.authRepository.findUserByEmail(input.email);
    if (existing) {
      throw new ConflictException('Email already exists');
    }

    const hashedPassword = await bcrypt.hash(input.password, BCRYPT_SALT_ROUNDS);
    const user = await this.authRepository.createUser({
      email: input.email,
      password: hashedPassword,
    });

    return { id: user.id, email: user.email };
  }

  // ──────────────────────────────────────────────
  // login — access + refresh 동일 분기에서 발급
  // ──────────────────────────────────────────────

  async login(input: { email: string; password: string }): Promise<LoginResult> {
    const user = await this.authRepository.findUserByEmail(input.email);
    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    // ADR-005: 소셜 전용 사용자(password=null)는 이메일+비밀번호 로그인 불가
    if (!user.password) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const passwordMatch = await bcrypt.compare(input.password, user.password);
    if (!passwordMatch) {
      throw new UnauthorizedException('Invalid credentials');
    }

    return this.issueTokensForUser(user);
  }

  /**
   * 사용자 엔티티로부터 access/refresh 토큰 쌍을 발급하고 refresh 를 DB 에 저장한다.
   * login() 과 SocialAuthService 가 공유하는 헬퍼 (ADR-006).
   */
  async issueTokensForUser(user: { id: string; email: string }): Promise<LoginResult> {
    const accessSecret = this.configService.get<string>('jwt.accessSecret');
    const refreshSecret = this.configService.get<string>('jwt.refreshSecret');

    const payload: JwtPayload = { sub: user.id, email: user.email };

    // access 토큰 발급 (NFR-003: exp = iat + 900s)
    const accessToken = await this.jwtService.signAsync(payload, {
      secret: accessSecret,
      expiresIn: JWT_ACCESS_TTL_SECONDS,
    });

    // refresh 토큰 발급 — jti(uuid)로 동일 사용자 중복 login 시에도 tokenHash 유일성 보장
    const jti = randomUUID();
    const refreshPayload: JwtPayload = { ...payload, jti };
    const refreshTtlSeconds = JWT_REFRESH_TTL_DAYS * 24 * 60 * 60;

    const refreshToken = await this.jwtService.signAsync(refreshPayload, {
      secret: refreshSecret,
      expiresIn: refreshTtlSeconds,
    });

    // refresh 원문 SHA-256 → DB 에 tokenHash 저장 (ADR-003: 원문 미저장)
    const tokenHash = this.hashToken(refreshToken);
    const expiresAt = new Date(Date.now() + refreshTtlSeconds * 1000);

    await this.authRepository.createRefreshToken({
      tokenHash,
      expiresAt,
      userId: user.id,
    });

    return { accessToken, refreshToken };
  }

  // ──────────────────────────────────────────────
  // refresh
  // ──────────────────────────────────────────────

  async refresh(input: { refreshToken: string }): Promise<RefreshResult> {
    const refreshSecret = this.configService.get<string>('jwt.refreshSecret');

    // JWT 서명·exp 검증
    let payload: JwtPayload;
    try {
      payload = await this.jwtService.verifyAsync<JwtPayload>(input.refreshToken, {
        secret: refreshSecret,
      });
    } catch {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    // tokenHash 로 DB 조회
    const tokenHash = this.hashToken(input.refreshToken);
    const stored = await this.authRepository.findRefreshTokenByHash(tokenHash);

    if (!stored || stored.revoked || stored.expiresAt <= new Date()) {
      throw new UnauthorizedException('Refresh token is invalid or revoked');
    }

    // 새 access 토큰 발급
    const accessSecret = this.configService.get<string>('jwt.accessSecret');
    const newPayload: JwtPayload = { sub: payload.sub, email: payload.email };
    const accessToken = await this.jwtService.signAsync(newPayload, {
      secret: accessSecret,
      expiresIn: JWT_ACCESS_TTL_SECONDS,
    });

    return { accessToken };
  }

  // ──────────────────────────────────────────────
  // logout
  // ──────────────────────────────────────────────

  async logout(input: { refreshToken: string }): Promise<void> {
    const tokenHash = this.hashToken(input.refreshToken);
    await this.authRepository.revokeRefreshToken(tokenHash);
  }

  // ──────────────────────────────────────────────
  // me / getProfile — name 필드 additive 추가
  // ──────────────────────────────────────────────

  async getProfile(userId: string): Promise<UserProfile> {
    const user = await this.authRepository.findUserById(userId);
    if (!user) {
      throw new UnauthorizedException('User not found');
    }
    const isAdmin = isAdminUserId(userId, process.env['ADMIN_USER_IDS']);
    return { id: user.id, email: user.email, name: user.name, createdAt: user.createdAt, isAdmin };
  }

  // ──────────────────────────────────────────────
  // forgotPassword — OTP 발급·이메일 전송
  // ──────────────────────────────────────────────

  async forgotPassword(email: string): Promise<void> {
    const user = await this.authRepository.findUserByEmail(email);
    if (!user) {
      // 미가입 이메일에도 동일 오류 반환 (SC-016 spec 요구)
      throw new NotFoundException('Email not found');
    }

    // 60초 이내 재요청 차단 (SC-020: 1분 이내 2회 요청 → 429)
    const latest = await this.authRepository.findLatestOtpByEmail(email);
    if (latest) {
      const elapsed = (Date.now() - latest.createdAt.getTime()) / 1000;
      if (elapsed < OTP_RESEND_WINDOW_SEC) {
        throw new HttpException('Too many requests. Please wait before retrying.', HttpStatus.TOO_MANY_REQUESTS);
      }
    }

    // 6자리 숫자 OTP 생성 — SHA-256 해시만 저장
    const otp = String(randomInt(10 ** (OTP_LENGTH - 1), 10 ** OTP_LENGTH));
    const otpHash = this.hashToken(otp);
    const expiresAt = new Date(Date.now() + OTP_TTL_MIN * 60 * 1000);

    await this.authRepository.createOtp({ email, otpHash, expiresAt });
    await this.mailer.sendOtpEmail(email, otp);
  }

  // ──────────────────────────────────────────────
  // resetPassword — OTP 검증 + 비밀번호 변경
  // 원자성(FR-006/ADR-006): 비밀번호 업데이트 + OTP 소비 + 세션 전체 폐기를 단일
  // runInTransaction 으로 통합 — 어느 한쪽이 실패해도 전체 롤백된다.
  // ──────────────────────────────────────────────

  async resetPassword(email: string, otp: string, newPassword: string): Promise<void> {
    const otpHash = this.hashToken(otp);
    const record = await this.authRepository.findLatestOtpByEmail(email);

    if (!record) {
      throw new BadRequestException('Invalid or expired OTP');
    }
    if (record.consumedAt) {
      throw new BadRequestException('OTP already used');
    }
    if (record.expiresAt <= new Date()) {
      throw new BadRequestException('OTP expired');
    }
    if (record.otpHash !== otpHash) {
      this.securityAuditLogger.otpVerificationFailed(email);
      // 시도 횟수 증가 후 최대 도달 시 OTP 무효화 (SEC-001 브루트포스 차단)
      const updated = await this.authRepository.incrementOtpAttempts(record.id);
      if (updated.attempts >= OTP_MAX_ATTEMPTS) {
        await this.authRepository.markOtpConsumed(record.id);
        throw new BadRequestException('Too many invalid attempts. Please request a new OTP.');
      }
      throw new BadRequestException('Invalid OTP');
    }

    const user = await this.authRepository.findUserByEmail(email);
    if (!user) {
      throw new NotFoundException('User not found');
    }

    const hashedPassword = await bcrypt.hash(newPassword, BCRYPT_SALT_ROUNDS);

    // 비밀번호 업데이트 + OTP 소비 + 세션 전체 폐기 — 단일 트랜잭션(FR-006).
    // markOtpConsumed 내부 runInTransaction 은 재진입 안전(PrismaService.runInTransaction)하므로
    // 이 외부 tx 를 재사용한다(중첩 $transaction 없음).
    await this.prisma.runInTransaction(async () => {
      await this.authRepository.markOtpConsumed(record.id, {
        userId: user.id,
        hashedPassword,
      });
      await this.authRepository.revokeAllRefreshTokensByUser(user.id);
    });
  }

  // ──────────────────────────────────────────────
  // findEmail — 전화번호로 마스킹 이메일 반환
  // ──────────────────────────────────────────────

  async findEmail(phone: string): Promise<FindEmailResult> {
    const user = await this.authRepository.findFirstUserByPhone(phone);
    if (!user) {
      this.securityAuditLogger.findEmailNotFound(phone);
      throw new NotFoundException('No account found for this phone number');
    }
    this.securityAuditLogger.findEmailAccessed(phone, user.email);
    return { email: maskEmail(user.email) };
  }

  // ──────────────────────────────────────────────
  // Private helpers
  // ──────────────────────────────────────────────

  private hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }
}
