---
작성: Test Agent (EXECUTION)
버전: v2.0
최종 수정: 2026-07-05 18:05
상태: 확정
---

# Coverage: 019-security-quality-followups

> **재검증 라운드(v2.0)**: PPG-1 fix(T016 tx getter delegate 복원·T017 GET 8핸들러 @SkipThrottle·T018 prisma.service.spec.ts) 완료 후 5b 재실행. v1.0(2026-07-05 17:30)은 GAP-019-03(P0)·GAP-019-04(Medium)로 SC-006·SC-010·SC-017 을 FAIL 판정했다. 본 라운드는 SC-006·SC-010 unblock 여부와 SC-017 잔존 여부를 재검증한다.

## 목차

- [SC 커버리지 매트릭스](#sc-커버리지-매트릭스)
- [전체 e2e 실행 결과 상세 (SC-017 판정 근거)](#전체-e2e-실행-결과-상세-sc-017-판정-근거)
- [SC-017 잔존 2건 정밀 재현 (GAP-019-05)](#sc-017-잔존-2건-정밀-재현-gap-019-05)
- [SC-009 EXPLAIN 재확인](#sc-009-explain-재확인)
- [STALE_SC 경고](#stale_sc-경고)

---

## SC 커버리지 매트릭스

| SC-ID | 수용 기준 | Happy Path | Edge Case | Error Case | plan.md 시나리오 전체 | 상태 |
|---|---|---|---|---|---|---|
| SC-001 | `GET /admin/sellers/pending?limit=abc` → 400 (FR-001) | — | — | `test_SC001_admin_sellers_pending_non_integer_limit_returns_400` PASS | 커버 | PASS |
| SC-002 | `GET /admin/users?limit=abc` → 400 (FR-002) | — | — | `test_SC002_admin_users_non_integer_limit_returns_400` PASS | 커버 | PASS |
| SC-003 | `GET /admin/audit-logs?limit=abc` → 400 (FR-003) | — | — | `test_SC003_admin_audit_logs_non_integer_limit_returns_400` PASS | 커버 | PASS |
| SC-004 | `GET /sellers/me/products?limit=abc` → 400 (FR-004) | — | — | `test_SC004_sellers_me_products_non_integer_limit_returns_400` PASS | 커버 | PASS |
| SC-005 | FR-001~FR-004 4개 엔드포인트 `limit=0`·`limit=101` → 400 | — | `test_SC005_*`(it.each ×4엔드포인트×2값=8건) 전건 PASS | — | 커버 | PASS |
| SC-006 | FR-001~FR-004 4개 엔드포인트 모두 유효 정수 `limit`(예: 20) → 200 + 기존 응답 구조(NFR-001) | `test_SC006_*`(×5, admin/audit-logs 포함) **전건 PASS** — `test/list-query-dto.e2e-spec.ts` 17/17 PASS | — | — | 커버(**unblock 확정**, GAP-019-03 RESOLVED) | **PASS** |
| SC-007 | `schema.prisma` Product 모델 `sellerId` 선두 복합 인덱스 [env:static] | `test_SC007_product_model_has_sellerId_leading_composite_index` PASS | — | — | 커버 | PASS |
| SC-008 | `schema.prisma` Seller 모델 `status` 선두 복합 인덱스 [env:static] | `test_SC008_seller_model_has_status_leading_composite_index` PASS | — | — | 커버 | PASS |
| SC-009 | 신규 마이그레이션 적용 후 로컬 PostgreSQL `EXPLAIN` 결과 Seq Scan 아닌 Index Scan [env:e2e-db] | 재확인(products 9건·sellers 1건, planner Seq Scan 선택 — v1.0 과 동일) | — | — | 환경 제약(데이터 규모)으로 문면 미충족, 구조적 정상성 확인 | **환경-제약(coverage-gap 기록, v1.0 과 동일 — 재발/변화 없음)** |
| SC-010 | 인덱스 마이그레이션 전후 `GET /sellers/me/products`·`GET /admin/sellers/pending` 기존 e2e 응답 동일(회귀 없음) [env:integration] | `test/perf/list-p95.e2e-spec.ts` 2/2 PASS · `test/products.e2e-spec.ts` 2/2 PASS · `test/banner-admin.e2e-spec.ts` 5/5 PASS — **전건 PASS** | — | — | 커버(**unblock 확정**, GAP-019-04 GET 목록분 RESOLVED) | **PASS** |
| SC-011 | 미등록 phone → `findEmailNotFound` 호출 + 404 [env:unit] | `auth.service.spec.ts` 내 SC-011 케이스 PASS(unit 404/404 에 포함) | — | — | 커버 | PASS |
| SC-012 | SC-011 신규 감사 이벤트에 `maskPhone` 마스킹 값만 기록 [env:unit] | `test_SC012_019_find_email_not_found_logs_warn_with_masked_phone` PASS | — | — | 커버 | PASS |
| SC-013 | 감사 로거 내부 예외 발생해도 `findEmail` 정상 404 반환(best-effort) [env:unit] | `test_SC013_019_*`(×2) PASS | — | — | 커버 | PASS |
| SC-014 | Authorization 헤더 redact [env:integration] | `test_SC014_authorization_header_redacted_in_pino_log` PASS | — | — | 커버 | PASS |
| SC-015 | Cookie 헤더 redact [env:integration] | `test_SC015_cookie_header_redacted_in_pino_log` PASS | — | — | 커버 | PASS |
| SC-016 | 인증/인가 기존 테스트 회귀 없음 [env:unit] | `test/static/auth-required-guards.spec.ts` PASS · `test/rate-limit.e2e-spec.ts` 6/6 PASS(mutating/auth NFR-001~006 임계값 회귀 0) | — | — | 커버 | PASS |
| SC-017 | 본 spec 구현 완료 후 전체 테스트 스위트(unit·e2e·static) 회귀 없이 100% PASS [env:integration] | unit 404/404 PASS · static 13 suites/60 tests PASS · e2e 24/26 suites, **125/127 tests PASS** — 잔존 2건(아래 상세) | — | — | 미충족(2건 잔존, GAP-019-05 신규) | **FAIL** |

> **SC 3유형 커버 확인**: Happy(SC-006~010·012·014~017 해당분) · Edge(SC-005) · Error(SC-001~004·011·013) 전 유형 실행 완료. **SC-006·SC-010 은 이번 재검증으로 PASS 전환**(v1.0 대비 unblock). SC-017 은 잔존 2건(GAP-019-05, 019 비원인·production 정상)으로 FAIL 유지.

---

## 전체 e2e 실행 결과 상세 (SC-017 판정 근거)

`pnpm exec jest --config ./test/jest-e2e.json --runInBand`(Development 와 동일 실행 방식) 재현 결과:

| 파일 | 결과 | 원인 | 019 변경 여부 (`git diff 62d14f9`) |
|---|---|---|---|
| `test/list-query-dto.e2e-spec.ts` | **17/17 PASS** | — (v1.0 대비 SC-006 admin/audit-logs 전환) | 신규(019 산출물) |
| `test/pino-redact.e2e-spec.ts` | 2/2 PASS | — | 신규(019 산출물) |
| `test/static/*`(13 suites) | 60/60 PASS | — | list-index.spec.ts 신규(019), 나머지 미변경 |
| `test/banner-admin.e2e-spec.ts` | 5/5 PASS | — | 미변경 |
| `test/rate-limit.e2e-spec.ts` | 6/6 PASS | — | 미변경 |
| `test/auth-reset-atomicity.e2e-spec.ts` | 1/1 PASS | — | 미변경 |
| `test/health.e2e-spec.ts` | PASS | — | 미변경 |
| `test/orders.e2e-spec.ts` | PASS | — | 미변경 |
| `test/payments.e2e-spec.ts` | PASS(SC-046 은 `TEST_JWT_TOKEN` 미설정으로 사전 SKIP — 정상) | — | 미변경 |
| `test/search-notification-file.e2e-spec.ts` | PASS | — | 미변경 |
| `test/perf/list-p95.e2e-spec.ts` | **2/2 PASS**(v1.0: 0/2 FAIL) | GAP-019-04 GET 목록분 RESOLVED(T017) | 미변경(diff 0) |
| `test/products.e2e-spec.ts` | **2/2 PASS**(v1.0: 0/2 FAIL) | GAP-019-04 GET 목록분 RESOLVED(T017) | 미변경(diff 0) |
| `test/auth.e2e-spec.ts` | **7/8 PASS**(v1.0: 1/8 FAIL) — 잔존 1건: SC-027 | register·login·me·refresh·logout 등 tx 관련 6개 SC 는 GAP-019-03 RESOLVED 로 전건 PASS. SC-027(50회 순차 로그인 P95)만 GAP-019-05(신규, rate-limit 산술 충돌) | 미변경(diff 0) |
| `test/auth-recovery.e2e-spec.ts` | **6/7 PASS**(v1.0 과 동일 6/7) | GAP-019-05(SC-015·016·020 이 forgot-password quota 5/60s 를 선소진, SC-017 quota 부족) — v1.0 의 GAP-019-04 잔존분과 **동일 현상**(재확인, 변화 없음) | 미변경(diff 0) |

**unit**: 404/404 PASS(40 suites) — `prisma.service.spec.ts`(T018) 3건 포함, §F 마이그레이션 2건 회귀 0.
**static**: 13 suites/60 tests PASS.
**e2e 총계**: 24/26 suites PASS, **125/127 tests PASS**(잔존 2건: `auth.e2e-spec.ts::SC-027`, `auth-recovery.e2e-spec.ts::SC-017`).

**v1.0 대비 변화**: 13건 FAIL(5개 파일) → **2건 FAIL(2개 파일)**. GAP-019-03(SC-006, High)·GAP-019-04 GET 목록분(SC-010, Medium) **완전 unblock**. 잔존 2건은 GAP-019-05(신규, Low, production 정상·019 비원인)로 재분류.

---

## SC-017 잔존 2건 정밀 재현 (GAP-019-05)

team-lead 지시(★ 최종 판정 필요)에 따라 아래 3개 실행 모드를 각각 대조했다.

| 실행 모드 | `auth.e2e-spec.ts::SC-027` | `auth-recovery.e2e-spec.ts::SC-017` |
|---|---|---|
| 전체 `--runInBand` | FAIL(429) | FAIL(429) |
| 파일 단독(`jest test/파일.e2e-spec.ts`) | FAIL(429) — 전체와 동일 | FAIL(429) — 전체와 동일 |
| `-t "SC-XXX"` 단일 테스트 격리 | FAIL(**401**, register 미실행으로 계정 부재 — 429 아님) | **PASS**(선행 SC-015/016/020 미실행으로 forgot-password quota 미소진) |
| `-t "SC-009|SC-027"`(register 선행 포함) | **FAIL(429)** — register 포함해도 재현 | (해당 없음) |

**판정**:

- **`auth.e2e-spec.ts::SC-027`**: register 를 포함한 최소 격리에서도 429 로 **결정론적으로 재현** — 50회 연속 `/auth/login` 요청 자체가 `THROTTLE_DEFAULT_LIMIT=20/60s` 를 산술적으로 초과(21번째 요청부터 429)하는 구조적 충돌이다. **(b) T016/T017 로 인한 신규 회귀 아님**(두 파일 모두 `git diff 62d14f9` 결과 0, auth.controller.ts·throttle.constants.ts 도 0) — **(a) 순수 테스트 격리/순서 결함도 아님**(테스트 실행 순서와 무관하게 항상 재현되는 산술 충돌). GAP-019-04 와 동일 메커니즘(018 rate-limit vs 순차-다회 요청 e2e)의 **신규 발견 사례**(원 GAP-019-04 목록엔 없었음) → **GAP-019-05 신규 등록**.
- **`auth-recovery.e2e-spec.ts::SC-017`**: `-t` 단일 실행 시 PASS 하지만, 이는 "정상인데 우연히 순서가 꼬인 결함"이 아니라 **파일 내 선행 테스트(SC-015·016·020)가 forgot-password 전용 쿼터(`THROTTLE_FORGOT_PASSWORD_LIMIT=5/60s`)를 4회 소진하고 SC-017 자신이 2회 추가로 필요로 하여 5회 쿼터를 구조적으로 초과**하는 결정론적 현상이다(테스트 파일의 선언 순서가 고정되어 있는 한 Jest 실행마다 동일하게 재현됨 — 무작위 flaky 아님). **(c) 직전 5b 가 GAP-019-04 로 이미 FAIL 판정한 것과 동일 현상의 잔존**(GAP-019-04 원문이 이미 "SC-020 이 quota 소진 후 SC-017 실행"으로 정확히 기록) — T017 은 GET-only 설계였으므로 애초에 이 하위 사례를 해소할 수 없었다(tasks.md T017 완료 기준(b) 문구가 이 사례를 잘못 포함했던 것으로 재확인).
- **production 정상 여부**: 둘 다 **production 정상**(NFR-001·NFR-003 이 의도한 보안 동작). `@SkipThrottle()` 부여는 로그인·비밀번호 재설정의 rate limit 제거를 의미하므로 보안 원칙 위반 — 해소 경로는 production 수정이 아니라 **테스트 하네스 재설계**(quota 격리/리셋 또는 요청 수 조정)이며 019 Test Authoring Contract 범위 밖이다.

---

## SC-009 EXPLAIN 재확인

T016·T017 은 schema·데이터에 영향이 없으므로 재확인 결과는 v1.0 과 동일하다.

```sql
docker exec doa-next-postgres-1 psql -U doa -d doa_next -c
  "EXPLAIN SELECT * FROM products.products WHERE \"sellerId\" = 'x' ORDER BY \"createdAt\" DESC, id DESC LIMIT 20;"
→ Seq Scan on products (전체 9행 — planner 비용 기반 선택, v1.0 과 동일)
```

products 9건·sellers 1건으로 데이터 규모 변화 없음 확인(`SELECT count(*) FROM products.products` = 9). SC-009 상태는 v1.0 과 동일하게 coverage-gap.md (3) 운영 환경 확인 권장으로 유지.

---

## STALE_SC 경고

git diff 스코프(`git diff 62d14f9 --stat` 10개 production/spec 파일 + untracked 신규 4파일: `list-query-dto.e2e-spec.ts`·`pino-redact.e2e-spec.ts`·`test/static/list-index.spec.ts`·`prisma.service.spec.ts`) 전수 재점검 결과, 진짜 STALE_SC(출처 마커 부재) **0건**(v1.0 과 동일).

- `admin.controller.spec.ts` — `SC-020(v1.1.0/017 spec)` 출처 마커 확인, `SC-001~006` 신규 019 자신 번호.
- `auth.service.spec.ts` — 각 describe 블록에 `(v1.0.0/001 spec)`·`(v1.1.0/012·013·014·018 spec)` 출처 마커 전건 확인. 신규 `SC-011(v1.1.0/019 spec)` 자신 번호.
- `security-audit.logger.spec.ts` — `(v1.1.0/018 spec)` 4건 + `(v1.1.0/019 spec)` 2건(SC-012·013) 전건 마커 확인.
- `prisma.service.spec.ts`(신규) — `SC-006·SC-017 (v1.1.0/019 spec)` 자신 번호, 마커 포함.
- `list-query-dto.e2e-spec.ts`·`pino-redact.e2e-spec.ts`·`test/static/list-index.spec.ts` — 전건 019 자신 SC 번호, STALE 대상 아님.

```yaml
stale_sc:
  count: 0
  decision: NONE_FOUND
```
