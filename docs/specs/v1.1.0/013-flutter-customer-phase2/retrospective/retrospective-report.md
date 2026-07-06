---
작성: Retrospective Agent
버전: v1.0
최종 수정: 2026-07-01 [시각 미확인]
상태: 확정
---

# 회고 분석 리포트

> 대상: v1.1.0/013-flutter-customer-phase2 | baseCommit: 1798c73
> Bash 미제공 → 시각 `[시각 미확인]` (agent-rules §10).

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

| GAP-ID | 발견 단계 | 발생(누락) 단계 | 사전 방지 질문 | 귀속 처리 |
|---|---|---|---|---|
| GAP-013-01 (Spec 코드분석 stale) | 2단계 Planning | 1단계 Spec | "spec 코드현황 서술은 실파일 read 로 검증되었는가?" | OBS-013-02 → PATCH-013-02 (01-spec.md) |
| GAP-013-02 (user enumeration trade-off) | 2단계 Planning | 1단계 Spec(요구 자체가 보안 표면) | "SC-016/022/023 는 enumeration 완화 설계를 동반하는가?" | Security 위임 정상 작동 → GAP-013-09 심화 |
| GAP-013-03 (infra.md 갱신) | 3단계 Design | — (additive) | — | PATCH-CXT-013-01 (context-infra-updates.md) |
| GAP-013-04 (context.md 갱신) | 3단계 Design | — (additive) | — | PATCH-CXT-013-02 (context-infra-updates.md) |
| GAP-013-05 (SC-017 tx.refreshToken undefined) | 5b EXECUTION(e2e) | 4단계 Development | "비트랜잭션 경로가 단위 mock 뒤에서 실행되는데 실경로 검증이 있는가?" | 해결됨 → PROC-013-01 (mock 결함 은폐 사전 차단) |
| GAP-013-06 (SC-010 FAQ 정적항목 0) | 5b EXECUTION | 4/5a PPG-1 | "화면 상태주입 방식이 contract 로 고정됐는가?" | OBS-013-01 → PATCH-013-01 |
| GAP-013-07 (SC-011 공지 정적항목 0) | 5b EXECUTION | 4/5a PPG-1 | 동상 | OBS-013-01 → PATCH-013-01 |
| GAP-013-08 (SEC-001 High) | Security | 1~4단계(reset-password rate limit 부재) | "NFR-003 rate limit 이 OTP 발급뿐 아니라 검증에도 적용되는가?" | Security 위임 정상 → 해결됨 |
| GAP-013-09 (SEC-002 Medium) | Security | — (spec 요구 수용 trade-off) | — | PROC-013-03 / PATCH-CXT-013-03 (§6 보안부채) |
| GAP-013-10 (SEC-003 Medium revoke 원자성) | Security | 4단계 Development | "revoke 를 markOtpConsumed 트랜잭션 내로 통합했는가?" | PROC-013-03 / PATCH-CXT-013-03 |
| GAP-013-11 (SEC-004 Medium 보안 로깅) | Security | 4단계 Development | "OTP 실패·enumeration·429 이벤트에 감사 로그가 있는가?" | PROC-013-03 / PATCH-CXT-013-03 |

**선행 spec 연속성 (선행 spec 영향 추적 자가 점검, PROC-013)**: 본 spec.md 는 "선행 spec 영향 추적" 절을 보유하며 009-flutter-customer-app 이월 항목 4종을 명시 등록했다. 본 차수 결함(GAP-013-05/06/07 구현 결함)은 009 미해결 항목이 아니라 013 신규 구현에서 발생 → 선행 차수 식별 누락 사례 아님. GAP-013-08(SEC-001)은 013 신규 엔드포인트(reset-password)의 신규 취약점으로 선행 spec 승계 아님. 선행 식별 누락 원인 없음 → PROC 신규 등록 불요.

### 1b. OBS-XXX 기반 PATCH

