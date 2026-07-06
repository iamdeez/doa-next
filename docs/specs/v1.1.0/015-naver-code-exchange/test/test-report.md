---
작성: Test Agent (EXECUTION)
버전: v1.1
최종 수정: 2026-07-03 13:50
상태: 확정
---

# 테스트 실행 결과

> Branch: 015-naver-code-exchange | Mode: EXECUTION (5b, 재작업 재실행) | Coverage: [../test/coverage.md](./coverage.md)

> **재작업 배경**: 6단계 Security Agent 재감사가 SEC-015-01(High, GAP-015-04 — naver 자동연동
> 이메일 소유권 미검증에 의한 계정 탈취)을 확정. 사용자 결정으로 naver 를 `AUTO_LINK_PROVIDERS`
> 에서 제외(kakao·google 만 유지, naver 로그인 자체는 유지). Development Agent(run-007)가
> production 수정 + regression 테스트 신규 추가, 병렬 Test Agent(AUTHORING, run-004 authoring
> 갱신)가 `autolink-policy.spec.ts`·`naver.spec.ts` D 레이어 테스트를 이 정책으로 반전. 본 5b 는
> 이 재작업 결과를 재실행·재검증한다.

## 목차

- [실행 요약](#실행-요약)
- [실패 목록](#실패-목록)
- [SC 미커버 항목](#sc-미커버-항목)
- [plan.md 매핑표 검증](#planmd-매핑표-검증)
- [설계 문서 정합성](#설계-문서-정합성)
- [회귀 탐지](#회귀-탐지)
- [Breaking change 잔여 참조 검증](#breaking-change-잔여-참조-검증)

---

## 실행 요약

| 대상 | 스위트 | 테스트 수 | 결과 |
|---|---|---|---|
| 백엔드 naver 신규+회귀(SC-001~004, 006~010 재판정 + SEC-015-01 regression) | `naver.provider.spec.ts`, `social-auth.service.naver.spec.ts`, `social-auth.service.autolink-policy.spec.ts`, `social-auth.service.naver-autolink-exclusion.spec.ts` | 4 suites / 21 tests | 전건 PASS |
| 백엔드 회귀(SC-005, SC-019) | `social-auth.service.spec.ts`, `kakao.provider.spec.ts`, `auth.service.spec.ts` | 3 suites / 37 tests | 전건 PASS |
| 백엔드 전체 | `pnpm test` | 33 suites / 323 tests | 전건 PASS(회귀 0) |
| 백엔드 타입체크 | `pnpm exec tsc --noEmit` | — | 오류 0건 |
| Flutter 전체(본 재작업 무변경 확인용) | `flutter test` | 전체 스위트 | All tests passed! |
| Flutter 정적 분석 | `flutter analyze --no-pub lib/` | — | No issues found! |

**SC-XXX 커버리지 재판정**: SC-001~020 중 18개 직접 검증 PASS(SC-006·SC-010 은 naver 부분
Out of Scope 재분류 반영 "PASS\*" — coverage.md 참조). SC-016·SC-018 = DEFERRED(변경 없음).

**run-005(1차 5b) 대비 변화**: 백엔드 naver 스위트 3→4(신규 regression 파일 추가), naver 관련
테스트 수 19→21(순감 -2: naver 자동연동 성공/토큰쌍 단언 제거 + 순증 +3: 신규 regression
파일 3 tests). 백엔드 전체 321→323. Flutter 무변경(0 diff, 재실행으로 재확인만 수행).

**코드 커버리지**: 본 spec 은 SC-XXX 단위 커버리지를 판정 기준으로 사용하며 별도 라인/브랜치
커버리지 수치는 산출하지 않는다(SC 매핑 테이블이 SoT).

---

## 실패 목록

없음 — 재작업 재실행 결과 전체 SC 매핑 테스트·전체 스위트 실행 결과 실패 0건.

---

## SC 미커버 항목

| SC-ID | 미커버 유형 | 사유 | 위임 대상 |
|---|---|---|---|
| SC-016 | deferred ([env:e2e-docker]) | 변경 없음(run-005 동일) — 실 네이버 OAuth 크레덴셜 없이는 P95 측정 불가 | Deploy Agent |
| SC-018 | deferred (Security Agent 소관) | 1차 Security 재감사(SecurityAgent015)가 High 1건(SEC-015-01)으로 BLOCKED 판정 후 본 재작업으로 프로덕션 수정 완료. **Security Agent 의 재감사(복귀)가 아직 실행되지 않았으므로 SC-018 최종 Critical/High 0건 판정은 여전히 미확정** — 본 5b 는 코드 수준에서 `AUTO_LINK_PROVIDERS` 반전만 확인(Test Agent 는 보안 최종 판정 권한 없음) | Security Agent(재감사 복귀 대기) |

SC-006/SC-010 은 "미커버"가 아니라 "spec.md 원문과 실제 동작이 사용자 결정으로 의도적으로
불일치"하는 케이스이며 이미 테스트로 커버됨(coverage.md §SC-006/SC-010 재판정 근거 참조,
문서 정합성은 GAP-015-05 로 별도 추적). 스켈레톤 작성 대상 없음(미작성/미구현 SC 0건).

---

## plan.md 매핑표 검증

**SC 매핑 테이블**:

| SC-ID | 관련 테스트 | 통과 여부 | 미커버 근본원인 |
|---|---|---|---|
| SC-001 | test_SC001_naver_provider_resolves_and_enters_flow | PASS | - |
| SC-002 | test_SC002_code_exchange_then_profile_returns_profile, test_SC002_state_omitted_still_completes_flow | PASS | - |
| SC-003 | test_SC003_invalid_code_throws_unauthorized, test_SC003_token_exchange_http_failure_throws_unauthorized, test_SC003_missing_access_token_in_success_body_throws_unauthorized | PASS | - |
| SC-004 | test_SC004_access_token_not_in_returned_profile | PASS | - |
| SC-005 | (기존) social-auth.service.spec.ts 내 kakao/google 경로 테스트 다수 | PASS | - |
| SC-006 | `it('naver 로그인 시 동일 이메일의 기존 계정이 있어도 자동 연동하지 않고 Conflict 로 거부한다 (SEC-015-01)')` (autolink-policy.spec.ts), test_SEC01501_naver_auto_link_blocked_conflict (naver.spec.ts) | PASS\*(재판정, naver 차단 검증으로 반전 — GAP-015-05) | - |
| SC-007 | test_SC007_naver_relogin_existing_social_account | PASS | - |
| SC-008 | test_SC008_naver_new_user_created | PASS | - |
| SC-009 | test_SC009_naver_email_null_returns_400 | PASS | - |
| SC-010 | test_SC010_naver_relogin_path_returns_token_pair, test_SC010_naver_new_user_path_returns_token_pair | PASS\*(재판정, naver 2경로 한정 — GAP-015-05) | - |
| SC-011 | test_SC011_naver_button_gesture_and_handler | PASS | - |
| SC-012 | test_SC012_no_inapp_webview_system_browser_mechanism | PASS | - |
| SC-013 | test_SC013_naver_cancelled_stays_no_error | PASS | - |
| SC-014 | test_SC014_naver_failure_shows_error | PASS | - |
| SC-015 | test_SC015_naver_success_stores_tokens_navigates | PASS | - |
| SC-016 | (없음) | - | deferred(옵션 B, 운영 환경 전면 의존) |
| SC-017 | test_SC017_env_naver_credentials_and_no_secret_leak | PASS | - |
| SC-018 | (없음) | - | deferred(Security Agent 재감사 복귀 대기) |
| SC-019 | (기존) social-auth.service.spec.ts, kakao.provider.spec.ts, auth.service.spec.ts | PASS | - |
| SC-020 | flutter analyze 직접 실행 + test_SC020_flutter_analyze_zero_issues_note | PASS | - |

### deferred SC 목록 ([env:e2e-docker]/설계 위임)

| SC-ID | env 태그 | 사유 |
|---|---|---|
| SC-016 | `[env:e2e-docker]` | 실 OAuth 크레덴셜 필요 — Deploy Agent 로 이관(운영 배포 후 측정) |
| SC-018 | `[env:static]` (판정 주체는 Security Agent) | Security Agent 재감사 복귀(SEC-015-01 수정 확인) 대기 — 6단계 재실행 필요 |

---

## 설계 문서 정합성

- **spec.md FR-006 ↔ 구현 재확인**: `AUTO_LINK_PROVIDERS`(naver 제외) 가 FR-006 의 "자동 연동"
  요구사항을 kakao/google 한정으로 충족함을 코드 직접 대조로 확인. naver 는 FR-006 의 "자동
  연동" 서브케이스가 더 이상 적용되지 않으나, FR-006 이 매핑하는 SC-007/008(재로그인·신규가입)은
  naver 에도 여전히 100% 적용된다(코드 3a/3c 분기 무변경 확인) — FR-006 자체가 결함 상태는
  아니다. spec.md SC-006/SC-010 원문 문언 갱신은 GAP-015-05 로 별도 추적.
- **plan.md ↔ 구현 일치**: T-B1~T-B5·T-C1~T-C4 의 production 심볼(canonical) 무변경 재확인. 본
  재작업은 `AUTO_LINK_PROVIDERS` 상수 값(리터럴 Set 원소)만 변경했으며 인터페이스 계약·시그니처는
  일절 변경하지 않음(`social-auth.service.ts` diff 34줄 중 대부분이 주석 갱신).
- **Constitution Gates**: 변경 없음(2단계 산출물 유지, 본 단계 재검증 대상 아님).
- **불일치 발견**: 0건(코드 수준). spec.md 문언 수준 불일치 1건은 GAP-015-05 로 이미 등재 —
  본 5b 가 새로 발견한 사항 아님(5a 가 사전 식별, 본 5b 는 재확인만 수행).

---

## 회귀 탐지

| 대상 | 이전 상태(run-005, 1차 5b) | 현재 상태(본 재작업 재실행) | 회귀 여부 |
|---|---|---|---|
| kakao/google 자동연동(`social-auth.service.spec.ts`) | PASS(37 tests) | PASS(37 tests, 재확인) | 회귀 없음 |
| kakao/google 자동연동 회귀(신규, `social-auth.service.naver-autolink-exclusion.spec.ts` it.each) | (파일 미존재) | PASS(2 tests, naver 제외 조치가 kakao/google 에 영향 없음을 신규 검증) | 회귀 없음(신규 안전망 추가) |
| naver path 3a(재로그인) | PASS(자동연동 허용 시점) | PASS(자동연동 차단 후에도 재로그인 무관 유지, 신규 회귀 테스트로 명시 검증) | 회귀 없음 |
| 014 카카오 provider 검증(`kakao.provider.spec.ts`) | PASS | PASS(재확인) | 회귀 없음 |
| 014 email 로그인/register/refresh/reset(`auth.service.spec.ts`) | PASS | PASS(재확인) | 회귀 없음 |
| 014 Flutter 소셜 로그인 흐름 전체(`flutter test`) | PASS | PASS(본 재작업 Flutter 무변경 확인용 재실행) | 회귀 없음 |
| 백엔드 전체 스위트 | 32 suites / 321 tests PASS | 33 suites / 323 tests PASS | 회귀 없음(신규 파일 추가로 순증, 결함 아님) |

**결론**: 재작업(naver AUTO_LINK 제외)이 kakao/google 자동연동·기존 흐름에 회귀를 유발하지
않았음을 재확인. naver path 3a/3c 도 정책 반전과 무관하게 무변경 유지됨을 재확인.

---

## Breaking change 잔여 참조 검증

본 재작업은 `AUTO_LINK_PROVIDERS` 상수 값과 주석만 변경했으며 함수 시그니처·인터페이스 변경이
없어 Breaking change 대상 없음(run-005 시점 확인된 항목들 — `verify` context 추가, `login` 3번째
인자, Dart `signInWithNaver` 추상 메서드 — 은 본 재작업에서 재수정되지 않았으며 재확인 결과
`pnpm exec tsc --noEmit` 오류 0건·`flutter test` 전체 PASS 로 잔여 참조 없음을 재확인).

- **`git status` 의도치 않은 파일**: 없음 — 신규 파일 1개(`social-auth.service.naver-autolink-exclusion.spec.ts`)만
  본 재작업에서 추가되었으며 tasks.md 대상 파일과 일치(Development Agent regression, SC 비매핑).
