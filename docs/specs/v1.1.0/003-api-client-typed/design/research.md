---
작성: Design Agent
버전: v1.0
최종 수정: 2026-06-30 00:40
상태: 확정 (retroactive)
---

# Research: 003-api-client-typed

## 목차

- [분석 우선순위 게이트 결과](#분석-우선순위-게이트-결과)
- [기존 코드베이스 분석](#기존-코드베이스-분석)
  - [api-client 패키지 현황 (003 이전)](#api-client-패키지-현황-003-이전)
  - [생성 타입 paths 소비 가능성 (001 산출)](#생성-타입-paths-소비-가능성-001-산출)
- [타입드 클라이언트 도구 비교](#타입드-클라이언트-도구-비교)
- [refresh 공유 메커니즘](#refresh-공유-메커니즘)
- [익명 요청 처리 분석](#익명-요청-처리-분석)
- [baseUrl 이중 prefix 회피 분석](#baseurl-이중-prefix-회피-분석)
- [생성물·구조 검증 (직접 확인)](#생성물구조-검증-직접-확인)
- [엣지 케이스 및 한계](#엣지-케이스-및-한계)

---

## 분석 우선순위 게이트 결과

- **변경 대상(plan §핵심 설계)**: `packages/api-client/src`(`auth-fetch.ts` 신규·`http.ts` 리팩토링·
  `index.ts` 통합)·`package.json`(의존). `apps/console`·`packages/shared-types`(001 산출 — 소비만)·백엔드
  **변경 없음**.
- §A·B·C 분석은 auth-fetch.ts·http.ts·index.ts 로 한정.
- §D(다단계 병렬 파이프라인): 미해당.
- §E(동일 가드 결정 통합): **부분 해당** — refresh 로직이 두 곳(HttpClient·신규 client)에 중복될 위험을
  단일 authFetch 공유로 통합(아래 §refresh 공유 메커니즘).
- 외부 라이브러리 검증(§4): **신규 라이브러리 1건** — `openapi-fetch ^0.17.0`(생성 타입 `paths` 소비
  타입드 클라이언트). 아래 비교 절에서 선택 근거 분석.
- §F(production 시그니처 변경): **부분 해당** — `HttpClient` 생성자에 optional `authFetch?` 파라미터
  추가(`constructor(opts, authFetch?)`). 두 번째 인자가 optional 이므로 기존 `new HttpClient(opts)` 호출
  호환(비파괴). `createApiClient` 반환에 `client`·`http` 추가(기존 facade 불변 — 호출 측 영향 0).

---

## 기존 코드베이스 분석

> context.md 의 모노레포·공유 패키지 구조를 기준선. 본 절은 변경 대상 한정 정밀 분석.

### api-client 패키지 현황 (003 이전)

- **구조**: 003 이전 `@doa/api-client` 는 `http.ts`(HttpClient — 토큰 주입·401 refresh·쿼리·JSON·에러·204
  전부 보유) + `index.ts`(`createApiClient` 가 HttpClient 위에 수기 도메인 facade 조립)로 구성.
- **수기 facade**: `createApiClient` 반환의 도메인 메서드(auth·user·seller·catalog·inventory)는 호출 측에서
  응답 제네릭을 수기 지정(`http.get<Product>('/products/...')`). commerce 이후 11개 도메인(주문·결제·쿠폰·
  배송·정산·리뷰·검색·알림·파일·배너·통계·관리자) facade 부재 → 신규 화면이 그 도메인 호출 시 수기 메서드
  추가 필요.
- **refresh 위치**: 401 자동 refresh(원요청 재시도) 로직이 HttpClient 내부에 위치. 타입드 client 를 별도로
  추가하면 두 클라이언트가 독립 refresh 상태를 가져 동시 401 시 중복 refresh 위험(§E 통합 대상).

### 생성 타입 paths 소비 가능성 (001 산출)

- 001 이 `packages/shared-types/src/openapi.gen.ts`(paths/components/operations, 70경로)를 생성하고
  `index.ts` 가 `paths`/`components`/`operations` 를 재노출했다(001 FR-005). 003 은 이 `paths` 를
  `openapi-fetch` 의 타입 파라미터(`createClient<paths>`)로 직접 소비할 수 있다.
- **OOP 상속/추상 클래스 없음**: 변경 대상은 함수 팩토리(`createAuthFetch`·`createApiClient`)와 단일
  클래스(`HttpClient`)다. 상속 트리·추상 클래스 없음(인스턴스화 제약 없음).

---

## 타입드 클라이언트 도구 비교

| 항목 | 수기 facade 제네릭(기존) | 직접 generics 자작 | openapi-fetch(003 채택) |
|---|---|---|---|
| 경로 타입 | 문자열 리터럴(미검증) | 자작 매핑 유지부담 | **`paths` 키로 자동**(오타 컴파일 에러) |
| params/query/body | 호출 측 수기 제네릭 | 자작 추출 타입 | **`paths[path][method]` 에서 자동 도출** |
| response | `http.get<T>` 수기 T | 자작 | **`paths` 응답 스키마에서 자동** |
| 도메인 커버리지 | 5도메인(11 누락) | 전량 자작 | **70경로 전체**(생성 타입 SSOT) |
| 유지부담 | 백엔드 변경 시 수기 동기화 | 코드젠 매핑 자작·유지 | 코드젠 재생성만(001 절차) |

> 채택: openapi-fetch(ADR-001). 생성 타입 `paths`(001)를 타입 파라미터로 받아 경로·params·query·body·
> response 를 전부 컴파일 타임 타입 체크한다. 자작 generics 의 유지부담·수기 facade 의 동기화 부담을
> 동시에 회피하며, custom fetch(`fetch: authFetch`) 주입을 지원하여 refresh 보존이 가능하다.

---

## refresh 공유 메커니즘

- **문제**: 타입드 client 를 추가하면 facade(HttpClient)와 client 가 각자 401 refresh 를 보유 →동시 401
  시 두 번 refresh(토큰 이중 갱신·경합).
- **해결(채택)**: refresh 로직을 `createAuthFetch(opts)` 로 추출하여 **`typeof fetch` 래퍼**를 반환하고,
  `createApiClient` 가 이 래퍼 인스턴스를 **1개만** 만들어 HttpClient 와 openapi-fetch client(`fetch:
  authFetch`)에 **동일 인스턴스를 주입**한다.
- **in-flight 1회 가드**: `createAuthFetch` 클로저 내 `refreshing: Promise<boolean> | null` 변수.
  `ensureRefreshed()` 가 `refreshing ??= doRefresh().finally(() => { refreshing = null; })` 로 동시 401 시
  단일 Promise 를 공유한다. 두 클라이언트가 동일 클로저(동일 authFetch 인스턴스)를 공유하므로 refresh 는
  앱 전역에서 1회만 실행된다(NFR-001).
- **전제(중요)**: 이 보장은 authFetch 인스턴스가 **1개** 라는 것에 의존한다. `createApiClient` 가 authFetch
  를 복수 생성하거나 client 에 별도 fetch 를 주입하면 가드가 클로저별로 분리되어 보장이 깨진다(plan §기타
  고려사항·인터페이스 계약 방어 코드 참조).

---

## 익명 요청 처리 분석

- **문제**: login/register/refresh 는 인증 전 요청이라 Authorization 헤더 주입·401 refresh 가 부적절하다
  (만료/부재 토큰 주입, refresh 무한 재귀).
- **해결(채택)**: `AuthRequestInit.doaAnonymous` 플래그. `doaAnonymous: true` 면 (1) Authorization 미주입,
  (2) 401 refresh 재시도 분기 자체를 건너뜀. `HttpClient.request` 가 `options.anonymous` → `init.doaAnonymous`
  로 매핑한다(facade `auth.login`·`auth.register` 가 `{ anonymous: true }` 사용).
- **refresh 요청 자체**: `doRefresh` 가 `fetch(buildUrl('/auth/refresh'), ...)` 로 authFetch 가드를 거치지
  않고 직접 수행한다. refresh 요청이 401 을 받아도 또 refresh 하는 무한 재귀를 구조적으로 차단.

---

## baseUrl 이중 prefix 회피 분석

- **문제**: openapi-fetch 는 `createClient({ baseUrl })` 로 설정한 baseUrl 에 path 를 붙여 **절대 URL**
  (`http://host/seller/orders`)로 주입 fetch(`authFetch`)를 호출한다. authFetch 가 baseUrl 을 다시 prefix
  하면 `http://host/http://host/...` 이중 prefix 가 발생한다.
- **해결(채택)**: `buildUrl` 이 입력이 절대 URL(`/^https?:\/\//`)이면 **그대로 통과**, 상대경로면 baseUrl
  기준 절대화. openapi-fetch 의 절대 URL 은 통과되고, HttpClient(facade)의 상대경로(`/products/...`)는
  baseUrl 로 절대화된다. baseUrl trailing slash 유무는 `replace(/\/?$/, '/')` 로 정규화하여 무관.

---

## 생성물·구조 검증 (직접 확인)

> 변경 구조는 추측하지 않고 실제 파일·diff 를 직접 확인하여 확정했다(자가 보고 신뢰하지 않음).

| 대상 | 측정 | 값 | 측정 방법 |
|---|---|---|---|
| `auth-fetch.ts` | 신규 라인 | +98 / -0 | `git diff --numstat 29eb81f 1671814` |
| `http.ts` | 변경 | +29 / -82 | 동일(리팩토링 — refresh 중복 제거) |
| `index.ts` | 변경 | +17 / -1 | 동일(openapi-fetch 통합·재노출) |
| `package.json` | 변경 | +2 / -1 | 동일(`openapi-fetch ^0.17.0` dependency) |
| `paths` 경로 수(001 생성 타입) | client 타입 파라미터 | **70** | `Object.keys(openapi.json.paths).length`(001 산출 기준) |
| `openapi-fetch` lock | 버전 | `0.17.0` | `git diff 29eb81f 1671814 -- pnpm-lock.yaml` 에 `openapi-fetch@0.17.0` |

- `index.ts` 반환 형태(직접 확인): `{ http, client, auth, user, seller, catalog, inventory }`. `client` =
  `createOpenApiClient<paths>({ baseUrl, fetch: authFetch })`. `TypedClient`·`createAuthFetch`·
  `AuthFetchOptions`·`TokenStore` 재노출. 기존 도메인 facade 메서드 시그니처 불변.

---

## 엣지 케이스 및 한계

- **refresh 공유 전제**: 전역 1회는 authFetch 인스턴스 1개 공유에 의존(위 §refresh 공유 메커니즘). 향후
  복수 authFetch 생성 시 깨짐 — 유지 시 주의.
- **응답 타입 품질**: 타입드 client 의 response 타입은 백엔드 OpenAPI 응답 정의에 의존한다. 001 에서 87
  operations 중 typed 2xx content 36건이며 나머지는 응답 본문 타입 미주석이다(001 coverage-gap·GAP-001-01).
  따라서 일부 엔드포인트 `api.client.GET(...)` response 타입이 비어 있을 수 있다. 응답 DTO 보강은 후속
  (GAP-003-01).
- **console 마이그레이션 미반영**: 003 은 client 추가·facade 불변(비파괴)까지다. console 페이지 호출의
  타입드 client 전환·수기 타입 폐기는 후속(범위 외). 기존 화면은 facade·수기 타입으로 회귀 0(NFR-004).
- **authFetch 단위 테스트 부재**: refresh in-flight 가드·doaAnonymous 분기·buildUrl·isRetry 1회 재시도는
  단위 테스트 없이 빌드/타입체크·정적 검토로 갈음했다(인프라 성격). 동시성 엣지 케이스 회귀 방지 단위
  테스트는 후속 권고(GAP-003-01).

가정-실제 불일치 현재 미발견(변경 구조·diff·반환 형태를 실제 파일/numstat 직접 확인).
