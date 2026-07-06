---
작성: Test Agent (EXECUTION)
버전: v1.0
최종 수정: 2026-07-06 14:55
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

- 실행 커맨드: `pnpm exec jest --config ./test/jest-e2e.json --testPathPattern 'test/static/file-migration-'` (apps/backend 디렉토리 기준)
- 대상: `file-migration-runbook.spec.ts` · `file-migration-pre-assessment.spec.ts` · `file-migration-script.spec.ts` (tasks.md T-D01~D03, 5a AUTHORING 산출물)
- 결과: **3 suites / 18 tests 전부 PASS**, 실패 0건, 스킵 0건.
- `bash -n scripts/migration/files-migrate.sh` 문법 검증: 통과.
- `docker build -f scripts/migration/Dockerfile -t doa-migration-runner scripts/migration` + `rclone version`: GAP-022-01 로 Development Agent 가 이미 실증 완료(`rclone v1.74.1-DEV` 정상 출력, gaps.md 참조). 5b 는 재실행 대신 gaps.md 기록·Dockerfile 정적 내용(`apk add --no-cache curl rclone`, `chmod +x .../files-migrate.sh`)을 대조하여 실증 결과와 정합함을 확인.
- Test EXECUTION(5b) 자체 재실행 결과: Development Agent(4단계)가 PPG-1 동기화 시 이미 교차 실행(3 suites/18 tests PASS)했으며, 5b 가 독립적으로 동일 명령을 재실행하여 동일 결과를 재확인(공식 재검증).
- SC 커버리지: 정적 검증 6건(SC-007·008·009·010·012·014) 전건 테스트 존재·통과. 옵션 A 실행 계약 9건(SC-001·002·003·004·005·006·011·013·015)은 실 레거시 AWS S3 접속이 필요하여 파이프라인 내 자동 실행 불가 — test-cases.md §옵션 A 실행 계약으로 명세, coverage-gap.md 에 (3) 운영 환경 권장으로 분류(아래 §SC 미커버 항목 참조).

### SC 1건당 매핑 테스트 가지수 통계

| SC-ID | 매핑 테스트 개수 | 세부 |
|---|---|---|
| SC-007 | 1 | `test_SC007_pre_assessment_documents_residual_failure_reconfirmation` |
| SC-008 | 6 | `test_SC008_runbook_documents_%s_subcommand_step`(it.each 5건: precheck·precopy·delta·verify·url-update) + `test_SC008_runbook_repeats_user_execution_transfer_verification_labels` |
| SC-009 | 1 | `test_SC009_pre_assessment_has_total_count_capacity_duration_slots` |
| SC-010 | 2 | `test_SC010_dockerfile_exists_and_contains_rclone` + `test_SC010_no_new_dockerfile_created_under_migration_root` |
| SC-012 | 2 | `test_SC012_files_migrate_sh_uses_files_from_and_checksum` + `test_SC012_files_migrate_sh_has_no_max_duration_flag` |
| SC-014 | 2 | `test_SC014_config_example_env_endpoints_use_https` + `test_SC014_config_example_env_has_no_plaintext_http_endpoint` |
| SC-001·002·003·004·005·006·011·013·015 | 각 1 (옵션 A 실행 계약 절) | test-cases.md §옵션 A 실행 계약 1~9 — 자동 테스트 함수 아님, 사용자 실행 절차·판정 기준으로 계약화 |

> 정적 SC 6건에 대응하는 하드 assert 테스트는 총 14건(전제 존재 확인 4건 별도) + 전제 존재 확인 4건 = 18건(jest 실행 결과와 일치).

---

## 실패 목록

없음(정적 스위트 3종·18 테스트 전건 PASS, 실패 0건).

---

## SC 미커버 항목

정적 검증 대상(SC-007·008·009·010·012·014) 전건 테스트 존재 및 통과 — 미커버 0건.

옵션 A 실행 계약 대상(SC-001·002·003·004·005·006·011·013·015) 9건은 실 레거시 AWS S3 자격증명·네트워크 접근이 파이프라인 밖 사용자 환경에만 존재하여 자동 테스트로 작성하지 않는다(spec.md "사후 검증 활동 실행 방식" 옵션 A, mock 시 거짓 green 방지 원칙 — test-cases.md §SC × 시나리오 매트릭스 상단 원칙 참조). 상세 분류는 [coverage-gap.md](coverage-gap.md) 참조.

