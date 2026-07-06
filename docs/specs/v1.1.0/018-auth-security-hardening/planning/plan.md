---
작성: Planning Agent
버전: v1.0
최종 수정: 2026-07-04 [시각 미확인, spawn 기준 03:53]
상태: 확정
---

# Plan: 018-auth-security-hardening

> Branch: 018-auth-security-hardening | Date: 2026-07-04 | Spec: [../spec/spec.md](../spec/spec.md)

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

> `.claude/docs/constitution.md` 존재 — 해당 조항(P-001~P-007)을 우선 기준으로 사용한다.
> 본 spec 은 성능 P95 등 수치 NFR 을 신규 도입하지 않으므로 constitution 완화/상향 충돌 없음.

- [x] **P-001 모듈 경계 원칙**: [Pass 기준: 타 도메인 스키마 직접 참조/쿼리 0건]
  - 트랙 3(`SocialAuthService` path 3c)·트랙 4(`AuthService.resetPassword`) 변경은 전부 `users` 스키마(`users.users`·`users.refresh_tokens`·`users.password_reset_otps`·`users.social_accounts`) 내부. `AuthRepository` 는 P-001 주석대로 users 스키마만 접근.
  - 트랙 1(`@nestjs/throttler` 전역 가드)·트랙 5(`SecurityAuditLogger`)는 cross-cutting 인프라로 어떤 도메인 스키마도 쿼리하지 않는다(인-메모리 카운터 + stdout 로그). 전역 `APP_GUARD` 는 라우팅 계층에서 동작하며 DB 미접근.
  - 신규 `shared/security/` 모듈은 4계층 도메인 모듈이 아닌 공통(shared) 인프라 모듈 — `shared/auth`·`shared/prisma` 와 동일 성격. **통과.**
- [x] **P-002 AWS 의존 금지 원칙**: [Pass 기준: `@aws-sdk/*`·Cognito·ElastiCache 등 AWS 신규 의존 0건]
  - 신규 의존은 `@nestjs/throttler` 1건(순수 NestJS 생태계). rate limit 스토리지는 인-메모리(AWS 무관). **통과.**
- [x] **P-003 단일 DB 원칙**: [Pass 기준: PostgreSQL 외 신규 외부 데이터 저장소 0건]
  - NFR-007 명시 — rate limit 은 `@nestjs/throttler` 기본 인-메모리 `ThrottlerStorageService` 로 처리, Redis/Upstash/별도 저장소 미도입. SC-018(정적 검증)이 `package.json` 에 Redis 등 캐시 의존 신규 추가 0건을 강제. **통과.**
- [x] **P-004 클라우드 중립 원칙**: [Pass 기준: Fly.io 전용 API 에 비즈니스 로직 결합 0건]
  - `Fly-Client-IP` 헤더 처리는 **게이트(인프라) 계층**의 `getTracker` 에만 존재하며 비즈니스 로직(Service/Repository)에 결합하지 않는다. tracker 는 표준 `X-Forwarded-For` → `req.ip` fallback 을 함께 지원하여 Fly 미종속(플랫폼 이전 시 헤더 우선순위만 조정). `trust proxy` 는 Express 표준 설정. **통과(header 처리 note).**
- [x] **P-005 결제·정산 정합성 원칙**: [Pass 기준: 결제/환불/정산 상태 변경 없음 → 해당 없음]
  - 본 spec 은 `payment`·`settlement` 모듈을 변경하지 않는다. **해당 없음(N/A) — 통과.**
- [x] **P-006 테스트 원칙**: [Pass 기준: SC-XXX 없는 FR-XXX 0건]
  - FR-001~010 전부 SC 대응(spec 매트릭스). NFR-001~010 전부 SC 대응. 역방향 SC-001~020 전부 FR/NFR 귀속. **통과.**
- [x] **P-007 스펙 범위 원칙**: [Pass 기준: spec.md 범위 외 변경 파일 0건]
  - 변경 대상은 auth 도메인 하드닝 4트랙 + `main.ts`(trust proxy) + `app.module.ts`/신규 `shared/security/` + `package.json`(throttler). spec "범위 외"(트랙 B·C, 소셜 로직, fly.toml, Query DTO)는 손대지 않는다. **통과.**

예외 사항: 없음.

---

## 기술 컨텍스트

