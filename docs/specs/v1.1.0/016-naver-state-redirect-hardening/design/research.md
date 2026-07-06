---
작성: Design Agent
버전: v1.0
최종 수정: 2026-07-03 15:24
상태: 확정
---

# Research: 016-naver-state-redirect-hardening

## 목차

- [분석 범위](#분석-범위)
- [기존 코드베이스 분석](#기존-코드베이스-분석)
  - [클래스·모듈 계층 구조](#클래스모듈-계층-구조)
  - [영향 범위 분석 (변경 파일 전수)](#영향-범위-분석-변경-파일-전수)
  - [공유 상태·동시성 분석](#공유-상태동시성-분석)
- [§F production 시그니처·의존 변경 — 호출 측 테스트 마이그레이션](#f-production-시그니처의존-변경--호출-측-테스트-마이그레이션)
- [외부 라이브러리·엔드포인트 실제 동작 확인](#외부-라이브러리엔드포인트-실제-동작-확인)
- [배포 환경 영향 추정](#배포-환경-영향-추정)
- [context.md 부정합 사전 점검](#contextmd-부정합-사전-점검)
- [기술 선택 조사](#기술-선택-조사)
- [엣지 케이스 및 한계](#엣지-케이스-및-한계)

---

## 분석 범위

plan.md "핵심 설계 > 변경 모듈" 표에 명시된 파일에 한정하여 분석한다(분석 우선순위 게이트).
대상: `apps/backend/src/modules/auth/` 하위 auth·social 모듈 + `prisma/schema.prisma` + `.env.example`.
외부 라이브러리 신규 도입 0건(SC-012) — §외부 라이브러리 검증은 기존 `node:crypto`·`@nestjs/config`·Prisma
의 **기존 미사용 메서드 신규 사용**(`configService.get`, `prisma.oAuthState.deleteMany`)만 한정 검증한다.
전체 구조는 context.md §2/§4 참조(중복 기술 생략).

---

## 기존 코드베이스 분석

### 클래스·모듈 계층 구조

| 심볼 | 위치 | 종류 | 본 spec 관계 |
|---|---|---|---|
| `SocialProviderPort` | `social/social-provider.port.ts` | abstract class (DI 토큰) | **무변경** — `verify(token, context?)` 시그니처 유지 |
| `SocialVerifyContext` | 동상 (interface) | `{ state?, redirectUri? }` | **무변경** — `redirectUri` 예약 필드 미사용 유지(ADR-006) |
| `NaverProvider extends SocialProviderPort` | `social/naver.provider.ts` | concrete | **수정** — `verify` 내부에 `configService.get('NAVER_REDIRECT_URI')` 조건부 파라미터 additive |
| `KakaoProvider` / `GoogleProvider extends SocialProviderPort` | `social/*.provider.ts` | concrete | **무변경** — `getOrThrow` 만 사용, redirect_uri·state 무관 |
| `SocialProviderResolver` | `social/social-provider.resolver.ts` | concrete | **무변경** — provider 문자열→구현체 매핑(naver 이미 등록) |
| `SocialAuthService` | `social-auth.service.ts` | concrete (`@Injectable`) | **수정** — 생성자에 `OAuthStateService` 주입 + `login` 진입부 naver state 검증 분기 |
| `OAuthStateService` | `social/oauth-state.service.ts` | **신규** concrete | issue/consume — 난수 발급·TTL·소비 위임 |
| `AuthRepository` | `auth.repository.ts` | concrete | **수정** — oauth_states CRUD 3메서드 additive |
| `AuthController` | `auth.controller.ts` | concrete | **수정** — `@Post('naver/state')` 핸들러 additive |
| `AuthModule` | `auth.module.ts` | module | **수정** — `OAuthStateService` provider 등록 |
| `PrismaService` | `shared/prisma/prisma.service.ts` | concrete | **무변경** — `tx` getter(ALS tx-aware)·root client 재사용 |

- 상속 트리: `SocialProviderPort`(abstract)는 `extends` 로 3구현체(Kakao/Google/Naver)가 상속.
  `implements` 사용처는 없음 — Dart 류 `implements` 강제 재구현 이슈(PATCH-015-04) **비해당**(본 변경은
  abstract class 시그니처 자체를 건드리지 않으므로 구현체 컴파일 무영향).
- `OAuthStateService` 는 어떤 base class 도 상속하지 않는 신규 독립 `@Injectable` — 공유 가능 base 멤버 불요.

### 영향 범위 분석 (변경 파일 전수)

| 파일 | 변경 유형 | 영향 내용 | 레이어 |
|---|---|---|---|
| `prisma/schema.prisma` | 수정 | `model OAuthState`(users 스키마) 추가 | A |
| `prisma/migrations/{ts}_add_oauth_states/migration.sql` | 신규 | `oauth_states` 테이블 CREATE + `@@index([expiresAt])` | A (DB Design 위임) |
| `social/oauth-state.service.ts` | 신규 | `issue`/`consume` | B |
| `auth.repository.ts` | 수정 | `createOAuthState`·`consumeOAuthState`·`deleteExpiredOAuthStates` | B |
| `social-auth.service.ts` | 수정 | 생성자 `OAuthStateService` 주입 + naver state 검증 분기 | B |
| `social/naver.provider.ts` | 수정 | `verify` redirect_uri 조건부 | B |
| `auth.constants.ts` | 수정 | `NAVER_STATE_TTL_MIN = 10` | B |
| `auth.controller.ts` | 수정 | `POST /auth/naver/state` 핸들러 | C |
| `auth.module.ts` | 수정 | `OAuthStateService` provider 등록 | C |
| `dto/auth-response.dto.ts` | 수정(선택) | `NaverStateResponse { state }` Swagger 타입 | C |
| `.env.example` | 수정 | `NAVER_REDIRECT_URI=` 항목(라인 33 뒤 additive) | C |
| `social-auth.service.naver.spec.ts` | 수정 | OAuthStateService mock + state 마이그레이션 (§F) | D |
| `social-auth.service.autolink-policy.spec.ts` | 수정 | 동상 (§F) | D |
| `social-auth.service.naver-autolink-exclusion.spec.ts` | 수정 | 동상 (§F) | D |
| `social-auth.service.spec.ts` (014) | 수정(조건부) | 생성자 변경 시 OAuthStateService mock 추가 (§F) | D |
| `social/naver.provider.spec.ts` | 수정 | `buildConfigService` 에 `get` mock 추가 + SC-007/008 신규 (§F) | D |
| `social/oauth-state.service.spec.ts` | 신규 | SC-001/002/005/010 | D |
| `social-auth.service.naver-state.spec.ts` | 신규 | SC-003/004/005/006 (state 검증 배선) | D |

> **배제 판단**: `google.provider.ts`·`kakao.provider.ts` 는 코드 확인 결과 `configService.getOrThrow` 만
> 사용하고 state·redirect_uri·OAuthStateService 어디에도 의존하지 않으므로 처리 대상에서 배제한다(무회귀).
> `google.provider.spec.ts`·`kakao.provider.spec.ts`·`social-provider.resolver.spec.ts`(존재 시)는
> 시그니처 무변경으로 마이그레이션 불요(SC-011 회귀 대상, 실행만 확인).

### 공유 상태·동시성 분석

plan.md §6 검토를 코드 수준으로 확인한다.

- **공유 자원**: `oauth_states` 테이블 행. **Node 프로세스 인메모리 공유 자료구조 없음**(ADR-001 로 DB 채택).
  `OAuthStateService`·`AuthRepository` 는 stateless(`@Injectable` singleton 이나 인스턴스 필드에 가변
  상태 미보유) — 유일 SoT 는 PostgreSQL.
- **Check-Then-Act (FR-005 1회성 replay)**: "유효 확인 → 소비"가 비원자면 동일 state 동시 2제출 시 양쪽
  통과 위험. **완화: `consumeOAuthState` 를 단일 `deleteMany({ where:{ state, provider, expiresAt:{gt:now} } })`
  로 원자화**. PostgreSQL 이 DELETE 대상 행에 row-level lock 을 잡아 동시 2요청 중 정확히 1건만 `count===1`,
  나머지 `count===0`. 앱 레이어 lock 불요.
- **tx-aware 접근 주의 (PROC-013-01)**: `AuthRepository` 는 tx-aware 메서드에서 `this.prisma.tx.X`(ALS
  경유)를 쓰고, 비트랜잭션 메서드에서 root `this.prisma.X` 를 쓴다(예: `revokeRefreshToken` 은 root,
  `createUser` 는 `tx`). `consumeOAuthState`·`createOAuthState`·`deleteExpiredOAuthStates` 는 **모두
  `runInTransaction` 콜백 밖에서 호출**(state 검증은 verify 이전 단발 쿼리)되므로 **root client
  `this.prisma.oAuthState.*` 사용**(`this.prisma.tx.oAuthState` 아님). tx-aware 로 잘못 배선하면 ALS
  미활성 시 root 로 폴백되어 우연히 동작하나, 의도를 명확히 root 로 고정한다. tx 콜백 밖 단발 쿼리이므로
  단위 mock 만으로 충분(e2e 필수 대상 아님).
- **Lock 범위 최소화**: 소비는 단일 statement — 내부 네트워크/파일 I/O 없음. 네이버 아웃바운드(`verify`)는
  소비 성공 **이후** 별도 수행(lock 구간 밖).
- **테이블 바운딩**: 발급 시 opportunistic `deleteExpiredOAuthStates(now)` 로 만료 행 정리(무한 증식 방지).

---

## §F production 시그니처·의존 변경 — 호출 측 테스트 마이그레이션

> [MUST] production 의존/시그니처 변경이 포함되어 §F 를 수행한다. **본 spec 의 최대 회귀 리스크**이며,
> tasks.md D 레이어에 마이그레이션 태스크로 흡수했다(공백 GAP 아님).

### 변경되는 production 심볼

| 심볼 | 전 | 후 | 성격 |
|---|---|---|---|
| `SocialAuthService` 생성자 | `(resolver, repo, authService)` | `(resolver, repo, authService, oauthStateService)` | **의존 추가** |
| `SocialAuthService.login` naver 경로 | state pass-through(미검증) | naver 인 경우 `consume` false → 401(verify 이전) | 런타임 동작 변경 |
| `NaverProvider.verify` | `configService.getOrThrow` 2회만 | + `configService.get('NAVER_REDIRECT_URI')` 신규 호출 | **의존 메서드 추가** |

### 호출 측(테스트) 전수 목록 및 마이그레이션 판정

`grep -rn "new SocialAuthService\|providers: \[\s*SocialAuthService\|buildConfigService\|new NaverProvider" tests`
및 각 spec 파일 직접 확인 결과:

1. **SocialAuthService 생성자 변경 → DI 해석 실패 위험 (필수 마이그레이션)**
   - 대상: `social-auth.service.naver.spec.ts`, `social-auth.service.autolink-policy.spec.ts`,
     `social-auth.service.naver-autolink-exclusion.spec.ts`, `social-auth.service.spec.ts`(014).
   - 4파일 모두 `Test.createTestingModule({ providers: [SocialAuthService, {provide: SocialProviderResolver...},
     {provide: AuthRepository...}, {provide: AuthService...}] })` 로 구성. `OAuthStateService` 를 provider
     목록에 추가하지 않으면 Nest DI 가 `OAuthStateService` 를 해석하지 못해 **모듈 컴파일 실패**(전 테스트 FAIL).
   - 조치: 각 파일에 `{ provide: OAuthStateService, useValue: { consume: jest.fn(), issue: jest.fn() } }` 추가.

2. **naver 로그인 런타임 동작 변경 → naver 회귀 테스트 단언 붕괴 (필수 마이그레이션)**
   - 대상: 위 naver 관련 3파일의 `service.login('naver', ...)` 케이스. 특히
     `autolink-policy.spec.ts:93` `service.login('naver', 'naver-token')`(state 미전달) 은 신규 로직에서
     `consume('naver', undefined)` → false → **`UnauthorizedException` 이 먼저** 던져져 기존
     `rejects.toThrow(ConflictException)` 단언이 깨진다.
   - 조치: naver 케이스에 (a) `mockOAuthStateService.consume.mockResolvedValue(true)` 설정, (b) `login` 4번째
     인자로 유효 state 값 전달(`service.login('naver', 'token', 'valid-state')`). kakao/google 케이스는
     naver 분기 미진입(FR-006)이므로 **무변경**(SC-011 무회귀 확인 대상).

3. **`NaverProvider.verify` 의 `configService.get` 신규 호출 → mock 미구현 TypeError (필수 마이그레이션)**
   - 대상: `social/naver.provider.spec.ts`. 현재 `buildConfigService` 는 `{ getOrThrow: jest.fn(...) }` 만
     반환하고 `get` 메서드가 **없다**. production 이 `configService.get('NAVER_REDIRECT_URI')` 를 호출하면
     `configService.get is not a function` TypeError 로 기존 SC-002/003/004 가 회귀 FAIL 한다.
   - 조치: `buildConfigService` 에 `get: jest.fn((key) => values[key])` 추가(미설정 키는 `undefined` 반환).
     신규 SC-007(설정) / SC-008(미설정)은 `buildConfigService({ NAVER_REDIRECT_URI: '...' })` overrides 로 분기.

### 본 spec 범위 포함 여부

- 위 3건은 모두 **본 spec 범위 내**다 — spec.md SC-011(NFR-003 회귀 0)·smoke_tests(plan.md, 015 naver·
  카카오·구글 스위트)가 명시적으로 "구현 후 회귀 없이 PASS"를 요구한다. 별도 spec 분리 불요.
- 동적 호출(getattr 류) 없음 — 전부 정적 DI/명시 mock. CI 전체 suite 실행이 사후 안전망.

---

## 외부 라이브러리·엔드포인트 실제 동작 확인

> 신규 npm 의존 0건(SC-012). 아래는 **기존 라이브러리의 신규 사용 메서드**만 한정 검증(게이트 §4).

| 항목 | 실제 동작 확인 | 가정 vs 실제 |
|---|---|---|
| `node:crypto` `randomBytes(32).toString('base64url')` | Node 20 표준 CSPRNG. 32바이트 → base64url 43자(padding 없음). 서버사이드 native — typescript.md Secure Context 제약(`globalThis.crypto`/`crypto.subtle`) **무관**. | 가정=예측불가 난수 → 실제 일치. `import { randomBytes } from 'node:crypto'` (named import — CJS interop 이슈 없음). |
| `configService.get<string>('KEY')` (신규 사용) | `@nestjs/config` public API — 키 부재 시 `undefined` 반환(`getOrThrow` 는 throw). 기존 코드는 `getOrThrow` 만 사용했으나 `get` 은 optional env 조회용 표준 메서드. | 가정=미설정 시 undefined → 실제 일치(FR-008 fail-safe). |
| Prisma `oAuthState.deleteMany({where}).count` (신규 모델) | Prisma delegate `deleteMany` 는 `{ count: number }` 반환 — 조건 매칭 행 수. `WHERE` 조건부 DELETE 는 PostgreSQL row-level lock 으로 원자적. 기존 `updateMany`(revokeRefreshToken)와 동일 계약. | 가정=count===1 성공 → 실제 일치. |
| 네이버 토큰 교환 `redirect_uri` 요구 여부 | 015 SEC-015-03 `[TO-VERIFY]` 승계 — 공식 문서 확인은 운영 셋업 deferred. **미설정=미포함이 안전 기본값**(fail-safe). | `[TO-VERIFY: naver 토큰 교환 redirect_uri 요구 여부 — 운영 셋업 공식문서 확인]` |

> **public API 우선(PATCH-A14)**: `configService.get`·`randomBytes`·Prisma delegate 는 전부 공식 public
> API. private/underscore API 사용 0건 → PROC-013 비정상 lifecycle 시나리오 검증 대상 아님.

### 인정되는 한계 및 안전망 (PATCH-A07)

- state 검증은 **백엔드 자체 DB 대조**이므로 네이버 엔드포인트 동작에 의존하지 않는다(silent failure 여지 없음).
- 유일한 외부 미확정은 redirect_uri 요구 여부이나 **미설정=미포함이 검증된 안전 기본값**(fail-safe, fail-closed
  아님)이라 미확정 상태에서 회귀·오동작 0. 잔여 확인은 6단계 Security 재감사(SC-015) + 사후 운영 검증(PROC-014).

## 배포 환경 영향 추정

- 신규 아웃바운드 호출 없음 — state 발급·검증은 **내부 PostgreSQL 쿼리만**. 네이버 아웃바운드 2건은 015 에서
  infra.md §8 등재(PATCH-CXT-015-02).
- **Fly.io scale-to-zero·rolling deploy 특이성**: in-memory state 는 (1) 콜드 스타트 유실, (2) 발급/콜백
  인스턴스 불일치 false rejection 위험. **ADR-001 PostgreSQL 테이블 채택으로 두 위험 구조적 제거** — 발급/콜백
  왕복 사이 인스턴스 전환·재시작 무관하게 검증 성립. infra.md §8 등재 배포 특이성과 cross-reference 완료 — 신규
  GAP 불요.
- `NAVER_REDIRECT_URI` 는 `.env.example` 문서화(NFR-005) + 운영 `fly secrets` 주입(기존 `NAVER_CLIENT_*`
  동일 패턴). 신규 컨테이너·컴포넌트 없음 → **Deploy Agent 비활성**(selection-phases.md 정합).

## context.md 부정합 사전 점검 (PATCH-A11)

변경 대상 심볼을 context.md §2/§4/§6 에서 grep 대조:

| context.md 항목 | 현재 정의 | 본 spec 변경 후 | 부정합 |
|---|---|---|---|
| §2 auth 모듈(라인 75) | "소셜 로그인 POST /auth/social-login 3종" | + `POST /auth/naver/state`(신규 익명 엔드포인트) 추가 | **갱신 필요** — 6단계 Docs 위임 |
| §4 데이터 모델(라인 193/198) | "32개 테이블·마이그레이션 15차" | + `oauth_states`(users 스키마) → **33테이블·16차** | **갱신 필요** — 6단계 Docs 위임 |
| §6 제약(라인 246) SEC-015-02 | "네이버 state 서버측 미검증(Medium)" | 본 spec 으로 RESOLVED(서버 발급·1회성 검증) | **갱신 필요** — Security 재감사(SC-014) 후 Docs 반영 |
| §6 제약(라인 247) SEC-015-03 | "redirect_uri 요구 여부 미확정(Low)" | fail-safe 조건부 지원 완비, 요구 확인만 운영 잔존 | **갱신 필요(잔존-권고 전환)** — SC-015 후 Docs 반영 |

> 위 4항목은 [MUST NOT] context.md 직접 갱신 규칙에 따라 **gaps.md 기록 없이 본 절에 가시화**하여 6단계 Docs
> Agent 가 반영하도록 위임한다(문서-갱신-필요 유형은 Docs 단계 책임 — 신규 GAP 등록 대신 research 가시화로 충분).

## 기술 선택 조사

plan.md ADR-001~007 을 코드 근거로 cross-reference. 전 ADR 이 실제 코드와 정합하며 재검토 결과 대안 재선택
불요:

- **ADR-001 PostgreSQL 테이블**: `social_accounts`(20260701064209) 와 동일한 `users` 스키마·cuid PK·
  `@@schema("users")` 패턴 재사용 가능 확인. in-memory 대안은 Fly 배포 특이성으로 미채택(위 §배포 환경).
- **ADR-002 randomBytes**: `globalThis.crypto` 회피 근거(typescript.md Secure Context) 유효 — 서버 native
  `node:crypto` 채택.
- **ADR-003 delete-on-consume**: `revokeRefreshToken` 의 `updateMany` 패턴과 대비. CSRF nonce 는 감사 불요
  → mark 대신 delete 가 sweep 부담 없음. row-lock 원자성으로 replay 방어.
- **ADR-005 검증 배선 위치**: `SocialAuthService.login` 의 현재 `state === undefined ? verify(token) :
  verify(token, {state})` 분기 **직전**에 naver state 검증 삽입 — provider 책임 분리 유지, 무효 state 가
  네이버 아웃바운드 도달 전 차단(SEC-004 부분 완화).
- **ADR-006 redirect_uri 위치**: `NaverProvider.verify` 가 `client_id`/`client_secret` 을 직접 조회하는
  기존 패턴과 일관 — redirect_uri 도 provider 내부 조회(SocialVerifyContext 경유 안 함, 예약 필드 미사용 유지).
- **ADR-007 TTL 상수**: `auth.constants.ts` 의 `OTP_TTL_MIN = 10` 과 동일 파일·동일 단위 패턴 → `NAVER_STATE_TTL_MIN = 10` additive.

## 엣지 케이스 및 한계

| 케이스 | 처리 |
|---|---|
| state `undefined`/빈 문자열(미제공) | `consume('naver', undefined)` → repo `consumeOAuthState` count===0 → false → 401(FR-004 "미제공"). 명시적 early-return 권장(빈 값이면 DB 조회 전 false 반환하여 불필요 쿼리 절감). |
| 만료 state | 소비 조건 `expiresAt > now` 에서 자동 배제 → count===0 → false → 401(FR-004 "만료"). |
| 재사용(이미 소비) | 행 부재 → count===0 → false → 401(FR-005). delete-on-consume 이므로 별도 소비 플래그 불요. |
| kakao/google + state 값 포함 | naver 분기 미진입(`provider==='naver'` 조건) → state 값 무시, 기존 흐름(FR-006, SC-006). |
| redirect_uri 미설정 | `configService.get` → undefined → body 에 미포함(015 동작 동일, FR-008/SC-008). |
| state 발급 flood(익명 DoS) | 짧은 TTL(10분) + 발급 시 opportunistic 만료 정리로 테이블 바운딩. IP rate limit 은 SEC-004 후속(범위 외). |
| naver 회귀 테스트의 state 미전달 | §F 마이그레이션으로 흡수(consume mock true + state 인자). |

### 소셜/외부 IdP AUTO_LINK 편입 대조표 (PATCH-015-01)

본 spec 은 `AUTO_LINK_PROVIDERS` 를 **변경하지 않는다**(plan.md 명시). naver 는 015 v1.1 재감사에서
자동연동 제외 확정(SEC-015-01) 상태 유지. 참고 대조표(무변경 확인용):

| provider | 앱바인딩 검증수단 | 이메일 소유권 검증수단 | 자동연동(AUTO_LINK) |
|---|---|---|---|
| kakao | access_token_info app_id 대조 | (앱바인딩 기반, 유지) | 허용(무변경) |
| google | tokeninfo aud 대조 | `email_verified` 필드 | 허용(무변경) |
| naver | code-exchange client_secret | **없음**(오픈API 미제공) | **제외 유지**(SEC-015-01) |

> 본 spec 의 state/CSRF 하드닝은 자동연동 정책과 직교(orthogonal) — (a) 호출자 신원 CSRF 방어 축만 강화.
> AUTO_LINK 편입 변경이 없으므로 PATCH-015-01 대조표는 "무변경 확인" 목적으로만 기재한다.
