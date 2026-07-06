---
작성: Retrospective Agent
버전: v1.0
최종 수정: "[시각 미확인, spawn 기준 23:26]"
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

### 1a. GAP-ID 역추적

| GAP | 발견 단계 | 발생(누락) 단계 | 사전 방지 가능했던 질문/절차 | 처리 |
|---|---|---|---|---|
| GAP-020-01 | Design(3) | Spec(1) — ephemeral 4종 이관/스킵 정책 미명시 | Spec 단계에서 "전수 이관" FR 이 휘발성 테이블(토큰·OTP·CSRF nonce·outbox)에도 적용되는지 확인 | **RESOLVED by DB Design** — 4종 스킵 확정, SC-005 대상 29테이블. 정상 위임 흐름(패치 불요). |
| GAP-020-02 | DB Design(선택) | 선행 spec — context.md 낙후(FileAsset `@@map("files")` 미반영) | context.md 갱신 시 물리 테이블명을 schema.prisma 실측으로 확인 | context.md 정정 → **PATCH-CXT-020-01** (본 회고 도출) |
| GAP-020-03 | Docs(6) | 본 spec — 실 이관 전제조건(레거시 [TO-VERIFY]·variants SKU 가정·소셜로그인 레거시 대응) 구조적 잔존 | — (옵션 A 원칙상 파이프라인 내 확정 불가, 정상) | context.md §6 등재 → **PATCH-CXT-020-02** |
| GAP-020-04 | Docs(6) | 본 spec — 컷오버 실행 인프라·운영 임계값 infra.md 미반영 | — (정상, spec 완료 시점 갱신 대상) | infra.md §8 등재 → **PATCH-CXT-020-06** |
| GAP-020-05 | Deploy(선택) | Design(3)/Development(4) — ADR-002 러너 실행 이미지 정합성 미검증 | Design/Development 에서 "새 실행환경의 실행스택이 기존 이미지에서 확보 가능한가" 사전 확인 | **RESOLVED by Deploy 재검증** (전용 러너 이미지 T014) + **OBS-1 → PATCH-020-01** |
| GAP-020-06 | Security(선택) | 본 spec — migration_staging PII 정리 미자동화(SEC-020-01, Medium) | — (권고사항) | context.md §6 등재 → **PATCH-CXT-020-03** (PROC-013-03) |
| GAP-020-07 | Security(선택) | 본 spec — verification_runs actor 필드 부재(SEC-020-02, Medium) | — (권고사항) | context.md §6 등재 → **PATCH-CXT-020-04** (PROC-013-03) |
| GAP-020-08 | Performance(선택) | 본 spec — 18서비스 순차 추출·적재(Medium) | — (권고사항, 아키텍처 결함 아님) | context.md §6 등재 → **PATCH-CXT-020-05** (PROC-013-03) |
| GAP-020-09 | Performance(선택) | 본 spec — checksum `ORDER BY random()` anti-pattern(Low) | — (권고사항) | context.md §6 등재 → **PATCH-CXT-020-05** 통합 |

**GAP 상태 최종 재점검(PATCH-019-04)**: gaps.md 각 GAP 상태를 test-report.md·coverage.md·Deploy/Security/Performance 보고와 대조. GAP-020-01(RESOLVED by DB Design)·GAP-020-05(RESOLVED by Deploy 재검증)는 실제 산출물과 일치. GAP-020-02/03/04/06/07/08/09 는 전부 문서-갱신-필요 또는 권고사항으로 OPEN 상태가 정확(본 회고의 PATCH-CXT 로 처리 위임). **상태 정정 필요 GAP 0건** — 해소됐는데 OPEN 잔존한 GAP 없음.

**선행 spec 연속성**: 020 은 v1.1.0 릴리즈의 마지막 차수(001~019 로 18개 도메인 모듈 완료 후 부재했던 데이터 이관·컷오버를 도구화). GAP-020-02(context.md file_assets 오표기)는 014~016 소셜로그인 차수에서 §4 데이터모델을 갱신하며 함께 낙후된 것으로, 반복 발생이라기보다 **누적 낙후**다. 동일 GAP 반복 없음 — 우선순위 격상 대상 아님.

