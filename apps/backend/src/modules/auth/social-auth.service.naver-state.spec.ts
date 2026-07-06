/**
 * Test: SocialAuthService — naver state(CSRF) 검증 (SC-003~006, v1.1.0/016 spec)
 *
 * TDD Red 상태: `SocialAuthService` 생성자에 `OAuthStateService` 4번째 인자가 아직
 * 추가되지 않았다(T005 Development 병렬 진행, PPG-1). 아래 시그니처는 tasks.md
 * "Test Authoring Contract" canonical 을 기준으로 작성했으며, production 미구현
 * 상태에서의 컴파일/실행 오류는 허용한다(계약 검증). production 구현 완료 후 이
 * 파일이 PASS 상태로 전환된다.
 *
 * state 검증은 `resolver.resolve` 직후·`verify` 호출 **이전**에 naver 한정으로
 * 삽입된다(tasks.md T005). 검증 실패 시 verify 는 호출되지 않고 즉시 401
 * (UnauthorizedException). kakao/google 은 이 분기 자체에 진입하지 않는다(FR-006).
 *
 * [§F 마이그레이션, v1.1.0/018 SC-011·020] SocialAuthService 생성자에 PrismaService
 * 5번째 인자가 추가되어(path 3c 트랜잭션 원자화, FR-005) DI mock 을 등록한다. state 검증
 * 케이스는 트랜잭션 진입 이전(3a/verify 이전)에 분기되므로 runInTransaction 은 호출되지
 * 않으나 DI 해석을 위해 mock 등록이 필요하다.
 */

import { Test, TestingModule } from '@nestjs/testing';
import { UnauthorizedException } from '@nestjs/common';
import { SocialAuthService } from './social-auth.service';
import { SocialProviderResolver } from './social/social-provider.resolver';
import { AuthRepository } from './auth.repository';
import { AuthService } from './auth.service';
import { OAuthStateService } from './social/oauth-state.service';
import { PrismaService } from '../../shared/prisma/prisma.service';

// ─── Fixtures ───────────────────────────────────────────────────────────────

const RELOGIN_USER = {
  id: 'user-naver-state-relogin-001',
  email: 'state-relogin@naver.com',
  password: null,
  name: '상태검증재로그인유저',
};

const NAVER_SOCIAL_ACCOUNT = {
  id: 'sa-naver-state-relogin-001',
  userId: RELOGIN_USER.id,
  provider: 'naver',
  providerId: 'naver-state-relogin-777',
  email: RELOGIN_USER.email,
  name: RELOGIN_USER.name,
  user: RELOGIN_USER,
};

const KAKAO_USER = {
  id: 'user-kakao-state-skip-001',
  email: 'kakao-skip@example.com',
  password: null,
  name: '카카오유저',
};

const makeKakaoSocialAccount = (provider: string, profileId: string) => ({
  id: `sa-${provider}-state-skip-001`,
  userId: KAKAO_USER.id,
  provider,
  providerId: profileId,
  email: KAKAO_USER.email,
  name: KAKAO_USER.name,
  user: KAKAO_USER,
});

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

describe('SocialAuthService — naver state(CSRF) 검증 (v1.1.0/016)', () => {
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

  // ── SC-003 (FR-003): 유효 state → 검증통과·로그인 정상 진행 ────────────────
  it('test_SC003_valid_state_proceeds_login', async () => {
    mockOAuthStateService.consume.mockResolvedValue(true);
    mockResolver.resolve.mockReturnValue(mockPort);
    mockPort.verify.mockResolvedValue({
      providerId: NAVER_SOCIAL_ACCOUNT.providerId,
      email: RELOGIN_USER.email,
      name: RELOGIN_USER.name,
    });
    mockRepo.findByProviderAndProviderId.mockResolvedValue(NAVER_SOCIAL_ACCOUNT);

    const result = await service.login('naver', 'naver-code-valid-state', 'valid-state-001');

    expect(mockOAuthStateService.consume).toHaveBeenCalledWith('naver', 'valid-state-001');
    expect(mockPort.verify).toHaveBeenCalled();
    expect(result).toEqual(TOKEN_RESULT);
  });

  // ── SC-004 (FR-004): 불일치/만료/미제공 → 401(verify 미호출) ──────────────
  it.each([
    ['상태값 불일치·만료', 'mismatched-or-expired-state'],
    ['state 미제공', undefined],
  ])('test_SC004_invalid_state_rejects_401 (%s)', async (_label, stateValue) => {
    mockOAuthStateService.consume.mockResolvedValue(false);
    mockResolver.resolve.mockReturnValue(mockPort);

    await expect(
      service.login('naver', 'naver-code-invalid-state', stateValue),
    ).rejects.toThrow(UnauthorizedException);

    expect(mockOAuthStateService.consume).toHaveBeenCalledWith('naver', stateValue);
    expect(mockPort.verify).not.toHaveBeenCalled();
  });

  // ── SC-005 (FR-005): 소비된 state 재사용 → 401 ─────────────────────────────
  it('test_SC005_reused_state_rejects_401', async () => {
    mockResolver.resolve.mockReturnValue(mockPort);
    mockPort.verify.mockResolvedValue({
      providerId: NAVER_SOCIAL_ACCOUNT.providerId,
      email: RELOGIN_USER.email,
      name: RELOGIN_USER.name,
    });
    mockRepo.findByProviderAndProviderId.mockResolvedValue(NAVER_SOCIAL_ACCOUNT);

    // 1회째: 유효한 state → 정상 소비·로그인 성공
    mockOAuthStateService.consume.mockResolvedValueOnce(true);
    const firstResult = await service.login('naver', 'naver-code-reuse', 'reused-state-001');
    expect(firstResult).toEqual(TOKEN_RESULT);

    // 2회째: 동일 state 재사용 — 이미 소비되어 repo 매칭 0건(count=0) → consume=false
    mockOAuthStateService.consume.mockResolvedValueOnce(false);
    mockPort.verify.mockClear();
    await expect(
      service.login('naver', 'naver-code-reuse-2nd', 'reused-state-001'),
    ).rejects.toThrow(UnauthorizedException);
    expect(mockPort.verify).not.toHaveBeenCalled();
  });

  // ── SC-006 (FR-006): kakao/google — state 무관 정상(consume 미호출) ────────
  it.each(['kakao', 'google'])('test_SC006_kakao_google_skip_state (%s)', async (provider) => {
    const profile = { providerId: `${provider}-state-skip-001`, email: KAKAO_USER.email, name: KAKAO_USER.name };
    mockResolver.resolve.mockReturnValue(mockPort);
    mockPort.verify.mockResolvedValue(profile);
    mockRepo.findByProviderAndProviderId.mockResolvedValue(
      makeKakaoSocialAccount(provider, profile.providerId),
    );

    const result = await service.login(provider, `${provider}-token-state-skip`);

    expect(mockOAuthStateService.consume).not.toHaveBeenCalled();
    expect(mockResolver.resolve).toHaveBeenCalledWith(provider);
    expect(mockPort.verify).toHaveBeenCalledWith(`${provider}-token-state-skip`);
    expect(result).toEqual(TOKEN_RESULT);
  });
});
