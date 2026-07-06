---
작성: Spec Agent
버전: v1.0
최종 수정: 2026-07-03 [시각 미확인]
상태: 확정
---

# Spec: 015-naver-code-exchange

> Branch: 015-naver-code-exchange | Date: 2026-07-03 | Version: v1.1.0

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

`v1.1.0/014-social-login` 은 카카오·구글·네이버 3개 소셜 제공자를 대상으로 설계되었으나, 검증·감사 과정에서 **네이버는 SEC-001(High)** — 네이버 공개 API 가 access token 의 app/client 바인딩(카카오의 `app_id`, 구글의 `aud` 에 대응하는 검증 수단)을 식별할 공개 엔드포인트를 제공하지 않아, 제3자 애플리케이션이 발급받은 access token 을 DOA 백엔드에 그대로 재전송해도 구분 없이 신뢰되는 근본 설계 결함 — 을 근거로 **이번 릴리즈에서 완전 제외**되었다. `SocialProviderResolver`·`SocialLoginDto`(`@IsIn(['kakao','google'])`)·`AuthModule`·Flutter `_SocialRow`/`SocialAuthService` 어디에도 naver 는 와이어링되어 있지 않으며, `naver.provider.ts` 파일만 향후 재도입을 전제로 참조용으로 보존되어 있다(014 v1.3 Security 최종 감사 확인, `docs/specs/v1.1.0/014-social-login/security/security-report.md` SEC-001·`gaps.md` GAP-014-07/08/10).

본 spec 은 **서버 사이드 authorization code + client_secret 교환 방식**(OAuth 2.0 Authorization Code Grant 의 표준 confidential-client 서버 플로우)으로 **네이버 소셜 로그인만** 안전하게 재도입한다. 이 방식은 클라이언트(Flutter)가 access token 을 직접 획득하지 않고, 대신 단기 유효한 **authorization code** 만 획득하여 백엔드에 전달한다. 백엔드는 자신만 보유한 `client_secret` 으로 그 code 를 access_token 으로 교환하므로, 발급된 토큰이 DOA 앱에 귀속됨이 OAuth 프로토콜 수준에서 보장된다 — 제3자 앱이 발급받은 code/token 을 그대로 재전송해도 (1) code 는 발급 시점의 `client_id`·`redirect_uri` 조합에 귀속되어 재사용이 거부되거나, (2) 애초에 공격자가 DOA 의 `client_secret` 을 알지 못해 자신이 획득한 code 를 DOA 명의로 교환할 수 없다. 이로써 SEC-001/GAP-014-08/GAP-014-10 이 지적한 계정 탈취 공격 체인(providerId 매칭 재로그인·email 자동연동·신규가입 3개 경로 전부)의 전제 자체가 성립하지 않게 된다.

**범위**: 본 spec 은 **네이버 재도입에 한정**한다. 카카오·구글은 014 v1.3 재감사에서 이미 app_id/aud 대조로 SEC-001 이 완전 해소된 안전한 상태이므로, 클라이언트 토큰 검증 방식을 그대로 유지하며 본 spec 에서 변경하지 않는다(혼합 방식 — 사용자 확정 결정).

**선행 인프라 재사용**: 014 가 구축한 `SocialProviderPort`(추상 포트)·`SocialProviderResolver`(provider→구현체 매핑)·`social_accounts` 테이블(`users` 스키마, `@@unique([provider, providerId])`)·`SocialAuthService` 의 계정해석 3단계(providerId 매칭 재로그인 → email 매칭 자동연동 → 신규가입)·JWT 발급 공유 로직을 변경 없이 재사용한다. `social_accounts.provider` 컬럼은 이미 문자열 타입으로 'naver' 값을 수용할 수 있으므로 **본 spec 은 신규 DB 스키마 변경을 필요로 하지 않는다**. `naver.provider.ts`(014 미와이어 상태로 보존된 파일)를 code-exchange 방식에 맞게 재작성하고, `SocialProviderResolver`·`SocialLoginDto`(`@IsIn`)·`AuthModule`(DI 등록)·Flutter `_SocialRow`/`SocialAuthService` 에 naver 를 재편입한다.

