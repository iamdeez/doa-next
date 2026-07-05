---
작성: Test Agent (EXECUTION)
버전: v2.0
최종 수정: 2026-07-05 18:05
상태: 확정
---

# 테스트 실행 결과

> **재검증 라운드(v2.0)**: PPG-1 fix(T016·T017·T018) 완료 후 재실행. v1.0(2026-07-05 17:30)은 gate: FAIL·status: BLOCKED(GAP-019-03 P0·GAP-019-04 Medium)였다. 본 라운드에서 두 GAP 의 unblock 여부와 Development(run-008) 관측 2건(auth.e2e SC-027·auth-recovery.e2e SC-017)의 신규/회귀/잔존 여부를 최종 판정한다.

## 목차

- [실행 요약](#실행-요약)
- [GAP-019-03 unblock 검증](#gap-019-03-unblock-검증)
- [GAP-019-04 unblock 검증](#gap-019-04-unblock-검증)
- [★ Development 관측 2건 최종 판정 (GAP-019-05)](#-development-관측-2건-최종-판정-gap-019-05)
- [실패 목록](#실패-목록)
- [SC 미커버 항목](#sc-미커버-항목)
- [plan.md 매핑표 검증](#planmd-매핑표-검증)
- [설계 문서 정합성](#설계-문서-정합성)
- [회귀 탐지](#회귀-탐지)

---

## 실행 요약

| 스위트 | 결과 | v1.0 대비 |
|---|---|---|
| TypeScript(`tsc --noEmit`) | EXIT 0 | 동일 |
| unit(`pnpm exec jest`) | **404/404 PASS**(40 suites, `prisma.service.spec.ts` T018 3건 포함) | +3건(신규 T018) |
| static(`test/static/`) | **13 suites / 60 tests PASS** | 동일 |
| e2e(`--runInBand`, 26 suites) | **24/26 suites PASS, 125/127 tests PASS** | v1.0: 21/26 suites, 114/127 tests → **잔존 FAIL 13건→2건** |

**잔존 e2e FAIL 2건**: `test/auth.e2e-spec.ts::SC-027`(1건), `test/auth-recovery.e2e-spec.ts::SC-017`(1건). 둘 다 `git diff 62d14f9` 결과 0(019 미변경 파일), production 정상(NFR-001·003 의도된 rate-limit), T016/T017 무관. 상세는 아래 "★ Development 관측 2건 최종 판정" 참조.

---

## GAP-019-03 unblock 검증

- **fix**: Development(T016) — `prisma.service.ts`(`rootClient` 필드+`registerRootClient`)·`prisma.module.ts`(`useFactory` 자기참조 주입).
- **검증**: `test/list-query-dto.e2e-spec.ts` **17/17 PASS**(admin/audit-logs 포함 SC-001~006 전건, v1.0: 16/17). `test/auth.e2e-spec.ts` register·login·me·refresh·logout 등 tx 관련 6개 SC **전건 PASS**(v1.0: 1/8 FAIL → 이번 라운드 7/8 PASS, 잔존 1건은 SC-027 로 GAP-019-05 별건). tx 경로 e2e(`orders`·`payments`·`auth-reset-atomicity`·`banner-admin`) 전건 PASS(트랜잭션 내부 경로 회귀 0). `prisma.service.spec.ts`(T018) 3/3 PASS.
- **판정**: **RESOLVED**. SC-006 unblock 확정.

---

## GAP-019-04 unblock 검증

- **fix**: Development(T017) — GET 읽기/목록 8핸들러(`product.controller.ts` 5·`admin.controller.ts` 3) 메서드 레벨 `@SkipThrottle()`. grep 재확인: mutating(`createProduct`·`publish`·`deactivate`·variants·images)·auth·`approveSeller` 핸들러 미부착.
- **검증**: `test/perf/list-p95.e2e-spec.ts` **2/2 PASS**(v1.0: 0/2 FAIL, P95=7ms), `test/products.e2e-spec.ts` **2/2 PASS**(v1.0: 0/2 FAIL, P95=6ms). `test/rate-limit.e2e-spec.ts` **6/6 PASS**(mutating/auth NFR-001~006 임계값 회귀 0 — strict 유지 확인. tasks.md 원문 "7/7" 표기는 실제 파일 `it()` 6개와 불일치했던 사전 오기, T017 무관).
- **잔존**: `test/auth-recovery.e2e-spec.ts` 여전히 1/7 FAIL(SC-017) — 아래 GAP-019-05 참조. 이는 GET 목록 default throttle(T017 이 해소한 대상)이 아니라 forgot-password 전용 쿼터 소진이 원인으로, T017 의 GET-only 설계로는 원천적으로 해소 불가능한 하위 사례였음이 재확인됨.
- **판정**: GET 목록 회귀(원 신고 핵심 대상)는 **RESOLVED**. SC-010 unblock 확정. auth-recovery 잔존분은 GAP-019-05 로 재분류.

---

## ★ Development 관측 2건 최종 판정 (GAP-019-05)

team-lead 지시에 따라 전체 `--runInBand` 실행과 파일 단독 실행·`-t` 단일 테스트 격리 실행을 각각 재현했다.

### 재현 결과

| 테스트 | 전체 `--runInBand` | 파일 단독 실행 | `-t` 단일 격리 |
|---|---|---|---|
| `auth.e2e-spec.ts::SC-027` | FAIL(429) | FAIL(429) — 전체와 동일 | `-t "SC-027"`(register 미실행): FAIL(**401**, 계정 부재) / `-t "SC-009\|SC-027"`(register 포함): **FAIL(429)**, 격리해도 재현 |
| `auth-recovery.e2e-spec.ts::SC-017` | FAIL(429) | FAIL(429) — 전체와 동일 | `-t "SC-017"`: **PASS**(선행 SC-015/016/020 미실행) |

### 판정 (team-lead 질의 (a)/(b)/(c) 대응)

**1) `auth.e2e-spec.ts::SC-027`**

- register 를 포함한 최소 격리에서도 429 로 재현 — **테스트 실행 순서와 무관한 결정론적 산술 충돌**(50회 연속 `/auth/login` > `THROTTLE_DEFAULT_LIMIT=20/60s`, 21번째 요청부터 필연적으로 429). "테스트 격리 결함"(비결정적 상태 잔류)이 **아니다** — (a) 해당 없음.
- `auth.controller.ts`·`throttle.constants.ts`·본 테스트 파일 모두 `git diff 62d14f9` = 0. T016·T017 은 auth 엔드포인트를 전혀 건드리지 않음 — **(b) 신규 회귀 아님**.
- 원 GAP-019-04 기록(017/018-era 3개 파일: list-p95·products·auth-recovery)에는 `auth.e2e-spec.ts` 가 **포함되어 있지 않았다** — GAP-019-04 의 잔존이 아니라 **동일 카테고리의 신규 발견**(로그인 엔드포인트에 대한 018 rate-limit vs 017/018-era 50회 순차 P95 테스트의 구조적 충돌) — (c) 아님, 신규.
- **production 정상**: NFR-001(로그인 rate limit)이 의도한 보안 동작. `@SkipThrottle()` 부여는 보안 원칙 위반이므로 production 수정 대상 아님.

**2) `auth-recovery.e2e-spec.ts::SC-017`**

- `-t "SC-017"` 단독 시 PASS — 그러나 이는 무작위 순서 의존(flaky) 이 아니라, **파일의 고정된 선언 순서**(SC-015→SC-016→SC-020→SC-017)상 선행 테스트가 `THROTTLE_FORGOT_PASSWORD_LIMIT=5/60s` 쿼터를 4회 소진(SC-015 1+SC-016 1+SC-020 2)하고 SC-017 자신이 2회를 추가로 필요로 하여 5회 쿼터를 구조적으로 초과하는 **결정론적 현상**이다. Jest 는 기본적으로 파일 내 선언 순서대로 실행하므로 매 실행마다 동일하게 재현된다 — 순수 "테스트 격리 결함"(비결정적 순서 의존)이라기보다 **quota 예산 설계 결함**에 가까우나, production 코드에는 결함이 없다 — (a) 근사(결정론적이라는 점만 다름).
- T016·T017 모두 이 파일·`auth.controller.ts`를 건드리지 않음(`git diff 62d14f9`=0) — **(b) 신규 회귀 아님**.
- 원 GAP-019-04(v1.0, 직전 5b) 가 이미 "`test/auth-recovery.e2e-spec.ts` 는 동일 파일 내 SC-020 이 앞서 quota 를 소진하여 후속 SC-017 이 quota 부족으로 실패"라고 **정확히 동일한 현상을 기록**했었다 — **(c) 직전 5b 가 GAP-019-04 로 FAIL 판정한 것과 동일 현상의 잔존**이 맞다. T017 은 GET-only 설계(GAP-019-04 의 GET 목록 사례 해소 목적)였으므로, 이 forgot-password quota 사례는 애초에 T017 의 해소 대상이 아니었다. tasks.md T017 완료 기준(b)에 `auth-recovery.e2e-spec.ts(SC-017/018)` 를 포함시킨 것은 근본원인을 GET 목록과 동일하게 오귀속한 설계 단계의 오류였다(사후 확인).
- **production 정상**: NFR-003(forgot-password rate limit)이 의도한 보안 동작.

### 결론

- 두 잔존 FAIL 모두 **production 정상**(NFR-001·003 의도된 보안 동작), **T016/T017 무관**(신규 회귀 아님), **019 비변경 파일**에서 발생.
- `SC-027`: GAP-019-04 와 동일 카테고리의 **신규** 발견 → **GAP-019-05 신규 등록**.
- `SC-017`(auth-recovery): GAP-019-04 에 이미 기록되어 있던 **동일 현상의 잔존**(T017 이 원천적으로 해소 불가능한 하위 사례) → GAP-019-05 로 통합 재분류(GAP-019-04 는 GET 목록분만 RESOLVED 로 갱신).
- **권고**: 두 건 모두 해소 경로가 production 수정이 아니라 **테스트 하네스 재설계**(쿼터 격리/리셋, 요청 수 재설계)이며 019 의 Test Authoring Contract 범위 밖이다. Development Agent 복귀 대상이 아니며, 별도 후속 spec 또는 CHANGES.md "후속 작업 시 주의사항" 문서화로 위임 권고.

---

## 실패 목록

| 테스트 | 실패 메시지 | 원인 분류 | 처리 방향 |
|---|---|---|---|
| `test/auth.e2e-spec.ts::SC-027` | `expected 200, got 429` | [C] 아님/[D] 아님/[A] 아님 — production 정상(NFR-001 의도 동작), 019 비원인, 테스트 하네스 설계 한계(신규 GAP-019-05) | 별도 후속 spec(테스트 하네스 재설계) 또는 문서화(Docs) |
| `test/auth-recovery.e2e-spec.ts::SC-017` | `expected 200, got 429` | 상동(NFR-003 의도 동작, GAP-019-04 잔존분 → GAP-019-05 재분류) | 상동 |

> 위 2건 모두 spec.md SC 원문과 테스트 자체는 정합([B] 아님), production 구현도 보안 요구사항(NFR)대로 정상 동작([A]/[D] 아님) — 어느 표준 분류에도 정확히 맞지 않는 "테스트 하네스가 보안 정책과 구조적으로 충돌"하는 5번째 사례로, coverage-gap.md 에 (4) 차후 점검으로 기록한다.

---

## SC 미커버 항목

| SC-ID | 관련 테스트 | 통과 여부 | 미커버 근본원인 |
|---|---|---|---|
| SC-001~005 | `test/list-query-dto.e2e-spec.ts` | PASS | - |
| SC-006 | `test/list-query-dto.e2e-spec.ts`(×5, admin/audit-logs 포함) | **PASS**(v1.0: FAIL) | - (GAP-019-03 RESOLVED) |
| SC-007/008 | `test/static/list-index.spec.ts` | PASS | - |
| SC-009 | (5b `EXPLAIN` 재실행) | 환경-제약(v1.0 과 동일) | 데이터 규모(9/1건) — coverage-gap (3) 유지 |
| SC-010 | `test/perf/list-p95.e2e-spec.ts` + `test/products.e2e-spec.ts` + `test/banner-admin.e2e-spec.ts` | **PASS**(v1.0: FAIL) | - (GAP-019-04 GET 목록분 RESOLVED) |
| SC-011~016 | (위 §커버리지 참조) | PASS | - |
| SC-017 | 전체 스위트 | **FAIL**(2건, v1.0: 13건) | 테스트 하네스-보안정책 구조적 충돌(GAP-019-05, production 정상·019 비원인·Development 복귀 대상 아님) |

---

## plan.md 매핑표 검증

**SC 매핑 테이블**:

| SC-ID | 관련 테스트 | 통과 여부 | 미커버 근본원인 |
|---|---|---|---|
| SC-001 | test_SC001_admin_sellers_pending_non_integer_limit_returns_400 | PASS | - |
| SC-002 | test_SC002_admin_users_non_integer_limit_returns_400 | PASS | - |
| SC-003 | test_SC003_admin_audit_logs_non_integer_limit_returns_400 | PASS | - |
| SC-004 | test_SC004_sellers_me_products_non_integer_limit_returns_400 | PASS | - |
| SC-005 | test_SC005_*(it.each) | PASS | - |
| SC-006 | test_SC006_admin_audit_logs_valid_limit_returns_200_with_array | PASS | - |
| SC-007 | test_SC007_product_model_has_sellerId_leading_composite_index | PASS | - |
| SC-008 | test_SC008_seller_model_has_status_leading_composite_index | PASS | - |
| SC-009 | (5b EXPLAIN 직접 실행) | 환경-제약 | 데이터 규모 제약(coverage-gap 기록) |
| SC-010 | list-p95.e2e-spec.ts / products.e2e-spec.ts / banner-admin.e2e-spec.ts | PASS | - |
| SC-011~016 | (위 표 참조) | PASS | - |
| SC-017 | 전체 스위트 | FAIL | 테스트 하네스-보안정책 구조적 충돌(GAP-019-05) |

---

## 설계 문서 정합성

- **spec.md FR-001~012 대조**: FR-001~005(DTO 검증) — SC-001~006 전건 PASS 로 완전 충족 확인(v1.0 의 admin/audit-logs 1건 미충족은 이번 라운드로 해소). FR-006~007(인덱스)은 SC-007/008/009 로 충족(SC-009 는 환경 제약). FR-008~010(find-email 감사로그)은 SC-011~013 으로 충족. FR-011~012(pino redact)는 SC-014/015 로 충족.
- **plan.md v1.1 트랙 5(ADR-006/007) 대조**: T016 이 명시한 "getter 시그니처·반환형·`runInTransaction`·`onAfterCommit`·lifecycle hook 전부 불변" 조건을 tx 경로 e2e(orders·payments·auth-reset-atomicity·banner-admin) 전건 PASS 로 실증. T017 이 명시한 "mutating/auth 핸들러 미부착" 조건을 grep + `rate-limit.e2e-spec.ts` 6/6 PASS 로 실증.
- **tasks.md T017 완료 기준(b) 문구 오귀속 확인**: `auth-recovery.e2e-spec.ts(SC-017/018)` 를 "FAIL(429)→PASS 전환" 대상으로 명시했으나, 실측 결과 이 파일의 SC-017 실패는 GET 목록 default throttle 이 아닌 forgot-password 전용 쿼터 소진이 원인이라 T017 범위로는 해소 불가능함이 확인됨. 문서 자체 수정은 본 Agent 권한 밖(Development/Design 소관) — gaps.md GAP-019-05 에 기록하고 Docs Agent 6단계에 문서 정합화(tasks.md 완료 기준 각주 또는 CHANGES.md 명시) 위임.
- **불일치 발견 시 코드 수정 금지 원칙 준수**: 위 tasks.md 문구 오귀속은 본 5b 가 직접 수정하지 않고 gaps.md 기록 + Docs Agent 위임.

---

## 회귀 탐지

- **T016·T017·T018 자체 회귀**: 0건. unit 404/404·tx 경로 e2e 전건·rate-limit e2e 6/6·static 13/13 전건 PASS.
- **§F 마이그레이션 2건**(`admin.controller.spec.ts`·`auth.service.spec.ts`) — unit 404/404 에 포함되어 회귀 없음 재확인.
- **신규 회귀(019 자체 변경으로 인한)**: 0건. 잔존 2건(GAP-019-05)은 019 가 변경하지 않은 파일(`git diff 62d14f9`=0)에서 발생하며, 018-era 부터 잠재되어 있던 test-harness-vs-security-policy 구조적 충돌.
- **GAP-019-03·GAP-019-04(GET 목록분) 완전 unblock**: SC-006·SC-010 PASS 전환 확정.
