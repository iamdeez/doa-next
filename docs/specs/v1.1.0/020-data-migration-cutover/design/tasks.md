---
작성: Design Agent
버전: v1.0
최종 수정: 2026-07-05 21:35
상태: 확정
---

# Tasks: 020-data-migration-cutover
> Branch: 020-data-migration-cutover | Date: 2026-07-05 | Plan: [../planning/plan.md](../planning/plan.md)

## 목차

- [전제 조건](#전제-조건)
- [태스크 분해 레이어](#태스크-분해-레이어)
- [태스크 목록](#태스크-목록)
  - [Step 1. 데이터 계층 (A — Database Design Agent 산출 참조)](#step-1-데이터-계층-a--database-design-agent-산출-참조)
  - [Step 2. 도메인 계층 (B — Development 4단계)](#step-2-도메인-계층-b--development-4단계)
  - [Step 3. 인터페이스·실행 계층 (C — Development 4단계)](#step-3-인터페이스실행-계층-c--development-4단계)
  - [Step 4. 테스트 계층 (D — 5a Test Agent AUTHORING)](#step-4-테스트-계층-d--5a-test-agent-authoring)
- [Test Authoring Contract](#test-authoring-contract)
- [SC 매핑 검증 (역방향)](#sc-매핑-검증-역방향)
- [태스크 입도 가이드](#태스크-입도-가이드)
- [구현 완료 기준](#구현-완료-기준)

---

## 전제 조건

- [x] spec.md 의 모든 [NEEDS CLARIFICATION] 항목이 해소되었는가? — spec §미결 사항 "없음"
- [x] plan.md 의 Constitution Gates 가 모두 통과(또는 예외 기재)되었는가? — P-001~P-007 전건 PASS(P-001·P-005 예외 2건 사용자 승인 완료, pipeline-log 21:32)
- [x] CHANGES.md 에서 이전 작업의 "후속 작업 시 주의사항"을 확인했는가? — 019 완료, 추적 백로그 소진(GAP-005-03 accepted). 본 spec 은 앱 코드 무변경(P-007)이라 기존 부채와 충돌 없음

---

## 태스크 분해 레이어

> [P] 표시: 이전 태스크와 병렬 실행 가능
> 기본 의존 순서: A → B → C → D
>
> | 레이어 | 본 spec 대상 (out-of-band 이관 도구 — NestJS 앱 코드 아님) |
> |---|---|
> | **A. 데이터 계층** | 레거시↔신규 필드 매핑 명세 + `migration_staging`/`verification_runs` DDL + 변환 UPSERT SQL + 검증 SQL — **Database Design Agent 산출**(3단계 후/4단계 전, PPG-1 이전). 본 tasks 는 참조 배선만(중복 생성 금지) |
> | **B. 도메인 계층** | 추출(pg_dump/\copy)·스테이징 로드(COPY)·델타 캡처 3분기 로직 — 러너 스크립트. DB Design SQL 을 호출·오케스트레이션 |
> | **C. 인터페이스·실행 계층** | 러너 오케스트레이션(Fly one-off·단계 시퀀스)·접속 설정(sslmode)·감사 로깅(verification_runs)·**컷오버 런북**·**사전평가 템플릿** |
> | **D. 테스트 계층** | 정적 검증(런북·매핑·설정 완결성 파싱) + e2e-db/integration 은 **옵션 A**(사용자 실행+결과 전달) 검증 계약 — **5a Test Agent(AUTHORING)** |
>
> **산출물 위치(canonical) — repo-root `scripts/migration/`** (앱 빌드 대상 밖·P-007):
> ```
> scripts/migration/
> ├── MAPPING-SPEC.md         (A — DB Design: 필드 매핑 + 변환규칙 + per-table 델타 분류 확정)
> ├── sql/
> │   ├── 00_staging_ddl.sql  (A — DB Design: migration_staging + verification_runs DDL)
> │   ├── 10_transform.sql    (A — DB Design: 위상순서 UPSERT 변환)
> │   └── 20_verify.sql       (A — DB Design: count·Decimal sum·sample checksum·anti-join)
> ├── extract.sh              (B — Development: 추출 + 델타 워터마크 파라미터)
> ├── load.sh                 (B — Development: COPY FROM 스테이징 적재)
> ├── run.sh                  (C — Development: Fly one-off 오케스트레이션·단계 시퀀스 S2)
> ├── config.example.env      (C — Development: sslmode=require·secret 주입 패턴)
> ├── RUNBOOK.md              (C — Development: 컷오버 런북)
> ├── PRE-ASSESSMENT.md       (C — Development: 사전평가 리포트 템플릿)
> ├── Dockerfile              (C — Development: 전용 러너 이미지, T014·GAP-020-05 대안 B)
> └── .dockerignore           (C — Development: 러너 이미지 빌드 컨텍스트 제외 목록, T014)
> ```
> **PPG-1 파일 소유 분할**: A(DB Design, PPG-1 이전 확정) / B·C(Development 4단계 — `scripts/migration/` 러너·문서) / D(Test 5a — `apps/backend/test/static/migration-*.spec.ts`). PPG-1 병렬 중 동일 파일 충돌 없음(레이어별 파일 분리).
>
> **[TO-VERIFY] 전제**: 레거시 18서비스 실 DDL·행수는 사용자 환경 의존(옵션 A). B/C 스크립트는 **파라미터화된 템플릿**으로 작성하며, 실 레거시 테이블명·자격증명은 실행 시 사용자가 주입한다. `MAPPING-SPEC.md`(A) 가 레거시 실측을 확정하기 전까지 변환 SQL 의 레거시측 컬럼은 `[TO-VERIFY]` 로 표기한다.

---

## 태스크 목록

### Step 1. 데이터 계층 (A — Database Design Agent 산출 참조)

- [ ] **T001** — 매핑 명세 + 스테이징/검증 DDL + 변환/검증 SQL (Database Design Agent 산출)
  - 레이어: A | 산출 소유: **Database Design Agent** (3단계 후 / 4단계 전 — PPG-1 이전)
  - 대상 파일: `scripts/migration/MAPPING-SPEC.md`(신규), `scripts/migration/sql/00_staging_ddl.sql`·`10_transform.sql`·`20_verify.sql`(신규). (DB Design 스테이지 요약은 `db-design/data-model.md` 로 인덱싱 가능)
  - 관련 요구사항: FR-009·FR-010·FR-014·NFR-002·NFR-003·NFR-006
  - 상세(DB Design 확정 항목 — research §DB Design 위임 계약):
    1. 레거시 18서비스 각 테이블·컬럼 → 신규 33테이블 필드 단위 매핑표(SC-011 완결성 = 33테이블 전부 최소 1회 등장).
    2. 비-1:1(병합·분할·재구조화) 변환 규칙(SC-012) + 카운트 기대식(S4-a).
    3. per-table 델타 분류 최종 확정(research 분류표 + 레거시측 timestamp 실측 반영).
    4. **ephemeral 테이블(refresh_tokens·password_reset_otps·oauth_states·payment_outbox) 이관-vs-스킵 정책 확정(GAP-020-01)** → SC-005 "대상 테이블" 집합 정의.
    5. `00_staging_ddl.sql`: `migration_staging` 스키마 + 레거시 raw 테이블 + `verification_runs` 감사 테이블.
    6. `10_transform.sql`: 위상 순서(users→products→commerce→orders→payments→settlements→admin→files) UPSERT. **스키마 내부 FK 부모-우선 준수**(research 로드순서 검증). cross-schema 는 plain String(FK 미강제).
    7. `20_verify.sql`: (a) 레코드 수 대조(비-1:1 기대식) · (b) Decimal sum(SC-006 필수 3종 + 확장) · (c) 매핑후 sample checksum(스키마당 ≥100 또는 1%) · (4) anti-join(SC-016 orders·payments·settlements 강결합 orphan 0).
  - 완료 기준: 4개 파일 존재 + 매핑표 33테이블 전수 등장(SC-011) + 비-1:1 변환규칙 누락 0(SC-012) + ephemeral 정책 명시(GAP-020-01 RESOLVED) + SQL 구문 유효(`psql --dry-run`/파싱)
  - > **본 Design tasks 는 매핑·SQL 을 직접 작성하지 않고 DB Design 산출물을 참조**한다(019 A-layer 패턴 승계). 레거시 실 DDL 실측이 선행되어야 구체화 가능(ASM-002).

### Step 2. 도메인 계층 (B — Development 4단계)

- [x] **T002** — 추출 스크립트 (`extract.sh`) — 벌크 사전복사 + 델타 워터마크
  - 레이어: B | 구현 파일: `scripts/migration/extract.sh`(신규)
  - 관련 요구사항: FR-001·FR-002·FR-004·NFR-004
  - 상세: 레거시 각 서비스 RDS 에서 `pg_dump --data-only --table=<schema.table>` 또는 `\copy (SELECT ... WHERE <watermark>) TO` 로 테이블별 추출. **파라미터화**: `--mode=precopy`(전량, 윈도우 밖)·`--mode=delta`(워터마크 증분). 델타 워터마크는 research 델타 분류(A=`createdAt`/A′=부모 join/B=`updatedAt`·`viewedAt`/C·C″=full re-copy)에 따라 분기. 접속은 `sslmode=require`(config.example.env 참조). 레거시 테이블명은 MAPPING-SPEC.md(T001) 참조·`[TO-VERIFY]` 실행 시 주입.
  - 완료 기준: `extract.sh` 존재 + precopy/delta 모드 분기 + 델타 3분기(A/A′/B/C) 워터마크 로직 + sslmode=require 접속 + `bash -n`(구문) 통과. 레거시 write 미수행(추출만, 인터페이스 계약)
- [x] **T003** — 스테이징 로드 스크립트 (`load.sh`) — COPY FROM `migration_staging`
  - 레이어: B (T002 산출 소비) | 구현 파일: `scripts/migration/load.sh`(신규)
  - 관련 요구사항: FR-001·FR-002·NFR-004
  - 상세: T002 추출물을 타깃 Fly Postgres `migration_staging` 스키마에 `psql \copy ... FROM` 로 적재(레거시 원형 raw 보존). 델타 모드 시 (C)/(C″) 테이블은 `TRUNCATE`+재적재(full re-copy), (A)/(A′)/(B) 는 증분 append. 접속 sslmode=require.
  - 완료 기준: `load.sh` 존재 + precopy/delta 모드 분기 + (C) truncate 재적재 vs (A/B) 증분 append 분기 + `00_staging_ddl.sql`(T001) 선행 실행 배선 + `bash -n` 통과
- [x] **T004** — 델타 캡처 오케스트레이션 (`extract.sh`/`load.sh` 내 3분기 통합 검증)
  - 레이어: B (T002·T003 완료 후) | 구현 파일: `scripts/migration/extract.sh`·`load.sh`(T002/T003 내 통합 — 별도 파일 아님)
  - 관련 요구사항: FR-004·SC-002·SC-004
  - 상세: research 델타 분류표를 **테이블 → 부류 매핑 설정**으로 외부화(예: `delta-classes.conf` 또는 스크립트 내 배열) — 각 타깃 테이블의 부류(A/A′/B/C/C″/E)와 워터마크 컬럼을 선언. 러너가 이 설정으로 T002/T003 을 구동. cuid 비단조 제약(research 엣지) 반영 — id 워터마크 금지, createdAt/부모 join 강제.
  - 완료 기준: 33테이블 델타 부류 매핑 설정 존재(ephemeral 정책은 T001 확정 반영) + createdAt/부모-join 워터마크(id 워터마크 부재 확인) + 델타 재실행 시 UPSERT 멱등(중복 삽입 0)

### Step 3. 인터페이스·실행 계층 (C — Development 4단계)

- [x] **T005** — 러너 오케스트레이션 (`run.sh`) — Fly one-off·단계 시퀀스 S2
  - 레이어: C (T002~T004 소비) | 구현 파일: `scripts/migration/run.sh`(신규)
  - 관련 요구사항: FR-006·FR-007·FR-014·NFR-001·NFR-005·ADR-002·ADR-005·ADR-007
  - 상세: plan S2 컷오버 시퀀스를 단계 함수로 구현 — (0)pre-copy·(0b)outbox pending=0 확인·(1)쓰기차단 신호·(2)델타(extract/load delta→`10_transform.sql`)·(3)`20_verify.sql` 실행·(4)**GO/NO-GO 게이트**(검증 3종+anti-join 전부 PASS 시에만 GO — FR-006)·(5)트래픽 전환 트리거·(6)NO-GO 롤백(쓰기차단 해제·타깃/스테이징 폐기 옵션). Fly one-off machine 실행 진입점(`fly machine run`/`fly ssh console` 주석). 변환은 위상 순서(ADR-005).
  - 완료 기준: `run.sh` 존재 + S2 단계 0~7 시퀀스 + GO 게이트가 검증 4종 AND 조건(FR-006) + NO-GO 분기가 쓰기차단 해제(FR-007) + Fly one-off 실행 진입점 명시 + `bash -n` 통과
- [x] **T006** `[P]` — 접속 설정 템플릿 (`config.example.env`) — sslmode·secret 주입
  - 레이어: C | 구현 파일: `scripts/migration/config.example.env`(신규)
  - 관련 요구사항: FR-015·NFR-004·SC-017·ADR-009
  - 상세: 레거시·타깃 접속 문자열 템플릿 — `PGSSLMODE=require`(이상) 명시, 자격증명은 실행 시 secret 주입(평문 커밋 금지, 값 없이 키만). PII/결제 원문·자격증명 평문 로그 금지 주석(NFR-006 마스킹).
  - 완료 기준: `config.example.env` 존재 + `sslmode=require`(또는 `PGSSLMODE=require`) 명시(SC-017) + 실값 없이 키만(secret placeholder) + 평문 로그 금지 주석
- [x] **T007** `[P]` — 감사 로깅 배선 (`run.sh` 내 verification_runs 기록)
  - 레이어: C (T005 내 통합) | 구현 파일: `scripts/migration/run.sh`(T005 통합)
  - 관련 요구사항: NFR-006·SC-022
  - 상세: 각 단계 시작·종료 시각·검증 결과를 (a) 구조적 로그 파일 + (b) `migration_staging.verification_runs`(T001 DDL) 에 기록. 마스킹(PII/자격증명 평문 금지).
  - 완료 기준: 단계별 시작·종료 시각 + 검증 결과가 파일 + `verification_runs` 양쪽 기록(SC-022) + 마스킹 적용
- [x] **T008** — 컷오버 런북 (`RUNBOOK.md`)
  - 레이어: C | 구현 파일: `scripts/migration/RUNBOOK.md`(신규)
  - 관련 요구사항: FR-003·FR-006·FR-008·FR-012·FR-013·FR-016·FR-017·NFR-001·NFR-005
  - 상세: 순서화된 컷오버 절차 — **각 단계에 담당자·체크포인트·롤백 트리거 조건 명시(SC-015)**. 필수 포함 문구/체크포인트:
    - **D-3 사전 공지 체크포인트**(공지 채널·완료 확인란) — SC-018
    - 사전점검: outbox pending=0 드레인·`prisma migrate status` up-to-date·백업/PITR 활성·러너 CREATE 권한·레거시 자격증명 유효(ASM-010) — research 배포영향
    - 쓰기 차단(레거시 DB read-only + 앱 점검모드 503) — SC-003 (레거시측 out-of-band)
    - **"SC-005~SC-007(+anti-join) 전부 PASS 시에만 트래픽 전환(GO)"** 명시 — SC-008
    - **"예상소요 > 50분(NFR-005) 시 진행 전 사용자 재확인 필수" 체크포인트** — SC-014 (FR-012)
    - 트래픽 전환(DNS/LB)·smoke·전파 확인
    - **PoNR 경고 단계**("컷오버 후 신규 주문/결제 1건 발생 시점부터 롤백 불가") — SC-010
    - NO-GO 롤백 절차(쓰기차단 해제·레거시 서비스 재개) — SC-009 (FR-007)
    - **file_assets 메타만 이관·실 파일 바이너리 이관 범위 외 명시** — SC-019 (FR-017)
    - 리허설(dry-run) 1회 권고(SC-020/021 로그 활용)
  - 완료 기준: 위 10개 필수 체크포인트·문구 전부 존재 + 각 단계 담당자·체크포인트·롤백트리거 3요소 누락 0(SC-015)
- [x] **T009** `[P]` — 사전평가 리포트 템플릿 (`PRE-ASSESSMENT.md`)
  - 레이어: C | 구현 파일: `scripts/migration/PRE-ASSESSMENT.md`(신규)
  - 관련 요구사항: FR-011·FR-012·SC-013·SC-014
  - 상세: 테이블별 **행수·용량·예상소요·윈도우 대비 여유율** 기재 템플릿(33테이블 행 + full re-copy (C)/(C″) 총량 소계 강조 — research 60분 예산 최대 변수). 예상소요 > 50분(NFR-005) 시 "사용자 재확인 필수" 게이트 연결(런북 T008 참조). 실측값은 옵션 A(사용자 실행) 주입 — 템플릿은 `[TO-VERIFY]` placeholder.
  - 완료 기준: 테이블별 행수·예상소요·여유율 3항목 컬럼 존재(SC-013) + (C)/(C″) full re-copy 소계 행 + NFR-005 초과 시 재확인 게이트 링크(SC-014)
- [x] **T014** — 전용 러너 이미지 (`Dockerfile`) — GAP-020-05 대안 B (재작업, Deploy Agent 지적 사항 반영)
  - 레이어: C (재작업 — T005~T009 완료 후, Deploy Agent 5b 재검증 대상) | 구현 파일: `scripts/migration/Dockerfile`(신규), `scripts/migration/.dockerignore`(신규)
  - 관련 요구사항: ADR-002(이관 러너 실행 위치) 실행 가능성 확보 — GAP-020-05 해결
  - 상세: `apps/backend/Dockerfile`(운영 앱 이미지, `node:20-alpine`)가 `scripts/migration/`을 COPY 하지 않고 `bash`/`psql`/`pg_dump`도 미설치라 러너 실행이 불가함을 Deploy Agent 가 실측(GAP-020-05, blocking). `postgres:16-alpine`(bash·psql·pg_dump 기본 포함) 베이스에 `curl`만 추가한 전용 경량 이미지를 신규 작성해 대안 B 를 구현한다(운영 앱 이미지 비대화 회피 — P-001). 자격증명은 이미지에 굽지 않고 런타임 볼륨 마운트/env 주입(config.example.env 패턴 유지). `RUNBOOK.md §1`(신규 섹션)에 빌드·push·실행 절차 및 `min_machines_running` 상향 체크포인트(GAP-020-05 부가 항목) 반영, `run.sh` 헤더 주석을 러너 이미지 실행 경로로 갱신.
  - 완료 기준: `Dockerfile`·`.dockerignore` 존재 + `docker build -f scripts/migration/Dockerfile scripts/migration` 로컬 빌드 성공 + 컨테이너 내 `bash`/`psql`/`pg_dump`/`curl` 실행 확인 + `ENTRYPOINT` 오버라이드로 postgres 서버 자동 기동 안 함(안전한 기본 CMD) + `RUNBOOK.md`에 이미지 빌드/실행/`min_machines_running` 절차 반영 + 기존 정적 테스트 3종(54건) 회귀 없음(RUNBOOK 섹션 renumbering 후 재확인) + `bash -n` 4스크립트 유지

### Step 4. 테스트 계층 (D — 5a Test Agent AUTHORING)

> 본 Step(레이어 D)은 4단계 Development 와 동일 turn 병렬 spawn 되는 **5a Test Agent(AUTHORING)** 가 수행한다. Development(4)는 Step 2~3(B·C)만 진행한다. [env:static] SC 는 파이프라인 내 자동 검증(정적 파싱), [env:integration]·[env:e2e-db] SC 는 **옵션 A**(사용자 실행+결과 전달) 검증 계약을 test-cases.md 에 명세한다.

- [ ] **T010** — 런북 완결성 정적 테스트 (SC-003·008·009·010·014·015·018·019)
  - 레이어: D | 테스트 파일: `apps/backend/test/static/migration-runbook.spec.ts`(신규) | 검증 대상: SC-003·008·009·010·014·015·018·019
  - 상세: `RUNBOOK.md`(anchored path — 아래 하네스 canonical) 파싱, 필수 체크포인트/문구 존재 하드 assert(조건부 skip 금지 — PROC-014-03)
- [ ] **T011** — 매핑 명세 완결성 정적 테스트 (SC-011·012)
  - 레이어: D | 테스트 파일: `apps/backend/test/static/migration-mapping.spec.ts`(신규) | 검증 대상: SC-011·012
  - 상세: `MAPPING-SPEC.md` 파싱 — 신규 33테이블(schema.prisma `@@map` 전수) 이 매핑표에 최소 1회 등장(SC-011) + "1:1 아님" 항목 전건 변환 규칙 기재(SC-012)
- [ ] **T012** `[P]` — 사전평가·접속설정 정적 테스트 (SC-013·017)
  - 레이어: D | 테스트 파일: `apps/backend/test/static/migration-config.spec.ts`(신규) | 검증 대상: SC-013·017
  - 상세: `PRE-ASSESSMENT.md` 행수·예상소요·여유율 컬럼 존재(SC-013) + `config.example.env`/`extract.sh`/`load.sh` 에 `sslmode=require`(이상) 존재(SC-017)
- [ ] **T013** — 옵션 A 검증 계약 명세 (SC-001·002·004·005·006·007·016·020·021·022)
  - 레이어: D | 산출: `test/test-cases.md`(5a) 내 "옵션 A 실행 계약" 절 + `20_verify.sql`(T001) 결과 스키마 계약 | 검증 대상: SC-001·002·004·005·006·007·016·020·021·022
  - 상세: 실 레거시·신규 접속 필요 SC 는 사용자 실행 절차(명령·`run.sh --mode=...`)·기대 결과(리포트 필드) 계약을 명세. 5b Test(EXECUTION)/Deploy 가 사용자 반환 결과를 검증. SC-020/021 은 리허설 로그(단계 시각차 ≤60/50분)로 검증

---

## Test Authoring Contract

> **PPG-1 의 5a Test Agent(AUTHORING) 입력 contract**. Development(4)·DB Design 과 병렬/선행이므로 산출물 심볼을 canonical 로 명시한다.

### 산출물 canonical (PROC-004)

| 산출물 | canonical 경로·형태 |
|---|---|
| 매핑 명세 | `scripts/migration/MAPPING-SPEC.md` — 매핑표 헤더 컬럼: `레거시서비스·레거시테이블·레거시컬럼 / 신규스키마·신규테이블·신규컬럼 / 1:1여부 / 변환규칙 / 카운트기대식`. 신규 테이블 식별자 = schema.prisma `@@map` 값(예: `orders.orders`·`payments.payments`) |
| 스테이징 DDL | `scripts/migration/sql/00_staging_ddl.sql` — `CREATE SCHEMA migration_staging` + `verification_runs`(단계·시작·종료·검증결과 컬럼) |
| 변환 SQL | `scripts/migration/sql/10_transform.sql` — `INSERT … ON CONFLICT (id) DO UPDATE` 위상 순서 |
| 검증 SQL | `scripts/migration/sql/20_verify.sql` — count·`SUM(Decimal)`·`md5(normalized projection)`·anti-join(`LEFT JOIN … WHERE 우측 IS NULL`) |
| 런북 | `scripts/migration/RUNBOOK.md` — T008 필수 체크포인트 10종 |
| 사전평가 | `scripts/migration/PRE-ASSESSMENT.md` — 행수·예상소요·여유율 컬럼 |
| 접속 설정 | `scripts/migration/config.example.env` — `PGSSLMODE=require`(이상) |

### 하네스 canonical (PROC-014-03 — 경로·harness 전제 고정)

- **정적 테스트**: `apps/backend/test/static/migration-*.spec.ts`, jest, `fs.readFileSync`. **경로 기준 — package-root anchored 상수**: `path.resolve(__dirname, '../../../../scripts/migration/RUNBOOK.md')`(static→test→backend→apps→repo-root, 4레벨). `Directory.current`/cwd 상대경로 가정 금지. 플랫폼 채널·secure storage 의존 없음(순수 파일 파싱).
- **하드 assert 강제**: 대상 문구/컬럼 Finder 는 실제 존재 문자열 기반 하드 assert. `if (missing) markTestSkipped` 조건부 skip anti-pattern 금지 — 미충족 시 FAIL.
- **정적 SQL 구문 검증**(선택): `20_verify.sql`·`10_transform.sql` 구문은 `psql -f --dry-run` 불가 시 파서 라이브러리 없이 문자열 키워드 검증(`ON CONFLICT`·`LEFT JOIN`·`SUM(` 존재)로 갈음.
- **옵션 A(integration·e2e-db)**: 파이프라인 내 자동 실행 불가(레거시 자격증명·네트워크가 사용자 환경). test-cases.md 에 실행 명령·기대 리포트 필드를 계약으로 명세, 5b Test(EXECUTION)/Deploy 가 사용자 반환 결과 검증. **jest 자동 테스트로 작성 금지**(실 레거시 접속 불가 — 거짓 green/skip 방지).

### SC 시나리오 표

| SC-ID | 수용 기준 | Happy | Edge | Error | 테스트 파일/검증 경로 | 비고 |
|---|---|---|---|---|---|---|
| SC-001 | 8스키마 전 테이블 레거시 대응 데이터 존재 | 33테이블 row>0(빈 소스 제외) | — | — | 옵션 A: `run.sh` 후 `20_verify.sql` count | [env:e2e-db] 사용자 실행 |
| SC-002 | pre-copy 시점 레코드 수 차 ≤ 델타 임계치 | — | 차이 ≤ 임계치 | — | 옵션 A: precopy 후 count 대조 | [env:integration] |
| SC-003 | 윈도우 개시 후 레거시 쓰기 503/차단 일관 | — | — | POST/PUT/PATCH/DELETE → 503/거부 | `migration-runbook.spec.ts`(런북 절차 존재) + 옵션 A(실 차단) | [env:integration] 레거시측 |
| SC-004 | 델타 후 마지막 변경 레코드 일치 | 레거시=신규 최신 일치 | — | — | 옵션 A: 워터마크 기준 대조 | [env:integration] |
| SC-005 | 레코드 수 100% 일치(불일치 0) | 전 대상 테이블 일치 | — | — | 옵션 A: `20_verify.sql` (a) | [env:e2e-db] "대상 테이블"=T001 ephemeral 정책 반영 |
| SC-006 | 금전 합계 오차 0원 | totalAmount·amount·payoutAmount 일치 | — | — | 옵션 A: `20_verify.sql` (b) Decimal | [env:e2e-db] |
| SC-007 | 샘플(≥100 또는 1%) 체크섬 일치 | 매핑후 projection 해시 일치 | 무작위 샘플 | — | 옵션 A: `20_verify.sql` (c) | [env:e2e-db] |
| SC-008 | 런북 "SC-005~007 PASS 시에만 GO" 명시 | 문구 존재 | — | — | `migration-runbook.spec.ts` | [env:static] 하드 assert |
| SC-009 | 검증 실패 리허설 → 전환 미진행·쓰기차단 해제 | — | — | 의도적 불일치 → NO-GO·재개 | `migration-runbook.spec.ts`(NO-GO 절차) + 옵션 A(리허설) | [env:integration] |
| SC-010 | 런북 PoNR 경고 단계 | 경고 단계 존재 | — | — | `migration-runbook.spec.ts` | [env:static] |
| SC-011 | 매핑표 신규 33테이블 전부 등장 | 누락 0 | — | — | `migration-mapping.spec.ts` | [env:static] schema.prisma @@map 전수 대조 |
| SC-012 | "1:1 아님" 전건 변환 규칙 기재 | 변환규칙 누락 0 | — | — | `migration-mapping.spec.ts` | [env:static] |
| SC-013 | 사전평가 행수·예상소요·여유율 기재 | 3항목 존재 | — | — | `migration-config.spec.ts` | [env:static] |
| SC-014 | 예상소요>50분 시 "사용자 재확인 필수" 체크포인트 | — | 초과 시나리오 체크포인트 존재 | — | `migration-runbook.spec.ts` | [env:static] |
| SC-015 | 런북 각 단계 담당자·체크포인트·롤백트리거 기재 | 누락 0 | — | — | `migration-runbook.spec.ts` | [env:static] |
| SC-016 | orders·payments·settlements 교차참조 orphan 0 | anti-join 0건 | — | — | 옵션 A: `20_verify.sql` (4) | [env:e2e-db] |
| SC-017 | 러너 DB 연결 TLS(sslmode=require↑) | sslmode 설정 존재 | — | — | `migration-config.spec.ts` | [env:static] |
| SC-018 | 런북 D-3 공지 체크포인트(채널·완료란) | 체크포인트 존재 | — | — | `migration-runbook.spec.ts` | [env:static] |
| SC-019 | file_assets 메타 count 포함·바이너리 검증 제외 명시 | 포함·제외 각 명시 | — | — | `migration-runbook.spec.ts`(+`20_verify.sql` file_assets count) | [env:static] |
| SC-020 | 리허설/실행 "쓰기차단~전환완료" ≤60분 | 시각차 ≤60분 | — | — | 옵션 A: 리허설 로그(verification_runs) | [env:e2e-db] |
| SC-021 | 리허설 검증·GO/NO-GO ≤50분 | ≤50분 | — | — | 옵션 A: 리허설 로그 | [env:e2e-db] |
| SC-022 | 실행 로그(단계 시각·검증결과) 감사 형태 저장 | 파일/verification_runs 저장 | — | — | 옵션 A: `verification_runs` 조회 + `migration-config.spec.ts`(DDL 존재) | [env:integration] |

> 본 contract 는 외부 agent/사용자/CI 가 직접 충족 가능. `ExternalAuthoring: YES` 시 main 이 산출물(test-cases.md + 정적 테스트 파일) 존재 확인 후 5b 진입. 옵션 A SC 는 사용자 반환 결과가 5b/Deploy 검증 입력.

---

## SC 매핑 검증 (역방향)

전 22개 SC 가 태스크에 매핑됨(누락 0 — BLOCKED 불요):

| SC | 태스크 | | SC | 태스크 | | SC | 태스크 |
|---|---|---|---|---|---|---|---|
| SC-001 | T005·T013 | | SC-009 | T005·T008·T010·T013 | | SC-017 | T006·T012 |
| SC-002 | T004·T013 | | SC-010 | T008·T010 | | SC-018 | T008·T010 |
| SC-003 | T008·T010·T013 | | SC-011 | T001·T011 | | SC-019 | T008·T010 |
| SC-004 | T004·T013 | | SC-012 | T001·T011 | | SC-020 | T007·T013 |
| SC-005 | T001·T005·T013 | | SC-013 | T009·T012 | | SC-021 | T005·T007·T013 |
| SC-006 | T001·T013 | | SC-014 | T008·T009·T010 | | SC-022 | T001·T007·T013 |
| SC-007 | T001·T013 | | SC-015 | T008·T010 | | | |
| SC-008 | T008·T010 | | SC-016 | T001·T013 | | | |

---

## 태스크 입도 가이드

- 1 태스크 ≈ 스크립트/문서 1~2개. T002·T003(추출·로드)는 추출↔적재 분리로 각 단일 응집. T004 는 T002/T003 내 델타 분기 통합 검증(별도 파일 아님·설정 외부화).
- A-layer(T001)는 DB Design Agent 단일 산출(매핑+DDL+변환+검증 SQL) — 레거시 실측 선행 필요라 별도 선행 단계.
- 런북(T008)은 다수 static SC 의 단일 소스라 응집 유지(분할 시 체크포인트 분산 위험).

## 구현 완료 기준

- [ ] 모든 태스크 체크박스 완료 (T001~T014) — T001~T009·T014 완료(Development), T010~T013 은 5a Test Agent(AUTHORING) 소관
- [x] `scripts/migration/` 스크립트 `bash -n` 구문 통과 (extract·load·run, lib/common.sh 포함)
- [x] `sql/*.sql` 정적 구문 검증(키워드 존재 — `ON CONFLICT`·`LEFT JOIN`·`SUM(`) 통과
- [x] [env:static] 정적 테스트 3종(`migration-runbook`·`migration-mapping`·`migration-config`) PASS — SC-003·008·010·011·012·013·014·015·017·018·019 (`pnpm --filter backend exec jest --config test/jest-e2e.json --testPathPattern="test/static/migration"` 54/54 PASS, 2026-07-05 확인)
- [x] 런북(RUNBOOK.md) 필수 체크포인트 10종 존재
- [x] 매핑표 신규 33테이블 전수 등장 + 비-1:1 변환규칙 누락 0 (DB Design 산출, T001)
- [x] ephemeral 테이블 이관 정책 확정(GAP-020-01 RESOLVED by DB Design)
- [ ] [env:integration]·[env:e2e-db] SC 는 옵션 A 검증 계약(test-cases.md) 명세 완료 — 실행·결과 검증은 사용자 환경/5b/Deploy (5a 소관, 본 Agent 확인 범위 밖)
- [x] git status 의도치 않은 파일 없음(Development 산출 범위 — `scripts/`·`.gitignore` 확인)
