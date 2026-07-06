/**
 * Regression test: SocialAuthService — AUTO_LINK_PROVIDERS 화이트리스트 정책
 * (v1.1.0/015 spec — SEC-015-01, GAP-015-04: naver 자동연동 재차단).
 *
 * [015 재작업 이력] 최초 015 구현은 code-exchange 앱바인딩(NFR-003)을 근거로 naver 를
 * `AUTO_LINK_PROVIDERS` 에 재편입하여 자동연동을 허용했다(SC-006 (v1.1.0/015 spec)). 그러나 6단계 Security
 * Agent 재감사가 SEC-015-01(High)을 확정했다 — 앱바인딩(누가 이 code 를 발급받았는가)과
 * 이메일 소유권(그 naver 계정의 email 필드를 실제로 소유하는가)은 서로 다른 보증이며,
 * code-exchange 는 후자를 전혀 검증하지 않는다. 공격자가 자신의 정규 naver 계정 프로필에
 * victim 의 이메일을 등록하고 정상 로그인하면 앱바인딩 위반 없이도 victim 계정을 자동
 * 연동으로 탈취할 수 있다. 이 위험을 차단하기 위해 naver 를 `AUTO_LINK_PROVIDERS` 에서
 * 다시 제외한다(수정 방향 1). Path 3a(재로그인)·Path 3c(신규가입, race-fallback 정상 경로
 * 제외)는 이 정책과 무관하게 무변경이므로 naver 에도 계속 허용된다.
 * Kakao/Google 은 기존 자동연동 동작을 그대로 유지한다(회귀 0, NFR-004).
 *
 * [§F 마이그레이션, v1.1.0/016 SC-011] SocialAuthService 생성자에 OAuthStateService
 * 4번째 인자가 추가되어 DI mock 을 등록한다. naver 케이스는 state 검증이 verify 호출
 * 이전에 삽입되므로(tasks.md T005) `consume` 을 true 로 고정하고 state 인자를 전달해
 * 기존 자동연동 정책 단언(ConflictException 등)이 회귀 없이 유지되도록 한다. kakao/google
 * 케이스는 state 분기 자체에 진입하지 않으므로(FR-006) 무변경이다.
 *
 * [§F 마이그레이션, v1.1.0/018 SC-011·020] SocialAuthService 생성자에 PrismaService
 * 5번째 인자가 추가되어(path 3c 트랜잭션 원자화, FR-005) DI mock 을 등록한다. 이 파일의
 * 케이스는 path 3b(자동연동 차단)만 다루므로 runInTransaction 은 호출되지 않으나
 * DI 해석을 위해 mock 등록이 필요하다.
 */

import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException } from '@nestjs/common';
import { SocialAuthService } from './social-auth.service';
import { SocialProviderResolver } from './social/social-provider.resolver';
import { AuthRepository } from './auth.repository';
import { AuthService } from './auth.service';
import { OAuthStateService } from './social/oauth-state.service';
import { PrismaService } from '../../shared/prisma/prisma.service';

const EXISTING_USER = {
  id: 'user-existing-001',
  email: 'shared@example.com',
  password: '$2b$10$hashedPassword',
  name: '기존유저',
};

const NEW_USER = {
  id: 'social-user-naver-001',
  email: 'brand-new@example.com',
  password: null,
  name: '네이버신규유저',
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

describe('SocialAuthService — auto-link policy (v1.1.0/015 SEC-015-01 재차단)', () => {
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
    // naver 케이스의 state 검증(v1.1.0/016)을 항상 통과시켜 자동연동 정책만 격리 검증한다.
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

  // SEC-015-01 (GAP-015-04): naver 자동연동 재차단 — SC-006(naver 자동연동)은 본
  // 결정으로 naver 범위에서 Out of Scope 처리되었다(test-cases.md §SC 매트릭스 참조).
  // code-exchange 앱바인딩은 이메일 소유권을 검증하지 않으므로, 동일 이메일이라는
  // 이유만으로 자동 연동하지 않고 409 Conflict 로 거부해야 한다.
  it('naver 로그인 시 동일 이메일의 기존 계정이 있어도 자동 연동하지 않고 Conflict 로 거부한다 (SEC-015-01)', async () => {
    mockResolver.resolve.mockReturnValue(mockPort);
    mockPort.verify.mockResolvedValue({
      providerId: 'naver-999',
      email: EXISTING_USER.email,
      name: '네이버유저',
    });
    mockRepo.findByProviderAndProviderId.mockResolvedValue(null);
    mockRepo.findUserByEmail.mockResolvedValue(EXISTING_USER);

    await expect(service.login('naver', 'naver-token', 'state-autolink-blocked')).rejects.toThrow(
      ConflictException,
    );

    expect(mockRepo.createSocialAccount).not.toHaveBeenCalled();
    expect(mockRepo.createUser).not.toHaveBeenCalled();
    expect(mockAuthService.issueTokensForUser).not.toHaveBeenCalled();
  });

  // SC-008 (FR-006, Path 3c) (v1.1.0/015 spec): AUTO_LINK_PROVIDERS 재차단과 무관 — 겹치는 계정이 없는
  // 신규가입 경로는 autoLinkAllowed 를 참조하지 않으므로 naver 에도 계속 허용된다.
  it('naver 로그인 시 겹치는 계정이 없으면 독립 신규 계정으로 정상 생성된다 (path 3c 회귀 없음)', async () => {
    mockResolver.resolve.mockReturnValue(mockPort);
    mockPort.verify.mockResolvedValue({
      providerId: 'naver-111',
      email: NEW_USER.email,
      name: NEW_USER.name,
    });
    mockRepo.findByProviderAndProviderId.mockResolvedValue(null);
    mockRepo.findUserByEmail.mockResolvedValue(null);
    mockRepo.createUser.mockResolvedValue(NEW_USER);
    mockRepo.createSocialAccount.mockResolvedValue({
      id: 'sa-naver-new',
      userId: NEW_USER.id,
      provider: 'naver',
      providerId: 'naver-111',
      email: NEW_USER.email,
      name: NEW_USER.name,
    });

    const result = await service.login('naver', 'naver-token-new', 'state-autolink-newuser');

    expect(result).toEqual(TOKEN_RESULT);
    expect(mockRepo.createUser).toHaveBeenCalledTimes(1);
    expect(mockRepo.createSocialAccount).toHaveBeenCalledTimes(1);
    expect(mockAuthService.issueTokensForUser).toHaveBeenCalledWith(NEW_USER);
  });

  // NFR-004 회귀 방지: kakao/google 은 SEC-015-01 판정과 무관(이메일 소유권 검증 관련
  // 근거가 provider 별로 다름 — security-report.md "Kakao 와의 비교" 절 참조)하므로
  // 자동연동을 계속 허용한다. naver 는 위 별도 케이스로 이관되어 이 루프에서 제외한다.
  it.each(['kakao', 'google'])(
    '%s 로그인은 동일 이메일의 기존 계정에 자동 연동을 계속 허용한다 (회귀 없음)',
    async (provider) => {
      mockResolver.resolve.mockReturnValue(mockPort);
      mockPort.verify.mockResolvedValue({
        providerId: `${provider}-777`,
        email: EXISTING_USER.email,
        name: '연동유저',
      });
      mockRepo.findByProviderAndProviderId.mockResolvedValue(null);
      mockRepo.findUserByEmail.mockResolvedValue(EXISTING_USER);
      mockRepo.createSocialAccount.mockResolvedValue({
        id: `sa-${provider}-777`,
        userId: EXISTING_USER.id,
        provider,
        providerId: `${provider}-777`,
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