| OBS-ID | trigger | 관찰 요지 | 도출 PATCH |
|---|---|---|---|
| OBS-013-01 | §12(a) 동일단계 2회 REWORK | PPG-1 에서 Development 는 FAQ/공지를 provider(FutureProvider) 방식으로, Test 는 정적 텍스트 전제로 작업 → 5b 가 "provider 제거·정적 검증" 지시 → ConsumerWidget 유지로 ProviderScope 누락 재실패 → 2회차 ProviderScope 재추가 수렴 | PATCH-013-01 (03-design.md Test Authoring Contract 에 화면별 상태주입 방식·렌더 전제 canonical 명시) + PROC-013-02 (5b 재작업 지시 정확성) |
| OBS-013-02 | §12(e) 사후 검증 식별 | Spec run-001 코드분석이 "CategoryScreen 하드코딩·GET /categories 미호출" 로 기재했으나 실제는 이미 categoriesProvider 로 API 연동 완료. 선행 009 기술 승계로 미검증 서술 전파 | PATCH-013-02 (01-spec.md 코드현황 preliminary 표기 + 실파일 최소 read 검증) |

---

## 2. 재작업 패턴 분석

### 재작업 타임라인

| 라운드 | 단계 | FAIL 내역 | 복귀 대상 | 결과 |
|---|---|---|---|---|
| 1차 5b | EXECUTION | [A] 구현 3(SC-017·010·011) + [B] 테스트 5(SC-003·008·010/011·012·019) | Dev + Test AUTHORING (PPG-1 부분) | 재작업 1회차 지시 |
| 재검증 1차 | EXECUTION | [B] 4(SC-008·010·011·017) 잔존 | Test AUTHORING 단독 2회차 | Dev·STALE_SC 정상 유지 |
| 재검증 2차 | EXECUTION | 0 | — | 63/63 PASS 수렴 |
| Security | 선택 | SEC-001 High BLOCKED | Development 복귀 | reset-password 브루트포스 차단 |
| SEC 후 5b | EXECUTION | 0 | — | 65/65 PASS |
| Security 재감사 | 선택 | 0 (SEC-001 RESOLVED) | — | COMPLETE |

- **재작업 최다 단계**: 5a Test AUTHORING (2회차). PPG-1 재작업 총 2회차로 수렴, **서킷 브레이커(3회 초과) 미발동**.
- **반복 원인**: SC-010/011 의 화면 상태주입 방식(provider vs 정적) 발산(OBS-013-01) 이 2라운드 churn 을 유발. Design tasks.md 의 Test Authoring Contract 가 faq/notice 화면 렌더 전제(ProviderScope 필요 여부)를 canonical 로 고정하지 않아 Development(C)·Test(D) 가 독립적으로 다른 전제를 채택.
- **구현 결함의 mock 은폐**: GAP-013-05(SC-017)는 `auth.repository.ts` 비트랜잭션 경로에서 `this.prisma.tx.refreshToken` 가 `undefined`(TypeError/500)였으나, 단위 테스트가 해당 메서드를 mock 대체하여 은폐 → e2e(실경로)에서만 검출. 단위 GREEN 이 실경로 무결성을 보장하지 못한 사례.

### PROC-008 직전 N=3 차수 적용 완료 패치 효과 측정 (PROC-003 표준 형식)

> 측정 대상: v1.1.0 retrospective 폴더 존재 차수 = 012 뿐(010/011 은 역공학 문서 세트로 retrospective 부재 → N=3 대상에서 자동 제외).

| 패치 | 의도 | 본 차수 효과 | 효과 발휘 여부 |
|---|---|---|---|
| 012 PATCH-001 (05-test.md EXECUTION coverage SC 원문 대조 가드) | coverage.md 각 SC 행 수용기준=spec 원문 복사·검증파일=실재 파일만 | coverage.md v1.4 머리말에 "PATCH-001 준수: 수용 기준 열은 spec.md SC 원문 복사. 검증 파일은 실재 파일만 기재" 명시 + SC-001~026 원문 복사 + 14개 실재 검증 파일만 기재. 오기재 0건 | O |
| 012 PATCH-002 (02-planning.md 미검증 외부 enum/상수 [TO-VERIFY] 마커) | plan 코드예시의 미검증 외부값을 확정 리터럴로 박제 금지 | 본 차수 외부 enum 인용 케이스 제한적(nodemailer CommonJS import 형태를 tasks.md 에 명시 고정). plan 미검증 리터럴 오기재 0건 | O (측정 범위 내) |