## 선행 spec 영향 추적 (Predecessor Lineage)

| 선행 spec | 식별된 결함 항목 | 결함 인지 시점 | 식별 경로 |
|---|---|---|---|
| v1.1.0/014-social-login | SEC-001(High) — 네이버 공개 API 에 access token 의 app/client 바인딩 검증 수단 부재로, 제3자 앱 발급 토큰 재전송 시 계정 탈취 가능(경로: providerId 매칭 재로그인·email 매칭 자동연동·신규가입). 최종적으로 Naver 를 활성 provider 집합에서 완전 제외하여 RESOLVED 처리 | 2026-07-02 (Security Agent v1.1~v1.3 재감사) | `security/security-report.md` SEC-001, `gaps.md` GAP-014-07/08/10 직접 확인 |
| v1.1.0/014-social-login | GAP-014-08 §완화 대안 1 — authorization code + client_secret 교환 방식으로 전환 시 근본 해소 가능하나 별도 spec 필요로 미채택·이월 | 2026-07-02 | `gaps.md` GAP-014-08 "완화 대안" 절 직접 확인 |

---

## 사용자 스토리

- **US-001**: 소비자로서, 네이버 계정으로 로그인하여 별도 회원가입 없이 DOA Market 쇼핑을 시작하고 싶다.
- **US-002**: 소비자로서, 네이버 로그인에 사용된 이메일이 기존 이메일 가입 계정(또는 카카오·구글로 이미 가입한 계정)과 같을 때 별도 연동 절차 없이 자동으로 기존 계정에 접근하고 싶다.
- **US-003**: 기존 카카오·구글 소셜 로그인 사용자로서, 본 변경 이후에도 기존 로그인 경험과 계정 데이터가 그대로 유지되길 원한다(회귀 없음).

---

## 기능 요구사항

### 백엔드 — Naver 소셜 로그인 재도입

**FR-001**: 백엔드는 소셜 로그인 API 의 지원 제공자 식별자 목록에 'naver' 를 다시 포함한다(카카오·구글·네이버 3종 지원 — 014 제외 이전 상태로 복귀).

**FR-002**: provider 가 'naver' 인 소셜 로그인 요청에서, 백엔드는 클라이언트가 전달한 값을 네이버 인증 서버가 발급한 **authorization code** 로 처리하여, 서버가 환경변수로 관리하는 `client_secret` 을 사용해 네이버 인증 서버와 교환하고 access_token 을 획득한다(서버 사이드 code-exchange). 이 교환은 백엔드에서만 수행되며 `client_secret` 은 어떤 API 응답·로그에도 노출되지 않는다.

**FR-003**: FR-002 의 code 교환이 실패(무효·만료·재사용된 code, `client_secret`/`redirect_uri` 설정 불일치 등)하는 경우 로그인 요청을 거부하고 적절한 오류 응답을 반환한다.

**FR-004**: 백엔드는 FR-002 에서 획득한 access_token 으로 네이버 프로필(providerId·email·name)을 조회한다. 이 access_token 은 백엔드 내부 처리에만 사용되며 클라이언트에 반환되거나 영속 저장되지 않는다.

**FR-005**: 카카오·구글 provider 의 소셜 로그인 처리 방식(클라이언트가 SDK 로 획득한 access/id token 을 백엔드가 제공자에 직접 검증하는 클라이언트 토큰 방식)은 본 spec 에서 변경하지 않는다.

### 백엔드 — 계정 처리 (Naver 자동연동 재허용)

**FR-006**: 네이버 소셜 로그인 요청에 대해 기존 계정 해석 우선순위(a. providerId 매칭 재로그인 → b. email 매칭 자동연동 → c. 신규가입)를 카카오·구글과 동일하게 예외 없이 전체 적용한다. 즉 네이버로 획득한 이메일이 기존 사용자 계정(이메일+비밀번호 계정 또는 카카오·구글 소셜 계정)과 동일한 경우 자동 연동을 허용한다(014 에서 네이버에 한해 도입되었던 자동연동 제한을 해제).

