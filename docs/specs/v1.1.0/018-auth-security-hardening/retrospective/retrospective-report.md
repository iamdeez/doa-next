---
작성: Retrospective Agent
버전: v1.0
최종 수정: 2026-07-04 [시각 미확인, spawn 기준 06:36]
상태: 확정
---

# 회고 분석 리포트

## 목차

- [1. gaps.md + agent-observations.md 기반 패치 도출](#1-gapsmd--agent-observationsmd-기반-패치-도출)
- [2. 재작업 패턴 분석](#2-재작업-패턴-분석)
- [3. 설계 워크플로우 준수 점검](#3-설계-워크플로우-준수-점검)
- [4. 구조 개선 필요성](#4-구조-개선-필요성)
- [5. 작업 기록 분석](#5-작업-기록-분석)
- [6. 전역 규칙·참조 문서·스킬 개선 검토](#6-전역-규칙참조-문서스킬-개선-검토)
- [7. 우선 개선 항목](#7-우선-개선-항목)
- [8. memory 저장 후보 (사용자 검토 필요)](#8-memory-저장-후보-사용자-검토-필요)

---

## 1. gaps.md + agent-observations.md 기반 패치 도출

### 1a. gaps.md 역추적

| GAP-ID | 유형 | 발견 단계 | 발생(근본) 단계 | 사전 방지 가능 질문 | 도출 패치 |
|---|---|---|---|---|---|
| GAP-018-01 | 문서-갱신-필요 (infra.md §2/§8) | 1단계 Spec (PROC-009 cross-reference) | 선행 spec — Fly.io 클라이언트 IP 전달 방식이 애초에 infra.md 에 미문서화 | "rate limit·프록시 헤더 신뢰에 의존하는 spec 설계 시 infra.md 에 헤더 재기입 보증이 문서화되어 있는가?" | PATCH-CXT-005 (infra.md §2/§8 additive) |
| GAP-018-02 | 입력-결함 → [B] 테스트 오류 | 5a Test AUTHORING (실행 확인 중) → 5b EXECUTION 판정 | 5a AUTHORING — best-effort 내부 try/catch 서비스(`SecurityAuditLogger`)를 전체 mock 하여 production 도달불가 분기를 전제한 wiring 테스트 작성 | "테스트 대상 서비스가 내부적으로 예외를 삼키는(best-effort) 설계인가? 그렇다면 서비스 전체 mock 은 도달불가 분기를 만들지 않는가?" | PATCH-018-01 (05-test.md AUTHORING) |
| GAP-018-03 | 문서-갱신-필요 (context.md §6) | 6단계 Docs (문서-구현 일치성 검증) | 본 spec 이 선행 부채를 해소했으므로 자연 발생(오류 아님) | (해당 없음 — additive 문서 갱신) | PATCH-CXT-001·002 |

**역추적 결론**:

- **GAP-018-01·03 은 "코드 정합성 결함이 아닌 additive 문서 갱신"** — 013/014 선례와 동일 패턴. Design/Docs Agent 가 코드 검증(PROC-002) 후 Retrospective 위임하는 정상 흐름을 따랐다. 새 절차 결함 아님.
- **GAP-018-02 만 실제 재작업을 유발한 결함**이며, 그 근본 원인은 5a AUTHORING 의 wiring 테스트 전제 조건 오류다. 아래 §6 에서 전역 패치로 도출한다.

**선행 spec 연속성 검토** (본 spec 은 보정 성격의 보안 하드닝 spec):

- GAP-018-03/01 은 013(GAP-013-09/10/11)·014(GAP-014-01/06) 부채의 **후속 해소**로, spec.md "선행 spec 영향 추적" 5행에 명시적으로 등재되어 있었다 — 무추적 소실 없이 정상 승계·해소되었다. 동일 GAP 반복이 아니라 **의도적 해소 spec**이므로 우선순위 격상 대상 아님.
- GAP-018-02 는 선행 spec 이력의 후속이 아닌 **본 차수 신규 테스트 작성 오류**다. 선행 spec 미등록이 정상(선행 결함이 아님) — PROC-013 자가 점검 통과.

**PROC-013 선행 spec 영향 추적 자가 점검**:

- 본 spec 의 spec.md 에 "선행 spec 영향 추적" 절(013·014 GAP 5행)이 존재한다.
- 본 spec 식별 결함(GAP-018-02)은 선행 spec 의 GAP/미해결 항목이 **아니다** — 5a 가 신규 작성한 wiring 테스트의 전제 오류로, 선행 차수 산출물에 등록될 성질이 아니다. 식별 누락 없음.
- 따라서 PROC-XXX 후속 등록 불요(선행 차수 Design 부정합·Test 정적검증·Docs cross-check 어느 단계도 놓친 것이 아님).

### 1b. agent-observations.md 기반 패치 도출

- **`_ai-workspace/agent-observations.md` 부재** → main session 이 기록한 OBS 0건 → 1b 건너뜀.
- **효과 미발휘 안전망 검토(PROC-003 (2)b)**: GAP-018-02 는 main session OBS 미기록 항목이나 "시스템 결함(효과 미발휘)"이 아니라 정상 5a→5b→5a 재작업 루프로 1회 만에 해소되었다(서킷 브레이커 미발동). PATCH-OBS-001 trigger (a)~(e) 중 (a)(동일 단계 2회 이상 REWORK) 미충족(5a 재작업 1회) → 안전망 OBS 신규 등록 불요. 단, 재발 가능한 테스트 작성 패턴이므로 §6 전역 패치(PATCH-018-01)로 도출한다.

---

## 2. 재작업 패턴 분석

### 재작업·복귀·중단 이력

| 이벤트 | 단계 | 원인 | 분류 |
|---|---|---|---|
| 세션 한도 중단 #1 | 4/5a (PPG-1) | API 세션 한도(reset 4:50am) — 양쪽 부분 산출물 존재(클린 재시작 불가) | 환경요인 (품질 재작업 아님) |
| 파이프라인 재개 #1 | 4/5a (PPG-1) | 리셋 후 fresh 재spawn — 부분 산출물 이어받기(증분) | 정상 복구 |
| 세션 한도 중단 #2 (암묵) | 4 | Development 재개 세션도 T011 이후 run 로그 기록 전 재차 종료 → 재개 Agent 가 git+체크박스 대조로 T012~T015 기구현 상태 확인 | 환경요인 |
| 단계 복귀 5b → 5a | 5b→5a | GAP-018-02 [B] 테스트 오류 확정 — `auth.service.spec.ts` SC-017 wiring 2건 정정 | **품질 재작업 1회** |
| 5a [재작업] → 5b [재작업] 재검증 | 5a→5b | 정정 반영 재확인 | 정상 |

- **서킷 브레이커 미발동**: 5a 품질 재작업 1회로 3회 임계 미달. 세션 한도 재spawn 은 환경요인이라 품질 재작업 카운팅 제외(pipeline-log L314 명시 — 올바른 산정).
- **재작업 근본 원인 집중도**: 재작업은 5a 단계 1건에 국한. 4단계 Development(A·B·C)·6단계 Docs·Security 는 재작업 0. 파이프라인 전반의 재작업 밀도는 낮다.

### PROC-008 적용 완료 패치 효과 측정 (N=3: 015·016·017)

> PROC-015-02 에 따라 보정/후속 spec 회고에서 직전 N=3 차수 적용 패치 효과 측정 표를 **필수 산출**한다.

| 패치 | 의도 | 본 차수(018) 효과 | 효과 발휘 여부 |
|---|---|---|---|
| PATCH-017-01 (05-test.md AUTHORING — 선행 spec SC 인용을 `(vX.Y.Z/NNN spec)` 출처 정규식 형식으로 선제 작성) | STALE_SC 오탐·일괄 정정 churn 선제 차단 | 018 신규 SC 마커 전건 `(v1.1.0/018 spec)` 출처 주석 보유, 선행 잔존 마커 전건 `(vX.Y.Z/NNN spec)` 보유 → **STALE_SC 0건**(coverage.md §STALE_SC). 016(옵션 A 정정)·017(27건 일괄 정정) 대비 churn 완전 소거 | **O** |
| PROC-002 (PATCH-CXT-XXX 코드 기반 사실 검증) | context/infra 패치 오기재 방지 | Docs Agent 가 GAP-018-01(main.ts:12·client-ip.util.ts) + GAP-018-03(§6 5행 file:line) 코드 재검증 후 위임. 본 Retrospective 도 auth.controller/main.ts/auth.service/social-auth.service 직접 Read 재검증 | **O** |
| PROC-013-03 (위임 Medium 이상 보안 부채 context §6 additive 등재) | 미해결 보안 부채 무추적 소실 방지 | Security Agent 가 SEC-018-01(Medium)을 context §6 additive 권고로 명시 → PATCH-CXT-003 로 등재 | **O** |
| PROC-014 (사후 운영 검증 피드백 사이클) | 파이프라인 통과 후 운영 결함 추적 | spec.md 에 사후 검증 시나리오 4건 명시, SEC-018-01 이 "PROC-014 #1(헤더 스푸핑 검증)"에 매핑 | **O** |
| PROC-015-03 / PROC-016-02 (`date` 미가용 Agent 의 spawn 기준 시각 앵커 병기) | `[시각 미확인]` 이벤트의 시간순 판독성 보완 | main 이 spawn 시각을 Context 로 전달, Agent 가 `[시각 미확인, spawn 기준 HH:MM]` 로 인용(pipeline-log L13·L59 등) | **O** (본 Agent 도 동일 준수) |
| PROC-017-01 (runs/ 미작성 안전망) | 5b·Docs runs/ 누락 방지 | **보류(미적용)** 상태였으나, 018 은 run-006(5b)·run-007(5b 재작업)·run-008(Docs) 전건 자율 작성 → 누락 미재발 | 측정 불가 (미적용 패치 / 자율 준수로 문제 미재현) |

- **효과 미발휘(X) 케이스 없음** → PROC-003 (2) 후속 처리(OBS cross-ref / 안전망 신규 등록) 불요.
- 측정 대상 N=3(015~017) 중 015·016 patch(naver 관련)는 auth 도메인 안정화 완료로 018 에 직접 재적용 신호 없음 — 상한 N=3 내 자동 제외 대상.

### PROC-014 사후 운영 검증 피드백 사이클 점검

- (a) 본 spec 파이프라인 종료 후 운영 결함 피드백: **미발생**(파이프라인 종료 직후 회고 시점).
- (b) 다음 cycle 진입 절차: 해당 없음(신규 cycle 미진입).
- (c) 사후 검증 계획의 spec 기재: **충족** — spec.md 에 PROC-014 사후 운영 검증 시나리오 4건 합의 기재. 특히 SEC-018-01(Fly-Client-IP 헤더 재기입 보증 미확증)이 "#1 헤더 스푸핑 시도 검증"으로 명시적 계획됨. 운영 배포 후 1회 검증이 예정되어 있어 미검증 가정의 무추적 소실 위험이 완화됨.

---

## 3. 설계 워크플로우 준수 점검

| 항목 | 준수 여부 | 근거 |
|---|---|---|
| ① CHANGES.md 확인 | O | Spec 시작 절차에 013/014 security-report·gaps 확인 기재 |
| ② constitution.md 확인 | O | Planning P-001~007 Constitution Gates 전건 통과, Security 조항 이행표 |
| ③ context.md 확인 | O | 전 단계가 context §6 auth 부채 4~5행 참조 |
| ④ infra.md 확인 | O | Spec PROC-009 배포 환경 cross-reference → GAP-018-01 도출 |
| ⑤ spec.md [NEEDS CLARIFICATION] 해소 | O | 사용자 결정 3건(Q-WT/Q15/Q17) 반영 후 0건 확정 |
| ⑥ plan.md Constitution Gates | O | P-001~007 전건 PASS(예외 0), ADR-001~010 |
| ⑦ research.md 코드베이스 분석 | O | 계층·영향범위·동시성 분석, throttler v6.5.0 API 검증 위임 |
| ⑧ tasks.md 전제 조건 체크 | O | 전제조건 3항 [x], SC-001~020 전건 테스트 태스크 매핑 |

- 단계 간 이동 원칙(각 단계 완료 기준 충족 후 진행) 전건 준수. Constitution Gates 미통과 상태에서 tasks 진입 없음.

---

## 4. 구조 개선 필요성

- **Agent 역할 경계**: 명확했다. PPG-1(Development A·B·C ↔ Test AUTHORING D)의 레이어 분할이 정확히 준수됨 — Development 는 D 레이어 미진입, 5a 는 production 무변경. GAP-018-02 정정도 `auth.service.spec.ts`(D 레이어) 한정으로 경계 위반 0.
- **누락 Agent 필요성**: 없음. Security Agent 단독 활성(Deploy/Performance/Database N)이 적절 — selection-phases.md 의 활성화 판정 근거가 코드/NFR 기반으로 명확.
- **선택 단계 활성화 기준 적절성**: 적절. PATCH-A15(신규 npm 의존 자가 점검)로 Deploy N 판정, Performance 는 "수치 성능 NFR 부재"로 N — 암묵 연관 활성화 금지 원칙을 정확히 적용.
- **개선 후보(구조)**: PPG-1 세션 한도 중단 시 **부분 산출물 이어받기(증분) 재개 프로토콜**이 명문화되어 있지 않다(017 은 클린 재시작, 018 은 증분 이어받기 — 두 방식의 분기 기준 부재). → PROC-018-01 로 도출.

---

## 5. 작업 기록 분석

- **runs/ 완전성**: run-001(Spec)·002(Planning)·003(Design)·004(Development)·005(Test AUTHORING)·006(Test EXECUTION)·007(Test EXECUTION 재작업)·008(Docs)·009(Security)·010(Retrospective) **전건 존재**. 017 에서 발견된 5b·Docs runs/ 누락(PROC-017-01)이 **018 에서 미재발** — 각 Agent 자율 준수.
- **필수 문서 참조**: 각 run 의 시작 절차 체크에 constitution/context/infra 참조가 기재됨. Design run-003 이 context §6 auth 부채 열람, Security run-009 가 013 gaps 원문·context §6 5행 grep 확인 — Agent 간 Context 전달 충분.
- **부분 산출물 이어받기 정합성**: run-004(Development 재개)가 git status + tasks.md 체크박스 + 코드 3중 대조로 "직전 세션이 run 로그 기록 전 T012~T015 구현 완료"를 정확히 판정 — PROC-015-01(COMPLETE 추정 3조건)의 정신을 실무에서 준수. 폐기 없이 검증만 수행한 판단이 모범적.
- **비효율 반복 패턴**: 관찰되지 않음. 세션 한도 2회 중단은 환경요인이며, 증분 이어받기로 중복 구현 없이 복구.

---

## 6. 전역 규칙·참조 문서·스킬 개선 검토

### GAP-018-02 패턴의 전역 패치화 (PATCH-018-01)

**패턴**: 내부적으로 예외를 삼키는(best-effort, 각 메서드 try/catch) 서비스를 wiring/통합 테스트에서 **전체 mock 하여 강제로 throw** 시키면, production 에서 "모든 메서드가 무조건 내부에서 예외를 삼킨다"는 계약상 **도달 불가능한 분기**를 전제하게 된다 → 실제 production 코드는 정상인데 테스트만 RED. 올바른 방식은 **실 서비스 인스턴스 + 그 내부 의존(`PinoLogger.warn`)만 throw mock** 하여 plan.md Input(도달 가능한 실제 예외 경로)을 재현하는 것이다.

- **반복 가능성 평가**: best-effort 로거·감사·알림 서비스는 흔한 설계이며, 이 안티패턴은 언어 불문(TS/NestJS·Python 등) 재현 가능하다. 기존 05-test.md PATCH-03("mock 이 production 실제 분기 경로를 재현")의 **구체적 하위 사례**로, 명시적 anti-pattern 예시가 없어 이번에 재현되었다.
- **관찰 횟수**: 018 1회(신규). 3회 반복 임계 미달이나, (1) 명확한 설계 원칙이고 (2) 한 줄 규칙으로 재발 차단 가능하며 (3) 이미 존재하는 PATCH-03 을 구체화하는 additive 성격이므로 **채택 권고(강제도 SHOULD)**.
- **대상**: `~/.claude/agents/05-test.md` AUTHORING 모드. TypeScript 한정이 아닌 언어 불문 테스트 seam 설계 원칙이므로 typescript.md 가 아닌 05-test.md 가 적합(적합성 2단계 통과 — §agent-patches PATCH-018-01 참조).

### 기타 전역 문서 개선

- **전역 규칙 재구성/파일 이동 이력 없음** → 잔존 참조 grep 점검 불요.
- **PROC-017-01(runs/ 안전망)** 은 보류 상태였고 018 에서 문제 미재발했으므로 강제도 상향 재검토는 다음 차수로 이월(2회 연속 재발 시).

---

## 7. 우선 개선 항목

> 심각도 기준: Critical 전체 + High 상위 3개.

- **Critical**: 0건.
- **High 상위 3개**:
  1. **PATCH-018-01** (05-test.md AUTHORING — best-effort 내부 try/catch 서비스 전체 mock 안티패턴 명시). 유일하게 실 재작업(5a 복귀 1회)을 유발한 결함의 재발 방지. 채택 권고.
  2. **PROC-018-01** (부분 산출물 이어받기 재개 프로토콜). 세션 한도 중단이 반복 관찰되는 환경 특성상 클린 재시작 vs 증분 이어받기 분기 기준 명문화 필요.
  3. **PATCH-CXT-001** (context.md §6 auth 5행 RESOLVED 전이 + SEC-018-01/02/03 additive). 본 spec 의 핵심 산출(선행 보안 부채 5건 해소)을 SoT 문서에 반영해야 다음 spec 설계자가 워크플로우 ③에서 정확히 인지.

---

## 8. memory 저장 후보 (사용자 검토 필요)

**없음.**

- **GAP-018-02 패턴(best-effort 서비스 전체 mock → 도달불가 분기)** 은 유력 후보였으나, 4개 기준 중 (c)(d) 미충족으로 제외:
  - (a) 범용성: O (언어 불문 테스트 seam 원칙)
  - (b) 최우선 중요도: △ (재작업 1회 유발 — 운영 장애 직결 아님)
  - (c) 반복 검증: **X** (018 1회 관찰. 보수성 우선 — 1회로는 memory 후보 아님)
  - (d) 글로벌 흡수 불가능: **X** (05-test.md AUTHORING PATCH-018-01 로 더 잘 해결됨 — memory 는 마지막 수단)
- 기준 (c)·(d) 각각 단독으로도 탈락 사유이므로 memory 등재 대신 **전역 Agent 정의 패치(PATCH-018-01)로 라우팅**한다.

> 본 Agent 는 위 판단만 기록한다. 실제 memory 파일 작성/미작성은 main session 이 사용자 승인 후 결정한다.
