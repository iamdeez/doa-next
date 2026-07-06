---
작성: Design Agent
버전: v1.0
최종 수정: 2026-07-01 11:09
상태: 확정
---

# Tasks: 013-flutter-customer-phase2

> Branch: 013-flutter-customer-phase2 | Date: 2026-07-01 | Plan: [plan.md](../planning/plan.md)

## 목차

- [전제 조건](#전제-조건)
- [태스크 분해 레이어](#태스크-분해-레이어)
- [태스크 목록](#태스크-목록)
- [SC → 태스크 역방향 매핑 검증](#sc--태스크-역방향-매핑-검증)
- [Test Authoring Contract](#test-authoring-contract)
- [최적 설계 재검토 결과 (PATCH-A15 / D4)](#최적-설계-재검토-결과-patch-a15--d4)
- [태스크 입도 가이드](#태스크-입도-가이드)
- [구현 완료 기준](#구현-완료-기준)

---

## 전제 조건

- [x] spec.md 의 모든 [NEEDS CLARIFICATION] 항목이 해소되었는가? → 0건(spec §미결 사항 확정)
- [x] plan.md 의 Constitution Gates 가 모두 통과(또는 예외 기재) 되었는가? → P-001~P-007 전체 [x], 예외 없음
- [x] CHANGES.md 에서 이전 작업의 "후속 작업 시 주의사항" 을 확인했는가? → 009 이월 항목(카테고리 API·마이페이지 6항목·계정복구) 본 spec 대상. context.md §6 "이메일 알림 제공자 미결정" 은 notification 모듈 한정(auth OTP 는 SMTP MailerPort 독립)

---

## 태스크 분해 레이어

| 레이어 | 대상 | 담당 단계 |
|---|---|---|
| A. 데이터 계층 | Prisma schema·마이그레이션·Repository | 4단계 Development |
| B. 도메인 계층 | Service·인프라 어댑터(MailerPort)·상수·순수함수·Riverpod provider | 4단계 Development |
| C. 인터페이스 계층 | Controller·DTO·Flutter 화면(UI)·라우팅 배선 | 4단계 Development |
| D. 테스트 계층 | 단위·e2e·위젯·정적 테스트 전체 | 5a Test Agent (AUTHORING) |

> **PPG-1 분할**: A·B·C(T001~T016) = 4단계 Development, D(T017~T020) = 5a Test AUTHORING. 두 Agent 동일 turn 병렬 spawn. 산출물 충돌 없음(Development 는 production 코드만, Test 는 `*.spec.ts`/`*_test.dart`/`test/*.e2e-spec.ts` 만).
> 의존 순서: A → B → C(백엔드) / B(providers) → C(Flutter 화면). 백엔드와 Flutter 는 상호 독립([P]).

---

## 태스크 목록

> [P] = 직전 태스크와 병렬 가능. 완료 기준의 테스트는 5a(레이어 D)가 작성 → 5b 에서 GREEN 확인.

### Step 1. 백엔드 기반 (데이터·인프라)

- [x] **T001** — PasswordResetOtp 스키마 + 마이그레이션
    - 레이어: A
    - 구현 파일: `apps/backend/prisma/schema.prisma`, `apps/backend/prisma/migrations/*`
    - 관련 요구사항: FR-011/012/013, NFR-002/003 (plan §데이터 모델)
    - 상세: plan §데이터 모델의 `PasswordResetOtp` model 추가(`id/email/otpHash/expiresAt/consumedAt?/createdAt`, `@@index([email, createdAt(sort: Desc)])`, `@@schema("users")`, `@@map("password_reset_otps")`). User 모델 무변경(name/phone 기존 존재). `pnpm --filter backend exec prisma migrate dev --name add_password_reset_otps`.
    - 완료 기준: `prisma generate` 성공, `PasswordResetOtp` 타입 생성, 마이그레이션 파일 생성, `prisma migrate status` up-to-date

- [x] **T002** `[P]` — MailerPort 인프라 어댑터 (SMTP + Stub)
    - 레이어: B
    - 구현 파일: `apps/backend/src/infrastructure/mail/mailer.port.ts`, `smtp.mailer.ts`, `stub.mailer.ts`, `mail.module.ts`, `apps/backend/package.json`(nodemailer + @types/nodemailer dev)
    - 관련 요구사항: FR-011, ADR-004 (plan A-1, P-002/P-004)
    - 상세: `abstract class MailerPort { abstract sendOtpEmail(to: string, otp: string): Promise<void> }`. `SmtpMailer`(nodemailer `createTransport` 환경변수 `SMTP_HOST/PORT/USER/PASS`·`MAIL_FROM`). `StubMailer`(무네트워크, `lastSent` 캡처 후 resolve). `MailModule` 이 `process.env.NODE_ENV === 'production'` → SmtpMailer, else StubMailer 를 `{ provide: MailerPort, useClass }` 로 선택 + `exports: [MailerPort]`. `pnpm --filter backend add nodemailer && pnpm --filter backend add -D @types/nodemailer`.
    - 완료 기준: 타입 컴파일 성공(`tsc --noEmit`), MailModule import 시 NODE_ENV 별 provider 선택 동작, nodemailer import 형태 정상(CommonJS — `import * as nodemailer from 'nodemailer'`)

- [x] **T003** `[P]` — auth 상수 + maskEmail 순수 함수
    - 레이어: B
    - 구현 파일: `apps/backend/src/modules/auth/auth.constants.ts`, `apps/backend/src/modules/auth/auth.util.ts`
    - 관련 요구사항: FR-013/016, NFR-002/003/004 (plan A-2/A-3)
    - 상세: 상수 `OTP_TTL_MIN=10`·`OTP_RESEND_WINDOW_SEC=60`·`OTP_LENGTH=6`(매직넘버 금지). `maskEmail(email: string): string` — `@` 분리, `keep = local.slice(0, Math.min(2, local.length))`, 결과 `keep + '**@' + domain`. `@` 부재 방어.
    - 완료 기준: `maskEmail('johndoe@example.com')==='jo**@example.com'`·`maskEmail('a@x.com')==='a**@x.com'` 논리 성립(SC-024 테스트로 검증)

### Step 2. 백엔드 핵심 (auth 확장)

- [x] **T004** — AuthRepository OTP·phone·세션 확장 (T001 후)
    - 레이어: A
    - 구현 파일: `apps/backend/src/modules/auth/auth.repository.ts`
    - 관련 요구사항: FR-011/012/013/015, ADR-007 (plan A-2/A-3)
    - 상세: `createOtp({email, otpHash, expiresAt})`, `findLatestOtpByEmail(email)`(orderBy createdAt desc), `markOtpConsumed(id)`(consumedAt=now), `findFirstUserByPhone(phone)`(`findFirst` — phone 비유니크), `revokeAllRefreshTokensByUser(userId)`(updateMany revoked=true). P-001: users 스키마만.
    - 완료 기준: 각 메서드 Prisma 호출 타입 성립, 컴파일 성공

- [x] **T005** — AuthService forgot/reset/find + getProfile name (T004·T002·T003 후)
    - 레이어: B
    - 구현 파일: `apps/backend/src/modules/auth/auth.service.ts`
    - 관련 요구사항: FR-003/011/012/013/015/016, NFR-002/003/004, SC-004/015~018/020/022/023 (plan A-2/A-3/A-4)
    - 상세:
      - `forgotPassword(email)`: findUserByEmail 미존재→`NotFoundException`(SC-016). rate-limit: findLatestOtpByEmail.createdAt > now-`OTP_RESEND_WINDOW_SEC` → `HttpException(429)`(SC-020). OTP 생성(`randomInt(0,1_000_000)` zero-pad `OTP_LENGTH`), `otpHash=sha256(otp)`, expiresAt=now+`OTP_TTL_MIN`. createOtp → `mailer.sendOtpEmail`. 발송 실패는 500 미전파(OTP DB 선기록, 일반 안내).
      - `resetPassword(email, otp, newPassword)`: findLatestOtpByEmail 없음/consumed/expired/mismatch → 400(각 early-return). 통과 → `runInTransaction`(bcrypt.hash newPassword→user.password 갱신 + markOtpConsumed + revokeAllRefreshTokensByUser).
      - `findEmail(phone)`: findFirstUserByPhone 없음/phone null → `NotFoundException`(SC-023). 존재 → `{ email: maskEmail(user.email) }`.
      - `getProfile`: 반환에 `name: user.name` 추가. `UserProfile` 인터페이스 `name: string | null` 추가(additive — §F 회귀 없음).
    - 완료 기준: 컴파일 성공. 신규 3 메서드 + getProfile name. MailerPort DI 주입. constructor 에 mailer 추가

- [x] **T006** `[P]` — auth DTO + 응답 DTO (T005 병행 가능)
    - 레이어: C
    - 구현 파일: `apps/backend/src/modules/auth/dto/forgot-password.dto.ts`, `reset-password.dto.ts`, `find-email.dto.ts`, `apps/backend/src/modules/auth/dto/auth-response.dto.ts`(수정)
    - 관련 요구사항: FR-011/012/015, 인터페이스 계약 (plan A-5)
    - 상세: `ForgotPasswordDto { @IsEmail email }`, `ResetPasswordDto { @IsEmail email; @Length(6,6) @IsString otp; @MinLength(8) @IsString newPassword }`, `FindEmailDto { @IsString phone }`. auth-response: `AuthProfileResponse.name?: string | null`(`@ApiProperty({ required:false, nullable:true })`) additive, `FindEmailResponse { @ApiProperty email }` 신규.
    - 완료 기준: class-validator 데코레이터 적용, 컴파일 성공

- [x] **T007** — AuthController 라우트 + Module 배선 + env (T005·T006 후)
    - 레이어: C
    - 구현 파일: `apps/backend/src/modules/auth/auth.controller.ts`, `auth.module.ts`, `apps/backend/.env.example`
    - 관련 요구사항: FR-011/012/015, 인터페이스 계약 (plan A-5)
    - 상세: `POST /auth/forgot-password`(anonymous, `@HttpCode(200)`), `POST /auth/reset-password`(anonymous, `@HttpCode(200)`), `POST /auth/find-email`(anonymous, `@HttpCode(200)`, `@ApiOkResponse(FindEmailResponse)`). 가드 없음(기존 login 패턴). AuthModule `imports` 에 `MailModule` 추가. `.env.example` 에 `SMTP_HOST/SMTP_PORT/SMTP_USER/SMTP_PASS/MAIL_FROM` 추가.
    - 완료 기준: 3 라우트 등록, MailModule DI 해석 성공, 앱 부팅(`nest build` + 부팅 스모크) 성공

### Step 3. Flutter (009 스택 계승 — Navigator.push, Map 동적 파싱)

- [x] **T008** `[P]` — providers + app_config + pubspec 의존성 + 플랫폼 권한
    - 레이어: B
    - 구현 파일: `mobile/customer_app/lib/core/providers.dart`(수정), `mobile/customer_app/lib/core/app_config.dart`(신규), `mobile/customer_app/pubspec.yaml`, iOS `Info.plist`·Android manifest
    - 관련 요구사항: FR-003/005/008 (plan B-2/B-4/B-5, ADR-008/009)
    - 상세: `authMeProvider = FutureProvider.autoDispose((ref) => ref.read(dioProvider).get('/auth/me'))`, `userProfileProvider = FutureProvider.autoDispose((ref) => get('/users/me'))`. `app_config.dart`: `const kSupportEmail = 'support@doa.example'`(placeholder 상수, SC-009). `pubspec.yaml`: `url_launcher`·`shared_preferences` 추가 → `flutter pub get`. iOS Info.plist `LSApplicationQueriesSchemes: [mailto]`.
    - 완료 기준: `flutter pub get` 성공, provider 정의 컴파일, `flutter analyze` 0 issues

- [x] **T009** `[P]` — CategoryScreen 재시도 버튼
    - 레이어: C
    - 구현 파일: `mobile/customer_app/lib/features/category/category_screen.dart`
    - 관련 요구사항: FR-002 (plan B-1, GAP-013-01)
    - 상세: error state(현 오류 텍스트)에 `ElevatedButton(onPressed: () => ref.invalidate(categoriesProvider), child: Text('재시도'))` 추가. 하드코딩 제거 불요(GAP-013-01 — 이미 API 연동). FR-001/SC-002 現 状態 유지.
    - 완료 기준: error 위젯에 재시도 버튼 렌더·invalidate 동작(SC-003 테스트)

- [x] **T010** `[P]` — MyPage 프로필 실데이터 + 항목 onTap 배선
    - 레이어: C
    - 구현 파일: `mobile/customer_app/lib/features/mypage/mypage_screen.dart`
    - 관련 요구사항: FR-003/004/005/006/007/008/009 (plan B-2/B-7)
    - 상세: `_ProfileRow` → `ConsumerWidget`, `authMeProvider` watch → `name ?? '회원'`·`email` 표시. 하드코딩 `'내 계정'`/`'user@email.com'` 제거(SC-005). `고객 서비스` 섹션 onTap: 1:1문의→mailto(`launchUrl`), FAQ→FaqScreen, 공지→NoticeScreen, 알림설정→NotificationSettingsScreen, 개인정보수정→ProfileEditScreen. `쇼핑 정보` 마일리지→MileageScreen(최근 본 상품 onTap null 유지).
    - 완료 기준: 프로필 실데이터 렌더(SC-004), 하드코딩 제거(SC-005), 항목 Navigator 배선

- [x] **T011** `[P]` — 개인정보수정 화면
    - 레이어: C
    - 구현 파일: `mobile/customer_app/lib/features/mypage/profile_edit_screen.dart`(신규)
    - 관련 요구사항: FR-004 (plan B-3)
    - 상세: `ConsumerStatefulWidget`. 진입 시 `GET /users/me`(name/phone) prefill. 저장→`PATCH /users/me { name, phone }`. 성공→`ref.invalidate(authMeProvider)`·`userProfileProvider` + 화면 반영(SC-006). 실패→SnackBar + 입력값 유지(SC-007). address_edit_screen 폼 패턴 계승.
    - 완료 기준: prefill·PATCH·성공/실패 처리(SC-006/007 테스트)

- [x] **T012** `[P]` — FAQ·공지·마일리지 정적 화면
    - 레이어: C
    - 구현 파일: `mobile/customer_app/lib/features/support/faq_screen.dart`, `notice_screen.dart`, `mobile/customer_app/lib/features/mileage/mileage_screen.dart`(신규 3)
    - 관련 요구사항: FR-006/007/009 (plan B-4/B-6)
    - 상세: FAQ `const List<({String q, String a})>`(≥1건) ExpansionTile. 공지 `const List<({String title, String date})>`(≥1건) ListView. 마일리지 "서비스 준비 중입니다" 아이콘+문구 placeholder.
    - 완료 기준: 정적 항목 ≥1 렌더(SC-010/011), 준비중 문구(SC-013)

- [x] **T013** `[P]` — 알림 설정 화면
    - 레이어: C
    - 구현 파일: `mobile/customer_app/lib/features/notification/notification_settings_screen.dart`(신규)
    - 관련 요구사항: FR-008 (plan B-5, ADR-008)
    - 상세: `shared_preferences` bool 영속(`notif_order`·`notif_delivery`·`notif_event`). 진입 시 `getInstance` 로드, `SwitchListTile onChanged` → 즉시 `setBool`. 앱 재진입 복원(SC-012).
    - 완료 기준: 스위치 표시·on/off 저장·재진입 복원(SC-012 테스트)

- [x] **T014** `[P]` — 1:1 문의 mailto 실행 (mypage 연동 유틸)
    - 레이어: C
    - 구현 파일: `mobile/customer_app/lib/features/support/support_actions.dart`(신규, mailto 실행 함수) 또는 mypage_screen 내 함수
    - 관련 요구사항: FR-005 (plan B-4, ADR-009)
    - 상세: `launchSupportEmail()` — `launchUrl(Uri(scheme:'mailto', path: kSupportEmail, query: 'subject=...'))`. 실패(false/예외)→SnackBar 안내. mypage 1:1문의 onTap 에서 호출.
    - 완료 기준: mailto Uri 로 launchUrl 호출(SC-008), 실패 fallback

- [x] **T015** `[P]` — LoginScreen 링크 활성화 + 이메일 찾기 텍스트
    - 레이어: C
    - 구현 파일: `mobile/customer_app/lib/features/auth/login_screen.dart`
    - 관련 요구사항: FR-010/014 (plan B-8)
    - 상세: `_LinkRow` tappable 전환. `'아이디 찾기'`→`'이메일 찾기'` 텍스트 변경 + GestureDetector→`EmailFindScreen`(SC-021). `'비밀번호 재설정'`→GestureDetector→`PasswordResetRequestScreen`(SC-014). 회원가입·소셜 현 상태 유지.
    - 완료 기준: 링크 탭 시 각 화면 이동(SC-014/021)

- [x] **T016** `[P]` — 비밀번호 재설정 2화면 + 이메일 찾기 화면
    - 레이어: C
    - 구현 파일: `mobile/customer_app/lib/features/auth/password_reset_request_screen.dart`, `password_reset_confirm_screen.dart`, `email_find_screen.dart`(신규 3)
    - 관련 요구사항: FR-011/012/013/015/016 (plan B-9/B-10)
    - 상세:
      - request: email→`POST /auth/forgot-password`. 200→confirm 화면 전환(SC-015). 4xx→안내(SC-016). 발송 직후 재발송 60초 비활성 `Timer` 카운트다운(SC-019, dispose 취소).
      - confirm: OTP(6자리)+새 비번→`POST /auth/reset-password`. 성공→LoginScreen(SC-017). 4xx→안내(SC-018).
      - email_find: phone→`POST /auth/find-email`. 200→마스킹 이메일 표시(서버 결과 그대로, SC-022/024). 4xx→안내(SC-023).
    - 완료 기준: 3 화면 흐름·API 호출·타이머(SC-015~019/021~024 UI), `flutter analyze` 0 issues

### Step 4. 테스트 (레이어 D — 5a Test Agent AUTHORING)

- [ ] **T017** — 백엔드 단위 테스트 (auth.service + util)
    - 레이어: D
    - 테스트 파일: `apps/backend/src/modules/auth/auth.service.spec.ts`(확장), `apps/backend/src/modules/auth/auth.util.spec.ts`(신규)
    - 검증 대상: SC-024(maskEmail), forgotPassword/resetPassword/findEmail 단위 분기(mock repository·mock MailerPort)
    - 상세: maskEmail 경계(local 1/2/3+자). forgot 미존재→NotFound·rate-limit→429·정상→createOtp+sendOtpEmail. reset 없음/consumed/expired/mismatch→400·정상→트랜잭션. find 없음→NotFound·정상→마스킹. 기존 SC-001 getProfile 테스트에 name 필드 확인 추가(선택).
    - 완료 기준: 신규 단위 GREEN(5b), 기존 getProfile 테스트 회귀 없음(§F)

- [ ] **T018** — 백엔드 e2e 테스트 (supertest + StubMailer)
    - 레이어: D
    - 테스트 파일: `apps/backend/test/auth-recovery.e2e-spec.ts`(신규) 또는 `auth.e2e-spec.ts` 확장
    - 검증 대상: SC-015/016/017/018/020/022/023
    - 상세: StubMailer(`NODE_ENV=production` 이지만 MAIL_DRIVER 로 stub 강제 또는 test provider override)·test PostgreSQL. forgot 정상 200·OTP DB 생성 / 미가입 404 / reset 유효 OTP 200·password 변경·consumed / 만료 OTP 400(expiresAt 과거 seed) / 1분내 2회 429 / find 등록 phone 200 마스킹 / 미등록 phone 404.
    - 완료 기준: e2e GREEN(5b, `test:e2e`). StubMailer 로 실 SMTP 불요

- [ ] **T019** — Flutter 위젯/단위 테스트
    - 레이어: D
    - 테스트 파일: `mobile/customer_app/test/features/*_test.dart`(신규 다수)
    - 검증 대상: SC-001·003·004·006·007·008·012·014·019·021
    - 상세: mock Dio(GET /categories·/auth/me·/users/me·POST 계정복구)·`SharedPreferences.setMockInitialValues`·`url_launcher` platform mock. category 재시도(SC-003), mypage name/email(SC-004), profile_edit PATCH/실패(SC-006/007), mailto launchUrl(SC-008), 알림 재진입(SC-012), 링크 이동(SC-014/021), 재발송 타이머 disabled(SC-019). SC-001 은 mock Dio 위젯 렌더 갈음(실통합 옵션 C defer).
    - 완료 기준: 위젯/단위 GREEN(5b)

- [ ] **T020** — Flutter 정적 검증 + analyze
    - 레이어: D
    - 테스트 파일: `mobile/customer_app/test/static_verification_test.dart`(신규, 소스 문자열 검증) + `flutter analyze`
    - 검증 대상: SC-002·005·009·010·011·013·026
    - 상세: category_screen 하드코딩 카테고리 리스트 부재(SC-002), mypage `'내 계정'`/`'user@email.com'` 부재(SC-005), 고객지원 이메일 리터럴 하드코딩 0·`kSupportEmail` 상수 1곳(SC-009), FAQ/공지/마일리지 정적 콘텐츠 존재(SC-010/011/013), `flutter analyze` 0 issues(SC-026).
    - 완료 기준: 정적 테스트 GREEN + analyze 0 issues

> **defer(옵션 C)**: SC-025(GET /categories P95 3초)는 운영 측정(infra §4 모니터링) — 파이프라인 내 미실행. SC-001 실통합·실 이메일 발송은 사후 운영 검증(spec §사후).

---

## SC → 태스크 역방향 매핑 검증

| SC | 유형 | 구현 태스크(A/B/C) | 테스트 태스크(D) |
|---|---|---|---|
| SC-001 | integration(옵션C)/위젯 | T009(category 기존) | T019(mock Dio 갈음) |
| SC-002 | static | T009(GAP-013-01 現 상태) | T020 |
| SC-003 | unit | T009 | T019 |
| SC-004 | unit | T005(getProfile name)·T008·T010 | T019 |
| SC-005 | static | T010 | T020 |
| SC-006 | unit | T011 | T019 |
| SC-007 | unit | T011 | T019 |
| SC-008 | unit | T014 | T019 |
| SC-009 | static | T008(kSupportEmail)·T014 | T020 |
| SC-010 | static | T012 | T020 |
| SC-011 | static | T012 | T020 |
| SC-012 | unit | T013 | T019 |
| SC-013 | static | T012 | T020 |
| SC-014 | unit | T015 | T019 |
| SC-015 | integration | T005·T007 | T018 |
| SC-016 | integration | T005·T007 | T018 |
| SC-017 | integration | T004·T005·T007 | T018 |
| SC-018 | integration | T005·T007 | T018 |
| SC-019 | unit | T016 | T019 |
| SC-020 | integration | T005·T007 | T018 |
| SC-021 | unit | T015 | T019 |
| SC-022 | integration | T004·T005·T007 | T018 |
| SC-023 | integration | T004·T005·T007 | T018 |
| SC-024 | unit | T003(maskEmail) | T017 |
| SC-025 | 운영(옵션C defer) | — (기존 GET /categories) | 운영 모니터링(infra §4) |
| SC-026 | static | 전 Flutter 태스크 | T020(flutter analyze) |

> SC-001~026 전수 매핑 완료(누락 0). SC-025 는 옵션 C defer(plan §테스트 전략 승인) — 파이프라인 내 테스트 태스크 없음, 운영 측정 위임.

---

## Test Authoring Contract

> **5a Test Agent (AUTHORING) 입력 contract**. PPG-1 병렬 진행 시 production 코드 미참조 하에 심볼을 canonical 로 고정한다.

### production 심볼 canonical (PROC-004)

**백엔드 (apps/backend)**
- `AuthService.forgotPassword(email: string): Promise<void>` — 미가입 `NotFoundException`, 1분내 재요청 `HttpException(HttpStatus.TOO_MANY_REQUESTS=429)`, 정상 void(200). 부수효과: `AuthRepository.createOtp` + `MailerPort.sendOtpEmail`.
- `AuthService.resetPassword(email: string, otp: string, newPassword: string): Promise<void>` — OTP 없음/consumed/expired/mismatch `BadRequestException(400)`, 정상 void.
- `AuthService.findEmail(phone: string): Promise<{ email: string }>` — 미가입/phone null `NotFoundException`, 정상 마스킹 email.
- `maskEmail(email: string): string`(`auth.util.ts` named export) — `jo**@example.com` 형식.
- `AuthService.getProfile(userId): Promise<UserProfile>` — 반환에 `name: string | null` 추가(기존 id/email/createdAt/isAdmin 유지).
- 라우트: `POST /auth/forgot-password {email}`→200 / `POST /auth/reset-password {email,otp,newPassword}`→200 / `POST /auth/find-email {phone}`→200 `{email}`. 모두 anonymous(가드 없음).
- StubMailer: `lastSent: { to, otp } | null`(테스트에서 발송 OTP 캡처). MailerPort DI 토큰 = `MailerPort`(abstract class).
- 테이블: `password_reset_otps`(Prisma model `PasswordResetOtp`, 필드 `email/otpHash/expiresAt/consumedAt/createdAt`).

**Flutter (mobile/customer_app)**
- provider: `authMeProvider`(FutureProvider.autoDispose, GET /auth/me)·`userProfileProvider`(GET /users/me).
- 상수: `kSupportEmail`(`lib/core/app_config.dart`).
- 화면 클래스: `ProfileEditScreen`·`FaqScreen`·`NoticeScreen`·`NotificationSettingsScreen`·`MileageScreen`·`EmailFindScreen`·`PasswordResetRequestScreen`·`PasswordResetConfirmScreen`(모두 `const` 생성자, Navigator.push 진입).
- shared_preferences 키: `notif_order`·`notif_delivery`·`notif_event`(bool).

### SC별 시나리오 매핑

| SC-ID | 수용 기준 | Happy Path | Edge Case | Error Case | 테스트 파일 경로 | 비고 |
|---|---|---|---|---|---|---|
| SC-001 | CategoryScreen GET /categories 렌더 | test_category_renders_from_provider | — | — | mobile/customer_app/test/features/category_screen_test.dart | [env:integration] mock Dio 갈음 |
| SC-002 | 하드코딩 카테고리 부재 | test_no_hardcoded_category_list | — | — | .../test/static_verification_test.dart | [env:static] grep |
| SC-003 | 조회 실패 재시도 | — | — | test_category_error_shows_retry | .../test/features/category_screen_test.dart | [env:unit] invalidate |
| SC-004 | 마이페이지 name/email | test_mypage_shows_profile | — | — | .../test/features/mypage_screen_test.dart | [env:unit] |
| SC-005 | 프로필 하드코딩 제거 | test_no_hardcoded_profile_strings | — | — | .../test/static_verification_test.dart | [env:static] |
| SC-006 | 개인정보수정 PATCH 반영 | test_profile_edit_patch_success | — | — | .../test/features/profile_edit_screen_test.dart | [env:unit] |
| SC-007 | PATCH 실패 입력 유지 | — | — | test_profile_edit_patch_error_keeps_input | .../test/features/profile_edit_screen_test.dart | [env:unit] |
| SC-008 | 1:1 문의 mailto | test_support_launches_mailto | — | — | .../test/features/support_actions_test.dart | [env:unit] url_launcher mock |
| SC-009 | 고객지원 이메일 상수화 | test_support_email_is_constant | — | — | .../test/static_verification_test.dart | [env:static] |
| SC-010 | FAQ ≥1건 | test_faq_has_items | — | — | .../test/features/faq_screen_test.dart | [env:static] |
| SC-011 | 공지 ≥1건 | test_notice_has_items | — | — | .../test/features/notice_screen_test.dart | [env:static] |
| SC-012 | 알림 설정 재진입 복원 | — | test_notif_settings_persist_restore | — | .../test/features/notification_settings_screen_test.dart | [env:unit] setMockInitialValues |
| SC-013 | 마일리지 준비중 문구 | test_mileage_shows_placeholder | — | — | .../test/features/mileage_screen_test.dart | [env:static] |
| SC-014 | 비번재설정 링크 이동 | test_login_link_to_reset | — | — | .../test/features/login_screen_test.dart | [env:unit] |
| SC-015 | forgot 가입 이메일 200 | test_forgot_registered_returns_200 | — | — | apps/backend/test/auth-recovery.e2e-spec.ts | [env:integration] StubMailer |
| SC-016 | forgot 미가입 4xx | — | — | test_forgot_unregistered_returns_404 | apps/backend/test/auth-recovery.e2e-spec.ts | [env:integration] |
| SC-017 | reset 유효 OTP 변경 | test_reset_valid_otp_changes_password | — | — | apps/backend/test/auth-recovery.e2e-spec.ts | [env:integration] |
| SC-018 | 만료 OTP 거부 | — | test_reset_expired_otp_rejected | test_reset_expired_otp_rejected | apps/backend/test/auth-recovery.e2e-spec.ts | [env:integration] expiresAt 과거 seed |
| SC-019 | 재발송 1분 UI 비활성 | — | test_resend_button_disabled_60s | — | .../test/features/password_reset_request_screen_test.dart | [env:unit] fake timer |
| SC-020 | 1분내 2회 forgot 거부 | — | — | test_forgot_twice_returns_429 | apps/backend/test/auth-recovery.e2e-spec.ts | [env:integration] |
| SC-021 | 이메일 찾기 링크 이동 | test_login_link_to_email_find | — | — | .../test/features/login_screen_test.dart | [env:unit] |
| SC-022 | find-email 마스킹 반환 | test_find_email_returns_masked | — | — | apps/backend/test/auth-recovery.e2e-spec.ts | [env:integration] |
| SC-023 | find-email 미가입 4xx | — | — | test_find_email_unregistered_404 | apps/backend/test/auth-recovery.e2e-spec.ts | [env:integration] |
| SC-024 | maskEmail 형식 | test_mask_email_format | test_mask_email_short_local | — | apps/backend/src/modules/auth/auth.util.spec.ts | [env:unit] local≤2 경계 |
| SC-026 | flutter analyze 0 issues | test_flutter_analyze_clean | — | — | (CI: flutter analyze) | [env:static] |

> SC-018 은 Edge(만료 경계)+Error. SC-024 는 Happy+Edge(local≤2). Test Agent 는 coverage.md 에 유형별 충족 기록.
> 외부 contract 공급(ExternalAuthoring) 가능 — main 이 산출물(test-cases.md + 테스트 파일) 존재 확인 후 5b 진입.

---

## 최적 설계 재검토 결과 (PATCH-A15 / D4)

D2 분해 후 구조·로직·효율·성능·안정 전반 재검토:

- **효율성**: OTP rate-limit 과 검증이 각각 `findLatestOtpByEmail` 1회 조회로 처리 — 중복 순회 없음. maskEmail 은 순수 함수 1회. 재계산·과도 객체 생성 없음.
- **성능**: hot path 아님(계정 복구는 저빈도). bcrypt cost 10 은 기존 고정값(login P95 무관). GET /auth/me name 추가는 기존 findUserById 결과 재사용(추가 쿼리 0). NFR-001(P95 3초)은 기존 GET /categories 변경 없음.
- **안정성**: reset-password 3 write 를 `runInTransaction` 원자화(부분 성공 방지). OTP 1회용(consumedAt)+만료+SHA-256 3중 방어. rate-limit race window 는 정합성 위반 아님으로 판정(research §동시성 — Lock 불요 사유 명시). Flutter Timer dispose 취소로 누수 방지. SMTP 발송 실패 500 미전파(격리).
- **구조**: MailerPort 를 `infrastructure/mail/` 에 배치 — auth 도메인이 인프라 어댑터를 DI 주입(P-001 경계 정확). file/payment port 선례 계승. 책임 분리 적절.
- **로직**: reset 검증 4분기 early-return 은 각기 다른 가드(§E 중복 아님) — 통합 불요. §E 위반 없음.

**판정**: spec 범위 확장·개발 방향 재정의 **불요**. 추가 FR/SC 필요 없음. tasks.md 확정 진행. (BLOCKED 사유 없음)

---

## 태스크 입도 가이드

- 1 태스크 ≈ 구현 파일 1~3개 + 대응 테스트(레이어 D 별도). T016 은 신규 3 화면이나 동일 계정복구 흐름·상호 의존이라 1 태스크 유지(각 화면 ≤120줄).
- 백엔드(T001~T007)와 Flutter(T008~T016)는 상호 독립 — [P] 병렬.
- getProfile name 추가는 호출 측 5개 미만(§F, 회귀 없음)이라 T005 에 통합.

## 구현 완료 기준

- [ ] 모든 태스크 체크박스 완료(T001~T020)
- [ ] [Node/TS] `pnpm --filter backend build`(nest build) 0 error, `pnpm --filter backend test` + `test:e2e` PASS(5b)
- [ ] [Flutter] `flutter analyze` 0 issues(SC-026), `flutter test` PASS(5b)
- [ ] `prisma migrate status` up-to-date
- [ ] git status 의도치 않은 파일 없음
- [ ] gaps.md 처리: GAP-013-01(기록완료)·GAP-013-02(Security Agent 위임 — 6단계 후 실행). 신규 문서-갱신-필요 GAP(infra.md SMTP secret·context.md auth 역할)는 본 단계 등록