**FR-007**: 소셜 제공자(카카오·구글·네이버 공통)로부터 이메일이 반환되지 않는 경우 로그인을 거부하고 적절한 오류 응답을 반환한다(014 기존 동작 — 네이버 재도입 범위에도 동일 적용됨을 명시).

**FR-008**: 소셜 로그인 성공(FR-006 의 세 경로 모두)시 기존 이메일 로그인과 동일한 형식의 JWT(accessToken·refreshToken)를 발급하여 반환한다(014 기존 공유 로직 재사용, 변경 없음).

### Flutter — Naver 소셜 버튼 재활성화

**FR-009**: `LoginScreen` 의 네이버 소셜 버튼을 재활성화한다(014 에서 제거된 버튼의 복귀). 탭 시 네이버 인증 흐름이 시작된다.

**FR-010**: 네이버 인증 흐름은 앱 내 임베드된 WebView 가 아닌 **시스템 브라우저(또는 동등한 외부 인증 컨텍스트)** 를 통해 수행한다. 인증 완료 후 클라이언트는 리다이렉트를 통해 authorization code 를 수신하고, 이 code 를 백엔드 소셜 로그인 API 에 전달한다. `client_secret` 은 어떤 형태로도 클라이언트 코드·빌드 산출물에 포함되거나 클라이언트에서 사용되지 않는다.

**FR-011**: 사용자가 네이버 인증 흐름을 취소한 경우(예: 브라우저를 닫음), 로그인 화면으로 복귀하며 오류 메시지를 표시하지 않는다(카카오·구글과 동일 정책).

**FR-012**: 네이버 소셜 로그인 실패(제공자 오류·네트워크 오류·code 교환 실패·이메일 미반환 등) 시 오류 메시지를 화면에 표시하고 이메일 로그인으로 안내한다(카카오·구글과 동일 정책).

**FR-013**: 백엔드 소셜 로그인 API 로부터 JWT 응답을 수신하면 기존과 동일하게 `FlutterSecureStorage` 에 저장하고 메인 화면으로 전환한다(변경 없음 — 회귀 확인 대상).

---

## 비기능 요구사항

**NFR-001**: 네이버 소셜 로그인 백엔드 API 응답 P95 3초 이내(authorization code 교환 + 프로필 조회의 순차 외부 호출 2회 포함). 014 NFR-001 과 동일 기준을 유지한다(기존 기준이 이미 "외부 제공자 네트워크 포함"으로 여유 있게 설정되어 있어 순차 호출 1회 증가에도 별도 완화가 불필요한 것으로 판단).

**NFR-002**: 네이버 `client_secret`(및 `client_id`)은 환경변수로 관리하며, 서버가 이 값을 사용해 authorization code 를 access_token 으로 교환한다. 크레덴셜 조회는 호출 시점(교환·검증 시)으로 지연하여 미설정 상태에서도 애플리케이션 전체 기동에는 영향이 없다(fail-closed — 014 카카오·구글과 동일 패턴). 크레덴셜 실 값 발급·등록은 운영 셋업 단계에서 수행하며, 본 spec 검증 범위에서는 stub/mock 을 사용한다.

**NFR-003**: 네이버 자동연동(FR-006)의 안전성 근거 — code-exchange 방식은 `client_secret` 없이는 제3자가 authorization code 를 access_token 으로 교환할 수 없으므로, 발급된 access_token 이 DOA 앱에 귀속됨이 프로토콜 수준에서 보장된다. 이로써 GAP-014-08/GAP-014-10 이 우려한 "제3자 앱 발급 토큰의 재전송에 의한 계정 탈취" 위험의 전제가 소거된 것으로 판단한다. 이 판단은 잠정이 아니라 **6단계 Security Agent 의 최종 재감사로 확인해야 하는 필수 검토 대상**이다.

**NFR-004**: 기존 카카오·구글 소셜 로그인 동작(클라이언트 토큰 검증 방식, `app_id`/`aud` 대조 등)은 본 spec 변경으로 회귀하지 않는다.

**NFR-005**: `flutter analyze` 명령 실행 결과 0 issues (014 기준 유지).

---

## 수용 기준

### 백엔드 — Naver code-exchange 정상 흐름

