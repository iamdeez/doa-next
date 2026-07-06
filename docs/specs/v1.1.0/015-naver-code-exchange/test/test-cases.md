---
작성: Test Agent (AUTHORING)
버전: v1.1
최종 수정: 2026-07-03 13:31
상태: 확정
---

> **v1.1 재작업 (SEC-015-01, GAP-015-04)**: 6단계 Security Agent 재감사가 naver 자동연동
> (Path 3b)의 이메일 소유권 미검증 계정 탈취(High)를 확정함에 따라, 사용자 결정으로
> naver 를 `AUTO_LINK_PROVIDERS` 에서 재차단했다. 이에 따라 naver 자동연동을 검증하던
> SC-006/SC-010 매핑을 아래와 같이 조정한다. production(A·B·C 레이어) 코드는 본
> 재작업에서 변경하지 않았다(Development Agent 병렬 담당 — `social-auth.service.ts`
> `AUTO_LINK_PROVIDERS` 재차단 확인 완료).

# Test Cases: 015-naver-code-exchange

> Branch: 015-naver-code-exchange | Mode: AUTHORING (5a, PPG-1) | Tasks: [../design/tasks.md](../design/tasks.md)

## 목차

- [SC × 시나리오 매트릭스](#sc--시나리오-매트릭스)
- [외부 의존성 명시](#외부-의존성-명시)
- [미커버 항목 (사전 분류 — 4-카테고리)](#미커버-항목-사전-분류--4-카테고리)
- [SC 없는 FR 역방향 검증](#sc-없는-fr-역방향-검증)
- [T-D3 마이그레이션 확인](#t-d3-마이그레이션-확인)
- [AUTHORING 자체 검증 결과](#authoring-자체-검증-결과)

---

## SC × 시나리오 매트릭스

| SC-ID | 수용 기준 | Happy Path | Edge Case | Error Case | 테스트 파일·함수 | env 태그 |
|---|---|---|---|---|---|---|
| SC-001 | `provider:'naver'` 요청이 400 거부되지 않고 처리 흐름 진입 | `test_SC001_naver_provider_resolves_and_enters_flow` | — | — | `apps/backend/src/modules/auth/social-auth.service.naver.spec.ts` | [env:unit] |
| SC-002 | code 교환 stub → 프로필 조회 stub 순차 흐름 + JWT 반환 | `test_SC002_code_exchange_then_profile_returns_profile`, `test_SC002_state_omitted_still_completes_flow` | — | — | `apps/backend/src/modules/auth/social/naver.provider.spec.ts` | [env:unit] |
| SC-003 | 무효·만료 code → 4xx | — | — | `test_SC003_invalid_code_throws_unauthorized`, `test_SC003_token_exchange_http_failure_throws_unauthorized`, `test_SC003_missing_access_token_in_success_body_throws_unauthorized` | `apps/backend/src/modules/auth/social/naver.provider.spec.ts` | [env:unit] |
| SC-004 | 반환 프로필에 access_token 미포함 | — | `test_SC004_access_token_not_in_returned_profile` | — | `apps/backend/src/modules/auth/social/naver.provider.spec.ts` | [env:unit] |
| SC-005 | kakao/google 클라이언트 토큰 검증 흐름 무변경 + JWT | (기존 유지) | — | — | `apps/backend/src/modules/auth/social-auth.service.spec.ts` (014 산출물, 무변경) | [env:unit] 회귀 |
| SC-006 | ~~naver email 자동연동(AUTO_LINK_PROVIDERS 재편입)~~ — **naver 범위 Out of Scope 재분류(SEC-015-01, GAP-015-04)**. kakao/google 자동연동은 SC-006 표제 범위 밖(SC-005 회귀 대상)이나 기존 동작대로 계속 허용·검증됨(아래 T-D3 참조) | — (naver 자동연동은 더 이상 발생하지 않음) | — | `test_SEC01501_naver_auto_link_blocked_conflict`(naver 차단 검증, SC-006 대체), `it('naver 로그인 시 동일 이메일의 기존 계정이 있어도 자동 연동하지 않고 Conflict 로 거부한다 (SEC-015-01)')`(canonical) | `apps/backend/src/modules/auth/social-auth.service.naver.spec.ts` + `social-auth.service.autolink-policy.spec.ts`(canonical — 하단 §T-D3 참조) | [env:unit] |
| SC-007 | naver 재로그인(기연동 provider+providerId) | `test_SC007_naver_relogin_existing_social_account` | — | — | `apps/backend/src/modules/auth/social-auth.service.naver.spec.ts` | [env:unit] |
| SC-008 | naver 신규가입 | `test_SC008_naver_new_user_created` | — | — | `apps/backend/src/modules/auth/social-auth.service.naver.spec.ts` | [env:unit] |
| SC-009 | naver email 미반환 → 400 | — | — | `test_SC009_naver_email_null_returns_400` | `apps/backend/src/modules/auth/social-auth.service.naver.spec.ts` | [env:unit] |
| SC-010 | ~~3경로~~ → **naver 2경로(재로그인·신규가입)만 대상 — 자동연동 경로는 SEC-015-01 로 제거(SC-006 Out of Scope 와 동일 사유)**. kakao/google 자동연동 토큰 형식은 `social-auth.service.spec.ts`(014 산출물, 무변경)가 `TOKEN_RESULT` 형식 일치로 별도 커버 | `test_SC010_naver_relogin_path_returns_token_pair`, `test_SC010_naver_new_user_path_returns_token_pair` | — | — | `apps/backend/src/modules/auth/social-auth.service.naver.spec.ts` | [env:unit] |
| SC-011 | 네이버 버튼 GestureDetector + `onNaver` 핸들러 존재 | `test_SC011_naver_button_gesture_and_handler` | — | — | `mobile/customer_app/test/features/naver_social_login_static_test.dart` | [env:static] |
| SC-012 | 인앱 WebView 미사용 + 시스템 브라우저 메커니즘(`flutter_web_auth_2`/`signInWithNaver`) 존재 | `test_SC012_no_inapp_webview_system_browser_mechanism` | — | — | `mobile/customer_app/test/features/naver_social_login_static_test.dart` | [env:static] |
| SC-013 | 취소 → 화면 유지·오류 미표시 | — | `test_SC013_naver_cancelled_stays_no_error` | — | `mobile/customer_app/test/features/naver_social_login_flow_test.dart` | [env:unit] |
| SC-014 | 실패(4xx/네트워크) → 오류 메시지 표시 | — | — | `test_SC014_naver_failure_shows_error` | `mobile/customer_app/test/features/naver_social_login_flow_test.dart` | [env:unit] |
| SC-015 | 성공 → TokenStore 저장 + authenticated 전이 | `test_SC015_naver_success_stores_tokens_navigates` | — | — | `mobile/customer_app/test/features/naver_social_login_flow_test.dart` | [env:unit] |
| SC-016 | P95 ≤ 3초(실 OAuth) | — | — | — | **deferred** (하단 §미커버 항목 (3)) | [env:e2e-docker] |
| SC-017 | `.env.example` NAVER_* 존재 + client_secret 비노출(로그·클라이언트 코드) | `test_SC017_env_naver_credentials_and_no_secret_leak` | — | — | `mobile/customer_app/test/features/naver_social_login_static_test.dart` | [env:static] |
| SC-018 | Security Agent 재감사 Critical/High 0건 | — | — | — | Security Agent(6단계, 감사 위임) | [env:static] |
| SC-019 | 014 kakao/google 스위트 100% PASS(회귀 0) | (기존 유지) | — | — | `apps/backend/src/modules/auth/social-auth.service.spec.ts`, `kakao.provider.spec.ts`, `auth.service.spec.ts` (014 산출물, 무변경) | [env:unit] 회귀 |
| SC-020 | `flutter analyze` 0 issues | — | — | — | (CI 명령) + `naver_social_login_static_test.dart::test_SC020_flutter_analyze_zero_issues_note`(마커) | [env:static] |

> 시나리오 유형 커버리지: Happy(SC-001/002/005/007/008/010/011/012/015/019) · Edge(SC-004/013) · Error(SC-003/006(naver 차단, SEC-015-01)/009/014). SC-006 은 naver 자동연동 Out of Scope 재분류(SEC-015-01)로 Happy → Error(차단 검증)로 유형이 전환됨. 세 유형 모두 커버(spec.md 요구사항 구조화 매트릭스와 정합, 단 SC-006 은 spec.md 문언과의 불일치가 있어 §미커버 항목에 별도 기재).

---

## 외부 의존성 명시

- **fixture**: 없음(신규 fixture 파일 불요 — 인라인 상수 프로필/사용자 객체 사용).
- **mock**:
  - `global.fetch`(Jest) — 네이버 토큰 교환(`nid.naver.com/oauth2.0/token`) + 프로필 조회(`openapi.naver.com/v1/nid/me`) 순차 stub. `mockResolvedValueOnce` 체이닝(kakao.provider.spec.ts §mockFetchSequence 패턴 재사용).
  - `ConfigService`(NestJS) — `getOrThrow('NAVER_CLIENT_ID'|'NAVER_CLIENT_SECRET')` 키별 값 반환 mock.
  - `SocialProviderResolver`·`AuthRepository`·`AuthService` — `jest.fn()` 기반 mock(014 패턴 재사용).
  - Flutter `socialAuthServiceProvider`·`dioProvider`·`tokenStoreProvider`(Riverpod override) — `_StubSocialAuthService`(naver 전용, 취소/성공 분기)·`Dio` interceptor(성공/오류 응답)·`_FakeTokenStore`(in-memory, `FlutterSecureStorage` 플랫폼 채널 무의존).
- **환경 변수**: 실행 시 불필요(전 항목 mock). 운영 환경 `NAVER_CLIENT_ID`/`NAVER_CLIENT_SECRET` 은 `.env.example` 존재만 정적 검증(SC-017).
- **외부 서비스**: 실 네이버 OAuth 서버 호출 없음(전 SC unit/static, 옵션 B 정책).

---

## 미커버 항목 (사전 분류 — 4-카테고리)

단위테스트로 검증 불가능한 SC 를 사전 분류하여 5b 의 `coverage-gap.md` 작성에 참조한다.

| SC-ID | 미커버 사유 | 카테고리 | 권장 검증 방법 |
|---|---|---|---|
| SC-006 | spec.md 원문("네이버 로그인 요청 시 기존 계정에 자동 연동되고 JWT 반환")이 SEC-015-01(High, GAP-015-04) 결정으로 naver 범위에서 더 이상 성립하지 않음(사용자 결정으로 `AUTO_LINK_PROVIDERS` 재차단). 테스트는 반대 동작(차단)을 검증하도록 조정했으나 spec.md 문언 자체는 미갱신 상태 — Test Agent 권한 밖(spec.md 수정은 Spec Agent 책임) | (4) 차후 점검 | Spec Agent 가 SC-006/SC-010 문언을 "naver 자동연동은 SEC-015-01 로 제공되지 않으며 대신 409 로 거부된다"로 갱신하도록 gaps.md 신규 등재(하단 §GAP 참조) 후 후속 spec 또는 본 spec 마감 전 정정 |
| SC-016 | 실 네이버 OAuth 크레덴셜·redirect URI 등록·기기 딥링크 캡처 없이는 P95 응답 시간을 측정할 수 없음(운영 환경 전면 의존, mock 불가) | (3) 운영 환경에서 확인 권장 | spec.md "사후 운영 검증 피드백 사이클(PROC-014)" 시나리오 1 수행 시 병행 측정. 크레덴셜 발급 후 실 기기/스테이징에서 API 응답 시간 로깅 |
| SC-018 | 코드 취약점 판정은 단위테스트 프레임워크가 아닌 보안 감사 절차의 산출물 | (2) 단위테스트 불가 | 6단계 Security Agent 재감사(파이프라인 내 필수 활성 단계) — 별도 운영 위임 아님 |
| SC-020 (`flutter analyze` 실행 자체) | `dart:test` 러너 내에서 `flutter analyze` CLI 를 하위 프로세스로 실행하는 것은 표준 단위테스트 관행이 아님(014 선례 동일 처리) | (2) 단위테스트 불가 | CI 파이프라인에서 `flutter analyze --no-pub lib/` 별도 step 실행. 본 spec 은 마커 노트(`test_SC020_flutter_analyze_zero_issues_note`)로 위임 표시만 수행 |
| (참고) 실 네이버 로그인 E2E(신규 로그인·자동연동·재로그인·취소·카카오구글 회귀 5개 시나리오) | 실 크레덴셜·앱 등록·기기 딥링크 의존으로 파이프라인 내 검증 불가(spec.md 범위 외 명시) | (3) 운영 환경에서 확인 권장 | spec.md "사후 운영 검증 피드백 사이클(PROC-014)" 5개 시나리오 수동 점검. 결함 발견 시 hotfix spec |
| (참고) PKCE 지원 확장 | 본 spec 범위 외(네이버 PKCE 미지원 확정, research.md ASM-003) — 검증 대상 자체가 존재하지 않음 | (4) 차후 점검 | 네이버 PKCE 지원 공식화 시 별도 spec 에서 재검토 |

> 카테고리 (1) 단위테스트 가능 항목은 0건 — 본 spec 의 [env:unit]/[env:static] SC(001~015, 017, 019~020 정적 위젯 검증부)는 전건 T-D1~D5 테스트 파일로 작성 완료.
> 카테고리 (2)(3)(4) 만 존재 → 5b EXECUTION 단계로 위임 종료 가능(Development Agent 복귀 불요).

---

## SC 없는 FR 역방향 검증

spec.md FR-001~013 전건이 요구사항 구조화 매트릭스에서 SC-XXX 에 매핑됨을 확인(spec.md §요구사항 구조화 매트릭스 직접 대조).

| FR-ID | 매핑 SC-ID | 확인 |
|---|---|---|
| FR-001 | SC-001 | ✓ |
| FR-002 | SC-002, SC-003 | ✓ |
| FR-003 | SC-003 | ✓ |
| FR-004 | SC-002, SC-004 | ✓ |
| FR-005 | SC-005 | ✓ |
| FR-006 | SC-006, SC-007, SC-008 | ✓ |
| FR-007 | SC-009 | ✓ |
| FR-008 | SC-010 | ✓ |
| FR-009 | SC-011 | ✓ |
| FR-010 | SC-012 | ✓ |
| FR-011 | SC-013 | ✓ |
| FR-012 | SC-014 | ✓ |
| FR-013 | SC-015 | ✓ |

**결과**: SC 없는 FR 0건.

---

## T-D3 마이그레이션 확인

### 1차 (naver 자동연동 재허용 반영)

`apps/backend/src/modules/auth/social-auth.service.autolink-policy.spec.ts` (기존 014 산출물) 을 015 정책(naver 자동연동 재허용)에 맞춰 수정 완료:

- naver-denial `it()`(ConflictException 기대, 014 정책 인코딩) → **삭제 후** naver 자동연동 성공을 검증하는 `it()`(SC-006 정합)로 대체.
- `it.each(['kakao','google'])` → `it.each(['kakao','google','naver'])` 로 naver 편입(자동연동 허용 회귀 검증 확장).
- naver path 3c 테스트(겹치는 계정 없음 → 독립 신규 계정 생성)는 무변경 유지.
- 파일 헤더·describe 제목 주석을 015 정책(naver 자동연동 재허용, ADR-004, NFR-003)으로 갱신.

### 2차 재작업 (SEC-015-01 — naver 자동연동 재차단, 본 v1.1 문서)

6단계 Security Agent 재감사가 SEC-015-01(High, GAP-015-04 — 이메일 소유권 미검증에 의한
계정 탈취)을 확정함에 따라 사용자 결정으로 1차의 naver 자동연동 허용을 되돌린다:

- `social-auth.service.autolink-policy.spec.ts`: naver 자동연동 허용 `it()` → 1차 이전(014
  naver-denial) 패턴으로 되돌려 `ConflictException` 재단언(SEC-015-01 근거로 docstring 갱신).
  `it.each(['kakao','google','naver'])` → `it.each(['kakao','google'])` 로 naver 제거(단, naver
  단독 차단 검증은 위 되돌린 `it()`가 전담하므로 커버리지 손실 없음). path 3c 테스트는 이번에도
  무변경 유지(AUTO_LINK_PROVIDERS 와 무관한 경로).
- `social-auth.service.naver.spec.ts`: `test_SC006_naver_auto_link_existing_email`(자동연동 성공
  단언) → `test_SEC01501_naver_auto_link_blocked_conflict`(차단 단언, SC-006 대체)로 치환.
  `test_SC010_naver_autolink_path_returns_token_pair` 삭제(해당 경로가 더 이상 토큰을 반환하지
  않으므로) — SC-010 은 naver 기준 2경로(재로그인·신규가입)로 축소.
- 파일 헤더 주석을 SEC-015-01/GAP-015-04 근거로 갱신, canonical 계약은
  `social-auth.service.autolink-policy.spec.ts` 로 지정(naver.spec.ts 의 동등 테스트는 조기
  감지용 보조 역할로 명시).

A·B·C 레이어(production 코드) 는 1차·2차 마이그레이션 모두 변경하지 않았다(D 레이어 한정 수정,
production `AUTO_LINK_PROVIDERS` 재차단은 4단계 Development Agent 병렬 담당 — PPG-1 재작업에서
`social-auth.service.ts:30` 확인 완료).

---

## AUTHORING 자체 검증 결과

### 1차 (naver 자동연동 재허용 반영 시점)

PPG-1 병렬 진행 중 4단계 Development Agent 가 B·C 레이어(T-B1~5, T-C1~4)를 본 AUTHORING 작업과 동시에 완료하여, 아래 실행 결과로 계약 정합성을 자체 확인했다(참고 정보 — 5b EXECUTION 의 공식 실행·판정을 대체하지 않음):

- 백엔드: `pnpm test -- --testPathPattern="naver.provider.spec|social-auth.service.naver.spec|social-auth.service.autolink-policy.spec"` → 3 suites / 19 tests PASS.
- 백엔드 회귀: `pnpm test -- --testPathPattern="social-auth.service.spec|kakao.provider.spec|auth.service.spec"` → 3 suites / 37 tests PASS(SC-005/SC-019 회귀 0 확인).
- Flutter: `flutter test test/features/naver_social_login_static_test.dart test/features/naver_social_login_flow_test.dart` → 7 tests PASS.
- Flutter 회귀: `flutter test test/features/social_login_flow_test.dart test/features/social_login_static_test.dart` → 4 tests PASS(014 산출물 무회귀 — Development 가 `_StubSocialAuthService.signInWithNaver` override 를 추가하여 인터페이스 확장에 따른 컴파일 유지).
- `apps/backend`: `tsc --noEmit`(신규·수정 테스트 파일 포함) 컴파일 오류 0건(PATCH-05).

STALE_SC 점검(PATCH-A18 — 본 차수 git diff 변경 파일 한정): 신규·수정 테스트 파일에서 발견된 SC 번호는 모두 SC-001~020 범위 내로 015 spec 과 일치. STALE_SC 0건.

### 2차 재작업 (SEC-015-01 — naver 자동연동 재차단, 본 v1.1 문서)

production `AUTO_LINK_PROVIDERS`(`social-auth.service.ts:30`) 는 4단계 Development Agent 가 본
재작업과 병렬로 `new Set(['kakao', 'google'])` 로 이미 되돌린 상태를 확인했다(직접 Read 로
naver 부재 확인). 이에 따라 아래 실행 결과는 프로덕션 재차단이 반영된 상태에서의 green 결과다
(참고 정보 — 5b EXECUTION 의 공식 실행·판정을 대체하지 않음):

- `apps/backend`: `npx tsc --noEmit -p tsconfig.json` → 컴파일 오류 0건(PATCH-05).
- 백엔드: `npx jest --testPathPattern="naver.provider.spec|social-auth.service.naver.spec|social-auth.service.autolink-policy.spec"` → 3 suites / 17 tests PASS(19 → 17, naver 자동연동 성공 단언 1건 → 차단 단언으로 치환 + naver 자동연동 토큰쌍 단언 1건 제거로 순감 2).
- 백엔드 회귀: `npx jest --testPathPattern="social-auth.service.spec|kakao.provider.spec|auth.service.spec"` → 3 suites / 37 tests PASS(SC-005/SC-019 회귀 0 확인, kakao/google 자동연동 계속 허용).
- Flutter 는 본 재작업에서 변경하지 않음(백엔드 계정 해석 정책 한정 수정 — Flutter 소셜 버튼·흐름 테스트는 provider 문자열 분기와 무관).

STALE_SC 재점검(PATCH-A18 — 본 차수 git diff 변경 파일 한정): 수정된 2개 테스트 파일에서
발견된 SC 번호(SC-001, SC-006~010)는 모두 SC-001~020 범위 내로 015 spec 과 일치. 신규
`test_SEC01501_*` 함수명은 SC 마커가 아닌 SEC 마커이므로 STALE_SC 점검 대상 외. STALE_SC 0건.

역방향 검증(FR 없는 SC 0건) 재확인: spec.md FR-001~013 → SC 매핑 표(§SC 없는 FR 역방향 검증)는
SC 번호 자체의 존재·매핑 여부만 검증하며 본 재작업으로 SC-006/010 의 매핑 관계(FR-006→SC-006,
FR-008→SC-010) 자체는 변경되지 않았으므로 결과는 1차와 동일(SC 없는 FR 0건). 단 SC-006/010 의
naver 관련 **문언**과 테스트 동작 간 불일치는 위 §미커버 항목 (4)로 별도 기재했다(SC 매핑 누락이
아니라 spec.md 문언 갱신 필요 — 성격이 다름).