효과 미발휘(X) 사례 없음 → 안전망 OBS 신규 등록 불요.

### PROC-014 사후 운영 검증 피드백 사이클 점검

- (a) 본 파이프라인 종료 시점 사후 운영 결함 피드백: 미발생(파이프라인 종료 직후).
- (b) 해당 없음.
- (c) spec.md §범위 외에 "사후 운영 검증 피드백 사이클" 4개 시나리오(실 이메일 발송·OTP 만료·전화번호 이메일찾기·알림 재시작 유지) + 피드백 처리 절차(결함 → spec.md 입력 → spec 수정 이벤트) **합의 기재됨**. 옵션 C defer 된 SC-025(P95)·SC-001 실통합·실 이메일 발송이 사후 검증 대상으로 명시됨. → PROC-014 (c) 충족. 양호.

---

## 3. 설계 워크플로우 준수 점검

| 항목 | 준수 | 근거 |
|---|---|---|
| ① CHANGES.md 확인 | O | tasks.md 전제조건 — 009 이월 항목 확인 |
| ② constitution.md 확인 | O | plan Constitution Gates P-001~P-007 전체 통과(예외 0) |
| ③ context.md 확인 | O | Planning §2/§6 읽음, GAP-013-04 로 갱신 필요 식별 |
| ④ infra.md 확인 | O | Planning 읽음, GAP-013-03 로 SMTP 갱신 필요 식별 |
| ⑤ [NEEDS CLARIFICATION] 해소 | O | 0건 확정 |
| ⑥ Constitution Gates 통과 | O | P-001~07 [x], tasks.md 진입 전 확인 |
| ⑦ research.md 코드분석 | △ | Design research 정상, 단 1단계 Spec 코드분석 stale(GAP-013-01) — Planning/Design 이 실코드 대조로 정정 |
| ⑧ tasks.md 전제조건 체크 | O | 전제조건 3항목 [x] |

⑦ 의 △ 는 OBS-013-02/PATCH-013-02 로 처리.

---

## 4. 구조 개선 필요성

- **Agent 역할 경계 모호**: PPG-1 Development(C 레이어)·Test AUTHORING(D 레이어) 가 동일 Flutter 화면의 구현 방식에 대해 공통 contract 없이 독립 전제로 작업(OBS-013-01). Design 의 Test Authoring Contract 가 production 심볼 시그니처는 고정하나 **화면 상태주입 방식·렌더 전제**는 고정하지 않음 → PATCH-013-01 로 보강.
- **누락 Agent 필요성**: 없음. Security Agent 활성화가 SEC-001 High 를 정확히 포착 → 선택 단계 활성화 판단 정확.
- **선택 단계 활성화 적절성**: Security Y(민감데이터 다수·NFR 보안요구 명시) 적절. Deploy N(nodemailer 신규지만 e2e-docker SC 부재·Dockerfile 무변경) 적절. DB Design N(단일 단순 테이블) 적절. Performance N(NFR-001 관대한 budget·운영 모니터링 위임) 적절. 암묵 연관 활성화 금지 원칙 준수.

---

## 5. 작업 기록 분석 (runs/ 001~016)

- 각 Agent 필수 읽기 문서 정상 독해(runs/ + pipeline-log 시작 절차 이벤트 확인). constitution·context·infra 참조 정상.
- §6.2 재호출 단축이 재작업 라운드(Dev R1·Test R1/R2·Exec R1/R2)·Security 복귀 경로에서 정상 적용.
- Agent 간 Context 전달 충분: 5b test-report.md 가 [A]/[B] 분류로 복귀 대상을 명확히 구분(Dev 구현오류 vs Test 테스트오류).
- **비효율 반복**: PPG-1 SC-010/011 2라운드 churn(OBS-013-01) — 유일한 반복 비효율, 패치 도출로 대응.

