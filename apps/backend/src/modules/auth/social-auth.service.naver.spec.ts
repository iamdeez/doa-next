/**
 * Test: SocialAuthService — naver 계정해석 (SC-001, SC-007~010, v1.1.0/015 spec)
 *
 * [SEC-015-01 재작업, GAP-015-04] 6단계 Security Agent 재감사가 naver 자동연동
 * (Path 3b, email 매칭)의 이메일 소유권 미검증 계정 탈취(SEC-015-01, High)를 확정하여
 * naver 를 `AUTO_LINK_PROVIDERS` 에서 다시 제외했다. **SC-006(naver 자동연동 허용)은
 * naver 범위에서 Out of Scope 로 재분류되었다** — 이 파일의 자동연동 케이스는 이제
 * 차단(ConflictException)을 검증하며, 상세 계약은
 * `social-auth.service.autolink-policy.spec.ts` 로 이관되었다(중복 방지). 재로그인
 * (SC-007)·신규가입(SC-008)은 Path 3a/3c 가 `autoLinkAllowed` 를 참조하지 않으므로
 * 이 정책 변경과 무관하게 무영향 — 계속 이 파일에서 검증한다.
 *
 * 계정 해석 우선순위(ADR-003, 014 재사용·무변경):
 *   a. findByProviderAndProviderId 존재 → 재로그인 (SC-007)
 *   b. findUserByEmail 존재 → 자동연동 (naver 는 SEC-015-01 로 차단 — Out of Scope, 아래 참조 없음)
 *   c. 신규 사용자 생성 (SC-008)
 *
 * [§F 마이그레이션, v1.1.0/016 SC-011] SocialAuthService 생성자에 OAuthStateService
 * 4번째 인자가 추가되어 DI mock 을 등록한다. naver 는 state 검증이 verify 호출 이전에
 * 삽입되므로(tasks.md T005), 이 파일의 naver 케이스는 `consume` 을 true 로 고정해
 * 기존 계정해석 단언(SC-001/007~010, SEC-015-01)이 회귀 없이 유지되도록 한다.
 *
 * [§F 마이그레이션, v1.1.0/018 SC-011·020] SocialAuthService 생성자에 PrismaService
 * 5번째 인자가 추가되어(path 3c 트랜잭션 원자화, FR-005) DI mock 을 등록한다.
 * `runInTransaction: jest.fn(async (fn) => fn())` 로 콜백을 실제 실행하여 이 파일의
 * SC-008(신규가입, path 3c 경유) 등 기존 단언이 회귀 없이 유지되도록 한다.
 */

import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, ConflictException } from '@nestjs/common';
import { SocialAuthService } from './social-auth.service';
import { SocialProviderResolver } from './social/social-provider.resolver';
import { AuthRepository } from './auth.repository';
import { AuthService } from './auth.service';
import { OAuthStateService } from './social/oauth-state.service';
import { PrismaService } from '../../shared/prisma/prisma.service';

// ─── Fixtures ───────────────────────────────────────────────────────────────

const EXISTING_USER = {
  id: 'user-naver-existing-001',
  email: 'shared-naver@example.com',
  password: '$2b$10$hashedPassword',
  name: '기존유저',
};

const RELOGIN_USER = {
  id: 'user-naver-relogin-001',
  email: 'relogin@naver.com',
  password: null,
  name: '재로그인유저',
};

const NEW_USER = {
  id: 'user-naver-new-001',
  email: 'brandnew@naver.com',
  password: null,
  name: '네이버신규유저',
};

const SOCIAL_ACCOUNT_WITH_USER = {
  id: 'sa-naver-relogin-001',
  userId: RELOGIN_USER.id,
  provider: 'naver',
  providerId: 'naver-relogin-777',
  email: RELOGIN_USER.email,
  name: RELOGIN_USER.name,
  user: RELOGIN_USER,
};

const TOKEN_RESULT = { accessToken: 'access-token-mock', refreshToken: 'refresh-token-mock' };

