---
작성: Planning Agent
버전: v1.0
최종 수정: 2026-07-01
상태: 확정
---

# Plan: 013-flutter-customer-phase2

> Branch: 013-flutter-customer-phase2 | Date: 2026-07-01 | Spec: [spec.md](../spec/spec.md)

## 목차

- [사전 검증 (Constitution Gates)](#사전-검증-constitution-gates)
- [기술 컨텍스트](#기술-컨텍스트)
- [외부 라이브러리 동작 검증](#외부-라이브러리-동작-검증)
- [핵심 설계](#핵심-설계)
- [결정 기록 (ADRs)](#결정-기록-adrs)
- [인터페이스 계약](#인터페이스-계약)
- [데이터 모델](#데이터-모델)
- [테스트 전략](#테스트-전략)
- [기타 고려사항](#기타-고려사항)

---

## 사전 검증 (Constitution Gates)

> `.claude/docs/constitution.md` 의 P-001~P-007 을 무조건 우선 기준으로 사용한다. spec.md NFR 이 완화된 경우 constitution 으로 상향한다.

- [x] **P-001 모듈 경계 원칙**: 신규 백엔드 코드는 `auth` 모듈(`users` 스키마)에만 접근한다. forgot/reset/find-email 는 `AuthRepository`(users.users·신규 users.password_reset_otps)만 사용. 개인정보수정은 기존 `user` 모듈 PATCH /users/me 재사용(타 모듈 변경 없음). `MailerPort` 는 도메인 모듈이 아닌 `src/infrastructure/mail/` 인프라 어댑터 — DI 주입(교차 스키마 쿼리 0). **Pass 기준: 타 도메인 스키마 직접 참조·JOIN 0건.**
- [x] **P-002 AWS 의존 금지 원칙**: 이메일 발송은 표준 SMTP(`nodemailer`)로 구현. `@aws-sdk/*`·AWS SES SDK·Cognito 등 신규 도입 0. **Pass 기준: AWS 전용 SDK/서비스 신규 의존 0건.**
- [x] **P-003 단일 DB 원칙**: OTP 영속은 기존 단일 PostgreSQL `users` 스키마 신규 테이블(`password_reset_otps`)로 처리. 별도 Redis/외부 캐시/별도 DB 도입 0. 알림 설정은 Flutter 기기 로컬(범위 외 백엔드). **Pass 기준: 단일 PostgreSQL 외 외부 데이터 저장소 추가 0건.**
- [x] **P-004 클라우드 중립 원칙**: SMTP 는 provider-agnostic(환경변수 SMTP_HOST/PORT/USER/PASS). Fly.io 전용 API 미사용. 이메일 provider 는 배포 secret 으로 교체 가능. **Pass 기준: Fly.io 전용 API 비즈니스 결합 0건.**
- [x] **P-005 결제·정산 정합성 원칙**: 본 spec 은 결제·환불·정산 흐름 미포함(해당 없음). **Pass 기준: 금전 상태 변경 0건 — 해당 없음.**
- [x] **P-006 테스트 원칙**: 16개 FR 전부 SC 보유(역검증 완료, 매트릭스 누락 0). FR-001→SC-001/002, FR-002→SC-003 … FR-016→SC-024. **Pass 기준: SC 없는 FR 0건 — 충족.**
- [x] **P-007 스펙 범위 원칙**: 변경 범위는 spec.md FR/NFR 범위 내. 소셜 로그인(014)·알림 백엔드·FAQ/공지 CMS·마일리지 실기능은 명시적 범위 외로 미변경. **Pass 기준: spec 범위 외 변경 파일 0건.**

**예외 사항**: 없음 (P-001~P-007 전체 통과, 예외 기재 불요).

> Constitution Gates 전체 통과 — design/tasks 단계 진행 가능.

---

## 기술 컨텍스트

### 백엔드 (apps/backend)
- **언어 / 런타임**: Node.js 20, TypeScript, NestJS (모듈러 모놀리스)
- **주요 의존성**: Prisma(`users` 스키마), `@nestjs/jwt`·`passport-jwt`(기존), `bcrypt`(기존), `class-validator`/`class-transformer`(기존 DTO 검증), **`nodemailer`(신규 — SMTP 이메일 발송)**, `@types/nodemailer`(dev)
- **테스트 프레임워크**: Jest(단위) + supertest(`test:e2e`, PostgreSQL + `NODE_ENV=production`)

### Flutter 앱 (mobile/customer_app) — 009 스택 계승
- **언어 / 런타임**: Dart 3.x, Flutter SDK ^3.9.2
- **주요 의존성(기존)**: `flutter_riverpod ^3.3.2`, `dio ^5.10.0`, `flutter_secure_storage ^10.3.1`, `intl`
- **주요 의존성(신규)**: **`url_launcher`**(FR-005 mailto 실행), **`shared_preferences`**(FR-008 알림 설정 로컬 영속)
- **테스트 프레임워크**: `flutter_test`(위젯/단위), `flutter analyze`(정적, NFR-005 0 issues)

### 배포 환경 영향 (PROC-009 cross-reference)
infra.md §3·§8 점검 결과:
- 신규 백엔드 엔드포인트 3종은 기존 Fly.io backend app 에 추가되며 토폴로지 변경 없음. CORS 는 011 에서 활성(infra §8) — Flutter origin 허용 확인 필요(운영 `CORS_ORIGIN` 화이트리스트, 본 spec 코드 변경 아님).
- **신규 운영 의존성**: SMTP 이메일 provider 연결 + 신규 환경변수(`SMTP_HOST`·`SMTP_PORT`·`SMTP_USER`·`SMTP_PASS`·`MAIL_FROM`). Fly secret 으로 주입. infra.md §8 에 미기재 → Docs/Retrospective 단계에서 infra.md 갱신 위임(이메일 provider 결정·secret 목록).
- `password_reset_otps` 신규 테이블 → `prisma migrate deploy`(infra §3 배포 release 단계 자동). 단순 추가 마이그레이션 — zero-downtime 위험 낮음.
- critical 영향(서비스 중단/잘못된 신호) 추정 아님 → PATCH-A06 안전망은 stub fallback·rate-limit 로 충분(아래 위험 완화 설계 참조).

---

## 외부 라이브러리 동작 검증

> spec 가정이 외부 라이브러리 API 동작에 의존하는 항목 1회 검증 (§10).

| 가정 | 검증 방법 | 결과 | 한계(silent failure) |
|---|---|---|---|
| `nodemailer.createTransport().sendMail()` 가 SMTP 발송을 수행하고 실패 시 reject | nodemailer 공식 문서(표준 SMTP transport) | `sendMail` 은 Promise reject 로 전송 실패를 노출(연결 실패·인증 실패). 동기 발송 — forgot-password 응답 전 성공/실패 확정 가능 | **한계**: SMTP 250 OK 수신 ≠ 실제 inbox 도달(스팸 필터·bounce 는 비동기). 운영 모니터링으로 bounce 추적 필요(사후 운영 검증 #1). 안전망: 발송 실패 시에도 OTP 는 DB 기록되어 재발송(1분 후) 가능 |
| Prisma `findFirst({ where: { phone } })` 가 phone 비유니크 컬럼 조회 가능 | schema.prisma — `phone String?`(비유니크) 확인 | 비유니크 → `findFirst` 사용(findUnique 불가). 동일 phone 다중 사용자 시 첫 매치 반환 | **한계**: 동일 phone 복수 가입 시 임의 1건. 실데이터에서 phone 유니크성 미보장 → 운영 검증(사후 #3). ADR-007 참조 |
| `url_launcher.launchUrl(mailto Uri)` 가 기기 메일 앱 실행 | url_launcher 공식 문서(`mailto:` scheme 지원) | `launchUrl` + `Uri(scheme:'mailto')` 로 기기 메일 컴포저 실행. 메일 앱 부재 시 false 반환/throw | **한계**: 메일 앱 미설치 기기는 실행 실패 → SnackBar 안내 fallback 설계 |

---

## 핵심 설계

> Design Agent 가 추가 설계 판단 없이 tasks.md 를 분해할 수 있는 수준으로 작성. 변경 대상 모듈·인터페이스 시그니처·핵심 분기 포함.

### A. 백엔드 — 비밀번호 재설정 / 이메일 찾기 (FR-010~016, NFR-002/003/004)

**A-1. 신규 인프라 어댑터 `MailerPort` (`src/infrastructure/mail/`)**
- 프로젝트 기존 패턴(FileStoragePort+StubFileStorage, PaymentGatewayPort+stub) 계승.
```ts
// mailer.port.ts
export abstract class MailerPort {
  abstract sendOtpEmail(to: string, otp: string): Promise<void>;
}
// smtp.mailer.ts (production) — nodemailer SMTP transport, 환경변수 구성
// stub.mailer.ts (non-prod/test) — 무네트워크, 마지막 발송 캡처(lastSent) 후 즉시 resolve
```
- `MailModule` 가 `NODE_ENV`(또는 `MAIL_DRIVER`)로 SmtpMailer/StubMailer provider 선택. AuthModule 이 import.

**A-2. OTP 라이프사이클 (AuthService 확장)**
- `forgotPassword(email)`:
  1. 사용자 조회(`findUserByEmail`). 미존재 → `NotFoundException`(SC-016). *(enumeration trade-off — GAP-013-02, Security 위임)*
  2. **rate-limit(NFR-003/SC-020)**: `findLatestOtpByEmail(email)` 의 `createdAt > now - OTP_RESEND_WINDOW_SEC(60)` 이면 `HttpException(429)`(TooManyRequests).
  3. 6자리 OTP 생성(`randomInt(0, 1_000_000)` zero-pad). `otpHash = sha256(otp)`. `expiresAt = now + OTP_TTL_MIN(10)`.
  4. `createOtp({ email, otpHash, expiresAt })` → `mailer.sendOtpEmail(email, otp)`.
  5. 200 반환(본문 토큰 없음).
- `resetPassword(email, otp, newPassword)`:
  1. `findLatestOtpByEmail(email)`. 없음 → 400.
  2. `consumedAt != null` → 400(재사용 차단). `now > expiresAt` → 400(만료, SC-018/NFR-002).
  3. `sha256(otp) !== otpHash` → 400(불일치).
  4. 통과 → `bcrypt.hash(newPassword, 10)` 로 `user.password` 갱신 + `markOtpConsumed(otpId)` + 해당 사용자 refresh token 전체 revoke(보안 — 비번 변경 시 세션 무효화). 단일 트랜잭션(`runInTransaction`).
  5. 204/200 반환.
- 상수: `OTP_TTL_MIN=10`·`OTP_RESEND_WINDOW_SEC=60`·`OTP_LENGTH=6` 를 `auth.constants.ts` 로 관리(매직넘버 금지).

**A-3. 이메일 찾기 (FR-015/016, NFR-004)**
- `findEmail(phone)`: `findFirstUserByPhone(phone)`. 없음/phone null → `NotFoundException`(SC-023). 존재 → `{ email: maskEmail(user.email) }` 반환.
- `maskEmail(email)`(순수 함수, `auth.util.ts`, SC-024 단위 테스트 대상):
  - local/domain 분리(`@` 기준). `keep = local.slice(0, min(2, local.length))`. 결과 = `keep + '**' + '@' + domain`.
  - 예: `johndoe@example.com` → `jo**@example.com`. `ab@x.com` → `ab**@x.com`. `a@x.com` → `a**@x.com`.

**A-4. GET /auth/me 에 `name` 추가 (FR-003/SC-004)**
- 현재 `AuthService.getProfile` 반환 `{id, email, createdAt, isAdmin}` — **name 미포함**. `findUserById` 가 이미 전체 User(name 포함) 반환하므로 `name: user.name` 추가.
- `UserProfile` 인터페이스 + `AuthProfileResponse` DTO 에 `name?: string | null` 추가(하위호환 — additive, 기존 console 웹 isAdmin 소비 영향 없음).

**A-5. AuthController 신규 라우트(모두 anonymous — JWT 가드 없음)**
```
POST /auth/forgot-password   body: ForgotPasswordDto { email }              → 200
POST /auth/reset-password    body: ResetPasswordDto { email, otp, newPassword } → 200
POST /auth/find-email        body: FindEmailDto { phone }                   → 200 { email }
```
- DTO: `class-validator`(`@IsEmail`, `@Length(6,6)` OTP, `@MinLength` newPassword, `@IsString` phone).

### B. Flutter — 카테고리 / 마이페이지 / 로그인 연결 (FR-001~009, FR-010/014)

**B-1. 카테고리 재시도 (FR-001/FR-002, SC-001/002/003)**
- **실코드 상태(GAP-013-01)**: `category_screen.dart` 는 **이미** `categoriesProvider`(GET /categories) 호출·렌더링하며 하드코딩 목록 **없음** → FR-001/SC-002 사실상 充足.
- 신규 작업: error state(현재 오류 텍스트만)에 **재시도 버튼** 추가 → `ElevatedButton(onPressed: () => ref.invalidate(categoriesProvider))`. SC-003 충족.

**B-2. 마이페이지 프로필 실데이터 (FR-003, SC-004/005)**
- 신규 `authMeProvider = FutureProvider.autoDispose((ref) => dio.get('/auth/me'))`.
- `_ProfileRow` 를 `ConsumerWidget` 으로 전환 → `name ?? '회원'`·`email` 표시. 하드코딩 `'내 계정'`/`'user@email.com'` 제거(SC-005).

**B-3. 개인정보수정 (FR-004, SC-006/007) — 신규 화면 `profile_edit_screen.dart`**
- 진입 시 `GET /users/me`(name, phone) prefill. 저장 → `PATCH /users/me { name, phone }`. 성공 → `authMeProvider`·`userProfileProvider` invalidate + 화면 반영(SC-006). 실패 → 오류 SnackBar + 입력값 유지(SC-007).

**B-4. 고객 서비스 (FR-005/006/007, SC-008~011)**
- **1:1 문의(FR-005)**: `kSupportEmail` 상수(`lib/core/app_config.dart`). `launchUrl(Uri(scheme:'mailto', path: kSupportEmail, query: 'subject=...'))`. SC-009: 상수만 사용, 특정 주소 리터럴 하드코딩 금지(상수는 placeholder, 실값 구현 시 — ASM-001).
- **FAQ(FR-006)** / **공지사항(FR-007)**: 신규 정적 화면(`faq_screen.dart`·`notice_screen.dart`). `const List<FaqItem>`·`const List<NoticeItem>`(≥1건, 내용 ASM-002 구현 시). ExpansionTile/ListView 렌더링.

**B-5. 알림 설정 (FR-008, SC-012) — 신규 화면 `notification_settings_screen.dart`**
- `shared_preferences` 로 알림 유형별 bool 영속(`notif_order`·`notif_delivery`·`notif_event`). 진입 시 로드, SwitchListTile on/off 변경 시 즉시 저장. 앱 재진입 시 복원(SC-012).

**B-6. 마일리지 (FR-009, SC-013) — 신규 화면 `mileage_screen.dart`**
- "서비스 준비 중입니다" 안내 placeholder(아이콘 + 문구). SC-013 static.

**B-7. 마이페이지 항목 배선 (mypage_screen.dart)**
- `고객 서비스` 섹션 onTap 연결: 1:1문의→mailto, FAQ→FaqScreen, 공지사항→NoticeScreen, 알림설정→NotificationSettingsScreen, 개인정보수정→ProfileEditScreen.
- `쇼핑 정보` 마일리지 포인트 onTap→MileageScreen. (최근 본 상품 = 범위 외, onTap null 유지)

**B-8. 로그인 화면 링크 (FR-010/014, SC-014/021) — login_screen.dart `_LinkRow`**
- `_LinkRow` 를 tappable 로 전환:
  - `'아이디 찾기'` → **`'이메일 찾기'`** 텍스트 변경 + GestureDetector → `EmailFindScreen`(SC-021/FR-014).
  - `'비밀번호 재설정'` → GestureDetector → `PasswordResetRequestScreen`(SC-014/FR-010).
  - `'회원가입'`·`_SocialRow`(소셜) 현 상태 유지(014 범위).

**B-9. 비밀번호 재설정 플로우 (FR-011/012/013, SC-015~020) — 신규 화면 2종**
- `password_reset_request_screen.dart`: 이메일 입력 → `POST /auth/forgot-password`. 200 → OTP 화면 전환(SC-015). 4xx → 안내 메시지(SC-016). 발송 직후 재발송 버튼 60초 비활성 타이머(SC-019, `Timer` + 카운트다운).
- `password_reset_confirm_screen.dart`: OTP(6자리)+새 비밀번호 입력 → `POST /auth/reset-password`. 성공 → LoginScreen 이동(SC-017). 만료/오류 → 안내(SC-018 백엔드 4xx).

**B-10. 이메일 찾기 플로우 (FR-015/016, SC-021~024) — 신규 화면 `email_find_screen.dart`**
- 전화번호 입력 → `POST /auth/find-email`. 200 → 마스킹 이메일 표시(서버 마스킹 결과 그대로, SC-022/024). 4xx → 안내 메시지(SC-023).

---

## 결정 기록 (ADRs)

| ADR-ID | 결정 항목 | 채택안 | 대안 (검토했으나 채택 안 함) | 근거 (spec FR/NFR 참조) | 영향 범위 |
|---|---|---|---|---|---|
| ADR-001 | OTP 영속 위치 | 단일 PostgreSQL `users` 스키마 신규 테이블 `password_reset_otps` | (1) 인-메모리 Map: Fly scale-to-zero/멀티 인스턴스/재시작 시 유실 → rate-limit·만료 검증 불가 / (2) 별도 Redis: P-003 위반 | NFR-002(만료 10분)·NFR-003(rate-limit)·FR-011~013. 영속·인스턴스 공유 필요 | `apps/backend/prisma/schema.prisma`, auth 모듈 |
| ADR-002 | 마이페이지 프로필 데이터 소스 | GET /auth/me 에 `name` 필드 추가(additive) | (1) GET /users/me 사용: SC-004 가 명시적으로 GET /auth/me 지정 → 위반 / (2) 클라 캐시: 실데이터 미반영 | FR-003·SC-004(GET /auth/me 명시). 하위호환 additive | auth.service·auth-response.dto(`name?` 추가) |
| ADR-003 | 비밀번호 재설정 방식 | 이메일 6자리 OTP(2 엔드포인트) | (1) 이메일 링크 딥링크: Flutter 딥링크 인프라 복잡 / (2) 범위 외 | FR-011/012(spec Q-PWD 채택 A). Flutter 적합 | auth 모듈 신규 라우트 2 |
| ADR-004 | 이메일 발송 구현 | `MailerPort` + `SmtpMailer`(nodemailer SMTP) + `StubMailer`(non-prod) | (1) Resend/Mailgun HTTP SDK: vendor lock-in(P-004 약화) / (2) AWS SES: P-002 위반 | ASM-003·P-002·P-004. SMTP 표준=cloud-neutral. stub 으로 통합 테스트 무SMTP | `src/infrastructure/mail/`, infra.md(secret) |
| ADR-005 | OTP 저장 형태 | SHA-256 해시(`otpHash`) 저장, 평문 미저장 | (1) 평문 저장: DB 유출 시 즉시 악용 / (2) bcrypt: 6자리 단명 OTP 에 과도 | NFR-002·민감 데이터(spec Q12). refresh token(ADR-003 기존) 패턴 계승 | auth.service·schema |
| ADR-006 | forgot/find 의 미존재 대상 응답 | spec 준수 — 4xx 오류 응답(SC-016/023) | (1) 항상 200(enumeration 차단): SC-016/023 가 명시적 오류 응답 요구 → 위반 | FR-015·SC-016/023. **enumeration trade-off 는 GAP-013-02 로 Security Agent 위임** | auth.service, Security 단계 |
| ADR-007 | find-email phone 조회 | `findFirst({ where: { phone } })` | findUnique: phone 비유니크(schema 확인) → 사용 불가 | FR-015·ASM-005. schema.prisma `phone String?` 비유니크 | auth.repository |
| ADR-008 | 알림 설정 로컬 영속 | `shared_preferences`(bool) | (1) flutter_secure_storage 재사용: 비민감 설정에 과도·느림 / (2) 백엔드 API: 범위 외(spec Q-NOT A) | FR-008·SC-012(앱 재시작 유지). 표준 설정 영속 | mobile pubspec(신규 dep) |
| ADR-009 | 1:1 문의 구현 | `url_launcher` mailto + `kSupportEmail` 상수 | (1) 인앱 문의 폼+백엔드: 범위 확대(spec Q-MYP A=mailto) | FR-005·SC-008/009. ASM-001(상수, 실값 구현 시) | mobile pubspec(신규 dep), app_config |

> 본 표는 Design Agent 의 research.md "기술 선택 조사" 절과 cross-reference 한다.
> NFR 성능 직결 파라미터 없음(bcrypt cost 10 은 기존 ADR-001/auth.service 고정값 — 본 spec 신규 결정 아님, login P95 무관).

---

## 인터페이스 계약

### 신규/변경 API (백엔드)

| 엔드포인트 | 인증 | 요청 | 응답(성공) | 오류 |
|---|---|---|---|---|
| `POST /auth/forgot-password` | anonymous | `{ email }` | 200(본문 토큰 없음) | 404(미가입)·429(1분내 재발송) |
| `POST /auth/reset-password` | anonymous | `{ email, otp, newPassword }` | 200 | 400(OTP 없음/만료/불일치/재사용) |
| `POST /auth/find-email` | anonymous | `{ phone }` | 200 `{ email: 마스킹 }` | 404(미가입/phone 미등록) |
| `GET /auth/me` | JWT(기존) | — | 기존 + `name?: string\|null` 추가 | 401 |
| `PATCH /users/me` | JWT(기존, 변경 없음) | `{ name?, phone? }` | `{id,email,name,phone}` | 401·400 |

**하위 호환성**: GET /auth/me 는 `name` 필드 additive 추가 — 기존 console 웹(isAdmin 소비)·009 Flutter 앱 영향 없음. 신규 엔드포인트는 기존 라우트와 충돌 없음. Flutter 는 백엔드 API 소비 전용(009 인터페이스 계약 계승).

### 인가 3축 명시 (PATCH-001/PROC-003)

> 본 spec 의 상태 전이/소유권 엔드포인트는 PATCH /users/me 1종. 신규 3종은 anonymous 계정 복구 — 인가 대상이 아니나 enumeration/PII 표면(아래) 별도 명시.

| 엔드포인트 | (a) 호출자 신원(인증) | (b) 대상 자원 소유권 | (c) 역할(admin 등) | 미검증 축 위험·후속 |
|---|---|---|---|---|
| `PATCH /users/me` | JWT(JwtAuthGuard) | self — `@CurrentUser().userId` 로 본인 레코드만(경로 id 없음) | — (불요) | 자기 자원만 수정 가능 — 위험 없음 |
| `POST /auth/reset-password` | anonymous(설계 의도 — 비번 분실자) | OTP 소유 증명(email+OTP 일치·미만료·미사용) | — | OTP 무차별 대입 위험 → rate-limit(NFR-003)+10분 만료(NFR-002)+SHA-256+1회용. Security 검토(GAP-013-02) |
| `POST /auth/find-email` | anonymous | phone 보유자 추정 | — | **user enumeration/PII**: 전화번호→마스킹 이메일·가입여부 노출. spec 명시 요구이나 완화(rate-limit·일반화 메시지) Security 위임(GAP-013-02) |
| `POST /auth/forgot-password` | anonymous | email 보유자 추정 | — | enumeration(404 가 가입여부 노출). rate-limit 적용. Security 위임(GAP-013-02) |

---

## 데이터 모델

### 신규 테이블 `password_reset_otps` (users 스키마)

```prisma
/// 비밀번호 재설정 OTP. otpHash 는 SHA-256(평문 미저장, ADR-005).
/// 만료(NFR-002 10분)·재발송 rate-limit(NFR-003 1분)·1회용(consumedAt) 검증용.
model PasswordResetOtp {
  id         String    @id @default(cuid())
  email      String
  otpHash    String
  expiresAt  DateTime
  consumedAt DateTime?
  createdAt  DateTime  @default(now())

  @@index([email, createdAt(sort: Desc)])  // 최신 OTP 조회·rate-limit
  @@map("password_reset_otps")
  @@schema("users")
}
```
- 마이그레이션: 단순 신규 테이블 추가(기존 데이터 영향 없음). `prisma migrate deploy` 배포 release 자동(infra §3).
- 만료/소비된 행 정리: 본 spec 범위 외(누적 미미). 후속 정리 잡 필요 시 별도 spec.
- `User` 모델 변경 없음(name·phone 기존 존재 — ASM-004 확인).

### Flutter 로컬 저장 (백엔드 DB 아님)
- `shared_preferences`: `notif_order`·`notif_delivery`·`notif_event`(bool). 기기 로컬, 동기화 없음(FR-008/범위 외).

---

## 테스트 전략

> 테스트 수준: 백엔드 신규 로직은 단위(Jest) + e2e(supertest, StubMailer + test PostgreSQL). Flutter 는 위젯/단위(`flutter_test`) + 정적(`flutter analyze`). 디바이스/실네트워크 의존 SC 는 옵션 C(아래).

### 통합/운영 검증 defer 옵션 (PATCH-A08 / PROC-010)

본 spec 의 `[env:integration]` SC 는 두 부류:
- **백엔드 통합 가능(supertest)**: SC-015/016/017/018/020/022/023 — `test:e2e` 로 StubMailer·test PostgreSQL 대상 검증(파이프라인 내 실행). 실 SMTP 불요.
- **Flutter+실API/디바이스 의존(옵션 C defer)**: SC-001(실 렌더링 통합)·SC-025(P95 3초) — 에뮬레이터/실서버 부재로 파이프라인 내 미실행. SC-001 은 mock Dio 위젯 테스트로 provider 호출·렌더링 갈음 검증 가능, SC-025(P95)는 운영 측정만 가능.

**옵션 C 채택(SC-025·실 이메일 발송)** 자가 점검(PROC-010):
1. 운영 환경 의존성: **Y** — P95(SC-025)는 배포 네트워크·콜드스타트(infra §8)에 의존. 실 OTP 이메일 도달(스팸/bounce)은 SMTP provider 운영 의존.
2. mock 불가 시나리오: P95 실측, 실 inbox 도달, SMTP 인증/전송 실패율.
3. 권장: SC-025 는 infra §4 모니터링(주문/결제 P95 패턴) 에 GET /categories P95 항목 추가로 사후 측정(운영). 실 이메일 발송은 사후 운영 검증(spec §사후 #1). 보완: StubMailer 로 파이프라인 내 로직 검증 + 운영 bounce 모니터링.

### 사후 운영 검증 피드백 사이클 (PROC-014)
spec.md §범위 외 "사후 운영 검증 피드백 사이클" 4개 시나리오(실 이메일 OTP 수신·OTP 만료 거부·전화번호 이메일 찾기·알림 설정 재시작 유지) 를 운영 점검 대상으로 유지. 결함 발견 시 spec.md "배경 및 목적" 입력 → main "spec 수정" → 재진입 또는 patch spec(직전 cycle 산출물 `_ai-workspace/cycle-N-archive/` 백업).

### SC별 시나리오 매핑 (Happy / Edge / Error)

| SC | 수준 | 유형 | 시나리오 | 입력 | 기대 결과 |
|---|---|---|---|---|---|
| SC-001 | 위젯(mock Dio)/통합 | Happy | CategoryScreen GET /categories 호출·렌더 | categories 응답 N건 | 목록 N건 렌더 (실통합 옵션 C) |
| SC-002 | static | Happy | 하드코딩 카테고리 문자열 부재 | 소스 grep | 하드코딩 리스트 0(이미 充足) |
| SC-003 | unit/위젯 | Error | GET /categories 실패 시 오류+재시도 | Dio error | 오류 메시지 + 재시도 버튼 표시·invalidate 동작 |
| SC-004 | unit | Happy | MyPage GET /auth/me name·email 표시 | auth/me {name,email} | name·email 렌더 |
| SC-005 | static | Happy | 프로필 하드코딩 문자열 제거 | 소스 grep | '내 계정'/'user@email.com' 0건 |
| SC-006 | unit | Happy | 개인정보수정 PATCH /users/me 반영 | name/phone 변경 | PATCH 호출, 변경값 화면 반영 |
| SC-007 | unit | Error | PATCH 실패 시 오류+입력 유지 | PATCH 4xx | 오류 메시지, 입력값 유지 |
| SC-008 | unit | Happy | 1:1문의 mailto 실행 | 항목 탭 | launchUrl(mailto:kSupportEmail) 호출 |
| SC-009 | static | Happy | 고객지원 이메일 상수화 | 소스 grep | 특정 이메일 리터럴 하드코딩 0, 상수 1곳 |
| SC-010 | static | Happy | FAQ ≥1건 표시 | FAQ 화면 | 정적 항목 ≥1 |
| SC-011 | static | Happy | 공지사항 ≥1건 표시 | 공지 화면 | 정적 항목 ≥1 |
| SC-012 | unit | Edge | 알림 설정 재진입 복원 | on/off 변경 후 재진입 | shared_preferences 복원 |
| SC-013 | static | Happy | 마일리지 준비 중 문구 | 마일리지 화면 | 안내 문구 표시 |
| SC-014 | unit/위젯 | Happy | 비번재설정 링크 → 요청 화면 | 링크 탭 | PasswordResetRequestScreen 이동 |
| SC-015 | e2e(supertest) | Happy | forgot-password 가입 이메일 200 | 등록 email | 200, OTP 생성·StubMailer 발송 |
| SC-016 | e2e(supertest) | Error | forgot-password 미가입 4xx | 미가입 email | 404 + 안내 |
| SC-017 | e2e(supertest) | Happy | reset-password 유효 OTP 변경 | email+OTP+newPw | 200, 비번 변경·OTP consumed |
| SC-018 | e2e(supertest) | Error/Edge | 만료(10분) OTP 거부 | expiresAt 과거 | 400(4xx) |
| SC-019 | unit | Edge | 재발송 1분 UI 비활성 | 발송 직후 | 60초 카운트다운 버튼 disabled |
| SC-020 | e2e(supertest) | Error | 1분내 2회 forgot 거부 | 동일 email 2회 | 2회차 429(4xx) |
| SC-021 | unit/위젯 | Happy | 이메일 찾기 링크 이동 | 링크 탭 | EmailFindScreen 이동 |
| SC-022 | e2e(supertest) | Happy | find-email 마스킹 반환 | 등록 phone | 200 + 마스킹 이메일 |
| SC-023 | e2e(supertest) | Error | find-email 미가입/phone 미등록 | 미등록 phone | 404 + 안내 |
| SC-024 | unit | Happy/Edge | maskEmail 형식 | 다양 길이 local | `앞2+**+@+도메인`(local≤2 경계 포함) |
| SC-025 | 운영(옵션 C) | Happy | GET /categories P95 3초 | 운영 트래픽 | P95 ≤3초(infra §4 모니터링) |
| SC-026 | static | Happy | flutter analyze 0 issues | analyze 실행 | 0 issues |

> SC-018 은 Edge(만료 경계)+Error 성격. SC-024 는 Happy(일반)+Edge(local≤2 경계). Test Agent 는 coverage.md 에 유형별 충족 기록.

### smoke_tests (선택)
- 필요 여부: **N**
- 근거: 변경은 신규 화면/엔드포인트 추가 + auth/me additive 필드. 기존 SC 매핑 테스트(009 정적 + 백엔드 unit 255)로 회귀 범위 커버. auth/me name 추가는 additive 라 기존 소비자 무영향.

---

## 기타 고려사항

- **CategoryScreen 실코드 vs spec 기술 불일치(GAP-013-01)**: spec run-001 의 "하드코딩 10개·미호출" 은 stale view. 실제는 이미 API 연동 완료. FR-001/SC-002 신규 작업 최소(재시도 버튼만). Development 는 하드코딩 제거 대신 재시도 버튼 추가에 집중. SC-002 정적 검증은 현 상태로 통과.
- **user enumeration / PII trade-off(GAP-013-02)**: forgot-password 404·find-email 마스킹 이메일은 가입여부/PII 노출 표면. spec 명시 요구를 따르되 rate-limit·일반화 메시지·로깅 완화를 **Security Agent(활성)** 가 검토. plan 은 spec 충족을 우선하고 완화는 Security 단계 결정으로 위임.
- **OTP 보안 안전망(PATCH-A06 — ASM 미검증 대비)**: ASM-003(이메일 인프라 부재)·ASM-005(phone 등록 사용자만 find-email) 의 운영 미검증 대비 — (1) StubMailer fallback 으로 발송 실패해도 OTP 는 DB 기록(재발송 가능), (2) rate-limit·만료·1회용 3중 방어, (3) 비번 변경 시 refresh token revoke 로 탈취 세션 무효화. 사후 운영 검증(spec §사후)로 실 발송 확인.
- **SMTP 실패 격리**: `sendOtpEmail` 실패 시 forgot-password 는 OTP 생성 후 발송 단계 실패 → 사용자에게 일반 안내(재시도 유도). OTP 는 이미 DB 기록되어 1분 후 재발송 가능. 발송 실패가 500 으로 전체 흐름 차단되지 않도록 처리.
- **마스킹 단일 책임**: maskEmail 은 백엔드(find-email)에서 1회 수행. Flutter 는 반환값 그대로 표시(이중 마스킹 방지).
- **신규 환경변수**: `SMTP_HOST`·`SMTP_PORT`·`SMTP_USER`·`SMTP_PASS`·`MAIL_FROM` 추가 → `.env.example` 갱신 + Fly secret. infra.md §7 배포 체크리스트·§8 갱신은 Docs/Retrospective 위임.
- **Flutter 신규 dependency 2종**: `url_launcher`·`shared_preferences` 추가 후 `flutter analyze` 0 issues(NFR-005/SC-026) 유지 확인. pub get·플랫폼 권한(iOS Info.plist `LSApplicationQueriesSchemes: mailto` 등) Development 단계 점검.
- **go_router 미사용 계승**: 009 패턴대로 신규 화면 전환은 `Navigator.push(MaterialPageRoute)` 사용(go_router 도입 안 함 — 본 spec 범위 외).
- **응답 타입 Map<String,dynamic> 계승**: 009 GAP-009-01(typed model 부재) 유지. 신규 화면도 동적 파싱. typed model 마이그레이션은 별도 spec.
</content>
