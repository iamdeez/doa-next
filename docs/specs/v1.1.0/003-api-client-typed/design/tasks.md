---
작성: Design Agent
버전: v1.0
최종 수정: 2026-06-30 00:40
상태: 확정 (retroactive — 전 태스크 구현 완료)
---

# Tasks: 003-api-client-typed

> Branch: 003-api-client-typed | Date: 2026-06-30 | Plan: [../planning/plan.md](../planning/plan.md)

## 목차

- [전제 조건](#전제-조건)
- [태스크 목록](#태스크-목록)
- [Test Authoring Contract](#test-authoring-contract)
- [구현 완료 기준](#구현-완료-기준)

---

## 전제 조건

- [x] spec.md 의 모든 [NEEDS CLARIFICATION] 항목 해소(미결 사항: 없음)
- [x] plan.md Constitution Gates(P-001~P-007) 통과(예외 0건, P-002 신규 의존 `openapi-fetch` 정당화 기록)
- [x] CHANGES.md 의 이전 작업(002·001) "후속 작업 시 주의사항" 확인 — 001 의 "api-client 전환은 Phase 0
      후속(범위 외)"·"수기 타입 한시 유지·점진 대체"·"응답 스키마 미주석(GAP-001-01)"이 본 차수의 범위·잔여로
      직접 연결됨
- [x] 선택 단계 전부 N(Database Design·Deploy·Security·Performance — selection-phases.md)

> A = 의존(`openapi-fetch`), B = 코어(`createAuthFetch` 추출·`HttpClient` 위임), C = 조립·재노출
> (`createApiClient` openapi-fetch 통합·공유 authFetch), D = 검증(타입체크·빌드·정적). 레이어 A→B→C→D 의존 순.

---

## 태스크 목록

> 레이어: A 의존 / B 코어 / C 조립·재노출 / D 검증(5a/5b).

### Step 1. 의존 추가 (A)

- [x] **T001** — `openapi-fetch` 의존 추가
  - 레이어: A
  - 구현 파일: `packages/api-client/package.json`
  - 관련 요구사항: FR-005, NFR-005
  - 상세: `openapi-fetch ^0.17.0`(dependency) 추가. 생성 타입 `paths`(001 산출) 소비 타입드 HTTP 클라이언트.
    AWS/Fly.io 전용 SDK 아님(P-002 무저촉).
  - 완료 기준: `pnpm-lock.yaml` 에 `openapi-fetch@0.17.0` 반영.

### Step 2. 코어 — 공유 authFetch 추출·HttpClient 위임 (B)

- [x] **T002** — `createAuthFetch` 팩토리 작성(신규)
  - 레이어: B
  - 구현 파일: `packages/api-client/src/auth-fetch.ts`(신규)
  - 관련 요구사항: FR-001, FR-002, FR-003, NFR-001, NFR-002
  - 상세: `createAuthFetch(opts): typeof fetch`. 토큰 주입(Authorization Bearer)·401 자동 refresh(원요청
    `isRetry` 1회 재시도)·`refreshing` in-flight 가드(동시 401 단일 Promise 공유)·`doaAnonymous` 익명 분기
    (토큰·refresh 생략)·`buildUrl`(절대 URL 통과/상대 baseUrl 보정)·`doRefresh`(가드 밖 직접 fetch). `TokenStore`·
    `AuthFetchOptions`·`AuthRequestInit` 인터페이스 정의.
  - 완료 기준: refresh in-flight 1회 가드 + doaAnonymous 분기 + buildUrl 보정 구현. `typeof fetch` 시그니처
    래퍼 반환.

- [x] **T003** — `HttpClient` refresh 제거 → 공유 authFetch 위임(리팩토링)
  - 레이어: B (T002 완료 후)
  - 구현 파일: `packages/api-client/src/http.ts`
  - 관련 요구사항: FR-004, FR-002
  - 상세: refresh 로직 제거. 생성자 `constructor(opts, authFetch?)` — 주입 우선, 없으면 `createAuthFetch(opts)`
    자체 생성. `request` 는 쿼리 직렬화(`withQuery`)·JSON 본문·`ApiError` 변환·204 처리만. `options.anonymous`
    → `init.doaAnonymous` 매핑. `HttpClientOptions = AuthFetchOptions`(@deprecated alias) 재노출.
  - 완료 기준: HttpClient 가 refresh 미보유(공유 authFetch 위임), 기존 get/post/patch/delete API 불변.

### Step 3. 조립·재노출 — openapi-fetch 통합 (C)

- [x] **T004** — `createApiClient` openapi-fetch 통합 + 공유 authFetch
  - 레이어: C (T002·T003 완료 후)
  - 구현 파일: `packages/api-client/src/index.ts`
  - 관련 요구사항: FR-005, FR-006, FR-007, NFR-003, NFR-004
  - 상세: `createAuthFetch(options)` 로 authFetch 인스턴스 1개 생성 → `new HttpClient(options, authFetch)`
    와 `createOpenApiClient<paths>({ baseUrl, fetch: authFetch })` 에 **공유 주입**. `createApiClient` 반환에
    `client`(타입드)·`http`(저수준) 추가. `TypedClient = ReturnType<typeof createOpenApiClient<paths>>` 정의·
    재노출. `createAuthFetch`·`AuthFetchOptions`·`TokenStore` 재노출. 기존 도메인 facade(auth·user·seller·
    catalog·inventory) 시그니처 불변(비파괴).
  - 완료 기준: `api.client.GET/POST(...)` 70경로 타입드 사용 가능 + 기존 facade 호출 불변 + refresh 전역
    1회 공유.

### Step 4. 검증 (D 레이어 — 5a/5b)

> 본 차수는 인프라(클라이언트 라이브러리)로 별도 단위 테스트 스위트를 작성하지 않는다(빌드/타입체크 갈음).
> D 레이어는 **타입체크 + console 빌드 + 정적 구조 검증**으로 SC 를 판정한다(5a 는 검증 시나리오 정의,
> 5b 는 실행·확인). test-cases.md / coverage.md 참조.

- [x] **T005** — 검증 시나리오 정의 (5a Test Agent AUTHORING)
  - 검증 대상: SC-001(타입드 client·재노출)·SC-002(refresh 공유)·SC-003(익명 분리)·SC-004(URL 보정)·
    SC-005(비파괴 위임·회귀 0)
  - 산출물: test-cases.md(타입드 client 컴파일·refresh 공유·익명 분리·URL 보정·비파괴 시나리오 — 단위
    테스트 아닌 빌드/타입/정적 기반)
  - 신규 단위 테스트 it() 0건(인프라/클라이언트 성격)

- [x] **T006** — 게이트 실행·확인 (5b Test Agent EXECUTION)
  - 실행: `pnpm --filter console typecheck`(0 error) / `pnpm --filter console build`(13 라우트 PASS —
    openapi-fetch 번들·타입드 client 컴파일) / 정적 구조 검증(refresh 추출·공유·익명 분기·buildUrl·facade
    불변 코드 리뷰)
  - 산출물: coverage.md·coverage-gap.md·test-report.md

---

## Test Authoring Contract

> **5a Test Agent(AUTHORING) 입력 contract**. 본 차수는 인프라/클라이언트로 단위 테스트 it() 를 추가하지
> 않으며, 검증은 타입체크·console 빌드·정적 구조 검증으로 갈음한다(추측 단언 금지 — 직접 코드 리뷰/빌드).

### 검증 canonical 대상

| 대상 | canonical 형태 |
|---|---|
| 타입드 클라이언트 | `index.ts` — `createOpenApiClient<paths>({ baseUrl, fetch: authFetch })` → `client`, `TypedClient` 재노출 |
| 공유 authFetch | `index.ts` — `const authFetch = createAuthFetch(options)` 1개 → `HttpClient`·`client` 공유 주입 |
| refresh 가드 | `auth-fetch.ts` — `refreshing ??= doRefresh().finally(...)`(in-flight 1회) |
| 익명 분리 | `auth-fetch.ts` `doaAnonymous` 분기 + `http.ts` `options.anonymous → init.doaAnonymous` |
| URL 보정 | `auth-fetch.ts` `buildUrl`(절대 `^https?://` 통과 / 상대 baseUrl 절대화) |
| HttpClient 위임 | `http.ts` — refresh 제거, 생성자 `(opts, authFetch?)`, 쿼리·JSON·ApiError·204 만 |
| facade 불변 | `index.ts` — auth·user·seller·catalog·inventory 메서드 시그니처 불변 |
| 타입체크/빌드 | `pnpm --filter console typecheck`·`pnpm --filter console build`(13 라우트) |

### 검증 재현 규약

- **SC-001(타입드 client·재노출)**: `index.ts` grep `createOpenApiClient<paths>` + `client` 반환 +
  `TypedClient`·`createAuthFetch`·`AuthFetchOptions` 재노출. `console typecheck`/`build` 가 client 포함
  통과.
- **SC-002(refresh 공유)**: `index.ts` 에서 `createAuthFetch(options)` 1회 호출 → `http`·`client` 동일
  authFetch 주입. `auth-fetch.ts` `refreshing` in-flight 가드 존재.
- **SC-003(익명 분리)**: `auth-fetch.ts` `doaAnonymous` 시 Authorization 미주입·refresh 분기 skip,
  `doRefresh` 가드 밖 직접 fetch. `http.ts` `doaAnonymous: options.anonymous` 매핑.
- **SC-004(URL 보정)**: `auth-fetch.ts` `buildUrl` 의 `/^https?:\/\//` 통과 분기 + 상대 baseUrl 절대화.
- **SC-005(비파괴 위임)**: `http.ts` refresh 제거·authFetch 위임, `index.ts` facade 시그니처 불변,
  `console typecheck` 0·`build` 13 라우트 PASS.

### SC → 검증 매핑

| SC-ID | 수용 기준 | 검증 방법 | 비고 |
|---|---|---|---|
| SC-001 | 타입드 client 70경로 + 재노출 | index.ts grep + console typecheck/build | [env:typecheck][env:build] |
| SC-002 | refresh 추출·단일 인스턴스 공유 | index.ts·auth-fetch.ts 코드 리뷰 | [env:static] in-flight 가드 |
| SC-003 | doaAnonymous 토큰·refresh 생략 | auth-fetch.ts·http.ts 코드 리뷰 | [env:static] |
| SC-004 | 절대 통과/상대 보정(이중 prefix 0) | buildUrl 코드 리뷰 | [env:static] |
| SC-005 | HttpClient 위임·facade 불변·회귀 0 | http.ts 코드 리뷰 + console typecheck/build | [env:typecheck][env:build] |

---

## 구현 완료 기준

- [x] 모든 A·B·C 태스크 체크박스 완료(4단계), D 검증 시나리오 완료(5a/5b)
- [x] `auth-fetch.ts`(신규) — `createAuthFetch`(refresh in-flight 가드·doaAnonymous·buildUrl) 작성 `[TypeScript]`
- [x] `http.ts` — refresh 제거·공유 authFetch 위임(생성자 optional 주입), get/post/patch/delete 불변
- [x] `index.ts` — `createOpenApiClient<paths>` `client` 추가, authFetch 1개 공유, `TypedClient`·
      `createAuthFetch` 재노출, 도메인 facade 불변
- [x] `pnpm --filter console typecheck` 0 error + `pnpm --filter console build` 13 라우트 PASS(회귀 0)
- [x] refresh 전역 1회 공유 확인(authFetch 인스턴스 1개 → http·client 주입)
- [x] 신규 의존 1건(`openapi-fetch ^0.17.0`)이 AWS/Fly.io 전용 SDK 아님 확인(P-002)
- [x] git status 의도치 않은 파일 없음(api-client 4파일 + pnpm-lock.yaml 부수 변경)
