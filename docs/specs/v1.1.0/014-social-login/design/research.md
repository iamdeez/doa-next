---
작성: Design Agent
버전: v1.0
최종 수정: 2026-07-01
상태: 확정
---

# Research: 014-social-login

## 목차

- [기존 코드베이스 분석](#기존-코드베이스-분석)
- [영향 범위 분석](#영향-범위-분석)
- [production 시그니처 변경 — 호출 측 테스트 식별 (§F, PROC-001)](#production-시그니처-변경--호출-측-테스트-식별-f-proc-001)
- [공유 상태·동시성 분석 (tx-aware, PROC-013-01)](#공유-상태동시성-분석-tx-aware-proc-013-01)
- [외부 제공자 API 실제 동작 확인 ([TO-VERIFY] 확정)](#외부-제공자-api-실제-동작-확인-to-verify-확정)
- [인정되는 한계 및 안전망 (PATCH-A07)](#인정되는-한계-및-안전망-patch-a07)
- [배포 환경 영향 추정 (PATCH-A10)](#배포-환경-영향-추정-patch-a10)
- [context.md 부정합 사전 점검 (PATCH-A11)](#contextmd-부정합-사전-점검-patch-a11)
- [기술 선택 조사](#기술-선택-조사)
- [UI 화면 상태주입 canonical (PATCH-013-01)](#ui-화면-상태주입-canonical-patch-013-01)
- [엣지 케이스 및 한계](#엣지-케이스-및-한계)

> context.md §2(핵심 모듈)·§4(데이터 모델)에 이미 기술된 전체 구조는 중복 기술하지 않고 참조로 대신한다.

---

## 기존 코드베이스 분석

### 클래스·모듈 계층 구조

**백엔드 (`apps/backend/src/modules/auth/`)** — 모두 concrete `@Injectable`:

| 심볼 | 파일 | 인스턴스화 | 비고 |
|---|---|---|---|
| `AuthService` | `auth.service.ts` | concrete | register·login·refresh·logout·getProfile·forgotPassword·resetPassword·findEmail. JWT 발급 로직이 `login()` 내부에 인라인 |
| `AuthRepository` | `auth.repository.ts` | concrete | users 스키마 CRUD. `createUser({email, password})`·`findUserByEmail`·refresh/otp 메서드. 일부는 `this.prisma.tx`(tx-aware), 일부는 `this.prisma`(root) 사용 |
| `AuthController` | `auth.controller.ts` | concrete | `@Controller('auth')` 라우트. `POST /auth/login·register·refresh·logout·forgot-password·reset-password·find-email` + `GET /auth/me` |
| `AuthModule` | `auth.module.ts` | module | providers: `[AuthService, AuthRepository]`. imports: `JwtModule.register({})`·`AuthSharedModule`·`MailModule` |
| `PrismaService` | `shared/prisma/prisma.service.ts` | concrete singleton | `AsyncLocalStorage` 기반 tx 전파. `get tx()` → ALS 활성 시 트랜잭션 클라이언트, 비활성 시 root 반환. `runInTransaction(fn)` |

**신규 추가 (백엔드)** — 상속받을 base class 없음(모두 신규 독립 클래스):
- `SocialProviderPort` (abstract class) — `abstract verify(token: string): Promise<SocialProfile>`. NestJS DI 토큰으로 사용.
- `KakaoProvider`·`GoogleProvider`·`NaverProvider` (concrete, `SocialProviderPort` 상속) — native `fetch` 로 제공자 검증.
- `StubSocialProvider` (concrete, `SocialProviderPort` 상속) — 무네트워크 테스트용(NFR-004·ASM-002).
- `SocialProviderResolver` (concrete) — provider 문자열 → Port 매핑.
- `SocialAuthService` (concrete) — 계정 해석 오케스트레이션.

**Flutter (`mobile/customer_app/lib/`)**:

| 심볼 | 파일 | 유형 | 비고 |
|---|---|---|---|
| `LoginScreen` | `features/auth/login_screen.dart` | `ConsumerStatefulWidget` | `_SocialRow` 는 현재 `StatelessWidget` — 순수 `Container`(onTap 없음). 소셜 버튼 3종 시각적 플레이스홀더 |
| `AuthController` | `core/providers.dart` | Riverpod `Notifier<AuthStatus>` | `login(email, password)` → dio POST → `TokenStore.save` → `state = authenticated`. 소셜 로그인 메서드 없음 |
| `TokenStore` | `core/token_store.dart` | concrete | `FlutterSecureStorage` wrap. `save({accessToken, refreshToken})` |
| `ApiClient` / `dioProvider` | `core/api_client.dart` / `core/providers.dart` | concrete / Provider | dio + 401 auto-refresh. `extra: {'anonymous': true}` 로 익명 요청 |

**신규 추가 (Flutter)**:
- `SocialAuthService` (abstract) + `socialAuthServiceProvider` — 테스트 mock 가능. `signInWithKakao/Google/Naver()` → `SocialCredential {provider, token}` 또는 `SocialAuthCancelled` 예외.
- `AuthController.socialLogin(provider, token)` 메서드(백엔드 호출·토큰 저장·상태 전이).

### 영향 범위 분석 (호출 측 전수)

context.md §2 auth 모듈 기준선 대비 변경 영향:

- `User.password` 참조 지점 (backend `apps/backend/src` grep, `.spec.ts` 제외):
  - `auth.service.ts:80` — `bcrypt.hash(input.password, ...)` → **`input.password`(RegisterDto, 항상 string)**. User.password 아님. 영향 없음.
  - `auth.service.ts:99` — `bcrypt.compare(input.password, user.password)` → **`user.password`(User.password)**. nullable 전환 시 **compile-time 타입 오류 + 런타임 null 가드 필요**. §F 상세.
  - `auth.repository.ts` 의 `.password` 매칭은 전부 `passwordResetOtp`/주석 — User.password 아님. 영향 없음.
  - **결론**: User.password 읽기 지점은 auth 모듈 내 `login()` **단 1곳**. auth 모듈 외 `user`·`seller` 등 타 모듈에서 User.password 접근 0건(grep 확인). Breaking 잔여 참조 검증 대상 = login() 1지점.
- `AuthRepository.createUser` 호출 측: `auth.service.ts:81` `register()` 1곳. 시그니처 확장(name·password null 허용) 시 register 호출은 기존 `{email, password}` 형태 유지 가능(추가 필드 optional). 영향 없음(additive).

---

## 영향 범위 분석

| 파일 | 변경 유형 | 영향 내용 |
|---|---|---|
| `apps/backend/prisma/schema.prisma` | 수정 | User.password `String→String?`, `socialAccounts SocialAccount[]` relation 추가, `SocialAccount` 모델 신규. **상세·마이그레이션은 Database Design Agent 확정** |
| `apps/backend/src/modules/auth/social/social-provider.port.ts` | 신규 | abstract Port + `SocialProfile` 타입 |
| `apps/backend/src/modules/auth/social/kakao.provider.ts` | 신규 | KakaoProvider(fetch) |
| `apps/backend/src/modules/auth/social/google.provider.ts` | 신규 | GoogleProvider(fetch tokeninfo + aud 대조) |
| `apps/backend/src/modules/auth/social/naver.provider.ts` | 신규 | NaverProvider(fetch) |
| `apps/backend/src/modules/auth/social/stub-social.provider.ts` | 신규 | 테스트 stub |
| `apps/backend/src/modules/auth/social/social-provider.resolver.ts` | 신규 | provider→Port 매핑 |
| `apps/backend/src/modules/auth/social-auth.service.ts` | 신규 | 계정 해석 오케스트레이션 |
| `apps/backend/src/modules/auth/dto/social-login.dto.ts` | 신규 | class-validator DTO |
| `apps/backend/src/modules/auth/dto/auth-response.dto.ts` | 수정(선택) | `SocialLoginResponse`(= LoginResponse 재사용 가능, 신규 불요 판단 — 아래 노트) |
| `apps/backend/src/modules/auth/auth.controller.ts` | 수정 | `POST /auth/social-login` 라우트 |
| `apps/backend/src/modules/auth/auth.service.ts` | 수정 | `issueTokensForUser(user)` helper 추출(login 공유·동작 불변) + login() null 가드 |
| `apps/backend/src/modules/auth/auth.repository.ts` | 수정 | social_accounts CRUD + createUser 확장 |
| `apps/backend/src/modules/auth/auth.module.ts` | 수정 | providers 등록 + Port DI 바인딩 |
| `apps/backend/.env.example` | 수정 | 카카오·구글·네이버 크레덴셜 env (SC-018) |
| `mobile/customer_app/lib/features/auth/social_auth_service.dart` | 신규 | abstract + `SocialCredential`·`SocialAuthCancelled` |
| `mobile/customer_app/lib/features/auth/login_screen.dart` | 수정 | `_SocialRow` GestureDetector·onTap·성공/취소/실패 처리 |
| `mobile/customer_app/lib/core/providers.dart` | 수정 | `socialAuthServiceProvider` + `AuthController.socialLogin` |

> **응답 DTO 재사용 노트**: `POST /auth/social-login` 응답 `{accessToken, refreshToken}` 은 기존 `LoginResponse`(auth-response.dto.ts)와 동일. `@ApiOkResponse({ type: LoginResponse })` 재사용으로 신규 DTO 불요. Development 판단으로 별칭 `SocialLoginResponse` 추가 가능하나 필수 아님.

---

## production 시그니처 변경 — 호출 측 테스트 식별 (§F, PROC-001)

> **트리거**: plan.md 핵심 설계에 (a) `User.password: String → String?` (Prisma 타입 변경 → TS 생성 타입 변경), (b) `AuthRepository.createUser` 시그니처 확장, (c) `AuthService.issueTokensForUser` 추출이 명시됨.

### 변경되는 production 심볼 목록

| 심볼 | 변경 전 | 변경 후 | 종류 |
|---|---|---|---|
| `User.password` (Prisma → `@prisma/client` 생성 타입) | `password: string` | `password: string \| null` | 반환 타입(필드) 변경 |
| `AuthService.login()` 내부 `bcrypt.compare(input.password, user.password)` | 인자 `user.password: string` | 인자 `user.password: string \| null` → **null 가드 선행 필수** | 인자 타입 변경(호출측 방어) |
| `AuthRepository.createUser(data)` | `{ email: string; password: string }` | `{ email: string; password?: string \| null; name?: string \| null }` | 인자 shape 확장(additive) |
| `AuthService.issueTokensForUser(user)` | (없음 — login 내부 인라인) | `private issueTokensForUser(user): Promise<LoginResult>` 신규 추출 | 내부 리팩터(동작 불변) |

### 각 심볼을 직접 호출/단언하는 테스트

`grep -rnE "\.password|createUser|\.login\(" apps/backend/src/modules/auth/*.spec.ts` 결과 기반:

- `auth.service.spec.ts`
  - `FIXED_USER.password = '$2b$10$hashedPassword'` (mock 픽스처) — login happy path 에서 `bcrypt.compare` 통과 시나리오. **회귀 안전**(password 非null 유지 → null 가드 분기 미진입).
  - `mockAuthRepository.createUser` mock — plain jest.fn(). 시그니처 확장은 mock 반환값에 영향 없음. **회귀 안전**.
  - `mockAuthRepository.findUserByEmail` mock — login/register 시나리오. **회귀 안전**.
  - login 실패 시나리오(`findUserByEmail` → null / `bcrypt.compare` → false): 기존 유지. **회귀 안전**.

### 호출 측 마이그레이션 필요 여부 판정

| 변경 | 판정 | 처리 |
|---|---|---|
| `User.password` nullable | login() 에 **null 가드 신규 코드** 필요(`if (!user.password) throw UnauthorizedException`) — bcrypt.compare 에 null 전달 금지(런타임 TypeError·compile 오류 방지) | tasks T-B2 에 포함. SC-004(신규 테스트)가 null 사용자 로그인 거부 검증 |
| `createUser` 확장 | additive(추가 필드 optional) — register 호출 무변경 | tasks T-A2/T-B3. 회귀 없음 |
| `issueTokensForUser` 추출 | login 동작 불변 리팩터 — 기존 login 테스트가 회귀 안전망 | smoke_tests(plan Y) 로 회귀 0 확인 |

### 호출 측 마이그레이션이 본 spec 범위에 포함되는가

**포함**. plan.md P-007 게이트 근거: "password nullable·토큰 발급 helper 추출은 각각 FR-007·FR-008 구현에 직접 필요". SC-004(FR-007·NFR-003)가 null 사용자 로그인 거부를 검증하므로 login() null 가드 = spec 범위 내. **SCOPE_VIOLATION 아님. BLOCKED 불요.**

> **(PROC-001 representation 점검)**: 기존 login 테스트의 단언은 `expect(result).toEqual({accessToken, refreshToken})` / `signAsync` 호출 인자(expiresIn) 검증. representation(단언이 읽는 표현)은 `issueTokensForUser` 추출 후에도 동일(반환 형태·signAsync 호출 인자 불변). 따라서 "PASS 유지" 예측이 representation 차이로 뒤집힐 위험 없음. mock patch target 바인딩(PROC-002)도 변경 없음(AuthRepository·JwtService mock 그대로). **회귀 예측 신뢰 가능**.

---

## 공유 상태·동시성 분석 (tx-aware, PROC-013-01)

### 공유 자원·Check-Then-Act

계정 해석 흐름은 **Check-Then-Act**(조회 → 없으면 생성) 구간을 포함한다:
- FR-005: `findUserByEmail(email)` → 존재 시 `createSocialAccount`
- FR-006: `findUserByEmail(email)` → 없으면 `createUser` + `createSocialAccount`

**레이스 시나리오**: 동일 email 또는 동일 (provider, providerId) 로 최초 소셜 로그인이 동시 2회 발생 → 양쪽 모두 "기존 계정 없음" 판정 후 createUser 2회 시도.

**방어 (DB 수준 최종 정합성)**:
- `users.email @unique` — 동일 email 신규 계정 2회 생성 시 한쪽 P2002.
- `social_accounts @@unique([provider, providerId])` — 동일 소셜 계정 중복 연동 시 한쪽 P2002.
- 서비스는 P2002(unique 위반) catch → **재해석(re-resolve: findByProviderAndProviderId → findUserByEmail)** 후 재로그인/연동으로 폴백. Development 는 이 catch→재해석 경로를 구현한다.

### 트랜잭션 경계 (FR-006 원자성)

`createUser` + `createSocialAccount`(FR-006) 는 **원자적**이어야 한다. createUser 성공 후 createSocialAccount 실패 시 **orphan user**(social_account 없는 소셜 전용 계정)가 생겨 email unique 가 이후 로그인을 영구 차단할 수 있다.

**설계 결정**: 두 연산을 `PrismaService.runInTransaction(async () => { ... })` 로 감싸고, 내부 repo 메서드는 `this.prisma.tx.X` 를 사용한다.
- `createUser` 를 `this.prisma.user.create`(root) → `this.prisma.tx.user.create`(tx-aware) 로 전환. `register()` 호출(트랜잭션 외부)은 `tx` getter 의 root fallback 으로 **동작 불변**(PrismaService `get tx()` = ALS 비활성 시 root 반환).
- `createSocialAccount` 는 신규이므로 처음부터 `this.prisma.tx.socialAccount.create` 로 작성.

### PROC-013-01 — tx-aware 심볼 e2e 매핑 (한계 명시)

> 규율: `this.prisma.tx.X` 접근이 `runInTransaction` 콜백 **밖**에서 호출될 수 있는 심볼은 단위 mock + **e2e 실경로 검증**을 매핑해야 한다.

- 대상 심볼: `AuthRepository.createUser`(tx-aware 전환) — social 경로에서는 runInTransaction 내부, register 경로에서는 외부(root fallback) 양쪽에서 호출됨.
- **한계**: 본 spec 은 e2e(SC-019)가 **명시적 deferred(범위 외, 옵션 B)**. 따라서 tx/root 분기의 e2e 실경로 검증을 **본 파이프라인 내에서 수행 불가**.
- **안전망**:
  1. `get tx()` 의 root fallback 이 **graceful**(ALS 비활성 시 예외 없이 root 반환) → register 경로 회귀 위험 없음(smoke_tests 로 확인).
  2. 단위 테스트는 `AuthRepository` 전체를 mock 하므로 tx/root 분기가 표면화되지 않음 — 대신 **repository 레벨 통합 테스트**(실 PrismaService, 실 DB 없이 in-memory 불가)는 e2e deferred 로 미수행.
  3. **GAP-014-01 등록**: social createUser+createSocialAccount 원자성의 실경로(트랜잭션 롤백·orphan 방지)는 사후 운영 검증(spec PROC-014 §사후 운영 검증) 시 통합 검증 대상으로 추적. Security Agent 검토 대상에도 포함(자동연동 계정 정합성).

---

## 외부 제공자 API 실제 동작 확인 ([TO-VERIFY] 확정)

> **검증 방식 한계 고지**: 본 실행 환경은 WebFetch/web 도구 미제공으로 공식 문서 **실시간 fetch 불가**. 아래 필드 shape 은 각 제공자 **공개 REST API 문서의 확립된 스펙(모델 지식 컷오프 2026-01 기준)** 으로 확정하며, 실 크레덴셜 발급 시점(운영 셋업·옵션 B)에 1회 실응답으로 재확인한다. 필드 shape 오해는 제공자별 Port 구현체 단일 지점에 격리되어 흡수된다(위험 완화 설계).

### kakao — `GET https://kapi.kakao.com/v2/user/me`

- 인증: `Authorization: Bearer {accessToken}` (앱 SDK 로 획득한 카카오 액세스 토큰).
- 응답(발췌):
  ```json
  {
    "id": 123456789,
    "kakao_account": {
      "profile": { "nickname": "홍길동" },
      "has_email": true,
      "is_email_valid": true,
      "is_email_verified": true,
      "email": "user@kakao.com"
    }
  }
  ```
- 매핑: `id`(number → **String 변환**) → providerId, `kakao_account.email` → email, `kakao_account.profile.nickname` → name.
- **email 부재 조건**: `email` 은 **선택 동의** 항목. 미동의 시 `kakao_account.email` 부재(또는 `has_email:false`). → FR-003(email 없으면 거부, SC-005)로 흡수.
- **email_verified**: `kakao_account.is_email_verified` 제공 → Security Agent 자동연동 강화 활용 가능(본 spec 필수 아님).

### google — `GET https://oauth2.googleapis.com/tokeninfo?id_token={idToken}`

- 입력: 앱 SDK 로 획득한 **ID 토큰**(JWT). tokeninfo 는 서명·만료를 검증하고 클레임을 반환.
- 응답(발췌):
  ```json
  {
    "iss": "https://accounts.google.com",
    "aud": "CLIENT_ID.apps.googleusercontent.com",
    "sub": "1234567890",
    "email": "user@gmail.com",
    "email_verified": "true",
    "name": "홍길동"
  }
  ```
- 매핑: `sub` → providerId, `email` → email, `name` → name.
- **aud 검증(필수)**: `aud` 가 `GOOGLE_CLIENT_ID`(env)와 **일치해야 함**. 불일치 시 타 앱 발급 토큰 → 거부(401/400). ADR-002·Security 위임(§인터페이스 계약).
- **주의**: tokeninfo 는 클레임 값을 **문자열**로 반환(`email_verified: "true"`). boolean 비교 시 `=== 'true'` 처리.
- 검증 수단: **native fetch tokeninfo 확정**(google-auth-library 미채택 — 기술 선택 조사 참조).

### naver — `GET https://openapi.naver.com/v1/nid/me`

- 인증: `Authorization: Bearer {accessToken}` (앱 SDK 로 획득한 네이버 액세스 토큰).
- 응답(발췌):
  ```json
  {
    "resultcode": "00",
    "message": "success",
    "response": {
      "id": "32742776",
      "name": "홍길동",
      "email": "user@naver.com"
    }
  }
  ```
- 매핑: `response.id` → providerId, `response.email` → email, `response.name` → name.
- **id 특성**: 네이버 `id` 는 **애플리케이션별 고유**(동일 사용자라도 앱마다 다름) — providerId 로 적합(우리 앱 범위 내 유일).
- **email 부재 조건**: 네이버도 email 은 사용자 동의 항목 → 부재 가능. FR-003 로 흡수. `resultcode != "00"` 이면 검증 실패 취급(4xx).
- **email_verified 플래그**: 네이버 nid/me 미제공.

### 확정 요약표

| 제공자 | 엔드포인트 | providerId | email | name | 앱 검증 축 |
|---|---|---|---|---|---|
| kakao | `GET kapi.kakao.com/v2/user/me` (Bearer) | `id`(num→str) | `kakao_account.email` | `kakao_account.profile.nickname` | 앱 스코프 액세스 토큰 |
| google | `GET oauth2.googleapis.com/tokeninfo?id_token=` | `sub` | `email` | `name` | **`aud` == GOOGLE_CLIENT_ID** |
| naver | `GET openapi.naver.com/v1/nid/me` (Bearer) | `response.id` | `response.email` | `response.name` | 앱별 고유 id·`resultcode=="00"` |

---

## 인정되는 한계 및 안전망 (PATCH-A07)

| 한계 | 안전망 |
|---|---|
| kakao/naver/google **email 선택 동의** — 검증된 계정도 email 미반환 가능(silent absence) | FR-003(email null → 400 거부, SC-005). `SocialProfile.email: string \| null` 타입으로 분기 강제 |
| google tokeninfo 는 **문자열 클레임** 반환(`email_verified:"true"`)·디버깅 엔드포인트 성격(rate limit 존재) | boolean 파싱 `=== 'true'`. Port 구현체에 격리. 운영 부하 시 google-auth-library 전환 저비용(Port 교체) |
| 제공자 응답 필드 shape 오해([TO-VERIFY] — 실 fetch 미검증) | (1) Port 구현체 단일 지점 격리 (2) 운영 셋업 시 실응답 1회 재확인(옵션 B) (3) stub provider 로 흐름 검증 |
| google `aud` 미대조 시 타 앱 토큰 수용 = 계정 탈취 벡터 | GoogleProvider 에서 `aud === GOOGLE_CLIENT_ID` 필수 검증. Security Agent 감사(활성) |

---

## 배포 환경 영향 추정 (PATCH-A10)

- 소셜 로그인 백엔드는 **아웃바운드**로 kakao/google/naver API 호출. plan.md §배포 환경 영향 확인: Fly.io 아웃바운드 제한 없음. NAT/docker-proxy/L4 LB 흡수 이슈는 **인바운드 재연결 특이성**이며 본 아웃바운드 호출과 무관.
- 점검 대상 환경 특이성(컨테이너 NAT·L4 LB half-close·conntrack·keepalive·OS 차이) 중 본 spec 검증 대상 API 에 영향 항목 **없음**(단순 HTTPS GET 아웃바운드, 응답 즉시 종료).
- 크레덴셜은 `fly secrets set`(기존 SMTP·ADMIN_USER_IDS 동일 패턴) dev/prod 독립 주입. 신규 인프라 컴포넌트·컨테이너 구조 변경 없음. Deploy Agent 비활성(selection-phases.md).
- **infra.md 갱신 위임**: 소셜 OAuth 크레덴셜 env·아웃바운드 제공자 목록 → GAP 아님(기존 아웃바운드 패턴 내). Docs/Retrospective 단계에서 infra.md §7 체크리스트·§8 반영 권고(plan §배포 환경 영향 계승).

---

## context.md 부정합 사전 점검 (PATCH-A11)

변경 대상 심볼을 context.md §2·§4 에서 grep 추출·평가:

| 항목 | 현재 context.md 정의 | 변경 후 | 6단계 Docs 처리 |
|---|---|---|---|
| `auth` 모듈(§2) | "로그인/JWT/Refresh/비밀번호 재설정 OTP·이메일 찾기/세션" | + **소셜 로그인(POST /auth/social-login, 3제공자)** 추가 | Docs 가 §2 auth 행에 social-login 추가 |
| `User` 모델·`users` 테이블(§4) | password `String`(비null 전제) | password `String?`(nullable) + `social_accounts` 신규 테이블(1:N) | Docs 가 §4 데이터모델·테이블 수(31→32) 갱신. **Database Design Agent 산출물과 동기** |
| 데이터 모델 테이블 수(§4 "31개 테이블") | 31 | **32**(social_accounts 추가) | Docs 갱신 |
| §6 알려진 제약 SEC-002~004(auth 보안 부채) | 013 이월 3종(IP rate limit·revoke 비원자·감사로그 부재) | 본 spec 미해소(범위 외) — 유지 | 변경 없음. 단 자동연동 신규 보안 표면은 Security Agent 산출물 반영 |

> 본 절 기재 항목은 6단계 Docs Agent 가 context.md 갱신 대상으로 GAP 등록/처리하도록 가시화. Database Design Agent 산출물(social_accounts 최종 스키마)과 §4 동기 필수.

---

## 기술 선택 조사

### google 검증 수단: native fetch tokeninfo vs google-auth-library (ADR-002 [TO-VERIFY] 확정)

| 항목 | native fetch tokeninfo (**채택**) | google-auth-library |
|---|---|---|
| 신규 npm 의존 | **0건** (Node 20 global fetch) | 1건 |
| aud 검증 | 수동(`payload.aud === GOOGLE_CLIENT_ID`) | `verifyIdToken({audience})` 내장 |
| 서명 검증 | Google 서버 위임(tokeninfo 가 검증) | 로컬 JWK(캐시) |
| 네트워크 | 로그인당 1 왕복 | 최초 JWK fetch 후 캐시(왕복 절감) |
| 제공자 파리티 | kakao·naver 와 동일 fetch 패턴(일관) | google 만 별도 라이브러리 |

**확정: native fetch tokeninfo**. 근거: (1) ADR-002 채택안·P-002(의존 최소) 정합, (2) 3제공자 fetch 패턴 일관(유지보수 단순), (3) tokeninfo 는 공식 문서화된 엔드포인트로 본 요구 충족, (4) Port 격리로 향후 라이브러리 전환 저비용. NFR-001(P95 3초) — tokeninfo 1왕복은 3초 예산 내 충분. google-auth-library 는 **문서화된 향후 옵션**(운영 부하·서명 견고성 요구 시). Security Agent 가 `aud` 대조 견고성을 감사한다.

### Flutter 소셜 SDK 패키지 (ADR [TO-VERIFY] 확정 — 운영 셋업 deferred)

파이프라인 검증(SC-011~016)은 `SocialAuthService` **인터페이스 mock** 으로 SDK 무의존 수행(plan·ASM-002). 실 SDK 통합·네이티브 설정(Info.plist·AndroidManifest·deep link·앱 키)은 **운영 셋업 deferred**. 따라서 **본 파이프라인에서 pubspec 에 소셜 SDK 를 추가하지 않는다**(미설정 네이티브 SDK 추가 시 `flutter analyze`·빌드 리스크·키 부재). 운영 셋업 시 채택 후보(확정 아님·참고):

| 제공자 | 후보 패키지 | 반환 토큰 | 비고 |
|---|---|---|---|
| kakao | `kakao_flutter_sdk_user` | `OAuthToken.accessToken` | 카카오 공식. `UserApi.instance.loginWithKakaoTalk/Account()` |
| google | `google_sign_in` | `idToken` | 공식. v7 API(initialize+authenticate) 변경 주의. 백엔드는 **idToken** 필요(tokeninfo) |
| naver | `flutter_naver_login` | `accessToken` | 커뮤니티 패키지 |

> **파이프라인 산출물 경계**: `SocialAuthService` abstract 인터페이스 + `socialAuthServiceProvider`(mock 주입 가능) + onTap 배선까지만 구현. 실 SDK 어댑터(concrete)는 운영 셋업 태스크(spec PROC-014). SC-011~013 은 정적(버튼·핸들러 존재), SC-014~016 은 mock SocialAuthService 로 흐름 검증.

### 백엔드 신규 npm 의존

**0건**. Node 20 native `fetch`(global) 로 3제공자 검증. class-validator(기존)·@nestjs/jwt(기존) 재사용. google-auth-library 미채택(위 확정).

---

## UI 화면 상태주입 canonical (PATCH-013-01)

`LoginScreen` 소셜 흐름의 Dev(C 레이어)·Test(D 레이어) 전제를 canonical 로 고정한다(PPG-1 병렬 발산 차단):

| 항목 | canonical 확정 |
|---|---|
| (a) 상태 주입 방식 | **Riverpod provider 경유**. `LoginScreen` 은 기존 `ConsumerStatefulWidget` 유지. `_SocialRow` 를 `_SocialRow(onKakao, onGoogle, onNaver)` **콜백 수신 위젯**으로 전환(부모 `_LoginScreenState` 가 `ref.read(socialAuthServiceProvider)`·`ref.read(authControllerProvider.notifier).socialLogin(...)` 호출). `socialAuthServiceProvider`·`authControllerProvider` 로 상태·의존 주입 |
| (b) 테스트 렌더 전제 | **`ProviderScope` 래핑 필수** + override 로 mock `SocialAuthService`·mock dio 주입. `pumpAndSettle` 사용(비동기 흐름). 정적 검증(SC-011~013)은 위젯 트리 렌더 없이 파일 심볼 존재(`static_verification` 패턴) 또는 `find.byType(GestureDetector)` 탭 가능 확인 |

- Dev(C)가 채택할 위젯 타입 = `ConsumerStatefulWidget`(LoginScreen) + 콜백 `_SocialRow`. Test(D)의 harness = `ProviderScope(overrides:[socialAuthServiceProvider.overrideWithValue(mock), dioProvider.overrideWith(...)])`.
- 근거: OBS-013-01 재발 방지(provider vs 정적 발산). 기존 `login_screen_test.dart` 가 `ProviderScope + MaterialApp(home: LoginScreen)` 패턴 사용 — 동일 canonical 계승.

---

## 엣지 케이스 및 한계

- **email null 타입 강제**: `SocialProfile.email: string | null` 로 FR-003 분기를 타입 수준 강제(파싱 후 null 체크 누락 방지).
- **계정 해석 엄격 우선순위**: a(providerId 매칭)에서 매칭 시 b/c 진입 금지(재로그인은 신규 연동/생성 없음). ADR-003.
- **provider 화이트리스트 이중 방어**: DTO enum(`'kakao'|'google'|'naver'`) + resolver 미지원값 → BadRequest.
- **소셜 전용 사용자 OTP 재설정(ASM-003)**: password=null 사용자가 forgot-password → OTP → resetPassword 로 password 설정 가능(현행 유지·범위 외). 부작용 인지·후속 spec.
- **동시성**: createUser+createSocialAccount 원자성 미검증(e2e deferred) → GAP-014-01 추적. DB unique + catch 재해석이 최종 방어.
- **역추론 정합성**: 본 spec 은 forward(정상 대화 산출물). 역공학 마커 없음 — 해당 절 N/A.