- **언어 / 런타임**: TypeScript 5.4 / Node.js 20, NestJS 11, `@nestjs/platform-express` 11 (Express 4 기반)
- **주요 의존성 (기존 승계)**: Prisma 6(`PrismaService` ALS tx-aware — `runInTransaction`/`tx`/`onAfterCommit`), `nestjs-pino`(`PinoLogger`·`Logger` 구조적 로그), `@nestjs/jwt`, class-validator
- **신규 의존성 (1건)**: `@nestjs/throttler` (NestJS 11 호환 major — v6 계열 예상). 인-메모리 스토리지 기본 내장(NFR-007). AWS 무관(P-002).
- **테스트 프레임워크**: Jest 29 + ts-jest(단위 `*.spec.ts`, `rootDir: src`) / jest-e2e(`test/jest-e2e.json`, supertest, PostgreSQL + `NODE_ENV=production`)
- **배포 환경 영향 (PROC-009)**: 본 spec 은 Fly.io 엣지 프록시 경유 배포에 직접 영향. `trust proxy` 미설정 시 모든 요청이 프록시 연결 IP 단일 버킷으로 집계되어 rate limit 이 운영에서 무력화된다(FR-004/NFR-008 이 이를 차단). infra.md §2/§8 additive 갱신은 GAP-018-01 로 등재됨(Design/Docs 코드 검증 후 Retrospective 위임 — 본 spec 이 infra.md 를 직접 수정하지 않음).

---

## 외부 라이브러리 동작 검증

> `@nestjs/throttler` 는 아직 설치 전(package.json 미포함)이라 venv 소스 대신 공식 문서·버전 이력 기반으로 핵심 동작을 검증하고, 정밀 시그니처는 `[TO-VERIFY]` 로 Design 에 위임한다(§13 PATCH-A14 public API 우선). 아래는 설계가 의존하는 가정과 그 근거다.

| 검증 항목 | 가정 | 근거 / 처리 |
|---|---|---|
| 스토리지 기본값 | 별도 storage 미지정 시 인-메모리 `ThrottlerStorageService` 사용 (Redis 불필요) | `@nestjs/throttler` 문서 — 기본 인-메모리. NFR-007/P-003 충족. **public API.** |
| `ttl` 단위 | v5 이후 `ttl`·`ttl`(윈도우)은 **밀리초(ms)** 단위 (v4 이전 초 단위에서 변경) | 60초 = `60_000`. `[TO-VERIFY: 설치 버전의 ttl 단위(ms) — Design 확인]`. 상수(`THROTTLE_TTL_MS`)로 표기하여 단위 오해 방지 |
| named throttler | `forRoot([{ name:'default', ttl, limit }])` + `@Throttle({ default:{ ttl, limit } })` 로 라우트 override | public API. 라우트별 상한 적용 근거(FR-002) |
| custom tracker | `ThrottlerGuard` 를 상속해 `protected getTracker(req): Promise<string>` override 가능 | public 확장점(문서화된 상속 패턴). `[TO-VERIFY: getTracker 시그니처(req 타입)·async 여부 — Design 확인]` |
| 429 훅 | 한도 초과 시 `protected throwThrottlingException(context, detail)` 호출 → override 로 WARN 로깅 후 super 호출 | `[TO-VERIFY: throwThrottlingException 시그니처 — Design 확인]`. override 실패 시 대안: 전역 `ExceptionFilter` 로 `ThrottlerException` 포착 후 로깅(핵심 429 응답 동작은 불변) |

> **인정되는 한계(PATCH-A07)**: 위 `[TO-VERIFY]` 항목(정밀 시그니처)은 설치 시점에 Design 이 `node_modules/@nestjs/throttler` 소스로 확정한다. 만약 `throwThrottlingException` override 가 설치 버전에서 불가능하면 429 로깅은 전역 `ThrottlerExceptionFilter` 로 갈음한다(FR-003 429 응답 자체는 어느 경로든 보장). 이 fallback 이 안전망이다.

---

## 핵심 설계

> 작성 깊이: Design Agent 가 추가 설계 판단 없이 tasks.md 로 분해 가능한 수준. 변경 대상 모듈·시그니처·핵심 분기를 명시한다.

### 트랙 1 — 전역 + 라우트별 rate limit (FR-001·002·003, NFR-001~006)

**신규 모듈** `apps/backend/src/shared/security/`:

