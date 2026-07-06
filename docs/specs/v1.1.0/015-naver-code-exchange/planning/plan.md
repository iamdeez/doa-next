---
작성: Planning Agent
버전: v1.0
최종 수정: 2026-07-03 [시각 미확인]
상태: 확정
---

# Plan: 015-naver-code-exchange

> Branch: 015-naver-code-exchange | Date: 2026-07-03 | Spec: [../spec/spec.md](../spec/spec.md)

## 목차

- [사전 검증 (Constitution Gates)](#사전-검증-constitution-gates)
- [기술 컨텍스트](#기술-컨텍스트)
- [Provider 앱바인딩 검증 수단 (PATCH-014-01)](#provider-앱바인딩-검증-수단-patch-014-01)
- [외부 라이브러리·엔드포인트 동작 검증](#외부-라이브러리엔드포인트-동작-검증)
- [배포 환경 영향](#배포-환경-영향)
- [핵심 설계](#핵심-설계)
- [결정 기록 (ADRs)](#결정-기록-adrs)
- [인터페이스 계약](#인터페이스-계약)
- [데이터 모델](#데이터-모델)
- [위험 완화 설계](#위험-완화-설계)
- [테스트 전략](#테스트-전략)
- [기타 고려사항](#기타-고려사항)

---

## 사전 검증 (Constitution Gates)

> constitution.md(`.claude/docs/constitution.md`) P-001~P-007 조항 기준. spec.md NFR 이 constitution 보다 완화된 경우 constitution 기준을 따른다. 본 spec 은 constitution 조항과 충돌하는 NFR 이 없다(성능 P95 조항은 constitution 에 부재 — NFR-001 은 spec 자체 기준 3초, 014 계승).

- [x] **P-001 모듈 경계 원칙**: [Pass 기준: 타 도메인 스키마 직접 참조 0건] — `social_accounts`(`users` 스키마)는 auth 모듈 `AuthRepository` 만 접근(변경 없음, 014 계승). Naver code-exchange 는 외부 HTTP 호출(nid.naver.com / openapi.naver.com)이며 타 모듈 DB 미접근. **PASS**
- [x] **P-002 AWS 의존 금지 원칙**: [Pass 기준: AWS 전용 SDK/서비스 신규 의존 0건] — 백엔드 토큰 교환은 Node 20 native `fetch`(`application/x-www-form-urlencoded` POST). 신규 npm 의존 0건. AWS SDK 미사용. Flutter 딥링크 패키지는 모바일 클라이언트 의존(AWS 무관). **PASS**
- [x] **P-003 단일 DB 원칙**: [Pass 기준: 외부 데이터 저장소 신규 도입 0건] — DB 스키마 변경 없음(`social_accounts.provider` 문자열 컬럼이 'naver' 값 수용, 신규 마이그레이션 불요). 외부 저장소 없음. **PASS**
- [x] **P-004 클라우드 중립 원칙**: [Pass 기준: Fly.io 전용 API 비즈니스 결합 0건] — `NAVER_CLIENT_ID`/`NAVER_CLIENT_SECRET` 은 표준 환경변수(`fly secrets` 는 배포 레이어). 비즈니스 로직에 Fly 전용 API 없음. **PASS**
- [x] **P-005 결제·정산 정합성 원칙**: [Pass 기준: 해당 없음] — 금전 상태 변경 없음. **N/A (PASS)**
- [x] **P-006 테스트 원칙**: [Pass 기준: SC-XXX 없는 FR-XXX 0건] — FR-001~013 전건 SC 대응(요구사항 구조화 매트릭스·하단 테스트 전략 매핑표). **PASS**
- [x] **P-007 스펙 범위 원칙**: [Pass 기준: spec 범위 외 변경 파일 0건] — 변경은 **네이버 재도입에 한정**: `naver.provider.ts` 재작성 + `social-provider.resolver.ts`·`social-login.dto.ts`·`auth.module.ts`·`social-auth.service.ts`(AUTO_LINK_PROVIDERS) + Flutter `login_screen.dart`·`social_auth_service.dart`·`providers.dart` 의 naver 재편입. 카카오·구글 검증 로직(`kakao.provider.ts`·`google.provider.ts`)·계정해석 흐름 구조 무변경(NFR-004). `SocialProviderPort.verify` 시그니처의 **optional context 파라미터 추가**·`SocialLoginDto`/`SocialCredential` 의 **optional state 필드 추가**는 FR-002(code-exchange 는 state 전달을 요구) 구현에 직접 필요한 additive 변경으로 범위 내. **PASS**

예외 사항: 없음.

> **성능 게이트 판정**: NFR-001 P95 3초 기준(spec 자체·014 계승). SC-016(측정)은 실 OAuth 크레덴셜 필요로 spec 이 명시적으로 deferred(`[env:e2e-docker]`, 범위 외, 옵션 B). 파이프라인 내 모든 제공자 호출은 stub/mock 이므로 in-pipeline 성능 측정 대상 없음.

---

## 기술 컨텍스트

- **언어 / 런타임**:
  - 백엔드: Node.js 20 + TypeScript, NestJS (`apps/backend`)
  - 모바일: Flutter (Dart, `mobile/customer_app`)
- **주요 의존성**:
  - 백엔드: `@nestjs/jwt`·`@nestjs/config`(기존 재사용), Prisma(기존), Node 20 global `fetch`(네이버 토큰 교환·프로필 조회 HTTP) — **신규 npm 의존 없음**. 토큰 교환은 `application/x-www-form-urlencoded` POST 로 native fetch 처리 가능(spec-input Q13).
  - 모바일: authorization code 획득용 **시스템 브라우저 + 커스텀 URL 스킴 리다이렉트** 패키지 신규 필요(`pubspec.yaml` 확인 결과 딥링크/외부 인증 컨텍스트 패키지 전무). 후보 `flutter_web_auth_2` / `app_links` / `uni_links` — **정확한 패키지·버전·URL 스킴 값은 `[TO-VERIFY: Flutter 딥링크 패키지·URL 스킴 — Design 확정]`(ASM-001)**.
- **테스트 프레임워크**:
  - 백엔드: Jest (기존 unit `*.spec.ts`), e2e(deferred)
  - 모바일: `flutter_test`(widget/unit), `flutter analyze`(정적)
- **기존 재사용 대상 (변경 없음)**:
  - `SocialProviderPort`(abstract class DI 토큰)·`SocialProviderResolver`(provider→구현체 매핑)·`SocialAuthService` 계정해석 3단계(providerId 매칭→email 자동연동→신규가입)·`AuthService.issueTokensForUser`·`AuthRepository`(social_accounts CRUD·createUser·findUserByEmail·findByProviderAndProviderId) — 전부 014 산출물 그대로 재사용.
  - Flutter `TokenStore`(FlutterSecureStorage)·`AuthController.socialLogin`·`socialAuthServiceProvider`.

---

## Provider 앱바인딩 검증 수단 (PATCH-014-01)

> 클라이언트가 provider 토큰/코드를 백엔드로 전달하는 검증 방식에서, 각 provider 의 **토큰 앱바인딩(audience) 검증 수단**을 명시한다. 이 표가 SEC-001(제3자 앱 발급 토큰 재전송에 의한 계정 탈취) 방어의 근본 근거다.

| provider | 검증 방식 | 앱바인딩 검증 수단 | 검증 가능 | 본 spec 처리 |
|---|---|---|---|---|
| kakao | 클라이언트 토큰 검증(client-token) | `GET /v1/user/access_token_info` 응답의 `app_id` 를 `KAKAO_APP_ID` 와 대조 | **O** | 무변경(014 v1.3 RESOLVED). 회귀 방지만(NFR-004, SC-005/019) |
| google | 클라이언트 토큰 검증(client-token) | `GET tokeninfo` 응답의 `aud` 를 `GOOGLE_CLIENT_ID` 와 대조 + `email_verified` | **O** | 무변경(014 v1.3 RESOLVED). 회귀 방지만(NFR-004, SC-005/019) |
| naver | **client-token 방식으로는 검증 불가** — `/v1/nid/me` 등 공개 API 가 access token 의 발급 앱(client)을 식별하는 필드(카카오 `app_id`·구글 `aud` 대응)를 제공하지 않음 | **X (공개 API 부재)** | **X** | **(a) 서버 authorization code + client_secret 교환 방식으로 전환** — `client_secret`(백엔드 전용)로만 code→token 교환이 가능하므로 발급 토큰의 DOA 앱 귀속이 OAuth 프로토콜 수준에서 보장됨. 앱바인딩을 **응답 필드 대조 대신 교환 크레덴셜 소유**로 확보(카카오 app_id·구글 aud 대조와 동등 이상). FR-002/NFR-003 |

> **결정 근거**: OBS-014-01/PROC-014-01(v1.1.0/014 — naver 앱바인딩 검증 부재가 Security 단계까지 지연 표면화 → naver 제외). 본 spec 은 검증 수단 X 인 naver 를 **spec/plan 단계에서 code-exchange 로 전환 결정**(spec-input Q-A·Q-D 사용자 확정, spec.md FR-002/NFR-003)하여 근본 제약을 사전 해소한다. code-exchange 로도 확보 불가능한 잔여 위험(예: redirect_uri 미검증 시 code 재사용)은 [외부 라이브러리·엔드포인트 동작 검증](#외부-라이브러리엔드포인트-동작-검증) 의 `[TO-VERIFY]` 로 Design/Security 에 위임한다.

---

## 외부 라이브러리·엔드포인트 동작 검증

> (rule 10 / PATCH-002) 본 spec 의 네이버 토큰 교환은 외부 엔드포인트 동작에 의존한다. 본 환경(Bash·web 도구 부재)에서 venv/공식문서 직접 검증이 불가하여 `[TO-VERIFY]` 마커로 표기하고 Design(research.md)에 위임한다. 코드 예시에는 확정값처럼 리터럴을 쓰지 않고 위임 노트와 일치시킨다.

| 항목 | 후보(추정) | 검증 위임 마커 |
|---|---|---|
| 네이버 토큰 엔드포인트 URL | `POST https://nid.naver.com/oauth2.0/token` | `[TO-VERIFY: naver 토큰 엔드포인트 URL·HTTP 메서드 — Design 공식문서 확인]` |
| 토큰 교환 요청 파라미터 | `grant_type=authorization_code`·`client_id`·`client_secret`·`code`·`state` (form-urlencoded). **redirect_uri 필수 여부 불명** | `[TO-VERIFY: naver 토큰 요청 파라미터 집합·redirect_uri 요구 여부 — Design 공식문서 확인]` |
| 토큰 교환 응답 필드 | 성공 `access_token`·`token_type`·`expires_in` / 실패 `error`·`error_description` | `[TO-VERIFY: naver 토큰 응답 성공·오류 필드 실명 — Design 공식문서 확인]` |
| 프로필 엔드포인트 응답 | `GET https://openapi.naver.com/v1/nid/me` → `resultcode`('00' 성공)·`response.id`→providerId·`response.email`·`response.name` (기존 `naver.provider.ts` 파싱 로직 근거) | `[TO-VERIFY: naver nid/me 응답 필드 실명 재확인 — Design 공식문서 확인]` |
| PKCE 지원 여부 | 미확인. 미지원이어도 `client_secret` 교환(표준 confidential client)만으로 NFR-003 충족(ASM-003) | `[TO-VERIFY: naver 오픈API PKCE 지원 여부 — Design 공식문서 확인, 지원 시 ADR 반영]` |
| 커스텀 URL 스킴 캡처(Flutter) | 시스템 브라우저 + 커스텀 스킴. 패키지·스킴 값 미확정(ASM-001) | `[TO-VERIFY: Flutter 딥링크 패키지·URL 스킴 문자열 — Design 확정]` |

> **(PATCH-A07) 인정되는 한계 + 안전망**:
> - **네이버 이메일 선택 동의**: 네이버도 카카오와 유사하게 사용자가 이메일 제공에 동의하지 않으면 `response.email` 이 반환되지 않을 수 있다(silent absence). → 안전망: **FR-007**(이메일 미반환 시 로그인 거부, SC-009)이 이 한계를 흡수(기존 `SocialAuthService` 의 `if (!profile.email)` 분기 재사용, 변경 없음).
> - **code 재사용/redirect_uri 검증 의존**: code-exchange 앱바인딩 보장은 (1) 네이버가 code 를 발급 시점의 `client_id`(+redirect_uri) 조합에 귀속시키고, (2) `client_secret` 소유자만 교환 가능하다는 전제에 의존한다. redirect_uri 검증이 네이버 토큰 교환에서 강제되는지는 `[TO-VERIFY]`(위 표). → 안전망: 6단계 **Security Agent 재감사(SC-018)** 가 code 재사용·redirect_uri 검증·state CSRF 방어를 최종 확인(NFR-003 은 잠정이 아닌 필수 검토 대상으로 spec 명시).

---

## 배포 환경 영향

> (PROC-009) infra.md 운영 환경 cross-reference 결과.

- 네이버 code-exchange 는 백엔드에서 **아웃바운드 2건**을 순차 호출한다: (1) `nid.naver.com/oauth2.0/token`(토큰 교환, 신규) → (2) `openapi.naver.com/v1/nid/me`(프로필, 014 당시 미활성으로 미등재). infra.md §5(연결 실패 재시도)·§8(제약)에 **카카오·구글 아웃바운드는 등재되어 있으나 네이버 2개 엔드포인트는 미등재** 상태.
- infra.md 확인: Fly.io 아웃바운드 트래픽 제한 없음, NAT/docker-proxy/L4 LB 흡수 이슈 해당 없음(인바운드 재연결 특이성과 무관). critical 배포 환경 특이성 없음.
- 크레덴셜은 `fly secrets set` 패턴(기존 KAKAO_APP_ID·GOOGLE_CLIENT_ID·SMTP_* 동일)으로 dev/prod app 별 독립 주입. 신규 인프라 컴포넌트·컨테이너 구조 변경 없음 → **Deploy Agent 비활성**(selection-phases.md 근거).
- **결론**: infra.md §5(네이버 아웃바운드 재시도 동작)·§7(배포 전 체크리스트 — `NAVER_CLIENT_ID`/`NAVER_CLIENT_SECRET` fail-closed·활성 provider 3종으로 갱신)·§8(소셜 아웃바운드 의존성에 nid.naver.com·openapi.naver.com 추가) 갱신 필요 → **GAP-015-01** 로 추적(Docs/Retrospective 위임, 014 GAP-014-06 동일 패턴 — [NEEDS CLARIFICATION] 대상 아님).

---

## 핵심 설계

> 작성 깊이: Design Agent 가 추가 설계 판단 없이 tasks.md 를 분해 가능한 수준.

### 백엔드 — 네이버 code-exchange 흐름 (FR-001~004, FR-006~008)

```
POST /auth/social-login  { provider: 'naver', token: <authorization code>, state?: <state> }
    ↓ [AuthController.socialLogin]  →  socialAuthService.login(dto.provider, dto.token, dto.state)
    ↓ SocialAuthService.login(provider, token, state?)
    ├─ 1) resolver.resolve('naver') → NaverProvider (SocialProviderResolver 에 재편입)
    ├─ 2) port.verify(token, { state }) → { providerId, email, name }
    │      NaverProvider.verify(code, ctx):
    │        a. client_id/client_secret = configService.getOrThrow(NAVER_CLIENT_ID / NAVER_CLIENT_SECRET)   (호출 시점 지연, fail-closed, NFR-002)
    │        b. POST nid.naver.com/oauth2.0/token (grant_type=authorization_code, client_id, client_secret, code, state[, redirect_uri?])  (FR-002)
    │             → access_token 획득. 실패(무효·만료·재사용 code, 설정 불일치) → Unauthorized/BadRequest  (FR-003, SC-003)
    │             access_token 은 verify() 로컬 변수로만 보유 — 반환·저장·로그 금지  (FR-004, SC-004)
    │        c. GET openapi.naver.com/v1/nid/me (Authorization: Bearer access_token)  (FR-004)
    │             → { providerId=response.id, email=response.email ?? null, name=response.name ?? null }
    ├─ 3) email 없음 → BadRequestException 400  (FR-007, SC-009)  [기존 분기 재사용, 무변경]
    ├─ 4) 계정 해석 (ADR-003, 014 무변경):
    │      a. findByProviderAndProviderId('naver', providerId) 존재 → 재로그인      (FR-006, SC-007)
    │      b. else findUserByEmail(email) 존재 → createSocialAccount 자동연동        (FR-006, SC-006)  ← naver ∈ AUTO_LINK_PROVIDERS
    │      c. else createUser({email,name,password:null}) + createSocialAccount      (FR-006, SC-008)
    ├─ 5) issueTokensForUser(user) → { accessToken(JWT), refreshToken }              (FR-008, SC-010)
    └─ 응답: { accessToken, refreshToken }   ← 네이버 access_token 미포함 (SC-004)
```

**변경 모듈 (backend `apps/backend/src/modules/auth/`)**:

| 파일 | 유형 | 내용 |
|---|---|---|
| `social/naver.provider.ts` | **재작성** | client-token 검증 → **code-exchange** 로 전환. `verify(code, ctx)` 가 토큰 교환 POST + 프로필 GET 순차 수행. `ConfigService` 주입(생성자), `client_secret` getOrThrow 지연 조회. 기존 `NaverProfileResponse` 파싱(`resultcode`·`response.*`) 재사용. 미활성 안내 주석 제거 |
| `social/social-provider.port.ts` | **수정** | `verify(token: string, context?: SocialVerifyContext): Promise<SocialProfile>`. `SocialVerifyContext = { state?: string; redirectUri?: string }`. 2번째 인자 optional → 카카오·구글 구현체 무영향(NFR-004) |
| `social/social-provider.resolver.ts` | **수정** | `NaverProvider` 생성자 주입 + `providers` 맵에 `naver: this.naver` 추가. 미활성 주석 제거 |
| `social/naver.provider.spec.ts` | 신규(Test 단계) | code-exchange stub 흐름 검증(D 레이어, Test Agent) |
| `social-auth.service.ts` | **수정** | `AUTO_LINK_PROVIDERS = new Set(['kakao','google','naver'])`. `login(provider, token, state?)` 로 3번째 인자 추가 → `providerImpl.verify(token, { state })`. 계정해석 흐름·방어 분기 구조 무변경(naver 자동연동 재허용 주석 갱신) |
| `dto/social-login.dto.ts` | **수정** | `SUPPORTED_PROVIDERS = ['kakao','google','naver']`. `@IsOptional @IsString state?: string` 필드 추가(naver 전용, CSRF) |
| `auth.controller.ts` | **수정** | `socialLogin` 에서 `dto.state` 를 `login(dto.provider, dto.token, dto.state)` 로 전달 |
| `auth.module.ts` | **수정** | `providers` 에 `NaverProvider` 등록 + import 복원 |

> **분기 핵심**: 계정해석 우선순위(a→b→c)는 014 무변경. naver 를 `AUTO_LINK_PROVIDERS` 에 추가하면 기존 `autoLinkAllowed` 분기가 자동으로 naver 자동연동을 허용(별도 코드 삭제 불요 — 기존 ConflictException 분기는 화이트리스트 밖 provider 용 방어 코드로 잔존, ADR-004 015).

### 백엔드 — 스키마

DB 스키마 변경 없음. `social_accounts.provider` 문자열 컬럼이 'naver' 값 수용(014 마이그레이션 `20260701064209_add_social_accounts` 재사용). Database Design Agent 비활성.

### Flutter — 네이버 버튼 재활성화 및 code 획득 (FR-009~013)

```
_SocialRow 네이버 버튼 (GestureDetector.onTap)
    ↓ SocialAuthService.signInWithNaver()
    ├─ 시스템 브라우저로 네이버 인증 URL open (커스텀 URL 스킴 redirect, ASM-001 [TO-VERIFY] 패키지)
    │     인증 완료 → 커스텀 스킴 리다이렉트 캡처 → authorization code (+ state) 수신
    │     사용자 취소(브라우저 닫음) → SocialAuthCancelled 예외 → 조용히 복귀(오류 미표시)  (FR-011, SC-013)
    ├─ SocialCredential(provider:'naver', token: code, state: state) 반환
    ├─ AuthController.socialLogin('naver', code, state) → POST /auth/social-login (dio)
    │     실패(4xx/네트워크/code 교환 실패/email 미반환) → 오류 메시지 표시 + 이메일 로그인 안내  (FR-012, SC-014)
    └─ 성공 → TokenStore.save(access, refresh) → authenticated 전이 → 메인 전환  (FR-013, SC-015)
```

**변경 (Flutter `mobile/customer_app/lib/`)**:

| 파일 | 유형 | 내용 |
|---|---|---|
| `features/auth/social_auth_service.dart` | **수정** | `abstract SocialAuthService` 에 `Future<SocialCredential> signInWithNaver()` 추가. `SocialCredential` 에 `final String? state` 필드 추가(naver 전용). `StubSocialAuthService.signInWithNaver()` 스텁(고정 code·state 반환). 미활성 주석 제거 |
| `features/auth/login_screen.dart` | **수정** | `_SocialRow` 에 `onNaver` 콜백·네이버 원형 버튼(`GestureDetector.onTap`) 추가(SC-011). `_socialLogin` 재사용. 미활성 주석 제거 |
| `core/providers.dart` | **수정** | `AuthController.socialLogin(provider, token, {String? state})` 로 optional state 파라미터 추가 → POST 바디에 `if state!=null` 포함. 카카오·구글 호출은 state 미전달(무영향) |

> **시스템 브라우저 + 커스텀 스킴**(인앱 WebView 금지, Q-C 확정, FR-010, SC-012). 정확한 패키지·URL 스킴·네이티브 설정(Info.plist·AndroidManifest·앱 등록)은 운영 셋업 deferred(ASM-001/002). 파이프라인 검증(SC-011~015)은 `SocialAuthService` mock 으로 SDK/딥링크 무의존 단위·정적 검증.

---

## 결정 기록 (ADRs)

> ID 체계는 본 spec 로컬 순번(ADR-001~007, 015 접두). 014 ADR 과 구분한다. 014 ADR-001(클라이언트 토큰 검증)은 naver 에 한해 본 spec ADR-001(015)로 대체된다.

| ADR-ID | 결정 항목 | 채택안 | 대안 (검토했으나 채택 안 함) | 근거 (spec FR/NFR 참조) | 영향 범위 |
|---|---|---|---|---|---|
| ADR-001 | 네이버 OAuth 흐름 | **서버 사이드 authorization code + client_secret 교환**(confidential client). Flutter 는 code 만 획득, 백엔드가 client_secret 로 교환 | (A) 014 클라이언트 토큰 검증 유지 — naver 앱바인딩 검증 수단 부재(X)로 SEC-001 해소 불가 / (B) 3 provider 전체 code-exchange 통일 — 카카오·구글 재작업·회귀 위험, 범위 초과(Q-A) | FR-002, NFR-003, SEC-001(014), spec-input Q-A/Q-D | `naver.provider.ts`(재작성)·Port·resolver·service |
| ADR-002 | Port 시그니처 확장 | `verify(token, context?: {state?, redirectUri?})` — 2번째 인자 optional. naver 만 context.state 사용, 카카오·구글 무시(동작 불변) | (1) code+state 를 token 문자열에 인코딩(가독성·파싱 취약) / (2) naver 전용 별도 인터페이스(Port 다형성 훼손·resolver 분기 복잡) | FR-002, NFR-004(회귀 방지) | `social-provider.port.ts`·구현체 3종·service |
| ADR-003 | code 교환 수단 | Node 20 native `fetch` 로 `nid.naver.com/oauth2.0/token` form-urlencoded POST + `nid/me` GET | (1) passport-naver 전략(NestJS 요청 흐름과 불일치·리다이렉트 서버 렌더 전제) / (2) 네이버 공식 SDK(신규 의존·서버용 부재) | FR-002, FR-004, P-002(의존 최소), NFR-001 | `naver.provider.ts`. 엔드포인트 상세 `[TO-VERIFY]` Design |
| ADR-004 | 네이버 자동연동 재허용 | `AUTO_LINK_PROVIDERS` 에 'naver' 재편입 → 카카오·구글과 동일 email 자동연동 적용. 기존 ConflictException 분기는 화이트리스트 밖 provider 방어 코드로 잔존 | (B) 계속 차단(providerId 매칭 재로그인만) — code-exchange 앱바인딩 확보로 차단 근거 소멸, FR-006 UX 저하 / (C) 결정 보류 — 검증 지연 | FR-006, NFR-003, spec-input Q-D. **6단계 Security Agent 최종 재감사 대상(SC-018)** | `social-auth.service.ts` |
| ADR-005 | client_secret 조달·조회 | `NAVER_CLIENT_SECRET`(`.env.example` 기존 placeholder, 014 당시 미사용) 을 verify() 호출 시점 `getOrThrow` 지연 조회(fail-closed). 실 값은 운영 셋업 deferred, 파이프라인은 stub | 앱 기동 시 eager 검증(미설정 시 전체 기동 실패 — 카카오·구글 fail-closed 패턴과 불일치) | NFR-002, ASM-002, spec-input Q-B(014 ADR-007 계승) | `naver.provider.ts`·`.env.example`(변경 불요·placeholder 존재)·운영 secret |
| ADR-006 | 모바일 code 획득 방식 | **시스템 브라우저 + 커스텀 URL 스킴** 리다이렉트. 인앱 WebView 금지 | 인앱 WebView 임베드(신규 패키지 불요이나 OAuth 보안 모범사례 위배·제공자 웹뷰 차단 추세) | FR-010, spec-input Q-C. 패키지·스킴 `[TO-VERIFY]`(ASM-001) | Flutter `social_auth_service.dart`·네이티브 설정(deferred) |
| ADR-007 | state(CSRF) 전달 경로 | Flutter 생성 state → `SocialCredential.state` → DTO `state` → `verify` context → 네이버 토큰 교환 요청. 백엔드가 교환 시 state 전달(네이버 토큰 요청 파라미터) | state 백엔드 자체 생성·세션 저장(익명 엔드포인트·무상태 서버에 세션 스토어 도입 부담) | FR-002, spec-input Q10/Q16. state 필수 여부·검증 위치 `[TO-VERIFY]` Design/Security | DTO·SocialCredential·AuthController·service·provider |

> 본 표는 Design Agent 의 research.md "기술 선택 조사" 절과 cross-reference 한다. `[TO-VERIFY]` 항목(ADR-003 엔드포인트·ADR-006 패키지·ADR-007 state 검증)은 Design 이 공식문서로 확정한다. ADR 미작성 결정이 design 단계에 발견되면 status: BLOCKED 로 Planning 복귀.

---

## 인터페이스 계약

### 엔드포인트 (기존 `POST /auth/social-login` 확장, 하위 호환)

`POST /auth/social-login` (인증 불요 — anonymous)
- 요청: `{ provider: 'kakao'|'google'|'naver', token: string, state?: string }`
  - `token`: 카카오·구글 = 클라이언트 SDK access/id token(무변경) / 네이버 = authorization code
  - `state`: 네이버 전용 optional(CSRF). 카카오·구글 요청은 미포함(하위 호환 — 기존 `{provider, token}` 요청 그대로 유효)
- 응답 200: `{ accessToken: string, refreshToken: string }` (기존 login·014 동일 형식, FR-008)
  - **불변조건(SC-004)**: 네이버 access_token 은 응답 바디 어디에도 미포함(`accessToken` 은 DOA JWT).
- 오류: 400(미지원 provider·email 미반환·code 교환 실패), 401(토큰/code 검증 실패)

> **하위 호환**: `state` 는 optional 추가 필드이므로 기존 카카오·구글 클라이언트 요청·테스트(SC-005/019)에 영향 없음(NFR-004). `SocialProviderPort.verify` 의 2번째 인자도 optional 이므로 카카오·구글 구현체·호출부 동작 불변.

### 권한 부여·상태 전이 인가 3축 (PATCH-001 / PROC-003)

> 소셜 로그인은 **신규 인증 진입점**이므로 인가의 본질은 "제공자 신원 확립"이다. 네이버 경로의 (b) 축이 014 대비 강화되었다.

| 엔드포인트 (provider) | (a) 호출자 신원(인증) | (b) 대상 자원 소유권 | (c) 역할(admin 등) | 미검증 축 위험·후속 |
|---|---|---|---|---|
| `POST /auth/social-login` (naver) | **code-exchange 로 신원 확립** — client_secret 소유 백엔드만 교환 가능. code 무효/만료/재사용 → 거부(FR-003) | 자동연동 시 대상=email 일치 기존 계정. 소유권 근거 = **네이버 이메일 + code-exchange 앱바인딩**(제3자 code 재전송 시 교환 불가 — SEC-001 전제 소거, NFR-003) | 없음(로그인은 역할 무관) | (b) 축이 네이버 이메일 신뢰 + code 앱바인딩에 의존 → 014 대비 **앱바인딩 확보로 계정 탈취 표면 축소**. 잔여 위험(redirect_uri 미검증·state CSRF·이메일 verified 플래그 부재)은 **Security Agent(활성, SC-018) 최종 감사**. FR-007(email 없으면 거부)·providerId 우선 매칭(ADR-003 a)이 1차 완화 |
| `POST /auth/social-login` (kakao/google) | 토큰 검증 + app_id/aud 대조(무변경) | email 일치 기존 계정(무변경) | 없음 | 014 v1.3 RESOLVED — 본 spec 무변경(NFR-004) |

> **Security Agent 위임 포인트(SC-018 필수)**: (1) code-exchange 앱바인딩이 redirect_uri 검증·code 1회성에 의존하는지, (2) state CSRF 발급·검증 흐름의 완결성, (3) 네이버 자동연동 재허용의 계정 탈취 잔존 위험(email verified 플래그 부재 포함), (4) 네이버 access_token 비노출·비저장(SC-004) 준수를 감사한다.

### 기존 인터페이스 하위 호환

- `SocialProviderPort.verify(token, context?)`: context optional → 카카오(`KakaoProvider.verify`)·구글(`GoogleProvider.verify`) 구현체는 시그니처 유지 가능(2번째 인자 미사용). **Breaking 잔여 참조 0건 검증**: `verify(` 호출부는 `social-auth.service.ts` 단일 지점 → `verify(token, { state })` 로 갱신. Development/Test 가 재확인(03-verification §1-4).
- `SocialAuthService.login(provider, token, state?)`: 3번째 인자 optional → 호출부는 `auth.controller.ts` 단일 지점. 기존 카카오·구글 테스트(state 미전달)는 그대로 통과.
- Flutter `SocialCredential({provider, token, state?})`: state optional → 기존 카카오·구글 `const SocialCredential(provider, token)` 생성 유효.

---

## 데이터 모델

DB 스키마 변경 없음. `social_accounts`(`users` 스키마, 014 확정) 재사용:

| 컬럼 | 타입 | 비고 |
|---|---|---|
| provider | String | 'kakao'\|'google'\|**'naver'** — 문자열 컬럼이 신규 값 'naver' 수용(마이그레이션 불요) |
| providerId | String | 네이버 `response.id` |
| email | String | 연동 시점 네이버 이메일 |
| name | String? | 네이버 `response.name`(선택) |

- `@@unique([provider, providerId])`·`@@index([userId])`·User.password nullable — 전부 014 그대로. 신규 마이그레이션 0건.

---

## 위험 완화 설계

> (PATCH-A06) assumptions.md 중 "확인 필요=예" 항목의 안전망.

| ASM | 위험 | 안전망 |
|---|---|---|
| ASM-001 (Flutter 딥링크 패키지·스킴 미확정) | 패키지·URL 스킴·네이티브 설정 미확정 → 운영 배포 시 code 획득 실패 | (1) 아키텍처(시스템 브라우저+커스텀 스킴)를 ADR-006 로 고정, 정확 값 `[TO-VERIFY]` Design 위임. (2) 파이프라인 검증은 `SocialAuthService` mock 으로 딥링크 무의존(SC-011~015). (3) 사후 운영 검증(옵션 B, spec §사후 운영 검증 PROC-014)에서 실 기기 1회 점검 |
| ASM-002 (실 크레덴셜·앱 등록 deferred) | `NAVER_CLIENT_ID`/`SECRET` 실 값·redirect URI 미등록 → 운영 배포 시 교환 실패 | (1) env 스킴 ADR-005 고정, `.env.example` placeholder 존재. (2) verify() 지연 조회 fail-closed — 미설정 시에도 앱 기동 무영향, 네이버 로그인 호출 시에만 오류 국한. (3) infra.md §7 체크리스트 갱신(GAP-015-01) |
| ASM-003 (PKCE 지원 미확인) | 미지원 시 code interception 방어 약화 | (1) `client_secret` 교환(confidential client)만으로 NFR-003 충족(PKCE 는 선택 강화). (2) 지원 시 Design ADR 반영. (3) Security Agent(SC-018) 감사 |
| ADR-007 state / redirect_uri 미검증(외부 엔드포인트 [TO-VERIFY]) | code 재사용·CSRF 로 앱바인딩 우회 | (1) state 전달 경로 ADR-007 로 설계. (2) 네이버 토큰 요청 파라미터·redirect_uri 필수 여부 Design `[TO-VERIFY]` 확정. (3) **Security Agent(SC-018) 최종 감사** — NFR-003 은 필수 검토 대상(spec 명시) |

---

## 테스트 전략

> (PATCH-A08 / PROC-010 / PROC-014) 실 OAuth e2e(SC-016 성능 + 실 네이버 인증 흐름)는 **옵션 B(사용자 직접 검증)** 채택(spec Out of Scope 명시, 014 선례 계승).
> - 옵션 자가 점검(PROC-010): (1) **운영 환경 의존성 Y** — 실 네이버 OAuth 네트워크·실 크레덴셜·redirect URI 등록·기기 딥링크 캡처에 의존. (2) **mock 불가 시나리오 Y** — 실 code 발급/교환, 네이버 동의 화면, 앱↔시스템 브라우저 전환, 커스텀 스킴 리다이렉트. (3) **권장: 옵션 B 유지**. 파이프라인 내 SC(SC-001~015·017~020)는 stub/mock 단위·정적 검증. 운영 모니터링은 infra.md §5 아웃바운드 추가(GAP-015-01)로 보완.
> - 사후 피드백 사이클(PROC-014): spec §사후 운영 검증에 5개 시나리오(신규 로그인·자동연동·재로그인·취소·카카오/구글 회귀) 명시됨. 결함 발견 시 hotfix spec 입력 → main "spec 수정" → 별도 patch spec.

| SC | 테스트 수준 | 유형 | 시나리오 유형 | 입력 | 기대 결과 |
|---|---|---|---|---|---|
| SC-001 (FR-001) | 단위 | provider 지원 | Happy | `provider:'naver'` 요청 | 미지원 400 거부 아님, 처리 흐름 진입(resolver·DTO 화이트리스트 naver 포함) |
| SC-002 (FR-002,004) | 단위 | 통합흐름 | Happy | 유효 code stub | code-exchange stub → 프로필 stub 순차 호출 + JWT(access·refresh) 반환 |
| SC-003 (FR-003) | 단위 | 방어 | Error | 무효·만료·재사용 code stub(교환 throw) | 4xx 오류 |
| SC-004 (FR-004) | 단위 | 불변조건 | Edge | 네이버 로그인 성공 응답 바디 | 네이버 access_token 미포함(accessToken=DOA JWT 만) |
| SC-005 (FR-005) | 단위 | 회귀 | Happy | `provider:'kakao'` / `'google'` | app_id/aud 대조 포함 기존 흐름 무변경 수행 + JWT |
| SC-006 (FR-006) | 단위 | 자동연동 | Happy | 미연동 naver, email=기존 계정 | 기존 계정에 social_account 연동 + JWT (naver ∈ AUTO_LINK_PROVIDERS) |
| SC-007 (FR-006) | 단위 | 재로그인 | Happy | 기연동 naver(provider+providerId) | 신규 연동/생성 없이 JWT |
| SC-008 (FR-006) | 단위 | 신규가입 | Happy | 기존 계정 없는 naver email | 신규 user + social_account 생성 + JWT |
| SC-009 (FR-007) | 단위 | 방어 | Error | naver 프로필 email=null stub | 400 (email 미반환 거부) |
| SC-010 (FR-008) | 단위 | 형식 | Happy | SC-006/007/008 세 경로 | 이메일 로그인과 동일 형식 access·refresh 반환 |
| SC-011 (FR-009) | 정적 | 위젯존재 | Happy | LoginScreen 네이버 버튼 | 탭 가능(GestureDetector) + onNaver 핸들러 존재 |
| SC-012 (FR-010) | 정적 | 위젯확인 | Happy | 네이버 인증 트리거 코드 | 인앱 WebView 위젯 미사용 + 시스템 브라우저/외부 컨텍스트 메커니즘 존재 |
| SC-013 (FR-011) | 단위 | 취소 | Edge | mock 취소(SocialAuthCancelled) | 로그인 화면 유지, 오류 메시지 미표시 |
| SC-014 (FR-012) | 단위 | 실패 | Error | mock 실패(4xx/네트워크) | 오류 메시지 표시 |
| SC-015 (FR-013) | 단위 | 성공흐름 | Happy | mock JWT 수신 | TokenStore access·refresh 저장 + 메인 전환(authenticated) |
| SC-016 (NFR-001) | e2e | 성능 | Happy | 실 OAuth 흐름 | P95 ≤ 3초 — **deferred(옵션 B, 범위 외)** |
| SC-017 (NFR-002) | 정적 | env·비노출 | — | `.env.example`·코드 검토 | `NAVER_CLIENT_ID`/`SECRET` 존재 + client_secret 이 로그·응답 바디 미포함 |
| SC-018 (NFR-003) | 정적 | 보안감사 | — | Security Agent 재감사 | 네이버 자동연동·code-exchange Critical/High 0건 |
| SC-019 (NFR-004) | 단위 | 회귀 | Happy | 014 카카오·구글 기존 스위트 | 100% PASS(회귀 0, 네이버 신규분 제외) |
| SC-020 (NFR-005) | 정적 | analyze | — | `flutter analyze` | 0 issues |

> **시나리오 유형 커버리지**: Happy(SC-001/002/005/006/007/008/010/011/012/015/019) · Edge(SC-004 불변조건·SC-013 취소) · Error(SC-003/009/014) 세 유형 모두 커버. (SC-016~018/020 은 성능·보안·정적 게이트로 유형 분류 대상 외.)

### smoke_tests

- 필요 여부: **Y**
- 대상 경로:
  - `apps/backend/src/modules/auth/social-auth.service.spec.ts` (014 카카오·구글 계정해석 단위)
  - `apps/backend/src/modules/auth/auth.service.spec.ts` (email 로그인/register/refresh/reset 단위)
- 근거: `SocialAuthService.login` 시그니처에 optional `state` 추가 + `AUTO_LINK_PROVIDERS` 에 naver 추가 + `SocialProviderPort.verify` 시그니처 확장이 기존 카카오·구글 계정해석 경로에 회귀를 유발할 수 있다(NFR-004, SC-019). 기존 auth 단위 스위트를 SC 매핑 테스트와 함께 실행하여 회귀 0 확인.

---

## 기타 고려사항

- **네이버 access_token 비노출·비저장(FR-004 불변조건, SC-004)**: `NaverProvider.verify` 내부에서만 access_token 을 지역 변수로 보유하고 프로필 조회 후 폐기. `SocialProfile` 반환 타입에 access_token 필드 부재로 타입 수준에서 누출 차단. 로그 출력 시 code·access_token·client_secret 원문 기록 금지(마스킹) — Development 방어(Q12).
- **client_secret 비노출(NFR-002, SC-017)**: `client_secret` 은 `configService.getOrThrow` 로 조회 후 토큰 교환 요청 바디에만 사용. 어떤 로그·예외 메시지·API 응답에도 포함 금지. Development 는 교환 실패 시 네이버 `error_description` 만 로깅(secret 미포함).
- **state CSRF(ADR-007)**: state 필수 여부·검증 위치(클라이언트 로컬 vs 백엔드 교환 시)는 `[TO-VERIFY]` Design 확정. 네이버 토큰 교환이 state 를 요구하면 백엔드가 그대로 전달, CSRF 최종 방어는 Security Agent(SC-018) 감사 대상.
- **동시성(신규 네이버 사용자 레이스)**: 014 `SocialAuthService` 의 P2002 catch → 재조회 폴백 로직이 naver 에도 그대로 적용(naver ∈ AUTO_LINK_PROVIDERS 이므로 race 시 자동연동/재로그인 폴백 정상 동작). `users.email @unique` + `social_accounts @@unique([provider,providerId])` 가 DB 수준 최종 정합성 보장. 별도 코드 불요.
- **email null 타입**: `SocialProfile.email: string | null` 유지 — FR-007 분기를 타입 수준 강제(기존 재사용).
- **NaverProvider 재작성 시 기존 파싱 재사용**: 기존 `naver.provider.ts` 의 `NaverProfileResponse` 인터페이스·`resultcode`·`response.id/email/name` 파싱은 code-exchange 후 프로필 조회 단계에서 그대로 재사용 가능(교환 로직만 신규 추가). `[TO-VERIFY]` 로 Design 이 필드 실명 재확인.
- **[TO-VERIFY] 일관성(PATCH-002)**: 외부 네이버 엔드포인트 URL·파라미터·응답 필드·PKCE·Flutter 패키지·스킴은 코드 예시가 아닌 설계 표에서 `[TO-VERIFY]` 마커로 표기했고 위임 노트와 일치시켰다. 확정값처럼 리터럴을 단정하지 않았다(엔드포인트 URL 은 spec-input Q11 근거 후보로 표기하되 Design 재확인 위임).
</content>
