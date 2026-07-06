import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SocialProfile, SocialProviderPort } from './social-provider.port';

/** Kakao access_token_info 응답 — 토큰이 귀속된 앱을 식별하는 필드(app_id) 포함 */
interface KakaoAccessTokenInfo {
  id: number;
  expires_in: number;
  app_id: number;
}

/** Kakao Users API 응답 중 필요한 필드 */
interface KakaoMeResponse {
  id: number;
  kakao_account?: {
    email?: string;
    profile?: {
      nickname?: string;
    };
  };
}

/**
 * 카카오 소셜 로그인 제공자.
 * 클라이언트 SDK 가 발급한 accessToken 을 /v2/user/me 에 전달해 프로필을 검증한다.
 * 프로필 조회 전 access_token_info 의 app_id 를 DOA 앱(KAKAO_APP_ID)과 대조하여
 * 타 카카오 앱이 발급한 토큰의 재사용(계정 탈취)을 차단한다 (SEC-001, google aud 검증과 동일 목적).
 */
@Injectable()
export class KakaoProvider extends SocialProviderPort {
  constructor(private readonly configService: ConfigService) {
    super();
  }

  async verify(token: string): Promise<SocialProfile> {
    // NFR-004: 크레덴셜 조회를 호출 시점으로 지연 — 미설정 시에도 앱 전체 기동은
    // 영향받지 않고 실제 카카오 로그인 호출 시에만 오류가 국한된다 (google 과 동일 원칙, GAP-014-04).
    const appId = this.configService.getOrThrow<string>('KAKAO_APP_ID');

    const tokenInfoRes = await fetch('https://kapi.kakao.com/v1/user/access_token_info', {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!tokenInfoRes.ok) {
      throw new UnauthorizedException('Kakao token verification failed');
    }

    const tokenInfo = (await tokenInfoRes.json()) as KakaoAccessTokenInfo;

    // app_id 대조: 다른 카카오 앱이 발급한 토큰 재사용 공격 방지 (SEC-001)
    if (String(tokenInfo.app_id) !== appId) {
      throw new UnauthorizedException('Kakao token app mismatch');
    }

    const res = await fetch('https://kapi.kakao.com/v2/user/me', {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!res.ok) {
      throw new UnauthorizedException('Kakao token verification failed');
    }

    const data = (await res.json()) as KakaoMeResponse;

    return {
      providerId: String(data.id),
      email: data.kakao_account?.email ?? null,
      name: data.kakao_account?.profile?.nickname ?? null,
    };
  }
}
