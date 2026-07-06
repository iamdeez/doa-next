---
작성: Retrospective Agent
버전: v1.0
최종 수정: 2026-07-02 [시각 미확인]
상태: 적용 완료 (2026-07-02, 전역→~/.claude/docs-change-logs/2026-07-02-001.md · 프로젝트→.claude/docs-change-logs/2026-07-02-001.md · spec.md 정합화 완료 · memory naver-social-login-excluded 등재)
---

# Agent Patches: 014-social-login

> 적용 주체 = main session (사용자 승인 후). 본 Agent 는 제안만 한다.
> context.md / infra.md / spec.md 갱신 패치(PATCH-CXT)는 `context-infra-updates.md` 에 분리 기재.

## 목차

- [PATCH-014-01 — 02-planning.md 클라이언트 토큰 OAuth provider 앱바인딩 검증 수단 사전 조사](#patch-014-01)
- [PATCH-014-02 — security.md 계정 해석 전 분기 경로 일괄 열거](#patch-014-02)
- [PATCH-014-03 — spec.md naver 지원 서술 정합화 (프로젝트 산출물 갱신 권고)](#patch-014-03)

---

## PATCH-014-01

**대상 파일**: `~/.claude/agents/02-planning.md` (Planning Agent)
**대상 섹션**: 핵심 설계 / 기술 컨텍스트 — 외부 인증 연동 방식 결정 규율
**적합성**: 범용 O (모든 프로젝트의 클라이언트 토큰 전달형 OAuth/소셜 로그인 채택 시 공통) / 역할정합 O (Planning 이 기술 방식 채택·검증 조사 소유 — plan.md ADR)

- **현재 내용** (agent-observations.md OBS-014-01 발췌 기반): Planning 은 인증 연동 방식(클라이언트 토큰 전달 vs 서버 code-exchange)을 ADR 로 결정하나, 채택한 방식이 각 provider 에서 "토큰이 우리 앱에 발급된 것인지"(app/client 바인딩) 를 검증할 수단을 갖는지 provider별로 사전 조사하도록 강제하지 않는다. ADR-002 가 google aud 만 명시하고 kakao/naver 검증 가능성을 `[TO-VERIFY]` 로 Design 위임.
- **관찰(OBS-014-01)**: "클라이언트 토큰 전달" 흐름 채택 후, provider별 토큰 앱바인딩 검증 수단(google aud·kakao app_id·naver=부재)이 Design/Security 단계에서야 드러남. naver 는 공개 API 에 앱바인딩 검증 수단이 없어 client-token 흐름에서 근본적으로 token substitution 계정 탈취에 취약 → 이번 릴리즈 제외. Security 3회 복귀·세션 한도 2회 소모.
- **추정 원인**: Spec/Planning 이 클라이언트 토큰 흐름 채택 시 provider별 토큰 검증(앱 귀속) 가능성을 사전 조사하지 않음. "검증 불가"라는 근본 제약이 Security 단계까지 지연 표면화.
- **변경 내용** (02-planning.md 에 규율 신설):
  1. 클라이언트가 소셜/OAuth provider 의 access token·id_token 을 서버로 전달하는 검증 방식을 채택하는 경우, plan.md 에 **provider별 "토큰 앱바인딩(audience) 검증 수단"** 을 표로 명시한다:

     | provider | 앱바인딩 검증 수단 | 검증 가능 여부 |
     |---|---|---|
     | google | `tokeninfo` 의 `aud` 대조 | O |
     | kakao | `access_token_info` 의 `app_id` 대조 | O |
     | naver | (공개 API 부재) | X → 대안 필요 |
  2. 검증 수단이 **부재(X)한 provider** 는 (a) 서버 authorization code + client_secret 교환 방식으로 해당 provider 만 전환, 또는 (b) 해당 provider 를 이번 릴리즈 범위에서 제외 — 둘 중 하나를 **spec/plan 단계에서 결정**하고 spec.md 범위·plan ADR 에 반영한다. `[TO-VERIFY]` 로 Design/Security 에 위임하여 검증 불가 사실을 지연 발견하지 않는다.
  3. 검증 수단 존재 여부가 조사되지 않은 상태에서 Constitution Gates 를 통과시키지 않는다(호환성·안전성 관점 사전 검증 항목).
- **변경 근거**: OBS-014-01 (트리거 §12(b) — Security SEC-001 High 3회 BLOCKED). 클라이언트 토큰 흐름의 provider별 검증 가능성은 방식 선택의 전제 조건이므로 Planning 단계에서 확정해야 왕복을 차단.
- **강제도 권고**: SHOULD (클라이언트 토큰 전달형 OAuth/소셜 로그인 spec 에 한정).
- **적합성 검토 결과**: 범용 O / 역할정합 O.

---

## PATCH-014-02

**대상 파일**: `~/.claude/agents/security.md` (Security Agent)
**대상 섹션**: 감사 절차 — 인증/계정 연동 취약점 분석 체크리스트
**적합성**: 범용 O (모든 인증/계정연동 감사에 공통) / 역할정합 O (Security 감사 절차 단일 소유)

- **현재 내용** (agent-observations.md OBS-014-02 발췌 기반): Security 는 인증/계정연동 취약점 감사 시 발견된 경로 중심으로 분석하나, 계정 해석 로직의 **모든 분기 경로**(재로그인·자동연동·신규생성)를 일괄 열거하여 각 경로의 신뢰 근거를 개별 분석하도록 강제하는 체크가 없다.
- **관찰(OBS-014-02)**: 초기·1차 감사가 path 3b(email 매칭 자동연동)에 집중하여 SEC-001 을 확정했고, naver 자동연동 비활성(path 3b) 완화 후 재감사 2차에서야 path 3a(providerId 매칭 재로그인)도 동일 취약함을 확정 → 추가 복귀. 초기 감사가 계정 해석 전 경로(3a/3b/3c)를 일괄 분석했다면 부분완화 왕복을 줄였을 것.
- **추정 원인**: 계정 연동 취약점 분석이 "발견된 자동연동 경로" 중심으로 진행되어, 동일 신뢰 전제(provider 토큰 앱바인딩)에 의존하는 다른 경로(재로그인)를 초기에 함께 열거하지 않음.
- **변경 내용** (security.md 감사 절차에 체크 항목 신설):
  1. 인증/계정 연동(social login·account linking·SSO) 코드를 감사할 때, **계정 해석 로직의 모든 분기 경로를 먼저 전수 열거**한다(예: providerId 매칭 재로그인 / email 매칭 자동연동 / 신규 계정 생성 / race fallback). 열거 목록을 security-report.md 에 명시한다.
  2. 각 경로마다 **신뢰 근거(무엇을 근거로 이 사용자를 인증하는가)** 와 **그 근거의 검증 수단**(토큰 앱바인딩·소유권 확인 등)을 개별 분석한다. 한 경로의 완화가 다른 경로에 자동 적용된다고 가정하지 않는다.
  3. 완화책이 특정 경로만 대상으로 하는 경우(예: 자동연동만 차단), 완화 대상 밖 경로가 동일 신뢰 전제에 의존하는지 재확인하고, 미검증 경로를 "잔여 위험 미확정"이 아닌 명시적 CONFIRMED/미노출 판정으로 종결한다.
- **변경 근거**: OBS-014-02 (트리거 §12(b) — 동일 취약점 재감사에서 path 3a 지연 발견). 계정 해석 분기 일괄 열거로 부분완화 왕복을 사전 차단.
- **강제도 권고**: SHOULD (인증/계정연동 코드 포함 감사에 한정).
- **적합성 검토 결과**: 범용 O / 역할정합 O.

---

## PATCH-014-03

**대상 파일**: `docs/specs/v1.1.0/014-social-login/spec/spec.md` (프로젝트 산출물 — Spec Agent 소유)
**대상 섹션**: FR-001 / NFR-004 / SC-009 / SC-013 / SC-018 / 범위 외
**적합성**: 재배치: 본 항목은 전역 문서 아닌 **프로젝트 산출물(spec.md)** 갱신 권고 — Retrospective 는 spec.md 를 직접 수정하지 않으므로(단일 책임), main session/Spec Agent 재호출로 처리. 정합성 갱신 상세는 `context-infra-updates.md` PATCH-CXT-014-04 에도 병기.

- **현재 내용** (GAP-014-09 발췌 기반): 구현은 Naver 를 이번 릴리즈에서 완전 제외(SocialProviderResolver·SocialLoginDto @IsIn·AuthModule·Flutter 에서 제거)했으나, spec.md 의 다음 문구가 여전히 naver 를 지원 대상으로 서술한다:
  - FR-001 "카카오·구글·네이버 중 하나"
  - NFR-004 "각 OAuth 제공자(카카오·구글·네이버)"
  - SC-009 "`provider: 'naver'` 식별자로... JWT가 반환된다"
  - SC-013 "네이버 소셜 버튼"
  - SC-018 "카카오·구글·네이버 각 제공자의... 크레덴셜"
  - 범위 외 절 "실 OAuth 제공자 앱 등록(카카오·구글·네이버)"
- **변경 내용** (spec.md 갱신 — main session/Spec Agent 결정·실행):
  1. FR-001·NFR-004 의 "카카오·구글·네이버" → "카카오·구글(Naver 는 SEC-001/GAP-014-08/GAP-014-10 근거로 이번 릴리즈 제외)".
  2. SC-009·SC-013 을 수용 기준 목록에서 제거 또는 "제외(범위 외)"로 이관(5a Test Agent 가 이미 해당 테스트 제거).
  3. SC-018 크레덴셜 항목에서 `NAVER_CLIENT_ID`/`NAVER_CLIENT_SECRET` 2종 존치 여부 결정(코드는 `.env.example` 값 유지 — 현 상태로 SC-018 자체는 PASS, 문서 정합성 차원 결정).
  4. 범위 외 절에 "Naver 소셜 로그인 완전 제외(향후 authorization code + client_secret 교환 방식 ADR-001 재검토 시 재도입)" 추가.
- **변경 근거**: GAP-014-09(미해결, 범위 확대). spec.md 가 구현보다 넓은 provider 지원을 서술하여 SoT 로서 신뢰 불가 상태 — 다음 spec 설계자가 naver 지원으로 오인할 위험.
- **처리 경로**: Retrospective 는 spec.md 를 직접 수정하지 않는다([MUST NOT] 단일 책임). main session 이 `spec 수정` 이벤트로 Spec Agent 를 재호출하여 반영하거나, 사용자 승인 후 별도 처리.
</content>
