import {
  BadRequestException,
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../shared/prisma/prisma.service';
import { AuthRepository } from './auth.repository';
import { AuthService } from './auth.service';
import { OAuthStateService } from './social/oauth-state.service';
import { SocialProviderResolver } from './social/social-provider.resolver';

export interface SocialLoginResult {
  accessToken: string;
  refreshToken: string;
}

/**
 * FR-006 자동 연동(email 매칭, path 3b) 허용 provider 화이트리스트.
 * Kakao·Google 은 토큰의 app/client 바인딩(app_id/aud)을 검증하여 타 앱 발급 토큰의
 * 재전송을 차단하므로 자동 연동이 안전하다.
 *
 * Naver 는 제외한다(SEC-015-01, GAP-015-04, High). code-exchange(client_secret 교환)는
 * "이 authorization code 가 DOA 앱에 발급되었는가"(앱바인딩)만 보증할 뿐 "naver 프로필의
 * email 필드를 그 계정 소유자가 실제로 소유하는가"(이메일 소유권)는 검증하지 않는다 — 두
 * 보증은 서로 독립적이며 앱바인딩 확보가 이메일 소유권 검증을 함의하지 않는다. Google 은
 * email_verified 필드로 이 소유권을 검증하지만(google.provider.ts), Naver 오픈API(`/v1/nid/me`)
 * 는 대응 필드를 제공하지 않는다(naver.provider.ts). 검증 없이 자동 연동을 허용하면 공격자가
 * 자신의 정상 naver 계정 프로필 이메일을 victim 의 DOA 가입 이메일로 설정한 뒤 정상 로그인을
 * 완료하는 것만으로 victim 계정을 탈취할 수 있다. naver 사용자는 providerId 매칭 재로그인
 * (path 3a)과 신규 독립 계정 생성(path 3c)만 허용된다.
 *
 * 이 상수는 방어적 심층 방어(defense-in-depth) 목적을 겸한다 — 화이트리스트 밖 provider 가
 * 추가되더라도 자동 연동만은 기본 차단되도록 화이트리스트 방식을 유지한다(아래 ConflictException 분기).
 */
const AUTO_LINK_PROVIDERS: ReadonlySet<string> = new Set(['kakao', 'google']);

/**
 * 소셜 로그인 도메인 서비스.
 * 계정 해석 우선순위 (ADR-003):
 *   a) provider+providerId 일치 → 기존 소셜 계정 소유 사용자
 *   b) email 일치 → 기존 이메일 가입자에 소셜 계정 자동 연동 (AUTO_LINK_PROVIDERS 한정)
 *   c) 신규 사용자 생성 + 소셜 계정 생성 (두 단계 순차 실행)
 *
 * AUTO_LINK_PROVIDERS 에 없는 provider 는 email 이 기존 계정과 겹치면 연동하지
 * 않고 409 Conflict 로 거부한다(자동 연동도, 동일 email 의 신규 독립 계정 생성도 하지 않음
 * — users.email 유니크 제약상 후자는 불가능). 현재 활성 provider 중 kakao·google 은 이
 * 화이트리스트에 포함되나, naver 는 이메일 소유권 미검증(SEC-015-01)으로 제외되어 실제로
 * 이 분기(409 Conflict)에 도달한다 — naver 사용자는 providerId 매칭 재로그인(path 3a)
 * 또는 신규 독립 계정 생성(path 3c)만 가능하다.
 */
@Injectable()
export class SocialAuthService {
  constructor(
    private readonly resolver: SocialProviderResolver,
    private readonly repo: AuthRepository,
    private readonly authService: AuthService,
    private readonly oauthStateService: OAuthStateService,
    private readonly prisma: PrismaService,
  ) {}

  async login(provider: string, token: string, state?: string): Promise<SocialLoginResult> {
    // 0. SEC-015-02 하드닝: naver 한정 서버측 CSRF state 검증. 네이버 아웃바운드(verify)
    // 도달 전에 무효 state 요청을 차단한다(kakao/google 은 검증 대상 아님).
    if (provider === 'naver') {
      const ok = await this.oauthStateService.consume('naver', state);
      if (!ok) {
        throw new UnauthorizedException('Invalid or expired state');
      }
    }

    // 1. 토큰(또는 Naver 의 경우 authorization code) 검증 및 프로필 획득.
    // state 는 Naver code-exchange 전용 CSRF 파라미터(ADR-007) — kakao/google 은 state 를
    // 전달하지 않는 정확히 단일 인자 호출을 유지해야 하므로 조건부로 분기한다(§F, SC-005/019 회귀 방지).
    const providerImpl = this.resolver.resolve(provider);
    const profile =
      state === undefined ? await providerImpl.verify(token) : await providerImpl.verify(token, { state });

    // 2. FR-003: 이메일 없는 소셜 계정은 거부 (400 — 사용자 요청 오류)
    if (!profile.email) {
      throw new BadRequestException(
        'Social account email is required but was not provided by the provider',
      );
    }

    const email = profile.email;
    const autoLinkAllowed = AUTO_LINK_PROVIDERS.has(provider);

    // 3a. provider+providerId 로 기존 연동 계정 조회
    const existing = await this.repo.findByProviderAndProviderId(provider, profile.providerId);
    if (existing) {
      return this.authService.issueTokensForUser(existing.user);
    }

    // 3b. 동일 이메일로 이미 가입된 사용자 확인
    const existingUser = await this.repo.findUserByEmail(email);
    if (existingUser) {
      if (!autoLinkAllowed) {
        // 화이트리스트 밖 provider 방어 코드 — naver 는 이메일 소유권 미검증(SEC-015-01)으로
        // AUTO_LINK_PROVIDERS 에서 제외되어 실제로 이 분기에 도달한다(kakao·google 은 화이트
        // 리스트에 포함되어 도달하지 않는다). 기존 계정에 연결하지 않고, 동일 email 의
        // 독립 계정 생성도 불가하므로 거부한다.
        throw new ConflictException(
          'Email already registered. Automatic account linking is disabled for this provider.',
        );
      }
      try {
        await this.repo.createSocialAccount({
          userId: existingUser.id,
          provider,
          providerId: profile.providerId,
          email,
          name: profile.name,
        });
      } catch (err) {
        // P2002: 동시성 충돌 — 이미 다른 요청이 createSocialAccount 완료
        if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
          const raceResult = await this.repo.findByProviderAndProviderId(
            provider,
            profile.providerId,
          );
          if (raceResult) {
            return this.authService.issueTokensForUser(raceResult.user);
          }
        }
        throw err;
      }
      return this.authService.issueTokensForUser(existingUser);
    }

    // 3c. 신규 사용자 + 소셜 계정 원자 생성(FR-005/ADR-005) — 한쪽 실패 시 양쪽 모두 롤백.
    try {
      const newUser = await this.prisma.runInTransaction(async () => {
        const u = await this.repo.createUser({
          email,
          name: profile.name,
          password: null,
        });
        await this.repo.createSocialAccount({
          userId: u.id,
          provider,
          providerId: profile.providerId,
          email,
          name: profile.name,
        });
        return u;
      });
      return this.authService.issueTokensForUser(newUser); // 커밋 후 발급 — 원자성 대상 아님
    } catch (err) {
      // P2002 폴백은 트랜잭션 외부에 유지한다(SC-011 회귀 방지) — 롤백 완료 후 root 클라이언트로
      // race 복구 조회를 수행해야 하므로 이 catch 를 트랜잭션 내부로 옮기지 않는다(ADR-005).
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        const raceResult = await this.repo.findByProviderAndProviderId(
          provider,
          profile.providerId,
        );
        if (raceResult) {
          return this.authService.issueTokensForUser(raceResult.user);
        }
        if (!autoLinkAllowed) {
          // 화이트리스트 밖 provider(naver — SEC-015-01) — 동시성 경합으로 email 이 방금
          // 다른 계정에 귀속된 경우에도 자동 연동하지 않고 충돌로 응답한다(3b 와 동일 정책).
          throw new ConflictException(
            'Email already registered. Automatic account linking is disabled for this provider.',
          );
        }
        const raceUser = await this.repo.findUserByEmail(email);
        if (raceUser) {
          return this.authService.issueTokensForUser(raceUser);
        }
      }
      throw err;
    }
  }
}
