---
작성: Test Agent (AUTHORING)
버전: v1.0
최종 수정: 2026-07-05 17:48
상태: 확정
---

# Test Cases: 019-security-quality-followups

## 목차

- [SC × 시나리오 매트릭스](#sc--시나리오-매트릭스)
- [외부 의존성 명시](#외부-의존성-명시)
- [§F 기존 테스트 마이그레이션 수행 내역](#f-기존-테스트-마이그레이션-수행-내역)
- [실행 검증 결과 (AUTHORING 자체 확인)](#실행-검증-결과-authoring-자체-확인)
- [미커버 항목 (사전 분류 — 4-카테고리)](#미커버-항목-사전-분류--4-카테고리)

---

## SC × 시나리오 매트릭스

| SC-ID | 수용 기준 | Happy Path | Edge Case | Error Case | 테스트 파일·함수 | env 태그 |
|---|---|---|---|---|---|---|
| SC-001 | `GET /admin/sellers/pending?limit=abc` → 400 | — | — | `test_SC001_admin_sellers_pending_non_integer_limit_returns_400` | `test/list-query-dto.e2e-spec.ts` | [env:integration] |
| SC-002 | `GET /admin/users?limit=abc` → 400 | — | — | `test_SC002_admin_users_non_integer_limit_returns_400` | `test/list-query-dto.e2e-spec.ts` | [env:integration] |
| SC-003 | `GET /admin/audit-logs?limit=abc` → 400 | — | — | `test_SC003_admin_audit_logs_non_integer_limit_returns_400` | `test/list-query-dto.e2e-spec.ts` | [env:integration] |
| SC-004 | `GET /sellers/me/products?limit=abc` → 400 | — | — | `test_SC004_sellers_me_products_non_integer_limit_returns_400` | `test/list-query-dto.e2e-spec.ts` | [env:integration] |
| SC-005 | 4개 엔드포인트 `limit=0`·`limit=101` → 400 | — | `test_SC005_$label_limit_0_returns_400` / `test_SC005_$label_limit_101_returns_400`(it.each ×4 엔드포인트) | — | `test/list-query-dto.e2e-spec.ts` | [env:integration] |
| SC-006 | 4개 엔드포인트 유효 `limit=20` → 200 + 기존 구조(NFR-001) | `test_SC006_*_valid_limit_returns_200_*`(×4) + ADR-002 `status`/`q` 동반 회귀 방어 1건 | — | — | `test/list-query-dto.e2e-spec.ts` | [env:integration] |
| SC-007 | `schema.prisma` Product `sellerId` 선두 복합 인덱스 | `test_SC007_product_model_has_sellerId_leading_composite_index` | — | — | `test/static/list-index.spec.ts` | [env:static] |
| SC-008 | `schema.prisma` Seller `status` 선두 복합 인덱스 | `test_SC008_seller_model_has_status_leading_composite_index` | — | — | `test/static/list-index.spec.ts` | [env:static] |
| SC-009 | EXPLAIN 인덱스 스캔(Seq Scan 아님) | (로컬 PG EXPLAIN — Test EXECUTION/Performance Agent 실행) | — | — | (5b/Performance 실행 경로, plan.md §통합/운영 검증 defer 옵션 C) | [env:e2e-db] |
| SC-010 | 인덱스 전후 회귀 없음(기존 e2e 동일 응답) | 기존 `test/banner-admin.e2e-spec.ts`(SC-011 admin/sellers/pending envelope) + `test/perf/list-p95.e2e-spec.ts`(sellers/me/products) 재실행으로 회귀 확인 | — | — | 기존 e2e(수정 없음, 재실행만) | [env:integration] |
| SC-011 | 미등록 phone → `findEmailNotFound` 호출 + 404 | — | — | `test_SC011_019_find_email_unregistered_calls_findEmailNotFound_and_throws_404` | `src/modules/auth/auth.service.spec.ts` | [env:unit] |
| SC-012 | 신규 이벤트 마스킹(`maskPhone` 결과만) | `test_SC012_019_find_email_not_found_logs_warn_with_masked_phone` | — | — | `src/shared/security/security-audit.logger.spec.ts` | [env:unit] |
| SC-013 | 로거 예외 best-effort(차단 없음) | — | — | `test_SC013_019_find_email_not_found_swallows_logger_throw`(logger 단위) + `test_SC013_019_find_email_unregistered_unaffected_by_logger_throw`(auth.service wiring, 실 SecurityAuditLogger + PinoLogger.warn throw mock) | `security-audit.logger.spec.ts` + `auth.service.spec.ts` | [env:unit] |
| SC-014 | Authorization 헤더 redact | `test_SC014_authorization_header_redacted_in_pino_log` | — | — | `test/pino-redact.e2e-spec.ts` | [env:integration] |
| SC-015 | Cookie 헤더 redact | `test_SC015_cookie_header_redacted_in_pino_log` | — | — | `test/pino-redact.e2e-spec.ts` | [env:integration] |
| SC-016 | 인증/인가 기존 테스트 회귀 없음 | 기존 `test/static/auth-required-guards.spec.ts`·`test/rate-limit.e2e-spec.ts` 재실행(수정 없음) | — | — | 기존 테스트(수정 없음) | [env:unit] |
| SC-017 | 전체 스위트 100% PASS | 전체 unit(404)·e2e·static 재실행(5b 최종 판정) | — | — | 전체 | [env:integration] |

> **SC별 시나리오 3유형 커버 확인**: Happy(SC-006/007/008/009/010/012/014/015/016/017) · Edge(SC-005 경계값 ×2값×4엔드포인트) · Error(SC-001~004 비정수, SC-011 미등록, SC-013 로거 예외). 3유형 전부 커버.

### T018 — `PrismaService.tx` delegate 복원 targeted unit (5a 재작업, GAP-019-03/T016 회귀 방지)

| SC-ID | 수용 기준(회귀 방지) | Happy Path | Edge Case | Error Case | 테스트 파일·함수 | env 태그 |
|---|---|---|---|---|---|---|
| SC-006 | `registerRootClient` 등록 후 비-tx 경로에서 `tx` 가 model delegate(`user`·`adminAuditLog`) 보유 | `test_SC006_019_tx_returns_delegate_bearing_proxy_after_registerRootClient` | — | — | `src/shared/prisma/prisma.service.spec.ts` | [env:unit] |
| SC-017 | `registerRootClient` 미주입 시 fallback 하위호환(truthy) 유지 + 트랜잭션 내부 `tx` 는 ALS `store.client` 반환(경로 불변) | `test_SC017_019_tx_falls_back_to_self_cast_when_rootClient_unregistered` / `test_SC017_019_tx_returns_als_store_client_inside_transaction` | — | — | `src/shared/prisma/prisma.service.spec.ts` | [env:unit] |

> T016(Development, PPG-1 동일 turn 병렬)이 본 재작업과 동시에 완료되어, 위 3건 unit 은 fix 적용 코드 기준 **Green 상태로 자체 확인**했다(아래 실행 검증 결과 참조). DB 연결 불요(Proxy 동작만 검증, `$connect` 미호출) — SC-006 e2e(list-query-dto.e2e-spec.ts)의 fast/DB-free 회귀 insurance.

---

## 외부 의존성 명시

- **fixture**: `test/list-query-dto.e2e-spec.ts` — User(`e2e-seller-019-list-query`)→Seller(APPROVED) 1건을 `PrismaService` 로 직접 upsert(list-p95.e2e-spec.ts 패턴 재사용), `afterAll` 정리.
- **mock**: `auth.service.spec.ts`/`security-audit.logger.spec.ts` — `mockSecurityAuditLogger`(`findEmailNotFound: jest.fn()` 추가), 실 `SecurityAuditLogger` 인스턴스 + `PinoLogger.warn` throw mock(SC-013 wiring, PATCH-018-01 준수 — 서비스 전체 mock throw 금지).
- **환경 변수**: `ADMIN_USER_IDS`(admin JWT sub 화이트리스트, AppModule import 전 주입), `DATABASE_URL`·`JWT_ACCESS_SECRET`(통합 테스트 `isEnvReady()` 게이트).
- **외부 서비스**: Docker Compose PostgreSQL 16(로컬, 기존 `docker-compose.yml`). 신규 마이그레이션(`20260705162400_add_product_seller_list_indexes`, Database Design Agent 산출) 적용 전제.

---

## §F 기존 테스트 마이그레이션 수행 내역

| 파일 | 마이그레이션 내용 | 검증 결과 |
|---|---|---|
| `src/modules/admin/admin.controller.spec.ts` | `listPendingSellers` — positional-arg(`status, cursor, limit, q` 4개 문자열) 호출을 `AdminSellerListQueryDto` 단일 객체 인자(`{status, cursor, limit:10(number), q}` / `{}`)로 마이그레이션. 기대값(`listSellers(...)` 호출 인자)은 원본과 동일하게 유지 | `pnpm test admin.controller.spec.ts` PASS (전체 스위트 내 포함, 회귀 0) |
| `src/modules/auth/auth.service.spec.ts` | `mockSecurityAuditLogger`(L84~89)에 `findEmailNotFound: jest.fn()` 추가(production 의 `findEmailNotFound(phone)` 호출을 404 분기 throw 이전에 수행하는 T003 배선과 정합) | `pnpm test auth.service.spec.ts` PASS — 기존 `test_find_email_unregistered_404` 회귀 없음(TypeError 미재현) |

---

## 실행 검증 결과 (AUTHORING 자체 확인)

Development(4단계)가 PPG-1 병렬 진행 중 production 코드(A·B·C 레이어, T002~T008)를 이미 완료한 상태를 확인하여, 작성한 테스트를 자체 실행·`tsc --noEmit` 검증했다(PATCH-05 — 테스트 코드 컴파일 오류 0건 확인 목적. 정식 SC 커버리지·회귀 판정은 5b Test Agent EXECUTION 이 수행).

| 검증 항목 | 명령 | 결과 |
|---|---|---|
| 테스트 코드 컴파일 | `pnpm --filter backend exec tsc --noEmit` | EXIT 0 (오류 0건) |
| 신규 unit 테스트(SC-011~013 + §F 2건) | `pnpm --filter backend test` | 401/401 PASS (기존 397 + 신규 4) |
| 신규 static 테스트(SC-007/008) | `jest --config test/jest-e2e.json test/static/list-index.spec.ts` | 2/2 PASS |
| 신규 integration(SC-014/015) | `jest --config test/jest-e2e.json test/pino-redact.e2e-spec.ts` | 2/2 PASS |
| 신규 integration(SC-001~006) | `jest --config test/jest-e2e.json test/list-query-dto.e2e-spec.ts` | **18/19 PASS** — 1건 FAIL(아래 참조) |

**발견된 이슈 (GAP-019-03, gaps.md 기록 완료)**: `test_SC006_admin_audit_logs_valid_limit_returns_200_with_array` 가 500 으로 FAIL. 근본원인은 본 spec 범위 밖의 기존 코드 결함(`PrismaService.tx` getter 가 트랜잭션 외부에서 model delegate 없는 객체를 반환 — `AdminRepository.listAuditLogs`/`createAuditLog` 등 논-트랜잭션 `.tx.X` 호출 전부 영향)이며, 테스트 자체는 spec.md SC-006 원문과 정합한다(테스트 오류 아님). 5b Test Agent EXECUTION 및 Development Agent 복귀 판단에 위임.

### T018 재작업 실행 검증 (5a, GAP-019-03/T016 회귀 방지 unit)

Development(4단계)가 동일 turn PPG-1 병렬로 T016(`PrismaService.tx` fix) 을 완료한 상태에서 신규 unit 3건을 작성·자체 실행했다.

| 검증 항목 | 명령 | 결과 |
|---|---|---|
| 테스트 코드 컴파일 | `pnpm --filter backend exec tsc --noEmit` | EXIT 0 |
| 신규 unit(SC-006·SC-017 ×2) | `pnpm --filter backend test -- prisma.service` | 3/3 PASS |
| 전체 unit(신규 3건 포함) | `pnpm --filter backend test` | 404/404 PASS (기존 401 + 신규 3) |

- T016 fix 가 이미 적용된 상태이므로 3건 모두 Green(정상 — T016 fix 적용 코드 기준 회귀 방지 실증). fix 미적용 가정 시 SC-006 단언(`test_SC006_019_tx_returns_delegate_bearing_proxy_after_registerRootClient`)은 Red 였을 것(비-tx `tx` 가 delegate 없는 객체 반환 — GAP-019-03 원 증상).
- SC-017 fallback 단언은 참조 동일성이 아닌 truthy 여부만 검증한다(getter 실행 컨텍스트의 raw `this` 가 Proxy 자기참조와 참조 동일성이 없다는 것이 GAP-019-03 근본원인이었으므로, 참조 동일성 단언은 fix 와 무관하게 항상 실패하는 오류 단언이 된다 — PATCH-03 production 실제 분기 재현 원칙 적용).

---

## 미커버 항목 (사전 분류 — 4-카테고리)

| SC-ID | 미커버 사유 | 카테고리 | 권장 검증 방법 |
|---|---|---|---|
| SC-009 | `EXPLAIN` 실행은 파이프라인 내 로컬 PostgreSQL 필요(mock 불가) — plan.md §통합/운영 검증 defer 옵션 C 채택 | (2) 단위테스트 불가 | 5b Test Agent EXECUTION 또는 Performance Agent 가 로컬 PG 에서 `EXPLAIN` 2건(sellerId 조건·status 조건) 직접 실행 |
