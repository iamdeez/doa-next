---
작성: Test Agent (EXECUTION)
버전: v1.3
최종 수정: 2026-07-02 20:14
상태: 확정
---

# Coverage: 014-social-login

> **v1.3 갱신 사유**: 사용자 최종 결정(GAP-014-10 후속)으로 Naver 소셜 로그인을 이번 릴리즈에서
> 완전 제외. Development Agent 가 `SocialProviderResolver`·`SocialLoginDto`(`@IsIn` 화이트리스트)·
> `AuthModule`·Flutter `login_screen.dart`/`social_auth_service.dart` 에서 naver 를 제거(PPG-1),
> Test Agent(AUTHORING) 가 병렬로 SC-009(naver 검증 흐름)·SC-013(naver 버튼) 매핑 테스트를
> 제거하고 SC-018 검증 범위를 kakao·google 로 축소했다(`test-cases.md` v1.1). spec.md 자체는
> 아직 naver 서술을 유지하고 있어(GAP-014-09, 미해결) 아래 SC-009/013/018 행은 spec.md 원문을
> 그대로 유지하되 "상태" 열에 실제 테스트 존재 여부와 간극을 명시한다. v1.2 까지의 SC-001~008·
> 010~017·019 판정 및 §SEC-001 재검증(Kakao)·§SEC-001 재검증(Naver 자동연동 비활성) 절은
> 이력 보존을 위해 변경 없이 유지하며, 아래 §SEC-001 최종 재검증(Naver 완전 제외) 절만 신규 추가.

## 목차