- `security.module.ts` — `ThrottlerModule.forRoot([{ name:'default', ttl: THROTTLE_TTL_MS, limit: THROTTLE_DEFAULT_LIMIT }])` 임포트. `APP_GUARD` 로 `FlyThrottlerGuard` 등록(전역 적용). `SecurityAuditLogger` provide + export. `ThrottlerModule` re-export.
- `throttle.constants.ts` — rate limit 임계값 상수(NFR 매핑, 단일 소스):

  | 상수 | 값 | 대응 NFR |
  |---|---|---|
  | `THROTTLE_TTL_MS` | `60_000` | 공통 윈도우 60초 |
  | `THROTTLE_DEFAULT_LIMIT` | `20` | NFR-001 |
  | `THROTTLE_SOCIAL_LOGIN_LIMIT` | `10` | NFR-002 |
  | `THROTTLE_NAVER_STATE_LIMIT` | `20` | NFR-003 |
  | `THROTTLE_FORGOT_PASSWORD_LIMIT` | `5` | NFR-004 |
  | `THROTTLE_FIND_EMAIL_LIMIT` | `5` | NFR-005 |
  | `THROTTLE_RESET_PASSWORD_LIMIT` | `10` | NFR-006 |

- `fly-throttler.guard.ts` — `FlyThrottlerGuard extends ThrottlerGuard`:
  - `getTracker(req)`: `Fly-Client-IP` 헤더 우선 → `X-Forwarded-For` 첫 항목 → `req.ip` fallback (FR-004/NFR-008). 아래 인터페이스 계약 참조.
  - `throwThrottlingException(context, detail)`: `SecurityAuditLogger.rateLimitExceeded(endpoint, tracker)` WARN 로깅 후 `super.throwThrottlingException(...)` 호출(FR-008). best-effort — 로깅은 try/catch 내부(FR-010).

**컨트롤러 override** `auth.controller.ts` — 5개 라우트에 `@Throttle({ default: { ttl: THROTTLE_TTL_MS, limit: <상수> } })` 데코레이터 부착:
`social-login`(10)·`naver/state`(20)·`forgot-password`(5)·`find-email`(5)·`reset-password`(10). override 없는 라우트(예: `login`·`register`)는 전역 기본값(20) 적용(FR-001).

**전역 등록** `app.module.ts` — `SecurityModule` 임포트(전역 가드 활성). `HealthModule`의 `GET /health` 는 `@SkipThrottle()` 적용(Fly 헬스체크 폴링이 429 로 배포를 깨지 않도록 — 운영 안전망, 아래 기타 고려사항 참조).

### 트랙 2 — trust proxy + 실 클라이언트 IP (FR-004, NFR-008, SC-008)

`main.ts` — `NestFactory.create<NestExpressApplication>(AppModule, ...)` 로 타입 지정 후 `app.set('trust proxy', 1)` 호출(Fly 엣지 첫 홉 신뢰). 이후 Express `req.ip`/`req.ips` 가 `X-Forwarded-For` 반영. rate limit 판정 IP 는 `FlyThrottlerGuard.getTracker` 가 결정(Fly-Client-IP 우선). `import { NestExpressApplication } from '@nestjs/platform-express'` 추가.

### 트랙 3 — 소셜 신규가입 path 3c 원자화 (FR-005, SC-010·011)

`social-auth.service.ts` `login()` path 3c(현재 131~144행): `createUser`+`createSocialAccount` 를 `PrismaService.runInTransaction` 콜백으로 감싼다. `SocialAuthService` 생성자에 `PrismaService` 주입(additive). `AuthRepository.createUser`/`createSocialAccount` 는 이미 `this.prisma.tx`(tx-aware)를 사용하므로 콜백 내 호출 시 자동으로 트랜잭션 클라이언트로 실행 → 두 INSERT 원자화.

```
try {
  const newUser = await this.prisma.runInTransaction(async () => {
    const u = await this.repo.createUser({ email, name: profile.name, password: null });
    await this.repo.createSocialAccount({ userId: u.id, provider, providerId: profile.providerId, email, name: profile.name });
    return u;
  });
  return this.authService.issueTokensForUser(newUser); // 커밋 후 발급 — 원자성 대상 아님
} catch (err) {
  // P2002 동시성 폴백(SC-011) — 롤백 완료 후 root 클라이언트로 race 복구 조회. 기존 로직 그대로 유지.
  ...
}
```

> **핵심 분기 보존**: P2002 폴백 catch 는 반드시 `runInTransaction` **외부**에 유지한다. 트랜잭션이 P2002 로 롤백된 뒤 root 클라이언트로 `findByProviderAndProviderId`/`findUserByEmail` race 복구 조회를 수행해야 하므로(SC-011 회귀 방지), catch 를 트랜잭션 안으로 넣지 않는다. `issueTokensForUser`(refresh token 발급)는 원자성 요구 대상이 아니므로 커밋 후 외부에서 호출한다.