---

## 6. 전역 규칙·참조 문서·스킬 개선 검토

| 대상 | 개선 | 적합성 2단계 검토 |
|---|---|---|
| `~/.claude/agents/03-design.md` | Test Authoring Contract 에 Flutter/UI 화면별 상태주입 방식(provider/정적)·렌더 전제(ProviderScope 등 test harness 요건) canonical 명시 | 범용 O(모든 PPG-1 이 Dev/Test contract 공유), 역할정합 O(tasks.md Test Authoring Contract 는 Design 소유) → PATCH-013-01 |
| `~/.claude/agents/01-spec.md` | spec 코드현황 서술을 preliminary 표기 + 참조 실파일 최소 read 검증 | 범용 O, 역할정합 O(spec.md 는 Spec Agent 소유) → PATCH-013-02 |
| process (Design/Test) | 트랜잭션 분기(tx vs root) 실경로가 단위 mock 뒤에 은폐될 때 e2e/실경로 검증 강제 | 프로세스 흐름 개선 → PROC-013-01 |
| `constitution.md` | 변경 불요 |
| `context.md` | §2 auth 역할·§4 password_reset_otps·§6 보안부채(SEC-002/003/004) additive | PATCH-CXT-013-02/03 |
| `infra.md` | §3 마이그레이션·§7 SMTP 체크리스트·§8 SMTP 제약·OTP 임계값 additive | PATCH-CXT-013-01 |

- **PROC-R02 이력섹션 점검**: context.md 에 "스펙 버저닝 이력" 성 레거시 표 부재(§7 갱신 이력은 정상 템플릿 섹션). GAP-013-04 갱신 대상은 §2/§4/§6 실상태 섹션으로 이력섹션 행 추가 아님 → PROC-R02 위반 없음.
- **잔존 참조 grep**: 본 차수 전역 문서 파일 이동·삭제 없음 → grep 점검 불요.

---

## 7. 우선 개선 항목

> 심각도 기준: Critical 전체 + High 상위 3개.

| 우선순위 | 항목 | 심각도 | 처리 |
|---|---|---|---|
| 1 | Medium 보안 부채 3종(SEC-002 IP rate limit·SEC-003 revoke 원자성·SEC-004 보안 로깅) 후속 트래킹 | High | PROC-013-03 + PATCH-CXT-013-03(context §6) — 별도 patch spec 또는 014 포함 |
| 2 | PPG-1 Dev/Test 화면 상태주입 방식 발산 방지 | High | PATCH-013-01 (03-design.md) |
| 3 | 단위 mock 뒤 실경로 결함 은폐(트랜잭션 분기) 사전 차단 | High | PROC-013-01 |
| 4 | Spec 코드현황 staleness | Medium | PATCH-013-02 (01-spec.md) |
| 5 | context/infra 문서 갱신(additive) | Medium | PATCH-CXT-013-01/02 |

---

## 8. memory 저장 후보 (사용자 검토 필요)

**없음.**

검토한 후보와 배제 사유(핵심 원칙 §8 4기준):

| 검토 후보 | 배제 사유 |
|---|---|
| 단위 mock 이 트랜잭션 분기 실경로 결함 은폐(GAP-013-05) | (c) 반복 검증 미충족(본 spec 1회 관찰) + (d) 글로벌 흡수 가능(PROC-013-01 프로세스 패치로 해결) |
| PPG-1 Dev/Test contract 발산(OBS-013-01) | (d) 글로벌 흡수 가능(03-design.md PATCH-013-01 로 해결) — memory 불요 |
| Spec 코드분석 staleness(OBS-013-02) | (d) 글로벌 흡수 가능(01-spec.md PATCH-013-02) |

> 본 Agent 는 위 표만 작성한다. 실제 memory 파일 작성은 main session 이 사용자 승인 후 수행한다.
