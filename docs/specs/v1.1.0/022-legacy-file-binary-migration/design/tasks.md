---
작성: Design Agent
버전: v1.0
최종 수정: 2026-07-06 14:30
상태: 확정
---

# Tasks: 022-legacy-file-binary-migration

> Branch: 022-legacy-file-binary-migration | Date: 2026-07-06 | Plan: [../planning/plan.md](../planning/plan.md)

## 목차

- [전제 조건](#전제-조건)
- [레이어 재정의](#레이어-재정의)
- [태스크 목록](#태스크-목록)
- [Test Authoring Contract](#test-authoring-contract)
- [태스크 입도 가이드](#태스크-입도-가이드)
- [구현 완료 기준](#구현-완료-기준)

---

## 전제 조건

- [x] spec.md 의 모든 [NEEDS CLARIFICATION] 항목이 해소되었는가? → 예(spec.md "미결 사항: 없음").
- [x] plan.md 의 Constitution Gates 가 모두 통과(또는 예외 기재)되었는가? → 예(P-001~007 통과, P-001 예외 1건 사용자 승인 — Discord 2026-07-06).
- [x] CHANGES.md 에서 이전 작업의 "후속 작업 시 주의사항" 확인했는가? → 예(020 #3 파일 바이너리 이월·#5 GAP-020-02 files.files 물리명, 021 #6 R2 실연동 완료).

---

## 레이어 재정의

레이어드 아키텍처 기본값(A DB / B 도메인 / C 인터페이스 / D 테스트)을 **out-of-band 이관 러너** 성격에 맞게 재정의한다. 의존 방향: A → B → C, D 는 A·B·C 산출물을 정적 검증(PPG-1 병렬).

| 레이어 | 재정의 대상 | 근거 |
|---|---|---|
| **A. 데이터 계층** | `sql/30_file_url_update.sql` — `files.files.url` UPDATE·검증 카운트 쿼리(DDL 무변경) | DB 조작 SQL |
| **B. 이관 스크립트·설정·이미지 계층** | `files-migrate.sh`·`config.example.env`·`Dockerfile` | 020 "도메인 계층" 대응 — 이관 실행 로직·설정·실행환경 |
| **C. 운영 인터페이스 계층** | `FILE-MIGRATION-RUNBOOK.md`·`FILE-PRE-ASSESSMENT.md` | 020 "인터페이스 계층" 대응 — 옵션 A 운영 절차가 대외 인터페이스 |
| **D. 테스트 계층** | `apps/backend/test/static/file-migration-*.spec.ts` + `test/test-cases.md` 옵션 A 계약 | 정적 검증 + 실 데이터 옵션 A 계약 |

> **PPG-1 책임 분할**: A·B·C 레이어(T-A01·T-B01~04·T-C01~02) = **4단계 Development**. D 레이어(T-D01~03 + 옵션 A 계약 기록) = **5a Test(AUTHORING)**. 양 Agent 동일 turn 병렬 spawn. D 의 정적 테스트는 AUTHORING 시점에 A·B·C 산출물이 아직 없으면 **하드 assert 로 FAIL**(TDD Red, PROC-014-03 — 조건부 skip 금지).

---

## 태스크 목록

> [P] = 이전 태스크와 병렬 가능. 의존: A → B(T-B01/02 는 T-A01 산출 SQL 경로를 참조) → C. Dockerfile/config(T-B03/04)는 T-A01 과 독립([P]).

### Step 1. 데이터 계층 (A)

- [ ] **T-A01** — files.files url 갱신·검증 SQL 작성
  - 레이어: A
  - 구현 파일: `scripts/migration/sql/30_file_url_update.sql`
  - 관련 요구사항: FR-004, NFR-003
  - 상세:
    - (a) url 갱신(멱등): `UPDATE files.files SET url = :'base' || '/' || key WHERE status = 'UPLOADED';` — `:base` 는 psql 변수(`-v base="$R2_PUBLIC_BASE_URL"`)로 주입. key 컬럼 **무변경**(리키잉 범위 외).
    - (b) 개수 대조 쿼리: `SELECT count(*) FROM files.files WHERE status='UPLOADED';`(R2 실측 개수와 대조 — SC-005/013).
    - (c) url 형식 검증 쿼리: 샘플 행의 `url = base||'/'||key` AND `key` 불변 확인(SC-004).
    - (d) key 목록 추출 쿼리(복사 대상 SoT, `--files-from` 용): `SELECT key FROM files.files WHERE status='UPLOADED' ORDER BY key;`(ADR-004, FR-001 — PENDING 제외).
  - 완료 기준: SQL 파일에 (a)~(d) 4개 쿼리 존재. `WHERE status='UPLOADED'` 필터가 (a)·(d)에 모두 존재(PENDING 제외 단일 지점). url 갱신이 `base||'/'||key` 결정적 함수(멱등). DDL(CREATE/ALTER) 문 0건.

### Step 2. 이관 스크립트·설정·이미지 계층 (B)

- [ ] **T-B01** — files-migrate.sh: precheck / precopy / delta 서브커맨드
  - 레이어: B
  - 구현 파일: `scripts/migration/files-migrate.sh`
  - 관련 요구사항: FR-001, FR-002, FR-003, FR-009, NFR-002
  - 상세:
    - `lib/common.sh` source(run_psql·log_line·mask_dsn·load_migration_config 재사용). 레거시 S3·R2 rclone 설정 로드·검증 추가(config 변수 필수값 `:?` guard).
    - `precheck`: 레거시 버킷 `rclone size --json` 개수·총바이트 실측 + files.files UPLOADED 카운트 + 예상소요 산정 → `FILE-PRE-ASSESSMENT.md` 슬롯/리포트 출력(FR-009).
    - `precopy`: T-A01 (d) key 목록 추출 → `rclone copy <legacy>:<bucket> <r2>:<bucket> --files-from <keylist> --checksum --retries N`(전체 UPLOADED, FR-002). **`--max-duration` 미설정**(NFR-002/SC-012).
    - `delta`: 동일 명령 재실행(윈도우 개시 시점 key 집합) — checksum 일치분 skip, 신규 UPLOADED 만 전송(FR-003, ADR-003).
    - 빈 대상 guard: UPLOADED 0건 시 복사 0건·정상 종료(오류 아님).
  - 완료 기준: 3개 서브커맨드 분기 존재. `--files-from`·`--checksum` 사용, `--max-duration`(전체상한) 부재. `status='UPLOADED'` 필터가 key 추출에 적용. bash 문법 검증(`bash -n files-migrate.sh` 통과).

- [ ] **T-B02** — files-migrate.sh: verify / url-update 서브커맨드 + 실패처리·감사
  - 레이어: B (T-B01 완료 후 — 동일 파일)
  - 구현 파일: `scripts/migration/files-migrate.sh`, `scripts/migration/sql/30_file_url_update.sql`(T-A01 참조)
  - 관련 요구사항: FR-004, FR-005, FR-006, FR-007, NFR-005
  - 상세:
    - `verify`: 개수 대조(R2 `rclone size` vs files.files UPLOADED 카운트, 불일치 0건 GO 게이트) + 샘플 체크섬(1% 또는 100건 중 큰 값, `rclone check --checksum`). **멀티파트(ETag `-N`) 샘플은 `rclone check --download` fallback**(ASM-003 안전망). 리포트 파일 + `verification_runs`(phase='file-migration', step='verify') 기록.
    - `url-update`: `run_psql "$TARGET_DSN" -v base="$R2_PUBLIC_BASE_URL" -f sql/30_file_url_update.sql`(복사 완료 후, FR-004).
    - 실패처리(FR-006): rclone `--retries` 개별 재시도 + 실패 key 목록 캡처(로그 파싱/`--files-from` 재대조), 전체 미중단. 잔존 실패 시 사전평가 리포트에 목록 + "컷오버 개시 전 사용자 재확인 필요" 문구 출력(FR-007).
    - 감사(NFR-005): `stage_run` 패턴 복제(020 run.sh 참조 — phase='file-migration'). 파일별 성공/실패/재시도 수·검증결과를 구조적 로그 + `verification_runs`. PII·자격증명 마스킹(mask_dsn).
  - 완료 기준: verify·url-update 서브커맨드 존재. 개수 대조 + 샘플 체크섬 + 멀티파트 fallback 분기 존재. 실패목록 캡처 + FR-007 재확인 문구 경로 존재. `verification_runs` INSERT/UPDATE 존재. `bash -n` 통과.

- [ ] **T-B03** `[P]` — Dockerfile rclone 확장 + docker build 검증
  - 레이어: B
  - 구현 파일: `scripts/migration/Dockerfile`
  - 관련 요구사항: FR-010
  - 상세:
    - `RUN apk add --no-cache curl` → `curl rclone` 로 확장(또는 별도 RUN 라인). community 레포 미활성 시 대안(레포 라인 추가 또는 rclone 정적 바이너리 curl 다운로드) — **신규 별도 이미지 도입 금지**(020 이미지 확장만).
    - `RUN chmod +x` 에 `/migration/files-migrate.sh` 추가.
  - 완료 기준: `apk add` 에 rclone 존재(또는 대안 설치 라인). 별도 신규 이미지 파일 0건(FR-010/SC-010). **[PATCH-020-01/PROC-003 docker.md] `docker build -f scripts/migration/Dockerfile -t doa-migration-runner scripts/migration` 1회 성공 + `docker run --rm doa-migration-runner rclone version` 정상 출력 확인**(정적 리뷰로 못 잡는 community 레포 가용성 실증 — GAP-022-01). 빌드 검증은 Development(§G 런타임 1회 검증) 또는 Deploy Agent 가 수행하며 완료기준에 결과 박제.

- [ ] **T-B04** `[P]` — config.example.env 레거시 S3·R2 rclone 설정 확장
  - 레이어: B
  - 구현 파일: `scripts/migration/config.example.env`
  - 관련 요구사항: FR-008(간접), NFR-004
  - 상세:
    - 레거시 S3 rclone remote 설정 키(엔드포인트·리전·버킷·access/secret 변수, 실값 미기재 — `[TO-VERIFY]` 슬롯).
    - R2 rclone remote 설정 키(021 `R2_*` 재사용 + 이관용 write-scoped 토큰 분리 권장 주석 — Security Agent).
    - `R2_PUBLIC_BASE_URL`(url 갱신 base, 021 설정).
    - 전송 채널 TLS/HTTPS: 레거시·R2 엔드포인트가 `https://` 이고 rclone TLS 검증 활성(평문 금지 주석, NFR-004/ADR-009).
  - 완료 기준: 레거시 S3·R2·`R2_PUBLIC_BASE_URL` 설정 키 존재. 엔드포인트가 `https://`. 실 자격증명 원문 미기재(`<...>`/`[TO-VERIFY]` 슬롯). `config.env` 커밋 금지 주석 존재(020 관례).

### Step 3. 운영 인터페이스 계층 (C)

- [ ] **T-C01** — 파일 이관 런북 작성 (옵션 A 실행 절차)
  - 레이어: C (T-B01/02 완료 후 — 서브커맨드 참조)
  - 구현 파일: `scripts/migration/FILE-MIGRATION-RUNBOOK.md`
  - 관련 요구사항: FR-008, NFR-001
  - 상세:
    - 러너 이미지 준비(T-B03 빌드) → precheck → precopy(윈도우 전) → 020 컷오버 윈도우 내 delta·verify·url-update 통합 배치 시퀀스.
    - **레거시 S3 자격증명·버킷 접근이 필요한 단계마다 "사용자 환경 실행 → 결과(리포트) 전달 → 검증" 절차 명시**(옵션 A, SC-008).
    - 60분 윈도우 공유(NFR-001) 체크포인트 — 020 RUNBOOK.md 컷오버 시퀀스와의 통합 지점 명시.
    - R2 공개 접근(`R2_PUBLIC_BASE_URL`) 사전점검 항목(US-005).
  - 완료 기준: precheck/precopy/delta/verify/url-update 단계별 절차 존재. S3 접근 단계마다 "사용자 실행→전달→검증" 문구 존재(SC-008). 020 윈도우 통합 체크포인트 존재. markdown 목차 포함(markdown.md).

- [ ] **T-C02** — 사전평가 리포트 템플릿 작성
  - 레이어: C
  - 구현 파일: `scripts/migration/FILE-PRE-ASSESSMENT.md`
  - 관련 요구사항: FR-009, FR-007
  - 상세:
    - 레거시 파일 **총 개수·총 용량 실측값·예상 소요 시간** 기재 슬롯(FR-009/SC-009).
    - 잔존 실패 목록 슬롯 + "컷오버 개시 전 사용자 재확인 필요" 문구(FR-007/SC-007).
    - 예상 전송량(레거시 egress 비용 인지) + 멀티파트 ETag 형식 샘플 확인 항목(ASM-003).
    - 옵션 A 실측 주입 안내(레거시 실 DDL/규모 파이프라인 접근 불가 — 020 관례).
  - 완료 기준: 총개수·총용량·예상소요 3항목 슬롯 존재(SC-009). 잔존실패 목록 + "재확인 필요" 문구 존재(SC-007). markdown 목차 포함.

### Step 4. 테스트 계층 (D) — 5a Test(AUTHORING) 책임

> 본 Step 은 **5a 단계 Test Agent(AUTHORING)** 가 PPG-1 시작 시 수행한다. Development Agent(4단계)는 본 Step 외(A·B·C)만 진행. 정적 테스트는 AUTHORING 시점 하드 assert(파일 부재 시 FAIL — TDD Red).

- [ ] **T-D01** — 런북 정적 검증 테스트
  - 레이어: D
  - 테스트 파일: `apps/backend/test/static/file-migration-runbook.spec.ts`
  - 검증 대상: SC-008
- [ ] **T-D02** — 사전평가 리포트 정적 검증 테스트
  - 레이어: D
  - 테스트 파일: `apps/backend/test/static/file-migration-pre-assessment.spec.ts`
  - 검증 대상: SC-007, SC-009
- [ ] **T-D03** — 스크립트·설정·이미지 정적 검증 테스트
  - 레이어: D
  - 테스트 파일: `apps/backend/test/static/file-migration-script.spec.ts`
  - 검증 대상: SC-010, SC-012, SC-014
- [ ] **T-D04** — 옵션 A 실행 계약 기록 (실 데이터 SC)
  - 레이어: D
  - 산출물: `test/test-cases.md` "옵션 A 실행 계약" 절
  - 검증 대상: SC-001·002·003·004·005·006·011·013·015 (integration/e2e-db) — 실 레거시 S3 접속 필요, 파이프라인 자동 실행 불가. 산출물(스크립트·SQL·문서) 완결성 대조로 계약 검증(020 선례). 5b 가 실 산출물 대조로 거짓 green 없음 확인.

---

## Test Authoring Contract

> **PPG-1 의 5a 단계 Test(AUTHORING) 입력 contract**. AUTHORING 은 Development(4)와 병렬이라 산출물을 보지 못한 채 심볼을 가정한다 — 아래 **canonical 심볼·경로·필수 문구**로 가정 불일치([B])를 사전 차단한다(PROC-004).

### canonical 하네스 전제 (PROC-014-03)

- **경로 기준**: 정적 테스트는 `apps/backend/test/static/` 위치 → repo-root 상대 `path.resolve(__dirname, '../../../../scripts/migration/...')` 사용(020 `migration-config.spec.ts` 선례 동일). `Directory.current`/`process.cwd()` 가정 금지.
- **하드 assert**: 파일 부재 시 `expect(fs.existsSync(...)).toBe(true)` 로 FAIL(조건부 skip anti-pattern 금지). AUTHORING 시점 Red → Development 산출 후 Green.
- **플랫폼 채널·secure storage 의존 없음**: 순수 `fs.readFileSync` 텍스트 검증(백엔드 bash/문서 대상, UI 위젯 무관).
- **jest 정적 스위트**: `apps/backend/test/static/` 기존 패턴 승계(별도 harness·DB 기동 불요).

### SC → 테스트 매핑

| SC-ID | 수용 기준 | 유형 | 테스트 파일 / 산출물 | canonical 검증 대상(파싱 토큰·심볼) |
|---|---|---|---|---|
| SC-007 | 잔존 실패 시 사전평가에 목록+"재확인 필요" 문구 | Error(static) | `test/static/file-migration-pre-assessment.spec.ts` | `scripts/migration/FILE-PRE-ASSESSMENT.md` 에 "재확인" + "잔존 실패"(또는 실패 목록) 문구 |
| SC-008 | 런북에 S3 접근 단계마다 "사용자실행→전달→검증" | Happy(static) | `test/static/file-migration-runbook.spec.ts` | `scripts/migration/FILE-MIGRATION-RUNBOOK.md` 에 "사용자 환경 실행"·"결과 전달"·"검증" 라벨(최소 출현) |
| SC-009 | 사전평가에 총개수·총용량·예상소요 | Happy(static) | `test/static/file-migration-pre-assessment.spec.ts` | `FILE-PRE-ASSESSMENT.md` 에 "총 개수"·"총 용량"·"예상 소요" 3항목 헤더/컬럼 |
| SC-010 | Dockerfile rclone 1줄 + 별도 이미지 0 | Happy(static) | `test/static/file-migration-script.spec.ts` | `scripts/migration/Dockerfile` 에 `rclone` 토큰 존재; `scripts/migration/` 하위 신규 `Dockerfile*` 1개(020 것)뿐 |
| SC-012 | precopy 에 `--max-duration` 등 전체상한 미설정 | Edge(static) | `test/static/file-migration-script.spec.ts` | `scripts/migration/files-migrate.sh` 에 `--max-duration` **부재** + `--files-from`·`--checksum` **존재** |
| SC-014 | 전송채널 TLS/HTTPS | Happy(static) | `test/static/file-migration-script.spec.ts` | `config.example.env` 엔드포인트 `https://` + 평문/http 금지 |
| SC-004 | R2 key==레거시 key, url=base+key | Happy(integration) | `test/test-cases.md` 옵션 A 계약 + `sql/30_file_url_update.sql` 정적 갈음(url=`base||'/'||key`) | 옵션 A + SQL 결정적 함수 형태 대조 |
| SC-006 | 실패 주입 시 미중단·목록·재시도 | Error(integration) | `test/test-cases.md` 옵션 A 계약 | `files-migrate.sh` `--retries`·실패목록 캡처 경로 대조 |
| SC-015 | 이관 로그 감사 형태 저장 | Happy(integration) | `test/test-cases.md` 옵션 A 계약 | `verification_runs`(phase='file-migration') INSERT/UPDATE 경로 대조 |
| SC-001 | UPLOADED 전건 R2 존재, PENDING 제외 | Happy(e2e-db) | `test/test-cases.md` 옵션 A 계약 | 실 레거시 S3 접속 — 사용자 실행+결과 전달 |
| SC-002 | 사전복사 100% 이관 | Happy(e2e-db) | `test/test-cases.md` 옵션 A 계약 | 동상 |
| SC-003 | 윈도우 내 델타만 추가 이관 | Edge(e2e-db) | `test/test-cases.md` 옵션 A 계약 | 동상(멱등 skip) |
| SC-005 | 개수 100% + 샘플 체크섬 일치 | Happy(e2e-db) | `test/test-cases.md` 옵션 A 계약 | 동상(멀티파트 fallback 포함) |
| SC-011 | 델타 소요 ≤60분(NFR-001) | Edge(e2e-db) | `test/test-cases.md` 옵션 A 계약 | 실행/리허설 로그 |
| SC-013 | 컷오버 개시 개수 대조 불일치 0 | Happy(e2e-db) | `test/test-cases.md` 옵션 A 계약 | 동상 |

> **canonical 서브커맨드명 고정**(PROC-004 — 정적 테스트·문서·스크립트 동일 참조): `files-migrate.sh` 의 서브커맨드 = `precheck` / `precopy` / `delta` / `verify` / `url-update`. **canonical 파일명**: 스크립트 `scripts/migration/files-migrate.sh`, SQL `scripts/migration/sql/30_file_url_update.sql`, 런북 `scripts/migration/FILE-MIGRATION-RUNBOOK.md`, 사전평가 `scripts/migration/FILE-PRE-ASSESSMENT.md`. 정적 테스트 3종은 `apps/backend/test/static/file-migration-{runbook,pre-assessment,script}.spec.ts`. Development(B·C)와 Test(D)는 이 canonical 을 단일 참조한다(가정 발산 차단).

---

## 태스크 입도 가이드

- T-B01·T-B02 는 동일 파일(`files-migrate.sh`)의 서브커맨드 분할이나 책임(복사 vs 검증·갱신·감사)이 달라 별도 태스크. 순차 의존(T-B02 는 T-B01 뼈대 위에 추가).
- 단일 파일 3개 초과 태스크 없음. 호출 측 5개 이상 영향 태스크 없음(앱 코드 무변경).

## 구현 완료 기준

- [ ] 모든 태스크 체크박스 완료(A·B·C = Development, D = Test AUTHORING).
- [ ] `[TypeScript/Jest]` `pnpm --filter backend test -- file-migration` 정적 스위트 전건 PASS(D 레이어, 실 데이터 SC 제외).
- [ ] `[bash]` `bash -n scripts/migration/files-migrate.sh` 문법 검증 통과.
- [ ] `[Docker]` `docker build -f scripts/migration/Dockerfile -t doa-migration-runner scripts/migration` 성공 + `rclone version` 확인(T-B03, GAP-022-01).
- [ ] SC-001~015 전건 태스크 매핑(정적 6건 자동 검증 + 옵션 A 계약 9건).
- [ ] `git status` 의도치 않은 파일 없음(`config.env`·`migration-run/` 커밋 금지 확인).
