---
작성: Test Agent (EXECUTION)
버전: v1.3
최종 수정: 2026-07-02 20:14
상태: 확정
---

# 테스트 실행 결과

> **v1.3 갱신 사유**: Security Agent 재감사(v1.2)가 path 3a(providerId 재로그인)에서 SEC-001(High)
> 잔존을 신규 확정(GAP-014-10 — Naver app-binding 검증 수단 부재로 기존 naver 연동 계정
> 완전 탈취 가능)함에 따라, 사용자가 최종적으로 "Naver 소셜 로그인을 이번 릴리즈에서 완전
> 제외"를 채택했다. Development Agent(4단계)가 `SocialProviderResolver`·`SocialLoginDto`
> (`@IsIn(['kakao','google'])`)·`AuthModule`·Flutter `login_screen.dart`/`social_auth_service.dart`
> 에서 naver 를 완전히 제거하고, Test Agent(AUTHORING, 5a)가 병렬로 SC-009(naver 검증 흐름)·
> SC-013(naver 버튼) 매핑 테스트를 제거·SC-018 검증 범위를 kakao·google 로 축소했다(PPG-1,
> run-015). 본 v1.3 은 이 병렬 작업(PPG-1) 완료 후 5b 재검증 결과다. v1.2(2026-07-02 03:54)
> 까지의 SC-001~008·010~017·019 판정 및 §SEC-001 재검증(Kakao)·§Naver 자동연동 비활성
> 재검증 절은 이력 보존을 위해 변경 없이 유지하며, 아래 §Naver 완전 제외 최종 재검증(본 회차)
> 절만 신규 추가.
>
> **v1.2 갱신 사유**: Security Agent SEC-001(High) 재감사 결과 Naver 잔여 위험(GAP-014-08) 확정
> → 사용자가 권고안 (a) "Naver 자동연동(FR-005 path 3b) 비활성화"를 채택 → Development Agent
> 복귀 수정(`AUTO_LINK_PROVIDERS` 화이트리스트, naver 는 409 Conflict 거부) 반영 후 재검증.
> v1.1(2026-07-01 22:38) 의 SC-001~018·SEC-001(Kakao) 판정은 변경 없이 유지되며, 아래
> §Naver 자동연동 비활성 재검증 절만 신규 추가.
>
> **v1.1 갱신 사유**: Security Agent SEC-001(High) 지적 — Kakao/Naver provider 토큰 app 바인딩
> 검증 누락 — 에 대한 Development Agent 복귀 수정(Kakao `access_token_info` app_id 대조 추가,
> Naver best-effort 문서화) 반영 후 재검증. v1.0(2026-07-01 17:55) 의 SC-001~018 판정은
> 변경 없이 유지되며, 아래 §SEC-001 재검증 절만 신규 추가.

## 목차

