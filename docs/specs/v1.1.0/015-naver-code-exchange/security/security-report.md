---
작성: Security Agent
버전: v1.1
최종 수정: 2026-07-03 14:10
상태: 확정
---

# 보안 감사 결과 — 015-naver-code-exchange

> base commit: `6b64c24` (014 완료 시점). 본 감사는 015 의 DIFF(`DIFF-015-naver-code-exchange.md`) 변경분과,
> 014 `security-report.md`(v1.3, SEC-001 최종 판정 — Naver 완전 제외) 대비 재도입된 코드 경로를 대상으로 한다.
> spec.md NFR-003/SC-018 이 명시적으로 "본 재감사가 GAP-014-08/GAP-014-10 소거 여부의 최종 판정자"로 지정했다.
>
> **v1.1 갱신 (재감사)**: v1.0 이 BLOCKED 확정한 SEC-015-01(High) 에 대해 사용자 결정(naver 를
> `AUTO_LINK_PROVIDERS` 에서 제외)이 Development(run-007)·Test AUTHORING(5a)·Test EXECUTION(5b)
> 재작업으로 반영된 이후 코드를 재검증한 결과다. §"SEC-015-01 재감사 (v1.1)" 절 참조.

## 목차

- [검토 범위](#검토-범위)
- [요약](#요약)
- [Constitution 보안 조항 이행 현황](#constitution-보안-조항-이행-현황)
- [PATCH-014-02 — 계정 해석 경로 전수 분석](#patch-014-02--계정-해석-경로-전수-분석)
- [SEC-001 (014 계승) — 재판정](#sec-001-014-계승--재판정)
- [SEC-015-01 재감사 (v1.1)](#sec-015-01-재감사-v11)
- [취약점 목록](#취약점-목록)
- [NFR-XXX / SC-XXX 보안 요구사항 이행 현황](#nfr-xxx--sc-xxx-보안-요구사항-이행-현황)
- [권고사항](#권고사항)

---

## 검토 범위

**DIFF 변경 파일(14 tracked + 4 신규, base 6b64c24)** 중 보안 관련 전부를 코드 레벨로 직접 확인:

- `apps/backend/src/modules/auth/social/naver.provider.ts` (재작성 — code-exchange)
- `apps/backend/src/modules/auth/social/social-provider.port.ts` (context 파라미터 확장)
- `apps/backend/src/modules/auth/social/social-provider.resolver.ts` (naver 재편입)
- `apps/backend/src/modules/auth/social-auth.service.ts` (`AUTO_LINK_PROVIDERS` naver 추가 — 계정해석 3경로 전수 분석 대상)
- `apps/backend/src/modules/auth/dto/social-login.dto.ts` (`SUPPORTED_PROVIDERS`·`state` 필드)
- `apps/backend/src/modules/auth/auth.controller.ts` (`dto.state` 전달)
- `mobile/customer_app/lib/features/auth/social_auth_service.dart`·`login_screen.dart`·`core/providers.dart` (naver 버튼·state 흐름)
- `apps/backend/.env.example` (`NAVER_CLIENT_ID`/`NAVER_CLIENT_SECRET` 재확인)

**대조 확인(무변경 검증, NFR-004 회귀 방지 목적)**:

- `apps/backend/src/modules/auth/social/kakao.provider.ts`, `google.provider.ts` — DIFF 파일 목록에 없음(무변경) 확인 후, naver 와의 앱바인딩·이메일 검증 방식 차이를 대조 분석하는 데만 사용.

**제외 파일 및 사유**: 신규 테스트 파일(`naver.provider.spec.ts`·`social-auth.service.naver.spec.ts`·Flutter naver 테스트 2종)은 커버리지 확인용으로만 열람했으며 보안 취약점 자체의 근거로 삼지 않음(테스트 코드는 공격 표면이 아님).

---

## 요약

- 대상 파일 수 (v1.0 최초 감사): 8 (보안 관련 직접 검토) + 2 (무변경 대조)
- 대상 파일 수 (v1.1 재감사, 재작업 범위): `social-auth.service.ts` 1개 + 회귀 확인용 테스트 3 suites
- **v1.0 최초 판정: Critical 0 / High 1건(SEC-015-01) / Medium 1건(SEC-015-02) / Low 1건(SEC-015-03) → `status: BLOCKED`**
- **v1.1 재감사 최종 판정: Critical 0건 / High 0건(SEC-015-01 → RESOLVED) / Medium 1건(SEC-015-02, 잔존) / Low 1건(SEC-015-03, 잔존)**
- **최종 판정: `status: COMPLETE`, `gate: PASS`** — Critical/High 0건. Medium 이하 2건은 권고사항으로 처리(운영 셋업 착수 전 선행 조건, Retrospective 위임).
- **SEC-001(014 계승) 재판정**: 원 위협모델("제3자 앱이 발급한 access token/authorization code 의 재전송에 의한 앱바인딩 우회")은 **RESOLVED**로 유지한다. code-exchange(client_secret confidential client 흐름)가 이 위협모델을 프로토콜 수준에서 완전히 차단함을 코드로 확인했다.
- 그러나 spec.md NFR-003 의 문언("GAP-014-08/GAP-014-10 이 우려한 '제3자 앱 발급 토큰의 재전송에 의한 계정 탈취' 위험의 전제가 소거")은 **정확히 그 좁은 범위(제3자 앱 토큰 재전송)에 대해서만 참**이다. 본 감사는 이 범위 밖에 있는 **별도의, 원인이 다른 계정 탈취 벡터**(공격자 자신이 소유한 정규 naver 계정에 victim 의 이메일을 등록하여 정상적인 code-exchange 로그인을 수행 — app-binding 우회가 전혀 필요 없음)를 신규로 확정했다(SEC-015-01). 이는 plan.md·research.md 가 "이메일 verified 플래그 부재"로 명시적으로 남겨둔 잔여 위험이며, 코드 어디에도 완화 장치가 없다.

---

## Constitution 보안 조항 이행 현황

`.claude/docs/constitution.md` 확인 결과 보안·인증 관련 전용 조항은 없음(P-001~P-007 은 모듈 경계·AWS 배제·단일 DB·클라우드 중립·결제 정합성·테스트·스펙 범위 원칙). 해당 사항 없음.

---

## PATCH-014-02 — 계정 해석 경로 전수 분석

`SocialAuthService.login()` (`social-auth.service.ts:45-143`) 의 계정 해석은 provider 무관 공통 로직으로 3개 분기를 순차 시도한다. naver 재도입으로 이 3개 경로 모두에 naver 가 새로 도달 가능해졌으므로, **각 경로를 개별적으로 — 한 경로의 완화가 다른 경로에 자동 적용된다고 가정하지 않고 — 분석**한다.

### Path 3a — `providerId` 매칭 재로그인 (`:63-67`)

```ts
const existing = await this.repo.findByProviderAndProviderId(provider, profile.providerId);
if (existing) {
  return this.authService.issueTokensForUser(existing.user);
}
```

- **신뢰 근거**: `(provider, providerId)` 복합키로 조회된 `social_accounts` 레코드가 특정 `user` 에 이미 연결되어 있다는 사실 그 자체.
- **검증 수단**: **없음** — 이 분기는 `AUTO_LINK_PROVIDERS`/`autoLinkAllowed` 를 전혀 참조하지 않으며(014 GAP-014-10 이 이미 확인한 구조, 015 에서도 diff 없음), 레코드가 "누구에 의해, 어떤 근거로" 최초 생성되었는지 재확인하지 않는다. 이 경로의 안전성은 **전적으로 레코드 생성 시점(Path 3b 또는 3c)의 안전성에 상속(inherit)**된다.
- **판정**: Path 3a 자체에 신규 결함은 없다(014 코드 무변경). 그러나 **Path 3b 에 결함이 있으면(아래 참조) Path 3a 는 그 피해를 영구화하는 통로가 된다** — 공격자가 3b 로 한 번 자동연동에 성공하면, 이후 무기한 재로그인(3a)으로 victim 계정의 JWT 를 계속 재발급받을 수 있다. "3a 는 이미 code-exchange 로 안전해진 provider 만 도달하므로 안전하다"는 가정은 **3b 의 검증 공백을 통해 성립하지 않게 된다** — 두 경로는 독립적으로 판정해야 한다는 원칙(PATCH-014-02)이 실제로 여기서 작동한다.

### Path 3b — email 매칭 자동연동 (`:69-101`)

```ts
const existingUser = await this.repo.findUserByEmail(email);
if (existingUser) {
  if (!autoLinkAllowed) { throw new ConflictException(...); }
  await this.repo.createSocialAccount({ userId: existingUser.id, provider, providerId: profile.providerId, email, name: profile.name });
  return this.authService.issueTokensForUser(existingUser);
}
```

- **신뢰 근거**: naver 오픈API(`GET /v1/nid/me`)가 반환한 `response.email` 문자열이 **그 naver 계정 소유자에게 실제로 귀속된 이메일 주소**라는 가정. `autoLinkAllowed`(= `AUTO_LINK_PROVIDERS.has('naver')`, 015 에서 신규 `true`)가 이 경로 진입을 허용하는 유일한 게이트다.
- **검증 수단**: **CONFIRMED — 없음.**
  - code-exchange(client_secret 교환)는 "이 authorization code 가 DOA 앱(client_id)에 대해 발급되었는가"만 보증한다. 이는 **누가 이 code 를 획득했는가(앱바인딩)**의 문제이지, **그 naver 계정의 email 필드에 적힌 주소를 그 계정 소유자가 실제로 소유·검증했는가(이메일 소유권 검증)**의 문제와 완전히 별개다. 공격자가 **자기 자신의 정상적인 naver 계정**(직접 가입, code-exchange 정상 완료 가능)의 프로필 `email` 필드에 **victim 의 실제 DOA 가입 이메일 주소**를 등록하고 정상적으로 DOA 앱을 통해 naver 로그인을 완료하면, code-exchange 검증은 100% 통과(공격자가 실제로 이 code 를 발급받았고, DOA 앱을 통해 정상 authorize 했으므로)하지만 반환되는 `email` 은 victim 소유의 것이다. 이 요청이 `/auth/social-login`(익명 공개 엔드포인트, `auth.controller.ts:52-58`)에 도달하면 Path 3b 가 `findUserByEmail(victim email)` 로 victim 의 기존 계정을 찾아 **비밀번호·추가 확인 없이 즉시 자동 연동 + JWT 발급**한다 — 공격자가 victim 의 DOA 계정을 완전히 탈취한다.
  - **naver.provider.ts 코드 대조**: `google.provider.ts:44-46` 은 `data.email_verified !== 'true'` 시 명시적으로 거부하는 검증을 갖고 있다. `naver.provider.ts:89-93` 은 `profileData.response.email` 을 어떤 검증도 없이 그대로 `SocialProfile.email` 에 매핑한다. 대응하는 "email verified" 필드 자체가 `NaverProfileResponse` 인터페이스(`naver.provider.ts:16-24`)에 정의되어 있지 않다 — 네이버 오픈API(`/v1/nid/me`) 공식 응답 필드(id·nickname·name·email·gender·age·birthday·profile_image·birthyear·mobile)에는 Google 의 `email_verified` 에 대응하는 필드가 존재하지 않는 것으로 파악된다(공식 문서 실시간 조회 도구 한계로 100% 확정은 불가 — research.md 도 동일 한계를 이미 기재함). 코드에 검증 로직이 없다는 사실 자체는 100% 확인됨(직접 Read).
  - **Kakao 와의 비교**: `kakao.provider.ts` 도 `is_email_verified`/`is_email_valid` 대조 로직이 없어 동일한 이론적 결함을 갖지만, Kakao Developers 플랫폼은 비즈니스 앱 인증을 받지 않은 일반 앱에는 기본적으로 **검증된 이메일만** 반환하는 것으로 알려져 있어(카카오 플랫폼 차원의 구조적 완화), 코드 부재가 곧바로 동일 수준의 실질 위험으로 이어지지 않을 가능성이 있다. Naver 에는 이에 대응하는 플랫폼 차원의 보장이 확인되지 않는다. 따라서 **"Kakao 도 검증 코드가 없으니 Naver 도 기존 위험 수준과 동일하다"는 논리는 성립하지 않는다** — 이 판단은 Kakao 플랫폼 동작에 대한 확증 없이 위험을 하향할 수 없다는 원칙(추측 금지)에 따라 별도로 취급한다.
- **판정**: **CONFIRMED, 미완화.** NFR-003("code-exchange 방식은 ... 앱에 귀속됨이 프로토콜 수준에서 보장된다")의 주장은 이 공격 벡터에 대해 **적용되지 않는다** — 앱바인딩과 이메일 소유권은 독립적인 두 가지 보증이며, 전자를 확보했다고 후자가 자동으로 확보되지 않는다. → **SEC-015-01 (High)**.

### Path 3c — 신규 사용자 생성 (`:104-118`, P2002 race fallback `:119-142`)

```ts
const newUser = await this.repo.createUser({ email, name: profile.name, password: null });
await this.repo.createSocialAccount({ userId: newUser.id, provider, providerId: profile.providerId, email, name: profile.name });
```

- **신뢰 근거**: 없음 — 기존 계정에 대한 권한 주장이 아니라 신규 독립 계정 생성이므로, 이 경로 자체는 "계정 탈취"에 해당하지 않는다.
- **검증 수단**: 해당 없음(신규 생성이므로 검증 대상 자산이 없음). 단, `users.email @unique` 제약으로 인해 email 이 **아직 DOA 미가입** 상태여야만 이 경로에 도달한다.
- **판정**: **계정 탈취 관점에서는 노출 없음**으로 확정. 다만 부가적으로 — 공격자가 victim 의 실제 사용 이메일(아직 DOA 미가입)을 자신의 naver 프로필에 등록하고 로그인하면, victim 명의의 "선점(pre-emption)" 계정이 생성되어 (1) victim 의 향후 정상 이메일/비밀번호 가입을 `users.email` 유니크 제약 충돌로 방해하거나, (2) victim 이 추후 실수로 naver 로그인을 시도할 경우 Path 3a 로 공격자 소유 계정에 로그인하게 되는 간접적 사용자 경험 저해가 가능하다. 이는 기존 자산 탈취가 아니므로 심각도는 낮으나(계정 가용성 저해, DoS 성격), SEC-015-01 의 근본 원인(이메일 소유권 미검증)과 동일 원인에서 파생되는 2차 영향으로 기록한다(별도 SEC 번호 없이 SEC-015-01 권고에 통합).

### 종합 결론

- Path 3a: 자체 결함 없음(014 무변경) — 단, Path 3b 결함의 피해를 영속화하는 전파 경로로 작동.
- **Path 3b: CONFIRMED 취약(SEC-015-01, High)** — code-exchange 앱바인딩은 이 경로의 신뢰 전제(이메일 소유권)를 검증하지 않는다.
- Path 3c: 계정 탈취 노출 없음 — 계정 선점형 2차 영향만 존재(SEC-015-01 권고에 통합).
- **"code-exchange 앱바인딩 확보로 자동연동이 안전해졌다"는 명제는 부분적으로만 참이다.** 정확한 범위: *"제3자 앱이 발급한 토큰/코드를 재전송하는 공격"*(GAP-014-08/10 원문 위협모델)에 대해서는 참이다. *"공격자 자신의 정규 계정에 타인의 이메일을 등록하고 정상 로그인하는 공격"*(본 감사가 신규 확정)에 대해서는 거짓이다. 두 위협모델은 원인이 다르므로 한쪽의 완화가 다른 쪽에 자동 적용되지 않는다(PATCH-014-02 원칙 그대로 적용됨).

---

## SEC-001 (014 계승) — 재판정

- **원 위협모델**(014 security-report.md v1.1~v1.3): "제3자 애플리케이션이 발급받은 access token(또는 이번 case 의 authorization code)을 공격자가 그대로 DOA 백엔드에 재전송하여, 앱 바인딩 검증 부재를 이용해 victim 의 프로필을 사칭"하는 공격.
- **재판정**: **RESOLVED (범위 한정 유지).** `naver.provider.ts` 가 이제 authorization code + `client_secret` 교환(confidential client 흐름)만을 신뢰하므로, 제3자 앱은 DOA 의 `client_secret` 없이는 어떤 code 도 access_token 으로 교환할 수 없다 — code 자체가 발급 시점에 특정 `client_id`(DOA)에 대해서만 유효하도록 OAuth 프로토콜 수준에서 바인딩되며, 이 바인딩은 백엔드가 아닌 네이버 인증 서버가 강제한다(코드 레벨로는 확인 불가한 외부 프로토콜 보증이나, 이는 OAuth Authorization Code Grant 의 표준 요구사항이며 GAP-014-08 원문이 제안한 완화 대안과 정확히 일치하는 설계다). `client_secret`·naver `access_token` 은 지역 변수로만 보유되며 응답·예외 메시지·로그 어디에도 노출되지 않음을 `naver.provider.ts` 전문 Read 로 확인했다(SC-004/SC-017 충족).
- **주의**: 이 RESOLVED 판정은 **원 위협모델의 좁은 범위**에 한정된다. 계정 탈취라는 최종 결과가 같다고 해서 SEC-015-01(이메일 소유권 미검증, 위협모델이 다름)까지 함께 RESOLVED 되는 것은 아니다.

---

## SEC-015-01 재감사 (v1.1)

### 재검토 대상 코드 변경

`git status`/`git diff 6b64c24 --stat` 로 v1.0 감사 이후 변경 범위를 재확인한 결과, 본 재작업이
건드린 파일은 `apps/backend/src/modules/auth/social-auth.service.ts` 1개뿐이다(테스트 파일
`social-auth.service.naver-autolink-exclusion.spec.ts`(신규) 및 `social-auth.service.autolink-policy.spec.ts`·
`social-auth.service.naver.spec.ts` 는 5a 병렬 반영). `naver.provider.ts`·`kakao.provider.ts`·
`google.provider.ts`·`social-provider.port.ts`·`social-provider.resolver.ts`·`auth.controller.ts`·
`auth.module.ts`·`dto/social-login.dto.ts` 는 v1.0 감사 시점 이후 무변경(diff 없음) — v1.0 이 이미
검토한 상태 그대로다. 재작업 범위가 좁게 격리되어 있음을 확인했다.

### Path 3b — 재검증

`social-auth.service.ts:29-30` 를 직접 Read 로 확인: `AUTO_LINK_PROVIDERS = new Set(['kakao', 'google'])`.
naver 는 이제 `autoLinkAllowed`(`:63`) 가 `false` 로 평가된다. `:74-88`(Path 3b) 를 재확인 —
`existingUser` 가 존재하고 `!autoLinkAllowed` 인 경우 `ConflictException` 을 즉시 throw 하고
`createSocialAccount`·`issueTokensForUser` 어느 쪽도 호출되지 않는다(코드 흐름상 도달 불가 —
`return` 이전에 `throw`). v1.0 이 확정한 공격 시나리오(공격자가 자신의 정규 naver 계정에 victim
이메일을 설정 후 정상 로그인 → 자동연동)는 **1단계(자동연동 시도) 자체가 차단**되어 성립하지
않는다.

### Path 3c race-fallback — 재검증

`:127-136`(P2002 동시성 경합 처리) 도 동일 원칙으로 방어됨을 확인 — `raceResult`(providerId 매칭)
가 없고 `!autoLinkAllowed` 인 경우 동일하게 `ConflictException` 을 throw 한다(`findUserByEmail`
재조회로 이어지는 자동연동 경로 자체가 원천 차단). v1.0 이 3b 만 언급했으나 3c race-fallback
경로도 동일한 신뢰 전제(이메일 소유권 미검증)를 공유하므로(PATCH-014-02 원칙 — 완화가 자동
전파되지 않는다는 가정 하에) 별도로 재확인했고, 코드상 `autoLinkAllowed` 가드가 3b·3c-race
양쪽에 동일하게 적용됨을 확인했다.

### Path 3a — 재검증 (공격 영속화 경로 소거 여부)

v1.0 은 "Path 3a 자체는 결함이 없으나, 3b 가 생성한 오염된 레코드를 영속화하는 통로로
작동한다"고 판정했다. 이제 3b/3c-race 가 naver 에 대해 자동연동 레코드를 **생성 자체를 하지
않으므로**, victim 계정에 연결된 공격자 소유 naver `social_accounts` 레코드가 애초에 존재할 수
없다. 따라서 Path 3a(`:66-69`, providerId 매칭)는 naver 사용자에 대해 여전히 검증 로직을
포함하지 않지만(코드 무변경, 014 GAP-014-10 이 지적한 구조 그대로), **영속화할 오염된 레코드가
공급되지 않으므로 이 감사가 문제 삼은 공격 경로 자체가 성립하지 않는다.** "한 경로의 완화가
다른 경로에 자동 적용된다고 가정하지 않는다"(PATCH-014-02)는 원칙에 따라, 이는 3a 자체의
완화가 아니라 **3a 로 도달할 악성 입력이 3b/3c 단에서 제거되었다는 별개의 근거**로 명시한다.

### 잔존 2차 영향 (계정 탈취 아님 — v1.0 대비 상태 불변)

Path 3c(신규 독립 계정 생성)는 `autoLinkAllowed` 와 무관하게 항상 도달 가능하므로(기존 계정과
이메일이 겹치지 않는 경우), 공격자가 victim 의 **미가입** 이메일을 자신의 naver 프로필에 설정하고
로그인하면 victim 명의의 선점(pre-emption) 계정이 여전히 생성된다. 이는 v1.0 이 이미 "계정
탈취가 아닌 가용성 저해(DoS 성격) 2차 영향"으로 SEC-015-01 권고에 통합해 기록한 사항과 동일하며,
본 재작업의 범위(AUTO_LINK 화이트리스트 조정)가 애초에 해소 대상으로 삼지 않았다. 신규 심각도
상향 요인 없음 — 기존 권고(수정 방향 3: 이메일 소유권 검증 도입, 또는 4: 위험 수용 등재)로
계속 추적한다.

### 회귀 확인

`pnpm exec jest social-auth.service.naver-autolink-exclusion.spec.ts social-auth.service.autolink-policy.spec.ts social-auth.service.naver.spec.ts`
직접 실행 — 3 suites / 15 tests 전부 PASS. `it.each(['kakao','google'])` 케이스로 두 provider 의
자동연동이 계속 정상 동작함(`createSocialAccount` 호출·`issueTokensForUser` 정상 반환)을
독립적으로 재확인했다. `kakao.provider.ts`·`google.provider.ts` 자체는 diff 없음(무변경) —
NFR-004 재확인.

### SEC-015-01 최종 판정

**RESOLVED.** Path 3b·3c-race 양쪽에서 naver 의 자동연동(이메일 매칭에 의한 기존 계정 연결)이
`autoLinkAllowed` 가드로 원천 차단되었고, 그 결과 Path 3a 를 통한 영속화 경로도 함께 성립하지
않는다. 근본 원인(naver 프로필 email 필드의 소유권 미검증) 자체는 코드 수준에서 해소되지
않았으나(`naver.provider.ts` 무변경), **공격이 도달할 수 있는 유일한 진입점(자동연동)이
화이트리스트에서 배제되어 공격 표면이 제거**되었다. 이는 v1.0 권고 "수정 방향 1"(naver 를
`AUTO_LINK_PROVIDERS` 에서 제외)을 정확히 채택한 결과이며, v1.0 이 우려했던 "014 v1.1 권고와
동일 패턴이 이번에도 Path 3a 잔존 위험을 남기지 않는가"(014 v1.2 재감사 전례) 라는 질문에 대해
— 본 감사는 위 "Path 3a — 재검증" 절의 근거로 **naver 는 3b/3c 어느 경로로도 기존 사용자 계정에
연결되는 소셜 레코드를 생성할 수 없으므로, 014 당시와 달리 3a 잔존 위험이 없다**고 확정한다.

---

## 취약점 목록

### SEC-015-01 — Naver 자동연동(Path 3b)의 이메일 소유권 미검증에 의한 계정 탈취

- **심각도**: **High**
- **OWASP**: A04:2021 (Insecure Design) / A07:2021 (Identification and Authentication Failures) — 외부 신원 공급자(Naver)가 반환하는 미검증(unverified) 클레임(email)을 그대로 신뢰하여 기존 계정에 자동 연결.
- **위치**: `apps/backend/src/modules/auth/social-auth.service.ts:69-101`(Path 3b) — 근본 원인은 `apps/backend/src/modules/auth/social/naver.provider.ts:89-93`(email 검증 로직·필드 부재).
- **공격 시나리오**:
  1. 공격자가 자신의 실제 Naver 계정(정상 가입)의 프로필 이메일을 victim 의 실제 DOA 가입 이메일 주소로 설정(Naver 가 이 필드에 대해 별도 소유권 확인을 요구하지 않는 경우 — 본 감사 확정 사항: 코드/타입 정의 어디에도 이를 검증하거나 요구하는 흔적이 없음).
  2. 공격자가 DOA 앱(또는 `/auth/social-login` 엔드포인트에 직접 REST 호출)을 통해 정상적인 Naver OAuth 흐름을 완료 — client_secret 은 DOA 백엔드가 보유하므로 공격자 본인의 정상 계정에 대해 code-exchange 는 **정상적으로 성공**한다(앱바인딩 위반이 전혀 없다).
  3. `naver.provider.ts` 가 반환한 `SocialProfile.email` = victim 의 이메일.
  4. `SocialAuthService.login()` Path 3b 가 `findUserByEmail(victim 이메일)` 로 victim 의 기존 계정을 찾고, `autoLinkAllowed`(naver ∈ `AUTO_LINK_PROVIDERS`)가 true 이므로 **비밀번호 확인·추가 소유권 검증 없이** 공격자의 naver 계정을 victim 의 DOA 계정에 자동 연동하고 JWT(accessToken/refreshToken)를 발급한다.
  5. 공격자는 이후 Path 3a(재로그인)로 victim 계정에 무기한 재접근 가능.
- **spec 근거와의 관계**: NFR-003 은 "GAP-014-08/GAP-014-10 이 우려한 '제3자 앱 발급 토큰의 재전송' 위험의 전제가 소거되었다"고만 서술한다 — 본 공격은 제3자 앱을 전혀 사용하지 않고 공격자 자신의 정규 계정으로 수행되므로 이 서술의 적용 범위 밖이다. plan.md·research.md 는 "이메일 verified 플래그 부재"를 잔여 위험으로 명시적으로 남겼고, 이를 확정하는 것이 본 SC-018 감사의 목적이었다.
- **수정 방향** (택1 또는 조합, 최종 결정은 main session/사용자):
  1. **naver 를 `AUTO_LINK_PROVIDERS` 에서 제외**(Path 3b/3c race-fallback 자동연동만 차단, Path 3a 재로그인은 유지) — 014 v1.1 권고와 동일 패턴. 단, 014 v1.2 재감사가 이미 "이 조치만으로는 Path 3a 잔존 위험이 남는다"고 확정한 전례가 있으므로, 이번에는 Path 3a 로 도달할 이메일 소유권 미검증 계정 자체가 애초에 생성되지 않도록(3b/3c 모두에서 email 매칭·신규가입을 제한) 범위를 함께 검토해야 한다.
  2. **네이버가 이메일 검증 관련 필드를 실제로 제공하는지 공식 문서로 최종 확인** — 제공한다면 Google 과 동일하게 `naver.provider.ts` 에 검증 분기 추가. 제공하지 않는다면 대안 1 또는 3 채택.
  3. **자동연동 시 추가 소유권 확인 단계 도입**(예: 최초 연동 시 이메일 인증 링크 발송·기존 계정 비밀번호 재확인 요구) — 근본 해소이나 spec/UX 변경 필요, 별도 spec 범위.
  4. **명시적 위험 수용**(risk acceptance) — 채택 시 `context.md §6` 에 정확한 범위("naver·kakao 자동연동은 제공자의 이메일 필드를 무검증 신뢰하며, naver 는 플랫폼 차원의 보장도 확인되지 않았다")로 등재하고 사후 이상 탐지(신규 연동 시 알림 등)를 후속 과제로 추적.
- **상태**: **RESOLVED (v1.1 재감사).** 사용자 결정(수정 방향 1 채택 — naver 를 `AUTO_LINK_PROVIDERS`
  에서 제외)이 Development(run-007)·Test(5a/5b) 로 반영되었고, 본 재감사가 Path 3b/3c-race 자동연동
  차단 + Path 3a 영속화 경로 소거를 코드·테스트 양쪽으로 확인했다. 상세는 "SEC-015-01 재감사 (v1.1)"
  절 참조. 잔존 2차 영향(계정 선점형 DoS, 심각도 낮음)은 별도 SEC 번호 없이 권고사항으로 계속 추적.

### SEC-015-02 — state(CSRF) 파라미터의 서버측 실질 검증 부재

- **심각도**: Medium
- **OWASP**: A01:2021 (Broken Access Control, CSRF 하위 유형)
- **위치**: `apps/backend/src/modules/auth/social/naver.provider.ts:48-54`(`state: context?.state ?? ''` — 네이버 토큰 요청에 그대로 전달할 뿐 백엔드가 별도로 대조하지 않음), `mobile/customer_app/lib/features/auth/social_auth_service.dart`(실제 네이티브 `flutter_web_auth_2` 연동·state 생성/검증 로직이 운영 셋업으로 deferred, 현재는 `StubSocialAuthService` 가 고정 문자열 `'stub-state'` 반환).
- **설명**: ADR-007 설계는 "Flutter 가 state 를 생성하고, 콜백에서 돌아온 state 를 클라이언트가 검증"하는 모델이다. 그러나 (1) 현재 코드에는 실제 state 생성·검증 로직이 전혀 구현되어 있지 않다(네이티브 SDK 연동 자체가 deferred, spec 범위 외로 명시됨). (2) 백엔드 `naver.provider.ts` 는 클라이언트가 보낸 state 값을 네이버 토큰 엔드포인트에 그대로 전달할 뿐, 이 값이 실제로 유효한 CSRF 방지 근거로 작동하는지 자체 검증하지 않는다. 순수 pass-through 이므로 백엔드 관점에서는 CSRF 방지 효과가 없다.
- **영향**: 현재는 네이티브 연동이 없어 실질적으로 도달 불가능한 코드 경로이지만(운영 셋업 이전에는 stub 만 존재), **운영 셋업 시점에 실제 state 생성·검증 로직 구현이 누락되면 그대로 라이브 취약점이 된다.** 커스텀 URL 스킴(ADR-006) 기반 리다이렉트는 동일 스킴을 등록한 악성 앱에 의한 콜백 가로채기(scheme hijacking) 위험이 있으며, state 검증이 이 공격에 대한 1차 방어선이다.
- **수정 방향**: 운영 셋업(네이티브 SDK 연동) 완료 시 (1) Flutter 측에서 암호학적으로 안전한 난수 state 생성 후 안전하게 보관(예: 메모리, 재시작 시 폐기), (2) 콜백 수신 시 반환된 state 와 생성 시 저장한 state 를 클라이언트 측에서 대조, 불일치 시 백엔드 호출 자체를 하지 않도록 구현. 이 항목은 spec.md 범위 외로 명시된 "운영 셋업 deferred" 사항이므로 본 감사는 **차단 사유로 취급하지 않으나, 운영 셋업 착수 전 필수 선행 조건으로 gaps.md/context.md 에 등재를 권고**한다(PROC-013-03).
- **상태**: 권고사항(Retrospective 위임 대상).

### SEC-015-03 — redirect_uri 미검증(토큰 교환 요청에 미포함)

- **심각도**: Low
- **OWASP**: A05:2021 (Security Misconfiguration) 인접
- **위치**: `apps/backend/src/modules/auth/social/naver.provider.ts:48-54`(`URLSearchParams` 에 `redirect_uri` 파라미터 없음), `social-provider.port.ts:15`(`SocialVerifyContext.redirectUri` 타입만 예약, 미사용).
- **설명**: research.md 가 이미 `[TO-VERIFY]`로 확정한 사항(네이버 토큰 교환은 redirect_uri 를 요구하지 않는다는 판단, 도구 한계로 공식문서 실시간 재확인 불가)을 재확인했다. code-exchange 의 핵심 방어선은 `client_id`+`client_secret` 조합(confidential client)이며, redirect_uri 검증은 이 모델에서 보조적 방어에 해당하므로 부재가 곧바로 앱바인딩 우회로 이어지지는 않는다(SEC-001 판정에 영향 없음).
- **수정 방향**: 운영 크레덴셜 등록 시 네이버 개발자센터 공식 문서로 redirect_uri 요구 여부를 최종 확인하고, 요구되는 경우 `SocialVerifyContext.redirectUri` 예약 필드를 활용해 전송하도록 확장(코드 변경 최소, 설계상 이미 확장 여지 확보됨을 확인).
- **상태**: 권고사항(운영 셋업 전 확인 필요, 사후 운영 검증 PROC-014 대상).

---

## NFR-XXX / SC-XXX 보안 요구사항 이행 현황

| ID | 요구사항 | 이행 여부 | 비고 |
|---|---|---|---|
| NFR-002 | `client_secret`/`client_id` 환경변수 관리, 호출 시점 지연 조회(fail-closed) | **이행** | `naver.provider.ts:45-46` `getOrThrow` 확인. `.env` gitignore 확인(비밀 미커밋). |
| NFR-003 | 네이버 자동연동 안전성 근거(GAP-014-08/10 전제 소거) | **이행 (v1.1 재감사로 확정)** — 제3자 앱 토큰 재전송 위협모델은 소거 확인(SEC-001 RESOLVED, v1.0). 이메일 소유권 미검증에 의한 별도 계정 탈취 벡터(SEC-015-01)는 naver 자동연동 자체를 화이트리스트에서 배제하는 방식으로 v1.1 재감사에서 RESOLVED 확정. | 상단 "PATCH-014-02" 절·"SEC-015-01 재감사 (v1.1)" 절 참조 |
| NFR-004 | 카카오·구글 기존 동작 회귀 없음 | **이행 (v1.1 재확인)** | `kakao.provider.ts`·`google.provider.ts` v1.0 이후 diff 없음(무변경) 재확인. `it.each(['kakao','google'])` 자동연동 회귀 테스트 직접 실행 PASS(createSocialAccount 호출·정상 토큰 반환 확인). |
| SC-004 | naver access_token 응답 바디 비노출 | **이행** | `naver.provider.ts:73` 지역 변수로만 보유, `SocialProfile` 반환 타입에 미포함. (v1.1: naver.provider.ts 무변경 재확인) |
| SC-017 | `client_secret` 값이 로그·응답에 비노출 | **이행** | 예외 메시지는 네이버 `error_description`(일반 OAuth 오류 설명)만 포함, `client_secret`/code 원문 미포함. (v1.1: naver.provider.ts 무변경 재확인) |
| SC-018 | Critical/High 취약점 0건 (본 감사 최종 판정) | **충족 (v1.1 재감사 확정)** | **Critical 0 / High 0(SEC-015-01 RESOLVED) — status: COMPLETE, gate: PASS.** Medium(SEC-015-02)·Low(SEC-015-03) 2건은 권고사항으로 잔존(Retrospective 위임, 운영 셋업 착수 전 선행 조건). |

---

## 권고사항

1. **(v1.1 갱신) SEC-015-01(High)은 RESOLVED 확정.** naver 를 `AUTO_LINK_PROVIDERS` 에서 제외하는
   재작업이 Path 3b/3c-race 자동연동 및 그에 의존하던 Path 3a 영속화 경로를 코드·회귀테스트 양쪽으로
   차단함을 재감사로 확인했다. 잔존하는 2차 영향(계정 선점형 DoS, 심각도 낮음)은 항목 4의 근본 해소
   권고(이메일 소유권 검증 도입)로 계속 추적한다.
2. **(PROC-013-03) Retrospective 위임 (v1.0 유지)**: SEC-015-02(Medium, state 서버측 미검증)는 `context.md §6 알려진 제약`에 다음 문구로 additive 등재를 권고한다 — "네이버 소셜 로그인(015-naver-code-exchange)의 CSRF state 파라미터는 현재 백엔드에서 클라이언트 값을 그대로 전달만 하며 자체 검증하지 않는다. 운영 셋업(네이티브 `flutter_web_auth_2` 연동) 착수 전 반드시 클라이언트 측 state 생성·검증 로직을 구현해야 한다(SEC-015-02)." SEC-015-03(Low, redirect_uri 미확인)도 동일 섹션에 "네이버 토큰 교환의 redirect_uri 요구 여부는 운영 크레덴셜 등록 시 공식 문서로 최종 확인 필요(SEC-015-03)"로 등재 권고. 본 재감사(v1.1)는 두 항목이 재작업 범위 밖(naver.provider.ts 무변경)임을 재확인했으며 상태 변경 없음.
3. **GAP-014-08 원본 문구 재확인 권고 (v1.0 유지)**: 014 gaps.md GAP-014-08 의 "완화 대안 1"(authorization code + client_secret 교환)이 이번에 채택되었으나, 그 문구는 "앱바인딩 확보"만을 목표로 서술되어 있었고 "이메일 소유권 검증"은 별도 항목으로 다뤄지지 않았다. 향후 소셜 로그인 provider 추가/재도입 spec 에서는 "앱바인딩"과 "이메일 소유권 검증"을 별개의 체크 항목으로 분리하여 사전 검토할 것을 Retrospective Agent 를 통해 Security Agent 절차 문서에 반영 권고.
4. **Kakao 플랫폼 이메일 검증 정책 확인 권고 (v1.0 유지)**: 본 감사는 Kakao 가 비즈니스 미인증 앱에 검증된 이메일만 반환한다는 점을 코드 밖 지식으로 추정했을 뿐 코드/문서로 확정하지 못했다. 이 가정이 틀릴 경우 Kakao 경로에도 SEC-015-01 과 동일한 유형의 잠재 위험이 존재할 수 있으므로, 별도 확인(공식 문서 또는 실 테스트 앱 등록 확인) 후 필요 시 `kakao.provider.ts` 에도 이메일 검증 로직 추가를 검토할 것을 권고한다(본 spec 범위 밖 — 후속 patch spec 후보로 gaps.md 등재 권고).
5. **(v1.1 신규) GAP-015-04 gaps.md 상태 갱신 권고**: gaps.md 의 GAP-015-04(상태: "처리됨(Development) — Security 재감사(6단계) 대기")를 본 재감사 RESOLVED 확정 결과에 맞춰 "해결됨"으로 전이할 것을 Docs/main session 에 권고한다(Security Agent 는 gaps.md 직접 수정 권한 없음 — agent-rules.md §3.1).
