---
작성: Retrospective Agent
버전: v1.0
최종 수정: 2026-07-03 [시각 미확인 — Bash 도구 부재]
상태: 적용 완료
---

# Process Patches: 015-naver-code-exchange

## 목차

- [PROC-015-01: PPG 세션 중단 시 COMPLETE 추정 판정 기준 정형화](#proc-015-01)
- [PROC-015-02: 선행 spec 완료 패치 효과 측정 표준 출력(PROC-008/PROC-003)](#proc-015-02)
- [PROC-015-03: pipeline-log 일시 필드 date 미획득 반복(도구 부재 환경)](#proc-015-03)

---

## PROC-015-01

### PPG(병렬 단계 그룹) 세션 중단 시 미보고 Agent 의 COMPLETE 추정 판정 기준 정형화

- **현재 프로세스**: PPG-1(4단계 Development + 5a Test AUTHORING)은 양쪽 status:COMPLETE 보고 수신 시 동기화하여 5b 진입한다(agent-rules.md §0 PPG 운용 규칙 2). 세션 사용 한도 등으로 한쪽이 정식 §8 YAML COMPLETE 보고 없이 종료되는 경우의 판정 절차가 정의되어 있지 않다.
- **문제점**: 본 사이클에서 Test AUTHORING(TestAuthoring015)이 세션 한도로 69 tool uses 후 정식 COMPLETE 미보고 종료(pipeline-log L129-133). main 이 (a) run-004 파일 status:완료 + (b) 백엔드 321/321 green(5a 작성 테스트 naver.provider.spec·autolink-policy.spec 포함) 의 **간접 신호**로 5a 완료를 추정하여 동기화 판정(L135-139). 판단은 합리적이었으나 절차가 정형화되어 있지 않아, 다른 상황(테스트 미작성 상태 중단 등)에서 오판 위험이 있다. 특히 산출물(test-cases.md)이 미완성인데 파일만 존재하는 경우를 구분하는 기준이 없다.
- **개선 방향**: PPG 내 Agent 가 정식 §8 보고 없이 세션 중단된 경우, main 이 COMPLETE 를 추정하려면 **다음 3조건 모두 충족**을 확인하도록 절차 명문화:
  1. 해당 Agent 의 runs/run-*.md 가 존재하고 frontmatter `상태: 완료` + "완료 요약" 절이 채워짐.
  2. 해당 Agent 소유 산출물(5a: test-cases.md + 테스트 파일)이 존재하고 QualityGate 최소 완성도 충족(예: 모든 SC 매핑 행 존재).
  3. 교차 검증 신호(5a 의 경우 상대 Agent(Development)가 확인한 테스트 green 또는 tsc/analyze 0)가 산출물과 정합.
  - 하나라도 불충족 시 SendMessage 재개 또는 재spawn 으로 정식 COMPLETE 유도(추정 금지). 재개 지점(L133)에 이 3조건 체크를 명시.
- **영향 범위**: `~/.claude/docs/pipeline-recovery.md`(재개 절차) + `~/.claude/skills/pipeline/SKILL.md`(PPG 동기화 판정) + agent-rules.md §0 PPG 운용 규칙 5(SKIP/중단 처리 인접).

---

## PROC-015-02

### 선행 spec 완료 패치 효과 측정 표준 출력 (PROC-008 / PROC-003 이행)

- **현재 프로세스**: PROC-008 은 보정/후속 spec 회고 시 직전 N=3 차수의 적용 완료 패치 효과를 측정하고, PROC-003 은 표준 출력 형식(표)을 요구한다. 015 는 014 의 직접 후속(네이버 재도입)이므로 측정 대상이다.
- **문제점**: 014 회고 산출물(retrospective/agent-patches.md·process-patches.md)이 015 SPEC_ROOT 에서 직접 참조되지 않았고, 본 015 파이프라인에서 014 적용 패치(PATCH-014-01 앱바인딩 검증표·PATCH-014-02 계정해석 전수분석·PROC-014-03 UI 하드assert 등)의 효과 측정 표가 산출되지 않았다. pipeline-log 상 PATCH-014-01/02·PROC-014-03 은 3·5·6단계에서 실제 인용·적용되었으나(L111·L218), 효과 발휘 여부가 표준 표로 기록되지 않았다.
- **개선 방향**: 후속/보정 spec 회고에서 PROC-008 N=3 측정 표(PROC-003 형식)를 retrospective-report.md §2 에 **필수 산출**하도록 재확인. 본 015 회고의 측정 결과는 retrospective-report.md §2 에 기재했다(PATCH-014-02 효과: SEC-015-01 정확 확정 → O / PATCH-014-01 효과: plan 앱바인딩표 인용 → O / PROC-014-03 효과: UI 하드assert 적용 → O). 다만 측정 표 산출이 절차상 자동 트리거되지 않아 누락 위험이 있으므로, main session 의 7단계 진입 프롬프트 또는 07-retrospective 분석 프레임워크 2에 "직전 N=3 패치 효과 표 필수 산출" 체크를 강화.
- **영향 범위**: `~/.claude/agents/07-retrospective.md`(분석 2 PROC-008/003) — 이미 정의되어 있으나 트리거 강제도 상향(SHOULD→MUST 검토).

---

## PROC-015-03

### pipeline-log 일시 필드 date 미획득 반복 (Bash/date 도구 부재 환경)

- **현재 프로세스**: agent-rules.md §10 은 이벤트·일시 기록 시 매번 `date +"%Y-%m-%d %H:%M"` 로 실제 시각을 획득하도록 강제하며, 불가 시 `[시각 미확인]` 기재를 허용한다.
- **문제점**: 본 사이클 pipeline-log 에서 Spec·Planning·Retrospective Agent 등 일부 Agent 가 `[시각 미확인 — Bash 도구 부재]`로 기재한 반면(L17·L69), Docs·Security·Test Agent 는 실제 시각(13:07·14:04 등)을 기재했다. 동일 파이프라인 내에서 시각 획득 가능 여부가 Agent 실행 환경(Bash 도구 제공 여부)에 따라 갈렸고, 이로 인해 **이벤트 시간순 정합성 판독이 어려워졌다**(예: run-004 authoring 은 02:03, 중단 이벤트는 12:53 로 역전처럼 보임). 이는 규약 위반은 아니나(§10 예외 허용) 재개·회고 시 타임라인 재구성 부담을 준다.
- **개선 방향**: (1) Agent 호출 시 main session 이 spawn 직전 실제 시각을 Context 로 전달하는 방안 검토(Bash 미가용 Agent 도 상대 기준 시각 확보). (2) 또는 `[시각 미확인]` 기재 시 직전 확정 이벤트의 시각을 참조 앵커로 병기(예: `[시각 미확인, 직전 확정 이벤트 14:06 이후]`)하여 순서 판독성 확보. 임의 시각 추측 금지 원칙(§10)은 유지.
- **영향 범위**: `~/.claude/docs/pipeline-protocols.md §5`(로그 기록 규율) + `~/.claude/rules/on-demand/agent-rules.md §10`. 낮은 우선순위(회고 편의 개선, 데이터 무결성 영향 없음 — SHOULD).

---

## 적용 결과 (2026-07-03)

사용자 승인(2026-07-03) 후 main session 이 PROC-015-01·02·03 3건 모두 적용. 변경 로그: `~/.claude/docs-change-logs/2026-07-03-001.md`.

- PROC-015-01 → agent-rules.md §0 PPG 운용 규칙 6([MUST] [main] 3조건) · pipeline-recovery.md §1.3.1 · skills/pipeline/orchestration.md 재개 절차.
- PROC-015-02 → 07-retrospective.md 분석2 PROC-008 강제도 [MUST] 상향.
- PROC-015-03 → agent-rules.md §10 · pipeline-protocols.md §5.1 (시각 앵커 병기 [SHOULD]).
