---
작성: Design Agent
버전: v1.0
최종 수정: 2026-07-03 01:47
상태: 확정
---

# Tasks: 015-naver-code-exchange

> Branch: 015-naver-code-exchange | Date: 2026-07-03 | Plan: [../planning/plan.md](../planning/plan.md)

## 목차

- [전제 조건](#전제-조건)
- [태스크 목록](#태스크-목록)
- [Test Authoring Contract](#test-authoring-contract)
- [태스크 입도 가이드](#태스크-입도-가이드)
- [구현 완료 기준](#구현-완료-기준)

---

## 전제 조건

- [x] spec.md 의 모든 [NEEDS CLARIFICATION] 항목이 해소되었는가? — 0건(미결 사항 없음)
- [x] plan.md 의 Constitution Gates 가 모두 통과(또는 예외 기재) 되었는가? — P-001~P-007 전건 PASS, 예외 없음
- [x] CHANGES.md/context.md 에서 이전 작업(014)의 "후속 작업 시 주의사항"을 확인했는가? — SEC-002 orphan(path 3c 비원자, naver 도 동일 경로)·SEC-004 아웃바운드 rate limit 부재는 기존 부채 유지(본 spec 범위 외, GAP-015-01 별개)
- [x] (§F/PROC-001) production 시그니처 확장의 호출 측 테스트 회귀 식별 완료 — research.md §F. 조건부 verify 설계 + autolink-policy.spec 마이그레이션(SC-006, in-scope)

---

## 태스크 목록

> [P] 표시: 이전 태스크와 병렬 실행 가능
> **레이어**: A(데이터) → B(도메인) → C(인터페이스) = **4단계 Development 책임**. D(테스트) = **5a Test Agent(AUTHORING) 책임**. 양 Agent 는 PPG-1 로 동일 turn 병렬 spawn.
> 기본 의존 순서: B → C. D 는 B·C 의 production 심볼을 canonical(하단 Test Authoring Contract)로 가정하여 병렬 작성.
> **레이어 A(데이터) 없음** — DB 스키마 변경 0(`social_accounts.provider` 문자열 컬럼이 'naver' 수용, 신규 마이그레이션 불요). Database Design Agent 비활성.

### Step 1. 도메인 계층 (레이어 B — Development, backend)

- [x] **T-B1** — `SocialProviderPort` 시그니처 additive 확장
    - 레이어: B
    - 구현 파일: `apps/backend/src/modules/auth/social/social-provider.port.ts`
    - 관련 요구사항: FR-002, NFR-004
    - 상세: `abstract verify(token: string, context?: SocialVerifyContext): Promise<SocialProfile>`. `export interface SocialVerifyContext { state?: string; redirectUri?: string }` 추가. `SocialProfile` 무변경.
    - 완료 기준: 타입 컴파일 통과. Kakao·Google 구현체(파라미터 축소 override) 무수정 컴파일 유지.

- [x] **T-B2** — `NaverProvider` code-exchange 재작성
    - 레이어: B (T-B1 완료 후)
    - 구현 파일: `apps/backend/src/modules/auth/social/naver.provider.ts`
    - 관련 요구사항: FR-002, FR-003, FR-004, NFR-002, ADR-003/005/007
    - 상세:
      1. `constructor(private readonly configService: ConfigService) { super(); }` 추가(kakao/google 동일 패턴).
      2. `verify(code, context?)`:
         a. `client_id = configService.getOrThrow('NAVER_CLIENT_ID')` · `client_secret = configService.getOrThrow('NAVER_CLIENT_SECRET')` — **호출 시점 지연 조회**(fail-closed, NFR-002).
         b. `POST https://nid.naver.com/oauth2.0/token`, `Content-Type: application/x-www-form-urlencoded`, body = `URLSearchParams({ grant_type:'authorization_code', client_id, client_secret, code, state: context?.state ?? '' })`. **redirect_uri 미전송**(research: 네이버 토큰 교환 불요, 운영 재확인). Node 20 native `fetch`.
         c. 응답 파싱: `access_token` 부재 또는 `error` 존재 또는 `!res.ok` → `UnauthorizedException`(FR-003). `error_description` 만 로깅(client_secret·code 원문 마스킹, SC-017).
         d. `access_token` = **지역 변수**로만 보유(멤버 필드 승격 금지, SC-004).
         e. `GET https://openapi.naver.com/v1/nid/me`, `Authorization: Bearer ${access_token}` → 기존 `NaverProfileResponse` 파싱 재사용(`resultcode!=='00'` → Unauthorized). 반환 `{ providerId: response.id, email: response.email ?? null, name: response.name ?? null }`.
      3. 미활성 안내 주석(L15~31) 제거, code-exchange 설계 주석으로 대체.
    - 완료 기준: `SocialProfile` 반환에 access_token 필드 부재. client_secret/code/access_token 이 로그·예외 메시지·반환에 미포함.

- [x] **T-B3** — `SocialProviderResolver` 에 naver 재편입
    - 레이어: B (T-B2 완료 후)
    - 구현 파일: `apps/backend/src/modules/auth/social/social-provider.resolver.ts`
    - 관련 요구사항: FR-001, ADR-001
    - 상세: 생성자에 `private readonly naver: NaverProvider` 추가, `providers` 맵에 `naver: this.naver`. 미활성 주석 제거.
    - 완료 기준: `resolve('naver')` 가 `NaverProvider` 반환.

- [x] **T-B4** — `SocialAuthService` — AUTO_LINK naver 재편입 + 조건부 verify + login state
    - 레이어: B (T-B1 완료 후)
    - 구현 파일: `apps/backend/src/modules/auth/social-auth.service.ts`
    - 관련 요구사항: FR-006, FR-002, NFR-003, NFR-004, ADR-002/004
    - 상세:
      1. `AUTO_LINK_PROVIDERS = new Set(['kakao','google','naver'])` (naver 추가). 주석을 "code-exchange 앱바인딩 확보로 naver 자동연동 재허용(ADR-004, NFR-003)"로 갱신. ConflictException 분기(L70~75·L126~132)는 **잔존**(화이트리스트 밖 provider 방어).
      2. `login(provider: string, token: string, state?: string)` 3번째 인자 추가.
      3. **조건부 verify 호출**(§F 회귀 방지 — 필수):
         ```ts
         const profile = state === undefined
           ? await providerImpl.verify(token)
           : await providerImpl.verify(token, { state });
         ```
         → kakao·google(state 미전달)은 정확히 단일 인자 호출로 014 `social-auth.service.spec.ts` L249/L274 단언 무변경 PASS.
      4. 계정해석 3단계·P2002 race 폴백 구조 **무변경**.
    - 완료 기준: naver auto-link 허용. kakao/google 은 verify 단일 인자 호출 유지.

- [x] **T-B5** — `SocialLoginDto` naver + state
    - 레이어: B [P] (T-B1 과 독립)
    - 구현 파일: `apps/backend/src/modules/auth/dto/social-login.dto.ts`
    - 관련 요구사항: FR-001, FR-002, ADR-007
    - 상세: `SUPPORTED_PROVIDERS = ['kakao','google','naver'] as const`. `@ApiProperty({required:false}) @IsOptional() @IsString() state?: string` 필드 추가(class-validator `IsOptional` import). 미활성 주석 갱신.
    - 완료 기준: `{provider:'naver', token, state}` 검증 통과. 기존 `{provider:'kakao', token}` 요청도 유효(state optional).

### Step 2. 인터페이스 계층 (레이어 C — Development)

- [x] **T-C1** — `AuthController` state 전달 + `AuthModule` naver 등록
    - 레이어: C (T-B2·T-B4·T-B5 완료 후)
    - 구현 파일: `apps/backend/src/modules/auth/auth.controller.ts`, `apps/backend/src/modules/auth/auth.module.ts`
    - 관련 요구사항: FR-001, FR-002
    - 상세: controller `socialLogin` → `this.socialAuthService.login(dto.provider, dto.token, dto.state)`. module: `NaverProvider` import 복원 + `providers` 배열에 `NaverProvider` 추가. 미와이어 주석 제거.
    - 완료 기준: `POST /auth/social-login` 이 naver 요청을 `NaverProvider` 경유 처리. DI 해석 성공.

- [x] **T-C2** — Flutter `SocialAuthService` naver 추가 + `pubspec` 의존
    - 레이어: C [P]
    - 구현 파일: `mobile/customer_app/lib/features/auth/social_auth_service.dart`, `mobile/customer_app/pubspec.yaml`
    - 관련 요구사항: FR-010, FR-011, ADR-006, ASM-001
    - 상세:
      1. `abstract SocialAuthService` 에 `Future<SocialCredential> signInWithNaver()` 추가.
      2. `SocialCredential` 에 `final String? state` 추가(생성자 optional named `this.state`) — 기존 카카오·구글 `const SocialCredential(provider:, token:)` 유효 유지.
      3. `StubSocialAuthService.signInWithNaver()` = 고정 code·state 반환 스텁(`SocialCredential(provider:'naver', token:'stub-naver-code', state:'stub-state')`).
      4. `pubspec.yaml` dependencies 에 `flutter_web_auth_2` 추가(실 구현체는 운영 셋업 — 스텁이 기본). import 형태 `package:flutter_web_auth_2/flutter_web_auth_2.dart`.
      5. 미활성 주석(signInWithNaver 미추가 사유) 제거.
    - 완료 기준: `signInWithNaver` 인터페이스 존재. Stub 반환. `flutter pub get` 성공.

- [x] **T-C3** — Flutter `LoginScreen` 네이버 버튼 재활성화
    - 레이어: C (T-C2 완료 후)
    - 구현 파일: `mobile/customer_app/lib/features/auth/login_screen.dart`
    - 관련 요구사항: FR-009, FR-010
    - 상세: `_SocialRow` 에 `final VoidCallback? onNaver` 추가 + 네이버 원형 버튼(`GestureDetector(onTap: onNaver, ...)`, 네이버 그린 `Color(0xFF03C75A)`, 'N' 텍스트). build 에서 `onNaver: _loading ? null : () => _socialLogin(socialService.signInWithNaver)`. `_socialLogin` 재사용. 미활성 주석(L194~196) 제거.
    - 완료 기준: 네이버 버튼 탭 가능·`onNaver` 핸들러 연결. `_socialLogin` 이 naver credential 을 백엔드로 전달.

- [x] **T-C4** — Flutter `AuthController.socialLogin` state 전달
    - 레이어: C [P]
    - 구현 파일: `mobile/customer_app/lib/core/providers.dart`
    - 관련 요구사항: FR-010, FR-013, ADR-007
    - 상세: `socialLogin(String provider, String token, {String? state})` optional named 파라미터 추가. POST 바디에 `if (state != null) 'state': state` 조건 포함. `login_screen._socialLogin` 이 `credential.state` 를 전달하도록 연계(`socialLogin(credential.provider, credential.token, state: credential.state)`). 카카오·구글은 state=null → 바디 미포함(하위 호환).
    - 완료 기준: naver 요청 바디에 state 포함, 카카오·구글 요청 바디 무변경. TokenStore 저장 흐름 무변경.

### Step 3. 테스트 계층 (레이어 D — 5a Test Agent AUTHORING)

> 본 Step 태스크는 **5a Test Agent(AUTHORING)** 가 PPG-1 병렬로 수행한다. Development(4단계)는 본 Step 외(B·C)만 진행. 하단 [Test Authoring Contract] 가 canonical 입력.

- [ ] **T-D1** — 백엔드: `NaverProvider` code-exchange 단위 (SC-002, SC-003, SC-004)
    - 레이어: D
    - 테스트 파일: `apps/backend/src/modules/auth/social/naver.provider.spec.ts` (신규)
    - 검증 대상: SC-002(code 교환 stub→프로필 stub 순차, providerId/email/name 반환), SC-003(교환 실패 stub → UnauthorizedException 4xx), SC-004(반환 타입에 access_token 부재)
    - 상세: `global.fetch` mock(토큰 교환 응답 → 프로필 응답 순차). `ConfigService` mock(NAVER_CLIENT_ID/SECRET). 교환 요청 body 에 grant_type/client_id/client_secret/code/state 포함 검증. 오류 응답(error/!ok) → throw.

- [ ] **T-D2** — 백엔드: naver 계정해석 서비스 단위 (SC-001, SC-006, SC-007, SC-008, SC-009, SC-010)
    - 레이어: D
    - 테스트 파일: `apps/backend/src/modules/auth/social-auth.service.naver.spec.ts` (신규)
    - 검증 대상: SC-001(resolver.resolve('naver') 처리 진입), SC-006(email 일치 기존계정 자동연동 — naver ∈ AUTO_LINK), SC-007(providerId 매칭 재로그인), SC-008(신규가입), SC-009(email null → BadRequest 400), SC-010(3경로 accessToken·refreshToken 형식)
    - 상세: resolver·repo·authService mock. `service.login('naver', code, state)` 3인자 호출. 계정해석 분기별 mock 구성.

- [ ] **T-D3** — 백엔드: autolink-policy 테스트 마이그레이션 (SC-006 정합, §F in-scope)
    - 레이어: D (T-B4 정책 반전에 정합)
    - 테스트 파일: `apps/backend/src/modules/auth/social-auth.service.autolink-policy.spec.ts` (기존 수정)
    - 검증 대상: SC-006(naver 자동연동 허용으로 정책 반전)
    - 상세: **naver-denial `it()`(L76~91, ConflictException 기대) 삭제**(014 정책 인코딩 — 015 FR-006 이 반전). `it.each(['kakao','google'])`(L120) → `it.each(['kakao','google','naver'])` 로 naver 편입(자동연동 허용 회귀 검증). naver path 3c 테스트(L93~118)는 유지. 파일 상단 주석을 015 정책(naver 자동연동 재허용)으로 갱신.
    - 완료 기준: naver 로그인 시 동일 email 기존계정에 자동연동 성공(ConflictException 미발생). kakao/google 회귀 0.

- [ ] **T-D4** — Flutter: 네이버 정적 검증 (SC-011, SC-012, SC-017, SC-020 보조)
    - 레이어: D
    - 테스트 파일: `mobile/customer_app/test/features/naver_social_login_static_test.dart` (신규)
    - 검증 대상: SC-011(login_screen 에 네이버 버튼 GestureDetector + `onNaver` 심볼 존재), SC-012(인앱 WebView 위젯 미사용 + 시스템 브라우저/외부인증 메커니즘 `flutter_web_auth_2`/`signInWithNaver` 심볼 존재), SC-017(`apps/backend/.env.example` 에 `NAVER_CLIENT_ID`·`NAVER_CLIENT_SECRET` 존재 + `social_auth_service.dart`/`naver.provider.ts` 에 client_secret 로그 노출 부재), SC-020(analyze 마커 노트)
    - 상세: 파일 내용 문자열 검증(014 `social_login_static_test.dart` 패턴 재사용). **경로 기준(PROC-014-03)**: `Directory.current` = 패키지 루트(`mobile/customer_app/`) 기준 상수 경로. `.env.example` 은 `../../apps/backend/.env.example`.

- [ ] **T-D5** — Flutter: 네이버 인증 흐름 위젯 (SC-013, SC-014, SC-015)
    - 레이어: D
    - 테스트 파일: `mobile/customer_app/test/features/naver_social_login_flow_test.dart` (신규)
    - 검증 대상: SC-013(SocialAuthCancelled → 화면 유지·오류 미표시), SC-014(mock 4xx/네트워크 → 오류 메시지 표시), SC-015(mock JWT 수신 → TokenStore 저장 + authenticated 전이)
    - 상세: `ProviderScope` + `socialAuthServiceProvider`(naver 스텁)·`dioProvider`(성공/오류)·`tokenStoreProvider`(`_FakeTokenStore`) override. 네이버 버튼 Finder = `find.ancestor(of: find.text('N'), matching: find.byType(GestureDetector))`. `pumpAndSettle`. (014 `social_login_flow_test.dart` harness 재사용.)

- [ ] **T-D6** — 백엔드: 회귀 스위트 재실행 확인 (SC-005, SC-019)
    - 레이어: D
    - 테스트 파일: (기존) `social-auth.service.spec.ts`·`kakao.provider.spec.ts`·`auth.service.spec.ts` — 신규 파일 없음, 실행 확인 태스크
    - 검증 대상: SC-005(kakao/google 클라이언트 토큰 검증 흐름 무변경), SC-019(014 카카오·구글 스위트 100% PASS, 회귀 0)
    - 상세: 조건부 verify 설계(T-B4)로 `verify` 단일 인자 단언(L249/L274) 무변경 PASS 확인. AUTO_LINK naver 추가가 kakao/google 경로 무영향 확인. 5b EXECUTION 이 전체 스위트 실행으로 검증.

> **SC-016**(NFR-001 성능 P95): deferred(옵션 B, 범위 외) — 테스트 태스크 없음. 실 OAuth 크레덴셜 발급 후 운영 측정(spec Out of Scope 명시).
> **SC-018**(NFR-003 보안감사): 6단계 Security Agent(활성·필수) 재감사 — Development/Test 태스크 없음. code-exchange·naver 자동연동 Critical/High 0건 판정 대상.

---

## Test Authoring Contract

> **PPG-1 의 5a Test Agent(AUTHORING) 입력 contract**. 4단계 Development 와 병렬이므로 production 심볼을 canonical 로 가정한다.

### production 심볼 canonical (PROC-004)

- **백엔드**:
  - `SocialProviderPort.verify(token: string, context?: SocialVerifyContext): Promise<SocialProfile>`; `SocialVerifyContext = { state?: string; redirectUri?: string }`; `SocialProfile = { providerId: string; email: string | null; name: string | null }`. **access_token 필드 부재**(SC-004).
  - `NaverProvider extends SocialProviderPort` — `constructor(configService: ConfigService)`, `verify(code, context?)` = `POST nid.naver.com/oauth2.0/token`(form-urlencoded: grant_type·client_id·client_secret·code·state) → `access_token` → `GET openapi.naver.com/v1/nid/me`(Bearer) → `{providerId: response.id, email: response.email ?? null, name: response.name ?? null}`. 교환 실패(error/!ok) → `UnauthorizedException`(4xx).
  - `SocialAuthService.login(provider: 'kakao'|'google'|'naver', token: string, state?: string): Promise<{accessToken, refreshToken}>` — **`AuthService` 와 별도 클래스** `social-auth.service.ts`. 내부 verify 호출은 **조건부**(state undefined → `verify(token)` 단일 인자 / else `verify(token,{state})`). email null → `BadRequestException`(400).
  - `AUTO_LINK_PROVIDERS = Set(['kakao','google','naver'])` — naver 자동연동 허용.
  - `AuthRepository`(무변경): `findByProviderAndProviderId(provider, providerId)`·`findUserByEmail(email)`·`createSocialAccount({userId, provider, providerId, email, name})`·`createUser({email, name, password:null})`.
  - `AuthService.issueTokensForUser(user)` → `{accessToken, refreshToken}`.
  - 엔드포인트: `POST /auth/social-login`, 요청 `{provider, token, state?}`, 응답 `{accessToken, refreshToken}`(naver access_token 미포함).
  - 리터럴 단언 주의: email null 거부 메시지·미지원 provider 메시지는 production 문자열 참조(추측 단언 금지). 오류는 예외 **타입**(BadRequestException/UnauthorizedException)으로 단언 우선.
- **Flutter**:
  - `SocialAuthService.signInWithKakao/Google/Naver(): Future<SocialCredential>`; `SocialCredential { String provider; String token; String? state }` (state optional named). 취소 시 `SocialAuthCancelled` throw.
  - `socialAuthServiceProvider`(Provider), `tokenStoreProvider`(Provider), `dioProvider`(Provider), `authControllerProvider`(NotifierProvider<AuthController, AuthStatus>). `AuthController.socialLogin(String provider, String token, {String? state})`.

### UI 화면 상태주입 canonical (PATCH-013-01)

- (a) **상태 주입 방식**: **Riverpod provider 경유**. `LoginScreen` = `ConsumerStatefulWidget`(유지), `_SocialRow` = 콜백 수신 위젯(`onKakao`·`onGoogle`·`onNaver` VoidCallback?), 네이버 버튼 = `GestureDetector`(정적 위젯).
- (b) **테스트 렌더 전제**: **`ProviderScope` 래핑 필수** + `socialAuthServiceProvider`·`dioProvider`·`tokenStoreProvider` override. `pumpAndSettle` 사용. 정적 검증은 파일 내용 심볼 존재/`find.byType(GestureDetector)`.

### 위젯 테스트 harness 전제 고정 (PROC-014-03)

- (1) **경로 기준**: 정적 테스트는 `Directory.current`(= 패키지 루트 `mobile/customer_app/`) 기준 **상수 경로**. `.env.example` = `../../apps/backend/.env.example`. `Platform.script`/임의 상대경로 가정 금지(014 `social_login_static_test.dart` `libPath`/`backendEnvExamplePath` 헬퍼 재사용).
- (2) **플랫폼 채널 의존 위젯**: `FlutterSecureStorage`(무응답 채널 → `pumpAndSettle` timeout) 은 `tokenStoreProvider` 를 `_FakeTokenStore`(in-memory) 로 override 필수. `flutter_web_auth_2`(플랫폼 채널) 은 `socialAuthServiceProvider` 스텁 override 로 무의존.
- (3) **Finder 하드 assert**: 네이버 버튼 Finder = `find.ancestor(of: find.text('N'), matching: find.byType(GestureDetector))` — 실제 렌더 텍스트 기반. `if (finder.isEmpty) markTestSkipped` 조건부 skip anti-pattern 금지, `expect(finder, findsOneWidget)` 하드 assert(GAP-014-02 재발 방지).

### 트랜잭션 인지 심볼 매핑 (PROC-013-01)

- naver 신규가입 경로(path 3c)는 `AuthRepository.createUser`+`createSocialAccount` 2 INSERT 로 `runInTransaction` 미원자화(root fallback, SEC-002/GAP-014-01 기존 부채). 단위(T-D2)는 `AuthRepository` mock 이므로 tx/root 분기 미표면화. **e2e 실경로 검증은 deferred**(SC-016 옵션 B) — 사후 운영 검증(PROC-014 신규 로그인 시나리오)·Security(SC-018) 감사 위임. P2002 폴백 + DB `@@unique` 안전망으로 완화. 본 spec 은 신규 tx-aware 심볼 도입 없음(014 그대로).

### SC → 테스트 매핑

| SC-ID | 수용 기준 | 시나리오 유형 | 테스트 파일 경로 | 함수명 후보 | 비고 |
|---|---|---|---|---|---|
| SC-001 (FR-001) | provider naver 처리 진입 | Happy | `social-auth.service.naver.spec.ts` | test_SC001_naver_provider_resolves_and_enters_flow | [env:unit] |
| SC-002 (FR-002,004) | code 교환→프로필 순차 + JWT | Happy | `social/naver.provider.spec.ts` | test_SC002_code_exchange_then_profile_returns_profile | [env:unit] fetch mock 2회 |
| SC-003 (FR-003) | 교환 실패 → 4xx | Error | `social/naver.provider.spec.ts` | test_SC003_invalid_code_throws_unauthorized | [env:unit] |
| SC-004 (FR-004) | 응답에 access_token 미포함 | Edge | `social/naver.provider.spec.ts` | test_SC004_access_token_not_in_returned_profile | [env:unit] 반환 타입 검증 |
| SC-005 (FR-005) | kakao/google 흐름 무변경 + JWT | Happy | (기존) `social-auth.service.spec.ts` | (기존 유지) | [env:unit] 회귀·무변경 |
| SC-006 (FR-006) | naver email 자동연동 | Happy | `social-auth.service.naver.spec.ts` + `social-auth.service.autolink-policy.spec.ts`(마이그레이션) | test_SC006_naver_auto_link_existing_email | [env:unit] AUTO_LINK naver |
| SC-007 (FR-006) | naver 재로그인 | Happy | `social-auth.service.naver.spec.ts` | test_SC007_naver_relogin_existing_social_account | [env:unit] |
| SC-008 (FR-006) | naver 신규가입 | Happy | `social-auth.service.naver.spec.ts` | test_SC008_naver_new_user_created | [env:unit] |
| SC-009 (FR-007) | naver email null → 400 | Error | `social-auth.service.naver.spec.ts` | test_SC009_naver_email_null_returns_400 | [env:unit] |
| SC-010 (FR-008) | 3경로 JWT 형식 | Happy | `social-auth.service.naver.spec.ts` | test_SC010_naver_all_paths_return_token_pair | [env:unit] |
| SC-011 (FR-009) | 네이버 버튼 GestureDetector+핸들러 | Happy | `test/features/naver_social_login_static_test.dart` | test_SC011_naver_button_gesture_and_handler | [env:static] |
| SC-012 (FR-010) | 인앱 WebView 미사용 + 시스템브라우저 메커니즘 | Happy | `naver_social_login_static_test.dart` | test_SC012_no_inapp_webview_system_browser_mechanism | [env:static] flutter_web_auth_2/signInWithNaver 심볼 |
| SC-013 (FR-011) | 취소 → 화면 유지·오류 미표시 | Edge | `test/features/naver_social_login_flow_test.dart` | test_SC013_naver_cancelled_stays_no_error | [env:unit] ProviderScope+mock |
| SC-014 (FR-012) | 실패 → 오류 메시지 | Error | `naver_social_login_flow_test.dart` | test_SC014_naver_failure_shows_error | [env:unit] |
| SC-015 (FR-013) | 성공 → TokenStore 저장+authenticated | Happy | `naver_social_login_flow_test.dart` | test_SC015_naver_success_stores_tokens_navigates | [env:unit] _FakeTokenStore override |
| SC-016 (NFR-001) | P95 ≤ 3초 | — | **deferred(옵션 B, 범위 외)** | — | [env:e2e-docker] 미작성 |
| SC-017 (NFR-002) | .env NAVER_* 존재 + secret 비노출 | — | `naver_social_login_static_test.dart` | test_SC017_env_naver_credentials_and_no_secret_leak | [env:static] `apps/backend/.env.example` |
| SC-018 (NFR-003) | Security 재감사 Critical/High 0 | — | Security Agent(6단계) | — | [env:static] 감사 위임 |
| SC-019 (NFR-004) | 014 kakao/google 스위트 100% PASS | Happy | (기존) `social-auth.service.spec.ts`·`kakao.provider.spec.ts` | (기존 유지) | [env:unit] 회귀 0 |
| SC-020 (NFR-005) | flutter analyze 0 issues | — | (명령/CI) + `naver_social_login_static_test.dart` 마커 | test_SC020_flutter_analyze_zero_issues_note | [env:static] |

> 시나리오 유형 커버리지: Happy(SC-001/002/005/006/007/008/010/011/012/015/019) · Edge(SC-004/013) · Error(SC-003/009/014). 세 유형 모두 커버. (SC-016~018/020 은 성능·보안·정적 게이트로 유형 분류 대상 외.)
>
> **외부 contract 충족 가능**: main 이 `ExternalAuthoring: YES` 시그널로 5a 호출 시, 본 contract 를 외부에서 충족시킨 산출물(test-cases.md + 테스트 파일)의 존재를 main 이 확인 후 5b 진입.

### smoke_tests (회귀 안전망)

- 대상: `apps/backend/src/modules/auth/social-auth.service.spec.ts`(kakao/google 계정해석·verify 단일인자 단언)·`social-auth.service.autolink-policy.spec.ts`(kakao/google 자동연동)·`kakao.provider.spec.ts`·`auth.service.spec.ts`(email 로그인/register/refresh/reset·social password:null 가드).
- 근거: `login` state 추가·`AUTO_LINK` naver 추가·`verify` 시그니처 확장이 기존 경로에 회귀 유발 가능(NFR-004, SC-019). **조건부 verify 호출**(T-B4)이 verify 단일인자 단언 무변경 PASS 보장. autolink-policy naver-denial 은 T-D3 로 마이그레이션(정책 반전 정합).

---

## 태스크 입도 가이드

- 1 태스크 ≈ 구현 파일 1~2개 + 대응 테스트. B/C 레이어 8태스크·D 레이어 6태스크.
- naver.provider.ts 재작성(T-B2)은 단일 파일이나 code-exchange 신규 로직으로 별도 태스크 분리.
- 조건부 verify 호출(T-B4)은 §F 회귀 방지 핵심 — 단일 함수 변경이나 회귀 영향(014 테스트 2건)으로 명시 분리.

## 구현 완료 기준

- [ ] 모든 태스크(T-B1~5·T-C1~4·T-D1~6) 체크박스 완료
- [ ] [Node/NestJS] `pnpm --filter backend test` 전체 PASSED (naver 신규 + 014 회귀 100%)
- [ ] [Flutter] `flutter test` 전체 PASSED + `flutter analyze` 0 issues (SC-020)
- [ ] Breaking 잔여 참조 0: `verify(` 호출부(social-auth.service 단일)·`.login('naver'` 정책 반전 반영 확인
- [ ] git status 의도치 않은 파일 없음
