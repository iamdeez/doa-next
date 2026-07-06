---
작성: Security Agent
버전: v1.3
최종 수정: 2026-07-02 20:40
상태: 확정
---

# 보안 감사 결과 — 014-social-login

## 목차

- [검토 범위](#검토-범위)
- [요약](#요약)
- [Constitution 보안 조항 이행 현황](#constitution-보안-조항-이행-현황)
- [취약점 목록](#취약점-목록)
- [NFR-XXX / SC-XXX 보안 요구사항 이행 현황](#nfr-xxx--sc-xxx-보안-요구사항-이행-현황)
- [권고사항](#권고사항)

---

## 검토 범위

DIFF-014-social-login.md(base `58ee0d1`) 변경 파일 전수 + plan.md §인터페이스 계약에서 지시한 인증 경계 파일을 검토 대상으로 확정했다.

> **v1.1 재감사** — SEC-001(High) 수정 후 [복귀] 재감사. 추가 검토 대상: `kakao.provider.ts`(app_id 대조 로직 신규), `kakao.provider.spec.ts`(신규 회귀 테스트), `naver.provider.ts`(docstring 만 변경, 로직 diff 0), `apps/backend/.env.example`(`KAKAO_APP_ID` 신설), `social-provider.resolver.ts`·`dto/social-login.dto.ts`(우회 경로 재확인용), `social-auth.service.ts`(무변경 재확인), `run-008-development-agent.md`(수정 근거), `gaps.md` GAP-014-07/08. 코드는 `apps/backend/src/main.ts`·`auth.controller.ts` 상단(전역 예외필터·컨트롤러 catch 존재 여부, fail-open 경로 재확인용)까지 확장 확인했다.
>
> **v1.2 재감사 2차** — 사용자 결정(Naver FR-005 자동연동 비활성)에 따른 Development Agent 수정(run-012) 후 [복귀] 재감사. 추가 검토 대상: `social-auth.service.ts`(`AUTO_LINK_PROVIDERS` 화이트리스트·path 3b/3c 게이팅 전문 재확인 + **path 3a 게이팅 여부 신규 검증**), `naver.provider.ts`(docstring 갱신분), `social-auth.service.autolink-policy.spec.ts`(신규 회귀 테스트 4건), `auth.repository.ts`(`findByProviderAndProviderId` 쿼리 스코핑), `schema.prisma`(`SocialAccount.@@unique([provider, providerId])` 복합키 확인), `run-012-development-agent.md`, `gaps.md` GAP-014-08/09.
>
> **v1.3 재감사 3차·최종 (본 회차)** — path 3a 잔존(GAP-014-10)에 따라 사용자가 최종적으로 "Naver 를 이번 릴리즈에서 완전 제외"(security-report.md v1.2 권고 (b))를 채택, Development Agent 수정(run-015) 후 [복귀] 재감사. 추가 검토 대상: `social-provider.resolver.ts`(kakao·google 2개만 매핑, naver 요청 시 `UnauthorizedException`), `dto/social-login.dto.ts`(`SUPPORTED_PROVIDERS=['kakao','google']`, `@IsIn` 화이트리스트에서 naver 제거), `auth.module.ts`(`NaverProvider` providers 배열에서 제거·DI 미와이어), `main.ts`(전역 `ValidationPipe(whitelist/forbidNonWhitelisted/transform)` 존재 재확인 — DTO 검증이 컨트롤러 진입 전에 강제됨), `auth.controller.ts`(`socialAuthService.login` 호출 지점이 코드베이스 전체에서 1곳뿐임을 재확인), `kakao.provider.ts`·`google.provider.ts`(앱바인딩 로직 무변경 재확인), `naver.provider.ts`(미와이어 상태로 파일만 보존, docstring 갱신), Flutter `login_screen.dart`(`_SocialRow`에서 네이버 버튼 제거)·`social_auth_service.dart`(`SocialAuthService` 추상 인터페이스에서 `signInWithNaver` 부재)·`providers.dart`(naver 참조 0건), `run-015-development-agent.md`, `gaps.md` GAP-014-08/09/10.

**검토 대상 (실 코드 직접 확인)**:

- `apps/backend/src/modules/auth/social/social-provider.port.ts`
- `apps/backend/src/modules/auth/social/kakao.provider.ts`
- `apps/backend/src/modules/auth/social/google.provider.ts`
- `apps/backend/src/modules/auth/social/naver.provider.ts`
- `apps/backend/src/modules/auth/social/social-provider.resolver.ts`
- `apps/backend/src/modules/auth/social/stub-social.provider.ts`
- `apps/backend/src/modules/auth/social-auth.service.ts`
- `apps/backend/src/modules/auth/dto/social-login.dto.ts`
- `apps/backend/src/modules/auth/auth.controller.ts`
- `apps/backend/src/modules/auth/auth.module.ts`
- `apps/backend/src/modules/auth/auth.repository.ts`
- `apps/backend/src/modules/auth/auth.service.ts` (login() null 가드, issueTokensForUser 공유 helper)
- `apps/backend/prisma/schema.prisma` (`SocialAccount` 모델·`User.password` nullable diff)
- `apps/backend/src/shared/prisma/prisma.service.ts` (`tx` getter·`runInTransaction` 동작 확인 — GAP-014-01 cross-check)
- `mobile/customer_app/lib/features/auth/social_auth_service.dart`, `lib/core/providers.dart` (StubSocialAuthService 프로덕션 와이어링 여부 확인)
- `apps/backend/src/main.ts` (v1.3 재확인 — 전역 `ValidationPipe(whitelist/forbidNonWhitelisted/transform)` 등록 확인)

**제외 파일 및 사유**:

- `apps/backend/src/modules/auth/dto/auth-response.dto.ts` — 응답 타입 선언만(순수 타입, 로직 없음). 민감정보 노출 필드 없음(accessToken/refreshToken 은 기존 login 응답과 동일 shape).
- `apps/backend/src/modules/auth/auth.service.spec.ts`, `social-auth.service.spec.ts`, `mobile/customer_app/test/**` — 테스트 코드(프로덕션 공격 표면 아님). production 코드 확인의 보조 근거로만 grep 참조.
- `apps/backend/prisma/migrations/20260701064209_add_social_accounts/migration.sql` — schema.prisma diff 와 동일 내용의 SQL 산출물, 별도 검토 불필요.
- `apps/backend/.env.example` — 크레덴셜 실 값 없음(플레이스홀더), NFR-004 static 존재 검증 대상. 크레덴셜 사용 지점은 각 provider 파일에서 확인.

## 요약

- 대상 파일 수: 15개 (최초) + 7개 (v1.1 재감사) + 6개 (v1.2 재감사 2차) + 9개 (v1.3 재감사 3차·최종 추가 확인) = 37개 누적 (실 코드 직접 확인)
- Critical: 0건 / **High: 0건 (v1.3 갱신 — SEC-001 최종 RESOLVED, Naver 활성 provider 집합에서 완전 제외로 path 3a/3b/3c 전 경로 원천 차단)**
- 전체 취약점: 3건 (Medium 1 · Low 2) — SEC-001(High) 해소로 1건 감소
- **판정 (v1.3 재감사 3차·최종): `status: COMPLETE`** — 근거는 아래 요약 + 하단 "SEC-001 최종 판정 (v1.3)" 절 참조.
  - 사용자가 v1.2 권고 (b) "Naver 소셜 로그인을 이번 릴리즈에서 완전 제외"를 최종 채택했고, Development Agent(run-015)가 `SocialProviderResolver`·`SocialLoginDto`·`AuthModule`·Flutter(`login_screen.dart`/`social_auth_service.dart`)에서 naver 를 활성 provider 집합·UI 진입점 어디에도 존재하지 않도록 제거했다.
  - **4중 방어선을 코드로 직접 확인**: (1) `SocialLoginDto`의 `@IsIn(['kakao','google'])` + `main.ts` 전역 `ValidationPipe(whitelist, forbidNonWhitelisted, transform)` 로 `provider:'naver'` 요청 자체가 컨트롤러 진입 전 400 으로 거부, (2) `SocialProviderResolver.resolve()` 매핑에 naver 부재 — 설사 (1)을 우회해도 `UnauthorizedException`, (3) `AuthModule` providers 배열에 `NaverProvider` 미등록 — DI 컨테이너에 인스턴스 자체가 존재하지 않음, (4) Flutter `_SocialRow`·`SocialAuthService` 추상 인터페이스에 네이버 버튼·`signInWithNaver` 부재. `naver.provider.ts` 파일은 보존되어 있으나 어디에서도 import/주입되지 않아(`grep -rn "NaverProvider" apps/backend/src` 결과 정의부·주석 2건뿐, 실제 사용 0건) 실행 경로상 도달 불가능함을 확정했다.
  - GAP-014-10(path 3a 잔존)이 우려한 "기존 naver-linked 정규 계정의 완전 탈취" 시나리오는 naver provider 문자열 자체가 API 경계를 통과할 방법이 없어 **전제 조건(naver 토큰으로 `SocialAuthService.login()` 호출)이 성립하지 않게 되어 원천 소거**되었다.
  - 잔여 활성 provider(kakao·google) 는 각각 `access_token_info`(app_id)·`tokeninfo`(aud) 앱 바인딩 검증을 프로필 조회 이전에 수행함을 재확인했다(로직 무변경, v1.1 재감사 결론과 동일) — path 3a 가 이 두 provider 에 대해서도 안전함을 재확인.

## Constitution 보안 조항 이행 현황

`.claude/docs/constitution.md` 확인 결과 별도의 보안 전용 조항(P-XXX)은 없다(P-001~007 은 모듈경계·AWS금지·단일DB·클라우드중립·결제정산정합성·테스트·스펙범위). 결제·정산과 무관한 본 spec에 직접 적용되는 constitution 조항은 없음 — 해당 없음으로 처리.

| 조항 | 이행 여부 | 비고 |
|---|---|---|
| (보안 전용 조항 없음) | N/A | constitution.md 에 보안 원칙 항목 부재. spec.md NFR-002/003/004 및 plan.md 인터페이스 계약 §Security Agent 위임 포인트를 감사 기준으로 대체 사용 |

## 취약점 목록

### SEC-001 — Kakao/Naver 제공자 토큰의 app/client 바인딩(audience) 검증 누락

- **심각도**: High
- **OWASP**: A07:2021 (Identification and Authentication Failures) + A04:2021 (Insecure Design)
- **위치**: `apps/backend/src/modules/auth/social/kakao.provider.ts:21-37`, `apps/backend/src/modules/auth/social/naver.provider.ts:20-42`, `apps/backend/src/modules/auth/social-auth.service.ts:47-72` (path 3b 자동연동)
- **설명**:
  - `GoogleProvider.verify()`(`google.provider.ts:42-44`)는 `tokeninfo` 응답의 `aud !== clientId` 를 명시적으로 검증하여, DOA 앱(`GOOGLE_CLIENT_ID`) 이 아닌 타 애플리케이션이 발급한 id_token 을 거부한다. 여기에 `email_verified !== 'true'` 검증도 추가되어 있다.
  - `KakaoProvider.verify()`/`NaverProvider.verify()`는 이 대응 검증이 **전혀 없다**. `Authorization: Bearer {token}` 을 그대로 `kapi.kakao.com/v2/user/me` / `openapi.naver.com/v1/nid/me` 에 전달하고, 응답이 `200 OK`(+naver `resultcode==='00'`)이기만 하면 그 결과를 무조건 신뢰한다. 토큰이 **DOA 앱이 발급받은 것인지, 완전히 다른 제3의 애플리케이션(카카오/네이버 개발자센터에 별도 등록된 앱)이 발급한 것인지 구분하지 않는다.**
  - `.env.example`에 선언된 `KAKAO_REST_API_KEY`·`NAVER_CLIENT_ID`·`NAVER_CLIENT_SECRET` 는 코드 어디에서도 실제로 읽어 대조하지 않는다(GAP-014-04 비고에 이미 사실로 기록됨 — SC-018은 존재만 요구하므로 스펙 위반은 아니나, 본 항목은 spec 준수와 별개의 **보안 관점 감사**임).
- **공격 시나리오 (재구성)**:
  1. 공격자가 카카오/네이버 개발자센터에 자신이 통제하는 별도 앱(App-X, DOA 와 무관)을 등록하고 "카카오/네이버 로그인" 버튼이 있는 미끼 웹/앱 페이지를 만든다.
  2. 피해자가 App-X 에 카카오/네이버 계정으로 로그인한다(정상적인 제3자 로그인 흐름으로 보이므로 피해자 입장에서 의심스럽지 않을 수 있다). App-X 는 그 결과로 피해자 명의의 access token 을 획득한다.
  3. 공격자가 (App-X 클라이언트 코드에 직접 접근하거나 자신이 App-X 운영자이므로) 그 access token 을 탈취해 DOA 백엔드 `POST /auth/social-login`(익명 엔드포인트)에 `{ provider: 'kakao'|'naver', token }` 로 그대로 재전송한다.
  4. DOA 백엔드는 `kapi.kakao.com/v2/user/me`(또는 naver 동등 엔드포인트)를 호출해 200 응답을 받고, 이 토큰이 App-X 소유임을 구분할 방법이 없으므로 그대로 신뢰 → 응답의 `email`(피해자의 실제 카카오/네이버 계정 이메일, provider·앱과 무관하게 계정 자체에 귀속되는 값)을 사용한다.
  5. `SocialAuthService.login()` path 3b(`social-auth.service.ts:47`)가 `findUserByEmail(email)` 로 피해자의 기존 DOA 이메일 가입 계정을 찾아 **비밀번호 확인 없이 즉시 자동 연동 + JWT accessToken/refreshToken 발급**(`social-auth.service.ts:51-57`, `71`) → 공격자가 피해자의 DOA 계정을 완전히 탈취한다.
  - 이 경로가 성립하려면 (a) 공격자가 피해자를 유인해 제3자 앱에 카카오/네이버로 로그인시키는 사회공학 단계, (b) 해당 제공자의 email 이 앱 등록과 무관하게 계정 단위로 동일하게 반환된다는 전제가 필요하다(제공자별 정확한 스코핑 규칙은 `[TO-VERIFY]`, plan.md 외부 제공자 API 절과 동일한 한계). 그러나 전제 (b)가 성립하지 않더라도(즉 email 이 앱별로 다르게 스코프된다 해도) **"타 앱이 발급한 토큰을 우리 앱의 것처럼 신뢰한다"는 근본 설계 결함 자체는 그대로 남는다** — Google 은 정확히 이 문제를 `aud` 검증으로 막고 있고, Kakao/Naver 는 대응 검증이 없다는 비대칭이 이 취약점의 핵심이다.
  - 이는 plan.md §인터페이스 계약 "Security Agent 위임 포인트"가 명시적으로 요청한 3가지 감사 항목 — (1) email_verified 활용, (2) providerId 우선 매칭의 회귀 방어, (3) google `aud` 대조 누락 위험 — 중 (3)에 정확히 대응하는 발견이며, ASM-001(제공자 이메일 신뢰)의 완화책이 **provider 3종 중 1종(google)에만 구현되어 있고 2종(kakao/naver)에는 결여**되어 있음을 확인한 것이다.
- **수정 방향** (Security Agent 는 코드 수정 권한 없음 — 방향만 제시, 채택은 main session/사용자 결정):
  1. **Kakao**: `GET https://kapi.kakao.com/v1/user/access_token_info`(Authorization: Bearer token) 응답의 `id`(회원번호)·`expires_in` 외에 **`app_id` 를 함께 확인**하여 DOA 앱에 등록된 app_id(현 `KAKAO_REST_API_KEY` 와 별개 식별자일 가능성 — `[TO-VERIFY: 카카오 개발자센터 콘솔에서 app_id vs REST API 키 매핑 확인]`)와 대조하는 검증 스텝을 `KakaoProvider.verify()` 앞단에 추가.
  2. **Naver**: 네이버 오픈API는 카카오와 달리 "토큰 발급 앱 식별" 전용 공개 엔드포인트가 문서상 명확하지 않을 수 있음(`[TO-VERIFY]`). 이 경우 ADR-001(클라이언트 토큰 검증 방식) 자체의 naver 한정 재검토(예: authorization code + client_secret 교환 방식으로 네이버만 예외 처리) 또는 잔여 위험을 공식적으로 수용(risk acceptance)하는 결정이 필요.
  3. **대안(설계 레벨)**: FR-005 자동 연동 경로(email 매칭)에 한해서만 추가 확인 단계(예: 최초 자동 연동 시 이메일로 확인 알림 발송 + 일정 시간 내 명시적 승인, 또는 신규 소셜 로그인 기기/제공자 최초 연동 시 기존 비밀번호 재확인 요구)를 두는 방안. 단 이는 **NFR-002("추가 이메일 소유권 검증 단계를 두지 않는다")를 명시적으로 뒤집는 스펙 변경**이므로 사용자 승인 및 spec.md 갱신이 선행되어야 한다.
- **상태**: **RESOLVED (v1.3 최종)** — Kakao 는 app_id 대조로 완전 해소, Naver 는 활성 provider 집합에서 완전 제외되어 잔존 위험 자체가 소거됨(하단 "SEC-001 최종 판정 (v1.3)" 절 참조). 전체 판정은 `status: COMPLETE`.

---

### SEC-001 재감사 (v1.1) — Kakao 해소 검증 + Naver 심각도 재판정

**입력**: `run-008-development-agent.md`(Kakao 수정 상세), `gaps.md` GAP-014-07(PARTIALLY RESOLVED)·GAP-014-08(Naver 잔여, OPEN), 실 코드(`kakao.provider.ts`, `naver.provider.ts`, `kakao.provider.spec.ts`, `.env.example`, `social-provider.resolver.ts`, `dto/social-login.dto.ts`, `auth.controller.ts`).

#### (1) Kakao — app_id 대조가 실제로 토큰 substitution 을 차단하는지 검증

- **검증 순서**: `KakaoProvider.verify()` 는 (a) `configService.getOrThrow('KAKAO_APP_ID')` → (b) `GET /v1/user/access_token_info` 호출 → (c) `String(tokenInfo.app_id) !== appId` 대조(불일치 시 `UnauthorizedException`, 여기서 즉시 return/throw) → (d) 통과 후에만 `/v2/user/me` 프로필 조회. **app_id 대조는 프로필 조회 이전에 실행되며, 불일치 시 프로필 조회 자체가 발생하지 않는다** — google `aud` 검증과 동일한 순서·구조로 코드 확인(`kakao.provider.ts:38-53`).
- **fail-open 여부**: `ConfigService.getOrThrow`는 키가 없으면 `Error`를 던진다(NestJS 표준 동작). 이 예외는 `SocialAuthService.login()` → `AuthController.socialLogin()` 경로 어디에서도 `try/catch` 로 잡히지 않음을 grep 으로 확인(`social-auth.service.ts` 전문에 `catch` 는 P2002 전용 2곳뿐, provider.verify() 호출부는 무가드). `src/main.ts` 에 사용자 정의 전역 예외 필터가 없음(Nest 기본 필터만 적용)도 확인 — 처리되지 않은 `Error`는 Nest 기본 동작상 `500 Internal Server Error`로 응답되며, **요청이 실패로 종료될 뿐 검증을 우회하여 200으로 통과되는 경로는 없다**. 즉 `KAKAO_APP_ID` 미설정 시의 동작은 **fail-closed**(요청 거부)이며 fail-open이 아니다.
- **우회 가능성 추가 확인**: (i) `SocialLoginDto.provider` 는 `@IsIn(['kakao','google','naver'])` 로 화이트리스트 검증되어 대소문자·별칭으로 다른 provider 매핑을 유도할 수 없음(`social-login.dto.ts:4,8`). (ii) `SocialProviderResolver.resolve()` 는 정확히 이 3개 문자열만 매핑, 매칭 실패 시 `UnauthorizedException`(우회 불가, `social-provider.resolver.ts:24-30`). (iii) `String(tokenInfo.app_id)` 비교는 카카오 서버가 실제 토큰 발급 시점에 귀속시킨 앱 식별자를 반환하는 서버측 값이며 클라이언트가 조작 가능한 입력이 아니므로, 공격자가 자신이 소유한 App-X 토큰의 `app_id` 값을 DOA 앱 것으로 위장할 수 없음.
- **결론**: **Kakao 경로는 SEC-001 원 취약점(app/client 바인딩 검증 부재)이 해소되었다.** 우회·fail-open 경로를 발견하지 못했다. 회귀 테스트(`kakao.provider.spec.ts` 3케이스: 정상/불일치/access_token_info 실패)도 이 3개 분기를 모두 커버함을 코드 대조로 확인.

#### (2) Naver — 앱 바인딩 검증 수단 부재 재확인 + 심각도 판정

- **부재 재확인**: `naver.provider.ts` 의 로직(코드, docstring 제외)은 이번 수정에서 **1바이트도 변경되지 않았다**(diff 는 클래스 docstring 주석 추가뿐 — `NaverProvider.verify()` 본문은 기존과 동일하게 `/v1/nid/me` 단일 호출 후 `resultcode` 만 확인). 네이버 오픈API(네이버 로그인)는 카카오 `access_token_info`(app_id) 또는 구글 `tokeninfo`(aud) 에 대응하는, **access token 소유 클라이언트를 식별하는 공개 조회 엔드포인트를 제공하지 않는다**는 Development Agent 조사 결과를 코드 레벨(=대응 API 호출이 코드에 전혀 없음, 즉 "구현하지 않은 것"이 아니라 "구현할 API 대상이 없음")로 재확인했다. 본 재감사는 WebFetch/WebSearch 도구를 사용하지 않았으므로(가용 도구 목록에 없음) 네이버 공식 문서 재조회는 수행하지 못했고, 이 사실은 Development Agent 조사 결과에 대한 독립적 2차 확인이 아닌 **코드 근거 기반 정합성 확인**(선언된 잔여 위험과 실 코드 상태의 일치 여부 확인)에 그친다는 한계를 명시한다.
- **심각도 판정 — High 유지 (근거)**:
  1. **공격 체인 동일성**: Naver 경로는 수정 전 Kakao 와 정확히 동일한 구조(대응 검증 부재 + `SocialAuthService.login()` path 3b 자동연동의 email 매칭 신뢰)를 가지며, 계정 탈취까지 이어지는 전체 공격 시나리오(SEC-001 원문 §공격 시나리오)가 provider 를 `naver` 로 바꿔도 그대로 성립한다. 별도 완화 코드가 전혀 추가되지 않았다.
  2. **문서화는 심각도를 낮추는 완화가 아니다**: `naver.provider.ts` docstring 추가는 향후 코드 리뷰·감사에서의 **발견 가능성(discoverability)** 을 높이는 프로세스적 조치이나, 실제 공격자가 이 docstring 을 보고 공격을 포기할 이유가 없다 — 실제 악용 가능성(likelihood)과 영향(impact)에 어떤 기술적 변화도 주지 않는다. 심각도(Severity)는 실제 위험(likelihood × impact) 기준으로 판정하며, "문서화되었다"는 사실 자체는 이 두 축 중 어느 것도 낮추지 않는다.
  3. **완화 대안이 실재하며 미채택 상태**: Naver 는 authorization code + `NAVER_CLIENT_SECRET` 교환 방식(서버 측에서 자신의 client_secret 으로 code 를 교환하므로 결과적으로 "자신이 발급받은 code" 임을 암묵적으로 보장하는 표준 OAuth 서버 사이드 플로우)으로 전환하면 app 바인딩을 사실상 확보할 수 있다(GAP-014-08 §완화 대안 1). 이는 "기술적으로 불가능한 제약"이 아니라 "현재 채택한 client-token 검증 방식(ADR-001)의 한계"이며, ADR-001 재검토 또는 FR-005 spec 변경이라는 **실행 가능한 해결 경로가 이미 식별되어 있음에도 미채택**된 상태다. 즉 "Medium(문서화된 기술적 제약·완화 대안 존재)" 이라는 하향 근거 후보를 검토했으나, "완화 대안이 존재한다"는 사실 자체가 오히려 — 채택하지 않은 채 방치하면 — 심각도를 낮추는 근거가 아니라 **수정 가능한 미해결 위험**이라는 점을 강조하는 근거로 작용한다고 판단했다.
  4. **Naver 는 비주력·저사용 provider 가 아님**: 국내 서비스 맥락상 Naver 는 Kakao 와 동급의 대중적 로그인 수단이며, 공격 전제(피해자가 제3자 앱에 네이버로 로그인)의 실현 가능성이 특별히 낮다고 볼 근거가 없다(Google 수정 시에도, 원 Kakao 발견 시에도 동일 전제를 이미 실질적 위험으로 판정했던 것과 동일 기준 적용).
  5. **보상 통제(compensating control) 부재**: FR-005 자동연동에는 이메일 매칭 외 추가 확인 단계가 전혀 없다(NFR-002 로 명시적으로 배제됨). rate limit·이상 로그인 탐지·기기 바인딩 등 사후 탐지 통제도 코드베이스에 없음(SEC-004 에서 이미 rate limit 부재 확인). 심각도를 낮출 만한 보상 통제를 찾지 못했다.
  - **결론**: 위 5개 근거에 따라 Naver 잔여 위험은 **Medium 으로 하향할 근거가 불충분**하며, 원 SEC-001 판정과 동일하게 **High 를 유지**한다.
- **권고 (main session/사용자 결정 필요, 셋 중 하나)**:
  1. **FR-005 자동연동을 Naver 에 한해 비활성화**(providerId 매칭 재로그인은 유지, email 매칭 자동연동만 naver 에서 차단) — 코드 변경 범위가 가장 작고 즉시 적용 가능한 완화. 단 NFR-002 문구("추가 이메일 소유권 검증 단계를 두지 않는다")와 상충되므로 provider 단위 예외로 spec.md 명시 필요.
  2. **Naver 소셜 로그인 자체를 이번 릴리즈에서 제외**(kakao/google 만 활성화) — 가장 보수적, 구현 범위 최소.
  3. **위험 수용(risk acceptance)** — 비즈니스적으로 감내 가능하다고 명시적으로 결정하는 경우. 이 경우 `context.md §6 알려진 제약`에 등재하고 최소한 사후 모니터링(이상 로그인 탐지 등) 도입을 별도 과제로 추적할 것을 권고. Security Agent 는 이 결정을 대행할 권한이 없다(코드 수정 권한 없음 — 페르소나 정의).

---

### SEC-001 재감사 2차 (v1.2) — path 3b/3c 차단 검증 + path 3a 신규 확정 발견 + 최종 판정

**입력**: `run-012-development-agent.md`(Naver 정책 변경 상세), `gaps.md` GAP-014-08(OPEN, 완화조치 적용 기록)·GAP-014-09(신규, spec 정합성), 실 코드(`social-auth.service.ts` 전문, `naver.provider.ts`, `social-auth.service.autolink-policy.spec.ts`, `auth.repository.ts`, `schema.prisma`).

#### (1) path 3b / path 3c race fallback — 차단 검증 (CONFIRMED, 우회 없음)

- **path 3b** (`social-auth.service.ts:62-71`): `existingUser` 조회 후 `autoLinkAllowed = AUTO_LINK_PROVIDERS.has(provider)` 가 `false`(naver)이면 `createSocialAccount` 호출 없이 즉시 `ConflictException` 을 던진다. 코드 흐름상 이 분기는 `createSocialAccount`/`createUser`/`issueTokensForUser` 호출 이전에 위치하므로 naver 는 어떤 경우에도 이 경로로 토큰을 발급받지 못한다.
- **path 3c race fallback** (`social-auth.service.ts:121-127`): 동시성 경합(P2002)으로 `raceResult`(providerId 매칭)가 없을 때만 도달하는 `raceUser`(email 매칭) fallback 도 동일하게 `autoLinkAllowed` 로 게이팅되어 naver 는 `ConflictException` 으로 응답한다.
- **회귀 테스트 대조**: `social-auth.service.autolink-policy.spec.ts` 의 naver+기존이메일 케이스가 `createSocialAccount`·`createUser`·`issueTokensForUser` 모두 `not.toHaveBeenCalled()` 를 단언하며, 이는 production 코드의 하드코딩된 조건 분기와 정확히 일치한다(mock 이 production 분기를 우회하지 않음, PATCH-03 자가점검과 동일 기준으로 재확인).
- **결론**: **path 3b·path 3c race fallback 은 naver 에 대해 완전히 차단되었다.** 우회 경로를 발견하지 못했다. 사용자가 승인한 완화책(옵션 a)이 이 두 경로에 대해서는 정확히 의도대로 동작한다.

#### (2) path 3a(providerId 매칭 재로그인) — 게이팅 부재 신규 확정 발견 (CONFIRMED)

- **코드 근거**: `social-auth.service.ts:56-60`
  ```ts
  // 3a. provider+providerId 로 기존 연동 계정 조회
  const existing = await this.repo.findByProviderAndProviderId(provider, profile.providerId);
  if (existing) {
    return this.authService.issueTokensForUser(existing.user);
  }
  ```
  이 분기는 `autoLinkAllowed`/`AUTO_LINK_PROVIDERS` 를 전혀 참조하지 않는다. `provider` 값과 무관하게(kakao/google/naver 공통) `providerId` 가 기존 `social_accounts` 레코드와 일치하면 **검증 단계 없이 즉시** `issueTokensForUser(existing.user)` 를 호출해 accessToken/refreshToken 을 발급한다. Development Agent 의 run-012 T1 구현은 명시적으로 "path 3b: ... path 3c 의 P2002 catch 내 raceUser fallback도 동일하게 게이팅"이라고만 기술하며, path 3a 는 수정 대상에 포함되지 않았다(수정 사유·태스크 로그 어디에도 path 3a 언급 없음) — 코드 diff·runs 기록 양쪽으로 교차 확인했다.
- **NaverProvider.verify() 와의 결합**: `naver.provider.ts` 는 `/v1/nid/me` 호출 결과가 `resultcode === '00'`(즉 네이버 서버 관점에서 유효한 토큰)이기만 하면 무조건 신뢰하며, 이 토큰이 DOA 앱에 발급된 것인지 검증하는 코드가 없다(로직은 이번 수정으로도 1바이트도 변하지 않음 — docstring 만 추가, 상단 "부재 재확인" 절과 동일 사실). 즉 App-X(공격자가 통제하는 별도 카카오/네이버 개발자센터 앱)가 발급한 토큰도 `verify()` 를 통과하여 victim 의 실제 `providerId`(네이버 회원번호)를 그대로 반환한다.
- **재구성된 공격 체인** (SEC-001 원문 공격 시나리오의 path 3a 변형):
  1. 공격자가 App-X(DOA 와 무관한 네이버 로그인 연동 앱)를 준비하고, 사회공학으로 victim 을 App-X 에 네이버 계정으로 로그인시킨다.
  2. victim 은 **과거에 이미 DOA 에 네이버로 로그인/가입한 이력이 있다**(즉 `social_accounts` 에 `provider='naver', providerId=victim의 네이버 회원번호` 레코드가 이미 존재하는 정규 고객). 이 전제는 "naver 소셜 로그인을 최소 1회 사용한 모든 기존/향후 DOA 고객"에 해당하므로 특별히 희귀한 조건이 아니다.
  3. 공격자는 App-X 가 발급받은 victim 의 access token 을 탈취해 `POST /auth/social-login {provider:'naver', token}` 으로 DOA 백엔드에 재전송한다.
  4. `NaverProvider.verify()` 가 이 토큰을 (앱 구분 없이) 신뢰 → victim 의 실제 `providerId` 반환.
  5. `SocialAuthService.login()` **path 3a**(`findByProviderAndProviderId('naver', victim providerId)`) 가 기존 레코드를 찾아 **`autoLinkAllowed` 검증 없이** `issueTokensForUser(existing.user)` 를 호출 → 공격자가 victim 의 **기존(실사용) DOA 계정**의 accessToken/refreshToken 을 그대로 획득한다.
  6. 이 계정은 "새로 생성된 독립 계정"이 아니라 victim 이 실제로 사용 중이던 계정이므로, 주문 내역·배송지·기타 PII 등 실제 자산에 대한 완전한 접근·조작이 가능하다.
- **스코핑 확인(교차 provider 오염 없음)**: `AuthRepository.findByProviderAndProviderId`(`auth.repository.ts:65-73`) 는 `socialAccount.findUnique({ where: { provider_providerId: { provider, providerId } } })` 로 `SocialAccount.@@unique([provider, providerId])`(`schema.prisma:50`) 복합 유니크 키를 사용한다. 따라서 이 취약점은 **naver 네임스페이스 내부로 한정**되며(카카오/구글 계정과의 교차 충돌은 없음 — 이 부분은 안전), 이미 naver 로 연동된 계정 자체에만 영향을 준다.
- **GAP-014-07 미확정 사항의 확정**: GAP-014-07 "영향 범위" 절은 "path 3a(재로그인, providerId 매칭이 app-scoping 에 따라 완화될 수 있으나 미확정)"이라고 기록했다. 본 재감사는 이를 코드로 직접 검증하여 **"완화되지 않는다"(CONFIRMED, 미완화)** 로 확정한다. Kakao/Google 은 `verify()` 자체가 app_id/aud 를 대조하여 App-X 토큰을 최초 단계에서 거부하므로 path 3a 에 도달할 수조차 없다(다른 방식으로 이미 방어됨). Naver 는 `verify()` 단계의 방어가 없으므로 path 3a 가 유일하게 노출된 provider 다.

#### (3) "blast radius 가 naver-only 독립계정으로 축소" 전제의 재검토

- 이번 완화책 승인 시점(security-report.md v1.1 권고 (a))의 문구는 "FR-005 자동연동을 Naver 에 한해 비활성화(**providerId 매칭 재로그인은 유지**, email 매칭 자동연동만 naver 에서 차단)"였다. 이 문구는 path 3a("providerId 매칭 재로그인")를 의도적으로 존치 대상으로 명시했으나, 그 시점에는 path 3a 자체가 app-binding 부재로 인해 독립적으로 악용 가능한 별도 벡터라는 점을 재분석하지 않은 상태였다(GAP-014-07 은 이를 "미확정"으로만 남겨두었음).
- 따라서 "자동연동 차단으로 이메일/비번 계정·타 provider 계정 탈취 불가하고 blast radius 가 naver-only 독립계정으로 축소되었다"는 전제는 **부분적으로만 정확하다**:
  - **정확한 부분**: path 3b/3c 를 통한 "이메일/비밀번호 계정·카카오/구글 계정으로의 신규 연동(bridging)"은 완전히 차단되었다(위 (1) 참조). 또한 path 3c(naver 신규 독립 계정 생성)만 놓고 보면 공격자가 만드는 계정은 새로 생성된 것이라 즉시 위험한 기존 자산은 없다.
  - **부정확한 부분**: **path 3a 는 "naver-only 독립계정"이 아니라 "naver-native 로 이미 연동된 기존 정규 계정"을 대상으로 한다.** 이 계정은 victim 이 이미 실사용 중일 수 있는 계정이며(path 3c 로 생성된 신규 계정이든, 최초부터 legitimate 하게 naver 로 가입한 계정이든 관계없이, 일단 `social_accounts` 레코드가 존재하는 순간부터), 완전한 탈취가 가능하다. "독립적이고 피해가 제한적인 계정"이라는 표현은 이 경로에는 적용되지 않는다.

#### (4) 최종 심각도 판정 — High 유지 (근거)

원 SEC-001/GAP-014-08 이 Naver 잔여 위험을 High 로 판정한 5개 근거(security-report.md v1.1 §SEC-001 재감사 (2) 참조)를 이번 완화 이후 상태에 재적용한다.

1. **공격 체인 동일성 — 변경 없음**: path 3a 를 통한 공격 체인은 원 SEC-001 공격 시나리오와 계정 탈취까지 정확히 동일하게 성립한다. `AUTO_LINK_PROVIDERS` 도입은 이 경로에 어떤 영향도 주지 않는다.
2. **완화 범위의 정확한 재확인**: 이번 코드 수정은 path 3b/3c 만을 대상으로 했고 path 3a 는 대상이 아니었다(run-012 명시). 즉 "Naver 잔여 위험이 완화되었다"는 명제는 **전체 SEC-001/GAP-014-08 취약점의 부분(path 3b/3c)에만 참**이며, 전체 취약점을 대표하는 명제로 취급할 수 없다.
3. **완화 대안 미채택 — 변경 없음**: authorization code + client_secret 교환 방식(GAP-014-08 §완화 대안 1)은 path 3a 를 포함한 근본 원인(app-binding 검증 수단 부재) 자체를 해소할 수 있는 유일한 실행 가능 경로이나 여전히 미채택 상태다.
4. **Naver 비주력 provider 아님 — 변경 없음**.
5. **보상 통제 부재 — 변경 없음**: path 3a 에도 rate limit·이상 로그인 탐지·기기 바인딩 등 보상 통제가 전혀 없다.

5개 근거 중 4개가 완전히 그대로 유지되고, 2번 근거는 "완화가 부분적임"을 명확히 하는 방향으로 강화되었다. **Medium 으로 하향할 근거를 찾지 못했다 — High 를 유지한다.**

#### (5) 승인된 예외의 범위 명확화

- 사용자는 security-report.md v1.1 권고 (a)를 승인했고, Development Agent 는 이를 정확히(path 3b/3c 게이팅) 구현했다 — **구현 자체는 결함이 없다.** 문제는 승인 당시 권고문이 path 3a 를 위험 요소로 재평가하지 않은 채 "유지" 대상으로 명시했다는 점이다.
- 따라서 본 재감사가 확정한 path 3a 잔존 위험은 **"이미 사용자가 승인한 위험 수용"으로 간주할 수 없다** — 승인의 대상(path 3b/3c 차단)과 이번에 확정된 잔존 위험(path 3a 미차단)은 서로 다른 범위이며, path 3a 에 대한 명시적 위험 수용 결정은 아직 이루어지지 않았다.
- **결론**: `status: BLOCKED` 를 유지한다. main session/사용자는 path 3a 에 대해 다음 중 하나를 새로 결정해야 한다.
  1. **path 3a 도 naver 에 대해 차단**(providerId 매칭 재로그인 자체를 비활성화) — 단, 이 경우 정규 naver 사용자의 재로그인 자체가 막히므로 FR-001(재로그인) 을 정면으로 위반한다. 실질적으로 "naver 소셜 로그인 기능 자체를 사용 중단"하는 것과 동등한 영향.
  2. **Naver 소셜 로그인을 이번 릴리즈에서 완전히 제외**(원 SEC-001 권고 (b), 가장 보수적) — path 3a/3b/3c 모두 원천 차단.
  3. **authorization code + client_secret 교환 방식으로 ADR-001 재검토**(GAP-014-08 §완화 대안 1) — 근본 해소, 구현 범위 확대 필요.
  4. **path 3a 잔존 위험을 명시적으로 위험 수용**(risk acceptance) — 이 경우 "naver-native 계정도 완전 탈취 가능"이라는 정확한 범위로 `context.md §6` 에 등재하고, 최소한 사후 모니터링(이상 로그인 탐지)을 별도 과제로 추적할 것을 권고. Security Agent 는 이 결정을 대행할 권한이 없다.

---

### SEC-001 최종 판정 (v1.3) — Naver 완전 제외 검증 + 잔존 위험 소거 확정

**입력**: `run-015-development-agent.md`(Naver 완전 제외 상세), `gaps.md` GAP-014-08/10(RESOLVED by Development Agent, 본 회차 이전 갱신), 실 코드(`social-provider.resolver.ts`, `dto/social-login.dto.ts`, `auth.module.ts`, `main.ts`, `auth.controller.ts`, `kakao.provider.ts`, `google.provider.ts`, `naver.provider.ts`, `social-auth.service.ts`, `login_screen.dart`, `social_auth_service.dart`, `providers.dart`).

사용자는 v1.2 권고 4가지 선택지 중 **(b) "Naver 소셜 로그인을 이번 릴리즈에서 완전 제외"**를 최종 채택했다(GAP-014-10 후속 처리 절 참조). 본 절은 이 결정이 실제로 GAP-014-10(path 3a)·GAP-014-08(근본 원인)이 우려한 공격 체인 전체를 차단하는지 코드로 독립 검증한다.

#### (1) Naver 도달 불가 — 4중 방어선 코드 검증

| 방어선 | 위치 | 검증 내용 |
|---|---|---|
| ① API 경계 입력 검증 | `dto/social-login.dto.ts:6,10` + `main.ts:20-26` | `SUPPORTED_PROVIDERS = ['kakao','google']` 화이트리스트에 `@IsIn` 데코레이터 적용. 전역 `ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true })` 가 `app.useGlobalPipes()` 로 등록되어 있어(`main.ts:20-26`), `provider:'naver'` 요청은 NestJS 표준 동작상 컨트롤러 메서드 진입 **이전**에 `BadRequestException`(400)으로 거부된다. |
| ② Provider 해석 계층 | `social-provider.resolver.ts:15-34` | `providers` 레코드에 `kakao`·`google` 2개 키만 존재(`constructor` 주입도 `KakaoProvider`·`GoogleProvider` 2개뿐). `resolve('naver')` 호출 시 `impl` 이 `undefined` → `UnauthorizedException` 던짐. ①을 우회해도 여기서 재차 차단. |
| ③ DI/모듈 배선 | `auth.module.ts:22-29` | `providers` 배열에 `NaverProvider` 미등록. `NaverProvider` 클래스는 Nest DI 컨테이너에 인스턴스화되지 않으므로 어떤 경로로도 주입받을 수 없다. |
| ④ 클라이언트(Flutter) 진입점 | `login_screen.dart:197-204`(`_SocialRow` — `onKakao`/`onGoogle` 콜백만 존재), `social_auth_service.dart:17-19`(`SocialAuthService` 추상 인터페이스에 `signInWithKakao`/`signInWithGoogle` 만 선언, `signInWithNaver` 없음), `providers.dart:15-16`(`StubSocialAuthService` 만 바인딩) | 네이버 버튼·메서드 자체가 코드에 존재하지 않아, 정상 클라이언트 경유로는 naver 요청이 발생할 수 없다. |

- **`naver.provider.ts` 자체 확인**: `grep -rn "NaverProvider" apps/backend/src` 결과 정의부(`naver.provider.ts:33`)와 `social-provider.resolver.ts` 주석(설명문) 2건뿐이며, `import`/DI 등록/함수 호출 등 실행에 영향을 주는 참조는 0건이다. 파일은 향후 재도입을 전제로 보존되어 있으나 현재 컴파일·런타임 그래프에서 고립(isolated dead code)되어 있다.
- **`grep -rniI naver apps/backend/src mobile/customer_app/lib apps/backend/.env.example` 전수 확인**: 잔여 33건은 (a) 주석(제외 사유 설명), (b) `naver.provider.ts` 자체 내부 코드(미와이어), (c) `social-auth.service.autolink-policy.spec.ts`/`social-auth.service.spec.ts` 의 방어적 회귀 테스트(문자열 `'naver'` 를 직접 `service.login()` 인자로 호출 — 이는 DTO 검증을 우회하는 프로덕션 공격 표면이 아니라 `SocialAuthService` 단위 테스트가 하위 계층 방어를 독립 검증하는 것), (d) `.env.example` 플레이스홀더 크레덴셜(실제 값 없음, 코드에서 미사용) 뿐이다. **실행 경로상 도달 가능한 참조는 0건.**
- **호출 지점 단일성 재확인**: `grep -rn "socialAuthService.login\|SocialAuthService" apps/backend/src` 결과 `SocialAuthService.login()` 을 호출하는 프로덕션 코드는 `auth.controller.ts:57` 1곳뿐이며, 이 호출은 `SocialLoginDto`(방어선 ①)를 거친 `dto.provider` 만을 인자로 사용한다. 우회 가능한 별도 진입점은 발견하지 못했다.

#### (2) 잔여 활성 provider(Kakao·Google) 앱 바인딩 재확인 — 무변경, path 3a 안전

- `KakaoProvider.verify()`(`kakao.provider.ts:38-53`): `access_token_info` 호출 → `app_id` 대조(`KAKAO_APP_ID`) → 불일치 시 `UnauthorizedException` — 프로필 조회(`/v2/user/me`) **이전**에 실행. 로직은 v1.1 재감사 이후 무변경(diff 0).
- `GoogleProvider.verify()`(`google.provider.ts:27-49`): `tokeninfo` 응답의 `aud !== clientId` 검증 + `email_verified !== 'true'` 검증, 두 검증 모두 `SocialProfile` 반환 **이전**에 실행. 로직 무변경.
- `SocialAuthService.login()` path 3a(`social-auth.service.ts:61-65`, 라인 번호는 v1.2 대비 소폭 이동)는 여전히 `AUTO_LINK_PROVIDERS`/`autoLinkAllowed` 를 참조하지 않고 provider 공통으로 동작하지만, 이 경로에 도달할 수 있는 provider 는 이제 kakao·google 2개뿐이며 양쪽 모두 `verify()` 단계에서 App-X(제3자 앱) 발급 토큰을 프로필 반환 이전에 거부한다. 따라서 path 3a 자체의 게이팅 부재는 더 이상 악용 가능한 취약점이 아니다(원인이 아니라 naver 라는 "app-binding 미검증 provider" 자체가 소거되었기 때문).

#### (3) 신규 취약점 검토 — 발견 없음

- 이번 diff 는 순수 축소(subtractive) 변경(provider 화이트리스트 축소, DI 미등록, UI 버튼 제거)이며, 신규 엔드포인트·신규 외부 호출·신규 크레덴셜 사용 등 공격 표면을 넓히는 변경이 없다.
- `SocialLoginDto` 의 `provider` 필드가 `string` 타입(리터럴 유니온이 아님)이라는 점은 v1.1 이전부터 동일했으나 `@IsIn` 런타임 검증이 이를 보완하며, `.env.example` 의 `NAVER_CLIENT_ID`/`NAVER_CLIENT_SECRET` 플레이스홀더가 문서상 잔존하는 것은 보안 취약점이 아니라 문서 정합성 이슈(GAP-014-09 범위, spec.md 갱신으로 처리 예정)로 별도 분류했다.
- OWASP A01~A10 전 항목 재점검 결과 SEC-002(A04, Medium)·SEC-003(A05, Low)·SEC-004(A04/A05, Low) 외 신규 발견 없음.

#### (4) 최종 판정

- **SEC-001: RESOLVED.** Critical/High 잔존 0건. GAP-014-07/08/10 이 제기한 계정 탈취 공격 체인 전체(path 3a/3b/3c)가 Naver 완전 제외로 원천 차단되었음을 코드로 확정했다. Kakao/Google 은 app-binding 검증이 기존대로 유효하여 동일 공격 체인이 성립하지 않는다.
- **판정: `status: COMPLETE`.** Medium(SEC-002) 1건·Low(SEC-003/004) 2건은 계정 탈취·권한 상승과 무관한 권고사항으로 하단 절에 유지하며, Retrospective 로 위임한다.

---

### SEC-002 — 신규 소셜 가입 경로(path 3c)의 비원자적 2단계 쓰기 (orphan user 가능성)

- **심각도**: Medium
- **OWASP**: A04:2021 (Insecure Design) — 무결성/가용성 관점
- **위치**: `apps/backend/src/modules/auth/social-auth.service.ts:74-88` (`createUser` → `createSocialAccount` 순차 호출), `apps/backend/src/shared/prisma/prisma.service.ts:27,49`(`tx` getter·`runInTransaction`)
- **설명**: `SocialAuthService.login()` 의 신규 가입 경로(3c)는 `this.repo.createUser(...)` 후 `this.repo.createSocialAccount(...)` 를 각각 호출하지만, 이 둘을 감싸는 `this.prisma.runInTransaction(...)` 호출이 **코드에 존재하지 않는다**(`social-auth.service.ts` 전체 grep 확인). `AuthRepository.createUser`/`createSocialAccount` 는 `this.prisma.tx.*` 를 사용하는 tx-aware 메서드이나, `runInTransaction` 으로 감싸지 않으면 `tx` getter 는 root(비트랜잭션) 클라이언트로 fallback 하므로(`prisma.service.ts:27`), 두 INSERT 는 **별도의 독립 statement 로 실행**된다. `createUser` 성공 후 `createSocialAccount` 가 (P2002 가 아닌 다른 이유로, 예: DB 커넥션 순단·타임아웃) 실패하면 `password: null` 인 **orphan `users` 행**이 남아 그 이메일 슬롯을 영구 점유한다 — 해당 사용자는 이후 이메일 재가입도 불가하고(email @unique) 소셜 로그인도 재시도 시 `findUserByEmail` 로 이 orphan 행을 찾아 `createSocialAccount` 를 다시 시도하므로 대부분 자연 복구되지만, 이 구간의 결함이 확률적으로 잔존한다.
  - 이는 이미 `gaps.md` GAP-014-01(OPEN, tx-aware e2e 미검증)·GAP-014-03(RESOLVED, non-atomic 부작용 명시)에 **동일 사실로 선행 기록**되어 있다. Security Agent 관점에서 실 코드(`prisma.service.ts`) 를 직접 대조하여 "root fallback" 동작을 재확인했고, GAP-014-01 안전망(P2002 catch 폴백 + DB unique 제약)이 존재함을 확인했다. 계정 탈취/권한 상승으로 직결되지는 않으므로 Critical/High 가 아닌 **Medium**(가용성·데이터 정합성 결함)으로 분류한다.
- **수정 방향**: `social-auth.service.ts` path 3c 를 `this.prisma.runInTransaction(async () => { ... })` 로 감싸 `createUser`+`createSocialAccount` 를 원자화(당초 tasks.md T-B4 설계 의도와 일치시킴).
- **상태**: OPEN — GAP-014-01 연계, 후속 처리는 해당 GAP 의 "(c) 필요 시 후속 spec 에서 repository 통합 테스트 도입 검토"에 위임. 본 항목은 신규 SEC-ID 로 별도 등재하되 GAP-014-01 과 동일 근본원인임을 명시.

---

### SEC-003 — `SocialLoginDto.token` 길이 제한 부재

- **심각도**: Low
- **OWASP**: A05:2021 (Security Misconfiguration) — 입력 검증 완화
- **위치**: `apps/backend/src/modules/auth/dto/social-login.dto.ts:11-13`
- **설명**: `@IsString()` 만 있고 `@MaxLength()` 가 없어, 임의 길이의 문자열이 `token` 필드로 허용된다. Kakao/Naver 는 헤더(`Authorization: Bearer {token}`)로, Google 은 URL 쿼리스트링(`tokeninfo?id_token=...`)으로 그대로 전달되므로 과도하게 큰 값이 아웃바운드 요청 실패·불필요한 리소스 소비를 유발할 수 있다.
- **수정 방향**: `@MaxLength(4096)` 등 합리적 상한 추가(class-validator).
- **상태**: 권고사항으로 기록

---

### SEC-004 — 익명 `/auth/social-login` 엔드포인트의 아웃바운드 증폭 표면에 rate limit 부재

- **심각도**: Low
- **OWASP**: A04:2021 (Insecure Design) / A05:2021 (Security Misconfiguration)
- **위치**: `apps/backend/src/modules/auth/auth.controller.ts:52-58`
- **설명**: 기존 `/auth/login` 과 달리 `/auth/social-login` 은 요청마다 카카오/구글/네이버 3종 외부 제공자 중 하나로 **아웃바운드 HTTP 호출을 트리거**한다(`social/*.provider.ts`). 코드베이스 전체에 Throttler/rate-limit 모듈이 존재하지 않음을 확인했다(`grep -rn "Throttler\|RateLimit" apps/backend/src` 결과 0건) — 이는 auth 모듈 전반의 기존(pre-existing) 공백이나, 본 spec 이 신규로 추가한 이 엔드포인트는 익명 호출자가 무효 토큰을 대량 전송해 (1) DOA 서버 리소스 소비, (2) DOA 앱 계정으로 등록된 카카오/구글/네이버 API 쿼터·평판에 영향을 줄 수 있는 **새로운 아웃바운드 증폭 표면**이라는 점에서 언급할 가치가 있다.
- **수정 방향**: `/auth/social-login`(및 `/auth/login`)에 IP/요청 단위 rate limit(`@nestjs/throttler` 등) 적용 검토. 기존 auth 엔드포인트 전반의 baseline 공백이므로 본 spec 단독 블로킹 사유는 아님.
- **상태**: 권고사항으로 기록 (기존 baseline 공백 — 별도 spec 또는 인프라 개선 과제로 처리 권고)

---

## NFR-XXX / SC-XXX 보안 요구사항 이행 현황

| ID | 요구사항 | 이행 여부 | 비고 |
|---|---|---|---|
| NFR-002 | 자동 연동 시 제공자 이메일 소유권을 제공자가 보장하는 것으로 신뢰(추가 검증 단계 없음) | **이행 (v1.3 최종 갱신) — Kakao 는 app_id 대조로 완전 해소. Naver 는 활성 provider 집합에서 완전 제외되어 이 NFR 및 SEC-001 잔존 위험의 적용 대상 자체가 소거됨** | v1.3 재감사. Kakao: 해소(변경 없음). Naver: 활성 provider 집합·API 경계에서 완전 제외(GAP-014-08/10 RESOLVED)되어 NFR-002·SEC-001 어느 쪽으로도 더 이상 리스크가 아님(근거는 상단 "SEC-001 최종 판정 (v1.3)" 절 참조) |
| NFR-003 | 소셜 전용 사용자(password null) 이메일+비밀번호 로그인 시 오류 반환 | **이행** | `auth.service.ts:100` `if (!user.password) throw UnauthorizedException(...)` 확인 — bcrypt.compare 에 null 전달 전 가드 정상 |
| NFR-004 | OAuth 크레덴셜 env 관리, 파이프라인 검증은 stub 사용 | **이행** | `StubSocialProvider` 는 `auth.module.ts` providers 배열에 미포함(프로덕션 미와이어) 확인 — 테스트 전용으로 격리됨. `.env.example` 4종 크레덴셜 존재(SC-018) 확인 |
| NFR-005 | flutter analyze 0 issues | 검증 범위 밖 | 5b Test Agent(EXECUTION) 산출물(coverage.md) 로 이미 확인됨. Security Agent 재검증 대상 아님 |
| SC-005 (FR-003) | 이메일 미반환 시 400 거부 | **이행** | `social-auth.service.ts:33-37` `if (!profile.email) throw BadRequestException(...)` |
| SC-006 (FR-002) | 무효 토큰 4xx | **이행** | 3개 provider 모두 `!res.ok` → `UnauthorizedException` |
| SC-001~004, 010 | 계정 해석 우선순위·password null·social_accounts 레코드 | **이행 (구조적으로 확인)** | 우선순위 a→b→c 순차 확인(`social-auth.service.ts:42-105`). 단 b 경로(SC-002/자동연동)의 신뢰 전제가 SEC-001 대상 |

## 권고사항

1. **SEC-001 (v1.3 최종) — RESOLVED, 추가 조치 불필요**: 사용자가 최종 채택한 "Naver 소셜 로그인 완전 제외"가 코드 4중 방어선(DTO 화이트리스트+전역 ValidationPipe, Resolver 매핑, DI 모듈 배선, Flutter UI)으로 정확히 구현되었음을 확인했다. Naver provider 문자열이 API 경계를 통과할 방법이 없어 GAP-014-07/08/10 이 우려한 계정 탈취 공격 체인(path 3a/3b/3c) 전체가 원천 차단되었다. Kakao/Google 은 app-binding(app_id/aud) 검증이 기존대로 유효하다. **Critical/High 잔존 0건 — 추가 코드 수정 불필요.** 향후 Naver 재도입 시(별도 spec) authorization code + client_secret 교환 방식(ADR-001 재검토)을 전제 조건으로 채택해야 한다(GAP-014-08 재도입 조건 참조). 상세 근거는 상단 "SEC-001 최종 판정 (v1.3)" 절 참조.
2. **SEC-002(Medium)** 는 기존 GAP-014-01/03 과 동일 근본원인이므로 별도 조치 없이 해당 GAP 트랙으로 계속 관리 가능. 단, 사후 운영 검증(spec PROC-014) 또는 후속 patch spec 에서 `runInTransaction` 래핑을 권고. (본 v1.3 재감사에서 재검토하지 않음 — Naver 완전 제외와 무관한 범위, 변동 없음.)
3. **SEC-003/004(Low)** 는 즉시 블로킹 사유가 아니며 권고사항으로 기록. 후속 spec 또는 유지보수 작업에서 처리 가능. (본 v1.3 재감사 범위 밖 — 변동 없음.)
4. **(PROC-013-03) Retrospective 위임 (v1.3 최종 갱신)**: SEC-001(High) 이 완전 해소되어 Retrospective 로 위임할 미해결 보안 항목은 **SEC-002(Medium) 1건**뿐이다. `context.md §6 알려진 제약`에 아래 문구로 additive 등재를 권고한다(기존 GAP-014-06 §8 예고 문구·v1.1/v1.2 권고 4의 Naver 잔존 위험 문구는 **해소되었으므로 신규 등재 시 제외**한다):
   - "소셜 로그인(014-social-login)의 신규 가입 경로(FR-006, `SocialAuthService.login()` path 3c)는 `createUser`+`createSocialAccount` 두 INSERT 가 `runInTransaction` 으로 원자화되지 않아, 두 번째 쓰기 실패 시 `password: null` orphan user 가 남을 수 있다(SEC-002, GAP-014-01/03, Medium — 계정 탈취·권한 상승과 무관, P2002 폴백으로 대부분 자연 복구). 후속 spec 에서 `runInTransaction` 래핑을 권고한다."
   - 참고로 Naver 소셜 로그인은 이번 릴리즈에서 완전 제외되었다(SEC-001 최종 RESOLVED, GAP-014-08/10). 활성 provider 는 카카오·구글 2종이며 둘 다 app-binding 검증을 갖춘다. 향후 Naver 재도입 시 authorization code + client_secret 교환 방식(ADR-001 재검토)이 선행되어야 한다 — 이 사실 자체는 **재도입 전제조건**으로서 등재 가치가 있다(GAP-014-08/10 참조).
5. **GAP-014-07/08/09/10 상태 확인 (v1.3)**: gaps.md 상 GAP-014-08·GAP-014-10 은 Development Agent(run-015)가 이미 `RESOLVED by Development Agent` 로 갱신했으며, 본 재감사가 코드 검증으로 이 판정에 동의한다(변경 없음). GAP-014-07(PARTIALLY RESOLVED, Kakao 해소 기록)은 상태값 유지. GAP-014-09(spec.md 의 FR-001/NFR-004/SC-009/SC-013/SC-018/범위 외 절이 naver 를 여전히 지원 대상으로 서술)는 **본 Security Agent 검토 범위 밖**(spec 문서 정합성, 보안 취약점 아님)이므로 상태값(미해결)을 변경하지 않는다 — main session/Spec Agent 결정 대기.
