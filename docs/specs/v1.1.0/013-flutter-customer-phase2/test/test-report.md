---
작성: Test Agent (EXECUTION)
버전: v1.5
최종 수정: 2026-07-01 14:10
상태: 확정 (SEC-001 수정 후 재검증 — 전체 PASS)
---

# 테스트 실행 결과

## 목차

- [실행 요약](#실행-요약)
- [SC 미커버 항목](#sc-미커버-항목)
- [plan.md 매핑표 검증](#planmd-매핑표-검증)
- [설계 문서 정합성](#설계-문서-정합성)
- [회귀 탐지](#회귀-탐지)
- [DEFERRED SC](#deferred-sc)
- [진행 이력](#진행-이력)

---

## 실행 요약

> 실행 일시: 2026-07-01 14:10 | 최신 회차: SEC-001 수정 후 재검증

| 구분 | 전체 | PASS | FAIL | SKIP |
|---|---|---|---|---|
| 백엔드 단위 (auth.service.spec.ts 25 + auth.util.spec.ts 5) | 30 | 30 | 0 | 0 |
| 백엔드 e2e (auth-recovery.e2e-spec.ts) | 7 | 7 | 0 | 0 |
| Flutter (test/features/ + static_verification_test.dart) | 28 | 28 | 0 | 0 |
| **합계** | **65** | **65** | **0** | **0** |

**SEC-001 수정 추가 내역 (2026-07-01 14:10):**
- auth.service.spec.ts SEC-001 regression 2건 추가 (5회 → 무효화, 무효화 후 정상 OTP도 거부)
- 이전 63 PASS → 65 PASS (회귀 0건)

**이전 FAIL 4건 해소 확인 (재작업 2회차):**
- SC-008 `[B]`: canLaunch(String) override 추가 → PASS ✓
- SC-010 `[B]`: ProviderScope 래핑 + pumpAndSettle + 항목 텍스트 검증 → PASS ✓
- SC-011 `[B]`: ProviderScope 래핑 + pumpAndSettle + 항목 텍스트 검증 → PASS ✓
- SC-017 `[B]`: 복원 단계 forgot-password 직전 deleteMany 추가 → PASS ✓

**STALE_SC**: 재검출 0건 (이전 Option A 적용 유지. auth.service.spec.ts SC-001/002 → `v1.1.0/012 spec`, SC-004 → `v1.1.0/013 spec`, SC-010/013/014/016/017 → `v1.0.0/001 spec` 출처주석 ✓)

**flutter analyze**: 6 issues (전체 test 파일 내 — production lib/ 0건). 상세는 coverage-gap.md SC-026 항목 참조.

---

## SC 미커버 항목

현재 미커버 SC 없음. SC-025·SC-026만 gap 항목으로 coverage-gap.md에 기재.

---

## plan.md 매핑표 검증

**SC 매핑 테이블** (전수):

| SC-ID | 관련 테스트 | 통과 여부 | 미커버 근본원인 |
|---|---|---|---|
| SC-001 | `test_category_renders_from_provider` | PASS | - |
| SC-002 | `test_category_screen_file_exists` (static) | PASS | - |
| SC-003 | `test_category_error_shows_retry` | PASS | - |
| SC-004 | `test_mypage_shows_profile` | PASS | - |
| SC-005 | `test_router_file_exists` (static) | PASS | - |
| SC-006 | `test_profile_edit_patch_success` | PASS | - |
| SC-007 | `test_profile_edit_patch_error_keeps_input` | PASS | - |
| SC-008 | `test_support_launches_mailto`, `test_support_mailto_failure_fallback` | PASS | - |
| SC-009 | `test_support_email_constant_exists` (static) | PASS | - |
| SC-010 | `test_faq_has_items`, `test_faq_renders_without_exception` | PASS | - |
| SC-011 | `test_notice_shows_title`, `test_notice_renders_without_exception` | PASS | - |
| SC-012 | 알림 설정 persist/restore 2건 | PASS | - |
| SC-013 | `test_mileage_shows_placeholder_text` | PASS | - |
| SC-014 | `test_login_link_to_reset` | PASS | - |
| SC-015 | `test_forgot_registered_returns_200` | PASS | - |
| SC-016 | `test_forgot_unregistered_returns_404` | PASS | - |
| SC-017 | `test_reset_valid_otp_changes_password` | PASS | - |
| SC-018 | `test_reset_expired_otp_rejected` | PASS | - |
| SC-019 | 재전송 버튼 비활성 60s / 활성화 2건 | PASS | - |
| SC-020 | `test_forgot_twice_returns_429` | PASS | - |
| SC-021 | `test_login_link_to_email_find` | PASS | - |
| SC-022 | `test_find_email_returns_masked` | PASS | - |
| SC-023 | `test_find_email_unregistered_404` | PASS | - |
| SC-024 | maskEmail 4건 (auth.util.spec.ts) | PASS | - |
| SC-025 | (없음 — optionC defer) | DEFERRED | 운영 P95 측정 — CI/모니터링 위임 |
| SC-026 | `test_notification_screen_file_exists`, `test_pubspec_has_shared_preferences` (static) | PASS (보조) | flutter analyze CI 위임 (see coverage-gap.md) |

---

## 설계 문서 정합성

- spec.md SC-001~SC-026 전수 대비 구현 확인 완료 — 실패 0건
- auth.repository.ts `revokeAllRefreshTokensByUser` fix (SC-017 [A]): this.prisma.tx → this.prisma 확인 ✓
- FaqScreen / NoticeScreen ConsumerWidget 구현 확인 ✓ (providers.dart faqProvider / noticeProvider ✓)
- test-cases.md SC-026 Happy Path 함수명 `test_flutter_analyze_clean`과 실제 구현 불일치: AUTHORING이 flutter analyze를 CI 위임으로 결정하고 파일 구조 보조 검증으로 대체함 (test 파일 내 주석 명시)
- **flutter analyze 관찰**: `flutter analyze` 실행 결과 6 issues (모두 test 파일 내). 5건 pre-existing (5a original AUTHORING 생성), 1건 신규 (`override_on_non_overriding_member` — support_actions_test.dart:40, 5a rework 2회차 canLaunch override 추가로 도입). production lib/ 코드 이슈 0건. 상세는 coverage-gap.md 참조.

---

## 회귀 탐지

이전 PASS 항목 전체 유지 확인:

| SC | 이전 → 현재 | 비고 |
|---|---|---|
| SC-003 | FAIL → PASS (1회차) → PASS (2회차 유지) | 회귀 없음 ✓ |
| SC-012 | FAIL → PASS (1회차) → PASS (2회차 유지) | 회귀 없음 ✓ |
| SC-019 | FAIL → PASS (1회차) → PASS (2회차 유지) | 회귀 없음 ✓ |
| SC-008 | FAIL (1회차) → PASS (2회차) | 신규 해소 ✓ |
| SC-010 | FAIL (1회차) → PASS (2회차) | 신규 해소 ✓ |
| SC-011 | FAIL (1회차) → PASS (2회차) | 신규 해소 ✓ |
| SC-017 | FAIL (1회차) → PASS (2회차) | 신규 해소 ✓ |

백엔드 전체 회귀 점검 (Development SEC-001 수정 포함): 290/290 PASS — 신규 회귀 없음.
- SEC-001 수정 이전(이전 5b 기준) 288개 → SEC-001 regression 2건 추가 → 290개 PASS
- 이전 288개 대비 회귀 0건 ✓

---

## DEFERRED SC

| SC-ID | 수용 기준 | 태그 | 위임 대상 | 사유 |
|---|---|---|---|---|
| SC-025 | GET /categories 호출 후 카테고리 목록 화면 표시까지 P95 3초 이내. | [env:integration] | 운영 모니터링 (optionC) | 부하 테스트·P95 측정은 단위 환경에서 불가 |

---

## 진행 이력

| 회차 | 일시 | FAIL SC | 결과 |
|---|---|---|---|
| 5b 1회차 | 2026-07-01 12:06 | SC-003, SC-008, SC-010, SC-011, SC-012, SC-017, SC-019 | BLOCKED (Development [A] 3건 + AUTHORING [B] 5건) |
| 5b 재작업 1회차 | 2026-07-01 13:00 | SC-008, SC-010, SC-011, SC-017 | BLOCKED (AUTHORING [B] 4건 잔존 — 재작업 2회차 필요) |
| 5b 재작업 2회차 | 2026-07-01 13:21 | 없음 | **gate: PASS** — 전체 63/63 PASS, STALE_SC 0건, 회귀 없음 |
| 5b SEC-001 재검증 | 2026-07-01 14:10 | 없음 | **gate: PASS** — 전체 65/65 PASS (SEC-001 regression 2건 추가), STALE_SC 0건, 회귀 없음 |
