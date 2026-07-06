/**
 * Regression test: KakaoProvider — SEC-001 (High) app_id 바인딩 검증.
 * SC-XXX 매핑 없음 (5a Test Agent 책임 범위 외 — Development Agent 보안 회귀 테스트).
 *
 * GoogleProvider 의 aud 검증과 동일한 목적으로, access_token_info 응답의 app_id 를
 * KAKAO_APP_ID 와 대조하여 타 카카오 앱이 발급한 토큰의 재사용을 거부하는지 검증한다.
 */

import { ConfigService } from '@nestjs/config';
import { UnauthorizedException } from '@nestjs/common';
import { KakaoProvider } from './kakao.provider';

const EXPECTED_APP_ID = '123456';

function buildConfigService(appId = EXPECTED_APP_ID): ConfigService {
  return {
    getOrThrow: jest.fn().mockReturnValue(appId),
  } as unknown as ConfigService;
}

function mockFetchSequence(responses: Array<{ ok: boolean; body: unknown }>): void {
  const mockFetch = jest.fn();
  for (const { ok, body } of responses) {
    mockFetch.mockResolvedValueOnce({
      ok,
      json: () => Promise.resolve(body),
    });
  }
  (global as unknown as { fetch: typeof fetch }).fetch = mockFetch as unknown as typeof fetch;
}

describe('KakaoProvider — SEC-001 app_id binding', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('일치하는 app_id 의 토큰은 정상적으로 프로필을 반환한다 (정상 케이스)', async () => {
    mockFetchSequence([
      { ok: true, body: { id: 1, expires_in: 3600, app_id: Number(EXPECTED_APP_ID) } },
      {
        ok: true,
        body: { id: 42, kakao_account: { email: 'a@b.com', profile: { nickname: '홍길동' } } },
      },
    ]);
    const provider = new KakaoProvider(buildConfigService());

    const profile = await provider.verify('valid-token');

    expect(profile).toEqual({
      providerId: '42',
      email: 'a@b.com',
      name: '홍길동',
    });
  });

  it('타 앱이 발급한 토큰(app_id 불일치)은 UnauthorizedException 으로 거부된다', async () => {
    mockFetchSequence([{ ok: true, body: { id: 1, expires_in: 3600, app_id: 999999 } }]);
    const provider = new KakaoProvider(buildConfigService());

    await expect(provider.verify('foreign-app-token')).rejects.toThrow(UnauthorizedException);
  });

  it('access_token_info 호출이 실패하면 UnauthorizedException 을 던진다', async () => {
    mockFetchSequence([{ ok: false, body: {} }]);
    const provider = new KakaoProvider(buildConfigService());

    await expect(provider.verify('invalid-token')).rejects.toThrow(UnauthorizedException);
  });
});