### 트랙 4 — resetPassword 세션 폐기 원자화 (FR-006, SC-012·013)

두 지점 변경:

1. `auth.repository.ts` `revokeAllRefreshTokensByUser` — 현재 `this.prisma.refreshToken.updateMany`(root, tx-비인지)를 **`this.prisma.tx.refreshToken.updateMany`(tx-aware)** 로 전환. 이 전환이 없으면 트랜잭션 콜백 안에서 호출해도 별도 커넥션으로 실행되어 롤백에 참여하지 못한다.
2. `auth.service.ts` `resetPassword` — `markOtpConsumed(record.id, {userId, hashedPassword})` 와 `revokeAllRefreshTokensByUser(user.id)` 를 단일 `runInTransaction` 으로 통합:

```
await this.prisma.runInTransaction(async () => {
  await this.authRepository.markOtpConsumed(record.id, { userId: user.id, hashedPassword });
  await this.authRepository.revokeAllRefreshTokensByUser(user.id);
});
```

`AuthService` 생성자에 `PrismaService` 주입(additive). `markOtpConsumed(options)` 는 내부적으로 `runInTransaction` 을 호출하나 `PrismaService.runInTransaction` 은 재진입 안전(`if (als.getStore()) return fn()`)하므로 외부 트랜잭션을 재사용한다(중첩 커밋 없음). 어느 한쪽 실패 시 비밀번호 변경·OTP 소비·세션 폐기 모두 롤백(SC-013).

### 트랙 5 — 보안 감사 로그 3종 (FR-007·008·009·010, NFR-009)

`shared/security/security-audit.logger.ts` — `SecurityAuditLogger`:

- 생성자: `PinoLogger`(nestjs-pino) 주입, `setContext('SecurityAudit')`.
- `otpVerificationFailed(email)`: `logger.warn({ event:'otp_verification_failed', email: maskEmail(email) }, ...)` (FR-007/SC-014). `AuthService.resetPassword` 의 `record.otpHash !== otpHash` 분기에서 호출.
- `rateLimitExceeded(endpoint, ip)`: `logger.warn({ event:'rate_limit_exceeded', endpoint, ip }, ...)` (FR-008/SC-015). `FlyThrottlerGuard.throwThrottlingException` 에서 호출.
- `findEmailAccessed(phone, resultEmail)`: `logger.warn({ event:'find_email_access', phone: maskPhone(phone), email: maskEmail(resultEmail) }, ...)` (FR-009/SC-016). `AuthService.findEmail` 에서 호출.
- **best-effort 래핑(FR-010/SC-017)**: 모든 public 메서드는 내부에서 `try { ... } catch { /* 로깅 실패가 원 흐름 차단 금지 */ }` 로 감싼다. 로깅 예외가 OTP 검증·find-email·429 응답의 상태코드/바디를 바꾸지 않는다.

`auth.util.ts` — **`maskPhone(phone: string): string` 신규 추가**(NFR-009). 뒤 4자리만 노출, 나머지 `*` 치환(예: `01012345678` → `*******5678`). 기존 `maskEmail` 과 동일 파일에 배치(마스킹 유틸 계열 재사용 원칙).

`AuthService` 는 생성자에 `SecurityAuditLogger` 주입(additive). `AuthModule` 은 `SecurityModule` 임포트(SecurityAuditLogger export).

---

## 결정 기록 (ADRs)

