---
작성: Design Agent
버전: v1.0
최종 수정: 2026-07-01 11:09
상태: 확정
---

# Research: 013-flutter-customer-phase2

## 목차

- [분석 우선순위 게이트 결과](#분석-우선순위-게이트-결과)
- [기존 코드베이스 분석](#기존-코드베이스-분석)
  - [클래스·모듈 계층 구조](#클래스모듈-계층-구조)
  - [영향 범위 분석 (호출 측 전수)](#영향-범위-분석-호출-측-전수)
  - [공유 상태·동시성 분석](#공유-상태동시성-분석)
- [외부 라이브러리 API 실제 동작 확인](#외부-라이브러리-api-실제-동작-확인)
- [F. production 시그니처 변경 — 호출 측 테스트 식별 (PROC-001)](#f-production-시그니처-변경--호출-측-테스트-식별-proc-001)
- [context.md 부정합 사전 점검 (PATCH-A11)](#contextmd-부정합-사전-점검-patch-a11)
- [배포 환경 영향 추정 (PATCH-A10)](#배포-환경-영향-추정-patch-a10)
- [기술 선택 조사](#기술-선택-조사)
- [엣지 케이스 및 한계](#엣지-케이스-및-한계)

---

## 분석 우선순위 게이트 결과

plan.md §핵심 설계에서 추출한 변경 대상 모듈로 분석 범위를 한정한다.

- **백엔드**: `src/modules/auth/*`(신규 라우트 3 + getProfile name), `src/infrastructure/mail/*`(신규), `prisma/schema.prisma`(신규 테이블), `.env.example`. 참조(변경 없음): `src/modules/user/*`(PATCH /users/me 재사용).
- **Flutter**: `lib/features/category/`, `lib/features/mypage/`, `lib/features/auth/`, 신규 `lib/features/profile|support|notification|mileage/`, `lib/core/`(app_config 신규·providers), `pubspec.yaml`.
- **§D 다단계 병렬 파이프라인**: plan 이 요구하지 않음 → 건너뜀.
- **§E 동일 가드 결정 통합**: 아래 §공유 상태·동시성에서 reset-password 검증 순서에 한해 점검.
- **외부 라이브러리 검증(§4)**: `nodemailer`(신규)·`url_launcher`·`shared_preferences`(신규) → 검증 수행. `dio`/`flutter_riverpod`/`bcrypt`/`class-validator` 는 기존 사용 패턴 재활용 → 생략.
- **§F production 시그니처 변경**: GET /auth/me `getProfile` 반환 타입 additive(`name`) → 수행(아래 §F).

---

## 기존 코드베이스 분석

> 전체 구조는 context.md §2 참조. 본 절은 변경 대상에 한정한 계층·영향·동시성 분석.

### 클래스·모듈 계층 구조

**백엔드 auth 모듈** (`apps/backend/src/modules/auth/`)
- `AuthController`(`@Controller('auth')`) — register/login/refresh/logout(anonymous) + me(`@UseGuards(JwtAuthGuard)`). 신규 라우트 3종은 **가드 없이**(anonymous) 추가 — 기존 login/register 와 동일 패턴.
- `AuthService` — `getProfile(userId): Promise<UserProfile>` 반환 `{ id, email, createdAt, isAdmin }`. 신규 메서드(`forgotPassword`/`resetPassword`/`findEmail`) 추가. bcrypt·`createHash('sha256')`·`randomUUID` 를 `node:crypto` 에서 이미 import(OTP 해시·생성에 재사용, 신규 import 최소).
- `AuthRepository` — `PrismaService` 주입, `users` 스키마만 접근(P-001). 기존 `findUserByEmail`(findUnique)·`findUserById`·`revokeRefreshToken`(tokenHash 단건). **신규 필요 메서드**: `findFirstUserByPhone`(phone 비유니크 → `findFirst`), OTP CRUD(`createOtp`/`findLatestOtpByEmail`/`markOtpConsumed`), 사용자 전체 refresh token revoke(`revokeAllRefreshTokensByUser` — reset 시 세션 무효화).
- `AuthModule` — `imports: [JwtModule.register({}), AuthSharedModule]`. 신규 `MailModule` import 추가.
- `UserProfile` 인터페이스는 auth.service.ts 와 user.service.ts 에 **각각 별도 정의**(auth: `id/email/createdAt/isAdmin`, user: `id/email/name/phone`). auth 쪽에 `name` 추가 시 auth.service.ts 의 인터페이스만 수정.

**신규 인프라 어댑터 `MailerPort`** — 기존 port 패턴 확인:
- `src/modules/file/file-storage.port.ts`: `interface FileStoragePort` + DI 토큰 상수 + `StubFileStorage` 구현. `FileModule` 이 `{ provide: FILE_STORAGE, useClass: StubFileStorage }` 로 wiring.
- `src/modules/payment/payment-gateway.port.ts` + `stub-payment-gateway.ts` 동일 패턴.
- **채택**: plan A-1 대로 `MailerPort`(abstract class) + `SmtpMailer`(nodemailer) + `StubMailer`. `MailModule` 이 `NODE_ENV`(또는 `MAIL_DRIVER`)로 provider `useClass` 선택 후 `exports: [MailerPort]`. abstract class 를 DI 토큰으로 사용(NestJS 표준 — 문자열 토큰 대신 클래스 토큰). 위치는 plan 명세대로 `src/infrastructure/mail/`(file/payment 는 `modules/` 하위지만 plan A-1 이 infrastructure 로 지정 — MailerPort 는 도메인 모듈이 아닌 순수 인프라 어댑터라 `infrastructure/` 배치가 P-001 경계상 더 정확).

**신규 테이블 `PasswordResetOtp`** — schema.prisma:
- `User { name String?; phone String? }` 이미 존재 → User 모델 변경 없음(ASM-004 확인 완료).
- `password_reset_otps` 신규 model 추가(plan §데이터 모델 그대로). `@@schema("users")`·`@@index([email, createdAt(sort: Desc)])`. 마이그레이션 단순 추가.

**Flutter 계층** (`mobile/customer_app/lib/`)
- Riverpod `Notifier`/`FutureProvider` 패턴, DI 는 `core/providers.dart`(`dioProvider`·`authControllerProvider`). 화면 전환은 `Navigator.push(MaterialPageRoute)`(go_router 미사용 계승 — 단 pubspec 에 `go_router ^17.2.3` 존재하나 실코드는 Navigator 사용, 계승).
- 응답은 `Map<String, dynamic>` 동적 파싱(009 GAP-009-01 계승).
- 폼 화면 표준: `address_edit_screen.dart`(`ConsumerStatefulWidget` + `TextEditingController` + `dio.patch` + 실패 시 SnackBar) → profile_edit 이 이 패턴 계승.

### 영향 범위 분석 (호출 측 전수)

| 파일 | 변경 유형 | 영향 내용 |
|---|---|---|
| `apps/backend/prisma/schema.prisma` | 수정 | `PasswordResetOtp` model 추가(User 무변경) |
| `apps/backend/prisma/migrations/*` | 신규 | `password_reset_otps` 생성 마이그레이션 |
| `apps/backend/src/infrastructure/mail/mailer.port.ts` | 신규 | `abstract class MailerPort { sendOtpEmail }` |
| `apps/backend/src/infrastructure/mail/smtp.mailer.ts` | 신규 | nodemailer SMTP transport |
| `apps/backend/src/infrastructure/mail/stub.mailer.ts` | 신규 | 무네트워크 stub(`lastSent` 캡처) |
| `apps/backend/src/infrastructure/mail/mail.module.ts` | 신규 | NODE_ENV provider 선택·export |
| `apps/backend/src/modules/auth/auth.constants.ts` | 신규 | `OTP_TTL_MIN=10`·`OTP_RESEND_WINDOW_SEC=60`·`OTP_LENGTH=6` |
| `apps/backend/src/modules/auth/auth.util.ts` | 신규 | `maskEmail`(순수 함수, SC-024) |
| `apps/backend/src/modules/auth/auth.service.ts` | 수정 | `forgotPassword`/`resetPassword`/`findEmail` 추가 + `getProfile` name 추가 + `UserProfile` 인터페이스 name 추가 |
| `apps/backend/src/modules/auth/auth.repository.ts` | 수정 | OTP CRUD·`findFirstUserByPhone`·`revokeAllRefreshTokensByUser` 추가 |
| `apps/backend/src/modules/auth/auth.controller.ts` | 수정 | POST forgot-password/reset-password/find-email 3 라우트 추가 |
| `apps/backend/src/modules/auth/auth.module.ts` | 수정 | `MailModule` import |
| `apps/backend/src/modules/auth/dto/*` | 신규 | ForgotPasswordDto·ResetPasswordDto·FindEmailDto |
| `apps/backend/src/modules/auth/dto/auth-response.dto.ts` | 수정 | `AuthProfileResponse.name?` additive + FindEmailResponse 신규 |
| `apps/backend/.env.example` | 수정 | SMTP_HOST/PORT/USER/PASS·MAIL_FROM 추가 |
| `apps/backend/package.json` | 수정 | `nodemailer` + `@types/nodemailer`(dev) |
| `mobile/customer_app/pubspec.yaml` | 수정 | `url_launcher`·`shared_preferences` 추가 |
| `mobile/customer_app/lib/core/app_config.dart` | 신규 | `kSupportEmail` 상수(SC-009) |
| `mobile/customer_app/lib/features/category/category_screen.dart` | 수정 | error state 재시도 버튼(SC-003) |
| `mobile/customer_app/lib/features/mypage/mypage_screen.dart` | 수정 | `_ProfileRow` ConsumerWidget 전환 + 항목 onTap 배선 |
| `mobile/customer_app/lib/features/mypage/profile_edit_screen.dart` | 신규 | 개인정보수정(FR-004) |
| `mobile/customer_app/lib/features/support/faq_screen.dart` | 신규 | FAQ 정적(FR-006) |
| `mobile/customer_app/lib/features/support/notice_screen.dart` | 신규 | 공지 정적(FR-007) |
| `mobile/customer_app/lib/features/notification/notification_settings_screen.dart` | 신규 | 알림 설정(FR-008) |
| `mobile/customer_app/lib/features/mileage/mileage_screen.dart` | 신규 | 준비 중 placeholder(FR-009) |
| `mobile/customer_app/lib/features/auth/login_screen.dart` | 수정 | `_LinkRow` tappable + 아이디→이메일 찾기 텍스트(FR-014) |
| `mobile/customer_app/lib/features/auth/password_reset_request_screen.dart` | 신규 | forgot 요청(FR-010/011/013) |
| `mobile/customer_app/lib/features/auth/password_reset_confirm_screen.dart` | 신규 | OTP+새비번(FR-012) |
| `mobile/customer_app/lib/features/auth/email_find_screen.dart` | 신규 | 전화번호→이메일(FR-015/016) |
| `mobile/customer_app/lib/core/providers.dart` | 수정 | `authMeProvider`·`userProfileProvider`(FutureProvider) 추가 |
| iOS `Info.plist` / Android manifest | 수정 | url_launcher `mailto` scheme 허용(플랫폼 권한) |

**호출 측 무영향 확인**:
- `getProfile` name 추가는 additive — 상세 §F.
- 신규 3 엔드포인트는 기존 라우트와 path 충돌 없음(forgot-password/reset-password/find-email).
- Flutter 신규 화면은 Navigator.push 로만 진입 — 기존 화면 라우팅 무영향. login_screen `_LinkRow` 만 수정.

### 공유 상태·동시성 분석

**OTP rate-limit / 검증 — Check-Then-Act 점검**:
- `forgotPassword`: `findLatestOtpByEmail` 로 최근 OTP `createdAt` 확인 → 조건 통과 시 `createOtp`. **Check-Then-Act 존재**(조회 후 생성). 동일 email 로 1분 내 2개 동시 요청 시 이론상 둘 다 rate-limit 통과 후 2건 생성 가능(race window).
  - **안전성 판단**: 본 서비스는 human-triggered 비밀번호 재설정(초당 동일 email 동시 요청은 현실적 없음). 최악의 경우 OTP 2건 생성이나, 두 OTP 모두 정상 만료·1회용이라 **정합성 위반 없음**(rate-limit 은 스팸 억제 목적, 원자성 불요). DB 유니크 제약·Lock 불요. NFR-003 은 "1분당 최대 1회" 를 rate-limit 검사로 충족하며 극단 race 는 spec 목적(스팸 방지) 훼손 아님. → **Lock 없이 안전**(사유 명시 완료).
- `resetPassword`: `findLatestOtpByEmail` → consumed/expired/mismatch 검증 → 통과 시 `runInTransaction`(비번 갱신 + `markOtpConsumed` + refresh token revoke). 트랜잭션으로 3 write 원자화. 동일 OTP 2회 동시 reset 시 `consumedAt` 갱신 경합 가능하나 두 번째는 `consumedAt != null` 로 400(1회용) — 트랜잭션 격리로 최종적으로 1회만 성공. → 트랜잭션 사용으로 안전.

**§E 동일 가드 조건 결정 통합 점검**:
- `resetPassword` 검증은 각기 다른 가드(없음/consumed/expired/mismatch)를 순차 early-return — 동일 가드 중복 아님(통합 대상 아님). 통합 불요.

**Flutter 재발송 타이머(SC-019)**:
- `password_reset_request_screen` 의 60초 카운트다운은 화면 로컬 `Timer` + `setState`. 공유 상태 아님(단일 위젯). `dispose` 에서 `Timer.cancel()` 필수(누수 방지) — tasks 완료 기준에 명시.

**shared_preferences(알림 설정)**:
- 단일 기기 로컬, 동기 write. 동시성 없음(UI 스레드 순차). SwitchListTile onChanged → 즉시 `setBool`. Lock 불요.

**캐싱 컴포넌트**: 본 spec 은 캐시 데코레이터 신규 없음(FutureProvider.autoDispose 는 화면 dispose 시 자동 해제). 조기 해제 원칙 해당 없음.

---

## 외부 라이브러리 API 실제 동작 확인

> plan §외부 라이브러리 동작 검증과 cross-check. 신규 3종 검증.

| 라이브러리 | 가정 | 실제 동작(근거) | 한계·안전망 |
|---|---|---|---|
| `nodemailer`(신규, backend) | `createTransport(smtp).sendMail()` Promise, 실패 시 reject | 공식 API: `createTransport({host,port,auth}).sendMail({from,to,subject,text})` → Promise resolve(info)/reject(연결·인증 실패). 동기적으로 발송 성공/실패 확정 가능 | **한계**: SMTP 250 OK ≠ inbox 도달(bounce·스팸 비동기). **안전망**: 발송 실패해도 OTP 는 DB 선기록(재발송 가능) + 발송 실패를 500 전파하지 않고 일반 안내(plan §SMTP 실패 격리). StubMailer 로 파이프라인 내 통합 검증(무SMTP) |
| `url_launcher`(신규, Flutter) | `launchUrl(Uri(scheme:'mailto'))` 기기 메일 앱 실행 | 공식: `launchUrl(uri)` → `Future<bool>`. `mailto:` scheme 지원. 메일 앱 부재 시 `false` 반환 또는 `PlatformException`. iOS 는 `Info.plist` `LSApplicationQueriesSchemes` 에 mailto 등록 필요(`canLaunchUrl` 사용 시) | **한계**: 메일 앱 미설치 기기 실행 실패. **안전망**: 반환 false/예외 → SnackBar 안내 fallback. SC-008 단위 테스트는 `url_launcher_platform_interface` mock 으로 launchUrl 호출 검증(실 기기 불요) |
| `shared_preferences`(신규, Flutter) | bool 영속·앱 재시작 후 복원 | 공식: `SharedPreferences.getInstance()` → `setBool`/`getBool`. 플랫폼 native(iOS NSUserDefaults/Android SharedPreferences) 영속 | **한계**: 기기 로컬만(동기화 없음, spec 범위 내). **안전망**: SC-012 단위 테스트는 `SharedPreferences.setMockInitialValues({})` 로 in-memory mock 검증 |

> 가정↔실제 불일치 **없음** — plan §외부 라이브러리 동작 검증 결과와 일치. BLOCKED 사유 없음. private API 사용 없음(PROC-013 해당 없음).

---

## F. production 시그니처 변경 — 호출 측 테스트 식별 (PROC-001)

### 변경되는 production 메서드 목록

| 메서드 | 시그니처 전 | 시그니처 후 | 변경 성격 |
|---|---|---|---|
| `AuthService.getProfile` | `getProfile(userId): Promise<UserProfile>` 반환 `{id,email,createdAt,isAdmin}` | 동일 시그니처, 반환 `{id,email,createdAt,isAdmin,name}` | **반환 타입 additive**(인자·async·기존 필드 무변경) |

> 신규 3 메서드(`forgotPassword`/`resetPassword`/`findEmail`)는 **신규 추가** — 기존 호출 측 없음(호출 측 마이그레이션 대상 아님).

### `getProfile` / GET /auth/me 직접 호출·단언 테스트 전수 (grep 결과)

| 파일 | 위치 | 단언 방식(read representation) | additive `name` 영향 |
|---|---|---|---|
| `apps/backend/src/modules/auth/auth.service.spec.ts` | L103·119·132 (SC-001 블록) | `expect(result).toHaveProperty('isAdmin')` + `typeof result.isAdmin` + `result.isAdmin === true/false` | **무영향** — 부분 속성 단언, `toEqual`/`toStrictEqual` 전체 객체 매칭 **없음**. additive 필드 통과 |
| `apps/backend/test/auth.e2e-spec.ts` | L200~220 (SC-019) | `response.body.toHaveProperty('createdAt')` + id/email/createdAt 개별 | **무영향** — strict body 매칭 없음. additive 필드 통과 |
| `apps/console/lib/auth.tsx` | L26 | `isAdmin` 필드만 소비. `UserProfile`(@doa/shared-types) 타입 | **무영향(런타임)** — name 미소비. TS 타입은 additive 옵셔널이라 컴파일 무영향(shared-types `UserProfile` 에 `name?` 추가는 선택 — 소비 안 하면 불요) |

### 호출 측 마이그레이션 필요 여부 판정

- **반환 타입 변경(additive optional)** → 기존 단언이 모두 부분 속성 검사(`toHaveProperty`)이며 strict-equality 없음 → **호출 측 마이그레이션 불요**. 기존 테스트 PASS 유지(회귀 없음).
- (PROC-001 확장) 단언이 읽는 representation: `result.isAdmin`(속성 직접)·`response.body.createdAt`(속성 직접). additive `name` 은 이 representation 을 바꾸지 않음 → PASS 유지 예측 신뢰 가능.
- (PROC-002 바인딩) 의존 바인딩 형태 변경 없음(mock target 무변경) → mock 무효화 위험 없음.
- 정적 AST 검사 테스트(`_find_funcdef` 류) 없음 — 해당 없음.

### 본 spec 범위 포함 여부

- `getProfile` name 추가 = **본 spec FR-003/SC-004 명시 범위 내**(GET /auth/me name·email 표시). tasks.md T-A? 에 포함 + SC-004(Flutter 소비) 매핑. **범위 위반 없음** → BLOCKED 불요.
- 신규 SC-004 는 Flutter 측 단위 테스트(auth/me mock 응답 name·email 렌더). 백엔드 name 추가의 회귀 안전은 위 표로 확인.

> **한계**: 동적 호출(getattr/eval 류) 은 TS/Dart 코드에 해당 패턴 없음. CI 전체 suite(`test` + `test:e2e`)가 사후 안전망.

---

## context.md 부정합 사전 점검 (PATCH-A11)

변경 대상 클래스·필드·용어를 context.md §2/§5/§6 에서 grep 대조:
- `AuthService`·`AuthRepository`·`AuthController` — context.md §2 핵심 모듈에 등재. 신규 메서드·라우트는 **additive** — 기존 정의 무효화 없음. 6단계 Docs 에서 §2 auth 모듈 역할에 "비밀번호 재설정 OTP·이메일 찾기" 추가 필요(GAP 등록 대상).
- `password_reset_otps` 신규 테이블 — context.md §4 데이터 모델(users 스키마)에 신규 항목 추가 필요(Docs 갱신).
- §6 알려진 제약 "이메일 알림 제공자 미결정 (notification 모듈)" 항목 — 본 spec 의 SMTP MailerPort 도입은 **auth 도메인 OTP 발송 한정**(notification 모듈 이메일과 별개). §6 항목은 그대로 유효(notification 모듈 미해소). 단 Docs 단계에서 "auth OTP 는 SMTP MailerPort 로 발송(013)" 을 §2/§4 에 반영 권고.
- **부정합 없음** — 기존 정의 변경 아닌 additive. Docs/Retrospective 갱신 항목은 gaps.md 에 문서-갱신-필요로 등록.

---

## 배포 환경 영향 추정 (PATCH-A10)

infra.md §3/§8 cross-reference(plan §배포 환경 영향 계승):
- **신규 환경변수** `SMTP_HOST/SMTP_PORT/SMTP_USER/SMTP_PASS/MAIL_FROM` — Fly secret 주입. infra.md §7 배포 체크리스트·§8 미기재 → **gaps.md 문서-갱신-필요 등록**(Docs/Retrospective 위임).
- `password_reset_otps` 마이그레이션 — `prisma migrate deploy`(infra §3 release 자동). zero-downtime 위험 낮음(단순 추가).
- CORS — 011 활성(infra §8), Flutter origin 허용은 운영 `CORS_ORIGIN` 화이트리스트(본 spec 코드 변경 아님).
- socket/NAT/keepalive 등 환경 특이성 — 본 spec API 는 표준 HTTP request/response, 장기 연결·health check 없음 → 해당 없음.
- critical 영향(서비스 중단/거짓 신호) 아님 → 안전망은 stub fallback·rate-limit·트랜잭션으로 충분.

---

## 기술 선택 조사

plan §결정 기록(ADR-001~009)와 cross-reference. 본 절은 코드베이스 수준 검증만 보강:
- **MailerPort abstract class vs interface**: 기존 file/payment 는 `interface` + 문자열 DI 토큰. Mailer 는 **abstract class** 채택(plan A-1) — NestJS 에서 abstract class 를 DI 토큰으로 직접 사용 가능(문자열 토큰 불요, 타입 안전). 두 방식 모두 프로젝트 선례 범위 내이며 abstract class 가 provider `useClass` 와 더 간결.
- **OTP 해시**: `createHash('sha256')` 는 auth.service.ts 가 refresh token 해시(`hashToken`)에 이미 사용 — 동일 헬퍼 패턴 재사용(ADR-005 계승).
- **트랜잭션**: `PrismaService.runInTransaction<T>(fn)` 존재(ALS 기반) — reset-password 3 write 원자화에 사용(신규 트랜잭션 인프라 불요).
- **phone 조회**: schema `phone String?` 비유니크 확정 → `findFirst({ where: { phone } })`(findUnique 불가, ADR-007).

---

## 엣지 케이스 및 한계

- **maskEmail 경계**(SC-024): `a@x.com`(local 1자) → `a**@x.com`, `ab@x.com`(2자) → `ab**@x.com`, `johndoe@x.com` → `jo**@x.com`. `keep = local.slice(0, min(2, local.length))` + `'**'` + `'@'` + domain. `@` 없는 입력은 방어(정상 이메일은 DTO `@IsEmail` 로 보장, find-email 반환값은 DB 이메일이라 항상 유효).
- **OTP 발송 실패 격리**: `sendOtpEmail` reject 시 forgot-password 는 500 전파 금지 — OTP DB 선기록 후 발송, 발송 실패는 로깅 + 일반 200 또는 안내(plan §SMTP 실패 격리). 단 SC-015 는 StubMailer(항상 성공)로 200 검증.
- **재발송 타이머 누수**: Flutter `Timer` dispose 취소 필수.
- **url_launcher iOS 권한**: `Info.plist LSApplicationQueriesSchemes: [mailto]` 미설정 시 `canLaunchUrl` false. Development 가 플랫폼 설정 점검(tasks 완료 기준).
- **flutter analyze 0 issues**(SC-026/NFR-005): 신규 dep 2종·신규 화면 6종 추가 후 lint 통과 확인 — 미사용 import·const 누락 주의.
- **enumeration/PII(GAP-013-02)**: spec 충족(404·마스킹) 우선, 완화는 Security Agent(활성) 위임. Design 단계는 spec 대로 구현 태스크 분해.
