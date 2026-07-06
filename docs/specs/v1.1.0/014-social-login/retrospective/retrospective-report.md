---
작성: Retrospective Agent
버전: v1.0
최종 수정: 2026-07-02 [시각 미확인]
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

| GAP | 유형 | 발견 단계 | 발생(누락) 단계 | 사전 방지 질문 | 대응 |
|---|---|---|---|---|---|
| GAP-014-01 | 검증-공백 (tx-aware 원자성 e2e 미검증) | Design | Planning/Design (e2e deferred 정책) | "path 3c 2단계 쓰기의 원자성을 파이프라인 내에서 실경로로 검증할 수 있는가?" | OPEN(안전망 존재). SEC-002 로 §6 등재(PATCH-CXT-014-03) |
| GAP-014-02 | D-layer 테스트 결함 | Development/5b | 5a AUTHORING (테스트 harness 전제) | "위젯 테스트가 실제 위젯 타입·cwd·플랫폼 채널 전제와 일치하는가?" | RESOLVED by Test(EXECUTION) [B] 정정 4건 |
| GAP-014-03 | 설계-구현 불일치 (tasks vs 5a 계약) | Development | Design (tasks T-B4 vs 5a mock 계약 상충) | "tasks.md 의 tx 래핑 설계와 5a mock 이 동일 호출 방식을 가정하는가?" | RESOLVED by Development |
| GAP-014-04 | 구현 결함 (런타임 초기화 실패) | Development §G | Planning/Design (생성자 즉시 크레덴셜 조회) | "생성자에서 크레덴셜 getOrThrow 하면 크레덴셜 미설정 시 앱 전체 기동 불가 아닌가?" | RESOLVED by Development (verify() 지연) |
| GAP-014-05 | 문서-갱신-필요 (context.md) | Docs | — (문서 동기화) | — | PATCH-CXT-014-01 |
| GAP-014-06 | 문서-갱신-필요 (infra.md) | Docs | — (문서 동기화) | — | PATCH-CXT-014-02 |
| GAP-014-07 | 보안 취약점 High (Kakao/Naver 앱바인딩 누락) | Security | Planning/Design (클라이언트 토큰 흐름 provider 검증수단 미조사) | OBS-014-01 참조 | PARTIALLY RESOLVED (Kakao 해소, Naver→08 분리) |
| GAP-014-08 | 보안 취약점 (Naver 잔여 위험) | Development(07 분리) | Planning (ADR-001 클라이언트 토큰 naver 검증불가 미인지) | OBS-014-01 참조 | RESOLVED (Naver 완전제외) |
| GAP-014-09 | 문서-갱신-필요 (spec.md naver 서술 잔존) | Development/Test | Spec (구현 축소 후 spec 미갱신) | "구현이 spec 문구보다 좁아졌을 때 spec.md 정합성을 누가 갱신하는가?" | 미해결 → PATCH-014-03·PATCH-CXT-014-04 |
| GAP-014-10 | 보안 취약점 High (path 3a 재로그인 탈취) | Security 재감사 2차 | Development(완화책 부분 적용)·Security(초기 감사 부분 분석) | OBS-014-02 참조 | RESOLVED (Naver 완전제외) |

**선행 spec 연속성 검토**: 014 는 013(auth 확장)·009(소셜 버튼 플레이스홀더)에서 분리된 신규 기능이다. 013 GAP 의 후속 재발 항목은 없다. 단 013 의 SEC-002/003/004(Medium 보안 부채)가 아직 미해소 상태로 context.md §6 에 등재되어 있으며(PATCH-CXT-013-03 적용 완료), 014 의 SEC-002(orphan user)가 동일한 "auth 모듈 tx/원자성 부채" 계열로 누적된다. 반복 계열이므로 §6 부채 추적을 계속한다.

**선행 spec 영향 추적 자가 점검 (PROC-013)**: 014 spec.md 에 "선행 spec 영향 추적" 절 존재 여부는 확인 대상이나, 014 는 신규 기능 spec 으로 선행 결함의 후속 처리 spec 이 아니다. 014 에서 식별된 SEC-001 계열 결함은 선행 spec 의 GAP 로 등록된 이력이 없으며(신규 도메인), 식별 누락 원인은 아니다 — 따라서 PROC-013 자가점검 대상 아님.