| ADR-ID | 결정 항목 | 채택안 | 대안 (검토했으나 채택 안 함) | 근거 (spec FR/NFR 참조) | 영향 범위 |
|---|---|---|---|---|---|
| ADR-001 | rate limit 라이브러리 | `@nestjs/throttler` 도입 | `express-rate-limit`(NestJS DI/데코레이터 미통합) / 커스텀 미들웨어(재구현 비용·검증 부담) | FR-001·002·003, NFR-007 (NestJS 네이티브 가드·데코레이터·인-메모리 스토리지) | `package.json`, `shared/security/`, `auth.controller.ts`, `app.module.ts` |
| ADR-002 | rate limit 스토리지 | 기본 인-메모리 `ThrottlerStorageService` | Redis/Upstash(P-003 위반·비용) / PostgreSQL 테이블(고빈도 write 부하·오버엔지니어링) | NFR-007, P-003 (단일 DB·외부 저장소 금지), spec "범위 외"(다중 인스턴스 확장 시 재검토) | rate limit 상태(프로세스 로컬) |
| ADR-003 | 실 클라이언트 IP 식별 | `FlyThrottlerGuard.getTracker` — Fly-Client-IP → XFF[0] → req.ip | 기본 `getTracker`(req.ips 만 — Fly-Client-IP 미인지) | FR-004, NFR-008, SC-008·009 | `shared/security/fly-throttler.guard.ts` |
| ADR-004 | trust proxy 설정 위치 | `main.ts` `app.set('trust proxy', 1)`(첫 홉 신뢰) | `trust proxy: true`(전체 신뢰 — XFF 스푸핑 표면 증가) / 미설정(req.ip=프록시 IP 단일 버킷화) | FR-004, NFR-008 | `apps/backend/src/main.ts` |
| ADR-005 | path 3c 원자화 | `runInTransaction` 래핑 + P2002 폴백 catch 를 트랜잭션 **외부** 유지 | 폴백을 트랜잭션 내부로 이동(롤백 후 root 조회 불가 → SC-011 회귀) | FR-005, SC-010·011 | `social-auth.service.ts` |
| ADR-006 | 세션 폐기 원자화 | `revokeAllRefreshTokensByUser` tx-aware(`prisma.tx`) 전환 + `resetPassword` 단일 `runInTransaction` 통합 | outbox 패턴(과도 — 세션 폐기는 결제 정합성 아님) / revoke 를 markOtpConsumed 내부로 이동(repo 메서드 결합도 증가) | FR-006, SC-012·013 | `auth.repository.ts`, `auth.service.ts` |
| ADR-007 | 감사 로거 형태 | `SecurityAuditLogger`(PinoLogger 래퍼) 전용 서비스 + best-effort try/catch | 각 서비스에서 직접 `logger.warn`(마스킹·best-effort 중복 구현) / DB 영속 감사 테이블(spec "범위 외") | FR-007·008·009·010, NFR-009 | `shared/security/security-audit.logger.ts` |
| ADR-008 | 429 로깅 지점 | `FlyThrottlerGuard.throwThrottlingException` override | 전역 `ThrottlerExceptionFilter`(2순위 fallback — override 불가 시) | FR-008, SC-015 | `fly-throttler.guard.ts` |
| ADR-009 | 전화번호 마스킹 | `maskPhone` 신규 유틸(auth.util.ts, 뒤 4자리 노출) | 기존 maskEmail 재사용(phone 포맷 부적합) / 마스킹 생략(NFR-009 위반) | NFR-009, SC-016·019 | `auth.util.ts` |
| ADR-010 | throttler/audit 배치 모듈 | `shared/security/` 신규 공통 모듈(가드·로거·상수 집약) | AuthModule 내부 배치(전역 가드·타 모듈 로깅 재사용성 저하) | P-001(공통 인프라 계층 분리), FR-001~010 | `apps/backend/src/shared/security/` |

> 본 표는 Design Agent 의 research.md "기술 선택 조사" 절과 cross-reference 한다. ADR 미작성 결정이 design 단계에 발견되면 status: BLOCKED 로 Planning 복귀.
>
> **NFR 성능 직결 파라미터(PATCH-003) 해당 없음**: 본 spec 은 P95 등 성능 수치 NFR 을 두지 않는다. rate limit 임계값(NFR-001~006)은 성능 목표가 아닌 보안 상한이며 spec 이 "IP 당 N회/60초 이내"로 상한을 확정 제시했다. 위 `THROTTLE_*` 상수는 각 NFR 의 확정값을 단일 권장값으로 표기한다(범위 미제시).

---

## 인터페이스 계약

### 인가 3축 명시 (PATCH-001 / PROC-003)

> 본 spec 이 rate limit 을 부여하는 5개 엔드포인트는 **설계상 익명(anonymous)** 이다(로그인 이전 흐름). 권한 부여·소유권 전이 엔드포인트가 아니므로 (b)소유권·(c)역할 축은 해당 없음 — rate limit 이 익명 남용에 대한 **1차 방어선**이다.

