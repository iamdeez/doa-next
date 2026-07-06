---
작성: Test Agent (EXECUTION) — [재작업] 5b 재검증
버전: v1.1
최종 수정: 2026-07-04 06:15
상태: 확정
---

# 테스트 실행 결과

## 목차

- [실행 요약](#실행-요약)
- [실행 환경](#실행-환경)
- [실패 목록](#실패-목록)
- [GAP-018-02 판정 — SC-017 wiring 2건 [A]/[B]/[D] 분류 및 정정 재확인](#gap-018-02-판정--sc-017-wiring-2건-abd-분류-및-정정-재확인)
- [SC 미커버 항목](#sc-미커버-항목)
- [plan.md 매핑표 검증](#planmd-매핑표-검증)
- [설계 문서 정합성](#설계-문서-정합성)
- [회귀 탐지](#회귀-탐지)
- [최종 판정](#최종-판정)

---

## 실행 요약

> 본 판정은 5a Test AUTHORING([재작업], `auth.service.spec.ts` SC-017 wiring 2건을 실 `SecurityAuditLogger` 인스턴스 + `PinoLogger.warn` throw mock 조합으로 재작성, 2026-07-04 06:11) 완료 후 **5b 가 전체 스위트를 재실행하여 재검증한 공식 gate 판정**이다.

| 스위트 | 결과 | 비고 |
|---|---|---|
| `pnpm --filter backend typecheck` (`tsc --noEmit`) | **0 error** | 재확인 |
| `pnpm --filter backend test` (unit, jest `rootDir: src`) | **39 suites, 397 tests — 전건 PASS** | GAP-018-02 정정 반영 후 재실행 — `auth.service.spec.ts` 포함 회귀 0건 |
| `test:e2e` — `test/static/rate-limit-{trust-proxy,no-redis}.spec.ts` | **2 suites/4 tests PASS** | SC-008·018, 재확인 |
| `test:e2e` — `test/rate-limit.e2e-spec.ts` (옵션 A, 로컬 docker-compose PostgreSQL 16) | **1 suite/6 tests PASS** | SC-001~006, 재확인 |
| `test:e2e` — `test/auth-reset-atomicity.e2e-spec.ts` (옵션 A) | **1 suite/1 test PASS** | SC-013, 재확인 |

**SC-XXX 매핑 테스트 총계**: 20개 SC(SC-001~020) **전건 PASS**. GAP-018-02(SC-017 wiring 2건)는 5a 정정 적용 후 본 5b 재실행에서 PASS 로 전환 확인 — **RESOLVED**.

## 실행 환경

- `docker compose up -d postgres` (`docker-compose.yml` — `postgres:16-alpine`, `doa-next-postgres-1`, 5일 연속 가동 확인) 로 옵션 A(로컬 e2e DB) 기동.
- `apps/backend/.env` 의 `DATABASE_URL=postgresql://doa:doa_local@localhost:5432/doa_next` 가 compose 서비스와 일치함을 재확인.
- `npx prisma migrate deploy` — pending 마이그레이션 0건(스키마 무변경, SC-018/spec.md "데이터 모델" 절과 정합) 재확인.
- production 코드(`auth.service.ts`, `security-audit.logger.ts` 등) `git status` 상 이전 5b 판정 시점 대비 무변경 확인 — GAP-018-02 정정은 `auth.service.spec.ts`(D 레이어) 한정.

---

## 실패 목록

없음 — 이전 5b 판정(2026-07-04 06:02)에서 확인된 `auth.service.spec.ts::test_SC017_018_reset_password_otp_mismatch_unaffected_by_logger_throw`, `::test_SC017_018_find_email_unaffected_by_logger_throw` 2건은 5a [재작업] 정정 후 본 재실행에서 **PASS** 로 전환됨 (하단 GAP-018-02 판정 참조).

그 외 회귀·실패 0건 — 018 신규 T016~T025 테스트(security-audit.logger·client-ip.util·auth.util(maskPhone)·throttler-exception·social-auth path 3c·SC-012/014/016/017 wiring·정적 2종·e2e rate-limit 6종·e2e atomicity) 전건 PASS. 013~017 산출물(social-auth 5개 spec, auth.util maskEmail, 기존 auth.service.spec.ts 시나리오) 회귀 0건.

---

## GAP-018-02 판정 — SC-017 wiring 2건 [A]/[B]/[D] 분류 및 정정 재확인

### 최종 판정: **[B] 테스트 오류 — 정정 반영 완료, RESOLVED**

### 이전 5b 판정 요약 (2026-07-04 06:02, 상세는 gaps.md GAP-018-02 참조)

production `SecurityAuditLogger`(`apps/backend/src/shared/security/security-audit.logger.ts`)는 3개 public 메서드 전부 내부 `try/catch` 로 감싸 plan.md "방어 코드" 절("`SecurityAuditLogger` 전 메서드 try/catch(FR-010)")·ADR-007 설계와 정확히 일치하게 구현되어 있다. plan.md 테스트 전략표(SC-017 행) 의 Input 은 `logger.warn throw mock`(즉 `PinoLogger.warn`)이며, 이 지정대로 작성된 `security-audit.logger.spec.ts` 3건은 최초부터 PASS 였다. 반면 최초 AUTHORING 시점 `auth.service.spec.ts` 의 wiring 2건은 `SecurityAuditLogger` 인스턴스 전체를 mock 하여 강제로 throw 시켰는데, 이는 production 에서 "모든 public 메서드가 무조건 내부에서 예외를 삼킨다"는 계약상 **도달 불가능한 분기**를 전제로 한 것이었다 — **[B] 테스트 오류(전제 조건 오류)**로 판정, production 코드 변경 불요.

### 정정 내용 및 재확인 ([재작업] 5a, 2026-07-04 06:11 적용)

`auth.service.spec.ts` 의 SC-017 describe 블록(`838~` 라인)을 재작성 — `SecurityAuditLogger` 를 통째로 mock 하는 대신, **실제 `SecurityAuditLogger` 인스턴스**를 생성(`new SecurityAuditLogger(mockPinoLogger)`)하고 그 하위 의존인 **`PinoLogger.warn` 만 throw 하도록 mock** 하여 `AuthService` 의 DI 컨테이너에 주입했다. 이는 plan.md Input(`logger.warn throw mock`)과 정확히 일치하는 end-to-end 시나리오이며, production 의 실제 예외 삼킴 계약을 우회하지 않는다(PATCH-03 — mock 이 production 실제 분기 경로를 재현).

**본 5b 재검증 결과**:
- `pnpm --filter backend typecheck` → 0 error.
- `pnpm --filter backend test` → **39 suites/397 tests 전건 PASS**, `auth.service.spec.ts` 포함(코드 확인: 실 `SecurityAuditLogger` 인스턴스 + `PinoLogger.warn` throw mock 조합, `apps/backend/src/modules/auth/auth.service.spec.ts:838~915`).
- `git status` 로 production 코드(`auth.service.ts`·`security-audit.logger.ts`) 무변경 확인 — D 레이어(`auth.service.spec.ts`) 외 변경 0건.

### 결론

- production 구현은 plan.md 설계와 **일치**하며 변경되지 않았다(`[A] 구현 오류`·`[D] 설계 불일치` 모두 불성립, 근거는 이전 판정과 동일).
- 테스트 전제 조건 오류였던 wiring 2건은 plan.md Input 정합 방식(실 인스턴스 + 하위 의존 mock)으로 재작성되어 **PASS** 로 전환되었다 — **[B] RESOLVED**.
- SC-017 은 로거 레벨(`security-audit.logger.spec.ts` 3건) + wiring 레벨(`auth.service.spec.ts` 2건) 전건 PASS 로 **완전 충족**. SC-020(전체 스위트 회귀 0건)도 동시 충족.

---

## SC 미커버 항목

없음 — SC-001~020 전건 PASS. 4-카테고리 미커버 분류는 `test/coverage-gap.md` 참조(카테고리 (1) 0건, (2)(3) 5건 — 전건 운영/스위트 성격, Development 복귀 불요). SC-020 관련 §GAP-018-02 와의 관계 절도 RESOLVED 로 갱신됨.

---

## plan.md 매핑표 검증

| SC-ID | 관련 테스트 | 통과 여부 | 미커버 근본원인 |
|---|---|---|---|
| SC-001 | `test/rate-limit.e2e-spec.ts::test_SC001_018_login_21st_request_returns_429` | PASS | - |
| SC-002 | `test/rate-limit.e2e-spec.ts::test_SC002_018_social_login_11th_request_returns_429` | PASS | - |
| SC-003 | `test/rate-limit.e2e-spec.ts::test_SC003_018_naver_state_21st_request_returns_429` | PASS | - |
| SC-004 | `test/rate-limit.e2e-spec.ts::test_SC004_018_forgot_password_6th_request_different_emails_returns_429` | PASS | - |
| SC-005 | `test/rate-limit.e2e-spec.ts::test_SC005_018_find_email_6th_request_returns_429` | PASS | - |
| SC-006 | `test/rate-limit.e2e-spec.ts::test_SC006_018_reset_password_11th_request_returns_429` | PASS | - |
| SC-007 | `src/shared/security/throttler-exception.spec.ts` (3건) | PASS | - |
| SC-008 | `test/static/rate-limit-trust-proxy.spec.ts` (2건) | PASS | - |
| SC-009 | `src/shared/security/client-ip.util.spec.ts` (7건) | PASS | - |
| SC-010 | `src/modules/auth/social-auth.service.spec.ts::test_SC010_018_create_social_account_failure_rolls_back_transaction` | PASS | - |
| SC-011 | `src/modules/auth/social-auth.service.spec.ts::test_SC011_018_p2002_race_fallback_returns_tokens_for_race_winner` + social-auth 5개 spec 전건 | PASS | - |
| SC-012 | `src/modules/auth/auth.service.spec.ts::test_SC012_018_reset_password_wraps_markOtpConsumed_and_revoke_in_single_transaction` | PASS | - |
| SC-013 | `test/auth-reset-atomicity.e2e-spec.ts::test_SC013_018_revoke_failure_rolls_back_password_change` | PASS | - |
| SC-014 | `security-audit.logger.spec.ts` + `auth.service.spec.ts::test_SC014_018_otp_mismatch_calls_security_audit_logger_once` | PASS | - |
| SC-015 | `security-audit.logger.spec.ts::test_SC015_018_rate_limit_exceeded_logs_warn_with_endpoint_and_ip` | PASS | - |
| SC-016 | `security-audit.logger.spec.ts` + `auth.service.spec.ts::test_SC016_018_find_email_calls_security_audit_logger_once` | PASS | - |
| SC-017 | `security-audit.logger.spec.ts`(3건) + `auth.service.spec.ts`(2건 wiring, 정정 반영) | **PASS** | - (GAP-018-02 정정 완료, RESOLVED) |
| SC-018 | `test/static/rate-limit-no-redis.spec.ts` (2건) | PASS | - |
| SC-019 | `security-audit.logger.spec.ts` (2건) | PASS | - |
| SC-020 | 전체 `pnpm --filter backend test` (39 suites/397 tests) | **PASS** | - (GAP-018-02 정정 완료, 전건 PASS 재확인) |

---

## 설계 문서 정합성

- **spec.md FR-001~010 / SC-001~020 대조**: 전건 구현·테스트 대응 확인, 누락 0건. NFR-001~006 임계값(`THROTTLE_*` 상수, `apps/backend/src/shared/security/throttle.constants.ts`)이 spec.md NFR-001~006 수치(20/10/20/5/5/10, 60초)와 정확히 일치.
- **plan.md 코드 예시·ADR 대조**: ADR-001~010 채택안이 실제 코드에 반영됨(`@nestjs/throttler` v6.5.0, `FlyThrottlerGuard`, `trust proxy: 1`, `runInTransaction` 래핑, `SecurityAuditLogger` PinoLogger 래퍼, `maskPhone`, `shared/security/` 모듈 배치) — 매직 넘버 산개 0건(전부 `THROTTLE_*` 상수 참조).
- **인터페이스 계약 대조**: `SocialAuthService.login`·`AuthService.resetPassword` 시그니처·반환형·예외 계약 불변 확인(코드 리뷰). `AuthRepository.revokeAllRefreshTokensByUser` 시그니처 불변, `this.prisma.tx` 전환 확인. 5a 정정 범위(`auth.service.spec.ts` SC-017 describe 블록)는 D 레이어 한정이며 인터페이스 계약에 영향 없음.
- **불일치**: 0건 — GAP-018-02 는 정정 반영으로 해소됨(테스트 자체의 전제 조건 오류였고, production 코드·plan.md·spec.md 간 불일치는 애초에 없었음).
- **GAP-018-01**(infra.md additive 갱신 필요, 문서-갱신-필요 유형): 코드 검증 완료 — `main.ts:12` `app.set('trust proxy', 1)` 존재, `client-ip.util.ts` 의 `Fly-Client-IP`/`X-Forwarded-For` 헤더 처리 확인(SC-008 PASS 로 재확인). Docs Agent(6단계) 코드 검증 완료 후 Retrospective Agent 위임 경로 유지(gaps.md 기존 기록과 동일, 본 5b 재검증은 변경 없음 — 미해결 상태 유지).

### Breaking change 잔여 참조 검증

- tasks.md·plan.md 에 Breaking change 항목 0건(grep 확인) — 잔여 참조 검증 대상 없음.

---

## 회귀 탐지

- 013~017 산출물(social-auth 5개 spec 파일, `auth.util.spec.ts` 의 maskEmail 관련, `auth.service.spec.ts` 의 기존 시나리오) 전건 PASS — 회귀 0건 (재확인).
- 전역 `APP_GUARD`(`FlyThrottlerGuard`) 도입에 따른 e2e 회귀 위험(plan.md "기타 고려사항" 절)은 본 5b 재실행 범위(rate-limit.e2e-spec.ts·auth-reset-atomicity.e2e-spec.ts, SC-XXX 매핑 한정)에서 관찰되지 않음 — 두 e2e 파일 모두 라우트별 고유 `X-Forwarded-For` 로 버킷 격리되어 의도치 않은 429 발생 0건. SC 매핑 밖의 나머지 e2e 스위트(`auth.e2e-spec.ts`, `orders.e2e-spec.ts` 등)는 본 spec 의 실행 범위(SC-XXX 제한, agent-rules.md §실행 범위) 밖이므로 실행하지 않았다 — CI 전체 회귀 검증에 위임.
- typecheck 0 error, unit 397/397 PASS, static 4/4 PASS, e2e(rate-limit 6 + atomicity 1) 7/7 PASS 유지.

---

## 최종 판정

- **gate: PASS** — SC-001~020 전건 충족(20/20). GAP-018-02 는 [B] 테스트 오류로 판정된 대로 5a [재작업] 정정을 거쳐 **RESOLVED** — production 코드 변경 없이 테스트 전제 조건만 수정.
- 정합성 점검 통과, 회귀 0건, STALE_SC 0건(coverage.md 참조).
- **GAP-018-01**(infra.md additive 갱신)만 미해결 상태로 잔존 — Retrospective Agent 위임 대상으로 이미 확정되어 있으며 본 5b gate 판정에 영향 없음(문서-갱신-필요 유형, 코드 정합성 결함 아님).
- **결론**: 5단계(Test Agent, 5a+5b) 완료. 6단계(Docs Agent) 진행 가능.
