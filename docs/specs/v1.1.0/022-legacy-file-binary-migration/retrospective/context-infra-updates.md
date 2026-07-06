---
작성: Retrospective Agent
버전: v1.0
최종 수정: 2026-07-06 16:01
상태: 적용 완료 (사용자 승인 '적용해', main session 적용 — docs-change-logs/2026-07-06-002.md)
---

# Context / Infra 갱신 패치안: 022-legacy-file-binary-migration

> 본 문서는 **후보 패치**다. Retrospective Agent 는 `context.md`·`infra.md`·`RUNBOOK.md` 를 직접 수정하지 않는다
> (`agent-rules.md §3.1`·07-retrospective [MUST NOT]). main session 이 사용자 승인 후 적용한다.
> 각 PATCH-CXT 는 PROC-002(코드 기반 사실 검증)를 적용했다.

## 목차

- [요약](#요약)
- [PATCH-CXT-001: infra.md §8 — 컷오버 실행 인프라 행 rclone 반영 (GAP-022-03)](#patch-cxt-001-inframd-8--컷오버-실행-인프라-행-rclone-반영-gap-022-03)
- [PATCH-CXT-002: context.md §6 — SEC-020-01/02 022 상속 각주 (GAP-022-02·PROC-013-03)](#patch-cxt-002-contextmd-6--sec-020-0102-022-상속-각주-gap-022-02proc-013-03)
- [PATCH-CXT-003: context.md §6 — SEC-022-01/02 Medium 신규 등재 (PROC-013-03)](#patch-cxt-003-contextmd-6--sec-022-0102-medium-신규-등재-proc-013-03)
- [PATCH-CXT-004: context.md §6 — 022 파일 이관 성능 후속개선 여지 (backlog)](#patch-cxt-004-contextmd-6--022-파일-이관-성능-후속개선-여지-backlog)
- [PATCH-DOC-001: RUNBOOK.md — 022 파일 바이너리 이관 교차참조 (GAP-022-04)](#patch-doc-001-runbookmd--022-파일-바이너리-이관-교차참조-gap-022-04)

---

## 요약

| 패치 | 대상 | 유형 | 근거 GAP | 사용자 결정 |
|---|---|---|---|---|
| PATCH-CXT-001 | `.claude/docs/infra.md §8` | 기존 행 수정 | GAP-022-03 | 적용 권고 |
| PATCH-CXT-002 | `.claude/docs/context.md §6` | 기존 2행 각주 추가 | GAP-022-02 | 적용 권고 |
| PATCH-CXT-003 | `.claude/docs/context.md §6` | 신규 1행 | PROC-013-03 (SEC-022-01/02 Medium OPEN) | 기록만(수정 보류) — backlog |
| PATCH-CXT-004 | `.claude/docs/context.md §6` | 신규 1행 | Performance 경미 3건·delta 규모의존 | 기록만(수정 보류) — backlog |
| PATCH-DOC-001 | `scripts/migration/RUNBOOK.md` | 교차참조 1~2줄 | GAP-022-04 | 기록만(수정 보류) — 후속 patch 후보 |

> **context.md §1 현재 버전**: v1.1.0 유지(patch 내 차수, 버전 미변경) — §1 갱신 불요.
> **context.md §7 갱신 이력**: PROC-R02 원칙에 따라 이력/changelog 성 행 추가는 본 회고에서 제안하지 않는다(변경 추적 SoT = git history + docs-change-logs). 단 main session 이 프로젝트 관례상 §7 을 유지·갱신하기로 결정하면 022 행 추가는 main 판단에 위임한다.

---

## PATCH-CXT-001: infra.md §8 — 컷오버 실행 인프라 행 rclone 반영 (GAP-022-03)

- **대상 파일**: `/Users/krystal/workspace/doa/doa-next/.claude/docs/infra.md`
- **대상 섹션**: §8 알려진 인프라 제약 — "컷오버 실행 인프라 (020)" 행 (현재 L222)
- **변경 내용**:
  - "bash·psql·pg_dump·curl 포함, GAP-020-05 해소" → **"bash·psql·pg_dump·curl·rclone(022 — 레거시 S3↔R2 오브젝트 복사) 포함, GAP-020-05 해소"**
  - "관련 spec" 열: `020-data-migration-cutover` → **`020-data-migration-cutover · 022-legacy-file-binary-migration`**
  - (선택) 행 내용에 "022 는 이 러너에 `rclone` 을 추가해 `files-migrate.sh`(precheck/precopy/delta/verify/url-update) 로 파일 바이너리를 레거시 S3 → R2 로 서버간 복사한다(신규 별도 이미지 없음, FR-010/ADR-002)" 한 문장 additive 추가.
- **변경 근거**: GAP-022-03 — infra.md §8 이 러너 도구 목록에 022 신규 추가 `rclone` 을 반영하지 못함. 다음 spec 설계자가 워크플로우 ④(infra.md 확인)에서 컷오버 러너의 실제 도구 구성을 정확히 인지하도록 한다.
- **코드 검증 (PROC-002)**: `scripts/migration/Dockerfile` **L30** `RUN apk add --no-cache curl rclone` 실측 확인 — 020 원본은 `curl` 만 포함(주석 L25 "curl 은 run.sh 의 트래픽전환 후 스모크 GET /health 용"), L26-29 주석이 `rclone` 은 022 파일 바이너리 이관용임을 명시. 변경 후 텍스트가 코드 사실과 일치.

---

## PATCH-CXT-002: context.md §6 — SEC-020-01/02 022 상속 각주 (GAP-022-02·PROC-013-03)

- **대상 파일**: `/Users/krystal/workspace/doa/doa-next/.claude/docs/context.md`
- **대상 섹션**: §6 알려진 제약 및 기술 부채 — "020 이관 도구 — 스테이징 정리 미자동화 (SEC-020-01)" 행(현재 L259) + "020 이관 도구 — 감사로그 행위자 미기록 (SEC-020-02)" 행(현재 L260)
- **변경 내용** (각 행 "내용" 열 말미에 additive 각주):
  - **SEC-020-01 행**: 말미에 "**(022 재평가)** 022 는 `verification_runs`(카운트·상태만) 만 재사용하고 `migration_staging` 에 신규 raw PII/결제 테이블을 추가하지 않아 본 부채를 **악화시키지 않음**(Security CONFIRMED). 데이터 범위 확장 0건." 추가.
  - **SEC-020-02 행**: 말미에 "**(022 상속)** 022 `files-migrate.sh::stage_run()` 도 동일 INSERT 패턴(행위자 필드 없음) 복제 — 미해소 승계. 파일 이관은 레거시 S3 read+R2 write+DB write **3중 자격증명**을 단일 실행 컨텍스트에서 취급하므로 사고 시 책임추적 분모가 넓어지나, 단일 운영자 순차 실행 전제 + `url-update` 는 verify GO 이후에만 실행되는 절차적 게이트로 오사용 여지가 좁혀져 **Medium 유지**(심각도 재상향 근거 없음)." 추가.
- **변경 근거**: GAP-022-02 재평가 결과(security-report.md §GAP-022-02 재평가 + §권고 4) 의 PROC-013-03 위임 — 위임된 Medium 이상 미해결 보안부채의 context §6 등재·후속 인지 확보. 신규 GAP 번호 불요(020 스코프 기존 행에 additive).
- **코드 검증 (PROC-002)**: `files-migrate.sh` **L55** `load_migration_config`(카운트/상태만 기록하는 `verification_runs` 재사용) 확인, `stage_run` 이 020 `run.sh` 패턴 복제(행위자 필드 부재)는 security-report.md L92-99 line-level 검증과 정합. `migration_staging` 신규 raw 테이블 추가 0건은 research.md "데이터 모델" 절 확인.

---

## PATCH-CXT-003: context.md §6 — SEC-022-01/02 Medium 신규 등재 (PROC-013-03)

- **대상 파일**: `/Users/krystal/workspace/doa/doa-next/.claude/docs/context.md`
- **대상 섹션**: §6 알려진 제약 및 기술 부채 — 신규 1행 추가(020 부채 행 인근)
- **변경 내용** (신규 행):

  | 항목 | 내용 | 영향 범위 | 관련 spec |
  |---|---|---|---|
  | 022 파일 이관 도구 — 전송 TLS 런타임 강제 후퇴 (SEC-022-01/02, Medium) | `files-migrate.sh` 가 020 자매 스크립트(`extract.sh`/`load.sh`)와 달리 `assert_sslmode_require` 미호출(PGSSLMODE non-empty 만 검증) → 오설정 시 NFR-004/SC-014 방어 후퇴(SEC-022-01). `LEGACY_S3_ENDPOINT` 의 `https://` 스킴 런타임 미검증(R2_ENDPOINT 는 코드레벨 https 강제 대비, SEC-022-02). 둘 다 `config.example.env` 기본값(PGSSLMODE=require·https 주석) 사용 시 무해 — misconfiguration 전제. 수정: `assert_sslmode_require \|\| exit 1` + `[[ "$LEGACY_S3_ENDPOINT" == https://* ]]` 검증 추가 | `scripts/migration/files-migrate.sh` 실 이관 운영 | 022-legacy-file-binary-migration |

- **변경 근거**: PROC-013-03 — Security Agent 가 신규 발견한 Medium 2건(security-report.md §취약점 목록). 사용자 결정(Discord)으로 즉시 수정 보류·기록만 유지 → 다음 spec 설계자·실 이관 운영자가 인지하도록 context §6 등재. 무추적 소실 방지.
- **코드 검증 (PROC-002)**: `files-migrate.sh` grep 실측 — `assert_sslmode_require` **매치 0건**(L55 `load_migration_config` 만 존재, 020 `extract.sh` L66·`load.sh` L58 은 호출), **L59** `: "${LEGACY_S3_ENDPOINT:?...}"`(non-empty only), **L79** `R2_ENDPOINT="https://..."`(코드레벨 https 하드코딩), **L88** `export RCLONE_CONFIG_LEGACYS3_ENDPOINT="$LEGACY_S3_ENDPOINT"`(스킴 검증 없이 export). 변경 후 텍스트가 코드 사실과 일치.

---

## PATCH-CXT-004: context.md §6 — 022 파일 이관 성능 후속개선 여지 (backlog)

- **대상 파일**: `/Users/krystal/workspace/doa/doa-next/.claude/docs/context.md`
- **대상 섹션**: §6 알려진 제약 및 기술 부채 — 신규 1행(020 GAP-020-08/09 성능 후속개선 행 패턴 승계)
- **변경 내용** (신규 행):

  | 항목 | 내용 | 영향 범위 | 관련 spec |
  |---|---|---|---|
  | 022 파일 이관 도구 — 성능 후속개선 여지 (비블로킹, 경미) | (1) `do_delta()` 재검증 오버헤드가 "델타 크기"가 아닌 "UPLOADED 전체 코퍼스 크기(N)"에 선형 비례(`updatedAt` 부재로 워터마크 증분 불가, ADR-003 멱등 skip 의존) — 대규모 코퍼스 시 NFR-001 60분 예산 위협 가능(정량 실측은 리허설 대기). (2) `FILE-PRE-ASSESSMENT.md` 파일럿이 precopy(순수 전송) 처리량만 측정·delta(체크위주) 처리량 별도 미측정 → 사전평가 게이트가 리스크 과소평가 가능. (3) retry 패스 `--transfers` 누락(기본값4로 암묵 축소)·`--checkers` 동시성 튜닝슬롯 부재. 완화: `--checkers ${RCLONE_CHECKERS:-8}` additive 슬롯 + 파일럿 2차 측정 항목 추가(재구조화 불요) | `scripts/migration/files-migrate.sh`·`FILE-PRE-ASSESSMENT.md` 실 이관 성능 | 022-legacy-file-binary-migration |

- **변경 근거**: Performance Agent 핵심 발견(performance-report.md §병목 ①②③④). 아키텍처 수준 병목 아님(BLOCKED 미해당). 사용자 결정으로 즉시 수정 보류·backlog 기록.
- **코드 검증 (PROC-002)**: performance-report.md 정적 분석 — `grep -n "max-duration\|timeout" files-migrate.sh` → 매치 0건(SC-012 무제약 확인)·`run_copy_pass()` 1차 복사 `--transfers` 있음/재시도 복사 누락은 L194-201 vs L210-216 대조로 확인됨. `--checkers` 전 구간 미지정. 성능 리스크는 실측 불가(옵션 A)라 "규모 의존 가능성" 으로 기재(단정 회피).

---

## PATCH-DOC-001: RUNBOOK.md — 022 파일 바이너리 이관 교차참조 (GAP-022-04)

- **대상 파일**: `/Users/krystal/workspace/doa/doa-next/scripts/migration/RUNBOOK.md` (020 기완료 산출물)
- **대상 섹션**: §0 사전 공지 / §3 단계 2(최종 델타 이관)·단계 3(정합성 검증) / §5(검증 대상 범위 — file_assets 메타 vs 바이너리)
- **변경 내용** (교차참조 1~2줄 additive, 원 절차 무변경):
  - **§5 (가장 적합 — 메타 vs 바이너리 구분을 이미 다루는 절)**: "> **파일 바이너리 이관(022)**: `files.files` **메타데이터**는 020 이 이관하나, 실 파일 바이너리(오브젝트)는 022-legacy-file-binary-migration 이 별도 이관한다. 컷오버 윈도우 내 파일 델타/검증/url-update 절차는 [FILE-MIGRATION-RUNBOOK.md](FILE-MIGRATION-RUNBOOK.md) 참조 — DB 델타와 **동일 윈도우 내 병행** 실행하고, GO/NO-GO 는 DB 검증 + 파일 검증(022 SC-005/013) 양쪽 pass 로 판정한다." 추가.
  - **§3 단계 2·단계 3**: 각 단계 말미에 "파일 바이너리 델타/검증은 `FILE-MIGRATION-RUNBOOK.md §4` 병행 체크포인트 참조" 1줄 교차참조 추가.
- **변경 근거**: GAP-022-04 — 020 원본 `RUNBOOK.md` 에 022/file-migration/files-migrate 교차참조 0건(Deploy Agent grep 실측). 020 RUNBOOK.md 만 보고 컷오버를 실행하는 운영자가 파일 바이너리 이관 단계(precopy/delta/verify/url-update)의 존재 자체를 놓칠 운영 위험. 022 쪽은 `FILE-MIGRATION-RUNBOOK.md §4` 로 020→022 매핑을 이미 충족했으나 역방향(020→022) 참조가 부재.
- **코드 검증 (PROC-002)**: `scripts/migration/RUNBOOK.md` 실측 — §5 제목 "검증 대상 범위 — file_assets 메타 vs 바이너리"(L30) 존재 확인, `grep "022\|file-migration\|files-migrate" RUNBOOK.md` → 매치 0건(Deploy Agent deploy-report.md §컷오버 런북 통합 검토 실측과 정합).
- **처리 주의**: `RUNBOOK.md` 는 020 스펙 사이클 기완료 산출물이다. main session 이 사용자 승인 후 직접 적용하거나, 020 문서 정정을 다루는 후속 patch spec 으로 이관한다(agent-rules.md §3.1 — 타 spec 산출물 직접 수정 회피 원칙, GAP-022-03 과 동일 처리 근거).