| 엔드포인트 | (a) 호출자 신원(인증) | (b) 대상 자원 소유권 | (c) 역할 | 미검증 축 위험·후속 |
|---|---|---|---|---|
| `POST /auth/social-login` | 익명(by design) | — | — | 익명 남용 → IP rate limit(10/60s)으로 완화. 아웃바운드 증폭 차단(GAP-014-06) |
| `POST /auth/naver/state` | 익명(by design) | — | — | 익명 flooding → IP rate limit(20/60s) + 기존 TTL/opportunistic 정리 |
| `POST /auth/forgot-password` | 익명(by design) | — | — | user enumeration → IP rate limit(5/60s) + 기존 per-email 60초(별도 축) |
| `POST /auth/find-email` | 익명(by design) | — | — | PII enumeration → IP rate limit(5/60s) + 감사 로그(FR-009) |
| `POST /auth/reset-password` | 익명(OTP 소지 증명) | — | — | OTP 브루트포스 → IP rate limit(10/60s) + 기존 OTP_MAX_ATTEMPTS=5(별도 축) |

### 하위 호환성

- **rate limit 도입**: 전역 가드가 모든 라우트에 적용된다. 정상 트래픽(임계값 이하)은 응답 불변. 임계값 초과 시 `429 ThrottlerException`(신규 응답 경로). 기존 200/4xx 계약 불변. `GET /health` 는 `@SkipThrottle()` 로 예외(운영 헬스체크 보호).
- **`SocialAuthService.login`**: 시그니처 불변(`provider, token, state?`). 내부 트랜잭션 래핑만 추가 — 반환형·예외(BadRequest/Conflict/Unauthorized) 계약 불변(SC-011 회귀 없음).
- **`AuthService.resetPassword`**: 시그니처·반환형(void)·예외 계약 불변. 트랜잭션 경계만 확장.
- **`AuthRepository.revokeAllRefreshTokensByUser`**: 시그니처·반환형(void) 불변. 내부 클라이언트를 root→tx-aware 전환 — 트랜잭션 외부 호출 시 기존과 동일 동작(tx 미활성 시 `prisma.tx` 는 root 반환).
- **생성자 DI 추가**: `SocialAuthService`(+PrismaService), `AuthService`(+PrismaService, +SecurityAuditLogger). NestJS DI 자동 주입 — 호출 측 코드 변경 없음. 테스트 모듈은 신규 provider mock 추가 필요(SC-020 회귀 점검 대상).

### 방어 코드

- `getTracker`: 헤더 부재/배열/멀티값 방어(`Array.isArray` 처리, XFF 콤마 분리 `.split(',')[0].trim()`, 최종 `req.ip` fallback — undefined 반환 금지).
- `SecurityAuditLogger` 전 메서드 try/catch(FR-010).
- `maskPhone`/`maskEmail`: 예상 외 포맷(구분자 없음·짧은 값)에도 예외 없이 마스킹 문자열 반환.

---

## 데이터 모델

**변경 없음.** 신규 테이블·컬럼·마이그레이션 없음. rate limit 상태는 인-메모리(비영속). 트랙 3·4 는 기존 테이블(`users.users`·`users.social_accounts`·`users.refresh_tokens`·`users.password_reset_otps`)에 대한 트랜잭션 경계 조정만 수행. (SC-018 이 `package.json` 신규 저장소 의존 0건, Database Design Agent 비활성 근거.)

---

## 테스트 전략

