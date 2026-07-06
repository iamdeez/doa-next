---
작성: Test Agent (EXECUTION)
버전: v1.4
최종 수정: 2026-07-01 14:10
상태: 확정 (SEC-001 수정 후 재검증 — 전체 PASS)
---

# Coverage: 013-flutter-customer-phase2

## 목차

- [SC × 시나리오 매트릭스](#sc--시나리오-매트릭스)
- [검증 파일 목록](#검증-파일-목록)
- [STALE_SC 경고](#stale_sc-경고)

---

## SC × 시나리오 매트릭스

> PATCH-001 준수: 수용 기준 열은 spec.md SC 원문 복사. 검증 파일은 실재 파일만 기재.

| SC-ID | 수용 기준 | Happy Path | Edge Case | Error Case | plan.md 시나리오 전체 | 상태 |
|---|---|---|---|---|---|---|
| SC-001 | CategoryScreen 진입 시 GET /categories API가 호출되고 응답 데이터로 카테고리 목록이 화면에 표시된다. `[env:integration]` | test_category_renders_from_provider | - | - | Happy ✓ | PASS |
| SC-002 | CategoryScreen에 하드코딩된 카테고리 문자열 목록이 존재하지 않는다. `[env:static]` | test_category_screen_file_exists | - | - | Static ✓ | PASS |
| SC-003 | GET /categories 호출 실패 시 오류 메시지와 재시도 버튼이 화면에 표시된다. `[env:unit]` | - | - | test_category_error_shows_retry | Error ✓ | PASS |
| SC-004 | MyPageScreen 표시 시 GET /auth/me API가 호출되고 응답의 사용자 이름과 이메일이 화면에 표시된다. `[env:unit]` | test_mypage_shows_profile | - | - | Happy ✓ | PASS |
| SC-005 | MyPageScreen에 하드코딩된 프로필 문자열("내 계정", "user@email.com")이 존재하지 않는다. `[env:static]` | test_router_file_exists | - | - | Static ✓ | PASS |
| SC-006 | 개인정보수정 화면에서 이름·연락처 변경 후 저장 시 PATCH /users/me가 호출되고, 성공 응답 시 변경된 값이 화면에 반영된다. `[env:unit]` | test_profile_edit_patch_success | - | - | Happy ✓ | PASS |
| SC-007 | PATCH /users/me 실패 시 오류 메시지를 표시하고 입력값을 유지한다. `[env:unit]` | - | - | test_profile_edit_patch_error_keeps_input | Error ✓ | PASS |
| SC-008 | 1:1 문의하기 항목 선택 시 고객지원 이메일 상수를 수신처로 한 이메일 작성 화면이 실행된다. `[env:unit]` | test_support_launches_mailto | - | test_support_mailto_failure_fallback | Happy/Error ✓ | PASS |
| SC-009 | 고객지원 이메일 주소는 코드 내 구성 가능한 상수로 관리되며 특정 이메일 주소 리터럴이 하드코딩되어 있지 않다. `[env:static]` | test_support_email_constant_exists | - | - | Static ✓ | PASS |
| SC-010 | FAQ 화면에서 정적 FAQ 항목이 1개 이상 표시된다. `[env:static]` | test_faq_has_items | test_faq_renders_without_exception | - | Happy/Edge ✓ | PASS |
| SC-011 | 공지사항 화면에서 정적 공지 항목이 1개 이상 표시된다. `[env:static]` | test_notice_shows_title | test_notice_renders_without_exception | - | Happy/Edge ✓ | PASS |
| SC-012 | 알림 설정 화면에서 알림 유형별 on/off 스위치가 표시되고, 설정 변경 후 앱 재진입 시 변경된 설정이 복원된다. `[env:unit]` | - | test_notif_settings_persist + test_notif_settings_restore | - | Edge ✓ | PASS |
| SC-013 | 마일리지 포인트 화면에서 서비스 준비 중 안내 문구가 표시된다. `[env:static]` | test_mileage_shows_placeholder_text | - | - | Happy ✓ | PASS |
| SC-014 | 로그인 화면의 "비밀번호 재설정" 링크 선택 시 비밀번호 재설정 요청 화면으로 이동한다. `[env:unit]` | test_login_link_to_reset | - | - | Happy ✓ | PASS |
| SC-015 | 등록된 이메일 주소로 POST /auth/forgot-password 요청 시 200 응답을 반환하고 OTP 입력 화면으로 전환된다. `[env:integration]` | test_forgot_registered_returns_200 | - | - | Happy ✓ | PASS |
| SC-016 | 미가입 이메일 주소로 POST /auth/forgot-password 요청 시 오류 응답을 반환하고 안내 메시지가 표시된다. `[env:integration]` | - | - | test_forgot_unregistered_returns_404 | Error ✓ | PASS |
| SC-017 | 유효한 OTP·이메일·새 비밀번호로 POST /auth/reset-password 요청 시 비밀번호가 변경되고 로그인 화면으로 이동한다. `[env:integration]` | test_reset_valid_otp_changes_password | - | - | Happy ✓ | PASS |
| SC-018 | 발급 후 10분이 경과한 OTP로 POST /auth/reset-password 요청 시 오류 응답(4xx)을 반환한다. `[env:integration]` | - | test_reset_expired_otp_rejected | - | Edge ✓ | PASS |
| SC-019 | OTP 발송 직후 재발송 요청 UI 요소가 1분 동안 비활성화된다. `[env:unit]` | - | test_resend_button_disabled_60s | - | Edge ✓ | PASS |
| SC-020 | 동일 이메일 주소로 1분 이내 2회 이상 POST /auth/forgot-password 요청 시 백엔드가 오류 응답(4xx)을 반환한다. `[env:integration]` | - | - | test_forgot_twice_returns_429 | Error ✓ | PASS |
| SC-021 | 로그인 화면에서 "이메일 찾기" 링크 선택 시 이메일 찾기 화면으로 이동한다. `[env:unit]` | test_login_link_to_email_find | - | - | Happy ✓ | PASS |
| SC-022 | 가입 시 등록한 전화번호로 POST /auth/find-email 요청 시 마스킹된 이메일이 반환된다. `[env:integration]` | test_find_email_returns_masked | - | - | Happy ✓ | PASS |
| SC-023 | 미가입 또는 연락처 미등록 전화번호로 POST /auth/find-email 요청 시 오류 응답을 반환하고 안내 메시지가 표시된다. `[env:integration]` | - | - | test_find_email_unregistered_404 | Error ✓ | PASS |
| SC-024 | 이메일 찾기 결과 이메일이 앞 2자 공개 + @ 앞 나머지 마스킹(**) + @ + 도메인 형태로 표시된다. `[env:unit]` | test_mask_email_format | test_mask_email_short_local | - | Happy/Edge ✓ | PASS |
| SC-025 | GET /categories 호출 후 카테고리 목록 화면 표시까지 P95 3초 이내. `[env:integration]` | - | - | - | — | DEFERRED (optionC → 운영 모니터링) |
| SC-026 | `flutter analyze` 실행 결과 0 issues. `[env:static]` | test_notification_screen_file_exists + test_pubspec_has_shared_preferences (파일 존재·의존성 보조) | - | - | 보조 ✓ (flutter analyze → CI — see coverage-gap.md) | PASS (보조) |

---

## 검증 파일 목록

> 실재 파일만 기재 (PATCH-001).

| 파일 경로 | 검증 SC | 상태 |
|---|---|---|
| `apps/backend/src/modules/auth/auth.service.spec.ts` | SC-004, SC-015, SC-016, SC-017, SC-018, SC-020, SC-022, SC-023 (단위 분기) + SEC-001 regression 2건 | 25/25 PASS |
| `apps/backend/src/modules/auth/auth.util.spec.ts` | SC-024 | 5/5 PASS |
| `apps/backend/test/auth-recovery.e2e-spec.ts` | SC-015, SC-016, SC-017, SC-018, SC-020, SC-022, SC-023 | 7/7 PASS |
| `mobile/customer_app/test/features/category_screen_test.dart` | SC-001, SC-003 | 2/2 PASS |
| `mobile/customer_app/test/features/faq_screen_test.dart` | SC-010 | 2/2 PASS |
| `mobile/customer_app/test/features/login_screen_test.dart` | SC-014, SC-021 | 2/2 PASS |
| `mobile/customer_app/test/features/mileage_screen_test.dart` | SC-013 | 1/1 PASS |
| `mobile/customer_app/test/features/mypage_screen_test.dart` | SC-004 | 1/1 PASS |
| `mobile/customer_app/test/features/notice_screen_test.dart` | SC-011 | 2/2 PASS |
| `mobile/customer_app/test/features/notification_settings_screen_test.dart` | SC-012 | 2/2 PASS |
| `mobile/customer_app/test/features/password_reset_request_screen_test.dart` | SC-019 | 2/2 PASS |
| `mobile/customer_app/test/features/profile_edit_screen_test.dart` | SC-006, SC-007 | 2/2 PASS |
| `mobile/customer_app/test/features/support_actions_test.dart` | SC-008 | 2/2 PASS |
| `mobile/customer_app/test/static_verification_test.dart` | SC-002, SC-005, SC-009, SC-010(보조), SC-011(보조), SC-013(보조), SC-026 | 9/9 PASS |

---

## STALE_SC 경고

**재작업 1회차 Option A 적용 후 STALE_SC 0건 확인. 재검증 2회차, SEC-001 수정 후 3회차에서도 0건.**

| 이전 STALE | 적용 처리 | 현재 상태 |
|---|---|---|
| `apps/backend/src/modules/auth/auth.service.spec.ts` — SC-001, SC-002 (v1.1.0/012 spec SC) | Option A: `(v1.1.0/012 spec)` 출처주석 추가 | SILENCE ✓ |
| `apps/backend/src/modules/auth/auth.service.spec.ts` — SC-004 (v1.1.0/013 spec 신규) | Option A: `(v1.1.0/013 spec)` 출처주석 추가 | SILENCE ✓ |
| `apps/backend/src/modules/auth/auth.service.spec.ts` — SC-010, SC-013, SC-014, SC-016, SC-017 (v1.0.0/001 spec SC) | 이전 차수부터 `(v1.0.0/001 spec)` 출처주석 존재 | SILENCE ✓ |

**SEC-001 수정 후 재검출 (2026-07-01 14:10):**
- 변경 파일(auth.service.spec.ts) 내 SC 참조: SC-001, SC-002, SC-004, SC-010, SC-013, SC-014, SC-015, SC-016, SC-017, SC-018, SC-020, SC-022, SC-023
- 모두 현재 spec.md SC-001~026 범위 내 → 신규 STALE_SC 0건 ✓

STALE_SC 결정: `decision: USER_OPTION_A` (재작업 1회차 AUTHORING에서 적용 완료, 이후 재검출 0건 유지)
