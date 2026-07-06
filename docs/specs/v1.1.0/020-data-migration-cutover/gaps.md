---
작성: Design Agent (최초 생성) / Database Design Agent (갱신) / Docs Agent (갱신) / Deploy Agent (갱신) / Security Agent (갱신) / Performance Agent (갱신)
버전: v1.6
최종 수정: 2026-07-05 23:19
상태: 누적 기록 중
---

# Gaps: 020-data-migration-cutover

> 이 파일은 3단계 Design Agent 가 최초 생성하며, 이후 모든 Agent 가 누적 기록한다.
> 형식: `pipeline-conventions.md §6`.

## 목차

- [GAP-020-01](#gap-020-01)
- [GAP-020-02](#gap-020-02)
- [GAP-020-03](#gap-020-03)
- [GAP-020-04](#gap-020-04)
- [GAP-020-05](#gap-020-05)
- [GAP-020-06](#gap-020-06)
- [GAP-020-07](#gap-020-07)
- [GAP-020-08](#gap-020-08)
- [GAP-020-09](#gap-020-09)

---

## GAP-020-01

- **유형**: 요구사항-공백 (기획 공백)
- **출처**: Design Agent
- **컨텍스트**: T001(매핑 명세 — DB Design) / research §델타 캡처 per-table 분류 (E) 부류
- **상태**: OPEN → DB Design Agent 위임 (매핑 명세에서 확정)
- **내용**: ephemeral 성격 테이블 4종의 **이관-vs-스킵/재발급 정책이 spec.md 에 명시되지 않았다**. FR-001("8개 스키마 전체")은 전수 이관을 함의하나, 아래 테이블은 이관 실익이 불명확하다:
  - `users.refresh_tokens`: 세션 토큰. 신규 시스템 JWT secret/검증 경로 하에서 레거시 refresh token 이 유효하지 않을 수 있음(재로그인으로 재발급 가능) → 스킵 후보.
  - `users.password_reset_otps`·`users.oauth_states`: TTL 10분 ephemeral(OTP·CSRF nonce). 컷오버 시점 대부분 만료·delete-on-consume → 스킵 후보.
  - `payments.payment_outbox`(pending): ADR-008 에 따라 컷오버 전 pending=0 드레인 → pending 이관 대상 없음(processed 이력 이관 여부만 결정 필요).
- **영향**: **SC-005("모든 대상 테이블 레코드 수 100% 일치")의 "대상 테이블" 집합 정의에 직결**. 위 테이블을 스킵하면 대조 대상에서 제외되어야 하며, 이관하면 휘발성으로 인해 레코드 수 대조가 불안정할 수 있다.
- **권고**: DB Design Agent 매핑 명세(`MAPPING-SPEC.md`)에서 4종 테이블의 이관/스킵을 **명시 확정**하고, SC-005 "대상 테이블" 집합을 정의한다. 권고안 — refresh_tokens·password_reset_otps·oauth_states 스킵(재로그인/재발급), payment_outbox 는 processed 이력만(pending 제외) 또는 스킵.
- **해결 조건**: DB Design 매핑 명세에 4종 정책 명시 + tasks T001 완료기준 "ephemeral 정책 명시" 충족 시 `RESOLVED by Database Design Agent`.
- **RESOLVED by Database Design Agent** (`scripts/migration/MAPPING-SPEC.md` §2): 4종 전부 **이관 스킵** 확정 — `refresh_tokens`·`password_reset_otps`·`oauth_states`(TTL 짧은 세션/OTP/CSRF, 재로그인·재발급으로 흡수)·`payment_outbox`(ADR-008 pending=0 드레인 전제, processed 이력도 이관 실익 없어 전체 스킵). SC-005 "대상 테이블" 집합을 33 - 4 = **29테이블**로 확정(§3).

---

## GAP-020-02

- **유형**: 코드-문서 불일치 (Codebase drift)
- **출처**: Database Design Agent
- **컨텍스트**: T001 매핑 명세 작성 중 `apps/backend/prisma/schema.prisma` 실측
- **상태**: OPEN (문서 정정은 본 spec 산출물 범위 밖 — 후속 Docs/Retrospective 단계에서 처리 필요)
- **내용**: `FileAsset` 모델의 실제 Prisma 매핑은 `@@map("files")`(`schema.prisma` L768-784) — 즉 물리 테이블명은 **`files.files`**다. 그러나 `context.md §4`("schema: files (file_assets)")·`plan.md`·`research.md`가 모두 `file_assets`로 표기하고 있어 코드-문서 불일치가 존재한다.
- **영향**: 검증 SQL·매핑 명세가 문서 표기(`file_assets`)를 그대로 따랐다면 존재하지 않는 테이블을 참조하는 오류가 발생했을 것. 본 spec 산출물(`MAPPING-SPEC.md`·`sql/*.sql`)은 실측 물리 테이블명(`files.files`)을 사용하여 이 문제를 회피했다(§1 발견사항).
- **권고**: `context.md §4` 갱신 시(spec 완료 후 정례 갱신) `files.file_assets` → `files.files`로 정정. 사소하지만 향후 spec 작성자가 동일 오표기를 반복하지 않도록 반영 필요.
- **해결 조건**: `context.md §4` 정정 완료 시 `RESOLVED`.
- **Docs Agent 확인 (코드 검증, PROC-002)**: `apps/backend/prisma/schema.prisma` L768-784(`model FileAsset`)를 직접 Read 로 재확인 — L782 `@@map("files")`, L783 `@@schema("files")`. 물리 테이블명은 확정적으로 `files.files`다. `context.md` 정정 대상 3개 지점을 특정한다: (1) §2 핵심 도메인 모듈 목록 L89 `file` 행 — "파일 메타데이터·presign (file_assets)" → "(files.files)", (2) §4 스키마 분리 구조 L190 — `└── schema: files      (file_assets)` → `(files.files)`, (3) §4 실재 상태 문단 L193-194 — `files` 1(file_assets)"·"file_assets.ownerId" 2곳 → `files.files`·"files.ownerId"(또는 스키마 접두 유지 시 "files.files.ownerId"). 본 spec 산출물(`MAPPING-SPEC.md` §1·`sql/*.sql`)은 이미 실측 물리 테이블명을 사용해 정합하다 — 문서만 낙후 상태.
- **유형(재확인)**: 문서-갱신-필요 (context.md)
- **출처**: Database Design Agent (발견) / Docs Agent (코드 재검증·정정 지점 특정, 2026-07-05)
- **처리**: Retrospective Agent 가 위 3개 지점을 `context.md` 패치로 제안 → main session 경유 사용자 승인 후 적용.

---

## GAP-020-03

- **유형**: 문서-갱신-필요 (context.md §6 알려진 제약 및 기술 부채)
- **출처**: Docs Agent
- **컨텍스트**: 6단계 문서화 — 020 산출물(`scripts/migration/`) 이 `구조적 제약 발생`(PATCH-A10 기준)에 해당하는 미해결 전제조건을 다수 남긴 채 완료됨을 확인
- **상태**: OPEN (context.md 직접 수정은 본 Agent 권한 밖 — Retrospective Agent 위임)
- **내용**: 020 은 이관 도구·런북·매핑 명세를 산출했으나, 실제 이관 실행 전 반드시 해소되어야 하는 미결 전제조건이 코드/문서 레벨에 구조적으로 남아 있다. 향후 spec 작성자·운영자가 인지해야 할 항목이므로 `context.md §6` 신규 행 등록을 권고한다:
  1. **레거시 실 DDL 전건 `[TO-VERIFY]` 상태** — `scripts/migration/MAPPING-SPEC.md`(전 33테이블 매핑표)·`extract.sh`·`queries/extract/*.sql.template`(30개)의 레거시측 컬럼명·테이블명·PK 타입이 전부 `[TO-VERIFY]` 마커다(레거시 AWS RDS 접근이 파이프라인 밖에 있어 코드 기반 확정 불가, spec.md 옵션 A 원칙). 실제 이관 실행 전 사용자/오너의 레거시 실 스키마 대조가 선행되어야 스크립트가 정상 동작한다.
  2. **`products.variants` SKU 단위 1행 가정** (`MAPPING-SPEC.md` §8-3) — 레거시도 이미 SKU(옵션 조합) 단위 1행 구조라고 가정하고 1:1 매핑했다. 레거시가 `product_options`+`variant_option_values` 분리 구조라면 `sql/10_transform.sql`에 조인 추가가 필요(현재 미포함) — 가정이 틀리면 매핑 명세·변환 SQL 재작업 대상.
  3. **레거시 소셜 로그인 대응 불명** (`MAPPING-SPEC.md` §8-2) — 카카오·구글·네이버 소셜 로그인은 014~016(v1.1.0)에서 신규 도입된 기능으로, 레거시 AWS 시스템에 동등 기능이 있었는지 자체가 불명(`[TO-VERIFY]`). 없으면 이관 대상 0건(신규 기능, count baseline=0)으로 처리.
- **영향**: 위 3개 항목이 미해소 상태로 실 이관이 실행되면 (1)은 스크립트 실행 자체 실패, (2)는 상품 옵션 데이터 유실/오변환, (3)은 카운트 검증(SC-005) 기준선 오류로 이어질 수 있다. `context.md §6`에 기록되지 않으면 020 spec 문서를 재열람하지 않는 한 향후 작업자가 이 전제조건을 놓칠 위험이 있다.
- **권고**: `context.md §6`에 "레거시 데이터 이관 도구 미해결 전제조건" 행 신규 추가 — 위 3항목 요약 + 관련 spec `020-data-migration-cutover` 링크.
- **해결 조건**: `context.md §6` 신규 행 추가 완료 시 `RESOLVED`. 실 이관 실행 후 3항목이 실측으로 확정되면(사용자 옵션 A 결과 전달) 해당 항목 자체도 별도로 `RESOLVED` 처리 가능.

---

## GAP-020-04

- **유형**: 문서-갱신-필요 (infra.md)
- **출처**: Docs Agent
- **컨텍스트**: 6단계 문서화 — plan.md ADR-002/003/009, spec.md NFR-001/005 를 infra.md 기존 섹션과 대조
- **상태**: OPEN (infra.md 직접 수정은 본 Agent 권한 밖 — Retrospective Agent 위임)
- **내용**: 020 이 도입한 이관 러너는 PATCH-A09 infra.md 갱신 기준 중 2개 항목에 해당한다.
  1. **신규 외부 시스템 연동** — Fly.io one-off machine(타깃 Postgres 동일 리전 co-located, ADR-002)이 레거시 18개 서비스별 RDS PostgreSQL 에 `SELECT`/`\copy` read-only 로 접속(ADR-001/003). 이는 본 프로젝트에 없던 신규 외부 연동이며(기존 `infra.md §2` 토폴로지에는 레거시 AWS 연동 항목이 없음), 컷오버 실행 시에만 일시적으로 존재하는 실행 인프라다.
  2. **신규 운영 임계값 도입** — NFR-001(유지보수 윈도우 ≤60분)·NFR-005(FR-005 검증+GO/NO-GO 판단 ≤50분, 윈도우 종료 전 최소 10분 롤백 여유)는 컷오버 실행 시 운영자가 반드시 인지해야 할 시간 임계값이다. `infra.md §8`은 이미 "Fly Postgres 단일 장애점 — ... 로드맵 6단계(컷오버) 이전 결정"으로 020 을 선제적으로 참조하고 있으나, 020 완료로 확정된 임계값(60분/50분) 자체는 아직 반영되어 있지 않다.
- **영향**: infra.md 가 미갱신 상태면 향후 배포·인프라 관련 spec 작성자가 컷오버 실행 인프라(one-off 러너)·운영 임계값(60/50분)을 파악하지 못해 인프라 변경 시 컷오버 절차와 충돌할 수 있다(예: Fly Postgres 리전 변경, 네트워크 정책 변경).
- **권고**: `infra.md §8`(또는 신규 §5.1 "컷오버 실행 인프라")에 다음을 추가: (a) 컷오버 시 Fly one-off machine 러너가 레거시 18개 RDS 에 TLS(sslmode=require) read-only 접속하는 임시 연동 존재, (b) 유지보수 윈도우 60분(NFR-001)·검증+GO/NO-GO 판단 50분(NFR-005) 임계값, (c) 관련 spec `020-data-migration-cutover` 링크. 기존 "Fly Postgres 단일 장애점" 행의 "로드맵 6단계(컷오버) 이전 결정" 문구는 020 산출물이 HA 여부를 강제하지 않았으므로(spec.md 범위 외) 그대로 유지하되 020 완료 사실만 추가 주석.
- **해결 조건**: `infra.md §8` (또는 신설 절) 갱신 완료 시 `RESOLVED`.

---

## GAP-020-05

- **유형**: 배포-구성-결함 (러너 실행 불가 구조)
- **출처**: Deploy Agent
- **컨텍스트**: 선택 단계 Deploy Agent 정적 검증 — ADR-002(Fly.io one-off machine 이관 러너) 실행 가능성을 `apps/backend/Dockerfile`과 대조
- **상태**: **RESOLVED** (Deploy 재검증 gate: PASS, 2026-07-05 23:04 — Security·Performance Agent 진행 가능)
- **내용** (주 항목, blocking): `run.sh` 헤더 주석이 명시한 두 실행 경로 — `fly machine run <image> --command "scripts/migration/run.sh cutover" -a <target-app>` 및 `fly ssh console -a <target-app>` 진입 후 직접 실행 — 이 현재 `apps/backend/Dockerfile`(런타임 스테이지 `node:20-alpine`)로는 어느 쪽도 그대로 실행 불가능하다.
  1. Dockerfile 이 `scripts/migration/`을 어떤 스테이지에서도 COPY 하지 않는다 — `<image>`가 backend 앱 이미지를 지칭하면 러너 스크립트 자체가 이미지 안에 없다.
  2. `node:20-alpine` 런타임 이미지는 기본 셸이 `/bin/sh`(busybox ash)이며 `bash`가 미설치 — `run.sh`/`extract.sh`/`load.sh`/`lib/common.sh` 전부 `#!/usr/bin/env bash` 사용.
  3. `psql`/`pg_dump` 클라이언트 미설치 — `apk add postgresql-client` 류 설치 단계가 Dockerfile 에 없음(`lib/common.sh`의 `run_psql()`·`extract.sh`의 `\copy` 는 `psql` CLI 필수).
  - **부가 항목(non-blocking)**: `plan.md` "배포 환경 영향(PROC-009)"가 "컷오버 시 최소 1인스턴스 유지 설정 권장(**런북**)"이라고 명시했으나(`infra.md §8` scale-to-zero 콜드 스타트 대응), `RUNBOOK.md`에 `min_machines_running` 상향 체크포인트가 반영되지 않았다. 트래픽 전환 직후(§단계 5) smoke 판정에 콜드 스타트 지연이 혼입될 수 있다.
- **영향**: 주 항목 — 실 컷오버 실행 당일 러너 진입 자체가 막혀 윈도우(NFR-001 60분)를 잠식하거나 개시를 못 할 위험. 부가 항목 — smoke 판정 오탐·사용자 체감 지연(비-블로킹).
- **권고**:
  - 대안 A(임시): `fly ssh console` 진입 후 `apk add --no-cache bash postgresql16-client` + `fly ssh sftp` 로 `scripts/migration/` 전송 절차를 `RUNBOOK.md §1 사전점검 체크리스트`에 명시 추가.
  - 대안 B(권장): `scripts/migration/` 전용 경량 러너 이미지(별도 Dockerfile — `apk add bash postgresql16-client` + `COPY scripts/migration/`) 신규 작성 후 `fly machine run <runner-image>`로 실행. 프로덕션 앱 이미지 비대화(P-001) 회피.
  - 부가 항목: `RUNBOOK.md §1`에 "컷오버 당일 `min_machines_running=1` 상향(또는 컷오버 완료 후 원복)" 체크포인트 추가.
- **해결 조건**: 주 항목 — 대안 A 또는 B 중 하나가 구현되어 `run.sh cutover`가 실제 Fly.io one-off machine(또는 ssh console)에서 처음부터 끝까지 실행 가능함이 확인되면 `RESOLVED`. 부가 항목 — `RUNBOOK.md`에 최소 인스턴스 유지 체크포인트 반영 시 별도 `RESOLVED`.
- **처리**: Deploy Agent 는 팀리드 지시("코드 변경 최소화 — 검증·보고 중심")에 따라 Dockerfile/RUNBOOK 을 직접 수정하지 않음 — 대안 A/B 결정 및 구현은 main session 경유 사용자/팀리드 판단 후 Development 또는 Deploy Agent 재호출로 처리.
- **RESOLVED by Deploy Agent (재검증, 2026-07-05 23:04)**: Development Agent 가 대안 B(전용 러너 이미지, T014)를 구현(`scripts/migration/Dockerfile`·`.dockerignore` 신규). Deploy Agent 가 팀리드 지시대로 보고 문구를 신뢰하지 않고 직접 재현·대조:
  - **주 항목** — `docker build -f scripts/migration/Dockerfile scripts/migration` 로컬 빌드 성공(에러 0) + `which bash psql pg_dump curl` 4종 전부 실측 확인(`postgres:16-alpine` 베이스가 bash·psql·pg_dump 기본 포함, `curl` 만 추가 설치) + `ls /migration` 로 `scripts/migration/` 전 파일 이미지 내 존재 확인 — 3개 결핍 사유(미COPY·bash 미설치·psql/pg_dump 미설치) 전부 실측 해소.
  - **ENTRYPOINT 안전성** — `docker inspect` 로 `Entrypoint: null`(무력화) 확인 + 컨테이너 기동 후 `ps aux` 로 PID 1 이 `sleep infinity` 단독임을 실측(postgres 서버 미기동, 리스닝 포트 0건) — 베이스 이미지 기본 동작(DB 서버 자동 기동) 오사용 위험 없음 확인.
  - **부가 항목** — `RUNBOOK.md §1` L67 에 `min_machines_running` 상향 체크포인트 반영 확인(신규 섹션에 포함).
  - **RUNBOOK renumbering 무결성** — 최상위 §0~§7 재번호 후 내부 상호참조 8건 전건 대조 완료(모두 일치, broken reference 0건). `PRE-ASSESSMENT.md`→`RUNBOOK.md#단계-4--gonogo-판단` 외부 참조는 하위 "단계 N" 앵커(§3 소속, renumbering 영향 없음)라 유효성 유지.
  - **§F 준수** — `git diff 1dd5132 --stat -- apps/backend/src apps/backend/prisma apps/backend/Dockerfile fly.toml .github/workflows` 결과 0건, 기존 배포 구성 완전 무변경 확인.
  - **회귀 검증** — 정적테스트 3스위트 54건 전부 재PASS(회귀 0), `bash -n` 4스크립트 재확인 PASS.
  - 상세 근거는 `deploy/deploy-report.md §7 재검증` 참조. **주 항목·부가 항목 모두 RESOLVED**, Deploy 단계 gate: PASS로 갱신 — Security·Performance Agent 진행 가능.

---

## GAP-020-06

- **유형**: 보안-권고 (데이터 보존·접근통제, Medium)
- **출처**: Security Agent
- **컨텍스트**: 선택 단계 Security Agent 감사 — `security/security-report.md` SEC-020-01
- **상태**: OPEN (비블로킹 — Performance Agent 진행 가능)
- **내용**: `migration_staging` 스키마(29테이블, PII·결제 원본 데이터 포함)의 컷오버 후 정리 명령(`DROP SCHEMA migration_staging CASCADE;`)이 `sql/00_staging_ddl.sql` L9 주석에만 존재하고 `RUNBOOK.md`(전체 §0~§7) · `run.sh`(4개 서브커맨드) 어디에도 체크포인트·자동화로 반영되어 있지 않다. 스키마에 대한 명시적 `GRANT`/`REVOKE` 도 없어 정리 전까지 접근 범위가 기본 DB 롤 권한에 의존한다.
- **영향**: 실 이관 실행 시 정리 절차가 누락되면 프로덕션 Fly Postgres 에 PII·결제 데이터가 별도 접근통제 없이 무기한 잔류할 위험.
- **권고**: `RUNBOOK.md`에 정리 체크포인트 신설(+ 가능하면 `run.sh cleanup` 서브커맨드 반자동화) + 정리 전 앱 런타임 롤에 대한 `REVOKE` 검토.
- **해결 조건**: `RUNBOOK.md` 정리 체크포인트 반영(및/또는 `run.sh` 자동화) 완료 시 `RESOLVED`.
- **Retrospective 위임**: Medium 이상 미해결 취약점 — `context.md §6`에 "020 이관 도구 — 스테이징 정리 미자동화" 행 additive 등재 권고(PROC-013-03).

---

## GAP-020-07

- **유형**: 보안-권고 (감사 로그 완결성, Medium)
- **출처**: Security Agent
- **컨텍스트**: 선택 단계 Security Agent 감사 — `security/security-report.md` SEC-020-02
- **상태**: OPEN (비블로킹 — Performance Agent 진행 가능)
- **내용**: `migration_staging.verification_runs`(감사 테이블, ADR-010/NFR-006)에 단계·시각·상태·detail 은 기록되나 실행 행위자(운영자 계정·Fly machine ID 등) 식별 필드가 없다. ADR-008 금전 레코드 직접 삽입(런타임 결제경로 우회) 경로의 "누가 실행했는지" 축이 스키마 레벨에서 확인 불가.
- **영향**: 컷오버 사고 조사 시 DB 접속 로그까지 내려가지 않으면 `verification_runs` 만으로 실행 주체 특정 불가.
- **권고**: `verification_runs`에 `actor` 컬럼(또는 `detail.actor`) 추가 후 `run.sh`의 `stage_run()` INSERT 문에 반영.
- **해결 조건**: `verification_runs` 행위자 식별 필드 추가 및 `stage_run()` 반영 완료 시 `RESOLVED`.
- **Retrospective 위임**: Medium 이상 미해결 취약점 — `context.md §6`에 "020 이관 도구 — 감사로그 행위자 미기록" 행 additive 등재 권고(PROC-013-03).

---

## GAP-020-08

- **유형**: 성능-권고 (구현 수준, Medium, 비블로킹)
- **출처**: Performance Agent
- **컨텍스트**: 선택 단계 Performance Agent 정적 검토 — `scripts/migration/run.sh` `do_delta()`/`do_precopy()` + `for_each_legacy_service()`(L65-78)
- **상태**: OPEN (비블로킹 — Retrospective 진행 가능)
- **내용**: 레거시 18개 서비스(개별 RDS 인스턴스)에 대한 추출(`extract.sh`)·적재(`load.sh`)가 `for_each_legacy_service` bash 루프로 **완전 순차 실행**된다. `extract.sh` 는 `behavior=FULL|AUX` 부류(research.md 확정 (C)/(C″) — 60분 예산의 지배 변수)에 대해 `--mode`(precopy/delta) 와 무관하게 `delta_filter="TRUE"` 로 **매 실행 전체 재추출**을 수행하므로(L121-123), 컷오버 윈도우 내 단계 2(최종 델타 이관)의 소요는 사실상 `Σ(서비스별 전체 재추출 시간)` 이 된다. 각 레거시 서비스는 물리적으로 독립된 RDS 이므로 서비스 간 자원 경합이 없어, 순차 처리를 병렬화(bash 백그라운드 `&`+`wait`, 동시성 상한 적용)하면 총 소요를 `Σ` 에서 `max(서비스별 소요)` 로 단축할 수 있는 여지가 있다.
- **영향**: (C)/(C″) full re-copy 대상 테이블의 레거시측 실 행수가 클수록 NFR-005(50분 안전마진) 위협이 커지는데, 현재 순차 실행 구조는 이 위험을 구조적으로 완화하지 못하고 있다. `PRE-ASSESSMENT.md` 게이트(옵션 A, 사용자 실측)가 사전에 초과를 감지하므로 즉시 60분 초과가 확정되는 아키텍처 결함은 아니나(BLOCKED 사유 아님), 병렬화는 NFR-001/005 여유율을 늘리는 가장 레버리지가 큰 최적화 지점이다.
- **권고**: `for_each_legacy_service` 호출부(`do_precopy`/`do_delta`)에서 서비스별 `_one_service` 호출을 백그라운드(`&`)로 실행 후 `wait`로 동기화하는 방식으로 전환(동시 연결 수 상한은 타깃 Fly Postgres 커넥션 한도 고려해 설정). 코드 변경은 본 선택 단계 범위 밖(팀리드 지시 — 검증·보고만)이므로 실제 반영은 후속 조치로 위임.
- **해결 조건**: `run.sh` 서비스별 추출·적재가 병렬 실행되도록 개선되고, 리허설(dry-run) 로그로 단계 2 소요 단축이 확인되면 `RESOLVED`.
- **Retrospective 위임**: `context.md §6`에 "020 이관 도구 — 서비스별 추출·적재 순차 실행(병렬화 여지)" 행 additive 등재 권고(PROC-013-03).

---

## GAP-020-09

- **유형**: 성능-권고 (구현 수준, Low, 비블로킹)
- **출처**: Performance Agent
- **컨텍스트**: 선택 단계 Performance Agent 정적 검토 — `scripts/migration/sql/20_verify.sql` §(c) 샘플 체크섬(L118-220)
- **상태**: OPEN (비블로킹 — Retrospective 진행 가능)
- **내용**: 샘플 체크섬 쿼리가 `ORDER BY random() LIMIT GREATEST(100, ceil(count(*)*0.01))` 패턴을 사용한다. PostgreSQL 에서 `ORDER BY random()` 은 조인 결과 **전체 행**에 대해 `random()` 값을 계산·정렬한 뒤 `LIMIT` 을 적용하므로(널리 알려진 anti-pattern), 의도한 "일부 샘플링"이 사실상 전체 정렬 비용을 수반한다. 대상 테이블 중 `products.products`·`orders.orders`·`payments.payments`·`users.users` 는 research.md 가 지목한 (C) full-recopy 대형 후보군과 겹친다.
- **영향**: 단계 3(정합성 검증, NFR-005 50분 안전마진 내 예산 ~5–15분)에 불필요한 CPU 시간이 추가될 수 있다. 다만 GO 게이트 자체는 SC-006 필수 3종(count/sum/antijoin) 기준이며 checksum 은 §(c) 단일 검증축이라 전체 게이트를 위협하는 수준은 아니다.
- **권고**: `ORDER BY random() LIMIT n` 을 `TABLESAMPLE SYSTEM (n) REPEATABLE(seed)` 또는 `TABLESAMPLE BERNOULLI` 기반 샘플링으로 교체하여 전체 정렬을 회피.
- **해결 조건**: `20_verify.sql` §(c) 가 `TABLESAMPLE` 기반으로 전환되고 대형 테이블 기준 소요 시간 단축이 확인되면 `RESOLVED`.
- **Retrospective 위임**: `context.md §6`에 "020 이관 도구 — checksum 샘플링 ORDER BY random() 비효율" 행 additive 등재 권고(PROC-013-03) — 우선순위는 GAP-020-08 대비 낮음.