**SC-001** (FR-001): `provider: 'naver'` 식별자를 포함한 소셜 로그인 요청이 지원되지 않는 provider 로 거부(400)되지 않고 처리 흐름에 진입한다(지원 목록 재포함 검증). [env:unit]

**SC-002** (FR-002, FR-004): stub/mock 으로 시뮬레이션한 유효 authorization code 로 `provider: 'naver'` 요청 시, code-exchange stub 호출 → 프로필 조회 stub 호출의 순차 흐름이 수행되고 accessToken·refreshToken(JWT)이 반환된다. [env:unit]

**SC-003** (FR-003): 무효·만료된 authorization code(stub 시뮬레이션)로 네이버 로그인 요청 시 4xx 오류가 반환된다. [env:unit]

**SC-004** (FR-004): 네이버 로그인 성공 응답 바디에 access_token(네이버로부터 교환된 토큰)이 포함되지 않는다 — 백엔드 내부 전용 처리이며 클라이언트에 노출되지 않음을 검증한다. [env:unit]

### 백엔드 — 카카오·구글 회귀 방지

**SC-005** (FR-005): `provider: 'kakao'` 및 `provider: 'google'` 로 소셜 로그인 요청 시 기존 클라이언트 토큰 검증 흐름(app_id/aud 대조 포함)이 변경 없이 수행되고 JWT 가 반환된다(014 기존 테스트 기준 회귀 0). [env:unit]

### 백엔드 — 계정 처리 (Naver 자동연동 재허용)

> **[정정 2026-07-03 — GAP-015-05]** 아래 SC-006·SC-010 의 네이버 자동연동 관련 원문 문언은
> 최종 구현과 일치하지 않는다. Security Agent 1차 감사가 **SEC-015-01(High, 이메일 소유권 미검증
> 계정 탈취)** 를 확정하여, 사용자 결정으로 **네이버는 `AUTO_LINK_PROVIDERS` 에서 제외**되었다
> (카카오·구글만 자동연동). 실제 동작: 미연동 네이버 계정의 이메일이 기존 계정과 동일하면
> **자동연동하지 않고 409 Conflict 로 거부**한다. 재로그인(SC-007)·신규가입(SC-008) 경로는 유지.
> 코드·테스트는 이미 이 안전 동작으로 동기화되어 있다(`social-auth.service.naver-autolink-exclusion.spec.ts`,
> coverage.md v1.1 "PASS\*"). 원문은 SDD 이력 보존을 위해 남기되, 실동작 기준은 본 정정 노트를 따른다.

**SC-006** (FR-006): 미연동 네이버 계정의 이메일이 기존 사용자 계정 이메일과 동일할 때 네이버 로그인 요청 시, 기존 계정에 네이버 소셜 계정이 자동 연동되고 JWT 가 반환된다(`AUTO_LINK_PROVIDERS`에 naver 포함 검증). [env:unit] — ~~자동연동~~ **최종 구현은 409 Conflict 거부**(위 정정 노트, SEC-015-01)

**SC-007** (FR-006): 이미 연동된 네이버 소셜 계정(동일 provider+providerId)으로 재로그인 요청 시 신규 연동·생성 없이 JWT 가 반환된다(재로그인 경로). [env:unit]

**SC-008** (FR-006): 네이버 이메일에 해당하는 기존 계정이 없을 때 네이버 로그인 요청 시 신규 사용자 계정이 생성되고 네이버 소셜 계정이 연동되며 JWT 가 반환된다(신규가입 경로). [env:unit]

**SC-009** (FR-007): 네이버 제공자로부터 이메일이 반환되지 않는 응답을 stub 으로 시뮬레이션할 때 로그인 요청이 4xx 오류로 거부된다. [env:unit]

**SC-010** (FR-008): SC-006/007/008 세 경로 모두 기존 이메일 로그인과 동일한 형식의 accessToken·refreshToken 이 반환된다. [env:unit] — **정정: 네이버는 자동연동(SC-006 경로)이 409 거부이므로 토큰 반환은 재로그인(SC-007)·신규가입(SC-008) 2경로 한정**(위 정정 노트, GAP-015-05)