---

## plan.md 매핑표 검증

**SC 매핑 테이블**:

| SC-ID | 관련 테스트 | 통과 여부 | 미커버 근본원인 |
|---|---|---|---|
| SC-001 | test-cases.md §옵션 A 실행 계약 1 | - | 실 레거시 S3 접속 필요(자동 실행 불가) |
| SC-002 | test-cases.md §옵션 A 실행 계약 2 | - | 실 레거시 S3 접속 필요(자동 실행 불가) |
| SC-003 | test-cases.md §옵션 A 실행 계약 3 | - | 실 레거시 S3 접속 필요(자동 실행 불가) |
| SC-004 | test-cases.md §옵션 A 실행 계약 4 | - | 실 레거시 S3 접속 필요(자동 실행 불가). 정적 갈음: `sql/30_file_url_update.sql` (c) 쿼리(`url IS DISTINCT FROM base||'/'||key`) 존재 확인(코드 리뷰) |
| SC-005 | test-cases.md §옵션 A 실행 계약 5 | - | 실 레거시 S3 접속 필요(자동 실행 불가) |
| SC-006 | test-cases.md §옵션 A 실행 계약 6 | - | 실 레거시 S3 접속 필요(자동 실행 불가). 정적 갈음: `files-migrate.sh` `--retries`·실패 key 캡처 경로(`rclone lsf --files-from` 재대조) 존재 확인(코드 리뷰) |
| SC-007 | `file-migration-pre-assessment.spec.ts::test_SC007_pre_assessment_documents_residual_failure_reconfirmation` | PASS | - |
| SC-008 | `file-migration-runbook.spec.ts::test_SC008_*`(it.each 5건 + 라벨 테스트) | PASS | - |
| SC-009 | `file-migration-pre-assessment.spec.ts::test_SC009_pre_assessment_has_total_count_capacity_duration_slots` | PASS | - |
| SC-010 | `file-migration-script.spec.ts::test_SC010_*` | PASS | - |
| SC-011 | test-cases.md §옵션 A 실행 계약 7 | - | 실 레거시 S3 접속·컷오버 윈도우 실행/리허설 로그 필요(자동 실행 불가) |
| SC-012 | `file-migration-script.spec.ts::test_SC012_*` | PASS | - |
| SC-013 | test-cases.md §옵션 A 실행 계약 8 | - | 실 레거시 S3 접속 필요(자동 실행 불가) |
| SC-014 | `file-migration-script.spec.ts::test_SC014_*` | PASS | - |
| SC-015 | test-cases.md §옵션 A 실행 계약 9 | - | 실 레거시 S3 접속 필요(자동 실행 불가). 정적 갈음: `files-migrate.sh` `stage_run`(`verification_runs` INSERT/UPDATE, phase='file-migration') 경로 존재 확인(코드 리뷰) |

## Deferred SC 목록 (env 태그 라우팅)

spec.md 의 `[env:e2e-db]`/`[env:integration]` 태그가 붙은 9건은 실 레거시 AWS S3 자격증명이 파이프라인 밖 사용자 환경에만 존재하므로, `SC 환경 태그 라우팅` 원칙에 따라 Test Agent 가 직접 자동 실행하지 않는다. spec.md·plan.md·tasks.md·test-cases.md 가 이미 옵션 A(사용자 실행 + 결과 전달, 020 선례 승계)로 명시적 합의·설계되어 있으므로 태그 문자열(`e2e-db` vs `integration`)과 무관하게 "실 레거시 접속 필요"라는 실질 기준으로 9건 전부 deferred 처리한다. deferred 판정 주체: 5b(본 문서, 정적 갈음 확인) + 사용자 실행 결과 제출 시 Deploy Agent(또는 재호출된 5b)가 §옵션 A 실행 계약의 판정 기준으로 최종 GO/NO-GO 확정.

