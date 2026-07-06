---
작성: Deploy Agent
버전: v1.0
최종 수정: 2026-07-06 15:12
상태: 확정
---

# Deploy Report: 022-legacy-file-binary-migration

> Branch: 022-legacy-file-binary-migration | Plan: [../planning/plan.md](../planning/plan.md) | Spec: [../spec/spec.md](../spec/spec.md) | Runbook: [../../../../../scripts/migration/FILE-MIGRATION-RUNBOOK.md](../../../../../scripts/migration/FILE-MIGRATION-RUNBOOK.md)

## 목차

- [배경](#배경)
- [배포 전략](#배포-전략)
- [컨테이너 구성 — 러너 이미지 확장 검증](#컨테이너-구성--러너-이미지-확장-검증)
- [CI/CD 파이프라인](#cicd-파이프라인)
- [환경 변수](#환경-변수)
- [컷오버 런북 통합 검토](#컷오버-런북-통합-검토)
- [배포 검증 결과](#배포-검증-결과)
- [infra.md 갱신 필요 사항](#inframd-갱신-필요-사항)

---

## 배경

022 는 신규 앱 도메인 코드를 도입하지 않는 out-of-band 이관 도구다(P-007, plan.md 확정). 배포 관점 변경은 020 전용 러너 이미지(`scripts/migration/Dockerfile`) 확장(`rclone` 추가) 1건뿐이며, `apps/backend` 운영 이미지·CI/CD 워크플로우(`.github/workflows/ci.yml`)·Fly.io 배포 설정은 무변경이다. 본 보고서는 plan.md "배포 환경 영향(PROC-009)"이 Deploy Agent 에 위임한 3개 항목(러너 이미지 확장 검증·060분 윈도우 통합 런북 검토·R2 서빙 도메인 사전점검)을 다룬다.

## 배포 전략

- **배포 방식**: 해당 없음(운영 앱 배포 방식 무변경 — infra.md §3 rolling deploy 그대로). 022 산출물은 Fly.io one-off machine 으로 1회성 실행되는 이관 러너이며, 상시 서비스 배포 파이프라인과 분리되어 있다(020 ADR-002 승계).
- **롤백 트리거·절차**: 별도 신규 트리거 불요. `sql/30_file_url_update.sql` 의 url 갱신이 **단일 `UPDATE ... WHERE status='UPLOADED'`** 문으로 원자적이며, 이 문장은 020 `run.sh cutover` 의 GO 판정(§단계 4) **이후**에만 실행된다(FILE-MIGRATION-RUNBOOK.md §4). 즉 verify 단계(SC-005/013)가 NO-GO 로 판정되면 url-update 자체가 실행되지 않으므로 `files.files.url` 오염 가능성이 없고, 020 §단계 6 롤백(레거시 쓰기차단 해제 + 트래픽 유지)에 파일 이관 실패도 그대로 흡수된다. 사전복사(precopy)·델타(delta) 단계는 rclone 멱등 skip(`--checksum`)으로 재실행 자체가 안전(신규 트리거 불요).

## 컨테이너 구성 — 러너 이미지 확장 검증

Development Agent 의 GAP-022-01 RESOLVED 보고("`docker build` 1회 성공 + `rclone version` v1.74.1-DEV 확인")를 그대로 신뢰하지 않고 **Deploy Agent 가 독립 재현**했다(020 GAP-020-05 재검증 선례 준용).

| 검증 항목 | 명령 | 결과 |
|---|---|---|
| 이미지 빌드(캐시 배제) | `docker build --no-cache -f scripts/migration/Dockerfile -t doa-migration-runner-deploycheck2 scripts/migration` | PASS — `apk add --no-cache curl rclone` 이 alpine community 레포에서 rclone 1.74.1-r1 패키지로 정상 해소(9개 패키지, 319.5 MiB) |
| rclone 바이너리 버전 | `docker run --rm ... rclone version` | PASS — `rclone v1.74.1-DEV`(Development 보고와 일치, alpine arm64) |
| 기본 도구 존재(bash/psql/pg_dump/curl/rclone) | `which bash psql pg_dump curl rclone` | PASS — 5개 전부 `/bin/bash`·`/usr/local/bin/psql`·`/usr/local/bin/pg_dump`·`/usr/bin/curl`·`/usr/bin/rclone` 확인 |
| ENTRYPOINT/CMD 기본 동작 | `docker run --rm <image>` (무인자) | PASS — `doa-migration-runner ready — invoke: ...` 안내 배너 출력(서버 기동 무력화 확인, `ENTRYPOINT []` 정상 동작). 컨테이너가 `sleep infinity` 로 대기 중임을 확인 후 `docker stop` 으로 정리 |
| `files-migrate.sh` 실행권한·구문 | `ls -l` + `bash -n /migration/files-migrate.sh` | PASS — `-rwxr-xr-x`(+x) 확인, 구문 오류 0건(SYNTAX_OK) |
| 서브커맨드 미지정 시 usage | `/migration/files-migrate.sh` (인자 없음) | PASS — usage 출력 후 `exit_code=1` |

**결론**: GAP-022-01 RESOLVED 보고 내용을 캐시 미사용 빌드로 재현 확인 — 대안(레포 라인 추가·정적 바이너리 curl 다운로드, GAP-022-01 안전망 조항)은 불필요했다. 테스트 이미지·컨테이너는 검증 후 `docker rm -f`/`docker rmi` 로 정리 완료(git status 영향 없음 — Dockerfile 소스 변경 없이 이미지만 로컬 빌드).

## CI/CD 파이프라인

`.github/workflows/ci.yml`(lint→typecheck→test→docker-build) 무변경 대상 — 022 는 `apps/backend` 코드를 건드리지 않으므로 CI 파이프라인 잡 정의에 신규 반영 사항이 없다. `scripts/migration/Dockerfile` 빌드는 CI 파이프라인에 편입되어 있지 않으며(020 부터 수동/운영 시점 빌드로 설계), 022 도 이 설계를 그대로 승계한다.

## 환경 변수

`apps/backend/.env.example` 변경 없음(앱 런타임 환경변수 무변경). 022 신규 환경변수는 `scripts/migration/config.example.env` 에 이미 추가되어 있다(Development Agent 산출물, T-B04) — 레거시 S3(`LEGACY_S3_ENDPOINT`·`LEGACY_S3_REGION`·`LEGACY_S3_BUCKET`·`LEGACY_S3_ACCESS_KEY_ID`·`LEGACY_S3_SECRET_ACCESS_KEY`)·R2(`R2_ACCOUNT_ID`·`R2_ACCESS_KEY_ID`·`R2_SECRET_ACCESS_KEY`·`R2_BUCKET`·`R2_PUBLIC_BASE_URL`, 021 재사용)·rclone 전송 파라미터(`RCLONE_RETRIES`·`RCLONE_RETRIES_SLEEP`·`RCLONE_TRANSFERS`) 슬롯 전부 실값 미기재([TO-VERIFY]/`<placeholder>` 형태만) 확인 — 실 시크릿 커밋 0건. `scripts/migration/config.env`(실값 파일)는 `.gitignore`(L43)·`.dockerignore`(L2) 양쪽에 이미 등재되어 있음을 재확인.

R2 이관 전용 write-scoped 토큰 분리 발급 권장(config.example.env 주석, Security Agent 검토 대상) — 이 권고는 Development 산출물에 이미 명시되어 있으며 Deploy 단계에서 추가 조치 불요.

## 컷오버 런북 통합 검토

plan.md 가 Deploy Agent 에 위임한 "런북에서 020 컷오버 시퀀스에 파일 델타·검증 단계 통합 배치"는 022 쪽 산출물(`FILE-MIGRATION-RUNBOOK.md §4` "020 컷오버 윈도우 통합 체크포인트")로 이미 충족되어 있음을 확인했다 — 020 RUNBOOK.md 의 단계 1(쓰기차단)~단계 7(윈도우종료) 각각에 022 의 delta/verify/url-update 병행 지점이 표로 매핑되어 있고, GO/NO-GO 판단은 "DB 검증 + 파일 검증(SC-005/013) 양쪽 모두 pass" 로 명시되어 있어 통합 판정 기준도 명확하다.

**발견된 위험(GAP-022-04 신규 기록)**: 그러나 020 원본 `RUNBOOK.md` 자체에는 022/`file-migration`/`files-migrate` 관련 교차참조가 **0건**이다(`grep` 실측 확인). 즉 운영자가 (022 spec 폴더를 인지하지 못한 채) 020 `RUNBOOK.md` 만 보고 컷오버를 실행하면 파일 바이너리 이관 단계의 존재 자체를 놓칠 수 있다. `RUNBOOK.md` 는 020 스펙 사이클의 기완료 산출물이므로 Deploy Agent(022)가 직접 수정하지 않고 `gaps.md` GAP-022-04 로 기록, Retrospective Agent/후속 patch spec 위임 처리했다(GAP-022-03 과 동일 처리 원칙 — agent-rules.md §3.1).

R2 공개 접근 사전점검(US-005, FILE-MIGRATION-RUNBOOK.md §5)은 이관 완료 후 실제 R2 버킷·도메인에서만 수행 가능한 옵션 A 대상 항목이라 파이프라인 내 자동 검증 범위 밖이다 — 런북에 체크리스트로 명시되어 있음을 확인(추가 조치 불요).

## 배포 검증 결과

- 컨테이너 빌드: **PASS** (캐시 배제 재현)
- 러너 이미지 도구 일체 기동: **PASS** (bash/psql/pg_dump/curl/rclone 전부 확인)
- 헬스체크: **해당 없음** — 본 spec 은 smoke_tests 불요로 확정되어 있다(plan.md "테스트 전략 > smoke_tests: N" — 신규 앱 코드 변경 없어 `GET /health` 회귀 유발 경로 없음). 파일 URL 갱신 후 접근성(US-005)은 사후 운영 검증(옵션 A, R2 공개 접근 사전점검 §5)으로 별도 확인.
- 환경 변수 주입: **PASS** (config.example.env 슬롯 전건 확인, 실 시크릿 미포함, .gitignore/.dockerignore 등재 확인)
- 롤백 절차: **PASS** (verify GO 판정 전 url-update 미실행 설계로 부분 오염 불가 — 020 §단계6 롤백에 흡수)

## infra.md 갱신 필요 사항

- GAP-022-03(Docs Agent 기록, `infra.md §8` 컷오버 실행 인프라 행에 rclone 미반영) — 인용만, 중복 기록하지 않음.
- GAP-022-04(본 단계 신규 기록, `scripts/migration/RUNBOOK.md` 022 교차참조 누락) — Retrospective Agent 위임.
