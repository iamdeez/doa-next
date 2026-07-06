---
작성: Docs Agent
버전: v1.1
최종 수정: 2026-07-01 14:24
상태: 확정 (SEC-001 수정 반영)
---

# Diff: 013-flutter-customer-phase2

## 커밋 메시지용 한 줄 요약

(이 섹션은 커밋 메시지 작성 시 참고할 수 있도록 제공한다. 실제 커밋 메시지는 프로젝트 컨벤션에 맞춰 자유롭게 조정한다.)

- **KO**: Flutter 소비자 앱 Phase 2 — 비밀번호 재설정 OTP·이메일 찾기·마이페이지 실데이터·고객지원·알림설정 구현 + SEC-001 OTP 브루트포스 차단(attempts 카운터·5회 무효화)
- **EN**: Flutter customer app Phase 2 — password reset OTP, find email, mypage real data, customer support, notification settings + SEC-001 OTP brute-force protection (attempts counter, 5-try invalidation)

## 변경 요약

### 백엔드 신규 기능 (apps/backend)

- **비밀번호 재설정 OTP 플로우**: `POST /auth/forgot-password` (OTP 발송) + `POST /auth/reset-password` (OTP 검증·비밀번호 변경). `password_reset_otps` 신규 테이블(Prisma 마이그레이션). OTP 10분 유효·60초 rate-limit(`auth.constants.ts`).
- **이메일 찾기**: `POST /auth/find-email` — 전화번호로 가입 이메일 조회 후 마스킹 반환(NFR-004: 앞 2자 공개 + 나머지 `**`). `auth.util.ts` `maskEmail()` 순수 함수 분리.
- **MailerPort 인프라 어댑터**: `src/infrastructure/mail/` — 추상 포트(`MailerPort`) + SMTP 구현(`SmtpMailer`, nodemailer) + 테스트 stub(`StubMailer`). P-002 AWS 의존 금지 준수 (표준 SMTP).

### 백엔드 보안 수정 — SEC-001 (Security Agent BLOCKED 후 수정)

- **OTP 브루트포스 차단**: `password_reset_otps.attempts` 카운터 컬럼 추가(`schema.prisma`). `resetPassword` OTP 불일치 시 `incrementOtpAttempts` (DB atomic increment) 호출 → `OTP_MAX_ATTEMPTS=5` 도달 시 OTP consumed 처리(400 반환). 상수 `OTP_MAX_ATTEMPTS=5` 추가(`auth.constants.ts`).
- **신규 마이그레이션**: `20260701140100_add_otp_attempts/migration.sql` — `ALTER TABLE password_reset_otps ADD COLUMN attempts INTEGER NOT NULL DEFAULT 0` (additive, zero-downtime).
- **회귀 테스트 2건**: `test_otp_5th_wrong_attempt_invalidates_otp`·`test_otp_after_invalidation_correct_otp_also_rejected` (`auth.service.spec.ts`).

### Flutter 앱 신규 화면 (mobile/customer_app)

- **비밀번호 재설정**: `forgot_password_screen.dart` — 이메일 입력 → OTP 발송 → OTP+신규 비밀번호 입력 2단계 플로우. 재발송 60초 쿨다운.
- **이메일 찾기**: `find_email_screen.dart` — 전화번호 입력 → 마스킹 이메일 결과 표시.
- **개인정보수정**: `profile_edit_screen.dart` — 이름·연락처 PATCH /users/me.
- **마일리지**: `mileage_screen.dart` — 서비스 준비중 안내.
- **고객지원**: `support/` — 1:1문의(mailto·`url_launcher`·`kSupportEmail` 상수), FAQ·공지 정적 콘텐츠.
- **알림설정**: `notification/` — 유형별 on/off 스위치, `shared_preferences` 로컬 영속.

### Flutter 앱 기존 화면 연결

- `login_screen.dart`: 비밀번호 재설정·이메일 찾기 링크 onTap 활성화.
- `category_screen.dart`: 재시도 버튼 추가(SC-003). 기존 Provider 기반 API 연동 유지.
- `mypage_screen.dart`: GET /auth/me 실 사용자 데이터 연동(이름·이메일) + 6개 항목 라우팅.

### 라우팅·공통

- `router.dart`: GoRouter 기반 앱 라우터 통합. 신규 화면 4종 + 마이페이지 항목 경로 등록.
- `constants.dart`: `kSupportEmail` 리터럴 제거 → 상수 관리.
- `providers.dart`: AuthMeProvider·CategoryProvider·ProfileEditNotifier·NotificationSettingsNotifier 추가.