### 1b. agent-observations.md 기반 패치 도출 (OBS-XXX)

| OBS | 트리거(§12) | 도출 패치 | 강제도 |
|---|---|---|---|
| OBS-1 | (b) Deploy BLOCKED STATIC_VERIFICATION_FAIL | **PATCH-020-01** — Design/Development 에 "새 실행환경(러너·잡·워커) 이미지/컨테이너 실행 ADR 이행 시, 실행스택(런타임·CLI·바이너리)이 기존 이미지에서 확보 가능한지 사전 확인. 불가 시 tasks.md 완료기준에 별도 태스크 명시" 절차 추가 | SHOULD |
| OBS-2 | (e) 반복 패턴 — idle Agent 재개 실패 | **PATCH-020-02** — agent-rules.md §6.2(또는 pipeline-protocols.md §3)에 "idle 통지 Agent 도 SendMessage 재개 실패 가능 — 실패 시 즉시 신규 spawn(동일 SPEC_ROOT·전체 컨텍스트 재주입) 폴백" 명문화 + **PROC-020-01**(프로세스축) | SHOULD |
| OBS-3 | (e) Performance 보고 — constitution 성능조항 부재 | **PROC-020-02** — constitution 성능 전용 조항 부재 시 Performance Agent 판단기준 공백 (경미, 기록 위주) | SHOULD NOT(경미) |

> agent-observations.md 의 "정상 관찰"(패치 불요, 강점): 거짓 green 방지 원칙이 5a/5b 전반 관철·Deploy 실측 기반 재검증·DB Design [TO-VERIFY] 처리 원칙. §2·§4·§5 에 균형 반영.

---

## 2. 재작업 패턴 분석

### 서킷 브레이커 이력

- **발동 없음.** 동일 단계 재작업 3회 초과 사례 없음.
- 유일한 재작업: Deploy BLOCKED(GAP-020-05, 러너 실행 불가 구조) → 사용자 대안 B 결정 → Development[복귀] 1회(T014 전용 러너 이미지) → Deploy[재검증] PASS. **재작업 1회 = 서킷 브레이커 정상 범위.**

### 재작업 근본 원인

- Deploy 단계 BLOCKED 의 근본 원인은 **ADR 승인 시점(2단계)과 실행 가능성 검증 시점(Deploy, 6단계 후)의 시차**(OBS-1). ADR-002(Fly one-off machine 러너)가 승인·설계·구현까지 진행됐으나 "실행 대상 이미지가 실제로 bash·psql·pg_dump·스크립트를 포함하는가"는 Deploy 정적 검증에서야 확인됐다.
- **다행히 재작업 범위는 작았다** — §F(out-of-band, 도메인 코드 무변경) 원칙 덕에 신규 Dockerfile 1개 추가 + RUNBOOK renumbering 만으로 해소. 원칙적으로 Design 또는 Development 초기에 잡을 수 있었던 결함이므로 PATCH-020-01 로 사전 점검 절차를 추가한다.

### 균형 관점 — Deploy Agent 역할의 성공 사례

Deploy Agent 의 "정적 검증 갈음" 임무가 **제대로 작동한 모범 사례**이기도 하다. 문서상만 존재하던 ADR-002 실행 경로의 실제 결함을 실 컷오버 당일이 아닌 파이프라인 내에서 선제 포착했고, 재검증 시 팀리드 지시대로 **보고 문구를 신뢰하지 않고 직접 `docker build`·`which`·`docker inspect`·PID 1 실측**으로 재현했다. "설계 승인 시점 vs 실행 검증 시점의 시차"라는 구조적 약점(OBS-1)과 "Deploy Agent 가 그 시차를 실제로 메꿔줬다"는 강점이 공존한다.

### PROC-008/PROC-003 직전 N=3 차수 적용 패치 효과 측정 (PROC-015-02 필수 산출)

> 측정 대상: 직전 N=3 차수(017·018·019)의 적용 완료 패치 중 020 차수에 효과가 관찰된 항목. 본 spec 은 out-of-band bash/SQL 이관 도구(신규 앱 코드 0)라 다수 코드축 패치는 측정 불가(N/A) 처리.

