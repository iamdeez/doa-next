import { Injectable } from '@nestjs/common';
import { SocialProfile, SocialProviderPort } from './social-provider.port';

/**
 * 테스트 전용 소셜 제공자 스텁.
 * 토큰을 JSON.parse 하여 SocialProfile 을 직접 반환한다.
 * 예: token = '{"providerId":"u1","email":"a@b.com","name":"Test"}'
 */
@Injectable()
export class StubSocialProvider extends SocialProviderPort {
  async verify(token: string): Promise<SocialProfile> {
    return JSON.parse(token) as SocialProfile;
  }
}
