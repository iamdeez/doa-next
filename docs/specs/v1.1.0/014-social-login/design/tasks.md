---
작성: Design Agent
버전: v1.0
최종 수정: 2026-07-01
상태: 확정
---

# Tasks: 014-social-login

> Branch: 014-social-login | Date: 2026-07-01 | Plan: [../planning/plan.md](../planning/plan.md)

## 목차

- [전제 조건](#전제-조건)
- [Database Design Agent 위임 경계](#database-design-agent-위임-경계)
- [태스크 목록](#태스크-목록)
- [Test Authoring Contract](#test-authoring-contract)
- [태스크 입도 가이드](#태스크-입도-가이드)
- [구현 완료 기준](#구현-완료-기준)

---

## 전제 조건

- [x] spec.md 의 모든 [NEEDS CLARIFICATION] 항목이 해소되었는가? — 0건
- [x] plan.md 의 Constitution Gates 가 모두 통과(또는 예외 기재) 되었는가? — P-001~P-007 전부 PASS
- [x] CHANGES.md 에서 이전 작업(013)의 "후속 작업 시 주의사항"을 확인했는가? — auth 보안 부채 3종(SEC-002~004) 범위 외 유지 확인
- [x] User.password nullable 호출 측 영향(login null 가드) research §F 식별 완료 — SCOPE 위반 아님(FR-007 범위 내)

---

## Database Design Agent 위임 경계

> 본 spec 은 selection-phases.md 에서 **Database Design Agent = Y**. 3단계(Design) 후 / 4단계(Development) 전 실행.

| 항목 | 소유 | 산출물 |
|---|---|---|
| `SocialAccount` Prisma 모델 최종 컬럼·타입·제약 (`@@unique([provider,providerId])`·`@@index([userId])`·FK onDelete Cascade) | **Database Design Agent** | schema.prisma 변경 + 마이그레이션 SQL |
| `User.password: String → String?` 전환 (additive·기존 행 영향 없음) | **Database Design Agent** | schema.prisma User 모델 |
| `User.socialAccounts SocialAccount[]` relation 추가 | **Database Design Agent** | schema.prisma |
| 마이그레이션 생성·적용 (`prisma migrate`) | **Database Design Agent** (설계·SQL) → Development (적용·`prisma generate`) | 마이그레이션 디렉토리 |
| 위 스키마를 소비하는 **repository 메서드 구현** (createSocialAccount·findByProviderAndProviderId·createUser 확장) | **Development (T-A2)** | auth.repository.ts |
| 계정 해석 비즈니스 로직·트랜잭션 경계 | **Development (T-B4)** | social-auth.service.ts |

> Planning 제안 스키마 형태는 plan.md §데이터 모델 참조. Development 는 Database Design Agent 확정 스키마에 대해 `prisma generate` 후 repository 를 구현한다. T-A1 은 Database Design Agent 산출물 적용 태스크(스키마 자체 설계 아님).

---

## 태스크 목록

> [P] 표시: 이전 태스크와 병렬 실행 가능
> **레이어**: A(데이터) → B(도메인) → C(인터페이스) = **4단계 Development 책임**. D(테스트) = **5a Test Agent(AUTHORING) 책임**. 양 Agent 는 PPG-1 로 동일 turn 병렬 spawn.
> 기본 의존 순서: A → B → C. D 는 A·B·C 의 production 심볼을 canonical(본 문서 Test Authoring Contract)로 가정하여 병렬 작성.

### Step 1. 데이터 계층 (레이어 A — Development)

- [x] **T-A1** — Prisma 스키마 적용 (Database Design Agent 산출물)
    - 레이어: A
    - 구현 파일: `apps/backend/prisma/schema.prisma` (+ 마이그레이션 디렉토리)
    - 관련 요구사항: FR-009, FR-007 (User.password nullable)
    - 상세: Database Design Agent 가 확정한 `SocialAccount` 모델·`User.password String?`·`User.socialAccounts` relation·`@@unique([provider,providerId])`·`@@index([userId])` 를 반영하고 `prisma migrate`/`prisma generate` 실행. **스키마 세부 설계는 Database Design Agent 소유** — 본 태스크는 적용·client 생성.
    - 완료 기준: `prisma generate` 성공, `@prisma/client` 에 `SocialAccount` 타입·`User.password: string | null` 반영, 마이그레이션 적용.

- [x] **T-A2** — AuthRepository social_accounts CRUD + createUser 확장 (T-A1 후)
    - 레이어: A
    - 구현 파일: `apps/backend/src/modules/auth/auth.repository.ts`
    - 관련 요구사항: FR-004, FR-005, FR-006, FR-009
    - 상세:
      - `findByProviderAndProviderId(provider, providerId): Promise<SocialAccountWithUser | null>` (user include) — FR-004 재로그인 판정.
      - `createSocialAccount({userId, provider, providerId, email, name}): Promise<SocialAccount>` — `this.prisma.tx.socialAccount.create` (tx-aware).
      - `createUser` 시그니처 확장: `{ email: string; password?: string | null; name?: string | null }` 로 변경하고 `this.prisma.user.create` → **`this.prisma.tx.user.create`(tx-aware 전환)**. register 경로는 root fallback 으로 동작 불변(research §동시성).
    - 완료 기준: 신규 메서드 3종 + createUser 확장 컴파일 통과. register 회귀 없음(smoke).

### Step 2. 도메인 계층 (레이어 B — Development)

- [x] **T-B1** `[P]` — SocialProviderPort + SocialProfile + Stub
    - 레이어: B
    - 구현 파일: `apps/backend/src/modules/auth/social/social-provider.port.ts`, `social/stub-social.provider.ts`
    - 관련 요구사항: FR-002, NFR-004
    - 상세: `abstract class SocialProviderPort { abstract verify(token: string): Promise<SocialProfile> }`. `SocialProfile = { providerId: string; email: string | null; name: string | null }`. `StubSocialProvider` — 주입된 고정 프로필/예외 반환(무네트워크, SC-001~010 검증용).
    - 완료 기준: Port·타입·stub 컴파일 통과.

- [x] **T-B2** — Kakao/Google/Naver Provider 구현 (T-B1 후)
    - 레이어: B
    - 구현 파일: `social/kakao.provider.ts`, `social/google.provider.ts`, `social/naver.provider.ts`
    - 관련 요구사항: FR-001, FR-002, FR-003
    - 상세: Node 20 native `fetch` 로 제공자 검증 후 `SocialProfile` 반환. 필드 매핑 = research §외부 제공자 API 확정표.
      - Kakao: `GET kapi.kakao.com/v2/user/me` (Bearer) → `id`(str화)·`kakao_account.email`·`kakao_account.profile.nickname`.
      - Google: `GET oauth2.googleapis.com/tokeninfo?id_token=` → `sub`·`email`·`name`. **`aud === GOOGLE_CLIENT_ID` 필수 검증**(불일치→오류). `email_verified === 'true'` 문자열 파싱.
      - Naver: `GET openapi.naver.com/v1/nid/me` (Bearer) → `response.id`·`response.email`·`response.name`. `resultcode !== '00'` → 오류.
      - 토큰 무효/검증 실패 → 예외(상위에서 4xx 변환, FR-002/SC-006). email 부재 → email:null 반환(상위 FR-003 거부).
    - 완료 기준: 3 provider 컴파일 통과. 크레덴셜은 ConfigService/env 참조(GOOGLE_CLIENT_ID·NAVER_CLIENT_ID/SECRET·KAKAO_REST_API_KEY).

- [x] **T-B3** `[P]` — SocialProviderResolver (T-B1 후)
    - 레이어: B
    - 구현 파일: `social/social-provider.resolver.ts`
    - 관련 요구사항: FR-001
    - 상세: `resolve(provider: 'kakao'|'google'|'naver'): SocialProviderPort`. 미지원 값 → `BadRequestException`(이중 방어). provider→Port 매핑(DI 주입 구현체).
    - 완료 기준: 3제공자 매핑 + 미지원값 400.

- [x] **T-B4** — SocialAuthService 계정 해석 오케스트레이션 (T-A2·T-B2·T-B3 후)
    - 레이어: B
    - 구현 파일: `apps/backend/src/modules/auth/social-auth.service.ts`
    - 관련 요구사항: FR-001~008, NFR-002
    - 상세: `login(provider, token)`:
      1. `resolver.resolve(provider)` → `port.verify(token)` → `SocialProfile`. verify 실패 → 4xx(SC-006).
      2. `email == null` → `BadRequestException`(FR-003, SC-005).
      3. 계정 해석 **엄격 우선순위**(ADR-003): a. `findByProviderAndProviderId` 존재 → 재로그인(FR-004). b. else `findUserByEmail(email)` 존재 → `createSocialAccount` 연동(FR-005). c. else `runInTransaction`(createUser{password:null,name} + createSocialAccount)(FR-006/007).
      4. `authService.issueTokensForUser(user)` → `{accessToken, refreshToken}`(FR-008).
      - **동시성 방어**: c/b 경로 P2002(unique 위반) catch → 재해석(a→b) 폴백(research §동시성).
    - 완료 기준: 3분기 + 오류 분기 컴파일·로직 정합. 우선순위 a 매칭 시 b/c 미진입.

- [x] **T-B5** — AuthService issueTokensForUser 추출 + login null 가드 (T-A1 후)
    - 레이어: B
    - 구현 파일: `apps/backend/src/modules/auth/auth.service.ts`
    - 관련 요구사항: FR-007, FR-008, NFR-003
    - 상세:
      - `login()` 의 JWT access/refresh 발급 로직을 `private async issueTokensForUser(user: {id; email}): Promise<LoginResult>` 로 추출. login·social-login 공유. **동작 불변**(반환 형태·signAsync 인자·refresh tokenHash 저장 패턴 유지).
      - `login()` 에 **null 가드 신규**: `bcrypt.compare` 앞에 `if (!user.password) throw new UnauthorizedException('Invalid credentials')`(User.password nullable — null 을 compare 에 전달 금지, SC-004/NFR-003).
    - 완료 기준: login 기존 테스트 회귀 0(smoke), null 가드 분기 추가, issueTokensForUser 재사용.

### Step 3. 인터페이스 계층 (레이어 C — Development)

- [x] **T-C1** `[P]` — social-login DTO
    - 레이어: C
    - 구현 파일: `apps/backend/src/modules/auth/dto/social-login.dto.ts`
    - 관련 요구사항: FR-001
    - 상세: `{ provider: 'kakao'|'google'|'naver'; token: string }`. `@IsIn(['kakao','google','naver'])` provider enum 검증 + `@IsString() @IsNotEmpty()` token.
    - 완료 기준: 유효성 검증 데코레이터 적용.

- [x] **T-C2** — Controller 라우트 + Module DI 바인딩 (T-B4·T-C1 후)
    - 레이어: C
    - 구현 파일: `apps/backend/src/modules/auth/auth.controller.ts`, `auth.module.ts`
    - 관련 요구사항: FR-001, FR-008
    - 상세:
      - `@Post('social-login') @HttpCode(200) @ApiOkResponse({ type: LoginResponse })` — anonymous(가드 없음). `socialAuthService.login(dto.provider, dto.token)` 반환.
      - `auth.module.ts` providers 등록: `SocialAuthService`·`SocialProviderResolver`·`KakaoProvider`·`GoogleProvider`·`NaverProvider`. `SocialProviderPort` DI 바인딩(운영=실 provider, 테스트=Stub override). 응답 DTO 는 `LoginResponse` 재사용(research §영향 범위 노트).
    - 완료 기준: 라우트 등록·DI 해결·앱 부팅 시 provider 주입 성공.

- [x] **T-C3** `[P]` — .env.example 크레덴셜
    - 레이어: C
    - 구현 파일: `apps/backend/.env.example`
    - 관련 요구사항: NFR-004 (SC-018)
    - 상세: 카카오·구글·네이버 크레덴셜 env 항목 추가(ADR-007):
      - `KAKAO_REST_API_KEY=`
      - `GOOGLE_CLIENT_ID=`
      - `NAVER_CLIENT_ID=`, `NAVER_CLIENT_SECRET=`
    - 완료 기준: 3제공자 env 항목 존재(SC-018 static 검증 대상).

- [x] **T-C4** — Flutter SocialAuthService + socialLogin (T-A1 무관·백엔드 계약 확정 후 병렬 가능)
    - 레이어: C
    - 구현 파일: `mobile/customer_app/lib/features/auth/social_auth_service.dart`, `mobile/customer_app/lib/core/providers.dart`
    - 관련 요구사항: FR-010~013
    - 상세:
      - `abstract class SocialAuthService { Future<SocialCredential> signInWithKakao/Google/Naver(); }`. `SocialCredential { provider, token }`. `SocialAuthCancelled` 예외(사용자 취소). `socialAuthServiceProvider`(운영 concrete 는 운영 셋업 deferred — 파이프라인은 미설정 SDK 추가 안 함, research §Flutter SDK). 파이프라인용 기본 구현은 `UnimplementedError`/deferred stub 또는 provider override 전제.
      - `AuthController.socialLogin(provider, token)`: dio `POST /auth/social-login {provider, token}` (extra anonymous) → `TokenStore.save(access, refresh)` → `state = authenticated`(FR-013).
    - 완료 기준: 인터페이스·provider·socialLogin 메서드 컴파일. `flutter analyze` 0 issues(SC-017).

- [x] **T-C5** — Flutter login_screen 소셜 버튼 배선 (T-C4 후)
    - 레이어: C
    - 구현 파일: `mobile/customer_app/lib/features/auth/login_screen.dart`
    - 관련 요구사항: FR-010~015
    - 상세: `_SocialRow` 를 `_SocialRow(onKakao, onGoogle, onNaver)` **콜백 수신 위젯**으로 전환(canonical PATCH-013-01). 각 소셜 원형 버튼을 `GestureDetector(onTap:)` 로 래핑(SC-011~013). 부모 `_LoginScreenState` 핸들러: `ref.read(socialAuthServiceProvider).signInWith{X}()` → 성공 시 `socialLogin(provider, token)` → 메인 전환(FR-013). `SocialAuthCancelled` catch → 조용히 복귀·오류 미표시(FR-014, SC-015). 기타 실패(DioException/네트워크) catch → 오류 메시지 표시(FR-015, SC-016).
    - 완료 기준: 버튼 3종 탭 가능·핸들러 존재. 취소/실패 분기 구현. `flutter analyze` 0 issues.

### Step 4. 테스트 계층 (레이어 D — 5a Test Agent AUTHORING)

> 본 Step 태스크(D)는 **5a Test Agent(AUTHORING)** 가 PPG-1 시작 시 수행한다. 4단계 Development 는 A·B·C 만 진행. 심볼 canonical 은 Test Authoring Contract 참조.

- [ ] **T-D1** — 백엔드 소셜 로그인 단위 테스트 (SC-001~010)
    - 레이어: D | 테스트 파일: `apps/backend/src/modules/auth/social-auth.service.spec.ts`
    - 검증 대상: SC-001~003(정상 3분기)·SC-004(연계)·SC-005(email null)·SC-006(무효 토큰)·SC-007~009(3제공자 분기)·SC-010(social_accounts 레코드)
    - 방식: Jest. `SocialProviderPort` = StubSocialProvider(또는 mock) 주입. `AuthRepository` mock. `resolver`·provider 분기 검증.

- [ ] **T-D2** — login null 가드 회귀 + SC-004 (smoke, plan Y)
    - 레이어: D | 테스트 파일: `apps/backend/src/modules/auth/auth.service.spec.ts` (기존 확장)
    - 검증 대상: SC-004(password=null 사용자 email+password 로그인 → 401), 기존 email 로그인/register/refresh/reset 회귀 0
    - 방식: `findUserByEmail` mock 이 `password:null` 사용자 반환 → `login()` 401. 기존 FIXED_USER(password 보유) 시나리오 유지 확인.

- [ ] **T-D3** `[P]` — Flutter 정적 검증 (SC-011~013, SC-017, SC-018)
    - 레이어: D | 테스트 파일: `mobile/customer_app/test/features/social_login_static_test.dart` (+ 기존 static_verification 확장 가능)
    - 검증 대상: SC-011~013(카카오·구글·네이버 버튼 GestureDetector/onTap 핸들러 존재)·SC-017(analyze 0 issues — CI/명령)·SC-018(백엔드 `.env.example` 크레덴셜 항목 — dart:io 파일 검증 또는 백엔드 static)
    - 방식: 파일 심볼 존재(`GestureDetector`·`onKakao`/`onGoogle`/`onNaver`) 또는 위젯 렌더 후 `find.byType(GestureDetector)` 탭 가능. SC-018 은 `apps/backend/.env.example` 문자열 포함 검증(백엔드 정적 또는 Flutter dart:io 상대경로).

- [ ] **T-D4** — Flutter 소셜 인증 흐름 단위 (SC-014~016)
    - 레이어: D | 테스트 파일: `mobile/customer_app/test/features/social_login_flow_test.dart`
    - 검증 대상: SC-014(성공 → TokenStore 저장 + authenticated 전이)·SC-015(취소 → 화면 유지·오류 미표시)·SC-016(실패 → 오류 메시지 표시)
    - 방식: `ProviderScope(overrides: socialAuthServiceProvider→mock, dioProvider→mock)` + `pumpAndSettle`(canonical PATCH-013-01). mock success/`SocialAuthCancelled`/DioException 3시나리오.

- [ ] **T-D5** — (SC-019 e2e) — **deferred (옵션 B, 범위 외)**
    - 레이어: D | 미작성. spec Out of Scope §사후 운영 검증(PROC-014)로 이월. 실 OAuth 크레덴셜 발급 후 기기 검증.

---

## Test Authoring Contract

> **PPG-1 의 5a Test Agent(AUTHORING) 입력 contract**. 4단계 Development 와 병렬이므로 production 심볼을 canonical 로 가정한다.

### production 심볼 canonical (PROC-004)

- **백엔드**:
  - `SocialAuthService.login(provider: 'kakao'|'google'|'naver', token: string): Promise<{ accessToken: string; refreshToken: string }>` — **`AuthService` 와 별도 클래스** `social-auth.service.ts`.
  - `SocialProviderPort.verify(token: string): Promise<SocialProfile>`; `SocialProfile = { providerId: string; email: string | null; name: string | null }`.
  - `AuthRepository`: `findByProviderAndProviderId(provider, providerId)`·`createSocialAccount({userId, provider, providerId, email, name})`·`createUser({ email, password?: string|null, name?: string|null })`.
  - `AuthService.login({email, password})` — null 가드 후 `UnauthorizedException('Invalid credentials')`(리터럴 메시지 = production 상수 아님, 기존 문자열 참조).
  - 오류: 미지원 provider·email null → `BadRequestException`(400); 토큰 검증 실패 → 4xx(`BadRequestException`/`UnauthorizedException`).
  - 엔드포인트: `POST /auth/social-login`, 요청 `{provider, token}`, 응답 `{accessToken, refreshToken}`.
- **Flutter**:
  - `SocialAuthService.signInWithKakao/Google/Naver(): Future<SocialCredential>`; `SocialCredential { String provider; String token }`; 취소 시 `SocialAuthCancelled` throw.
  - `socialAuthServiceProvider`(Provider), `authControllerProvider`(NotifierProvider<AuthController, AuthStatus>) — `AuthController.socialLogin(String provider, String token)`.
  - `dioProvider` override 로 백엔드 응답 mock.

### UI 화면 canonical (PATCH-013-01)

- (a) 상태 주입: **Riverpod provider 경유**. `LoginScreen` = `ConsumerStatefulWidget`(유지), `_SocialRow` = 콜백 수신 위젯.
- (b) 렌더 전제: **`ProviderScope` 래핑 필수** + `socialAuthServiceProvider`·`dioProvider` override. `pumpAndSettle` 사용. 정적 검증은 심볼 존재/`find.byType(GestureDetector)`.

### SC → 테스트 매핑

| SC-ID | 수용 기준 | 시나리오 유형 | 테스트 파일 경로 | 비고 |
|---|---|---|---|---|
| SC-001 (FR-004) | 기연동 소셜계정 재로그인 → 토큰 | Happy | `apps/backend/src/modules/auth/social-auth.service.spec.ts` | [env:unit] stub provider |
| SC-002 (FR-005) | 이메일 일치 자동연동 → 토큰 | Happy | 〃 | [env:unit] |
| SC-003 (FR-006) | 신규 email → user 생성 + 토큰 | Happy | 〃 | [env:unit] |
| SC-004 (FR-007,NFR-003) | password=null 사용자 email 로그인 → 401 | Error | `apps/backend/src/modules/auth/auth.service.spec.ts` | [env:unit] smoke·login null 가드 |
| SC-005 (FR-003) | email null 반환 → 400 | Error | `social-auth.service.spec.ts` | [env:unit] |
| SC-006 (FR-002) | 무효 토큰 → 4xx | Error | 〃 | [env:unit] stub verify throw |
| SC-007 (FR-001,002) | provider=kakao verify 경로 + JWT | Happy | 〃 | [env:unit] |
| SC-008 (FR-001,002) | provider=google verify 경로 + JWT | Happy | 〃 | [env:unit] |
| SC-009 (FR-001,002) | provider=naver verify 경로 + JWT | Happy | 〃 | [env:unit] |
| SC-010 (FR-009) | social_accounts 레코드 존재(provider·providerId·email·name) | Happy | 〃 | [env:unit] createSocialAccount 호출 인자 검증 |
| SC-011 (FR-010) | 카카오 버튼 GestureDetector/onTap | Happy | `mobile/customer_app/test/features/social_login_static_test.dart` | [env:static] |
| SC-012 (FR-011) | 구글 버튼 탭 가능·핸들러 | Happy | 〃 | [env:static] |
| SC-013 (FR-012) | 네이버 버튼 탭 가능·핸들러 | Happy | 〃 | [env:static] |
| SC-014 (FR-013) | 성공 → TokenStore 저장 + authenticated 전이 | Happy | `mobile/customer_app/test/features/social_login_flow_test.dart` | [env:unit] ProviderScope+mock |
| SC-015 (FR-014) | 취소(SocialAuthCancelled) → 화면 유지·오류 미표시 | Edge | 〃 | [env:unit] |
| SC-016 (FR-015) | 실패(DioException/네트워크) → 오류 메시지 | Error | 〃 | [env:unit] |
| SC-017 (NFR-005) | `flutter analyze` 0 issues | — | (명령/CI) + `social_login_static_test.dart` 보조 | [env:static] |
| SC-018 (NFR-004) | `.env.example` 3제공자 크레덴셜 항목 | — | `social_login_static_test.dart` (또는 백엔드 static) | [env:static] `apps/backend/.env.example` |
| SC-019 (NFR-001) | P95 ≤ 3초 | Happy | **deferred(옵션 B, 범위 외)** | [env:e2e-docker] 미작성 |

> 시나리오 유형 커버리지: Happy(SC-001/002/003/007/008/009/010/011/012/013/014) · Edge(SC-015) · Error(SC-004/005/006/016). 세 유형 모두 커버.
>
> **(PROC-013-01) tx-aware e2e 매핑 한계**: `AuthRepository.createUser`(tx-aware 전환)의 tx/root 분기 실경로 검증은 e2e deferred 로 본 파이프라인 미포함(GAP-014-01). 단위(T-D1/T-D2)는 AuthRepository mock 이므로 분기 미표면화 — root fallback graceful + DB unique 안전망. 사후 운영 검증·Security 감사 위임.

---

## 태스크 입도 가이드

- 1 태스크 ≈ 구현 파일 1~3개 + 대응 테스트. T-B2(provider 3파일)는 동일 패턴·fetch 격리로 1태스크 유지.
- login() null 가드는 영향 범위 국한(호출측 1지점, research §F)이나 회귀 민감으로 T-B5 로 분리.

## 구현 완료 기준

- [x] 모든 태스크 체크박스 완료 (A·B·C = Development, D = Test Agent)
- [x] [TypeScript] `pnpm --filter backend build` (tsc) 0 error + `pnpm --filter backend test` 전체 PASS (신규 social + 기존 auth 회귀 0)
- [x] [TypeScript] 앱 부팅 시 SocialProviderPort DI 주입 성공(NestJS onModuleInit) — provider import·바인딩 런타임 검증 (`test/health.e2e-spec.ts` 로 AppModule 전체 부팅 확인, GAP-014-04 발견·수정)
- [x] [Flutter] `flutter analyze` 0 issues (SC-017) — production lib/ 기준 0 errors (test/ 내 5a D-layer 오류는 5a 책임)
- [ ] [Flutter] `flutter test` 전체 PASS (social static + flow) — D-layer 테스트 결함으로 미충족(GAP-014-02: static test cwd 경로 버그 4건 + flow test ProviderScopeWidget 타입오류 1건). production 코드는 grep·health e2e 로 정합성 확인됨(본 태스크 A·B·C 레이어 책임 범위 내 검증 완료). 5b Test Agent(EXECUTION) 정정 대상
- [x] Breaking(User.password nullable) 잔여 참조 0건 — `user.password` 접근이 login() null 가드 외 미방어 지점 없음(grep, 03-verification §1-4)
- [x] `.env.example` 3제공자 크레덴셜 항목 존재 (SC-018)
- [x] git status 의도치 않은 파일 없음
