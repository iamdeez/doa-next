---
작성: Test Agent (EXECUTION)
버전: v1.1
최종 수정: 2026-07-03 13:50
상태: 확정
---

# Coverage: 015-naver-code-exchange

> Branch: 015-naver-code-exchange | Mode: EXECUTION (5b, 재작업 재실행) | Test Cases: [../test/test-cases.md](./test-cases.md)

> **v1.1 재작업 (SEC-015-01, GAP-015-04) 재판정**: 6단계 Security Agent 재감사가 naver 자동연동
> (Path 3b)의 이메일 소유권 미검증 계정 탈취(High)를 확정함에 따라 사용자 결정으로 naver 를
> `AUTO_LINK_PROVIDERS` 에서 재차단(`social-auth.service.ts:30` — `new Set(['kakao','google'])`,
> 직접 Read 로 확인)했다. 이에 따라 SC-006/SC-010 을 재판정한다. "수용 기준" 열은 PATCH-001 에
> 따라 spec.md 원문을 그대로 유지한다(paraphrase 금지) — naver 관련 문언이 현재 동작과 더 이상
> 일치하지 않는 사실 자체는 이미 5a 가 GAP-015-05 로 등재했으며, 본 재판정도 이를 재확인한다.

## 목차

- [SC × 시나리오 매트릭스](#sc--시나리오-매트릭스)
- [STALE_SC 경고](#stale_sc-경고-현재-spec-에-없는-sc-번호가-docstring-에-잔존)

---

## SC × 시나리오 매트릭스

> "수용 기준" 열은 `spec.md` §수용 기준 원문을 그대로 복사했다(PATCH-001, 재확인: `spec.md:121,123,125,127,129` 직접 대조).

| SC-ID | 수용 기준 (spec.md 원문) | Happy Path | Edge Case | Error Case | plan.md 시나리오 전체 | 상태 |
|---|---|---|---|---|---|---|
| SC-001 | `provider: 'naver'` 식별자를 포함한 소셜 로그인 요청이 지원되지 않는 provider 로 거부(400)되지 않고 처리 흐름에 진입한다(지원 목록 재포함 검증). | `test_SC001_naver_provider_resolves_and_enters_flow` (`apps/backend/src/modules/auth/social-auth.service.naver.spec.ts`) PASS | — | — | 충족 | PASS |
| SC-002 | stub/mock 으로 시뮬레이션한 유효 authorization code 로 `provider: 'naver'` 요청 시, code-exchange stub 호출 → 프로필 조회 stub 호출의 순차 흐름이 수행되고 accessToken·refreshToken(JWT)이 반환된다. | `test_SC002_code_exchange_then_profile_returns_profile`, `test_SC002_state_omitted_still_completes_flow` (`apps/backend/src/modules/auth/social/naver.provider.spec.ts`) PASS | — | — | 충족 | PASS |
| SC-003 | 무효·만료된 authorization code(stub 시뮬레이션)로 네이버 로그인 요청 시 4xx 오류가 반환된다. | — | — | `test_SC003_invalid_code_throws_unauthorized`, `test_SC003_token_exchange_http_failure_throws_unauthorized`, `test_SC003_missing_access_token_in_success_body_throws_unauthorized` (`apps/backend/src/modules/auth/social/naver.provider.spec.ts`) PASS | 충족 | PASS |
| SC-004 | 네이버 로그인 성공 응답 바디에 access_token(네이버로부터 교환된 토큰)이 포함되지 않는다 — 백엔드 내부 전용 처리이며 클라이언트에 노출되지 않음을 검증한다. | — | `test_SC004_access_token_not_in_returned_profile` (`apps/backend/src/modules/auth/social/naver.provider.spec.ts`) PASS | — | 충족 | PASS |
| SC-005 | `provider: 'kakao'` 및 `provider: 'google'` 로 소셜 로그인 요청 시 기존 클라이언트 토큰 검증 흐름(app_id/aud 대조 포함)이 변경 없이 수행되고 JWT 가 반환된다(014 기존 테스트 기준 회귀 0). | (기존 유지, 014 산출물 무변경) `apps/backend/src/modules/auth/social-auth.service.spec.ts` — 37 tests PASS(kakao/google 경로 전체, 재실행 재확인) | — | — | 충족 — verify 단일 인자 호출 무변경(T-B4 조건부 verify) 재확인 | PASS |
| SC-006 | 미연동 네이버 계정의 이메일이 기존 사용자 계정 이메일과 동일할 때 네이버 로그인 요청 시, 기존 계정에 네이버 소셜 계정이 자동 연동되고 JWT 가 반환된다(`AUTO_LINK_PROVIDERS`에 naver 포함 검증). | — | — | `it('naver 로그인 시 동일 이메일의 기존 계정이 있어도 자동 연동하지 않고 Conflict 로 거부한다 (SEC-015-01)')` (`social-auth.service.autolink-policy.spec.ts`) + `test_SEC01501_naver_auto_link_blocked_conflict` (`social-auth.service.naver.spec.ts`) + 공격 시나리오 회귀 `social-auth.service.naver-autolink-exclusion.spec.ts` 전건 PASS. `it.each(['kakao','google'])` 자동연동은 계속 PASS(회귀 0). | naver 부분은 문언 그대로 **불충족**(SEC-015-01/GAP-015-04 로 의도적으로 반전 — 사용자 결정) | **PASS\*** (재판정 — naver Out of Scope, spec.md 원문과 실제 동작 불일치는 기록된 GAP-015-05 로 추적. kakao/google 자동연동은 SC-005 회귀 범위에서 계속 PASS) |
| SC-007 | 이미 연동된 네이버 소셜 계정(동일 provider+providerId)으로 재로그인 요청 시 신규 연동·생성 없이 JWT 가 반환된다(재로그인 경로). | `test_SC007_naver_relogin_existing_social_account` (`social-auth.service.naver.spec.ts`) PASS + `social-auth.service.naver-autolink-exclusion.spec.ts` 의 path 3a 유지 회귀 PASS | — | — | 충족 | PASS |
| SC-008 | 네이버 이메일에 해당하는 기존 계정이 없을 때 네이버 로그인 요청 시 신규 사용자 계정이 생성되고 네이버 소셜 계정이 연동되며 JWT 가 반환된다(신규가입 경로). | `test_SC008_naver_new_user_created` (`social-auth.service.naver.spec.ts`) PASS | — | — | 충족 | PASS |
| SC-009 | 네이버 제공자로부터 이메일이 반환되지 않는 응답을 stub 으로 시뮬레이션할 때 로그인 요청이 4xx 오류로 거부된다. | — | — | `test_SC009_naver_email_null_returns_400` (`social-auth.service.naver.spec.ts`) PASS | 충족 | PASS |
| SC-010 | SC-006/007/008 세 경로 모두 기존 이메일 로그인과 동일한 형식의 accessToken·refreshToken 이 반환된다. | `test_SC010_naver_relogin_path_returns_token_pair`, `test_SC010_naver_new_user_path_returns_token_pair` (`social-auth.service.naver.spec.ts`) PASS(재로그인·신규가입 2경로) | — | naver 자동연동 경로는 더 이상 토큰을 반환하지 않음(`test_SC010_naver_autolink_path_returns_token_pair` 삭제, SEC-015-01) | naver 기준 2경로만 충족(자동연동 경로는 SC-006 과 동일 사유로 제거) — kakao/google 자동연동 토큰 형식은 `social-auth.service.spec.ts`(무변경)로 별도 커버 | **PASS\*** (재판정 — naver 2경로 한정, spec.md 원문의 "세 경로" 문언과 불일치는 GAP-015-05 로 추적) |
| SC-011 | `LoginScreen` 네이버 소셜 버튼이 탭 가능(GestureDetector 또는 동등 위젯 포함)하며 탭 핸들러가 존재한다. | `test_SC011_naver_button_gesture_and_handler` (`naver_social_login_static_test.dart`) — 본 재작업 무변경, 재실행 PASS | — | — | 충족 | PASS |
| SC-012 | 네이버 인증 흐름 트리거 코드에 인앱 WebView 위젯이 직접 사용되지 않고, 시스템 브라우저(또는 외부 인증 컨텍스트) 경유 메커니즘이 존재함을 정적으로 확인한다. | `test_SC012_no_inapp_webview_system_browser_mechanism` (`naver_social_login_static_test.dart`) — 무변경, 재실행 PASS | — | — | 충족 | PASS |
| SC-013 | 네이버 인증 취소 시 로그인 화면이 유지되고 오류 메시지가 표시되지 않는다. | — | `test_SC013_naver_cancelled_stays_no_error` (`naver_social_login_flow_test.dart`) — 무변경, 재실행 PASS | — | 충족 | PASS |
| SC-014 | 네이버 소셜 로그인 실패(mock 4xx/네트워크 오류) 시 오류 메시지가 화면에 표시된다. | — | — | `test_SC014_naver_failure_shows_error` (`naver_social_login_flow_test.dart`) — 무변경, 재실행 PASS | 충족 | PASS |
| SC-015 | 네이버 소셜 로그인 성공(mock JWT 수신) 후 `FlutterSecureStorage` 에 accessToken·refreshToken 이 저장되고 메인 화면으로 전환된다. | `test_SC015_naver_success_stores_tokens_navigates` (`naver_social_login_flow_test.dart`) — 무변경, 재실행 PASS | — | — | 충족 | PASS |
| SC-016 | 네이버 소셜 로그인 백엔드 API P95 응답 3초 이내. [env:e2e-docker] — deferred: 실 OAuth 크레덴셜 발급·연동 후 측정. 본 spec 파이프라인 범위 외(014 SC-019 와 동일 처리 방식). | — | — | — | deferred → Deploy Agent(운영 측정), 옵션 B(spec Out of Scope 명시) | DEFERRED (변경 없음) |
| SC-017 | `.env.example` 에 `NAVER_CLIENT_ID`·`NAVER_CLIENT_SECRET` 항목이 존재(014 placeholder 재확인)하며, `client_secret` 값이 로그 출력문·API 응답 바디 어디에도 포함되지 않음을 코드 검토로 확인한다. | `test_SC017_env_naver_credentials_and_no_secret_leak` (`naver_social_login_static_test.dart`) — 무변경, 재실행 PASS | — | — | 충족 | PASS |
| SC-018 | 6단계 Security Agent 재감사 결과, 네이버 자동연동(FR-006)·code-exchange 흐름(FR-002~004) 관련 Critical/High 취약점이 0건으로 판정된다. | — | — | — | Security Agent(6단계) 1차 재감사(run: SecurityAgent015) 결과 High 1건(SEC-015-01) → 본 재작업(naver AUTO_LINK 제외)으로 수정 완료. **Security Agent 재감사(복귀)가 아직 실행되지 않았으므로 SC-018 최종 판정은 여전히 Security Agent 소관** — 5b 는 코드 수준에서 AUTO_LINK_PROVIDERS 반전을 확인했을 뿐 최종 Critical/High 0건 판정 권한이 없다(PATCH-001, 5b 는 산출물 SoT 재구성 금지). | DEFERRED (변경 없음 — Security 재감사 대기) |
| SC-019 | 014 산출물의 카카오·구글 관련 기존 단위 테스트 스위트가 본 spec 구현 후에도 회귀 없이 100% PASS 한다(네이버 신규 테스트 추가분 제외). | (기존 유지) `social-auth.service.spec.ts`, `kakao.provider.spec.ts`, `auth.service.spec.ts` → 3 suites / 37 tests PASS(재실행 재확인). 백엔드 전체 스위트(`pnpm test`) 33 suites / 323 tests PASS(회귀 0 재확인) | — | — | 충족 | PASS |
| SC-020 | `flutter analyze` 실행 결과 0 issues. | `flutter analyze --no-pub lib/` 재실행 → "No issues found!" + `test_SC020_flutter_analyze_zero_issues_note` 마커 PASS(본 재작업은 Flutter 코드 무변경) | — | — | 충족 | PASS |

> **SC-006/SC-010 재판정 근거**: naver 를 `AUTO_LINK_PROVIDERS` 에서 제외한 것은 SEC-015-01(High) 확정에 대한
> **사용자 명시 결정**이며(pipeline-log.md "단계 복귀" 이벤트, 사유란), 5a Test Agent(AUTHORING)가 이미
> `autolink-policy.spec.ts`·`naver.spec.ts` D 레이어 테스트를 이 결정에 맞춰 반전 완료했다(canonical:
> `autolink-policy.spec.ts`). 본 5b 는 그 반전된 계약대로 코드가 동작함(공격 시나리오 409 차단·
> `createSocialAccount`/`issueTokensForUser` 미호출)을 재실행으로 확인했다. spec.md SC-006/SC-010
> **원문 문언**은 아직 갱신되지 않았으며(Test Agent 권한 밖, agent-rules.md §3.1), 이 불일치는
> `gaps.md` GAP-015-05 로 이미 추적 중이다(6단계 Security 재감사 확정 이후 처리 예정). 따라서 "PASS\*" 는
> "테스트된 실제 동작이 안전 요구사항(SEC-015-01)과 일치하고 회귀가 없음"을 뜻하며, "spec.md 원문 문언과
> 100% 일치"를 뜻하지 않는다 — 이 구분을 흐리지 않기 위해 별표(\*)로 표기한다.
>
> 시나리오 유형 커버리지 재확인(spec.md·plan.md 정합): Happy(SC-001/002/005/007/008/011/012/015/019) ·
> Edge(SC-004/013) · Error(SC-003/006(naver 차단, SEC-015-01)/009/010(naver 자동연동 경로 제거)/014).
> SC-006 은 1차 재작업 때 Happy→Error(자동연동 검증)로, 본 2차 재작업에서 다시 Error(차단 검증)로
> 유형이 전환되었다(요구사항 자체가 정반대로 반전됐기 때문 — 결함 아님).

### 실행 커맨드 및 결과 요약 (재실행)

| 커맨드 | 결과 |
|---|---|
| `cd apps/backend && pnpm exec tsc --noEmit` | 오류 0건 |
| `cd apps/backend && pnpm test -- --testPathPattern="naver.provider.spec\|social-auth.service.naver.spec\|social-auth.service.autolink-policy.spec\|social-auth.service.naver-autolink-exclusion.spec"` | 4 suites / 21 tests PASS |
| `cd apps/backend && pnpm test -- --testPathPattern="social-auth.service.spec\|kakao.provider.spec\|auth.service.spec"` | 3 suites / 37 tests PASS (SC-005/SC-019 회귀 0) |
| `cd apps/backend && pnpm test` (전체) | 33 suites / 323 tests PASS |
| `cd mobile/customer_app && flutter test` (전체, Flutter 본 재작업 무변경 확인용) | All tests passed! |
| `cd mobile/customer_app && flutter analyze --no-pub lib/` | No issues found! |

> run-005(1차 5b) 대비 백엔드 스위트 수 32→33·테스트 수 321→323 증가는 신규 회귀 파일
> `social-auth.service.naver-autolink-exclusion.spec.ts`(Development Agent, SC 비매핑) 추가에
> 기인(+2 tests 순증: naver 신규 19→21 은 SC 매핑 테스트 자체의 순감(-2, naver 자동연동 성공/토큰쌍
> 단언 제거) + 신규 파일 3 tests 추가가 상쇄된 결과 — `test-cases.md` §T-D3 마이그레이션 확인 §2차
> 재작업 절과 정합).

---

## STALE_SC 경고 (현재 spec 에 없는 SC 번호가 docstring 에 잔존)

STALE_SC 재검출 범위: 본 재작업 git diff 변경 파일 한정(PATCH-A18 우선순위 1) —
`git status --short` 로 확인한 변경 파일 6개(수정 2 + 신규 3 백엔드/Flutter 중 재작업 대상,
Flutter 3파일은 본 재작업 무변경으로 재검사 불요, run-005 STALE_SC 0 결과 유지).

| 파일 | 발견 SC 번호 | 판정 |
|---|---|---|
| `apps/backend/src/modules/auth/social-auth.service.autolink-policy.spec.ts` | SC-006 | 015 spec 범위 내 — 정상 |
| `apps/backend/src/modules/auth/social-auth.service.naver.spec.ts` | SC-001, SC-006~010 | 015 spec 범위 내 — 정상 |
| `apps/backend/src/modules/auth/social-auth.service.naver-autolink-exclusion.spec.ts` | (SC 마커 없음 — SEC-015-01 마커만 사용, Development Agent regression 파일) | SC 마커 부재 — STALE_SC 점검 대상 외 |
| `apps/backend/src/modules/auth/social/naver.provider.spec.ts` | SC-002, SC-003, SC-004 | 015 spec 범위 내 — 정상 (무변경, run-005 재확인) |
| `mobile/customer_app/test/features/social_login_flow_test.dart` | SC-014, SC-015, SC-016 | 출처 주석 `(v1.1.0/014 spec)` — silence 대상(PATCH-A18-(1), run-005 판정 유지, 본 재작업 무변경) |

**결과**: STALE_SC 0건 (silence 규칙 적용 후, run-005 대비 변경 없음).

```yaml
stale_sc:
  count    : 0
  decision : NONE_FOUND
```
