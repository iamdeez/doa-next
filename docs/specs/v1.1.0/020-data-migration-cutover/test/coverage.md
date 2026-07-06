---
작성: Test Agent (EXECUTION)
버전: v1.0
최종 수정: 2026-07-05 22:24
상태: 확정
---

# Coverage: 020-data-migration-cutover

## 목차

- [SC × 시나리오 커버리지](#sc--시나리오-커버리지)
- [옵션 A 계약 재검증 결과](#옵션-a-계약-재검증-결과)
- [STALE_SC 경고](#stale_sc-경고)

---

## SC × 시나리오 커버리지

> "상태" 열: `자동-PASS`(jest 정적 테스트 실행 PASS) / `옵션A-계약검증`(사용자 실행 대기 계약의 완결성을 5b 가 검증) / `정적-갈음`(psql 부재로 키워드 검증으로 대체).

| SC-ID | 수용 기준 | Happy Path | Edge Case | Error Case | plan.md 시나리오 전체 | 상태 |
|---|---|---|---|---|---|---|
| SC-001 | 이관 파이프라인 실행 후 8개 신규 스키마의 모든 테이블에 레거시 대응 데이터가 존재함을 확인한다. | 옵션A 계약 1 | — | — | 커버(옵션A) | 옵션A-계약검증 |
| SC-002 | 벌크 사전 복사 완료 시점에 레거시-신규 간 레코드 수 차이가 사전 정의된 델타 임계치(직전 N분 변경률 기준) 이내임을 확인한다. | — | 옵션A 계약 2 | — | 커버(옵션A) | 옵션A-계약검증 |
| SC-003 | 윈도우 개시 시각 이후 레거시 API 가 쓰기 요청(POST/PUT/PATCH/DELETE)에 대해 일관되게 차단 응답(예: 503 점검 모드)을 반환함을 확인한다. | — | — | `migration-runbook.spec.ts::test_SC003_runbook_documents_write_blocking_step` PASS + 옵션A 계약 3 | 커버(정적+옵션A) | 자동-PASS + 옵션A-계약검증 |
| SC-004 | 델타 이관 완료 시점에 레거시와 신규의 마지막 변경 레코드(updatedAt 등 기준)가 일치함을 확인한다. | 옵션A 계약 4 | — | — | 커버(옵션A) | 옵션A-계약검증 |
| SC-005 | 정합성 검증 리포트에서 모든 대상 테이블의 레코드 수가 레거시=신규로 100% 일치함을 확인한다(불일치 0건). | 옵션A 계약 5 | — | — | 커버(옵션A) | 옵션A-계약검증 |
| SC-006 | 정합성 검증 리포트에서 orders.totalAmount·payments.amount·settlements.payoutAmount 합계가 레거시=신규로 일치함을 확인한다(오차 0원). | 옵션A 계약 6 | — | — | 커버(옵션A) | 옵션A-계약검증 |
| SC-007 | 정합성 검증이 스키마당 최소 100건 또는 전체의 1% 중 큰 값의 무작위 샘플에 대해 체크섬/해시가 일치함을 확인한다. | 옵션A 계약 7 | 무작위 샘플 | — | 커버(옵션A) | 옵션A-계약검증 |
| SC-008 | 런북 문서에 "SC-005~SC-007 전부 PASS 시에만 트래픽 전환(GO) 단계 진행"이 명시되어 있음을 확인한다. | `migration-runbook.spec.ts::test_SC008_runbook_documents_go_gate_condition` PASS | — | — | 커버 | 자동-PASS |
| SC-009 | 검증 실패 시나리오(리허설)를 재현했을 때, 절차가 트래픽 전환을 진행하지 않고 레거시 쓰기 차단이 해제되어 정상 서비스가 재개됨을 확인한다. | — | — | `migration-runbook.spec.ts::test_SC009_runbook_documents_no_go_rollback_procedure` PASS + 옵션A 계약 8 | 커버(정적+옵션A) | 자동-PASS + 옵션A-계약검증 |
| SC-010 | 런북 문서에 "컷오버 후 신규 주문/결제 1건 발생 시점부터 롤백 불가(point of no return)" 경고 단계가 명시되어 있음을 확인한다. | `migration-runbook.spec.ts::test_SC010_runbook_documents_point_of_no_return_warning` PASS | — | — | 커버 | 자동-PASS |
| SC-011 | 매핑 명세 문서에 18개 레거시 서비스 데이터 모델과 8개 신규 스키마 간 필드 단위 매핑표가 존재하며, 신규 스키마의 모든 테이블이 매핑표에 최소 1회 이상 등장함을 확인한다. | `migration-mapping.spec.ts::test_SC011_*`(it.each 33건 + 역방향 종합) PASS | — | — | 커버 | 자동-PASS |
| SC-012 | 매핑표 내 "1:1 아님"으로 표시된 각 항목에 변환 규칙 설명이 누락 없이 기재되어 있음을 확인한다. | `migration-mapping.spec.ts::test_SC012_*` PASS | — | — | 커버 | 자동-PASS |
| SC-013 | 이관 실행 전 산출되는 사전 평가 리포트에 테이블별 행 수·예상 소요 시간·윈도우 대비 여유율이 기재되어 있음을 확인한다. | `migration-config.spec.ts::test_SC013_*`(3건) PASS | — | — | 커버 | 자동-PASS |
| SC-014 | 사전 평가 리포트의 예상 소요 시간이 NFR-005 안전마진(50분)을 초과하는 경우, 런북에 "진행 전 사용자 재확인 필수" 체크포인트가 명시되어 있음을 확인한다. | — | `migration-runbook.spec.ts::test_SC014_runbook_documents_reconfirmation_checkpoint` PASS | — | 커버 | 자동-PASS |
| SC-015 | 런북 문서의 각 단계에 담당자·체크포인트·롤백 트리거 조건이 누락 없이 기재되어 있음을 확인한다. | `migration-runbook.spec.ts::test_SC015_runbook_repeats_owner_checkpoint_rollback_trigger_labels`(근사 검증, 라벨별 ≥5회) PASS | — | — | 커버(근사) | 자동-PASS |
| SC-016 | 정합성 검증 시 orders·payments·settlements 3개 스키마 간 교차 참조 무결성이 100% 유지됨(고아 레코드 0건)을 확인한다. | 옵션A 계약 9 | — | — | 커버(옵션A) | 옵션A-계약검증 |
| SC-017 | 이관 파이프라인의 DB 연결 설정에 TLS(sslmode=require 이상)가 적용되어 있음을 설정 검토로 확인한다. | `migration-config.spec.ts::test_SC017_*` PASS(위임구조 확인 방식으로 정정 — 아래 참조) | — | — | 커버 | 자동-PASS |
| SC-018 | 런북 문서에 컷오버 최소 D-3일 전 사용자 공지 체크포인트(공지 채널·완료 확인란)가 포함되어 있음을 확인한다. | `migration-runbook.spec.ts::test_SC018_runbook_documents_d_minus_3_notice_checkpoint` PASS | — | — | 커버 | 자동-PASS |
| SC-019 | 정합성 검증 대상에 `file_assets` 메타데이터 레코드 수 대조가 포함되고, 실 파일 바이너리 전송 검증은 스코프 문서상 명시적으로 제외되어 있음을 확인한다. | `migration-runbook.spec.ts::test_SC019_runbook_documents_metadata_only_scope` PASS | — | — | 커버 | 자동-PASS |
| SC-020 | 컷오버 리허설(dry-run) 또는 실제 실행 로그에서 "쓰기 차단 시작" ~ "트래픽 전환 완료" 시각 차이가 60분 이하임을 확인한다. | 옵션A 계약 10 | — | — | 커버(옵션A) | 옵션A-계약검증 |
| SC-021 | 리허설 로그에서 FR-005 검증 및 GO/NO-GO 판단이 윈도우 개시 후 50분 이내에 완료됨을 확인한다. | 옵션A 계약 11 | — | — | 커버(옵션A) | 옵션A-계약검증 |
| SC-022 | 이관 절차 실행 로그(각 단계 시작·종료 시각, 검증 결과)가 감사 가능한 형태(파일 또는 감사 테이블)로 저장됨을 확인한다. | 옵션A 계약 12 + `verification_runs` DDL 정적 존재 확인(00_staging_ddl.sql L17) | — | — | 커버(옵션A+정적보완) | 옵션A-계약검증 |

### SC-017 위임구조 확인 방식 정정 재검증

5a AUTHORING 이 PPG-1 병렬 중 정정한 SC-017 테스트(각 스크립트 리터럴 요구 → `lib/common.sh::load_migration_config` 위임 확인)를 5b 에서 재확인했다. `lib/common.sh` 를 직접 읽어 `PGSSLMODE` 가 `:?`(bash 필수 변수 단언) 로 강제됨을 확인했고(`grep -n "PGSSLMODE" scripts/migration/lib/common.sh`), `extract.sh`/`load.sh`/`run.sh` 가 전부 `load_migration_config` 를 호출함을 확인했다 — 테스트가 production 실제 구조(중앙집중 위임)를 재현하고 있어 PATCH-03 원칙 위반 없음.

---

## 옵션 A 계약 재검증 결과

5b 는 옵션 A 대상 12개 항목(SC-001·002·004·005·006·007·009·016·020·021·022, SC-003/SC-009 는 정적+옵션A 혼합의 옵션A 부분)의 **실행 계약 완결성**(자동 실행이 아닌, "사용자가 그대로 따라 할 수 있는가")을 판정했다. 각 항목에 대해 (a) 명령이 실제 산출물 소스와 합치하는지, (b) 기대 결과·판정 기준이 명확한지 확인했다.

| 항목 | 대조 대상 소스 | 정합 확인 |
|---|---|---|
| §1 (SC-001) | `extract.sh --mode=precopy`, `load.sh --mode=precopy`, `sql/10_transform.sql`, `sql/20_verify.sql` 플래그·경로 | run.sh/extract.sh/load.sh 실제 CLI 옵션과 일치 확인 |
| §2 (SC-002) | `migration_staging.stg_*` 명명 규칙 | `00_staging_ddl.sql` 테이블명과 일치(`stg_<schema>_<table>`) |
| §3 (SC-003) | `migration-runbook.spec.ts` 정적 PASS | 자동 확인 완료(위 표) |
| §4 (SC-004) | `extract.sh --mode=delta --since=`, `commerce.reviews.updatedAt` | extract.sh 델타 모드 옵션 실존 확인 |
| §5~7,9 (SC-005/006/007/016) | `verification_runs` 컬럼(`phase`·`step`·`target_table`·`status`·`detail`) | `00_staging_ddl.sql` L17-29 DDL과 쿼리 컬럼명 일치 |
| §8 (SC-009) | `sql/20_verify.sql` 재실행 절차 | 파일 실존·구문(`bash -n` 대상 아님, SQL 키워드 확인) 일치 |
| §10,11 (SC-020/021) | `verification_runs.started_at/finished_at` 집계 | run.sh `do_go_nogo` 의 NFR-005 50분 로직(L195)과 계약의 "50분 이하" 판정 기준 일치 |
| §12 (SC-022) | 구조적 로그 파일 + `verification_runs` 양쪽 | run.sh `stage_run`(L75) + `lib/common.sh::log_line` 이중 기록 구조와 계약 서술 일치 |

**결론**: 옵션 A 12개 계약 전부 실제 4단계 산출물(T005 run.sh 확정 포함)과 명령·컬럼명·플래그가 정합한다. 거짓 green(레거시 접속 없이 mock 으로 이 SC 들을 통과 처리)은 발견되지 않았다 — jest 테스트 코드 어디에도 SC-001/002/004/005/006/007/009(옵션A 부분)/016/020/021/022 를 대상으로 하는 자동 assert 가 없음을 `grep`으로 확인했다(§F 위 SC 매핑 표 참조, "옵션A-계약검증" 항목은 모두 자동 테스트 파일·함수 컬럼이 비어 있음).

---

## STALE_SC 경고

검출 대상: `apps/backend/test/static/migration-mapping.spec.ts`·`migration-config.spec.ts`·`migration-runbook.spec.ts`(본 spec 신규 작성, git diff 대상 3파일).

검출 결과: **0건**. 3개 파일의 SC 마커는 SC-003·005·007·008·009·010·011·012·013·014·015·017·018·019 로 전부 spec.md SC-001~022 범위 내이며, 전 SC 마커가 docstring 상단에 `(v1.1.0/020 spec)` 출처 주석을 동반한다(PATCH-016-01/018-01 준수). 선행 spec(001~019)의 SC 번호 잔존 없음 — 본 3개 파일은 신규 작성으로 §F 흡수·계승 대상이 아니다.
