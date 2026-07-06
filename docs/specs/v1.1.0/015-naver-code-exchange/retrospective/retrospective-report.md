---
작성: Retrospective Agent
버전: v1.0
최종 수정: 2026-07-03 [시각 미확인 — Bash 도구 부재]
상태: 작성중
---

# 회고 분석 리포트 — 015-naver-code-exchange

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

| GAP-ID | 유형 | 발생 단계 | 발견 단계 | 사전 방지 질문 | 도출 패치 |
|---|---|---|---|---|---|
| GAP-015-04 / SEC-015-01 | 보안(High) | 2단계 Planning(AUTO_LINK naver 재편입 결정) — 근본은 3단계 Design 이 provider 간 이메일검증 대칭성 미대조 | 6단계 Security 재감사 | "code-exchange 로 앱바인딩을 확보했다고 이메일 소유권도 확보되는가? google email_verified 검증이 naver 에도 있는가?" | PATCH-015-01(Design)·02(Planning)·03(Security) |
| GAP-015-02 | 설계-누락(Dart breaking) | 3단계 Design §F(TS optional 만 점검, Dart implements 시맨틱 누락) | 4단계 Development(컴파일 오류) | "abstract 타입 확장이 무회귀인지는 언어 인터페이스 시맨틱에 의존하지 않는가? implements 구현체를 전수 열거했는가?" | PATCH-015-04(Design §F) |
| GAP-015-01 | 문서-갱신(infra) | 2단계 Planning(PROC-009 cross-ref, 네이버 아웃바운드 미등재) | 2단계(자체 등록) | (문서 갱신 항목 — 설계 결함 아님) | PATCH-CXT-015-02(infra) |
| GAP-015-03 | 문서-갱신(context) | 6단계 Docs(014 naver 미와이어 서술 outdated) | 6단계(자체 등록) | (문서 갱신 항목) | PATCH-CXT-015-01(context) |
| GAP-015-05 | 문서-갱신(spec 문언) | 6단계(GAP-015-04 결정으로 SC-006/010 문언 불일치) | 5a Test | (정책 반전의 파생 항목) | Spec Agent 복귀(§5 처리방향) |

**핵심**: GAP-015-04(SEC-015-01)는 6단계에서야 발견되었으나, **3단계 research.md 에 조기 발견 단서가 이미 존재**했다 — L33 이 `GoogleProvider verify(aud + email_verified)`를 명시했고 L36/L51 이 `naver ∈ AUTO_LINK → 자동연동 정상`을 기술했으나, 두 provider 의 이메일 검증 수단 차이를 **대조하는 절차가 없어** 놓쳤다. Design/Planning 단계 조기 발견 실패가 재작업 1사이클의 근본 원인이다.

### 1b. OBS-XXX 기반 패치 도출

`_ai-workspace/agent-observations.md` 부재 — main session OBS 기록 0건. agent-rules.md §12 trigger(a~e) 중 어디에도 기록되지 않았다. 그러나 SEC-015-01 재작업은 §12 trigger (b)(BLOCKED 사유 — 이 경우 Security gate FAIL/BLOCKED)에 해당하는 명확한 사례이므로, **main OBS 미기록은 그 자체로 안전망 미흡**이다(PROC-003 (2)-(b) 준용). gaps.md + pipeline-log 2중 소스로 분석을 수행했으며, 이 미기록 경향을 PROC-015-02 및 아래 §4 에 안전망 후보로 반영했다.

---

## 2. 재작업 패턴 분석

### 재작업 사이클 (서킷 브레이커 미발동)

- **재작업 1건**: SEC-015-01(High) BLOCKED → 사용자 결정(naver AUTO_LINK 제외) → PPG-1 부분 재진행(Development run-007 + Test AUTHORING 5a) → 5b 재검증 → 6단계 Docs 현행화 → Security 재감사 RESOLVED. 서킷 브레이커(동일 단계 3회 초과) 미발동. 강제 중단 없음.
- **중단·재개 1건**: PPG-1 5a Test AUTHORING 이 세션 사용 한도로 정식 §8 COMPLETE 미보고 종료(pipeline-log L129-133). main 이 run-004 파일 status + 백엔드 green 간접신호로 동기화 판정 → PROC-015-01 도출.

