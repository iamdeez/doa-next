---
작성: Performance Agent
버전: v1.0
최종 수정: 2026-07-06 15:25
상태: 확정
---

# 성능 측정 및 최적화 결과: 022-legacy-file-binary-migration

## 목차

- [검토 범위](#검토-범위)
- [Constitution 성능 원칙 조항 이행 현황](#constitution-성능-원칙-조항-이행-현황)
- [성능 목표](#성능-목표)
- [Baseline 측정 결과 (예산 모델)](#baseline-측정-결과-예산-모델)
- [병목 지점 분석](#병목-지점-분석)
- [최적화 적용 내역](#최적화-적용-내역)
- [최종 측정 결과](#최종-측정-결과)
- [미달성 항목 및 사유](#미달성-항목-및-사유)
- [회귀 테스트 결과](#회귀-테스트-결과)

---

## 검토 범위

**대상**(DIFF-022 변경분 중 성능 관련 파일):

- `scripts/migration/files-migrate.sh` — `precheck`/`precopy`/`delta`/`verify`/`url-update` 서브커맨드의 rclone 호출 파라미터(동시성·재시도·타임아웃)
- `scripts/migration/FILE-PRE-ASSESSMENT.md` — 예상 소요 산정 방법론(FR-009)
- `scripts/migration/FILE-MIGRATION-RUNBOOK.md` §4 — 020 컷오버 60분 윈도우 통합 체크포인트
- `scripts/migration/config.example.env` — `RCLONE_TRANSFERS`/`RCLONE_RETRIES` 등 성능 관련 설정 슬롯

**제외**: `apps/backend/src`·`prisma`(DIFF 상 변경 0건, research.md "영향 범위 분석"에서 무변경 확인), 020 DB 전용 파일(`run.sh`·`extract.sh`·`load.sh`, 022 무변경).

**측정 방법의 근본적 제약**: 레거시 AWS S3 실 버킷·객체 규모·네트워크 대역폭은 파이프라인 밖 사용자 환경에 있다(FR-008, 옵션 A). 따라서 본 보고서는 **실측이 아닌 정적 코드 분석 기반 예산 모델·병목 식별**을 수행한다(team-lead 지시와 일치). 실측치는 사용자의 precheck/리허설 실행 결과로 FILE-PRE-ASSESSMENT.md에 별도 채워진다.

---

## Constitution 성능 원칙 조항 이행 현황

`.claude/docs/constitution.md`에는 전용 "성능" 조항(P-XXX)이 없다(P-001 모듈경계·P-002 AWS금지·P-003 단일DB·P-004 클라우드중립·P-005 결제정산·P-006 테스트·P-007 스펙범위). spec.md의 NFR-001(≤60분)·NFR-002(무제약)는 구체적 수치로 명시되어 있어 모호하지 않으므로, `agent-rules.md §9`의 [NEEDS CLARIFICATION] 후보 도출 절차(PROC-020-02)는 해당 없음 — spec.md NFR을 판정 기준으로 직접 사용한다.

| 조항 | 관련성 | 이행 여부 |
|---|---|---|
| P-002 (AWS 의존 금지) | 간접 — `rclone`이 vendor-neutral S3 호환 클라이언트로 처리량 결정에 영향 | 이행 (Security 보고서 교차확인) |
| P-004 (클라우드 중립) | 간접 — 성능 튜닝이 특정 벤더 API에 결합되지 않음 | 이행 |
| P-007 (스펙 범위) | 성능 개선은 spec.md 범위(파일 이관 스크립트) 내로 한정 | 이행 |

---

## 성능 목표

| PERF-ID | NFR/FR-ID | 목표값 | 측정 방법 |
|---|---|---|---|
| PERF-001 | NFR-001 | 컷오버 윈도우 내 최종 델타 파일 이관(`delta`+`verify`+`url-update`) 소요 ≤ 60분(020 DB 델타와 합산) | 사용자 리허설/실행 로그의 `verification_runs.detail.elapsed_sec` 합산 (SC-011, [env:e2e-db], 옵션 A) |
| PERF-002 | NFR-002 | 사전 대량 복사(`precopy`) 단계는 시간 상한 없음 — 전체 상한 강제 로직 0건 | 정적 검증: `--max-duration` 등 전체 작업 상한 플래그 부재 확인 (SC-012, 이미 파이프라인 내 자동 통과) |
| PERF-003 | FR-009 | 사전평가(`precheck`)가 레거시 총 개수·총 용량·예상 소요 3항목을 실측/산정 | precheck-report.json 필드 존재 + FILE-PRE-ASSESSMENT.md §1 파일럿 방법론 검토 (SC-009) |

---

## Baseline 측정 결과 (예산 모델)

실측 불가(옵션 A) 전제 하에, 코드·문서에서 확인 가능한 예산 모델 구성요소를 검토했다.

| PERF-ID | 정적 확인 결과 | 목표 달성 여부(구조적 판정) |
|---|---|---|
| PERF-001 | `do_delta()`가 매 실행마다 `files.files WHERE status='UPLOADED'` **전건**을 재추출하여 `rclone copy --checksum`에 재제출한다(ADR-003, 멱등 skip 의존). 실 전송 바이트는 precopy 이후 신규분(gap)에 한정되나, **스킵 여부 판정 자체(체크 오버헤드)는 전체 UPLOADED 코퍼스 크기에 비례**한다(하단 "병목 지점 분석" ①). | **구조적으로 PASS 가능하나 규모 의존적 리스크 존재** — 소규모~중규모 코퍼스(수만 건)에서는 60분 이내 여유, 대규모(수십만~수백만 건) 코퍼스에서는 체크 오버헤드만으로 윈도우를 위협할 수 있음(정량 실측 불가, 리허설로 확인 필요) |
| PERF-002 | `run_copy_pass()`(precopy/delta 공통 함수) 및 `rclone check` 호출 전체에서 `--max-duration`·`--timeout` 계열 전체 상한 플래그 grep 결과 0건 (`grep -n "max-duration\|timeout" scripts/migration/files-migrate.sh` → 매치 없음) | **PASS** — SC-012 요구사항과 정확히 일치, 무제약 원칙 코드 레벨 보장 |
| PERF-003 | `do_precheck()`가 `files_files_uploaded_count`·`legacy_bucket_object_count`·`legacy_bucket_total_bytes` 3필드를 리포트에 기록(FR-009 3항목 충족). 단 "예상 소요" 필드는 precheck 리포트에 직접 산출되지 않고 FILE-PRE-ASSESSMENT.md §1의 **수동 파일럿 측정**(1,000개 객체 샘플 precopy 실행 후 처리량 역산)에 위임됨 | **PASS(방법론 존재)** — 단 하단 "병목 지점 분석" ②에서 파일럿 방법론 자체의 정확도 리스크를 지적 |

---

## 병목 지점 분석

### ① [구현 수준] `delta` 재검증 오버헤드가 "델타 크기"가 아닌 "전체 코퍼스 크기"에 비례 (NFR-001 리스크)

- **위치**: `files-migrate.sh` `do_delta()`(L242-247) → `run_copy_pass()`(L182-235) → `rclone copy --files-from "$keylist" --checksum`(L194-201) + `detect_failed_keys()`(L111-116, `rclone lsf --files-from`).
- **원인**: `do_delta()`는 매 실행마다 `files.files WHERE status='UPLOADED'` **전건**을 `KEY_LIST_FILE`로 재추출하여 `rclone copy`에 통째로 재제출한다(ADR-003 설계 — `updatedAt` 부재로 워터마크 증분이 불가하므로 의도된 선택). `rclone`이 `--files-from`로 제한된 대상에 대해 스킵 여부를 판정하려면 (a) `--checksum` 지정 시 목적지 객체의 해시(ETag)를 개별 조회해야 하고, (b) `--files-from`는 rclone의 `--no-traverse` 동작을 암묵 적용하여 디렉터리 전체 목록화 대신 **파일 단위 개별 존재확인 호출**로 처리되는 것이 rclone의 알려진 특성이다. 즉 실제 전송 바이트는 precopy 이후 신규분(gap)에 한정되지만, **스킵 여부를 판정하는 체크 연산 자체는 전체 UPLOADED key 집합 크기(N)에 선형 비례**한다.
- **왜 아키텍처 수준 재설계 대상이 아닌가**: 이 선택(ADR-003)은 `updatedAt` 부재라는 스키마 제약 하에서 Design/Planning이 이미 근거를 명시하고 채택한 전략이며, plan.md ASM-004 안전망이 "실 전송량"이 구조적으로 작음을 보장한다 — 다만 **체크 연산 자체의 소요**는 별도 항목으로 예산화되지 않았다는 것이 이번에 새로 식별된 구현 수준 공백이다. 재구조화 없이 `--checkers` 동시성 튜닝과 사전평가 방법론 보강만으로 완화 가능하므로 구현 수준 병목으로 분류한다.
- **영향**: 레거시 코퍼스가 대규모(예: 수십만~수백만 건)인 경우, precopy 이후 실제 신규 업로드가 소량이어도 `delta` 단계가 전체 코퍼스에 대한 체크만으로 60분 예산의 상당 부분을 소진할 수 있다.

### ② [구현 수준] FR-009 파일럿 측정 방법론이 "전송 처리량"과 "체크(스킵 판정) 처리량"을 구분하지 않음

- **위치**: `FILE-PRE-ASSESSMENT.md` §1-2 ("소규모 샘플(예: 1,000개 객체)로 `precopy`를 1회 실행하여 소요 시간을 측정하고, 이를 근거로 전체 예상 소요를 산정한다").
- **원인**: 이 파일럿은 **최초 1회 실행되는 `precopy`**를 대상으로 한다 — 이 시점에는 목적지(R2)에 아무 객체도 없으므로 표본 1,000건 전부가 "신규 전송"이며, 측정되는 처리량은 순수 **전송(PUT) 처리량**이다. 그러나 `delta` 단계의 실제 부하 특성은 "이미 복사된 객체에 대한 스킵 판정(체크) + 소수 신규 객체 전송"의 혼합이다 — ①에서 식별한 체크 오버헤드(개별 존재확인/해시조회, 통상 PUT보다 가볍지만 0은 아님)가 델타 소요 추정에 반영되지 않는다. `precopy` 파일럿 처리량(객체/초)을 그대로 `delta` 예상 소요 산정에 사용하면(§1-3 "델타 예상 소요는... 별도 산정한다"고는 명시했으나 구체적 파일럿 방법이 precopy 재실행 외에 없음), **체크 전용 오버헤드가 과소평가되어 NFR-001 위협을 사전평가 단계에서 놓칠 위험**이 있다.
- **영향**: FR-007/NFR-001 안전망(사전평가 게이트)의 실효성이 낮아진다 — 대규모 코퍼스에서 실제 컷오버 시점에야 델타 소요 초과가 드러날 수 있다.

### ③ [구현 수준, 경미] retry 패스에서 `--transfers` 설정 누락 (일관성 결여)

- **위치**: `run_copy_pass()`의 1차 복사(L194-201)는 `--transfers "${RCLONE_TRANSFERS:-8}"`를 명시하나, 재시도 복사(L210-216)는 동일 플래그를 생략하여 rclone 내장 기본값(4)으로 암묵 축소된다.
- **원인**: 코드 복제 시 누락된 것으로 보이는 단순 불일치. 잔존 실패 건수가 많은 경우(대량 실패 시나리오) 재시도 처리량이 운영자가 `config.env`에 설정한 값의 절반으로 저하된다.
- **영향**: 통상 실패 건수가 적어(FR-006 부분성공 전제) 미미하나, ASM-002(key 비호환) 등으로 실패가 대량 발생하는 예외 시나리오에서는 재시도 구간이 예상보다 느려질 수 있다.

### ④ [구현 수준, 경미] `--checkers` 동시성 플래그 미설정 (전 구간)

- **위치**: `run_copy_pass()`·`detect_failed_keys()`·`count_present_in_r2()`·`do_verify()` 전체에서 `--checkers`(비교/존재확인 동시성, `--transfers`와 별개) 플래그가 한 번도 지정되지 않아 rclone 기본값(8)으로 고정된다.
- **원인**: `RCLONE_TRANSFERS`(전송 동시성)는 `config.example.env`에 노출된 튜닝 슬롯이 있으나, ①에서 식별한 체크 오버헤드를 완화할 수 있는 `--checkers`(체크 동시성) 슬롯은 존재하지 않는다.
- **영향**: ①의 리스크가 실현되는 대규모 코퍼스 시나리오에서, 운영자가 체크 동시성을 올려 체크 오버헤드를 단축할 튜닝 수단 자체가 스크립트에 없다.

---

## 최적화 적용 내역

**본 Agent는 코드 수정을 적용하지 않았다.** `files-migrate.sh`·`FILE-PRE-ASSESSMENT.md`는 Development Agent(4단계)의 산출물이며 `agent-rules.md §3.1`("다른 단계의 산출물을 생성·수정하거나 수정한다" MUST NOT)에 따라 Performance Agent가 직접 수정하지 않는다. 동일 022 사이클의 Security Agent도 동형 판단(구체적 수정 위치를 특정했으나 SEC-022-01/02를 OPEN + "수정 방향"으로 보고, 직접 편집하지 않음)을 선례로 따른다.

| PERF-ID / 병목 | 권고 수정 방향 | 적용 파일(권고 대상) | Constitution 준수 |
|---|---|---|---|
| ① 델타 체크 오버헤드 | `run_copy_pass()`·`detect_failed_keys()`·`count_present_in_r2()`의 rclone 호출에 `--checkers "${RCLONE_CHECKERS:-8}"` 추가(기본값 8 = rclone 자체 기본값과 동일하므로 미설정 시 동작 불변 — 순수 additive 튜닝 슬롯) + `config.example.env`에 `RCLONE_CHECKERS` 슬롯 추가(기존 `RCLONE_TRANSFERS` 패턴과 동형) | `files-migrate.sh`, `config.example.env` | P-007 준수(스크립트 범위 내), 임의 기준 아님(rclone 기본값 유지, 추가 전용) |
| ② 파일럿 방법론 공백 | `FILE-PRE-ASSESSMENT.md` §1에 "델타 재검증(체크 위주) 처리량" 2차 파일럿 항목 추가 — precopy 완료된 소규모 샘플(예: 이미 복사된 1,000건)에 대해 `delta`를 1회 재실행하고 소요 시간을 측정하여, 이를 근거로 "체크 처리량(건/초)"을 별도 산정. 델타 예상 소요 = `(전체 UPLOADED 건수 / 체크 처리량) + (신규 gap 건수 / 전송 처리량)` | `FILE-PRE-ASSESSMENT.md` §1-2/§1-3 | FR-009 범위 내 방법론 보강, 신규 SC 요구 아님 |
| ③ retry `--transfers` 누락 | 재시도 `rclone copy` 호출(L210-216)에도 1차와 동일하게 `--transfers "${RCLONE_TRANSFERS:-8}"` 추가 | `files-migrate.sh` | 기존 설정값 재사용, 신규 기준 도입 아님 |

> 위 3건은 Docs/Retrospective 단계(패치 목록) 또는 후속 patch spec으로 반영을 권고한다(`agent-rules.md §12` 패치 적용 절차 — main session이 사용자 승인 후 적용).

---

## 최종 측정 결과

옵션 A(사용자 실행) 전제로 파이프라인 내 재측정이 불가하다. 사용자가 리허설(dry-run, plan.md PROC-014·런북 §6 권고)을 실행한 결과값을 FILE-PRE-ASSESSMENT.md §2에 채운 뒤, 아래 GO 게이트로 최종 판정한다.

| PERF-ID | GO 게이트 |
|---|---|
| PERF-001 | 리허설 `delta`+`verify`+`url-update` 누적 elapsed_sec ≤ 60분 − (020 DB 델타 소요) |
| PERF-002 | (자동 충족, 코드 레벨 강제 없음 확인 완료) |
| PERF-003 | precheck-report.json 3필드 존재 + 파일럿 처리량 산정값 기재 완료 |

---

## 미달성 항목 및 사유

- **PERF-001 정량 실측 불가**: 레거시 실 코퍼스 규모(ASM-004, [TO-VERIFY])가 파이프라인에서 접근 불가하므로, 60분 예산 내 확정 PASS/FAIL 판정은 사용자 리허설 결과 도래 전까지 유보한다. 위 "병목 지점 분석 ①·②"가 지적한 리스크는 리허설 시나리오에 반드시 포함되어야 한다 — 특히 리허설 표본이 "이미 복사된 대량 건수"를 포함해야 체크 오버헤드가 노출된다(순수 신규 표본만으로는 ①의 리스크가 드러나지 않음, 런북 §6 "리허설 권고" 항목에 이 관점 보강 필요).

---

## 회귀 테스트 결과

코드 수정을 적용하지 않았으므로 회귀 테스트 대상 변경 없음. 기존 정적 테스트(`file-migration-script.spec.ts` 등 18건, DIFF-022 기준 전건 PASS 확인됨 — Test Agent 5b 산출물)에 영향 없음.