| SC | 테스트 수준 | 테스트 유형 | 시나리오 요약 | 입력 | 기대 결과 |
|---|---|---|---|---|---|
| SC-001 | 통합(e2e) | Error | 전역 기본값 라우트(`/auth/login`) 동일 IP 21회 | 동일 IP 21 req/60s | 21번째 `429` |
| SC-002 | 통합(e2e) | Error | `/auth/social-login` 동일 IP 11회 | 동일 IP 11 req/60s | 11번째 `429` |
| SC-003 | 통합(e2e) | Error | `/auth/naver/state` 동일 IP 21회 | 동일 IP 21 req/60s | 21번째 `429` |
| SC-004 | 통합(e2e) | Error | `/auth/forgot-password` 서로 다른 email·동일 IP 6회 | 동일 IP·상이 email 6 req | 6번째 `429`(IP 축이 per-email 축과 독립 차단) |
| SC-005 | 통합(e2e) | Error | `/auth/find-email` 동일 IP 6회 | 동일 IP 6 req/60s | 6번째 `429` |
| SC-006 | 통합(e2e) | Error | `/auth/reset-password` 동일 IP 11회 | 동일 IP 11 req/60s | 11번째 `429` |
| SC-007 | 단위 | Error | 429 응답이 표준 `ThrottlerException` 형식 | 한도 초과 컨텍스트 | HTTP 429 + 표준 바디 |
| SC-008 | 정적 | (검증) | `main.ts` trust proxy + tracker 가 Fly-Client-IP/XFF 사용 | 소스 grep | 두 요소 코드 존재 확인 |
| SC-009 | 단위 | Edge | 동일 프록시·상이 `X-Forwarded-For` → 상이 tracker 값 | mock req(헤더 2종) | 각각 독립 버킷 키(상이 문자열) |
| SC-010 | 단위 | Error | path 3c 에서 `createSocialAccount` 실패 강제 | createSocialAccount reject | 트랜잭션 롤백 — createUser 미커밋(runInTransaction throw 전파) |
| SC-011 | 단위 | Edge | P2002 동시성 폴백 회귀 없음 | createSocialAccount P2002 → race 존재 | 기존 `social-auth.service.spec.ts` 폴백 테스트 PASS 유지 |
| SC-012 | 단위 | Happy | revoke 가 markOtpConsumed 와 동일 tx 컨텍스트 | resetPassword 정상 | `runInTransaction` 1회 내 두 repo 호출(spy 순서·경계 단언) |
| SC-013 | 통합(e2e) | Error | revoke 실패 강제 시 비밀번호 변경도 롤백 | revoke reject | 재설정 이전 비밀번호로 로그인 가능(롤백 확인) |
| SC-014 | 단위 | Error | OTP 불일치 시 WARN 1건, email 마스킹 | 잘못된 otp | `SecurityAuditLogger.otpVerificationFailed` WARN 1건 + `ab**@...` |
| SC-015 | 단위 | Error | 429 발생 시 WARN 1건, endpoint+IP 포함 | throwThrottlingException 진입 | `rateLimitExceeded` WARN 1건 + endpoint·ip 필드 |
| SC-016 | 단위 | Happy | find-email 시 WARN 1건, phone·email 마스킹 | 유효 phone 조회 | `findEmailAccessed` WARN 1건 + `*******5678`·`ab**@...` |
| SC-017 | 단위 | Error | 로거가 예외를 던져도 원 응답 불변(best-effort) | logger.warn throw mock | OTP/find-email/429 응답 상태코드·바디 로깅 미적용과 동일 |
| SC-018 | 정적 | (검증) | `package.json` Redis 등 저장소 의존 신규 0건 | package.json 파싱 | ioredis/redis/@upstash 등 부재 확인 |
| SC-019 | 단위 | Edge | 로그 문자열에 비마스킹 email/phone 패턴 부재 | 로그 캡처 후 정규식 | 원본 email/phone 정규식 매치 0건 |
| SC-020 | 단위 | Happy | 전체 backend unit 스위트 회귀 0건 | `jest` 전체 | 기존 366+ PASS 유지 + 신규 PASS |

> **테스트 수준 판단**: 429 버킷 동작(SC-001~006)은 실제 가드+스토리지+HTTP 파이프라인 협력이 필요 → 통합(e2e supertest). 가드 로직 단위(getTracker SC-009·429 형식 SC-007), 서비스 트랜잭션 경계(SC-010·011·012)와 로깅(SC-014~017·019)은 mock 기반 단위로 검증 가능.

### 통합/운영 검증 defer 처리 (PATCH-A08 / PROC-010)

