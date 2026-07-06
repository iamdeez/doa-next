---
작성: Design Agent
버전: v1.0
최종 수정: 2026-07-04 04:08
상태: 확정
---

# Research: 018-auth-security-hardening

## 목차

- [분석 범위 게이트 결과](#분석-범위-게이트-결과)
- [기존 코드베이스 분석](#기존-코드베이스-분석)
  - [클래스·모듈 계층 구조](#클래스모듈-계층-구조)
  - [영향 범위 분석 (호출 측 전수)](#영향-범위-분석-호출-측-전수)
  - [공유 상태·동시성 분석](#공유-상태동시성-분석)
- [외부 라이브러리 API 실제 동작 확인](#외부-라이브러리-api-실제-동작-확인)
- [§F production 시그니처·트랜잭션 경계 변경 — 호출 측/회귀 영향 (PROC-001)](#f-production-시그니처트랜잭션-경계-변경--호출-측회귀-영향-proc-001)
- [인정되는 한계 및 안전망](#인정되는-한계-및-안전망)
- [배포 환경 영향 추정](#배포-환경-영향-추정)
- [context.md 부정합 사전 점검](#contextmd-부정합-사전-점검)
- [기술 선택 조사](#기술-선택-조사)
- [엣지 케이스 및 한계](#엣지-케이스-및-한계)

---

## 분석 범위 게이트 결과

plan.md "핵심 설계"의 변경 대상 모듈로 분석 범위를 한정한다.

| 변경 대상 | 파일 | 게이트 적용 |
|---|---|---|
| 트랙 1 rate limit | `shared/security/*`(신규), `auth.controller.ts`, `app.module.ts` | §A·§B 적용, §외부라이브러리 검증 적용(신규 도입) |
| 트랙 2 trust proxy | `main.ts` | §B |
| 트랙 3 path 3c 원자화 | `social-auth.service.ts` | §B·§C·§F |
| 트랙 4 세션 폐기 원자화 | `auth.repository.ts`, `auth.service.ts` | §B·§C·§F |
| 트랙 5 감사 로그 | `shared/security/security-audit.logger.ts`(신규), `auth.util.ts`, `auth.service.ts` | §B |

- §D(다단계 병렬 파이프라인): plan 미요구 → 건너뜀.
- §E(동일 가드 조건 결정 통합): plan 미요구, 해당 패턴 없음 → 건너뜀.
- §외부 라이브러리 검증: `@nestjs/throttler` **신규 도입**이므로 수행. `nestjs-pino PinoLogger` 는 기존 의존이나 신규 사용 방식(주입)이므로 DI 가능 여부만 확인.
- §F: production 트랜잭션 경계 변경(sync 유지·시그니처 불변이나 실행 컨텍스트 변경) 2건 → 수행.

---

## 기존 코드베이스 분석

> context.md 에 기술된 전체 구조는 중복하지 않는다. 본 spec 변경 대상 한정.

### 클래스·모듈 계층 구조

| 심볼 | 위치 | 성격 | 본 spec 관련 |
|---|---|---|---|
| `AuthService` | `modules/auth/auth.service.ts` | `@Injectable` concrete | 생성자에 `PrismaService`·`SecurityAuditLogger` 주입(additive), `resetPassword`·`findEmail` 변경 |
| `SocialAuthService` | `modules/auth/social-auth.service.ts` | `@Injectable` concrete | 생성자에 `PrismaService` 주입(additive), `login` path 3c 변경 |
| `AuthRepository` | `modules/auth/auth.repository.ts` | `@Injectable` concrete, users 스키마 한정(P-001) | `revokeAllRefreshTokensByUser` tx-aware 전환 |
| `PrismaService` | `shared/prisma/prisma.service.ts` | `PrismaClient` 확장, ALS tx-aware | `tx` getter(als 활성 시 tx client, 비활성 시 root), `runInTransaction`(재진입 안전) — 기존 그대로 재사용 |
| `AuthController` | `modules/auth/auth.controller.ts` | `@Controller('auth')` | 5개 라우트에 `@Throttle` 데코레이터 부착 |
| `FlyThrottlerGuard`(신규) | `shared/security/fly-throttler.guard.ts` | `ThrottlerGuard` 확장 예정 | `getTracker` override + 429 로깅 |
| `SecurityAuditLogger`(신규) | `shared/security/security-audit.logger.ts` | `@Injectable` concrete, `PinoLogger` 래퍼 | 감사 로그 3종 |
| `SecurityModule`(신규) | `shared/security/security.module.ts` | 공통 인프라 모듈 | ThrottlerModule.forRoot + APP_GUARD + SecurityAuditLogger export |

**상속·인스턴스화 확인**:
- `ThrottlerGuard`(from `@nestjs/throttler`)는 `extends` 가능한 concrete 클래스(추상 아님). `getTracker`/`throwThrottlingException`/`getRequestResponse` 는 `protected` 확장점. **설치 후 Development 가 시그니처 확정**(§F/tasks 배선).
- `PinoLogger`(nestjs-pino)는 `@Injectable` 제공자. `LoggerModule` 이 `@Global()`(코드 확인: `node_modules/nestjs-pino/LoggerModule.js:91` `common_1.Global()`)이며 `AppModule` 에서 `LoggerModule.forRoot()` 임포트됨 → `PinoLogger` 는 **전역 DI 가능**. `SecurityModule`/`AuthModule` 이 별도 import 없이 `SecurityAuditLogger` 에서 `PinoLogger` 주입 가능(DI 오류 없음).

### 영향 범위 분석 (호출 측 전수)

| 파일 | 변경 유형 | 영향 내용 |
|---|---|---|
| `apps/backend/package.json` | 수정 | `@nestjs/throttler` 신규 의존 1건 추가 |
| `apps/backend/src/main.ts` | 수정 | `NestExpressApplication` 타입 지정 + `app.set('trust proxy', 1)` |
| `apps/backend/src/app.module.ts` | 수정 | `SecurityModule` import (전역 가드 활성) |
| `apps/backend/src/shared/security/security.module.ts` | 신규 | ThrottlerModule.forRoot + APP_GUARD(FlyThrottlerGuard) + SecurityAuditLogger provide/export |
| `apps/backend/src/shared/security/throttle.constants.ts` | 신규 | THROTTLE_* 상수(NFR 단일 소스) |
| `apps/backend/src/shared/security/client-ip.util.ts` | 신규 | `resolveClientIp(req): string` 순수 함수(SC-009 테스트 seam) |
| `apps/backend/src/shared/security/fly-throttler.guard.ts` | 신규 | `FlyThrottlerGuard extends ThrottlerGuard` |
| `apps/backend/src/shared/security/security-audit.logger.ts` | 신규 | `SecurityAuditLogger`(감사 로그 3종, best-effort) |
| `apps/backend/src/modules/auth/auth.controller.ts` | 수정 | 5개 라우트 `@Throttle` 데코레이터 |
| `apps/backend/src/modules/auth/auth.module.ts` | 수정 | `SecurityModule` import(SecurityAuditLogger 주입 위함) |
| `apps/backend/src/modules/auth/social-auth.service.ts` | 수정 | path 3c `runInTransaction` 래핑 + `PrismaService` 주입 |
| `apps/backend/src/modules/auth/auth.service.ts` | 수정 | `resetPassword` tx 통합 + `PrismaService`·`SecurityAuditLogger` 주입 + `findEmail`·OTP 실패 감사 로그 |
| `apps/backend/src/modules/auth/auth.repository.ts` | 수정 | `revokeAllRefreshTokensByUser` root→`this.prisma.tx` 전환 |
| `apps/backend/src/modules/auth/auth.util.ts` | 수정 | `maskPhone` 신규 함수 |
| `apps/backend/src/health/health.controller.ts` | 수정(선택) | `GET /health` 에 `@SkipThrottle()`(Fly 헬스체크 폴링 보호). 최소 변경 — health 모듈만 영향 |

**테스트 영향(호출 측 mock)** — 아래 기존 spec 파일은 대상 서비스 생성자 DI 추가로 **provider mock 보강 필요**(SC-020 회귀축):
- `src/modules/auth/auth.service.spec.ts` — AuthService provider 에 `PrismaService`·`SecurityAuditLogger` mock 추가.
- `src/modules/auth/social-auth.service.spec.ts` / `social-auth.service.autolink-policy.spec.ts` / `social-auth.service.naver-autolink-exclusion.spec.ts` / `social-auth.service.naver-state.spec.ts` / `social-auth.service.naver.spec.ts` — SocialAuthService provider 에 `PrismaService` mock 추가.

### 공유 상태·동시성 분석

| 공유 자원 | 위험 | 안전성 근거 / 설계 |
|---|---|---|
| rate limit 인-메모리 카운터(`ThrottlerStorageService`) | 동일 프로세스 내 요청 간 카운터 공유 | 라이브러리 내부 원자적 카운팅. 단일 Fly 인스턴스(scale-to-zero) 전제로 프로세스 로컬로 충분(NFR-007). 다중 인스턴스는 spec "범위 외". **Lock 불요.** |
| 트랙 3 path 3c `createUser`+`createSocialAccount` | 비원자 순차 쓰기 → orphan user | `runInTransaction` 콜백으로 감싸 두 INSERT 원자화. **P2002 동시성 폴백 catch 는 트랜잭션 외부 유지**(롤백 후 root 클라이언트로 race 복구 조회 필요 — SC-011). `issueTokensForUser`(refresh 발급)는 커밋 후 외부 호출(원자성 대상 아님). |
| 트랙 4 `resetPassword` 비밀번호변경+세션폐기 | 비원자 best-effort → 세션 미폐기 | `markOtpConsumed`(내부 `runInTransaction`)+`revokeAllRefreshTokensByUser` 를 단일 `runInTransaction` 통합. `PrismaService.runInTransaction` 은 `if(als.getStore()) return fn()` 재진입 안전 → 중첩 `$transaction` 없이 외부 tx 재사용. `revokeAllRefreshTokensByUser` 를 `this.prisma.tx` 로 전환해야 롤백 참여(root 유지 시 별도 커넥션으로 롤백 미참여). |
| `SecurityAuditLogger` 로깅 | 없음(부수효과 stdout) | best-effort try/catch — 로깅 실패가 원 흐름·응답 불변(FR-010). |

**Check-Then-Act 패턴**: path 3c 의 `findByProviderAndProviderId`(3a)→`findUserByEmail`(3b)→`createUser`(3c)는 비원자 조회 후 쓰기이나, **이 부분은 본 spec 변경 대상 아님**(3c 내부 두 쓰기만 원자화). 동시성 경합은 기존 P2002 폴백이 흡수(SC-011 회귀 방지 대상). Lock 미도입 — 기존 낙관적 재시도 패턴 유지.

---

## 외부 라이브러리 API 실제 동작 확인

### `@nestjs/throttler` (신규 도입 — 미설치)

- **최신 안정 버전**: `6.5.0`(`npm view @nestjs/throttler version` 확인). NestJS 11 호환 major = v6. `apps/backend` 및 워크스페이스 루트 `node_modules` 모두 **미설치 확인**.
- 미설치이므로 venv/소스 인용 불가 → **public API 가정 + Development 설치 후 확정(§F 배선)** 으로 처리. 아래는 v5/v6 공식 문서 기반 가정이며, **Development(4단계)가 설치 직후 `node_modules/@nestjs/throttler` 소스로 각 [TO-VERIFY] 를 확정**한 뒤 구현한다.

| API | 가정 시그니처(public) | [TO-VERIFY] | fallback |
|---|---|---|---|
| 모듈 등록 | `ThrottlerModule.forRoot([{ name: 'default', ttl: 60000, limit: 20 }])` (배열 shorthand). v5+ **ttl 단위 = 밀리초(ms)** | ttl 단위(ms)·배열 vs `{throttlers:[...]}` 형태 | `{ throttlers: [...] }` 객체 형태로 대체 |
| 라우트 override | `@Throttle({ default: { limit, ttl } })` (throttler name 키 record) | 데코레이터 인자 형태(`{default:{...}}`) | — |
| 전역 등록 | `{ provide: APP_GUARD, useClass: FlyThrottlerGuard }` | — | — |
| tracker 확장 | `protected getTracker(req: Record<string, any>): Promise<string>` | **param 목록(req 단독 vs (req, context))·async 여부** | `resolveClientIp` 순수 함수로 로직 분리(guard 는 얇은 위임) → 시그니처 변동 흡수 |
| 429 훅 | `protected throwThrottlingException(context: ExecutionContext, detail: ThrottlerLimitDetail): Promise<void>`. `detail.tracker` = getTracker 결과(IP) | **throwThrottlingException 인자·detail 필드(tracker 존재)** | 전역 `ThrottlerExceptionFilter` 로 429 로깅 갈음(ADR-008 2순위) |
| 요청 추출 | `protected getRequestResponse(context): { req, res }` | 존재·반환형 | `context.switchToHttp().getRequest()` 직접 사용 |
| 예외 | `ThrottlerException`(HTTP 429) | import 경로 | — |
| skip | `@SkipThrottle()` | — | — |

> **설계 흡수 전략**: IP 해석 로직을 `resolveClientIp(req)` **순수 함수**로 분리하여 `getTracker` 는 이를 위임만 한다. 429 로깅 대상(endpoint·ip)도 `SecurityAuditLogger.rateLimitExceeded(endpoint, ip)` 로 분리한다. 따라서 throttler 정밀 시그니처가 가정과 달라도 **핵심 로직(IP 해석·로깅)은 라이브러리 API 표면과 분리**되어 영향이 국소화된다. 이 분리가 [TO-VERIFY] 리스크의 안전망이다.

### `nestjs-pino PinoLogger` (기존 의존 — 신규 사용 방식)

- `PinoLogger.warn` 시그니처(코드 확인 `node_modules/nestjs-pino/PinoLogger.d.ts`): `warn(obj: unknown, msg?: string, ...args): void` 오버로드 존재 → **구조적 객체 로깅**(`logger.warn({ event, email }, msg)`) 지원. FR-007~009 의 `event` 필드 기반 감사 로그에 적합.
- `LoggerModule` = `@Global()` 확인(위) → DI 오류 없음.
- **비정상 lifecycle 시나리오(PROC-013)**: PinoLogger 는 private lifecycle flag/in-memory cache stuck 분기 없음(단순 pino wrapper). in_progress/timeout/race/cache-invalidation 4항 모두 해당 없음 → public API 안전.

---

## §F production 시그니처·트랜잭션 경계 변경 — 호출 측/회귀 영향 (PROC-001)

> 본 spec 은 시그니처(인자·반환형) **자체는 불변**이나, **실행 트랜잭션 컨텍스트가 변경**(root→tx / 순차→원자)되어 기존 테스트의 mock 전제가 깨질 수 있다. PROC-001 관점으로 호출 측·회귀 영향을 식별한다.

### 변경 대상 production 메서드

| 메서드 | 시그니처 변화 | 실행 컨텍스트 변화 |
|---|---|---|
| `AuthRepository.revokeAllRefreshTokensByUser(userId)` | 불변(`Promise<void>`) | `this.prisma.refreshToken`(root) → `this.prisma.tx.refreshToken`(tx-aware). tx 외부 호출 시 `prisma.tx`=root 로 **기존 동작 동일** |
| `AuthService.resetPassword(email, otp, newPassword)` | 불변(`Promise<void>`) | `markOtpConsumed` + `revokeAllRefreshTokensByUser` 를 단일 `runInTransaction` 으로 통합 |
| `SocialAuthService.login(provider, token, state?)` | 불변(`Promise<SocialLoginResult>`) | path 3c `createUser`+`createSocialAccount` 를 `runInTransaction` 래핑 |
| 생성자(2개) | `AuthService`(+PrismaService,+SecurityAuditLogger), `SocialAuthService`(+PrismaService) | DI additive — NestJS 자동 주입, production 호출 측 무변경 |

### 호출 측 테스트 전수 (grep 결과)

`grep -rn "revokeAllRefreshTokensByUser|resetPassword|createSocialAccount" src test`:

| 호출 측 파일 | 영향 | 마이그레이션 필요 |
|---|---|---|
| `src/modules/auth/auth.service.ts:280` | production 유일 caller(resetPassword 내부) | 본 spec 이 직접 변경 |
| `src/modules/auth/auth.service.spec.ts` (57·475·483행) | resetPassword mock 테스트. `mockAuthRepository.revokeAllRefreshTokensByUser` spy | **필요** — AuthService provider 에 `PrismaService` mock(`runInTransaction: (fn)=>fn()`) + `SecurityAuditLogger` mock 추가. 미추가 시 DI 실패로 전 테스트 회귀 |
| `src/modules/auth/social-auth.service*.spec.ts` (5개 파일) | path 3c·P2002 폴백 테스트 | **필요** — SocialAuthService provider 에 `PrismaService` mock(`runInTransaction:(fn)=>fn()`, `tx` getter) 추가 |

### 회귀 위험 판정 (핵심 — PROC-001)

1. **SC-011 (소셜 재로그인/신규가입/P2002 폴백)**: path 3c 를 `runInTransaction` 으로 감싸도 **P2002 catch 는 트랜잭션 외부**에 유지되므로 폴백 경로(롤백→root 조회) 회귀 없음. 단, **기존 5개 social-auth spec 이 `runInTransaction` mock 없이 실행되면 path 3c 진입 테스트가 `this.prisma.runInTransaction is not a function` 으로 FAIL**. → mock 보강이 회귀 방지의 핵심. mock 은 `runInTransaction: jest.fn(async (fn) => fn())` 로 콜백을 실제 실행해야 내부 두 repo 호출이 유지된다.
2. **P2002 폴백 트랜잭션 외부 유지**: ADR-005 핵심 분기. catch 를 콜백 내부로 넣으면 롤백 후 root 조회 불가 → SC-011 회귀. 구현·테스트 모두 catch 위치를 트랜잭션 **밖**으로 고정.
3. **resetPassword 재진입 트랜잭션**: `markOtpConsumed(options)` 내부 `runInTransaction` 이 외부 `runInTransaction` 안에서 재진입 → `PrismaService.runInTransaction` 의 `if(als.getStore()) return fn()`(prisma.service.ts:50) 로 기존 tx 재사용, 중첩 `$transaction` 없음. **단위 mock 에서는** `runInTransaction:(fn)=>fn()` 이 재진입도 그대로 통과시키므로 회귀 없음. **e2e(SC-013)** 에서 실 tx 재진입·롤백 검증 필수(PROC-013-01 — tx-aware 심볼 e2e 매핑).
4. **PROC-001 representation/binding 점검**: 본 spec 은 로그 f-string↔%-style 전환·모듈레벨 바인딩 전환 없음. 신규 감사 로그는 `PinoLogger` 주입 mock 으로 검증(patch target 안정). representation 회귀 사각지대 없음.

### 호출 측 마이그레이션 범위 포함 여부

- **본 spec 범위 포함**: 위 6개 spec 파일의 mock 보강은 SC-020(회귀 0건)·SC-011 이 명시 요구 → tasks.md 에 마이그레이션 태스크로 포함. `SCOPE_VIOLATION` 아님(spec.md SC-011·SC-020 이 근거).

---

## 인정되는 한계 및 안전망

| 한계 | 안전망 |
|---|---|
| `@nestjs/throttler` 정밀 시그니처 미설치 상태 가정 | Development 설치 후 소스 확정(§F [TO-VERIFY]) + IP해석/로깅 로직을 라이브러리 표면과 분리(`resolveClientIp`·`SecurityAuditLogger`) |
| SC-010(path 3c 롤백)이 단위 mock 검증 | mock `runInTransaction` throw 전파로 "커밋 안 됨"(issueTokens 미호출) 검증. 실 롤백은 논리 등가(runInTransaction 이 throw 시 $transaction rollback) |
| Fly-Client-IP 실 헤더 주입은 로컬 재현 불가 | SC-008(정적)+SC-009(헤더 mock 단위)로 대리, 실주입은 PROC-014 운영 사후 검증 |
| best-effort 로깅으로 감사 로그 유실 가능 | Fly 로그 스트림 수집(infra.md §4). DB 영속·SIEM 은 spec "범위 외" |

---

## 배포 환경 영향 추정

- **점검 대상 환경 특이성**: Fly.io 엣지 프록시의 클라이언트 IP 전달(컨테이너 NAT·L4 프록시). `trust proxy` 미설정 시 `req.ip` = 프록시 연결 IP 단일 버킷 → rate limit 운영 무력화(FR-004/NFR-008 이 차단).
- **infra.md cross-reference**: `.claude/docs/infra.md` §2/§8 에 `Fly-Client-IP`/`X-Forwarded-For`/`trust proxy` 기재 없음(spec PROC-009 확인). → **GAP-018-01 이미 등재**(gaps.md). 본 spec 이 코드로 `trust proxy: 1` + `resolveClientIp`(Fly-Client-IP→XFF→req.ip)를 도입하고, Docs/Retrospective 가 infra.md additive 갱신.
- **다중 layer 안전망**: 애플리케이션 layer 는 `resolveClientIp` 가 Fly-Client-IP 우선·XFF fallback·req.ip 최종 fallback(undefined 반환 금지)으로 방어. socket layer 는 본 spec 범위 아님(rate limit 은 HTTP layer).

---

## context.md 부정합 사전 점검

- 변경 대상 클래스·필드·Enum 을 context.md §2 핵심 모듈 / §5 도메인 용어에서 grep.
- 본 spec 은 **신규 클래스 추가(SecurityModule/FlyThrottlerGuard/SecurityAuditLogger)** 와 **auth 서비스 트랜잭션 경계 조정**뿐, 기존 context.md 정의(Enum 값·필드 의미)를 **부정합화하지 않는다**. AUTO_LINK_PROVIDERS·소셜 path 정의 불변.
- **context.md 갱신 예상 항목**(부정합 아닌 additive): §2 핵심 모듈에 `shared/security/` 신규 행 추가, §6 알려진 제약의 auth 보안 부채 4행(rate limit·path 3c·resetPassword·감사로그)을 RESOLVED 전이 가능 상태로 기재. → 6단계 Docs Agent 가 반영(본 spec 이 직접 수정 금지 — MUST NOT).

---

## 기술 선택 조사

plan.md "결정 기록 (ADRs)" ADR-001~010 과 cross-reference. Design 단계 추가 검증 결과:

- **ADR-001(@nestjs/throttler)**: NestJS 네이티브 가드·데코레이터·인-메모리 스토리지. v6.5.0 최신 확인. `express-rate-limit` 대비 DI/데코레이터 통합 우위 재확인 — 채택 유지.
- **ADR-007(SecurityAuditLogger PinoLogger 래퍼)**: 코드베이스 관행은 `@nestjs/common` Logger(`new Logger(name)`)이나, FR-007~009 가 **구조적 `event` 필드 로깅**(Fly 로그에서 `event=otp_verification_failed` 로 쿼리)을 요구하므로 `PinoLogger.warn(obj, msg)` 오버로드가 적합. `@nestjs/common` Logger.warn(message, context)는 객체 필드 구조화가 부적합. **PinoLogger 채택 유지** — DI 는 `@Global()` LoggerModule 로 안전. (설계 판단 근거 명시: 관행 이탈이 아닌 요구 정합.)
- **신규 seam(Design 추가 — D4 최적화)**: `resolveClientIp(req): string` 순수 함수 분리. 이유: (1) throttler `getTracker` 시그니처 [TO-VERIFY] 리스크를 라이브러리 표면과 분리, (2) SC-008/009 를 guard 생성자 DI 없이 순수 함수로 테스트(테스트 seam 단순화). ADR 표에 없는 **구현 세부 분해**이므로 Planning 복귀 불요(결정 방향 불변, 테스트 용이성 향상).

---

## 엣지 케이스 및 한계

| 케이스 | 처리 |
|---|---|
| `resolveClientIp` 헤더 부재/배열/멀티값 | `Fly-Client-IP` 없으면 `X-Forwarded-For` 첫 항목(`.split(',')[0].trim()`), 둘 다 없으면 `req.ip`. `Array.isArray` 방어. 최종 undefined 반환 금지(빈 값이면 `req.ip ?? 'unknown'`) |
| `maskPhone` 짧은 값·구분자 없음 | 길이 <4 이면 전체 마스킹, 그 외 뒤 4자리만 노출(`*` 반복 + slice(-4)). 예외 없이 문자열 반환 |
| `maskEmail` local 1~2자 | 기존 함수 그대로(`ab@x`→`ab**@x`, `a@x`→`a**@x`) — 재사용 |
| 전역 가드 e2e 회귀(동일 IP 임계 초과) | 각 jest e2e 파일이 독립 Nest 앱(신규 인-메모리 스토리지)으로 카운터 격리. rate limit e2e 는 고유 `X-Forwarded-For` 로 버킷 분리. 회귀 발생 스위트는 고유 XFF 부여(production 불변) — Test Agent(5b) 확인·정정 |
| `GET /health` 429 오탐 | `@SkipThrottle()` 적용(운영 헬스체크 폴링 보호). auth 라우트에는 skip 금지 |
| SC-013 e2e revoke 강제 실패 | e2e 에서 `jest.spyOn(app.get(AuthRepository), 'revokeAllRefreshTokensByUser').mockRejectedValue(...)` 후 재설정 이전 비밀번호 로그인 가능(롤백) 검증 |

### 소셜/외부 IdP AUTO_LINK 대조표 (PATCH-015-01)

본 spec 은 **AUTO_LINK 화이트리스트를 변경하지 않는다**(트랙 3 은 path 3c 신규 독립 계정 생성 경로의 트랜잭션 원자화만). 참고로 현재 상태 유지:

| provider | 앱바인딩 검증 | 이메일 소유권 검증 | 자동연동 |
|---|---|---|---|
| kakao | app_id 바인딩 有 | (기존 정책) | 허용(AUTO_LINK) |
| google | aud 바인딩 有 | email_verified 有 | 허용(AUTO_LINK) |
| naver | code-exchange 앱바인딩 有 | **없음**(SEC-015-01) | **제외** — path 3a/3c 만 |

- 본 spec 변경(path 3c 트랜잭션 래핑)은 naver 제외 정책·SEC-015-01 에 영향 없음. path 3c 는 provider 무관 신규 독립 계정 생성 공통 경로이며, naver 의 3b(자동연동) 차단은 그대로 유지된다.
</content>
