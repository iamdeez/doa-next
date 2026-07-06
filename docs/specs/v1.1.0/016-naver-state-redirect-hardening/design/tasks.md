---
작성: Design Agent
버전: v1.0
최종 수정: 2026-07-03 15:25
상태: 확정
---

# Tasks: 016-naver-state-redirect-hardening

> Branch: 016-naver-state-redirect-hardening | Date: 2026-07-03 | Plan: [../planning/plan.md](../planning/plan.md)

## 목차

- [전제 조건](#전제-조건)
- [태스크 목록](#태스크-목록)
- [Test Authoring Contract](#test-authoring-contract)
- [태스크 입도 가이드](#태스크-입도-가이드)
- [구현 완료 기준](#구현-완료-기준)

---

## 전제 조건

- [x] spec.md 의 모든 [NEEDS CLARIFICATION] 항목이 해소되었는가? — 0건(spec.md 미결 사항 절)
- [x] plan.md 의 Constitution Gates 가 모두 통과(또는 예외 기재) 되었는가? — P-001~007 전량 PASS, 예외 없음
- [x] CHANGES.md 에서 이전 작업의 "후속 작업 시 주의사항" 을 확인했는가? — 015 naver 흐름 런타임 동작 변경(state 필수화) 확인, §F 반영

---

## 태스크 목록

> [P] 표시: 이전 태스크와 병렬 실행 가능. 기본 의존: A → B → C → D.
>
> | 레이어 | 대상 | 담당 단계 |
> |---|---|---|
> | A. 데이터 | `oauth_states` Prisma 모델·마이그레이션 | 4단계 Development (+ DB Design Agent 마이그레이션 SQL 검증) |
> | B. 도메인 | OAuthStateService·AuthRepository·SocialAuthService·NaverProvider·상수 | 4단계 Development |
> | C. 인터페이스 | AuthController 엔드포인트·모듈 등록·DTO·.env.example | 4단계 Development |
> | D. 테스트 | 신규 spec + 015 스위트 §F 마이그레이션 | 5a Test AUTHORING |
>
> 4단계 Development = A·B·C. 5a Test AUTHORING = D. 양 Agent 는 PPG-1 로 동일 turn 동시 spawn.

### Step 1. 데이터 계층 (A)

- [x] **T001** — OAuthState Prisma 모델 + 마이그레이션
  - 레이어: A
  - 구현 파일: `apps/backend/prisma/schema.prisma`, `apps/backend/prisma/migrations/{ts}_add_oauth_states/migration.sql`
  - 관련 요구사항: FR-002, FR-005, NFR-004
  - 상세: plan.md [데이터 모델] 의 `model OAuthState`(id cuid PK·`state @unique`·provider·expiresAt·createdAt·`@@index([expiresAt])`·`@@map("oauth_states")`·`@@schema("users")`) 를 `social_accounts`(20260701064209) 패턴대로 추가. `pnpm prisma migrate dev --name add_oauth_states` 로 마이그레이션 생성 후 `prisma generate` 로 `oAuthState` delegate 노출.
  - **DB Design Agent 연계**: 마이그레이션 SQL·인덱스(`@@index([expiresAt])`)·스키마 배치(users, P-001)는 3단계 후 DB Design Agent 가 검증. Development 는 DB Design 산출 마이그레이션을 반영/정합 확인.
  - 완료 기준: `oauth_states` 테이블이 users 스키마에 생성되고 Prisma client 에 `oAuthState` delegate 가 노출된다. 기존 32테이블 무변경.

### Step 2. 도메인 계층 (B)

- [x] **T002** `[P]` — state TTL 상수 추가
  - 레이어: B
  - 구현 파일: `apps/backend/src/modules/auth/auth.constants.ts`
  - 관련 요구사항: FR-002
  - 상세: `export const NAVER_STATE_TTL_MIN = 10;`(분) additive. 기존 OTP 상수 아래 배치(ADR-007).
  - 완료 기준: 상수 export 되고 매직 넘버 하드코딩 0.

- [x] **T003** — AuthRepository oauth_states CRUD 메서드
  - 레이어: B
  - 구현 파일: `apps/backend/src/modules/auth/auth.repository.ts`
  - 관련 요구사항: FR-001, FR-002, FR-005
  - 상세: 3메서드 additive(전부 **root client `this.prisma.oAuthState.*`** — tx 콜백 밖 단발 쿼리, PROC-013-01):
    - `createOAuthState(data: { state: string; provider: string; expiresAt: Date }): Promise<void>` → `this.prisma.oAuthState.create({ data })`
    - `consumeOAuthState(provider: string, state: string, now: Date): Promise<number>` → `(await this.prisma.oAuthState.deleteMany({ where: { state, provider, expiresAt: { gt: now } } })).count`
    - `deleteExpiredOAuthStates(now: Date): Promise<number>` → `(await this.prisma.oAuthState.deleteMany({ where: { expiresAt: { lte: now } } })).count`
  - 완료 기준: 3메서드가 users 스키마 oauth_states 만 접근(P-001). `this.prisma.tx.oAuthState` 미사용.

- [x] **T004** — OAuthStateService 신규
  - 레이어: B
  - 구현 파일: `apps/backend/src/modules/auth/social/oauth-state.service.ts` (신규)
  - 관련 요구사항: FR-001, FR-002, FR-005, NFR-002
  - 상세: `@Injectable()` `OAuthStateService`. 생성자 `(private readonly repo: AuthRepository)`.
    - `async issue(provider: string): Promise<{ state: string }>` — `state = randomBytes(32).toString('base64url')`(`import { randomBytes } from 'node:crypto'`); `expiresAt = new Date(Date.now() + NAVER_STATE_TTL_MIN * 60_000)`; opportunistic `await repo.deleteExpiredOAuthStates(new Date())`; `await repo.createOAuthState({ state, provider, expiresAt })`; return `{ state }`.
    - `async consume(provider: string, state?: string): Promise<boolean>` — `if (!state) return false;`(early-return, 불필요 쿼리 절감); `return (await repo.consumeOAuthState(provider, state, new Date())) === 1;`
  - 완료 기준: 난수 발급·TTL·소비 위임 동작. `globalThis.crypto`/`crypto.subtle` 미사용(Secure Context 회피).

- [x] **T005** — SocialAuthService naver state 검증 배선
  - 레이어: B
  - 구현 파일: `apps/backend/src/modules/auth/social-auth.service.ts`
  - 관련 요구사항: FR-003, FR-004, FR-005, FR-006
  - 상세: (a) 생성자에 `private readonly oauthStateService: OAuthStateService` **4번째 파라미터 추가**. (b) `login()` 진입부 `resolver.resolve` 직후·`verify` 호출 **이전** 에 naver 한정 분기 추가:
    ```
    if (provider === 'naver') {
      const ok = await this.oauthStateService.consume('naver', state);
      if (!ok) throw new UnauthorizedException('Invalid or expired state');
    }
    ```
    기존 `state === undefined ? verify(token) : verify(token, {state})` 분기·계정해석 3단계·`AUTO_LINK_PROVIDERS` 무변경. `UnauthorizedException` import 추가.
  - 완료 기준: naver 무효 state → 401(verify 미호출). kakao/google 분기 미진입(FR-006). 기존 계정해석 로직 무변경.

- [x] **T006** `[P]` — NaverProvider redirect_uri 조건부
  - 레이어: B
  - 구현 파일: `apps/backend/src/modules/auth/social/naver.provider.ts`
  - 관련 요구사항: FR-007, FR-008
  - 상세: `verify` 내 `body` 구성 후 additive:
    ```
    const redirectUri = this.configService.get<string>('NAVER_REDIRECT_URI');
    if (redirectUri) body.set('redirect_uri', redirectUri);
    ```
    `getOrThrow` 아닌 **`get`**(미설정=undefined→미포함, FR-008 fail-safe). 기존 `state: context?.state ?? ''` forward·토큰교환·프로필조회 흐름 무변경. `SocialVerifyContext.redirectUri` 예약 필드 미사용 유지(ADR-006).
  - 완료 기준: env 설정 시 body 에 `redirect_uri` 포함, 미설정 시 미포함. kakao/google 무영향.

### Step 3. 인터페이스 계층 (C)

- [x] **T007** — state 발급 엔드포인트 + 모듈 등록 + DTO
  - 레이어: C
  - 구현 파일: `apps/backend/src/modules/auth/auth.controller.ts`, `apps/backend/src/modules/auth/auth.module.ts`, `apps/backend/src/modules/auth/dto/auth-response.dto.ts`
  - 관련 요구사항: FR-001
  - 상세: (a) AuthController 에 `OAuthStateService` 주입 + 핸들러:
    ```
    @Post('naver/state')
    @HttpCode(HttpStatus.OK)
    @ApiOkResponse({ type: NaverStateResponse })
    async naverState() { return this.oauthStateService.issue('naver'); }
    ```
    익명(JWT 가드 없음). (b) `auth.module.ts` providers 배열에 `OAuthStateService` 추가. (c) `auth-response.dto.ts` 에 `NaverStateResponse { @ApiProperty() state!: string }` 추가.
  - 완료 기준: `POST /auth/naver/state` → 200 `{ state }`. DI 해석 성공(모듈 부팅).

- [x] **T008** `[P]` — .env.example NAVER_REDIRECT_URI 문서화
  - 레이어: C
  - 구현 파일: `apps/backend/.env.example`
  - 관련 요구사항: FR-007, NFR-005
  - 상세: `NAVER_CLIENT_SECRET` 항목(라인 33) 아래 additive:
    ```
    # 네이버: 토큰 교환 redirect_uri (선택 — 네이버가 요구할 경우에만 설정. 미설정 시 미포함이 기본)
    NAVER_REDIRECT_URI=
    ```
  - 완료 기준: `.env.example` 에 `NAVER_REDIRECT_URI` 항목·주석 존재(SC-013).

### Step 4. 테스트 계층 (D) — 5a Test AUTHORING 담당

> 본 Step 태스크(레이어 D)는 **5a 단계 Test Agent (AUTHORING)** 가 PPG-1 시작 시 수행한다. Development Agent(4단계)는 A·B·C(T001~T008)만 진행한다. 양 Agent 는 동일 turn 동시 spawn·병렬 진행.

- [ ] **T009** — OAuthStateService 단위 테스트 (신규)
  - 레이어: D
  - 테스트 파일: `apps/backend/src/modules/auth/social/oauth-state.service.spec.ts` (신규)
  - 검증 대상: SC-001, SC-002, SC-010
  - 시나리오: mock AuthRepository 주입. SC-001 issue('naver')→`{state}` 비어있지 않은 base64url·createOAuthState 호출(provider·expiresAt 인자). SC-002 consume 시 repo.consumeOAuthState→0(만료) → false. SC-010 issue N회 → 매번 다른 state(중복 0).

- [ ] **T010** — SocialAuthService naver state 검증 테스트 (신규)
  - 레이어: D
  - 테스트 파일: `apps/backend/src/modules/auth/social-auth.service.naver-state.spec.ts` (신규)
  - 검증 대상: SC-003, SC-004, SC-005, SC-006
  - 시나리오: TestingModule 에 SocialAuthService + 4 mock(resolver·repo·authService·**oauthStateService**). SC-003 consume→true → verify 호출됨 → JWT. SC-004 consume→false(불일치/만료/undefined) → 401·verify **미호출**. SC-005 동일 state 2회 — 1회째 true→성공, 2회째 false→401. SC-006 kakao/google — consume **미호출**(분기 미진입)·verify 호출·기존 흐름.

- [ ] **T011** — NaverProvider redirect_uri 테스트 + §F mock 마이그레이션
  - 레이어: D
  - 테스트 파일: `apps/backend/src/modules/auth/social/naver.provider.spec.ts` (수정)
  - 검증 대상: SC-007, SC-008 (+ SC-011 회귀: 기존 SC-002/003/004 PASS 유지)
  - 시나리오: **§F 필수** — `buildConfigService` 에 `get: jest.fn((key) => values[key])` 추가(미설정 키 undefined). SC-007 `buildConfigService({ NAVER_REDIRECT_URI: 'https://app/cb' })` → 토큰 body `redirect_uri` 포함. SC-008 미설정 → 미포함. 기존 SC-002/003/004 는 `get` mock 추가 후 회귀 없이 PASS.

- [ ] **T012** — 015 SocialAuthService 스위트 §F 마이그레이션 (회귀)
  - 레이어: D
  - 테스트 파일: `social-auth.service.naver.spec.ts`, `social-auth.service.autolink-policy.spec.ts`, `social-auth.service.naver-autolink-exclusion.spec.ts`, `social-auth.service.spec.ts`(014, 조건부)
  - 검증 대상: SC-011 (NFR-003 회귀 0)
  - 시나리오: **§F 필수** — 4파일 TestingModule providers 에 `{ provide: OAuthStateService, useValue: { consume: jest.fn(), issue: jest.fn() } }` 추가(미추가 시 DI 해석 실패). **naver 케이스**는 `mockOAuthStateService.consume.mockResolvedValue(true)` + `login('naver', token, 'valid-state')`(state 인자) 로 마이그레이션(미마이그레이션 시 consume(undefined)→false→401 로 기존 단언 붕괴). **kakao/google 케이스는 무변경**(FR-006 분기 미진입, 무회귀 확인). research.md §F 참조.

- [ ] **T013** `[P]` — 정적 검증 지원 (SC-012, SC-013)
  - 레이어: D
  - 검증 대상: SC-012, SC-013
  - 시나리오: SC-012 `apps/backend/package.json` dependencies 에 Redis/외부 저장소 클라이언트(ioredis·redis·@upstash 등) 신규 추가 0건 확인(grep). SC-013 `.env.example` `NAVER_REDIRECT_URI` 항목 존재 확인. (테스트 코드 아닌 정적 grep 검증 — 5b EXECUTION 이 확인.)

> **SC-009 / SC-014 / SC-015 (D 레이어 아님)**: SC-009(e2e-docker P95)는 실 OAuth 크레덴셜·네이티브 연동 필요로 **deferred**(옵션 B, 범위 외 — 015 SC-016 동일). SC-014(SEC-015-02 RESOLVED)·SC-015(SEC-015-03 RESOLVED/잔존-권고)는 **6단계 Security Agent 재감사** 판정(테스트 아님·문서/코드 검증). 본 tasks 의 테스트 태스크로 매핑하지 않으며 selection-phases.md 의 Security Agent(6단계 후 활성)가 담당.

---

## Test Authoring Contract

> **PPG-1 의 5a Test Agent (AUTHORING) 입력 contract**. 4단계 Development 와 병렬이므로 production 심볼을 아래 canonical 로 고정한다(PROC-004 — 가정 불일치로 인한 5b [B] 정정 방지).

### production 심볼 canonical (5a 가정 고정)

| 심볼 | canonical 시그니처 |
|---|---|
| `OAuthStateService.issue` | `issue(provider: string): Promise<{ state: string }>` |
| `OAuthStateService.consume` | `consume(provider: string, state?: string): Promise<boolean>` (state falsy → false) |
| `AuthRepository.createOAuthState` | `createOAuthState(data: { state: string; provider: string; expiresAt: Date }): Promise<void>` |
| `AuthRepository.consumeOAuthState` | `consumeOAuthState(provider: string, state: string, now: Date): Promise<number>` (삭제 행 수) |
| `AuthRepository.deleteExpiredOAuthStates` | `deleteExpiredOAuthStates(now: Date): Promise<number>` |
| `SocialAuthService` 생성자 | `(resolver, repo, authService, **oauthStateService: OAuthStateService**)` — **4번째 인자 신규**. 기존 테스트 module 은 반드시 OAuthStateService mock provider 추가 |
| `SocialAuthService.login` | `login(provider, token, state?)` — naver 인 경우 consume false → `UnauthorizedException`(401), verify **이전** |
| `NaverProvider.verify` | `verify(code, context?)` — 내부에서 `configService.get<string>('NAVER_REDIRECT_URI')`(getOrThrow 아님) |
| `AuthController` | `POST /auth/naver/state` → `OAuthStateService.issue('naver')` → 200 `{ state }` |

- **예외 클래스**: state 검증 실패 = `UnauthorizedException`(@nestjs/common), 401. email 미반환 = `BadRequestException`, 400(015 그대로). naver+email 중복 = `ConflictException`, 409(015 그대로).
- **난수 형태**: base64url(padding 없음, `/`·`+`·`=` 미포함) 약 43자.

### SC × 시나리오 매핑

| SC-ID | 수용 기준 | Happy | Edge | Error | 테스트 파일 | 비고 |
|---|---|---|---|---|---|---|
| SC-001 | issue → 유효 state 반환 | test_SC001_issue_returns_state | — | — | oauth-state.service.spec.ts | [env:unit] createOAuthState 호출 단언 |
| SC-002 | TTL 경과 후 consume 거부 | — | test_SC002_expired_state_consume_false | — | oauth-state.service.spec.ts | [env:unit] repo count 0 → false |
| SC-003 | 유효 state → 검증통과·로그인 | test_SC003_valid_state_proceeds_login | — | — | social-auth.service.naver-state.spec.ts | [env:unit] consume→true, verify 호출 |
| SC-004 | 불일치/만료/미제공 → 401 | — | — | test_SC004_invalid_state_rejects_401 | social-auth.service.naver-state.spec.ts | [env:unit] verify 미호출 단언 |
| SC-005 | 소비된 state 재사용 → 401 | — | — | test_SC005_reused_state_rejects_401 | social-auth.service.naver-state.spec.ts | [env:unit] 1회 true→2회 false |
| SC-006 | kakao/google state 무관 정상 | test_SC006_kakao_google_skip_state | — | — | social-auth.service.naver-state.spec.ts | [env:unit] consume 미호출 단언 |
| SC-007 | redirect_uri 설정 시 포함 | test_SC007_redirect_uri_included | — | — | naver.provider.spec.ts | [env:unit] get mock overrides |
| SC-008 | redirect_uri 미설정 시 생략 | test_SC008_redirect_uri_omitted | — | — | naver.provider.spec.ts | [env:unit] |
| SC-010 | 연속 발급 예측불가(중복 0) | test_SC010_issue_distinct_values | — | — | oauth-state.service.spec.ts | [env:unit] N회 Set size===N |
| SC-011 | 015 kakao/google 회귀 0 | (기존 스위트 PASS 유지) | — | — | 015 스위트 4종(§F 마이그레이션) | [env:unit] |
| SC-012 | 외부 저장소 의존 0 | — | — | — | package.json grep | [env:static] 5b 확인 |
| SC-013 | .env.example redirect_uri | — | — | — | .env.example grep | [env:static] 5b 확인 |
| SC-009 | P95 3초 | — | — | — | (deferred) | [env:e2e-docker] 옵션 B |
| SC-014 | SEC-015-02 RESOLVED | — | — | — | Security 재감사 | [env:static] 6단계 |
| SC-015 | SEC-015-03 RESOLVED/잔존 | — | — | — | Security 재감사 | [env:static] 6단계 |

> **UI 상태주입(PATCH-013-01) 비해당**: 본 spec 은 백엔드 전용(모바일 앱 배선은 spec 범위 외). UI 위젯 테스트 harness 전제(PROC-014-03) 대상 태스크 없음.

---

## 태스크 입도 가이드

- 1 태스크 ≈ 구현 파일 1~3개 + 대응 테스트 1개 수준.
- T005(SocialAuthService)·T012(§F 015 스위트 4파일)는 영향 범위가 넓어(호출 측 다수) 별도 태스크로 분리했다.
- T003/T004 는 의존 순서(repo→service)이나 파일이 분리되어 각각 독립 태스크.

## 구현 완료 기준

- [ ] 모든 태스크 체크박스(T001~T013) 완료
- [ ] [TypeScript] `pnpm --filter backend test` 전체 PASS (신규 + 015 스위트 회귀 0)
- [ ] [TypeScript] `pnpm --filter backend build`(tsc) 0 error — DI 생성자 변경 반영
- [ ] `oauth_states` 마이그레이션 1건 정상 생성(기존 32테이블 무변경, 33테이블/16차)
- [ ] git status 의도치 않은 파일 없음
