---
작성: Retrospective Agent
버전: v1.0
최종 수정: 2026-07-03 [시각 미확인 — Bash 도구 미제공]
상태: 작성중
---

# Process Patches: 016-naver-state-redirect-hardening

## 목차

- [PROC-016-01: 선행 spec 미커밋 상태 진입 시 DIFF base commit 처리 가이드](#proc-016-01)
- [PROC-016-02: [시각 미확인] 앵커 미병기 — PROC-015-03 효과 미발휘 안전망](#proc-016-02)

---

## PROC-016-01

### 선행 spec 미커밋 상태에서 후속 spec 진입 시 DIFF base commit 처리 절차 정형화

- **현재 프로세스**: DIFF-{NNN}.md 는 해당 spec 최초 커밋(또는 브랜치 분기점)을 base commit 으로
  `git diff {base_commit}` 을 캡처한다(03-verification-rules §2-2). 그러나 **선행 spec 이 아직 커밋되지
  않은 상태**에서 후속 spec 이 시작되어 두 spec 의 변경이 working tree 에 물리적으로 공존하는 경우의
  base 처리 절차가 정의되어 있지 않다.
- **문제점**: 본 사이클에서 015 가 미커밋 상태로 016 이 시작되어(pipeline-log L11·L276), 016 DIFF base
  가 공유 base 6b64c24(014 완료 커밋)로 잡혔고 auth 공통 파일(social-auth.service.ts·naver.provider.ts)
  에 015+016 변경이 혼재했다. Docs Agent 가 015 DIFF 기록치와 대조하여 016 고유 변경을 best-effort
  증분 추정으로 분리했으나(L288·L294), 이는 (a) 절차 부재 상태의 임기응변이고, (b) "015 완료 커밋 후
  DIFF-016 재생성 필요"라는 미해결 부채를 후속 주의사항으로 이월시켰다. 015→016 연속 미커밋 진입은
  이 패턴의 **반복 관찰**이다(git status 상 015·016 산출물 동시 미커밋 확인).
- **개선 방향**:
  1. main session 이 신규 spec 진입 시(단계 시작 이벤트) 선행 spec 의 커밋 여부를 확인하고, 미커밋
     감지 시 pipeline-log 에 "base commit 혼재 주의" 를 명시(본 016 은 L11 에서 이미 선제 기록 —
     모범 사례로 표준화).
  2. Docs Agent DIFF 생성 시, 선행 spec 미커밋으로 base 가 혼재하면 DIFF-{NNN}.md 에 **base 상황
     caveat 절 + 선행 spec 커밋 후 재생성 명령**을 필수 기재(본 016 준수 — 표준화).
  3. **[사용자 안내]** 파이프라인은 spec 완료마다 사용자 커밋을 권장 안내한다(git 자동 실행 금지,
     git.md — 실행 주체 사용자 고정). 후속 spec 진입 전 선행 spec 커밋 완료를 SHOULD 권고로 명문화하여
     base 혼재 자체를 상류에서 예방.
- **영향 범위**: `~/.claude/agents/06-docs.md`(DIFF base caveat 절차) + `~/.claude/rules/specs/03-verification-rules.md §2-2`(base commit 결정 — 선행 미커밋 케이스 추가) + `~/.claude/skills/pipeline/SKILL.md` 또는 orchestration(신규 spec 진입 시 선행 커밋 확인·권고).

---

## PROC-016-02

### `[시각 미확인]` 앵커 미병기 — PROC-015-03 효과 미발휘 안전망 (PROC-003 (2))

- **현재 프로세스**: PROC-015-03(적용 완료)이 agent-rules §10·pipeline-protocols §5.1 에 "`[시각 미확인]`
  기재 시 직전 확정 이벤트 시각을 참조 앵커로 병기([SHOULD])"를 추가했다.
- **문제점**: 본 016 사이클 pipeline-log 의 `[시각 미확인 — Bash 도구 미제공]` 항목들(L13·L114·L120·
  L126·L132 등, Spec·DB Design Agent)에 **앵커가 병기되지 않았다** — PROC-015-03 의 의도가 반영되지
  않았다(retrospective-report §2 효과 측정표 X 케이스). 근본 원인: (a) 앵커 병기는 SHOULD(강제도 낮음),
  (b) Bash 미가용 Agent 는 애초에 `date` 실행 불가로 `[시각 미확인]` 을 기재하는 시점에 "직전 확정
  이벤트 시각"을 스스로 조회할 트리거·수단이 정의 절차상 없어, 규칙을 인지해도 수행 유도가 약하다.
  main OBS 미기록 케이스이므로 Retrospective 안전망으로 신규 등록한다(PROC-003 (2)(b)).
- **개선 방향**:
  1. **상류 해소 우선**: PROC-015-03 개선 방향 (1)(main session 이 Agent spawn 직전 실제 시각을 Context
     로 전달)을 **실효 조치로 승격**한다. Bash 미가용 Agent 도 main 이 전달한 spawn 기준 시각을
     `[시각 미확인, spawn 기준 HH:MM]` 형태로 앵커 확보 가능. main 은 depth=0 에서 date 획득 가능하므로
     이 경로가 앵커 병기 SHOULD 보다 실효적이다.
  2. main session 이 "단계 시작" 이벤트를 기록할 때(§4.1 MUST) 이미 실제 시각을 기재하므로, Agent 의
     `[시각 미확인]` 항목은 직전 "단계 시작" 이벤트 시각을 앵커로 자동 병기하는 것을 pipeline-protocols
     §5.1 에서 [SHOULD]→구체 절차로 명시한다.
  3. 강제도 재검토: 데이터 무결성 영향 없음(§10 예외 허용)이므로 SHOULD 유지하되, 실효 트리거(1·2)를
     보강하는 방향. 낮은 우선순위.
- **영향 범위**: `~/.claude/docs/pipeline-protocols.md §5.1`(앵커 병기 구체 절차) + `~/.claude/rules/on-demand/agent-rules.md §10`(main 전달 시각 앵커) + `~/.claude/skills/pipeline/SKILL.md`(spawn 시각 Context 전달). 낮은 우선순위(회고 편의, 데이터 무결성 영향 없음).

---

## 적용 완료

PROC-016-01·PROC-016-02 및 agent-patches.md 의 PATCH-016-01 은 사용자 승인(2026-07-03) 후 main
session 이 적용했다. 변경 로그: `~/.claude/docs-change-logs/2026-07-03-002.md`.
agent-patches.md 의 PATCH-CXT-016-01~05(context.md/infra.md 갱신)는 main session 이 별도 처리한다.
