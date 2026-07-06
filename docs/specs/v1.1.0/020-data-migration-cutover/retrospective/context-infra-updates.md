---
작성: Retrospective Agent
버전: v1.0
최종 수정: 2026-07-06
상태: 적용 완료 (main session — PATCH-CXT-020-01~06 전건 context.md/infra.md 적용, docs-change-logs 2026-07-06-001 기록)
---

# Context / Infra 갱신 패치: 020-data-migration-cutover

> 본 패치는 제안이며, main session 이 사용자 승인 후 적용한다. Retrospective Agent 는 context.md/infra.md 를 **직접 수정하지 않는다**.
> 각 PATCH-CXT 는 PROC-002(코드 기반 사실 검증)를 준수한다. 변경 부분만 포함(전면 재작성 금지).

## 목차

- [PATCH-CXT-020-01](#patch-cxt-020-01--contextmd--files-테이블-물리명-정정-file_assets--filesfiles)
- [PATCH-CXT-020-02](#patch-cxt-020-02--contextmd-6--레거시-이관-도구-미해결-전제조건)
- [PATCH-CXT-020-03](#patch-cxt-020-03--contextmd-6--스테이징-정리-미자동화-sec-020-01-medium)
- [PATCH-CXT-020-04](#patch-cxt-020-04--contextmd-6--감사로그-행위자-미기록-sec-020-02-medium)
- [PATCH-CXT-020-05](#patch-cxt-020-05--contextmd-6--이관-도구-성능-후속-개선-여지)
- [PATCH-CXT-020-06](#patch-cxt-020-06--inframd-8--컷오버-실행-인프라)

---

## PATCH-CXT-020-01 — context.md — files 테이블 물리명 정정 (file_assets → files.files)

- **대상 파일**: `/Users/krystal/workspace/doa/doa-next/.claude/docs/context.md`
- **대상 섹션**: §2 핵심 도메인 모듈 목록(L89) · §4 스키마 분리 구조(L190) · §4 실재 상태 문단(L193-194)
- **변경 내용** (3개 지점, file_assets 오표기 → 실측 물리명):
  1. **§2 L89** `file` 행: `파일 메타데이터·presign (file_assets)` → `파일 메타데이터·presign (files.files)`
  2. **§4 L190** 스키마 트리: `└── schema: files      (file_assets)` → `└── schema: files      (files.files)`
  3. **§4 L193-194** 실재 상태 문단: `files` 1(file_assets)` → `files` 1(files.files)` / `file_assets.ownerId` → `files.ownerId`(스키마 접두 유지 시 `files.files.ownerId`)
- **변경 근거**: GAP-020-02 (DB Design 발견, Docs 코드재검증). 물리 테이블명이 `file_assets` 로 오표기되어 향후 spec 작성자가 존재하지 않는 테이블명을 참조할 위험.
- **코드 검증 (PROC-002)**: `apps/backend/prisma/schema.prisma` L768-784 `model FileAsset` 직접 Read — **L782 `@@map("files")`, L783 `@@schema("files")` 확인**. 물리 테이블명은 확정적으로 `files.files`(스키마 `files` + 테이블 `files`). 본 spec 산출물(`MAPPING-SPEC.md`·`sql/*.sql`)은 이미 `files.files` 사용(정합) — context.md 문서만 낙후 상태. 텍스트↔코드 일치 확인 완료.
- **status**: 검토중 (코드 검증 완료)

---

## PATCH-CXT-020-02 — context.md §6 — 레거시 이관 도구 미해결 전제조건

- **대상 파일**: `/Users/krystal/workspace/doa/doa-next/.claude/docs/context.md`
- **대상 섹션**: §6 알려진 제약 및 기술 부채 (L231 표에 신규 행 additive)
- **변경 내용**: 신규 행 추가 —
  `| 레거시 데이터 이관 도구 미해결 전제조건 (GAP-020-03) | 실 이관 실행 전 반드시 해소되어야 할 구조적 잔존 전제 3종: (1) 레거시 실 DDL 전건 [TO-VERIFY](MAPPING-SPEC.md·extract.sh·queries/extract/*.sql.template 의 레거시측 컬럼·테이블·PK 타입 미확정, AWS RDS 파이프라인 밖·spec 옵션A 원칙) — 미해소 시 스크립트 실행 실패, (2) products.variants SKU 단위 1행 가정(레거시 product_options 분리 구조면 10_transform.sql 조인 추가 필요), (3) 레거시 소셜 로그인(카카오·구글·네이버) 대응 불명(014~016 신규 기능, 레거시 동등 기능 여부 [TO-VERIFY], 없으면 count baseline=0) | scripts/migration/ 이관 도구 실행 | 020-data-migration-cutover |`
- **변경 근거**: GAP-020-03 (Docs Agent, PATCH-A10 구조적 제약 발생 기준). 실 이관 실행 전 미해소 시 (1) 스크립트 실행 실패 (2) 상품 옵션 데이터 오변환 (3) 카운트 검증(SC-005) 기준선 오류. context.md §6 미기록 시 020 spec 재열람 없이는 전제조건 소실.
- **코드 검증 (PROC-002)**: 산출물 문서 레벨 제약(레거시 실 DDL 은 파이프라인 밖이라 코드 확정 불가 — 이것이 제약의 본질). 참조 산출물 존재 확인: `scripts/migration/MAPPING-SPEC.md`·`extract.sh`·`queries/extract/`(30 template) 는 Development/DB Design 산출물로 존재(git status untracked scripts/migration 42파일에 포함, CHANGES.md·pipeline-log 확인). [TO-VERIFY] 마커 방식은 constitution 정확성 원칙(추측 금지) 준수.
- **status**: 검토중

---

## PATCH-CXT-020-03 — context.md §6 — 스테이징 정리 미자동화 (SEC-020-01, Medium)

- **대상 파일**: `/Users/krystal/workspace/doa/doa-next/.claude/docs/context.md`
- **대상 섹션**: §6 알려진 제약 및 기술 부채 (신규 행 additive)
- **변경 내용**: 신규 행 추가 —
  `| 020 이관 도구 — 스테이징 정리 미자동화 (SEC-020-01, Medium) | migration_staging 스키마(29테이블, PII·결제 원본 포함)의 컷오버 후 정리(DROP SCHEMA migration_staging CASCADE)가 sql/00_staging_ddl.sql 주석에만 존재하고 RUNBOOK.md·run.sh 어디에도 체크포인트/자동화 없음. 명시적 GRANT/REVOKE 부재로 정리 전까지 기본 DB 롤 권한에 의존. 실 이관 시 정리 누락되면 프로덕션 Fly Postgres 에 PII·결제 데이터 무기한 잔류 위험 | scripts/migration/(RUNBOOK.md·run.sh) 실 이관 운영 | 020-data-migration-cutover |`
- **변경 근거**: GAP-020-06 / Security SEC-020-01 (Medium 위임, PROC-013-03). Medium 이상 미해결 보안 부채의 무추적 소실 방지 — 다음 spec 설계자가 워크플로우 ③(context.md 확인)에서 인지 가능하도록.
- **코드 검증 (PROC-002)**: Security Agent 보고(pipeline-log L563 + gaps.md GAP-020-06)에 근거. `sql/00_staging_ddl.sql` L9 주석에 DROP SCHEMA 존재·RUNBOOK/run.sh 미반영은 Security Agent 실측 확인분. Retrospective 는 Agent 정의 파일/타 단계 산출물 직접 재검증 대상 아님 — Security 실측 보고를 신뢰하되 프로젝트 특정 보안 사안이므로 전역 규칙 아닌 context.md 에 기록(PROC-013-03 원칙).
- **status**: 검토중

---

## PATCH-CXT-020-04 — context.md §6 — 감사로그 행위자 미기록 (SEC-020-02, Medium)

- **대상 파일**: `/Users/krystal/workspace/doa/doa-next/.claude/docs/context.md`
- **대상 섹션**: §6 알려진 제약 및 기술 부채 (신규 행 additive)
- **변경 내용**: 신규 행 추가 —
  `| 020 이관 도구 — 감사로그 행위자 미기록 (SEC-020-02, Medium) | migration_staging.verification_runs(감사 테이블, ADR-010/NFR-006)에 단계·시각·상태·detail 은 기록되나 실행 행위자(운영자 계정·Fly machine ID) 식별 필드 없음. ADR-008 금전 레코드 직접 삽입(런타임 결제경로 우회)의 '누가 실행했는지' 축이 스키마 레벨에서 확인 불가 — 컷오버 사고 조사 시 DB 접속 로그까지 내려가지 않으면 실행 주체 특정 불가. 권고: verification_runs 에 actor 컬럼 추가 후 run.sh stage_run() INSERT 반영 | scripts/migration/(verification_runs·run.sh) | 020-data-migration-cutover |`
- **변경 근거**: GAP-020-07 / Security SEC-020-02 (Medium 위임, PROC-013-03).
- **코드 검증 (PROC-002)**: Security Agent 보고(pipeline-log L563 + gaps.md GAP-020-07)에 근거. verification_runs 컬럼(phase·step·target_table·status·detail·started_at·finished_at)은 test-report.md L50·coverage.md L63 에서 5b 가 `00_staging_ddl.sql` DDL 실측으로 확인한 목록과 일치 — actor 필드 부재 확정. Medium 보안 사안으로 context.md 기록(PROC-013-03).
- **status**: 검토중

---

## PATCH-CXT-020-05 — context.md §6 — 이관 도구 성능 후속 개선 여지

- **대상 파일**: `/Users/krystal/workspace/doa/doa-next/.claude/docs/context.md`
- **대상 섹션**: §6 알려진 제약 및 기술 부채 (신규 행 additive, GAP-020-08 Medium + GAP-020-09 Low 통합)
- **변경 내용**: 신규 행 추가 —
  `| 020 이관 도구 — 성능 후속 개선 여지 (GAP-020-08 Medium·GAP-020-09 Low, 비블로킹) | (1) 18개 레거시 서비스(독립 RDS) 추출·적재가 for_each_legacy_service bash 루프로 완전 순차 실행 — 서비스 간 자원 경합 없어 병렬화(백그라운드 &+wait, 동시성 상한) 시 총 소요 Σ→max 단축 가능(NFR-001/005 여유율 확보 최대 레버리지). (2) 20_verify.sql §(c) checksum 이 ORDER BY random() LIMIT n(전체 정렬 anti-pattern) — TABLESAMPLE 대체 권고. 둘 다 아키텍처 결함 아님(옵션A PRE-ASSESSMENT 게이트가 사전 초과 감지) | scripts/migration/(run.sh·20_verify.sql) 실 이관 성능 | 020-data-migration-cutover |`
- **변경 근거**: GAP-020-08/09 / Performance Agent (Medium·Low 위임, PROC-013-03). 후속 개선 항목으로 추적 유지 — 실 이관 리허설 시 병렬화가 윈도우 여유율 확보의 최대 레버리지.
- **코드 검증 (PROC-002)**: Performance Agent 보고(pipeline-log L583-591 + gaps.md GAP-020-08/09)에 근거. `run.sh` `for_each_legacy_service`(L65-78) 순차 처리·`20_verify.sql` §(c) `ORDER BY random() LIMIT` 패턴은 Performance Agent 가 Read 로 실측한 항목. 성능 권고사항으로 context.md §6 기록.
- **status**: 검토중

---

## PATCH-CXT-020-06 — infra.md §8 — 컷오버 실행 인프라

- **대상 파일**: `/Users/krystal/workspace/doa/doa-next/.claude/docs/infra.md`
- **대상 섹션**: §8 알려진 인프라 제약 (L202 표에 신규 행 additive)
- **변경 내용**: 신규 행 추가 —
  `| 컷오버 실행 인프라 (020) | 데이터 이관 컷오버 시 Fly.io one-off machine 러너(전용 경량 이미지 scripts/migration/Dockerfile — postgres:16-alpine 베이스, bash·psql·pg_dump·curl 포함, GAP-020-05 해소)가 레거시 18개 서비스별 RDS PostgreSQL 에 TLS(sslmode=require) read-only 로 접속(ADR-001/002/003) — 본 프로젝트에 없던 신규 외부 연동이며 컷오버 실행 시에만 일시 존재. 운영 임계값: 유지보수 윈도우 ≤60분(NFR-001)·검증+GO/NO-GO 판단 ≤50분(NFR-005, 윈도우 종료 전 최소 10분 롤백 여유). min_machines_running=1 컷오버 당일 상향(콜드 스타트 회피, RUNBOOK §1) | 컷오버 실행 환경·레거시 RDS 연동 | 020-data-migration-cutover |`
  - 기존 "Fly Postgres 단일 장애점" 행(L204)의 "로드맵 6단계(컷오버) 이전 결정" 문구는 020 이 HA 여부를 강제하지 않았으므로(spec 범위 외) **그대로 유지**.
- **변경 근거**: GAP-020-04 (Docs Agent, PATCH-A09 infra.md 갱신 기준 — 신규 외부 연동 + 신규 운영 임계값). GAP-020-05 해소(전용 러너 이미지) 반영.
- **코드 검증 (PROC-002)**: `scripts/migration/Dockerfile`(T014, postgres:16-alpine + curl) 는 Development 재작업 산출물이며 Deploy Agent 가 재검증에서 `docker build` 성공 + `which bash psql pg_dump curl` 4종 실측 확인(pipeline-log L541, gaps.md GAP-020-05 RESOLVED). sslmode=require 는 `config.example.env`·`lib/common.sh assert_sslmode_require`(ADR-009) 로 강제 — Deploy Y1(L462)·Security(L563) 확인분. NFR-001(60분)/NFR-005(50분)는 spec.md 확정 임계값. 실측 근거 정합.
- **status**: 검토중
