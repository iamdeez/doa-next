---
작성: Security Agent
버전: v1.0
최종 수정: 2026-07-05 23:12
상태: 확정
---

# 보안 감사 결과

## 목차

- [검토 범위](#검토-범위)
- [요약](#요약)
- [Constitution 보안 조항 이행 현황](#constitution-보안-조항-이행-현황)
- [취약점 목록](#취약점-목록)
- [NFR-XXX / SC-XXX 보안 요구사항 이행 현황](#nfr-xxx--sc-xxx-보안-요구사항-이행-현황)
- [권고사항](#권고사항)

---

## 검토 범위

DIFF(`docs/specs/v1.1.0/DIFF-020-data-migration-cutover.md`, base `1dd5132`) 기준 `scripts/migration/` 전체 및 정적 테스트 3종을 직접 Read 로 대조했다.

- `scripts/migration/lib/common.sh` — 설정 로더·TLS 강제·DSN 마스킹·psql 래퍼
- `scripts/migration/extract.sh` — 레거시 추출 (read-only \copy)
- `scripts/migration/load.sh` — 스테이징 적재
- `scripts/migration/run.sh` — 컷오버 오케스트레이션 (write-block/delta/verify/go-nogo/traffic-cutover/rollback/window-close)
- `scripts/migration/config.example.env` — 접속 설정 템플릿(secret placeholder)
- `scripts/migration/Dockerfile` · `.dockerignore` — 전용 러너 이미지
- `scripts/migration/sql/00_staging_ddl.sql` · `10_transform.sql` · `20_verify.sql`
- `scripts/migration/RUNBOOK.md` · `MAPPING-SPEC.md` · `PRE-ASSESSMENT.md`
- `apps/backend/test/static/migration-*.spec.ts` 3종
- `.gitignore`(신규 4행)

**제외**: `apps/backend/src`·`apps/backend/prisma`(도메인 코드) — `git diff 1dd5132 --stat` 로 변경 0건 확인(Deploy Agent 재검증 결과 §7 과 교차 확인), 신규 npm 의존성 0건이므로 SCA(A06) 관점 신규 취약 대상 없음.

---

## 요약

- 대상 파일: 16개 소스(스크립트/SQL/Dockerfile) + 3개 정적 테스트 + 3개 운영 문서.
- **Critical/High: 0건**.
- 전체 발견 항목: **Medium 2건, Low(정보성 권고) 2건**.
- 캐스케이딩 판정: Medium 이하만 존재 → **Performance Agent 진행 가능**.

---

## Constitution 보안 조항 이행 현황

| 조항 | 이행 여부 | 비고 |
|---|---|---|
| P-002 AWS 의존 금지 | 준수 | ADR-001 에서 AWS DMS 명시 배제, 표준 PostgreSQL 도구(`pg_dump`/`psql`/`\copy`)만 사용. `grep -rn "aws-sdk\|AWS_"` 결과 0건. |
| P-003 단일 DB 원칙 | 준수 | 스테이징(`migration_staging`)도 타깃 Fly Postgres 동일 인스턴스 내 스키마로 생성(별도 DB 미도입). |
| P-004 클라우드 중립 원칙 | 준수 | 러너는 Fly.io one-off machine(ADR-002)이며 벤더 종속 API 미사용. |

---

## 취약점 목록

### SEC-020-01 (Medium) — 스테이징 PII/결제 데이터 정리(cleanup) 절차 미운영화

- **OWASP**: A05 Security Misconfiguration (+ A01 관점의 과다 노출 범위)
- **위치**: `scripts/migration/sql/00_staging_ddl.sql` L9(주석) / `scripts/migration/RUNBOOK.md`(전체) / `scripts/migration/run.sh`(전체)
- **설명**: `migration_staging` 스키마에는 29개 테이블(email·phone·name·주소·`payments`/`settlements` 금액 등 PII·금전 데이터 원본)이 컷오버 완료 후에도 **그대로 남는다**. 정리 명령(`DROP SCHEMA migration_staging CASCADE;`)은 `00_staging_ddl.sql` L9 주석에만 존재하며, `RUNBOOK.md`(§0~§7, 목차 전체 확인 — cleanup/정리/DROP SCHEMA 언급 0건)에도, `run.sh`(precopy/outbox-check/cutover/rollback 4개 서브커맨드 어디에도) 자동화되어 있지 않다. 즉 "컷오버 종료 후 처리"가 코드 주석 수준의 지식으로만 존재하고, 운영 체크리스트·자동화 어느 쪽에도 강제되지 않는다.
- **영향**: 실행 담당자가 주석을 우연히 놓치면 프로덕션 Postgres 인스턴스에 PII·결제 원본 데이터가 별도 접근통제 없이 무기한 잔류한다. `migration_staging` 스키마에 대한 명시적 `GRANT`/`REVOKE` 문도 DDL 어디에도 없어(§ grep 결과 0건), 기본 스키마 권한(해당 DB 롤의 기존 권한 범위)에 따라 앱 런타임 계정 등 다른 주체가 조회 가능할 수 있다.
- **수정 방향**: (1) `RUNBOOK.md` §7(윈도우 종료) 또는 신규 §8 "컷오버 후 정리"에 `DROP SCHEMA migration_staging CASCADE;` 실행을 체크포인트로 명시, (2) 가능하면 `run.sh` 에 `cleanup` 서브커맨드를 추가해 검증 통과(GO) + 트래픽 전환 확인 후 수동 확인(y/N) 뒤 실행하도록 반자동화, (3) 정리 전까지 `migration_staging` 스키마에 대해 앱 런타임 롤의 접근을 명시적으로 `REVOKE ALL ... FROM <app_role>` 하는 DDL 라인 추가 검토.
- **상태**: OPEN (권고 — 비블로킹)

### SEC-020-02 (Medium) — 이관 실행 감사 로그에 행위자(actor) 식별 필드 부재

- **OWASP**: A09 Security Logging and Monitoring Failures
- **위치**: `scripts/migration/sql/00_staging_ddl.sql` L17-27(`verification_runs` 테이블 정의) / `scripts/migration/run.sh` L81-101(`stage_run`)
- **설명**: `verification_runs`는 `phase`·`step`·`target_table`·`started_at`·`finished_at`·`status`·`detail`(JSONB) 만 기록한다. **누가**(운영자 계정·Fly machine ID·세션) 이 단계를 실행했는지 식별하는 컬럼이 없다. 팀리드 지시사항의 핵심 감사 항목 — "금전 레코드 직접 삽입(ADR-008, 런타임 결제경로 우회)이 감사 로그로 추적 가능한지(누가/언제 실행했는지)" 중 **"언제"는 충족하나 "누가"는 스키마 레벨에서 미충족**이다. NFR-006("실행 이력은 감사 가능한 형태로 기록되어야 한다")·ADR-010 문면상 행위자 기록을 명시적으로 요구하지 않아 스펙 위반은 아니나, 프로덕션 DB 에 대한 직접 쓰기 우회 경로(ADR-008)라는 민감도를 고려하면 최소한의 행위자 식별이 감사 완결성에 필요하다.
- **영향**: 컷오버 사고(예: 잘못된 금액 이관, 무단 재실행) 조사 시 DB 로그 레벨(연결 계정)까지 내려가지 않으면 `verification_runs` 만으로는 실행 주체를 특정할 수 없다.
- **수정 방향**: `verification_runs`에 `actor` 컬럼(예: `current_user`(psql 접속 DB 롤) 또는 환경변수로 주입되는 운영자 식별자·Fly machine ID)을 추가하고 `stage_run()`의 INSERT 문에 반영. 최소 비용 대안으로 `detail` JSONB 에 `{"actor": "$(whoami)@$(hostname)"}` 를 추가하는 방법도 가능.
- **상태**: OPEN (권고 — 비블로킹)

### SEC-020-03 (Low, 정보성) — `LEGACY_WRITE_BLOCK_CMD`/`UNBLOCK_CMD` 의 `eval` 실행

- **OWASP**: A03 Injection (이론적 — 현재 신뢰 경계 내에서는 착취 불가)
- **위치**: `scripts/migration/run.sh` L142-149(`do_write_block`), L231-238(`do_rollback`)
- **설명**: 두 값 모두 `config.env`(운영자가 직접 작성, `.gitignore`/`.dockerignore` 로 커밋·이미지 제외 확인됨)에서 로드되어 `eval`로 실행된다. 단일 신뢰 운영자 전제(ASM-011, plan.md 기타고려사항)하에서는 외부 공격자가 이 값을 주입할 경로가 없어 착취 가능성은 없다. 다만 `eval` 사용은 향후 config 소스가 다변화(예: 외부 설정 저장소·CI 변수)될 경우 인젝션 표면이 될 수 있다.
- **영향**: 현재 위협 모델 하에서는 없음(운영자가 이미 `TARGET_DSN`/`LEGACY_DSN`으로 완전한 DB 접근을 갖고 있어 `eval` 자체가 추가 권한을 부여하지 않음).
- **수정 방향**: `config.example.env` 주석에 "이 값은 반드시 신뢰된 운영자가 직접 작성해야 하며 외부/동적 소스(CI 변수, 원격 설정 등)에서 채워서는 안 된다"는 경고를 명시. 여유가 있다면 `eval` 대신 배열 기반 실행(`"${cmd_array[@]}"`)으로 전환 검토.
- **상태**: OPEN (정보성)

### SEC-020-04 (Low, 정보성) — 레거시 DB 계정의 read-only 최소권한이 코드/체크리스트로 강제되지 않음

- **OWASP**: A01 Broken Access Control (defense-in-depth 관점)
- **위치**: `scripts/migration/config.example.env` L24-29 / `scripts/migration/RUNBOOK.md` §2 사전점검 체크리스트
- **설명**: 인터페이스 계약(plan.md "레거시 소스 계약")은 "SELECT/\copy read-only 접근"을 명시하고, `extract.sh` 자체는 실제로 SELECT만 수행한다(코드 레벨 준수 확인). 그러나 이는 **스크립트가 쓰기 명령을 실행하지 않는다는 보장**일 뿐, `LEGACY_DSN`에 매핑된 DB 계정이 실제로 SELECT 권한만 가진 별도 롤인지 여부는 RUNBOOK 사전점검 체크리스트(§2)에 확인 항목으로 없다. 현재는 관리자급 계정을 재사용해도 스크립트 동작상 문제되지 않는다.
- **영향**: 러너 환경(config.env·로그·프로세스 메모리)이 침해될 경우, 계정이 admin급이면 레거시 DB에 대한 쓰기·스키마 변경까지 노출된다(현재 스크립트가 쓰지 않는다는 사실과 무관하게 블라스트 반경이 커짐).
- **수정 방향**: `RUNBOOK.md` §2 사전점검 체크리스트에 "레거시 DB 접속 계정이 SELECT 전용 권한으로 프로비저닝되어 있는지 확인" 항목 추가.
- **상태**: OPEN (정보성)

---

## NFR-XXX / SC-XXX 보안 요구사항 이행 현황

| ID | 요구사항 | 이행 여부 | 비고 |
|---|---|---|---|
| NFR-004 | 이관 데이터 전송 채널 TLS(sslmode=require 이상) | **이행** | `lib/common.sh` `load_migration_config()`(L24, `PGSSLMODE` 미설정 시 즉시 실패) + `assert_sslmode_require()`(L52-63, require/verify-ca/verify-full 만 허용) 이중 강제. `config.example.env` 기본값 `require`. `migration-config.spec.ts` SC-017 스위트로 정적 테스트 커버(회귀 방지). |
| NFR-006 | 이관 절차 실행 이력 감사 가능한 형태 기록 | **부분 이행** | `verification_runs`(단계·시각·상태·detail)로 "언제/무엇/결과"는 기록되나 "누가"(행위자)는 미기록 — SEC-020-02. |
| ADR-009 (평문 로그 금지) | DSN·자격증명 원문 로그 금지 | **이행** | `extract.sh` L71, `load.sh` L62 모두 `mask_dsn` 경유 후 `log_line` 호출 확인. `run_psql()`(common.sh L101-104)은 명령행 자체를 로그에 남기지 않음. |
| ADR-009 (자격증명 커밋 금지) | config.env 실값 미커밋 | **이행** | `.gitignore` L43(`scripts/migration/config.env`) + `scripts/migration/.dockerignore` L2(`config.env`) 이중 차단. `config.example.env` 는 전부 placeholder(`<user>`·`[TO-VERIFY: ...]`), 실값 없음 확인. |
| ADR-010 (검증 detail PII 원문 금지) | 카운트/합계/체크섬 detail 에 PII 원문 미포함 | **이행** | `20_verify.sql` (c) 샘플 체크섬 블록(L129-130 등)이 email/name/phone 원문이 아닌 `md5()` 해시만 `stg_hash`/`tgt_hash` 로 비교, `detail` JSONB 에는 `sample_size`/`mismatch_count` 만 저장(PII 미포함). |
| ADR-008 (금전 레코드 직접 삽입 경로 통제) | 결제 경로 우회 삽입의 사전조건·추적 | **부분 이행** | 사전조건(outbox pending=0 드레인)은 `do_outbox_check()`(run.sh L124-135)로 게이트됨. 추적은 phase='cutover' 단계 로그로 "언제/성공여부"는 확인되나 "누가 승인·실행했는지"는 SEC-020-02 와 동일 공백. |
| P-002 (AWS 의존 금지) | AWS SDK/DMS 미사용 | **이행** | ADR-001 에서 명시 배제, 코드 전수 grep 결과 AWS 관련 참조 0건. |

---

## 권고사항

1. **(SEC-020-01 관련)** `RUNBOOK.md`에 컷오버 후 `migration_staging` 스키마 정리(`DROP SCHEMA ... CASCADE`) 체크포인트를 신설하고, 정리 전까지 해당 스키마에 대한 앱 런타임 롤 접근을 `REVOKE`하는 DDL 추가를 검토한다.
2. **(SEC-020-02 관련)** `verification_runs`에 행위자 식별 컬럼(또는 `detail.actor`)을 추가하여 ADR-008 직접 삽입 경로의 "누가" 축을 감사 로그에서 확인 가능하게 한다.
3. **(SEC-020-03/04 관련)** `RUNBOOK.md` §2 사전점검 체크리스트에 "레거시 DB 계정 SELECT 전용 프로비저닝 확인" 항목을 추가하고, `config.example.env`에 `LEGACY_WRITE_BLOCK_CMD`/`UNBLOCK_CMD` 값의 신뢰 출처 제약(신뢰된 운영자 직접 작성 전용) 경고를 명시한다.
4. **Retrospective → context.md §6 등재 권고**: 위 SEC-020-01/02 는 Medium 미해결 취약점(비블로킹이나 실 컷오버 실행 전 해소 권장)이므로, `context.md §6 알려진 제약 및 기술 부채`에 "020 이관 도구 — 스테이징 정리 미자동화·감사로그 행위자 미기록" 행으로 additive 등재를 권고한다(PROC-013-03). 후속 처리(RUNBOOK 패치 vs 별도 patch spec)는 main session·사용자 판단.

이 외 발견된 Critical/High 취약점은 없다.