### 재작업 반복 원인

- 단일 근본 원인: **앱바인딩 확보 ≠ 이메일 소유권 확보**. Planning ADR-004 가 앱바인딩만을 자동연동 안전 근거로 삼고 이메일 소유권 공백을 Security 위임으로만 처리(위험 인지 부재). Design research.md 가 대조표를 만들지 않음. → 6단계에서 발견되어 앞 단계로 되돌아가는 비용 발생.

### 선행 spec 완료 패치 효과 측정 (PROC-008 N=3, PROC-003 형식)

| 패치 | 의도 | 본 차수 효과 | 효과 발휘 여부 |
|---|---|---|---|
| PATCH-014-02 | 계정 해석 3경로를 개별 전수 분석(한 경로 완화가 타 경로에 자동 전파 가정 금지) | Security 가 이 프레임으로 Path 3a/3b/3c 를 개별 분석하여 SEC-015-01(Path 3b 이메일 소유권 미검증) 정확 확정. 재감사 시 Path 3a 영속화 경로 소거까지 검증 | O |
| PATCH-014-01 | 앱바인딩 검증표(provider별 앱바인딩 수단) 설계 명시 | plan.md·research.md 가 code-exchange 앱바인딩 근거를 표로 인용 | O (단, 이메일 소유권 축은 표에 없어 SEC-015-01 예방 실패 → PATCH-015-01 로 축 추가) |
| PROC-014-03 | Flutter UI 테스트 하드assert + FakeTokenStore | 5a Test AUTHORING 이 naver UI 테스트에 하드assert 적용(run-004) | O |

> **효과 미발휘(부분) 후속**: PATCH-014-01 의 앱바인딩표가 "이메일 소유권" 축을 포함하지 않아 SEC-015-01 을 예방하지 못한 것은 명확한 구조 공백이다. main OBS 미기록 사례이므로 PROC-003 (2)-(b) 안전망에 따라 Retrospective 가 PATCH-015-01(대조표에 이메일 소유권 축 추가)로 신규 도출했다.

### 사후 운영 검증 피드백 사이클 점검 (PROC-014)

- spec.md "사후 운영 검증 피드백 사이클(PROC-014)" 절이 실 크레덴셜 발급 후 5개 시나리오 수동 점검을 명시(옵션 B 사용자 직접 검증)했다. SC-016(성능 e2e)·실 네이버 흐름은 파이프라인 범위 외 deferred 로, 크레덴셜 발급 후 점검 일정 수립을 spec 에 합의 기재. → PROC-014 (c) 충족(모니터링 계획 spec 명시). 본 파이프라인 종료 후 운영 결함 피드백은 아직 없음(신규 spec, 사후 검증 미도래).

---

## 3. 설계 워크플로우 준수 점검

| 항목 | 준수 | 근거 |
|---|---|---|
| ① CHANGES.md 확인 | O | Spec/Planning 시작 절차에서 014·013·012 CHANGES 확인(pipeline-log L20·L72) |
| ② constitution.md 확인 | O | Planning P-001~P-007 Gates 전건 PASS(L78). Security 가 보안 전용 조항 부재 확인 |
| ③ context.md 확인 | O | 전 단계 시작 절차에서 확인. Design PATCH-A11 로 §2/§4 부정합 사전 점검 |
| ④ infra.md 확인 | O | Planning PROC-009 배포 cross-ref → GAP-015-01 등록 |
| ⑤ [NEEDS CLARIFICATION] 해소 | O | spec.md 0건(Q-A~Q-D 사용자 확정, L209) |
| ⑥ Constitution Gates 통과 | O | plan.md 전건 PASS·예외 없음 |
| ⑦ research.md 코드베이스 분석 | O(부분) | 포함되나 provider 간 이메일검증 대칭성 대조 누락(§1a 핵심) |
| ⑧ tasks.md 전제 조건 체크 | O | run-004 §8 확인 |

**부분 미흡**: ⑦ research.md 는 코드베이스 분석을 포함했으나 자동연동 안전성 판정에서 이메일 소유권 축을 누락(PATCH-015-01 대상).

