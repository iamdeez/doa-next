---
작성: Design Agent
버전: v1.0
최종 수정: 2026-07-06 14:30
상태: 확정
---

# Research: 022-legacy-file-binary-migration

## 목차

- [분석 우선순위 게이트 적용](#분석-우선순위-게이트-적용)
- [기존 코드베이스 분석](#기존-코드베이스-분석)
  - [모듈 계층 구조 (020 러너 자산)](#모듈-계층-구조-020-러너-자산)
  - [영향 범위 분석](#영향-범위-분석)
  - [공유 상태·동시성 분석](#공유-상태동시성-분석)
- [외부 도구 API 실제 동작 확인 (rclone)](#외부-도구-api-실제-동작-확인-rclone)
- [인정되는 한계 및 안전망 (PATCH-A07)](#인정되는-한계-및-안전망-patch-a07)
- [배포 환경 영향 추정 (PATCH-A10 / PATCH-020-01)](#배포-환경-영향-추정-patch-a10--patch-020-01)
- [context.md 부정합 사전 점검 (PATCH-A11)](#contextmd-부정합-사전-점검-patch-a11)
- [기술 선택 조사](#기술-선택-조사)
- [엣지 케이스 및 한계](#엣지-케이스-및-한계)

---

## 분석 우선순위 게이트 적용

plan.md "핵심 설계"·"영향 파일 목록"의 변경 대상:
- **신규**: `scripts/migration/files-migrate.sh`·`scripts/migration/sql/30_file_url_update.sql`·운영 문서(런북·사전평가)·정적 테스트.
- **수정**: `scripts/migration/Dockerfile`(`apk add rclone` 1줄)·`scripts/migration/config.example.env`(레거시 S3 + R2 rclone 설정 키).
- **무변경**: `apps/backend` 도메인 코드·`schema.prisma` DDL·020 DB 전용 파일(`run.sh`·`extract.sh`·`load.sh`·`sql/{00,10,20}_*.sql`·`delta-classes.conf`).

게이트 판정:
- §A 클래스 계층: **건너뜀** — bash 스크립트·SQL, OOP 클래스 계층 없음.
- §B API 변경 영향: **건너뜀** — production 메서드 시그니처 변경 없음(앱 코드 무변경). §F 비해당.
- §C 동시성: **수행** — 러너가 `files.files.url` 을 직접 UPDATE(P-001 예외) + rclone 병렬 전송.
- §D 다단계 병렬 파이프라인: **건너뜀** — precopy/delta 는 스레드 병렬이 아닌 시간 구간 분리이며, 델타는 rclone 멱등 skip 으로 처리(ThreadPoolExecutor 류 병렬 설계 아님).
- §E 동일 가드 결정 통합: **건너뜀** — 해당 패턴 없음.
- 외부 라이브러리 검증: **수행** — `rclone` 신규 도입(시스템 CLI).

---

## 기존 코드베이스 분석

> context.md §2 핵심 모듈·전체 구조는 중복 기술하지 않는다. 본 절은 022 가 재사용/확장하는 020 러너 자산의 **실측 확인** 결과다.

### 모듈 계층 구조 (020 러너 자산)

`scripts/migration/lib/common.sh`(104줄) 실측 — 022 가 `files-migrate.sh` 에서 `source` 재사용할 헬퍼:

| 헬퍼 | 시그니처 | 022 재사용 여부 | 비고 |
|---|---|---|---|
| `load_migration_config()` | `config.env`(또는 `MIGRATION_CONFIG`) source + `PGSSLMODE` 강제 | 재사용 | 022 는 여기에 **레거시 S3·R2 rclone 설정 검증 추가 필요**(현재는 `PGSSLMODE` 만 강제) |
| `log_line(level, msg)` | 구조적 로그(파일+stderr), PII 금지 | 재사용 | 감사 로그(NFR-005) |
| `mask_dsn()` | `postgresql://user:pass@` → `***@` | 재사용 | 자격증명 마스킹(NFR-004/ADR-009) |
| `run_psql(dsn, ...)` | `psql -v ON_ERROR_STOP=1` | 재사용 | key 목록 추출·url UPDATE·검증 카운트 |
| `assert_sslmode_require()` | `require`/`verify-ca`/`verify-full` 검증 | 재사용 | TLS(SC-014, DB 측) |
| `lowercase(s)` | bash 3.2 호환 소문자 변환 | 필요 시 | — |

`scripts/migration/run.sh`(284줄) 실측 — 022 가 **패턴만 승계**(파일 자체는 수정 안 함, 단일 책임):
- `stage_run(step, func, ...)`: `verification_runs` INSERT(status='running') → func 실행 → UPDATE(status·elapsed_sec). **022 는 phase='file-migration' 로 동일 패턴을 `files-migrate.sh` 에 자체 구현**(020 run.sh 는 phase='cutover' 하드코딩이므로 재사용 불가·복제).
- `iso_now()`·`for_each_legacy_service()`: 참고. 파일 이관은 단일 소스(레거시 S3 1개 버킷/엔드포인트)라 서비스별 순회 불요 — 단순화.

`verification_runs` DDL(`sql/00_staging_ddl.sql` L17-29) 실측:
```
migration_staging.verification_runs (id, phase, step, target_table, started_at, finished_at, status, detail JSONB, created_at)
```
- **020 이 이미 생성**(신규 DDL 아님, ADR-008). 022 는 `phase='file-migration'`·`step in {precheck,precopy,delta,verify,url-update}` 로 INSERT/UPDATE 만. `migration_staging` 스키마 존재는 020 컷오버 실행이 선행되었음을 전제(런북 사전점검 항목화).

### 영향 범위 분석

| 파일 | 변경 유형 | 영향 내용 |
|---|---|---|
| `scripts/migration/files-migrate.sh` | 신규 | precheck·precopy·delta·verify·url-update 서브커맨드. `lib/common.sh` source |
| `scripts/migration/sql/30_file_url_update.sql` | 신규 | `files.files.url` UPDATE(멱등) + 개수/url 검증 쿼리. DDL 무변경 |
| `scripts/migration/Dockerfile` | 수정 | `apk add` 에 `rclone` 추가(020 curl 추가와 동형, +0줄~1줄) |
| `scripts/migration/config.example.env` | 수정 | 레거시 S3(엔드포인트·버킷·리전·키 변수) + R2 rclone remote 설정 키 추가(실값 미기재) |
| `scripts/migration/FILE-MIGRATION-RUNBOOK.md` | 신규 | 파일 이관 런북(옵션 A 실행 단계) |
| `scripts/migration/FILE-PRE-ASSESSMENT.md` | 신규 | 사전평가 리포트 템플릿(FR-009) |
| `apps/backend/test/static/file-migration-*.spec.ts` | 신규 | SC-007·008·009·010·012·014 정적 검증 |
| `apps/backend/prisma/schema.prisma` | **무변경** | `FileAsset`(`files.files`) `key @unique`·`url`·`status` 이미 존재(L768-784) |
| 020 DB 전용 러너 파일·기존 18개 도메인 모듈 | **무변경** | 단일 책임·P-007 |

**production 시그니처 변경 0건**(§F 비해당). 호출 측 테스트 마이그레이션 불요. Breaking change 0건.

**FileAsset 스키마 실측 확인**(schema.prisma L768-784):
- `key String @unique` — 복사 대상 SoT 의 유일 키(ADR-004). key 형태 주석: `{purpose}/{ownerId}/{uuid}`.
- `url String` — 갱신 대상 컬럼(FR-004).
- `status FileStatus @default(PENDING)` — `UPLOADED` 만 대상, `PENDING` 제외(FR-001).
- `createdAt DateTime @default(now())` 보유, **`updatedAt` 부재 확인**(plan.md S3 정확) — 상태 전이(PENDING→UPLOADED) timestamp 없음 → 델타를 `createdAt` 워터마크로 잡을 수 없음 → **rclone 멱등 skip 전략(ADR-003)이 유일 정합**.
- `@@map("files")`·`@@schema("files")` → 물리 테이블명 **`files.files`**(GAP-020-02 의 `file_assets` 오표기 회피 — 실측 물리명 사용).

### 공유 상태·동시성 분석

- **공유 자원**: (1) R2 버킷 객체, (2) `files.files.url` 컬럼, (3) `verification_runs` 감사 행.
- **실행 주체**: 러너는 **단일 프로세스 순차 실행**(사용자/오너 1인, Fly one-off machine). 020 과 동일 전제.
- **Check-Then-Act**: rclone copy 의 "존재 확인 → skip/전송"은 rclone 내부가 원자적으로 관리(도구 책임). 러너 레벨 비원자 연산 쌍 없음.
- **rclone `--transfers N` 내부 병렬**: 도구 내부 워커 병렬이며 러너 bash 프로세스는 단일. 서로 다른 객체를 다루므로(key 유일) 객체 간 레이스 없음.
- **url UPDATE 멱등**: `SET url = base||'/'||key WHERE status='UPLOADED'` 는 결정적 함수 — 재실행/중복 실행 안전(Lock 불요). 근거: 입력(key)당 출력(url)이 유일하며 다른 행에 부작용 없음.
- **결론**: Lock 불요. 스테이징 테이블 없음(재구조화 없음) → 이중 쓰기 경로 부재. 재시도(FR-006)·델타(FR-003) 모두 멱등으로 안전.

---

## 외부 도구 API 실제 동작 확인 (rclone)

> plan.md "외부 도구 동작 검증" 절과 cross-check. 파이프라인 내 WebFetch 미제공·레거시 실 버킷 접근 불가([TO-VERIFY]) → **도구 동작 계약**을 확정하고 정확한 버전·플래그 시맨틱은 실행 시점(옵션 A) + Deploy 단계 이미지 빌드 검증으로 확정한다. 아래는 rclone 공식 동작 모델(일반 지식 기준)이며 미확정 리터럴은 `[TO-VERIFY]` 마커로 남긴다(PATCH-002 — 지어내지 않음).

| 기능 | rclone 동작(가정) | 실제 확정 경로 | spec 매핑 |
|---|---|---|---|
| S3↔S3호환 서버간 복사 | `rclone copy <src-remote>:<bucket>/<prefix> <dst-remote>:<bucket>` — 소스 key 를 목적지 key 로 보존(경로 그대로) | Deploy 이미지 내 `rclone version` + 옵션 A 실행 | FR-004 |
| 멱등 skip | 목적지에 동일 이름 + (기본)크기/mtime, `--checksum` 시 해시 일치 객체 전송 생략 | `--checksum` 플래그 시맨틱 [TO-VERIFY] | FR-003, ADR-003 |
| 대상 한정 | `--files-from <keylist>` 로 복사 대상 key 목록 명시(files.files SoT) → 고아/PENDING 객체 자동 배제 | `--files-from` 경로 시맨틱 [TO-VERIFY] | FR-001, ADR-004 |
| 해시 대조 | `rclone check <src> <dst> --checksum` — 양단 해시 비교. `--download` 시 실 바이트 비교 | `check`/`--download` [TO-VERIFY] | FR-005, SC-005 |
| 개별 재시도 | `--retries N`·`--retries-sleep` — 실패 객체 재시도, 전체 미중단(성공분 유지) | `--retries` [TO-VERIFY] | FR-006, ADR-007 |
| 전체 상한 미설정 | `--max-duration` **미설정**(NFR-002 무제약). `--timeout` 은 개별요청 무응답 방어일 뿐 전체 상한 아님 | 스크립트에 `--max-duration` 부재 정적 검증(SC-012) | NFR-002, SC-012 |
| 크기·용량 실측 | `rclone size --json <remote>:<bucket>` — 개수·총바이트 | 옵션 A precheck | FR-009, SC-009 |

**alpine 패키지 가용성(PATCH-020-01 핵심)**: `rclone` 은 Alpine `community` 레포지토리에 패키지로 존재한다(`apk add rclone`). 단 `postgres:16-alpine` 베이스 이미지에 community 레포가 활성화되어 있는지, 그리고 `apk add rclone` 이 실제로 해소되는지는 **정적 코드 리뷰만으로 확정 불가** → **docker build 1회 실행 검증**이 필수다(GAP-022-01, tasks T-B03 완료기준). community 미활성 시 대안: (a) `/etc/apk/repositories` 에 community 라인 추가, (b) rclone 정적 바이너리 `curl` 다운로드(020 이미지에 curl 기존재). 어느 쪽이든 **신규 별도 이미지 도입 아님**(FR-010/SC-010 준수 — 020 이미지 확장 범위).

---

## 인정되는 한계 및 안전망 (PATCH-A07)

| 한계(silent failure 가능) | 안전망 설계 | spec 매핑 |
|---|---|---|
| **멀티파트 ETag ≠ MD5**(ASM-003): 레거시 멀티파트 객체 ETag 는 파트 해시의 해시 → R2 와 파트 경계 상이 시 정상 객체를 손상으로 오판(false NO-GO) | S4 검증 (b) 에서 멀티파트 판정(ETag `-N` 접미사) 샘플은 `rclone check --download`(실 바이트 대조)로 fallback. precheck 에서 샘플 ETag 형식 사전 확인 | FR-005, SC-005 |
| **크기/mtime skip 위양성**: 기본 skip 이 해시 아닌 크기·mtime 기준이면 내용 다른 동일크기 객체 skip 위험 | `--checksum` 강제(해시 기준 skip) — 스크립트에 명시 | FR-003, ADR-003 |
| **rclone 종료코드 vs 부분 실패**: 일부 실패 시 비정상 종료코드지만 성공분 유지 → "몇 건 실패"를 코드만으로 불명 | 로그 파싱 또는 `--files-from` 재대조로 실패 key 목록 산출(FR-006). 잔존 실패는 사전평가 리포트+사용자 재확인(FR-007) | FR-006/007, SC-006/007 |
| **UPLOADED 메타 ↔ 실 객체 불일치**(ASM-005): 고아 메타(UPLOADED 이나 레거시 실객체 부재) → 개수 불일치 | 개수 100% 대조(SC-001/013)가 GO 게이트에서 탐지. copy 실패목록에 소스 부재 기록 → 원인 조사 | FR-005, SC-001/013 |

---

## 배포 환경 영향 추정 (PATCH-A10 / PATCH-020-01)

infra.md §8 "컷오버 실행 인프라(020)" 승계. 본 spec 은 배포·운영 환경 특이성 영향을 받는다:

1. **[PATCH-020-01] 러너 이미지 실행스택 정합성**: ADR-002 가 rclone 을 020 러너 이미지(`postgres:16-alpine`)에 추가 실행하도록 지정. **rclone 이 이 이미지에서 이용 가능한지 반드시 docker build 로 사전 확인**해야 한다(정적 리뷰 불가). 이용 불가 판정 시 대안 이미지 준비를 **별도 태스크로 선행 명시**(GAP-020-05 재발 방지 — Deploy 단계에서 처음 발견 금지). → tasks T-B03 완료기준에 `docker build -f scripts/migration/Dockerfile ... && docker run ... rclone version` 1회 성공 박제.
2. **컨테이너 빌드 산출물 경로**: pnpm 워크스페이스·Prisma 무관(앱 코드 무변경). 러너 이미지는 `COPY . /migration/` 로 `scripts/migration/` 전체 복사 — 신규 `files-migrate.sh`·`sql/30_*.sql` 이 자동 포함됨(별도 COPY 라인 불요). 단 `chmod +x /migration/files-migrate.sh` 추가 필요(Dockerfile RUN chmod 라인 확장).
3. **60분 윈도우 공유(NFR-001)**: 파일 델타가 020 DB 델타와 동일 컷오버 윈도우 내 통합 → 런북에서 020 컷오버 시퀀스 체크포인트로 파일 델타·검증 배치(Deploy Agent). 두 이관 윈도우 예산 합산 ≤60분(Performance Agent).
4. **R2 서빙 도메인**: `R2_PUBLIC_BASE_URL`(021)이 실제 공개 접근 가능해야 url 갱신 결과가 유효(US-005) — 런북 사전점검.
5. **레거시 S3 egress 비용**: 대량 사전복사 시 레거시 egress 요금. R2 ingress 무료. precheck 리포트에 예상 전송량 포함(FR-009).

---

## context.md 부정합 사전 점검 (PATCH-A11)

변경 대상 클래스·필드·Enum: `FileAsset`(`files.files`)·`FileStatus`(PENDING/UPLOADED)·`url` 필드.

- `grep -n "files.files\|file_assets\|FileAsset\|FileStatus" .claude/docs/context.md` 결과 대조:
  - **GAP-020-02(OPEN, 기존)**: context.md §2/§4 가 물리 테이블명을 `file_assets` 로 오표기 중(실제 `files.files`). 022 산출물은 실측 물리명 `files.files` 사용으로 회피 — **신규 부정합 유발 없음**. 기존 GAP-020-02 는 Retrospective 처리 대기(재등록 불요, 인지).
- **본 spec 변경 후 정의 유효성**: 022 는 `url` 컬럼 **데이터만** 갱신(레거시 URL → R2 URL). `FileAsset` 필드 의미·`FileStatus` enum 값 의미·key 형태 정의 **불변**. → context.md §2 file 모듈·§5 도메인 용어의 신규 부정합 **0건**.
- **021 실연동 반영 부채(GAP-021-03, OPEN)**: context.md/infra.md 가 "실 R2 연동은 후속" 표현 잔존. 022 는 이 실연동을 전제로 하므로, 6단계 Docs/Retrospective 가 021+022 반영 갱신 시 함께 처리(인지, 재등록 불요).

---

## 기술 선택 조사

- **rclone vs aws-cli vs SDK PUT**(ADR-001): plan.md 확정 승계. rclone = vendor-neutral(P-002/P-004), 서버간 복사·멱등 skip·checksum 내장. aws-cli 는 브랜드 결합(P-002/P-004 저하) 미채택. backend `R2FileStorage` SDK 는 presign 모델·앱 결합·처리량 부적합.
- **별도 스크립트 분리**(`files-migrate.sh` ≠ `run.sh`): 020 run.sh 는 phase='cutover' DB 이관 전용 오케스트레이션이며 서비스별 순회·extract/load/transform 위상순서에 강결합. 파일 이관은 재구조화 없는 identity 복사라 별도 스크립트가 단일 책임·유지보수·디버깅 용이(D4 최적설계 재검토 확인). `lib/common.sh` 헬퍼·`verification_runs`·러너 이미지만 공유.
- **델타 = 멱등 재복사**(ADR-003): `updatedAt` 부재로 워터마크 증분 불가 → 전체 UPLOADED key 집합 재전달 + rclone checksum skip. 020 의 `ON CONFLICT DO UPDATE` 멱등과 동형.

---

## 엣지 케이스 및 한계

- **빈 대상 guard**: `files.files WHERE status='UPLOADED'` 가 0건이면 rclone `--files-from` 이 빈 목록 → 복사 0건·url UPDATE 0행(오류 아님). precheck 가 0건을 리포트에 명시(FR-009).
- **key 특수문자/길이**(ASM-002): R2 비호환 key 는 개별 PUT 실패 → 실패목록(FR-006) → 잔존 시 사용자 재확인(FR-007).
- **status='PENDING' 제외**: 복사·url갱신 양쪽에서 제외. `--files-from` 목록 생성 SQL 의 `WHERE status='UPLOADED'` 가 단일 필터 지점.
- **[TO-VERIFY] 위임**: 레거시 버킷명·엔드포인트·리전·key 네이밍·ETag 형식(ASM-001~003·005)·정확한 rclone 버전/플래그명은 옵션 A(사용자 실행) + Deploy 이미지 빌드 검증으로 확정. 스크립트·설정은 [TO-VERIFY] 마커 + 사용자 실값 주입 슬롯으로 작성(020 관례 승계).
- **US-005 접근 안정성**: url 갱신 전/후 모두 url 은 문자열 계약 → 런타임 코드 불변. 갱신 후 R2 공개 접근 설정(infra.md §8)이 전제.
