---
작성: Test Agent (EXECUTION)
버전: v1.0
최종 수정: 2026-07-05 22:24
상태: 확정
---

# 테스트 실행 결과

## 목차

- [실행 요약](#실행-요약)
- [실패 목록](#실패-목록)
- [SC 미커버 항목](#sc-미커버-항목)
- [plan.md 매핑표 검증](#planmd-매핑표-검증)
- [설계 문서 정합성](#설계-문서-정합성)
- [회귀 탐지](#회귀-탐지)

---

## 실행 요약

**정적 jest 테스트** (5a AUTHORING 산출 3스위트 — 독립 재실행):

```
pnpm --filter backend exec jest --config test/jest-e2e.json --testPathPattern="test/static/migration"

PASS test/static/migration-runbook.spec.ts
PASS test/static/migration-config.spec.ts
PASS test/static/migration-mapping.spec.ts

Test Suites: 3 passed, 3 total
Tests:       54 passed, 54 total
```

5a 진행 로그(run-005-test-agent-authoring.md)에서 보고된 부분 FAIL(migration-config 5/8, migration-runbook 0/9)은 PPG-1 병렬 중 Development 미완료 상태의 TDD Red였으며, Development 4단계(T005·T008·T009) 완료 후 본 5b 독립 재실행에서 전건 PASS로 전환되었다.

**스크립트 구문 검증**:

```
bash -n scripts/migration/lib/common.sh   → OK
bash -n scripts/migration/extract.sh      → OK
bash -n scripts/migration/load.sh         → OK
bash -n scripts/migration/run.sh          → OK
```

**SQL 정적 검증**: 로컬 psql 미가용(환경에 `psql` 바이너리 부재 확인) — dry parse 불가. tasks.md 완료 기준에 명시된 키워드 존재 검증으로 갈음:
- `sql/10_transform.sql`: `ON CONFLICT` 30건, `INSERT INTO` 29건.
- `sql/20_verify.sql`: `LEFT JOIN` 12건, `SUM(` 26건, `verification_runs` 참조 7건.
- `sql/00_staging_ddl.sql`: `CREATE SCHEMA migration_staging` 1건, `verification_runs` DDL 1건(컬럼 phase·step·target_table·status·detail·started_at·finished_at 확인), `stg_*` 스테이징 테이블 29건(스킵 4종 제외 — GAP-020-01 RESOLVED 일치).

이 항목은 실제 DDL 실행 성공을 보증하지 않으므로 `coverage-gap.md`에 (2) 단위테스트 불가 항목으로 별도 기재한다.

**코드 커버리지 수치**: 본 spec 은 out-of-band bash/SQL 러너이며 NestJS 커버리지 계측 대상(`apps/backend/src`) 변경이 0건이므로 라인/브랜치 커버리지 수치는 해당 없음(N/A).

---

## 실패 목록

없음. 재실행한 3개 스위트(54건) 전건 PASS.

---

## SC 미커버 항목

없음(테스트 미작성/실패로 인한 미커버). 옵션 A 대상 12건은 "미커버 결함"이 아니라 spec.md·plan.md 가 확정한 설계된 검증 방식(사용자 환경 실행)이며, `coverage-gap.md` 에 4-카테고리 분류로 기록한다.

---

## plan.md 매핑표 검증

**SC 매핑 테이블**:

| SC-ID | 관련 테스트 | 통과 여부 | 미커버 근본원인 |
|---|---|---|---|
| SC-001 | (옵션A 계약 1 — 사용자 실행 대기) | - | - |
| SC-002 | (옵션A 계약 2 — 사용자 실행 대기) | - | - |
| SC-003 | `migration-runbook.spec.ts::test_SC003_runbook_documents_write_blocking_step` | PASS | - |
| SC-004 | (옵션A 계약 4 — 사용자 실행 대기) | - | - |
| SC-005 | (옵션A 계약 5 — 사용자 실행 대기) | - | - |
| SC-006 | (옵션A 계약 6 — 사용자 실행 대기) | - | - |
| SC-007 | (옵션A 계약 7 — 사용자 실행 대기) | - | - |
| SC-008 | `migration-runbook.spec.ts::test_SC008_runbook_documents_go_gate_condition` | PASS | - |
| SC-009 | `migration-runbook.spec.ts::test_SC009_runbook_documents_no_go_rollback_procedure` + (옵션A 계약 8) | PASS(정적분) | - |
| SC-010 | `migration-runbook.spec.ts::test_SC010_runbook_documents_point_of_no_return_warning` | PASS | - |
| SC-011 | `migration-mapping.spec.ts::test_SC011_*`(it.each 33건) | PASS | - |
| SC-012 | `migration-mapping.spec.ts::test_SC012_*` | PASS | - |
| SC-013 | `migration-config.spec.ts::test_SC013_*`(3건) | PASS | - |
| SC-014 | `migration-runbook.spec.ts::test_SC014_runbook_documents_reconfirmation_checkpoint` | PASS | - |
| SC-015 | `migration-runbook.spec.ts::test_SC015_runbook_repeats_owner_checkpoint_rollback_trigger_labels` | PASS | - |
| SC-016 | (옵션A 계약 9 — 사용자 실행 대기) | - | - |
| SC-017 | `migration-config.spec.ts::test_SC017_*` | PASS | - |
| SC-018 | `migration-runbook.spec.ts::test_SC018_runbook_documents_d_minus_3_notice_checkpoint` | PASS | - |
| SC-019 | `migration-runbook.spec.ts::test_SC019_runbook_documents_metadata_only_scope` | PASS | - |
| SC-020 | (옵션A 계약 10 — 사용자 실행 대기) | - | - |
| SC-021 | (옵션A 계약 11 — 사용자 실행 대기) | - | - |
| SC-022 | (옵션A 계약 12 — 사용자 실행 대기) | - | - |

## deferred SC 목록 (env 라우팅)

spec.md `[env:e2e-db]`·`[env:integration]` 태그가 있는 SC-001·002·004·005·006·007·009·016·020·021·022(총 11건, SC-003/SC-009 는 혼합)는 Test Agent 가 직접 검증하지 않고 `coverage.md`에 `옵션A-계약검증`으로 기록했다(§SC 환경 태그 라우팅). deferred 처리 SC 는 검증 주체가 사용자(운영자, 실 레거시 접근 보유)로 명시 위임되어 있으므로 "모든 SC-XXX 에 대응하는 테스트 케이스 존재" 통과 기준을 충족한 것으로 간주한다.

---

## 설계 문서 정합성

- **spec.md FR-XXX/SC-XXX 대조**: FR-001~017·NFR-001~006 전 항목이 tasks.md T001~T013 산출물(MAPPING-SPEC.md·sql/*.sql·extract.sh·load.sh·run.sh·config.example.env·RUNBOOK.md·PRE-ASSESSMENT.md·migration-*.spec.ts)에 매핑되어 누락이 없다.
- **plan.md 현행화**: run.sh 의 GO/NO-GO 판정 로직(`do_go_nogo`, L178-206)이 plan.md 테스트 전략의 "검증 4종 AND" 서술과 일치 — count/sum(required)/checksum/antijoin(core) 4종 fail 합산이 0일 때만 GO. NFR-005 50분 초과 시 경고 로그(WARN) 후에도 즉시 GO/NO-GO 판단을 계속 진행하는 방식(L195-197)은 plan.md 서술과 코드 구현이 일치함을 확인했다(불일치 없음).
- **GAP-020-02(FileAsset 물리 테이블명) 확인**: `apps/backend/prisma/schema.prisma` L768/782 실측으로 `FileAsset` 모델이 `@@map("files")`임을 재확인했다. `MAPPING-SPEC.md`·`RUNBOOK.md`·`PRE-ASSESSMENT.md`·`sql/00_staging_ddl.sql`·`sql/20_verify.sql` 전 산출물이 실측값 `files.files`를 일관되게 사용함을 grep으로 확인했다(`file_assets`라는 잘못된 이름의 참조 0건). GAP-020-02는 SQL 산출물 자체는 문제 없이 정확하며, 남은 조치(context.md §4 표기 정정)만 Docs/Retrospective 단계로 이관 대상임을 재확인 — gaps.md 상태 변경 불필요(이미 OPEN으로 정확히 기록됨).

정합성 불일치 0건. status: BLOCKED 사유 없음.

---

## 회귀 탐지

- `git status`(apps/backend/src, apps/backend/prisma) 대비 도메인 코드 변경 0건 확인 — 본 spec 은 out-of-band 이관 도구(P-007, 앱 코드 무변경)이며, 신규 파일은 `apps/backend/test/static/migration-*.spec.ts` 3건(신규 테스트)과 `.gitignore`(config.env·migration-run/ 추가) 수정뿐이다.
- 실행 범위 원칙(SC-XXX 제한, `~/.claude/agents/05-test.md` §실행 범위)에 따라 기존 unit 404·static 60·e2e 125/127 스위트는 본 5b 판정 대상에 포함하지 않았다 — 앱 도메인 코드 변경이 0건이므로 회귀 위험 자체가 구조적으로 없다(전체 회귀 감지는 CI 책임).
