---
작성: Security Agent
버전: v1.0
최종 수정: 2026-07-04 06:32
상태: 확정
---

# 보안 감사 결과 — 018-auth-security-hardening

## 목차

- [검토 범위](#검토-범위)
- [요약](#요약)
- [Constitution 보안 조항 이행 현황](#constitution-보안-조항-이행-현황)
- [선행 보안 부채 RESOLVED 판정](#선행-보안-부채-resolved-판정)
- [취약점 목록](#취약점-목록)
- [NFR-XXX / SC-XXX 보안 요구사항 이행 현황](#nfr-xxx--sc-xxx-보안-요구사항-이행-현황)
- [권고사항](#권고사항)

---

## 검토 범위

`DIFF-018-auth-security-hardening.md`(base `b3f427d`) 기준 변경 파일 중 보안 경계에 해당하는 파일을 전수 코드 Read 로 검토했다.

**직접 검토(코드 Read 완료)**:

| 파일 | 검토 사유 |
|---|---|
| `apps/backend/src/main.ts` | trust proxy 설정(FR-004/ADR-004) |
| `apps/backend/src/app.module.ts` | `SecurityModule` 전역 등록 |
| `apps/backend/src/health/health.controller.ts` | `@SkipThrottle()` 예외 범위 확인 |
| `apps/backend/src/modules/auth/auth.controller.ts` | 5개 엔드포인트 `@Throttle` 임계값·인가 3축 |
| `apps/backend/src/modules/auth/auth.module.ts` | `SecurityModule` 임포트 |
| `apps/backend/src/modules/auth/auth.repository.ts` | `revokeAllRefreshTokensByUser` tx-aware 전환 |
| `apps/backend/src/modules/auth/auth.service.ts` | `resetPassword` 트랜잭션 통합, 감사 로그 호출부 |
| `apps/backend/src/modules/auth/auth.util.ts` | `maskPhone` 신규 마스킹 유틸 |
| `apps/backend/src/modules/auth/social-auth.service.ts` | path 3c 트랜잭션 원자화 |
| `apps/backend/src/shared/security/*.ts`(5개 신규) | rate limit 가드·IP 해석·감사 로거·모듈·상수 전문 |
| `apps/backend/src/shared/prisma/prisma.service.ts` | `runInTransaction`/`tx` 재진입 안전성(변경 파일은 아니나 트랙 3·4 원자성의 기반 계약이므로 근거 확인 목적으로 열람) |
| `apps/backend/package.json`, `pnpm-lock.yaml` | 신규 의존 `@nestjs/throttler@6.5.0` 1건 확인, Redis 계열 부재 확인 |
| DTO 4종(`reset-password`·`forgot-password`·`find-email`·`social-login`) | 본 spec 변경 대상 아니나 신규 rate limit 대상 엔드포인트의 기존 입력 검증 상태 교차 확인(회귀 없음 확인 목적) |
| 정적 테스트 3종(`rate-limit-trust-proxy`·`rate-limit-no-redis`)·`client-ip.util.spec.ts`·`throttler-exception.spec.ts` | 코드 검증 주장(SC-008·SC-009·SC-007·SC-018)의 실제 assertion 내용 확인 |
| `apps/backend/test/auth-reset-atomicity.e2e-spec.ts` | SC-013(revoke 실패 시 비밀번호 롤백) e2e 시나리오 확인 |

**배제(사유 명시)**:

- `auth.service.spec.ts`·`social-auth.service*.spec.ts`·`security-audit.logger.spec.ts` 등 나머지 unit 테스트 전문 — 5b Test Agent(EXECUTION)가 397/397 PASS·gate: PASS 로 이미 확정(`gaps.md` GAP-018-02 RESOLVED, `test/test-report.md`). 프로덕션 코드-테스트 정합성은 이미 검증된 영역이므로 본 감사는 프로덕션 코드 자체의 보안 로직에 집중했다.
- `apps/backend/src/modules/auth/social/*.provider.ts`(kakao/google/naver) — 본 spec DIFF 목록에 없음(015/016 에서 완료·감사 완료, 014/015 security-report.md 기존 판정 유지). 013/016 나머지 Flutter/naver 코드도 DIFF-018 범위 밖.
- `apps/backend/src/shared/auth/*`(JwtStrategy·AdminGuard 등) — DIFF-018 변경 목록에 없음, 본 spec 이 인증/인가 로직 자체를 건드리지 않음(rate limit·트랜잭션·로깅만 추가).

---

## 요약

- **검토 대상 파일**: 직접 코드 검토 14개(신규 5개 + 수정 9개) + 교차 확인 8개
- **Critical/High 발견**: **0건**
- **Medium 발견**: 1건 (SEC-018-01 — 신규, 클라이언트 헤더 신뢰 미검증)
- **Low 발견**: 1건 (SEC-018-02 — 신규, find-email 실패 케이스 감사 로그 미기재)
- **Informational(범위 외 관찰)**: 1건 (SEC-018-03 — pino 요청 로그 redact 미설정, 018 diff 밖)
- **선행 보안 부채 4건 RESOLVED 판정**: 아래 "선행 보안 부채 RESOLVED 판정" 절 참조 — 4건 전부 코드로 확인 완료.
- **판정**: Critical/High 0건이므로 **status: COMPLETE (gate: PASS)**. Medium 1건·Low 1건은 권고사항으로 기록.

---

## Constitution 보안 조항 이행 현황

| 조항 | 이행 여부 | 비고 |
|---|---|---|
| P-001 (모듈 경계) | **이행** | `SecurityModule`(`shared/security/`)은 DB 미접근 shared 인프라 모듈로 명시(`security.module.ts` 주석 확인). `AuthRepository`는 `users` 스키마만 접근(기존 주석 유지). |
| P-002 (AWS 의존 금지) | **이행** | 신규 의존 `@nestjs/throttler` 1건 — AWS SDK/서비스 아님. |
| P-003 (단일 DB) | **이행** | `ThrottlerModule.forRoot`가 기본 인-메모리 `ThrottlerStorageService` 사용(코드에 Redis storage adapter 미지정 확인). `package.json`/`pnpm-lock.yaml` 에 `ioredis`/`redis`/`@upstash/*`/`throttler-storage-redis` 계열 0건(정적 테스트 `rate-limit-no-redis.spec.ts` 로 회귀 방지 확보). |
| P-004 (클라우드 중립) | **이행 — 예외 범위 명시적 승인** | `Fly-Client-IP` 헤더·`trust proxy` 설정은 Fly.io 플랫폼 특화 로직이나, spec.md "배포 환경 cross-reference 결과(PROC-009)"에서 사용자가 FR-004/NFR-008 범위 포함을 명시적으로 확정했다. `resolveClientIp`는 `Fly-Client-IP` 부재 시 표준 `X-Forwarded-For`/`req.ip`로 자연 폴백하므로 타 플랫폼 이전 시에도 완전히 깨지지 않는다(점진적 열화). Fly 전용 SDK 는 도입되지 않음. |
| P-005 (결제·정산 정합성) | 해당 없음 | 본 spec 은 결제/정산 모듈 미접촉. |
| P-006 (테스트 원칙) | **이행** | SC-001~020 전건이 FR/NFR 에 매핑되고(spec.md "요구사항 구조화 매트릭스"), 5b Test Agent 가 397/397 PASS·gate: PASS 로 확정(GAP-018-02 RESOLVED). |
| P-007 (스펙 범위) | **이행** | DTO 4종(reset-password 등) 미변경 확인 — 범위 외로 명시된 항목(트랙 B/C, 개별 login/register rate limit)에 대한 코드 변경 없음을 확인했다. |

---

## 선행 보안 부채 RESOLVED 판정

Task 요청에 따라 트랙 A(본 spec)가 목표한 4개 선행 보안 부채 항목을 코드로 재검증했다.

### (1) SEC-004/GAP-014-06 + SEC-002/GAP-013-09 + 016 flooding — rate limit 부재 → **RESOLVED**

- **검증 코드**: `apps/backend/src/shared/security/security.module.ts`(전역 `APP_GUARD`) + `apps/backend/src/modules/auth/auth.controller.ts` L67·L76·L106·L114·L123(`@Throttle` 5종) + `apps/backend/src/main.ts` L12(`app.set('trust proxy', 1)`) + `apps/backend/src/shared/security/client-ip.util.ts`(`resolveClientIp`).
- **판정 근거**:
  - `social-login`(10/60s)·`naver/state`(20/60s)·`forgot-password`(5/60s)·`find-email`(5/60s)·`reset-password`(10/60s) 개별 override 확인 — spec NFR-002~006 상수값과 정확히 일치(`throttle.constants.ts`).
  - override 없는 라우트(`login`·`register` 등)는 전역 기본값 20/60s 적용(`SecurityModule`의 `ThrottlerModule.forRoot`).
  - `Fly-Client-IP` 미스핑 시에도 `X-Forwarded-For`→`req.ip`→`'unknown'` 순 폴백으로 tracker 가 항상 결정된다(`client-ip.util.ts` — undefined 반환 없음, `client-ip.util.spec.ts` 8개 케이스로 검증).
  - `GET /health` 만 `@SkipThrottle()` 예외 — 다른 auth 엔드포인트에 skip 남용 없음을 `grep -rn "SkipThrottle\|@Throttle("` 전수 확인.
  - 016 이 우려한 `POST /auth/naver/state` flooding 도 20/60s 로 커버됨(기존 TTL/opportunistic 정리와 별도 방어선 추가).
- **잔여 위험**: 헤더 신뢰 가정의 검증 상태는 아래 SEC-018-01(Medium) 참조 — RESOLVED 판정 자체를 뒤집지 않으나 완화의 견고성에 영향.

### (2) SEC-002/GAP-014-01 — 소셜 신규가입 path 3c 비원자 트랜잭션 → **RESOLVED**

- **검증 코드**: `apps/backend/src/modules/auth/social-auth.service.ts` L133-149.
- **판정 근거**: `createUser`+`createSocialAccount` 가 `this.prisma.runInTransaction(async () => {...})` 콜백 내부에서 실행됨을 확인. `AuthRepository.createUser`/`createSocialAccount` 는 `this.prisma.tx.*`(tx-aware) 사용(`auth.repository.ts` L25·L85) — 콜백 내부 실행 시 자동으로 동일 트랜잭션에 참여. `PrismaService.runInTransaction`(`prisma.service.ts` L49-68)이 실제로 `this.$transaction(...)` 을 열고 `AsyncLocalStorage` 로 전파함을 확인 — root fallback 이 아닌 진짜 커밋/롤백 단위 트랜잭션.
- **회귀 방지 확인**: P2002 동시성 폴백 catch 가 `runInTransaction` **외부**에 유지됨(L150-174) — ADR-005 설계 의도와 일치, 롤백 후 root 클라이언트로 race 복구 조회가 정상 동작하는 구조.
- **판정**: orphan user(password:null) 가 두 번째 INSERT 실패로 남을 가능성이 원천 차단됨 — RESOLVED.

### (3) SEC-003/GAP-013-10 — resetPassword 세션 폐기 비원자 → **RESOLVED**

- **검증 코드**: `apps/backend/src/modules/auth/auth.repository.ts` L54-61(`revokeAllRefreshTokensByUser` tx-aware 전환) + `apps/backend/src/modules/auth/auth.service.ts` L282-288(`runInTransaction` 통합).
- **판정 근거**: `revokeAllRefreshTokensByUser`가 `this.prisma.refreshToken.updateMany`(root)에서 `this.prisma.tx.refreshToken.updateMany`(tx-aware)로 전환됨을 확인 — 이 전환이 없으면 트랜잭션 콜백 내에서 호출해도 별도 커넥션으로 실행되어 롤백에 참여하지 못하는 함정을 정확히 피했다. `resetPassword`가 `markOtpConsumed`+`revokeAllRefreshTokensByUser`를 단일 `runInTransaction`으로 묶음을 확인. `markOtpConsumed` 내부의 별도 `runInTransaction` 호출은 `PrismaService.runInTransaction`의 재진입 안전성(`if (this.als.getStore()) return fn()`)으로 중첩 커밋 없이 외부 tx 를 재사용함을 `prisma.service.ts` 코드로 직접 확인.
- **e2e 검증 확인**: `test/auth-reset-atomicity.e2e-spec.ts` SC-013 시나리오가 `revokeAllRefreshTokensByUser`를 강제 실패시켜 비밀번호 변경도 함께 롤백됨을 검증하는 구조임을 확인(재설정 이전 비밀번호로 로그인 가능한지 단언).
- **판정**: 비밀번호 변경·OTP 소비·세션 폐기가 단일 트랜잭션으로 원자화 — RESOLVED.

### (4) SEC-004/GAP-013-11 — auth 보안 감사 로그 부재 → **RESOLVED**

- **검증 코드**: `apps/backend/src/shared/security/security-audit.logger.ts` 전문 + 호출부 3곳(`auth.service.ts` L262·L300, `fly-throttler.guard.ts` L42).
- **판정 근거**: `otpVerificationFailed`(OTP 불일치, `auth.service.ts` L262)·`rateLimitExceeded`(429, `fly-throttler.guard.ts` L42)·`findEmailAccessed`(PII 조회, `auth.service.ts` L300) 3종 모두 실제 프로덕션 호출부에서 트리거됨을 확인. `maskEmail`/`maskPhone` 으로 이메일·전화번호가 마스킹된 상태로만 로그에 기록됨(`security-audit.logger.ts` L19·L40, `auth.util.ts` L17-23).
- **best-effort 검증**: 3개 메서드 전부 내부 try/catch 로 감싸져 로깅 예외가 호출부로 전파되지 않음을 확인(FR-010). 호출부(`auth.service.ts` L262·L300)가 try/catch 없이 직접 호출해도 안전한 이유는 이 내부 캡슐화 때문 — GAP-018-02 가 이 계약을 우회한 테스트 오류였음을 5b 가 이미 판정(production 코드 무변경).
- **판정**: OTP 브루트포스·429·PII 조회 3대 보안 이벤트에 대한 감사 추적이 확보됨 — RESOLVED. 단, find-email 실패 케이스 미기재는 SEC-018-02(Low) 참조.

---

## 취약점 목록

### SEC-018-01 — rate limit 트래킹이 클라이언트 제어 가능 헤더(X-Forwarded-For)를 출처 검증 없이 신뢰

- **심각도**: Medium
- **OWASP**: A05:2021 (Security Misconfiguration) / A04:2021 (Insecure Design)
- **위치**: `apps/backend/src/shared/security/client-ip.util.ts:16-23`(`X-Forwarded-For` 파싱), `apps/backend/src/main.ts:12`(`trust proxy: 1`)
- **설명**: `resolveClientIp`는 `Fly-Client-IP` 헤더를 최우선으로 신뢰하고, 이 헤더가 없으면 `X-Forwarded-For` 첫 항목을 신뢰한다(`client-ip.util.spec.ts`의 `test_SC009_018_xff_fallback_when_no_fly_client_ip` 로 이 폴백 동작이 명시적으로 검증됨). 두 헤더 모두 **HTTP 요청 헤더로서 클라이언트가 직접 설정 가능한 값**이며, 코드 어디에도 "이 헤더가 Fly.io 엣지 프록시에 의해 항상 덮어써진다"는 보장을 검증하는 로직이 없다. 또한 `main.ts`의 `app.set('trust proxy', 1)`은 Express 내장 `req.ip`/`req.ips` 계산에만 영향을 주는 설정으로, `resolveClientIp`가 `req.headers`를 원시(raw) 접근하는 구조상 이 trust proxy 홉 수 설정과 실질적으로 무관하게 동작한다(즉 "1홉만 신뢰"라는 의도가 실제 트래커 결정 로직에 반영되지 않음).
  - 이 가정이 실제로 성립하지 않는 경우(예: 앱이 fly-proxy 외 경로로도 도달 가능하거나, fly-proxy 가 클라이언트 제공 `Fly-Client-IP`/`X-Forwarded-For` 값을 항상 덮어쓰지 않는 경우) 두 가지 공격이 가능하다: (a) **rate limit 우회** — 공격자가 요청마다 임의의 `X-Forwarded-For` 값을 회전시켜 IP 당 상한(NFR-001~006)을 무력화, (b) **rate limit poisoning(가용성 공격)** — 공격자가 피해자의 실제 IP를 `X-Forwarded-For` 값으로 위조하여 대량 요청을 보내면 피해자의 정상 요청이 조기에 `429`로 차단됨.
  - 이 가정의 검증 상태는 `gaps.md` GAP-018-01(`infra.md`에 `Fly-Client-IP`/`X-Forwarded-For`/trust proxy 관련 문서화 0건 확인)이 이미 문서-갱신-필요로 등재했으나, 해당 GAP은 "문서 미기재" 사실만 다루고 "이 미검증 가정이 초래하는 구체적 보안 영향(우회·poisoning)"은 명시하지 않았다. 본 항목은 그 보안적 함의를 Security Agent 관점에서 명시적으로 등재한다.
  - Fly.io 플랫폼이 공개 문서상 `Fly-Client-IP`를 엣지에서 재기입(overwrite)하는 것으로 일반적으로 알려져 있으나, 이는 이 코드베이스·`infra.md` 어디에도 근거 문서·테스트로 확증되지 않은 **외부 플랫폼 보증에 대한 추측**이다(사용자 CLAUDE.md 정확성 원칙 — 확인되지 않은 사실을 사실처럼 서술 금지). 따라서 Critical/High 가 아닌 Medium 으로 분류한다: (1) spec.md 가 이 잔여 위험을 이미 "사후 운영 검증 피드백 사이클(PROC-014) #1"로 명시적으로 인지·계획했고, (2) 공개 인터넷에서 Fly.io 앱에 도달하는 표준 경로는 fly-proxy 를 경유하므로 완전 우회 난이도가 낮지 않으며, (3) rate limit 은 이번 spec 이 신설한 "추가" 방어선(1차 방어선이 아닌 auth 도메인 자체의 OTP 시도횟수 제한·app-binding 검증 등 기존 통제가 여전히 유효)이기 때문이다.
- **수정 방향**: `infra.md` §2/§8 갱신 시(GAP-018-01) Fly.io 의 `Fly-Client-IP` 헤더 재기입 보증에 대한 **공식 문서 근거(URL)** 를 명시하고, 가능하다면 운영 배포 후 실제로 외부에서 이 헤더를 스푸핑한 요청이 앱에 도달하는지 1회 검증(PROC-014 #1 사후 검증)한다. 검증 결과 보증이 확인되지 않으면 네트워크 레벨 통제(예: 앱이 fly-proxy 가 설정하는 별도 신뢰 헤더 조합을 요구하거나, private-only 리스닝) 추가를 검토한다.
- **상태**: 신규 등재 — Retrospective 위임 권고(아래 권고사항 참조). RESOLVED 판정 자체(위 "선행 보안 부채" (1)항)를 뒤집지 않음 — spec 이 도입한 rate limit 인프라 자체는 정상 동작하며, 본 항목은 그 견고성의 잔여 가정에 대한 것.

### SEC-018-02 — find-email 감사 로그가 실패(미등록 전화번호) 케이스를 커버하지 않아 enumeration 시도 탐지 사각지대 존재

- **심각도**: Low
- **OWASP**: A09:2021 (Security Logging and Monitoring Failures)
- **위치**: `apps/backend/src/modules/auth/auth.service.ts:295-302`(`findEmail`)
- **설명**: `findEmailAccessed` 감사 로그 호출(`L300`)은 `findFirstUserByPhone`이 사용자를 찾은 **성공** 경로에서만 실행된다(`L297-299`의 `NotFoundException` 분기는 로그 호출 이전에 반환). 즉 실제 PII(이메일)가 노출된 성공 이벤트만 기록되고, 존재하지 않는 전화번호를 대량 조회하는 **user enumeration 시도 자체**(주로 실패로 구성됨)는 감사 로그에 남지 않는다. FR-009 문언("find-email PII 조회 이벤트를 ... 기록")과 SC-016(Input: "유효 phone 조회")이 성공 케이스만 명시하므로 spec 요구사항 충족 여부로는 결함이 아니나, 브루트포스/enumeration 탐지라는 감사 로그의 실질적 목적(spec 배경 절 "브루트포스·user enumeration 시도를 탐지·추적") 관점에서는 완결성이 낮다. IP rate limit(5/60s, NFR-005)이 1차 방어선으로 이미 존재하므로 즉시 악용 가능한 결함은 아니다.
- **수정 방향**: 후속 spec 에서 실패 케이스(`NotFoundException` 분기)에도 별도 이벤트(예: `findEmailNotFound(phone, ip)`)를 감사 로그로 추가하는 것을 검토. best-effort/마스킹 원칙(FR-010/NFR-009)을 동일하게 적용.
- **상태**: 권고사항으로 기록 (spec 요구사항 자체는 충족 — 블로킹 아님)

### SEC-018-03 — (참고, 018 diff 범위 밖) pino 요청 로그 redact 미설정 — Authorization 헤더 등 평문 기록 가능성

- **심각도**: Informational (본 spec 게이트 판정에 미반영)
- **OWASP**: A09:2021 (Security Logging and Monitoring Failures) / A02:2021 (Cryptographic Failures — 토큰 노출 관점)
- **위치**: `apps/backend/src/app.module.ts`의 `LoggerModule.forRoot({ pinoHttp: {...} })`(011 스펙에서 도입, 본 018 diff 는 `SecurityModule` import 2줄 추가만 — 이 설정 자체는 미변경)
- **설명**: `pinoHttp` 설정에 `redact`/`serializers` 커스터마이징이 없어, `pino-http` 기본 요청 직렬화가 `Authorization` 헤더를 포함한 전체 요청 헤더를 로그에 남길 수 있다(JWT access/refresh 토큰이 로그 스트림에 평문 노출될 가능성). 본 spec(018)의 `SecurityAuditLogger`가 이메일·전화번호 마스킹(NFR-009)을 신경 써서 설계한 것과 대비되는 인접 공백이나, `app.module.ts`의 `LoggerModule.forRoot` 설정 자체는 DIFF-018 변경 대상이 아니므로(011 스펙 기존 코드) 본 감사의 Critical/High/Medium/Low 게이트 판정에는 반영하지 않는다.
- **수정 방향**: 별도 patch spec 에서 `pinoHttp.redact: ['req.headers.authorization', 'req.headers.cookie']` 등 추가 검토 권고.
- **상태**: 참고 기록 — 018 스펙 블로킹 대상 아님. Retrospective 가 context.md §6 신규 항목 등재 여부를 판단하도록 위임(아래 권고사항).

---

## NFR-XXX / SC-XXX 보안 요구사항 이행 현황

| ID | 요구사항 | 이행 여부 | 비고 |
|---|---|---|---|
| NFR-001 | 전역 기본 rate limit IP당 20회/60초 이내 | **이행** | `THROTTLE_DEFAULT_LIMIT=20`, `THROTTLE_TTL_MS=60_000`(`throttle.constants.ts`) |
| NFR-002 | `social-login` 개별 10회/60초 이내 | **이행** | `auth.controller.ts:67` |
| NFR-003 | `naver/state` 개별 20회/60초 이내 | **이행** | `auth.controller.ts:76` |
| NFR-004 | `forgot-password` 개별 5회/60초 이내 | **이행** | `auth.controller.ts:106` |
| NFR-005 | `find-email` 개별 5회/60초 이내 | **이행** | `auth.controller.ts:123` |
| NFR-006 | `reset-password` 개별 10회/60초 이내 | **이행** | `auth.controller.ts:114` |
| NFR-007 | Redis 등 외부 저장소 미도입(P-003) | **이행** | `package.json`/`pnpm-lock.yaml` 정적 확인, `rate-limit-no-redis.spec.ts` 회귀 방지 |
| NFR-008 | Fly-Client-IP/XFF 기반 실 클라이언트 IP 식별 | **이행(잔여 가정 SEC-018-01 참조)** | `client-ip.util.ts` 코드 확인 — 단 헤더 출처 신뢰는 미검증 플랫폼 가정 |
| NFR-009 | 감사 로그 이메일·전화번호 마스킹 | **이행** | `maskEmail`/`maskPhone` 적용 확인(`auth.util.ts`), 원본 패턴 미노출은 SC-019(단위 테스트)로 커버 — 5b PASS 확인 |
| NFR-010 | 회귀 0건(constitution P-006) | **이행** | 5b 최종 확정: unit 397/397 PASS, static 4/4, e2e rate-limit 6/6, e2e atomicity 1/1 |
| SC-008 | trust proxy + tracker 헤더 정적 검증 | **이행** | `rate-limit-trust-proxy.spec.ts` — main.ts/client-ip.util.ts 소스 grep 검증 확인 |
| SC-018 | Redis 등 신규 저장소 의존 0건 | **이행** | `rate-limit-no-redis.spec.ts` |

---

## 권고사항

1. **SEC-018-01(Medium)**: `infra.md` §2/§8 갱신(GAP-018-01) 시 `Fly-Client-IP` 재기입 보증에 대한 공식 문서 근거를 명시하고, PROC-014 사후 운영 검증 #1에 "헤더 스푸핑 시도 테스트"를 포함하도록 spec.md의 사후 검증 절 또는 별도 patch spec 에 반영 권고. `(PROC-013-03)` 패턴에 따라 `context.md §6`에도 additive 등재 권고: "rate limit IP 트래킹은 `Fly-Client-IP`/`X-Forwarded-For` 헤더를 원시 신뢰하며, 이 값이 Fly 엣지에 의해 항상 재기입됨을 코드/공식문서로 확증하지 않았다(SEC-018-01, Medium). 미확증 시 우회·poisoning 가능."
2. **SEC-018-02(Low)**: find-email 실패(미등록 전화번호) 케이스의 감사 로그 보강을 후속 spec 검토 항목으로 권고. 즉시 조치 불요.
3. **SEC-018-03(Informational, 범위 외)**: pino 요청 로그 `redact` 설정 검토를 별도 patch spec 후보로 Retrospective 가 판단하도록 위임. 018 스펙의 게이트 판정에는 영향 없음.
4. **선행 보안 부채 4건(SEC-002/GAP-014-01, SEC-004/GAP-014-06, SEC-002/GAP-013-09, SEC-003/GAP-013-10, SEC-004/GAP-013-11) 전부 RESOLVED**: `context.md §6`의 해당 5개 행(GAP-018-03이 이미 식별한 4개 행 + naver flooding 관련 문구 포함)을 "RESOLVED (018-auth-security-hardening)"로 전이 권고. Docs Agent 가 GAP-018-03 으로 이미 동일 코드 근거를 기록했으므로 본 감사는 그 판정에 **독립적으로 동의**한다(코드 재확인 완료).
5. **(PROC-013-03) Retrospective 위임**: 신규 Medium 1건(SEC-018-01)을 `context.md §6`에 additive 등재 권고(위 1항 문구 참조). Low 1건(SEC-018-02)·Informational 1건(SEC-018-03)은 등재 여부를 Retrospective 재량에 위임.
