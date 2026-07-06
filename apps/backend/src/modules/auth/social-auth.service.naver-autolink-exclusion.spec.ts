/**
 * Regression test (Development Agent, helper — SC 매핑 없음): SocialAuthService —
 * naver 자동연동(email 매칭, path 3b) 제외 (SEC-015-01, GAP-015-04, High).
 *
 * [배경] Security Agent 재감사(6단계 선택)가 naver 자동연동에 이메일 소유권 검증
 * 수단이 전혀 없음을 확인했다 — code-exchange(client_secret 교환)는 앱바인딩만
 * 보증할 뿐, naver 프로필의 email 필드를 그 계정 소유자가 실제로 소유하는지는
 * 검증하지 않는다. 이에 따라 `AUTO_LINK_PROVIDERS` 에서 naver 를 제외했다
 * (kakao·google 만 유지). 본 파일은 이 정책 변경을 회귀 방지 목적으로 검증한다.
 *
 * SC-XXX 매핑 autolink 테스트(`social-auth.service.autolink-policy.spec.ts`,
 * `social-auth.service.naver.spec.ts`)의 naver 시나리오 반전은 5a 단계 Test Agent
 * (AUTHORING) 의 병렬 책임 범위이며 본 파일이 대체하지 않는다.
 *
 * [§F 마이그레이션, v1.1.0/016 SC-011] SocialAuthService 생성자에 OAuthStateService
 * 4번째 인자가 추가되어 DI mock 을 등록한다. naver 케이스는 `consume` 을 true 로 고정하고
 * state 인자를 전달해 기존 자동연동 배제 단언이 회귀 없이 유지되도록 한다.
 *
 * [§F 마이그레이션, v1.1.0/018 SC-011·020] SocialAuthService 생성자에 PrismaService
 * 5번째 인자가 추가되어(path 3c 트랜잭션 원자화, FR-005) DI mock 을 등록한다. 이 파일의
 * 케이스는 path 3b(자동연동 배제)만 다루므로 runInTransaction 은 호출되지 않으나
 * DI 해석을 위해 mock 등록이 필요하다.
 */

import { ConflictException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { SocialAuthService } from './social-auth.service';
import { SocialProviderResolver } from './social/social-provider.resolver';
import { AuthRepository } from './auth.repository';
import { AuthService } from './auth.service';
import { OAuthStateService } from './social/oauth-state.service';
import { PrismaService } from '../../shared/prisma/prisma.service';

const EXISTING_USER = {
  id: 'user-existing-sec015',
  email: 'victim@example.com',
  password: '$2b$10$hashedPassword',
  name: '피해자',
};

const RELOGIN_USER = {
  id: 'user-naver-relogin-sec015',
  email: 'relogin-sec015@naver.com',
  password: null,
  name: '재로그인유저',
};

const SOCIAL_ACCOUNT_WITH_USER = {
  id: 'sa-naver-relogin-sec015',
  userId: RELOGIN_USER.id,
  provider: 'naver',
  providerId: 'naver-relogin-sec015',
  email: RELOGIN_USER.email,
  name: RELOGIN_USER.name,
  user: RELOGIN_USER,
};

const TOKEN_RESULT = { accessToken: 'access-token-mock', refreshToken: 'refresh-token-mock' };

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

describe('SocialAuthService — naver AUTO_LINK 제외 회귀 (SEC-015-01)', () => {
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

  it('naver 로그인 시 공격자가 victim 이메일을 프로필에 설정해도 기존 계정에 자동연동하지 않고 409 로 거부한다', async () => {
    mockResolver.resolve.mockReturnValue(mockPort);
    mockPort.verify.mockResolvedValue({
      providerId: 'naver-attacker-001',
      email: EXISTING_USER.email,
      name: '공격자',
    });
    mockRepo.findByProviderAndProviderId.mockResolvedValue(null);
    mockRepo.findUserByEmail.mockResolvedValue(EXISTING_USER);

    await expect(
      service.login('naver', 'naver-code-attacker', 'state-attacker'),
    ).rejects.toThrow(ConflictException);

    expect(mockRepo.createSocialAccount).not.toHaveBeenCalled();
    expect(mockAuthService.issueTokensForUser).not.toHaveBeenCalled();
  });

  it('naver 로그인 시 providerId 매칭 기존 연동 계정은 자동연동 정책과 무관하게 정상 재로그인된다 (path 3a 유지)', async () => {
    mockResolver.resolve.mockReturnValue(mockPort);
    mockPort.verify.mockResolvedValue({
      providerId: SOCIAL_ACCOUNT_WITH_USER.providerId,
      email: RELOGIN_USER.email,
      name: RELOGIN_USER.name,
    });
    mockRepo.findByProviderAndProviderId.mockResolvedValue(SOCIAL_ACCOUNT_WITH_USER);

    const result = await service.login('naver', 'naver-code-relogin', 'state-relogin');

    expect(result).toEqual(TOKEN_RESULT);
    expect(mockRepo.findUserByEmail).not.toHaveBeenCalled();
  });

  it.each(['kakao', 'google'])(
    '%s 로그인은 동일 이메일의 기존 계정에 자동 연동을 계속 허용한다 (naver 제외 조치의 회귀 없음)',
    async (provider) => {
      mockResolver.resolve.mockReturnValue(mockPort);
      mockPort.verify.mockResolvedValue({
        providerId: `${provider}-sec015-777`,
        email: EXISTING_USER.email,
        name: '연동유저',
      });
      mockRepo.findByProviderAndProviderId.mockResolvedValue(null);
      mockRepo.findUserByEmail.mockResolvedValue(EXISTING_USER);
      mockRepo.createSocialAccount.mockResolvedValue({
        id: `sa-${provider}-sec015-777`,
        userId: EXISTING_USER.id,
        provider,
        providerId: `${provider}-sec015-777`,
        email: EXISTING_USER.email,
        name: '연동유저',
      });

      const result = await service.login(provider, `${provider}-token`);

      expect(result).toEqual(TOKEN_RESULT);
      expect(mockRepo.createSocialAccount).toHaveBeenCalledTimes(1);
      expect(mockAuthService.issueTokensForUser).toHaveBeenCalledWith(EXISTING_USER);
    },
  );
});
