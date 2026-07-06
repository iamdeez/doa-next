---
작성: Test Agent (AUTHORING)
버전: v1.0
최종 수정: 2026-07-01 11:16
상태: 확정
---

# Test Cases: 013-flutter-customer-phase2

## 목차

- [SC × 시나리오 매트릭스](#sc--시나리오-매트릭스)
- [외부 의존성 명시](#외부-의존성-명시)
- [미커버 항목 (사전 분류 — 4-카테고리)](#미커버-항목-사전-분류--4-카테고리)

---

## SC × 시나리오 매트릭스

> SC-001~026 전수 매핑. SC-025 는 optionC defer(운영 측정). `env` 태그는 spec.md SC 원문 기준.

| SC-ID | 수용 기준 | Happy Path | Edge Case | Error Case | 테스트 파일·함수 | env 태그 |
|---|---|---|---|---|---|---|
| SC-001 | CategoryScreen 진입 시 GET /categories API가 호출되고 응답 데이터로 카테고리 목록이 화면에 표시된다. | `test_category_renders_from_provider` | — | — | `mobile/customer_app/test/features/category_screen_test.dart` | [env:integration] (mock Dio 갈음) |
| SC-002 | CategoryScreen에 하드코딩된 카테고리 문자열 목록이 존재하지 않는다. | `test_no_hardcoded_category_list` | — | — | `mobile/customer_app/test/static_verification_test.dart` | [env:static] |
| SC-003 | GET /categories 호출 실패 시 오류 메시지와 재시도 버튼이 화면에 표시된다. | — | — | `test_category_error_shows_retry` | `mobile/customer_app/test/features/category_screen_test.dart` | [env:unit] |
| SC-004 | MyPageScreen 표시 시 GET /auth/me API가 호출되고 응답의 사용자 이름과 이메일이 화면에 표시된다. | `test_mypage_shows_profile` | — | — | `mobile/customer_app/test/features/mypage_screen_test.dart` | [env:unit] |
| SC-005 | MyPageScreen에 하드코딩된 프로필 문자열("내 계정", "user@email.com")이 존재하지 않는다. | `test_no_hardcoded_profile_strings` | — | — | `mobile/customer_app/test/static_verification_test.dart` | [env:static] |
| SC-006 | 개인정보수정 화면에서 이름·연락처 변경 후 저장 시 PATCH /users/me가 호출되고, 성공 응답 시 변경된 값이 화면에 반영된다. | `test_profile_edit_patch_success` | — | — | `mobile/customer_app/test/features/profile_edit_screen_test.dart` | [env:unit] |
| SC-007 | PATCH /users/me 실패 시 오류 메시지를 표시하고 입력값을 유지한다. | — | — | `test_profile_edit_patch_error_keeps_input` | `mobile/customer_app/test/features/profile_edit_screen_test.dart` | [env:unit] |
| SC-008 | 1:1 문의하기 항목 선택 시 고객지원 이메일 상수를 수신처로 한 이메일 작성 화면이 실행된다. | `test_support_launches_mailto` | — | — | `mobile/customer_app/test/features/support_actions_test.dart` | [env:unit] |
| SC-009 | 고객지원 이메일 주소는 코드 내 구성 가능한 상수로 관리되며 특정 이메일 주소 리터럴이 하드코딩되어 있지 않다. | `test_support_email_is_constant` | — | — | `mobile/customer_app/test/static_verification_test.dart` | [env:static] |
| SC-010 | FAQ 화면에서 정적 FAQ 항목이 1개 이상 표시된다. | `test_faq_has_items` | — | — | `mobile/customer_app/test/features/faq_screen_test.dart` | [env:static] |
| SC-011 | 공지사항 화면에서 정적 공지 항목이 1개 이상 표시된다. | `test_notice_has_items` | — | — | `mobile/customer_app/test/features/notice_screen_test.dart` | [env:static] |
| SC-012 | 알림 설정 화면에서 알림 유형별 on/off 스위치가 표시되고, 설정 변경 후 앱 재진입 시 변경된 설정이 복원된다. | — | `test_notif_settings_persist_restore` | — | `mobile/customer_app/test/features/notification_settings_screen_test.dart` | [env:unit] |
| SC-013 | 마일리지 포인트 화면에서 서비스 준비 중 안내 문구가 표시된다. | `test_mileage_shows_placeholder` | — | — | `mobile/customer_app/test/features/mileage_screen_test.dart` | [env:static] |
| SC-014 | 로그인 화면의 "비밀번호 재설정" 링크 선택 시 비밀번호 재설정 요청 화면으로 이동한다. | `test_login_link_to_reset` | — | — | `mobile/customer_app/test/features/login_screen_test.dart` | [env:unit] |
| SC-015 | 등록된 이메일 주소로 POST /auth/forgot-password 요청 시 200 응답을 반환하고 OTP 입력 화면으로 전환된다. | `test_forgot_registered_returns_200` | — | — | `apps/backend/test/auth-recovery.e2e-spec.ts` | [env:integration] |
| SC-016 | 미가입 이메일 주소로 POST /auth/forgot-password 요청 시 오류 응답을 반환하고 안내 메시지가 표시된다. | — | — | `test_forgot_unregistered_returns_404` | `apps/backend/test/auth-recovery.e2e-spec.ts` | [env:integration] |
| SC-017 | 유효한 OTP·이메일·새 비밀번호로 POST /auth/reset-password 요청 시 비밀번호가 변경되고 로그인 화면으로 이동한다. | `test_reset_valid_otp_changes_password` | — | — | `apps/backend/test/auth-recovery.e2e-spec.ts` | [env:integration] |
| SC-018 | 발급 후 10분이 경과한 OTP로 POST /auth/reset-password 요청 시 오류 응답(4xx)을 반환한다. | — | `test_reset_expired_otp_rejected` | `test_reset_expired_otp_rejected` | `apps/backend/test/auth-recovery.e2e-spec.ts` | [env:integration] |
| SC-019 | OTP 발송 직후 재발송 요청 UI 요소가 1분 동안 비활성화된다. | — | `test_resend_button_disabled_60s` | — | `mobile/customer_app/test/features/password_reset_request_screen_test.dart` | [env:unit] |
| SC-020 | 동일 이메일 주소로 1분 이내 2회 이상 POST /auth/forgot-password 요청 시 백엔드가 오류 응답(4xx)을 반환한다. | — | — | `test_forgot_twice_returns_429` | `apps/backend/test/auth-recovery.e2e-spec.ts` | [env:integration] |
| SC-021 | 로그인 화면에서 "이메일 찾기" 링크 선택 시 이메일 찾기 화면으로 이동한다. | `test_login_link_to_email_find` | — | — | `mobile/customer_app/test/features/login_screen_test.dart` | [env:unit] |
| SC-022 | 가입 시 등록한 전화번호로 POST /auth/find-email 요청 시 마스킹된 이메일이 반환된다. | `test_find_email_returns_masked` | — | — | `apps/backend/test/auth-recovery.e2e-spec.ts` | [env:integration] |
| SC-023 | 미가입 또는 연락처 미등록 전화번호로 POST /auth/find-email 요청 시 오류 응답을 반환하고 안내 메시지가 표시된다. | — | — | `test_find_email_unregistered_404` | `apps/backend/test/auth-recovery.e2e-spec.ts` | [env:integration] |
| SC-024 | 이메일 찾기 결과 이메일이 앞 2자 공개 + @ 앞 나머지 마스킹(**) + @ + 도메인 형태로 표시된다. | `test_mask_email_format` | `test_mask_email_short_local` | — | `apps/backend/src/modules/auth/auth.util.spec.ts` | [env:unit] |
| SC-025 | GET /categories 호출 후 카테고리 목록 화면 표시까지 P95 3초 이내. | — | — | — | (운영 모니터링 — optionC defer) | [env:integration] |
| SC-026 | `flutter analyze` 실행 결과 0 issues. | `test_flutter_analyze_clean` | — | — | `mobile/customer_app/test/static_verification_test.dart` | [env:static] |

> **SC-018**: Edge(만료 경계)+Error 성격. **SC-024**: Happy(일반)+Edge(local≤2 경계). **SC-025**: optionC defer — 파이프라인 내 미실행, 운영 infra §4 모니터링 위임.

---

## 외부 의존성 명시

### 백엔드 단위 테스트 (T017)

- **fixture**: FIXED_USER(`{id, email, password, createdAt, name: 'Test User'}`), mock OTP record(`{id, email, otpHash, expiresAt, consumedAt, createdAt}`)
- **mock**: `AuthRepository`(findUserByEmail·findLatestOtpByEmail·createOtp·markOtpConsumed·findFirstUserByPhone·revokeAllRefreshTokensByUser), `MailerPort`(sendOtpEmail), bcrypt(`jest.spyOn`)
- **환경 변수**: 불필요(Jest 단위 — NestJS TestingModule)

### 백엔드 e2e 테스트 (T018)

- **fixture**: 실 PostgreSQL(`test:e2e` 환경), 등록 사용자 + phone 세팅
- **mock**: `StubMailer`(NODE_ENV=test 또는 MAIL_DRIVER=stub으로 provider 교체, `lastSent` 캡처)
- **환경 변수**: `DATABASE_URL`(test PostgreSQL), `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`
- **외부 서비스**: PostgreSQL(docker compose), SMTP 불요(StubMailer)
- **실행**: `pnpm --filter backend test:e2e`

### Flutter 위젯/단위 테스트 (T019)

- **mock**: `MockDio`(GET /categories·/auth/me·/users/me·POST /auth/forgot-password·/auth/reset-password·/auth/find-email)
- **fixture**: `SharedPreferences.setMockInitialValues({})`(알림 설정 초기화)
- **platform mock**: `url_launcher` — `UrlLauncherPlatform.instance = MockUrlLauncher()` 또는 `launchUrl` 채널 mock
- **widget test**: `flutter_test`의 `WidgetTester`, `ProviderContainer` 오버라이드

### Flutter 정적 검증 (T020)

- **정적 분석**: `flutter analyze`(CI 실행 — 테스트 파일에서 프로세스 실행으로 검증)
- **파일 읽기**: `dart:io`의 `File.readAsString`으로 소스 파일 내용 grep

---

## 미커버 항목 (사전 분류 — 4-카테고리)

단위테스트로 검증 불가능한 SC를 사전 분류하여 5b의 coverage-gap.md 작성에 참조한다.

| SC-ID | 미커버 사유 | 카테고리 | 권장 검증 방법 |
|---|---|---|---|
| SC-001 (실통합) | 에뮬레이터/실 API 서버 의존 — Flutter 통합 실행 환경 부재로 실제 GET /categories 호출·렌더 검증 불가. mock Dio 위젯 테스트로 provider 호출·렌더링 갈음(파이프라인 내). | (2) 단위테스트 불가 | 에뮬레이터 + 실 백엔드 서버 기동 후 통합 테스트 실행 |
| SC-025 | P95 3초는 운영 네트워크·콜드스타트 측정 필요 — 파이프라인 내 미측정 가능 | (3) 운영 환경 권장 | infra §4 모니터링에 GET /categories P95 항목 추가 후 운영 측정 |

> **카테고리 (1) 항목**: 0건 — Development Agent 구현 완료 후 T017~T020 전수 실행 가능. 단위테스트 가능한 SC는 모두 파이프라인 내 테스트 파일 작성 완료.
