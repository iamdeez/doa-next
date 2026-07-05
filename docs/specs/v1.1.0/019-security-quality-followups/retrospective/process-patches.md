---
작성: Retrospective Agent
버전: v1.0
최종 수정: 2026-07-05 19:46
상태: 적용 완료 (2026-07-05, main session — PROC-019-01 을 pipeline-recovery.md §2.2 + 05-test.md 에 반영, docs-change-logs 2026-07-05-001 기록)
---

# Process Patches: 019-security-quality-followups

> 프로세스·흐름 제어 개선 제안. 적용 주체 = main session(사용자 승인 후).

## 목차

- [PROC-019-01](#proc-019-01-5b-사전-결함-편입-흐름의-agent-정의-트리거-절차-부재)

---

## PROC-019-01: 5b 사전 결함 편입 흐름의 Agent 정의 트리거 절차 부재

- **현재 프로세스**: 5b EXECUTION 이 base commit 대비 `git diff 0` 인 **사전 결함**(선행 spec 잠재 결함)을 발견하면, gaps.md 에 기록하고 status BLOCKED 로 보고한다. main 이 사용자에게 범위 처리 방향을 질의하고, 사용자가 "본 spec 에 통합 수정"(옵션 A)을 승인하면 역방향 재작업(Planning→Design→Development[복귀]+Test AUTHORING[재작업], PPG-1)으로 계획 외 fix 를 편입한다.
- **문제점**: 이 "사전 결함 편입" 흐름은 019 에서 **구현규칙 2-1**(불가피한 코드 변경 시 plan.md/research.md 선반영 후 구현)로 사후 커버되어 규칙 정합적으로 처리되었으나, **어느 Agent 정의에도 이 트리거·절차가 명시되어 있지 않다**. 즉 (i) 5b 가 사전 결함 발견 시 "신규 SC 불요·기존 SC 커버·spec 불변"을 어떤 기준으로 판정하는지, (ii) 사용자 옵션 A 승인 후 Planning/Design 재작업이 어떤 순서·범위로 진행되는지가 암묵지에 의존한다. 다른 상황(예: 사전 결함이 신규 SC 를 요구하는 경우, 또는 옵션 B 별도 hotfix spec 분리)에서 재현·판정이 불안정할 위험.
- **개선 방향**: `~/.claude/docs/pipeline-recovery.md` 또는 `~/.claude/agents/05-test.md`(EXECUTION) 에 "사전 결함(git diff 0) 발견 시 처리 분기"를 명문화한다 — (1) 5b 가 결함이 기존 SC 를 차단하는지/신규 SC 를 요구하는지 판정 → (2) main 이 사용자에게 3분기 질의(A: 본 spec 통합·기존 SC 커버 시 spec 불변 / B: 별도 hotfix spec 분리 / C: known-limitation 문서화) → (3) 옵션 A 채택 시 구현규칙 2-1 에 따라 Planning[재작업]→Design[재작업]→Development[복귀] 순서로 plan/research/tasks 선반영 후 구현. 019 의 실제 흐름을 canonical 예시로 인용.
- **영향 범위**: `~/.claude/docs/pipeline-recovery.md`(단계 복귀·범위 확장 절차), `~/.claude/agents/05-test.md`(EXECUTION 의 사전 결함 판정), main session 흐름 제어. PATCH-019-03(사전 결함 커버리지 예방)과 상보적 — PATCH-019-03 은 발생 예방, PROC-019-01 은 발생 후 처리 정형화.
</content>