### Flutter — 버튼 탭 핸들러 및 인증 흐름

**SC-011** (FR-009): `LoginScreen` 네이버 소셜 버튼이 탭 가능(GestureDetector 또는 동등 위젯 포함)하며 탭 핸들러가 존재한다. [env:static]

**SC-012** (FR-010): 네이버 인증 흐름 트리거 코드에 인앱 WebView 위젯이 직접 사용되지 않고, 시스템 브라우저(또는 외부 인증 컨텍스트) 경유 메커니즘이 존재함을 정적으로 확인한다. [env:static]

**SC-013** (FR-011): 네이버 인증 취소 시 로그인 화면이 유지되고 오류 메시지가 표시되지 않는다. [env:unit]

**SC-014** (FR-012): 네이버 소셜 로그인 실패(mock 4xx/네트워크 오류) 시 오류 메시지가 화면에 표시된다. [env:unit]

**SC-015** (FR-013): 네이버 소셜 로그인 성공(mock JWT 수신) 후 `FlutterSecureStorage` 에 accessToken·refreshToken 이 저장되고 메인 화면으로 전환된다. [env:unit]

### 정적·환경 검증 및 보안

**SC-016** (NFR-001): 네이버 소셜 로그인 백엔드 API P95 응답 3초 이내. [env:e2e-docker] — deferred: 실 OAuth 크레덴셜 발급·연동 후 측정. 본 spec 파이프라인 범위 외(014 SC-019 와 동일 처리 방식).

**SC-017** (NFR-002): `.env.example` 에 `NAVER_CLIENT_ID`·`NAVER_CLIENT_SECRET` 항목이 존재(014 placeholder 재확인)하며, `client_secret` 값이 로그 출력문·API 응답 바디 어디에도 포함되지 않음을 코드 검토로 확인한다. [env:static]

**SC-018** (NFR-003): 6단계 Security Agent 재감사 결과, 네이버 자동연동(FR-006)·code-exchange 흐름(FR-002~004) 관련 Critical/High 취약점이 0건으로 판정된다. [env:static]

**SC-019** (NFR-004): 014 산출물의 카카오·구글 관련 기존 단위 테스트 스위트가 본 spec 구현 후에도 회귀 없이 100% PASS 한다(네이버 신규 테스트 추가분 제외). [env:unit]

**SC-020** (NFR-005): `flutter analyze` 실행 결과 0 issues. [env:static]

---

## 요구사항 구조화 매트릭스

| US-ID | FR-ID | NFR-ID | SC-ID | [env:*] | MoSCoW |
|---|---|---|---|---|---|
| US-001 | FR-001 | — | SC-001 | unit | Must |
| US-001 | FR-002 | — | SC-002 | unit | Must |
| US-001 | FR-003 | — | SC-003 | unit | Must |
| US-001 | FR-004 | — | SC-002, SC-004 | unit | Must |
| US-003 | FR-005 | — | SC-005 | unit | Must |
| US-002 | FR-006 | NFR-003 | SC-006, SC-007, SC-008 | unit | Must |
| US-001 | FR-007 | — | SC-009 | unit | Must |
| US-001, US-002 | FR-008 | — | SC-010 | unit | Must |
| US-001 | FR-009 | — | SC-011 | static | Must |
| US-001 | FR-010 | — | SC-012 | static | Must |
| US-003 | FR-011 | — | SC-013 | unit | Must |
| US-003 | FR-012 | — | SC-014 | unit | Must |
| US-001 | FR-013 | — | SC-015 | unit | Must |
| — | — | NFR-001 | SC-016 | e2e-docker | Should (deferred) |
| — | — | NFR-002 | SC-017 | static | Must |
| US-002 | — | NFR-003 | SC-018 | static | Must |
| US-003 | — | NFR-004 | SC-019 | unit | Must |
| — | — | NFR-005 | SC-020 | static | Must |

---

## 범위 외

