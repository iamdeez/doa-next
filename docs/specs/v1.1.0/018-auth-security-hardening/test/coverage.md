---
작성: Test Agent (EXECUTION) / GAP-018-02 정정 반영 — Test Agent (AUTHORING, [재작업] 5a) / 재검증 확정 — Test Agent (EXECUTION, [재작업] 5b)
버전: v1.2
최종 수정: 2026-07-04 06:15
상태: 확정
---

# Coverage: 018-auth-security-hardening

## 목차

- [SC × 시나리오 매트릭스](#sc--시나리오-매트릭스)
- [deferred SC (env 태그 라우팅)](#deferred-sc-env-태그-라우팅)
- [STALE_SC 경고](#stale_sc-경고-현재-spec-에-없는-sc-번호가-docstring-에-잔존)

---

## SC × 시나리오 매트릭스

> "수용 기준" 열은 spec.md 원문을 그대로 복사한다(PATCH-001). "검증 파일" 열은 Glob/Read 로 실재 확인된 경로만 기재한다.

| SC-ID | 수용 기준 | Happy Path | Edge Case | Error Case | plan.md 시나리오 전체 | 상태 |
|---|---|---|---|---|---|---|
| SC-001 | 전역 기본값만 적용되는 라우트(개별 override 없는 엔드포인트, 예: `POST /auth/login`)에 동일 클라이언트 IP 로 60초 이내 21번째 요청 시 `429` 를 반환한다. `[env:integration]` | — | — | ✓ `test/rate-limit.e2e-spec.ts::test_SC001_018_login_21st_request_returns_429` | ✓ | PASS |
| SC-002 | `POST /auth/social-login` 에 동일 클라이언트 IP 로 60초 이내 11번째 요청 시 `429` 를 반환한다. `[env:integration]` | — | — | ✓ `test/rate-limit.e2e-spec.ts::test_SC002_018_social_login_11th_request_returns_429` | ✓ | PASS |
| SC-003 | `POST /auth/naver/state` 에 동일 클라이언트 IP 로 60초 이내 21번째 요청 시 `429` 를 반환한다. `[env:integration]` | — | — | ✓ `test/rate-limit.e2e-spec.ts::test_SC003_018_naver_state_21st_request_returns_429` | ✓ | PASS |
| SC-004 | `POST /auth/forgot-password` 에 서로 다른 이메일을 대상으로 하더라도 동일 클라이언트 IP 로 60초 이내 6번째 요청 시 `429` 를 반환한다(기존 per-email 60초 제한과 독립적으로 IP 레벨에서 차단됨을 검증). `[env:integration]` | — | — | ✓ `test/rate-limit.e2e-spec.ts::test_SC004_018_forgot_password_6th_request_different_emails_returns_429` | ✓ | PASS |
| SC-005 | `POST /auth/find-email` 에 동일 클라이언트 IP 로 60초 이내 6번째 요청 시 `429` 를 반환한다. `[env:integration]` | — | — | ✓ `test/rate-limit.e2e-spec.ts::test_SC005_018_find_email_6th_request_returns_429` | ✓ | PASS |
| SC-006 | `POST /auth/reset-password` 에 동일 클라이언트 IP 로 60초 이내 11번째 요청 시 `429` 를 반환한다. `[env:integration]` | — | — | ✓ `test/rate-limit.e2e-spec.ts::test_SC006_018_reset_password_11th_request_returns_429` | ✓ | PASS |
| SC-007 | rate limit 초과 응답의 HTTP 상태코드가 정확히 `429` 이며 NestJS 표준 `ThrottlerException` 응답 형식과 일치한다. `[env:unit]` | ✓ `src/shared/security/throttler-exception.spec.ts::test_SC007_018_throttler_exception_status_is_429`, `::test_SC007_018_throttler_exception_response_body_has_standard_shape`, `::test_SC007_018_throttler_exception_is_http_exception_instance` | — | — | ✓ | PASS |
| SC-008 | `main.ts` 에 클라이언트 IP 신뢰 설정(trust proxy)이 존재하고, rate limit 트래킹 로직이 `Fly-Client-IP`/`X-Forwarded-For` 헤더 기반 IP 를 우선 사용함을 코드 정적 검증으로 확인한다. `[env:static]` | — (검증형) | — | — | ✓ | PASS `test/static/rate-limit-trust-proxy.spec.ts::test_SC008_018_main_ts_sets_trust_proxy`, `::test_SC008_018_client_ip_util_prefers_fly_client_ip_and_xff` |
| SC-009 | 동일 프록시 연결에서 서로 다른 `X-Forwarded-For` 클라이언트 IP 헤더 값으로 요청을 보내면 각각 독립적인 rate limit 버킷으로 카운트된다(헤더 mock 기반 단위 테스트). `[env:unit]` | — | ✓ `src/shared/security/client-ip.util.spec.ts::test_SC009_018_different_xff_headers_yield_different_tracker_values` (+ 보조 6건: 우선순위·fallback·배열방어·빈문자열) | — | ✓ | PASS |
| SC-010 | `SocialAuthService.login()` path 3c 테스트에서 `createSocialAccount` 실패를 강제할 때, `createUser` 로 생성 시도된 사용자 행이 커밋되지 않고 트랜잭션 전체가 롤백됨을 검증한다. `[env:unit]` | — | — | ✓ `src/modules/auth/social-auth.service.spec.ts::test_SC010_018_create_social_account_failure_rolls_back_transaction` | ✓ | PASS |
| SC-011 | 기존 P2002 동시성 경합 폴백 로직(신규가입 레이스)이 트랜잭션 래핑 이후에도 회귀 없이 동일하게 동작한다(기존 `social-auth.service.spec.ts` 관련 테스트 PASS 유지). `[env:unit]` | — | ✓ `src/modules/auth/social-auth.service.spec.ts::test_SC011_018_p2002_race_fallback_returns_tokens_for_race_winner` + 013/014 선행 회귀 테스트(social-auth 5개 spec 파일) 전건 PASS | — | ✓ | PASS |
| SC-012 | `resetPassword()` 실행 시 `revokeAllRefreshTokensByUser` 호출이 `markOtpConsumed` 와 동일 트랜잭션 컨텍스트 내에서 실행됨을 검증한다(트랜잭션 경계 mock/spy 단언). `[env:unit]` | ✓ `src/modules/auth/auth.service.spec.ts::test_SC012_018_reset_password_wraps_markOtpConsumed_and_revoke_in_single_transaction` | — | — | ✓ | PASS |
| SC-013 | `revokeAllRefreshTokensByUser` 가 실패하도록 강제하면 비밀번호 변경도 함께 롤백되어, 재설정 이전 비밀번호로 로그인 가능한 상태가 유지된다. `[env:integration]` | — | — | ✓ `test/auth-reset-atomicity.e2e-spec.ts::test_SC013_018_revoke_failure_rolls_back_password_change` | ✓ | PASS |
| SC-014 | OTP 값 불일치 시 WARN 수준 로그가 1건 기록되고 로그 메시지에 이메일이 마스킹된 형태로 포함됨을 검증한다. `[env:unit]` | — | — | ✓ `src/shared/security/security-audit.logger.spec.ts::test_SC014_018_otp_verification_failed_logs_warn_with_masked_email` + `src/modules/auth/auth.service.spec.ts::test_SC014_018_otp_mismatch_calls_security_audit_logger_once`(wiring) | ✓ | PASS |
| SC-015 | rate limit 초과(429) 발생 시 WARN 수준 로그가 1건 기록되고 대상 엔드포인트·클라이언트 IP 정보가 포함됨을 검증한다. `[env:unit]` | — | — | ✓ `src/shared/security/security-audit.logger.spec.ts::test_SC015_018_rate_limit_exceeded_logs_warn_with_endpoint_and_ip` (+ `test/rate-limit.e2e-spec.ts` 로 `event=rate_limit_exceeded` 실 로그 발생 간접 확인) | ✓ | PASS |
| SC-016 | `find-email` 호출 시 WARN 수준 로그가 1건 기록되고 조회 전화번호·반환 이메일이 마스킹된 형태로 포함됨을 검증한다. `[env:unit]` | ✓ `src/shared/security/security-audit.logger.spec.ts::test_SC016_018_find_email_accessed_logs_warn_with_masked_phone_and_email` + `src/modules/auth/auth.service.spec.ts::test_SC016_018_find_email_calls_security_audit_logger_once`(wiring) | — | — | ✓ | PASS |
| SC-017 | 보안 감사 로그 기록 로직이 예외를 던지도록 mock 하더라도 OTP 검증·find-email·429 처리의 원 응답(상태코드·바디)이 로깅 미적용 시와 동일하게 유지된다. `[env:unit]` | — | — | ✓ `src/shared/security/security-audit.logger.spec.ts` 로거 레벨(`PinoLogger.warn` throw mock, plan.md Input 정합) 3건 PASS + `src/modules/auth/auth.service.spec.ts` wiring(실 `SecurityAuditLogger` 인스턴스 + `PinoLogger.warn` throw mock) 2건 PASS — `test_SC017_018_reset_password_otp_mismatch_unaffected_by_logger_throw`, `test_SC017_018_find_email_unaffected_by_logger_throw` | ✓ | PASS — GAP-018-02 정정 완료([재작업] 5a, `auth.service.spec.ts` 한정, production 코드 변경 없음) |
| SC-018 | `apps/backend/package.json` 에 Redis 등 외부 캐시/저장소 의존성이 신규로 추가되지 않았음을 정적 검증한다. `[env:static]` | — (검증형) | — | — | ✓ | PASS `test/static/rate-limit-no-redis.spec.ts::test_SC018_018_no_redis_storage_packages_in_package_json`, `::test_SC018_018_nestjs_throttler_itself_is_allowed` |
| SC-019 | 감사 로그로 출력되는 문자열에 원본(비마스킹) 이메일·전화번호 패턴이 포함되지 않음을 정규식 기반으로 검증한다. `[env:unit]` | — | ✓ `src/shared/security/security-audit.logger.spec.ts::test_SC019_018_otp_verification_failed_no_raw_email_pattern`, `::test_SC019_018_find_email_accessed_no_raw_phone_or_email_pattern` | — | ✓ | PASS |
| SC-020 | 본 spec 변경 이후 backend 전체 unit 테스트 스위트가 회귀 0건으로 PASS 한다. `[env:unit]` | 전체 `pnpm --filter backend test` — **39 suites/397 tests 전건 PASS**(GAP-018-02 정정 후 재확인) | — | — | ✓ | PASS |

> SC-001~020 전건(20건) PASS — GAP-018-02([B] 테스트 오류) 는 `auth.service.spec.ts` 한정 [재작업] 5a 로 정정 완료(2026-07-04 06:11, production 코드 변경 없음). 매핑 누락 0건 — tasks.md "SC ↔ 테스트 매핑" 표와 정합.
>
> **5b 재검증 확정 (2026-07-04 06:15)**: 위 5a 정정을 5b 가 독립적으로 재실행하여 확인 — `pnpm --filter backend typecheck`(0 error), `pnpm --filter backend test`(39 suites/397 tests 전건 PASS), 정적 2종(4/4 PASS), e2e rate-limit(6/6 PASS)·atomicity(1/1 PASS) 전건 재확인. GAP-018-02 **RESOLVED**, gate: PASS 로 최종 확정. 상세는 `test/test-report.md` 참조.

---

## deferred SC (env 태그 라우팅)

없음 — SC-001~006·013(`[env:integration]`)은 옵션 A(로컬 docker-compose PostgreSQL 16, `doa-next-postgres-1` 컨테이너)가 가용하여 본 5b 가 직접 실행·판정했다(deferred 미적용).

---

## STALE_SC 경고 (현재 spec 에 없는 SC 번호가 docstring 에 잔존)

없음 — PATCH-A18 검출 범위(본 차수 git diff 변경/신규 파일 14개: `auth.service.spec.ts`·`auth.util.spec.ts`·social-auth 5개 spec·`security-audit.logger.spec.ts`·`client-ip.util.spec.ts`·`throttler-exception.spec.ts`·`rate-limit-{trust-proxy,no-redis}.spec.ts`·`rate-limit.e2e-spec.ts`·`auth-reset-atomicity.e2e-spec.ts`) 전수 재검증 결과, 018 범위 밖 SC 번호(예: `auth.service.spec.ts` 의 SC-018/022/023 (v1.1.0/013 spec), SC-003/020 (v1.1.0/014 spec); `auth.util.spec.ts` 의 SC-024 (v1.1.0/013 spec) 추정; social-auth 5개 spec 의 SC-001~010 (v1.0.0/003·v1.1.0/014~016 spec) 등)는 전건 `(vX.Y.Z/NNN spec)` 출처 주석을 보유 — silence 대상. 018 신규 SC 마커(auth.service.spec.ts 의 SC-012/014/016/017 등, 신규 5파일)는 전건 `(v1.1.0/018 spec)` 출처 주석 보유(PATCH-016-01 준수). STALE_SC 0건.
