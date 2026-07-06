---
작성: Test Agent (AUTHORING)
버전: v1.1 ([재작업] SEC-001 최종 — Naver 이번 릴리즈 제외)
최종 수정: 2026-07-02
상태: 확정
---

# Test Cases: 014-social-login

## 목차

- [SC × 시나리오 매트릭스](#sc--시나리오-매트릭스)
- [외부 의존성 명시](#외부-의존성-명시)
- [미커버 항목 (사전 분류 — 4-카테고리)](#미커버-항목-사전-분류--4-카테고리)

---

## SC × 시나리오 매트릭스

| SC-ID | 수용 기준 (spec.md 원문) | 시나리오 유형 | 테스트 파일 경로 | 테스트 함수 | env 태그 |
|---|---|---|---|---|---|
| SC-001 | 이미 연동된 소셜 계정(동일 provider·providerId)으로 소셜 로그인 API 요청 시 accessToken·refreshToken이 반환된다. | Happy | `apps/backend/src/modules/auth/social-auth.service.spec.ts` | `test_SC001_existing_social_account_returns_tokens` | [env:unit] |
| SC-002 | 소셜 제공자 이메일이 기존 사용자 계정 이메일과 동일하나 해당 소셜 계정이 미연동 상태일 때 로그인 요청 시, 기존 계정에 소셜 계정이 연동되고 accessToken·refreshToken이 반환된다. | Happy | `apps/backend/src/modules/auth/social-auth.service.spec.ts` | `test_SC002_auto_link_existing_email_returns_tokens` | [env:unit] |
| SC-003 | 소셜 이메일에 해당하는 기존 계정이 없을 때 소셜 로그인 요청 시, 신규 사용자 계정이 생성되고 accessToken·refreshToken이 반환된다. | Happy | `apps/backend/src/modules/auth/social-auth.service.spec.ts` | `test_SC003_new_user_created_returns_tokens` | [env:unit] |
| SC-004 | SC-003 경로로 생성된 신규 사용자의 password가 null이며, 해당 계정으로 이메일+비밀번호 로그인 시도 시 오류가 반환된다. | Error | `apps/backend/src/modules/auth/auth.service.spec.ts` | `test_SC004_014_null_password_user_login_returns_401` | [env:unit] |
| SC-005 | 소셜 제공자로부터 이메일이 반환되지 않는 응답을 stub으로 시뮬레이션할 때 소셜 로그인 요청이 4xx 오류로 거부된다. | Error | `apps/backend/src/modules/auth/social-auth.service.spec.ts` | `test_SC005_email_null_returns_400` | [env:unit] |
| SC-006 | 유효하지 않은 토큰으로 소셜 로그인 요청 시 4xx 오류가 반환된다. | Error | `apps/backend/src/modules/auth/social-auth.service.spec.ts` | `test_SC006_invalid_token_returns_4xx` | [env:unit] |
| SC-007 | `provider: 'kakao'` 식별자로 소셜 로그인 요청 시 카카오 검증 흐름이 수행되고 JWT가 반환된다. | Happy | `apps/backend/src/modules/auth/social-auth.service.spec.ts` | `test_SC007_kakao_provider_verify_path_returns_jwt` | [env:unit] |
| SC-008 | `provider: 'google'` 식별자로 소셜 로그인 요청 시 구글 검증 흐름이 수행되고 JWT가 반환된다. | Happy | `apps/backend/src/modules/auth/social-auth.service.spec.ts` | `test_SC008_google_provider_verify_path_returns_jwt` | [env:unit] |
| SC-010 | 소셜 로그인 성공 후 `social_accounts` 테이블에 해당 provider·providerId·email·name 레코드가 존재한다. | Happy | `apps/backend/src/modules/auth/social-auth.service.spec.ts` | `test_SC010_create_social_account_called_with_correct_args` | [env:unit] |
| SC-011 | `LoginScreen` 카카오 소셜 버튼이 탭 가능(GestureDetector 또는 동등 위젯 포함)하며 탭 핸들러가 존재한다. | Happy | `mobile/customer_app/test/features/social_login_static_test.dart` | `test_SC011_kakao_button_has_gesture_detector_and_handler` | [env:static] |
| SC-012 | `LoginScreen` 구글 소셜 버튼이 탭 가능하며 탭 핸들러가 존재한다. | Happy | `mobile/customer_app/test/features/social_login_static_test.dart` | `test_SC012_google_button_has_gesture_detector_and_handler` | [env:static] |
| SC-014 | 소셜 로그인 성공(백엔드 JWT 수신) 후 `FlutterSecureStorage`에 accessToken·refreshToken이 저장되고 메인 화면으로 전환된다. | Happy | `mobile/customer_app/test/features/social_login_flow_test.dart` | `test_SC014_social_login_success_stores_tokens_and_navigates` | [env:unit] |
| SC-015 | 소셜 인증 취소 시 로그인 화면이 유지되고 오류 메시지가 표시되지 않는다. | Edge | `mobile/customer_app/test/features/social_login_flow_test.dart` | `test_SC015_social_auth_cancelled_stays_on_login_no_error` | [env:unit] |
| SC-016 | 소셜 로그인 실패 시 오류 메시지가 화면에 표시된다. | Error | `mobile/customer_app/test/features/social_login_flow_test.dart` | `test_SC016_social_login_failure_shows_error_message` | [env:unit] |
| SC-017 | `flutter analyze` 실행 결과 0 issues. | — | `mobile/customer_app/test/features/social_login_static_test.dart` | `test_SC017_flutter_analyze_zero_issues_note` (CI 보조 마커) | [env:static] |
| SC-018 | 카카오·구글 각 제공자의 인증 크레덴셜 환경변수 항목이 `.env.example`에 존재한다(naver 항목 검증은 범위 외 — 미커버 항목 참조). | — | `mobile/customer_app/test/features/social_login_static_test.dart` | `test_SC018_env_example_contains_all_provider_credentials` | [env:static] |
| SC-019 | 소셜 로그인 백엔드 API P95 응답 3초 이내. | Happy | **deferred — 미작성** | — | [env:e2e-docker] |

> **SC-009·SC-013 (naver)**: 사용자 결정으로 Naver 소셜 로그인을 이번 릴리즈에서 완전 제외(SEC-001/GAP-014-10 — app-binding 검증 수단 부재로 계정 탈취 잔존 위험 근본 해소 불가, `security/security-report.md` v1.2 참조). 매트릭스에서 제거하고 "미커버 항목" 절에 범위 외로 재분류했다. 대응 테스트(`test_SC009_naver_provider_verify_path_returns_jwt`, `test_SC013_naver_button_has_gesture_detector_and_handler`)는 제거했다.
>
> 시나리오 유형 커버리지: Happy(SC-001/002/003/007/008/010/011/012/014) · Edge(SC-015) · Error(SC-004/005/006/016) — 세 유형 모두 커버.

---

## 외부 의존성 명시

### 백엔드 (social-auth.service.spec.ts, auth.service.spec.ts)

- **fixture 픽스처**:
  - `FIXED_USER`: `{ id: 'user-001', email: 'user@example.com', password: '$2b$10$hash', name: '홍길동' }` (password 보유 기존 사용자)
  - `NULL_PASS_USER`: `{ id: 'social-user-001', email: 'social@example.com', password: null, name: '소셜유저' }` (SC-004, 소셜 전용)
  - `KAKAO_PROFILE`: `{ providerId: '123456789', email: 'user@kakao.com', name: '홍길동' }`
  - `GOOGLE_PROFILE`: `{ providerId: '1234567890', email: 'user@gmail.com', name: '홍길동' }`
  - `SOCIAL_ACCOUNT`: `{ id: 'sa-001', userId: 'user-001', provider: 'kakao', providerId: '123456789', email: 'user@kakao.com', name: '홍길동' }`
  - (naver 픽스처 `NAVER_PROFILE` 은 SC-009 제거에 따라 삭제됨 — 범위 외)
- **mock**:
  - `mockAuthRepository`: `{ findByProviderAndProviderId, findUserByEmail, createSocialAccount, createUser }`
  - `mockAuthService`: `{ issueTokensForUser }` → 반환: `{ accessToken: 'at', refreshToken: 'rt' }`
  - `mockSocialProviderResolver`: `{ resolve }` → provider별 `mockSocialProviderPort` 반환
  - `mockSocialProviderPort`: `{ verify }` → 프로필 또는 throw
- **환경 변수**: 불필요 (mock 기반)
- **외부 서비스**: 없음 (StubSocialProvider/mock 으로 실 OAuth 호출 없음)

### Flutter (social_login_static_test.dart)

- **dart:io**: 파일 존재·내용 검증 (`libPath('features/auth/login_screen.dart')`, `../../apps/backend/.env.example`)
- **SC-017**: `flutter analyze` CI 실행 (테스트 파일에서 직접 실행 불가 — 마커 노트만)
- **환경 변수**: 없음

### Flutter (social_login_flow_test.dart)

- **mock**:
  - `MockSocialAuthService`: `signInWithKakao/Google()` → `SocialCredential` 또는 `SocialAuthCancelled` throw 또는 `DioException` throw (naver 는 범위 외 제외 — `_StubSocialAuthService.signInWithNaver` 제거됨)
  - `MockDio`: `POST /auth/social-login` 응답 mock
- **provider override**: `ProviderScope(overrides: [socialAuthServiceProvider.overrideWithValue(mock), dioProvider.overrideWith(...)])`
- **PATCH-013-01**: `ProviderScope` 래핑 필수 + `pumpAndSettle` 사용

---

## 미커버 항목 (사전 분류 — 4-카테고리)

| SC-ID | 미커버 사유 | 카테고리 | 권장 검증 방법 |
|---|---|---|---|
| SC-009 (naver provider verify) | 범위 외 — 사용자 결정으로 Naver 소셜 로그인을 이번 릴리즈에서 완전 제외(SEC-001/GAP-014-10: app-binding 검증 수단을 네이버 공개 API가 제공하지 않아 기존 naver 연동 계정 완전 탈취 잔존 위험 근본 해소 불가). 단위테스트 가능·불가 여부와 무관하게 기능 자체가 이번 릴리즈 범위에서 제외됨 | (4) 차후 점검 | 별도 spec에서 (a) authorization code+client_secret 교환 방식(ADR-001 재검토) 또는 (b) 위험 수용 결정 후 provider 재도입 시 SC-009 재작성 |
| SC-013 (naver 버튼 핸들러) | 범위 외 — SC-009와 동일 사유(Naver 이번 릴리즈 제외). LoginScreen 네이버 버튼 자체가 production에서 제거됨(Development Agent 병렬 처리) | (4) 차후 점검 | 별도 spec에서 Naver 재도입 시 SC-013 재작성 |
| SC-018 (naver 크레덴셜 항목) | 범위 외 부분 — `.env.example`의 `NAVER_CLIENT_ID`/`NAVER_CLIENT_SECRET` 존재 검증은 제외. kakao·google 항목은 SC-018로 계속 검증(매트릭스 참조) | (4) 차후 점검 | 별도 spec에서 Naver 재도입 시 NAVER_CLIENT_ID/SECRET 검증 재추가 |
| SC-019 | 실 OAuth 제공자 크레덴셜·네트워크·native SDK 의존 — mock 시뮬레이션 불가 ([env:e2e-docker]) | (2) 단위테스트 불가 | 실 크레덴셜 발급 후 운영 환경 P95 측정 (spec PROC-014) |
| GAP-014-01 (SC-003 원자성) | createUser+createSocialAccount 트랜잭션 원자성의 실경로(롤백·orphan 방지)는 AuthRepository 전체 mock 으로 단위 검증 불가 | (3) 운영 환경에서 확인 권장 | 실 DB e2e 통합 테스트 (옵션 B 운영 검증 시) |
| SC-017 (flutter analyze) | `flutter analyze` 명령 자체는 dart:test 내에서 실행 불가 | (2) 단위테스트 불가 | CI 파이프라인에서 `flutter analyze` 실행. 테스트 파일에 마커 노트만 배치 |

> 카테고리 (1) 항목 0건 — 단위테스트 가능한 미작성 항목 없음.
> 카테고리 (2)(3)(4) 만 존재 → 본 절차로 위임 종료. 5b EXECUTION 진입 가능.
> SC-009·SC-013·SC-018(naver 부분)은 단위테스트 기술적 불가가 아니라 **사용자 보안 결정에 의한 스코프 제외**이므로 (4) 차후 점검으로 분류했다(spec.md FR-012/US-003 자체는 별도 Spec Agent 갱신 대상 — 본 Agent 책임 범위 외).
