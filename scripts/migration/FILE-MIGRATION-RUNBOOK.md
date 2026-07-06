---
작성: Development Agent
버전: v1.0
최종 수정: 2026-07-06 15:30
상태: 확정
---

# 파일 바이너리 이관 런북: 022-legacy-file-binary-migration

> Branch: 022-legacy-file-binary-migration | Plan: [../../docs/specs/v1.1.0/022-legacy-file-binary-migration/planning/plan.md](../../docs/specs/v1.1.0/022-legacy-file-binary-migration/planning/plan.md) | Spec: [../../docs/specs/v1.1.0/022-legacy-file-binary-migration/spec/spec.md](../../docs/specs/v1.1.0/022-legacy-file-binary-migration/spec/spec.md) | Pre-assessment: [FILE-PRE-ASSESSMENT.md](FILE-PRE-ASSESSMENT.md)
>
> 실행 도구: `files-migrate.sh`(`precheck` / `precopy` / `delta` / `verify` / `url-update`) — 020 전용 러너 이미지(`Dockerfile`, rclone 확장) 안에서 실행한다. 접속 설정은 [config.example.env](config.example.env) 참조.
>
> **옵션 A(사용자 실행 + 결과 전달) 원칙**: 레거시 AWS S3 자격증명·버킷 접근은 파이프라인 밖 사용자 환경에서만 가능하다(FR-008). 아래 각 단계는 **사용자 환경 실행 → 결과 전달 → 검증** 3단계 절차로 진행한다 — 이관 스크립트는 산출물로 제공되나 실 레거시 접속은 사용자가 직접 수행한다.

## 목차

