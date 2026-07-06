---
작성: Spec Agent
버전: v1.0
최종 수정: 2026-07-03 [시각 미확인 — Bash 도구 미제공으로 date 명령 실행 불가]
상태: 확정
---

# Spec: 016-naver-state-redirect-hardening

> Branch: 016-naver-state-redirect-hardening | Date: 2026-07-03 | Version: v1.1.0

## 목차

- [배경 및 목적](#배경-및-목적)
- [선행 spec 영향 추적](#선행-spec-영향-추적)
- [사용자 스토리](#사용자-스토리)
- [기능 요구사항](#기능-요구사항)
- [비기능 요구사항](#비기능-요구사항)
- [수용 기준](#수용-기준)
- [요구사항 구조화 매트릭스](#요구사항-구조화-매트릭스)
- [범위 외](#범위-외)
- [미결 사항](#미결-사항)

---

## 배경 및 목적

`v1.1.0/015-naver-code-exchange` 는 네이버 소셜 로그인을 서버 사이드 authorization code + client_secret 교환(code-exchange) 방식으로 안전하게 재도입했다. 6단계 Security Agent 재감사(`security-report.md` v1.1, `status: COMPLETE`, `gate: PASS`)는 이메일 소유권 미검증에 의한 계정 탈취(SEC-015-01, High)를 자동연동 배제로 완전히 해소했으나, 두 항목을 권고사항으로 잔존시켰다.

- **SEC-015-02 (Medium)**: 네이버 code-exchange 요청의 `state` 파라미터를 백엔드(`naver.provider.ts`)가 클라이언트로부터 받은 값을 네이버 토큰 엔드포인트에 그대로 전달만 할 뿐, 그 값이 실제로 유효한 CSRF 방지 근거인지 자체 검증하지 않는다(순수 pass-through). 015 는 "운영 셋업(네이티브 `flutter_web_auth_2` 연동) 착수 전 반드시 클라이언트 측 state 생성·검증 로직을 구현해야 한다"고 명시적으로 권고했다.
- **SEC-015-03 (Low)**: 토큰 교환 요청에 `redirect_uri` 파라미터가 포함되지 않는다. 요구 여부는 `[TO-VERIFY]`(공식 문서 미확인) 상태이며, `SocialVerifyContext.redirectUri` 필드가 예약만 되어 있고 미사용이다.

본 spec 은 이 두 항목의 **백엔드 단독으로 지금 완결 가능한 하드닝**을 다룬다. 015 는 ADR-007 에서 "클라이언트(Flutter)가 state 를 생성하고 콜백에서 대조한다"는 설계를 전제했으나, 실제 네이티브 SDK(`flutter_web_auth_2`) 연동은 015 에서 명시적으로 범위 외(운영 셋업 deferred)로 남아 `StubSocialAuthService` 가 고정 문자열 `'stub-state'` 를 반환하는 stub 상태에 머물러 있다. 이 제약을 고려해, 본 spec 은 ADR-007 의 설계를 **"백엔드가 CSRF 방지용 state 값을 발급하고, 클라이언트는 그 값을 그대로 되돌려주기(echo)만 하면 되는"** 방식으로 전환한다. 이 방식은 네이티브 SDK 연동 여부와 무관하게 백엔드에서 발급·검증·소비 로직을 지금 완결적으로 구현·테스트할 수 있으며, 향후 네이티브 연동 착수 시에는 클라이언트가 발급받은 state 를 그대로 전달하기만 하면 되므로 구현 부담도 줄어든다. redirect_uri 는 환경변수 기반으로 조건부 지원을 준비해, 운영 단계에서 네이버 공식 문서로 요구 여부가 확인되면 코드 변경 없이 즉시 활성화할 수 있게 한다.

**범위**: 본 spec 은 네이버 code-exchange 흐름의 백엔드측 보안 하드닝에 한정한다. 실제 네이티브 앱이 신규 state 발급 엔드포인트를 호출하도록 배선하는 것, redirect_uri 의 실제 요구 여부를 네이버 공식 문서로 최종 확인하고 실 크레덴셜을 등록하는 것은 운영 셋업/운영 작업으로 범위 외에 둔다(아래 "범위 외" 절 참조). GAP-015-01(infra.md 네이버 엔드포인트 미등재)은 본 spec 착수 이전 별도 패치(PATCH-CXT-015-02)로 이미 해소되어 본 spec 범위에서 제외한다.

## 선행 spec 영향 추적 (Predecessor Lineage)

| 선행 spec | 식별된 결함 항목 | 결함 인지 시점 | 식별 경로 |
|---|---|---|---|
| v1.1.0/015-naver-code-exchange | SEC-015-02(Medium) — 네이버 code-exchange 의 state(CSRF) 파라미터를 백엔드가 클라이언트 값 그대로 전달만 하고 자체 검증하지 않음 | 2026-07-03 (Security Agent v1.1 재감사) | `security-report.md` "SEC-015-02" 절, 권고사항 2 직접 확인 |
| v1.1.0/015-naver-code-exchange | SEC-015-03(Low) — 토큰 교환 요청에 redirect_uri 미포함, 요구 여부 `[TO-VERIFY]` | 2026-07-03 (Security Agent v1.1 재감사) | `security-report.md` "SEC-015-03" 절 직접 확인 |

> **주의**: 본 spec 은 015 가 완료 처리한 네이버 로그인 흐름의 런타임 동작을 변경한다 — code-exchange 요청은 이제 사전에 백엔드가 발급한 유효한 state 값을 요구하며, 미검증 상태로 통과하던 기존 동작은 더 이상 유효하지 않다. 다만 015 자체가 "실 네이버 인증 흐름 E2E 검증은 크레덴셜 발급 후 별도 운영 검증으로 수행"을 범위 외로 명시했으므로, 현재 운영 중인 실사용자 흐름에 대한 회귀는 없다(네이티브 연동이 아직 stub 이므로 실사용 트래픽 자체가 없음).

---

## 사용자 스토리

- **US-001**: 소비자로서, 네이버 로그인 시 CSRF(Cross-Site Request Forgery) 공격으로부터 보호되어 안전하게 로그인하고 싶다.
- **US-002**: 백엔드/모바일 개발자로서, 향후 네이티브 연동 착수 시 서버가 발급한 state 값을 그대로 전달하기만 하면 되는 단순한 계약을 원한다(클라이언트 자체 state 생성·보관·대조 로직이 불필요하길 원한다).
- **US-003**: 운영 담당자로서, 네이버가 redirect_uri 를 요구하는 것으로 추후 확인되면 코드 변경 없이 환경변수 설정만으로 즉시 대응할 수 있길 원한다.

---

## 기능 요구사항

### state(CSRF) 발급·검증 (SEC-015-02 하드닝)

**FR-001**: 백엔드는 네이버 소셜 로그인 인증 흐름을 시작하기 전, 클라이언트가 요청할 수 있는 기능을 통해 CSRF 방지용 state 값을 발급한다.

**FR-002**: 발급된 state 값은 일정 시간(TTL)이 경과하면 자동으로 무효화되어 이후 검증에 사용할 수 없다.

**FR-003**: provider 가 'naver' 인 소셜 로그인(code-exchange) 요청 시, 백엔드는 전달된 state 값이 자신이 발급한 값과 일치하고 아직 유효(미만료·미소비)한지 검증한다.

**FR-004**: state 검증에 실패(값 불일치·만료·미제공·발급 이력 없음)하는 경우 로그인 요청을 거부하고 적절한 오류 응답을 반환한다.

**FR-005**: 검증에 성공한 state 값은 그 즉시 1회성으로 소비 처리되어, 동일한 state 값으로 재요청하는 경우 두 번째 이후 요청은 검증에 성공하지 않는다.

**FR-006**: provider 가 'kakao' 또는 'google' 인 소셜 로그인 요청은 state 발급·검증 대상에서 제외한다(네이버 code-exchange 전용 메커니즘 유지, 기존 클라이언트 토큰 검증 방식 회귀 없음).

### redirect_uri 조건부 지원 (SEC-015-03 하드닝)

**FR-007**: 백엔드는 네이버 redirect_uri 값이 환경변수로 설정되어 있는 경우, 네이버 토큰 교환 요청에 그 값을 포함한다.

**FR-008**: 네이버 redirect_uri 환경변수가 설정되지 않은 경우, 백엔드는 기존과 동일하게 토큰 교환 요청에 redirect_uri 파라미터를 포함하지 않는다(하위 호환 유지 — 미설정 상태가 기본값).

---

## 비기능 요구사항

**NFR-001**: 네이버 소셜 로그인 관련 백엔드 API(신규 state 발급 기능 포함) 응답 P95 3초 이내. 015 NFR-001 기준을 그대로 승계·통합한다(별도 신설 불요).

**NFR-002**: state 값은 예측 불가능한 방식으로 발급되며(추측·재현 불가능), 안전하게 TTL 로 보관되고 콜백 시 1회성으로만 검증·소비된다. 구체적인 발급 알고리즘·저장 방식은 본 spec 범위(WHAT) 밖이며 Planning 단계(HOW)에서 결정한다.

**NFR-003**: 기존 카카오·구글 소셜 로그인 동작(클라이언트 토큰 검증 방식, `app_id`/`aud` 대조 등)은 본 spec 변경으로 회귀하지 않는다(015 NFR-004 승계).

**NFR-004**: state 값의 발급·검증·소비를 위한 저장 메커니즘은 신규 외부 데이터 저장소(Redis 등)를 추가하지 않는다(constitution P-003 단일 DB 원칙 준수). 구체적인 저장 방식(예: 기존 단일 PostgreSQL 인스턴스 활용 또는 애플리케이션 인메모리)은 Planning 단계에서 이 원칙을 지키는 범위 내에서 결정한다.

**NFR-005**: `.env.example` 에 네이버 redirect_uri 환경변수 항목이 문서화된다.

**NFR-006**: 본 spec 의 SEC-015-02(state CSRF 서버측 미검증) 하드닝 결과는 6단계 Security Agent 재감사에서 RESOLVED 로 판정되어야 한다.

**NFR-007**: 본 spec 의 SEC-015-03(redirect_uri 미확정) 하드닝 결과는 6단계 Security Agent 재감사에서 RESOLVED 또는 잔존-권고(운영 확인 대기)로 판정되어야 한다.

---

## 수용 기준

### state(CSRF) 발급·검증

**SC-001** (FR-001): state 발급 기능을 호출하면 유효한 state 값이 반환된다. [env:unit]

**SC-002** (FR-002): 발급된 state 값에 대해 TTL 경과 후 검증을 시도하면 만료로 거부된다. [env:unit]

**SC-003** (FR-003): 발급 직후의 유효한(미만료) state 값으로 네이버 code-exchange 요청 시 state 검증이 통과되고 로그인 흐름이 정상 진행된다(이후 처리는 015 기존 로직 그대로). [env:unit]

**SC-004** (FR-004): state 값이 발급 이력과 불일치하거나, 만료되었거나, 요청에 아예 포함되지 않은 경우 네이버 로그인 요청이 4xx 오류로 거부된다. [env:unit]

**SC-005** (FR-005): 검증에 성공해 이미 소비된 state 값으로 동일한 값을 재사용하여 재요청하면, 두 번째 요청은 검증 실패로 거부된다. [env:unit]

**SC-006** (FR-006): `provider: 'kakao'` 및 `provider: 'google'` 요청은 state 값의 존재·유효성과 무관하게 기존과 동일한 클라이언트 토큰 검증 흐름으로 정상 처리된다(state 검증 대상이 아님을 확인). [env:unit]

### redirect_uri 조건부 지원

**SC-007** (FR-007): 네이버 redirect_uri 환경변수가 설정된 상태에서 네이버 code-exchange 요청을 처리하면, 네이버 토큰 교환 요청에 redirect_uri 파라미터가 포함된다. [env:unit]

**SC-008** (FR-008): 네이버 redirect_uri 환경변수가 설정되지 않은 상태에서는 토큰 교환 요청에 redirect_uri 파라미터가 포함되지 않는다(기존 동작과 동일, 회귀 없음). [env:unit]

### 정적·환경 검증 및 보안

**SC-009** (NFR-001): 네이버 소셜 로그인 관련 API(state 발급 포함) P95 응답 3초 이내. [env:e2e-docker] — deferred: 실 OAuth 크레덴셜 발급·연동 후 측정(015 SC-016 과 동일 처리 방식).

**SC-010** (NFR-002): state 발급 기능을 연속으로 여러 번 호출하면 매번 서로 다른 값이 반환됨을 확인한다(예측 불가능성 검증). [env:unit]

**SC-011** (NFR-003): 015 산출물의 카카오·구글 관련 기존 단위 테스트 스위트가 본 spec 구현 후에도 회귀 없이 100% PASS 한다(네이버 신규 테스트 추가분 제외). [env:unit]

**SC-012** (NFR-004): state 저장 메커니즘 구현을 위해 신규 외부 데이터 저장소 클라이언트 패키지(Redis 클라이언트 등)가 의존성에 추가되지 않았음을 확인한다. [env:static]

**SC-013** (NFR-005): `.env.example` 에 네이버 redirect_uri 환경변수 항목이 존재한다. [env:static]

**SC-014** (NFR-006): 6단계 Security Agent 재감사 결과, SEC-015-02 가 RESOLVED 로 판정된다. [env:static]

**SC-015** (NFR-007): 6단계 Security Agent 재감사 결과, SEC-015-03 이 RESOLVED 또는 잔존-권고(운영 확인 대기)로 판정된다. [env:static]

---

## 요구사항 구조화 매트릭스

| US-ID | FR-ID | NFR-ID | SC-ID | [env:*] | MoSCoW |
|---|---|---|---|---|---|
| US-001, US-002 | FR-001 | — | SC-001 | unit | Must |
| US-001 | FR-002 | — | SC-002 | unit | Must |
| US-001, US-002 | FR-003 | — | SC-003 | unit | Must |
| US-001 | FR-004 | — | SC-004 | unit | Must |
| US-001 | FR-005 | — | SC-005 | unit | Must |
| US-001 | FR-006 | NFR-003 | SC-006 | unit | Must |
| US-003 | FR-007 | — | SC-007 | unit | Must |
| US-003 | FR-008 | — | SC-008 | unit | Must |
| — | — | NFR-001 | SC-009 | e2e-docker | Should (deferred) |
| US-001, US-002 | — | NFR-002 | SC-010 | unit | Must |
| US-001 | — | NFR-003 | SC-011 | unit | Must |
| — | — | NFR-004 | SC-012 | static | Must |
| US-003 | — | NFR-005 | SC-013 | static | Must |
| US-001 | — | NFR-006 | SC-014 | static | Must |
| US-001 | — | NFR-007 | SC-015 | static | Must |

---

## 범위 외

- **네이티브 `flutter_web_auth_2` 실 SDK 연동 및 앱의 state 발급 엔드포인트 호출 배선**: 015 가 이미 범위 외로 명시한 네이티브 SDK 연동(현재 `StubSocialAuthService` 고정값 반환)에 본 spec 이 발급하는 state 값을 실제로 요청·전달하도록 모바일 앱을 배선하는 작업. 운영 셋업 단계로 위임한다.
- **redirect_uri 실제 요구 여부의 네이버 공식 문서 최종 확인 및 실 크레덴셜·리다이렉트 URI 등록**: 코드는 조건부로 준비되어 있으나(FR-007/008), 실제로 이 값을 채워 넣을지 여부의 최종 판단과 네이버 개발자센터 등록은 운영 작업이다.
- **GAP-015-01(infra.md 네이버 아웃바운드 엔드포인트·크레덴셜 미등재)**: 본 spec 착수 이전 별도 패치(PATCH-CXT-015-02)로 이미 해소되어 재확인하지 않는다.
- **카카오·구글에 대한 state/CSRF 메커니즘 신설**: 두 provider 는 클라이언트 토큰 검증 방식을 유지하며 본 spec 의 state 메커니즘은 네이버 code-exchange 전용이다.
- **state 값의 구체적인 저장 방식(in-memory TTL vs PostgreSQL 등) 확정**: WHAT 수준(NFR-002/004)까지만 본 spec 에서 다루고, 구체 구현은 Planning(HOW) 단계로 위임한다.
- **실 네이버 인증 흐름 E2E 검증**: 015 와 동일하게 실 크레덴셜 발급 후 별도 운영 검증으로 수행한다(SC-009 deferred 포함).

### 사후 운영 검증 피드백 사이클 (PROC-014)

본 spec 파이프라인 종료 후 실 크레덴셜 발급 및 네이티브 앱의 state 발급 엔드포인트 호출 배선이 완료되는 시점에 아래 시나리오를 수동 점검한다.

1. **state 발급→인증→검증 전체 흐름**: 실 크레덴셜 등록 및 네이티브 앱 배선 완료 후, 실제 state 발급 → 네이버 인증 화면 → 콜백 → code-exchange 검증까지 전체 흐름이 정상 동작하는지 확인한다.
2. **state 만료 처리**: state 발급 후 TTL 이 경과한 뒤 재시도할 경우 사용자에게 적절한 오류 메시지가 표시되고 재시도(재발급)가 가능한지 확인한다.
3. **redirect_uri 최종 확인**: 네이버 공식 문서로 redirect_uri 요구 여부를 최종 확인한 뒤, 필요 시 환경변수를 설정하고 정상 동작하는지 확인한다.
4. **카카오·구글 회귀 확인**: 본 spec 배포 후에도 기존 카카오·구글 로그인이 정상 동작하는지 확인한다.

사후 운영 검증에서 결함 발견 시: 결함 정보를 hotfix spec 입력으로 사용 → main session 의 "spec 수정" 이벤트 → 별도 patch spec 진입. 미수행 시 크레덴셜 발급·네이티브 연동 착수 시점에 위 시나리오 점검 일정을 별도 수립한다.

---

## 미결 사항

미결 사항 없음. [NEEDS CLARIFICATION] 0건.

> Q-A(state CSRF 하드닝 범위)·Q-B(redirect_uri 하드닝 범위)·Q-C(구현 대상 성격) 3개 결정 사항은 코디네이터 경유 사용자 확정 답변을 반영했다(근거: `spec-input.md` "질문 분석 근거" 절). state 저장 구체 방식은 논리적 불확실성이 아닌 HOW 수준 결정이므로 Planning 단계로 명시적으로 위임되었으며 미결 사항에 해당하지 않는다.