// ─── Mock factories ──────────────────────────────────────────────────────────

const makeMockSocialProviderPort = () => ({ verify: jest.fn() });
const makeMockSocialProviderResolver = () => ({ resolve: jest.fn() });
const makeMockAuthRepository = () => ({
  findByProviderAndProviderId: jest.fn(),
  findUserByEmail: jest.fn(),
  createSocialAccount: jest.fn(),
  createUser: jest.fn(),
});
const makeMockAuthService = () => ({
  issueTokensForUser: jest.fn().mockResolvedValue(TOKEN_RESULT),
});
const makeMockOAuthStateService = () => ({
  issue: jest.fn(),
  consume: jest.fn(),
});
// v1.1.0/018 SC-011·020: 콜백을 실제 실행(fn())하여 내부 repo 호출이 유지되도록 한다.
const makeMockPrismaService = () => ({
  runInTransaction: jest.fn(async (fn: () => unknown) => fn()),
  tx: {},
});

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('SocialAuthService — naver code-exchange 계정해석 (v1.1.0/015)', () => {
  let service: SocialAuthService;
  let mockResolver: ReturnType<typeof makeMockSocialProviderResolver>;
  let mockPort: ReturnType<typeof makeMockSocialProviderPort>;
  let mockRepo: ReturnType<typeof makeMockAuthRepository>;
  let mockAuthService: ReturnType<typeof makeMockAuthService>;
  let mockOAuthStateService: ReturnType<typeof makeMockOAuthStateService>;
  let mockPrismaService: ReturnType<typeof makeMockPrismaService>;

  beforeEach(async () => {
    mockResolver = makeMockSocialProviderResolver();
    mockPort = makeMockSocialProviderPort();
    mockRepo = makeMockAuthRepository();
    mockAuthService = makeMockAuthService();
    mockOAuthStateService = makeMockOAuthStateService();
    mockPrismaService = makeMockPrismaService();
    // 이 파일의 모든 케이스는 naver — state 검증(v1.1.0/016)은 항상 통과시켜
    // 계정해석 로직(ADR-003)만 격리 검증한다.
    mockOAuthStateService.consume.mockResolvedValue(true);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SocialAuthService,
        { provide: SocialProviderResolver, useValue: mockResolver },
        { provide: AuthRepository, useValue: mockRepo },
        { provide: AuthService, useValue: mockAuthService },
        { provide: OAuthStateService, useValue: mockOAuthStateService },
        { provide: PrismaService, useValue: mockPrismaService },
      ],
    }).compile();

    service = module.get<SocialAuthService>(SocialAuthService);
  });

  afterEach(() => jest.clearAllMocks());

  // ── SC-001 (FR-001): naver provider 처리 진입 ─────────────────────────────
  it('test_SC001_naver_provider_resolves_and_enters_flow', async () => {
    /**
     * SC-001 (v1.1.0/015 spec): `provider: 'naver'` 요청이 지원되지 않는
     * provider 로 거부(400)되지 않고 resolver.resolve('naver') 로 처리 흐름에
     * 진입한다(지원 목록 재포함).
     */
    mockResolver.resolve.mockReturnValue(mockPort);
    mockPort.verify.mockResolvedValue({
      providerId: 'naver-entry-001',
      email: RELOGIN_USER.email,
      name: RELOGIN_USER.name,
    });
    mockRepo.findByProviderAndProviderId.mockResolvedValue(SOCIAL_ACCOUNT_WITH_USER);

    const result = await service.login('naver', 'naver-auth-code', 'state-001');

    expect(mockResolver.resolve).toHaveBeenCalledWith('naver');
    expect(mockPort.verify).toHaveBeenCalled();
    expect(result).toEqual(TOKEN_RESULT);
  });

  // ── SEC-015-01 (GAP-015-04): naver email 자동연동 재차단 (SC-006 Out of Scope) ──
  it('test_SEC01501_naver_auto_link_blocked_conflict', async () => {
    /**
     * SEC-015-01 (v1.1.0/015 security-report.md, GAP-015-04): 미연동 네이버 계정의
     * 이메일이 기존 사용자 계정 이메일과 동일해도, code-exchange 앱바인딩은 이메일
     * 소유권을 검증하지 않으므로 naver 는 자동 연동하지 않고 409 Conflict 로 거부한다
     * (naver ∉ AUTO_LINK_PROVIDERS — SC-006 은 naver 범위에서 Out of Scope 로 재분류,
     * test-cases.md 참조). 상세 계약 단언은
     * `social-auth.service.autolink-policy.spec.ts` 를 정본(canonical)으로 삼는다 —
     * 이 테스트는 naver 전용 SC 모음 파일 내에서 회귀를 조기 감지하는 보조 역할이다.
     */
    mockResolver.resolve.mockReturnValue(mockPort);
    mockPort.verify.mockResolvedValue({
      providerId: 'naver-autolink-001',
      email: EXISTING_USER.email,
      name: '네이버연동',
    });
    mockRepo.findByProviderAndProviderId.mockResolvedValue(null);
    mockRepo.findUserByEmail.mockResolvedValue(EXISTING_USER);

    await expect(
      service.login('naver', 'naver-code-autolink', 'state-002'),
    ).rejects.toThrow(ConflictException);

    expect(mockRepo.createSocialAccount).not.toHaveBeenCalled();
    expect(mockRepo.createUser).not.toHaveBeenCalled();
    expect(mockAuthService.issueTokensForUser).not.toHaveBeenCalled();
  });

  // ── SC-007 (FR-006): naver 재로그인 (기연동 provider+providerId) ──────────
  it('test_SC007_naver_relogin_existing_social_account', async () => {
    /**
     * SC-007 (v1.1.0/015 spec): 이미 연동된 네이버 소셜 계정(동일
     * provider+providerId)으로 재로그인 요청 시 신규 연동·생성 없이 JWT 가
     * 반환된다.
     */
    mockResolver.resolve.mockReturnValue(mockPort);
    mockPort.verify.mockResolvedValue({
      providerId: SOCIAL_ACCOUNT_WITH_USER.providerId,
      email: RELOGIN_USER.email,
      name: RELOGIN_USER.name,
    });
    mockRepo.findByProviderAndProviderId.mockResolvedValue(SOCIAL_ACCOUNT_WITH_USER);

    const result = await service.login('naver', 'naver-code-relogin', 'state-003');

    expect(result).toEqual(TOKEN_RESULT);
    expect(mockAuthService.issueTokensForUser).toHaveBeenCalledWith(RELOGIN_USER);
    // 재로그인 경로(a) → b/c(findUserByEmail, createUser, createSocialAccount) 미진입
    expect(mockRepo.findUserByEmail).not.toHaveBeenCalled();
    expect(mockRepo.createUser).not.toHaveBeenCalled();
    expect(mockRepo.createSocialAccount).not.toHaveBeenCalled();
  });

  // ── SC-008 (FR-006): naver 신규가입 ────────────────────────────────────────
  it('test_SC008_naver_new_user_created', async () => {
    /**
     * SC-008 (v1.1.0/015 spec): 네이버 이메일에 해당하는 기존 계정이 없을 때
     * 신규 사용자 계정이 생성되고 네이버 소셜 계정이 연동되며 JWT 가 반환된다.
     */
    mockResolver.resolve.mockReturnValue(mockPort);
    mockPort.verify.mockResolvedValue({
      providerId: 'naver-newuser-001',
      email: NEW_USER.email,
      name: NEW_USER.name,
    });
    mockRepo.findByProviderAndProviderId.mockResolvedValue(null);
    mockRepo.findUserByEmail.mockResolvedValue(null);
    mockRepo.createUser.mockResolvedValue(NEW_USER);
    mockRepo.createSocialAccount.mockResolvedValue({
      id: 'sa-newuser-001',
      userId: NEW_USER.id,
      provider: 'naver',
      providerId: 'naver-newuser-001',
      email: NEW_USER.email,
      name: NEW_USER.name,
    });

    const result = await service.login('naver', 'naver-code-new', 'state-004');

    expect(result).toEqual(TOKEN_RESULT);
    expect(mockRepo.createUser).toHaveBeenCalledTimes(1);
    expect(mockRepo.createSocialAccount).toHaveBeenCalledTimes(1);
    expect(mockAuthService.issueTokensForUser).toHaveBeenCalledWith(NEW_USER);
  });

  // ── SC-009 (FR-007): naver email 미반환 → 400 ─────────────────────────────
  it('test_SC009_naver_email_null_returns_400', async () => {
    /**
     * SC-009 (v1.1.0/015 spec): 네이버 제공자로부터 이메일이 반환되지 않는
     * 응답을 stub 으로 시뮬레이션할 때 로그인 요청이 4xx 오류로 거부된다.
     */
    mockResolver.resolve.mockReturnValue(mockPort);
    mockPort.verify.mockResolvedValue({
      providerId: 'naver-noemail-001',
      email: null,
      name: null,
    });

    await expect(service.login('naver', 'naver-code-noemail', 'state-005')).rejects.toThrow(
      BadRequestException,
    );

    // email null → 계정 조회·생성 미진입
    expect(mockRepo.findByProviderAndProviderId).not.toHaveBeenCalled();
  });

  // ── SC-010 (FR-008) (v1.1.0/015 spec): 3경로 모두 accessToken·refreshToken 형식 반환 ─────────
  it('test_SC010_naver_relogin_path_returns_token_pair', async () => {
    mockResolver.resolve.mockReturnValue(mockPort);
    mockPort.verify.mockResolvedValue({
      providerId: SOCIAL_ACCOUNT_WITH_USER.providerId,
      email: RELOGIN_USER.email,
      name: RELOGIN_USER.name,
    });
    mockRepo.findByProviderAndProviderId.mockResolvedValue(SOCIAL_ACCOUNT_WITH_USER);

    const result = await service.login('naver', 'naver-code-sc010-relogin', 'state-006');

    expect(result).toEqual(TOKEN_RESULT);
    expect(result).toHaveProperty('accessToken');
    expect(result).toHaveProperty('refreshToken');
  });

  // SC-010 의 naver autolink 경로 단언은 SEC-015-01 로 제거되었다(해당 경로는 이제
  // ConflictException 을 던지며 토큰을 반환하지 않는다 — 위 test_SEC01501_* 참조).
  // naver 는 남은 2경로(재로그인·신규가입)만 SC-010 대상이며, kakao/google 의 자동연동
  // 경로 토큰 형식은 `social-auth.service.spec.ts`(014 산출물, 무변경 회귀)가 이미
  // `TOKEN_RESULT` 형식 일치로 커버한다(test-cases.md §SC 매트릭스 참조).
  it('test_SC010_naver_new_user_path_returns_token_pair', async () => {
    mockResolver.resolve.mockReturnValue(mockPort);
    mockPort.verify.mockResolvedValue({
      providerId: 'naver-sc010-new',
      email: NEW_USER.email,
      name: NEW_USER.name,
    });
    mockRepo.findByProviderAndProviderId.mockResolvedValue(null);
    mockRepo.findUserByEmail.mockResolvedValue(null);
    mockRepo.createUser.mockResolvedValue(NEW_USER);
    mockRepo.createSocialAccount.mockResolvedValue({
      id: 'sa-sc010-new',
      userId: NEW_USER.id,
      provider: 'naver',
      providerId: 'naver-sc010-new',
      email: NEW_USER.email,
      name: NEW_USER.name,
    });

    const result = await service.login('naver', 'naver-code-sc010-new', 'state-008');

    expect(result).toEqual(TOKEN_RESULT);
    expect(result).toHaveProperty('accessToken');
    expect(result).toHaveProperty('refreshToken');
  });
});