---

## 4. 구조 개선 필요성

- **Agent 역할 경계**: SEC-015-01 은 Design/Planning(설계 위험 인지)과 Security(감사) 사이 경계에서 발생. Security 가 최종 방어선으로 정확히 작동했으나(PATCH-014-02 효과), 위험 인지를 Security 로만 미루면 재작업 비용이 커진다. Design/Planning 에 소셜 provider 이메일검증 대칭성 사전 점검을 배치하는 것이 비용 효율적(PATCH-015-01/02).
- **누락 Agent 불요**: 기존 Agent 구성으로 충분. 절차 보강으로 해결 가능.
- **선택 단계 활성화 적절**: Security 필수 활성(SC-018) 판단이 정확했다 — 이 활성화가 없었다면 SEC-015-01 이 미발견 배포되었을 것. Deploy/Performance/DB 비활성도 타당(research PATCH-A10 — 순수 아웃바운드, 배포 특이성 없음).
- **main OBS 기록 경향**: 본 사이클 OBS 0건. §12 trigger (b) 해당 사례(Security BLOCKED)에서도 미기록 → OBS 기록 강제 메커니즘 재점검 필요(PROC-015-02 인접).

---

## 5. 작업 기록 분석

- **필수 문서 독해**: runs/ 001~011 전부 §7 8개 체크박스 완전 기록. Design/Security 가 실 코드를 직접 Read/grep(추측 금지 준수).
- **§6.2 단축 적용**: 5b 재검증(run-008)이 동일 세션 재작업으로 §6.2 단축 적용 명시(pipeline-log L290) — 적절.
- **Context 충분성**: PPG-1 재작업 시 Development 가 security-report.md SEC-015-01 전문 + 사용자 결정을 입력으로 받아 정확히 반영(run-007). Context 전달 충분.
- **비효율 패턴**: 세션 한도 중단으로 5a 정식 보고 누락(PROC-015-01). pipeline-log 일시 필드가 Agent 환경별로 실시각/[시각 미확인] 혼재하여 타임라인 판독 부담(PROC-015-03).

### 미해소 gaps 처리 방향 정리

| GAP-ID | 상태 | 처리 방향 |
|---|---|---|
| GAP-015-01 | 미해결 | PATCH-CXT-015-02(infra §5/§7/§8/§9) — main 사용자 승인 후 적용 |
| GAP-015-03 | 미해결 | PATCH-CXT-015-01(context §2/§4/§6/§7) — main 사용자 승인 후 적용 |
| GAP-015-05 | 미해결 | spec.md SC-006/010 문언 불일치. **Spec Agent 복귀 또는 후속 patch spec** 에서 SC-006→"naver 자동연동 미제공(409)"·SC-010→"2경로"로 갱신. 코드·테스트는 이미 안전 동기화 완료(문서 정합성 항목) |
| SEC-015-02(Medium) | 잔존 | context §6 등재(PATCH-CXT-015-01 (4c), PROC-013-03). 운영 셋업 전 state 생성·검증 구현 필수 |
| SEC-015-03(Low) | 잔존 | context §6 등재(PATCH-CXT-015-01 (4d)). 운영 크레덴셜 등록 시 redirect_uri 요구 여부 확인 |
| GAP-015-04(SEC-015-01) | 처리됨→RESOLVED | Security 재감사 RESOLVED 확정. gaps.md 상태를 "해결됨"으로 전이 권고(main, security-report 권고 5) |
| GAP-015-02 | 처리됨 | 향후 재발 방지 PATCH-015-04(Design §F) |

---

## 6. 전역 규칙·참조 문서·스킬 개선 검토

