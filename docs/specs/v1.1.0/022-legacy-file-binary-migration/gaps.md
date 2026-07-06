---
작성: Design Agent
버전: v1.0
최종 수정: 2026-07-06 15:20 (Security Agent — GAP-022-02 재평가·RESOLVED)
상태: 작성중 (누적 기록 — 후속 Agent 가 갱신)
---

# Gaps: 022-legacy-file-binary-migration

> 형식: pipeline-conventions.md §6. 이 단계(3단계 Design)에서 최초 생성한다.
> 해결된 GAP → 해당 Agent 가 `RESOLVED by [Agent 공식명]` 으로 갱신. 미해결 5건 초과 시 main 경고.

## 목차

- [GAP 목록](#gap-목록)

---

## GAP 목록

### GAP-022-01

- **유형**: 실행환경-정합성-확인-필요 (PATCH-020-01)
- **출처**: Design Agent
- **컨텍스트**: T-B03 (Dockerfile rclone 확장) / research.md "배포 환경 영향 추정"
- **내용**: ADR-002 가 `rclone` 을 020 러너 이미지(`postgres:16-alpine`)에 `apk add` 로 추가하도록 지정했으나, (a) `postgres:16-alpine` 베이스에 alpine `community` 레포가 활성화되어 있는지, (b) `apk add rclone` 이 실제로 해소되는지는 **정적 코드 리뷰만으로 확정 불가**하다. GAP-020-05(020 이 러너 이미지 실행스택 부재를 Deploy 단계에서야 발견) 재발 방지 대상.
- **안전망/처리**: tasks T-B03 완료기준에 `docker build` 1회 성공 + `docker run ... rclone version` 확인을 박제. community 미활성 시 대안(레포 라인 추가 또는 rclone 정적 바이너리 curl 다운로드)을 동일 태스크 내에서 처리 — 신규 별도 이미지 도입 금지(FR-010). Development(§G 런타임 1회 검증) 또는 Deploy Agent 가 실증.
- **상태**: RESOLVED by Development Agent (2026-07-06) — `docker build -f scripts/migration/Dockerfile -t doa-migration-runner scripts/migration` 1회 성공(`apk add --no-cache curl rclone` 정상 해소, 대안 불요). `docker run --rm doa-migration-runner rclone version` → `rclone v1.74.1-DEV` 정상 출력 확인. `/migration/files-migrate.sh` 실행권한(+x) 포함 확인.

### GAP-022-02

- **유형**: 보안-부채-상속 (감사)
- **출처**: Design Agent (plan.md "020 감사 부채 승계" 절 승계)
- **컨텍스트**: T-B02 감사 기록 (`verification_runs` 재사용)
- **내용**: 022 가 020 의 `migration_staging.verification_runs` 를 `phase='file-migration'` 로 재사용하므로 020 의 미해결 감사 부채 2건이 그대로 적용된다 — (1) SEC-020-01: `migration_staging` 스키마 컷오버 후 정리 미자동화, (2) SEC-020-02: 감사 로그에 실행 행위자(operator) 미기록. 022 가 신규 악화를 유발하지 않으나(동일 테이블·동일 패턴) 파일 이관 맥락에서 재평가 필요.
- **안전망/처리**: Security Agent(selection-phases.md Y, 6단계 후 순서 2번)가 파일 이관 맥락(3중 자격증명 취급 — 레거시 S3 read + R2 write + 타깃 DB write)에서 두 부채를 재평가 대상으로 포함.
- **상태**: RESOLVED by Security Agent (2026-07-06) — 재평가 결과 security/security-report.md "GAP-022-02 재평가" 절 참조. **판정**: (1) SEC-020-01(스테이징 정리 미자동화) — CONFIRMED, 022로 인한 악화 없음(research.md 확인상 022는 `migration_staging`에 신규 raw 테이블을 추가하지 않고 기존 `verification_runs`만 재사용 — PII/결제 데이터 범위 확장 없음). (2) SEC-020-02(감사행위자 미기록) — CONFIRMED, 미해소 승계(022도 동일 INSERT 패턴 복제). 3중 자격증명 취급으로 사고 시 책임추적 범위(취급 자격증명 종류)는 넓어지나, 단일 운영자 순차 실행 전제(research.md 동시성 분석)·`url-update`가 verify GO 이후에만 실행되는 절차적 게이트(deploy-report.md 확인)로 오사용 여지가 이미 좁혀져 있어 **심각도 재상향 근거 없음** — Medium·OPEN 유지, 020 스코프 처리 원칙 그대로 적용. 두 항목 모두 신규 GAP 번호 불요, context.md §6 기존 SEC-020-01/02 행에 022 각주 추가는 Retrospective 위임(PROC-013-03).

> **인지(재등록 불요)**: GAP-020-02(context.md §2/§4 `file_assets` 물리명 오표기 — 실제 `files.files`)는 기존 OPEN GAP 이며 022 산출물은 실측 물리명 `files.files` 사용으로 회피. GAP-021-03(context.md/infra.md "실 R2 연동은 후속" 표현 잔존)은 021 완료 미반영 기존 OPEN GAP — 6단계 Docs/Retrospective 가 021+022 반영 시 함께 처리. 두 건 모두 Retrospective 처리 대기(신규 GAP 아님).

### GAP-022-03

- **유형**: 문서-갱신-필요 (PATCH-A09 — 신규 외부 시스템 연동/도구 추가 미반영)
- **출처**: Docs Agent (6단계, `infra.md §8` cross-check — PATCH-A18 사전 cross-check)
- **컨텍스트**: `scripts/migration/Dockerfile` (T-B03, 022 신규 수정)
- **내용**: `infra.md §8` "컷오버 실행 인프라 (020)" 행(L222)이 러너 이미지 구성 도구를 "bash·psql·pg_dump·curl 포함"으로만 기술하고 있어, 022 가 이 이미지에 추가한 `rclone`(레거시 S3↔R2 오브젝트 복사 신규 외부 연동 도구, FR-010/ADR-002)이 반영되지 않았다. **코드 검증**: `scripts/migration/Dockerfile` L20(`RUN apk add --no-cache curl rclone`) 실측 확인 — 020 원본은 `curl` 만 포함했고(GAP-020-05 해소 근거), 022 가 `rclone` 을 추가한 것이 사실과 일치(PROC-002).
- **안전망/처리**: `infra.md §8` 해당 행의 "bash·psql·pg_dump·curl 포함" 부분을 "bash·psql·pg_dump·curl·rclone(022, 레거시 S3↔R2 오브젝트 복사) 포함"으로, "관련 spec" 열에 `022-legacy-file-binary-migration` 을 추가하는 갱신 권고. Docs Agent 직접 수정 불가(agent-rules.md §3.1) — Retrospective Agent 위임.
- **상태**: OPEN (Retrospective Agent 처리 위임)

### GAP-022-04

- **유형**: 문서-갱신-필요 (런북 교차참조 누락)
- **출처**: Deploy Agent (선택 단계, 컷오버 런북 통합 검토)
- **컨텍스트**: `scripts/migration/RUNBOOK.md`(020, 기완료 산출물) vs `scripts/migration/FILE-MIGRATION-RUNBOOK.md`(022, 4단계 Development 산출물)
- **내용**: plan.md "배포 환경 영향(PROC-009)"이 "런북에서 020 컷오버 시퀀스에 파일 델타·검증 단계를 통합 배치(Deploy Agent)"를 요구했다. 022 는 이를 `FILE-MIGRATION-RUNBOOK.md §4`(020→022 체크포인트 매핑 테이블)로 022 쪽에서 충족했으나, **020 원본 `RUNBOOK.md` 자체에는 022/file-migration 관련 교차참조가 0건**이다(`grep -n "022\|file-migration\|files-migrate" scripts/migration/RUNBOOK.md` 결과 없음, Deploy Agent 실측). 020 RUNBOOK.md 만 보고 컷오버를 실행하는 운영자는 파일 바이너리 이관 단계(precopy/delta/verify/url-update)의 존재 자체를 인지하지 못할 운영 위험이 있다.
- **안전망/처리**: `RUNBOOK.md` §0(사전 공지) 또는 §3 "단계 2 — 최종 델타 이관"/"단계 3 — 정합성 검증" 항목에 "022 파일 바이너리 이관은 [FILE-MIGRATION-RUNBOOK.md](FILE-MIGRATION-RUNBOOK.md) 참조, 동일 윈도우 내 병행"과 같은 1~2줄 교차참조 추가를 권고한다. `RUNBOOK.md` 는 020 스펙 사이클의 기완료 산출물이라 Deploy Agent(022)가 직접 수정하지 않는다(agent-rules.md §3.1, 타 spec 산출물 수정 회피 — GAP-022-03 과 동일 처리 원칙 적용) — Retrospective Agent 또는 후속 patch spec 위임.
- **상태**: OPEN (Retrospective Agent 처리 위임)
