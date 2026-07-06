---
작성: Docs Agent
버전: v1.3
최종 수정: 2026-07-02 20:25
상태: 확정
---

# Diff: 014-social-login

## 커밋 메시지용 한 줄 요약

- **KO**: 소셜 로그인(카카오·구글) — 클라이언트 토큰 검증·계정 자동연동·JWT 발급 helper 공유·`social_accounts` 신규 + SEC-001 Kakao app_id 바인딩 검증 수정 + Naver 이번 릴리즈 완전 제외(SEC-001/GAP-014-10 path 3a 잔존 위험 근본 해소)
- **EN**: Add social login (Kakao/Google) — client-token verification, account auto-link, shared JWT issuance helper, new `social_accounts` table; fix SEC-001 Kakao app_id binding check; exclude Naver entirely from this release (root-causes SEC-001/GAP-014-10 residual path-3a risk)

## 변경 요약

- **백엔드 소셜 인증 인프라**: `POST /auth/social-login` 신규 엔드포인트. 클라이언트 SDK가 획득한 제공자 토큰을 백엔드가 검증(`SocialProviderPort` 추상화 + `KakaoProvider`/`GoogleProvider`/`NaverProvider`/`StubSocialProvider` 구현체)하여 `providerId`·`email`·`name`을 획득한다(ADR-001/002).
- **계정 해석 3단계 우선순위**(ADR-003, `SocialAuthService`): (a) `provider`+`providerId` 매칭 시 기존 계정 재로그인 → (b) 없으면 `email` 매칭 시 기존 계정에 자동 연동 → (c) 둘 다 없으면 `password: null`인 신규 계정 생성 + 소셜 계정 연동.
- **JWT 발급 로직 공유**(ADR-006): `AuthService.issueTokensForUser(user)`를 기존 `login()`에서 추출하여 `SocialAuthService`와 공유. 동작 불변.
- **User.password nullable 전환**(ADR-005): 소셜 전용 가입 사용자는 `password: null`. 기존 `login()`에 null 가드를 추가하여 이메일+비밀번호 로그인 시도를 401로 거부.
- **`social_accounts` 테이블 신규**(ADR-004, Database Design Agent): `users` 스키마, `users`와 1:N, `@@unique([provider, providerId])`로 중복 연동·동시성 방어.
- **Flutter 소셜 버튼 활성화**: `LoginScreen`의 `_SocialRow` 플레이스홀더(v1.1.0/009 이월)를 `GestureDetector` 콜백 구조로 전환. `SocialAuthService` 추상 인터페이스 + `StubSocialAuthService`(실 SDK 네이티브 연동은 운영 셋업 단계로 deferred). 인증 취소 시 무오류 복귀, 실패 시 오류 메시지 표시.
- **GAP-014-04 자체 발견·수정**: `GoogleProvider` 생성자의 `getOrThrow('GOOGLE_CLIENT_ID')` 즉시 조회가 크레덴셜 미설정 환경에서 `AuthModule` DI 인스턴스화 자체를 실패시켜 앱 전체 부팅 불가 상태였음. `verify()` 메서드 내부 호출로 이동하여 해소(`health.e2e-spec.ts`로 검출, 단위 테스트는 전량 mock으로 미검출).
- **GAP-014-02 (D-layer 테스트 결함) 5b 정정**: production 코드 변경 없이 Flutter 테스트 파일 2종의 타입 참조·cwd 경로 가정·영구 skip anti-pattern·플랫폼 채널 hang 4건 해소.
- **SEC-001(High) 수정 — Security Agent 발견 후 Development Agent 복귀**: `KakaoProvider`/`NaverProvider` 는 google `aud` 대조에 대응하는 app/client 바인딩 검증이 없어, 타 앱이 발급한 access token 을 그대로 재사용해도 신뢰하고 자동연동(FR-005) 경로와 결합 시 계정 탈취로 이어질 수 있었다. **Kakao**: `verify()` 앞단에 `GET /v1/user/access_token_info` 호출을 추가하고 응답 `app_id` 를 신설 env `KAKAO_APP_ID` 와 대조, 불일치·조회실패 시 `UnauthorizedException`(회귀 테스트 3건, `kakao.provider.spec.ts`). **Naver**: 대응하는 앱 식별 공개 API 가 없어 코드 수정 불가 — `NaverProvider` docstring 에 잔여 위험·완화 대안(authorization code 교환 전환/FR-005 소유권 확인 단계, 둘 다 spec 변경 필요)을 명시하고 **GAP-014-08**로 분리 추적.
- **SEC-001/GAP-014-08 완화 — Naver 자동연동(FR-005 path 3b) 비활성화 (v1.2, 폐기된 중간 완화 단계로 보존)**: Security Agent 재감사(v1.1)에서 Naver 심각도 **High 유지**(문서화만으로는 실질 완화가 아니라는 5개 근거로 하향 불가) 판정 → 사용자가 security-report.md 권고 3종 중 **(a) "FR-005 자동연동을 Naver 에 한해 비활성화"**를 채택. `SocialAuthService` 에 `AUTO_LINK_PROVIDERS: ReadonlySet<string> = new Set(['kakao','google'])` 화이트리스트를 도입하여 provider가 목록에 없으면(naver) path 3b(email 매칭 자동연동)를 즉시 `ConflictException`(409)으로 거부하고, path 3c의 P2002 race fallback도 동일하게 게이팅했다(Kakao/Google 기존 자동연동 동작은 유지). 회귀 테스트 4건(`social-auth.service.autolink-policy.spec.ts`, SC-XXX 비매핑) 추가, 백엔드 전체 307/307 PASS(303→307, 회귀 0). **이 완화는 이후 Security Agent 재감사 2차(v1.2)에서 path 3a(providerId 매칭 재로그인)가 전혀 게이팅되지 않아 근본 취약점이 잔존함이 드러나(GAP-014-10 신규 확정) 최종적으로 아래 v1.3 완전 제외로 대체되었다.**
- **SEC-001/GAP-014-10 최종 해소 — Naver 이번 릴리즈 완전 제외 (v1.3, 본 갱신, 사용자 최종 결정)**: Security Agent 재감사 2차(v1.2)가 path 3a(`social-auth.service.ts:56-60`, providerId 매칭 재로그인)는 `AUTO_LINK_PROVIDERS` 게이팅 대상에 포함되지 않아, 앱 바인딩 검증 수단이 없는 Naver 에 한해 **이미 naver 로 연동된 기존 정규 DOA 계정이 타 앱 발급 토큰 재전송으로 완전 탈취 가능**함을 신규 확정(GAP-014-10, `status: BLOCKED` 유지)함에 따라, 사용자가 Security Agent 권고 (b) **"Naver 소셜 로그인을 이번 릴리즈에서 완전 제외"**를 최종 채택했다. `SocialProviderResolver`(kakao·google 2개만 매핑)·`SocialLoginDto`(`SUPPORTED_PROVIDERS`에서 naver 제거 — `@IsIn` 화이트리스트로 컨트롤러 진입 전 400 거부, 가장 이른 차단점)·`AuthModule`(`NaverProvider` providers 배열 제거, DI 미와이어)·Flutter `login_screen.dart`(`_SocialRow`에서 네이버 버튼 제거)·`social_auth_service.dart`(`SocialAuthService` 추상 인터페이스에서 `signInWithNaver` 제거)를 수정하여 naver 가 path 3a/3b/3c 어디에도 도달할 수 없도록 API 경계에서 원천 차단했다. `naver.provider.ts` 파일은 삭제하지 않고 module/resolver 어디에도 와이어링하지 않는 방식으로 보존(향후 authorization code + client_secret 교환 방식, ADR-001 재검토 시 재도입 전제 — docstring 갱신). 백엔드 전체 **30 suites/306 tests PASS**(307→306, 5a 의 SC-009 제거 반영, 회귀 0), `tsc --noEmit`/`nest build` 0 error, `health.e2e-spec.ts` 3/3 PASS(NaverProvider DI 미와이어 상태에서도 정상 기동), `grep -rniI naver apps/backend/src mobile/customer_app/lib` 잔여 33건 전부 주석·미와이어 코드·방어적 회귀 테스트뿐(실행 경로 도달 참조 0건). Flutter `flutter analyze lib/` 0 issues, `flutter test` **7/7 PASS**(8→7, 5a 의 SC-013 제거 반영). **GAP-014-08·GAP-014-10 모두 RESOLVED by Development Agent**(근본 원인인 앱 바인딩 검증 수단 부재 자체는 사실로 남으나, naver 가 활성 provider 가 아니므로 더 이상 리스크로 작용하지 않음). **GAP-014-09(spec.md 정합성)는 범위가 확대되어 미해결 유지** — spec.md FR-001("카카오·구글·네이버 중 하나")·NFR-004("각 OAuth 제공자(카카오·구글·네이버)")·SC-009·SC-013·SC-018(크레덴셜 3종 서술)·범위 외 절의 naver 지원 서술이 구현과 불일치(CHANGES.md [014] "spec.md 문서 정확성 관찰" 절 참조, main session/Spec Agent 결정 대기).