- **패치 대상 적합성 2단계 검토**(오염 방지): PATCH-015-01~04 전건 범용성 O·역할정합 O(agent-patches.md 각 항목 명시). Dart 한정 세부(PATCH-015-04)는 `[Dart]` 환경 태그로 구분하여 일반 원칙과 분리.
- **잔존 참조 grep 점검**: 본 사이클 전역 문서 파일 이동·삭제 이력 없음 → grep 점검 불요.
- **constitution.md 변경 필요성(분석 7)**: 없음. SEC-015-01 은 특정 spec 보안 사안이지 프로젝트 불변 원칙이 아니다 → constitution 아닌 context §6 등재(PATCH-CXT-015-01). 임의 완화·추가 없음.
- **도출 전역 패치**: PATCH-015-01(03-design)·02(02-planning)·03(security)·04(03-design §F). 프로세스: PROC-015-01(pipeline-recovery/SKILL)·02(07-retrospective)·03(pipeline-protocols/agent-rules §10).

---

## 7. 우선 개선 항목

심각도 기준 정렬(Critical 전체 + High 상위 3개):

1. **[High] PATCH-015-01 (Design)** — 소셜 provider AUTO_LINK 편입 시 provider 간 이메일 소유권 검증 대칭성 대조표 필수. SEC-015-01 재작업의 직접 근본 원인 차단. 재도입/신규 provider 마다 재발 위험.
2. **[High] PATCH-015-03 (Security)** — 외부 IdP 클레임 신뢰 사전 체크리스트. 최종 방어선 강화(이번엔 성공했으나 체크리스트 부재로 ad-hoc).
3. **[High] PATCH-015-02 (Planning)** — 자동연동 정책 ADR 에 provider별 이메일 소유권 보장 수단 명시 강제(Security 위임만으로 갈음 금지).
4. **[Medium] PROC-015-01** — PPG 세션 중단 시 COMPLETE 추정 3조건 판정 정형화.
5. **[Medium] PATCH-015-04** — Design §F 언어별 breaking change(Dart implements) 판정.
6. **[Low] PATCH-CXT-015-01/02** — context/infra 갱신(GAP-015-01/03·SEC-015-02/03 등재).

---

## 8. memory 저장 후보 (사용자 검토 필요)

> 본 Agent 는 아래 표만 작성한다. 실제 memory 파일 작성·수정은 main session 이 사용자 승인 후 수행한다(핵심 원칙 §7 MUST NOT).
> 4기준: (a)범용성 (b)최우선 중요도 (c)반복 검증 (d)글로벌 흡수 불가능.

| ID | 후보 학습 (한 줄) | 적용 가능 범위 | 4기준 충족 근거 (a/b/c/d) | 제안 memory type |
|---|---|---|---|---|
| MEM-015-01 | 기존 `naver-social-login-excluded.md` **갱신**: 015 에서 code-exchange(client_secret 서버 교환)로 네이버 **로그인은 재도입**되었으나, 이메일 소유권 미검증(SEC-015-01)으로 **자동연동은 여전히 제외**(카카오·구글만 AUTO_LINK). 상태 변화 반영. | 본 프로젝트(doa-next) 소셜 로그인 정책 이력 | a:프로젝트 한정이나 **기존 memory 항목의 정확성 유지가 필수**(오래된 "네이버 완전 제외" 서술이 015 이후 사실과 불일치) / b:다음 소셜 spec 설계자가 오판 방지 / c:014→015 2차수 연속 관찰 / d:project memory 성격(context §6 와 별개로 memory index 정확성) | project |

> **MEM-015-01 은 기존 memory `naver-social-login-excluded.md` 의 갱신 후보**다. 신규 파일이 아니라 기존 항목의 상태 전이(완전 제외 → 로그인 재도입·자동연동 제외)를 반영하는 것이므로, MEMORY.md 인덱스 요약문도 함께 갱신 권고. 실제 갱신은 main session 사용자 승인 후.

**신규 범용 학습 후보 — 등재 보류(글로벌 패치로 흡수)**: "소셜/외부 IdP 자동연동 시 앱바인딩과 이메일 소유권은 독립 보증이며 전자가 후자를 함의하지 않는다"는 범용 학습(a·b·c 충족)이 있으나, 기준 (d)(글로벌 규칙·Agent 정의로 흡수 불가능) 미충족 — PATCH-015-01/02/03(Design/Planning/Security 절차)으로 더 잘 해결되므로 memory 가 아닌 글로벌 패치로 처리한다(핵심 원칙 §8-d, memory 는 마지막 수단).
