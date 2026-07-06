---
작성: Design Agent
버전: v1.0
최종 수정: 2026-07-03 01:43
상태: 확정
---

# Research: 015-naver-code-exchange

## 목차

- [기존 코드베이스 분석](#기존-코드베이스-분석)
- [영향 범위 분석](#영향-범위-분석)
- [production 시그니처 변경 — 호출 측 테스트 식별 (§F / PROC-001)](#production-시그니처-변경--호출-측-테스트-식별-f--proc-001)
- [외부 라이브러리·엔드포인트 실제 동작 확인 ([TO-VERIFY] 확정)](#외부-라이브러리엔드포인트-실제-동작-확인-to-verify-확정)
- [인정되는 한계 및 안전망 (PATCH-A07)](#인정되는-한계-및-안전망-patch-a07)
- [배포 환경 영향 추정 (PATCH-A10)](#배포-환경-영향-추정-patch-a10)
- [context.md 부정합 사전 점검 (PATCH-A11)](#contextmd-부정합-사전-점검-patch-a11)
- [014 인프라 재사용 경계](#014-인프라-재사용-경계)
- [기술 선택 조사](#기술-선택-조사)
- [엣지 케이스 및 한계](#엣지-케이스-및-한계)

---

## 기존 코드베이스 분석

> context.md §2 (auth·social/) 전체 구조는 참조로 갈음하고, 본 spec 변경 대상만 분석한다.

### 클래스·모듈 계층 구조

- `SocialProviderPort` (abstract class, NestJS DI 토큰) — `apps/backend/src/modules/auth/social/social-provider.port.ts`. 현재 `abstract verify(token: string): Promise<SocialProfile>` 단일 메서드. 구현체 3종:
  - `KakaoProvider extends SocialProviderPort` — `constructor(configService)`, `verify(token)` (app_id 대조).
  - `GoogleProvider extends SocialProviderPort` — `constructor(configService)`, `verify(token)` (aud + email_verified).
  - `NaverProvider extends SocialProviderPort` — **생성자 없음**(무의존), `verify(token)` = `/v1/nid/me` GET (client-token 방식). **미와이어**(module providers·resolver 어디에도 미등록 → 실행 경로 도달 불가).
- `SocialProviderResolver` — `constructor(kakao, google)`, `providers = {kakao, google}` 맵. naver 미등록.
- `SocialAuthService` — `constructor(resolver, repo, authService)`, `login(provider, token)`. `AUTO_LINK_PROVIDERS = new Set(['kakao','google'])`. 계정해석 3단계(a: providerId 매칭 재로그인 → b: email 자동연동(화이트리스트 한정) → c: 신규가입). P2002 race 폴백 포함.
- **신규 클래스 없음** — `NaverProvider`(기존 클래스 재작성)·기존 3서비스 시그니처 additive 확장만. base class(`SocialProviderPort`)의 abstract 메서드 시그니처가 optional 2번째 인자로 확장되나 구현체는 파라미터를 **줄여서** override 가능(TypeScript 메서드 파라미터 반공변 — `verify(token)` 은 `verify(token, ctx?)` 타입에 할당 가능). 카카오·구글 구현체 무수정으로 컴파일 통과.

### TypeScript 시그니처 확장 안전성 (ABC 구현체 정합)

| 대상 | 현재 | 015 변경 | 구현체 영향 |
|---|---|---|---|
| `SocialProviderPort.verify` | `(token: string): Promise<SocialProfile>` | `(token: string, context?: SocialVerifyContext): Promise<SocialProfile>` | Kakao·Google `verify(token)` **무수정**(파라미터 축소 override 허용). Naver 만 `verify(code, ctx)` 로 재작성 |
| `SocialAuthService.login` | `(provider, token)` | `(provider, token, state?: string)` | 호출부 controller 1곳 갱신. 내부 verify 호출은 **조건부**(아래 §F) |
| `SocialLoginDto` | `{provider, token}` | `{provider, token, state?}` (`@IsOptional @IsString`) | additive — 기존 요청 유효 |
| `SocialCredential`(Flutter) | `{provider, token}` | `{provider, token, state?}` | additive — 기존 const 생성자 유효 |

### 공유 상태·동시성 분석

- 신규 공유 가변 상태 없음. `NaverProvider.verify` 는 `access_token` 을 **지역 변수**로만 보유(멤버 필드 미승격) → 스레드/요청 간 공유 없음. `client_secret` 은 `configService.getOrThrow` 로 매 호출 조회(캐시 없음).
- `SocialAuthService` 의 P2002 race 폴백은 014 그대로 재사용. naver 를 `AUTO_LINK_PROVIDERS` 에 추가하면 race 시 자동연동/재로그인 폴백이 naver 에도 정상 적용(별도 코드 불요). `users.email @unique` + `social_accounts @@unique([provider,providerId])` 가 DB 최종 정합성 보장.
- code 교환 → 프로필 조회는 **순차 2회 아웃바운드**(병렬화 대상 아님 — 2단계가 1단계 산출 access_token 에 의존). ThreadPool/동시성 설계 §D·§E 해당 없음.

---

## 영향 범위 분석

| 파일 | 변경 유형 | 영향 내용 |
|---|---|---|
| `apps/backend/src/modules/auth/social/naver.provider.ts` | 재작성 | client-token → code-exchange. `ConfigService` 주입, `verify(code, ctx)` = 토큰 교환 POST + 프로필 GET. 기존 `NaverProfileResponse` 파싱 재사용 |
| `apps/backend/src/modules/auth/social/social-provider.port.ts` | 수정 | `verify(token, context?: SocialVerifyContext)` + `SocialVerifyContext` 타입 export |
| `apps/backend/src/modules/auth/social/social-provider.resolver.ts` | 수정 | `NaverProvider` 생성자 주입 + `providers` 맵에 `naver` 추가 |
| `apps/backend/src/modules/auth/social-auth.service.ts` | 수정 | `AUTO_LINK_PROVIDERS` 에 'naver' 추가 + `login(provider, token, state?)` + **조건부 verify 호출**(§F) |
| `apps/backend/src/modules/auth/dto/social-login.dto.ts` | 수정 | `SUPPORTED_PROVIDERS` 에 'naver' + `state?` optional 필드 |
| `apps/backend/src/modules/auth/auth.controller.ts` | 수정 | `socialLogin` 에서 `dto.state` 전달 |
| `apps/backend/src/modules/auth/auth.module.ts` | 수정 | `NaverProvider` import 복원 + providers 등록 |
| `apps/backend/.env.example` | **변경 불요** | `NAVER_CLIENT_ID`(L30)·`NAVER_CLIENT_SECRET`(L32) 이미 존재. SC-017 는 재확인만 |
| `mobile/customer_app/lib/features/auth/social_auth_service.dart` | 수정 | `signInWithNaver()` 추가 + `SocialCredential.state?` + Stub naver |
| `mobile/customer_app/lib/features/auth/login_screen.dart` | 수정 | `_SocialRow` 에 `onNaver` + 네이버 버튼(GestureDetector) |
| `mobile/customer_app/lib/core/providers.dart` | 수정 | `socialLogin(provider, token, {String? state})` optional state |
| `mobile/customer_app/pubspec.yaml` | 수정(신규 의존) | `flutter_web_auth_2`(시스템 브라우저 + 커스텀 스킴 code 획득). 파이프라인 검증은 mock 이므로 실 사용은 운영 셋업 deferred |

- **배제 판단**: `kakao.provider.ts`·`google.provider.ts`·`auth.repository.ts`·`auth.service.ts`·`prisma/schema.prisma`·마이그레이션 — **무변경**(014 재사용, NFR-004). schema 는 `social_accounts.provider` 문자열 컬럼이 'naver' 수용 → 신규 마이그레이션 0건.

---

## production 시그니처 변경 — 호출 측 테스트 식별 (§F / PROC-001)

> 본 spec 은 production 메서드 시그니처를 확장한다. §F 절차로 호출 측 테스트 회귀를 사전 식별한다.
> grep 근거: `apps/backend` `.verify(` · `service.login(` 전수.

### 변경되는 production 메서드

| 메서드 | 전 | 후 |
|---|---|---|
| `SocialProviderPort.verify` | `verify(token)` | `verify(token, context?)` (2번째 인자 optional) |
| `SocialAuthService.login` | `login(provider, token)` | `login(provider, token, state?)` (3번째 인자 optional) |
| `AUTO_LINK_PROVIDERS` (상수) | `Set(['kakao','google'])` | `Set(['kakao','google','naver'])` — **naver 정책 반전** |

### 호출 측 테스트 회귀 판정표

| 테스트 파일:라인 | 호출 | 015 후 결과 | 판정 | 처리 |
|---|---|---|---|---|
| `social-auth.service.spec.ts:249` | `expect(kakaoPort.verify).toHaveBeenCalledWith('kakao-token')` | **조건부 verify 설계 시 PASS 유지** / 무조건 `verify(token,{state})` 설계 시 FAIL(Jest 인자 길이 불일치) | **회귀 위험 (설계로 회피)** | production 을 **조건부 호출**로 설계(아래) → 014 테스트 무변경 |
| `social-auth.service.spec.ts:274` | `expect(googlePort.verify).toHaveBeenCalledWith('google-id-token')` | 〃 | **회귀 위험 (설계로 회피)** | 〃 |
| `social-auth.service.spec.ts:125~303` | `service.login('kakao'|'google', token)` (2인자) | state 3번째 인자 optional → 2인자 호출 유효, PASS | 안전 | 무변경 |
| `social-auth.service.autolink-policy.spec.ts:86` | `expect(service.login('naver','naver-token')).rejects.toThrow(ConflictException)` | **FAIL** — naver ∈ AUTO_LINK_PROVIDERS 로 자동연동 성공(ConflictException 미발생) | **회귀 (의도된 정책 반전 — FR-006/ADR-004)** | **in-scope 마이그레이션 필수**(D 레이어 태스크). naver-denial `it()` 삭제, `it.each` 에 'naver' 편입 |
| `social-auth.service.autolink-policy.spec.ts:93~118` | naver path 3c(겹치는 계정 없음 신규 생성) | PASS 유지 | 안전 | 무변경 |
| `social-auth.service.autolink-policy.spec.ts:120~146` | `it.each(['kakao','google'])` 자동연동 허용 | PASS 유지 | 안전 | 'naver' 편입만(선택) |
| `kakao.provider.spec.ts:47/60/67` | `provider.verify('...')` (단일 인자) | KakaoProvider `verify(token)` 무수정 → PASS | 안전 | 무변경 |
| `auth.service.spec.ts` (email login/register/refresh/reset, L716 social password:null 가드) | `AuthService.login({email,password})` — 별개 메서드 | 무영향 | 안전 | smoke 재실행만 |

### 조건부 verify 호출 설계 (핵심 — SC-005/SC-019 회귀 방지)

`SocialAuthService.login` 은 verify 를 **state 유무로 분기**하여 호출한다:

```ts
const profile =
  state === undefined
    ? await providerImpl.verify(token)           // kakao·google — 단일 인자(014 테스트 무변경)
    : await providerImpl.verify(token, { state }); // naver — context 전달
```

- **근거**: Jest `toHaveBeenCalledWith('kakao-token')` 은 인자 배열 길이까지 대조한다. 무조건 `verify(token, {state})`(state=undefined 포함) 로 호출하면 실제 인자 `['kakao-token', {state:undefined}]` 가 기대 `['kakao-token']` 과 길이 불일치로 **FAIL**. 조건부 호출로 kakao·google 은 정확히 단일 인자를 유지 → 014 `social-auth.service.spec.ts`(SC-005/SC-019 회귀 가드) 무변경 PASS. (PROC-001 representation/바인딩 점검 — 단언이 읽는 것은 "호출 인자 배열"이며 그 형태가 변경 영향권이므로 FAIL 가능으로 분류하여 설계로 선제 회피.)

### 마이그레이션 범위 결정 (spec 명시 확인)

- `autolink-policy.spec.ts` naver-denial 테스트 갱신은 **본 spec 범위 내**다: spec.md FR-006 이 "014 에서 네이버에 한해 도입되었던 자동연동 제한을 해제", ADR-004 가 정책 반전을 명시한다. 해당 테스트는 014 정책(naver 차단)을 인코딩한 산출물이므로 015 정책(naver 자동연동 허용)에 맞춰 갱신하는 것이 SC-006 검증과 정합한다. → `status: BLOCKED`(SCOPE_VIOLATION) 대상 아님. tasks.md D 레이어에 마이그레이션 태스크 명시(SC-006 매핑).
- 정적 AST 매칭 테스트(`_find_funcdef` 류)·sync↔async 전환 없음 → 해당 항목 무관.

---

## 외부 라이브러리·엔드포인트 실제 동작 확인 ([TO-VERIFY] 확정)

> **검증 수단 한계 명시**: 본 실행 환경은 WebFetch/web 도구 미제공으로 네이버 공식 문서 URL 을 실시간 fetch 하여 인용할 수 없다. 아래는 **확립된 공개 REST 스펙(네이버 로그인 OAuth 2.0, 다년간 안정 유지)** 및 **기존 `naver.provider.ts` 파싱 코드 근거**로 확정하되, 각 항목에 **운영 셋업(실 크레덴셜·앱 등록) 시 네이버 개발자센터 문서 최종 재확인** 을 병기한다(ASM-002). Security Agent(SC-018)·사후 운영 검증(PROC-014)이 최종 안전망.

### 네이버 토큰 교환 엔드포인트 (ADR-003 / FR-002)

| 항목 | 확정값 | 근거 | 운영 재확인 |
|---|---|---|---|
| URL·메서드 | `POST https://nid.naver.com/oauth2.0/token` | 네이버 로그인 OAuth 2.0 표준 토큰 엔드포인트(다년 안정). GET 도 허용되나 `client_secret` 노출 최소화 위해 POST + form body 채택 | 개발자센터 "네이버 로그인 > API 명세 > 접근 토큰 발급" 재확인 |
| Content-Type | `application/x-www-form-urlencoded` | 표준 OAuth token 요청. Node 20 native `fetch` + `URLSearchParams` 로 처리(신규 npm 0) | — |
| 요청 파라미터 | `grant_type=authorization_code` · `client_id` · `client_secret` · `code` · `state` | 네이버 토큰 발급 필수 파라미터 집합 | 재확인 |
| **redirect_uri 요구 여부** | **불요** — 네이버 토큰 교환은 redirect_uri 를 요구하지 않는다(authorize 단계에서 이미 검증). `SocialVerifyContext.redirectUri` 는 타입에만 예약(미전송) | 네이버 토큰 명세상 redirect_uri 파라미터 부재 | **재확인 필수** — 요구 시 context.redirectUri 전송으로 확장(설계 여지 확보됨) |
| 성공 응답 필드 | `access_token` · `refresh_token` · `token_type` · `expires_in` (JSON) | 표준 토큰 응답 | 재확인 |
| 오류 응답 필드 | `error` · `error_description` (JSON, HTTP 200 with error body 또는 4xx). code 무효·만료·재사용·client 불일치 시 error 반환 | 네이버 오류 응답 규약 | 재확인 |

### 네이버 프로필 엔드포인트 (FR-004)

| 항목 | 확정값 | 근거 |
|---|---|---|
| URL·메서드 | `GET https://openapi.naver.com/v1/nid/me`, `Authorization: Bearer <access_token>` | 기존 `naver.provider.ts` L35 동일 — 재사용 |
| 응답 필드 | `resultcode`('00' 성공) · `message` · `response.{ id, email?, name? }` | 기존 `NaverProfileResponse` 인터페이스(naver.provider.ts L4~13)·파싱 로직(L45~54) 근거. `response.id` → providerId, `response.email` → email(선택 동의 시 부재 가능), `response.name` → name |
| email 선택 동의 | `response.email` 미동의 시 부재(silent absence) 가능 | FR-007(email 없으면 거부, SC-009)이 흡수 |

### PKCE 지원 여부 (ASM-003)

- **미지원으로 확정**: 네이버 로그인 OAuth 2.0 은 authorization code + client_secret(confidential client) 흐름이며 PKCE(`code_challenge`/`code_verifier`) 파라미터를 공식 지원하지 않는다. **미지원이어도 `client_secret` 교환만으로 NFR-003 충족**(confidential client 는 PKCE 없이도 앱바인딩 보장). PKCE 는 public client(secret 미보유 모바일) 보강책이나 본 설계는 백엔드가 secret 을 보유하는 confidential 흐름이므로 불필요.
- ADR 반영: PKCE 미도입 확정 → spec Out of Scope("PKCE 추가 도입") 와 정합. 운영 재확인 시 지원이 확인되면 선택 강화 항목으로 후속 spec 검토.

### Flutter code 획득 패키지 (ADR-006 / ASM-001)

| 항목 | 확정값 | 근거 |
|---|---|---|
| 패키지 | `flutter_web_auth_2` (pub.dev, 시스템 브라우저 + 커스텀 URL 스킴 콜백 캡처 표준 패키지). `pubspec.yaml` 딥링크/외부인증 패키지 전무(현재 `url_launcher` 만 존재 — 콜백 캡처 미지원) → 신규 도입 | pubspec 확인 결과 부재 |
| API 형태 | `FlutterWebAuth2.authenticate(url: <네이버 authorize URL>, callbackUrlScheme: '<커스텀 스킴>')` → 콜백 URL 반환 → query 에서 `code`·`state` 파싱 | 패키지 표준 API |
| URL 스킴 | 커스텀 스킴 문자열(예: `doaauth`)·네이티브 설정(iOS `Info.plist` `CFBundleURLSchemes`, Android `AndroidManifest` intent-filter, 네이버 개발자센터 redirect URI 등록) | **운영 셋업 deferred(ASM-001)** — 실 스킴 값·네이티브 설정은 실 크레덴셜 발급 시 확정 |
| 취소 처리 | 사용자가 브라우저 닫음 → `flutter_web_auth_2` 가 `PlatformException`(취소) throw → `SocialAuthService.signInWithNaver` 가 이를 `SocialAuthCancelled` 로 변환(FR-011, SC-013) | 패키지 취소 동작 |
| 파이프라인 검증 | `SocialAuthService` 를 mock/stub 으로 override → 실 패키지·딥링크·네이티브 채널 **무의존**(SC-011~015). 실 패키지 사용은 운영 셋업·사후 운영 검증(PROC-014) | — |

> **import 형태(PATCH-04)**: `import 'package:flutter_web_auth_2/flutter_web_auth_2.dart';` (Dart 표준 package import — CommonJS `export =` 이슈는 Dart 무관). 신규 의존은 `flutter pub add flutter_web_auth_2` 로 추가.

---

## 인정되는 한계 및 안전망 (PATCH-A07)

| 인정되는 한계 | 안전망 |
|---|---|
| 네이버 외부 엔드포인트 상세(redirect_uri 요구 여부·오류 필드 실명)를 실시간 공식문서 fetch 로 확정 불가 (도구 한계) | (1) 확립된 공개 REST 스펙 + 기존 파싱 코드 근거로 확정, (2) `SocialVerifyContext.redirectUri` 타입 예약으로 확장 여지 확보, (3) 운영 셋업 재확인 병기, (4) Security Agent(SC-018)·사후 운영 검증(PROC-014, 신규 로그인 시나리오) 최종 확인 |
| 네이버 email 선택 동의 미반환(silent absence) | FR-007(email 미반환 시 400 거부, SC-009) — 기존 `if (!profile.email)` 분기 재사용 |
| code 재사용/redirect_uri 미검증 시 앱바인딩 우회 가능성 | (1) code-exchange confidential client 로 1차 방어, (2) state CSRF 경로(ADR-007) 설계, (3) **Security Agent(SC-018) 필수 최종 감사**(NFR-003) |
| Flutter 실 패키지·스킴·네이티브 설정 미확정 | (1) 아키텍처 ADR-006 고정, (2) 파이프라인 mock 검증, (3) 사후 운영 검증 실기기 1회 점검(PROC-014) |
| client_secret 미설정 운영 배포 | verify() 지연 조회 fail-closed — 앱 기동 무영향, 네이버 로그인 호출 시에만 오류 국한(NFR-002) |

---

## 배포 환경 영향 추정 (PATCH-A10)

- 인용 API 동작(네이버 아웃바운드 2건 순차 호출: `nid.naver.com/oauth2.0/token` → `openapi.naver.com/v1/nid/me`)은 **인바운드 재연결 특이성과 무관**한 순수 아웃바운드 HTTPS. 점검 대상 환경 특이성(NAT/docker-proxy TCP 흡수·L4 LB half-close·conntrack idle·kernel keepalive) **해당 없음**(단발 요청-응답, 장기 연결 유지 없음).
- Fly.io 아웃바운드 트래픽 제한 없음(plan.md 배포 환경 영향 절 확인). critical 배포 환경 특이성 없음 → Deploy Agent 비활성(selection-phases.md) 타당.
- infra.md cross-reference: §5(연결 실패 재시도)·§8(제약) 에 카카오·구글 아웃바운드는 등재되나 **네이버 2개 엔드포인트 미등재** → **GAP-015-01**(이미 등록됨, Docs/Retrospective 위임). 본 spec 신규 GAP 없음.
- `docker build` 요구 SC 없음(SC-016 e2e-docker 는 deferred). Prisma generate/COPY 경로 정합성 점검(PROC-003) 해당 없음 — 스키마·Dockerfile 무변경.

---

## context.md 부정합 사전 점검 (PATCH-A11)

변경 대상 심볼의 context.md §2·§4 기존 정의를 grep 추출·평가:

| 항목 | 현재 정의(context.md) | 015 변경 후 | 부정합 |
|---|---|---|---|
| §2 auth(L75) | "소셜 로그인(POST /auth/social-login — **카카오·구글**, 계정해석 3단계)" | 카카오·구글·**네이버** 3종 | **갱신 필요** |
| §2 social/(L107) | "`SocialProviderResolver` 가 provider 문자열→구현체 매핑(**카카오·구글 활성**). `NaverProvider` 는 파일 보존·미와이어(SEC-001)" | 카카오·구글·네이버 활성. NaverProvider code-exchange 와이어 | **갱신 필요** |
| §4 데이터모델(L198) | "활성 provider **카카오·구글**(네이버 제외 — SEC-001)" | 활성 provider 카카오·구글·네이버(code-exchange 앱바인딩) | **갱신 필요** |
| §6 SEC-002 orphan(L243) | path 3c runInTransaction 미원자화(naver 재도입으로 표면 확대 가능) | naver 신규가입도 동일 경로 사용 → 부채 영향 범위 확대(코드 무변경) | 주의(신규 GAP 아님, 기존 부채) |

> 위 3개 갱신 항목은 6단계 Docs Agent 가 context.md 갱신 대상으로 처리(GAP-015-01 과 별개의 context 갱신 — 본 절이 가시화). PATCH-A11(사전 점검)·PATCH-A10(Docs 사후 검토) 2중 절차로 누락 방지.

---

## 014 인프라 재사용 경계

> QualityGate "014 재사용 경계 명시" 항목. **무변경 재사용** vs **변경** 을 명확히 분리한다.

### 무변경 재사용 (NFR-004 — 회귀 0 대상)

| 자산 | 파일 | 재사용 근거 |
|---|---|---|
| `KakaoProvider`·`GoogleProvider` 검증 로직 | `social/kakao.provider.ts`·`google.provider.ts` | app_id/aud 대조 그대로. verify 시그니처 축소 override 로 무수정 컴파일 |
| `SocialAuthService` 계정해석 3단계·P2002 race 폴백 구조 | `social-auth.service.ts` | 분기 구조·방어코드 무변경. AUTO_LINK 집합값·verify 호출 형태만 변경 |
| `AuthRepository`(createSocialAccount·findByProviderAndProviderId·createUser·findUserByEmail) | `auth.repository.ts` | 무변경 — naver 도 동일 CRUD 사용 |
| `AuthService.issueTokensForUser` | `auth.service.ts` | 무변경 — JWT 발급 공유 |
| `social_accounts` 스키마·마이그레이션 | `prisma/schema.prisma`·`20260701064209_add_social_accounts` | provider 문자열 컬럼 'naver' 수용 — 신규 마이그레이션 0 |
| Flutter `TokenStore`·`AuthController.socialLogin` 저장 흐름 | `token_store.dart`·`providers.dart` | state 파라미터 추가 외 저장 로직 무변경 |
| `SocialAuthCancelled`·`_socialLogin` 화면 핸들러 | `social_auth_service.dart`·`login_screen.dart` | 취소·오류 정책 재사용(naver 는 콜백만 추가) |
| ConflictException 분기(화이트리스트 밖 provider 방어) | `social-auth.service.ts` L70~75, L126~132 | **잔존**(ADR-004) — naver 는 이제 화이트리스트 内이므로 이 분기 미진입. 향후 미검증 provider 방어용 |

### 변경 (naver 재편입 한정 — P-007 범위)

`naver.provider.ts`(재작성)·`social-provider.port.ts`·`social-provider.resolver.ts`·`social-auth.service.ts`(AUTO_LINK+verify호출)·`social-login.dto.ts`·`auth.controller.ts`·`auth.module.ts` + Flutter 3파일 + `pubspec.yaml`. **카카오·구글 검증 로직·계정해석 흐름 구조 무변경.**

---

## 기술 선택 조사

> plan.md ADR-001~007 과 cross-reference. Design 확정 사항만 기술.

- **code-exchange vs 3-provider 통일**(ADR-001): naver 만 code-exchange. 카카오·구글은 014 재감사로 SEC-001 해소 완료 → 재작업 근거 없음(범위·회귀 위험). 채택.
- **Port 시그니처 optional context**(ADR-002): `verify(token, context?)`. 대안(token 문자열 인코딩·naver 전용 인터페이스) 대비 다형성 유지 + 회귀 최소. 채택. **조건부 호출**(§F)로 회귀 방지.
- **Node native fetch**(ADR-003): passport-naver(리다이렉트 서버렌더 전제 불일치)·공식 SDK(신규 의존) 대비 신규 npm 0. `URLSearchParams` form body. 채택.
- **flutter_web_auth_2**(ADR-006): 인앱 WebView 금지(OAuth 모범사례·제공자 웹뷰 차단 추세). 시스템 브라우저 + 커스텀 스킴 콜백 캡처 표준 패키지. 채택.
- **state CSRF 경로**(ADR-007): Flutter 생성 → SocialCredential → DTO → verify context → 네이버 토큰 요청. 백엔드 자체 생성·세션 저장(무상태 서버에 세션 스토어 부담) 대비 단순. 채택. CSRF 완결성은 Security(SC-018) 감사.

---

## 엣지 케이스 및 한계

- **access_token 비노출**(SC-004): `SocialProfile` 반환 타입에 access_token 필드 부재 → 타입 수준 누출 차단. verify 지역 변수로만 보유. 로그에 code·access_token·client_secret 원문 금지(마스킹, Development 방어).
- **client_secret 비노출**(SC-017): 교환 요청 바디에만 사용. 교환 실패 시 네이버 `error_description` 만 로깅(secret 미포함).
- **email null**: `SocialProfile.email: string | null` → FR-007 분기 타입 강제.
- **naver path 3c orphan(SEC-002/GAP-014-01)**: naver 신규가입도 createUser+createSocialAccount 비원자(root fallback). 기존 부채 영향 범위 확대(코드 무변경). P2002 폴백·DB unique 안전망. 사후/Security 위임(신규 GAP 아님).
- **동시성**: naver ∈ AUTO_LINK → race 시 자동연동/재로그인 폴백 정상. 별도 코드 불요.