## 변경 파일 및 라인 수

| 파일 | 추가 | 삭제 |
|---|---|---|
| `apps/backend/.env.example` | +13 | -0 |
| `apps/backend/prisma/schema.prisma` | +32 | -12 |
| `apps/backend/src/modules/auth/auth.controller.ts` | +15 | -1 |
| `apps/backend/src/modules/auth/auth.module.ts` (**본 갱신** — `NaverProvider` import·providers 엔트리 제거로 +14/-1→+13/-1) | +13 | -1 |
| `apps/backend/src/modules/auth/auth.repository.ts` | +33 | -3 |
| `apps/backend/src/modules/auth/auth.service.spec.ts` | +43 | -10 |
| `apps/backend/src/modules/auth/auth.service.ts` | +13 | -0 |
| `apps/backend/src/modules/auth/dto/auth-response.dto.ts` | +8 | -0 |
| `mobile/customer_app/lib/core/providers.dart` | +21 | -0 |
| `mobile/customer_app/lib/features/auth/login_screen.dart` (**본 갱신** — `_SocialRow` 네이버 버튼·`onNaver` 제거로 +62/-8→+54/-9) | +54 | -9 |
| **tracked 소계**(`git diff 58ee0d1 --numstat`) | **+245** | **-36** |
| `apps/backend/prisma/migrations/20260701064209_add_social_accounts/migration.sql` (신규) | +24 | -0 |
| `apps/backend/src/modules/auth/dto/social-login.dto.ts` (신규, **본 갱신** — `SUPPORTED_PROVIDERS`에서 naver 제거 주석으로 +14→+16) | +16 | -0 |
| `apps/backend/src/modules/auth/social-auth.service.spec.ts` (신규, **본 갱신** — 5a 가 SC-009 naver 테스트·`NAVER_PROFILE` fixture 제거로 +340→+313) | +313 | -0 |
| `apps/backend/src/modules/auth/social-auth.service.ts` (신규, **본 갱신** — 상단·인라인 주석을 "Naver 는 API 경계에서 완전 제외" 로 갱신, `AUTO_LINK_PROVIDERS` 로직 자체는 무변경, +136→+141) | +141 | -0 |
| `apps/backend/src/modules/auth/social/social-provider.port.ts` (신규) | +19 | -0 |
| `apps/backend/src/modules/auth/social/kakao.provider.ts` (신규, SEC-001 app_id 대조 포함) | +71 | -0 |
| `apps/backend/src/modules/auth/social/kakao.provider.spec.ts` (신규, SEC-001 회귀 테스트) | +69 | -0 |
| `apps/backend/src/modules/auth/social/google.provider.ts` (신규) | +57 | -0 |
| `apps/backend/src/modules/auth/social/naver.provider.ts` (신규, **본 갱신** — docstring 을 "이번 릴리즈 미활성(SEC-001/GAP-014-08/GAP-014-10)" 으로 전면 갱신, module/resolver 어디에도 미와이어, 로직 자체는 무변경, +53→+55) | +55 | -0 |
| `apps/backend/src/modules/auth/social/social-provider.resolver.ts` (신규, **본 갱신** — `NaverProvider` import·생성자 주입·providers 맵 엔트리 제거로 kakao·google 2개만 매핑, +31→+35) | +35 | -0 |
| `apps/backend/src/modules/auth/social/stub-social.provider.ts` (신규) | +14 | -0 |
| `apps/backend/src/modules/auth/social-auth.service.autolink-policy.spec.ts` (신규, **본 갱신** — docstring 갱신(naver 가 API 경계에서 완전 제외되어 이 서비스 도달 불가능함을 명시, assertion 무변경), +144→+147) | +147 | -0 |
| `mobile/customer_app/lib/features/auth/social_auth_service.dart` (신규, **본 갱신** — `SocialAuthService` 추상 인터페이스·`StubSocialAuthService`에서 `signInWithNaver()` 제거, 라인수 불변 +41) | +41 | -0 |
| `mobile/customer_app/test/features/social_login_flow_test.dart` (신규, **본 갱신** — 5a 가 `_StubSocialAuthService.signInWithNaver()` override 제거로 +283→+275) | +275 | -0 |
| `mobile/customer_app/test/features/social_login_static_test.dart` (신규, **본 갱신** — 5a 가 SC-013 naver 버튼 테스트·SC-018 naver 크레덴셜 단언 제거로 +162→+138) | +138 | -0 |
| **신규(untracked) 소계**(`wc -l` 전체 파일 기준) | **+1415** | **-0** |
| **합계 (코드, `docs/specs/` 산출물 제외)** | **+1660** | **-36** |

> `docs/specs/v1.1.0/014-social-login/` (spec.md·plan.md·research.md·tasks.md·data-model.md·coverage.md·coverage-gap.md·gaps.md·test-report.md·_ai-workspace/ 등 파이프라인 문서 산출물)는 위 표에서 제외한다 — 코드 변경 라인수 집계 목적이며, 문서 산출물 자체는 `git status`의 `docs/specs/v1.1.0/014-social-login/` 항목으로 별도 확인 가능하다.
> `pnpm-lock.yaml`·`apps/backend/package.json`·`mobile/customer_app/pubspec.yaml`·`pubspec.lock` — 변경 없음(신규 npm/pub 의존 0건, `git diff 58ee0d1 --stat` 확인).

## Diff

> 전체 diff 는 박제하지 않는다 — git 이 형상관리 SoT. base commit + 재생성 명령:
> `git diff 58ee0d1 -- apps/backend mobile/customer_app`
