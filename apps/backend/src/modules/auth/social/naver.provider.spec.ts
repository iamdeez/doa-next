/**
 * Test: NaverProvider — code-exchange (SC-002, SC-003, SC-004, v1.1.0/015 spec)
 *
 * TDD Red 상태: `NaverProvider` 가 아직 code-exchange 방식으로 재작성되지 않았다
 * (T-B2 Development 병렬 진행, PPG-1). 아래 시그니처는 tasks.md "Test Authoring
 * Contract" canonical 을 기준으로 작성했으며, production 미구현 상태에서의 컴파일/
 * 실행 오류는 허용한다(계약 검증). production 구현 완료 후 이 파일이 PASS 상태로
 * 전환된다.
 *
 * 흐름: POST nid.naver.com/oauth2.0/token(code-exchange) → access_token 획득
 *      → GET openapi.naver.com/v1/nid/me(Bearer) → SocialProfile 반환.
 *
 * [§F 마이그레이션 + SC-007/SC-008, v1.1.0/016 spec] `verify` 가 내부에서
 * `configService.get<string>('NAVER_REDIRECT_URI')`(getOrThrow 아님) 를 신규 호출한다
 * (tasks.md T006). `buildConfigService` 에 `get` mock 을 추가해 미설정 키는 undefined
 * 를 반환하도록 하여 기존 SC-002/003/004 케이스의 TypeError 회귀를 방지하고, 아래
 * SC-007(redirect_uri 포함)/SC-008(미포함) 테스트를 신규 추가한다.
 */

import { ConfigService } from '@nestjs/config';
import { UnauthorizedException } from '@nestjs/common';
import { NaverProvider } from './naver.provider';

const CLIENT_ID = 'test-naver-client-id';
const CLIENT_SECRET = 'test-naver-client-secret';

/** NAVER_CLIENT_ID / NAVER_CLIENT_SECRET 키별로 값을 구분해 반환하는 ConfigService mock. */
function buildConfigService(overrides: Record<string, string> = {}): ConfigService {
  const values: Record<string, string> = {
    NAVER_CLIENT_ID: CLIENT_ID,
    NAVER_CLIENT_SECRET: CLIENT_SECRET,
    ...overrides,
  };
  return {
    getOrThrow: jest.fn((key: string) => {
      if (!(key in values)) {
        throw new Error(`Unexpected config key requested: ${key}`);
      }
      return values[key];
    }),
    // NAVER_REDIRECT_URI(FR-007/008)는 getOrThrow 가 아닌 get 으로 조회되므로
    // 미설정 키는 undefined 를 그대로 반환한다(fail-safe, §F).
    get: jest.fn((key: string) => values[key]),
  } as unknown as ConfigService;
}

/** URLSearchParams 또는 문자열 형태의 form body 를 조회 가능한 URLSearchParams 로 정규화한다. */
function parseFormBody(body: unknown): URLSearchParams {
  if (body instanceof URLSearchParams) return body;
  return new URLSearchParams(String(body));
}

function mockFetchSequence(responses: Array<{ ok: boolean; body: unknown }>): jest.Mock {
  const mockFetch = jest.fn();
  for (const { ok, body } of responses) {
    mockFetch.mockResolvedValueOnce({
      ok,
      json: () => Promise.resolve(body),
    });
  }
  (global as unknown as { fetch: typeof fetch }).fetch = mockFetch as unknown as typeof fetch;
  return mockFetch;
}

