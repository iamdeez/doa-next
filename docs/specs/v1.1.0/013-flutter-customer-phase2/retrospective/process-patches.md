---
작성: Retrospective Agent
버전: v1.0
최종 수정: 2026-07-01 [시각 미확인]
상태: 적용 완료 (2026-07-01, 전역→docs-change-logs/2026-07-01-001.md · 프로젝트→.claude/docs-change-logs/2026-07-01-001.md)
---

# Process Patches: 013-flutter-customer-phase2

## 목차

- [PROC-013-01 — 트랜잭션 분기 실경로 단위 mock 은폐 사전 차단](#proc-013-01)
- [PROC-013-02 — 5b 재작업 지시의 구현 방식 변경 정확성](#proc-013-02)
- [PROC-013-03 — Medium 보안 부채 후속 트래킹 절차](#proc-013-03)

---

## PROC-013-01

- **현재 프로세스**: 4단계 Development 는 단위 테스트 GREEN 을 구현 완료 기준으로 보고하고, 5b 가 e2e 로 실경로를 검증한다. 트랜잭션 인지 코드(`this.prisma.tx.X` vs `this.prisma.X`)의 분기 경로가 단위 테스트에서 mock 대체될 경우, 실제 비트랜잭션 호출 경로의 결함이 단위 단계에서 은폐된다.
- **문제점**: GAP-013-05 — `auth.repository.ts` `revokeAllRefreshTokensByUser` 가 `this.prisma.tx.refreshToken.updateMany` 를 사용, `runInTransaction` 외부에서 호출되면 `tx.refreshToken` 이 `undefined`(TypeError → HTTP 500). 단위 테스트가 해당 메서드를 mock 대체하여 결함을 은폐 → e2e(SC-017)에서만 검출되어 재작업 라운드 소비.
- **개선 방향**: (1) Design tasks.md 의 Test Authoring Contract 에 "트랜잭션 인지 메서드(`tx` 접근)를 비트랜잭션 경로에서 호출하는 심볼"을 표기하고, 해당 심볼은 단위 mock 뿐 아니라 e2e 실경로 검증을 필수로 매핑. (2) Development 자가 점검에 "`this.prisma.tx.X` 접근이 `runInTransaction` 콜백 내부에서만 실행되는가?"를 추가(ALS tx-aware 확장 관련 프로젝트 공통 함정).
- **영향 범위**: `~/.claude/agents/03-design.md`(Test Authoring Contract 매핑)·`~/.claude/agents/04-development.md`(자가 점검) · ALS 트랜잭션 확장을 쓰는 본 프로젝트 auth/order/settlement 등 tx 참여 모듈.

---

## PROC-013-02

- **현재 프로세스**: 5b EXECUTION 은 FAIL 을 [A] 구현오류 / [B] 테스트오류로 분류하고 복귀 대상별 수정 지시를 test-report.md 에 기재한다.
- **문제점**: OBS-013-01 — 1차 5b 리포트가 SC-010/011 을 [B] 테스트오류로 분류하며 Test 에게 "provider 제거·정적 텍스트 검증"을 지시했으나, production 화면이 `ConsumerWidget`(provider 경유)로 이미 구현된 상태를 반영하지 못해 Test 가 정정 시 `ProviderScope` 누락으로 재실패. 재작업 지시가 production 위젯 타입 전제와 불일치.
- **개선 방향**: 5b 가 Flutter/UI 위젯 테스트 실패를 [B] 로 분류하고 test harness 변경(provider 유무·wrapping)을 지시할 때, 대상 화면의 **실제 위젯 타입(ConsumerWidget/StatelessWidget)** 을 production 소스에서 확인한 후 지시하도록 강제(예: "정적 검증으로 전환" 지시 전 화면이 provider 를 watch 하는지 확인). 지시가 production 구현 방식과 충돌하면 [B] 단독이 아니라 [A]+[B] 로 재분류.
- **영향 범위**: `~/.claude/agents/05-test.md`(EXECUTION 모드 test-report 작성·FAIL 분류 절차). PATCH-013-01(Design contract 고정)과 상호 보완 — Design 이 사전 고정하면 5b 오분류 확률 감소.

---

## PROC-013-03

- **현재 프로세스**: Security Agent 가 Medium/Low 취약점을 gate: PASS 하 Retrospective 위임으로 처리하고, Retrospective 가 patches 로 도출한다. 위임된 Medium 항목의 후속 실행(별도 patch spec 신설 여부)을 추적하는 표준 경로가 없다.
- **문제점**: GAP-013-09/10/11(SEC-002 IP rate limit·SEC-003 revoke 원자성·SEC-004 보안 로깅) 3종 Medium 이 "별도 patch spec 또는 014 포함" 으로 위임되었으나, 이를 잊으면 미해결 보안 부채가 무추적으로 소실될 수 있다. 프로젝트 특정 사안이라 전역 규칙이 아닌 프로젝트 문서(context.md §6)에 등재해야 다음 spec 설계자가 인지 가능.
- **개선 방향**: Security Agent 가 Retrospective 위임하는 Medium 이상 미해결 취약점은 (1) Retrospective 가 context.md §6 알려진 제약(기술 부채)에 additive 등재(PATCH-CXT-013-03) → 다음 spec 설계 워크플로우 ③에서 노출, (2) 후속 처리(별도 patch spec 신설/기존 spec 편입) 결정은 main session·사용자에게 위임. 본 절차를 Security Agent 정의(위임 시 §6 등재 권고)와 Retrospective 정의에 명시.
- **영향 범위**: `~/.claude/agents/security.md`(Medium 위임 시 §6 등재 권고)·`~/.claude/agents/07-retrospective.md`(위임 취약점 §6 등재)·`context.md §6`.