| 패치 | 의도 | 본 차수(020) 효과 | 효과 발휘 여부 |
|---|---|---|---|
| PATCH-A08 (옵션 A/B/C 검증 방식) | 파이프라인 내 검증 불가한 SC 를 사용자 실행 계약으로 분리 | 020 이 옵션 A 를 spec→plan→design→test 전 단계 일관 채택. 실 레거시 접속 필요 SC 12건을 거짓 green 없이 계약 검증(5b coverage.md) | **O** |
| PATCH-A15 (신규 의존성 자가점검) | 신규 라이브러리 도입 시 재점검 | selection-phases.md "신규 npm 의존성 자가점검" 절에서 "신규 0건(표준 pg_dump/psql + 기존 pg 재사용)" 명시 이행 | **O** |
| PATCH-A09/A10 (infra.md/context.md 갱신 기준) | 구조적 제약·인프라 변경 발생 시 gaps 등재 | Docs 가 GAP-020-03(§6 구조적제약)·GAP-020-04(infra §8) 를 PATCH-A10/A09 기준 명시로 등재 → 본 회고 PATCH-CXT 로 연결 | **O** |
| PROC-013-03 (위임 Medium+ 보안부채 context §6 등재) | Security 위임 Medium+ 취약점 무추적 소실 방지 | GAP-020-06/07(Medium) 이 명시적으로 "Retrospective 위임 — context §6 additive 등재(PROC-013-03)" 로 기록 → PATCH-CXT-020-03/04 도출 | **O** |
| PROC-002 (PATCH-CXT 코드검증 강제) | context 패치 오기재 사전 차단 | 본 회고 PATCH-CXT-020-01 이 schema.prisma L782/783 직접 Read 로 files.files 검증 후 작성 | **O** |
| PATCH-PY-*/typescript 런타임 검증 등 코드축 | — | 020 은 도메인 코드 0변경 → 측정 대상 아님 | 측정 불가(N/A) |

> 효과 미발휘(X) 사례 **없음**. 직전 3차수 적용 패치가 020 의 검증 방식·의존성 점검·문서 갱신·보안 위임·코드검증 전반에 정상 인용·적용됨. 안전망 OBS 신규 등록 불요.

---

## 3. 설계 워크플로우 준수 점검

| 항목 | 준수 여부 | 근거 |
|---|---|---|
| ① CHANGES.md 확인 | O | Spec 시작 절차 "A-0 기존 working tree 수정 cross-reference" + Docs 가 019 항목 앞 prepend |
| ② constitution.md 확인 | O | 전 단계 시작 절차에서 P-001~007 확인. Planning P-001/P-005 예외 2건 기재·사용자 승인 |
| ③ context.md 확인 | O | Spec/Design/DB Design 이 §2/§4/§6 읽음. DB Design 이 §4 file_assets 낙후 발견(GAP-020-02) |
| ④ infra.md 확인 | O | Planning/Deploy 가 §8 확인. Docs 가 §8 대조로 GAP-020-04 등재 |
| ⑤ [NEEDS CLARIFICATION] 해소 | O | Spec 완료 시 0건. 사용자 22질문 답변 반영 후 확정 |
| ⑥ Constitution Gates 통과 | O | Planning P-001~P-007 전건 PASS(예외 2건 사용자 승인 후 3단계 진입) |
| ⑦ research.md 코드베이스 분석 | O | Design 이 타깃 33테이블 전수 인벤토리(timestamp·mutation·FK) 실측 |
| ⑧ tasks.md 전제 조건 체크 | O | Development 시작 절차 입력검증에서 T001 산출물 4파일 완결성 확인 |

**PROC-013 선행 spec 영향 추적 자가 점검**: 020 spec.md 에 "선행 spec 영향 추적" 절 존재 여부 — 020 은 신규 이관 도구(선행 결함 보정 spec 아님)로 해당 절 부재. GAP-020-02(file_assets 오표기)는 선행 014~016 의 context.md 갱신에서 누락됐으나, 이는 "선행 spec 결함"이 아니라 "문서 낙후"이며 본 spec DB Design 이 실측으로 즉시 포착·기록했다. 식별 누락 원인 없음(정상 포착).