- [실행 요약](#실행-요약)
- [실패 목록](#실패-목록)
- [SC 미커버 항목](#sc-미커버-항목)
- [plan.md 매핑표 검증](#planmd-매핑표-검증)
- [deferred SC 목록](#deferred-sc-목록)
- [설계 문서 정합성](#설계-문서-정합성)
- [회귀 탐지](#회귀-탐지)
- [SEC-001 재검증 (본 회차)](#sec-001-재검증-본-회차)
- [Naver 자동연동 비활성 재검증 (본 회차)](#naver-자동연동-비활성-재검증-본-회차)
- [Naver 완전 제외 최종 재검증 (본 회차)](#naver-완전-제외-최종-재검증-본-회차)

---

## 실행 요약

**전제 조건 확인**:
- 마이그레이션 `20260701064209_add_social_accounts` 적용 확인 (`prisma migrate status` → "Database schema is up to date!").
- 백엔드 tsc 0 error, PPG-1(4단계+5a) 양쪽 status: COMPLETE 확인 (pipeline-log.md "병렬 그룹 완료" 이벤트, 2026-07-01 17:31).

**SC-XXX 매핑 테스트 실행 결과** (본 spec 범위 한정):

| 스코프 | 커맨드 | 결과 |
|---|---|---|
| 백엔드 SC-001~010 | `pnpm exec jest src/modules/auth/social-auth.service.spec.ts src/modules/auth/auth.service.spec.ts` | 2 suites, **35 tests PASS** |
| 백엔드 tsc | `pnpm exec tsc --noEmit` | 0 error |
| Flutter SC-011/012/013/017/018 (static) | `flutter test test/features/social_login_static_test.dart` | **5/5 PASS** |
| Flutter SC-014/015/016 (flow) | `flutter test test/features/social_login_flow_test.dart` | **3/3 PASS** |
| Flutter analyze (SC-017, production 범위) | `flutter analyze lib/` | **No issues found!** |
| Flutter analyze (해당 D-layer 파일) | `flutter analyze test/features/social_login_flow_test.dart test/features/social_login_static_test.dart` | 2 issues, 전부 info(`depend_on_referenced_packages`, `path`/`test` 패키지) — SC-017 범위(production lib/) 밖, 다른 pre-existing 013 test 파일(`static_verification_test.dart`)도 동일 패턴 존재 |

**SC-001~008·010~017 전체 통과. SC-009·SC-013 은 v1.3 부터 OUT_OF_SCOPE(Naver 완전 제외 — 아래 §Naver 완전 제외 최종 재검증 참조). SC-018 은 kakao·google 부분만 PASS. SC-019 는 spec.md 명시 deferred.**

**참고(범위 밖 — 정보용, gate 판정에 미사용)**:
- 백엔드 전체 스위트 `pnpm exec jest` — 28 suites, 300 tests PASS (본 spec 외 기존 테스트 포함, 회귀 없음 확인 목적). **v1.1 재검증 시점(SEC-001 Kakao 수정 후) 은 29 suites, 303 tests PASS** — 신규 `kakao.provider.spec.ts`(3건, SC-XXX 비매핑 보안 회귀 테스트) 추가분, 기존 300건 회귀 0. **v1.2 재검증 시점(Naver 자동연동 비활성 후) 은 30 suites, 307 tests PASS** — 신규 `social-auth.service.autolink-policy.spec.ts`(4건, SC-XXX 비매핑 보안 회귀 테스트) 추가분, 기존 303건 회귀 0. **본 v1.3 재검증 시점(Naver 완전 제외 후) 은 30 suites, 306 tests PASS** — 5a 가 SC-009(naver) 매핑 테스트 1건을 제거하여 307 → 306 (회귀 0, 의도된 제거). 아래 §SEC-001 재검증·§Naver 자동연동 비활성 재검증·§Naver 완전 제외 최종 재검증 참조.
- `test/health.e2e-spec.ts` (AppModule 전체 부팅 e2e) — 3/3 PASS. GAP-014-04(GoogleProvider 부팅 크래시) 수정 유지 확인. **v1.1 재검증**: 로컬 `.env` 에 `KAKAO_APP_ID` 미설정 상태에서도 3/3 PASS 유지(lazy lookup 회귀 없음). **v1.2 재검증**: 3/3 PASS 재확인(Naver 정책 변경은 부팅 경로와 무관). **본 v1.3 재검증**: 3/3 PASS 재확인(`NaverProvider` DI 미와이어 상태에서도 AppModule 정상 기동).

---

## 실패 목록

**최초 실행 시 발견 후 본 단계에서 정정 완료된 항목** (GAP-014-02, [B] 테스트 오류 — 상세는 gaps.md 참조):

| 항목 | 최초 증상 | 원인 분류 | 처리 |
|---|---|---|---|
| `social_login_flow_test.dart:115` | `flutter analyze` error: `non_type_as_type_argument` (`ProviderScopeWidget` 내부 타입 참조) | [B] 테스트 오류 | `tester.container(of: find.byType(LoginScreen))` (공개 API) 로 교체 |
| `social_login_static_test.dart` `libPath()`/`backendEnvExamplePath()` | SC-011·012·013·018 FAIL("파일이 존재해야 한다") | [B] 테스트 오류 (cwd 가정 오류) | 패키지 루트 기준으로 경로 계산 정정 |
| `social_login_flow_test.dart` SC-014/015/016 3건 | `find.byKey(Key('social-btn-kakao'))` 가 존재하지 않는 Key 참조 → 조건부 skip 으로 assert 미실행(항상 skipped) | [B] 테스트 오류 (production 에 없는 Key 가정, TDD-Red 잔존 skip 패턴) | 이모지 텍스트('💬') ancestor 기반 Finder로 교체 + skip 분기 제거 |
| `social_login_flow_test.dart` SC-014 | 위 정정 후 `pumpAndSettle timed out` (`_tokens.save` 가 실 `FlutterSecureStorage` 플랫폼 채널 무응답으로 무한 대기) | [B] 테스트 오류 (D-layer 테스트가 platform-dependent 의존을 override 하지 않음) | `tokenStoreProvider` 를 in-memory `_FakeTokenStore` 로 override |

**정정 후 최종 실행**: 위 4건 모두 재실행 PASS. 현재 실패 0건.

---

## SC 미커버 항목

**v1.3 갱신**: SC-009(naver 검증 흐름)·SC-013(naver 버튼 핸들러)는 사용자 최종 결정(SEC-001/GAP-014-10)으로 Naver 를 이번 릴리즈 활성 provider 에서 완전 제외함에 따라 5a 가 대응 테스트를 제거했다. 이는 "테스트 미작성"·"테스트 실패"가 아닌 **"사용자 보안 결정에 의한 스코프 제외"**이며, coverage-gap.md 카테고리 (4) 차후 점검으로 분류했다(spec.md 자체는 아직 naver 서술을 유지 — GAP-014-09, 미해결). SC-018 은 kakao·google 부분만 PASS 유지, naver 크레덴셜 검증 부분은 동일 사유로 범위 제외(coverage-gap.md 참조).

SC-001~008·010~012·014~017 전부 대응 테스트 존재·PASS. SC-019 는 spec.md 명시 deferred(아래 참조) — "미커버"가 아닌 "명시적 범위 외 지연"으로 분류.

---

## plan.md 매핑표 검증

| SC-ID | 관련 테스트 | 통과 여부 | 미커버 근본원인 |
|---|---|---|---|
| SC-001 | `test_SC001_existing_social_account_returns_tokens` | PASS | - |
| SC-002 | `test_SC002_auto_link_existing_email_returns_tokens` | PASS | - |
| SC-003 | `test_SC003_new_user_created_returns_tokens` | PASS | - |
| SC-004 | `test_SC004_014_null_password_user_login_returns_401` | PASS | - |
| SC-005 | `test_SC005_email_null_returns_400` | PASS | - |
| SC-006 | `test_SC006_invalid_token_returns_4xx` | PASS | - |
| SC-007 | `test_SC007_kakao_provider_verify_path_returns_jwt` | PASS | - |
| SC-008 | `test_SC008_google_provider_verify_path_returns_jwt` | PASS | - |
| SC-009 | (제거됨 — 5a v1.1) | - | OUT_OF_SCOPE — Naver 완전 제외(사용자 결정, SEC-001/GAP-014-10) — coverage-gap.md 참조 |
| SC-010 | `test_SC010_create_social_account_called_with_correct_args` | PASS | - |
| SC-011 | `test_SC011_kakao_button_has_gesture_detector_and_handler` | PASS | - |
| SC-012 | `test_SC012_google_button_has_gesture_detector_and_handler` | PASS | - |
| SC-013 | (제거됨 — 5a v1.1) | - | OUT_OF_SCOPE — Naver 완전 제외(사용자 결정, SEC-001/GAP-014-10) — coverage-gap.md 참조 |
| SC-014 | `test_SC014_social_login_success_stores_tokens_and_navigates` | PASS | - |
| SC-015 | `test_SC015_social_auth_cancelled_stays_on_login_no_error` | PASS | - |
| SC-016 | `test_SC016_social_login_failure_shows_error_message` | PASS | - |
| SC-017 | `test_SC017_flutter_analyze_zero_issues_note` + `flutter analyze lib/` (직접 실행) | PASS | - |
| SC-018 | `test_SC018_env_example_contains_all_provider_credentials` (kakao·google 한정) | PASS (부분) | naver 크레덴셜 단언 제거 — coverage-gap.md 참조 |
| SC-019 | (없음) | - | deferred(spec.md 명시, `[env:e2e-docker]`) — coverage-gap.md 참조 |

---

## deferred SC 목록

| SC-ID | env 태그 | deferred 사유 | 검증 주체 |
|---|---|---|---|
| SC-019 | `[env:e2e-docker]` | 실 OAuth 제공자 크레덴셜 발급·연동 후 측정 필요(spec.md 명시 범위 외) | Deploy Agent (또는 사후 운영 검증, spec PROC-014) |

---

## 설계 문서 정합성

- **spec.md FR-XXX/SC-XXX 대조**: FR-001~015, NFR-001~005 전부 대응 SC-XXX 존재(spec.md §요구사항 구조화 매트릭스 확인). SC 없는 FR 0건.
- **plan.md 테스트 전략표 대조**: SC-001~019 전 항목이 plan.md §테스트 전략 표와 test-cases.md 매트릭스에 동일하게 매핑됨. 시나리오 유형(Happy/Edge/Error) 일치.
- **plan.md Test Authoring Contract 대조**: `SocialAuthService.login`, `SocialProviderPort.verify`, `AuthRepository` 메서드 시그니처가 production 구현과 일치(social-auth.service.spec.ts·auth.service.spec.ts PASS로 간접 확인). UI 화면 canonical(PATCH-013-01, `ConsumerStatefulWidget` + `ProviderScope` 래핑)도 실제 `login_screen.dart`·수정된 `social_login_flow_test.dart` 구조와 일치.
- **불일치**: GAP-014-02(D-layer 테스트 결함, [B])는 v1.0 단계에서 정정 완료(위 §실패 목록·gaps.md 참조) — production/plan.md 불일치가 아닌 테스트 코드 자체의 결함이었음.
- **v1.3 신규 불일치 (GAP-014-09, 미해결)**: spec.md FR-001("카카오·구글·네이버 중 하나")·NFR-004("각 OAuth 제공자(카카오·구글·네이버)")·SC-009·SC-013·SC-018("카카오·구글·네이버 각 제공자의...")·범위 외 절("카카오·구글·네이버 개발자 콘솔")이 여전히 naver 를 지원 대상으로 서술하고 있으나, production 구현은 naver 를 API 경계(`SocialLoginDto` `@IsIn(['kakao','google'])`)에서부터 완전히 거부한다(직접 Read 대조 확인, 코드 우선). 본 Test Agent 는 spec.md 를 직접 수정하지 않으며(§핵심 원칙 준수, 산출물 단일 책임 — spec.md 는 Spec Agent 소유), 간극을 gaps.md GAP-014-09 및 test/coverage-gap.md 에 기록하고 status 보고에 명시하는 것으로 처리를 위임한다. main session/Spec Agent 의 spec.md 갱신 결정 대기 상태.

---

## 회귀 탐지

- 백엔드 전체 스위트(28 suites/300 tests) PASS — 본 spec 변경(auth.service.ts null 가드, auth.controller.ts social-login 라우트, auth.module.ts DI 5종, auth-response.dto.ts)으로 인한 기존 테스트 회귀 없음.
- `test/health.e2e-spec.ts`(AppModule 전체 부팅) PASS — GAP-014-04(GoogleProvider 생성자 크레덴셜 조회로 인한 부팅 크래시) 수정이 유지됨을 재확인.
- Breaking change(`User.password: String → String?`) 잔여 참조: `createUserWithSocialAccount` grep 결과 0건(GAP-014-03 해소 확인, `AuthRepository` dead code 제거 유지).
- Flutter `login_screen.dart`·`providers.dart` 변경에 대한 회귀는 범위(social 관련 파일)로 한정 확인. 프로젝트 전체 `flutter test` 는 SC-XXX 매핑 범위를 벗어나 본 단계 실행 대상에서 제외(§실행 범위 원칙 — 05-test.md).
- **v1.1 재검증**: SEC-001 수정(Kakao/Naver provider)은 Flutter 코드에 영향 없음(Development Agent T3 기록 확인, `git diff` 대상에 Flutter 파일 없음) — `flutter test test/features/social_login_static_test.dart test/features/social_login_flow_test.dart` 8/8 PASS, `flutter analyze lib/` 0 issues 재확인.
- **v1.2 재검증**: Naver 자동연동 비활성화 수정(`social-auth.service.ts` `AUTO_LINK_PROVIDERS` 화이트리스트·`naver.provider.ts` docstring)은 백엔드 파일에만 한정(`git status` 확인, Flutter 파일 변경 없음) — Flutter 8/8 PASS, `flutter analyze lib/` 0 issues 재확인. 5a 소유 SC 매핑 테스트 파일(`social-auth.service.spec.ts`·`auth.service.spec.ts`) 은 본 회차에서 수정되지 않음(Development Agent T2 자체 확인 + 본 Test Agent git status 재대조, D-레이어 미침범 원칙 준수).
- **본 v1.3 재검증(Naver 완전 제외)**: kakao/google 대상 SC(SC-001~008·010~012·014~017) 로직 무변경 확인(코드 대조, `social-auth.service.ts`·`kakao.provider.ts`·`google.provider.ts` diff 없음 — naver 제거는 DTO 화이트리스트·resolver 맵·Flutter 버튼 목록에서만 발생) — 백엔드 30 suites/306 tests PASS(기존 307 → SC-009 제거 반영, 회귀 0), Flutter 7/7 PASS(기존 8/8 → SC-013 제거 반영, 회귀 0), `flutter analyze lib/` 0 issues. health e2e 3/3 PASS(`NaverProvider` DI 미와이어 상태에서도 정상 기동). `createUserWithSocialAccount` grep 잔여참조 0건(GAP-014-03 해소 유지). naver 잔여 참조(그렙 33건)는 전부 설명 주석·미와이어 코드·방어적 회귀 테스트뿐이며 실행 경로상 도달 가능한 참조 0건(Breaking change 잔여 참조 기준 충족).

---

## SEC-001 재검증 (본 회차)

Security Agent(선택 단계) 가 지적한 SEC-001(High — Kakao/Naver provider 토큰의 app/client 바인딩
검증 누락, `security/security-report.md` 참조) 에 대해 Development Agent 가 복귀 수정한 후
재실행한 결과.

| 항목 | 커맨드/방법 | 결과 |
|---|---|---|
| Kakao 회귀 테스트(신규) | `pnpm exec jest src/modules/auth/social/kakao.provider.spec.ts` | 3/3 PASS (정상 app_id 통과·불일치 app_id 거부·access_token_info 실패 거부) |
| 이전 41건(SC-001~018 매핑, 백엔드 35+3(kakao신규는 별도)+Flutter 8) 회귀 | 백엔드: `pnpm exec jest src/modules/auth/social-auth.service.spec.ts src/modules/auth/auth.service.spec.ts src/modules/auth/social/kakao.provider.spec.ts` → 38 tests PASS(기존 35 + kakao 신규 3). Flutter: `flutter test test/features/social_login_static_test.dart test/features/social_login_flow_test.dart` → 8/8 PASS | **회귀 0** |
| 백엔드 전체 스위트 | `pnpm --filter backend test` | 29 suites, **303/303 PASS** (기존 300 + kakao 신규 3, 회귀 0) |
| 백엔드 빌드 | `pnpm --filter backend build` | 0 error |
| health e2e (AppModule 전체 부팅) | `pnpm exec jest --config test/jest-e2e.json --testPathPattern=health` | 3/3 PASS — `KAKAO_APP_ID` 로컬 `.env` 미설정 상태에서도 정상 기동(lazy lookup, GAP-014-04 패턴 재사용 확인) |
| `tsc --noEmit` | `pnpm exec tsc --noEmit` (apps/backend) | 0 error |
| STALE_SC 재검출 | `auth.service.spec.ts`/`social-auth.service.spec.ts` grep 재검사 | 0건 (본 SEC-001 수정 중 두 파일 미수정 확인 — Development Agent T2 기록. `kakao.provider.spec.ts` 는 SC-XXX 마커 자체가 0건) |
| SC 커버리지(원문·실재 파일 재확인, PATCH-001) | coverage.md SC-001~018 행 원문·검증 파일 경로 재대조 | 변경 없음 유지, 신규 §SEC-001 재검증 절 추가 |
| coverage-gap.md | GAP-014-08(Naver 잔여 위험) 카테고리 검토 | 카테고리 (2) 단위테스트 불가(공개 API 로 app 바인딩 검증 불가) — 기존 SC-019/GAP-014-01/SC-017/실 SDK 4항목에 추가 등재 |

**판정**: SEC-001(Kakao) 수정이 기존 SC-001~018 매핑 테스트·백엔드 전체 스위트·health e2e 에
회귀를 일으키지 않았으며, 신규 보안 회귀 테스트(kakao.provider.spec.ts, SC-XXX 비매핑) 3건도
전부 PASS. Naver 잔여 위험(GAP-014-08)은 코드 수정 없는 best-effort 문서화이므로 테스트
영향 없음(공개 API 제약으로 단위테스트 불가 — coverage-gap.md 갱신).

---

## Naver 자동연동 비활성 재검증 (본 회차)

Security Agent 재감사(v1.1) 가 Naver SEC-001(High) 을 유지 판정하고(GAP-014-08, 앱 바인딩
검증 수단 부재로 근본 해결 불가) 3종 권고안을 제시했다. main session 이 사용자와 함께
권고안 (a) "Naver 자동연동(FR-005 path 3b) 비활성화"를 채택하여 Development Agent 가
복귀 수정(`social-auth.service.ts` `AUTO_LINK_PROVIDERS` 화이트리스트 — kakao·google 만
자동연동 허용, naver 는 email 매칭 시 409 Conflict 거부)을 완료했다. 아래는 이에 대한
5b 재검증 결과다.

| 항목 | 커맨드/방법 | 결과 |
|---|---|---|
| 신규 회귀 테스트 | `pnpm exec jest src/modules/auth/social-auth.service.autolink-policy.spec.ts` | **4/4 PASS** (naver+기존이메일→Conflict·naver+신규이메일→독립계정 정상생성·kakao/google+기존이메일→자동연동 유지 `it.each` 2케이스) |
| production 코드 대조 | `social-auth.service.ts` Read — `AUTO_LINK_PROVIDERS = new Set(['kakao','google'])`, path 3b·path 3c race fallback 양쪽에서 `autoLinkAllowed` 게이팅 일관 적용 확인 | 설계(GAP-014-08 완화조치)와 일치, 코드 검증 완료 |
| 이전 43건(SC-001~018 매핑, 백엔드 35+Flutter 8) 회귀 | 백엔드: `pnpm exec jest src/modules/auth/social-auth.service.spec.ts src/modules/auth/auth.service.spec.ts` → 35 tests PASS(변경 없음). Flutter: `flutter test test/features/social_login_static_test.dart test/features/social_login_flow_test.dart` → 8/8 PASS | **회귀 0** |
| SC-002(kakao 자동연동) 코드 대조 | `test_SC002_auto_link_existing_email_returns_tokens` 가 `provider: 'kakao'` 고정(`social-auth.service.spec.ts:155-156`) — 화이트리스트 포함으로 동일 동작 | 회귀 없음 확인 |
| SC-009(naver 검증경로) 코드 대조 | `test_SC009_naver_provider_verify_path_returns_jwt` 가 path 3a(`findByProviderAndProviderId` 매칭)만 검증(`social-auth.service.spec.ts:287-304`) — path 3b(자동연동) 정책 변경과 무관 | 회귀 없음 확인, [B] 정정 불요 |
| 백엔드 전체 스위트 | `pnpm --filter backend test` | **30 suites, 307/307 PASS** (기존 303 + naver 정책 회귀 4건 신규, 회귀 0) |
| 백엔드 빌드 | `pnpm --filter backend build` | 0 error |
| `tsc --noEmit` | `pnpm exec tsc --noEmit` (apps/backend) | 0 error |
| health e2e (AppModule 전체 부팅) | `pnpm exec jest --config test/jest-e2e.json health.e2e-spec.ts` | 3/3 PASS |
| Flutter (범위 밖 확인) | 본 수정은 백엔드 파일만 대상(`git status` 확인) | `flutter test` 8/8 PASS, `flutter analyze lib/` 0 issues |
| Breaking change 잔여참조 | `createUserWithSocialAccount` grep 전체 0건 | 0건 (GAP-014-03 해소 유지) |
| STALE_SC 재검출 | `auth.service.spec.ts`/`social-auth.service.spec.ts` grep 재검사 + 신규 `social-auth.service.autolink-policy.spec.ts` grep | 0건 (두 파일 미수정 확인. 신규 파일은 SC-XXX 마커 0건, docstring 에 "SC-XXX 매핑 없음" 명시) |
| SC 커버리지(원문·실재 파일 재확인, PATCH-001) | coverage.md SC-002·SC-009 행에 naver 정책 재검증 각주 추가, 신규 §SEC-001 재검증(Naver) 절 추가 | 갱신 완료 |
| coverage-gap.md | GAP-014-08 완화조치 적용 사실 갱신(근본원인 미해소로 카테고리 (2) 유지), GAP-014-09(spec.md 정합성 간극) 참고 등재 | 갱신 완료 |
| 설계문서 정합성 (GAP-014-09 인지) | `spec.md` FR-005·NFR-002 는 provider 무관 서술 — naver 예외 구현과 문구 간 간극이 Development Agent 에 의해 이미 GAP-014-09 로 기록됨. 본 Test Agent 는 spec.md 를 직접 수정하지 않고 간극을 인지·재확인만 수행 | 인지 완료 — main session/Spec Agent 결정 대기, 본 Test Agent 는 spec.md 미수정(단일 책임 준수) |

**판정**: Naver 자동연동 비활성화 수정이 기존 SC-001~018 매핑 테스트(백엔드 35+Flutter 8,
43건)·백엔드 전체 스위트·health e2e 에 회귀를 일으키지 않았으며, 신규 보안 회귀 테스트
(`social-auth.service.autolink-policy.spec.ts`, SC-XXX 비매핑) 4건도 전부 PASS. 5a 소유
SC 매핑 테스트(`social-auth.service.spec.ts`)는 provider 무관 자동연동을 단언하지 않음
(SC-002 는 kakao 고정, SC-009 는 path 3a 한정)이 확인되어 naver 정책 변경과 충돌하지
않으며 [B] 정정이 불필요하다. GAP-014-08 은 완화 조치 적용으로 갱신(상태값 OPEN 유지,
근본원인 미해소)되었고 GAP-014-09(spec.md 정합성 간극)는 인지·기록 완료 상태다.

> **v1.3 후기**: 위 자동연동 비활성 완화는 이후 Security Agent 재감사(v1.2)에서 path 3a
> (providerId 재로그인)의 SEC-001 잔존이 신규 확정되어(GAP-014-10) 근본 해소에 이르지
> 못했음이 드러났다. 사용자가 최종적으로 Naver 완전 제외를 채택했으므로 본 절은
> **폐기된 중간 완화 단계의 이력**으로 보존한다. 최종 판정은 아래 §Naver 완전 제외 최종
> 재검증(본 회차) 참조.

---

## Naver 완전 제외 최종 재검증 (본 회차)

Security Agent 재감사(v1.2, `security/security-report.md`)가 path 3a(providerId 매칭
재로그인)에서 SEC-001(High)이 잔존함을 신규 확정(GAP-014-10 — Naver 는 app/client 바인딩
검증 수단이 없어 기존 naver 연동 정규 계정이 재로그인 경로로 완전 탈취 가능)함에 따라,
사용자가 후속 처리 선택지 (3) "Naver 소셜 로그인을 이번 릴리즈에서 완전 제외"를 최종
채택했다. Development Agent(4단계)와 Test Agent(AUTHORING, 5a)가 PPG-1 으로 병렬 처리한
결과(run-015)에 대한 5b 재검증이다.

| 항목 | 커맨드/방법 | 결과 |
|---|---|---|
| production 코드 대조 — DTO/resolver/DI/Flutter 4개 경계 | `social-login.dto.ts`(`@IsIn(['kakao','google'])`)·`social-provider.resolver.ts`(kakao·google 2개만 매핑)·`auth.module.ts`(`NaverProvider` 미와이어)·`login_screen.dart`/`social_auth_service.dart`(네이버 버튼·`signInWithNaver` 제거) 4개 파일 직접 Read 대조 | naver 요청이 도달 가능한 실행 경로 0건 확인 |
| naver 잔여 참조 (Breaking change 잔여참조) | `grep -rniI naver apps/backend/src mobile/customer_app/lib` | 33건 전부 설명 주석/docstring·미와이어 `naver.provider.ts` 내부 코드·방어적 회귀 테스트(`social-auth.service.autolink-policy.spec.ts`)뿐 — 실행 경로상 도달 가능한 production 잔여 참조 0건 |
| 백엔드 SC 매핑 테스트(SC-001~010) | `pnpm exec jest src/modules/auth/social-auth.service.spec.ts src/modules/auth/auth.service.spec.ts` | 2 suites, **34 tests PASS** (기존 35 → SC-009 제거로 34, 회귀 0) |
| 백엔드 전체 스위트 | `pnpm --filter backend exec jest` | **30 suites, 306/306 PASS** (기존 307 → SC-009 제거 반영, 회귀 0) |
| 백엔드 빌드 | `pnpm --filter backend build` (`prisma generate && nest build`) | 0 error |
| `tsc --noEmit` | `pnpm --filter backend exec tsc --noEmit` | 0 error |
| health e2e (AppModule 전체 부팅) | `pnpm --filter backend exec jest --config test/jest-e2e.json --testPathPattern="health"` | 3/3 PASS — `NaverProvider` DI 미와이어 상태에서도 정상 기동 |
| Flutter SC 매핑 테스트(SC-011/012/014~017, static+flow) | `flutter test test/features/social_login_static_test.dart test/features/social_login_flow_test.dart` | **7/7 PASS** (기존 8/8 → SC-013 제거 반영, 회귀 0) |
| Flutter analyze | `flutter analyze lib/` | "No issues found!" |
| kakao/google SC 회귀 영향 | SC-001~008·010~012·014~017 코드 대조 — naver 제거는 화이트리스트/맵/버튼 목록에서만 발생, kakao·google 각 provider 로직(`kakao.provider.ts`·`google.provider.ts`·`social-auth.service.ts`) 무변경 | 회귀 0건 |
| 5a 소유 D-레이어 수정 범위 | `social-auth.service.spec.ts`(SC-009+`NAVER_PROFILE` 제거)·`social_login_static_test.dart`(SC-013 제거, SC-018 naver 단언 제거)·`social_login_flow_test.dart`(`signInWithNaver` stub 제거) — kakao/google 대상 SC 테스트 로직 grep 대조로 무변경 확인 | D-레이어 단일 책임 준수 |
| Breaking change 잔여참조 | `createUserWithSocialAccount` grep 전체 0건 | 0건 (GAP-014-03 해소 유지) |
| GAP-014-08/GAP-014-10 | Development Agent RESOLVED 보고와 코드 대조 결과 일치 — naver 경로 자체가 API 경계에서 소거되어 근본 원인(앱 바인딩 검증 수단 부재)은 사실이나 활성 provider 가 아니므로 더 이상 리스크로 작용하지 않음 | RESOLVED 확인 |
| GAP-014-09 (spec.md 정합성, 미해결) | `spec.md` FR-001/NFR-004/SC-009/SC-013/SC-018/범위 외 절이 여전히 naver 를 지원 대상으로 서술(직접 Read 확인) — 구현은 naver 완전 거부. spec.md 직접 미수정(§핵심 원칙 준수) | 인지 완료 — main session/Spec Agent 결정 대기, 카테고리 (4) 정식 등재로 승격 |
| STALE_SC 재검출 | 전체 D-레이어 테스트 파일 + 신규 보안 회귀 테스트 2종 grep 재검사 | 0건 (PATCH-A18 silence 조건 충족 — 위 coverage.md §STALE_SC 참조) |
| SC 커버리지(원문·실재 파일 재확인, PATCH-001) | coverage.md SC-009/013/018 행 갱신(OUT_OF_SCOPE/부분 커버 명시), 신규 §SEC-001 최종 재검증(Naver 완전 제외) 절 추가 | 갱신 완료 |
| coverage-gap.md | SC-009·SC-013·SC-018(naver 부분) 신규 등재(카테고리 4), GAP-014-09 를 "참고"에서 정식 (4) 항목으로 승격 | 갱신 완료 |

**판정**: Naver 완전 제외 조치는 kakao·google 대상 SC-001~008·010~012·014~017 매핑 테스트에
회귀를 일으키지 않았다(회귀 0건, 34/34+7/7 PASS). SC-009·SC-013 은 테스트가 의도적으로
제거되어 "실패"가 아닌 "OUT_OF_SCOPE"로 재분류했으며, SC-018 은 kakao·google 부분만 계속
PASS(naver 부분은 범위 제외). GAP-014-08·GAP-014-10 은 리스크 경로 자체 소거로 RESOLVED
확인. GAP-014-09(spec.md naver 서술 잔존)는 여전히 미해결이며 main session/Spec Agent
결정이 필요함을 재확인했다. **전체 SC 매핑 테스트 실행 결과: 실패 0건.**
