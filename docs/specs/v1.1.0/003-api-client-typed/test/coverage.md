---
작성: Test Agent (EXECUTION)
버전: v1.0
최종 수정: 2026-06-30 00:40
상태: 확정 (retroactive)
---

# Coverage: 003-api-client-typed

## 목차

- [실행 요약](#실행-요약)
- [SC × 시나리오 커버리지 매트릭스](#sc--시나리오-커버리지-매트릭스)
- [커버리지 요약](#커버리지-요약)
- [STALE_SC 경고](#stale_sc-경고)

---

## 실행 요약

> 본 retroactive 검증은 003 완료 커밋 `1671814`(base `29eb81f`) 기준으로 main session 이 게이트를 직접
> 재실행·구조 확인한 결과다. 본 차수는 인프라(클라이언트 라이브러리)로 별도 단위 테스트 스위트가 없으며,
> SC 는 **타입체크 + console 빌드 + 정적 구조 검증**으로 판정한다.

| 항목 | 본 retroactive 검증 (HEAD `1671814`) |
|---|---|
| console typecheck | **0 error** (`pnpm --filter console typecheck` — main 검증) |
| console build | **13 라우트 PASS** (openapi-fetch 번들·타입드 client 컴파일 확인 — main 검증) |
| 타입드 client | `index.ts` `createOpenApiClient<paths>({ baseUrl, fetch: authFetch })` → `client` (paths 70경로) |
| 재노출 | `TypedClient`·`createAuthFetch`·`AuthFetchOptions`·`TokenStore` |
| 공유 authFetch | `createAuthFetch(options)` 1개 → `HttpClient`·`client` 공유 주입(refresh in-flight 1회) |
| 익명 분리 | `doaAnonymous` — Authorization 미주입·refresh skip, `doRefresh` 가드 밖 직접 fetch |
| URL 보정 | `buildUrl` — 절대 `^https?://` 통과 / 상대 baseUrl 절대화(이중 prefix 0) |
| HttpClient | refresh 제거·authFetch 위임(쿼리·JSON·ApiError·204 만), 생성자 `(opts, authFetch?)` |
| 도메인 facade | auth·user·seller·catalog·inventory 시그니처 **불변**(비파괴) |
| 신규 단위 테스트 | **0** (인프라/클라이언트 — 타입체크·빌드·정적 갈음) |
| 마이그레이션 | **없음** (DB 스키마 변경 0) |
| 신규 의존 | `openapi-fetch ^0.17.0`(AWS/Fly.io 전용 SDK 아님) |

> **신규 단위 0 산정 근거(사실 기준)**: 003 git diff(`git diff 29eb81f 1671814 -- packages/api-client`)의
> 변경 파일은 `auth-fetch.ts`(신규)·`http.ts`·`index.ts`·`package.json` 4종이며 `*.spec.ts`·`*.test.ts`
> 변경/추가가 0 이다. 검증은 console typecheck/build + 정적 구조 리뷰로 갈음한다.

### 변경 라인 직접 카운트 (자가 보고 비신뢰)

| 파일 | 추가 | 삭제 | 방법 |
|---|---|---|---|
| `auth-fetch.ts`(신규) | 98 | 0 | `git diff --numstat 29eb81f 1671814` |
| `http.ts` | 29 | 82 | 동일(refresh 중복 제거 리팩토링) |
| `index.ts` | 17 | 1 | 동일(openapi-fetch 통합·재노출) |
| `package.json` | 2 | 1 | 동일(`openapi-fetch ^0.17.0`) |

### 실행 커맨드

```bash
pnpm --filter console typecheck          # tsc --noEmit (0 error)
pnpm --filter console build              # 13 라우트 PASS (openapi-fetch 번들·타입드 client 컴파일)
git diff --numstat 29eb81f 1671814 -- packages/api-client   # 변경 라인 카운트
```

---

## SC × 시나리오 커버리지 매트릭스

| SC-ID | 수용 기준 | 케이스 | 상태 |
|---|---|---|---|
| SC-001 | 타입드 client 70경로 + 재노출 | index.ts grep + console typecheck/build | PASS(typecheck/build) |
| SC-002 | refresh 추출·단일 인스턴스 공유 | index.ts·auth-fetch.ts 코드 리뷰 | VERIFIED(static) |
| SC-003 | doaAnonymous 토큰·refresh 생략 | auth-fetch.ts·http.ts 코드 리뷰 | VERIFIED(static) |
| SC-004 | 절대 통과/상대 보정 | buildUrl 코드 리뷰 | VERIFIED(static) |
| SC-005 | HttpClient 위임·facade 불변·회귀 0 | http.ts 리뷰 + console typecheck/build | PASS(typecheck/build)/VERIFIED(static) |

---

## 커버리지 요약

| 항목 | 수 |
|---|---|
| 전체 SC | 5 (타입드 client 1 + refresh 공유 1 + 익명 분리 1 + URL 보정 1 + 비파괴 위임 1) |
| PASS (타입체크·빌드 직접) | 2 (SC-001·005) |
| VERIFIED (정적 구조 검증) | 3 (SC-002·003·004 — refresh 추출·공유·익명 분기·buildUrl 코드 리뷰) |
| GAP | 0 (단, console 호출 미마이그레이션·응답 스키마 품질·authFetch 단위 테스트 부재는 coverage-gap.md·GAP-003-01 참조) |

> SC-001(타입드 client·재노출)·SC-005(비파괴 위임·회귀 0)는 console typecheck/build 로 직접 PASS,
> SC-002(refresh 공유)·SC-003(익명 분리)·SC-004(URL 보정)는 정적 구조 리뷰로 확인(VERIFIED). 모든 SC 가
> 충족되며, console 호출 마이그레이션·응답 스키마 품질·authFetch 단위 테스트 부재는 Low 등급 잔여 권고다
> (GAP-003-01). Phase 0 핵심 목표(전 도메인 70경로 타입드 클라이언트 + refresh 전역 1회 공유 + 비파괴
> facade 공존)는 console typecheck 0·build 13 라우트 PASS 로 달성.

---

## STALE_SC 경고

STALE_SC 검출 결과: **0건**

검출 대상: 003 git diff(`git diff 29eb81f 1671814 -- packages/api-client`) 변경 파일. 변경 파일에 테스트
SC 번호를 포함한 `*.spec.ts`·`*.test.ts` 가 없고(인프라/클라이언트), SC 판정은 본 coverage.md·test-cases.md
가 정적 구조 리뷰 + console typecheck/build 로 담당한다. semantic mismatch 없음.
