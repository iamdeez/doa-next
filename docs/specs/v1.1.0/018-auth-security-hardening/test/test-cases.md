---
작성: Test Agent (AUTHORING)
버전: v1.1
최종 수정: 2026-07-04 06:11
상태: 확정
---

# Test Cases: 018-auth-security-hardening

> Branch: 018-auth-security-hardening | Mode: AUTHORING (5a, PPG-1) | Tasks: [../design/tasks.md](../design/tasks.md)

## 목차

- [SC × 시나리오 매트릭스](#sc--시나리오-매트릭스)
- [외부 의존성 명시](#외부-의존성-명시)
- [미커버 항목 (사전 분류 — 4-카테고리)](#미커버-항목-사전-분류--4-카테고리)
- [SC 없는 FR 역방향 검증](#sc-없는-fr-역방향-검증)
- [AUTHORING 자체 검증 결과](#authoring-자체-검증-결과)

---

## SC × 시나리오 매트릭스

| SC-ID | 수용 기준 | Happy Path | Edge Case | Error Case | 테스트 파일·함수 | env 태그 |
|---|---|---|---|---|---|---|
| SC-001 | 전역 기본값 라우트(`/auth/login`) 동일 IP 21회째 → 429 | — | — | `test_SC001_018_login_21st_request_returns_429` | `apps/backend/test/rate-limit.e2e-spec.ts` | [env:integration] 옵션A |
| SC-002 | `/auth/social-login` 동일 IP 11회째 → 429 | — | — | `test_SC002_018_social_login_11th_request_returns_429` | `apps/backend/test/rate-limit.e2e-spec.ts` | [env:integration] 옵션A |
| SC-003 | `/auth/naver/state` 동일 IP 21회째 → 429 | — | — | `test_SC003_018_naver_state_21st_request_returns_429` | `apps/backend/test/rate-limit.e2e-spec.ts` | [env:integration] 옵션A |
| SC-004 | `/auth/forgot-password` 상이 email·동일 IP 6회째 → 429 | — | — | `test_SC004_018_forgot_password_6th_request_different_emails_returns_429` | `apps/backend/test/rate-limit.e2e-spec.ts` | [env:integration] 옵션A |
| SC-005 | `/auth/find-email` 동일 IP 6회째 → 429 | — | — | `test_SC005_018_find_email_6th_request_returns_429` | `apps/backend/test/rate-limit.e2e-spec.ts` | [env:integration] 옵션A |
| SC-006 | `/auth/reset-password` 동일 IP 11회째 → 429 | — | — | `test_SC006_018_reset_password_11th_request_returns_429` | `apps/backend/test/rate-limit.e2e-spec.ts` | [env:integration] 옵션A |
| SC-007 | 429 응답 = 표준 `ThrottlerException` 형식(상태코드·바디) | `test_SC007_018_throttler_exception_status_is_429`, `test_SC007_018_throttler_exception_response_body_has_standard_shape`, `test_SC007_018_throttler_exception_is_http_exception_instance` | — | — | `apps/backend/src/shared/security/throttler-exception.spec.ts` | [env:unit] |
| SC-008 | `main.ts` trust proxy + `client-ip.util.ts` tracker 헤더 정적 검증 | — | — | — (검증형) | `test_SC008_018_main_ts_sets_trust_proxy`, `test_SC008_018_client_ip_util_prefers_fly_client_ip_and_xff` | [env:static] |
| SC-009 | 동일 프록시·상이 X-Forwarded-For → 상이 tracker 값 | — | `test_SC009_018_different_xff_headers_yield_different_tracker_values` + 보조 4건(우선순위·fallback·배열 방어) | — | `apps/backend/src/shared/security/client-ip.util.spec.ts` | [env:unit] |
| SC-010 | path 3c `createSocialAccount` 실패 → 트랜잭션 전체 롤백(`runInTransaction` throw 전파) | — | — | `test_SC010_018_create_social_account_failure_rolls_back_transaction` | `apps/backend/src/modules/auth/social-auth.service.spec.ts` | [env:unit] |
| SC-011 | P2002 동시성 폴백 — 트랜잭션 래핑 이후에도 회귀 없음 | — | `test_SC011_018_p2002_race_fallback_returns_tokens_for_race_winner` | — | `apps/backend/src/modules/auth/social-auth.service.spec.ts` | [env:unit] |
| SC-012 | revoke 가 markOtpConsumed 와 동일 tx 경계 내 실행(spy 순서·경계 단언) | `test_SC012_018_reset_password_wraps_markOtpConsumed_and_revoke_in_single_transaction` | — | — | `apps/backend/src/modules/auth/auth.service.spec.ts` | [env:unit] |
| SC-013 | revoke 실패 강제 시 비밀번호 변경도 롤백(이전 비밀번호로 로그인 가능) | — | — | `test_SC013_018_revoke_failure_rolls_back_password_change` | `apps/backend/test/auth-reset-atomicity.e2e-spec.ts` | [env:integration] 옵션A |
| SC-014 | OTP 불일치 시 WARN 1건 + email 마스킹 | — | — | `test_SC014_018_otp_verification_failed_logs_warn_with_masked_email`(로거) + `test_SC014_018_otp_mismatch_calls_security_audit_logger_once`(wiring) | `security-audit.logger.spec.ts` + `auth.service.spec.ts` | [env:unit] |
| SC-015 | 429 발생 시 WARN 1건 + endpoint·ip 포함 | — | — | `test_SC015_018_rate_limit_exceeded_logs_warn_with_endpoint_and_ip` | `apps/backend/src/shared/security/security-audit.logger.spec.ts` | [env:unit] 계약상 guard 직접 테스트 불요(Test Authoring Contract) |
| SC-016 | find-email 시 WARN 1건 + phone/email 마스킹 | `test_SC016_018_find_email_accessed_logs_warn_with_masked_phone_and_email`(로거) + `test_SC016_018_find_email_calls_security_audit_logger_once`(wiring) | — | — | `security-audit.logger.spec.ts` + `auth.service.spec.ts` | [env:unit] |
| SC-017 | 로거 throw 해도 원 응답 불변(best-effort) | — | — | `test_SC017_018_*_swallows_logger_throw`(로거, `PinoLogger.warn` throw mock, plan.md Input 정합, 3건) + `test_SC017_018_reset_password_otp_mismatch_unaffected_by_logger_throw`/`test_SC017_018_find_email_unaffected_by_logger_throw`(wiring, **GAP-018-02 정정 — 실 `SecurityAuditLogger` 인스턴스 + `PinoLogger.warn` throw mock 조합으로 재작성, PASS**) | `security-audit.logger.spec.ts` + `auth.service.spec.ts` | [env:unit] |
| SC-018 | `package.json` Redis 등 신규 저장소 의존 0건 | — | — | — (검증형) | `test_SC018_018_no_redis_storage_packages_in_package_json`, `test_SC018_018_nestjs_throttler_itself_is_allowed` | [env:static] |
| SC-019 | 로그 문자열에 비마스킹 email/phone 패턴 부재 | — | `test_SC019_018_otp_verification_failed_no_raw_email_pattern`, `test_SC019_018_find_email_accessed_no_raw_phone_or_email_pattern` | — | `apps/backend/src/shared/security/security-audit.logger.spec.ts` | [env:unit] |
| SC-020 | backend 전체 unit 스위트 회귀 0건 | (전체 스위트 — T026, 5b 실행 시점 판정) | — | — | 전체 `pnpm --filter backend test` | [env:unit] |

> 시나리오 유형 커버리지: Happy(SC-007·012·016) · Edge(SC-009·011·019) · Error(SC-001~006·010·013·014·017) · 검증형(SC-008·018·020). spec.md 요구사항 구조화 매트릭스(§테스트 전략)와 정합.
>
> **T018(maskPhone) 보조 커버리지**: `apps/backend/src/modules/auth/auth.util.spec.ts` 에 `maskPhone` 단위 테스트(표준 11자리·짧은 값·경계값·구분자 포함) 4건 추가 — SC-016 의 마스킹 유틸 자체를 보강 검증(SC-016 본 단언은 위 `security-audit.logger.spec.ts`/`auth.service.spec.ts` 가 담당).

---

## 외부 의존성 명시

- **fixture**: 없음(신규 fixture 파일 불요 — 인라인 상수 프로필/사용자 객체 사용).
- **mock**:
  - `PinoLogger`(nestjs-pino) — `{ warn: jest.fn(), setContext: jest.fn() }` (`SecurityAuditLogger` 단위 테스트 주입, Test Authoring Contract canonical).
  - `PrismaService` — `{ runInTransaction: jest.fn(async (fn) => fn()), tx: {} }` (`AuthService`·`SocialAuthService` 단위 테스트, 콜백 실제 실행으로 내부 repo 호출 유지).
  - `SecurityAuditLogger` — `{ otpVerificationFailed, rateLimitExceeded, findEmailAccessed }` 3종 `jest.fn()` (`AuthService` wiring 단위 테스트).
  - `AuthRepository`·`JwtService`·`ConfigService`·`MailerPort` — 기존(013/014/015/016) 패턴 재사용.
- **환경 변수**: 단위·정적 테스트는 불요(전 항목 mock/fs 파싱). e2e(`test:e2e`)는 기존 `.env`(DATABASE_URL 등) 필요.
- **외부 서비스**:
  - 단위·정적 SC(007~012·014~019)는 실 DB·네트워크 불요.
  - 통합 SC(001~006·013)는 옵션 A(로컬 `docker compose up -d` PostgreSQL 16) — main session 확정.
    - `rate-limit.e2e-spec.ts`: `Test.createTestingModule({imports:[AppModule]})` 독립 앱 기동, `app.set('trust proxy', 1)` 재현(main.ts SC-008 대상 설정), 라우트별 고유 `X-Forwarded-For` 로 버킷 격리.
    - `auth-reset-atomicity.e2e-spec.ts`: 사용자·OTP 직접 seed(`prisma.user.upsert`/`prisma.passwordResetOtp.create`) 후 `jest.spyOn(app.get(AuthRepository), 'revokeAllRefreshTokensByUser').mockRejectedValue(...)` 로 강제 실패, 재설정 이전 비밀번호 로그인 성공으로 롤백 확인.

---

## 미커버 항목 (사전 분류 — 4-카테고리)

단위테스트로 검증 불가능한 SC 를 사전 분류하여 5b 의 `coverage-gap.md` 작성에 참조한다.

| SC-ID | 미커버 사유 | 카테고리 | 권장 검증 방법 |
|---|---|---|---|
| (참고) Fly-Client-IP 실 헤더 운영 동작 | `resolveClientIp` 단위 테스트(SC-009)는 mock req 헤더로 우선순위·fallback 로직만 검증 가능. 실제 Fly.io 엣지 프록시가 문서대로 `Fly-Client-IP` 헤더를 주입하는지는 운영 배포 이후에만 확인 가능(spec.md PROC-014 시나리오 1) | (3) 운영 환경에서 확인 권장 | 운영 배포 후 Fly 로그 스트림에서 `rate_limit_exceeded` WARN 필드(`ip`)가 클라이언트별로 정확히 분리되는지 샘플 점검 |
| (참고) 정상 사용자 429 오탐(NAT/CGNAT 공유 IP) | 다수 사용자가 동일 공인 IP 를 공유하는 실 트래픽 패턴은 mock/e2e 로 재현 불가 | (3) 운영 환경에서 확인 권장 | 운영 트래픽에서 NFR-001~006 임계값이 실사용자 경험에 미치는 영향 관찰(spec.md PROC-014 시나리오 2) |
| (참고) 소셜 신규가입 동시성 부하(다수 동시 최초가입) | P2002 폴백 경로(SC-011)는 단일 요청 mock 으로 검증되었으나, 실제 동시 다발 요청 트래픽 패턴에서의 동작은 부하 테스트·운영 관찰 영역 | (3) 운영 환경에서 확인 권장 | 운영 배포 후 실 트래픽 관찰(spec.md PROC-014 시나리오 3) |
| (참고) 보안 감사 로그 노이즈 수준 | WARN 로그 발생 빈도가 실제 침해 시도 신호를 가리는지는 운영 트래픽 볼륨에 의존 | (3) 운영 환경에서 확인 권장 | 운영 배포 후 최소 1주 Fly 로그 스트림 샘플 점검(spec.md PROC-014 시나리오 4) |
| SC-020(전체 unit 회귀) 자체 | "전체 스위트 회귀 0건"은 개별 테스트 케이스가 아니라 AUTHORING 완료 시점의 스위트 실행 결과로만 확정 가능 — 5b EXECUTION 이 공식 판정 | (2) 단위테스트 불가(성격상 개별 테스트로 환원 불가) | 5b `pnpm --filter backend test` 전체 실행. GAP-018-02 정정([재작업] 5a) 후 재실행 결과: 39 suites/397 tests 전건 PASS(하단 §AUTHORING 자체 검증 결과 참조) |

> 카테고리 (1) 단위테스트 가능 항목은 0건 — 본 spec 의 [env:unit]/[env:static]/[env:integration] SC(001~019)는 전건 T016~T025 테스트 파일로 작성 완료.
> 카테고리 (2)(3) 만 존재 → 5b EXECUTION 단계로 위임 종료 가능. GAP-018-02(SC-017 wiring 2건, [B] 테스트 오류 — 5b 판정)는 `auth.service.spec.ts` 한정 [재작업] 5a 로 정정 완료(실 `SecurityAuditLogger` 인스턴스 + `PinoLogger.warn` throw mock 조합, plan.md Input 정합) — gaps.md GAP-018-02 갱신 참조.

---

## SC 없는 FR 역방향 검증

spec.md FR-001~010 전건이 요구사항 구조화 매트릭스에서 SC-XXX 에 매핑됨을 확인(spec.md §요구사항 구조화 매트릭스 직접 대조).

| FR-ID | 매핑 SC-ID | 확인 |
|---|---|---|
| FR-001 | SC-001 | ✓ |
| FR-002 | SC-002, SC-003, SC-004, SC-005, SC-006 | ✓ |
| FR-003 | SC-007 | ✓ |
| FR-004 | SC-008, SC-009 | ✓ |
| FR-005 | SC-010, SC-011 | ✓ |
| FR-006 | SC-012, SC-013 | ✓ |
| FR-007 | SC-014 | ✓ |
| FR-008 | SC-015 | ✓ |
| FR-009 | SC-016 | ✓ |
| FR-010 | SC-017 | ✓ |
| (NFR-007) | SC-018 | ✓ |
| (NFR-009) | SC-019 | ✓ |
| (NFR-010) | SC-020 | ✓ |

**결과**: SC 없는 FR 0건. tasks.md "SC ↔ 테스트 매핑" 표(매핑 누락 0건 명시)와 정합.

---

## AUTHORING 자체 검증 결과

PPG-1 병렬 진행 중 4단계 Development Agent 가 Step 1~3(A·B·C 레이어)를 본 AUTHORING 작업과
거의 동시에 완료하여, 아래 실행 결과로 계약 정합성을 자체 확인했다(참고 정보 — 5b EXECUTION 의
공식 실행·판정을 대체하지 않음).

- `apps/backend`: `pnpm --filter backend typecheck`(`tsc --noEmit`) → 컴파일 오류 0건(PATCH-05, 신규·수정 테스트 파일 전체 포함 확인).
- 백엔드 전체 unit 스위트(`pnpm --filter backend test`, e2e 제외): **39 suites/397 tests 전건 PASS**.

### GAP-018-02 정정 이력 ([재작업] 5a, 2026-07-04 06:11)

최초 AUTHORING 시점에는 `auth.service.spec.ts` 의 SC-017 wiring 2건
(`test_SC017_018_reset_password_otp_mismatch_unaffected_by_logger_throw`,
`test_SC017_018_find_email_unaffected_by_logger_throw`)이 `SecurityAuditLogger` **전체를
mock 하여 throw** 시키는 방식으로 작성되어 FAIL 했다(39 suites 중 38 PASS, 397 tests 중
395 PASS·2 FAIL). 5b EXECUTION 이 이를 **[B] 테스트 오류**로 판정했다(근거:
`test/test-report.md` §GAP-018-02 판정) — production `AuthService.resetPassword`/`findEmail`
호출부(`auth.service.ts:262`·`:300`)는 plan.md 설계(ADR-007, `SecurityAuditLogger` 단일 계층
best-effort 집중)와 정확히 일치하며, `SecurityAuditLogger` 의 3개 public 메서드는 모두 내부
try/catch 로 절대 throw 하지 않으므로 "DI 주입된 `SecurityAuditLogger` 인스턴스가 throw 하는"
전제 자체가 production 에서 도달 불가능한 분기였다. plan.md 테스트 전략표(SC-017 행)의 Input 은
`PinoLogger.warn` throw mock 이며, 그 시나리오는 이미 `security-audit.logger.spec.ts` 3건으로
PASS 하고 있었다.

**정정 내용**: `auth.service.spec.ts` 의 SC-017 describe 블록을 재작성 — `SecurityAuditLogger`
전체를 mock 하는 대신, **실제 `SecurityAuditLogger` 인스턴스**를 `{ warn: jest.fn(() => throw),
setContext: jest.fn() }` 형태의 `PinoLogger` mock 과 함께 구성하여 AuthService provider 로
주입했다(plan.md Input 과 정확히 일치하는 end-to-end wiring). 2건 모두 재실행 결과 PASS —
production 코드(`auth.service.ts`, `security-audit.logger.ts`) 변경 없음, 테스트 파일
(`auth.service.spec.ts`)만 정정. `pnpm --filter backend typecheck` 0 error,
`pnpm --filter backend test` 39 suites/397 tests 전건 PASS 재확인.
- `apps/backend/test/` 하위 파일은 단위(`pnpm --filter backend test`, `jest` 기본 설정 —
  `rootDir: "src"`)가 아니라 `pnpm --filter backend test:e2e`(`test/jest-e2e.json`,
  `rootDir: "."`, `.spec.ts`/`.e2e-spec.ts` 모두 매칭) 대상이다.
  `test/static/rate-limit-trust-proxy.spec.ts`·`test/static/rate-limit-no-redis.spec.ts`(T022·T023)는
  DB 비의존(fs 파싱만)이므로 AUTHORING 시점에 `npx jest --config ./test/jest-e2e.json
  --testPathPattern="static/rate-limit"` 로 선행 실행 확인했다: **2 suites / 4 tests 전건 PASS**.
- `test/rate-limit.e2e-spec.ts`(T024)·`test/auth-reset-atomicity.e2e-spec.ts`(T025)는 실 PostgreSQL
  연결이 필요(옵션 A — 로컬 docker-compose)하므로 AUTHORING 단계에서는 DB 미기동으로 실행하지
  않았다(5b 가 옵션 A 환경에서 실행·판정). 두 파일 모두 `pnpm --filter backend typecheck` 컴파일
  검증(PATCH-05)은 통과했다.

STALE_SC 점검(PATCH-A18 — 본 차수 git diff 변경 파일 한정): 신규·수정 테스트 파일(`auth.service.spec.ts`,
5개 `social-auth.service*.spec.ts`, `security-audit.logger.spec.ts`, `client-ip.util.spec.ts`,
`throttler-exception.spec.ts`, `auth.util.spec.ts`, `rate-limit.e2e-spec.ts`,
`auth-reset-atomicity.e2e-spec.ts`, `rate-limit-trust-proxy.spec.ts`, `rate-limit-no-redis.spec.ts`)에서
발견된 신규 SC 마커는 모두 `(v1.1.0/018 spec)` 출처 주석을 처음부터 포함(PATCH-016-01) —
SC-001~020 범위 내로 018 spec 과 일치. 기존 파일에 잔존하는 선행 spec(012~017) SC 번호는 모두
`(vX.Y.Z/NNN spec)` 형식 출처 주석을 이미 보유(PATCH-A18 silence 대상). STALE_SC 0건.
