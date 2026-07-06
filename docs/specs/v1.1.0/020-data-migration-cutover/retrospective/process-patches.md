---
작성: Retrospective Agent
버전: v1.0
최종 수정: 2026-07-06
상태: 적용 완료 (main session — PROC-020-01(pipeline-recovery §1.3.3) + PROC-020-02(performance.md) 적용, docs-change-logs 2026-07-06-001 기록)
---

# Process Patches: 020-data-migration-cutover

> 본 패치는 제안이며, 적용 주체는 main session(사용자 승인 후)이다.

## 목차

- [PROC-020-01](#proc-020-01--idle-agent-재개-실패-시-main-session-폴백-흐름)
- [PROC-020-02](#proc-020-02--constitution-성능-전용-조항-부재-시-performance-agent-판단기준-공백-경미)

---

## PROC-020-01 — idle Agent 재개 실패 시 main session 폴백 흐름

- **현재 프로세스**: main session 이 재작업/재검증을 위해 이전 단계 Agent 를 재호출할 때, §6.2/§0 PPG 재작업 단축 규칙은 SendMessage 로 기존 Agent 를 재개하는 것을 우선 전제로 한다. idle 종료된 Agent 의 재개 실패에 대한 명시적 폴백 흐름이 프로세스로 정형화되어 있지 않다.
- **문제점**: 020 에서 Deploy 재검증 시 main 이 SendMessage(이름·표시 agentId) 재개를 시도했으나 둘 다 실패했고, 신규 spawn(Deploy020b) + 전체 컨텍스트 재주입으로 임기응변 처리했다. 프로세스가 정형화되어 있지 않아 매번 시행착오·판단 부담이 발생한다.
- **개선 방향**: main session 의 이전 단계 Agent 재호출 흐름을 다음 순서로 명문화 — (1) 대상 Agent 가 동일 세션 내 active 이면 SendMessage 재개 시도 → (2) idle/종료 통지를 받았거나 SendMessage 가 "unreachable"/"bare teammate name" 오류를 반환하면 **재시도 없이 즉시 신규 spawn 폴백**(동일 SPEC_ROOT + 원 지시·직전 보고 요약 전체 컨텍스트 재주입 + [재작업]/[재검증] MOD 마커). pipeline-log 에 "단계 복귀" 이벤트로 agentId 갱신 기록.
- **영향 범위**: main session(Pipeline Orchestration) 흐름 제어. agent-rules.md §6.2·§0 PPG 운용 규칙 6항(PROC-015-01)·pipeline-protocols.md §3(SendMessage 패턴). PATCH-020-02(규칙 문서축)와 짝을 이룸.

---

## PROC-020-02 — constitution 성능 전용 조항 부재 시 Performance Agent 판단기준 공백 (경미)

- **현재 프로세스**: Performance Agent 는 constitution.md 성능 조항을 1차 기준, spec.md NFR 을 2차 기준으로 사용한다. 본 프로젝트 constitution(P-001~007)에는 성능 전용 조항이 없어 Performance Agent 가 spec.md NFR 단독 채택으로 판단했다.
- **문제점**: 020 은 spec.md NFR-001(60분)/NFR-005(50분)가 충분히 구체적이라 문제없이 처리됐다. 다만 향후 spec 에서 NFR 이 모호하면 Performance Agent 가 판단 기준을 스스로 정해야 하는 공백이 잠재한다(OBS-3, 경미).
- **개선 방향**: (선택) performance.md 정의에 "constitution 성능 조항 부재 + spec.md NFR 모호 시, 임의 기준 설정 대신 §9 모호함 판정 기준으로 [NEEDS CLARIFICATION] 후보 도출 → main 경유 사용자 확인" 절차를 명시. **필수 아님** — 이번 spec 무영향, 기록·환기 위주.
- **영향 범위**: `~/.claude/agents/performance.md` (선택 적용). 강제도 SHOULD NOT(경미).