---

## 4. 구조 개선 필요성

- **Agent 역할 경계**: 명확했다. DB Design(매핑 명세)·Deploy(실행 검증)·Security·Performance 각 선택 Agent 의 책임이 겹치지 않았다. 특히 Deploy 의 "정적 검증 갈음"이 Development 의 "구현 자가판정"을 독립 재확인하는 이중 게이트로 작동(모범).
- **누락 Agent 필요성**: 없음. OBS-1(실행환경 정합성)은 신규 Agent 가 아니라 **기존 Design/Development 정의에 사전 점검 절차 1개 추가**(PATCH-020-01)로 해소 가능.
- **선택 단계 활성화 기준**: 적절. selection-phases.md 가 FR-009/010(DB Design)·FR-003/013/ADR-002(Deploy)·FR-015/NFR-004(Security)·NFR-001/005/FR-011(Performance) 명시 근거로 4개 전부 Y 활성화. 암묵적 연관 없이 명시 요구사항 기반 — 원칙 준수.
- **캐스케이딩 블로킹 규칙 작동**: Deploy FAIL 시 Security·Performance 스킵 판단이 정확히 적용됐고(1차 BLOCKED), 재검증 PASS 후 Security→Performance 순차 진행. §0 캐스케이딩 규칙이 설계대로 동작.

---

## 5. 작업 기록 분석 (_ai-workspace/runs/)

- **필수 읽기 이행**: 각 Agent runs/·pipeline-log 시작 절차 이벤트에서 필수 문서 읽기가 구체적으로 기록됨(예: Design 이 schema.prisma 33테이블 실측, DB Design 이 33테이블 전문 실측). constitution/context/infra 참조가 각 단계에 명시.
- **Agent 간 Context 전달**: 충분. DB Design 의 [TO-VERIFY] 앵커 계약·SC-005 29테이블 확정이 Development·Test 로 정확히 전파. Deploy 재검증 시 §6.2 재작업 단축([재검증] 마커+전체 컨텍스트) 적용.
- **비효율 패턴**: OBS-2 의 idle Agent 재개 실패(Deploy020→Deploy020b 신규 spawn 폴백)가 유일한 비효율. 토큰 비용은 크지 않았으나(전체 컨텍스트 재주입으로 처리) §6.2 재작업 단축 규칙의 전제("SendMessage 재개 가능")가 실제로는 불확실함을 드러냄 → PATCH-020-02/PROC-020-01.
- **시각 기록 정합성(PROC-015-03/016-02)**: 일부 Agent(Spec·DB Design·Test AUTHORING)가 `[시각 미확인, spawn 기준 HH:MM]` 앵커 병기 방식을 사용해 이벤트 시간순 판독성이 015/016 차수 대비 개선됨. main 이 spawn 기준 시각을 Context 로 전달하는 실효 경로가 020 에서 정착 관찰됨(강점).

---

## 6. 전역 규칙·참조 문서·스킬 개선 검토

- **PATCH-020-01(Design/Development 정의)**: OBS-1 대응. 적합성: 범용 O(모든 프로젝트의 "새 실행환경 이미지화" 상황에 적용)/역할정합 O(Design·Development 의 실행환경 사전 점검은 정의 범위). → agent-patches.md 등재.
- **PATCH-020-02(agent-rules.md §6.2)**: OBS-2 대응. 적합성: 범용 O(SendMessage idle 재개는 도구 메커니즘 공통)/역할정합 O(§6.2 재작업 단축 규칙의 전제 보강). → agent-patches.md 등재.
- **PROC-020-01/02(process-patches.md)**: 프로세스·흐름 제어 개선 → process-patches.md 등재.
- **잔존 참조 grep 점검**: 본 회고에서 전역 문서 파일 이동·삭제 이력 없음 → grep 점검 불요.
- **(PROC-R02) 이력/changelog 성 섹션 행 추가 금지**: context.md 갱신 패치(PATCH-CXT)에서 §7 갱신 이력 표는 "현재 상태 스냅샷"이 아닌 이력 성격 — 신규 spec 행 추가 패치를 작성하지 **않는다**. 단, context.md 는 §1 "현재 버전" 단일 필드 갱신만 허용(020 은 버전 무변경 v1.1.0 유지이므로 §1 갱신도 불요). §7 갱신 이력 행 추가는 main session 의 정례 갱신 재량(본 회고 패치 대상 아님).

