---
작성: Docs Agent
버전: v1.0
최종 수정: 2026-07-06 15:01
상태: 확정
---

# Diff: 022-legacy-file-binary-migration

## 커밋 메시지용 한 줄 요약

- **KO**: 레거시 AWS S3 실 파일 바이너리를 rclone 기반으로 Cloudflare R2 로 이관하는 도구(사전 대량 복사·컷오버 델타·검증·url 갱신)를 020 러너 이미지에 추가한다.
- **EN**: Add an rclone-based tool (bulk precopy, cutover-window delta, verification, url update) to migrate legacy AWS S3 file binaries to Cloudflare R2, extending the 020 runner image.

## 변경 요약

- **A. 데이터 계층**: `sql/30_file_url_update.sql` 신규 — `files.files.url` 을 `base||'/'||key` 형태로 멱등 UPDATE(`WHERE status='UPLOADED'`), 개수 대조·url 형식 검증·key 목록 추출(옵션 A `--files-from` 용) 4개 쿼리. DDL 변경 0건.
- **B. 이관 스크립트·설정·이미지 계층**: `files-migrate.sh` 신규 — `precheck`(레거시 총개수·총용량·예상소요 산정)·`precopy`(윈도우 전 벌크 사전 복사, `--checksum`·`--files-from`, `--max-duration` 미설정)·`delta`(윈도우 개시 후 멱등 재복사로 최종 델타만 실질 전송)·`verify`(개수 100% 대조 + 무작위 샘플 체크섬, 멀티파트 ETag 는 `--download` 실 바이트 대조 fallback)·`url-update`(SQL 실행) 5개 서브커맨드. `Dockerfile` 은 `rclone` 설치 1줄 추가(020 이미지 확장, 신규 이미지 없음). `config.example.env` 는 레거시 S3·R2 rclone remote 설정 키 추가(실값 미기재).
- **C. 운영 인터페이스 계층**: `FILE-MIGRATION-RUNBOOK.md`(옵션 A 실행 절차 — 레거시 접근 4단계마다 "사용자 실행→전달→검증")·`FILE-PRE-ASSESSMENT.md`(사전평가 리포트 템플릿) 신규.
- **D. 테스트 계층**: 정적 테스트 3스위트(런북·사전평가·스크립트/설정/이미지) 신규 18개 테스트 전건 PASS. 실 레거시 S3 접근이 필요한 SC 9건은 `test/test-cases.md` §옵션 A 실행 계약으로 명세(자동 실행 불가, 020 선례 승계).
- **앱 도메인 코드(`apps/backend/src`·`prisma`) 변경 0건** — 파일 이관은 out-of-band 러너 스크립트로만 수행.

## 변경 파일 및 라인 수

| 파일 | 추가 | 삭제 |
|---|---|---|
| `scripts/migration/Dockerfile` | +7 | -3 |
| `scripts/migration/config.example.env` | +34 | -0 |
| `scripts/migration/files-migrate.sh` (신규) | +334 | -0 |
| `scripts/migration/sql/30_file_url_update.sql` (신규) | +44 | -0 |
| `scripts/migration/FILE-MIGRATION-RUNBOOK.md` (신규) | +146 | -0 |
| `scripts/migration/FILE-PRE-ASSESSMENT.md` (신규) | +81 | -0 |
| `apps/backend/test/static/file-migration-runbook.spec.ts` (신규) | +72 | -0 |
| `apps/backend/test/static/file-migration-pre-assessment.spec.ts` (신규) | +59 | -0 |
| `apps/backend/test/static/file-migration-script.spec.ts` (신규) | +130 | -0 |

## Diff

> 전체 diff 는 박제하지 않는다 — git 이 형상관리 SoT. base commit `c59e6f9`(021 문서 반영 커밋,
> `[docs] 021 결제·파일 실연동 반영 — context.md/infra.md 갱신 (GAP-021-03)`) 기준 재생성:
> `git diff c59e6f9 -- scripts/migration apps/backend/test/static docs/specs/v1.1.0/022-legacy-file-binary-migration`
>
> base 혼재 없음(PROC-016-01 해당 없음) — 020(`c702d85`)·021(`c21840e`·`c59e6f9`) 모두 022 시작
> 이전에 커밋 완료 상태였다.