- **defer 대상**: `[env:integration]` SC-001~006·SC-013(e2e — PostgreSQL 연결 필요). 프로젝트는 `test:e2e`(jest-e2e + supertest + PostgreSQL, `NODE_ENV=production`) 인프라를 이미 보유하므로 **in-pipeline 실행이 1순위**다.
- **PROC-010 자가 점검**:
  1. **운영 환경 의존성**: rate limit **버킷 카운팅 동작**은 운영 토폴로지 비의존(supertest 로컬 재현 가능) → **N**. 단 **Fly-Client-IP 실 헤더 주입**은 운영 의존 → SC-008(정적)+SC-009(단위 header mock)으로 대리 검증하고 실 주입은 PROC-014 사후 검증에 위임.
  2. **mock 불가 시나리오**: 다수 사용자 NAT/CGNAT 공유 IP 오탐(spec PROC-014 #2), 실제 Fly 엣지 헤더 형태(#1)는 단위 mock 재현 불가 → 운영 관찰 필요.
  3. **권장 옵션**: 버킷 동작(SC-001~006/013)은 e2e 로 in-pipeline 검증 가능하므로 **옵션 A** — main session 이 e2e DB 환경(docker compose postgres)을 구성·기동하면 Test Agent(5b)가 실행. e2e DB 환경이 파이프라인 내 미가용이면 SC-045/046 선례(PROC-03)처럼 deferred 처리하되, 가드 로직은 단위(SC-007·009)로 커버되어 핵심 정확성은 보장된다. 운영 의존 부분은 운영 모니터링(Fly 로그의 `rate_limit_exceeded` WARN 스트림)으로 보완.
- **옵션 결정 위임**: e2e DB 환경 가용 여부는 main session 이 판단. Spec 이 사용자 선택을 확정하지 못한 상태이므로 5b 진입 시 main 이 옵션 A(환경 구성 후 실행) vs deferred(단위 커버+운영 모니터링) 를 결정한다.

### 사후 운영 검증 피드백 사이클 (PROC-014)

spec.md "범위 외 → 사후 운영 검증 피드백 사이클 (PROC-014)" 절에 시나리오 4건(Fly 프록시 헤더 실동작·429 오탐·동시가입 부하·감사 로그 노이즈)과 결함 발견 시 처리 절차(→ spec 수정 이벤트 → cycle N+1 또는 patch spec)가 이미 기재됨. 본 plan 은 이를 승계하며, 운영 배포 후 최소 1주 내 Fly 로그 스트림 샘플 점검을 권장한다(일자 미확정 — 사용자 합의 필요).

### smoke_tests (선택)

- 필요 여부: **N**
- 근거: 전역 가드가 모든 라우트에 적용되나, SC 매핑 테스트(SC-001~020)가 전역/라우트별/health-skip 경로를 이미 포괄한다. 별도 회귀 우려 경로(SC 범위 밖 중요 경로)는 SC-020(전체 unit 회귀)로 충분히 커버되어 추가 smoke 지정 불요.

---

## 기타 고려사항

### 전역 가드의 e2e 회귀 위험 (SC-020 직결)

- 전역 `APP_GUARD`(FlyThrottlerGuard)는 **모든 모듈의 라우트**에 적용된다. 기존 e2e 스위트가 동일 프로세스·동일 IP(`::1`/`127.0.0.1`)로 한 엔드포인트에 60초 내 임계값 초과 요청을 보내면 예기치 않은 `429` 로 기존 테스트가 회귀할 수 있다(NFR-010 위반 위험).
- **완화**: (1) 각 jest e2e 파일은 독립 Nest 앱(신규 인-메모리 스토리지)으로 기동되어 파일 간 카운터가 격리된다. (2) rate limit e2e(SC-001~006)는 의도적으로 임계값을 넘겨야 하므로 테스트마다 고유 `X-Forwarded-For` 헤더를 세팅해 다른 격리 테스트와 버킷을 분리한다. (3) 그럼에도 회귀가 발생하는 스위트는 해당 요청에 고유 `X-Forwarded-For` 를 부여하거나(권장) 문제 라우트에 한해 테스트 셋업에서 격리한다. **Test Agent(5b)가 실제 회귀 유무를 확인**하고, 발생 시 위 (2)/(3) 로 정정한다(production 코드 불변).
- `@SkipThrottle()` 를 남용하지 않는다 — health 만 예외(운영 헬스체크). auth 엔드포인트에는 절대 skip 을 적용하지 않는다(FR-001~002 요구).

### 재진입 안전 트랜잭션(트랙 4)

`markOtpConsumed(options)` 내부 `runInTransaction` 이 `resetPassword` 의 외부 `runInTransaction` 안에서 호출되어 중첩되나, `PrismaService.runInTransaction` 은 `if (this.als.getStore()) return fn()` 으로 재진입 시 기존 tx 를 재사용한다(중첩 `$transaction` 없음). 설계 의존 전제이므로 Design/Test 가 이 재진입 경로를 반드시 검증한다(SC-012·013).

### throttler ttl 단위 오해 방지

임계값은 `THROTTLE_*` 상수로만 표기하고 매직 넘버(`60000`·`20` 등)를 컨트롤러/모듈에 리터럴로 산개시키지 않는다. `THROTTLE_TTL_MS` 명칭에 단위(ms)를 명시하여 초/밀리초 혼동(설치 버전 v5+ ms 단위)을 차단한다.

### best-effort 로깅과 감사 신뢰성

FR-010(로깅 실패가 원 흐름 차단 금지)과 감사 완결성은 trade-off 관계다. 본 spec 은 "차단 금지"를 우선(사용자 지시 — WARN 수준 stdout 로그, DB 영속화는 범위 외). 로그 유실 가능성은 Fly 로그 스트림 수집(infra.md §4)으로 완화되며, SIEM/영속 감사 도입은 별도 spec 대상이다.
</content>