---

## 7. 우선 개선 항목

> 심각도 기준: Critical 전체 + High 상위 3개. 본 차수 Critical/High 등급 시스템 결함 **없음**(모든 패치 SHOULD 이하).

| 순위 | 패치 | 심각도 | 근거 |
|---|---|---|---|
| 1 | **PATCH-020-01** (실행환경 이미지 정합성 사전 점검) | Medium(SHOULD) | GAP-020-05 BLOCKED 재작업 유발. 다음 파이프라인에서 "새 실행환경 이미지화" 시 재현 가능. Design/Development 사전 점검으로 Deploy 단계 늦은 발견 방지 |
| 2 | **PATCH-020-02 / PROC-020-01** (idle 재개 실패 → 신규 spawn 폴백 명문화) | Medium(SHOULD) | OBS-2 반복 가능 패턴. §6.2 전제가 불확실. 명문화로 임기응변 제거 |
| 3 | **PATCH-CXT-020-01** (context.md files.files 정정) | Low | GAP-020-02. 향후 spec 작성자 동일 오표기 반복 방지 |
| — | PATCH-CXT-020-02~06 | Low~Medium | 구조적 제약·보안 Medium·성능 권고 등재(추적 유지) |
| — | PROC-020-02 (constitution 성능조항 부재) | 경미(기록) | OBS-3, 이번 spec 무영향. 향후 NFR 모호 시 대비 기록만 |

---

## 8. memory 저장 후보 (사용자 검토 필요)

> 핵심 원칙 §8 의 4개 기준(a 범용성 / b 최우선 중요도 / c 반복 검증 / d 글로벌 흡수 불가능)을 **모두** 충족하는 항목만 등재. 모호하면 등재하지 않는다.

| ID | 후보 학습 (한 줄) | 적용 가능 범위 | 4기준 충족 근거 (a/b/c/d) | 제안 memory type |
|---|---|---|---|---|
| (검토) MEM-020-01 | "새 실행환경(러너·잡)을 이미지로 실행하는 ADR 이행 시 실행스택이 기존 이미지에서 확보 가능한지 사전 확인" | 이미지 기반 배포 프로젝트 공통 | a:범용 O / b:재작업 유발했으나 out-of-band 로 범위 작음(치명도 중) / **c:본 차수 1회 관찰만 — 반복 검증 미충족** / **d:글로벌 패치(PATCH-020-01)로 더 잘 해결 — memory 흡수 불필요** | (등재 보류) |

**등재 결론: 없음.** MEM-020-01 은 (c) 반복 검증(1회 관찰만) 및 (d) 글로벌 흡수 불가능(PATCH-020-01 Agent 정의 패치로 해결이 더 적합) 기준을 충족하지 못한다. 보수성 우선 원칙에 따라 memory 후보로 등재하지 않으며, PATCH-020-01(agent-patches.md)로 처리한다. 다음 파이프라인에서 동일 패턴이 재관찰되면 그때 memory 승격을 재검토한다.

---

## 작업 환경

본 세션은 Bash 도구 미제공 환경으로 `*.stackdump`·`core.*` 잔여 파일 점검용 `ls`/`date` 실행이 불가했다. Glob 도구로 점검 시도는 산출물 작성 범위상 생략했으며(effective PROJECT_ROOT 1단계 깊이 점검 필요), 파이프라인 실행 중 각 Agent 의 git status 실측 보고(Development·Docs·Deploy·Test)에서 `*.stackdump`/`core.*` 유형 잔여 파일 언급이 0건이었다. main session 이 필요 시 `ls -1 /Users/krystal/workspace/doa/doa-next/*.stackdump 2>/dev/null` 로 최종 확인 권장(발견 시 자동 삭제 금지 — 디버깅 정보 보존).