### 1b. OBS-XXX 기반 PATCH 도출

- **OBS-014-01** → **PATCH-014-01**(02-planning.md) + **PROC-014-01**: 클라이언트 토큰 검증 방식 OAuth 채택 시, provider별 토큰 앱바인딩 검증 수단(aud/app_id/introspection) 존재 여부를 Planning/research 단계에서 사전 조사하여 plan 에 명시. 검증 수단 부재 provider 는 서버 code-exchange 대안 또는 범위 제외를 spec/plan 단계에서 결정. → Security 단계 지연 표면화(3회 복귀)를 사전 차단.
- **OBS-014-02** → **PATCH-014-02**(security.md) + **PROC-014-02**: 인증/계정연동 취약점 감사 시 계정 해석의 모든 분기 경로(재로그인 path 3a·자동연동 path 3b·신규생성 path 3c)를 일괄 열거하여 각 경로의 신뢰 근거를 분석. → path 3a 지연 발견으로 인한 부분완화 왕복(재감사 2차 추가 복귀)을 차단.

---

## 2. 재작업 패턴 분석

### 재작업·복귀 원인

| 라운드 | 트리거 | 복귀 단계 | 원인 |
|---|---|---|---|
| PPG-1 최초 | 세션 사용 한도 도달(2회) | 4+5a 중단→재개 | 리소스 외부 요인. SendMessage 재개로 agentId 보존 활용 성공 |
| 복귀 1 | Security SEC-001 High BLOCKED | 4(Development) | Kakao/Naver 앱바인딩 검증 누락 → Kakao app_id 대조 추가 |
| 복귀 2 | Security 재감사 v1.1 Naver High 유지 | 4(Development) | Naver 자동연동(path 3b) 비활성 화이트리스트 |
| 복귀 3 | Security 재감사 2차 v1.2 path 3a 신규 확정 | 4+5a(PPG-1) | Naver 이번 릴리즈 완전 제외 |

- **가장 재작업 많은 단계**: 4단계(Development) — Security 복귀로 3회 재호출.
- **반복 원인**: 단일 근본 원인(Naver 클라이언트 토큰 흐름의 앱바인딩 검증 수단 부재)이 3단계(자동연동→path 3a→완전제외)에 걸쳐 점진적으로 표면화. 초기 Planning 단계에서 provider별 토큰 검증 가능성을 조사했다면 naver 를 처음부터 범위 제외 또는 서버 code-exchange 로 설계하여 3회 복귀를 예방할 수 있었다(OBS-014-01).
- **서킷 브레이커**: **미발동**. 각 복귀는 "동일 단계 3회 초과 재작업"이 아니라 사용자 결정에 따른 단계적 방향 전환이었다. 다만 Security 재감사 2차 로그에 "서킷 3회차 근접 — 확정 결정으로 종결" 이 명시되어, 사용자가 완전 제외로 확정 결정하여 추가 왕복을 종결한 것이 서킷 발동 직전 회피에 기여했다.
- **세션 한도 재개**: 2회 세션 한도 중단 후 SendMessage 로 재개 성공. PROC-011(4단계 agentId 즉시 기록) 규율이 실제로 재개를 가능케 함 — 아래 §5 참조.

### 013 회고 패치 효과 측정 (PROC-008, 측정 범위 N=3)

직전 N=3 차수(011·012·013)의 적용 완료 패치 중 014 차수에서 발휘 가능한 항목을 측정한다. 012 이하는 대부분 백엔드 전용 패치로 014(social+Flutter)와 접점이 적어, 실질 측정 대상은 013 패치가 중심이다.

