---
작성: Retrospective Agent
버전: v1.0
최종 수정: 2026-07-06 [시각 미확인, 직전 확정 이벤트 15:29 이후]
상태: 확정
---

# Process Patches: 022-legacy-file-binary-migration

## 목차

- [PROC-022-01: runs/ 실행기록 누락 준수 강제 (Spec·Docs·Deploy)](#proc-022-01-runs-실행기록-누락-준수-강제-specdocsdeploy)

---

## PROC-022-01: runs/ 실행기록 누락 준수 강제 (Spec·Docs·Deploy)

- **현재 프로세스**: 각 Phase Agent 는 `agent-rules.md §4.2` [MUST] 에 따라 `SPEC_ROOT/_ai-workspace/runs/run-{NNN}-{agent-name}.md` 실행기록을 작성해야 한다. main session 은 §4.1 [MUST] 로 단계 완료 자가검증을 수행하나, **현재 자가검증 항목에 "해당 Agent 의 runs/ 파일 존재 확인"이 명시적으로 포함되어 있지 않다.**
- **문제점**: 022 차수에서 `runs/` 디렉토리에 7개 파일만 존재하고 **Spec(1단계)·Docs(6단계)·Deploy(선택) 3개 Agent 의 실행기록 파일이 부재**했다(glob `runs/*.md` 실측). 세 Agent 모두 pipeline-log 에는 시작/작업 절차 이벤트를 남겼으나 개별 runs/ 파일은 생략했다. `runs/` 는 회고 분석·재실행 시 컨텍스트 복원의 단일 소스(§3.2 [MUST NOT] 근거)이므로, 누락 시 해당 단계의 내부 판단 근거를 pipeline-log 요약만으로 복원해야 하는 부담이 발생한다. 또한 기존 파일의 번호(NNN)가 실행 순서와 역전(`run-001-test-authoring` vs `run-002-planning`)되어 `pipeline-conventions.md §5` 순번 원칙과 불일치했다.
- **개선 방향**:
  1. [main] 각 단계 "단계 완료" 이벤트 기록 직전 자가검증 항목에 **"해당 Agent 의 `runs/run-*-{agent}.md` 파일이 존재하고 frontmatter `상태` + 완료요약이 채워졌는지"** 확인을 추가한다. 부재 시 SendMessage 재개 또는 재spawn 으로 runs/ 산출을 유도(산출물 대체 금지).
  2. [any-agent] runs/ 파일 번호(NNN)는 `pipeline-conventions.md §5` 에 따라 **실행 진입 순서**로 채번한다(PPG 병렬 단계는 동일 turn 내 spawn 순서 기준). 번호 역전 방지.
- **영향 범위**: `agent-rules.md §4.1`(main 단계 완료 자가검증 절차) — 검증 체크 항목 1건 추가. 개별 Agent 정의(01-spec·06-docs·deploy) 는 이미 §4.2 MUST 를 상속하므로 정의 본문 수정 불요. `pipeline-quality.md` 단계별 게이트에 runs/ 존재 확인을 명문화하는 것도 대안.
- **강제도**: SHOULD (데이터 무결성 직접 영향 없음 — 산출물 자체는 정상 완성. 회고·재현 컨텍스트 복원 편의 저하 수준). 반복 관찰(직전 cycle 대비 3회 이상) 시 MUST 승격 검토.

> 근거: 022 차수 회고 §5 — 파이프라인 산출물(스크립트·SQL·문서·테스트)은 전건 정상 완성되고 gate PASS 였으나, 세 Agent 의 runs/ 실행기록만 선택적으로 누락. 산출물 품질 결함이 아닌 **기록 완결성** 결함이므로 강제도 SHOULD 로 도출하되 main session 자가검증 편입으로 재발 차단.
