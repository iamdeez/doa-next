---
작성: Docs Agent
버전: v1.1
최종 수정: 2026-07-03 13:56
상태: 확정
---

# Diff: 015-naver-code-exchange

## 목차

- [커밋 메시지용 한 줄 요약](#커밋-메시지용-한-줄-요약)
- [변경 요약](#변경-요약)
- [변경 파일 및 라인 수](#변경-파일-및-라인-수)
- [Diff](#diff)

---

> **개정 이력**: v1.0(base 산출물)은 naver 자동연동 **허용** 시점(Security Agent 1차 감사 이전)에
> 작성되었다. Security Agent 가 SEC-015-01(High — naver 자동연동의 이메일 소유권 미검증 계정 탈취)을
> 확정하고, 사용자 결정으로 Development Agent 가 naver 를 `AUTO_LINK_PROVIDERS` 에서 제외하는 재작업을
> 완료(5b Test Agent EXECUTION 재검증 gate: PASS)함에 따라 본 v1.1 이 그 최종 코드 상태를 반영한다.

## 커밋 메시지용 한 줄 요약

- **KO**: 네이버 소셜 로그인을 서버 authorization code + client_secret 교환 방식으로 재도입하되, 이메일 소유권 미검증 위험(SEC-015-01)으로 자동연동은 제외 (v1.1.0/015)
- **EN**: Reintroduce Naver social login via server-side authorization code + client_secret exchange, excluding email auto-link due to unverified-email-ownership risk (SEC-015-01) (v1.1.0/015)

## 변경 요약

- **백엔드 — Naver code-exchange 전환**: `naver.provider.ts` 를 client-token 검증에서 서버 authorization code
  교환 방식으로 재작성(`nid.naver.com/oauth2.0/token` POST → `openapi.naver.com/v1/nid/me` GET 순차 호출).
  `client_secret`·네이버 `access_token` 은 지역 변수로만 보유하며 응답·로그에 노출되지 않는다.
- **Port 시그니처 확장(하위 호환)**: `SocialProviderPort.verify(token, context?)` 의 2번째 인자를
  optional 로 추가(`{state?, redirectUri?}`). 카카오·구글 구현체·호출부는 변경 없이 동작(NFR-004 회귀 방지).
- **provider 지원 목록 재편입(로그인만)**: `SocialProviderResolver`·`SocialLoginDto.SUPPORTED_PROVIDERS`·
  `AuthModule` 에 naver 재등록 — naver 는 재로그인(path 3a)·신규가입(path 3c) 경로로 로그인 가능.
- **[재작업] 자동연동은 최종적으로 카카오·구글 한정 — naver 제외(SEC-015-01)**: 1차 산출물은
  `AUTO_LINK_PROVIDERS` 에 naver 를 재편입해 email 매칭 자동연동을 카카오·구글과 동일하게 허용했으나,
  Security Agent 1차 감사가 naver 오픈API 에 이메일 소유권 검증 필드(`google.provider.ts` 의
  `email_verified` 에 대응)가 없어 공격자가 자신의 정규 naver 계정에 victim 이메일을 등록하고 정상
  로그인만으로 victim 계정을 탈취할 수 있음(High)을 확정. 사용자 결정으로 `AUTO_LINK_PROVIDERS =
  new Set(['kakao','google'])` 로 반전하고, naver 의 email 매칭 시 409 Conflict 로 거부하도록
  `social-auth.service.ts` 를 재작업(주석 4곳에 근거 명시) + 공격 시나리오 회귀 테스트
  (`social-auth.service.naver-autolink-exclusion.spec.ts`) 신규 추가.
- **CSRF state 전달 경로**: DTO `state?: string` optional 필드 → `verify` context 로 전달(ADR-007). 단
  백엔드 자체 검증은 아직 없음(SEC-015-02, 운영 셋업 착수 전 구현 필요 — 미해결).
- **Flutter — 네이버 버튼 재활성화**: `_SocialRow` GestureDetector 버튼 복귀, `SocialAuthService` 에
  `signInWithNaver()` 추가. 시스템 브라우저 + 커스텀 URL 스킴(`flutter_web_auth_2` pubspec 선언, 실제
  네이티브 연동은 운영 셋업 deferred). `StubSocialAuthService`·기존 테스트 스텁에 override 최소 추가
  (Dart `implements` breaking change 대응, GAP-015-02). **본 재작업(SEC-015-01)은 Flutter 코드 무변경.**
- **DB 스키마 변경 없음**: `social_accounts.provider` 문자열 컬럼이 기존 마이그레이션 그대로 'naver' 값 수용.
- **신규 테스트**: 백엔드 naver code-exchange·계정해석 단위 테스트 2파일 + SEC-015-01 공격 시나리오
  회귀 테스트 1파일(신규, SC 비매핑), Flutter naver 정적·흐름 테스트 2파일. 014 자동연동 정책 회귀
  테스트는 "차단→허용→차단(재반전)" 2단계 갱신을 거쳐 최종적으로 naver 차단(kakao/google 만 허용)을
  검증하는 상태로 확정.

## 변경 파일 및 라인 수

| 파일 | 추가 | 삭제 |
|---|---|---|
| `apps/backend/src/modules/auth/auth.controller.ts` | +1 | -1 |
| `apps/backend/src/modules/auth/auth.module.ts` | +2 | -1 |
| `apps/backend/src/modules/auth/dto/social-login.dto.ts` | +15 | -5 |
| `apps/backend/src/modules/auth/social-auth.service.autolink-policy.spec.ts` (재작업 재반전) | +23 | -11 |
| `apps/backend/src/modules/auth/social-auth.service.ts` (재작업 포함) | +30 | -17 |
| `apps/backend/src/modules/auth/social/naver.provider.ts` | +66 | -26 |
| `apps/backend/src/modules/auth/social/social-provider.port.ts` | +15 | -3 |
| `apps/backend/src/modules/auth/social/social-provider.resolver.ts` | +4 | -5 |
| `apps/backend/src/modules/auth/social/naver.provider.spec.ts` (신규) | +183 | -0 |
| `apps/backend/src/modules/auth/social-auth.service.naver.spec.ts` (신규, T-D3 재반전 반영) | +280 | -0 |
| `apps/backend/src/modules/auth/social-auth.service.naver-autolink-exclusion.spec.ts` (신규, 재작업 산출물, SC 비매핑) | +148 | -0 |
| `mobile/customer_app/lib/core/providers.dart` | +12 | -4 |
| `mobile/customer_app/lib/features/auth/login_screen.dart` | +15 | -4 |
| `mobile/customer_app/lib/features/auth/social_auth_service.dart` | +14 | -5 |
| `mobile/customer_app/pubspec.lock` | +32 | -0 |
| `mobile/customer_app/pubspec.yaml` | +3 | -0 |
| `mobile/customer_app/test/features/social_login_flow_test.dart` | +10 | -0 |
| `mobile/customer_app/test/features/naver_social_login_static_test.dart` (신규) | +191 | -0 |
| `mobile/customer_app/test/features/naver_social_login_flow_test.dart` (신규) | +277 | -0 |
| **합계 (tracked, `git diff` 기준 14 files)** | **+242** | **-82** |
| **신규(untracked) 파일 5건 (실측 wc -l)** | **+1079** | **-0** |

> tracked 14 files 합계(+242/-82)는 `git diff 6b64c24 --numstat -- apps/backend mobile/customer_app` 실측치다
> (v1.0 산출물의 +238/-87 대비 재작업(`social-auth.service.ts`·`social-auth.service.autolink-policy.spec.ts`)
> 추가 변경분이 반영된 최종 수치 — `git diff 6b64c24 --stat` 합계 "242 insertions(+), 82 deletions(-)" 로
> 이중 확인).
> 신규(untracked) 5건(위 표에서 "(신규)" 표기, v1.0 의 4건에 재작업 산출물
> `social-auth.service.naver-autolink-exclusion.spec.ts` 148줄이 추가)은 `git diff` 에 잡히지 않으므로
> `wc -l` 실측 라인수를 별도 병기했다(183+280+148+191+277=1079). `social-auth.service.naver.spec.ts` 는
> T-D3 SC-006/010 재반전(자동연동 성공/토큰쌍 단언 제거)으로 v1.0 의 299줄에서 280줄로 감소했다.

## Diff

> 전체 diff 는 박제하지 않는다 — git 이 형상관리 SoT. base commit + 재생성 명령:
> `git diff 6b64c24 -- apps/backend mobile/customer_app` (tracked 14 files, 최종 상태)
> 신규(untracked) 5개 파일은 `git status --short -- apps/backend/src/modules/auth mobile/customer_app/test/features` 로 확인 후
> `git add` 대상에 포함한다.
