---
작성: Retrospective Agent
버전: v1.0
최종 수정: 2026-07-04
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
- [작업 환경](#작업-환경)

---

## 1. gaps.md + agent-observations.md 기반 패치 도출

### 1a. gaps.md 역추적 (GAP-ID 별)

| GAP-ID | 유형 | 발견 단계 | 발생/근본 단계 | 사전 방지 가능 여부 | 도출 패치 |
|---|---|---|---|---|---|
| GAP-017-01 | 문서-갱신-필요 | 3단계 Design | (없음 — 신규 spec 이 기존 §6 제약을 부분 흡수) | 방지 대상 아님(정상 갱신 권고) | PATCH-CXT-003 (context.md §6) |
| GAP-017-02 | 문서-갱신-필요 | 6단계 Docs | (없음 — 신규 조회 계약이 §2 모듈 서술과 자연 격차) | 방지 대상 아님(정상 갱신 권고) | PATCH-CXT-001 (§2 5개 모듈) + PATCH-CXT-002 (§1 스냅샷) |
| GAP-017-03 | 성능-후속-권고 | 선택(Performance) | 3단계 Design(마이그레이션 범위 제외 확정) | 방지 아님 — P-007 스펙 범위 원칙에 따라 의도적 후속 위임 | 후속 spec 위임(비블로킹, PATCH 없음) |

**분석**: 3건 모두 **결함(부정합)이 아닌 정상적 갱신 권고 / 후속 위임**이다. Design·Docs·Performance Agent 가 각자 발견 시점에 gaps.md 에 코드 검증 근거(Read 라인 번호·EXPLAIN 실측)를 갖춰 등록했고, 처리 주체를 명시적으로 Retrospective / 후속 spec 으로 위임했다. GAP 무추적 소실 위험 없음. 누적 3건으로 경고 임계(5건) 미만.

- **GAP-017-01**: context.md §6 "cross-schema plain String 참조" 제약 행이 위시리스트·최근 본 상품 productId 고아 참조를 다룬다. 017 FR-012(ADR-007) 가 이 고아 참조를 응답 레벨 `productAvailable:false` 로 **부분 흡수**(스키마 제약 자체는 잔존)한다. §6 항목에 흡수 사실을 additive 보강 → PATCH-CXT-003.
- **GAP-017-02**: context.md §2 핵심 도메인 모듈 목록 admin/seller/product/inventory/user 5개 행 + §1 개요 스냅샷 테스트 카운트가 017 신규 조회 계약을 반영하지 못한다. Docs Agent 가 5개 모듈·9개 코드 위치를 Read 로 검증 완료 → PATCH-CXT-001(§2)·PATCH-CXT-002(§1) (본 Agent PROC-002 재검증 완료 — §7 근거).
- **GAP-017-03**: Product.sellerId·Seller.status 뒷받침 인덱스 부재로 cursor 쿼리가 Seq Scan+Sort. 현 규모(products 9·sellers 1) 무해, NFR-001 실측 P95 3~4ms PASS. P-007(신규 마이그레이션 범위 외) 준수로 이번 spec 미적용 → 후속 spec 위임(비블로킹).

### 1b. agent-observations.md 기반 패치 도출

`SPEC_ROOT/_ai-workspace/agent-observations.md` **미존재** — main session 이 파이프라인 실행 중 OBS trigger(a~e) 에 해당하는 사건을 기록하지 않았다. 실제로 017 파이프라인은 재작업 0회·서킷 브레이커 미발동·BLOCKED 0건으로 OBS trigger 조건이 성립하지 않았다(§2 참조). 따라서 1b 는 건너뛴다. 대신 gaps.md + pipeline-log.md + runs/ 3중 소스로 §2~6 분석을 수행했다.

---

## 2. 재작업 패턴 분석

### 재작업·서킷 브레이커 이력

| 항목 | 값 |
|---|---|
| 동일 단계 재작업(REWORK_NEEDED) | 0회 |
| 단계 복귀(BLOCKED) | 0회 |
| 서킷 브레이커 발동 | 없음 |
| 규약 위반 이벤트 | 1건 (환경 요인 — 세션 한도, 코드/로직 결함 아님) |
| 사용자 입력 대기 | 3회 (Spec 최종확인·SC-018 defer·STALE_SC 정정방식 — 모두 정상 의사결정 게이트) |

**세션 한도 중단(pipeline-log L152-163)**: PPG-1 두 Agent(Development·Test AUTHORING) 최초 spawn 이 API 세션 한도로 입력 읽기 단계에서 조기 종료. **산출물 0건(클린 상태)** 확인 후 STALE 처리 없이 PPG-1 전체 재spawn(agentId 만료 → 새 spawn fallback). 이는 orchestration §8.2 절차를 정확히 따른 **모범 복구 사례**다 — 부분 산출물 오염 없이 클린 재시작을 판정한 점이 우수하다. 재작업 카운팅 대상 아님(외부 환경 요인).

**정성 평가**: 017 은 재작업·복귀·서킷 브레이커가 전무한 매우 안정적인 파이프라인이었다. 근본 원인은 (1) Spec 단계에서 docs/backend-gaps.md 를 1차 입력으로 삼고 실코드 8개 파일을 재검증하여 [NEEDS CLARIFICATION] 0건으로 진입, (2) Design §F(PROC-001) 가 응답 계약 breaking change 호출측 테스트를 전수 식별하여 4단계·5a 정합 확보, (3) 기존 컨벤션(product.constants 20/100·assertOwner·getPublicSummaries) 승계로 신규 임의 결정 최소화에 있다.

### PROC-008 — 직전 N=3 차수 적용 패치 효과 측정 (PROC-015-02 필수 산출)

측정 대상: 직전 3개 차수(016·015·014) 적용 완료 패치 중 017 파이프라인에서 인용·적용 흔적이 있는 항목.

| 패치 | 의도 | 본 차수(017) 효과 | 효과 발휘 여부 |
|---|---|---|---|
| PROC-016-01 (03-verification §2-2) | 선행 spec 미커밋 시 DIFF base 혼재 caveat | 진입 시 main 이 미커밋 chore 3건 식별·커밋 권고(L10), Docs 가 DIFF-017 에 "base 혼재 주의" 절 + 무관 3건 제외 명시(L297·L309) | O |
| PROC-016-02 (agent-rules §10) | `date` 미가용 Agent 에 main spawn 시각 앵커 전달 | Planning 이 "spawn 기준 22:58 앵커 병기"(L69) 인용, Spec·Retrospective 도 `[spawn 기준]` 표기 적용 | O |
| PATCH-016-01 (05-test.md) | STALE_SC cross-version 후보 사전분류 | 5b 가 STALE_SC 27건에 "cross-version 후보 사전분류 PATCH-016-01 적용"(L253) 인용 | O |
| PROC-015-03 (agent-rules §10) | `[시각 미확인]` 시 직전 확정 이벤트 앵커 병기 | Spec·Planning·Retrospective 전건 앵커 병기 적용 | O |
| PROC-015-01 (agent-rules §0 PPG) | PPG COMPLETE 미보고 시 추정 3조건 | **미트리거** — 세션 한도 최초 spawn 은 산출물 0건이라 추정 대상 아님, 재spawn 후 양쪽 정식 COMPLETE 보고 → 추정 불요 | 측정 불가(미트리거) |
| PROC-002 (07-retrospective.md) | PATCH-CXT 코드 기반 사실 검증 | Docs 가 GAP-017-02 등록 시 9개 코드 위치 Read 검증(L309), 본 Retrospective 가 grep 재검증 완료 | O |
| PROC-001 (03-design.md) | Design §F 응답계약 breaking change 호출측 전수 식별 | Design 이 마이그레이션 5건+e2e 1건 전수 식별(L133), 4단계·5a 정합 재작업 0건 | O |
| PROC-014 (사후 운영 검증 시나리오) | spec 에 사후 운영 검증 시나리오 명시 | Spec 이 "사후 운영 검증 시나리오(PROC-014) 명시"(L42) | O |

**효과 미발휘(X) 사례**: 없음. 측정 가능한 전 항목이 효과 O. PROC-015-01 은 미트리거(측정 불가)이나 이는 시스템 결함이 아니라 정상 경로(클린 재시작으로 추정 불요)이므로 후속 안전망 OBS 등록 대상 아님(PROC-003 (2) 판단).

**PROC-014 사후 운영 검증 피드백 사이클 점검**: 017 은 옵션 A/B/C 결정 spec 이 아니라 Security+Performance 전건 통과한 full-pipeline spec 이다. (a) 파이프라인 종료 시점(본 회고)까지 사후 운영 결함 피드백 없음. (b) 해당 없음. (c) Spec.md 에 사후 운영 검증 시나리오가 합의 기재됨(L42) — 모니터링 계획 존재 확인. 사후 검증 무추적 소실 위험 없음.

---

## 3. 설계 워크플로우 준수 점검

| # | 항목 | 준수 여부 | 근거 |
|---|---|---|---|
| ① | CHANGES.md 확인 | O | Spec §7-①, Docs 가 016 이하 항목 불변 prepend(L309) |
| ② | constitution.md 확인 | O | Planning P-001~007 Gates 전건 채움(L75), Security·Performance 각 조항 이행 확인 |
| ③ | context.md 확인 | O | Spec·Planning·Design·Docs 필수 읽기, §2/§4/§6 대조 |
| ④ | infra.md 확인 | O | Docs 가 PATCH-A09 4트리거 해당 없음 확인 → 갱신 불요 판정(L309) |
| ⑤ | spec.md [NEEDS CLARIFICATION] 해소 | O | 0건 진입(L42), 사용자 결정 2건 확정 후 Planning 진입 |
| ⑥ | plan.md Constitution Gates 통과 | O | P-001~007 전건 PASS·예외 0(L88) |
| ⑦ | research.md 코드베이스 분석 포함 | O | Design D1 5개 모듈 실코드 대조·§F 호출측 식별(L107) |
| ⑧ | tasks.md 전제 조건 체크 | O | Development §7 체크 8항목 완료(L188) |

전 단계 워크플로우 준수. 단계 간 이동 원칙(미충족 시 다음 단계 금지) 위반 0건.

---

## 4. 구조 개선 필요성

- **Agent 간 역할 경계**: 모호 지점 없음. user→product 모듈 경계(DI, SC-021 정적검증)·Security↔Performance 의 "범위 밖 발견은 권고·비블로킹 위임" 패턴이 일관되게 승계됨(SEC-017-01·GAP-017-03 동일 처리).
- **누락 Agent**: 없음. Deploy N(코드만 변경)·DB Design N(신규 마이그레이션 없음) 판정 적절.
- **선택 단계 활성화 기준**: Security Y(NFR-002/003 인가)·Performance Y(NFR-001 수치) 활성화 근거가 plan.md 에 명시되어 적절. 캐스케이딩 블로킹 규칙(Security COMPLETE Medium 이하 → Performance 진행) 정확 적용.

구조적 개선 필요성 없음.

---

## 5. 작업 기록 분석 (_ai-workspace/runs/)

- **필수 읽기 이행**: run-001~007 전건이 §7 체크 8항목 + 입력 문서 목록을 기록. constitution.md/context.md/infra.md 참조가 각 단계에 적절히 반영됨.
- **Context 전달 충분성**: PPG-1 세션 한도 재spawn 시 tasks.md·research.md 무변경 유지 + 입력 재검증으로 컨텍스트 복원 성공. Agent 간 산출물 전달 충분.
- **비효율 반복 패턴**: 없음. 단, 아래 2건의 **기록 완전성 관찰** 발견:
  1. **runs/ 누락 — 5b Test EXECUTION·6단계 Docs Agent**: runs/ 디렉토리에 run-005(5a AUTHORING)·run-006(Security)·run-007(Performance)은 존재하나 **5b Test EXECUTION 과 Docs Agent(6단계)의 runs/ 실행 기록 파일이 없다**. 두 단계 모두 pipeline-log.md 절차 이벤트와 stage 산출물(coverage.md·test-report.md·CHANGES.md·DIFF-017)은 정상 생성했으나, `agent-rules.md §4.2 [MUST] runs/ 실행 기록 작성` 을 이행하지 않았다. 데이터 무결성 영향은 제한적(다른 소스로 컨텍스트 복원 가능)이나 §4.2 MUST 미이행 — PROC-017-01 안전망 도출.
  2. **시각 기재 혼재**: `date` 미가용 Agent(Spec·Planning·Retrospective)는 `[시각 미확인, spawn 기준]` 앵커, 가용 Agent(Design·Test·Docs·Security·Performance)는 실제 시각을 기재. PROC-016-02/PROC-015-03 적용으로 앵커 병기가 이루어져 시간순 판독성은 확보됨(개선 불요, 정상 동작).

---

## 6. 전역 규칙·참조 문서·스킬 개선 검토

- **`~/.claude/rules/`·`docs/`·`skills/`**: 017 파이프라인에서 규칙 누락·모호성으로 인한 재작업 0건. 신규 전역 규칙 패치 필요성은 낮음.
- **`~/.claude/agents/05-test.md` (STALE_SC 재발)**: 016·017 **2회 연속**으로 §F 마이그레이션 테스트 파일이 선행 spec SC 를 비정형 형식(`(002-catalog 계승)` 등)으로 인용 → 5b 에서 STALE_SC 대량 발견(017: 27건) → 사용자 옵션 A 일괄 정정으로 매 차수 churn 발생. 이는 5a AUTHORING(또는 4단계 Development)이 처음부터 PATCH-A18 정규식(`(vX.Y.Z/NNN spec)`)에 부합하는 형식으로 인용하면 선제 차단 가능하다. 반복 검증(2회) 충족 → **PATCH-017-01** 도출(대상: 05-test.md AUTHORING).
- **잔존 참조 grep 점검**: 본 차수 전역 문서 파일 이동·삭제 이력 없음 → grep 점검 대상 없음.
- **constitution.md 변경 필요성**: 없음. P-007(스펙 범위 원칙)이 GAP-017-03·SEC-017-01 을 후속 위임으로 정확히 유도했다 — 조항이 의도대로 작동.

---

## 7. 우선 개선 항목

심각도 기준: Critical 전체 + High 상위 3개. 017 은 Critical 0건.

| 우선순위 | 항목 | 심각도 | 대상 | 패치 |
|---|---|---|---|---|
| 1 | context.md §2 5개 모듈 행 + §1 테스트 카운트 갱신(현행화) | High | 프로젝트 문서 | PATCH-CXT-001·002 |
| 2 | STALE_SC 선제 정규식 인용(016·017 2회 반복 churn 차단) | High | `~/.claude/agents/05-test.md` | PATCH-017-01 |
| 3 | runs/ 누락(5b·Docs) 안전망 — §4.2 MUST 이행 강제 | Medium | 프로세스(main session 검증) | PROC-017-01 |
| 4 | context.md §6 고아 참조 부분 완화 반영 | Medium | 프로젝트 문서 | PATCH-CXT-003 |
| 5 | SEC-017-01 (limit/cursor DTO 미검증) §6 additive 등재 | Low(비블로킹) | 프로젝트 문서 | PATCH-CXT-004 |
| 6 | GAP-017-03 cursor 인덱스 부재 후속 spec 위임 | Low(비블로킹) | 후속 spec | (별도 spec) |

> 전 항목 비블로킹. context.md 갱신(1·4·5)은 main session 이 사용자 승인 후 적용. PATCH-017-01(2)은 전역 Agent 정의 패치로 §12 절차 준수. runs/ 안전망(3)은 프로세스 개선.

---

## 8. memory 저장 후보 (사용자 검토 필요)

**없음.**

핵심 원칙 §8 의 4개 기준(범용성·최우선 중요도·반복 검증·글로벌 흡수 불가능)을 **모두** 충족하는 항목이 없다.

- STALE_SC 선제 정규식(2회 반복·범용) → 기준 (d) 위배: 전역 Agent 정의 패치(PATCH-017-01)로 더 잘 해결됨. memory 아님.
- runs/ 누락 안전망 → 기준 (c) 반복 검증 미충족(017 1회 관찰) + (d) 프로세스 패치로 흡수. memory 아님.
- SEC-017-01 / GAP-017 계열 → 프로젝트 특정 사실(범용성 위배, 기준 a) — context.md 갱신이 적합. memory 아님.

> 본 Agent 는 memory 파일을 직접 작성하지 않는다. 후보 0건이므로 main session 저장 조치 불요.

---

## 작업 환경

effective PROJECT_ROOT(`/Users/krystal/workspace/doa/doa-next`) 1단계 깊이 점검 결과 `*.stackdump` 0건·root-level `core.*` 0건. (`core.*` 재귀 매칭은 전부 `node_modules/` 내부 라이브러리 파일로 OS crash dump 아님 — 정리 대상 아님.) 정리 필요 잔여 파일 없음.
</content>
