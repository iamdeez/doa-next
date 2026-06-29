---
작성: Test Agent (AUTHORING)
버전: v1.0
최종 수정: 2026-06-30 00:40
상태: 확정 (retroactive)
---

# Test Cases: 003-api-client-typed

## 목차

- [SC × 시나리오 매트릭스](#sc--시나리오-매트릭스)
- [케이스 상세](#케이스-상세)
- [외부 의존성 명시](#외부-의존성-명시)
- [미커버 항목 (사전 분류)](#미커버-항목-사전-분류)

---

## SC × 시나리오 매트릭스

> 본 차수는 인프라(클라이언트 라이브러리)로 **단위 테스트 it() 를 추가하지 않는다**. 검증은 타입체크
> ([env:typecheck]) + console 빌드([env:build]) + 정적 구조 검증([env:static] — refresh 추출·공유·익명
> 분기·URL 보정·facade 불변 코드 리뷰)으로 SC 를 판정한다. 구조는 추측하지 않고 실제 코드를 직접 확인한다.

| SC-ID | 수용 기준 | Happy Path | Edge Case | 검증 대상 | env 태그 |
|---|---|---|---|---|---|
| SC-001 | 타입드 client 70경로 + 재노출 | `api.client.GET(...)` 컴파일 + console build | 응답 스키마 미정의 엔드포인트 response 타입 공백 | index.ts·console | [env:typecheck][env:build] |
| SC-002 | refresh 추출·단일 인스턴스 공유 | authFetch 1개 → http·client 주입 | 동시 401(facade·client) → 단일 refresh | index.ts·auth-fetch.ts | [env:static] |
| SC-003 | doaAnonymous 토큰·refresh 생략 | login/register 익명 요청 | refresh 요청 가드 밖 직접 fetch(재귀 회피) | auth-fetch.ts·http.ts | [env:static] |
| SC-004 | 절대 통과/상대 보정 | openapi-fetch 절대 URL 통과 | baseUrl trailing slash 정규화 | auth-fetch.ts buildUrl | [env:static] |
| SC-005 | HttpClient 위임·facade 불변·회귀 0 | refresh 제거·authFetch 위임 | 기존 console 호출 불변 | http.ts·index.ts·console | [env:typecheck][env:build] |

---

## 케이스 상세

### SC-001 (타입드 client 70경로 + 재노출)

- 검증 방법: `index.ts` 코드 리뷰 + console typecheck/build.
- 확인 사실:
  - `index.ts`: `import createOpenApiClient from 'openapi-fetch'` + `import type { paths } from
    '@doa/shared-types'`.
  - `export type TypedClient = ReturnType<typeof createOpenApiClient<paths>>`.
  - `createApiClient` 가 `const client = createOpenApiClient<paths>({ baseUrl: options.baseUrl, fetch:
    authFetch })` 생성 → 반환에 `client` 포함.
  - `createAuthFetch`·`AuthFetchOptions`·`TokenStore` 재노출. `client` 은 001 생성 타입 `paths`(70경로)를
    타입 파라미터로 받아 경로·params·query·body·response 를 타입 체크.
  - `pnpm --filter console typecheck` 0 error + `pnpm --filter console build` 13 라우트 PASS(openapi-fetch
    번들·타입드 client 컴파일 확인).

### SC-002 (refresh 추출·단일 인스턴스 공유 — in-flight 1회)

- 검증 방법: `index.ts`·`auth-fetch.ts` 코드 리뷰.
- 확인 사실:
  - `createApiClient` 에서 `const authFetch = createAuthFetch(options)` 를 **1회** 호출 →
    `new HttpClient(options, authFetch)` 와 `createOpenApiClient<paths>({ baseUrl, fetch: authFetch })` 에
    동일 인스턴스 주입.
  - `auth-fetch.ts`: `let refreshing: Promise<boolean> | null = null` + `ensureRefreshed()` 의
    `refreshing ??= doRefresh().finally(() => { refreshing = null; })`. 두 클라이언트가 동일 클로저를
    공유하므로 동시 401 시 refresh 가 전역 in-flight 1회만 실행(NFR-001).

### SC-003 (doaAnonymous 토큰·refresh 생략)

- 검증 방법: `auth-fetch.ts`·`http.ts` 코드 리뷰.
- 확인 사실:
  - `auth-fetch.ts`: `if (!doaAnonymous) { const token = opts.tokens.getAccessToken(); if (token)
    h.set('Authorization', ...) }` — 익명 시 Authorization 미주입.
  - 401 분기: `if (res.status === 401 && !doaAnonymous && opts.autoRefresh !== false && !isRetry)` — 익명
    시 refresh 재시도 자체 skip.
  - `doRefresh` 는 `fetch(buildUrl('/auth/refresh'), ...)` 로 authFetch 가드를 거치지 않고 직접 수행
    (refresh 무한 재귀 회피).
  - `http.ts`: `request` 의 `init.doaAnonymous = options.anonymous` 매핑(facade `auth.login`·`auth.register`
    의 `{ anonymous: true }` → doaAnonymous).

### SC-004 (절대 통과/상대 보정)

- 검증 방법: `auth-fetch.ts` `buildUrl` 코드 리뷰.
- 확인 사실:
  - `if (/^https?:\/\//.test(raw)) return raw;` — openapi-fetch 의 절대 URL(`baseUrl+path`)을 그대로 통과
    (이중 prefix 회피).
  - 상대경로: `new URL(raw.replace(/^\//, ''), opts.baseUrl.replace(/\/?$/, '/')).toString()` — baseUrl
    기준 절대화. baseUrl trailing slash 유무 정규화(`replace(/\/?$/, '/')`).

### SC-005 (HttpClient 위임·facade 불변·회귀 0)

- 검증 방법: `http.ts`·`index.ts` 코드 리뷰 + console typecheck/build.
- 확인 사실:
  - `http.ts`: `HttpClient` 가 refresh 미보유. 생성자 `constructor(opts, authFetch?)` — `this.authFetch =
    authFetch ?? createAuthFetch(opts)`. `request` 는 `withQuery`(쿼리 직렬화)·JSON 본문·`ApiError` 변환·
    204(`return undefined as T`)만 담당.
  - `index.ts`: 도메인 facade(auth·user·seller·catalog·inventory) 메서드 시그니처 불변(`http.get<...>` 호출
    형태 유지). `client`·`http` 는 추가.
  - `pnpm --filter console typecheck` 0 error + `pnpm --filter console build` 13 라우트 PASS — 기존 facade·
    refresh 동작 회귀 0(NFR-004).

---

## 외부 의존성 명시

### 도구 / 라이브러리

- `openapi-fetch ^0.17.0`(api-client dependency): `createClient<paths>` 타입드 클라이언트. 생성 타입
  `paths`(001 산출 — `@doa/shared-types`) 소비. custom fetch(`fetch: authFetch`) 주입 지원.
- `@doa/shared-types`(workspace): 생성 타입 `paths`(001) 제공 — client 타입 파라미터.

### 환경 변수

- 별도 환경 변수 불필요. `baseUrl` 은 `createApiClient(options)` 의 `options.baseUrl` 로 console 이 주입.
  `TokenStore`(토큰 저장 전략)도 console 주입.

### 외부 서비스

- 검증 단계에서 실제 백엔드 호출 없음. 검증은 정적 구조 리뷰 + 타입체크 + console 빌드(타입드 client
  컴파일)로 수행(테스트 서버 기동·네트워크 호출 아님).

---

## 미커버 항목 (사전 분류)

| 항목 | 미커버 사유 | 카테고리 | 권장 검증 방법 |
|---|---|---|---|
| console 호출 타입드 마이그레이션 | console 페이지의 기존 facade 호출을 `api.client` 로 전환하는 작업은 후속(Phase 1+). 003 은 client 추가·facade 불변까지 | (3) 기능 미구현(범위 외) | Phase 1+ 에서 화면별 점진 전환 + 수기 타입 폐기 |
| 응답 스키마 품질 | 타입드 client response 타입은 백엔드 OpenAPI 응답 정의 의존. 87 ops 중 typed 2xx content 36건(001) — 일부 엔드포인트 response 타입 공백 | (3) 기능 미구현(범위 외 — 001 GAP 연속) | 도메인별 응답 DTO + `@ApiResponse({ type })` 후속 보강 |
| authFetch 단위 테스트 | refresh in-flight 가드·doaAnonymous·buildUrl·isRetry 1회 재시도 단위 테스트 부재(인프라 — 빌드/타입체크 갈음) | (2) 설계(테스트 자동화 한계) | refresh 동시성·익명 분기·URL 보정 단위 테스트(vitest 등) 후속 추가 |
