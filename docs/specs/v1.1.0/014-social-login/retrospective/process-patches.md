---
작성: Retrospective Agent
버전: v1.0
최종 수정: 2026-07-02 [시각 미확인]
상태: 적용 완료 (2026-07-02, 전역→~/.claude/docs-change-logs/2026-07-02-001.md · 프로젝트→.claude/docs-change-logs/2026-07-02-001.md · spec.md 정합화 완료 · memory naver-social-login-excluded 등재)
---

# Process Patches: 014-social-login

## 목차

- [PROC-014-01 — 클라이언트 토큰 OAuth 채택 시 provider별 검증수단 사전조사 게이트](#proc-014-01)
- [PROC-014-02 — 보안 계정연동 감사 전 계정해석 분기 경로 일괄 분석](#proc-014-02)
- [PROC-014-03 — Flutter 위젯 테스트 harness 전제(플랫폼 채널·secure storage·cwd) contract 고정](#proc-014-03)

---

## PROC-014-01

- **현재 프로세스**: Spec 이 인증 방식(클라이언트 토큰 전달)을 사용자와 확정하고, Planning 이 ADR 로 기술 번역한다. provider별 토큰 검증 가능성은 Design research `[TO-VERIFY]` 로 위임되어, 검증 수단 부재 provider 의 근본 제약이 Security 단계까지 지연 표면화된다.
- **문제점**: OBS-014-01 — 클라이언트 토큰 흐름에서 naver 는 앱바인딩 검증 공개 API 가 부재하여 token substitution 계정 탈취(SEC-001)에 근본적으로 취약. 이 사실이 Security 단계(6단계 후)에서야 확정되어 Development 3회 복귀·세션 한도 2회 소모 후 naver 완전 제외로 종결. Planning 단계에서 조사했다면 처음부터 naver 를 서버 code-exchange 또는 범위 제외로 설계 가능.
- **개선 방향**: (1) Planning(02-planning.md)에 "클라이언트 토큰 검증형 OAuth 채택 시 provider별 앱바인딩 검증 수단 표를 plan 에 명시, 부재 provider 는 code-exchange 대안 또는 범위 제외를 spec/plan 에서 결정"(PATCH-014-01). (2) 이 조사를 Constitution Gates 통과 전제로 승격 — 검증 수단 미조사 상태로 tasks.md 진입 금지.
- **영향 범위**: `~/.claude/agents/02-planning.md`(ADR·Gates) · `~/.claude/agents/03-design.md`(research `[TO-VERIFY]` 를 검증수단 조사로 구체화) · 클라이언트 토큰 전달형 소셜 로그인/OAuth 를 채택하는 모든 spec.

---

## PROC-014-02

- **현재 프로세스**: Security 가 인증/계정연동 취약점을 감사하고 발견 경로 중심으로 SEC-XXX 를 확정한다. 완화 후 재감사에서 새 경로가 드러나면 추가 복귀한다.
- **문제점**: OBS-014-02 — 초기·1차 감사가 path 3b(자동연동)에 집중, naver 자동연동 비활성 후 재감사 2차에서야 path 3a(재로그인)도 동일 취약함을 확정(GAP-014-10) → 추가 복귀(재감사 2차→3차). path 3a 는 GAP-014-07 이 "미확정"으로 남겨둔 지점으로, 초기 감사가 계정 해석 전 경로(3a/3b/3c)를 일괄 열거·분석했다면 부분완화 왕복을 줄일 수 있었다.
- **개선 방향**: Security(security.md)가 계정 연동 감사 시 계정 해석 로직의 모든 분기 경로를 먼저 전수 열거하고 각 경로의 신뢰 근거·검증 수단을 개별 분석하도록 강제(PATCH-014-02). 한 경로의 완화가 다른 경로에 자동 적용된다고 가정 금지. 완화 대상 밖 경로는 명시적 CONFIRMED/미노출 판정으로 종결.
- **영향 범위**: `~/.claude/agents/security.md`(감사 절차 체크리스트). 인증/계정연동(social login·account linking·SSO) 코드 포함 spec 감사.

---

## PROC-014-03

- **현재 프로세스**: Design 의 Test Authoring Contract(PATCH-013-01 적용)는 UI 화면의 위젯 타입·상태 주입 방식·테스트 렌더 전제(ProviderScope 등)를 canonical 로 고정한다. 그러나 위젯 테스트의 **런타임 환경 의존**(플랫폼 채널 미등록·secure storage·`Directory.current` cwd 기준)은 contract 에 고정되지 않는다.
- **문제점**: PATCH-013-01(013 적용 패치)의 본 차수 효과 측정에서 부분 미발휘(X) 확인. 014 GAP-014-02 에서 (a) `social_login_static_test.dart` 헬퍼가 `Directory.current` 를 `test/features/` 기준으로 가정했으나 실제 cwd 는 패키지 루트여서 4건 FAIL, (b) `social_login_flow_test.dart` 가 존재하지 않는 `Key('social-btn-kakao')` 로 조건부 skip anti-pattern(assert 미실행), (c) `FlutterSecureStorage`(TokenStore.save) 플랫폼 채널 무응답으로 `pumpAndSettle` timeout → `_FakeTokenStore` override 필요. 위젯 타입은 canonical 로 고정됐으나 이 3종 harness 전제가 미고정되어 5b [B] 정정 4건 발생.
- **개선 방향**: Design 의 Test Authoring Contract(03-design.md)에 UI 위젯 테스트 태스크의 harness 전제를 추가 항목으로 명시: (1) **경로 기준**(package root 기준 상수 경로 사용, `Directory.current`/`Platform.script` 상대경로 가정 금지), (2) **플랫폼 채널·secure storage 의존 위젯**은 provider override(FakeTokenStore 등) 필요 여부를 canonical 로 표기, (3) 대상 요소 Finder 는 실제 존재하는 Key/텍스트 기반으로 고정하고 `if (finder.isEmpty) markTestSkipped` 조건부 skip anti-pattern 금지(하드 assert). PATCH-013-01(위젯 타입·ProviderScope 고정)의 안전망 보강.
- **영향 범위**: `~/.claude/agents/03-design.md`(Test Authoring Contract UI harness 항목) · `~/.claude/agents/05-test.md`(5a AUTHORING 이 조건부 skip 대신 하드 assert 작성). Flutter/위젯 테스트 포함 spec.
- **비고 (PROC-003 (2)(b) 안전망)**: PATCH-013-01 부분 미발휘는 main session OBS 미기록(trigger a~e 미해당, GAP-014-02 는 [B] 정상 수렴)이었으나 명확한 harness 고정 공백이므로 Retrospective 안전망으로 신규 등록.
</content>
