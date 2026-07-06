---
작성: Planning Agent
버전: v1.0
최종 수정: 2026-07-03 [시각 미확인 — Bash 도구 미제공으로 date 명령 실행 불가]
상태: 확정
---

# Plan: 016-naver-state-redirect-hardening

> Branch: 016-naver-state-redirect-hardening | Date: 2026-07-03 | Spec: [../spec/spec.md](../spec/spec.md)

## 목차

- [사전 검증 (Constitution Gates)](#사전-검증-constitution-gates)
- [기술 컨텍스트](#기술-컨텍스트)
- [외부 라이브러리·엔드포인트 동작 검증](#외부-라이브러리엔드포인트-동작-검증)
- [배포 환경 영향](#배포-환경-영향)
- [핵심 설계](#핵심-설계)
- [공유 상태·동시성 설계 (§6 검토)](#공유-상태동시성-설계-6-검토)
- [결정 기록 (ADRs)](#결정-기록-adrs)
- [인터페이스 계약](#인터페이스-계약)
- [데이터 모델](#데이터-모델)
- [위험 완화 설계](#위험-완화-설계)
- [테스트 전략](#테스트-전략)
- [기타 고려사항](#기타-고려사항)

---

## 사전 검증 (Constitution Gates)

> `.claude/docs/constitution.md` P-001~P-007 조항 기준. 본 spec 은 constitution 조항과 충돌하는 NFR 이 없다. NFR-004(신규 외부 저장소 금지)는 P-003(단일 DB 원칙)과 동일 방향이며 spec 이 constitution 기준을 그대로 승계·강조한다.

- [x] **P-001 모듈 경계 원칙**: [Pass 기준: 타 도메인 스키마 직접 참조 0건] — 신규 `oauth_states` 테이블은 `users` 스키마에 배치, auth 모듈(`AuthRepository`)만 접근. 타 모듈 스키마 미참조. **PASS**
- [x] **P-002 AWS 의존 금지 원칙**: [Pass 기준: AWS 전용 SDK/서비스 신규 의존 0건] — state 발급은 Node 20 native `node:crypto`(`randomBytes`), 저장은 기존 PostgreSQL(Prisma). 신규 npm 의존 0건. AWS/Redis/ElastiCache 미사용. **PASS**
- [x] **P-003 단일 DB 원칙**: [Pass 기준: 외부 데이터 저장소 신규 도입 0건] — state 저장은 **기존 단일 PostgreSQL 인스턴스의 신규 테이블 1개**(스키마 분리 원칙 내 `users` 스키마). Redis 등 외부 저장소 0건(NFR-004·SC-012). in-memory 대안은 ADR-001 에서 명시 비교 후 P-003 정합·멀티인스턴스 정합성 근거로 미채택. **PASS**
- [x] **P-004 클라우드 중립 원칙**: [Pass 기준: Fly.io 전용 API 비즈니스 결합 0건] — `NAVER_REDIRECT_URI` 는 표준 환경변수(`fly secrets` 는 배포 레이어). 비즈니스 로직에 Fly 전용 API 없음. **PASS**
- [x] **P-005 결제·정산 정합성 원칙**: [Pass 기준: 해당 없음] — 금전 상태 변경 없음. **N/A (PASS)**
- [x] **P-006 테스트 원칙**: [Pass 기준: SC-XXX 없는 FR-XXX 0건] — FR-001~008 전건 SC 대응(FR-001→SC-001, FR-002→SC-002, FR-003→SC-003, FR-004→SC-004, FR-005→SC-005, FR-006→SC-006, FR-007→SC-007, FR-008→SC-008). 하단 테스트 전략 매핑표. **PASS**
- [x] **P-007 스펙 범위 원칙**: [Pass 기준: spec 범위 외 변경 파일 0건] — 변경은 **네이버 state 발급·검증 + redirect_uri 조건부**에 한정: 신규 `oauth_states` 모델·마이그레이션, `OAuthStateService`(신규), `AuthRepository`(state CRUD 메서드 추가), `AuthController`(state 발급 엔드포인트), `SocialAuthService.login`(naver state 검증 분기), `NaverProvider.verify`(redirect_uri 조건부), `auth.constants.ts`(TTL 상수), `.env.example`. 카카오·구글 검증 로직·계정해석 흐름·`AUTO_LINK_PROVIDERS` 무변경(NFR-003). **PASS**

예외 사항: 없음.

> **성능 게이트 판정**: NFR-001 P95 3초(015 승계, constitution 에 P95 조항 부재 → spec 자체 기준). SC-009(측정)는 실 OAuth 크레덴셜·네이티브 연동 필요로 spec 이 명시적으로 deferred(`[env:e2e-docker]`, 옵션 B). 신규 state 발급/검증은 로컬 PostgreSQL 단일 쿼리(인덱스 조회·조건부 delete)로 in-pipeline 측정 불요. Performance Agent 비활성.

> **자동연동 정책 무변경 명시 (PATCH-015-02 비적용 근거)**: 본 spec 은 `AUTO_LINK_PROVIDERS` 를 변경하지 않는다 — naver 는 SEC-015-01(이메일 소유권 미검증)으로 015 v1.1 재감사에서 자동연동 제외 확정 상태를 그대로 유지한다. 계정 자동연동·병합 정책 변경이 없으므로 PATCH-015-02(provider별 신뢰근거 명시 강제) 트리거에 해당하지 않는다. 본 spec 의 state/CSRF 하드닝은 자동연동 정책과 직교(orthogonal)한다.

---

## 기술 컨텍스트

- **언어 / 런타임**: Node.js 20 + TypeScript, NestJS (`apps/backend`). 모바일(Flutter)은 본 spec 범위 외(네이티브 state 발급 엔드포인트 호출 배선은 운영 셋업 deferred — spec 범위 외 절).
- **주요 의존성**:
  - `@nestjs/config`(ConfigService — `NAVER_REDIRECT_URI` 조회), Prisma(신규 `oauth_states` 테이블), `node:crypto`(`randomBytes` — state 난수 발급). **신규 npm 의존 없음**(SC-012).
  - state 저장은 기존 PostgreSQL 16 + Prisma multiSchema(`users` 스키마) 재사용. pg-boss·EventEmitter 무관.
- **테스트 프레임워크**: Jest(백엔드 unit `*.spec.ts`). state 발급·TTL·1회성 소비는 mock PrismaService 또는 실 테스트 DB 로 검증 가능(D 레이어, Test Agent).
- **기존 재사용 대상 (변경 없음)**:
  - `SocialAuthService` 계정해석 3단계(providerId 매칭→email 자동연동[카카오·구글 한정]→신규가입)·`AUTO_LINK_PROVIDERS`(카카오·구글 2종, naver 제외)·`AuthService.issueTokensForUser` — 전부 015 산출물 그대로.
  - `NaverProvider` code-exchange 흐름(client_secret 교환 → 프로필 조회)·`NaverProfileResponse` 파싱 — 015 그대로(redirect_uri 조건부 파라미터만 additive 추가).
  - `auth.constants.ts`(013 OTP 상수 정의 파일) — state TTL 상수 추가 위치로 재사용.

---

## 외부 라이브러리·엔드포인트 동작 검증

> (rule 10 / PATCH-002) 본 spec 의 신규 로직(state 발급·검증)은 **백엔드 내부 완결**이므로 외부 엔드포인트 동작에 의존하지 않는다. redirect_uri 조건부 포함만 네이버 토큰 엔드포인트 동작과 관련되나, 요구 여부는 015 에서 이미 `[TO-VERIFY]`(SEC-015-03) 로 확정 위임된 상태를 그대로 승계한다.

| 항목 | 확인 결과 / 위임 |
|---|---|
| `node:crypto` `randomBytes(n)` 반환 의미 | Node 20 공식 API — cryptographically strong pseudo-random bytes 반환(CSPRNG). Secure Context 제약(브라우저 Web Crypto) 무관 — 서버사이드 native 모듈(typescript.md Secure Context 주의: `globalThis.crypto.randomUUID()`/`crypto.subtle` 회피, `node:crypto` 명시 사용). **확인(공식 API 계약)** |
| Prisma `deleteMany`/`updateMany` count 반환 | 조건 매칭 행 수 반환. `WHERE` 절 조건부 delete/update 는 PostgreSQL 행 수준 락으로 원자적(동시성 안전) — 아래 [공유 상태·동시성 설계](#공유-상태동시성-설계-6-검토) 참조. **확인(ORM 계약 + PostgreSQL MVCC)** |
| 네이버 토큰 교환 `redirect_uri` 요구 여부 | 015 SEC-015-03 `[TO-VERIFY]` 승계 — 공식 문서 최종 확인은 운영 셋업 deferred(spec 범위 외). 본 spec 은 **요구 여부와 무관하게 fail-safe** 설계: 환경변수 미설정 시 파라미터 미포함(기존 동작), 설정 시 포함(FR-007/008). 요구 확인 시 코드 변경 없이 env 설정만으로 활성. `[TO-VERIFY: naver 토큰 교환 redirect_uri 요구 여부 — 운영 셋업 공식문서 확인]` |

> **(PATCH-A07) 인정되는 한계 + 안전망**: state 검증은 백엔드 자체 DB 대조이므로 네이버 엔드포인트 동작에 의존하지 않는다(silent failure 여지 없음). redirect_uri 는 요구 여부 미확정이 유일한 외부 의존이나, **미설정=미포함이 안전한 기본값**(fail-safe, fail-closed 아님)이므로 미확정 상태에서도 회귀·오동작이 없다. 잔여 확인은 6단계 Security Agent 재감사(SC-015) + 사후 운영 검증(PROC-014).

---

## 배포 환경 영향

> (PROC-009) infra.md 운영 환경 cross-reference 결과.

- 신규 아웃바운드 호출 없음. state 발급·검증은 **내부 PostgreSQL 쿼리만** 수행(외부 HTTP 무관). 네이버 아웃바운드 2건(nid.naver.com·openapi.naver.com)은 015 에서 이미 등재(infra.md §8, PATCH-CXT-015-02 반영 완료).
- `NAVER_REDIRECT_URI` 신규 환경변수는 `.env.example` 문서화(NFR-005) + 운영 시 `fly secrets` 주입(기존 `NAVER_CLIENT_*` 동일 패턴). 신규 인프라 컴포넌트·컨테이너 구조 변경 없음.
- **Fly.io 배포 특이성 (PATCH-A06 연계)**: infra.md §8 의 **scale-to-zero 콜드 스타트**·rolling deploy(다중 인스턴스 일시 공존)가 state 저장 방식 선택에 직접 영향 → in-memory state 는 (1) 콜드 스타트/재시작 시 유실, (2) 발급 인스턴스와 콜백 인스턴스 불일치 시 미검출(false rejection) 위험. **PostgreSQL 테이블 채택(ADR-001)으로 두 위험 모두 구조적으로 제거** — 발급/콜백 왕복 사이 인스턴스 전환·재시작에 무관하게 검증 성립. critical 배포 환경 특이성은 이 설계로 흡수됨.
- **결론**: 신규 컨테이너/컴포넌트 없음 → **Deploy Agent 비활성**. infra.md §7 배포 전 체크리스트에 `NAVER_REDIRECT_URI`(선택, 미설정=미포함 기본) 항목 추가는 6단계 Docs/Retrospective 위임(신규 GAP 불요 — 기존 소셜 크레덴셜 체크 항목에 additive).

---

## 핵심 설계

> 작성 깊이: Design Agent 가 추가 설계 판단 없이 tasks.md 를 분해 가능한 수준.

### 흐름 개요 (FR-001~008)

```
[1] state 발급  (FR-001, FR-002)
POST /auth/naver/state   (익명)
    ↓ AuthController.naverState()  →  OAuthStateService.issue('naver')
    ├─ state = randomBytes(32).toString('base64url')   (node:crypto, NFR-002 예측불가)
    ├─ expiresAt = now + NAVER_STATE_TTL_MIN(=10분)     (FR-002 TTL)
    ├─ (opportunistic) AuthRepository.deleteExpiredOAuthStates(now)  ← 테이블 바운딩
    ├─ AuthRepository.createOAuthState({ state, provider:'naver', expiresAt })
    └─ 응답 200: { state }

[2] 네이버 로그인 (state 검증 + code-exchange)  (FR-003~006)
POST /auth/social-login   { provider:'naver', token:<code>, state:<S> }
    ↓ AuthController.socialLogin()  →  socialAuthService.login(provider, token, state)
    ↓ SocialAuthService.login(provider, token, state?):
    ├─ (신규) provider==='naver' 인 경우에만 state 검증 분기  (FR-006: kakao/google 제외)
    │     ok = await oauthStateService.consume('naver', state)
    │       └─ AuthRepository.consumeOAuthState('naver', state, now)  ← 원자적 조건부 delete
    │            deleteMany({ where:{ state, provider:'naver', expiresAt:{ gt: now } } }).count === 1 ?
    │     ok === false → throw UnauthorizedException(401)  (FR-004 불일치·만료·미제공·이력없음 / FR-005 재사용)
    ├─ providerImpl.verify(token, { state, redirectUri? })   (015 흐름 그대로, redirect_uri 조건부)
    ├─ 계정 해석 3단계 (015 무변경 — naver ∉ AUTO_LINK_PROVIDERS)
    └─ issueTokensForUser → { accessToken(JWT), refreshToken }

[3] redirect_uri 조건부  (FR-007, FR-008)
NaverProvider.verify(code, ctx):
    ├─ redirectUri = configService.get<string>('NAVER_REDIRECT_URI')   (getOrThrow 아님 — optional)
    ├─ body = URLSearchParams({ grant_type, client_id, client_secret, code, state })
    ├─ if (redirectUri) body.set('redirect_uri', redirectUri)          (FR-007 설정 시 포함)
    │  else: 파라미터 미포함                                            (FR-008 미설정 시 기존 동작)
    └─ POST nid.naver.com/oauth2.0/token ... (015 그대로)
```

### 변경 모듈 (backend `apps/backend/src/modules/auth/`)

| 파일 | 유형 | 내용 |
|---|---|---|
| `prisma/schema.prisma` | **수정** | `model OAuthState`(신규, `users` 스키마) 추가 — 아래 [데이터 모델](#데이터-모델) |
| `prisma/migrations/{ts}_add_oauth_states/` | **신규** | `oauth_states` 테이블 생성 마이그레이션(Database Design Agent 산출) |
| `social/oauth-state.service.ts` | **신규** | `OAuthStateService` — `issue(provider): Promise<{ state: string }>`, `consume(provider, state?): Promise<boolean>`. 난수 발급(`randomBytes`)·TTL 계산·소비 위임 |
| `auth.repository.ts` | **수정** | `createOAuthState`·`consumeOAuthState`(원자적 조건부 delete, count 반환)·`deleteExpiredOAuthStates` 메서드 추가(users 스키마, P-001) |
| `auth.controller.ts` | **수정** | `@Post('naver/state')` `naverState()` 핸들러 추가(익명, 200) → `OAuthStateService.issue('naver')` |
| `social-auth.service.ts` | **수정** | `login()` 진입부에 `provider==='naver'` 조건부 state 검증 분기 추가(`consume` false → 401). 계정해석·`AUTO_LINK_PROVIDERS` 무변경 |
| `social/naver.provider.ts` | **수정** | `verify()` 에 `NAVER_REDIRECT_URI` 조건부 조회 + `redirect_uri` 파라미터 additive 포함(FR-007/008). state forward(기존 `state: context?.state ?? ''`)는 유지 |
| `auth.constants.ts` | **수정** | `NAVER_STATE_TTL_MIN = 10` 상수 추가(OTP 상수 파일 재사용, ADR-007) |
| `auth.module.ts` | **수정** | `OAuthStateService` provider 등록 |
| `.env.example` | **수정** | `NAVER_REDIRECT_URI=` 항목 + 주석 문서화(NFR-005, SC-013) |
| `dto/auth-response.dto.ts` | **수정(선택)** | `NaverStateResponse { state: string }` Swagger 응답 타입(기존 응답 DTO 패턴 일치) |

> **분기 핵심**: state 검증은 `SocialAuthService.login` 진입부에서 `provider==='naver'` 일 때만 수행(FR-006 — kakao/google 은 검증 대상 아님, state 값 유무 무관 기존 흐름). 검증은 **`providerImpl.verify` 호출 이전**에 수행하여 무효 state 요청이 네이버 아웃바운드 호출에 도달하기 전에 차단(아웃바운드 증폭 완화, SEC-004 연계).

---

## 공유 상태·동시성 설계 (§6 검토)

> `01-design-rules.md §6` 레이스 컨디션·Check-Then-Act 체크리스트 검토 결과.

| 항목 | 검토 결과 |
|---|---|
| **공유 자원 식별** | `oauth_states` 테이블 행. 발급(INSERT)·검증소비(조건부 DELETE)·만료정리(DELETE)가 동시 실행 가능. **in-memory 공유 자료구조 없음**(ADR-001 로 DB 채택 — Node 프로세스 메모리에 공유 상태 미보유). 멀티 인스턴스에서도 유일 SoT 는 DB. |
| **Check-Then-Act 탐지 (FR-005 1회성)** | "state 유효 확인 → 소비 처리"가 비원자적 쌍이면 동일 state 동시 2회 제출 시 양쪽 통과(replay) 위험. **완화: 단일 SQL `DELETE ... WHERE state=? AND provider=? AND expiresAt > now` 로 확인+소비를 원자화**(`consumeOAuthState`). PostgreSQL 이 DELETE 대상 행에 row-level lock 을 잡으므로, 동시 2요청 중 정확히 1건만 `count===1`(성공), 나머지는 `count===0`(거부). 앱 레이어 lock 불요 — DB 원자성에 위임. |
| **Lock 범위 최소화** | 소비는 단일 문(single statement) DELETE — 내부에 네트워크/파일 I/O 없음. 네이버 아웃바운드(`verify`)는 소비 **성공 이후** 별도 수행(lock 구간 밖). |
| **안전성 근거 문서화** | 검증-소비 원자성은 앱 코드가 아닌 DB 조건부 DELETE 의 단일성에 근거. delete-on-consume 채택(ADR-003)으로 "소비됨" 상태를 별도 플래그로 관리할 필요 없이 행 부재 자체가 소비/미발급을 의미(재제출 시 `count===0` 거부). 만료 행은 소비 조건(`expiresAt > now`)에서 자동 배제되며, 발급 시 opportunistic `deleteExpiredOAuthStates` 로 정리(테이블 무한 증식 방지). |

---

## 결정 기록 (ADRs)

> ID 체계는 본 spec 로컬 순번(ADR-001~007). 015 ADR 과 구분한다.

| ADR-ID | 결정 항목 | 채택안 | 대안 (검토했으나 채택 안 함) | 근거 (spec FR/NFR 참조) | 영향 범위 |
|---|---|---|---|---|---|
| ADR-001 | state 저장 방식 | **기존 단일 PostgreSQL 신규 `oauth_states` 테이블**(`users` 스키마) + Prisma 마이그레이션 | (A) 애플리케이션 in-memory TTL Map — 마이그레이션 불요·최단이나 **Fly scale-to-zero 재시작 시 유실·멀티 인스턴스(rolling deploy) 발급↔콜백 불일치 false rejection**(infra §8) + 프로세스 메모리 공유상태 동시성 부담. (B) 신규 Redis/외부 캐시 — **P-003·NFR-004 위반(금지)** | NFR-004, P-003, spec-input Q13, infra §8(scale-to-zero·rolling) | `schema.prisma`·마이그레이션·`AuthRepository` |
| ADR-002 | state 발급 알고리즘 | **`node:crypto` `randomBytes(32).toString('base64url')`**(256bit CSPRNG) | (1) `globalThis.crypto.randomUUID()`(Web Crypto) — typescript.md Secure Context 주의(Docker/비localhost HTTP 에서 실패 위험) + 122bit 로 엔트로피 낮음. (2) `uuid` 패키지 — 신규 의존(P-002 최소화 위배) | NFR-002(예측불가·재현불가), SC-010, typescript.md Secure Context | `oauth-state.service.ts` |
| ADR-003 | 1회성 소비 방식 (FR-005) | **delete-on-consume** — 조건부 `deleteMany({ where:{ state, provider, expiresAt:{gt:now} } })` count===1 시 성공(행 제거가 곧 소비). 재제출 시 count===0 거부 | (1) `consumedAt` 플래그 mark(`updateMany`) — 소비 행이 누적되어 별도 sweep 부담, 감사 불요한 CSRF nonce 에 과설계. (2) SELECT 후 DELETE 2단계 — Check-Then-Act 비원자(replay 위험) | FR-005, §6 동시성, SC-005 | `AuthRepository`·`OAuthStateService` |
| ADR-004 | 발급 엔드포인트 | **`POST /auth/naver/state`**(익명, 200 OK, `{ state }`) — 신규 resource(nonce) 생성이므로 POST | (1) `GET` — 부수효과(행 INSERT) 있는 요청에 GET 부적합(캐시·프리페치 오동작). (2) 기존 `/auth/social-login` 재사용(모드 파라미터) — 단일 엔드포인트 책임 과다·하위호환 복잡 | FR-001, spec-input Q10 | `auth.controller.ts` |
| ADR-005 | state 검증 배선 위치 | **`SocialAuthService.login` 진입부**(`provider==='naver'` 조건부, `providerImpl.verify` **이전**) via `OAuthStateService.consume` | (1) `NaverProvider.verify` 내부 — provider 는 토큰 교환 책임, CSRF 게이트를 provider 에 두면 계정해석·resolver 와 책임 혼재 + 무효 state 가 네이버 호출까지 도달. (2) `AuthController` — 컨트롤러에 도메인 검증 로직 누수 | FR-003, FR-004, FR-006(naver 한정) | `social-auth.service.ts`·`oauth-state.service.ts` |
| ADR-006 | redirect_uri 조회·전달 | **`NaverProvider.verify` 가 `configService.get('NAVER_REDIRECT_URI')` 직접 조회**(optional, 미설정=undefined→미포함). `SocialVerifyContext.redirectUri` 예약 필드는 미사용 유지 | (1) `SocialAuthService` 가 env 조회 후 `context.redirectUri` 로 전달 — client_id/secret 은 이미 provider 가 직접 조회하므로 redirect_uri 만 경로가 달라 일관성 저하. (2) 예약 필드 제거 — 불필요한 파괴적 변경 | FR-007, FR-008, NFR-005 | `naver.provider.ts` |
| ADR-007 | state TTL 값·위치 | **`NAVER_STATE_TTL_MIN = 10`(분) 상수, `auth.constants.ts`**(013 OTP 상수 파일 재사용) | (1) 매직 넘버 하드코딩 — 정합성 검토 부채(01-design §4-2). (2) 환경변수화 — 운영 유연성 이득 대비 관리 부담(OTP TTL 도 상수, 일관성) | FR-002, spec-input Q10/Q16 | `auth.constants.ts`·`oauth-state.service.ts` |

> 본 표는 Design Agent 의 research.md "기술 선택 조사" 절과 cross-reference 한다. ADR 미작성 결정이 design 단계에 발견되면 status: BLOCKED 로 Planning 복귀.
>
> **PATCH-003(NFR 성능 직결 파라미터) 비적용**: `NAVER_STATE_TTL_MIN` 은 NFR-001 P95 에 영향하는 성능 파라미터가 아니라 보안·UX 파라미터(state 유효 창)이므로 "허용 범위+상한 NFR 검증" 규칙 대상 아님. 10분 단일 값(OAuth 인증 왕복 여유 + CSRF 노출창 최소화 균형).

---

## 인터페이스 계약

### 신규 엔드포인트: `POST /auth/naver/state` (익명)

- 요청: 바디 없음(또는 무시). 인증 불요(pre-login CSRF nonce 발급).
- 응답 200: `{ state: string }` — base64url 난수(약 43자).
- 오류: 없음(항상 발급 성공). DB 장애 시 500(프레임워크 기본).

### 기존 엔드포인트: `POST /auth/social-login` (naver 경로 강화)

- 요청: `{ provider:'naver', token:<code>, state:<S> }` — `state` 는 이제 naver 에서 **필수적으로 유효**해야 함(기존엔 미검증 pass-through).
- 신규 검증: naver 인 경우 `state` 가 (발급 이력 존재 ∧ 미만료 ∧ 미소비) 아니면 **401 거부**(FR-004).
- 응답 200: `{ accessToken, refreshToken }`(015 동일). 오류: 401(state 검증 실패·code 검증 실패), 400(email 미반환), 409(naver + email 중복 자동연동 차단, 015 그대로).
- **하위 호환(NFR-003)**: kakao/google 요청은 state 검증 분기 미진입(FR-006) — `state` 값 유무 무관 기존 흐름. `SocialLoginDto.state` optional 필드는 015 그대로.

### 권한 부여·상태 전이 인가 3축 (PATCH-001 / PROC-003)

| 엔드포인트 | (a) 호출자 신원(인증) | (b) 대상 자원 소유권 | (c) 역할(admin 등) | 미검증 축 위험·후속 |
|---|---|---|---|---|
| `POST /auth/naver/state` | 익명(무인증) — CSRF nonce 발급만, 민감자원 미접근 | 없음(신규 nonce 생성, 대상 자원 부재) | 없음 | (a) 익명 발급 → 무제한 호출로 `oauth_states` 테이블 flood(DoS) 가능. **완화: 짧은 TTL(10분) + 발급 시 opportunistic 만료 정리로 테이블 바운딩.** IP rate limit 은 기존 SEC-004(소셜 로그인 아웃바운드 rate limit 부재, 별도 과제)와 동일 완화 축으로 후속 위임(본 spec 범위 외). |
| `POST /auth/social-login` (naver) | code-exchange 신원 확립(015) **+ 신규 state CSRF 검증**(서버 발급·1회성 소비) | email 일치 기존 계정 자동연동은 **naver 차단 유지**(SEC-015-01, `AUTO_LINK_PROVIDERS` 제외) — providerId 매칭 재로그인·신규가입만 | 없음(로그인) | (b) 축은 015 상태 그대로(자동연동 차단). 본 spec 은 (a) 축의 CSRF 방어를 서버측으로 강화 → SEC-015-02 해소. 잔여: 사후 운영 검증(PROC-014) + Security 재감사(SC-014) |
| `POST /auth/social-login` (kakao/google) | 토큰 검증 + app_id/aud 대조(무변경) | email 일치 자동연동(무변경, `AUTO_LINK_PROVIDERS` 포함) | 없음 | 015 그대로 — 본 spec 무변경(NFR-003, SC-011) |

### 기존 인터페이스 하위 호환

- `SocialProviderPort.verify(token, context?)`: 시그니처 무변경(015 확정). `NaverProvider` 내부에서 `NAVER_REDIRECT_URI` 조회만 추가 — 카카오·구글 구현체 무영향.
- `SocialAuthService.login(provider, token, state?)`: 시그니처 무변경(015 확정). 진입부 naver 조건 분기만 additive — kakao/google 호출 경로 불변(SC-011).

---

## 데이터 모델

신규 테이블 1개(`users` 스키마). Prisma 모델:

```prisma
/// 네이버 code-exchange CSRF 방지용 서버 발급 state nonce (016).
/// 발급 시 INSERT, 검증 시 조건부 DELETE(delete-on-consume, 1회성 — FR-005).
/// 만료 행은 발급 시 opportunistic 정리. CSRF nonce 이므로 소비 이력 감사 불요.
model OAuthState {
  id        String   @id @default(cuid())
  state     String   @unique          // base64url 난수(node:crypto randomBytes(32)) — NFR-002
  provider  String                    // 'naver'(현재) — 향후 provider 확장 여지
  expiresAt DateTime                   // now + NAVER_STATE_TTL_MIN — FR-002 TTL
  createdAt DateTime @default(now())

  @@index([expiresAt])                 // 만료 정리(deleteExpiredOAuthStates) 인덱스
  @@map("oauth_states")
  @@schema("users")
}
```

- 신규 마이그레이션 1건(`add_oauth_states`) — `prisma migrate deploy` 자동 적용(infra §7 배포 흐름). Database Design Agent 가 마이그레이션 SQL·인덱스 검증.
- 개인정보 아님(CSRF 난수) — 백업·PII 처리 대상 아님(spec-input Q12/Q22).
- 기존 `social_accounts`·`users` 테이블 무변경(015 그대로).

---

## 위험 완화 설계

> (PATCH-A06) 운영 검증 미완료 항목의 안전망.

| 위험 항목 | 위험 | 안전망 |
|---|---|---|
| in-memory 유실(대안 미채택이나 원 위험) | scale-to-zero·rolling deploy 시 state 유실 → false rejection | **ADR-001 PostgreSQL 채택**으로 구조적 제거(발급/콜백 인스턴스·재시작 무관). |
| state 발급 flood(익명 DoS) | 무제한 발급으로 테이블 증식 | 짧은 TTL(10분) + 발급 시 opportunistic 만료 정리(`deleteExpiredOAuthStates`)로 바운딩. IP rate limit 은 SEC-004 후속과 동일 축(범위 외). |
| redirect_uri 요구 여부 미확정(운영 검증 defer) | 네이버가 redirect_uri 필수인데 미설정 시 교환 실패 | **fail-safe 설계**: 미설정=미포함(기존 015 동작, 회귀 0). 요구 확인 시 env 설정만으로 활성(코드 변경 0, FR-007/008). 사후 운영 검증(PROC-014 시나리오 3) + Security 재감사(SC-015). |
| 네이티브 state 발급 엔드포인트 호출 배선 defer | 실 앱이 발급 엔드포인트를 호출하지 않으면 하드닝 미작동 | 백엔드는 발급·검증·소비를 **지금 완결 구현·테스트**(SC-001~005). 네이티브 배선은 "서버 발급값 echo"만 하면 되는 단순 계약(spec 배경). 사후 운영 검증(PROC-014 시나리오 1). |
| state 검증 실패 UX(만료 재시도) | TTL 경과 후 사용자 재시도 시 오류 처리 | 401 거부 → 클라이언트는 재발급(POST /auth/naver/state) 후 재시도. 사후 운영 검증(PROC-014 시나리오 2). |

---

## 테스트 전략

> (PATCH-A08 / PROC-010 / PROC-014) 실 OAuth e2e(SC-009 성능 + 실 네이버 인증 흐름·네이티브 배선)는 **옵션 B(사용자 직접 검증)** 채택(spec 범위 외 명시, 015 선례 계승).
> - **옵션 자가 점검(PROC-010)**: (1) **운영 환경 의존성 Y** — 실 크레덴셜·네이티브 딥링크·redirect URI 등록에 의존. (2) **mock 불가 시나리오 Y** — 실 code 발급/교환·네이버 동의 화면·앱↔브라우저 전환. (3) **권장: 옵션 B 유지**. 단, 본 spec 의 핵심 하드닝(state 발급·TTL·1회성 소비·검증 거부·redirect_uri 조건부)은 **전부 백엔드 내부 완결이라 mock/실 테스트 DB unit 으로 재현 가능**(운영 환경 비의존) — SC-001~008·010~013 은 파이프라인 내 완전 검증. 운영 의존은 SC-009(성능)·네이티브 배선뿐. 운영 모니터링은 infra §5 네이버 아웃바운드(015 등재)로 보완.
> - **사후 피드백 사이클(PROC-014)**: spec §사후 운영 검증에 4개 시나리오(발급→인증→검증 전체·state 만료 재시도·redirect_uri 최종 확인·카카오/구글 회귀) 명시됨. 결함 발견 시 hotfix spec 입력 → main "spec 수정" → 별도 patch spec.

| SC | 테스트 수준 | 유형 | 시나리오 유형 | 입력 | 기대 결과 |
|---|---|---|---|---|---|
| SC-001 (FR-001) | 단위 | 발급 | Happy | `OAuthStateService.issue('naver')` 호출 | `{ state }` 반환(비어있지 않은 base64url), DB 에 provider·expiresAt 행 INSERT |
| SC-002 (FR-002) | 단위 | TTL | Edge | 발급 후 `expiresAt < now` 인 state 로 `consume` | `false` 반환(만료 거부) — `deleteMany count===0` |
| SC-003 (FR-003) | 단위 | 검증통과 | Happy | 발급 직후 유효 state 로 naver code-exchange 요청 | state 검증 통과 → `providerImpl.verify` 진입 → 015 로그인 흐름 정상(JWT 반환) |
| SC-004 (FR-004) | 단위 | 방어 | Error | state 불일치 / 만료 / 미제공(undefined) 로 naver 요청 | 401 거부(`verify` 미호출 — 네이버 아웃바운드 도달 전 차단) |
| SC-005 (FR-005) | 단위 | 재사용 | Error | 이미 소비된 state 로 2회째 naver 요청 | 두 번째 요청 401 거부(`count===0`) |
| SC-006 (FR-006) | 단위 | 회귀 | Happy | `provider:'kakao'` / `'google'` 요청(state 유무 무관) | state 검증 분기 미진입 — 015 기존 흐름 그대로 JWT 반환 |
| SC-007 (FR-007) | 단위 | 조건부포함 | Happy | `NAVER_REDIRECT_URI` 설정 + naver code-exchange | 토큰 교환 요청 body 에 `redirect_uri` 파라미터 포함 |
| SC-008 (FR-008) | 단위 | 조건부생략 | Happy | `NAVER_REDIRECT_URI` 미설정 + naver code-exchange | 토큰 교환 요청 body 에 `redirect_uri` 미포함(015 동작 동일) |
| SC-009 (NFR-001) | e2e | 성능 | Happy | 실 OAuth 흐름(state 발급 포함) | P95 ≤ 3초 — **deferred(옵션 B, 범위 외)** |
| SC-010 (NFR-002) | 단위 | 예측불가 | Happy | `issue('naver')` 연속 N회 | 매번 서로 다른 state 값(중복 0) |
| SC-011 (NFR-003) | 단위 | 회귀 | Happy | 015 카카오·구글 기존 단위 스위트 | 100% PASS(회귀 0, naver 신규분 제외) |
| SC-012 (NFR-004) | 정적 | 의존성 | — | `package.json`·lockfile 검토 | Redis 등 외부 저장소 클라이언트 신규 의존 0건 |
| SC-013 (NFR-005) | 정적 | env 문서 | — | `.env.example` 검토 | `NAVER_REDIRECT_URI` 항목 존재 |
| SC-014 (NFR-006) | 정적 | 보안감사 | — | 6단계 Security Agent 재감사 | SEC-015-02 RESOLVED 판정 |
| SC-015 (NFR-007) | 정적 | 보안감사 | — | 6단계 Security Agent 재감사 | SEC-015-03 RESOLVED 또는 잔존-권고(운영 확인 대기) 판정 |

> **시나리오 유형 커버리지**: Happy(SC-001/003/006/007/008/010/011) · Edge(SC-002 TTL 경계) · Error(SC-004 검증거부·SC-005 재사용거부) 세 유형 모두 커버. (SC-009 성능·SC-012~015 정적/보안 게이트는 유형 분류 대상 외.)

### smoke_tests

- 필요 여부: **Y**
- 대상 경로:
  - `apps/backend/src/modules/auth/social-auth.service.naver.spec.ts` (015 naver 계정해석)
  - `apps/backend/src/modules/auth/social-auth.service.autolink-policy.spec.ts` (015 자동연동 정책)
  - `apps/backend/src/modules/auth/social-auth.service.naver-autolink-exclusion.spec.ts` (015 naver 제외)
  - `apps/backend/src/modules/auth/social/naver.provider.spec.ts` (015 code-exchange)
- 근거: `SocialAuthService.login` 진입부 naver state 검증 분기 추가 + `NaverProvider.verify` redirect_uri 조건부 추가가 기존 015 naver·카카오·구글 계정해석/code-exchange 경로에 회귀를 유발할 수 있다(NFR-003, SC-011). 015 auth 소셜 스위트를 SC 매핑 테스트와 함께 실행하여 회귀 0 확인.

---

## 기타 고려사항

- **state 값 비노출**: state 는 CSRF nonce 로 로그에 원문 기록해도 민감정보는 아니나(개인정보 아님), 발급값 예측·수집 방지를 위해 불필요한 로깅 지양(Development 권고). `client_secret`·code·access_token 비노출은 015 그대로 유지.
- **검증 순서(성능·아웃바운드 절약)**: naver state 검증(`consume`)은 `providerImpl.verify`(네이버 아웃바운드 2건) **이전** 수행. 무효 state 요청이 네이버 호출에 도달하지 않아 아웃바운드 증폭(SEC-004) 을 부분 완화.
- **`consume` 인자 방어**: `state` 가 `undefined`/빈 문자열이면 `consumeOAuthState` 는 `count===0`(매칭 없음) → `false` → 401(FR-004 "미제공" 케이스). 별도 null 가드 불요하나 명시적 early-return 권장.
- **provider 확장 여지**: `OAuthState.provider` 컬럼·`OAuthStateService.issue(provider)` 시그니처는 provider 파라미터화 — 향후 카카오/구글이 code-exchange+state 로 전환될 경우 재사용 가능(현재는 'naver' 만, FR-006).
- **마이그레이션 드리프트 주의(GAP-005-03 연계)**: 신규 마이그레이션은 기존 `_prisma_migrations` 순서 뒤에 append. context §6 의 마이그레이션 드리프트(accepted)와 무관한 신규 폴더 1개 — squash 리셋 불요.
- **[TO-VERIFY] 일관성(PATCH-002)**: 본 plan 코드 예시의 리터럴(엔드포인트 경로·env 키·Prisma 쿼리 형태)은 기존 코드베이스에서 직접 확인한 실값(naver.provider.ts·auth.controller.ts·schema.prisma Read 근거). 유일한 외부 미확정(네이버 redirect_uri 요구 여부)은 fail-safe 설계로 흡수되며 `[TO-VERIFY]`(운영 셋업)로 위임 — 코드 예시에 확정값처럼 단정하지 않음(미설정=미포함이 검증된 안전 기본).