- [0. 사전 공지 및 020 통합 개요](#0-사전-공지-및-020-통합-개요)
- [1. 러너 이미지 준비](#1-러너-이미지-준비)
- [2. 사전점검 체크리스트](#2-사전점검-체크리스트)
- [3. 단계별 절차 (옵션 A)](#3-단계별-절차-옵션-a)
  - [단계 A — precheck (사전 실측)](#단계-a--precheck-사전-실측)
  - [단계 B — precopy (윈도우 개시 전 벌크 사전 복사)](#단계-b--precopy-윈도우-개시-전-벌크-사전-복사)
  - [단계 C — delta (020 컷오버 윈도우 내 최종 델타)](#단계-c--delta-020-컷오버-윈도우-내-최종-델타)
  - [단계 D — verify (정합성 검증)](#단계-d--verify-정합성-검증)
  - [단계 E — url-update (files.files.url 갱신)](#단계-e--url-update-filesfilesurl-갱신)
- [4. 020 컷오버 윈도우 통합 체크포인트](#4-020-컷오버-윈도우-통합-체크포인트)
- [5. R2 공개 접근 사전점검 (US-005)](#5-r2-공개-접근-사전점검-us-005)
- [6. 리허설(dry-run) 권고](#6-리허설dry-run-권고)
- [7. 단계별 담당자·체크포인트 요약표](#7-단계별-담당자체크포인트-요약표)

---

## 0. 사전 공지 및 020 통합 개요

020-data-migration-cutover 는 `files.files` **메타데이터**만 이관했다(020 FR-017/SC-019). 본 런북은 실 파일 **바이너리**(오브젝트) 이관 절차를 다룬다 — 레거시 AWS S3(또는 등가 오브젝트 스토리지) → Cloudflare R2. 020 RUNBOOK.md 의 사전 공지(D-3)·컷오버 윈도우 절차와 **동일 일정**으로 통합 진행한다(§4 참조).

## 1. 러너 이미지 준비

020 RUNBOOK.md §1 과 동일 이미지를 사용한다(신규 별도 이미지 도입 없음 — FR-010/SC-010). `rclone` 이 추가된 것 외 020 이미지 준비·배포 절차(빌드·레지스트리 push·Fly one-off machine 실행)는 동일하다.

- [ ] **이미지 빌드**(레포 루트에서, `scripts/migration/` 을 빌드 컨텍스트로 사용):
  ```bash
  docker build -f scripts/migration/Dockerfile -t doa-migration-runner scripts/migration
  ```
- [ ] **rclone 포함 확인**(GAP-022-01 — Development Agent 가 4단계에서 1회 실증 완료, 재확인 권장):
  ```bash
  docker run --rm doa-migration-runner rclone version
  ```
- [ ] 레지스트리 push·Fly one-off machine 실행 절차는 [RUNBOOK.md §1](RUNBOOK.md#1-러너-이미지-준비-gap-020-05) 그대로 따른다(`/migration/files-migrate.sh <subcommand>` 를 `--command` 로 지정).

## 2. 사전점검 체크리스트

- [ ] 020 컷오버가 `files.files` 메타데이터 이관을 완료한 상태(본 이관의 key 목록 SoT, ADR-004).
- [ ] `migration_staging` 스키마 존재(020 이 생성) — `verification_runs` 감사 기록 대상.
- [ ] R2 공개 접근 설정(`R2_PUBLIC_BASE_URL`) 확인(§5).
- [ ] `config.env`(`config.example.env` 복사본, 커밋 금지)에 레거시 S3·R2 rclone 설정 실값 채움 완료.
- [ ] 사전평가([FILE-PRE-ASSESSMENT.md](FILE-PRE-ASSESSMENT.md)) 실측 완료.
- [ ] 리허설(dry-run) 1회 이상 완료 권고(§6).

## 3. 단계별 절차 (옵션 A)

### 단계 A — precheck (사전 실측)

- **사용자 환경 실행**: 레거시 S3 자격증명이 설정된 `config.env` 로 러너 이미지에서 `files-migrate.sh precheck` 를 실행한다. 레거시 버킷의 총 개수·총 용량을 실측하고 `files.files` UPLOADED 카운트와 함께 리포트(`migration-run/precheck-report.json`)를 생성한다.
  ```bash
  /migration/files-migrate.sh precheck
  ```
- **결과 전달**: 생성된 `precheck-report.json` 을 운영자(Deploy 담당)에게 전달한다.
- **검증**: 전달받은 리포트값을 [FILE-PRE-ASSESSMENT.md](FILE-PRE-ASSESSMENT.md) §2 표의 총개수·총용량·예상소요 슬롯에 반영하고, 예상 소요가 020 윈도우(60분) 안전마진을 위협하면 §4 게이트에 따라 사용자 재확인을 거친다.

### 단계 B — precopy (윈도우 개시 전 벌크 사전 복사)

- **시점**: 020 컷오버 윈도우 개시 **전**(NFR-002 — 시간 상한 없음).
- **사용자 환경 실행**: 레거시 S3 read 자격증명이 설정된 환경에서 실행한다.
  ```bash
  /migration/files-migrate.sh precopy
  ```
- **결과 전달**: `migration-run/rclone-precopy.log`, 잔존 실패 시 `migration-run/precopy-remaining-failures.md` 를 운영자에게 전달한다.
- **검증**: 잔존 실패 목록이 있으면 **컷오버 개시 전 사용자 재확인 필요**(FR-007) — [FILE-PRE-ASSESSMENT.md](FILE-PRE-ASSESSMENT.md) §3 게이트에 반영한다. 잔존 실패 0건이면 다음 단계(윈도우 내 delta)로 진행 가능.

### 단계 C — delta (020 컷오버 윈도우 내 최종 델타)

- **시점**: 020 컷오버 윈도우 **내**(§4 체크포인트, ≤60분 예산 안에서 처리 — NFR-001).
- **사용자 환경 실행**: precopy 와 동일 자격증명 환경에서 실행한다. precopy 완료 시점 이후 신규 `UPLOADED` 파일만 실제 전송된다(rclone checksum skip, ADR-003).
  ```bash
  /migration/files-migrate.sh delta
  ```
- **결과 전달**: `migration-run/rclone-delta.log`, 잔존 실패 시 `migration-run/delta-remaining-failures.md` 를 운영자에게 전달한다.
- **검증**: 잔존 실패가 있으면 020 GO/NO-GO 판단(§4)에 반영한다.

### 단계 D — verify (정합성 검증)

- **사용자 환경 실행**: 레거시 S3 + R2 양단 접근 가능한 환경에서 실행한다. 개수 대조(files.files UPLOADED vs R2 실측) + 샘플 체크섬(전체 1% 또는 100건 중 큰 값)을 수행하고, 멀티파트 ETag 로 판정되어 체크섬이 불일치하는 후보는 콘텐츠 바이트 대조로 자동 재검증한다(ASM-003 안전망).
  ```bash
  /migration/files-migrate.sh verify
  ```
- **결과 전달**: `migration-run/verify-report.json` 을 운영자에게 전달한다.
- **검증**: `count_mismatch` = 0 이고 `checksum_download_fallback_rc` = 0 이어야 GO(SC-005/013). 하나라도 불충족이면 원인 조사 후 재실행(재시도는 멱등이므로 안전).

### 단계 E — url-update (files.files.url 갱신)

- **시점**: 단계 D(verify) 가 GO 로 판정된 직후.
- **실행 환경**: 타깃 Fly Postgres 접속만 필요(레거시 S3 접근 불요 — 옵션 A 대상 아님).
  ```bash
  /migration/files-migrate.sh url-update
  ```
- **검증**: `files.files` 샘플 행의 `url` 이 `R2_PUBLIC_BASE_URL || '/' || key` 형태이고 `key` 가 레거시와 동일함을 확인한다(SC-004, `sql/30_file_url_update.sql` (c) 쿼리).

## 4. 020 컷오버 윈도우 통합 체크포인트

파일 델타(단계 C)·검증(단계 D)·url 갱신(단계 E)은 020 RUNBOOK.md 의 컷오버 윈도우([RUNBOOK.md §3 단계 2~4](RUNBOOK.md#단계-2--최종-델타-이관))와 **동일 60분 윈도우** 안에서 다음과 같이 통합 배치한다:

| 020 RUNBOOK 단계 | 022 통합 지점 |
|---|---|
| 단계 1 — 레거시 쓰기 차단 | (동일, 파일 델타도 이 시점 이후 신규 업로드가 gap 분만 발생) |
| 단계 2 — 최종 델타 이관(DB) | **병행**: `files-migrate.sh delta`(단계 C) |
| 단계 3 — 정합성 검증(DB) | **병행**: `files-migrate.sh verify`(단계 D) |
| 단계 4 — GO/NO-GO 판단 | DB 검증 + 파일 검증(SC-005/013) **양쪽 모두 pass** 이어야 GO. 파일 검증 실패 시 020 GO/NO-GO 판단에 NO-GO 사유로 반영 |
| GO 확정 후 | `files-migrate.sh url-update`(단계 E) 실행 — 트래픽 전환(020 단계 5) 전에 완료 |
| 단계 7 — 윈도우 종료 | 두 이관(DB+파일)의 누적 경과가 NFR-001(60분) 이내인지 확인 |

## 5. R2 공개 접근 사전점검 (US-005)

url 갱신 후 구매자·판매자가 기존 상품·리뷰·프로필 이미지에 접근하려면 `R2_PUBLIC_BASE_URL` 이 실제로 공개 접근 가능해야 한다(021 설정 재사용, infra.md §8 R2 서빙 도메인).

- [ ] `R2_PUBLIC_BASE_URL` (R2.dev 서브도메인 또는 커스텀 도메인)로 임의 이관 완료 객체 1건 이상을 브라우저/`curl`로 접근 확인.
- [ ] R2 버킷의 공개 접근 설정(Public Access 또는 커스텀 도메인 바인딩)이 컷오버 전 활성화되어 있는지 확인.

## 6. 리허설(dry-run) 권고

소규모 샘플 버킷(또는 소량 key 목록)으로 `precheck` → `precopy` → `verify` → `url-update` 전체 파이프라인을 1회 이상 리허설할 것을 권고한다(PROC-014 사후 운영 검증 피드백 사이클). 리허설로 다음을 사전 확인한다:

- 레거시 버킷·엔드포인트·리전 설정([TO-VERIFY] 슬롯 해소, ASM-001).
- key 네이밍이 R2 에 호환되는지(ASM-002).
- 샘플 객체의 ETag 형식(단일 MD5 vs 멀티파트 `-N` 접미사, ASM-003) — 멀티파트 fallback 분기가 실제로 발동하는지 확인.

## 7. 단계별 담당자·체크포인트 요약표

| 단계 | 시점 | 담당자 | 자격증명 필요 | 체크포인트 |
|---|---|---|---|---|
| A. precheck | 사전(윈도우 훨씬 전) | 이관 실행 담당 | 레거시 S3 read | precheck-report.json 실측값 |
| B. precopy | 윈도우 개시 전 | 이관 실행 담당 | 레거시 S3 read + R2 write | 잔존 실패 0건(또는 FR-007 재확인) |
| C. delta | 윈도우 내 | 이관 실행 담당 | 레거시 S3 read + R2 write | 델타 소요 ≤60분 예산 내(NFR-001) |
| D. verify | 윈도우 내(delta 직후) | 이관 실행 담당 | 레거시 S3 read + R2 read | count_mismatch=0, checksum fallback rc=0 |
| E. url-update | verify GO 직후 | 이관 실행 담당 | 타깃 DB write | 샘플 url 형식 검증(SC-004) |
