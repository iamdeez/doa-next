---
작성: Design Agent / Test Agent (EXECUTION) / Docs Agent
버전: v1.2
최종 수정: 2026-07-05 18:30
상태: 작성중
---

# Gaps: 019-security-quality-followups

> 3단계 이후 모든 Agent 가 누적 기록한다. 형식: `pipeline-conventions.md §6`.
> 해결 시 해당 Agent 가 상태를 `RESOLVED by [Agent 공식명]` 으로 갱신한다.

## 목차

- [GAP 목록](#gap-목록)

---

## GAP 목록

### GAP-019-01 — SC-014/015 pino redact 로그 캡처 하네스 선례 부재

- **유형**: 테스트-하네스-설계
- **출처**: Design Agent
- **컨텍스트**: T013 (`test/pino-redact.e2e-spec.ts`) / SC-014·SC-015
- **내용**: 기존 `test/` 에 nestjs-pino 출력 스트림을 캡처하는 선례가 없다. redact 는 pino destination(기본 stdout)에 JSON 라인으로 기록되며, AppModule 이 config 를 baked-in 하므로 통합 테스트에서 실제 redact 결과를 관측하려면 전역 `process.stdout.write` 를 가로채야 한다.
- **권장 해소(research §테스트 하네스 조사 canonical)**: 통합 테스트에서 `process.stdout.write` 를 임시 spy(요청 구간 한정) → Authorization·Cookie 헤더 포함 supertest 요청(예: `GET /health`) → 수집 라인에서 `[Redacted]` 존재 + 원본 토큰/쿠키 부재 단언 → `afterEach` 에서 `stdout.write` 원복. `pino-pretty` transport 분기와 무관하게 `[Redacted]` 토큰 존재만 단언.
- **위험도**: Low (비블로킹 — 해소 경로가 canonical 로 제시됨). 5a Test Agent 가 구현, 5b 에서 검증.
- **상태**: RESOLVED by Test Agent (AUTHORING/EXECUTION) — `test/pino-redact.e2e-spec.ts` 작성·SC-014/015 PASS(5b 재검증 test-report v2.0, pipeline-log 5b). 상태 정정 근거: PATCH-019-04(회고 OBS-4, gap 상태 lifecycle 재점검) — main 적용(2026-07-05).

### GAP-019-02 — context.md §6 후속 부채 3건 RESOLVED 전이 + 테스트 카운트 갱신 필요

- **유형**: 문서-갱신-필요
- **출처**: Design Agent
- **컨텍스트**: `.claude/docs/context.md` §6 (L240 SEC-017-01 / L255 SEC-018-02 / L256 SEC-018-03), §6 헤더 테스트 카운트(L22)
- **내용**: 본 spec 완료 시 SEC-017-01·SEC-018-02·SEC-018-03 3개 행이 "RESOLVED (019)" 로 전이 가능. 신규 테스트 추가로 §6 헤더 테스트 카운트(unit 397·static 4·e2e)도 증가. SEC-018-01(L254)은 §범위 외로 잔존(갱신 없음). GAP-005-03(L236, accepted)은 신규 마이그레이션 순차 누적으로 무관(유지).
- **해소 위임**: 6단계 Docs Agent (Design 은 context.md 직접 갱신 MUST NOT). research §context.md 부정합 사전 점검 절과 페어.
- **위험도**: Low
- **상태**: OPEN (Docs Agent 갱신 권고 확정, Retrospective Agent 적용 대기)

**Docs Agent 갱신 권고 (2026-07-05, 코드 검증 완료 — PROC-002)**:

| 대상 | 코드 검증 | 갱신 권고 |
|---|---|---|
| `context.md` L240 (SEC-017-01 행) | `admin.controller.ts` L41/65/73(`@Query() query: AdminSellerListQueryDto`/`ListQueryDto`, `parseInt` grep 결과 0건)·`product.controller.ts` L59(`@Query() query: ListQueryDto`) 직접 확인 — DTO 전환·수동 parseInt 제거 완료 | 행 전체를 `~~cursor 목록 API @Query 파라미터 DTO 미검증 (SEC-017-01, Low·비블로킹)~~` 취소선 처리 후 "**RESOLVED (019-security-quality-followups)** — 신규 공유 `ListQueryDto`/`AdminSellerListQueryDto`(class-validator) 로 4개 엔드포인트(`admin/sellers/pending`·`admin/users`·`admin/audit-logs`·`sellers/me/products`) 전환, 수동 `parseInt` 전건 제거. `limit=abc` 등 비정수 입력 400 반환(SC-001~006 검증)" 로 갱신 |
| `context.md` L255 (SEC-018-02 행) | `security-audit.logger.ts` L49(`findEmailNotFound`)·`auth.service.ts` L298(404 분기 호출) 직접 확인 | 취소선 처리 후 "**RESOLVED (019)** — `SecurityAuditLogger.findEmailNotFound` 신규(기존 3종과 동일 best-effort try/catch, `maskPhone` 마스킹) — `findEmail` 404 분기(NotFoundException 이전)에서 호출, enumeration 시도 탐지 사각 해소" 로 갱신 |
| `context.md` L256 (SEC-018-03 행) | `app.module.ts` L34(`redact: ['req.headers.authorization', 'req.headers.cookie']`) 직접 확인 | 취소선 처리 후 "**RESOLVED (019)** — `LoggerModule.forRoot({ pinoHttp })` 에 `redact: ['req.headers.authorization', 'req.headers.cookie']` 추가, HTTP 로그 JWT/쿠키 평문 노출 차단" 로 갱신 |
| `context.md` L22 (§1 헤더 테스트 카운트) | `test/test-report.md`(v2.0, 5b 재검증) — unit 404/404(40 suites)·static 13 suites/60 tests·e2e 24/26 suites·125/127 tests 직접 확인 | "단위/통합 테스트: unit 397 PASS(39 suites) + static 4 + e2e(rate-limit 6·atomicity 1) PASS(018 5b 실행 기준)" → "단위/통합 테스트: unit 404 PASS(40 suites) + static 60(13 suites) + e2e 125/127 PASS(24/26 suites, 019 5b 재검증 기준 — 잔존 2건은 GAP-019-05 known-limitation, §6 참조)" 로 갱신 |
| `context.md` §6 신규 행 (GAP-019-05) | `test/test-report.md` §★ Development 관측 2건 최종 판정 — `git diff 62d14f9` 결과 0(auth.controller.ts·throttle.constants.ts·두 테스트 파일) 직접 확인 | 신규 행 추가: "`/auth/login`·`/auth/forgot-password` rate-limit 과 순차-다회 요청 e2e 의 구조적 충돌 (GAP-019-05, Low) \| `test/auth.e2e-spec.ts::SC-027`(50회 로그인 P95)·`test/auth-recovery.e2e-spec.ts::SC-017`(forgot-password) 가 `THROTTLE_DEFAULT_LIMIT=20/60s`·`THROTTLE_FORGOT_PASSWORD_LIMIT=5/60s`(NFR-001/003 의도 동작)와 산술적으로 충돌해 전체 `--runInBand` 스위트에서 상시 FAIL. production 정상(회귀 아님) — `@SkipThrottle()` 부여는 보안 원칙 위반이라 해소 불가, 해소 경로는 테스트 하네스 재설계(quota 격리/리셋). \| `test/auth.e2e-spec.ts`·`test/auth-recovery.e2e-spec.ts` \| 019 발견" |

> **§6 SEC-018-01(L254) 은 갱신 대상 아님** — 본 spec 범위 외(§범위 외)로 그대로 잔존.
> **GAP-005-03(L236, accepted) 은 갱신 대상 아님** — 019 마이그레이션은 순차 누적으로 무관.

### GAP-019-03 — `PrismaService.tx` 트랜잭션 외부 fallback 이 model delegate 를 잃음(신규 SC-006 테스트로 발견된 기존 결함)

- **유형**: 기존-코드-결함(구현 오류, 본 spec 범위 밖 코드에서 발견)
- **출처**: Test Agent (AUTHORING)
- **컨텍스트**: T009 `test/list-query-dto.e2e-spec.ts` SC-006(`GET /admin/audit-logs?limit=20` 유효 응답) 실행 중 발견. `apps/backend/src/shared/prisma/prisma.service.ts` `get tx()` — `apps/backend/src/modules/admin/admin.repository.ts:26` (`listAuditLogs`)
- **내용**: `PrismaService.tx` getter(`return this.als.getStore()?.client ?? (this as unknown as TxClient);`)는 트랜잭션 컨텍스트 **외부**(`AsyncLocalStorage` store 없음)에서 `this` 를 캐스팅해 반환하도록 설계되어 있으나, 실행 시 이 반환값이 실제 `PrismaService`/`PrismaClient` 인스턴스와 참조 동일성이 없고(`t !== prisma`) model delegate(예: `adminAuditLog`·`user`·`seller`·`product`)가 전혀 존재하지 않는 객체를 반환한다. 격리된 재현(NestJS DI 없이 `new PrismaService()` 직접 생성 + `onModuleInit()` 후 `prisma.tx.adminAuditLog` 접근)으로 이 현상이 데이터·환경 상태와 무관하게 항상 재현됨을 확인했다(read: `findMany` — `TypeError: Cannot read properties of undefined (reading 'findMany')`, write: `create` 도 동일 패턴으로 실패). `AdminRepository.createAuditLog`/`listAuditLogs` 모두 트랜잭션 외부에서 호출되므로 영향받는다. 유사 패턴(`this.prisma.tx.X`)을 사용하는 다른 13개 repository 파일(`order`·`settlement`·`file`·`auth`·`notification`·`payment`·`coupon`·`shipping`·`inventory`·`review`·`cart`·`banner`)도 트랜잭션 외부 호출 경로에서 동일하게 영향받을 가능성이 있으나(예: 본 세션에서 `test/auth.e2e-spec.ts` 를 참고 실행 시 7/8 실패 관찰 — 단 register 409 등 데이터 상태 오염 가능성과 혼재되어 있어 동일 근본원인이라 단정하지 않음), 그 전수 확인은 본 spec 범위(019 SC-001~017) 밖이라 수행하지 않았다.
- **영향 범위(확인된 것만)**: 본 spec **SC-006**(`GET /admin/audit-logs?limit=20` → 200 기대)이 이 결함으로 인해 500 을 반환 — `test/list-query-dto.e2e-spec.ts` 의 `test_SC006_admin_audit_logs_valid_limit_returns_200_with_array` 가 production 결함으로 FAIL 한다(테스트 자체는 spec.md SC-006 원문과 정합 — 테스트 오류 아님).
- **권장 해소**: `PrismaService.tx` fallback 분기를 `(this as unknown as TxClient)` 대신 `PrismaClient.prototype` 을 통하지 않는 실제 클라이언트 참조(예: 생성자에서 `this` 를 별도 필드로 미리 캡처해두거나, `super` 반환값을 직접 사용) 로 교체 검토. Development Agent(4단계) 복귀 대상 — 본 spec 범위(A·B·C 레이어) 밖의 기존 코드이므로 5b 판정 시 [A] 구현 오류(단, 019 신규 코드 아님 — 사전 존재 결함)로 분류하고 별도 처리(핫픽스 spec 또는 본 spec 범위 확장 여부는 5b/사용자 판단 위임) 필요.
- **위험도**: **High**(SC-006 미충족 확정, 잠재적으로 다른 13개 repository 의 non-transactional 쓰기/읽기 경로에도 영향 가능) — 단, 확인된 범위는 SC-006 1건.
- **상태**: **RESOLVED by Development Agent (T016)** — 최초 CONFIRMED by Test Agent (EXECUTION, 5b 1차), 재검증 PASS by Test Agent (EXECUTION, 5b 2차·2026-07-05 18:05). 최초 정밀 triage 과정(main session 의 "격리 부트스트랩 아티팩트/오진" 가설 반증)은 아래 기록 참조.

**5b 정밀 triage 결과 (2026-07-05)**:

1. **정밀 재현**: `new PrismaService()` + `onModuleInit()` 후 `(prisma as any).adminAuditLog`(직접 접근)는 정상 객체이나, `prisma.tx`(일반 프로퍼티 접근)는 `adminAuditLog` 가 `undefined`이고 `prisma.tx === prisma` 도 `false`다. 반면 `Object.getOwnPropertyDescriptor(PrismaService.prototype, 'tx').get.call(prisma)`(getter 함수를 **직접** 호출)는 `prisma` 와 동일한 객체를 정상 반환한다(`adminAuditLog` 존재). `Object.getPrototypeOf(prisma) === PrismaService.prototype` 도 `false`. → **Prisma 6.19(`@prisma/client`)의 내부 Proxy 가 서브클래스의 일반 프로퍼티 접근(`.tx`)을 가로채 실제 getter 정의를 우회**시키는 것이 근본원인이며, NestJS DI 유무와 무관하게 재현되는 **Prisma 클라이언트 자체의 동작**이다(격리 부트스트랩의 인공물이 아님).
2. **018 기존 e2e 대조군**: `test/rate-limit.e2e-spec.ts`(7/7 PASS)와 `test/auth-reset-atomicity.e2e-spec.ts`(1/1 PASS)는 green 이 맞지만, 이는 "tx 버그가 없어서"가 아니라 (a) rate-limit 스위트가 호출하는 흐름이 `.tx.` 비-트랜잭션 fallback 경로를 실행하지 않거나 429 로 조기 응답되고, (b) atomicity 테스트는 `runInTransaction()` 내부(ALS store 존재)라 `tx` 가 Prisma 의 진짜 인터랙티브 트랜잭션 클라이언트(`store.client`)를 반환하는 **버그 없는 별도 분기**를 타기 때문이다. 반증을 위해 **신규로 재실행한** `test/auth.e2e-spec.ts`(register 경유, `AuthRepository.createUser` → `this.prisma.tx.user.create`, 019 미변경 파일)에서 **7/8 FAIL**, 최초 실패가 SC-006 과 완전히 동일한 `TypeError: Cannot read properties of undefined (reading 'create')` 임을 확인 — main 가설은 **반증**됐다.
3. **발생 시점**: `git diff 62d14f9 -- apps/backend/src/shared/prisma/prisma.service.ts` 및 `-- apps/backend/test/auth.e2e-spec.ts` 모두 **diff 0**(019 미변경). `git log` 확인 결과 `tx` getter 는 **003-commerce(c1f1618)** 도입 이후 무변경, Prisma 버전(`^6.19.0`)도 프로젝트 전 기간 무변경 → 003-commerce 이후 잠재된 사전 결함.
- **권장 해소(갱신)**: `PrismaService` 생성자에서 `this`(또는 `super()` 반환값)를 별도 private 필드(예: `private readonly root: TxClient`)로 캡처해두고, `tx` getter 의 fallback 분기를 `(this as unknown as TxClient)` 대신 그 캡처된 참조로 교체. Development Agent(4단계) 복귀 대상.
- **범위 확정**: 확인된 영향 = SC-006(`AdminRepository.listAuditLogs`/`createAuditLog`) + `AuthRepository.createUser`(회원가입, `auth.e2e-spec.ts` 6개 SC cascade). 13개 repository 전수 확인은 본 spec 범위 밖(미수행).

**5b 재검증 결과 (2026-07-05 18:05) — RESOLVED**:

- Development(4단계, T016)가 `prisma.service.ts`(`rootClient` 필드 + `registerRootClient`)·`prisma.module.ts`(`useFactory` 자기참조 주입)로 fix 적용.
- `test/list-query-dto.e2e-spec.ts` 17/17 PASS(admin/audit-logs 포함 SC-001~006 전건) — SC-006 admin/audit-logs 500→200 전환 실증.
- `test/auth.e2e-spec.ts`(register 경유, GAP-019-03 대조군) 8건 중 SC-027(rate-limit, GAP-019-05 로 분리) 1건만 잔존 FAIL, register·login·me·refresh·logout 등 tx 관련 6개 SC 전건 PASS — 근본원인 해소 확인.
- tx 경로 e2e(`orders`·`payments`·`auth-reset-atomicity`·`banner-admin`) 전건 PASS(트랜잭션 내부 경로 회귀 0), `prisma.service.spec.ts`(T018, 3/3) 회귀 방지 unit PASS.
- **상태**: **RESOLVED by Development Agent (T016), 검증 Test Agent (EXECUTION)**.

### GAP-019-04 — 전역 rate limit(018 도입)이 기존 100회-순차요청 perf e2e 와 충돌(회귀 검증 인프라 무력화)

- **유형**: 기존-코드-결함(본 spec 범위 밖 코드, 018 도입 시점 회귀)
- **출처**: Test Agent (EXECUTION)
- **컨텍스트**: `apps/backend/src/shared/security/security.module.ts`(전역 `APP_GUARD` = `FlyThrottlerGuard`) / `apps/backend/src/shared/security/throttle.constants.ts`(`THROTTLE_DEFAULT_LIMIT = 20`, `THROTTLE_TTL_MS = 60_000`) / `test/perf/list-p95.e2e-spec.ts`(017 SC-018) / `test/products.e2e-spec.ts`(SC-047) / `test/auth-recovery.e2e-spec.ts`(018 SC-017)
- **내용**: 5b 가 SC-010(인덱스 마이그레이션 전후 회귀 없음) 검증을 위해 회귀 검증 매개체로 지정된 `test/perf/list-p95.e2e-spec.ts` 를 재실행한 결과 2/2 FAIL(`429 Too Many Requests`). 원인은 `SecurityModule` 의 전역 `APP_GUARD`(018-auth-security-hardening 도입)가 `THROTTLE_DEFAULT_LIMIT=20회/60초` 를 **모든 라우트**(GET 목록/조회 포함)에 적용하며 예외(`@SkipThrottle()` 등)가 없기 때문이다. 100회 연속 요청으로 P95 를 측정하는 이 perf 테스트(017 에서 도입, 018 이전 작성)는 21번째 요청부터 구조적으로 항상 429 를 받는다. 동일 패턴이 `test/products.e2e-spec.ts`(GET /products 100회)에도 존재하며, `test/auth-recovery.e2e-spec.ts` 는 동일 파일 내 SC-020(018, 의도적으로 429 를 유발하는 테스트)이 앞서 quota 를 소진하여 후속 SC-017(018) 테스트가 quota 부족으로 실패한다.
- **영향 범위(확인된 것만)**: `test/perf/list-p95.e2e-spec.ts` 2/2 FAIL, `test/products.e2e-spec.ts` 2/2 FAIL, `test/auth-recovery.e2e-spec.ts` 1/7 FAIL. 본 spec **SC-010**(회귀 검증 매개체 자체가 FAIL) 및 **SC-017**(전체 스위트 100% PASS)을 직접 차단.
- **019 변경 여부**: `security.module.ts`·`throttle.constants.ts`·`fly-throttler.guard.ts`·영향받은 3개 테스트 파일 전부 `git diff 62d14f9` 결과 **0**(019 미변경). 018-auth-security-hardening 도입 시점 회귀이며, 019 가 SC-010 회귀 검증에 이 매개체를 재사용하면서 발견되었다.
- **권장 해소**: (a) 목록/조회 GET 엔드포인트(`/products`·`/admin/sellers/pending`·`/sellers/me/products` 등)에 `@SkipThrottle()` 부여 또는 완화된 named throttler 지정, (b) perf e2e 를 IP 분산 또는 ThrottlerStorage override 로 재작성, (c) `THROTTLE_DEFAULT_LIMIT` 상향 검토. Development Agent(4단계) 복귀 또는 별도 핫픽스 spec 대상 — 019 범위(A·B·C 레이어) 밖이므로 범위 확장 여부는 5b/사용자 판단 위임.
- **위험도**: Medium(운영 read API 실사용성 저하 가능성 + 기존 회귀 검증 인프라 무력화. 데이터 무결성·보안 영향은 없음).
- **상태**: **PARTIALLY RESOLVED by Development Agent (T017)** — 아래 5b 재검증 결과 참조. GET 목록/조회 경로(원 신고 대상)는 해소, `auth-recovery.e2e-spec.ts` SC-017 잔존분은 근본원인이 다른 하위 결함으로 재분류(GAP-019-05).

**5b 재검증 결과 (2026-07-05 18:05)**:

- Development(T017)가 GET 읽기/목록 8핸들러(`product.controller.ts` 5·`admin.controller.ts` 3)에 메서드 레벨 `@SkipThrottle()` 부착. mutating/auth 핸들러 미부착 grep 재확인 완료.
- `test/perf/list-p95.e2e-spec.ts` 2/2 PASS, `test/products.e2e-spec.ts` 2/2 PASS — 429 완전 해소, **SC-010 unblock 확정**.
- `test/rate-limit.e2e-spec.ts` 6/6 PASS(mutating/auth NFR-001~006 임계값 회귀 0 — strict 유지 확인).
- `test/auth-recovery.e2e-spec.ts` 는 여전히 1/7 FAIL(SC-017)로 잔존 — 단, 정밀 재조사 결과 이 FAIL 은 GET 목록 전역 default(20/60s, 이번에 fix)가 아니라 `/auth/forgot-password` 전용 named throttler(`THROTTLE_FORGOT_PASSWORD_LIMIT=5/60s`, T017 이 의도적으로 미부착)를 같은 파일의 선행 테스트(SC-015·SC-016·SC-020)가 소진한 결과다. **T017 의 GET-only 설계로는 애초에 해소 대상이 아니었던 별개 근본원인**으로 확인되어 GAP-019-05 로 분리 등록. tasks.md T017 완료 기준(b)의 "`auth-recovery.e2e-spec.ts`(SC-017/018) FAIL→PASS" 문구는 이 하위 사례에 한해 **오귀속**(overreach)이었음 — GET 목록 회귀 해소라는 T017 의 실질 목적은 완전히 달성됨.

### GAP-019-05 — `/auth/login`·`/auth/forgot-password` 전용 rate limit 이 기존 순차-호출 e2e 시나리오와 구조적으로 충돌(신규, GAP-019-04 와 동일 카테고리·별도 근본원인)

- **유형**: 기존-테스트-설계-충돌(프로덕션 결함 아님, 018 rate-limit 하드닝과 017/018 기존 e2e 테스트 설계 간 결정론적 수학적 충돌)
- **출처**: Test Agent (EXECUTION), 5b 재검증
- **컨텍스트**: `test/auth.e2e-spec.ts`(SC-027, NFR-002 P95) / `test/auth-recovery.e2e-spec.ts`(SC-017, 018 spec) / `apps/backend/src/shared/security/throttle.constants.ts`(`THROTTLE_DEFAULT_LIMIT=20`, `THROTTLE_FORGOT_PASSWORD_LIMIT=5`, 둘 다 `/60s`)
- **내용**: 전체 e2e `--runInBand` 재실행(125/127 PASS) 잔존 2건을 정밀 재현(전체 스위트·파일 단독 실행·`-t` 단일 테스트 실행을 각각 대조)한 결과:
  1. **`auth.e2e-spec.ts::SC-027`**(`POST /auth/login` 50회 연속 요청으로 P95 측정, NFR-002): 파일 단독 실행·`-t "SC-009|SC-027"`(register 선행 포함 격리) 모두 **동일하게 429 FAIL** — 원인은 순수 산술적 충돌(50회 요청 > `THROTTLE_DEFAULT_LIMIT=20/60s`, 로그인은 T017 대상이 아니며 NFR-001 상 rate limit 유지가 올바른 보안 설계)이며, 테스트 순서·잔류 상태와 무관하게 **결정론적으로 항상 재현**된다(테스트 격리 결함 아님). `-t "SC-027"` 단독(register 미실행) 시 401 로 실패 유형이 바뀌는 것은 register 의존성 때문이지 rate-limit 과 무관.
  2. **`auth-recovery.e2e-spec.ts::SC-017`**: `-t "SC-017"` 단독 실행 시 PASS(선행 SC-015·SC-016·SC-020 미실행으로 quota 미소진) — 즉 파일 내 **선행 테스트가 의도적으로 소비하는 `THROTTLE_FORGOT_PASSWORD_LIMIT=5/60s` 쿼터**(SC-015 1회+SC-016 1회+SC-020 2회=4회 소진, quota 5 중 1 잔여)를 SC-017 자체가 2회(라인 206·236) 필요로 하여 구조적으로 초과한다. 직전 5b(GAP-019-04)가 이미 이 파일·SC 를 "quota 소진" 원인으로 정확히 기록했던 것과 **동일 현상의 잔존**(재확인, 신규 회귀 아님).
- **production 정상 여부**: 두 건 모두 **production 코드는 정상**(NFR-001~003 이 의도한 대로 auth POST 엔드포인트를 rate-limit — 보안 요구사항 충족). T016·T017 어느 것도 원인이 아니며(두 파일·`auth.controller.ts`·`throttle.constants.ts` 전부 `git diff 62d14f9` 결과 0), 018 도입 시점부터 잠재된 **테스트 설계-vs-보안정책 충돌**이다. "테스트 격리 결함"(비결정적 순서 의존)이 아니라 **결정론적 산술 충돌**(요청 수 > quota)이라는 점에서 GAP-019-04 의 GET 목록 사례와 근본 메커니즘은 같으나 개별 파일/엔드포인트가 다르다.
- **해소가 어려운 이유(범위 확정 근거)**: `@SkipThrottle()` 부여는 로그인·비밀번호 재설정 요청 자체의 rate limit 을 제거하는 것이므로 NFR-001/003 보안 의도에 정면으로 반한다(T017 이 auth 엔드포인트를 의도적으로 제외한 이유와 동일) — production 수정으로 해소 불가. 유일한 해소 경로는 **테스트 하네스 재설계**(예: 테스트별 `ThrottlerStorage` 격리/리셋, IP 분산, 또는 SC-027/SC-017 요청 수를 quota 이하로 재설계)이며, 이는 019 의 Test Authoring Contract(§F 마이그레이션 2건 한정) 범위 밖이다.
- **영향 범위**: `test/auth.e2e-spec.ts` 1/8 FAIL(SC-027), `test/auth-recovery.e2e-spec.ts` 1/7 FAIL(SC-017) — 본 spec **SC-017**(전체 스위트 100% PASS)만 직접 차단. SC-006·SC-010 은 무관(이미 unblock 확정).
- **권장 해소**: (a) 두 e2e 파일의 테스트 하네스를 별도 후속 spec 에서 재설계(예: 테스트별 `FlyThrottlerGuard`/`ThrottlerStorage` mock-override 또는 리셋 훅 도입, SC-027 요청 수를 quota 이하로 조정하거나 시간 창을 확장), (b) 그 전까지는 known-limitation 으로 문서화(CHANGES.md 후속 작업 시 주의사항).
- **위험도**: Low(운영 보안 영향 없음 — 오히려 의도된 보안 동작. 회귀 검증 인프라의 완전성만 저하).
- **상태**: OPEN (신규 — 별도 후속 spec 또는 문서화 위임, Development Agent 복귀 대상 아님)

---

> **미해결 GAP 요약**: GAP-019-01 **RESOLVED**(pino-redact 테스트 작성·PASS, PATCH-019-04 상태 정정 2026-07-05)·GAP-019-02 **RESOLVED**(context.md 갱신 6단계 Docs→PATCH-CXT 적용 완료)·GAP-019-03 **RESOLVED**·GAP-019-04 **PARTIALLY RESOLVED**(Medium→GET 목록 부분 RESOLVED, auth POST 잔존분은 GAP-019-05 로 이관)·GAP-019-05 **Low(신규, known-limitation)**. GAP-019-03/04(GET 목록분) 는 5b 재검증으로 unblock 확정(SC-006·SC-010 PASS). GAP-019-05(신규, Low)만 SC-017(전체 스위트 100%)을 직접 차단하며, production 정상·019 비원인·해소 경로가 테스트 하네스 재설계(본 spec 범위 밖)임이 확인되어 Development Agent 복귀 대상이 아니다 — 후속 spec/문서화 위임을 5b 판정에서 권고.