| 패치 | 의도 | 본 차수 효과 | 효과 발휘 여부 |
|---|---|---|---|
| PATCH-013-01 (03-design UI 상태주입 canonical) | Dev(C)·Test(D) 가 위젯 타입·test harness 전제를 동일 canonical 참조 | 014 tasks.md D3(Design) 이 LoginScreen 을 `ConsumerStatefulWidget` canonical 로 고정(pipeline-log 3단계 D2). 그럼에도 GAP-014-02 에서 flow 테스트의 `ProviderScopeWidget` 타입오류·cwd 버그·`_FakeTokenStore` override 누락이 발생 — canonical 이 위젯 타입은 고정했으나 **test harness 세부(플랫폼 채널 의존·secure storage override·cwd 기준)까지는 고정 못함** | X (부분 미발휘) |
| PATCH-013-02 (01-spec 코드현황 preliminary 표기) | Spec 단계 미검증 코드현황 서술 사전 차단 | 014 는 신규 기능 spec 으로 기존 코드현황 단정 서술 지점이 적어 해당 상황 자체가 거의 미발생 | 측정 불가 (해당 상황 미발생) |
| PROC-013-01 (tx-aware mock 은폐 사전 차단) | Design contract 표기 + Development 자가점검으로 tx 분기 실경로 검증 | 014 Development 가 §G 재점검에서 `PrismaService.get tx()` root fallback 을 직접 열람 확인(pipeline-log run-008)하여 GAP-014-01/03 을 사전 인지·기록. tx-aware 자가점검이 실제 수행됨 | O |
| PROC-013-02 (5b 위젯타입 확인 후 지시) | 5b 가 UI 테스트 FAIL 을 [B] 분류·harness 변경 지시 전 production 위젯 타입 확인 | 014 5b 가 GAP-014-02 정정 시 production `_SocialRow`·`LoginScreen` 실제 구조를 직접 확인 후 이모지 ancestor Finder·FakeTokenStore override 로 정정([B] 정정, production 불변). 위젯타입 확인 절차 준수 | O (부분) |
| PROC-013-03 (Medium 보안 부채 §6 등재) | 위임 Medium 취약점을 context §6 additive 등재 | 014 Security 가 SEC-002(Medium)를 명시적으로 "PROC-013-03 Retrospective 위임 → context §6 등재 권고"로 처리(security-report.md 권고 4). 본 회고가 PATCH-CXT-014-03 으로 실행 | O |

**효과 미발휘(X) 후속 처리**: PATCH-013-01 의 부분 미발휘는 main session 이 OBS 로 기록하지 않았다(trigger a~e 미해당 — 재작업 2회 미만, GAP-014-02 는 [B] 로 정상 수렴). 안전망으로 본 회고가 **PROC-014-03**(process-patches.md)에 "Flutter 위젯 테스트 harness 의 플랫폼 채널·secure storage·cwd 전제를 Design Test Authoring Contract 에 명시" 를 신규 등록하여 PATCH-013-01 을 보강한다(PROC-003 (2)(b) 안전망 OBS 후속 처리).

---

## 3. 설계 워크플로우 준수 점검

| 항목 | 준수 | 근거 |
|---|---|---|
| ① CHANGES.md 확인 | O | Spec run-001 A-0 working tree cross-reference, 013 CHANGES 승계 |
| ② constitution.md 확인 | O | Planning P2 Constitution Gates P-001~007 전부 PASS. Security 도 constitution 보안조항 부재 확인 |
| ③ context.md 확인 | O | Spec/Planning/Design 필수읽기에 context §2 auth·§4 데이터모델 포함 |
| ④ infra.md 확인 | O | Planning selection-phases 및 Docs GAP-014-06 로 infra 갱신 필요 식별 |
| ⑤ spec.md [NEEDS CLARIFICATION] 해소 | O | Spec 완료 시 [NEEDS CLARIFICATION] 0건 |
| ⑥ plan.md Constitution Gates 통과 | O | P-001~007 PASS |
| ⑦ research.md 코드베이스 분석 | O | Design D1 클래스 계층·영향 범위·[TO-VERIFY] 3종 |
| ⑧ tasks.md 전제 조건 체크 | O | Development/Test 시작 절차 8항목 통과 |

**미흡점**: ⑦ research 단계의 [TO-VERIFY] 3종(provider 응답필드·OAuth env·Flutter SDK)이 provider별 **토큰 앱바인딩 검증 수단** 항목을 포함하지 않았다. Planning ADR-002 가 google aud 만 명시하고 kakao/naver 검증 가능성을 Design 위임([TO-VERIFY])했으나, naver "검증 불가"라는 근본 제약이 research/Design 이 아닌 Security 단계까지 지연 표면화되었다(OBS-014-01, PROC-014-01 로 보강).

