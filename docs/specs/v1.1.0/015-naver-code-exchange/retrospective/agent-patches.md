---
작성: Retrospective Agent
버전: v1.0
최종 수정: 2026-07-03 [시각 미확인 — Bash 도구 부재]
상태: 적용 완료
---

# Agent Patches: 015-naver-code-exchange

## 목차

- [개요](#개요)
- [PATCH-015-01: Design Agent — 소셜 provider AUTO_LINK 편입 시 이메일 소유권 검증 대칭성 점검](#patch-015-01)
- [PATCH-015-02: Planning Agent — AUTO_LINK/자동연동 정책 변경 시 provider별 신뢰근거 검증표](#patch-015-02)
- [PATCH-015-03: Security Agent — 외부 IdP 클레임 신뢰 사전 체크리스트](#patch-015-03)
- [PATCH-015-04: Design Agent §F — 언어별 breaking change 판정(Dart abstract)](#patch-015-04)
- [context.md / infra.md 갱신 패치 (PATCH-CXT)](#contextmd--inframd-갱신-패치)

---

## 개요

본 사이클(015)은 서킷 브레이커·강제 중단 없이 gate:PASS 로 정상 종료했으나, **SEC-015-01(High)이 6단계 Security 재감사에서야 발견되어 Dev/Test/Docs/Security 재실행 1사이클을 유발**한 점이 핵심 개선 대상이다. 이 결함은 Design/Planning 단계 산출물(research.md)에 조기 발견 가능한 단서(google 은 `email_verified` 검증, naver 는 부재)가 이미 존재했으나 대조 점검 절차가 없어 놓쳤다. main OBS 기록은 0건이므로 gaps.md + pipeline-log.md 2중 소스로 분석했다(agent-rules.md §12).

**전역 문서 패치 적합성 2단계 검토**는 각 패치 항목에 명시한다(07-retrospective 오염 방지 게이트).

---

## PATCH-015-01

### Design Agent — 소셜 provider 를 AUTO_LINK(email 자동연동)에 편입할 때 provider 간 이메일 소유권 검증 대칭성 점검

- **대상 파일**: `~/.claude/agents/03-design.md`
- **대상 섹션**: §F(회귀·인터페이스 계약 점검) 또는 research.md 작성 절차의 "엣지 케이스 및 한계"
- **현재 내용**(pipeline-log·research.md 발췌 기반): research.md 는 `GoogleProvider.verify(aud + email_verified)`(research.md L33)와 `naver ∈ AUTO_LINK_PROVIDERS → race 자동연동 정상`(L36/L51)을 각각 기술했으나, **naver 를 AUTO_LINK 에 편입하는 결정 시 두 provider 의 이메일 검증 수단 차이(google=email_verified 검증 有 / naver=필드·검증 無)를 대조**하는 절차가 없다. 안전망 표(§한계 L167~173)도 "email 미반환(silent absence)"만 다루고 "email 소유권 미검증"은 누락.
- **변경 내용**: Design Agent 가 **소셜/외부 IdP provider 를 email 기반 자동연동(계정 병합) 화이트리스트에 추가·재편입**하는 spec 을 설계할 때, research.md 에 다음 대조표를 필수 작성하도록 체크 항목 추가:
  ```
  | provider | 앱바인딩 검증수단 | 이메일 소유권 검증수단 | 자동연동 안전 여부 |
  |---|---|---|---|
  | google | aud 대조 | email_verified==='true' | 안전 |
  | naver | code-exchange client_secret | (없음 — 필드 부재) | 미검증 → 자동연동 위험 |
  ```
  "앱바인딩 확보"와 "이메일 소유권 검증"은 **독립된 두 보증**이며, 전자 확보가 후자를 함의하지 않음을 명시. 후자 미확보 provider 는 자동연동(email 매칭 병합) 대상에서 제외하거나 SC 로 Security 검증을 필수 지정.
- **변경 근거**: GAP-015-04 / SEC-015-01(security-report.md "PATCH-014-02 — 계정 해석 경로 전수 분석"). 이 대조가 3단계에 있었다면 SC-018 재감사 전에 조기 발견 가능했다.
- **적합성**: 범용 O(모든 프로젝트의 소셜/외부 IdP 통합에 적용) / 역할정합 O(Design 의 인터페이스 계약·엣지케이스 점검 범위).
- **상태**: 적용 완료 (2026-07-03 14:28, docs-change-logs 2026-07-03-001)

---

## PATCH-015-02

### Planning Agent — 계정 병합/AUTO_LINK 정책을 변경하는 ADR 작성 시 provider별 신뢰근거 명시 강제

- **대상 파일**: `~/.claude/agents/02-planning.md`
- **대상 섹션**: 핵심 설계(ADR) 작성 절차 / Constitution Gates 인접 보안 점검
- **현재 내용**(발췌): plan.md ADR-004 가 "AUTO_LINK naver 재편입 — code-exchange 앱바인딩 근거"로 자동연동 재허용을 결정했다(pipeline-log L97). 그러나 이 근거는 **앱바인딩만**을 다루며 이메일 소유권 검증 공백을 ADR 에서 짚지 않았다. Security 최종 감사(SC-018)에 위임하는 것으로 처리했으나, 위임 자체는 위험 인지가 아니다(잔여 위험을 명시적 [TO-VERIFY]/gaps 로 남기지 않음).
- **변경 내용**: Planning Agent 가 **계정 자동연동·병합 정책(화이트리스트 추가/제거)** 을 변경하는 ADR 을 작성할 때, ADR 본문에 "이 provider 가 반환하는 이메일이 실제 소유자에게 귀속됨을 무엇이 보장하는가?"를 **명시 답변**하도록 강제. 보장 수단이 없으면 그 자체를 잔여 위험(gaps.md GAP 또는 spec.md 잔여위험표)으로 등재한 후 Security 위임. "Security 가 볼 것"만으로 갈음 금지.
- **변경 근거**: GAP-015-04 / SEC-015-01. Security 위임은 필요조건이나, Planning 단계 위험 인지 부재가 재작업 사이클로 이어졌다(security-report.md 권고 3 — "앱바인딩과 이메일 소유권을 별개 체크 항목으로 분리").
- **적합성**: 범용 O / 역할정합 O(Planning 의 ADR·설계 결정 근거 명시 범위).
- **상태**: 적용 완료 (2026-07-03 14:28, docs-change-logs 2026-07-03-001)

---

## PATCH-015-03

### Security Agent — 외부 IdP(소셜) 클레임 신뢰 사전 체크리스트를 절차 문서에 반영

- **대상 파일**: `~/.claude/agents/security.md`
- **대상 섹션**: OWASP 체크 절차 / 소셜·외부 인증 검토 항목
- **현재 내용**(발췌): Security Agent 는 이번 감사에서 PATCH-014-02(계정 해석 3경로 전수 분석)를 정확히 적용하여 SEC-015-01 을 확정했다(security-report.md). 이 분석 프레임(한 경로의 완화가 다른 경로에 자동 전파되지 않음)은 유효했으나, **소셜 IdP 클레임(email·email_verified 등)의 신뢰성 판정을 위한 표준 체크리스트가 절차 문서에 명시되어 있지 않아** provider 마다 ad-hoc 으로 대조했다.
- **변경 내용**: Security Agent 절차에 "외부 IdP 신원 클레임 신뢰 체크리스트" 추가:
  1. 각 provider 의 email(및 기타 신원) 클레임에 대해 IdP 가 소유권 검증 신호(verified 플래그 등)를 제공하는가? 코드가 그것을 실제로 검증하는가?
  2. 플랫폼 차원 보장(예: 카카오 비즈앱 미인증 시 검증 이메일만 반환)에 의존하는 경우, 그 가정을 코드/문서로 확증했는가(추측 금지)?
  3. "앱바인딩 확보"를 "이메일 소유권 확보"로 오인하지 않았는가?
- **변경 근거**: SEC-015-01 / security-report.md 권고 3·4(Kakao 이메일 검증 정책 확인, 앱바인딩·이메일소유권 분리). 이번엔 발견에 성공했으나 체크리스트 부재로 provider 재도입마다 재발 위험.
- **적합성**: 범용 O(모든 소셜/외부 인증 프로젝트) / 역할정합 O(Security Agent 의 OWASP·인증 검토 범위).
- **상태**: 적용 완료 (2026-07-03 14:28, docs-change-logs 2026-07-03-001)

---

## PATCH-015-04

### Design Agent §F — Breaking change 판정에 언어별 시맨틱(Dart abstract 메서드 추가) 반영

- **대상 파일**: `~/.claude/agents/03-design.md`
- **대상 섹션**: §F 회귀·breaking change 점검 (PROC-001 인접)
- **현재 내용**(발췌): §F 의 breaking change 점검이 TypeScript optional parameter 추가(backend `verify`/`login`)를 무회귀로 정확히 처리했으나, **Dart `abstract SocialAuthService` 에 `signInWithNaver()` 추가**가 `implements SocialAuthService` 로 선언된 기존 구현체(014 `_StubSocialAuthService`)의 컴파일을 깨뜨리는 언어 수준 breaking change 임을 식별하지 못했다(GAP-015-02, 4단계 구현 중 컴파일 오류로 발견).
- **변경 내용**: §F breaking change 판정 절차에 언어별 주의 항목 추가:
  - `[Dart]` abstract class 에 메서드 추가 시, `implements` 로 선언된 모든 구현체(테스트 stub 포함)가 재구현을 강제받아 컴파일이 깨진다(기본 구현 유무 무관). `extends` 와 `implements` 의 차이를 구분하고, `implements` 구현체를 grep 으로 전수 열거하여 영향 파일에 포함.
  - 일반화: "인터페이스/추상 타입 확장이 무회귀인지는 언어의 인터페이스 시맨틱에 의존한다(TS optional param ≠ Dart implements). 언어별로 판정할 것."
- **변경 근거**: GAP-015-02. 재작업 유발은 아니었으나(Development 가 최소 override 로 회복) 3단계에서 영향 파일 누락으로 4단계 컴파일 오류 발생.
- **적합성**: 범용 O(다언어 breaking change 판정 일반 원칙 + [Dart] 태그 한정 상세) / 역할정합 O(Design §F 범위). 언어 한정 상세는 `[Dart]` 환경 태그로 구분(pipeline-conventions §8).
- **상태**: 적용 완료 (2026-07-03 14:28, docs-change-logs 2026-07-03-001)

> **재배치 검토**: 순수 Dart 한정 세부는 `~/.claude/rules/on-demand/` 에 dart.md 가 없으므로, 일반 원칙은 03-design.md §F 에 두고 [Dart] 상세는 태그로 인라인. dart.md 신설 시 이관 권고(별도 후속).

---

## context.md / infra.md 갱신 패치 (PATCH-CXT)

> [MUST NOT] 본 Agent 는 context.md/infra.md 를 직접 수정하지 않는다. main session 이 사용자 확인 후 적용한다.
> PROC-002 코드 검증: 각 패치의 "코드 검증" 항목에 grep/Read 로 확인한 코드 위치·일치 여부 기재.

### PATCH-CXT-015-01: context.md — naver 소셜 로그인 재도입 반영

- **대상 파일**: `/Users/krystal/workspace/doa/doa-next/.claude/docs/context.md`
- **대상 섹션**: §2 핵심 모듈 목록 / §2 social/ 행 / §4 데이터 모델 / §6 알려진 제약 / §7 갱신 이력
- **변경 내용**:
  1. **§2 auth 행(L75)**: "소셜 로그인(POST /auth/social-login — 카카오·구글, ...)" → "카카오·구글·**네이버** 3종. 네이버는 code-exchange(client_secret 서버 교환) 방식, 카카오·구글은 클라이언트 토큰 검증 방식(혼합)".
  2. **§2 social/ 행(L107)**: "`SocialProviderResolver` 가 provider 문자열→구현체 매핑(카카오·구글 활성). `NaverProvider` 는 파일 보존·미와이어(SEC-001)" → "카카오·구글·네이버 3종 활성. `NaverProvider`(code-exchange: `nid.naver.com/oauth2.0/token`→`openapi.naver.com/v1/nid/me`)".
  3. **§4 데이터 모델(L198)**: "활성 provider 카카오·구글(네이버 제외 — SEC-001)" → **두 구분을 분리 서술**: "로그인 가능 provider: 카카오·구글·네이버 3종(`SUPPORTED_PROVIDERS`). email 자동연동(`AUTO_LINK_PROVIDERS`) 허용: 카카오·구글 2종만 — 네이버는 이메일 소유권 미검증(SEC-015-01)으로 자동연동 제외(재로그인·신규가입은 가능, 동일 이메일 요청은 409)".
  4. **§6 알려진 제약**: (a) 기존 "소셜 로그인 아웃바운드 rate limit 부재(SEC-004/GAP-014-06, Low)" 행의 "kapi.kakao.com·oauth2.googleapis.com" 에 naver 아웃바운드 2건(`nid.naver.com`·`openapi.naver.com`) 추가. (b) **신규 행** — "네이버 자동연동 이메일 소유권 미검증(SEC-015-01, High→완화)": naver 는 code-exchange 로 앱바인딩은 확보하나 프로필 email 소유권 검증 수단이 없어 `AUTO_LINK_PROVIDERS` 에서 제외됨. 향후 자동연동 재도입 시 서버측 이메일 소유권 검증(인증 링크 등) 필수. (c) **신규 행(PROC-013-03, SEC-015-02 Medium)** — "네이버 state(CSRF) 서버측 미검증": naver 토큰 요청에 클라이언트 state 를 그대로 forward 만 하고 백엔드 자체 검증 없음. 운영 셋업(flutter_web_auth_2 네이티브 연동) 착수 전 클라이언트 측 state 생성·검증 구현 필수. (d) **신규 행(SEC-015-03 Low)** — "네이버 redirect_uri 요구 여부 미확정": 토큰 교환에 redirect_uri 미포함, 운영 크레덴셜 등록 시 공식 문서로 최종 확인.
  5. **§7 갱신 이력**: 015 신규 행 추가 — "v1.1.0/015-naver-code-exchange — 네이버 소셜 로그인 재도입(code-exchange). 로그인 3종 활성·자동연동은 카카오·구글 2종(naver 는 SEC-015-01 로 제외). §2 auth·social/·§4·§6 갱신".
- **변경 근거**: GAP-015-03(Docs Agent 등록, PROC-002 코드검증 수행) + SEC-015-01/02/03(security-report.md 권고 2, PROC-013-03) + GAP-015-05(자동연동 정책 반전).
- **코드 검증** (PROC-002):
  - `apps/backend/src/modules/auth/social-auth.service.ts` L30: `const AUTO_LINK_PROVIDERS: ReadonlySet<string> = new Set(['kakao', 'google']);` — naver 제외 확인(Read).
  - `apps/backend/src/modules/auth/dto/social-login.dto.ts` L5: `const SUPPORTED_PROVIDERS = ['kakao', 'google', 'naver'] as const;` — 로그인 3종 확인(Read).
  - `apps/backend/src/modules/auth/auth.module.ts` L12 (NaverProvider import) + `social/social-provider.resolver.ts` L4(import)/L18(생성자 주입)/L23(`naver: this.naver` 매핑) — DI 등록·resolver 활성 확인(grep).
  - `apps/backend/src/modules/auth/social/naver.provider.ts` L56 `fetch('https://nid.naver.com/oauth2.0/token')` + L75 `fetch('https://openapi.naver.com/v1/nid/me')` + L45-46 `getOrThrow('NAVER_CLIENT_ID'/'NAVER_CLIENT_SECRET')` — 아웃바운드 2건·fail-closed 확인(Read). → 변경 후 텍스트가 코드 사실과 **일치**.
- **상태**: 적용 완료 (2026-07-03 14:28, docs-change-logs 2026-07-03-001)

### PATCH-CXT-015-02: infra.md — 네이버 아웃바운드·크레덴셜 secret 등재

- **대상 파일**: `/Users/krystal/workspace/doa/doa-next/.claude/docs/infra.md`
- **대상 섹션**: §5 연결 실패 재시도 / §7 배포 전 확인 체크리스트 / §8 알려진 인프라 제약 / §9 갱신 이력
- **변경 내용**:
  1. **§5 연결 실패 재시도 동작**: 신규 행 2건 — "네이버 토큰 교환(nid.naver.com/oauth2.0/token) | native fetch, 재시도 없음 | code-exchange 실패 시 4xx/5xx 반환(POST /auth/social-login)", "네이버 프로필(openapi.naver.com/v1/nid/me) | native fetch, 재시도 없음 | 프로필 조회 실패 시 오류 반환".
  2. **§7 배포 전 확인 체크리스트**: 기존 OAuth 항목(L192)에 naver 추가 — "OAuth 소셜 로그인 크레덴셜 Fly secret 설정 확인(`KAKAO_APP_ID`·`KAKAO_REST_API_KEY`·`GOOGLE_CLIENT_ID`·**`NAVER_CLIENT_ID`·`NAVER_CLIENT_SECRET`**). 미설정 시 verify() 호출 시점 fail-closed. 활성 provider: 카카오·구글·**네이버** 3종(015-naver-code-exchange)". 네이버 개발자센터 redirect URI 등록·실 크레덴셜 발급은 운영 셋업 deferred 로 병기.
  3. **§8 알려진 인프라 제약**: 기존 "소셜 로그인 아웃바운드 의존성" 행(L212)의 "카카오·구글" 아웃바운드에 naver 2개 엔드포인트 추가 + "활성 provider 카카오·구글·네이버 3종(자동연동은 카카오·구글만 — SEC-015-01)"으로 갱신.
  4. **§9 갱신 이력**: 015 신규 행 추가.
- **변경 근거**: GAP-015-01(Planning 등록, PROC-009 배포 환경 cross-reference) + research.md PATCH-A10(네이버 아웃바운드 2건 순차 호출).
- **코드 검증** (PROC-002):
  - `naver.provider.ts` L45-46 `getOrThrow<string>('NAVER_CLIENT_ID')` / `getOrThrow<string>('NAVER_CLIENT_SECRET')` — env 키명·fail-closed(호출 시점 지연 조회) 확인(Read).
  - `naver.provider.ts` L56/L75 아웃바운드 2 엔드포인트 확인(Read). → 코드 사실과 **일치**.
  - `.env.example` 의 `NAVER_CLIENT_ID`/`NAVER_CLIENT_SECRET` placeholder 존재는 SC-017 검증 완료(coverage.md)로 확정 — 실 값은 미커밋(NFR-002).
- **상태**: 적용 완료 (2026-07-03 14:28, docs-change-logs 2026-07-03-001)

> **PROC-R02 확인**: context.md §7 · infra.md §9 는 표준 changelog 갱신 이력 테이블이며 "스펙 버저닝 이력"(금지 대상)이 아니다(00-context-rules §5·§6 템플릿이 매 spec 완료 시 신규 행 추가를 명시). 따라서 신규 행 추가 패치는 PROC-R02 위반이 아니다(Docs Agent 도 gaps.md GAP-015-03 에서 동일 판정).
