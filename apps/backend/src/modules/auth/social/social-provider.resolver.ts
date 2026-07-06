import { Injectable, UnauthorizedException } from '@nestjs/common';
import { KakaoProvider } from './kakao.provider';
import { GoogleProvider } from './google.provider';
import { NaverProvider } from './naver.provider';
import { SocialProviderPort } from './social-provider.port';

/**
 * 제공자 문자열 → SocialProviderPort 구현체 매핑.
 * Naver 는 code-exchange 전환(ADR-001)으로 앱 바인딩을 확보하여 활성 provider 집합에 재편입되었다.
 */
@Injectable()
export class SocialProviderResolver {
  private readonly providers: Record<string, SocialProviderPort>;

  constructor(
    private readonly kakao: KakaoProvider,
    private readonly google: GoogleProvider,
    private readonly naver: NaverProvider,
  ) {
    this.providers = {
      kakao: this.kakao,
      google: this.google,
      naver: this.naver,
    };
  }

  resolve(provider: string): SocialProviderPort {
    const impl = this.providers[provider];
    if (!impl) {
      throw new UnauthorizedException(`Unsupported social provider: ${provider}`);
    }
    return impl;
  }
}