---

## 4. 구조 개선 필요성

- **Agent 역할 경계**: 명확했다. Security(감사) → Development(수정) → Test(재검증) → Docs(반영) → Security(재감사) 루프가 4회 반복되며 각 단계가 단일 책임을 준수했다. Security 가 코드 수정 권한 없이 방향만 제시하고 사용자 결정을 대기한 경계가 적절히 작동.
- **누락 Agent 없음**: 신규 Agent 필요성 없음.
- **선택 단계 활성화 기준**: DatabaseDesign=Y(social_accounts 신규 테이블), Security=Y(OAuth 인증). 적절. Deploy=N·Performance=N 도 타당(순수 로직·인증, 배포/성능 영향 경미). Security 활성화가 SEC-001 을 사전 차단한 핵심 — 선택 단계 판정이 결정적으로 유효했다.
- **개선 포인트**: 인증/계정 연동 spec 에서 Security 단계가 사후(6단계 후)에 실행되어 High 취약점이 늦게 발견됨. Planning 단계의 provider 검증수단 사전조사(PROC-014-01)로 Security 부담을 앞당길 수 있다.

---

## 5. 작업 기록 분석 (runs/)

- **필수 읽기 준수**: 각 Agent runs 및 pipeline-log 시작 절차 이벤트에 필수 읽기 문서가 구체적으로 기재됨(spec/plan/tasks/research/security-report/실코드). Security 재감사 회차마다 실 코드 파일을 직접 Read 로 대조(코드 근거 기반) — 사실 기반 원칙 준수.
- **constitution/context/infra 참조**: 각 단계가 적절히 참조. Docs 가 context/infra 직접 수정하지 않고 GAP-014-05/06 으로 Retrospective 위임한 경계 준수.
- **agentId 보존 (PROC-011)**: 4단계 Development spawn 마다 agentId(`DevAgent014@...`·`DevAgent014SEC@...`·`DevAgent014Naver@...`·`DevAgent014NaverExclude@...`)가 pipeline-log 단계 시작 이벤트에 즉시 기록됨. 세션 한도 2회 중단 후 SendMessage 재개가 이 보존 덕에 성공 — PROC-011 규율의 실효성이 본 차수에서 명확히 입증됨.
- **비효율 패턴**: Security 재감사 4회 반복은 비효율로 보일 수 있으나, 각 회차가 새로운 사실(Kakao 해소·path 3a 확정)을 코드로 확정한 정당한 진행이었다. 근본 비효율은 Planning 단계 사전조사 누락(OBS-014-01)이며 runs 자체의 비효율은 아니다.
- **일시 필드**: Planning·DatabaseDesign runs 일부에 `[시각 미확인]` 존재(§10 date 미획득). 기록 자체는 성실.

---

## 6. 전역 규칙·참조 문서·스킬 개선 검토

| 대상 문서 | 검토 결과 | 패치 |
|---|---|---|
| `~/.claude/agents/02-planning.md` | 클라이언트 토큰 OAuth 채택 시 provider별 앱바인딩 검증 수단 사전 조사 규율 부재 | PATCH-014-01 (SHOULD) |
| `~/.claude/agents/security.md` | 계정 해석 전 분기 경로 일괄 열거 체크 부재 | PATCH-014-02 (SHOULD) |
| `~/.claude/agents/03-design.md` | Flutter 위젯 테스트 harness(플랫폼 채널·secure storage·cwd) 전제 미고정 — PATCH-013-01 보강 | PROC-014-03 로 도출(process-patches) |
| `~/.claude/rules/on-demand/*.md` | typescript/flutter 신규 규칙 필요성 검토 — 014 의 [B] 정정 패턴(위젯 테스트 플랫폼 채널 override)은 Flutter 전용이나 본 프로젝트 on-demand 에 flutter.md 부재. 범용성은 Flutter 프로젝트 한정이므로 전역 즉시 등재는 보류, PROC-014-03(Design contract)로 우회 | 보류 |
| `constitution.md` | 변경 불요(보안 전용 조항 추가는 팀 합의 사안, 본 spec 범위 아님) | 없음 |
| `context.md`/`infra.md` | GAP-014-05/06/09·SEC-002 반영 필요 | PATCH-CXT-014-01~04 |

