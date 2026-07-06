---
작성: Retrospective Agent
버전: v1.0
최종 수정: 2026-07-01 [시각 미확인]
상태: 적용 완료 (2026-07-01, 전역→docs-change-logs/2026-07-01-001.md · 프로젝트→.claude/docs-change-logs/2026-07-01-001.md)
---

# Agent Patches: 013-flutter-customer-phase2

> 적용 주체 = main session (사용자 승인 후). 본 Agent 는 제안만 한다.
> context.md / infra.md 갱신 패치(PATCH-CXT)는 `context-infra-updates.md` 에 분리 기재.

## 목차

- [PATCH-013-01 — 03-design.md Test Authoring Contract 화면 상태주입 방식 canonical](#patch-013-01)
- [PATCH-013-02 — 01-spec.md 코드현황 서술 preliminary 표기·실파일 검증](#patch-013-02)

---

## PATCH-013-01

**대상 파일**: `~/.claude/agents/03-design.md` (Design Agent)
**대상 섹션**: tasks.md — Test Authoring Contract (production 심볼 canonical)
**적합성**: 범용 O (모든 PPG-1 에서 Development(C)·Test AUTHORING(D) 가 Design 의 공통 contract 를 공유) / 역할정합 O (tasks.md Test Authoring Contract 는 Design Agent 단일 소유 산출물)

- **현재 내용** (agent-observations.md OBS-013-01 발췌 기반): Test Authoring Contract 는 production 심볼의 **시그니처·클래스명·DI 토큰**을 canonical 로 고정하나, UI 화면(특히 Flutter 위젯)의 **상태 주입 방식(provider 경유 / 정적 위젯)** 과 **테스트 렌더 전제(ProviderScope 등 test harness 요건)** 를 고정하지 않는다.
- **관찰(OBS-013-01)**: FAQ/공지 화면을 Development(C 레이어)는 provider(FutureProvider) 방식으로 구현했으나, Test AUTHORING(D 레이어)은 정적 텍스트 전제로 작성. 5b 1차 리포트가 "provider 제거·정적 검증"으로 지시 → Test 가 정정하자 화면이 `ConsumerWidget` 이라 `ProviderScope` 누락으로 재실패 → 2회차에서 `ProviderScope` 재추가로 수렴. Development·Test 가 동일 화면에 서로 다른 전제로 작업하여 SC-010/011 이 2라운드 churn.
- **추정 원인**: tasks.md 가 faq/notice 화면의 구현 방식(provider 경유 여부·위젯 타입)을 A·B·C·D contract 에 명시적으로 고정하지 않아 Development 와 Test 가 독립적으로 다른 방식을 가정.
- **변경 내용** (03-design.md Test Authoring Contract 작성 절차에 항목 신설):
  1. UI 화면(위젯/컴포넌트)을 다루는 태스크는 Test Authoring Contract 의 화면 클래스 canonical 항목에 **(a) 상태 주입 방식**(예: `provider 경유(FutureProvider/ConsumerWidget)` vs `정적 위젯(StatelessWidget)`)과 **(b) 테스트 렌더 전제**(예: `ProviderScope 래핑 필요` / `pumpAndSettle 필요` / 불요)를 한 줄로 명시한다.
  2. 동일 화면에 대해 Development(C)가 채택할 위젯 타입과 Test(D)가 작성할 test harness 전제가 **동일 canonical 을 참조**하도록 한다(양측 독립 가정 금지).
  3. 상태 주입 방식이 미확정이면 tasks.md 에 `[NEEDS CLARIFICATION]` 대신 Design 이 기본 방식을 canonical 로 확정한다(PPG-1 병렬 spawn 전 고정 — 병렬 중 상호 조회 불가).
- **변경 근거**: OBS-013-01 (트리거 §12(a) — 동일 단계 2회 이상 REWORK). PPG-1 병렬 특성상 Dev·Test 가 실행 중 상호 참조 불가하므로 contract 사전 고정이 유일한 발산 차단 수단.
- **강제도 권고**: SHOULD (UI 태스크 포함 spec 에 한정).

---

## PATCH-013-02

**대상 파일**: `~/.claude/agents/01-spec.md` (Spec Agent)
**대상 섹션**: spec 작성 — 배경/코드 현황 서술 규율
**적합성**: 범용 O (기존 코드베이스가 있는 모든 프로젝트의 Spec 단계가 코드 현황을 서술) / 역할정합 O (spec.md 는 Spec Agent 단일 소유)

- **현재 내용** (agent-observations.md OBS-013-02 발췌 기반): Spec Agent 는 배경·이월 항목 서술 시 코드 현황을 기재하되, 그 서술이 실파일 read 로 검증된 사실인지 / 선행 spec 기술을 승계한 미검증 추정인지 구분하지 않는다.
- **관찰(OBS-013-02)**: Spec run-001 코드분석이 "CategoryScreen 하드코딩 10개·GET /categories 미호출"로 기재했으나, 실제 `mobile/customer_app/lib/features/category/category_screen.dart` 는 이미 `categoriesProvider` 로 API 연동 완료 상태였다. Planning/Design 이 실코드 대조로 정정(FR-001/SC-002 사실상 충족, 신규 작업은 재시도 버튼만). 선행 009 기술을 그대로 승계하여 미검증 서술이 후속 단계로 전파됨.
- **추정 원인**: Spec 단계 코드분석이 실파일 read 없이 선행 spec 기술을 승계. spec 산출물의 코드 현황 서술이 미검증 상태로 후속 단계에 전파(다행히 Planning 이 정정하여 무해했으나 범위 오판 위험 상존).
- **변경 내용** (01-spec.md 에 규율 신설):
  1. spec.md 의 배경·이월 항목에 코드 **현황**(예: "하드코딩 상태", "미구현", "미호출")을 단정 서술할 때는 참조 실파일을 **최소 1회 read 로 확인**하거나, 확인하지 못한 경우 `[코드현황 예비 — Planning/Design 실검증 위임]` 마커를 붙인다.
  2. 선행 spec 의 "범위 외/이월" 기술을 승계할 때, 승계 사실을 그대로 현재 코드 상태로 단정하지 않는다(선행 spec 이후 후속 차수에서 이미 구현되었을 수 있음).
- **변경 근거**: OBS-013-02 (트리거 §12(e) — 사후 검증 식별) + GAP-013-01. Spec 단계 미검증 서술이 범위 산정 오류로 이어질 수 있으므로 예비 표기 또는 최소 검증으로 사전 차단.
- **강제도 권고**: SHOULD.
