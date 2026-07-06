---
작성: Development Agent
버전: v1.0
최종 수정: 2026-07-05 22:12
상태: 확정
---

# 컷오버 런북: 020-data-migration-cutover

> Branch: 020-data-migration-cutover | Plan: [../../docs/specs/v1.1.0/020-data-migration-cutover/planning/plan.md](../../docs/specs/v1.1.0/020-data-migration-cutover/planning/plan.md) | Mapping: [MAPPING-SPEC.md](MAPPING-SPEC.md) | Pre-assessment: [PRE-ASSESSMENT.md](PRE-ASSESSMENT.md)
>
> 실행 도구: `extract.sh` · `load.sh` · `run.sh`(`precopy` / `outbox-check` / `cutover` / `rollback`) — **전용 러너 이미지**(`Dockerfile`) 안에서 실행한다(GAP-020-05 대안 B, §1 참조). 접속 설정은 [config.example.env](config.example.env) 참조.

## 목차

- [0. 사전 공지 (D-3)](#0-사전-공지-d-3)
- [1. 러너 이미지 준비 (GAP-020-05)](#1-러너-이미지-준비-gap-020-05)
- [2. 사전점검 체크리스트](#2-사전점검-체크리스트)
- [3. 단계별 절차](#3-단계별-절차)
  - [단계 0 — 사전 복사(pre-copy)](#단계-0--사전-복사pre-copy)
  - [단계 0b — outbox pending=0 드레인 확인](#단계-0b--outbox-pending0-드레인-확인)
  - [단계 1 — 레거시 쓰기 차단](#단계-1--레거시-쓰기-차단)
  - [단계 2 — 최종 델타 이관](#단계-2--최종-델타-이관)
  - [단계 3 — 정합성 검증](#단계-3--정합성-검증)
  - [단계 4 — GO/NO-GO 판단](#단계-4--gonogo-판단)
  - [단계 5 — 트래픽 전환 + smoke](#단계-5--트래픽-전환--smoke)
  - [단계 6 — 롤백(NO-GO)](#단계-6--롤백no-go)
  - [단계 7 — 윈도우 종료](#단계-7--윈도우-종료)
- [4. Point of No Return (PoNR)](#4-point-of-no-return-ponr)
- [5. 검증 대상 범위 — file_assets 메타 vs 바이너리](#5-검증-대상-범위--file_assets-메타-vs-바이너리)
- [6. 리허설(dry-run) 권고](#6-리허설dry-run-권고)
- [7. 단계별 담당자·체크포인트·롤백 트리거 요약표](#7-단계별-담당자체크포인트롤백-트리거-요약표)

---

## 0. 사전 공지 (D-3)

- [ ] **공지 채널**: 고객·판매자 대상 공지(콘솔 배너/이메일/SMS 등) 발송 채널 확정 및 발송 완료.
- [ ] **완료 확인란**: 공지 발송 완료 시각 ______________ / 발송 담당자 ______________ / 공지 문안 검토자 ______________.
- 근거: 최소 D-3일 전 사용자 공지(FR-016, SC-018). 컷오버 윈도우 개시일 기준 D-3 이전에 위 두 항목이 모두 체크되어야 다음 단계로 진행한다.

## 1. 러너 이미지 준비 (GAP-020-05)

> **배경**: `apps/backend/Dockerfile`(운영 앱 이미지, `node:20-alpine`)는 `scripts/migration/` 을 COPY 하지 않고, `bash`·`psql`·`pg_dump` 도 미설치라 러너를 그대로 실행할 수 없다(Deploy Agent 실측, GAP-020-05). **대안 B(전용 러너 이미지)** 를 채택 — [`scripts/migration/Dockerfile`](Dockerfile) 로 `postgres:16-alpine`(bash·psql·pg_dump 기본 포함) 기반 경량 이미지를 별도 빌드한다. 운영 앱 이미지는 변경하지 않는다(P-001 이미지 비대화 회피).

- [ ] **이미지 빌드**(레포 루트에서, `scripts/migration/` 을 빌드 컨텍스트로 사용):
  ```bash
  docker build -f scripts/migration/Dockerfile -t doa-migration-runner scripts/migration
  ```
- [ ] **이미지 배포 대상 레지스트리로 push**(Fly.io 예시 — 타깃 앱과 동일 organization 의 레지스트리 사용):
  ```bash
  flyctl auth docker   # Fly 레지스트리 로그인(최초 1회)
  docker tag doa-migration-runner registry.fly.io/<target-app>-runner:latest
  docker push registry.fly.io/<target-app>-runner:latest
  ```
- [ ] **실행**(Fly.io one-off machine, ADR-002 — 타깃 Postgres 동일 리전 co-located). 컨테이너 내부에서는 `/migration/` 이 작업 디렉토리이므로 스크립트 경로는 `/migration/run.sh` 이다(레포 내 `scripts/migration/run.sh` 와 동일 파일):
  ```bash
  fly machine run registry.fly.io/<target-app>-runner:latest \
    --app <target-app> \
    -v migration_config:/config \
    -e MIGRATION_CONFIG=/config/config.env \
    --command "/migration/run.sh cutover --config-dir=/config"
  ```
  - `config.env`(자격증명 포함, 커밋 금지)는 이미지에 굽지 않는다 — 위처럼 볼륨 마운트하거나, `fly machine run` 실행 직전 `fly ssh sftp put`/`fly machine exec` 로 러너 머신에 전송한다.
  - 서비스별 `--config-dir` 사용 시 해당 디렉토리 전체를 동일한 방식으로 마운트/전송한다.
  - `fly ssh console -a <target-app>` 로 실행 중인 러너 머신에 진입해 단계별로 수동 실행(`precopy`→`outbox-check`→`cutover`)하는 것도 가능하다(리허설 시 권장).
- [ ] **min_machines_running 상향**(infra.md §8 scale-to-zero 콜드 스타트 대응, plan.md 배포 환경 영향 PROC-009): 컷오버 윈도우 개시 **전** 타깃 앱을 `fly scale count 1 -a <target-app>`(또는 `min_machines_running=1`)로 상향하여 트래픽 전환 직후(§단계 5) smoke 판정에 콜드 스타트 지연이 섞이지 않도록 한다. 컷오버 완료·안정화 확인 후 원복(`fly scale count 0` 또는 원래 설정) 여부는 운영 정책에 따른다.
- [ ] **검증**: 러너 이미지로 `run.sh cutover` 가 처음부터 끝까지(사전점검 프롬프트·psql 접속·curl 스모크 포함) 실행 가능한지 리허설(§6)에서 최소 1회 확인한다(GAP-020-05 해결 조건).

## 2. 사전점검 체크리스트

컷오버 윈도우 개시 **전** 아래 전 항목을 확인한다(미충족 항목이 있으면 개시를 보류한다).

- [ ] 레거시 `payment_outbox` pending=0 드레인 확인(ADR-008) — `run.sh outbox-check` 로 자동 확인 또는 수동 확인.
- [ ] 타깃 `prisma migrate status` 가 up-to-date(미적용 마이그레이션 없음) — infra.md §7 배포 전 체크리스트 항목과 동일.
- [ ] Fly Postgres 자동 백업 + PITR 활성 확인(장애 시 복구 경로, plan.md 배포 환경 영향 PROC-009).
- [ ] 러너(이관 실행 계정)가 타깃 Postgres에 스키마 생성(`CREATE SCHEMA`) 권한을 보유(pg-boss 와 동일 전제, infra.md §8).
- [ ] 레거시 각 서비스 RDS 자격증명 유효성 확인(ASM-010) — `config.env`(서비스별 `--config-dir` 하위 파일)에 반영.
- [ ] 사전평가([PRE-ASSESSMENT.md](PRE-ASSESSMENT.md)) 실측 완료 — 예상 소요가 NFR-005(50분) 초과 시 아래 §단계 4 "사용자 재확인" 체크포인트를 사전에 협의.
- [ ] 리허설(dry-run) 1회 이상 완료 권고(§6 참조).

## 3. 단계별 절차

### 단계 0 — 사전 복사(pre-copy)

- **시점**: 윈도우 개시 **전**(비제약, FR-002).
- **담당자**: DB 이관 담당(러너 실행자).
- **명령**: `run.sh precopy --config-dir=<서비스별 config.env 디렉토리>` (내부적으로 `extract.sh --mode=precopy` + `load.sh --mode=precopy` 를 서비스별로 순회).
- **체크포인트**: 18개 레거시 서비스 전부 추출·적재 완료 로그 확인(`migration.log` + `verification_runs` phase='cutover' step='precopy').
- **롤백 트리거**: 이 단계는 윈도우 밖이므로 트래픽·쓰기에 영향 없음 — 실패 시 재실행(멱등, UPSERT 없음·TRUNCATE 후 재적재이므로 안전).

### 단계 0b — outbox pending=0 드레인 확인

- **시점**: 윈도우 개시 직전.
- **담당자**: 결제 도메인 온콜 담당.
- **명령**: `run.sh outbox-check`.
- **체크포인트**: pending 행 수 = 0 확인(ADR-008). 0이 아니면 릴레이 완료까지 대기.
- **롤백 트리거**: 미드레인 시 윈도우 개시를 보류한다(개시 자체를 진행하지 않음 — 롤백이 아니라 연기).

### 단계 1 — 레거시 쓰기 차단

- **시점**: T+0(윈도우 개시).
- **담당자**: 인프라/온콜 담당(레거시 DB) + 레거시 앱 배포 담당(점검모드 503).
- **조치**: 레거시 DB read-only(`default_transaction_read_only` 또는 REVOKE) **+** 레거시 앱 점검모드 503 응답(ADR-003) — 두 조치를 **함께** 적용해야 한다(DB 차단 단독은 UX 부재, 앱 점검모드 단독은 비-API 숨은 쓰기 경로 누출 위험).
- **명령**: `run.sh cutover` 실행 시 첫 단계(`write-block`)에서 자동화 명령(`LEGACY_WRITE_BLOCK_CMD`) 또는 수동 확인 프롬프트로 진행.
- **체크포인트(SC-003)**: 레거시 API 가 쓰기 요청(POST/PUT/PATCH/DELETE)에 대해 일관되게 503(점검 모드) 또는 DB read-only 거부를 반환하는지 확인.
- **롤백 트리거**: 차단 적용 실패(레거시 앱 미배포 등) 시 윈도우 개시를 중단하고 §단계 6 롤백 절차로 이동.

### 단계 2 — 최종 델타 이관

- **시점**: T+2 이후.
- **담당자**: DB 이관 담당.
- **명령**: `run.sh cutover` 내부 `delta` 단계 — 사전복사 이후 변경분을 추출·적재 후 `sql/10_transform.sql` 실행(위상 순서 ADR-005: users→products→commerce→orders→payments→settlements→admin→files).
- **체크포인트**: 서비스별 델타 추출·적재·변환 완료 로그(`verification_runs` step='delta').
- **롤백 트리거**: 델타 추출/변환 중 치명적 오류(스크립트 비정상 종료) 발생 시 §단계 6 롤백 절차로 즉시 이동(검증 단계까지 가지 않음).
- **파일 바이너리 병행**: 파일 바이너리 델타/검증은 [FILE-MIGRATION-RUNBOOK.md §4](FILE-MIGRATION-RUNBOOK.md) 병행 체크포인트 참조.

### 단계 3 — 정합성 검증

- **시점**: 단계 2 완료 직후.
- **담당자**: DB 이관 담당 + QA/데이터 검증 담당.
- **명령**: `sql/20_verify.sql` 실행(레코드 수·금전 합계·샘플 체크섬·교차참조 anti-join 4종, MAPPING-SPEC.md §6/§9/§10).
- **체크포인트**: `verification_runs` phase='verify' 전 행 status='pass'.
- **롤백 트리거**: 검증 4종 중 하나라도 'fail' → §단계 4 에서 NO-GO 판정.
- **파일 바이너리 병행**: 파일 바이너리 델타/검증은 [FILE-MIGRATION-RUNBOOK.md §4](FILE-MIGRATION-RUNBOOK.md) 병행 체크포인트 참조.

### 단계 4 — GO/NO-GO 판단

- **시점**: ≤ T+50분(NFR-005 안전마진 — 최소 10분 롤백 판단·실행 여유 확보).
- **담당자**: 컷오버 리드(최종 승인권자).
- **GO 게이트**: SC-005~SC-007 전부 PASS 시에만 트래픽 전환(GO) 단계 진행한다. 검증 4종 AND 조건 — count·sum(필수 3종)·checksum·anti-join(핵심 6종) 전부 pass 일 때만 GO(**SC-005~SC-007(+anti-join) 전부 PASS 시에만 트래픽 전환(GO)**, FR-006). 하나라도 fail 이면 NO-GO(FR-007).
- **체크포인트**: `run.sh cutover` 의 `go-nogo` 단계 로그(`GO_DECISION` 값) 확인.
- **NFR-005 초과 시 체크포인트**: 사전평가([PRE-ASSESSMENT.md](PRE-ASSESSMENT.md)) 예상 소요가 NFR-005 안전마진(50분)을 초과할 것으로 판단되는 경우, **진행 전 사용자 재확인 필수**(윈도우 재산정 또는 부분 사전이관 전략 협의, FR-012) — 이 체크포인트는 실행 당일이 아니라 사전평가 단계에서 선행 확인한다(§2 사전점검 참조).
- **롤백 트리거**: 검증 4종 중 하나라도 fail → NO-GO → §단계 6 롤백.

### 단계 5 — 트래픽 전환 + smoke

- **시점**: GO 판정 직후.
- **담당자**: 인프라/배포 담당.
- **조치**: DNS/LB 를 신규 시스템으로 전환 → 전파 확인 → `GET /health` smoke 확인(`run.sh cutover` 의 `traffic-cutover` 단계, `TARGET_HEALTH_URL`).
- **체크포인트**: smoke 200 OK + DNS/LB 헬스체크 정상.
- **롤백 트리거**: smoke 실패 시 — **PoNR 이전이면**(§4 참조, 신규 주문/결제 0건) 즉시 §단계 6 롤백. PoNR 이후면 롤백 불가(§4).

### 단계 6 — 롤백(NO-GO)

- **시점**: NO-GO 판정 또는 PoNR 이전 smoke 실패 시.
- **담당자**: 컷오버 리드 + 인프라 담당.
- **조치**: (1) 레거시 DB read-only 해제(쓰기 재개), (2) 트래픽을 레거시로 유지/재지정, (3) 타깃·스테이징 데이터는 재시도 대비 보존(폐기 선택 가능) — 역이관 불필요(레거시가 원본, 데이터 유실 없음, FR-007).
- **명령**: `run.sh rollback` (또는 `run.sh cutover` 내부 자동 이동).
- **체크포인트**: 레거시 쓰기 차단 해제 확인 + 레거시 정상 서비스 재개 확인(SC-009).
- **롤백 트리거**: 해당 없음(본 단계 자체가 롤백 절차).

### 단계 7 — 윈도우 종료

- **시점**: ≤ T+60분(NFR-001).
- **담당자**: 컷오버 리드.
- **체크포인트**: 쓰기 차단 시작(T+0) ~ 트래픽 전환 완료 시각 차이가 60분 이하(SC-020). 초과 시 사후 분석(리허설 로그 비교)을 CHANGES.md/context.md 에 기록(spec.md 사후 운영 검증 피드백 사이클).
- **롤백 트리거**: 없음(윈도우 종료 시점 — 이미 GO/전환 완료 상태).

---

## 4. Point of No Return (PoNR)

**컷오버 후 신규 주문/결제 1건 발생 시점부터 롤백 불가(point of no return)**로 간주한다(FR-008, SC-010). 이 시점 이후로는 신규 시스템에서 레거시로의 자동 역이관(자동 롤백)을 지원하지 않는다(범위 외).

- **PoNR 판정 신호**: 신규 `orders.orders` 또는 `payments.payments` 에 컷오버 시각(T+0) 이후 `createdAt` 레코드가 존재하는지 여부로 판정한다.
- PoNR 이전(트래픽 미전환 또는 전환 후에도 신규 주문/결제 0건)이면 §단계 6 롤백이 항상 가능하다.

## 5. 검증 대상 범위 — file_assets 메타 vs 바이너리

정합성 검증 대상에 **file_assets 메타데이터**(물리 테이블명 `files.files` — MAPPING-SPEC.md §1 발견사항, GAP-020-02) 레코드 수 대조를 **포함**한다(FR-017, SC-019). 반면 **실 파일 바이너리(오브젝트) 전송·이관 검증은 본 절차의 범위 외로 명시적으로 제외**한다 — 신규 시스템의 `FILE_STORAGE` 는 아직 `StubFileStorage`(무네트워크)이며 실 Cloudflare R2 연동은 별도 spec (spec.md "범위 외" 참조, ASM-012).

> **파일 바이너리 이관(022)**: `files.files` **메타데이터**는 020 이 이관하나, 실 파일 바이너리(오브젝트)는 022-legacy-file-binary-migration 이 별도 이관한다. 컷오버 윈도우 내 파일 델타/검증/url-update 절차는 [FILE-MIGRATION-RUNBOOK.md](FILE-MIGRATION-RUNBOOK.md) 참조 — DB 델타와 **동일 윈도우 내 병행** 실행하고, GO/NO-GO 는 DB 검증 + 파일 검증(022 SC-005/013) 양쪽 pass 로 판정한다.

## 6. 리허설(dry-run) 권고

실제 컷오버 전 **최소 1회** 리허설(dry-run)을 권고한다(spec.md 사후 운영 검증 피드백 사이클, PROC-014).

- 리허설도 `run.sh cutover` 전체 시퀀스를 실행하되, §단계 5(트래픽 전환)는 스테이징/카나리 환경에서 수행하거나 dry-run 플래그로 스킵 처리한다(운영 정책에 따름).
- 리허설 로그(`verification_runs` phase='cutover')에서 "쓰기 차단 시작(step='write-block' started_at) ~ 전환 완료(step='traffic-cutover' finished_at)" 시각차가 **60분 이하**(SC-020)인지, "검증·GO/NO-GO 판단(step='go-nogo' finished_at) 이 윈도우 개시 후 50분 이내"(SC-021)인지 확인한다.
- 리허설에서 의도적 불일치를 주입해 NO-GO 경로(§단계 6)가 정상 동작하는지도 함께 검증한다(SC-009).

## 7. 단계별 담당자·체크포인트·롤백 트리거 요약표

| 단계 | 담당자 | 체크포인트 | 롤백 트리거 |
|---|---|---|---|
| 0. 사전 공지(D-3) | 고객지원/마케팅 담당 | 공지 채널 발송 완료 + 완료 확인란 기재 | — (공지 미완료 시 개시 연기) |
| 1. 러너 이미지 준비(GAP-020-05) | DB 이관 담당/인프라 담당 | 이미지 빌드·push·min_machines_running 상향 완료(§1) | 미완료 시 개시 연기 |
| 2. 사전점검 | 컷오버 리드 | §2 체크리스트 전 항목 완료 | 미충족 시 개시 연기 |
| 3. 단계 0 pre-copy | DB 이관 담당 | 서비스 전수 추출·적재 완료 로그 | 실패 시 재실행(멱등) |
| 4. 단계 0b outbox 확인 | 결제 온콜 담당 | pending=0 | 미드레인 시 개시 연기 |
| 5. 단계 1 쓰기 차단 | 인프라 + 레거시 앱 배포 담당 | 503/read-only 일관 반환(SC-003) | 차단 실패 시 §단계 6 |
| 6. 단계 2 최종 델타 | DB 이관 담당 | 델타 추출·적재·변환 완료 로그 | 치명 오류 시 §단계 6 |
| 7. 단계 3 정합성 검증 | DB 이관 담당 + QA | verification_runs 전 행 pass | 하나라도 fail → 단계 4 NO-GO |
| 8. 단계 4 GO/NO-GO | 컷오버 리드 | 검증 4종 AND pass(SC-005~007+anti-join) | fail 존재 → §단계 6 |
| 9. 단계 5 트래픽 전환 | 인프라/배포 담당 | DNS/LB 전환 + smoke 200 | smoke 실패(PoNR 전) → §단계 6 |
| 10. 단계 6 롤백 | 컷오버 리드 + 인프라 담당 | 쓰기차단 해제 + 레거시 재개(SC-009) | — (본 단계가 롤백) |
| 11. 단계 7 윈도우 종료 | 컷오버 리드 | 총 소요 ≤60분(SC-020) | — |
