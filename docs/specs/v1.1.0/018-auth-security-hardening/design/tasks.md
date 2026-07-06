---
작성: Design Agent
버전: v1.0
최종 수정: 2026-07-04 04:12
상태: 확정
---

# Tasks: 018-auth-security-hardening

> Branch: 018-auth-security-hardening | Date: 2026-07-04 | Plan: [../planning/plan.md](../planning/plan.md)

## 목차

- [전제 조건](#전제-조건)
- [태스크 레이어 정의](#태스크-레이어-정의)
- [태스크 목록](#태스크-목록)
  - [Step 1. 선행 설치·상수·순수 유틸](#step-1-선행-설치상수순수-유틸)
  - [Step 2. 보안 인프라 계층 (트랙 1·2·5)](#step-2-보안-인프라-계층-트랙-125)
  - [Step 3. auth 도메인 트랜잭션·감사 로깅 (트랙 3·4·5)](#step-3-auth-도메인-트랜잭션감사-로깅-트랙-345)
  - [Step 4. 테스트 (레이어 D — 5a Test AUTHORING)](#step-4-테스트-레이어-d--5a-test-authoring)
- [Test Authoring Contract](#test-authoring-contract)
- [태스크 입도 가이드](#태스크-입도-가이드)
- [구현 완료 기준](#구현-완료-기준)

---

## 전제 조건

- [x] spec.md 의 모든 `[NEEDS CLARIFICATION]` 항목이 해소되었는가? (spec.md 미결 사항 "없음")
- [x] plan.md 의 Constitution Gates(P-001~007)가 모두 통과되었는가? (예외 0)
- [x] CHANGES.md 후속 작업 주의사항 확인? (v1.1.0/CHANGES.md — 015/016 커밋 완료, auth 도메인 안정)

---

## 태스크 레이어 정의

| 레이어 | 대상 | PPG-1 책임 |
|---|---|---|
| A. 데이터 계층 | Repository(트랜잭션 클라이언트 전환) — DB 스키마 무변경 | 4단계 Development |
| B. 도메인 계층 | Service(트랜잭션 경계·감사 로깅 wiring), 마스킹·감사 로거·상수 | 4단계 Development |
| C. 인터페이스/인프라 계층 | Guard·Module·Controller 데코레이터·main.ts·package.json | 4단계 Development |
| D. 테스트 계층 | 단위·통합·정적·e2e 전 테스트 + 기존 spec mock 보강 | **5a Test Agent (AUTHORING)** |

> 의존 순서 A/B/C 내부는 아래 명시. **레이어 D 는 4단계 A/B/C 와 PPG-1 병렬**로 5a 가 수행한다. Development(4)는 Step 1~3(A·B·C)만, Test(5a)는 Step 4(D)만 담당하여 산출물 충돌이 없다.

---

## 태스크 목록

> [P] = 직전 태스크와 병렬 가능.

### Step 1. 선행 설치·상수·순수 유틸

- [x] **T001** — `@nestjs/throttler` 설치 + v6 API 확정
  - 레이어: C
  - 구현 파일: `apps/backend/package.json`
  - 관련 요구사항: FR-001, NFR-007, ADR-001
  - 상세: `pnpm --filter backend add @nestjs/throttler`(v6.x). **설치 직후** `node_modules/@nestjs/throttler` 소스로 research.md §F [TO-VERIFY] 5항 확정: (1) `ThrottlerModule.forRoot` 인자 형태(배열 shorthand vs `{throttlers:[...]}`)·ttl 단위(ms), (2) `@Throttle` 인자 형태, (3) `getTracker` param 목록·async, (4) `throwThrottlingException` 인자·`detail.tracker` 존재, (5) `ThrottlerException`/`@SkipThrottle`/`getRequestResponse` import 경로. 확정 결과를 plan/research 와 불일치 시 research.md 갱신(02-impl §2-1).
  - 완료 기준: package.json 의존 추가 + typecheck 통과 준비. [TO-VERIFY] 5항 소스 확정 기록.

- [x] **T002** `[P]` — throttle 상수 모듈
  - 레이어: C
  - 구현 파일: `apps/backend/src/shared/security/throttle.constants.ts`(신규)
  - 관련 요구사항: NFR-001~006 (plan.md 상수 표 단일 소스)
  - 상세: `THROTTLE_TTL_MS=60_000`, `THROTTLE_DEFAULT_LIMIT=20`, `THROTTLE_SOCIAL_LOGIN_LIMIT=10`, `THROTTLE_NAVER_STATE_LIMIT=20`, `THROTTLE_FORGOT_PASSWORD_LIMIT=5`, `THROTTLE_FIND_EMAIL_LIMIT=5`, `THROTTLE_RESET_PASSWORD_LIMIT=10`. 매직넘버 리터럴을 컨트롤러/모듈에 산개 금지(단위 ms 명칭 박제).
  - 완료 기준: 7개 상수 export, 각 NFR 주석 매핑.

- [x] **T003** `[P]` — `resolveClientIp` 순수 함수
  - 레이어: C
  - 구현 파일: `apps/backend/src/shared/security/client-ip.util.ts`(신규)
  - 관련 요구사항: FR-004, NFR-008, SC-008, SC-009
  - 상세: `export function resolveClientIp(req): string`. 우선순위: `Fly-Client-IP` 헤더 → `X-Forwarded-For` 첫 항목(`.split(',')[0].trim()`) → `req.ip`. 헤더 배열(`Array.isArray`) 방어, 최종 빈 값이면 `'unknown'` fallback(undefined 반환 금지). 헤더명 소문자 비교(Express 헤더 소문자 정규화).
  - 완료 기준: 순수 함수 export, throttler 미의존(guard 와 분리 — 테스트 seam).

- [x] **T004** `[P]` — `maskPhone` 유틸
  - 레이어: B
  - 구현 파일: `apps/backend/src/modules/auth/auth.util.ts`
  - 관련 요구사항: NFR-009, SC-016, SC-019, ADR-009
  - 상세: `export function maskPhone(phone: string): string` — 뒤 4자리만 노출, 나머지 `*`. `01012345678`→`*******5678`. 길이<4 는 전체 마스킹. 구분자 없음·예상외 포맷에도 예외 없이 문자열 반환. 기존 `maskEmail` 과 동일 파일.
  - 완료 기준: 함수 export, 기존 maskEmail 불변.

### Step 2. 보안 인프라 계층 (트랙 1·2·5)

- [x] **T005** — `SecurityAuditLogger`
  - 레이어: B
  - 구현 파일: `apps/backend/src/shared/security/security-audit.logger.ts`(신규)
  - 관련 요구사항: FR-007·008·009·010, NFR-009, SC-014~017·019, ADR-007
  - 상세: `@Injectable class SecurityAuditLogger`. 생성자 `PinoLogger` 주입(nestjs-pino, `@Global` LoggerModule — DI 안전) + `setContext('SecurityAudit')`. 메서드 3종:
    - `otpVerificationFailed(email)`: `logger.warn({ event:'otp_verification_failed', email: maskEmail(email) }, 'OTP verification failed')`
    - `rateLimitExceeded(endpoint, ip)`: `logger.warn({ event:'rate_limit_exceeded', endpoint, ip }, 'Rate limit exceeded')`
    - `findEmailAccessed(phone, resultEmail)`: `logger.warn({ event:'find_email_access', phone: maskPhone(phone), email: maskEmail(resultEmail) }, 'find-email accessed')`
    - **전 메서드 내부 `try { ... } catch { /* best-effort: 원 흐름 차단 금지 */ }`**(FR-010/SC-017).
  - 완료 기준: 3 메서드 + best-effort 래핑 + maskEmail/maskPhone 재사용. PinoLogger 주입 DI 성립.

- [x] **T006** — `FlyThrottlerGuard`
  - 레이어: C
  - 구현 파일: `apps/backend/src/shared/security/fly-throttler.guard.ts`(신규)
  - 관련 요구사항: FR-004·008, NFR-008, SC-008·015, ADR-003·008 (T001·T003·T005 선행)
  - 상세: `class FlyThrottlerGuard extends ThrottlerGuard`. 생성자에 `SecurityAuditLogger` 추가 주입(super 는 throttler 기본 3인자 — 설치 후 정확 인자 확정). override:
    - `getTracker(req)`: `return Promise.resolve(resolveClientIp(req))`(위임만).
    - `throwThrottlingException(context, detail)`: `getRequestResponse(context).req` 에서 endpoint(`req.route?.path ?? req.originalUrl`), IP=`detail.tracker`(= getTracker 결과) 추출 → `this.securityAuditLogger.rateLimitExceeded(endpoint, ip)` 호출 후 `super.throwThrottlingException(context, detail)`. (SecurityAuditLogger 가 이미 best-effort 이므로 추가 try 불요.)
  - 완료 기준: getTracker·throwThrottlingException override, resolveClientIp 위임, 429 super 호출 유지. **fallback(ADR-008)**: 설치 버전에서 override 불가 시 전역 `ThrottlerExceptionFilter` 로 로깅 갈음(429 응답 불변).

- [x] **T007** — `SecurityModule`
  - 레이어: C
  - 구현 파일: `apps/backend/src/shared/security/security.module.ts`(신규)
  - 관련 요구사항: FR-001~010, ADR-010 (T002·T005·T006 선행)
  - 상세: `ThrottlerModule.forRoot([{ name:'default', ttl:THROTTLE_TTL_MS, limit:THROTTLE_DEFAULT_LIMIT }])` import(설치 후 인자 형태 확정). providers: `SecurityAuditLogger` + `{ provide: APP_GUARD, useClass: FlyThrottlerGuard }`. exports: `SecurityAuditLogger`, `ThrottlerModule`(re-export — `@Throttle` 사용 모듈 위함).
  - 완료 기준: 전역 가드 등록, SecurityAuditLogger export.

- [x] **T008** `[P]` — `main.ts` trust proxy
  - 레이어: C
  - 구현 파일: `apps/backend/src/main.ts`
  - 관련 요구사항: FR-004, NFR-008, SC-008, ADR-004
  - 상세: `NestFactory.create<NestExpressApplication>(AppModule, ...)` 타입 지정 + `app.set('trust proxy', 1)`(첫 홉만 신뢰). `import { NestExpressApplication } from '@nestjs/platform-express'` 추가.
  - 완료 기준: trust proxy 1 설정 + 타입 import. SC-008 정적 grep 대상 텍스트 존재.

- [x] **T009** — `app.module.ts` SecurityModule 등록
  - 레이어: C
  - 구현 파일: `apps/backend/src/app.module.ts`
  - 관련 요구사항: FR-001 (T007 선행)
  - 상세: `imports` 에 `SecurityModule` 추가(전역 가드 활성).
  - 완료 기준: 전 라우트에 전역 rate limit 적용.

- [x] **T010** — `auth.controller.ts` 라우트별 `@Throttle`
  - 레이어: C
  - 구현 파일: `apps/backend/src/modules/auth/auth.controller.ts`
  - 관련 요구사항: FR-002, NFR-002~006, SC-002~006 (T001·T002 선행)
  - 상세: 5개 라우트에 `@Throttle({ default: { ttl: THROTTLE_TTL_MS, limit: <상수> } })` 부착 — `social-login`(SOCIAL_LOGIN=10)·`naver/state`(NAVER_STATE=20)·`forgot-password`(FORGOT_PASSWORD=5)·`find-email`(FIND_EMAIL=5)·`reset-password`(RESET_PASSWORD=10). `login`·`register`·`refresh`·`logout`·`me` 는 override 없음(전역 20). 설치 후 `@Throttle` 인자 형태 확정.
  - 완료 기준: 5개 데코레이터 부착(상수 사용, 리터럴 금지).

- [x] **T011** `[P]` — `GET /health` `@SkipThrottle()`
  - 레이어: C
  - 구현 파일: `apps/backend/src/health/health.controller.ts`
  - 관련 요구사항: FR-001 예외(운영 헬스체크 보호 — plan 기타 고려사항) (T001 선행)
  - 상세: `@Get('health')` 에 `@SkipThrottle()` 부착(Fly 폴링 429 로 배포 깨짐 방지). auth 라우트에는 절대 skip 금지.
  - 완료 기준: health 만 skip, 그 외 불변.

### Step 3. auth 도메인 트랜잭션·감사 로깅 (트랙 3·4·5)

- [x] **T012** — `revokeAllRefreshTokensByUser` tx-aware 전환
  - 레이어: A
  - 구현 파일: `apps/backend/src/modules/auth/auth.repository.ts`
  - 관련 요구사항: FR-006, SC-012·013, ADR-006
  - 상세: `this.prisma.refreshToken.updateMany(...)` → `this.prisma.tx.refreshToken.updateMany(...)`. tx 외부 호출 시 `prisma.tx`=root 로 **기존 동작 동일**(하위 호환). 이 전환 없으면 트랜잭션 콜백 내 호출 시 별도 커넥션으로 롤백 미참여.
  - 완료 기준: `this.prisma.tx.refreshToken` 사용. 시그니처·반환형 불변.

- [x] **T013** `[P]` — path 3c 원자화
  - 레이어: B
  - 구현 파일: `apps/backend/src/modules/auth/social-auth.service.ts`
  - 관련 요구사항: FR-005, SC-010·011, ADR-005
  - 상세: 생성자에 `PrismaService` 주입(additive). path 3c(131~144행) 의 `createUser`+`createSocialAccount` 를 `this.prisma.runInTransaction(async () => {...})` 콜백으로 래핑, `newUser` 반환. `issueTokensForUser` 는 **커밋 후 트랜잭션 외부** 호출. **P2002 폴백 catch 는 `runInTransaction` 외부 유지**(롤백 후 root 조회 — SC-011 회귀 방지, plan 핵심 분기 보존). autoLinkAllowed 분기·기존 예외 계약 불변.
  - 완료 기준: 두 INSERT 원자화, P2002 폴백 catch 트랜잭션 외부, 반환형·예외 계약 불변.

- [x] **T014** — `resetPassword` tx 통합 + 감사 로깅 + `findEmail` 감사 로깅
  - 레이어: B
  - 구현 파일: `apps/backend/src/modules/auth/auth.service.ts`
  - 관련 요구사항: FR-006·007·009·010, NFR-009, SC-012·013·014·016·017, ADR-006·007 (T005·T012 선행)
  - 상세: 생성자에 `PrismaService`·`SecurityAuditLogger` 주입(additive).
    - `resetPassword`: `record.otpHash !== otpHash` 분기(257행)에서 `this.securityAuditLogger.otpVerificationFailed(email)` 호출(FR-007/SC-014). 하단(275~280행) `markOtpConsumed(...)`+`revokeAllRefreshTokensByUser(...)` 를 단일 `this.prisma.runInTransaction(async () => {...})` 로 통합(FR-006/SC-012·013). `markOtpConsumed` 내부 재진입 tx 는 재사용(중첩 없음).
    - `findEmail`: 반환 직전 `this.securityAuditLogger.findEmailAccessed(phone, user.email)` 호출(FR-009/SC-016). 반환형(`{email: maskEmail(...)}`)·예외 계약 불변.
  - 완료 기준: 감사 로깅 2지점 + resetPassword 단일 트랜잭션. 시그니처·반환형·예외 계약 불변.

- [x] **T015** — `auth.module.ts` SecurityModule import
  - 레이어: C
  - 구현 파일: `apps/backend/src/modules/auth/auth.module.ts`
  - 관련 요구사항: FR-007·009 (T007·T014 선행)
  - 상세: `imports` 에 `SecurityModule` 추가(`SecurityAuditLogger` 를 AuthService 에 주입 위함).
  - 완료 기준: AuthService 의 SecurityAuditLogger DI 성립.

### Step 4. 테스트 (레이어 D — 5a Test AUTHORING)

> 아래 태스크는 **5a Test Agent (AUTHORING)** 가 PPG-1 시작 시 4단계와 병렬 수행한다. Development(4)는 Step 1~3 만 진행한다. 신규/미구현 심볼 import error 는 TDD Red 로 허용, 구현 완료 후 5b 에서 Green.

- [ ] **T016** — 단위: `SecurityAuditLogger`
  - 레이어: D | 테스트 파일: `apps/backend/src/shared/security/security-audit.logger.spec.ts`(신규)
  - 검증 대상: SC-014·015·016·017·019
  - 상세: mock `PinoLogger`(주입) — `warn` spy. 3 메서드 각각 WARN 1건·마스킹 검증(SC-014 email 마스킹, SC-015 endpoint+ip, SC-016 phone+email 마스킹). SC-017: `warn` 이 throw 하도록 mock → 메서드가 throw 하지 않음(best-effort). SC-019: warn 인자 직렬화 후 원본 email/phone 정규식 매치 0건.

- [ ] **T017** `[P]` — 단위: `resolveClientIp`
  - 레이어: D | 테스트 파일: `apps/backend/src/shared/security/client-ip.util.spec.ts`(신규)
  - 검증 대상: SC-009
  - 상세: mock req 2종(상이 `X-Forwarded-For`) → 상이 tracker 문자열. Fly-Client-IP 우선·XFF fallback·req.ip 최종 fallback·배열 방어 케이스.

- [ ] **T018** `[P]` — 단위: `maskPhone`
  - 레이어: D | 테스트 파일: `apps/backend/src/modules/auth/auth.util.spec.ts`(기존 파일 확장)
  - 검증 대상: NFR-009(SC-016 보조)
  - 상세: `01012345678`→`*******5678`, 짧은 값·구분자 없음 케이스. 기존 maskEmail 테스트 불변.

- [ ] **T019** — 단위: social-auth path 3c 원자화 + 기존 spec mock 보강
  - 레이어: D | 테스트 파일: `apps/backend/src/modules/auth/social-auth.service.spec.ts` 및 4개 관련 spec(mock 보강)
  - 검증 대상: SC-010·011, SC-020(회귀)
  - 상세: **5개 social-auth spec 전부** provider 에 `PrismaService` mock 추가(`runInTransaction: jest.fn(async (fn)=>fn())`, `tx` getter). SC-010: `createSocialAccount` reject 강제 → `runInTransaction` throw 전파, `issueTokensForUser` 미호출. SC-011: P2002 폴백(race 존재) 기존 테스트 PASS 유지(트랜잭션 외부 catch).

- [ ] **T020** — 단위: auth.service resetPassword tx + 감사 wiring + mock 보강
  - 레이어: D | 테스트 파일: `apps/backend/src/modules/auth/auth.service.spec.ts`(기존 확장)
  - 검증 대상: SC-012·014·016·017, SC-020(회귀)
  - 상세: AuthService provider 에 `PrismaService` mock(`runInTransaction: jest.fn(async (fn)=>fn())`)+`SecurityAuditLogger` mock 추가. SC-012: resetPassword 정상 시 `runInTransaction` 1회 내 `markOtpConsumed`·`revokeAllRefreshTokensByUser` 호출(spy 경계). SC-014: OTP 불일치 시 `securityAuditLogger.otpVerificationFailed(email)` 1회. SC-016: findEmail 시 `findEmailAccessed(phone, email)` 1회. SC-017: SecurityAuditLogger mock 이 throw 해도 resetPassword/findEmail 원 응답 불변.

- [ ] **T021** `[P]` — 단위: 429 ThrottlerException 형식
  - 레이어: D | 테스트 파일: `apps/backend/src/shared/security/throttler-exception.spec.ts`(신규)
  - 검증 대상: SC-007
  - 상세: `new ThrottlerException()` 의 `getStatus() === 429` + 표준 바디 형식. (설치 후 import.)

- [ ] **T022** `[P]` — 정적: trust proxy + tracker 헤더
  - 레이어: D | 테스트 파일: `apps/backend/test/static/rate-limit-trust-proxy.spec.ts`(신규)
  - 검증 대상: SC-008
  - 상세: `main.ts` 텍스트에 `trust proxy` 존재 + `client-ip.util.ts`(또는 guard) 텍스트에 `fly-client-ip`/`x-forwarded-for`(소문자) 존재 정적 grep. 기존 `test/static/*.spec.ts` 패턴 준용(fs 파싱).

- [ ] **T023** `[P]` — 정적: Redis 등 저장소 의존 부재
  - 레이어: D | 테스트 파일: `apps/backend/test/static/rate-limit-no-redis.spec.ts`(신규)
  - 검증 대상: SC-018
  - 상세: `package.json` 파싱 → deps+devDeps 에 `ioredis`/`redis`/`@upstash/*`/`@nestjs/throttler` 의 redis storage 패키지 부재 확인(`@nestjs/throttler` 자체는 허용, redis storage 어댑터만 금지). `package-no-aws.spec.ts` 패턴 준용.

- [ ] **T024** — e2e: rate limit 429 (in-memory throttler)
  - 레이어: D | 테스트 파일: `apps/backend/test/rate-limit.e2e-spec.ts`(신규)
  - 검증 대상: SC-001·002·003·004·005·006
  - 상세: `Test.createTestingModule({imports:[AppModule]})` 독립 앱 + supertest. 각 SC 별 고유 `X-Forwarded-For` 헤더로 버킷 격리. SC-001 `/auth/login` 21회→21번째 429, SC-002 `/auth/social-login` 11회, SC-003 `/auth/naver/state` 21회, SC-004 `/auth/forgot-password` 상이 email·동일 IP 6회, SC-005 `/auth/find-email` 6회, SC-006 `/auth/reset-password` 11회. 각 429 응답 상태코드 단언. **in-memory throttler 사용**(Redis 불요). trust proxy + XFF 로 IP 분리 검증 겸.

- [ ] **T025** — e2e: resetPassword revoke 실패 롤백
  - 레이어: D | 테스트 파일: `apps/backend/test/auth-reset-atomicity.e2e-spec.ts`(신규)
  - 검증 대상: SC-013
  - 상세: 실 PostgreSQL. 사용자 seed + 유효 OTP seed → `jest.spyOn(app.get(AuthRepository), 'revokeAllRefreshTokensByUser').mockRejectedValue(new Error('forced'))` → `POST /auth/reset-password` 실패 → 재설정 **이전** 비밀번호로 `POST /auth/login` 성공(비밀번호 롤백 확인). e2e DB 환경은 main session 이 옵션 A(docker-compose postgres)로 제공.

- [ ] **T026** — 전체 회귀 확인 (SC-020)
  - 레이어: D | 대상: backend 전체 unit 스위트
  - 검증 대상: SC-020, SC-011(회귀)
  - 상세: mock 보강(T019·T020) 반영 후 `jest`(전체 unit) 회귀 0건 PASS 확인. 신규 provider DI(PrismaService·SecurityAuditLogger) 로 기존 테스트가 깨지지 않는지 검증. (5b 실행 시점 판정.)

---

## Test Authoring Contract

> **PPG-1 의 5a Test Agent (AUTHORING) 입력 contract.** 5a 는 Development(4)와 병렬이라 production 코드를 보지 못하므로 아래 **canonical 심볼**을 기준으로 테스트를 작성한다(가정 불일치 [B] 정정 최소화 — PROC-004).

### Canonical production 심볼 (5a 가정 고정)

| 심볼 | canonical 형태 |
|---|---|
| `PrismaService` mock | `{ runInTransaction: jest.fn(async (fn) => fn()), tx: <root mock>, ... }` — 콜백을 실제 실행(내부 repo 호출 유지), throw 시 전파 |
| `SecurityAuditLogger` | 클래스, 메서드 3종: `otpVerificationFailed(email: string)`, `rateLimitExceeded(endpoint: string, ip: string)`, `findEmailAccessed(phone: string, resultEmail: string)`. 전부 `Promise<void>`/`void`, 내부 best-effort(throw 안 함) |
| `SecurityAuditLogger` 단위 테스트 주입 | `PinoLogger`(nestjs-pino) mock — `{ warn: jest.fn(), setContext: jest.fn() }` |
| `resolveClientIp` | `resolveClientIp(req): string`, 파일 `shared/security/client-ip.util.ts`, throttler 미의존 순수 함수 |
| `maskPhone` | `maskPhone(phone: string): string`, 파일 `modules/auth/auth.util.ts` |
| `ThrottlerException` | `@nestjs/throttler` export, `getStatus()===429` |
| `FlyThrottlerGuard` | `ThrottlerGuard` 상속, `getTracker`·`throwThrottlingException` override(생성자에 `SecurityAuditLogger` 주입) — **guard 직접 단위 테스트 불요**(SC-009=resolveClientIp, SC-015=SecurityAuditLogger 로 seam 분리) |
| `AuthService` 생성자 | 기존 4인자 + `PrismaService` + `SecurityAuditLogger`(총 6) |
| `SocialAuthService` 생성자 | 기존 4인자 + `PrismaService`(총 5) |

> **UI 화면 없음** — 본 spec 은 backend 전용. PATCH-013-01/PROC-014-03(UI harness) 해당 없음.
> **트랜잭션 인지 심볼 e2e 매핑(PROC-013-01)**: `revokeAllRefreshTokensByUser`(`this.prisma.tx`)·resetPassword tx 통합은 단위 mock 이 tx/root 분기를 은폐할 수 있어 **e2e(SC-013) 실경로 검증을 필수**로 매핑(T025).

### SC ↔ 테스트 매핑

| SC-ID | 수용 기준 | 유형 | 테스트 파일 | 태스크 | 비고 |
|---|---|---|---|---|---|
| SC-001 | `/auth/login` 21회→429 | Error | `test/rate-limit.e2e-spec.ts` | T024 | [env:integration] 옵션A |
| SC-002 | `/auth/social-login` 11회→429 | Error | `test/rate-limit.e2e-spec.ts` | T024 | [env:integration] |
| SC-003 | `/auth/naver/state` 21회→429 | Error | `test/rate-limit.e2e-spec.ts` | T024 | [env:integration] |
| SC-004 | `/auth/forgot-password` 상이email·동일IP 6회→429 | Error | `test/rate-limit.e2e-spec.ts` | T024 | IP축 독립 |
| SC-005 | `/auth/find-email` 6회→429 | Error | `test/rate-limit.e2e-spec.ts` | T024 | [env:integration] |
| SC-006 | `/auth/reset-password` 11회→429 | Error | `test/rate-limit.e2e-spec.ts` | T024 | [env:integration] |
| SC-007 | 429=표준 ThrottlerException | Error | `src/shared/security/throttler-exception.spec.ts` | T021 | [env:unit] |
| SC-008 | trust proxy+tracker 헤더 정적 | 검증 | `test/static/rate-limit-trust-proxy.spec.ts` | T022 | [env:static] |
| SC-009 | 상이 XFF→상이 버킷 | Edge | `src/shared/security/client-ip.util.spec.ts` | T017 | [env:unit] |
| SC-010 | path 3c createSocialAccount 실패→롤백 | Error | `src/modules/auth/social-auth.service.spec.ts` | T019 | [env:unit] runInTransaction throw 전파 |
| SC-011 | P2002 폴백 회귀 없음 | Edge | `src/modules/auth/social-auth.service.spec.ts` | T019 | [env:unit] catch 트랜잭션 외부 |
| SC-012 | revoke 가 markOtpConsumed 와 동일 tx | Happy | `src/modules/auth/auth.service.spec.ts` | T020 | [env:unit] runInTransaction 1회 spy |
| SC-013 | revoke 실패→비번 롤백 | Error | `test/auth-reset-atomicity.e2e-spec.ts` | T025 | [env:integration] 옵션A |
| SC-014 | OTP 불일치 WARN 1건·email 마스킹 | Error | `security-audit.logger.spec.ts` + `auth.service.spec.ts` | T016·T020 | 로거 마스킹 + 서비스 wiring |
| SC-015 | 429 WARN 1건·endpoint+ip | Error | `security-audit.logger.spec.ts` | T016 | [env:unit] rateLimitExceeded |
| SC-016 | find-email WARN 1건·phone/email 마스킹 | Happy | `security-audit.logger.spec.ts` + `auth.service.spec.ts` | T016·T020 | 로거 + wiring |
| SC-017 | 로거 throw 해도 원 응답 불변 | Error | `security-audit.logger.spec.ts` + `auth.service.spec.ts` | T016·T020 | best-effort |
| SC-018 | package.json Redis 신규 0건 | 검증 | `test/static/rate-limit-no-redis.spec.ts` | T023 | [env:static] |
| SC-019 | 비마스킹 email/phone 패턴 부재 | Edge | `security-audit.logger.spec.ts` | T016 | [env:unit] 정규식 |
| SC-020 | 전체 unit 회귀 0건 | Happy | 전체 스위트 | T026 | mock 보강 검증 |

> 매핑 누락 0건 — SC-001~020 전건 테스트 태스크 대응. 역방향 근거없는 태스크 0건.

---

## 태스크 입도 가이드

- 1 태스크 ≈ 구현 파일 1~3개 + 대응 테스트 1개 수준. T014(감사 2지점+tx)·T019(5 spec mock 보강)는 논리 단위로 묶음.
- Development(4)는 Step 1~3(A·B·C) 만, Test(5a)는 Step 4(D) 만 — 산출물 충돌 0.

## 구현 완료 기준

- [x] Step 1~3(A·B·C) 태스크 체크박스 완료 (Development)
- [ ] Step 4(D) 태스크 체크박스 완료 (Test AUTHORING → 5b 실행 Green)
- [ ] `pnpm --filter backend test`(jest 전체 unit) PASSED — 회귀 0건(SC-020)
  - 2026-07-04 04:xx 시점 Development 확인: A·B·C 구현 자체는 typecheck/build green. 잔여 실패 26건은 전부
    `auth.service.spec.ts`(D 레이어, T020 — AuthService provider 에 PrismaService/SecurityAuditLogger mock
    미보강)에 기인 — 5a Test AUTHORING 산출물 미완료 상태(진행중, 코멘트/import 만 추가됨). `social-auth.service*.spec.ts`
    5개 파일은 5a 가 이미 mock 보강 완료(T019) — 해당 파일 관련 실패 0건.
- [ ] `pnpm --filter backend test:e2e`(옵션A 환경) rate-limit·reset-atomicity PASSED (SC-001~006·013)
- [x] `pnpm --filter backend typecheck` 통과 (0 error, 2026-07-04 확인)
- [x] `pnpm --filter backend build` 통과 (prisma generate + nest build, 0 error)
- [x] `@nestjs/throttler` [TO-VERIFY] 5항 설치 후 확정, plan/research 불일치 시 갱신 (T001 — 불일치 0건)
- [x] git status 의도치 않은 파일 없음 (A·B·C 산출물 한정 — `apps/backend/src/shared/security/` 신규 5파일 + 명시된 수정 파일만 존재)
</content>