describe('NaverProvider — code-exchange (v1.1.0/015)', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  // ── SC-002 (FR-002, FR-004): code 교환 stub → 프로필 조회 stub 순차 흐름 ────
  it('test_SC002_code_exchange_then_profile_returns_profile', async () => {
    const mockFetch = mockFetchSequence([
      {
        ok: true,
        body: { access_token: 'naver-access-token-xyz', token_type: 'bearer', expires_in: 3600 },
      },
      {
        ok: true,
        body: {
          resultcode: '00',
          message: 'success',
          response: { id: 'naver-uid-1', email: 'user@naver.com', name: '네이버유저' },
        },
      },
    ]);
    const provider = new NaverProvider(buildConfigService());

    const profile = await provider.verify('valid-auth-code', { state: 'state-abc' });

    // 순차 흐름: 1) 토큰 교환 2) 프로필 조회 — 정확히 2회 호출
    expect(mockFetch).toHaveBeenCalledTimes(2);

    const [tokenUrl, tokenInit] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(tokenUrl).toBe('https://nid.naver.com/oauth2.0/token');
    expect(tokenInit.method).toBe('POST');
    const body = parseFormBody(tokenInit.body);
    expect(body.get('grant_type')).toBe('authorization_code');
    expect(body.get('client_id')).toBe(CLIENT_ID);
    expect(body.get('client_secret')).toBe(CLIENT_SECRET);
    expect(body.get('code')).toBe('valid-auth-code');
    expect(body.get('state')).toBe('state-abc');

    const [profileUrl, profileInit] = mockFetch.mock.calls[1] as [
      string,
      { headers: Record<string, string> },
    ];
    expect(profileUrl).toBe('https://openapi.naver.com/v1/nid/me');
    expect(profileInit.headers.Authorization).toBe('Bearer naver-access-token-xyz');

    expect(profile).toEqual({
      providerId: 'naver-uid-1',
      email: 'user@naver.com',
      name: '네이버유저',
    });
  });

  it('test_SC002_state_omitted_still_completes_flow', async () => {
    // context 미전달(state undefined)이어도 흐름이 정상 완료된다(context optional).
    mockFetchSequence([
      { ok: true, body: { access_token: 'naver-access-token-nostate' } },
      {
        ok: true,
        body: {
          resultcode: '00',
          message: 'success',
          response: { id: 'naver-uid-nostate', email: 'nostate@naver.com', name: null },
        },
      },
    ]);
    const provider = new NaverProvider(buildConfigService());

    const profile = await provider.verify('code-without-state');

    expect(profile).toEqual({
      providerId: 'naver-uid-nostate',
      email: 'nostate@naver.com',
      name: null,
    });
  });

  // ── SC-003 (FR-003): 무효·만료·재사용 code → 4xx ──────────────────────────
  it('test_SC003_invalid_code_throws_unauthorized', async () => {
    mockFetchSequence([
      {
        ok: true,
        body: { error: 'invalid_grant', error_description: 'authorization code expired' },
      },
    ]);
    const provider = new NaverProvider(buildConfigService());

    await expect(provider.verify('expired-code')).rejects.toThrow(UnauthorizedException);
  });

  it('test_SC003_token_exchange_http_failure_throws_unauthorized', async () => {
    mockFetchSequence([{ ok: false, body: {} }]);
    const provider = new NaverProvider(buildConfigService());

    await expect(provider.verify('bad-code')).rejects.toThrow(UnauthorizedException);
  });

  it('test_SC003_missing_access_token_in_success_body_throws_unauthorized', async () => {
    // res.ok=true 이나 access_token 필드 자체가 부재한 방어적 케이스.
    mockFetchSequence([{ ok: true, body: { token_type: 'bearer' } }]);
    const provider = new NaverProvider(buildConfigService());

    await expect(provider.verify('code-without-access-token')).rejects.toThrow(
      UnauthorizedException,
    );
  });

  // ── SC-004 (FR-004): 반환 프로필에 access_token 미포함 ────────────────────
  it('test_SC004_access_token_not_in_returned_profile', async () => {
    mockFetchSequence([
      { ok: true, body: { access_token: 'naver-access-token-should-not-leak' } },
      {
        ok: true,
        body: {
          resultcode: '00',
          message: 'success',
          response: { id: 'naver-uid-2', email: 'leak-check@naver.com', name: '유출체크' },
        },
      },
    ]);
    const provider = new NaverProvider(buildConfigService());

    const profile = await provider.verify('valid-code-2');

    expect(profile).not.toHaveProperty('access_token');
    expect(profile).not.toHaveProperty('accessToken');
    expect(JSON.stringify(profile)).not.toContain('naver-access-token-should-not-leak');
  });

  // ── SC-007 (FR-007, v1.1.0/016): NAVER_REDIRECT_URI 설정 시 토큰교환에 포함 ──
  it('test_SC007_redirect_uri_included', async () => {
    const mockFetch = mockFetchSequence([
      { ok: true, body: { access_token: 'naver-access-token-redirect' } },
      {
        ok: true,
        body: {
          resultcode: '00',
          message: 'success',
          response: { id: 'naver-uid-redirect', email: 'redirect@naver.com', name: '리다이렉트유저' },
        },
      },
    ]);
    const provider = new NaverProvider(
      buildConfigService({ NAVER_REDIRECT_URI: 'https://app.doa-market.com/auth/naver/callback' }),
    );

    await provider.verify('code-with-redirect-uri', { state: 'state-redirect' });

    const [, tokenInit] = mockFetch.mock.calls[0] as [string, RequestInit];
    const body = parseFormBody(tokenInit.body);
    expect(body.get('redirect_uri')).toBe('https://app.doa-market.com/auth/naver/callback');
  });

  // ── SC-008 (FR-008, v1.1.0/016): NAVER_REDIRECT_URI 미설정 시 파라미터 생략 ──
  it('test_SC008_redirect_uri_omitted', async () => {
    const mockFetch = mockFetchSequence([
      { ok: true, body: { access_token: 'naver-access-token-no-redirect' } },
      {
        ok: true,
        body: {
          resultcode: '00',
          message: 'success',
          response: { id: 'naver-uid-no-redirect', email: 'no-redirect@naver.com', name: '기본유저' },
        },
      },
    ]);
    const provider = new NaverProvider(buildConfigService());

    await provider.verify('code-without-redirect-uri', { state: 'state-no-redirect' });

    const [, tokenInit] = mockFetch.mock.calls[0] as [string, RequestInit];
    const body = parseFormBody(tokenInit.body);
    expect(body.has('redirect_uri')).toBe(false);
  });
});
