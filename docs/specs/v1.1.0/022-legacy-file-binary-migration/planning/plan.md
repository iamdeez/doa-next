---
작성: Planning Agent
버전: v1.0
최종 수정: 2026-07-06 14:10 (spawn 기준 — date 도구 미제공, §10/PROC-016-02)
상태: 확정
---

# Plan: 022-legacy-file-binary-migration

> Branch: 022-legacy-file-binary-migration | Date: 2026-07-06 | Spec: [../spec/spec.md](../spec/spec.md)

## 목차

- [사전 검증 (Constitution Gates)](#사전-검증-constitution-gates)
- [기술 컨텍스트](#기술-컨텍스트)
- [사전 영향도 분석 결과](#사전-영향도-분석-결과)
- [핵심 설계](#핵심-설계)
  - [S1. 전체 아키텍처 — 오브젝트 복사 파이프라인 (020 러너 재사용)](#s1-전체-아키텍처--오브젝트-복사-파이프라인-020-러너-재사용)
  - [S2. 컷오버 통합 시퀀스 (사전복사 / 델타)](#s2-컷오버-통합-시퀀스-사전복사--델타)
  - [S3. 델타 캡처 전략 (updatedAt 부재 대응)](#s3-델타-캡처-전략-updatedat-부재-대응)
  - [S4. 정합성 검증 하네스](#s4-정합성-검증-하네스)
  - [S5. 실패 처리 · 부분 성공 · key/url 갱신](#s5-실패-처리--부분-성공--keyurl-갱신)
- [결정 기록 (ADRs)](#결정-기록-adrs)
- [인터페이스 계약](#인터페이스-계약)
- [데이터 모델](#데이터-모델)
- [위험 완화 설계 (PATCH-A06)](#위험-완화-설계-patch-a06)
- [배포 환경 영향 (PROC-009)](#배포-환경-영향-proc-009)
- [외부 도구 동작 검증 (핵심원칙 10)](#외부-도구-동작-검증-핵심원칙-10)
- [테스트 전략](#테스트-전략)
- [기타 고려사항](#기타-고려사항)

---

## 사전 검증 (Constitution Gates)

> `.claude/docs/constitution.md` P-001~P-007 을 기준으로 검증한다. constitution 수치·조건이 무조건 우선한다.
> 본 spec 은 020 과 동일하게 **NestJS 런타임 밖에서 동작하는 일회성 out-of-band 이관 도구**를 설계한다(레거시 오브젝트 스토리지 → R2 바이너리 복사 + `files.files.url` 갱신). 이 성격이 P-001·P-002·P-004 판정에 반영된다.

- [x] **P-001 모듈 경계 원칙**: [Pass 기준: 신규 도메인 모듈이 타 스키마 테이블을 직접 참조하지 않음]
  → 이관 러너는 **도메인 모듈이 아니다**(020 선례 동일). 신규/수정되는 NestJS 도메인 모듈은 없음(`file` 모듈 코드 무변경). **예외 기재**(아래) — url 갱신을 위해 러너가 `files.files` 에 직접 `UPDATE` 한다(단일 스키마·단일 컬럼, 도메인 서비스 경유 시 부작용·처리량 부적합).
- [x] **P-002 AWS 의존 금지 원칙**: [Pass 기준: `@aws-sdk/*` 등 AWS 전용 패키지·서비스 신규 추가 0건]
  → **PASS**. 복사 도구로 **vendor-neutral S3 호환 클라이언트(`rclone`, ADR-001)** 를 러너 이미지에 추가한다 — `@aws-sdk/*` npm 신규 추가 0건, AWS DataSync/DMS/S3 Batch 등 AWS 전용 관리형 서비스 미도입. 레거시 AWS S3 는 **표준 S3 API**(`--endpoint-url`)로 read 만 하며, 이는 020 이 레거시 RDS 를 표준 PostgreSQL 프로토콜로 접속한 것과 동형(레거시 원본 접근은 이관 본질상 불가피하되 AWS 전용 API 결합이 아님). aws-cli 는 대안에서 **미채택**(P-002/P-004 브랜드 결합 회피 — ADR-001).
- [x] **P-003 단일 DB 원칙**: [Pass 기준: 단일 PostgreSQL 외 신규 외부 저장소 0건]
  → **PASS**. 타깃 오브젝트 스토리지(R2)는 021 에서 이미 도입된 기존 저장소. 신규 데이터 저장소 없음. 러너 감사 기록은 020 이 만든 기존 `migration_staging.verification_runs`(동일 Fly Postgres 내) 재사용.
- [x] **P-004 클라우드 중립 원칙**: [Pass 기준: Fly.io 전용 API 에 비즈니스 로직 결합 0건]
  → **PASS**. `rclone` 은 소스(레거시 S3)·목적지(R2) 양단을 **표준 S3 API** 로 다루는 클라우드 중립 도구다(aws-cli 대비 브랜드 비결합 — P-004 강화). 러너 실행 위치(Fly one-off machine)는 인프라 레이어 결정이며 복사 로직 자체는 플랫폼 독립.
- [x] **P-005 결제·정산 정합성 원칙**: [Pass 기준: 금전 상태 변경이 outbox+멱등성 없이 처리되지 않음 / 금전 연산은 Decimal·정수만]
  → **PASS(예외 불요)**. 본 spec 은 파일 바이너리(상품·리뷰·프로필 이미지)만 다루며 금전 레코드·연산에 관여하지 않는다. `payments`/`settlements` 스키마 무접근.
- [x] **P-006 테스트 원칙**: [Pass 기준: SC-XXX 없는 FR-XXX 0건]
  → **PASS**. FR-001~010 전부 SC-001~015 매핑 존재(spec.md 요구사항 구조화 매트릭스, "매핑 누락: SC 없는 FR 0건"). NFR-001~005 도 SC 매핑 존재.
- [x] **P-007 스펙 범위 원칙**: [Pass 기준: spec.md 범위 외 변경 파일 0건]
  → **PASS**. 산출물은 `scripts/migration/` 내 파일 이관 스크립트·설정·런북 확장 + `files.files.url` 데이터 갱신에 한정. 기존 18개 도메인 모듈 코드·`schema.prisma` DDL 무변경. 레거시 스토리지 해체·key 리키잉은 범위 외(spec.md 명시).

### 예외 사항

- **P-001 (모듈 경계)**: 이관 러너가 `files.files` 테이블에 직접 `UPDATE`(url 갱신) 한다.
  - 근거: url 갱신(FR-004)은 바이너리 복사 완료에 종속된 벌크 데이터 조작이다. `file` 도메인 서비스 API 를 경유하면 (a) 부작용(presign·이벤트) 유발, (b) 처리량 부적합, (c) url 재작성용 공개 API 자체가 부재.
  - 대안·완화: 러너는 **앱 런타임과 분리된 일회성 도구**로만 존재하고 프로덕션 도메인 모듈에 편입하지 않는다(P-007 유지). UPDATE 는 `status='UPLOADED'` 행에 한정하고 멱등(`url = R2_PUBLIC_BASE_URL || '/' || key` 재실행 안전). 020 이 이미 확립한 out-of-band 러너 직접 write 예외의 연장선.

> 위 1건 예외는 020 이 승인받은 out-of-band 러너 직접 write 예외와 동형의 **spec 성격상 불가피한 구조적 예외**이며 constitution 수치 완화가 아니다. main session 이 사용자 승인(Plan Mode) 시 본 예외를 함께 제시한다.

---

## 기술 컨텍스트

- **언어 / 런타임**: 이관 스크립트 — bash(020 러너 관례 승계) + 표준 S3 호환 CLI(`rclone`). DB 조작(key 목록 추출·url 갱신·검증 카운트)은 `psql`(020 `lib/common.sh::run_psql` 재사용).
- **주요 의존성**: `rclone`(러너 이미지에 `apk add rclone` 로 추가 — ADR-002)·`psql`/`curl`(020 러너 이미지 기존 포함). **신규 npm 의존성 0건**(앱 코드 무변경). `rclone` 은 npm 이 아닌 **시스템 CLI**(alpine 패키지)이며, 020 러너 이미지 확장(FR-010)으로만 도입된다 — P-002(npm `@aws-sdk/*` 신규 추가 아님)·P-004(vendor-neutral) 준수.
- **테스트 프레임워크**: Jest(기존 backend) — 정적 검증(런북·설정·스크립트 완결성, `test/static/`). 통합/E2E-db 는 실 레거시 S3·R2 접속 필요 → **옵션 A(사용자 실행 + 결과 전달)**(테스트 전략 절 참조).
- **소스 / 타깃 토폴로지**: 소스 = 레거시 AWS S3(또는 S3 호환 오브젝트 스토리지, ASM-001 [TO-VERIFY] 버킷·리전·엔드포인트). 타깃 = Cloudflare R2 버킷(021 `R2_*` 설정, `<account>.r2.cloudflarestorage.com` S3 호환 엔드포인트). 키 목록의 SoT = 신규 Fly Postgres `files.files`(status='UPLOADED', 020 이 이미 메타 이관).
- **실행 위치**: 020 전용 러너 이미지(`scripts/migration/Dockerfile`, postgres:16-alpine + curl + **rclone 확장**)를 Fly.io one-off machine 에서 실행(ADR-002 승계, R2·타깃 Postgres 접근).
- **외부 라이브러리 동작 검증(핵심원칙 10)**: `rclone` 의 S3↔R2 복사·멱등 skip·checksum 동작을 "외부 도구 동작 검증" 절에서 확인(silent-failure 한계 = 멀티파트 ETag, PATCH-A07 명시).

---

## 사전 영향도 분석 결과

### 영향 파일 목록 (신규 산출물 — 기존 앱 코드 무변경)

| 파일(예정 경로) | 변경 유형 | 영향 내용 |
|---|---|---|
| `scripts/migration/files-migrate.sh` (신규 예상) | 신규 | 파일 바이너리 이관 오케스트레이션(precheck·precopy·delta·verify·url-update 서브커맨드). `lib/common.sh` source 재사용(run_psql·log_line·stage_run 패턴·load_migration_config) |
| `scripts/migration/Dockerfile` | **수정** | `apk add rclone` 1줄 추가(020 이미지 확장, 신규 이미지 아님 — FR-010/SC-010). curl 추가와 동형 |
| `scripts/migration/config.example.env` | **수정** | 레거시 S3(엔드포인트·버킷·리전·자격증명 변수명)·R2 rclone remote 설정 키 추가(실값 미기재 — 020 관례) |
| `scripts/migration/sql/30_file_url_update.sql` (신규 예상) | 신규 | `files.files.url` 갱신(FR-004) + 검증 카운트 쿼리. `files.files` DDL 무변경(url 컬럼 기존재) |
| `docs/specs/v1.1.0/022-.../design/*` (runbook·pre-assessment 확장) | 신규(Design/Deploy) | 파일 이관 런북 절차(옵션 A 실행 단계)·사전평가 리포트 템플릿(FR-009) |
| `apps/backend/test/static/file-migration-*.spec.ts` (신규 예상) | 신규(Test) | SC-007·008·009·010·012·014 정적 검증 |
| `apps/backend/prisma/schema.prisma` | **무변경** | `files.files`(url·key·status 컬럼) 이미 존재. 이관은 데이터만 |
| 기존 18개 도메인 모듈 | **무변경** | 런타임 코드 변경 없음(P-007) |

> 실제 산출물 경로·파일 구성은 Design Agent 가 tasks.md 로 확정한다. 위는 Planning 관점 예상 영향 범위. 020 러너 파일(`run.sh`·`extract.sh`·`load.sh`·`lib/common.sh`·`sql/*.sql`·`delta-classes.conf`)은 **DB 이관 전용이므로 022 가 수정하지 않는다**(파일 이관은 별도 스크립트로 분리 — 단일 책임).

---

## 핵심 설계

> 작성 깊이: Design Agent 가 추가 설계 판단 없이 tasks.md 로 분해 가능한 수준. 레거시 S3 실 버킷·키 구조는 [TO-VERIFY](ASM-001/002)이며 옵션 A 로 실행 시점 확정 — 본 절은 **복사·델타·검증 방법론과 020 재사용 지점**을 확정한다.

### S1. 전체 아키텍처 — 오브젝트 복사 파이프라인 (020 러너 재사용)

020 은 관계형 데이터의 재구조화(비-1:1 매핑) 때문에 스테이징 기반 ETL 이 필요했다. **파일 바이너리는 재구조화가 없다** — 레거시 key = R2 key(FR-004, 키 그대로). 따라서 ETL/스테이징이 불요하며, "복사할 key 목록 확정 → 오브젝트 복사 → url 갱신 → 검증"의 단순 파이프라인이다.

```
[레거시 오브젝트 스토리지]            [신규 Fly Postgres]        [Cloudflare R2]
 (AWS S3 등, ASM-001)                 files.files              (021, R2_* 설정)
        │                            (status='UPLOADED')            │
        │  ② rclone copy (S3 API)         │ ① key 목록 추출          │
        │    소스 key → R2 동일 key         │  (run_psql, SoT)         │
        └──────────────────────────────────┼──────────────────────────►
                                            │  ③ url UPDATE            │
                                            │  (files.files.url         │
                                            │   = R2_PUBLIC_BASE_URL/key)│
                                            └──────────────────────────┘
                                            ④ Verify (count·sample checksum)
```

- **① key 목록 추출**: 신규 `files.files WHERE status='UPLOADED'` 의 `key` 컬럼이 복사 대상의 **단일 소스**(ADR-004). 020 이 이미 메타를 이관했으므로 신규 DB 가 권위 목록. `status='PENDING'` 제외(FR-001). `run_psql "$TARGET_DSN"` 재사용.
- **② rclone copy**: 레거시 S3 → R2 오브젝트 복사(ADR-001). 소스 key 를 목적지 key 로 그대로 사용(FR-004). `rclone copy` 는 **이미 존재하고 checksum 일치하는 객체를 skip**(멱등) — 재실행·델타 안전(ADR-003). key 목록을 `--files-from` 으로 전달(files.files 에 없는 레거시 고아 객체는 복사 안 함 → PENDING/미참조 객체 자동 배제).
- **③ url 갱신**: 복사 완료 후 `UPDATE files.files SET url = :base || '/' || key WHERE status='UPLOADED'`(ADR-005, FR-004). key 무변경. 멱등.
- **④ Verify**: S4 정합성 하네스(개수 100% + 샘플 체크섬).

> **왜 스테이징이 불요한가(020 과의 차이)**: 파일은 (a) 비-1:1 재구조화가 없고(key 동일), (b) `rclone` 이 소스→목적지 직접 복사하며 멱등 skip 을 내장하므로 020 의 스테이징+UPSERT 역할을 도구가 대체한다. 감사 하네스(`verification_runs`)와 러너 이미지·`common.sh` 헬퍼는 그대로 재사용.

### S2. 컷오버 통합 시퀀스 (사전복사 / 델타)

파일 이관은 020 컷오버 윈도우와 **2구간**으로 정렬된다(US-001/002):

| 구간 | 시점 | 시간 제약 | 서브커맨드(예상) | 내용 |
|---|---|---|---|---|
| 사전 대량복사 | 020 윈도우 개시 **전** | **없음**(NFR-002) | `files-migrate.sh precopy` | UPLOADED 전건 복사. 실패는 재시도(FR-006), 잔존 실패는 사전평가 리포트(FR-007) |
| 사전 실측 | precopy 전 | — | `files-migrate.sh precheck` | 레거시 총 개수·총 용량·예상소요(FR-009/SC-009) |
| 최종 델타 | 020 윈도우 **내** | **≤60분**(NFR-001, 020 윈도우 공유) | `files-migrate.sh delta` | precopy 이후 신규 UPLOADED 객체만 복사(rclone skip 으로 자동 델타) |
| 검증·url 갱신 | 델타 직후 | — | `files-migrate.sh verify` / url-update | 개수 100%(SC-005/013)·샘플 체크섬·url 갱신 |

- **020 윈도우 공유(NFR-001)**: 파일 델타는 020 DB 델타와 **동일 60분 윈도우** 안에서 수행된다. Deploy Agent 가 런북에서 020 컷오버 시퀀스의 체크포인트로 파일 델타·검증 단계를 통합 배치한다(레거시 쓰기 차단 = 020 단계 1 이후 신규 업로드 0 전제 → 델타는 precopy↔윈도우개시 사이 gap 분만).
- **NFR-002 무제약 강제 부재**: precopy 서브커맨드에는 타임아웃 기반 자동 중단 로직을 두지 않는다(SC-012 정적 검증). rclone `--timeout` 은 **개별 요청** 타임아웃(무응답 커넥션 방어)일 뿐 전체 작업 상한이 아니며, 전체 상한 플래그(`--max-duration`)는 **설정하지 않는다**.

### S3. 델타 캡처 전략 (updatedAt 부재 대응)

> **설계 발견(schema.prisma 실측)**: `FileAsset`(`files.files`)은 `createdAt` 만 보유하고 **`updatedAt` 부재**(L779). 상태는 confirm 시 `PENDING → UPLOADED` 로 *갱신*되나 갱신 timestamp 가 없다 — 020 의 (C)부류(갱신형 + timestamp 부재)와 동형 문제.

파일 델타는 020 처럼 워터마크 SQL 로 잡지 않고 **도구 멱등성으로 해소**한다:

- **델타 = 전체 UPLOADED key 집합 재복사, rclone 이 기존 일치 객체를 skip**. 윈도우 개시 시점의 `files.files WHERE status='UPLOADED'` 전건을 `--files-from` 으로 재전달하면, precopy 에서 이미 복사된 객체는 checksum 일치로 전송 생략되고 **precopy 이후 새로 UPLOADED 가 된 객체만 실제 전송**된다(ADR-003). 이는 020 의 `ON CONFLICT DO UPDATE` 멱등(전체 재적재 후 변경분만 반영)과 동형 전략이다.
- **`createdAt` 워터마크를 쓰지 않는 이유**: precopy 이전에 생성(`createdAt`)됐으나 PENDING 이던 레코드가 precopy↔윈도우 사이에 confirm(→UPLOADED)되면 `createdAt` 워터마크는 이를 놓친다. 전체 key 집합 재복사(멱등 skip)는 이 경계를 자연 흡수한다.
- **삭제(고아) 탐지**: files.files 에서 사라진 key 는 `--files-from` 목록에 없어 복사 대상에서 자연 제외. R2 측 잔존 객체 삭제(mirror)는 **범위 외**(spec.md — 레거시 해체·정리 후속). 개수 대조(S4)는 R2 실측 vs files.files UPLOADED 기준으로 방향을 고정한다.

### S4. 정합성 검증 하네스

FR-005 의 (a)개수 + (b)샘플 체크섬을 리포트로 산출(NFR-005 감사 기록, 020 `verification_runs` 재사용).

1. **(a) 개수 대조**(NFR-003, 불일치 0건): R2 버킷 실측 객체 수(`rclone size --json` 또는 files.files key 목록 존재 확인 `rclone lsf`/head) vs `files.files WHERE status='UPLOADED'` 카운트. **100% 일치**가 GO 게이트(SC-005/013). 방향: files.files UPLOADED 전건이 R2 에 존재해야 함(누락 0).
2. **(b) 샘플 체크섬**(SC-005): 무작위 샘플(**전체 UPLOADED 의 1% 또는 100건 중 큰 값** — files 단일 스키마이므로 020 "스키마당" 을 전체 기준으로 적용, spec.md SC-005 문구 승계)에 대해 레거시 ETag/MD5 vs R2 ETag 비교. `rclone check --checksum`(양단 해시 대조) 활용.
   - **멀티파트 ETag 한계(ASM-003, PATCH-A07 silent-failure)**: S3 멀티파트 업로드 객체의 ETag 는 단순 MD5 가 아니라 파트 해시들의 해시-of-hashes 다. 레거시·R2 의 파트 경계가 다르면 ETag 가 불일치할 수 있다 → **안전망**: 멀티파트로 판정된(ETag 에 `-N` 파트 접미사 존재) 샘플 객체는 `rclone check --download`(실 콘텐츠 바이트 비교) 또는 콘텐츠 해시 재계산으로 대체 검증. 이 fallback 을 검증 스크립트에 명시(FR-005 완결).
3. **url 갱신 검증**(SC-004): 샘플 `files.files` 행의 `url` 이 `R2_PUBLIC_BASE_URL || '/' || key` 형태이고 `key` 가 레거시와 동일함을 SQL 로 확인.

> 검증 리포트는 파일(JSON/MD) + `migration_staging.verification_runs`(phase='file-migration') 로 저장(NFR-005, SC-015). GO 게이트: (a)·(b) 전부 PASS(FR-005).

### S5. 실패 처리 · 부분 성공 · key/url 갱신

- **부분 성공(FR-006/SC-006)**: `rclone copy --retries N --retries-sleep` 로 개별 객체 실패를 재시도하되, 전체 작업을 중단하지 않는다(rclone 기본 동작 = 실패 객체 skip 후 계속, 종료코드로 실패 여부 반환). 실패 객체 목록을 `--files-from` 재시도용 파일로 캡처(`rclone copy ... 2>&1` 에서 실패 key 추출 또는 `--error-on-no-transfer` 미사용 + 로그 파싱).
- **잔존 실패 사전 확인(FR-007/SC-007)**: precopy 재시도 후에도 미해소 실패가 남으면 **사전평가 리포트에 잔존 실패 목록 + "컷오버 개시 전 사용자 재확인 필요" 문구**를 포함(정적 검증 SC-007). 020 의 FR-012 사용자 재확인 게이트와 동형.
- **key/url 갱신(FR-004/SC-004)**: 복사 완료 후 `sql/30_file_url_update.sql` 로 `UPDATE files.files SET url = :base || '/' || key WHERE status='UPLOADED'`(멱등). key 컬럼 무변경(리키잉 범위 외). `:base` 는 `R2_PUBLIC_BASE_URL`(021 설정) 주입.
- **감사(NFR-005/SC-015)**: `stage_run` 패턴(020 `run.sh`) 재사용 — 각 서브커맨드 시작·종료 시각·상태·파일별 성공/실패/재시도 수를 구조적 로그 + `verification_runs` 양측 기록. PII·자격증명 원문 미기재(020 `mask_dsn`·마스킹 관례 승계).

---

## 결정 기록 (ADRs)

> spec.md 요구사항 구조화 매트릭스의 FR/NFR 행을 plan 결정에 매핑한다. Design Agent research.md "기술 선택 조사"와 cross-reference. ADR 미작성 결정이 design 단계에 발견되면 status: BLOCKED 로 Planning 복귀.

| ADR-ID | 결정 항목 | 채택안 | 대안 (검토·미채택) | 근거 (spec FR/NFR) | 영향 범위 |
|---|---|---|---|---|---|
| ADR-001 | 오브젝트 복사 도구 | **`rclone`**(vendor-neutral S3 호환 클라이언트, 소스 레거시 S3 + 목적지 R2 양단 `--endpoint-url`) | `aws s3 sync`(aws-cli) — *P-002/P-004 브랜드 결합·클라우드 중립성 저하*; `s5cmd` — *고속이나 checksum 대조 기능 약함*; backend `R2FileStorage` SDK 객체별 PUT — *presign 모델·앱 결합·처리량 부적합*; Cloudflare Super Slurper — *콘솔 기반, spec.md 범위 외* | FR-001·004·005, P-002/P-004, NFR-002 | files-migrate.sh, Dockerfile |
| ADR-002 | 러너 이미지 | **020 전용 러너 이미지(`scripts/migration/Dockerfile`) 확장 — `apk add rclone` 1줄** | 신규 별도 이미지 — *FR-010/SC-010 금지*; aws-cli 추가 — *ADR-001 미채택 도구*; 앱 운영 이미지 재사용 — *bash/psql 부재(GAP-020-05 동일 사유)* | FR-010, SC-010 | scripts/migration/Dockerfile |
| ADR-003 | 델타 캡처 전략 | **rclone 멱등 copy(checksum 일치 skip) 재실행 — 전체 UPLOADED key 집합 재전달** | `createdAt` 워터마크 증분 — *PENDING→UPLOADED 상태전이 누락(updatedAt 부재)*; 매니페스트 diff 별도 관리 — *복잡도↑, 도구 내장 멱등으로 불요* | FR-003, NFR-001, SC-003/011 | files-migrate.sh delta |
| ADR-004 | 복사 대상 key SoT | **신규 `files.files WHERE status='UPLOADED'` 의 key 목록**(020 이 이관한 메타, `--files-from` 전달) | 레거시 버킷 전수 열거 — *PENDING/고아 객체 포함 위험, FR-001 위반*; 레거시 DB 조회 — *레거시 접근 제약·신규가 이미 권위 목록* | FR-001·004, ASM-005, SC-001 | files-migrate.sh, key 추출 SQL |
| ADR-005 | url 갱신 | **복사 후 `UPDATE files.files SET url = R2_PUBLIC_BASE_URL\|\|'/'\|\|key WHERE status='UPLOADED'`(key 무변경, 멱등)** | key 리키잉 동반 — *범위 외(사용자 최소변경 확정)*; 앱 계층 url 재작성 — *공개 API 부재·범위 외* | FR-004, SC-004 | sql/30_file_url_update.sql |
| ADR-006 | 정합성 검증 | **개수 100% 대조(R2 vs files.files UPLOADED) + 샘플 체크섬(1% 또는 100건) ETag/MD5, 멀티파트는 콘텐츠 바이트 대조 fallback** | 전수 체크섬 — *대량 다운로드 비용·시간*; 개수만 — *바이너리 손상 미탐* | FR-005, NFR-003, SC-005/013 | files-migrate.sh verify, verify SQL |
| ADR-007 | 실패·부분성공 | **rclone `--retries` 개별 재시도 + 실패목록 캡처(전체 미중단), 잔존 실패는 사전평가 리포트+사용자 재확인** | 첫 실패 시 전체 abort — *FR-006 위반, 대량 이관에 부적합* | FR-006·007, SC-006/007 | files-migrate.sh, pre-assessment |
| ADR-008 | 감사 기록 | **020 `migration_staging.verification_runs`(phase='file-migration') + 구조적 로그 재사용**(파일별 성공/실패/재시도·검증결과, PII/자격증명 마스킹) | 신규 감사 테이블 — *P-003·중복, 020 자산 재사용이 적합*; 표준출력만 — *감사 불가·SC-015 미충족* | NFR-005, SC-015 | files-migrate.sh, verification_runs |
| ADR-009 | 전송 채널 보안 | **양단 HTTPS(S3/R2 기본 TLS) + rclone TLS 검증, 자격증명 런타임 주입(이미지 미굽기·평문 로그 금지)** | 평문/HTTP — *NFR-004 위반·PII 노출*; 이미지에 자격증명 굽기 — *P-002/보안 위반, 020 Dockerfile 관례 위반* | FR-008(간접)·NFR-004, SC-014 | config.example.env, files-migrate.sh |

---

## 인터페이스 계약

본 spec 은 앱 런타임 인터페이스(HTTP API)를 신설·변경하지 않는다. "인터페이스 계약"은 이관 러너와 양단 스토리지·타깃 DB·운영 절차 간의 계약이다.

- **레거시 소스 계약(읽기 전용)**: 레거시 오브젝트 스토리지에 `GET`/`LIST`(rclone read) 만. 러너는 레거시 객체를 **삭제·수정하지 않는다**(복사만). 020 컷오버 단계 1(레거시 쓰기 차단) 이후 신규 업로드 0 전제 → 델타 gap 최소.
- **R2 타깃 계약(write)**: R2 버킷에 `PUT`(rclone copy). 021 `R2_*` 자격증명 재사용(별도 write 전용 토큰 권장 — Security Agent 검토). key 는 레거시와 동일(FR-004).
- **타깃 DB 계약(write)**: 신규 Fly Postgres `files.files` 에 key 목록 `SELECT`(read) + url `UPDATE`(write, status='UPLOADED' 한정). `migration_staging.verification_runs` INSERT/UPDATE(감사, 020 스키마 재사용 — 러너 CREATE 권한 전제, 020 런북 사전점검 승계).
- **멱등 계약**: (1) rclone copy 는 checksum 일치 skip 으로 재실행 안전, (2) url UPDATE 는 결정적 함수(`base||'/'||key`)로 재실행 안전. 델타·검증 실패 후 재시도 시 중복·부작용 없음.
- **하위 호환**: 신규 시스템 코드·스키마 무변경(P-002 호환성). `files.files.url` 갱신은 기존 파일 접근 경로를 **레거시 URL → R2 URL 로 전환**하여 US-005(구매자·판매자 파일 접근 안정성)를 충족. 갱신 전(레거시 url)에도 갱신 후(R2 url)에도 url 형식은 문자열이므로 런타임 계약 불변.

> **(PATCH-001/PROC-003) 인가 3축**: 본 spec 은 권한 부여·상태 전이 HTTP 엔드포인트를 신설하지 않으므로 인가 3축 표는 비해당. 대신 **이관 러너 실행 권한**(레거시 S3 read 자격증명 + R2 write 자격증명 + 타깃 DB write 자격증명의 3중 취급)이 상응하는 접근 통제 표면이며 Security Agent 감사 대상이다(020 ASM-010/011 동형).

---

## 데이터 모델

- **`files.files` DDL 무변경**: `key`(unique)·`url`·`status`(PENDING/UPLOADED)·`purpose`·`ownerId` 컬럼 이미 존재(schema.prisma L768-784). 이관은 **`url` 컬럼 데이터만 갱신**(FR-004), DDL·인덱스·enum 무변경.
- **복사 대상 SoT**: `files.files WHERE status='UPLOADED'` 의 `key` 집합(ADR-004). `status='PENDING'` 은 복사·url갱신 양쪽에서 제외(FR-001).
- **스테이징 스키마 불요**: 020 과 달리 재구조화가 없어(key 동일) `migration_staging` 에 파일용 raw 테이블을 두지 않는다. `verification_runs`(감사 테이블)만 재사용(020 이 생성).
- **오브젝트 스토리지 데이터 모델**: 레거시 객체 `{key → binary}` → R2 객체 `{동일 key → 동일 binary}`. 매핑은 identity(비-1:1 변환·필드 매핑 없음) → **DB Design Agent 불요**(selection-phases.md 참조).

---

## 위험 완화 설계 (PATCH-A06)

assumptions.md 의 "확인 필요=필요" 항목(ASM-001~005)의 부정 검증 대비 안전망(옵션 A 실행 시점 실측이나, Planning 단계에서 안전망을 설계로 강제):

| ASM | 리스크 | 안전망 설계 | spec 매핑 |
|---|---|---|---|
| ASM-001 레거시 스토리지 구조 미상 | 버킷·엔드포인트·리전 오설정 시 복사 실패 | (1) FR-009 precheck 가 실 버킷 접속·개수·용량을 **precopy 전 실측**(접속 실패를 사전 노출), (2) config.example.env 에 레거시 S3 설정 키를 명시(사용자 실값 주입), (3) 옵션 A 로 사용자 환경 실측 | FR-009, SC-009, ASM-001 |
| ASM-002 key 네이밍 R2 비호환 | 경로문자·길이 제약 초과 시 특정 객체 PUT 실패 | (1) FR-006 부분 성공(실패 key 목록화), (2) 잔존 실패 시 FR-007 사용자 재확인 → key 무효 사유 조사(필요 시 FR-004 재작업), (3) rclone 은 실패 객체를 skip 하고 계속 | FR-004·006·007, SC-006/007, ASM-002 |
| ASM-003 멀티파트 ETag ≠ MD5 | ETag 단순 비교 시 정상 객체를 손상으로 오판(false NO-GO) | (1) S4 검증 (b) 에 멀티파트 판정(ETag `-N` 접미사) 시 **콘텐츠 바이트 대조 fallback**(rclone check --download) 명시, (2) precheck 단계에서 샘플 ETag 형식 확인(FR-009) | FR-005, SC-005, ASM-003 |
| ASM-004 총량 미상 → 델타 윈도우 위협 | 델타 대량 발생 시 NFR-001(60분) 위협 | (1) FR-009 precheck 리포트(개수·용량·예상소요), (2) 예상소요가 윈도우 위협 시 FR-007 경로 사용자 재확인, (3) **대량 사전복사가 윈도우 밖(NFR-002 무제약)** 이므로 윈도우 내 델타는 gap 분만 — 구조적으로 소량 | FR-009, NFR-001/002, SC-009/011 |
| ASM-005 UPLOADED 메타 ↔ 실 객체 불일치 | 메타는 UPLOADED 이나 레거시 실객체 부재(고아 메타) → 개수 불일치 | (1) SC-001/013 개수 대조가 불일치를 GO 게이트에서 탐지, (2) rclone copy 시 소스 객체 부재는 실패목록에 기록(FR-006) → 원인 조사(고아 메타 vs 고아 객체) | FR-001·005, SC-001/013, ASM-005 |

> 5개 안전망 모두 FR/NFR/SC 매핑 존재 → BLOCKED 불요. 부정 검증(실측 후 위협) 시 FR-007 흐름으로 사용자 재확인.

---

## 배포 환경 영향 (PROC-009)

본 spec 은 배포·운영 환경 특이성의 영향을 받는다(컷오버 = 배포 운영, infra.md §8 "컷오버 실행 인프라(020)" 승계):

- **러너 이미지 확장(infra.md §8)**: `scripts/migration/Dockerfile` 에 `apk add rclone` 추가 → 이미지 재빌드 필요. 020 러너 이미지와 동일 빌드·배포 절차(`docker build -f scripts/migration/Dockerfile ...` → Fly one-off machine). → **Deploy Agent** 검토(런너 이미지 확장·rclone 설정·Fly machine 실행).
- **060분 윈도우 공유(NFR-001)**: 파일 델타가 020 DB 델타와 **동일 컷오버 윈도우** 안에서 수행 → 런북에서 020 컷오버 시퀀스에 파일 델타·검증 단계를 통합 배치(Deploy Agent). 두 이관의 윈도우 예산 합산이 60분 내여야 함(Performance Agent 예산 모델).
- **R2 서빙 도메인(infra.md §8)**: `R2_PUBLIC_BASE_URL` 이 R2.dev 서브도메인 또는 커스텀 도메인이어야 url 갱신 결과가 실제 접근 가능(US-005). 021 이 이미 도입한 설정 재사용 — 컷오버 전 R2 공개 접근 설정 확인을 런북 사전점검 항목으로.
- **레거시 S3 egress 비용**: 대량 사전복사 시 레거시 AWS S3 egress 요금 발생(rclone 소스→R2 전송). R2 는 ingress 무료(egress 무료가 R2 이점). → precheck 리포트에 예상 전송량 포함(FR-009, 비용 인지).

> critical 추정(잘못된 url 갱신 시 전 파일 404, US-005 위협)은 S4 검증(개수·체크섬)·url 갱신 검증(SC-004)·리허설(dry-run) 권고로 완화. Design Agent research.md "배포 환경 영향 추정"과 cross-check.

---

## 외부 도구 동작 검증 (핵심원칙 10)

spec 가정이 의존하는 외부 도구(`rclone`) 동작을 확인한다(silent failure 한계 포함 — PATCH-A07). 레거시 실 버킷·객체는 파이프라인 접근 불가([TO-VERIFY])이므로 **도구 동작 계약**을 확정하고, 실 데이터 확인은 옵션 A 로 위임:

- **`rclone copy` S3↔S3호환 복사**: `rclone` 은 임의 S3 호환 엔드포인트를 remote 로 정의(`--endpoint-url`/config)하여 소스→목적지 서버간 복사를 지원한다. 소스 key 를 목적지 key 로 보존한다(경로 그대로). → FR-004(key 그대로) 충족. (근거: rclone S3 backend 공식 문서 — S3-compatible providers 목록에 AWS S3·Cloudflare R2 포함, `[TO-VERIFY: 정확한 rclone 버전·플래그명 — Design research.md 공식문서 확인]`.)
- **`rclone copy` 멱등 skip**: 기본적으로 목적지에 동일 이름 + 크기/수정시각(또는 `--checksum` 시 해시) 일치 객체가 있으면 전송을 skip 한다 → 재실행·델타 안전(ADR-003). `--checksum` 플래그로 해시 기준 skip 강제(크기·mtime 만으로 불충분한 경우).
- **`rclone check`**: 소스·목적지 해시(ETag/MD5) 대조. `--download` 옵션은 실 콘텐츠 다운로드 후 바이트 비교(멀티파트 ETag 우회).
- **인정되는 한계(silent failure — PATCH-A07)**:
  - (a) **멀티파트 ETag ≠ MD5(ASM-003)**: 레거시 멀티파트 객체 ETag 는 파트 해시들의 해시로, 파트 경계가 다르면 R2 ETag 와 불일치 → 정상 객체를 손상으로 오판 가능. **안전망 = 멀티파트 판정 샘플은 콘텐츠 바이트 대조 fallback**(S4/ASM-003 안전망).
  - (b) **크기/mtime 기반 skip 의 위양성**: 기본 skip 이 해시가 아닌 크기·mtime 기준이면 내용 다른 동일크기 객체를 skip 할 수 있음 → **`--checksum` 강제**로 해시 기준 skip 채택(위 명시).
  - (c) **rclone 종료코드 vs 부분 실패**: 일부 객체 실패 시 rclone 이 비정상 종료코드를 반환하나 이미 성공한 객체는 유지 → 실패 key 만 재시도(FR-006). 종료코드만으로 "몇 건 실패"를 알 수 없으므로 **로그 파싱 또는 `--files-from` 재대조**로 실패목록 산출(ADR-007).
- **레거시 실 버킷·rclone 버전·플래그 검증은 Design 위임**: 정확한 rclone 버전·`--files-from`/`--checksum`/`--retries`/`--transfers` 플래그 시맨틱·alpine 패키지 가용성은 Design research.md 에서 공식 문서·venv(이미지) 대조로 확정. 미확정 항목은 `[TO-VERIFY: <항목> — Design research.md 확인]` 마커(PATCH-002). 레거시 버킷 실측은 옵션 A(사용자 실행).

---

## 테스트 전략

> 테스트 수준: 단위 / 통합 / E2E. env 태그(static/integration/e2e-db)는 spec.md SC 에 명시됨.
> **defer 옵션 결정(PATCH-A08)**: 실 레거시 AWS S3 접속이 필요한 검증(integration·e2e-db)은 파이프라인 자동 실행 불가(자격증명·네트워크가 사용자 환경). spec.md 가 **옵션 A(사용자 실행 + 결과 전달)** 를 확정 채택했다 — 산출물이 실행 절차(스크립트·명령)를 제시 → 사용자 실행 → 결과(리포트) 전달 → Test/Deploy Agent 검증. **옵션 B/C 미채택**(옵션 C 는 실 바이너리 이관이라는 spec 본질상 불가 — spec.md "범위 외" 명시).

| SC | 수준 | 유형 | 시나리오 요약 | 입력 | 기대 결과 |
|---|---|---|---|---|---|
| SC-001 | E2E-db | Happy | 이관 후 UPLOADED 참조 객체 전건 R2 존재, PENDING 제외 | 레거시 스냅샷 | UPLOADED key 전건 R2 존재·PENDING key R2 부재 |
| SC-002 | E2E-db | Happy | 사전복사 완료 시 pre-copy 대상 100% R2 이관 | precopy 완료 | 대상 100% 성공(잔존 실패는 SC-007) |
| SC-003 | E2E-db | Edge | 윈도우 내 델타(신규 UPLOADED)만 추가 이관 | precopy↔윈도우 gap 신규 객체 | 신규 객체만 전송, 기존은 skip |
| SC-004 | 통합 | Happy | R2 key == 레거시 key, url = R2_PUBLIC_BASE_URL+key | 이관 완료 files.files | key 동일·url 형식 일치 |
| SC-005 | E2E-db | Happy | 개수 100% + 샘플(1% 또는 100건) 체크섬 일치 | 이관 완료 | 개수 불일치 0·샘플 해시 일치(멀티파트는 콘텐츠 대조) |
| SC-006 | 통합 | Error | 개별 객체 실패 주입 시 전체 미중단·실패목록·재시도 | 실패 객체 재현 | 전체 계속·실패 key 기록·재시도 수행 |
| SC-007 | 정적 | Error | 잔존 실패 시 사전평가 리포트에 목록+"재확인 필요" 문구 | 미해결 실패 시나리오 | 리포트 문구·목록 존재 |
| SC-008 | 정적 | Happy | 런북에 S3 접근 단계마다 "사용자실행→전달→검증" 명시 | runbook | 절차 존재 |
| SC-009 | 정적 | Happy | 사전평가 리포트에 총개수·총용량·예상소요 기재 | pre-assessment | 3항목 존재 |
| SC-010 | 정적 | Happy | 파일 이관 스크립트가 020 러너 이미지 내 실행 가능(신규 이미지 없음) | Dockerfile·스크립트 | rclone 추가 1줄·별도 이미지 0 |
| SC-011 | E2E-db | Edge | 델타 이관 소요 60분(NFR-001) 범위 내 | 실행/리허설 로그 | 델타 구간 ≤60분 |
| SC-012 | 정적 | Edge | 사전복사에 타임아웃 자동중단 로직 없음 | precopy 스크립트 | `--max-duration` 등 전체상한 미설정 |
| SC-013 | E2E-db | Happy | 컷오버 개시 시점 개수 대조 불일치 0건 | 사전복사 완료 확정 | 개수 불일치 0 |
| SC-014 | 정적 | Happy | 전송 채널 TLS/HTTPS 적용 | 러너 설정 | HTTPS 엔드포인트·rclone TLS 확인 |
| SC-015 | 통합 | Happy | 이관 로그(파일별 성공/실패·재시도·검증결과) 감사 형태 저장 | 실행 로그 | 파일/verification_runs 저장 확인 |

> **SC-XXX 시나리오 유형 커버리지**: Happy(SC-001·002·004·005·008·009·010·013·014·015) / Edge(SC-003·011·012) / Error(SC-006·007). 세 유형 모두 포함(FR-006/007 의 실패 경로 Error, 델타·경계·무제약 Edge, 정상 이관·검증 Happy). Test Agent 는 test/coverage.md 에 SC-XXX 단위 유형 충족을 기록한다.

### PROC-010 옵션 관련 자가 점검 (옵션 A 채택 — 옵션 C 미채택이나 자가점검 준용)

1. **운영 환경 의존성 평가**: Y — 결함 발견이 레거시 오브젝트 스토리지·실 객체·R2 실버킷에 의존(SC-001·002·003·005·011·013 은 실 레거시 S3 접속 필수).
2. **mock 시뮬레이션 불가 시나리오**: 실 객체 규모(ASM-004)·멀티파트 ETag 형식(ASM-003)·key 네이밍 호환(ASM-002)·레거시 egress 는 mock 재현 불가.
3. **권장**: 위 1·2 가 Y 이므로 **옵션 A 채택**(spec 확정). 정적 검증(런북·설정·스크립트 완결성, SC-007·008·009·010·012·014)은 파이프라인 내 자동 수행, 실 데이터 검증은 사용자 실행+결과 전달. 옵션 A 결과 미도래 구간은 검증 리포트(NFR-005)·운영 모니터링(infra.md §4)로 보완.

### PROC-014 사후 운영 검증 피드백 사이클

spec.md "사후 운영 검증 피드백 사이클" 절에 이미 명시(시나리오 a~d — 실측 총량·레거시 키 네이밍·델타 과다·ETag 방식 상이, 결함 발견 시 spec 수정 이벤트→cycle N+1 또는 patch spec, CHANGES.md/context.md 추적). 본 plan 은 이를 승계하며, **리허설(dry-run) 1회 이상 선행을 런북에 권고**(소규모 샘플 버킷으로 rclone 복사·검증·url 갱신 파이프라인 검증 후 실 이관).

### smoke_tests

- 필요 여부: **N** — 본 spec 은 신규 앱 코드 변경이 없어(P-007) 기존 SC 범위 밖 회귀 유발 경로가 없다. `files.files.url` 갱신 후 파일 접근(US-005) smoke 는 런북 컷오버 후 smoke 단계로 다루며 SC-004/013 흐름에 포함.

---

## 기타 고려사항

- **동시성·공유상태(01-design-rules §6)**: 이관 러너는 단일 실행 주체(사용자/오너)의 순차 실행 전제. rclone `--transfers N`(내부 병렬 전송)은 도구 내부 관리이며 러너 프로세스는 단일. rclone copy 멱등 skip(ADR-003)으로 재시도 안전. url UPDATE 는 결정적 함수라 중복 실행 안전. 스테이징 없음 → 레이스 없음.
- **020 자산 재사용 경계**: `lib/common.sh`(run_psql·log_line·load_migration_config·mask_dsn·stage_run 패턴)·러너 이미지·`verification_runs` 재사용. 020 의 DB 전용 파일(`run.sh`·`extract.sh`·`load.sh`·`sql/{00,10,20}_*.sql`·`delta-classes.conf`)은 **수정하지 않는다**(단일 책임 — 파일 이관은 `files-migrate.sh` + `sql/30_*.sql` 별도).
- **020 감사 부채 승계(SEC-020-01/02, context.md §6)**: `verification_runs` 재사용 시 020 의 미해결 부채 2건이 그대로 적용 — (1) `migration_staging` 스키마 컷오버 후 정리 미자동화(SEC-020-01), (2) 감사 로그 실행 행위자 미기록(SEC-020-02). 022 도 동일 테이블을 쓰므로 Security Agent 가 두 부채의 파일 이관 맥락 재평가 대상으로 포함. 신규 악화는 없으나 상속 인지 필요.
- **`[TO-VERIFY]` 위임**: 레거시 버킷·엔드포인트·리전·key 네이밍·ETag 형식(ASM-001~003·005)은 파이프라인 접근 불가 → precheck·런북에서 사용자 제공/실측으로 확정. 정확한 rclone 버전·플래그는 Design research.md 공식문서 대조(코드 예시에 미검증 리터럴 대신 마커 — PATCH-002).
- **US-005 접근 안정성**: url 갱신(레거시→R2) 후 기존 상품·리뷰·프로필 이미지가 R2 URL 로 접근 가능해야 한다. `R2_PUBLIC_BASE_URL`(021) 공개 접근 설정(infra.md §8 R2 서빙 도메인)이 전제 — 런북 사전점검. 갱신 전/후 모두 url 은 문자열 계약이라 런타임 코드 불변.
- **자격증명 취급(NFR-004/ADR-009)**: 레거시 S3 read 키 + R2 write 키를 러너에 런타임 주입(이미지 미굽기, 020 Dockerfile 관례). 로그에 자격증명·객체 URL 서명 파라미터 원문 미기재(020 mask 관례). R2 는 021 `R2_*` 재사용하되 이관용 write-scoped 토큰 분리 권장(Security Agent).
