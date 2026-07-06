---
작성: Test Agent (EXECUTION)
버전: v1.1
최종 수정: 2026-07-03 15:55
상태: 확정
---

# 테스트 실행 결과

## 목차

- [실행 요약](#실행-요약)
- [실행 명령](#실행-명령)
- [실패 목록](#실패-목록)
- [SC 미커버 항목](#sc-미커버-항목)
- [plan.md 매핑표 검증](#planmd-매핑표-검증)
- [설계 문서 정합성](#설계-문서-정합성)
- [회귀 탐지](#회귀-탐지)
- [STALE_SC 판정](#stale_sc-판정)

---

## 실행 요약

| 항목 | 결과 |
|---|---|
| tsc --noEmit | 0 error |
| eslint | 0 error, 37 warning(전량 본 spec 무관 기존 파일 — oauth-state/social-auth/naver 관련 파일 0건) |
| jest 전체 스위트 | 35 suites / 35 passed |
| jest 전체 테스트 | 334 tests / 334 passed |
| 실패 | 0 |
| 스킵 | 0 |
| 실행 시간 | 13.034s |

## 실행 명령

```bash
pnpm --filter backend exec tsc --noEmit
pnpm --filter backend test -- --silent
pnpm --filter backend lint
```

> 본 spec(016)은 신규 3개 테스트 파일(`oauth-state.service.spec.ts`, `social-auth.service.naver-state.spec.ts`, `naver.provider.spec.ts` SC-007/008 추가분)과 §F 마이그레이션 대상 4개 파일(`social-auth.service.naver.spec.ts`, `social-auth.service.autolink-policy.spec.ts`, `social-auth.service.naver-autolink-exclusion.spec.ts`, `social-auth.service.spec.ts`)을 포함한 전체 백엔드 스위트를 실행했다. SC-XXX 매핑 범위가 auth 모듈에 국한되지 않고(§F 마이그레이션이 기존 스위트 전반에 DI 시그니처 영향), 전체 스위트 회귀 확인이 SC-011 수용 기준과 직접 일치하므로 SC 매핑 테스트 실행 범위를 전체 스위트로 확장했다(제한적 실행 대신 전체 실행 — SC-011 자체가 "회귀 0"을 요구).

## 실패 목록

없음 (0건).

## SC 미커버 항목

없음 — SC-009(e2e-docker)만 deferred이며 `coverage-gap.md`에서 별도 처리(1건 이상이므로 coverage-gap.md 의무 작성).

## plan.md 매핑표 검증

| SC-ID | 관련 테스트 | 통과 여부 | 미커버 근본원인 |
|---|---|---|---|
| SC-001 | `oauth-state.service.spec.ts::test_SC001_issue_returns_state` | PASS | - |
| SC-002 | `oauth-state.service.spec.ts::test_SC002_expired_state_consume_false` | PASS | - |
| SC-003 | `social-auth.service.naver-state.spec.ts::test_SC003_valid_state_proceeds_login` | PASS | - |
| SC-004 | `social-auth.service.naver-state.spec.ts::test_SC004_invalid_state_rejects_401` (it.each 2케이스) | PASS | - |
| SC-005 | `social-auth.service.naver-state.spec.ts::test_SC005_reused_state_rejects_401` | PASS | - |
| SC-006 | `social-auth.service.naver-state.spec.ts::test_SC006_kakao_google_skip_state` (it.each: kakao/google) | PASS | - |
| SC-007 | `naver.provider.spec.ts::test_SC007_redirect_uri_included` | PASS | - |
| SC-008 | `naver.provider.spec.ts::test_SC008_redirect_uri_omitted` | PASS | - |
| SC-009 | (deferred — e2e-docker, 실 크레덴셜 필요) | DEFERRED | coverage-gap.md 카테고리(3) |
| SC-010 | `oauth-state.service.spec.ts::test_SC010_issue_distinct_values` (N=20) | PASS | - |
| SC-011 | 기존 015/014 스위트 4종(§F 마이그레이션 후) 전량 PASS | PASS | - |
| SC-012 | `apps/backend/package.json` grep(redis/ioredis/upstash) | PASS(static) | - |
| SC-013 | `apps/backend/.env.example` grep(NAVER_REDIRECT_URI) | PASS(static) | - |
| SC-014 | (테스트 아님 — 6단계 Security Agent 재감사 위임) | PENDING(위임) | Security Agent 판정 대상 |
| SC-015 | (테스트 아님 — 6단계 Security Agent 재감사 위임) | PENDING(위임) | Security Agent 판정 대상 |

## 설계 문서 정합성

- plan.md ADR-001~007과 실제 구현(`OAuthStateService`, `AuthRepository.createOAuthState/consumeOAuthState`, `SocialAuthService` 4번째 생성자 인자, `NaverProvider.verify`의 `configService.get('NAVER_REDIRECT_URI')` 조건부 분기, `POST /auth/naver/state` 익명 엔드포인트) 간 불일치 없음.
- tasks.md T001~T013 전 항목이 코드·테스트 양쪽에서 확인됨(T013 정적 검증 SC-012/013 본 문서에서 직접 재확인 완료).
- `.env.example`의 `NAVER_REDIRECT_URI=` 항목이 NFR-005/SC-013과 일치.
- 불일치 발견 0건. 코드 수정 필요 없음.

## 회귀 탐지

- 015/014 산출물 카카오·구글 관련 스위트(`social-auth.service.spec.ts`, `social-auth.service.naver.spec.ts`, `social-auth.service.autolink-policy.spec.ts`, `social-auth.service.naver-autolink-exclusion.spec.ts`) §F 마이그레이션(OAuthStateService DI mock 추가·naver 케이스 state 인자 추가) 후에도 100% PASS — SC-011 충족.
- 나머지 28개 기존 스위트(주문·정산·상품·재고·리뷰 등 본 spec 무관 모듈) 전량 PASS — 간접 회귀 없음.
- `naver.provider.spec.ts` 기존 SC-002/003/004(015 케이스)도 `configService.get` mock 추가 후 회귀 없이 PASS.
- `auth-required-guards.spec.ts`(정적 가드 검증) 신규 `POST /auth/naver/state` 엔드포인트 포함 전체 PASS — 익명 엔드포인트 패턴(기존 `social-login`과 동일) 준수 확인.

## STALE_SC 판정

최초 검출 3건(§F 마이그레이션 대상 파일의 서식 근접·exact-match 미충족 출처 주석) 발견 후 status: AWAITING_USER로 사용자 옵션 A/B/C 결정을 요청했다. main session 경유 결정(옵션 A 채택, 60초 무응답에 따른 main 맥락 기반 판단)에 따라 3건 모두 `(v1.1.0/015 spec)` exact-match 마커를 주석에 추가하는 서식 정정을 적용했다(의미·로직·기대 단언 변경 없음). 정정 위치:

- `social-auth.service.autolink-policy.spec.ts:6` — SC-006
- `social-auth.service.autolink-policy.spec.ts:118` — SC-008
- `social-auth.service.naver.spec.ts:249` — SC-010

정정 후 `tsc --noEmit`(0 error) + 대상 2개 스위트 개별 실행(2 suites/11 tests PASS) + 전체 스위트 재실행(35 suites/334 tests PASS, 회귀 0)으로 재검증했다. **최종 STALE_SC: 0건(정정 완료)**. 상세는 coverage.md §STALE_SC 경고 절 참조.
