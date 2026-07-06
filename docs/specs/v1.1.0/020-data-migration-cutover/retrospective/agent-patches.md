---
작성: Retrospective Agent
버전: v1.0
최종 수정: 2026-07-06
상태: 적용 완료 (main session — PATCH-020-01(03-design·04-development) + PATCH-020-02(agent-rules §6.2) 적용, docs-change-logs 2026-07-06-001 기록)
---

# Agent Patches: 020-data-migration-cutover

> 본 패치는 제안이며, 적용 주체는 main session(사용자 승인 후)이다. Retrospective Agent 는 직접 수정하지 않는다.
> context.md/infra.md 갱신 패치(PATCH-CXT)는 별도 `context-infra-updates.md` 참조.

## 목차

- [PATCH-020-01](#patch-020-01--03-designmd--04-developmentmd--새-실행환경-이미지-정합성-사전-점검)
- [PATCH-020-02](#patch-020-02--agent-rulesmd-62--idle-agent-재개-실패-시-신규-spawn-폴백-명문화)

---

## PATCH-020-01 — 03-design.md / 04-development.md — 새 실행환경 이미지 정합성 사전 점검

- **대상 파일**: `~/.claude/agents/03-design.md` (주) / `~/.claude/agents/04-development.md` (연계)
- **대상 섹션**: 03-design.md 의 tasks.md 분해 절차 / 04-development.md §G(런타임 초기화 1회 검증, 기존 PATCH-01) 인접
- **현재 내용**: (agent-observations.md OBS-1 발췌 기반) ADR 이 새 실행환경(러너·잡·워커)을 이미지/컨테이너로 실행하도록 지정할 때, 그 이미지가 실제로 요구 실행스택(언어 런타임·CLI 도구·바이너리)을 포함하는지 확인하는 명시적 절차가 Design/Development 정의에 없다. 020 에서 ADR-002(Fly one-off machine 러너)가 2단계 승인·3~4단계 구현까지 진행됐으나, 실행 대상 이미지(`apps/backend/Dockerfile`, node:20-alpine)에 bash·psql·pg_dump·`scripts/migration/` 이 없다는 사실이 Deploy 단계(6단계 후)에서야 STATIC_VERIFICATION_FAIL 로 발견됨.
- **변경 내용**:
  - **03-design.md** — research/tasks 작성 절차에 점검 항목 추가: "ADR 이 새 실행환경을 이미지/컨테이너로 실행하도록 지정한 경우, 그 환경이 요구하는 실행스택(런타임·CLI·바이너리)이 **어느 기존 이미지에서 이용 가능한지** research.md 에 확인 기재한다. 기존 이미지로 확보 불가하면(신규/전용 이미지 필요) 그 사실을 tasks.md 완료기준에 **별도 태스크**로 명시(대안 이미지 준비를 미리 태스크화) — Deploy 단계에서 처음 발견되지 않도록."
  - **04-development.md** — §G 인접에 확장 노트: "새 실행환경 이미지를 요구하는 ADR 구현 시, 로컬 `docker build` + 컨테이너 내 `which <필수 CLI>` 1회 확인으로 실행스택 존재를 검증한다(§G 런타임 초기화 검증의 이미지 스택 확장). 검증 불가 시 tasks.md 에 이미지 준비 태스크 누락 여부 확인."
- **변경 근거**: OBS-1 (트리거 §12-b). GAP-020-05.
- **적합성**: 범용 O(모든 이미지 기반 배포 프로젝트의 "새 실행환경 이미지화" 상황에 공통 적용, 특정 언어·도구 무관) / 역할정합 O(실행환경 사전 점검은 Design 영향도 분석·Development 런타임 검증의 정의 범위, "반영 금지" 미해당).
- **강제도**: SHOULD
- **§G 관계 검토**: 04-development.md §G(PATCH-01)은 "라이브러리 런타임 import 1회 검증"으로 앱 부팅 시점 대상이다. 본 패치는 "별도 실행환경 이미지의 실행스택 확보 여부"로 대상이 다르나 **동일 원칙(정적 검증만으로 못 잡는 런타임/실행환경 결함을 1회 실행 검증으로 조기 포착)의 확장**이다. 별도 패치로 두되 §G 를 상호 참조하도록 연결.
- **status**: 검토중

---

## PATCH-020-02 — agent-rules.md §6.2 / (연계) pipeline-protocols.md §3 — idle Agent 재개 실패 시 신규 spawn 폴백 명문화

- **대상 파일**: `~/.claude/rules/on-demand/agent-rules.md` §6.2 (주) / `~/.claude/docs/pipeline-protocols.md` §3 SendMessage 패턴 (연계)
- **대상 섹션**: §6.2 "§7 시작 절차 재호출 단축" (단축 트리거 = [재작업]/[복귀]/[재개] MOD 마커 + SendMessage 재개 전제)
- **현재 내용**: (OBS-2 발췌 기반) §6.2 재작업 단축 규칙은 "동일 세션 내 재호출/SendMessage 재개"를 전제로 단축을 허용하나, Agent 가 이미 idle 종료된 경우 SendMessage 로 재개할 수 있는지 여부가 규칙에 명시되지 않았다. 020 에서 Deploy 재검증 시 `SendMessage({to: "Deploy020"})`(이름) 및 `to: "Deploy020@session-84d4c998"`(spawn 결과 표시값) 둘 다 실패("No agent named... reachable" / "to must be a bare teammate name") → 신규 spawn(Deploy020b) + 전체 컨텍스트 재주입으로 임기응변 폴백.
- **변경 내용**: §6.2 단축 트리거 설명 뒤에 노트 추가 — "**idle 재개 실패 폴백**: idle 통지를 받은 Agent 라도 SendMessage 재개(이름/표시 agentId 둘 다)가 실패할 수 있다(세션 종료 후 unreachable). 재개 실패 시 즉시 신규 spawn(동일 SPEC_ROOT·전체 컨텍스트 재주입, [재작업]/[재검증] MOD 마커 부여)으로 폴백한다. Agent 도구 spawn 결과에 표시되는 `{Name}@session-{id}` 는 SendMessage 재개용 raw agentId 를 보장하지 않는다." pipeline-protocols.md §3(SendMessage 패턴)에도 동일 폴백을 1줄 상호 참조.
- **변경 근거**: OBS-2 (트리거 §12-e). Deploy020→Deploy020b 신규 spawn 폴백 실측.
- **적합성**: 범용 O(SendMessage/Agent Teams 재개는 도구 메커니즘 공통, 특정 프로젝트 무관) / 역할정합 O(§6.2 재작업 단축 규칙의 전제 보강, "반영 금지" 미해당).
- **강제도**: SHOULD
- **연계**: 프로세스 흐름 측면은 process-patches.md **PROC-020-01** 참조(main session 의 재개 시도→폴백 결정 순서).
- **status**: 검토중