- **카카오·구글의 code-exchange 전환**: 두 제공자 모두 014 v1.3 재감사에서 SEC-001 이 완전 해소된 상태(app_id/aud 대조)이므로 재작업 근거가 없다. 본 spec 범위는 네이버 재도입에 한정한다(사용자 확정 결정, Q-A).
- **실 네이버 앱 등록·크레덴셜 실 값 발급**: 네이버 개발자센터 앱 등록, `NAVER_CLIENT_ID`/`NAVER_CLIENT_SECRET` 실 값 발급, redirect URI 등록 — 운영 셋업 단계 deferred. 본 spec 검증은 stub/mock 사용(014 와 동일 패턴).
- **정확한 Flutter 딥링크 패키지·URL 스킴 문자열 확정**: 시스템 브라우저 + 커스텀 URL 스킴 방식(Q-C 확정)의 구체적 구현(패키지 선정·스킴 값)은 Design 단계 `[TO-VERIFY]`(ASM-001)로 위임한다.
- **실 네이버 인증 흐름 E2E 검증**(SC-016 포함): 실 크레덴셜로 실제 네이버 로그인 흐름을 검증하는 E2E — deferred. 크레덴셜 발급 후 별도 운영 검증으로 수행.
  - 옵션 B(사용자 직접 검증): 크레덴셜·redirect URI 등록 후 실제 기기에서 네이버 소셜 로그인 1회 테스트.
- **PKCE(Proof Key for Code Exchange) 추가 도입**: 네이버 오픈API 의 PKCE 지원 여부는 미확인(`[TO-VERIFY]`, Design 위임). 미지원이어도 `client_secret` 교환(표준 confidential client 흐름)만으로 본 spec 의 보안 요구사항(NFR-003)을 충족하므로 필수 요건이 아니다.
- **소셜 계정 연동 해제(unlink)·목록 조회·프로필 이미지**: 014 범위 외를 그대로 승계.
- **로그인 상태에서 소셜 계정 추가 연동, 소셜 전용 사용자 비밀번호 재설정 흐름 수정**: 014 범위 외를 그대로 승계.

### 사후 운영 검증 피드백 사이클 (PROC-014)

본 spec 파이프라인 종료 후 실 크레덴셜 발급 및 네이버 개발자센터 앱 등록·운영 환경 배포 시 아래 시나리오를 수동 점검한다.

1. **네이버 신규 로그인**: 앱에서 네이버 버튼 탭 → 시스템 브라우저로 네이버 인증 화면 이동 → 로그인 → 앱으로 복귀(딥링크) → authorization code 백엔드 전달 → code-exchange 성공 → 메인 화면 이동 확인.
2. **네이버 자동연동**: 기존 이메일 계정(또는 카카오·구글 연동 계정)과 동일 이메일의 네이버 계정으로 로그인 시 기존 계정으로 로그인되는지 확인.
3. **네이버 재로그인**: 이미 네이버로 연동된 계정으로 재로그인 시 신규 연동 없이 정상 로그인되는지 확인.
4. **네이버 인증 취소**: 시스템 브라우저에서 인증을 취소(뒤로가기/닫기)했을 때 앱이 로그인 화면으로 정상 복귀하는지 확인.
5. **카카오·구글 회귀 확인**: 본 spec 배포 후에도 기존 카카오·구글 로그인이 정상 동작하는지 확인.

사후 운영 검증에서 결함 발견 시: 결함 정보를 hotfix spec 입력으로 사용 → main session 의 "spec 수정" 이벤트 → 별도 patch spec 진입. 미수행 시 크레덴셜 발급 완료 시점에 위 시나리오 점검 일정을 별도 수립한다.

---

## 미결 사항

미결 사항 없음. [NEEDS CLARIFICATION] 0건.

> Q-A(적용 범위)·Q-B(client_secret 조달)·Q-C(redirect/딥링크 구성)·Q-D(Naver 자동연동 재허용) 4개 결정 사항은 코디네이터 경유 사용자 확정 답변을 반영했다(근거: `spec-input.md` "질문 분석 근거" 절). 딥링크 패키지·URL 스킴 값 등 구현 세부사항은 Design 단계 `[TO-VERIFY]`(ASM-001)로 명시적으로 위임되었으며, 이는 논리적 불확실성이 아닌 HOW 수준 결정이므로 미결 사항에 해당하지 않는다.
