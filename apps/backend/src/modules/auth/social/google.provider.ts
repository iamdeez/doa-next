import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SocialProfile, SocialProviderPort } from './social-provider.port';

/** Google tokeninfo 엔드포인트 응답 필드 */
interface GoogleTokenInfo {
  sub: string;
  email?: string;
  name?: string;
  aud: string;
  /** "true" 또는 "false" 문자열 */
  email_verified?: string;
  error_description?: string;
}

/**
 * 구글 소셜 로그인 제공자.
 * 클라이언트 SDK 가 발급한 id_token 을 tokeninfo 엔드포인트로 검증한다.
 * aud === GOOGLE_CLIENT_ID 검증 필수 (ADR-002).
 */
@Injectable()
export class GoogleProvider extends SocialProviderPort {
  constructor(private readonly configService: ConfigService) {
    super();
  }

  async verify(token: string): Promise<SocialProfile> {
    // NFR-004: 크레덴셜 조회를 호출 시점으로 지연 — 미설정 시에도 앱 전체 기동은
    // 영향받지 않고 실제 구글 로그인 호출 시에만 오류가 국한된다 (Kakao/Naver 와 동일 원칙).
    const clientId = this.configService.getOrThrow<string>('GOOGLE_CLIENT_ID');

    const url = `https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(token)}`;
    const res = await fetch(url);

    const data = (await res.json()) as GoogleTokenInfo;

    if (!res.ok || data.error_description) {
      throw new UnauthorizedException('Google token verification failed');
    }

    // aud 검증: 다른 클라이언트가 발급한 토큰 재사용 공격 방지
    if (data.aud !== clientId) {
      throw new UnauthorizedException('Google token audience mismatch');
    }

    // email_verified 는 문자열 "true"/"false" 로 반환됨
    if (data.email_verified !== 'true') {
      throw new UnauthorizedException('Google email not verified');
    }

    return {
      providerId: data.sub,
      email: data.email ?? null,
      name: data.name ?? null,
    };
  }
}
