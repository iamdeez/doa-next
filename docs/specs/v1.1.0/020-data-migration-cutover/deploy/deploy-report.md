---
작성: Deploy Agent
버전: v1.1
최종 수정: 2026-07-05 23:04
상태: 확정 (재검증 PASS)
---

# Deploy Report: 020-data-migration-cutover

> Branch: 020-data-migration-cutover | Plan: [../planning/plan.md](../planning/plan.md) | Runbook: [../../../../../scripts/migration/RUNBOOK.md](../../../../../scripts/migration/RUNBOOK.md)

## 목차

- [1. 검증 범위 및 방법](#1-검증-범위-및-방법)
- [2. 이관 러너 구성 정합성](#2-이관-러너-구성-정합성)
- [3. 보안·자격증명 배포 구성](#3-보안자격증명-배포-구성)
- [4. 런북 배포 절차 완결성](#4-런북-배포-절차-완결성)
- [5. 기존 배포 구성 영향](#5-기존-배포-구성-영향)
- [6. 종합 판정](#6-종합-판정)
- [7. 재검증 — GAP-020-05 대안 B 구현 확인](#7-재검증--gap-020-05-대안-b-구현-확인)

---

## 1. 검증 범위 및 방법

실 배포·실 이관 실행은 옵션 A(사용자 실 레거시 환경)로 파이프라인 밖에 있어 **정적 검증으로 갈음**한다.

- `bash -n run.sh extract.sh load.sh lib/common.sh` — 4개 스크립트 전부 구문 오류 0건(PASS). `shellcheck` 미가용 환경(로컬 미설치) — 코드 리뷰로 대체.
- `run.sh`/`extract.sh`/`load.sh`/`lib/common.sh`/`RUNBOOK.md`/`PRE-ASSESSMENT.md`/`config.example.env`/`.gitignore`/`apps/backend/Dockerfile`/`fly.toml`/`.github/workflows/ci.yml` 대조 리뷰.
- `git status --porcelain` 으로 `scripts/migration/config.env`·`migration-run/` 등 자격증명·산출물 파일의 실제 미추적 상태 확인.

## 2. 이관 러너 구성 정합성

### 2-1. `run.sh` 오케스트레이션 ↔ RUNBOOK.md 정합성 — PASS

`run.sh`의 서브커맨드(`precopy`/`outbox-check`/`cutover`/`rollback`)와 `cutover` 내부 시퀀스(`write-block`→`delta`→`verify`→`go-nogo`→GO 시 `traffic-cutover`+`window-close` / NO-GO 시 `rollback`)가 `RUNBOOK.md` §2 단계 0~7과 1:1 대응한다. GO/NO-GO 게이트(`do_go_nogo`)는 `sql/20_verify.sql`이 기록하는 `verification_runs`의 `phase='verify'` 행을 `step`(count/sum/checksum/antijoin)별로 집계하며, `sum`은 `detail->>'required'`, `antijoin`은 `detail->>'core'` 플래그로 핵심 항목만 AND 조건에 반영한다 — `20_verify.sql`의 실제 INSERT 문(각 step 행)과 대조한 결과 필드명·값 일치 확인(거짓 GO 없음).

### 2-2. `extract.sh`/`load.sh` 서비스별 개별 RDS 순회 — PASS

`run.sh`의 `for_each_legacy_service`가 `--config-dir` 하위 `*.env` 각각을 `source`하여 `(LEGACY_DSN, LEGACY_SERVICE)` 쌍으로 `extract.sh`/`load.sh`를 호출 — FR-001(서비스별 개별 RDS) 구조와 일치. `extract.sh --mode=precopy|delta`, `load.sh --mode=precopy|delta` 분기 및 `delta-classes.conf`의 `behavior`(WATERMARK/FULL) 기반 분기(TRUNCATE 재적재 vs 증분 append)도 코드상 일치.

### 2-3. ADR-002 Fly.io one-off machine 실행 구조 — **FAIL (BLOCKED 사유)**

`run.sh` 헤더 주석은 두 실행 경로를 명시한다:

```
fly machine run <image> --command "scripts/migration/run.sh cutover" -a <target-app>
또는 fly ssh console -a <target-app> 진입 후 직접 실행.
```

`apps/backend/Dockerfile`(런타임 스테이지 `node:20-alpine`)을 직접 확인한 결과, 두 경로 모두 현재 상태로는 실행 불가능하다:

1. **`scripts/migration/` 미포함** — Dockerfile 어떤 스테이지에서도 `scripts/migration/`을 COPY하지 않는다(`COPY apps/backend/ ./apps/backend/`, `COPY packages/ ./packages/`만 존재). `<image>`가 backend 앱 이미지를 지칭한다면 러너 스크립트 자체가 이미지 안에 없다.
2. **`bash` 미설치** — `node:20-alpine` 런타임 이미지는 기본 셸이 `/bin/sh`(busybox ash)이며 `bash`가 별도 설치되어 있지 않다. `run.sh`/`extract.sh`/`load.sh`/`lib/common.sh` 전부 `#!/usr/bin/env bash`+`set -euo pipefail`을 사용하므로 `bash` 부재 시 즉시 실행 실패.
3. **`psql`/`pg_dump` 클라이언트 미설치** — Dockerfile에 `apk add postgresql-client` 류의 설치 단계가 없다. `lib/common.sh`의 `run_psql()`(`psql` 호출)과 `extract.sh`의 `\copy` 구문은 `psql` CLI 자체가 있어야 동작한다.

`fly ssh console -a <target-app>` 경로 역시 `<target-app>`이 이 Dockerfile로 배포된 현재 프로덕션 앱을 가리키는 한 동일한 3가지 결핍을 그대로 안는다. 즉 **ADR-002가 지정한 실행 경로 중 문서화된 형태로 그대로 실행 가능한 경로가 현재 하나도 없다** — 별도 러너 이미지 빌드/전달 절차, 또는 `fly ssh console` 진입 후 수동 `apk add`+파일 전송 절차 중 하나가 반드시 선행되어야 하는데 이 절차 자체가 `RUNBOOK.md`·`PRE-ASSESSMENT.md`·`config.example.env` 어디에도 명시되어 있지 않다.

> 코드 변경은 최소화 대상(팀리드 지시)이므로 본 Deploy Agent 는 Dockerfile/러너 이미지를 직접 생성하지 않고, 아래 2개 대안을 제시하여 사용자/팀리드 결정을 요청한다(§6·gaps.md GAP-020-05 참조).
> - **대안 A(임시)**: `fly ssh console -a <target-app>` 진입 후 `apk add --no-cache bash postgresql16-client`(버전은 타깃 Postgres 메이저 버전에 맞춤) 실행 + `fly ssh sftp shell -a <target-app>`(또는 `flyctl ssh sftp put`)으로 `scripts/migration/` 디렉터리를 전송한 뒤 실행. RUNBOOK.md §1 사전점검 체크리스트에 이 절차를 명시 추가 필요.
> - **대안 B(권장)**: `scripts/migration/`용 별도 경량 러너 이미지(Dockerfile.migration-runner 등 — `postgres:16-alpine` 또는 `node:20-alpine` 베이스 + `apk add bash postgresql16-client` + `COPY scripts/migration/ ./scripts/migration/`)를 신규 작성하고 `fly machine run <runner-image> -a <target-app-or-shared-network> --command "scripts/migration/run.sh cutover"`로 실행. 프로덕션 앱 이미지에 이관 전용 도구(psql/pg_dump/bash)를 상시 포함시키지 않아 이미지 비대화(P-001 성능 원칙)도 피한다.

## 3. 보안·자격증명 배포 구성

### 3-1. PGSSLMODE=require 중앙 강제(ADR-009) — PASS

`config.example.env`가 `export PGSSLMODE=require`를 최상단에 명시하고, `lib/common.sh`의 `load_migration_config()`이 `: "${PGSSLMODE:?PGSSLMODE 미설정 — ADR-009 필수}"`로 미설정 시 즉시 실패시킨다. `extract.sh`/`load.sh` 양쪽 모두 `assert_sslmode_require`(require/verify-ca/verify-full만 허용)를 호출 — 전송 채널 TLS 강제가 스크립트 3개 전부에 일관 적용됨을 확인(FR-015/NFR-004/SC-017).

### 3-2. 자격증명 커밋 차단(.gitignore) — PASS

`.gitignore`에 `scripts/migration/config.env`·`scripts/migration/migration-run/` 두 항목이 명시되어 있고, `git status --porcelain` 실측 결과 두 경로 모두 트리에 존재하지 않는다(생성된 적 없음 — 커밋 대상에 노출될 실경로 자체가 부재). `config.example.env`(템플릿, 커밋 대상)는 `<user>`/`<target-host>`/`[TO-VERIFY]` 플레이스홀더만 사용하고 실 자격증명 없음.

### 3-3. 로그 마스킹(ADR-009/NFR-006) — PASS

`lib/common.sh`의 `mask_dsn()`이 `postgresql://user:pass@host` → `postgresql://***@host`로 치환하며, `extract.sh`(L71)·`load.sh`(L62)의 `log_line INFO`가 `LEGACY_DSN`/`TARGET_DSN`을 로그에 남기기 전 반드시 `mask_dsn`을 거치는 것을 코드로 확인. `run.sh`의 `stage_run`/감사 테이블 기록(`verification_runs.detail`)도 `elapsed_sec`·상태 문자열만 담고 DSN 원문을 넣지 않는다.

## 4. 런북 배포 절차 완결성

### 4-1. 유지보수 윈도우 배포 절차 — PASS (구조), 경미한 보완 권고 1건

`RUNBOOK.md` §2 단계 0~7 각각에 시점·담당자·명령·체크포인트·롤백 트리거가 누락 없이 기재되어 있다(SC-015). §1 사전점검 체크리스트(7항목) — outbox 드레인·`prisma migrate status`·PITR 백업·CREATE 권한·레거시 자격증명·사전평가 완료·리허설 권고 — 는 `plan.md` "배포 환경 영향(PROC-009)" 항목과 대조해 대부분 반영되어 있으나, 다음 1개 항목이 누락되어 있다:

- `plan.md`가 명시적으로 "컷오버 시 최소 1인스턴스 유지 설정 권장(**런북**)"이라고 교차 참조했음에도(`infra.md §8` scale-to-zero 콜드 스타트 대응), `RUNBOOK.md` 어디에도 `min_machines_running` 상향 또는 컷오버 당일 최소 1인스턴스 유지 체크포인트가 없다. 트래픽 전환 직후(§단계 5) 콜드 스타트 지연이 smoke 실패로 오판되거나(PoNR 판정 지연) 사용자 체감 지연을 유발할 수 있어 비-블로킹이지만 보완이 필요하다(GAP-020-05 참조, non-blocking 항목).

### 4-2. PRE-ASSESSMENT.md — NFR 게이트 완결성 — PASS

§3 "NFR-005 초과 시 게이트(FR-012)"가 §2 소계 실측값과 연결되며, `RUNBOOK.md §단계 4`와 상호 참조가 명확하다(사전평가 단계에서 선행 확인, 실행 당일 재확인 아님 — 설계 의도와 일치). §4 종합 판정 체크리스트도 실측 완료·게이트 확인·리허설 편차 확인 3항목으로 완결적.

### 4-3. 롤백 절차(ADR-007) — PASS

`run.sh rollback` 서브커맨드가 `do_rollback`(레거시 쓰기 차단 해제 자동화 명령 또는 수동 확인)을 단독 호출 가능하며, `cutover` 시퀀스 내에서도 NO-GO 시 자동 진입(§단계 6). PoNR 이전 롤백 조건(§3 PoNR 판정 신호 — 신규 `orders`/`payments` 테이블 `createdAt` 존재 여부)이 런북에 명확히 문서화되어 있다.

## 5. 기존 배포 구성 영향

- `apps/backend/src/`·`apps/backend/prisma/`·`fly.toml`·`apps/backend/Dockerfile`·`.github/workflows/ci.yml` 전부 본 spec 변경분 0건(git status 로 미변경 확인, CI 워크플로우에 `migration` 참조 없음) — 신규 앱 도메인 코드 무변경(out-of-band) 원칙 확인.
- 레거시 앱 점검모드 503(ADR-003)은 레거시(구) 시스템의 책임이며 신규 시스템 Dockerfile/배포 구성과 무관 — `LEGACY_WRITE_BLOCK_CMD`/`LEGACY_WRITE_UNBLOCK_CMD` 훅으로 위임(config.example.env, 신규 시스템은 out-of-band 트리거만 제공).

## 6. 종합 판정

| 검증 영역 | 결과 |
|---|---|
| 이관 러너 구성 정합성(§2) | **FAIL → PASS (§7 재검증)** — GAP-020-05 대안 B(전용 러너 이미지) 구현 확인 |
| 보안·자격증명 배포 구성(§3) | PASS |
| 런북 배포 절차 완결성(§4) | PASS (경미 보완 — §7 재검증에서 반영 확인) |
| 기존 배포 구성 영향(§5) | PASS |

- ~~**gate: FAIL**~~ → **gate: PASS (§7 재검증, 2026-07-05 23:04)**. 최초 판정(2026-07-05 22:41) 은 §2-3 발견사항(러너 실행 불가 구조)에 근거해 FAIL 이었으나, Development Agent 가 대안 B(전용 러너 이미지, T014)를 구현했고 아래 §7 재검증으로 GAP-020-05 주 항목·부가 항목 모두 RESOLVED 확인되어 최종 gate 를 PASS 로 갱신한다.
- `gaps.md GAP-020-05` 는 §7 재검증 결과를 반영해 RESOLVED 로 갱신함(본 Deploy Agent 소유 GAP).

## 7. 재검증 — GAP-020-05 대안 B 구현 확인

> 신규 세션(§6.2 재작업 단축 — `[재검증]` 마커) 재호출. 이전 세션 agentId resume 불가로 신규 spawn. 아래는 팀리드 지시대로 Development 의 보고 문구를 그대로 신뢰하지 않고 직접 실행·대조한 결과다.

### 7-1. `scripts/migration/Dockerfile` 실측 — PASS

`FROM postgres:16-alpine` + `RUN apk add --no-cache curl` + `COPY . /migration/` + `chmod +x` 3개 스크립트 구조를 직접 Read 로 확인. 로컬 재현:

```
docker build -f scripts/migration/Dockerfile -t doa-migration-runner-verify scripts/migration
```

→ 빌드 성공(5 layer 전부 CACHED/성공, 에러 0). `docker run --rm doa-migration-runner-verify which bash psql pg_dump curl` 실행 결과:

```
/bin/bash
/usr/local/bin/psql
/usr/local/bin/pg_dump
/usr/bin/curl
```

4종 도구 전부 실측 확인 — GAP-020-05 주 항목 결핍 사유 2(bash 미설치)·3(psql/pg_dump 미설치) 해소. `docker run --rm doa-migration-runner-verify ls -la /migration` 로 `extract.sh`·`load.sh`·`run.sh`·`lib/`·`sql/`·`queries/`·`MAPPING-SPEC.md`·`RUNBOOK.md`·`config.example.env` 전부 이미지 내 존재 확인 — 결핍 사유 1(scripts/migration 미COPY) 해소.

### 7-2. ENTRYPOINT 안전성 실측 — PASS

`docker inspect --format '{{json .Config.Entrypoint}} {{json .Config.Cmd}}'` 결과 `Entrypoint: null`(`ENTRYPOINT []`로 베이스 이미지 `docker-entrypoint.sh` 완전 무력화 확인) + `Cmd: ["/bin/bash","-c","echo '...' && sleep infinity"]`. 컨테이너를 인자 없이 백그라운드 기동(`docker run -d`) 후 `docker exec ... ps aux` 실측 결과 **PID 1 은 `sleep infinity` 단독** — postgres 서버 프로세스가 전혀 기동되지 않음(`ss -tlnp` 리스닝 포트 0건, 로그에 안내 문구만 출력). "인자 없이 실행 시 서버 자동 기동 안 함" 주장이 실측으로 확인됨.

### 7-3. `.dockerignore` — PASS

`config.env`·`migration-run/` 2개 항목 명시 확인. 빌드된 이미지 내부(`find /migration -iname 'config.env' -o -iname 'migration-run'`) 결과 0건 — 자격증명·실행 산출물 이미지 미포함 확인(현재 두 경로 자체가 로컬에 생성된 적 없어 원천적으로도 부재하나, `.dockerignore` 규칙 자체는 정상 작동 확인).

### 7-4. RUNBOOK.md 재번호 무결성 — PASS

최상위 헤더 실측: `## 0. 사전 공지` → `## 1. 러너 이미지 준비(GAP-020-05, 신규)` → `## 2. 사전점검 체크리스트` → `## 3. 단계별 절차` → `## 4. Point of No Return(PoNR)` → `## 5. 검증 대상 범위` → `## 6. 리허설(dry-run) 권고` → `## 7. 요약표`. 문서 내부 상호참조 전건 대조:

| 위치 | 참조 | 실제 대상 | 판정 |
|---|---|---|---|
| L12 | "GAP-020-05 대안 B ... §1 참조" | §1 러너 이미지 준비(자기 절) | 일치 |
| L67 | "min_machines_running 상향" 체크포인트 (§1 신규 항목) | GAP-020-05 부가 항목 반영 | **부가 항목 RESOLVED 확인** |
| L68 | "리허설(§6)" | §6 리허설(dry-run) 권고 | 일치 |
| L80 | "리허설(dry-run)...(§6 참조)" | §6 | 일치 |
| L131 | "§2 사전점검 참조" | §2 사전점검 체크리스트 | 일치 |
| L140 | "PoNR 이전이면(§4 참조...)" | §4 PoNR | 일치 |
| L184 | "이미지 빌드...완료(§1)" | §1(자기 절) | 일치 |
| L185 | "§2 체크리스트 전 항목" | §2 사전점검 | 일치 |

내부 참조 8건 전부 실제 섹션 번호와 일치 — renumbering 후 broken reference 0건. 외부 참조: `PRE-ASSESSMENT.md` L75 `[RUNBOOK.md §단계 4](RUNBOOK.md#단계-4--gonogo-판단)` — 이는 최상위 `## N.` 헤더가 아닌 §3 "단계별 절차" 하위의 "단계 N" 앵커(`### 단계 4 — GO/NO-GO 판단`)를 가리키며, 하위 앵커는 renumbering 대상이 아니므로(§3 자체 위치만 이동, 하위 `### 단계 0~7` 표기는 불변) 링크 유효성 유지 확인.

### 7-5. §F 준수(도메인 코드 무변경) — PASS

```
git diff 1dd5132 --stat -- apps/backend/src apps/backend/prisma apps/backend/Dockerfile fly.toml .github/workflows
```

→ 출력 0건(diff 없음). `git status --short`로도 해당 경로 변경 0건 확인 — 기존 프로덕션 배포 구성(운영 앱 Dockerfile·fly.toml·CI 워크플로우·도메인 코드) 완전 무변경 확인.

### 7-6. 정적 테스트 재실행 — PASS

```
pnpm --filter backend exec jest --config test/jest-e2e.json --testPathPattern="test/static/migration"
```

→ `migration-runbook.spec.ts`·`migration-config.spec.ts`·`migration-mapping.spec.ts` 3 suites 전부 PASS, **54/54 tests PASS**(회귀 0건). `bash -n run.sh extract.sh load.sh lib/common.sh` 4개 스크립트 전부 재확인 PASS.

### 7-7. 재검증 종합 판정

| GAP-020-05 항목 | 최초(run-008) | 재검증(본 세션) |
|---|---|---|
| 주 항목 — 러너 실행 불가 구조 | BLOCKED (FAIL) | **RESOLVED** — 전용 러너 이미지(postgres:16-alpine+curl)로 3개 결핍 사유 전부 실측 해소 |
| 부가 항목 — min_machines_running 체크포인트 누락 | non-blocking 지적 | **RESOLVED** — RUNBOOK.md §1 L67 체크포인트 반영 확인 |

**gate: PASS**. `gaps.md GAP-020-05` 를 RESOLVED 로 갱신(아래). Security·Performance Agent 진행 가능.
