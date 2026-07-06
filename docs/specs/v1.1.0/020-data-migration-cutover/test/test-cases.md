---
작성: Test Agent (AUTHORING)
버전: v1.0
최종 수정: [시각 미확인, spawn 기준 21:52]
상태: 작성중
---

# Test Cases: 020-data-migration-cutover

## 목차

- [SC × 시나리오 매트릭스](#sc--시나리오-매트릭스)
- [외부 의존성 명시](#외부-의존성-명시)
- [옵션 A 실행 계약](#옵션-a-실행-계약)
- [미커버 항목 (사전 분류 — 4-카테고리)](#미커버-항목-사전-분류--4-카테고리)

---

## SC × 시나리오 매트릭스

> **거짓 green 방지 원칙**: 실 레거시 RDS 접속이 필요한 SC(SC-001·002·004·005·006·007·016·020·021·
> 022)는 jest 자동 테스트로 작성하지 않는다. mock 으로 이 SC 들을 "커버됨" 처리하면 레거시 데이터
> 없이도 항상 통과하는 거짓 green 이 되어 실제 이관 결함(행 수 불일치·금액 오차·고아 레코드)을
> 은폐한다. 대신 [옵션 A 실행 계약](#옵션-a-실행-계약)으로 사용자 실행 절차·기대 결과·판정 기준을
> 명세하고, 5b(Test EXECUTION)/Deploy Agent 가 사용자 제출 결과를 이 계약으로 판정한다
> (spec.md "사후 검증 활동 실행 방식" 옵션 A, plan.md PATCH-A08).

| SC-ID | 수용 기준 | Happy Path | Edge Case | Error Case | 테스트 파일·함수 / 검증 방식 | env 태그 |
|---|---|---|---|---|---|---|
| SC-001 | 8스키마 전 테이블 레거시 대응 데이터 존재 | 33테이블 row>0(빈 소스 제외) | — | — | 옵션 A — §옵션 A 실행 계약 1 | [env:e2e-db] |
| SC-002 | pre-copy 시점 레코드 수 차 ≤ 델타 임계치 | — | 차이 ≤ 임계치 | — | 옵션 A — §옵션 A 실행 계약 2 | [env:integration] |
| SC-003 | 윈도우 개시 후 레거시 쓰기 503/차단 일관 | — | — | POST/PUT/PATCH/DELETE → 503/거부 | `migration-runbook.spec.ts::test_SC003_runbook_documents_write_blocking_step`(런북 절차 정적 확인) + 옵션 A — §옵션 A 실행 계약 3(실 차단 확인) | [env:static]+[env:integration] |
| SC-004 | 델타 후 마지막 변경 레코드 일치 | 레거시=신규 최신 일치 | — | — | 옵션 A — §옵션 A 실행 계약 4 | [env:integration] |
| SC-005 | 레코드 수 100% 일치(불일치 0) | 전 대상 29테이블 일치 | — | — | 옵션 A — §옵션 A 실행 계약 5 | [env:e2e-db] |
| SC-006 | 금전 합계 오차 0원 | totalAmount·amount·payoutAmount 일치 | — | — | 옵션 A — §옵션 A 실행 계약 6 | [env:e2e-db] |
| SC-007 | 샘플(≥100 또는 1%) 체크섬 일치 | 매핑후 projection 해시 일치 | 무작위 샘플 | — | 옵션 A — §옵션 A 실행 계약 7 | [env:e2e-db] |
| SC-008 | 런북 "SC-005~007 PASS 시에만 GO" 명시 | 문구 존재 | — | — | `migration-runbook.spec.ts::test_SC008_runbook_documents_go_gate_condition` | [env:static] |
| SC-009 | 검증 실패 리허설 → 전환 미진행·쓰기차단 해제 | — | — | 의도적 불일치 → NO-GO·재개 | `migration-runbook.spec.ts::test_SC009_runbook_documents_no_go_rollback_procedure`(정적) + 옵션 A — §옵션 A 실행 계약 8(리허설) | [env:static]+[env:integration] |
| SC-010 | 런북 PoNR 경고 단계 | 경고 단계 존재 | — | — | `migration-runbook.spec.ts::test_SC010_runbook_documents_point_of_no_return_warning` | [env:static] |
| SC-011 | 매핑표 신규 33테이블 전부 등장 | 누락 0 | — | — | `migration-mapping.spec.ts::test_SC011_*`(it.each 33건 + 역방향 종합) | [env:static] |
| SC-012 | "1:1 아님" 전건 변환 규칙 기재 | 변환규칙 누락 0 | — | — | `migration-mapping.spec.ts::test_SC012_*` | [env:static] |
| SC-013 | 사전평가 행수·예상소요·여유율 기재 | 3항목 존재 | — | — | `migration-config.spec.ts::test_SC013_*` | [env:static] |
| SC-014 | 예상소요>50분 시 "사용자 재확인 필수" 체크포인트 | — | 초과 시나리오 체크포인트 존재 | — | `migration-runbook.spec.ts::test_SC014_runbook_documents_reconfirmation_checkpoint` | [env:static] |
| SC-015 | 런북 각 단계 담당자·체크포인트·롤백트리거 기재 | 누락 0(근사) | — | — | `migration-runbook.spec.ts::test_SC015_runbook_repeats_owner_checkpoint_rollback_trigger_labels` | [env:static] |
| SC-016 | orders·payments·settlements 교차참조 orphan 0 | anti-join 0건 | — | — | 옵션 A — §옵션 A 실행 계약 9 | [env:e2e-db] |
| SC-017 | 러너 DB 연결 TLS(sslmode=require↑) | sslmode 설정 존재(config)+위임(scripts) | — | — | `migration-config.spec.ts::test_SC017_*` | [env:static] |
| SC-018 | 런북 D-3 공지 체크포인트(채널·완료란) | 체크포인트 존재 | — | — | `migration-runbook.spec.ts::test_SC018_runbook_documents_d_minus_3_notice_checkpoint` | [env:static] |
| SC-019 | file_assets 메타 count 포함·바이너리 검증 제외 명시 | 포함·제외 각 명시 | — | — | `migration-runbook.spec.ts::test_SC019_runbook_documents_metadata_only_scope` | [env:static] |
| SC-020 | 리허설/실행 "쓰기차단~전환완료" ≤60분 | 시각차 ≤60분 | — | — | 옵션 A — §옵션 A 실행 계약 10 | [env:e2e-db] |
| SC-021 | 리허설 검증·GO/NO-GO ≤50분 | ≤50분 | — | — | 옵션 A — §옵션 A 실행 계약 11 | [env:e2e-db] |
| SC-022 | 실행 로그(단계 시각·검증결과) 감사 형태 저장 | 파일/verification_runs 저장 | — | — | 옵션 A — §옵션 A 실행 계약 12 + `migration-config.spec.ts`(DDL 정적 확인은 T012 범위 밖 — `sql/00_staging_ddl.sql` 자체는 A-layer 산출물로 이미 존재 확인됨, 아래 참조) | [env:integration] |

> **SC-022 정적 보완 근거**: `scripts/migration/sql/00_staging_ddl.sql`(A-layer, Database Design Agent 기 확정)에 `verification_runs` 테이블이 이미 존재함을 확인했다(phase·step·target_table·status·detail·finished_at 컬럼). 감사 테이블 스키마 자체의 정적 존재는 T001 완료 기준으로 이미 검증된 상태이며, 본 test-cases.md 는 중복 정적 테스트를 추가하지 않고 옵션 A(실행 로그 실제 기록 여부)만 계약화한다.

---

## 외부 의존성 명시

- **fixture/mock**: 정적 테스트(`migration-mapping.spec.ts`·`migration-config.spec.ts`·`migration-runbook.spec.ts`) 는 fixture·mock 이 필요 없다 — `apps/backend/prisma/schema.prisma`·`scripts/migration/**` 의 실제 파일을 직접 읽는다.
- **환경 변수**: 정적 테스트는 환경 변수 불필요. 옵션 A 실행(사용자 환경)은 `scripts/migration/config.example.env` 를 복사한 `config.env`(커밋 금지)에 `LEGACY_DSN`·`TARGET_DSN`·`PGSSLMODE` 등 실값이 필요하다.
- **외부 서비스**: 정적 테스트는 외부 서비스 불필요. 옵션 A 실행은 레거시 18서비스 RDS PostgreSQL(실 자격증명·네트워크 접근) + 타깃 Fly Postgres 접근이 필요하다(사용자 환경 전제, spec.md "사후 검증 활동 실행 방식").
- **하네스 전제**: 정적 테스트 경로는 `apps/backend/test/static/migration-*.spec.ts` → `path.resolve(__dirname, '../../../../scripts/migration/...')`(4레벨 상위 = repo-root, tasks.md 하네스 canonical). 실행: `pnpm exec jest --config ./test/jest-e2e.json --testPathPattern 'test/static/migration-'`(apps/backend 디렉토리 기준 — rootDir="src" 인 기본 `package.json` jest 설정은 `test/static/` 를 포함하지 않으므로 `test/jest-e2e.json`(rootDir=".") 경유 필수).

---

## 옵션 A 실행 계약

> **원칙**: 아래 절차는 main session/Planning/Design 산출물(스크립트·SQL·명령)을 사용자가 실 레거시·
> 신규 환경에서 실행하고, 결과(리포트)를 5b(Test EXECUTION)/Deploy Agent 에게 전달하는 계약이다.
> 본 파이프라인은 레거시 자격증명·네트워크 접근이 없으므로 아래 절차를 자동 실행하지 않는다
> (spec.md 옵션 A, tasks.md T013).
>
> **run.sh(T005) 관련 caveat**: 아래 절차 중 `run.sh` 를 통한 일괄 오케스트레이션 부분은 T005(4단계
> Development, PPG-1 병렬 진행 중)가 아직 산출하지 않아 CLI 플래그 형태가 확정되지 않았다. 이미
> 확정된 `extract.sh`/`load.sh`(T002/T003, 소스 확인 완료)/`sql/*.sql`(T001, DB Design 확정) 개별
> 실행 절차로 계약을 명세하며, `run.sh` 확정 후에는 동등 오케스트레이션 명령으로 대체 가능하다(5b
> 진입 전 재확인 필요 시 main session 이 안내).

### 1. SC-001 — 8스키마 전 테이블 레거시 대응 데이터 존재

```bash
# config.env 준비(§외부 의존성 명시) 후 순서대로 실행
./scripts/migration/extract.sh --mode=precopy --service=all --out-dir=./migration-run/precopy
./scripts/migration/load.sh --mode=precopy --in-dir=./migration-run/precopy
psql "$TARGET_DSN" -f scripts/migration/sql/10_transform.sql
psql "$TARGET_DSN" -f scripts/migration/sql/20_verify.sql
psql "$TARGET_DSN" -c "SELECT target_table, detail->>'target_count' FROM migration_staging.verification_runs WHERE step='count' ORDER BY target_table;"
```

- **기대 결과**: MAPPING-SPEC.md §3 SC-005 대상 29테이블(스킵 4종 제외) 전부 `target_count > 0`(빈 소스 레거시 테이블은 예외로 0 허용 — 결과 제출 시 어떤 테이블이 0인지, 레거시 원본도 0인지 함께 기재).
- **판정 기준(5b)**: 29테이블 중 레거시 원본이 0건이 아닌데 target_count=0 인 테이블이 1건이라도 있으면 FAIL.

### 2. SC-002 — pre-copy 시점 레코드 수 차 ≤ 델타 임계치

```bash
# pre-copy 직후, 델타 워터마크 부류(A/A′/B) 테이블에 한해 레거시-신규 재조회 대조
psql "$LEGACY_DSN" -c "SELECT count(*) FROM <legacy_table>;"   # 서비스별 반복
psql "$TARGET_DSN" -c "SELECT count(*) FROM migration_staging.stg_<schema>_<table>;"
```

- **기대 결과**: 워터마크 부류(A/A′/B) 테이블의 레거시-스테이징 차이가 "직전 N분 변경률 기준" 임계치 이내(사용자가 사전평가(T009 PRE-ASSESSMENT.md) 실측 변경률로 임계치를 산정해 제출).
- **판정 기준(5b)**: 제출된 임계치 산정 근거(변경률 실측값) + 실제 차이값을 함께 확인. 산정 근거 누락 시 재제출 요청.

### 3. SC-003 — 윈도우 개시 후 레거시 쓰기 요청 일관 차단

```bash
curl -i -X POST "$LEGACY_API_BASE/<임의 쓰기 엔드포인트>"
curl -i -X PUT "$LEGACY_API_BASE/<임의 쓰기 엔드포인트>"
```

- **기대 결과**: 윈도우 개시(런북 "쓰기 차단" 단계 실행) 이후 모든 POST/PUT/PATCH/DELETE 요청이 503(점검 모드) 또는 DB read-only 오류로 즉시 거부.
- **판정 기준(5b)**: 정적 절차 확인(`migration-runbook.spec.ts`) PASS + 사용자 제출 curl 응답 로그에 2xx/200 이 0건.

### 4. SC-004 — 델타 이관 후 마지막 변경 레코드 일치

```bash
./scripts/migration/extract.sh --mode=delta --service=all --since=<precopy 완료 시각 ISO8601>
./scripts/migration/load.sh --mode=delta --in-dir=./migration-run/extract
psql "$TARGET_DSN" -c "SELECT max(\"updatedAt\") FROM commerce.reviews;"   # 워터마크 컬럼 보유 테이블 예시
psql "$LEGACY_DSN" -c "SELECT max(updated_at) FROM <legacy 대응 테이블>;"
```

- **기대 결과**: 델타 워터마크 컬럼(부류 A/B 테이블) 기준 레거시 최신 레코드와 신규 최신 레코드가 일치.
- **판정 기준(5b)**: MAPPING-SPEC.md §6 워터마크 컬럼 보유 테이블 전부에 대해 최신값 일치 확인 결과 제출.

### 5. SC-005 — 레코드 수 100% 일치

```bash
psql "$TARGET_DSN" -c "SELECT target_table, status, detail FROM migration_staging.verification_runs WHERE phase='verify' AND step='count' ORDER BY target_table;"
```

- **기대 결과**: `sql/20_verify.sql` (a) 블록 실행 후 SC-005 대상 29테이블(MAPPING-SPEC.md §3) 전부 `status='pass'`.
- **판정 기준(5b)**: `status='fail'` 행 0건. 있으면 FAIL(불일치 건 리스트와 함께 GAP 기록).

### 6. SC-006 — 금전 합계 오차 0원

```bash
psql "$TARGET_DSN" -c "SELECT name, status, detail FROM migration_staging.verification_runs WHERE phase='verify' AND step='sum' ORDER BY name;" 2>/dev/null || \
psql "$TARGET_DSN" -c "SELECT target_table, status, detail FROM migration_staging.verification_runs WHERE phase='verify' AND step='sum' ORDER BY target_table;"
```

- **기대 결과**: `sql/20_verify.sql` (b) 블록 실행 후 SC-006 필수 3종(`orders.orders.totalAmount`·`payments.payments.amount`·`settlements.settlements.payoutAmount`, `detail->>'required'='true'`) 전부 `status='pass'`.
- **판정 기준(5b)**: 필수 3종 전부 `pass`(AND 조건, FR-006 GO 게이트와 동일 기준). 확장 항목(required=false)의 `fail` 은 권고 사항으로 기록만 하고 GO 게이트에는 영향 없음.

### 7. SC-007 — 무작위 샘플 체크섬 일치

```bash
psql "$TARGET_DSN" -c "SELECT target_table, status, detail FROM migration_staging.verification_runs WHERE phase='verify' AND step='checksum' ORDER BY target_table;"
```

- **기대 결과**: `sql/20_verify.sql` (c) 블록 실행 후 8개 스키마 대표 테이블 전부 `status='pass'`(mismatch_count=0), `detail->>'sample_size'` 가 `GREATEST(100, ceil(count*0.01))` 이상.
- **판정 기준(5b)**: 전 대표 테이블 `pass` + sample_size 가 스펙 하한(≥100 또는 1%) 충족.

### 8. SC-009 — 검증 실패 리허설 → NO-GO·쓰기차단 해제

```bash
# 리허설: 스테이징의 임의 1건을 의도적으로 변조하여 (a) count 또는 (b) sum 불일치를 유발한 뒤 20_verify.sql 재실행
psql "$TARGET_DSN" -c "UPDATE orders.orders SET \"totalAmount\" = \"totalAmount\" + 1 WHERE id = (SELECT id FROM orders.orders LIMIT 1);"
psql "$TARGET_DSN" -f scripts/migration/sql/20_verify.sql
```

- **기대 결과**: 검증 리포트에 `status='fail'` 행 발생 → 런북 NO-GO 절차 실행 → 트래픽 전환 미실행 + 레거시 쓰기 차단 해제(레거시 API 재개 확인, SC-003 역방향 curl 재시도로 2xx 복귀 확인).
- **판정 기준(5b)**: fail 유발 후 실제로 NO-GO 분기가 수행되었다는 사용자 실행 로그(런북 단계 실행 기록) + 레거시 쓰기 재개 확인.

### 9. SC-016 — orders·payments·settlements 교차참조 orphan 0

```bash
psql "$TARGET_DSN" -c "SELECT name, status, detail FROM migration_staging.verification_runs WHERE phase='verify' AND step='antijoin' AND detail->>'core'='true' ORDER BY name;"
```

- **기대 결과**: `sql/20_verify.sql` (d) 핵심 6종(MAPPING-SPEC.md §10) 전부 `status='pass'`(orphan_count=0).
- **판정 기준(5b)**: 핵심 6종 전부 pass(AND, FR-006 GO 게이트 필수 조건과 동일). 확장(core=false) 항목의 fail 은 권고로만 기록.

### 10. SC-020 — "쓰기차단~전환완료" ≤60분

```bash
psql "$TARGET_DSN" -c "SELECT phase, step, started_at, finished_at FROM migration_staging.verification_runs ORDER BY started_at;"
```

- **기대 결과**: 런북 "쓰기 차단 시작" 단계 기록 시각 ~ "트래픽 전환 완료" 단계 기록 시각 차이가 60분 이하(NFR-001).
- **판정 기준(5b)**: 리허설 또는 실제 실행 로그의 시각차 계산 결과 ≤ 60분.

### 11. SC-021 — 검증·GO/NO-GO ≤50분

```bash
psql "$TARGET_DSN" -c "SELECT min(started_at) AS window_start, max(finished_at) FILTER (WHERE step='count' OR step='sum' OR step='checksum' OR step='antijoin') AS verify_done FROM migration_staging.verification_runs;"
```

- **기대 결과**: 윈도우 개시(쓰기 차단 시작) ~ 검증 완료(GO/NO-GO 판단 시점) 시각차가 50분 이하(NFR-005 — 롤백 판단·실행 여유 10분 확보).
- **판정 기준(5b)**: 리허설 로그 기준 시각차 ≤ 50분.

### 12. SC-022 — 실행 로그 감사 형태 저장

```bash
cat ./migration-run/*.log   # run.sh/extract.sh/load.sh 의 구조적 로그 파일(파일 경로는 T005/T007 확정 후 재확인)
psql "$TARGET_DSN" -c "SELECT phase, step, started_at, finished_at, status FROM migration_staging.verification_runs ORDER BY started_at;"
```

- **기대 결과**: 각 단계 시작·종료 시각과 검증 결과가 (a) 구조적 로그 파일 + (b) `verification_runs` 테이블 양쪽에 기록.
- **판정 기준(5b)**: 두 소스 모두에서 전 단계(추출·로드·변환·검증·GO/NO-GO) 기록 확인. 자격증명·PII 평문 노출 없음(마스킹 확인 — `lib/common.sh::mask_dsn` 정적 확인은 별도 보강 가능).

---

## 미커버 항목 (사전 분류 — 4-카테고리)

> 5b(Test EXECUTION)의 `coverage-gap.md` 작성 시 아래 사전 분류를 참조한다. 실 레거시 접속이
> 필요한 전 SC 는 (2) 단위테스트 불가로 분류하되, 실제 컷오버 실행 주체가 사용자(운영자)이므로
> (3) 운영 환경에서 확인 권장으로 최종 분류한다(위 §옵션 A 실행 계약이 검증 방법·환경·담당을
> 대체 기술).

| SC-ID | 미커버 시나리오 | 카테고리 | 검증 방법 | 환경/도구 | 담당 |
|---|---|---|---|---|---|
| SC-001 | 33테이블(29대상) row>0 실측 | (3) 운영 환경 권장 | §옵션 A 실행 계약 1 | 레거시 RDS + Fly Postgres | 운영 |
| SC-002 | pre-copy 델타 임계치 대조 | (3) 운영 환경 권장 | §옵션 A 실행 계약 2 | 상동 | 운영 |
| SC-003 | 레거시 API 실 쓰기차단 응답 | (3) 운영 환경 권장 | §옵션 A 실행 계약 3 | 레거시 API 게이트웨이 | 운영 |
| SC-004 | 델타 최신 레코드 일치 | (3) 운영 환경 권장 | §옵션 A 실행 계약 4 | 레거시 RDS + Fly Postgres | 운영 |
| SC-005 | 레코드 수 100% 일치 | (3) 운영 환경 권장 | §옵션 A 실행 계약 5 | 상동 | 운영 |
| SC-006 | 금전 합계 오차 0원 | (3) 운영 환경 권장 | §옵션 A 실행 계약 6 | 상동 | 운영 |
| SC-007 | 샘플 체크섬 일치 | (3) 운영 환경 권장 | §옵션 A 실행 계약 7 | 상동 | 운영 |
| SC-009 | 검증실패 리허설 NO-GO 분기 실행 | (3) 운영 환경 권장 | §옵션 A 실행 계약 8 | 리허설 환경 | 운영 |
| SC-016 | 교차참조 anti-join 0건 | (3) 운영 환경 권장 | §옵션 A 실행 계약 9 | Fly Postgres | 운영 |
| SC-020 | 쓰기차단~전환완료 ≤60분 | (3) 운영 환경 권장 | §옵션 A 실행 계약 10 | 리허설/실행 로그 | 운영 |
| SC-021 | 검증·GO/NO-GO ≤50분 | (3) 운영 환경 권장 | §옵션 A 실행 계약 11 | 상동 | 운영 |
| SC-022 | 실행 로그 감사 저장 확인 | (3) 운영 환경 권장 | §옵션 A 실행 계약 12 | 상동 | 운영 |
| — | `run.sh`(T005) CLI 플래그·GO/NO-GO 게이트 실코드 | (4) 차후 점검 | T005 완료 후 옵션 A 절차 재확인 필요(§옵션 A 실행 계약 caveat) | — | 5b(재확인)·운영 |
| — | `users.social_accounts`·`admin.admin_audit_logs` 레거시 대응 여부(신규기능 가능성, MAPPING-SPEC §8-2/§7.7) | (4) 차후 점검 | 레거시 실 스키마 확인 후 T001 재작업 여부 결정(count baseline 0 허용 여부 확정) | 레거시 오너 확인 | 운영 |
| — | `products.variants` 레거시 옵션 인라인 구조 가정(MAPPING-SPEC §8-3) | (4) 차후 점검 | 레거시가 옵션 마스터/조합 분리 구조인 경우 `10_transform.sql` 재작업 필요 | 레거시 오너 확인 | 운영 |

> 카테고리 (1) 단위테스트 가능 항목은 0건이다(정적 검증 3종은 이미 jest 테스트로 작성 완료 —
> `migration-mapping.spec.ts`·`migration-config.spec.ts`·`migration-runbook.spec.ts`). 따라서
> 5b 는 Development 복귀 요청 없이 위 (3)(4) 항목만으로 coverage-gap.md 를 작성할 수 있다.
