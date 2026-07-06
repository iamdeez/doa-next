import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SocialProfile, SocialProviderPort, SocialVerifyContext } from './social-provider.port';

/** Naver 토큰 교환(oauth2.0/token) 성공 응답 */
interface NaverTokenResponse {
  access_token?: string;
  token_type?: string;
  expires_in?: string;
  refresh_token?: string;
  error?: string;
  error_description?: string;
}

/** Naver 사용자 프로필 API 응답 */
interface NaverProfileResponse {
  resultcode: string;
  message: string;
  response: {
    id: string;
    email?: string;
    name?: string;
  };
}

/**
 * 네이버 소셜 로그인 제공자 — authorization code + client_secret 교환 방식(code-exchange).
 *
 * 네이버 오픈API는 카카오의 access_token_info(app_id)·구글의 tokeninfo(aud) 에 대응하는,
 * 액세스 토큰이 어느 애플리케이션에 발급되었는지 식별하는 공개 엔드포인트를 제공하지
 * 않는다(client-token 검증 불가, plan.md PATCH-014-01). 이 제약을 해소하기 위해 이 provider 는
 * Flutter 클라이언트가 획득한 authorization code 를 백엔드가 보유한 client_secret 으로만
 * 교환할 수 있는 confidential client 흐름(ADR-001/ADR-003)을 사용한다 — client_secret
 * 소유자만 code 를 token 으로 교환 가능하므로 앱 바인딩이 OAuth 프로토콜 수준에서 보장된다.
 */
@Injectable()
export class NaverProvider extends SocialProviderPort {
  constructor(private readonly configService: ConfigService) {
    super();
  }

  async verify(code: string, context?: SocialVerifyContext): Promise<SocialProfile> {
    // NFR-002: 크레덴셜 조회를 호출 시점으로 지연(fail-closed) — 미설정 시에도 앱 전체
    // 기동은 영향받지 않고 실제 네이버 로그인 호출 시에만 오류가 국한된다(kakao/google 과 동일 원칙).
    const clientId = this.configService.getOrThrow<string>('NAVER_CLIENT_ID');
    const clientSecret = this.configService.getOrThrow<string>('NAVER_CLIENT_SECRET');

    const body = new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: clientId,
      client_secret: clientSecret,
      code,
      state: context?.state ?? '',
    });

    // redirect_uri 요구 여부는 운영 셋업에서 공식 문서로 최종 확인 예정([TO-VERIFY]).
    // 미설정 시 파라미터 미포함(기존 동작 유지, fail-safe) — getOrThrow 아닌 get.
    const redirectUri = this.configService.get<string>('NAVER_REDIRECT_URI');
    if (redirectUri) body.set('redirect_uri', redirectUri);

    const tokenRes = await fetch('https://nid.naver.com/oauth2.0/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    });

    const tokenData = (await tokenRes.json()) as NaverTokenResponse;

    if (!tokenRes.ok || tokenData.error || !tokenData.access_token) {
      // client_secret·code 원문은 로깅하지 않는다(SC-017) — error_description 만 기록.
      throw new UnauthorizedException(
        `Naver code exchange failed: ${tokenData.error_description ?? tokenData.error ?? 'unknown error'}`,
      );
    }

    // access_token 은 프로필 조회 이후 폐기되는 지역 변수로만 보유한다(SC-004) —
    // SocialProfile 반환 타입·로그·예외 메시지 어디에도 포함하지 않는다.
    const accessToken = tokenData.access_token;

    const profileRes = await fetch('https://openapi.naver.com/v1/nid/me', {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!profileRes.ok) {
      throw new UnauthorizedException('Naver profile lookup failed');
    }

    const profileData = (await profileRes.json()) as NaverProfileResponse;

    if (profileData.resultcode !== '00') {
      throw new UnauthorizedException(`Naver API error: ${profileData.message}`);
    }

    return {
      providerId: profileData.response.id,
      email: profileData.response.email ?? null,
      name: profileData.response.name ?? null,
    };
  }
}