deferred 처리는 "모든 SC-XXX 에 대응하는 테스트 케이스 존재" 완료 기준을 충족한 것으로 간주한다(test-cases.md §옵션 A 실행 계약이 실행 절차·기대 결과·판정 기준을 명세하는 계약 산출물이므로).

---

## 설계 문서 정합성

spec.md FR-001~010·NFR-001~005·SC-001~015 전건을 tasks.md·실제 산출물과 대조했다. 발견 사항:

- **FR-001/ADR-004(key SoT)**: `sql/30_file_url_update.sql` (d) 쿼리·`files-migrate.sh` 의 키 목록 추출 경로가 `WHERE status='UPLOADED'` 필터를 일관되게 사용(PENDING 제외 단일 지점) — plan.md·tasks.md 기술과 일치.
- **FR-004(key 그대로·url 갱신)**: `sql/30_file_url_update.sql` (a) 쿼리가 `url = base||'/'||key`(멱등, key 무변경)로 구현 — plan.md ADR-005 와 일치.
- **FR-006/007(부분 성공·잔존 실패)**: `files-migrate.sh` 가 `rclone lsf --files-from` 재대조로 실패 key 를 산출하고 1회 재시도, `FILE-PRE-ASSESSMENT.md` §3 에 "잔존 실패"·"재확인" 문구 및 게이트 체크박스 존재 — plan.md ADR-007 과 일치.
- **FR-008(옵션 A)**: `FILE-MIGRATION-RUNBOOK.md` 가 레거시 접근이 필요한 4단계(precheck·precopy·delta·verify)마다 "사용자 환경 실행"·"결과 전달"·"검증" 라벨을 각 4회 이상 반복 — `url-update` 단계는 "레거시 S3 접근 불요 — 옵션 A 대상 아님"으로 명시적으로 제외되어 정적 테스트의 `MIN_LABEL_OCCURRENCES = 4` 설계 근거(5개 서브커맨드 중 레거시 접근 필요 4개)와 실제 문서 내용이 일치함을 확인.
- **FR-009**: `FILE-PRE-ASSESSMENT.md` §2 에 총 개수·총 용량·예상 소요 3항목 슬롯 존재, 파일럿 처리량 기반 소요 산정 방법론까지 기술 — plan.md 기술과 일치.
- **FR-010/ADR-002**: `Dockerfile` 이 020 기존 이미지에 `RUN apk add --no-cache curl rclone` 1줄만 추가(신규 이미지 파일 0건, `scripts/migration/` 하위 `Dockerfile` 1개만 존재) — SC-010 정적 테스트가 이를 정확히 검증.
- **NFR-002/S2**: `files-migrate.sh` 에 `--max-duration` 부재 확인(정적 테스트 통과) — plan.md S2 "NFR-002 무제약 강제 부재" 설계와 일치.
- **NFR-004/ADR-009**: `config.example.env` 에 레거시 S3·R2 엔드포인트가 `https://`(3건 이상)로 기재되고 평문 `http://` 부재 — plan.md ADR-009 와 일치.
- **ADR-003(델타=멱등 skip)**: `files-migrate.sh` 의 `precopy`/`delta` 가 동일 `--checksum` 플래그의 `rclone copy` 를 재사용(코드 상 정적 확인) — plan.md S3 델타 캡처 전략과 일치.

불일치 발견 0건. 코드 예시·변수명·인터페이스 계약이 plan.md·tasks.md 와 실제 구현 간 어긋나는 부분 없음.

---

## 회귀 탐지

`apps/backend/test/static/` 전체 스위트 재실행 결과: **23 suites / 153 tests 전부 PASS**(file-migration-* 3종 포함). 022 이전 기존 정적 테스트(020/021 및 그 이전 spec) 22종에 회귀 없음 — 020 이 생성한 `scripts/migration/lib/common.sh`·`run.sh`·`extract.sh`·`load.sh`·`sql/{00,10,20}_*.sql`·`delta-classes.conf` 는 022 가 수정하지 않았다(plan.md "020 자산 재사용 경계" 원칙 준수, 실측 `git status` 로 확인).

`git status` 확인 결과 의도치 않은 파일 없음 — `scripts/migration/config.env`·`scripts/migration/migration-run/` 미생성(커밋 금지 대상 부재 확인).
