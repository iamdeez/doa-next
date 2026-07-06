---
작성: Docs Agent
버전: v1.0
최종 수정: 2026-07-05 22:31
상태: 확정
---

# Diff: 020-data-migration-cutover

## 커밋 메시지용 한 줄 요약

- **KO**: 레거시 AWS RDS(18서비스) → 신규 Fly Postgres(8스키마 33테이블) 데이터 이관·컷오버 설계 + 이관 도구(스테이징 ETL·검증 하네스·런북) + 정적 검증 테스트 3종 추가 (신규 앱 도메인 코드 변경 0건)
- **EN**: Add legacy-to-new data migration/cutover design with staged-ETL tooling, verification harness, runbook, and 3 static verification test suites (zero application domain code changes)

## 변경 요약

- **매핑 명세(`MAPPING-SPEC.md`)**: 레거시 18서비스 ↔ 신규 8스키마 33테이블 필드 단위 매핑표(FR-009), ephemeral 4종(`refresh_tokens`·`password_reset_otps`·`oauth_states`·`payment_outbox`) 이관 스킵 확정(GAP-020-01 RESOLVED), 비-1:1 변환 규칙 4건(`carts` JSONB 집계·`shippingAddressSnapshot` JSONB 조립·`variants` 옵션 인라인 가정·`social_accounts` 레거시 대응 불명) 문서화(FR-010/SC-012), `FileAsset` 물리 테이블명 실측 발견(`files.files`, GAP-020-02).
- **스테이징·변환·검증 SQL**: `sql/00_staging_ddl.sql`(`migration_staging` 임시 스키마 + `verification_runs` 감사 테이블), `sql/10_transform.sql`(위상순서 UPSERT — users→products→commerce→orders→payments→settlements→admin→files), `sql/20_verify.sql`(count·Decimal sum·sample checksum·anti-join 4종 검증).
- **이관 러너**: `lib/common.sh`(config 로더·`PGSSLMODE=require` 강제·bash 3.2 이식성 헬퍼)·`extract.sh`(precopy/delta 모드, 워터마크/full-recopy 분기, 미검증 매핑 추출 강행 금지 + 쿼리 템플릿 스캐폴드 자동생성)·`load.sh`(TRUNCATE-재적재/증분 append 분기)·`run.sh`(precopy/outbox-check/cutover/rollback 서브커맨드, 컷오버 0~7단계 함수화 + `verification_runs` 감사 기록 통합)·`delta-classes.conf`(29 대상+1보조 테이블 델타 분류)·`config.example.env`(secret placeholder만, 실값 미포함).
- **운영 문서**: `RUNBOOK.md`(10개 필수 체크포인트 — 담당자·체크포인트·롤백 트리거 3요소 전단계 기재, D-3일 공지·GO/NO-GO 게이트·PoNR 경고 포함)·`PRE-ASSESSMENT.md`(테이블별 행수·예상 소요·윈도우 여유율, NFR-005 게이트 링크).
- **정적 검증 테스트**: `migration-mapping.spec.ts`(SC-011/012, 33테이블 매핑 완결성)·`migration-config.spec.ts`(SC-013/017, 사전평가 리포트 구조·TLS 설정)·`migration-runbook.spec.ts`(SC-003/008/009/010/014/015/018/019, 런북 체크포인트 완결성) — 3스위트 54건 전PASS.
- **범위 확인**: `apps/backend/src`·`apps/backend/prisma` 도메인 코드 변경 0건(`git diff 1dd5132` 기준). 신규 npm 의존성 0건.

## 변경 파일 및 라인 수

| 파일 | 추가 | 삭제 |
|---|---|---|
| `.gitignore` | +4 | -0 |
| `apps/backend/test/static/migration-config.spec.ts` (신규) | +125 | -0 |
| `apps/backend/test/static/migration-mapping.spec.ts` (신규) | +157 | -0 |
| `apps/backend/test/static/migration-runbook.spec.ts` (신규) | +158 | -0 |
| `scripts/migration/MAPPING-SPEC.md` (신규) | +534 | -0 |
| `scripts/migration/RUNBOOK.md` (신규) | +164 | -0 |
| `scripts/migration/PRE-ASSESSMENT.md` (신규) | +85 | -0 |
| `scripts/migration/config.example.env` (신규) | +54 | -0 |
| `scripts/migration/delta-classes.conf` (신규) | +71 | -0 |
| `scripts/migration/lib/common.sh` (신규) | +104 | -0 |
| `scripts/migration/extract.sh` (신규) | +153 | -0 |
| `scripts/migration/load.sh` (신규) | +107 | -0 |
| `scripts/migration/run.sh` (신규) | +278 | -0 |
| `scripts/migration/sql/00_staging_ddl.sql` (신규) | +404 | -0 |
| `scripts/migration/sql/10_transform.sql` (신규) | +235 | -0 |
| `scripts/migration/sql/20_verify.sql` (신규) | +288 | -0 |
| `scripts/migration/queries/extract/*.sql.template` (신규 30개, extract.sh 스캐폴드 자동생성) | +461 | -0 |

> untracked 신규 파일 42개(`scripts/migration/` 전체) + 신규 테스트 3개 + `.gitignore` 수정 1개 = 46개 파일, 합계 +3,382/-0. `apps/backend/src`·`apps/backend/prisma`(도메인 코드) 변경 0건.

## Diff

> 전체 diff 는 박제하지 않는다 — git 이 형상관리 SoT. 재생성 명령:
> `git diff 1dd5132 -- .gitignore` (tracked 수정분)
> 신규(untracked) 파일은 `git status --porcelain` 으로 목록 확인 후 개별 `git diff --no-index /dev/null {파일}` 로 재생성.
