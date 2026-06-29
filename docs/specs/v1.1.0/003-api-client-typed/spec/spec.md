---
작성: Spec Agent
버전: v1.0
최종 수정: 2026-06-30 00:40
상태: 확정 (구현 완료 — retroactive 문서화)
---

# Spec: 003-api-client-typed

> Branch: 003-api-client-typed | Date: 2026-06-30 | Version: v1.1.0
>
> 본 문서는 이미 구현·검증이 완료된 코드(커밋 `1671814`, base `29eb81f`)를 근거로 정식 SDD 포맷으로
> retroactive 작성되었다. 모든 요구사항·수용 기준은 실제 구현된 `@doa/api-client`(`auth-fetch.ts` 신규·
> `http.ts` 리팩토링·`index.ts` openapi-fetch 통합·`package.json` 의존)에서 확인한 사실을 기준으로 한다.
> 001(생성 타입 SSOT — `openapi.gen.ts` paths)의 **소비자(consumer)** 차수이며, FRONTEND-PLAN.md
> Phase 0(타입 공유)을 완성한다. 001 의 "범위 외 — `@doa/api-client` 의 생성 타입 전면 전환"이 본 차수다.

## 목차

- [배경 및 목적](#배경-및-목적)
- [사용자 스토리](#사용자-스토리)
- [기능 요구사항](#기능-요구사항)
- [비기능 요구사항](#비기능-요구사항)
- [수용 기준](#수용-기준)
- [요구사항 구조화 매트릭스](#요구사항-구조화-매트릭스)
- [범위 외](#범위-외)
- [미결 사항](#미결-사항)

---

## 배경 및 목적

001(`openapi-codegen-foundation`)이 백엔드 OpenAPI 문서에서 `packages/shared-types/src/openapi.gen.ts`
(paths/components/operations, 전 도메인 70경로)를 자동 생성하여 **타입 계약의 SSOT** 를 백엔드 코드로
단일화했다. 그러나 그 시점의 `@doa/api-client` 는 여전히 **수기 도메인 facade**(auth·user·seller·catalog·
inventory)였고, 생성 타입을 직접 소비하지 않았다. 001 은 이 api-client 전환을 명시적으로 범위 외(Phase 0
후속)로 분리했다(001 spec.md §범위 외).

- **기존 한계 (수기 facade)**: `createApiClient` 가 반환하는 도메인 메서드는 `http.get<Product>('/products/...')`
  처럼 **호출 측에서 응답 제네릭을 수기 지정**한다. 경로·params·query·body·response 타입이 생성 타입과
  자동 동기화되지 않으며, 백엔드 계약 변경이 facade 에 자동 전파되지 않는다. 또한 commerce 이후 11개
  도메인(주문·결제·쿠폰·배송·정산·리뷰·검색·알림·파일·배너·통계·관리자)의 facade 메서드가 **부재**하여,
  신규 화면이 그 도메인을 호출하려면 수기 메서드를 추가해야 했다.

- **refresh 로직 중복 위험**: 401 자동 refresh(원요청 재시도) 로직이 `HttpClient` 내부에 있었다. 타입드
  클라이언트(openapi-fetch)를 별도로 추가하면 두 클라이언트가 **독립적인 refresh 상태**를 가져, 동시
  401 시 refresh 가 중복 실행되거나 토큰 갱신이 일관되지 않을 위험이 있다.

003 은 이 공백을 (1) `openapi-fetch` 의 `createClient<paths>` 로 **전 도메인 70경로 타입드 클라이언트**
(`api.client`)를 추가하고, (2) refresh 로직을 `createAuthFetch`(fetch 래퍼)로 추출하여 **legacy facade 와
타입드 클라이언트가 동일 authFetch 인스턴스를 공유**(refresh in-flight 전역 1회 일관)하게 하며, (3) 기존
도메인 facade·console 호출을 **불변(비파괴)** 으로 유지하여 점진 전환을 보장하는 방식으로 해소한다.
계약의 소비 측이 생성 타입(`paths`)에 결합되어, 백엔드 변경이 코드젠 재생성을 거쳐 결정적으로 프론트
호출부에 전파된다.

> 설계 결정(FRONTEND-PLAN 연속): console 먼저 완성, 타입 공유는 OpenAPI 코드젠(001). 003 은 그 생성
> 타입의 **런타임 소비 도구**(타입드 HTTP 클라이언트)를 제공하여 Phase 0(타입 공유)을 완성한다. 수기
> facade 폐기·console 화면 마이그레이션은 점진(Phase 1+, 범위 외).

---

## 사용자 스토리

- **US-001**: 프론트엔드 개발자로서, 백엔드 18개 도메인의 어떤 엔드포인트든 수기 facade 메서드 추가 없이
  `api.client.GET('/seller/orders', { params, ... })` 형태로 호출하고 경로·params·query·body·response 가
  전부 컴파일 타임에 타입 체크되기를 원한다.
- **US-002**: 프론트엔드 개발자로서, 기존 console 화면이 사용하는 도메인 facade(auth·user·seller·catalog·
  inventory)와 기존 401 자동 refresh 동작이 본 전환으로 깨지지 않고 그대로 동작하기를 원한다(회귀 0).
- **US-003**: 프론트엔드 개발자로서, legacy facade 와 신규 타입드 클라이언트가 동시에 401 을 받아도 토큰
  refresh 가 앱 전역에서 단 한 번만(in-flight 1회) 실행되어 토큰 갱신이 일관되기를 원한다.

---

## 기능 요구사항

- **FR-001** (공유 authFetch 추출): 토큰 주입 + 401 자동 refresh(원요청 재시도) 로직을
  `packages/api-client/src/auth-fetch.ts` 의 `createAuthFetch(opts)` 팩토리로 추출한다.
  `createAuthFetch` 는 `typeof fetch` 시그니처의 래퍼를 반환하며, 내부에 refresh in-flight 가드
  (`refreshing` Promise — 동시 401 시 단일 refresh 공유)를 가진다. `TokenStore`(getAccessToken·
  getRefreshToken·setTokens·clear)·`AuthFetchOptions`(baseUrl·tokens·autoRefresh·onAuthExpired)를 정의한다.

- **FR-002** (익명 요청 분리 — doaAnonymous): `AuthRequestInit` 에 `doaAnonymous` 플래그를 정의한다.
  `doaAnonymous: true` 인 요청(login/register/refresh)은 Authorization 헤더 주입과 401 refresh 재시도를
  **생략**한다. refresh 요청 자체(`POST /auth/refresh`)는 authFetch 가드 밖에서 직접 `fetch` 로 수행한다.

- **FR-003** (baseUrl 상대경로 보정 / 절대 URL 통과): `createAuthFetch` 의 `buildUrl` 이 입력이 절대 URL
  (`^https?://`)이면 그대로 통과시키고, 상대경로면 `opts.baseUrl` 기준으로 절대 URL 을 구성한다.
  openapi-fetch 가 `baseUrl + path` 절대 URL 로 호출하므로 authFetch 가 이중 prefix 없이 그대로 통과한다.

- **FR-004** (HttpClient → 공유 authFetch 위임): `HttpClient` 가 refresh 로직을 직접 보유하지 않고
  생성자에서 주입받은(또는 자체 생성한) `authFetch` 에 위임한다. 본 클래스는 쿼리 직렬화(`withQuery`)·
  JSON 본문 직렬화·표준 에러 변환(`ApiError`)·204 처리만 담당한다. 생성자 시그니처는
  `constructor(opts, authFetch?)` 로 optional authFetch 주입을 받는다.

- **FR-005** (openapi-fetch 타입드 클라이언트 추가): `index.ts` 가 `openapi-fetch` 의
  `createClient<paths>({ baseUrl, fetch: authFetch })` 로 전 도메인 70경로 타입드 클라이언트(`client`)를
  생성하여 `createApiClient` 반환에 포함한다. `TypedClient` 타입(`ReturnType<typeof createClient<paths>>`)을
  정의·재노출하고, `createAuthFetch`·`AuthFetchOptions` 를 재노출한다.

- **FR-006** (공유 authFetch 인스턴스 — facade·client 일원화): `createApiClient` 가 `createAuthFetch(options)`
  로 authFetch 인스턴스를 **1개** 생성하여 `HttpClient`(legacy facade)와 openapi-fetch `client` 양쪽에
  동일 인스턴스를 주입한다. refresh in-flight 가드가 두 클라이언트에 걸쳐 공유되어 전역 1회 일관을 보장한다.

- **FR-007** (기존 도메인 facade 비파괴 유지): `createApiClient` 반환의 기존 도메인 facade
  (auth·user·seller·catalog·inventory)와 그 메서드 시그니처를 변경하지 않는다. 기존 console 호출은 불변이며,
  신규 `client`·`http` 가 추가될 뿐이다.

---

## 비기능 요구사항

- **NFR-001** (refresh 전역 1회 일관): legacy facade 와 타입드 client 가 동시에 401 을 받아도 refresh 는
  앱 전역에서 in-flight 1회만 실행된다(`createAuthFetch` 의 `refreshing` 가드를 단일 authFetch 인스턴스가
  공유 — FR-006). refresh 중복 실행·토큰 이중 갱신 0.

- **NFR-002** (익명 요청 토큰 미주입): login/register/refresh(`doaAnonymous`) 요청에 Authorization 헤더가
  주입되지 않으며 401 refresh 재시도도 발생하지 않는다(FR-002). 인증 전 요청이 만료 토큰·불필요 refresh
  로 오염되지 않는다.

- **NFR-003** (생성 타입 SSOT 결합): 타입드 client 의 경로·params·query·body·response 타입은
  `@doa/shared-types` 의 생성 타입(`paths`, 001 산출)에서 도출된다. 수기 타입 별도 정의 0. 백엔드 계약
  변경은 코드젠 재생성(001 절차)을 거쳐 client 호출부에 전파된다.

- **NFR-004** (하위 호환 — console 회귀 0): 본 변경은 기존 console 화면의 타입체크·빌드를 깨뜨리지
  않는다(`console typecheck` 0, `console build` 13 라우트 PASS). 도메인 facade·기존 refresh 동작 불변
  (비파괴 — FR-007).

- **NFR-005** (신규 의존성 정당화): 신규 의존성은 `openapi-fetch ^0.17.0`(api-client dependency) 1종이다.
  AWS/Fly.io 전용 SDK 가 아닌 표준 타입드 HTTP 클라이언트 라이브러리로 P-002(AWS 의존 금지)에 저촉되지
  않는다.

---

## 수용 기준

> **환경 태그 규약**:
> | 태그 | 의미 |
> |---|---|
> | `[env:static]` | 정적 코드/구조 검증(코드 리뷰·grep·반환 형태 확인)으로 판정 |
> | `[env:typecheck]` | TypeScript 타입체크(`tsc --noEmit` / `console typecheck`) 통과로 판정 |
> | `[env:build]` | 빌드 산출(`console build` 라우트 컴파일) 성공으로 판정 |

- **SC-001** (`FR-005`·`NFR-003` 관련): `createApiClient(opts)` 반환에 `client`(openapi-fetch
  `createClient<paths>`)가 포함되며, `api.client.GET/POST/PATCH/DELETE` 가 001 생성 타입(`paths`)의 전
  도메인 70경로에 대해 경로·params·query·body·response 를 타입 체크한다. `TypedClient` 타입·`createAuthFetch`·
  `AuthFetchOptions` 가 재노출된다. console typecheck/build 가 타입드 client 를 포함하여 통과한다.
  [env:typecheck] [env:build]

- **SC-002** (`FR-001`·`FR-006`·`NFR-001` 관련): refresh 로직이 `createAuthFetch` 로 추출되고,
  `createApiClient` 가 authFetch 인스턴스 1개를 `HttpClient` 와 `client` 에 공유 주입한다. `createAuthFetch`
  내부 `refreshing` 가드가 동시 401 시 단일 refresh Promise 를 공유한다(in-flight 1회). [env:static]

- **SC-003** (`FR-002`·`NFR-002` 관련): `doaAnonymous: true` 요청(login/register)은 Authorization 미주입·
  401 refresh 재시도 생략. refresh 요청은 authFetch 가드 밖 직접 fetch. legacy facade 의 `anonymous: true`
  옵션이 `doaAnonymous` 로 매핑된다(`http.ts` request). [env:static]

- **SC-004** (`FR-003` 관련): `buildUrl` 이 절대 URL(`^https?://`)은 통과, 상대경로는 baseUrl 기준 절대화.
  openapi-fetch 의 `baseUrl + path` 절대 URL 호출이 authFetch 에서 이중 prefix 없이 통과한다. [env:static]

- **SC-005** (`FR-004`·`FR-007`·`NFR-004` 관련): `HttpClient` 가 refresh 중복 제거 후 공유 authFetch 위임
  (쿼리 직렬화·JSON 본문·`ApiError` 변환·204 처리만 담당), 기존 도메인 facade(auth·user·seller·catalog·
  inventory) 시그니처 불변. console typecheck 0 error·build 13 라우트 PASS(회귀 0). [env:typecheck] [env:build]

---

## 요구사항 구조화 매트릭스

> 매핑 누락(SC 없는 FR/NFR, FR/NFR 없는 SC) 0건이 완료 조건.
> MoSCoW: Must / Should / Could / Won't

| US-ID | FR-ID | NFR-ID | SC-ID | [env:*] | MoSCoW |
|---|---|---|---|---|---|
| US-001 | FR-005 | NFR-003 | SC-001 | typecheck/build | Must |
| US-003 | FR-001·FR-006 | NFR-001 | SC-002 | static | Must |
| US-003 | FR-002 | NFR-002 | SC-003 | static | Must |
| US-001 | FR-003 | NFR-003 | SC-004 | static | Must |
| US-002 | FR-004·FR-007 | NFR-004 | SC-005 | typecheck/build | Must |

> 모든 FR(FR-001~007)이 SC 로 대응된다(FR-001·006→SC-002, FR-004·007→SC-005). 매핑 누락 0건. SC-001·005 는
> 타입체크/빌드로, SC-002·003·004 는 정적 구조 검증(refresh 추출·공유·익명 분리·URL 보정)으로 판정한다.
> 본 차수는 인프라(클라이언트 라이브러리) 성격이라 별도 단위 테스트 스위트가 없으며, 검증은 **빌드/타입체크
> + 정적 구조 검증**으로 갈음한다(plan.md 테스트 전략·NFR-001~004 참조). NFR-005(신규 의존성 정당화)는
> P-002 Gates 충족 근거로 plan.md 에 기록되며 별도 SC 없음(도입 사실은 SC-001 의 client 컴파일로 간접 검증).

---

## 범위 외

- **console 페이지의 기존 도메인 호출 마이그레이션**: console 화면의 기존 도메인 facade 호출
  (`api.auth.login` 등)을 타입드 `api.client.GET/POST(...)` 로 전환하는 작업은 본 차수 범위 외다(점진 —
  Phase 1+). 003 은 타입드 client 를 **추가**하고 facade 를 불변 유지하는 비파괴 전환까지만 다룬다.
- **수기 shared-types 타입 폐기**: 001 에서 한시 유지된 수기 타입(`LoginRequest`·`UserProfile`·`Product`
  등)을 생성 타입으로 완전 대체·삭제하는 작업은 범위 외다(console 마이그레이션과 연동되는 후속).
- **도메인 facade 의 타입드 client 기반 재작성**: 기존 facade 메서드 내부를 `http.get<T>` 대신 `client.GET`
  으로 재작성하거나 11개 누락 도메인 facade 를 추가하는 작업은 범위 외다. 신규 화면은 facade 추가 없이
  `api.client` 를 직접 사용한다(US-001).
- **응답 스키마 품질 보강**: 타입드 client 의 response 타입 품질은 백엔드 OpenAPI 응답 정의에 의존한다.
  일부 엔드포인트는 response 스키마가 미정의일 수 있다(001 coverage-gap — 87 ops 중 typed 2xx content
  36건). 응답 DTO 보강은 본 차수 범위 외(GAP-003-01, 001 GAP-001-01 연속).
- **authFetch 단위 테스트**: refresh in-flight 가드·doaAnonymous 분기·buildUrl 보정에 대한 단위 테스트는
  본 차수에 추가하지 않는다(인프라 — 빌드/타입체크로 갈음). 단위 테스트 추가는 후속 권고(GAP-003-01).

---

## 미결 사항

없음 — 본 spec 은 구현 완료 코드를 기준으로 retroactive 작성되었으며, 모든 요구사항·수용 기준이 실제
구현(`auth-fetch.ts` createAuthFetch·`http.ts` 위임 리팩토링·`index.ts` openapi-fetch 통합·공유 authFetch)과
대조 확인되었다. console 호출 마이그레이션·수기 타입 폐기·응답 스키마 보강·authFetch 단위 테스트는 Low 등급
잔여 권고로 남기되(GAP-003-01), Phase 0(타입 공유) 핵심 목표 — 전 도메인 70경로 타입드 클라이언트 제공 +
refresh 전역 1회 공유 + 비파괴 facade 공존 — 은 console typecheck 0·build 13 라우트 PASS 로 달성되었다.