**전역 패치 적합성 2단계 검토**:
- PATCH-014-01 (02-planning): 범용성 O(모든 프로젝트의 클라이언트 토큰 OAuth 채택 시 공통) / 역할정합 O(Planning 이 기술 방식 검증 조사 소유). → 전역 등재 적합.
- PATCH-014-02 (security): 범용성 O(모든 인증/계정연동 감사에 공통) / 역할정합 O(Security 감사 절차). → 전역 등재 적합.
- Flutter 위젯 테스트 패턴: 범용성 X(Flutter 한정) → 전역 일반 문서 미등재, Design Test Authoring Contract(프로젝트 무관 절차 틀) 강화로 재배치(PROC-014-03).

**잔존 참조 grep 점검**: 본 회차 전역 문서 파일 이동·삭제 없음 → grep 점검 불요.

---

## 7. 우선 개선 항목

심각도 기준: Critical 전체 + High 상위 3개.

1. **[High] PATCH-014-01 / PROC-014-01 — 클라이언트 토큰 OAuth provider별 앱바인딩 검증 수단 사전 조사**: 본 차수 최대 재작업(Security 3회 복귀·세션 한도 2회)의 근본 원인. Planning/research 단계 게이트로 승격. 향후 유사 소셜 로그인 spec 재발 방지 효과 최대.
2. **[High] PATCH-014-02 / PROC-014-02 — 보안 감사 시 계정 해석 전 분기 경로 일괄 열거**: path 3a 지연 발견(재감사 2차 추가 복귀)의 원인. 인증 spec 에서 반복 가능성 높음.
3. **[High] PATCH-014-03 / PATCH-CXT-014-04 — spec.md naver 서술 정합화 (GAP-014-09)**: 구현이 naver 완전 제외로 축소되었으나 spec.md FR-001/NFR-004/SC-009/SC-013/SC-018/범위외 절이 여전히 naver 지원을 서술 — spec.md 가 SoT 로서 신뢰 불가 상태. main session/Spec Agent 갱신 결정 필요.
4. **[Medium] PATCH-CXT-014-03 — SEC-002 orphan user §6 등재**: 013 의 auth tx 부채 계열에 누적. 후속 spec 에서 runInTransaction 래핑 권고 추적.

---

## 8. memory 저장 후보 (사용자 검토 필요)

| ID | 후보 학습 (한 줄) | 적용 가능 범위 | 4기준 충족 근거 (a/b/c/d) | 제안 memory type |
|---|---|---|---|---|
| MEM-014-01 | 클라이언트가 소셜 provider access token 을 서버로 전달하는 OAuth 흐름 채택 시, provider별 "토큰이 우리 앱에 발급되었는지" 검증 수단(google aud·kakao app_id·token introspection) 존재 여부를 설계 단계에서 provider별로 확인하라. 검증 수단 없는 provider(예: naver 공개 API)는 서버 code-exchange(client_secret) 대안 또는 범위 제외를 결정해야 하며, 미검증 시 token substitution 계정 탈취에 노출된다. | 모든 프로젝트의 소셜 로그인/OAuth 통합 | a:범용(모든 소셜 로그인) / b:최우선(계정 탈취 직결·본 차수 3회 복귀·2회 세션한도 소모) / c:반복 관찰(SEC-001 이 자동연동→path 3a 2개 경로에서 반복 확정, kakao/google/naver 3 provider 대조) / d:글로벌 흡수 가능하나(PATCH-014-01 로 02-planning 등재) 판단 원칙 자체는 memory 로도 가치 — 단 PATCH-014-01 이 우선이면 memory 는 보류 가능 | feedback |

> 본 Agent 는 위 표만 작성한다. 실제 memory 파일 작성은 main session 이 사용자 승인 후 수행한다.
> 참고: MEM-014-01 은 기준 (d)에서 PATCH-014-01(02-planning.md 전역 등재)로 더 잘 해결될 수 있어, PATCH-014-01 적용 시 memory 등재는 중복이 될 수 있다. 사용자가 전역 패치만으로 충분하다고 판단하면 memory 등재는 생략 권고.
</content>