---

## 변경 파일 및 라인 수

> tracked modified 파일 기준(git diff 1798c73). 신규(untracked) 파일은 별도 행 표기.

| 파일 | 추가 | 삭제 |
|---|---|---|
| `apps/backend/.env.example` | +7 | 0 |
| `apps/backend/package.json` | +2 | 0 |
| `apps/backend/prisma/schema.prisma` | +16 (SEC-001 attempts 컬럼 포함) | 0 |
| `apps/backend/src/modules/auth/auth.controller.ts` | +25 | 0 |
| `apps/backend/src/modules/auth/auth.module.ts` | +2 | 0 |
| `apps/backend/src/modules/auth/auth.repository.ts` | +73+α (SEC-001 incrementOtpAttempts 포함) | -? |
| `apps/backend/src/modules/auth/auth.service.ts` | +107+α (SEC-001 브루트포스 차단 로직 포함) | -? |
| `apps/backend/src/modules/auth/auth.service.spec.ts` | +281+α (SEC-001 회귀 테스트 2건 포함) | -? |
| `apps/backend/src/modules/auth/dto/auth-response.dto.ts` | +8 | 0 |
| `mobile/customer_app/ios/Runner/Info.plist` | +4 | 0 |
| `mobile/customer_app/lib/core/providers.dart` | +53 | 0 |
| `mobile/customer_app/lib/features/auth/login_screen.dart` | +22 | -? |
| `mobile/customer_app/lib/features/category/category_screen.dart` | +17 | -? |
| `mobile/customer_app/lib/features/mypage/mypage_screen.dart` | +82 | -? |
| `mobile/customer_app/pubspec.lock` | +120 | 0 |
| `mobile/customer_app/pubspec.yaml` | +2 | 0 |
| `pnpm-lock.yaml` | +19 | 0 |
| **tracked 소계** | **+839+α (SEC-001 포함)** | **-52** |
| `apps/backend/prisma/migrations/20260701022235_add_password_reset_otps/migration.sql` (신규) | — | — |
| `apps/backend/prisma/migrations/20260701140100_add_otp_attempts/migration.sql` (신규, SEC-001) | — | — |
| `apps/backend/src/infrastructure/mail/*.ts` 4종 (신규) | — | — |
| `apps/backend/src/modules/auth/auth.constants.ts` (신규, SEC-001 OTP_MAX_ATTEMPTS=5 포함) | — | — |
| `apps/backend/src/modules/auth/auth.util.ts` (신규) | — | — |
| `apps/backend/src/modules/auth/auth.util.spec.ts` (신규) | — | — |
| `apps/backend/src/modules/auth/dto/find-email.dto.ts` (신규) | — | — |
| `apps/backend/src/modules/auth/dto/forgot-password.dto.ts` (신규) | — | — |
| `apps/backend/src/modules/auth/dto/reset-password.dto.ts` (신규) | — | — |
| `apps/backend/test/auth-recovery.e2e-spec.ts` (신규) | — | — |
| `mobile/customer_app/lib/core/constants.dart` (신규) | — | — |
| `mobile/customer_app/lib/core/router.dart` (신규) | — | — |
| `mobile/customer_app/lib/features/auth/find_email_screen.dart` (신규) | — | — |
| `mobile/customer_app/lib/features/auth/forgot_password_screen.dart` (신규) | — | — |
| `mobile/customer_app/lib/features/mypage/mileage_screen.dart` (신규) | — | — |
| `mobile/customer_app/lib/features/mypage/profile_edit_screen.dart` (신규) | — | — |
| `mobile/customer_app/lib/features/notification/` 1종 이상 (신규) | — | — |
| `mobile/customer_app/lib/features/support/` 3종 이상 (신규) | — | — |
| `mobile/customer_app/test/static_verification_test.dart` (신규) | — | — |
| `mobile/customer_app/test/features/` 10종 (신규) | — | — |

## Diff

> 전체 diff 는 박제하지 않는다 — **git 이 형상관리 SoT** 이며 전체 캡처는 중복·문서 비대화를 유발한다.
> base commit + 재생성 명령만 기록한다.

```diff
# tracked modified 파일 재생성:
git diff 1798c73 -- apps/backend mobile/customer_app pnpm-lock.yaml

# 신규(untracked) 파일은 git add 후 다음으로 재생성:
git diff --cached 1798c73 -- apps/backend mobile/customer_app pnpm-lock.yaml
```
