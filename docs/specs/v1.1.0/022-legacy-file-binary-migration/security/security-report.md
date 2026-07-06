---
작성: Security Agent
버전: v1.0
최종 수정: 2026-07-06 15:20
상태: 확정
---

# 보안 감사 결과: 022-legacy-file-binary-migration

## 목차

- [검토 범위](#검토-범위)
- [요약](#요약)
- [Constitution 보안 조항 이행 현황](#constitution-보안-조항-이행-현황)
- [취약점 목록](#취약점-목록)
- [GAP-022-02 재평가 (SEC-020-01/02 상속)](#gap-022-02-재평가-sec-020-0102-상속)
- [NFR-XXX / SC-XXX 보안 요구사항 이행 현황](#nfr-xxx--sc-xxx-보안-요구사항-이행-현황)
- [권고사항](#권고사항)

---

## 검토 범위

**대상 파일** (DIFF-022 변경분 + plan.md 인터페이스 계약이 지정한 접근 통제 표면):

- `scripts/migration/files-migrate.sh` (신규) — 이관 러너 본체
- `scripts/migration/config.example.env` (수정) — 레거시 S3·R2 자격증명 슬롯 추가
- `scripts/migration/sql/30_file_url_update.sql` (신규) — url 갱신·검증 쿼리
- `scripts/migration/Dockerfile` (수정) — `rclone` 패키지 추가
- `scripts/migration/lib/common.sh` (재사용, 무변경이나 `files-migrate.sh` 가 호출하는 `run_psql`·`log_line`·`mask_dsn`·`assert_sslmode_require`·`load_migration_config` 대조 검토 대상)
- `scripts/migration/FILE-MIGRATION-RUNBOOK.md` (신규) — 옵션 A 실행 절차(자격증명 노출 경로 확인용)

**제외 파일**: `apps/backend/test/static/file-migration-*.spec.ts`(정적 테스트, 실행 권한·시크릿 노출 없음 확인만 §취약점 목록에서 교차 인용), `apps/backend/src`·`prisma`(DIFF 상 변경 0건, research.md "영향 범위 분석"에서 무변경 확인됨), `scripts/migration/run.sh`·`extract.sh`·`load.sh`·`sql/{00,10,20}_*.sql`(020 기완료 산출물, 022 무변경 — 단 §취약점 목록에서 `assert_sslmode_require` 사용 패턴 대조 기준으로만 인용).

---

## 요약

- 검토 대상 파일 수: 4개(신규 2, 수정 2) + 재사용 라이브러리 1개 대조
- Critical / High: **0건**
- Medium: **2건** (신규 SEC-022-01, SEC-022-02)
- 전체 취약점 건수: 2건
- 자격증명 하드코딩: 0건 (`config.example.env` 전 슬롯 `[TO-VERIFY]`/`<placeholder>` 형태, `config.env`는 `.gitignore` L43·`.dockerignore` L2 양쪽 배제 확인 — Deploy Agent 실측과 일치)
- 로그 마스킹: `run_psql`이 DSN을 로그에 출력하지 않음, `RCLONE_CONFIG_*` 자격증명은 환경변수 경유로 `ps` 노출 차단 확인. 위반 0건.
- GAP-022-02(SEC-020-01/02 상속) 재평가: CONFIRMED — 신규 악화 없음, 미해소 승계(하단 상세)

---

## Constitution 보안 조항 이행 현황

| 조항 | 이행 여부 | 비고 |
|---|---|---|
| P-002 (AWS 의존 금지) | 이행 | 레거시 AWS S3는 **읽기 전용 이관 소스**로만 일시 접근(복사 후 폐기 대상), 신규 시스템은 R2로 완전 전환. `rclone` provider 설정도 `Other`(S3 호환 범용)로 벤더 중립 유지 |
| P-004 (클라우드 중립) | 이행 | R2 엔드포인트가 `R2_ACCOUNT_ID` 기반 자동 구성, `rclone`은 임의 S3 호환 엔드포인트를 다루므로 신규 벤더 종속 없음 |
| P-005 (결제·정산 정합성) | 비해당 | 파일 바이너리 이관은 결제·정산 데이터 무관(FR/NFR 범위 밖) |
| P-007 (스펙 범위) | 이행 | 020 스크립트(`run.sh`·`extract.sh`·`load.sh`) 무변경, 신규 자산만 추가 |

---

## 취약점 목록

### SEC-022-01 (Medium)

- **OWASP**: A02:2021 — 암호화 실패(Cryptographic Failures), 전송 계층 보호 약화
- **위치**: `scripts/migration/files-migrate.sh` L55 (`load_migration_config` 호출), `scripts/migration/lib/common.sh` L16-26 (`load_migration_config`)
- **설명**: `files-migrate.sh`는 020의 자매 스크립트인 `extract.sh`(L66)·`load.sh`(L58)와 달리 `assert_sslmode_require`(PGSSLMODE 값이 실제로 `require`/`verify-ca`/`verify-full` 중 하나인지 검증)를 호출하지 않는다. `load_migration_config`가 수행하는 검증은 `: "${PGSSLMODE:?...}"`(비어있지 않은지만 확인)뿐이며, 값 자체의 안전성은 검증하지 않는다. 따라서 운영자가 `config.env`에서 `PGSSLMODE`를 `disable`/`allow`/`prefer` 등으로 잘못 설정해도 `files-migrate.sh`는 중단되지 않고 `TARGET_DSN`(타깃 Fly Postgres) 접속을 시도할 수 있다 — NFR-004("파일 전송 채널은 TLS/HTTPS 를 사용해야 한다")·SC-014 요구 방어가 022 자체 코드 레벨에서는 누락되어 있다.
  - 즉각적 노출 조건: `config.example.env` 기본값(L14 `export PGSSLMODE=require`)을 그대로 사용하면 문제 없음 — 이 취약점은 misconfiguration(오퍼레이터가 기본값을 완화)을 전제로 한다.
  - 020 스크립트 대비 회귀 성격: 동일 라이브러리를 공유하면서도 새 스크립트가 기존에 존재하던 방어 호출을 누락한 **일관성 결여**가 근본 원인.
- **수정 방향**: `files-migrate.sh`의 `load_migration_config` 호출 직후 `assert_sslmode_require || exit 1`을 추가하여 `extract.sh`/`load.sh`와 동일한 방어 수준을 확보한다.
- **상태**: OPEN (신규)

### SEC-022-02 (Medium)

- **OWASP**: A02:2021 — 암호화 실패, 전송 계층 보호 약화
- **위치**: `scripts/migration/files-migrate.sh` L79 (`R2_ENDPOINT` 구성) 대비 L59 (`LEGACY_S3_ENDPOINT` 검증)
- **설명**: `R2_ENDPOINT`는 스크립트가 `"https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com"`로 **코드 레벨에서 https 강제**하지만, `LEGACY_S3_ENDPOINT`는 `config.env`에서 운영자가 입력한 값을 그대로 사용하며 스킴(scheme)이 `https://`인지 런타임에 검증하는 코드가 없다. `config.example.env` 주석(L59 "전송 채널은 반드시 https:// 를 사용한다")과 정적 테스트(`file-migration-script.spec.ts::test_SC014_config_example_env_endpoints_use_https`)는 **예시 파일의 문자열 존재만** 확인하며, 실제 운영에 사용되는 `config.env`(gitignore 대상이라 정적 테스트 스캔 밖)나 스크립트 런타임 동작은 검증하지 않는다. 따라서 레거시 소스 쪽 전송 채널의 TLS 적용은 순수 운영자 신뢰에 의존한다(코드 레벨 강제 없음) — SC-014의 "설정 검토로 확인" 문구가 정적 테스트 시점에는 예시 파일만 검토하고, 실행 시점 강제는 부재.
- **수정 방향**: `assert_file_migration_config` 함수(files-migrate.sh L58-68)에 `[[ "$LEGACY_S3_ENDPOINT" == https://* ]]` 검증을 추가하여 http:// 스킴 설정 시 즉시 중단하도록 한다.
- **상태**: OPEN (신규)

### 검토했으나 취약점으로 분류하지 않은 항목 (근거 명시)

- **SQL 인젝션(A03)**: `stage_run()`(files-migrate.sh L130-151)이 `${step}`·`${run_id}`·`${elapsed}`를 SQL 문자열에 직접 보간하나, `step`은 `case` 문 리터럴("precheck"/"precopy"/"delta"/"verify"/"url-update")만 전달되고, `run_id`는 직전 `INSERT ... RETURNING id`의 DB 산출값, `elapsed`는 `date +%s` 산술 결과로 모두 **운영자·공격자 통제 밖** 값이다. `url-update`의 `:base`는 psql `-v` 변수 바인딩(`:'base'`, 따옴표 처리)으로 파라미터화되어 있어 인젝션 벡터 없음. → 취약점 아님.
- **자격증명 노출(A02 하위)**: `RCLONE_CONFIG_LEGACYS3_ACCESS_KEY_ID` 등은 `export`된 환경변수로 전달되어 `rclone`의 커맨드라인 인자로 노출되지 않는다(`ps` 비노출, 코드 주석과 실제 구현 일치 확인). `/proc/<pid>/environ` 경유 노출은 동일 UID/root 한정이라 일반적인 컨테이너 단일 프로세스 실행 모델에서 허용 가능한 트레이드오프. → 취약점 아님(설계 의도와 일치).
- **최소권한(A01 하위) — R2 write-scoped 토큰 분리**: `config.example.env`(L72-75)가 앱 런타임 R2 키(021 presign 발급용)와 별도의 write-scoped 이관 전용 토큰 발급을 권장 주석으로 이미 명시하고 있다. 코드가 강제하지 않으나(운영 발급 정책 영역이라 코드 레벨 강제 대상이 아님) 권고로 충분 — 하단 §권고사항에 재확인만 기재.
- **경로 순회(A03 하위) — rclone key 처리**: 복사 대상 key는 `files.files WHERE status='UPLOADED'`에서 추출되며(신규 사용자 입력 경로 아님), S3 호환 오브젝트 스토리지의 key는 파일시스템 경로가 아닌 평면 네임스페이스라 `../` 등 순회 의미론이 성립하지 않는다. → 취약점 아님.
- **SSRF(A10)**: `R2_ENDPOINT`는 `R2_ACCOUNT_ID` + 고정 접미사(`.r2.cloudflarestorage.com`)로 구성되어 임의 URL을 받지 않으며, `LEGACY_S3_ENDPOINT`도 이관 러너를 실행하는 인가된 운영자가 자신의 레거시 인프라 주소를 설정하는 것으로, 외부 공격자가 제어 가능한 입력 경로가 아니다(HTTP API 엔드포인트가 아닌 out-of-band CLI 도구 — plan.md "인가 3축 비해당" 판단과 일치). → 취약점 아님.

---

## GAP-022-02 재평가 (SEC-020-01/02 상속)

design/gaps.md GAP-022-02가 위임한 재평가를 수행했다. 022가 020의 `migration_staging.verification_runs`를 `phase='file-migration'`으로 재사용하며 상속하는 두 감사 부채를 파일 이관 맥락(3중 자격증명 — 레거시 S3 read + R2 write + 타깃 DB write)에서 개별 판정한다.

| 항목 | 판정 | 근거 |
|---|---|---|
| **SEC-020-01** (`migration_staging` 스키마 정리 미자동화) | **CONFIRMED — 022로 인한 악화 없음** | research.md "데이터 모델" 절이 명시하듯 022는 파일 이관용 raw 스테이징 테이블을 신설하지 않는다(`migration_staging`에 신규 PII/결제 데이터 추가 0건). `files-migrate.sh`가 쓰는 것은 기존 `verification_runs`(카운트·상태만 기록) 뿐이다. 즉 SEC-020-01이 우려하는 "PII·결제 원본 29테이블 무기한 잔류" 리스크의 **데이터 범위는 022로 확장되지 않는다**. 부채 자체는 020 스코프에서 그대로 미해소 상태로 남아있으나, 파일 이관이 그 심각도를 높이지 않는다. |
| **SEC-020-02** (감사 로그 행위자 미기록) | **CONFIRMED — 미해소 승계, 심각도는 Medium 유지(재상향 없음)** | `stage_run()`(files-migrate.sh L130-151)의 `INSERT INTO migration_staging.verification_runs (phase, step, status) VALUES ('file-migration', '${step}', 'running')`는 020 `run.sh`의 `stage_run` 패턴을 그대로 복제했으며 실행 행위자(운영자 계정·Fly machine ID) 식별 필드가 없다는 점도 동일하다. **파일 이관 맥락에서의 뉘앙스**: 022는 레거시 S3 read + R2 write + 타깃 DB write **3종** 자격증명을 단일 실행 컨텍스트에서 동시 취급하므로(plan.md "인가 3축" 절 — 이 3중 취급이 상응하는 접근 통제 표면), 사고 발생 시(예: 잘못된 R2 버킷으로 복사, 의도치 않은 `url-update` 재실행) "누가 실행했는가"를 감사 테이블만으로 규명할 수 없는 리스크의 **분모(취급 자격증명 종류)** 가 020(DB 전용) 대비 넓어진다. 다만 (a) 러너가 단일 운영자·Fly one-off machine 순차 실행 전제(research.md "공유 상태·동시성 분석" 확인)라 동시 다자 실행 시나리오는 아니고, (b) `url-update`는 verify GO 판정 이후에만 실행되는 절차적 게이트가 있어(deploy-report.md 확인) 오사용 여지가 이미 좁혀져 있다. 따라서 **심각도를 High로 재상향할 근거는 없으나, "잔여 위험 미확정"으로 남기지 않고 Medium·OPEN·020 스코프 처리 원칙 유지로 확정 판정**한다. |

**처리 방향**: 두 항목 모두 020-data-migration-cutover 스코프의 기존 Medium 부채이며 context.md §6에 이미 등재되어 있다(SEC-020-01·SEC-020-02 행). 022가 신규 GAP을 발생시키지 않으므로 별도 GAP 번호를 신설하지 않고, GAP-022-02 상태를 본 재평가 결과로 갱신한다(하단 gaps.md 반영 완료).

---

## NFR-XXX / SC-XXX 보안 요구사항 이행 현황

| ID | 요구사항 | 이행 여부 | 비고 |
|---|---|---|---|
| NFR-004 | 파일 전송 채널 TLS/HTTPS 사용 | **부분 이행** | R2 측(코드 레벨 https 하드코딩)은 강제됨. 레거시 S3 측(SEC-022-02)과 타깃 DB 측(SEC-022-01)은 운영자 설정 값 신뢰 — 코드 레벨 강제 누락 |
| SC-014 | 이관 전송 채널 설정에 TLS/HTTPS 적용 확인(설정 검토) | 부분 이행 | 정적 테스트가 `config.example.env` **예시 파일**의 https:// 존재만 검증. 실행 시점(`config.env`) 강제는 SEC-022-01/02 수정 전까지 부재 |
| NFR-005 | 이관 실행 이력 감사 가능한 형태로 기록 | 이행(단, 행위자 필드 제외) | `verification_runs` phase='file-migration'으로 단계별 성공/실패·경과시간 기록 확인(SEC-020-02 상속 — 행위자 미기록은 별도 판정 항목) |
| SC-015 | 이관 실행 로그 감사 가능 형태 저장 | 이행 | 상동 |

---

## 권고사항

1. **[필수 권고]** `files-migrate.sh`에 `assert_sslmode_require || exit 1` 호출을 추가하여 020 자매 스크립트와 동일한 TLS 방어 수준을 확보한다(SEC-022-01).
2. **[필수 권고]** `assert_file_migration_config`에 `LEGACY_S3_ENDPOINT`의 `https://` 스킴 런타임 검증을 추가한다(SEC-022-02).
3. **[권고 유지]** `config.example.env`(L72-75)의 R2 write-scoped 이관 전용 토큰 분리 발급 권장을 실 운영 시크릿 프로비저닝 절차(런북 또는 infra.md)에 체크리스트 항목으로 명문화할 것을 권장한다(코드 강제 대상 아님, 운영 정책 영역).
4. **Retrospective 위임**: GAP-022-02(SEC-020-01/02 상속) 재평가 결과 "CONFIRMED, 미해소 승계"를 `context.md §6` 기존 행(SEC-020-01·SEC-020-02)에 022 파일 이관 맥락 각주로 additive 반영할 것을 권고한다(PROC-013-03 원칙 — Medium 이상 미해결 취약점의 context.md §6 등재 유지·후속 처리는 별도 patch spec 또는 main session 결정에 위임).
