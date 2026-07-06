---
작성: Test Agent (AUTHORING)
버전: v1.0
최종 수정: 2026-07-03 15:40
상태: 확정
---

# Test Cases: 016-naver-state-redirect-hardening

## 목차

- [SC × 시나리오 매트릭스](#sc--시나리오-매트릭스)
- [§F 회귀 마이그레이션 (T012)](#f-회귀-마이그레이션-t012)
- [외부 의존성 명시](#외부-의존성-명시)
- [미커버 항목 (사전 분류 — 4-카테고리)](#미커버-항목-사전-분류--4-카테고리)
- [실행 결과 메모 (AUTHORING 시점)](#실행-결과-메모-authoring-시점)

---

## SC × 시나리오 매트릭스

| SC-ID | 수용 기준 | Happy Path | Edge Case | Error Case | 테스트 파일·함수 | env 태그 |
|---|---|---|---|---|---|---|
| SC-001 | issue 호출 → 유효 state 값 반환 | `test_SC001_issue_returns_state` | — | — | `apps/backend/src/modules/auth/social/oauth-state.service.spec.ts` | [env:unit] |
| SC-002 | 발급된 state 에 TTL 경과 후 검증 시도 → 만료 거부 | — | `test_SC002_expired_state_consume_false` | — | `apps/backend/src/modules/auth/social/oauth-state.service.spec.ts` | [env:unit] |
| SC-003 | 유효(미만료) state 로 naver code-exchange 요청 시 검증 통과·로그인 정상 진행 | `test_SC003_valid_state_proceeds_login` | — | — | `apps/backend/src/modules/auth/social-auth.service.naver-state.spec.ts` | [env:unit] |
| SC-004 | state 불일치·만료·미제공 → 4xx(401) 거부 | — | — | `test_SC004_invalid_state_rejects_401` (`it.each` 불일치/미제공 2케이스) | `apps/backend/src/modules/auth/social-auth.service.naver-state.spec.ts` | [env:unit] |
| SC-005 | 이미 소비된 state 재사용 → 두 번째 요청 검증 실패 | — | — | `test_SC005_reused_state_rejects_401` | `apps/backend/src/modules/auth/social-auth.service.naver-state.spec.ts` | [env:unit] |
| SC-006 | kakao/google 요청은 state 유효성과 무관하게 기존 클라이언트 토큰 검증 흐름으로 정상 처리 | `test_SC006_kakao_google_skip_state` (`it.each(['kakao','google'])`) | — | — | `apps/backend/src/modules/auth/social-auth.service.naver-state.spec.ts` | [env:unit] |
| SC-007 | NAVER_REDIRECT_URI 설정 시 토큰 교환 요청에 redirect_uri 포함 | `test_SC007_redirect_uri_included` | — | — | `apps/backend/src/modules/auth/social/naver.provider.spec.ts` | [env:unit] |
| SC-008 | NAVER_REDIRECT_URI 미설정 시 토큰 교환 요청에 redirect_uri 미포함(기존 동작 유지) | `test_SC008_redirect_uri_omitted` | — | — | `apps/backend/src/modules/auth/social/naver.provider.spec.ts` | [env:unit] |
| SC-009 | 네이버 관련 API P95 응답 3초 이내 | — | — | — | (deferred — 아래 "미커버 항목" 참조) | [env:e2e-docker] |
| SC-010 | 연속 발급 시 매번 서로 다른 state 값(예측 불가능성) | `test_SC010_issue_distinct_values` (N=20, Set size===N) | — | — | `apps/backend/src/modules/auth/social/oauth-state.service.spec.ts` | [env:unit] |
| SC-011 | 015 산출물 kakao/google 기존 단위 테스트 스위트 회귀 0 | (기존 스위트 4종 §F 마이그레이션 후 PASS 유지 — 아래 절 참조) | — | — | `social-auth.service.naver.spec.ts`, `social-auth.service.autolink-policy.spec.ts`, `social-auth.service.naver-autolink-exclusion.spec.ts`, `social-auth.service.spec.ts` | [env:unit] |
| SC-012 | state 저장을 위한 신규 외부 저장소 클라이언트 패키지 미추가 | — | — | — | `apps/backend/package.json` grep(redis/ioredis/upstash) — 5b EXECUTION 확인 | [env:static] |
| SC-013 | `.env.example` 에 NAVER_REDIRECT_URI 항목 존재 | — | — | — | `apps/backend/.env.example` grep — 5b EXECUTION 확인 | [env:static] |
| SC-014 | SEC-015-02 가 6단계 Security Agent 재감사에서 RESOLVED 판정 | — | — | — | (테스트 아님 — 6단계 Security Agent 위임) | [env:static] |
| SC-015 | SEC-015-03 이 6단계 Security Agent 재감사에서 RESOLVED 또는 잔존-권고 판정 | — | — | — | (테스트 아님 — 6단계 Security Agent 위임) | [env:static] |

> SC-014·SC-015 는 D 레이어 테스트 태스크가 아니다(tasks.md "SC-009/SC-014/SC-015 (D 레이어 아님)" 절). 본 5a 산출물은 SC 매핑 매트릭스에 명시만 하며 검증 주체는 6단계 Security Agent 다.

---

## §F 회귀 마이그레이션 (T012)

tasks.md T011/T012 기준으로 4개 기존 015/014 테스트 파일에 아래 마이그레이션을 적용했다(신규 SC 매핑 아님, SC-011 회귀 0 목적).

| 파일 | 변경 내용 |
|---|---|
| `social-auth.service.naver.spec.ts` | `OAuthStateService` mock provider 추가(DI 해석) + `beforeEach` 에서 `consume` 기본값 `true` 고정. 기존 naver 케이스는 이미 3번째 인자로 `state` 를 전달하고 있어 로그인 호출부 변경 불요. |
| `social-auth.service.autolink-policy.spec.ts` | `OAuthStateService` mock provider 추가 + naver 케이스(`consume`→true) `login('naver', ...)` 호출에 state 인자 추가(`'state-autolink-blocked'`, `'state-autolink-newuser'`). kakao/google `it.each` 케이스는 state 분기 미진입으로 무변경. |
| `social-auth.service.naver-autolink-exclusion.spec.ts` | `OAuthStateService` mock provider 추가 + naver 케이스(`consume`→true) `login('naver', ...)` 호출에 state 인자 추가(`'state-attacker'`, `'state-relogin'`). kakao/google `it.each` 케이스 무변경. |
| `social-auth.service.spec.ts` (014) | `OAuthStateService` mock provider 추가(DI 해석용). kakao/google 만 다루므로 `consume` mock 동작·로그인 호출부 변경 불요(FR-006 분기 미진입). |
| `naver.provider.spec.ts` | `buildConfigService` 에 `get: jest.fn((key) => values[key])` 추가(미설정 키 undefined 반환) — `NaverProvider.verify` 의 신규 `configService.get('NAVER_REDIRECT_URI')` 호출로 인한 TypeError 회귀 방지. 기존 SC-002/003/004 케이스는 이 mock 추가만으로 무변경 유지. |

---

## 외부 의존성 명시

- fixture: 없음(순수 mock 기반 단위 테스트)
- mock: `SocialProviderResolver`, `SocialProviderPort`(kakao/naver), `AuthRepository`, `AuthService`, `OAuthStateService` — 전부 `jest.fn()` 기반 수동 mock. `ConfigService`(naver.provider.spec.ts) 는 `getOrThrow`/`get` 양쪽 메서드를 지원하는 수동 stub.
- 환경 변수: 없음(테스트 실행 자체는 환경변수 무의존 — `NAVER_REDIRECT_URI` 는 mock ConfigService 값으로 대체)
- 외부 서비스: `fetch` 전역 mock(`naver.provider.spec.ts` — nid.naver.com/openapi.naver.com 호출 시뮬레이션). 실 네트워크 호출 없음.

---

## 미커버 항목 (사전 분류 — 4-카테고리)

| SC-ID | 미커버 사유 | 카테고리 | 권장 검증 방법 |
|---|---|---|---|
| SC-009 | 실 OAuth 크레덴셜·네이티브 연동 없이는 P95 응답시간 측정 불가(spec.md 명시 deferred, 015 SC-016 과 동일 처리) | (3) 운영 환경에서 확인 권장 | 실 크레덴셜 발급 및 네이티브 앱 배선 완료 후 운영 환경에서 P95 측정 |

> 그 외 SC-001~008, SC-010~013 은 전량 단위/정적 테스트로 커버되어 미커버 항목 없음. `SPEC_ROOT/test/coverage-gap.md` 는 5b EXECUTION 단계에서 SC-009 1건을 반영해 작성한다(의무 산출물 — 미커버 SC 1건 이상 존재).

---

## 실행 결과 메모 (AUTHORING 시점)

PPG-1 병렬 진행 중 Development Agent(4단계)의 A·B·C 레이어(T001~T008) 구현이 본 5a 작업 시점에 이미 완료 상태였음을 확인했다(`schema.prisma`/마이그레이션/`OAuthStateService`/`SocialAuthService`/`NaverProvider`/`AuthController`/`.env.example` 전부 실재). 이에 따라 신규·마이그레이션 대상 테스트 7개 파일을 `pnpm exec jest`(대상 파일 한정 + 전체 스위트)로 1회 자체 실행 검증했다 — 전체 35개 스위트 334개 테스트 전량 PASS(신규 3파일 신설 + 4파일 §F 마이그레이션 포함, 회귀 0). `pnpm exec tsc --noEmit` 도 0 error. 통상적인 TDD Red(컴파일/단언 실패 허용) 는 이 시점 기준 관측되지 않았으나, 이는 병렬 트랙의 진행 속도 차이에 따른 우연한 결과이며 5b EXECUTION 단계의 공식 재검증을 대체하지 않는다.
