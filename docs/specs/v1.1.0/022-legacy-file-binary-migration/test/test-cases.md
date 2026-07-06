---
작성: Test Agent (AUTHORING)
버전: v1.0
최종 수정: 2026-07-06 14:42
상태: 작성중
---

# Test Cases: 022-legacy-file-binary-migration

## 목차

- [SC × 시나리오 매트릭스](#sc--시나리오-매트릭스)
- [외부 의존성 명시](#외부-의존성-명시)
- [옵션 A 실행 계약](#옵션-a-실행-계약)
- [미커버 항목 (사전 분류 — 4-카테고리)](#미커버-항목-사전-분류--4-카테고리)

---

## SC × 시나리오 매트릭스

> **거짓 green 방지 원칙**: 실 레거시 AWS S3 접속이 필요한 SC(SC-001·002·003·004·005·006·011·013·
> 015)는 jest 자동 테스트로 작성하지 않는다. mock 으로 이 SC 들을 "커버됨" 처리하면 레거시 오브젝트
> 없이도 항상 통과하는 거짓 green 이 되어 실제 이관 결함(객체 유실·체크섬 불일치·부분 실패 은폐)을
> 은폐한다. 대신 [옵션 A 실행 계약](#옵션-a-실행-계약)으로 사용자 실행 절차·기대 결과·판정 기준을
> 명세하고, 5b(Test EXECUTION)/Deploy Agent 가 사용자 제출 결과를 이 계약으로 판정한다
> (spec.md "사후 검증 활동 실행 방식" 옵션 A, plan.md PATCH-A08).

| SC-ID | 수용 기준 | Happy Path | Edge Case | Error Case | 테스트 파일·함수 / 검증 방식 | env 태그 |
|---|---|---|---|---|---|---|
| SC-001 | UPLOADED 전건 R2 존재, PENDING 제외 | UPLOADED key 전건 R2 존재 | PENDING key R2 미존재(자연 배제) | — | 옵션 A — §옵션 A 실행 계약 1 | [env:e2e-db] |
| SC-002 | 사전복사 완료 시 대상 100% R2 이관 | 100% 성공(잔존 실패는 SC-007) | — | — | 옵션 A — §옵션 A 실행 계약 2 | [env:e2e-db] |
| SC-003 | 윈도우 내 델타(신규 UPLOADED)만 추가 이관 | — | 기존 파일 skip·신규만 전송 | — | 옵션 A — §옵션 A 실행 계약 3 | [env:e2e-db] |
| SC-004 | R2 key==레거시 key, url=base+key | key·url 일치 | — | — | 옵션 A — §옵션 A 실행 계약 4 | [env:integration] |
| SC-005 | 개수 100% + 샘플 체크섬 일치 | 개수·해시 일치(멀티파트 fallback 포함) | — | — | 옵션 A — §옵션 A 실행 계약 5 | [env:e2e-db] |
| SC-006 | 개별 실패 주입 시 미중단·목록·재시도 | — | — | 전체 계속·실패 key 기록·재시도 | 옵션 A — §옵션 A 실행 계약 6 | [env:integration] |
| SC-007 | 잔존 실패 시 사전평가에 "재확인"+실패목록 | 리포트 문구·목록 존재 | — | 미해결 실패 시나리오 재현 | `file-migration-pre-assessment.spec.ts::test_SC007_pre_assessment_documents_residual_failure_reconfirmation` | [env:static] |
| SC-008 | 런북에 S3 접근 단계마다 "사용자실행→전달→검증" | 절차 존재(단계별) | — | — | `file-migration-runbook.spec.ts::test_SC008_*`(it.each 5건 + 라벨 최소출현) | [env:static] |
| SC-009 | 사전평가에 총개수·총용량·예상소요 | 3항목 존재 | — | — | `file-migration-pre-assessment.spec.ts::test_SC009_pre_assessment_has_total_count_capacity_duration_slots` | [env:static] |
| SC-010 | 파일 이관 스크립트가 020 러너 이미지 내 실행 가능(신규 이미지 없음) | rclone 추가 1줄·별도 이미지 0 | — | — | `file-migration-script.spec.ts::test_SC010_*` | [env:static] |
| SC-011 | 델타 소요 60분(NFR-001) 범위 내 | — | 델타 구간 ≤60분 | — | 옵션 A — §옵션 A 실행 계약 7 | [env:e2e-db] |
| SC-012 | 사전복사에 타임아웃 자동중단 로직 없음 | — | `--max-duration` 등 전체상한 미설정 확인 | — | `file-migration-script.spec.ts::test_SC012_*` | [env:static] |
| SC-013 | 컷오버 개시 시점 개수 대조 불일치 0건 | 개수 불일치 0 | — | — | 옵션 A — §옵션 A 실행 계약 8 | [env:e2e-db] |
| SC-014 | 전송 채널 TLS/HTTPS 적용 | HTTPS 엔드포인트·평문 금지 확인 | — | — | `file-migration-script.spec.ts::test_SC014_*` | [env:static] |
| SC-015 | 이관 로그 감사 형태 저장 | 파일/verification_runs 저장 확인 | — | — | 옵션 A — §옵션 A 실행 계약 9 | [env:integration] |

---

## 외부 의존성 명시

- **fixture/mock**: 정적 테스트(`file-migration-runbook.spec.ts`·`file-migration-pre-assessment.spec.ts`·`file-migration-script.spec.ts`) 는 fixture·mock 이 필요 없다 — `scripts/migration/**` 의 실제 파일을 직접 읽는다.
- **환경 변수**: 정적 테스트는 환경 변수 불필요. 옵션 A 실행(사용자 환경)은 `scripts/migration/config.example.env` 를 복사한 `config.env`(커밋 금지)에 레거시 S3 자격증명(엔드포인트·버킷·리전·access/secret)·R2 자격증명(021 `R2_*` 재사용)·`R2_PUBLIC_BASE_URL`·`TARGET_DSN` 등 실값이 필요하다.
- **외부 서비스**: 정적 테스트는 외부 서비스 불필요. 옵션 A 실행은 레거시 AWS S3(또는 등가 S3 호환 오브젝트 스토리지, 실 자격증명·네트워크 접근) + Cloudflare R2 버킷(021) + 타깃 Fly Postgres 접근이 필요하다(사용자 환경 전제, spec.md "사후 검증 활동 실행 방식").
- **하네스 전제**: 정적 테스트 경로는 `apps/backend/test/static/file-migration-*.spec.ts` → `path.resolve(__dirname, '../../../../scripts/migration/...')`(4레벨 상위 = repo-root, tasks.md 하네스 canonical). 실행: `pnpm exec jest --config ./test/jest-e2e.json --testPathPattern 'test/static/file-migration-'`(apps/backend 디렉토리 기준 — rootDir="src" 인 기본 `package.json` jest 설정은 `test/static/` 를 포함하지 않으므로 `test/jest-e2e.json`(rootDir=".") 경유 필수, 020 선례 동일).

---

## 옵션 A 실행 계약

> **원칙**: 아래 절차는 4단계 Development 산출물(`files-migrate.sh`·`sql/30_file_url_update.sql`)을
> 사용자가 실 레거시 S3·R2·타깃 Postgres 환경에서 실행하고, 결과(리포트)를 5b(Test EXECUTION)/Deploy
> Agent 에게 전달하는 계약이다. 본 파이프라인은 레거시 자격증명·네트워크 접근이 없으므로 아래 절차를
> 자동 실행하지 않는다(spec.md 옵션 A, tasks.md T-D04).
>
> **T-B01/T-B02 관련 caveat**: 아래 절차는 tasks.md Test Authoring Contract 가 고정한 canonical
> 서브커맨드명(`precheck`/`precopy`/`delta`/`verify`/`url-update`)을 기준으로 작성했다. `files-migrate.sh`
> 자체는 T-B01·T-B02(4단계 Development, PPG-1 병렬 진행 중)가 아직 산출하지 않아 정확한 CLI 플래그
> 형태(옵션명·인자 순서)가 확정되지 않았다. 서브커맨드명·핵심 플래그(`--files-from`·`--checksum`)는
> canonical 로 고정되어 있으므로 명령 골격은 유지되나, 세부 플래그는 산출물 확정 후 재확인이 필요할 수
> 있다(5b 진입 전 재확인 필요 시 main session 이 안내).

### 1. SC-001 — UPLOADED 전건 R2 존재, PENDING 제외

```bash
# config.env 준비(§외부 의존성 명시) 후 순서대로 실행
./scripts/migration/files-migrate.sh precopy
./scripts/migration/files-migrate.sh verify
psql "$TARGET_DSN" -c "SELECT count(*) FROM files.files WHERE status='UPLOADED';"
psql "$TARGET_DSN" -c "SELECT key FROM files.files WHERE status='PENDING' LIMIT 20;"
rclone lsf <r2-remote>:<bucket>   # PENDING 표본 key 가 R2 에 없는지 개별 대조
```

- **기대 결과**: `files.files WHERE status='UPLOADED'` 전건이 R2 버킷에 존재(verify 리포트 count 일치). `status='PENDING'` 레코드의 key 는 `--files-from`(UPLOADED 목록만) 특성상 R2 에 복사되지 않음 — 표본 PENDING key 를 R2 에서 조회해 부재를 확인.
- **판정 기준(5b)**: UPLOADED 전건 R2 존재(불일치 0) + 표본 PENDING key 전부 R2 미존재. 하나라도 어긋나면 FAIL.

### 2. SC-002 — 사전복사 완료 시 대상 100% R2 이관

```bash
./scripts/migration/files-migrate.sh precheck
./scripts/migration/files-migrate.sh precopy
./scripts/migration/files-migrate.sh verify
```

- **기대 결과**: verify 리포트(개수 대조)에서 사전 복사 대상 파일의 100%가 R2 로 이관 성공(잔존 실패는 SC-007 로 별도 처리 — 재확인 게이트).
- **판정 기준(5b)**: verify 개수 대조 불일치 0건. 잔존 실패가 있는 경우 FR-007 경로(사전평가 리포트 재확인 문구) 존재 여부와 함께 확인.

### 3. SC-003 — 윈도우 내 델타(신규 UPLOADED)만 추가 이관

```bash
# precopy 완료 후, 레거시에 신규 파일 1건을 업로드하여 UPLOADED 로 confirm(테스트 픽스처)
./scripts/migration/files-migrate.sh delta
```

- **기대 결과**: delta 실행 로그에서 precopy 시점 이미 복사된 객체는 checksum 일치로 skip, precopy 이후 신규 UPLOADED 가 된 객체만 실제 전송(rclone 전송 카운트 == 신규 파일 수).
- **판정 기준(5b)**: delta 전송(transferred) 건수가 신규 업로드 건수와 일치하고, 기존 파일 재전송 0건.

### 4. SC-004 — R2 key == 레거시 key, url = R2_PUBLIC_BASE_URL + key

```bash
./scripts/migration/files-migrate.sh url-update
psql "$TARGET_DSN" -c "SELECT key, url FROM files.files WHERE status='UPLOADED' LIMIT 20;"
```

- **기대 결과**: 샘플 행의 `url` 이 `R2_PUBLIC_BASE_URL || '/' || key` 형태이고, `key` 값이 레거시 원본 key 와 동일(리키잉 없음, FR-004).
- **판정 기준(5b)**: 샘플 전건 url 형식 일치 + key 값 레거시 대비 불일치 0건.

### 5. SC-005 — 개수 100% + 샘플 체크섬 일치

```bash
./scripts/migration/files-migrate.sh verify
psql "$TARGET_DSN" -c "SELECT phase, step, status, detail FROM migration_staging.verification_runs WHERE phase='file-migration' AND step='verify' ORDER BY started_at DESC LIMIT 1;"
```

- **기대 결과**: 개수 대조 100% 일치(불일치 0) + 무작위 샘플(전체 UPLOADED 의 1% 또는 100건 중 큰 값) 체크섬 일치(멀티파트 판정 샘플은 `rclone check --download` 콘텐츠 바이트 대조로 fallback 되었는지 리포트에서 확인).
- **판정 기준(5b)**: `detail` 의 count 불일치 0 + checksum mismatch 0(멀티파트 fallback 적용 항목 포함).

### 6. SC-006 — 개별 실패 주입 시 미중단·실패목록·재시도

```bash
# 임의 key 1건을 존재하지 않는 소스로 재현(예: --files-from 목록에 레거시에 없는 key 추가)하여 precopy 실행
./scripts/migration/files-migrate.sh precopy
```

- **기대 결과**: 해당 key 실패에도 나머지 파일 전송은 계속됨(전체 abort 없음). 실패 key 가 목록(로그 또는 리포트 파일)에 캡처되고, 재시도(`--retries`)가 수행됨.
- **판정 기준(5b)**: 실패 유발 후에도 다른 파일 전송 성공 확인 + 실패 key 목록에 유발한 key 존재 + 재시도 로그 존재.

### 7. SC-011 — 델타 소요 60분(NFR-001) 범위 내

```bash
psql "$TARGET_DSN" -c "SELECT phase, step, started_at, finished_at FROM migration_staging.verification_runs WHERE phase='file-migration' AND step='delta' ORDER BY started_at;"
```

- **기대 결과**: delta 단계(020 컷오버 윈도우 내 실행) 시작~종료 시각 차이가 60분 이하.
- **판정 기준(5b)**: 리허설 또는 실제 실행 로그의 delta 단계 시각차 ≤ 60분.

### 8. SC-013 — 컷오버 개시 시점 개수 대조 불일치 0건

```bash
./scripts/migration/files-migrate.sh verify
psql "$TARGET_DSN" -c "SELECT detail FROM migration_staging.verification_runs WHERE phase='file-migration' AND step='verify' ORDER BY started_at DESC LIMIT 1;"
```

- **기대 결과**: 사전 복사 완료 확정 시점(컷오버 개시 직전) 실행한 verify 의 개수 대조에서 불일치 0건.
- **판정 기준(5b)**: `detail` 의 count 불일치 0. 1건이라도 있으면 FAIL(GO 게이트 불충족).

### 9. SC-015 — 이관 로그 감사 형태 저장

```bash
psql "$TARGET_DSN" -c "SELECT phase, step, started_at, finished_at, status, detail FROM migration_staging.verification_runs WHERE phase='file-migration' ORDER BY started_at;"
cat ./migration-run/*.log   # files-migrate.sh 구조적 로그(경로는 T-B01/T-B02 확정 후 재확인)
```

- **기대 결과**: 각 서브커맨드(precheck·precopy·delta·verify·url-update)의 시작·종료 시각과 파일별 성공/실패/재시도 수·검증 결과가 (a) 구조적 로그 파일 + (b) `verification_runs`(phase='file-migration') 양쪽에 기록.
- **판정 기준(5b)**: 두 소스 모두에서 5개 서브커맨드 전 단계 기록 확인. 자격증명·PII 평문 노출 없음(마스킹 확인 — `lib/common.sh::mask_dsn` 재사용 정적 확인은 별도 보강 가능).

---

## 미커버 항목 (사전 분류 — 4-카테고리)

> 5b(Test EXECUTION)의 `coverage-gap.md` 작성 시 아래 사전 분류를 참조한다. 실 레거시 S3 접속이
> 필요한 전 SC 는 (2) 단위테스트 불가로 분류하되, 실제 이관 실행 주체가 사용자(운영자)이므로
> (3) 운영 환경에서 확인 권장으로 최종 분류한다(위 §옵션 A 실행 계약이 검증 방법·환경·담당을
> 대체 기술).

| SC-ID | 미커버 시나리오 | 카테고리 | 검증 방법 | 환경/도구 | 담당 |
|---|---|---|---|---|---|
| SC-001 | UPLOADED 전건 R2 존재·PENDING 제외 실측 | (3) 운영 환경 권장 | §옵션 A 실행 계약 1 | 레거시 S3 + R2 + Fly Postgres | 운영 |
| SC-002 | 사전복사 100% 이관 대조 | (3) 운영 환경 권장 | §옵션 A 실행 계약 2 | 상동 | 운영 |
| SC-003 | 윈도우 내 델타만 추가 전송 | (3) 운영 환경 권장 | §옵션 A 실행 계약 3 | 상동 | 운영 |
| SC-004 | key/url 일치 실측 | (3) 운영 환경 권장 | §옵션 A 실행 계약 4 | 상동 | 운영 |
| SC-005 | 개수·샘플 체크섬 일치 | (3) 운영 환경 권장 | §옵션 A 실행 계약 5 | 상동 | 운영 |
| SC-006 | 개별 실패 주입·재시도 실측 | (3) 운영 환경 권장 | §옵션 A 실행 계약 6 | 상동 | 운영 |
| SC-011 | 델타 소요 ≤60분 실측 | (3) 운영 환경 권장 | §옵션 A 실행 계약 7 | 리허설/실행 로그 | 운영 |
| SC-013 | 컷오버 개시 개수 대조 불일치 0 | (3) 운영 환경 권장 | §옵션 A 실행 계약 8 | 레거시 S3 + R2 + Fly Postgres | 운영 |
| SC-015 | 이관 로그 감사 저장 확인 | (3) 운영 환경 권장 | §옵션 A 실행 계약 9 | 상동 | 운영 |
| — | `files-migrate.sh`(T-B01/T-B02) 확정 CLI 플래그·서브커맨드 실코드 | (4) 차후 점검 | T-B01/T-B02 완료 후 옵션 A 절차 재확인 필요(§옵션 A 실행 계약 caveat) | — | 5b(재확인) |
| — | GAP-022-01 — `postgres:16-alpine` 러너 이미지의 alpine community 레포 rclone 가용성 | (4) 차후 점검 | `docker build` 1회 실행 + `rclone version` 확인(T-B03 완료기준) | Docker | Development/Deploy |
| — | GAP-022-02 — 020 감사 부채(SEC-020-01/02) 파일 이관 맥락 재평가 | (4) 차후 점검 | Security Agent 재평가(selection-phases.md) | — | Security |

> 카테고리 (1) 단위테스트 가능 항목은 0건이다(정적 검증 6건 SC 는 이미 jest 테스트로 작성 완료 —
> `file-migration-runbook.spec.ts`·`file-migration-pre-assessment.spec.ts`·`file-migration-script.spec.ts`,
> AUTHORING 시점 하드 assert FAIL 상태 — Development 산출 후 Green 전환 예정). 따라서 5b 는
> Development 복귀 요청 없이 위 (3)(4) 항목만으로 coverage-gap.md 를 작성할 수 있다(단 (4) 의
> GAP-022-01/02 는 각각 Development/Deploy·Security 담당으로 이미 gaps.md 에 등록되어 있어 재등록
> 불요).