- [SC × 시나리오 매트릭스](#sc--시나리오-매트릭스)
- [SEC-001 재검증 (Kakao app_id 대조)](#sec-001-재검증-kakao-app_id-대조)
- [SEC-001 재검증 (Naver 자동연동 비활성)](#sec-001-재검증-naver-자동연동-비활성)
- [SEC-001 최종 재검증 (Naver 완전 제외)](#sec-001-최종-재검증-naver-완전-제외)
- [STALE_SC 경고 (현재 spec 에 없는 SC 번호가 docstring 에 잔존)](#stale_sc-경고-현재-spec-에-없는-sc-번호가-docstring-에-잔존)

---

## SC × 시나리오 매트릭스

> "수용 기준" 열은 `spec.md` 원문 그대로 복사(PATCH-001) — spec.md 는 본 회차에서 갱신되지 않았으므로 SC-009/013/018 도 naver 를 포함한 원문을 그대로 유지한다(GAP-014-09). "검증 파일" 열은 Read/Glob 으로 실재 확인한 경로만 기재.

| SC-ID | 수용 기준 | Happy Path | Edge Case | Error Case | plan.md 시나리오 전체 | 상태 |
|---|---|---|---|---|---|---|
| SC-001 | 이미 연동된 소셜 계정(동일 provider·providerId)으로 소셜 로그인 API 요청 시 accessToken·refreshToken이 반환된다. | ✓ `test_SC001_existing_social_account_returns_tokens` | — | — | ✓ (기연동 재로그인) | PASS |
| SC-002 | 소셜 제공자 이메일이 기존 사용자 계정 이메일과 동일하나 해당 소셜 계정이 미연동 상태일 때 로그인 요청 시, 기존 계정에 소셜 계정이 연동되고 accessToken·refreshToken이 반환된다. | ✓ `test_SC002_auto_link_existing_email_returns_tokens` | — | — | ✓ (자동 연동) | PASS (본 테스트는 `provider: 'kakao'` 고정이므로 naver 제외와 무관, 회귀 없음) |
| SC-003 | 소셜 이메일에 해당하는 기존 계정이 없을 때 소셜 로그인 요청 시, 신규 사용자 계정이 생성되고 accessToken·refreshToken이 반환된다. | ✓ `test_SC003_new_user_created_returns_tokens` | — | — | ✓ (신규 가입) | PASS |
| SC-004 | SC-003 경로로 생성된 신규 사용자의 password가 null이며, 해당 계정으로 이메일+비밀번호 로그인 시도 시 오류가 반환된다. | — | — | ✓ `test_SC004_014_null_password_user_login_returns_401` | ✓ (401 Unauthorized) | PASS |
| SC-005 | 소셜 제공자로부터 이메일이 반환되지 않는 응답을 stub으로 시뮬레이션할 때 소셜 로그인 요청이 4xx 오류로 거부된다. | — | — | ✓ `test_SC005_email_null_returns_400` | ✓ (400) | PASS |
| SC-006 | 유효하지 않은 토큰으로 소셜 로그인 요청 시 4xx 오류가 반환된다. | — | — | ✓ `test_SC006_invalid_token_returns_4xx` | ✓ | PASS |
| SC-007 | `provider: 'kakao'` 식별자로 소셜 로그인 요청 시 카카오 검증 흐름이 수행되고 JWT가 반환된다. | ✓ `test_SC007_kakao_provider_verify_path_returns_jwt` | — | — | ✓ | PASS |
| SC-008 | `provider: 'google'` 식별자로 소셜 로그인 요청 시 구글 검증 흐름이 수행되고 JWT가 반환된다. | ✓ `test_SC008_google_provider_verify_path_returns_jwt` | — | — | ✓ | PASS |
| SC-009 | `provider: 'naver'` 식별자로 소셜 로그인 요청 시 네이버 검증 흐름이 수행되고 JWT가 반환된다. | — | — | — | 테스트 제거됨 | **OUT_OF_SCOPE** — 사용자 최종 결정(SEC-001/GAP-014-10)으로 Naver 를 이번 릴리즈 활성 provider 에서 완전 제외. `SocialLoginDto`(`@IsIn(['kakao','google'])`)가 `provider: 'naver'` 요청 자체를 400 으로 거부하여 이 시나리오는 production 에서 도달 불가능한 경로가 되었다(코드 대조, `social-login.dto.ts:6`). 5a 가 `test_SC009_naver_provider_verify_path_returns_jwt` 를 제거(test-cases.md v1.1). spec.md 원문은 미갱신(GAP-014-09, main session/Spec Agent 결정 대기) — coverage-gap.md 카테고리 (4) 등재 |
| SC-010 | 소셜 로그인 성공 후 `social_accounts` 테이블에 해당 provider·providerId·email·name 레코드가 존재한다. | ✓ `test_SC010_create_social_account_called_with_correct_args` | — | — | ✓ | PASS |
| SC-011 | `LoginScreen` 카카오 소셜 버튼이 탭 가능(GestureDetector 또는 동등 위젯 포함)하며 탭 핸들러가 존재한다. | ✓ `test_SC011_kakao_button_has_gesture_detector_and_handler` | — | — | ✓ | PASS |
| SC-012 | `LoginScreen` 구글 소셜 버튼이 탭 가능하며 탭 핸들러가 존재한다. | ✓ `test_SC012_google_button_has_gesture_detector_and_handler` | — | — | ✓ | PASS |
| SC-013 | `LoginScreen` 네이버 소셜 버튼이 탭 가능하며 탭 핸들러가 존재한다. | — | — | — | 테스트 제거됨 | **OUT_OF_SCOPE** — SC-009 와 동일 사유(Naver 이번 릴리즈 제외). `login_screen.dart` 의 `_SocialRow` 에서 네이버 `GestureDetector` 버튼 자체가 제거되어(코드 대조, `login_screen.dart:147-149,198-217` — `onKakao`/`onGoogle` 2개 파라미터만 존재) 이 시나리오의 검증 대상(네이버 버튼)이 production 에 더 이상 존재하지 않는다. 5a 가 `test_SC013_naver_button_has_gesture_detector_and_handler` 를 제거(test-cases.md v1.1). spec.md 원문 미갱신(GAP-014-09) — coverage-gap.md 카테고리 (4) 등재 |
| SC-014 | 소셜 로그인 성공(백엔드 JWT 수신) 후 `FlutterSecureStorage`에 accessToken·refreshToken이 저장되고 메인 화면으로 전환된다. | ✓ `test_SC014_social_login_success_stores_tokens_and_navigates` | — | — | ✓ | PASS (5b [B] 정정 — GAP-014-02) |
| SC-015 | 소셜 인증 취소 시 로그인 화면이 유지되고 오류 메시지가 표시되지 않는다. | — | ✓ `test_SC015_social_auth_cancelled_stays_on_login_no_error` | — | ✓ | PASS (5b [B] 정정 — GAP-014-02) |
| SC-016 | 소셜 로그인 실패 시 오류 메시지가 화면에 표시된다. | — | — | ✓ `test_SC016_social_login_failure_shows_error_message` | ✓ | PASS (5b [B] 정정 — GAP-014-02) |
| SC-017 | `flutter analyze` 실행 결과 0 issues. | ✓ `test_SC017_flutter_analyze_zero_issues_note`(CI 보조 마커) + 본 단계 직접 실행 `flutter analyze lib/` | — | — | ✓ | PASS (`flutter analyze lib/` → "No issues found!", naver 버튼 제거 후 재확인) |
| SC-018 | 카카오·구글·네이버 각 제공자의 인증 크레덴셜 환경변수 항목이 `.env.example`에 존재한다. | ✓ `test_SC018_env_example_contains_all_provider_credentials` (kakao·google 한정) | — | — | ✓ (부분) | **PASS (부분 — 카카오·구글만 검증)** — 5a 가 naver 크레덴셜(`NAVER_CLIENT_ID`/`NAVER_CLIENT_SECRET`) 단언을 제거(test-cases.md v1.1). `.env.example` 자체에는 두 항목이 여전히 존재(grep 확인, `.env.example:30,32`)하나 활성 provider 가 아니므로 검증 범위에서 제외됨. spec.md 원문("카카오·구글·네이버") 미갱신(GAP-014-09) |
| SC-019 | 소셜 로그인 백엔드 API P95 응답 3초 이내. | — | — | — | deferred (옵션 B, 범위 외) | DEFERRED → Deploy Agent (근거: spec.md SC-019 `[env:e2e-docker]` — 실 OAuth 제공자 크레덴셜 발급·연동 후 측정) |

**검증 파일**:
- `apps/backend/src/modules/auth/social-auth.service.spec.ts` (T-D1)
- `apps/backend/src/modules/auth/auth.service.spec.ts` (T-D2, SC-004 (v1.1.0/014 spec) 절)
- `mobile/customer_app/test/features/social_login_static_test.dart` (T-D3)
- `mobile/customer_app/test/features/social_login_flow_test.dart` (T-D4)

**태스크**: T-D1~T-D4 (design/tasks.md §Step 4 테스트 계층 — 레이어 D).

**시나리오 유형 커버리지 (naver 제외 후)**: Happy(SC-001/002/003/007/008/010/011/012/014) · Edge(SC-015) · Error(SC-004/005/006/016) — 세 유형 모두 커버 유지. SC-009·013 제거로 커버리지 유형 자체(Happy/Edge/Error)에는 영향 없음(각 유형에 대표 SC 잔존).

---

## SEC-001 재검증 (Kakao app_id 대조)

> Security Agent 지적 사항(High, `security/security-report.md` SEC-001) 수정 후 5b 재검증 결과. 아래 항목은 SC-XXX 매핑 테스트가 아니라(kakao.provider.spec.ts 는 Development Agent 소유의 보안 회귀 테스트, SC-XXX 비매핑), SC-XXX 매핑 테스트에 대한 회귀 영향 여부를 확인한 기록이다.

| 항목 | 확인 내용 | 결과 |
|---|---|---|
| 신규 파일 | `apps/backend/src/modules/auth/social/kakao.provider.spec.ts` (Read 로 실재 확인) — `KakaoProvider.verify()` 가 `access_token_info` 응답의 `app_id` 를 `KAKAO_APP_ID` 와 대조, 불일치·조회실패 시 `UnauthorizedException` | 3/3 PASS (`pnpm exec jest src/modules/auth/social/kakao.provider.spec.ts`) |
| SC-006/007 회귀 영향 | `social-auth.service.spec.ts` 의 SC-006(무효 토큰 4xx)·SC-007(kakao 경로 JWT) 은 `SocialProviderPort`/`SocialProviderResolver` 를 mock 하여 `KakaoProvider` 내부 로직을 우회한다(`mockSocialProviderResolver.resolve.mockReturnValue(kakaoPort)`) — app_id 대조 로직 추가와 무관하게 동일 동작 확인(코드 직접 대조, `social-auth.service.spec.ts:225-253`) | PASS, 회귀 0 |
| `.env.example` | `KAKAO_APP_ID=your-kakao-app-id` 추가 확인(git diff 58ee0d1). 기존 `KAKAO_REST_API_KEY`/`GOOGLE_CLIENT_ID`/`NAVER_CLIENT_ID`/`NAVER_CLIENT_SECRET` 4종 유지 — SC-018(`.env.example` 크레덴셜 존재) 영향 없음 | `test_SC018_env_example_contains_all_provider_credentials` PASS |
| 백엔드 전체 스위트 | `pnpm --filter backend test` | **29 suites, 303 tests PASS** (kakao.provider.spec.ts 3건 신규 포함, 이전 300건 회귀 0) |
| 빌드 | `pnpm --filter backend build` (`prisma generate && nest build`) | 0 error |
| health e2e | `test/health.e2e-spec.ts`(AppModule 전체 부팅) — 로컬 `.env` 에 `KAKAO_APP_ID` 미설정 상태에서도 기동 확인(lazy lookup, GAP-014-04 패턴 재사용) | 3/3 PASS |
| Naver | `naver.provider.ts` 로직 변경 없음(docstring 잔여위험 명시만 추가) — 기존 테스트 영향 없음 | 회귀 0 |

**결론**: SEC-001(Kakao 부분) 수정은 SC-001~018 매핑 테스트에 영향을 주지 않으며 회귀 0건. Naver 잔여 위험은 GAP-014-08(OPEN)로 별도 추적 중(단위 테스트 검증 대상 아님 — best-effort 문서화).

---

## SEC-001 재검증 (Naver 자동연동 비활성)

> Security Agent 재감사(v1.1) 결과 Naver 는 앱 바인딩 검증 수단 부재로 SEC-001(High) 이 잔존한다고 판정했다(GAP-014-08). 사용자가 권고안 (a) "Naver 자동연동(FR-005 path 3b) 비활성화"를 채택하여 Development Agent 가 복귀 수정했다. 아래는 5b 재검증 결과다. `social-auth.service.autolink-policy.spec.ts` 는 SC-XXX 비매핑(Development Agent 소유 보안 회귀 테스트)이므로 SC × 시나리오 매트릭스에는 등재하지 않고, 기존 SC 매핑 테스트에 대한 회귀 영향 여부만 본 절에서 확인한다.

| 항목 | 확인 내용 | 결과 |
|---|---|---|
| production 코드 대조 | `apps/backend/src/modules/auth/social-auth.service.ts` — `AUTO_LINK_PROVIDERS = new Set(['kakao','google'])` 화이트리스트 도입. path 3b(`existingUser` 발견 시): `autoLinkAllowed` 가 false(naver)이면 자동연동 없이 즉시 `ConflictException`(409). path 3c 의 P2002 race fallback 도 동일 게이팅. Kakao/Google 은 화이트리스트 포함으로 기존 동작 유지 (코드 직접 Read 확인) | 설계(GAP-014-08 완화조치)와 일치 |
| 신규 회귀 테스트 | `apps/backend/src/modules/auth/social-auth.service.autolink-policy.spec.ts` (Read 로 실재 확인, SC-XXX 비매핑) — naver+기존이메일→Conflict(createSocialAccount/createUser/issueTokensForUser 모두 미호출 단언)·naver+신규이메일→독립계정 정상생성(path 3c 회귀없음)·`it.each(['kakao','google'])`+기존이메일→자동연동 유지(회귀없음) 4케이스 | `pnpm exec jest src/modules/auth/social-auth.service.autolink-policy.spec.ts` → **4/4 PASS** |
| SC-002 회귀 영향 | `social-auth.service.spec.ts` `test_SC002_auto_link_existing_email_returns_tokens` 는 `provider: 'kakao'` 고정(코드 대조, `social-auth.service.spec.ts:155-156`) — kakao 는 `AUTO_LINK_PROVIDERS` 에 포함되어 자동연동 경로 그대로 수행 | PASS, 회귀 없음 |
| SC-009 회귀 영향 | `social-auth.service.spec.ts` `test_SC009_naver_provider_verify_path_returns_jwt` 는 `mockAuthRepository.findByProviderAndProviderId.mockResolvedValue(naverUserWithAccount)` 로 **path 3a**(기연동 재로그인)만 검증(코드 대조, `social-auth.service.spec.ts:287-304`) — 본 수정이 게이팅하는 path 3b(email 매칭 자동연동)와 무관 | PASS, 회귀 없음 |
| SC-001·SC-003·SC-005~008·SC-010 회귀 영향 | path 3a(SC-001)·path 3c 신규가입(SC-003·SC-010)·error 케이스(SC-005/006)·kakao/google 검증경로(SC-007/008)는 provider 화이트리스트 분기와 무관한 경로 — 코드 대조 확인 | PASS, 회귀 없음 |
| 5a 소유 SC 매핑 테스트 파일 수정 여부 | `social-auth.service.spec.ts`·`auth.service.spec.ts` — 본 Naver 정책 변경으로 **수정되지 않음**(Development Agent T2 기록 확인, git status 상 두 파일 unstaged 변경분은 이번 회차 이전 상태와 동일) | D-레이어 미침범 확인(§핵심 원칙 1 준수) |
| 백엔드 전체 스위트 | `pnpm --filter backend test` | **30 suites, 307 tests PASS** (기존 303 + naver 정책 회귀 4건 신규, 회귀 0) |
| 빌드 | `pnpm --filter backend build` (`prisma generate && nest build`) / `pnpm exec tsc --noEmit` | 0 error |
| health e2e | `pnpm exec jest --config test/jest-e2e.json health.e2e-spec.ts` (AppModule 전체 부팅) | 3/3 PASS |
| Flutter (범위 밖 확인) | 본 수정은 백엔드 파일만 대상(git status 확인) — Flutter 코드 무관 | `flutter test test/features/social_login_static_test.dart test/features/social_login_flow_test.dart` 8/8 PASS 재확인, `flutter analyze lib/` 0 issues |
| Breaking change 잔여참조 | `createUserWithSocialAccount` grep 전체 0건 (GAP-014-03 해소 유지) | 0건 |
| spec.md 정합성 | FR-005/NFR-002 는 provider 를 구분하지 않고 서술되어 있어 구현(naver 예외)과 문구 간 간극 존재 — **GAP-014-09 로 기록됨(Development Agent, 미해결)**. 본 Test Agent 는 spec.md 를 직접 수정하지 않으며(§핵심 원칙 준수, 산출물 단일 책임), 간극을 인지·확인만 수행 | 인지 완료 — main session/Spec Agent 결정 대기 |

**결론**: Naver 자동연동 비활성화 수정은 SC-001~018 매핑 테스트에 영향을 주지 않으며 회귀 0건. 신규 보안 회귀 테스트(`social-auth.service.autolink-policy.spec.ts`, SC-XXX 비매핑) 4건 전부 PASS. GAP-014-08 은 완화 조치(자동연동 비활성)가 적용되었으나 근본 원인(앱 바인딩 검증 수단 부재)은 미해소로 상태값 OPEN 유지(Development Agent 판단과 일치). GAP-014-09(spec.md FR-005/NFR-002 provider 예외 미반영)는 문서 정합성 간극으로 별도 추적 중.

> **v1.3 후기**: 본 절(Naver 자동연동 비활성)의 완화 조치는 GAP-014-10(path 3a 재로그인 잔존 위험) 신규 확정으로 근본 해소에 이르지 못했음이 이후 Security Agent 재감사에서 드러났다. 사용자가 최종적으로 Naver 완전 제외(아래 §SEC-001 최종 재검증 참조)를 채택했으므로, 본 절은 **폐기된 중간 완화 단계의 이력**으로 보존한다(무효화가 아닌 경과 기록).

---

## SEC-001 최종 재검증 (Naver 완전 제외)

> Security Agent 재감사(v1.2, `security/security-report.md`)가 path 3a(providerId 매칭 재로그인)에서 SEC-001(High)이 잔존함을 신규 확정(GAP-014-10 — Naver 는 app/client 바인딩 검증 수단이 없어 기존 naver 연동 정규 계정이 재로그인 경로로 완전 탈취 가능)함에 따라, 사용자가 후속 처리 선택지 (3) "Naver 소셜 로그인을 이번 릴리즈에서 완전 제외"를 최종 채택했다. Development Agent 가 `SocialProviderResolver`(kakao·google 2개만 매핑)·`SocialLoginDto`(`@IsIn(['kakao','google'])`)·`AuthModule`(`NaverProvider` DI 미와이어)·Flutter `login_screen.dart`/`social_auth_service.dart`(네이버 버튼·`signInWithNaver` 제거)를 수정했고, Test Agent(AUTHORING)가 병렬로 SC-009·SC-013 매핑 테스트를 제거·SC-018 검증 범위를 축소했다(PPG-1, run-015). 아래는 본 5b 재검증 결과다.

| 항목 | 커맨드/방법 | 결과 |
|---|---|---|
| production 코드 대조 — DTO 경계 | `apps/backend/src/modules/auth/dto/social-login.dto.ts:6` — `SUPPORTED_PROVIDERS = ['kakao', 'google'] as const`, `@IsIn(SUPPORTED_PROVIDERS)` | naver 요청은 컨트롤러 진입 전 400 Bad Request 로 거부(가장 이른 차단점) — 확인 완료 |
| production 코드 대조 — resolver 경계 | `apps/backend/src/modules/auth/social/social-provider.resolver.ts` — `providers = { kakao: this.kakao, google: this.google }` (naver 엔트리 없음) | DTO 검증을 우회해도 resolver 단계에서 2차 차단 — 확인 완료 |
| production 코드 대조 — DI 와이어링 | `apps/backend/src/modules/auth/auth.module.ts:12` — `NaverProvider` import·providers 배열 엔트리 제거(주석: "이번 릴리즈에서 미와이어") | `naver.provider.ts` 파일은 보존되나 DI 그래프상 어디에도 연결되지 않음 — 확인 완료 |
| production 코드 대조 — Flutter | `mobile/customer_app/lib/features/auth/login_screen.dart:147-149,198-217` — `_SocialRow(onKakao:..., onGoogle:...)`, 네이버 `GestureDetector`·초록 원형 'N' 버튼 없음. `social_auth_service.dart` — `SocialAuthService` 추상 인터페이스에 `signInWithNaver()` 없음(`signInWithKakao`/`signInWithGoogle` 2개만) | 확인 완료 |
| naver 잔여 참조 (Breaking change 잔여참조 검증) | `grep -rniI naver apps/backend/src mobile/customer_app/lib` | 잔여 33건 전부 (a) 설명 주석/docstring(제외 사유·재도입 전제 명시) 또는 (b) `naver.provider.ts` 자체 내부 코드(미와이어이므로 실행 경로 도달 불가) 또는 (c) `social-auth.service.autolink-policy.spec.ts`(방어적 회귀 테스트, naver 문자열을 직접 호출해 거부 동작을 검증) — **실행 경로상 도달 가능한 production 잔여 참조 0건** |
| 백엔드 SC 매핑 테스트 전체 | `pnpm exec jest src/modules/auth/social-auth.service.spec.ts src/modules/auth/auth.service.spec.ts` | 2 suites, **34 tests PASS** (기존 35 → SC-009 제거로 34, 회귀 0) |
| 백엔드 전체 스위트 | `pnpm --filter backend exec jest` | **30 suites, 306 tests PASS** (기존 307 → 5a 의 SC-009 제거 반영, 회귀 0) |
| 백엔드 빌드 | `pnpm --filter backend build` (`prisma generate && nest build`) | 0 error |
| `tsc --noEmit` | `pnpm --filter backend exec tsc --noEmit` | 0 error |
| health e2e (AppModule 전체 부팅) | `pnpm --filter backend exec jest --config test/jest-e2e.json --testPathPattern="health"` | 3/3 PASS — `NaverProvider` DI 미와이어 상태에서도 AppModule 정상 기동 확인 |
| Flutter SC 매핑 테스트 | `flutter test test/features/social_login_static_test.dart test/features/social_login_flow_test.dart` | **7/7 PASS** (기존 8/8 → 5a 의 SC-013 제거 반영, 회귀 0) |
| Flutter analyze | `flutter analyze lib/` | "No issues found!" (네이버 버튼 제거 후 0 issues 유지) |
| kakao/google SC 회귀 영향 | SC-001~008·010~012·014~017(kakao·google 전용 또는 provider 무관 경로) 코드 대조 — naver 제거는 DTO `@IsIn` 화이트리스트·resolver 맵·Flutter 버튼 목록에서만 발생, kakao/google 각 경로의 로직 자체는 무변경(`social-auth.service.ts`·`kakao.provider.ts`·`google.provider.ts` diff 없음) | 회귀 0건 |
| 5a 소유 SC 매핑 테스트 파일 수정 범위 | `social-auth.service.spec.ts`(SC-009 제거, `NAVER_PROFILE` fixture 제거)·`social_login_static_test.dart`(SC-013 제거, SC-018 naver 단언 제거)·`social_login_flow_test.dart`(`signInWithNaver` stub override 제거) — 5a AUTHORING 단독 수정, kakao/google 대상 SC(SC-001~008·010~012·014~017) 테스트 로직은 grep 대조로 무변경 확인 | D-레이어 단일 책임 준수, kakao/google 회귀 없음 |
| Breaking change 잔여참조 | `createUserWithSocialAccount` grep 전체 0건 (GAP-014-03 해소 유지) | 0건 |
| GAP-014-08/GAP-014-10 | production 코드 대조 결과 Development Agent 보고(RESOLVED)와 일치 — naver 경로 자체가 API 경계에서 소거되어 근본 원인(앱 바인딩 검증 수단 부재)은 여전히 사실이나 활성 provider 가 아니므로 리스크로 작용하지 않음 | RESOLVED 확인 |
| GAP-014-09 (spec.md 정합성) | `spec.md` FR-001("카카오·구글·네이버 중 하나")·NFR-004·SC-009·SC-013·SC-018·범위 외 절이 여전히 naver 를 지원 대상으로 서술(직접 Read 확인, 미갱신) — 구현은 naver 를 API 경계에서 완전 거부. 본 Test Agent 는 spec.md 를 직접 수정하지 않으며(§핵심 원칙 준수), 간극을 인지·확인만 수행 | 인지 완료 — main session/Spec Agent 결정 대기(미해결 유지, Development Agent 보고와 일치) |
| SC 커버리지(원문·실재 파일 재확인, PATCH-001) | 위 §SC × 시나리오 매트릭스 SC-009/013/018 행을 spec.md 원문 유지 + 상태 열에 OUT_OF_SCOPE/부분 커버 명시로 갱신 | 갱신 완료 |
| coverage-gap.md | GAP-014-09 를 카테고리 (4)로 승격(참고 등재 → 정식 미커버 항목), SC-009·SC-013·SC-018(naver 부분) 신규 등재 | 갱신 완료(아래 coverage-gap.md 참조) |

**판정**: Naver 완전 제외 조치는 SC-001~008·010~012·014~017 매핑 테스트(kakao·google 전용 또는 provider 무관 경로)에 회귀를 일으키지 않았다(회귀 0건). SC-009·SC-013 은 테스트가 의도적으로 제거되어 "실패"가 아닌 "OUT_OF_SCOPE"로 재분류했다. SC-018 은 kakao·google 부분만 계속 PASS(naver 부분은 검증 범위에서 제외). GAP-014-08·GAP-014-10 은 근본 원인 해소가 아닌 리스크 경로 자체 소거로 RESOLVED 확인. GAP-014-09(spec.md naver 서술 잔존)는 여전히 미해결 상태이며 main session/Spec Agent 결정이 필요함을 재확인했다.

---

## STALE_SC 경고 (현재 spec 에 없는 SC 번호가 docstring 에 잔존)

git diff 범위 내 파일(`apps/backend/src/modules/auth/auth.service.spec.ts`)에 v1.1.0/013·v1.0.0/001 spec 의 SC 번호(SC-015·016·017·018·020·022·023)가 잔존하나, 전 항목이 PATCH-A18 출처 정규식(`(v1.1.0/013 spec)` / `(v1.0.0/001 spec)`)으로 source-annotated 되어 자동 silence 대상이다(옵션 A 적용 완료 — 5a AUTHORING 단계 기록, `_ai-workspace/pipeline-log.md` "2026-07-01 17:25" 이벤트 참조).

**본 5b 재검출 결과**: 0건 (전 항목 silence 조건 충족 확인).

**Naver 완전 제외 재검증(본 회차) 재검출 결과**: 0건. `grep -rnoE "SC-[0-9]+"` 로 `social-auth.service.spec.ts`·`auth.service.spec.ts`·`kakao.provider.spec.ts`·`social-auth.service.autolink-policy.spec.ts`·Flutter 테스트 2종 전체를 재검사한 결과, spec.md 현재 SC-001~019 범위 밖 번호는 모두 `auth.service.spec.ts` 내 기존 출처-annotated 항목(SC-013·017·020·022·023 등, `(v1.1.0/013 spec)`/`(v1.0.0/001 spec)`)뿐이며, 본 회차에서 이 파일은 수정되지 않았다(Development/Test Agent 양쪽 확인, `git status` 대조). `kakao.provider.spec.ts`·`social-auth.service.autolink-policy.spec.ts` 는 SC-XXX 마커 0건(grep 매치 없음, docstring 에 "SC-XXX 매핑 없음" 명시) — STALE_SC 검출 대상 아님.

**결정 (PATCH-A16/A17)**: 위 STALE_SC 는 옵션 A(v1.1.0/013·v1.0.0/001 출처주석)가 이미 사용자 승인된 상태이며, 본 회차 재검출도 0건이므로 신규 사용자 확인 절차(묻기)는 불요(재확인만 수행, 기존 `decision: USER_OPTION_A` 유지).

**SEC-001 재검증(본 회차) 재검출 결과**: 0건. `auth.service.spec.ts`·`social-auth.service.spec.ts` 는 SEC-001 수정 중 미수정(git diff 대상 외, Development Agent T2 기록 확인) — 재검출 대상 자체가 직전 검사와 동일. 신규 파일 `kakao.provider.spec.ts` 는 SC-XXX 마커 0건(grep 확인, `SC-[0-9]+` 매치 없음) — STALE_SC 검출 대상 아님.

**Naver 자동연동 비활성 재검증(본 회차) 재검출 결과**: 0건. `auth.service.spec.ts`·`social-auth.service.spec.ts` 는 본 Naver 정책 변경 중 미수정(Development Agent T2 기록 확인, git status 상 두 파일의 변경분은 이전 회차와 동일) — 재검출 대상 자체가 직전 검사와 동일하여 0건 유지. 신규 파일 `social-auth.service.autolink-policy.spec.ts` 는 SC-XXX 마커 0건(grep `SC-[0-9]+` 매치 없음, docstring 에 "SC-XXX 매핑 없음" 명시) — STALE_SC 검출 대상 아님.

**결정 (PATCH-A16/A17)**: 위 STALE_SC 는 옵션 A(v1.1.0/013·v1.0.0/001 출처주석) 가 5a AUTHORING 단계에서 이미 적용·사용자 승인된 상태이며, 본 회차 재검출도 동일하게 0건이므로 신규 사용자 확인 절차(묻기)는 불요(재확인만 수행, 기존 `decision: USER_OPTION_A` 유지).
