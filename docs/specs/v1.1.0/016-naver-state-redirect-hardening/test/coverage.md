---
작성: Test Agent (EXECUTION)
버전: v1.1
최종 수정: 2026-07-03 15:55
상태: 확정
---

# Coverage: 016-naver-state-redirect-hardening

## 목차

- [SC 커버리지 매트릭스](#sc-커버리지-매트릭스)
- [SC 환경 태그 라우팅 결과](#sc-환경-태그-라우팅-결과)
- [STALE_SC 경고](#stale_sc-경고-현재-spec-에-없는-sc-번호가-docstring-에-잔존)

---

## SC 커버리지 매트릭스

| SC-ID | 수용 기준 | Happy Path | Edge Case | Error Case | plan.md 시나리오 전체 | 상태 |
|---|---|---|---|---|---|---|
| SC-001 | state 발급 기능을 호출하면 유효한 state 값이 반환된다. | O | — | — | O | PASS |
| SC-002 | 발급된 state 값에 대해 TTL 경과 후 검증을 시도하면 만료로 거부된다. | — | O | — | O | PASS |
| SC-003 | 발급 직후의 유효한(미만료) state 값으로 네이버 code-exchange 요청 시 state 검증이 통과되고 로그인 흐름이 정상 진행된다(이후 처리는 015 기존 로직 그대로). | O | — | — | O | PASS |
| SC-004 | state 값이 발급 이력과 불일치하거나, 만료되었거나, 요청에 아예 포함되지 않은 경우 네이버 로그인 요청이 4xx 오류로 거부된다. | — | — | O(it.each 2케이스) | O | PASS |
| SC-005 | 검증에 성공해 이미 소비된 state 값으로 동일한 값을 재사용하여 재요청하면, 두 번째 요청은 검증 실패로 거부된다. | — | — | O | O | PASS |
| SC-006 | `provider: 'kakao'` 및 `provider: 'google'` 요청은 state 값의 존재·유효성과 무관하게 기존과 동일한 클라이언트 토큰 검증 흐름으로 정상 처리된다(state 검증 대상이 아님을 확인). | O(it.each: kakao/google) | — | — | O | PASS |
| SC-007 | 네이버 redirect_uri 환경변수가 설정된 상태에서 네이버 code-exchange 요청을 처리하면, 네이버 토큰 교환 요청에 redirect_uri 파라미터가 포함된다. | O | — | — | O | PASS |
| SC-008 | 네이버 redirect_uri 환경변수가 설정되지 않은 상태에서는 토큰 교환 요청에 redirect_uri 파라미터가 포함되지 않는다(기존 동작과 동일, 회귀 없음). | O | — | — | O | PASS |
| SC-009 | 네이버 소셜 로그인 관련 API(state 발급 포함) P95 응답 3초 이내. | — | — | — | deferred | DEFERRED → Deploy/운영 (coverage-gap.md 참조) |
| SC-010 | state 발급 기능을 연속으로 여러 번 호출하면 매번 서로 다른 값이 반환됨을 확인한다(예측 불가능성 검증). | O(N=20, Set size===N) | — | — | O | PASS |
| SC-011 | 015 산출물의 카카오·구글 관련 기존 단위 테스트 스위트가 본 spec 구현 후에도 회귀 없이 100% PASS 한다(네이버 신규 테스트 추가분 제외). | O(4개 기존 스위트 §F 마이그레이션 후 전량 PASS) | — | — | O | PASS |
| SC-012 | state 저장 메커니즘 구현을 위해 신규 외부 데이터 저장소 클라이언트 패키지(Redis 클라이언트 등)가 의존성에 추가되지 않았음을 확인한다. | O(static grep 0건) | — | — | O | PASS |
| SC-013 | `.env.example`에 네이버 redirect_uri 환경변수 항목이 존재한다. | O(static grep 확인) | — | — | O | PASS |
| SC-014 | 6단계 Security Agent 재감사 결과, SEC-015-02가 RESOLVED로 판정된다. | — | — | — | — | PASS (Security Agent 재감사 완료 — `security/security-report.md` v1.1: **SEC-015-02 RESOLVED**, `status: COMPLETE`, `gate: PASS`) |
| SC-015 | 6단계 Security Agent 재감사 결과, SEC-015-03이 RESOLVED 또는 잔존-권고(운영 확인 대기)로 판정된다. | — | — | — | — | PASS (Security Agent 재감사 완료 — `security/security-report.md` v1.1: **SEC-015-03 RESOLVED(코드 레벨)/잔존-권고**, NFR-007 허용 판정 범위) |

## SC 환경 태그 라우팅 결과

| SC-ID | env 태그 | 라우팅 |
|---|---|---|
| SC-001~008, SC-010~011 | [env:unit] | Test Agent 직접 검증 완료(PASS) |
| SC-012, SC-013 | [env:static] | Test Agent 직접 검증 완료(PASS, grep 기반) |
| SC-009 | [env:e2e-docker] | deferred → 운영 환경 수동 검증(015 SC-016과 동일 처리). Deploy Agent 대상 아님(신규 인프라 배포 항목 없음) — coverage-gap.md 카테고리(3) |
| SC-014, SC-015 | [env:static] | 6단계 Security Agent 재감사 위임(테스트 태스크 아님, tasks.md 명시) — **완료: security-report.md v1.1 에서 양쪽 RESOLVED 판정, SC-014/015 PASS 확정(사후 정합화 2026-07-03 22:21)** |

---

## STALE_SC 경고 (현재 spec 에 없는 SC 번호가 docstring 에 잔존)

**정정 완료(옵션 A, 015 마커 부여)** — 아래 3건은 최초 검출 시점에는 silence 미적용 상태였으나, main session 경유 사용자 결정(옵션 A 채택, 60초 무응답에 따른 main 맥락 기반 판단)에 따라 정정 완료되었다.

검출 범위: git diff 6b64c24 기준 변경 파일(M) + 본 spec §F 마이그레이션 대상 신규(untracked) 테스트 파일 — `apps/backend/src/modules/auth/` 하위 7개 관련 spec 파일. PATCH-A18 출처 정규식 `\(v\d+\.\d+\.\d+/\d+\s+spec\)`을 기계적으로 적용한 결과:

| 상태 | 파일 | 비고 |
|---|---|---|
| silence 정상 적용 | `social-auth.service.spec.ts` | 전 SC(001~003,005~008,010) 개별 JSDoc에 `(v1.1.0/014 spec)` exact match. STALE_SC 아님. |
| silence 정상 적용 | `social-auth.service.naver.spec.ts` (SC-001,007,008,009 한정) | 개별 테스트 JSDoc에 `(v1.1.0/015 spec)` exact match. |
| silence 정상 적용 | `social-auth.service.naver-autolink-exclusion.spec.ts` | 유일한 SC 참조(SC-011)가 016 **자신의 SC-011**(§F 마이그레이션 근거 주석)로, 애초에 STALE 대상 아님. |
| **정정 완료(옵션 A)** | `social-auth.service.autolink-policy.spec.ts:6` | SC-006 — 헤더 주석에 `(v1.1.0/015 spec)` exact-match 마커 추가. `AUTO_LINK_PROVIDERS 에 재편입하여 자동연동을 허용했다(SC-006 (v1.1.0/015 spec)).` 의미·단언 변경 없음(주석 서식만). |
| **정정 완료(옵션 A)** | `social-auth.service.autolink-policy.spec.ts:118` | SC-008 — 인라인 주석에 `(v1.1.0/015 spec)` 마커 추가. `// SC-008 (FR-006, Path 3c) (v1.1.0/015 spec): ...` |
| **정정 완료(옵션 A)** | `social-auth.service.naver.spec.ts:249` | SC-010 — 인라인 주석에 `(v1.1.0/015 spec)` 마커 추가. `// ── SC-010 (FR-008) (v1.1.0/015 spec): ...` |

정정 후 재검증: `pnpm --filter backend exec tsc --noEmit`(0 error) + 대상 2개 스위트 개별 실행(`social-auth.service.autolink-policy.spec.ts`, `social-auth.service.naver.spec.ts` — 2 suites/11 tests PASS) + 전체 스위트 재실행(35 suites/334 tests PASS, 회귀 0). 주석 전용 변경으로 프로덕션 코드·테스트 로직·기대 단언 변경 없음을 확인했다.

> **최종 판정**: STALE_SC 0건(정정 완료). 3건 모두 실제로는 의미 혼동 위험이 낮은 015 spec 잔존 번호였으며(파일 맥락상 명백, 016 spec.md의 동일 번호 SC-006/008/010과 실제 혼용된 코드/테스트 로직 없음을 직접 대조 확인), PATCH-A18 기계적 exact-match 규칙에 맞춰 출처 주석 서식만 보완했다.
