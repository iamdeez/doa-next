---
작성: Spec Agent
버전: v1.0
최종 수정: 2026-06-30 00:40
상태: 확정 (retroactive)
---

# Spec Input: 003-api-client-typed

> 수집 일시: 2026-06-30 | 맥락: 001(생성 타입 SSOT) 다음 단계 = api-client 생성 타입 전환 → 정식 SDD
> 문서화. 사용자 지시: "커밋 후 다음 단계 = api-client 전환".

## 목차

- [수집 진행 상태](#수집-진행-상태)
- [원 요청 맥락](#원-요청-맥락)
- [질문 분석 근거](#질문-분석-근거-question-analysis-basis)
- [카테고리별 수집 내용](#카테고리별-수집-내용)

## 수집 진행 상태

| 카테고리 | 상태 | 답변 완료 항목 |
|---|---|---|
| 1. 배경 및 목적 | 완료 | [Q1, Q2, Q3] |
| 2. 사용자 & 이해관계자 | 완료 | [Q4] |
| 3. 핵심 기능 | 완료 | [Q-A~F] |
| 4. 데이터 & 입출력 | 완료 | [Q-G] |
| 5. 제약조건 | 완료 | [Q5] |
| 6. 예외 & 실패 시나리오 | 완료 | [Q6] |

## 원 요청 맥락

사용자 지시: **001(OpenAPI 코드젠) 커밋 후 다음 단계 = `@doa/api-client` 생성 타입 전환**. 001 이
`openapi.gen.ts`(paths 70경로)로 타입 계약 SSOT 를 확립했으나 api-client 는 여전히 수기 도메인 facade 였다.
003 은 그 생성 타입을 소비하는 타입드 클라이언트(openapi-fetch)를 추가하고, 401 refresh 로직을 공유 fetch
래퍼(`createAuthFetch`)로 추출하여 legacy facade 와 타입드 client 가 동일 refresh 인스턴스를 공유하게 하며,
기존 facade·console 호출을 비파괴로 유지한다. 본 문서는 그 구현(커밋 `1671814`)을 정식 SDD 포맷으로
보강하기 위한 입력 재구성이다(FRONTEND-PLAN.md Phase 0 타입 공유 완성 / 001 §범위 외 "api-client 전환"
수행).

## 질문 분석 근거 (Question Analysis Basis)

| 질문 ID | 요지 | 옵션·근거 | 채택 결과 |
|---|---|---|---|
| Q-A | 타입드 클라이언트 도구 | A:수기 facade 제네릭 보강 / B:openapi-fetch(`createClient<paths>`) / C:직접 generics 래퍼 자작 | **B 채택**(생성 타입 `paths` 를 경로·params·query·body·response 전부 타입 체크하는 표준 도구. 자작 generics 유지부담 회피 — research §타입드 클라이언트 비교) |
| Q-B | refresh 로직 위치 | A:HttpClient·타입드 client 각자 보유 / B:공유 fetch 래퍼(`createAuthFetch`)로 추출 | **B 채택**(두 클라이언트가 독립 refresh 상태 가지면 동시 401 중복 refresh. 단일 authFetch 인스턴스 공유로 in-flight 1회 전역 일관 — FR-006·NFR-001) |
| Q-C | 익명 요청(login/register/refresh) 처리 | A:별도 클라이언트 분리 / B:`doaAnonymous` init 플래그로 토큰·refresh 생략 | **B 채택**(단일 authFetch 에서 플래그로 분기. refresh 요청은 가드 밖 직접 fetch — FR-002·NFR-002) |
| Q-D | openapi-fetch baseUrl·이중 prefix | A:authFetch 가 항상 baseUrl prefix / B:절대 URL 통과·상대경로만 보정(`buildUrl`) | **B 채택**(openapi-fetch 가 `baseUrl+path` 절대 URL 로 호출 → authFetch 가 그대로 통과. 이중 prefix 회피 — FR-003·SC-004) |
| Q-E | 기존 facade·console 호출 | A:facade 전면 타입드 재작성 / B:비파괴 — facade 불변 + client 추가 공존 | **B 채택**(console 회귀 0 우선. facade·refresh 동작 불변, 신규 화면만 client 사용. 마이그레이션 점진 — FR-007·NFR-004) |
| Q-F | HttpClient 책임 | A:refresh 유지 / B:refresh 제거 → 공유 authFetch 위임(쿼리·JSON·에러·204 만) | **B 채택**(refresh 중복 제거. HttpClient 는 직렬화·에러 변환만 — FR-004) |
| Q-G | client·http·facade 공존 형태 | 반환에 `client`(타입드) + `http`(저수준) + 도메인 facade 동시 노출 | **채택**(신규 화면=client, 기존=facade, 저수준 필요 시=http. `TypedClient`·`createAuthFetch` 재노출) |

## 카테고리별 수집 내용

### [카테고리 1] 배경 및 목적

Q1. 왜 만드는가?
- 001 이 생성 타입 SSOT(`openapi.gen.ts` paths 70경로)를 확립했으나 api-client 는 수기 facade 였다. 생성
  타입을 소비하는 타입드 클라이언트를 제공하여 Phase 0(타입 공유)을 완성하고, 신규 13개 도메인 메서드
  부재·수기 응답 제네릭 동기화 부담을 제거.

Q2. 현재 어떻게? (003 이전)
- `createApiClient` 가 수기 도메인 facade(auth·user·seller·catalog·inventory)만 반환. 호출 측이
  `http.get<Product>(...)` 처럼 응답 제네릭 수기 지정. 401 refresh 로직이 `HttpClient` 내부. commerce 이후
  11개 도메인 facade 부재.

Q3. 성공 판단 기준
- `api.client` 가 70경로 타입드(경로·params·query·body·response). console typecheck 0·build 13 라우트 PASS.
  refresh 전역 1회 공유(facade·client 동일 authFetch). 기존 facade·refresh 동작 회귀 0.

### [카테고리 2] 사용자 & 이해관계자

Q4. 사용자 역할
- 프론트엔드 개발자(console·신규 화면): 타입드 client 소비자 — 생성 타입 계약의 직접 수혜자.
- 기존 console 화면: 도메인 facade 소비자 — 비파괴 유지(회귀 0).
- 백엔드 개발자: OpenAPI 응답 DTO 정의 주체(응답 타입 품질이 client response 타입에 전파 — 일부 미정의는
  GAP-003-01).

### [카테고리 3] 핵심 기능

**Must:**
- `packages/api-client/src/auth-fetch.ts`(신규): `createAuthFetch(opts)` — 토큰 주입·401 자동 refresh
  (in-flight 1회 guard)·`doaAnonymous` 익명 분기·`buildUrl`(절대 통과/상대 보정). `TokenStore`·
  `AuthFetchOptions`·`AuthRequestInit` 정의.
- `packages/api-client/src/http.ts`(리팩토링): `HttpClient` refresh 제거 → 공유 authFetch 위임. 쿼리
  직렬화·JSON 본문·`ApiError` 변환·204 처리만. 생성자 `(opts, authFetch?)` optional 주입.
- `packages/api-client/src/index.ts`: `createClient<paths>` 로 `client` 추가, `createApiClient` 가
  authFetch 1개를 HttpClient·client 공유. `TypedClient`·`createAuthFetch`·`AuthFetchOptions` 재노출. legacy
  도메인 facade 유지.
- `packages/api-client/package.json`: `openapi-fetch ^0.17.0` 의존 추가.

**제외(Out of Scope):**
- console 페이지 기존 호출의 타입드 client 마이그레이션, 수기 shared-types 타입 폐기, 도메인 facade 의
  타입드 재작성·11도메인 facade 추가, 응답 스키마 품질 보강, authFetch 단위 테스트.

### [카테고리 4] 데이터 & 입출력

- 입력 계약: `@doa/shared-types` 의 생성 타입 `paths`(001 산출 `openapi.gen.ts` — 70경로). client 가
  이를 소비.
- `createApiClient(opts)` 반환: `{ http, client, auth, user, seller, catalog, inventory }`. `client` =
  openapi-fetch 타입드 클라이언트. `http` = 저수준 HttpClient. 나머지 = 기존 도메인 facade(불변).
- `TokenStore` 인터페이스: getAccessToken·getRefreshToken·setTokens·clear(저장 전략은 console 주입).
- 신규 의존: `openapi-fetch ^0.17.0`.

### [카테고리 5] 제약조건

Q5. 기술 스택 제약
- 타입드 client 의 타입 품질은 001 생성 타입(`paths`)에 의존(생성 타입 SSOT — NFR-003).
- P-002: 신규 의존 `openapi-fetch` 는 AWS/Fly.io 전용 SDK 아님(표준 타입드 HTTP 클라이언트). 도입 정당화
  필요(NFR-005).
- console typecheck/build 회귀 0(facade·refresh 비파괴 유지 — NFR-004).

### [카테고리 6] 예외 & 실패 시나리오

Q6. 엣지 케이스
- 동시 401(facade·client) → refresh 중복 위험. 단일 authFetch 인스턴스 공유 + `refreshing` in-flight
  가드로 1회 보장(FR-006·NFR-001).
- 익명 요청(login/register/refresh)에 만료 토큰 주입·불필요 refresh → `doaAnonymous` 분기로 생략. refresh
  요청은 가드 밖 직접 fetch(무한 재귀 회피 — FR-002).
- openapi-fetch 절대 URL(`baseUrl+path`) → authFetch 가 baseUrl 재prefix 시 이중 prefix. `buildUrl` 이
  절대 URL 통과로 회피(FR-003·SC-004).
- 응답 타입 품질 → 백엔드 OpenAPI 응답 정의 의존. 일부 엔드포인트 response 스키마 미정의 가능(001
  coverage-gap 연속 — GAP-003-01).
