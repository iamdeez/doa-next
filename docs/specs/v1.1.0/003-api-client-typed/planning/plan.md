---
작성: Planning Agent
버전: v1.0
최종 수정: 2026-06-30 00:40
상태: 확정 (retroactive)
---

# Plan: 003-api-client-typed

> Branch: 003-api-client-typed | Date: 2026-06-30 | Spec: [../spec/spec.md](../spec/spec.md)

## 목차

- [사전 검증 (Constitution Gates)](#사전-검증-constitution-gates)
- [기술 컨텍스트](#기술-컨텍스트)
- [사전 영향도 분석 결과](#사전-영향도-분석-결과)
- [핵심 설계](#핵심-설계)
- [결정 기록 (ADRs)](#결정-기록-adrs)
- [인터페이스 계약](#인터페이스-계약)
- [데이터 모델](#데이터-모델)
- [테스트 전략](#테스트-전략)
- [보안 노트](#보안-노트)
- [기타 고려사항](#기타-고려사항)

---

## 사전 검증 (Constitution Gates)

> `constitution.md`(P-001~P-007) 존재 → 해당 조항을 Gates 로 사용한다(constitution 우선). spec.md NFR
> (NFR-001~005)은 P-006 테스트·P-002 외부 의존을 구체화하며 충돌(완화) 없음. 본 차수의 핵심 검토 조항은
> **P-002(신규 의존 도입 정당화)**·**P-007(스펙 범위)** 이며, refresh 일관성은 P-006(테스트 — 빌드/정적
> 갈음)으로 검증한다.

- [x] **P-001 모듈 경계 원칙**: [Pass 기준: 다른 도메인 모듈의 스키마 테이블을 직접 참조·쿼리하지 않음]
  → PASS. 본 차수는 **프론트엔드 HTTP 클라이언트 패키지**(`@doa/api-client`)의 변경이며 백엔드 도메인
  모듈·DB 스키마와 무관하다. DB 접근·교차 쿼리 0. 클라이언트는 백엔드 HTTP 계약(생성 타입 `paths`)만 소비.
- [x] **P-002 AWS 의존 금지 원칙**: [Pass 기준: `@aws-sdk/*` 및 AWS 전용 SDK 신규 추가 0건]
  → PASS(직접 검토 조항). 신규 의존 1종 = `openapi-fetch ^0.17.0`(api-client dependency). **AWS/Fly.io
  전용 SDK 가 아니며**, OpenAPI 생성 타입(`paths`)을 소비하는 표준 타입드 HTTP 클라이언트다. P-002 의 금지
  목록(Cognito·SQS·DynamoDB·CloudWatch 등)과 무관(NFR-005).
- [x] **P-003 단일 DB 원칙**: [Pass 기준: 단일 PostgreSQL 외 외부 저장소 0건]
  → PASS(무관). 프론트 클라이언트 변경으로 데이터 저장소·캐시·큐 0건. DB 스키마 변경 0(마이그레이션 없음).
  `TokenStore` 는 토큰 저장 전략을 console 에 위임하는 인터페이스일 뿐 신규 저장소가 아니다.
- [x] **P-004 클라우드 중립 원칙**: [Pass 기준: Fly.io 전용 API 결합 0건]
  → PASS. 표준 `fetch`·`openapi-fetch` 만 사용. 플랫폼 전용 API 0. `baseUrl` 은 런타임 주입(console
  설정)으로 환경 중립.
- [x] **P-005 결제·정산 정합성 원칙**: [Pass 기준: 금전 상태 변경 outbox·멱등성·Decimal]
  → PASS(무관). 본 차수는 HTTP 클라이언트 전송 계층이며 결제·정산 상태 변경 로직을 포함하지 않는다. 금전
  수치 연산 0(Decimal 은 계약상 문자열로 전달될 뿐 client 가 연산하지 않음).
- [x] **P-006 테스트 원칙**: [Pass 기준: SC-XXX 없는 FR-XXX 0건]
  → PASS. FR-001·006→SC-002, FR-002→SC-003, FR-003→SC-004, FR-004·007→SC-005, FR-005→SC-001. 인프라
  (클라이언트 라이브러리) 성격상 단위 테스트 스위트는 없으며 검증은 **타입체크 + console 빌드 + 정적 구조
  검증**으로 갈음한다(모든 FR 이 SC 로 대응 — P-006 충족). 기존 console 테스트 커버리지 저하 0(NFR-004).
- [x] **P-007 스펙 범위 원칙**: [Pass 기준: spec.md 범위 외 변경 파일 0건]
  → PASS(직접 검토 조항). 변경 범위 = `packages/api-client/src/auth-fetch.ts`(신규)·`src/http.ts`(리팩토링)·
  `src/index.ts`(통합)·`package.json`(의존). 전부 FR-001~007 추적 가능. **console 화면 마이그레이션·수기
  타입 폐기·facade 재작성·응답 스키마 보강은 범위 외**로 분리(점진 — Phase 1+).

> **예외 사항**: 없음. P-001~P-007 전부 통과(예외 0건). 신규 의존 1종(`openapi-fetch`)은 P-002 의 AWS 금지와
> 무관함을 NFR-005 로 명시 정당화.

> **Gates 판정**: P-001~P-007 전부 통과(예외 0건). 선택 단계는 Database Design=N·Deploy=N·Security=N·
> Performance=N(selection-phases.md). Design Agent(3단계) → Development(4) + Test AUTHORING(5a) 진입 가능.

---

## 기술 컨텍스트

> v1.1.0 프론트 스택을 재확정. 003 고유 변경만 명시.

- **언어 / 런타임**: TypeScript 5.x / Node.js ≥20(빌드). 브라우저 런타임(console — Next.js). pnpm `9.0.0`
  + Turborepo 모노레포.
- **패키지**: `@doa/api-client`(프론트 HTTP 클라이언트). 의존 `@doa/shared-types`(생성 타입 `paths` —
  001 산출) + 신규 `openapi-fetch ^0.17.0`.
- **타입드 클라이언트**: `openapi-fetch` 의 `createClient<paths>`. 생성 타입 `paths`(001 `openapi.gen.ts`)를
  타입 파라미터로 받아 경로·params·query·body·response 를 컴파일 타임 타입 체크.
- **공유 fetch 래퍼**: `createAuthFetch(opts)` — `typeof fetch` 반환. 토큰 주입·401 refresh(in-flight 1회
  guard)·`doaAnonymous` 분기·`buildUrl`(절대 통과/상대 보정).
- **테스트 프레임워크**: 본 차수 별도 단위 테스트 없음(인프라/클라이언트). 검증 = 정적 구조 검증
  ([env:static]) + `tsc --noEmit`·`console typecheck`([env:typecheck]) + `console build` 라우트 컴파일
  ([env:build]).
- **환경변수**: 신규 0(`baseUrl` 은 console 이 주입). **신규 의존성**: 1건(`openapi-fetch` dependency).

---

## 사전 영향도 분석 결과

> 상세는 [../design/research.md](../design/research.md) 참조. 본 절은 영향 파일 요약.

### 영향 파일 목록

| 파일 | 변경 유형 | 영향 내용 | 레이어 |
|---|---|---|---|
| `packages/api-client/src/auth-fetch.ts` | 신규 | `createAuthFetch` 팩토리(토큰 주입·401 refresh in-flight 가드·doaAnonymous·buildUrl) + `TokenStore`·`AuthFetchOptions`·`AuthRequestInit` | B(공유 fetch 래퍼) |
| `packages/api-client/src/http.ts` | 수정(리팩토링) | `HttpClient` refresh 제거 → 공유 authFetch 위임. 쿼리 직렬화·JSON 본문·`ApiError`·204 만. 생성자 `(opts, authFetch?)` | B(저수준 클라이언트) |
| `packages/api-client/src/index.ts` | 수정 | `createClient<paths>` 로 `client` 추가, authFetch 1개 공유 주입. `TypedClient`·`createAuthFetch`·`AuthFetchOptions` 재노출. facade 불변 | C(조립·재노출) |
| `packages/api-client/package.json` | 수정 | `openapi-fetch ^0.17.0` dependency 추가 | A(의존) |

> `apps/console/**`·`packages/shared-types/**`(001 산출 — 소비만)·백엔드 변경 0건. 기존 도메인 facade
> 메서드 시그니처 불변(FR-007). console 호출 코드 불변(비파괴 — NFR-004). `pnpm-lock.yaml` 은 의존 추가에
> 따른 부수 변경(spec 코드 범위 외).

---

## 핵심 설계

### 1. 공유 authFetch 추출 (FR-001·FR-006 — refresh in-flight 1회 일관)

```ts
// packages/api-client/src/auth-fetch.ts
export function createAuthFetch(opts: AuthFetchOptions): typeof fetch {
  let refreshing: Promise<boolean> | null = null;                 // in-flight 가드(단일 Promise 공유)
  const ensureRefreshed = (): Promise<boolean> => {
    refreshing ??= doRefresh().finally(() => { refreshing = null; });
    return refreshing;                                            // 동시 401 → 동일 refresh Promise 공유
  };
  const authFetch = async (input, init?, isRetry = false) => {
    const { doaAnonymous, headers, ...rest } = init ?? {};
    const h = new Headers(headers);
    if (!doaAnonymous) { const t = opts.tokens.getAccessToken(); if (t) h.set('Authorization', `Bearer ${t}`); }
    const res = await fetch(buildUrl(input), { ...rest, headers: h });
    if (res.status === 401 && !doaAnonymous && opts.autoRefresh !== false && !isRetry) {
      const ok = await ensureRefreshed();
      if (ok) return authFetch(input, init, true);               // 원요청 1회 재시도
      opts.onAuthExpired?.();
    }
    return res;
  };
  return ((input, init?) => authFetch(input, init as AuthRequestInit)) as typeof fetch;
}
```

- `refreshing` 가드: 두 클라이언트(facade·client)가 동일 authFetch 인스턴스를 공유하면 동시 401 시
  `ensureRefreshed` 가 단일 Promise 를 반환하여 refresh 가 전역 1회만 실행된다(NFR-001).
- `isRetry` 플래그로 재시도는 1회만(refresh 후 재요청이 또 401 이어도 무한 재귀 없음).

### 2. 익명 요청 분리 — doaAnonymous (FR-002·NFR-002)

```ts
export interface AuthRequestInit extends RequestInit { doaAnonymous?: boolean; }
```

- `doaAnonymous: true`(login/register/refresh): Authorization 헤더 미주입 + 401 refresh 재시도 생략.
- refresh 요청(`POST /auth/refresh`)은 `doRefresh` 내부에서 authFetch 가드를 거치지 않고 직접 `fetch` 로
  수행한다(refresh 가 또 401 → refresh 재귀 회피).

### 3. baseUrl 보정 — 절대 통과 / 상대 보정 (FR-003·SC-004)

```ts
const buildUrl = (input: RequestInfo | URL): string => {
  const raw = typeof input === 'string' ? input : input.toString();
  if (/^https?:\/\//.test(raw)) return raw;                                       // 절대 URL 통과
  return new URL(raw.replace(/^\//, ''), opts.baseUrl.replace(/\/?$/, '/')).toString(); // 상대 보정
};
```

- openapi-fetch 는 `baseUrl + path`(절대 URL)로 fetch 를 호출한다. `buildUrl` 이 절대 URL 을 그대로
  통과시키므로 authFetch 가 baseUrl 을 재prefix 하지 않는다(이중 prefix 회피). HttpClient(facade)는 상대
  경로(`/products/...`)를 넘기므로 baseUrl 기준 절대화된다.

### 4. HttpClient → 공유 authFetch 위임 (FR-004)

```ts
// packages/api-client/src/http.ts
export class HttpClient {
  private readonly authFetch: typeof fetch;
  constructor(opts: HttpClientOptions, authFetch?: typeof fetch) {
    this.authFetch = authFetch ?? createAuthFetch(opts);              // 주입 우선, 없으면 자체 생성
  }
  // request(): withQuery(쿼리 직렬화) → JSON 본문 → authFetch → !ok 시 ApiError → 204 처리
}
```

- refresh 로직을 직접 보유하지 않고 주입된 authFetch 에 위임. `options.anonymous` → `init.doaAnonymous`
  매핑. 본 클래스는 쿼리 직렬화·JSON 본문·`ApiError` 변환·204 처리만 담당(refresh 중복 제거).

### 5. openapi-fetch 통합 + 공유 인스턴스 (FR-005·FR-006·FR-007)

```ts
// packages/api-client/src/index.ts
export type TypedClient = ReturnType<typeof createOpenApiClient<paths>>;
export function createApiClient(options: HttpClientOptions) {
  const authFetch = createAuthFetch(options);                        // ① 공유 인스턴스 1개
  const http = new HttpClient(options, authFetch);                   // ② facade 저수준 — 동일 authFetch
  const client = createOpenApiClient<paths>({ baseUrl: options.baseUrl, fetch: authFetch }); // ③ 타입드 — 동일 authFetch
  return { http, client, auth: {...}, user: {...}, seller: {...}, catalog: {...}, inventory: {...} };
}
```

- authFetch 1개를 `http`·`client` 양쪽에 주입 → refresh 가드 공유(전역 1회). 기존 도메인 facade
  (auth·user·seller·catalog·inventory)는 시그니처 불변(비파괴 — FR-007). 신규 화면은 `api.client.GET(...)`
  직접 사용(US-001).

### 6. 점진 전환 구도 (NFR-004)

```
[신규 화면]  →  api.client.GET('/seller/orders', { params, ... })   (생성 타입 70경로 — 003 추가)
[기존 화면]  →  api.auth.login(...) / api.catalog.getProduct(...)    (수기 facade — 불변 유지)
                          ↓ (둘 다)
                  공유 authFetch (refresh in-flight 1회)
```

---

## 결정 기록 (ADRs)

| ADR-ID | 결정 항목 | 채택안 | 대안(검토했으나 미채택) | 근거(spec FR/NFR) | 영향 범위 |
|---|---|---|---|---|---|
| ADR-001 | 타입드 클라이언트 도구 | `openapi-fetch` `createClient<paths>` | 수기 facade 제네릭 보강 / 직접 generics 자작 | FR-005, NFR-003(생성 타입 SSOT 소비) | index.ts·package.json |
| ADR-002 | refresh 로직 위치 | 공유 `createAuthFetch` 추출(단일 인스턴스 공유) | HttpClient·client 각자 보유 | FR-001·006, NFR-001(전역 1회) | auth-fetch.ts·http.ts·index.ts |
| ADR-003 | 익명 요청 처리 | `doaAnonymous` init 플래그(토큰·refresh 생략) | 별도 익명 클라이언트 분리 | FR-002, NFR-002 | auth-fetch.ts·http.ts |
| ADR-004 | baseUrl·이중 prefix | 절대 URL 통과 + 상대 보정(`buildUrl`) | authFetch 항상 baseUrl prefix | FR-003, SC-004 | auth-fetch.ts |
| ADR-005 | HttpClient 책임 | refresh 제거 → 공유 authFetch 위임(직렬화·에러·204 만) | refresh 유지(중복) | FR-004 | http.ts |
| ADR-006 | 기존 facade·console | 비파괴 — facade 불변 + client 추가 공존 | facade 전면 타입드 재작성 | FR-007, NFR-004(회귀 0) | index.ts |

---

## 인터페이스 계약

### 003 신규/변경 인터페이스

```ts
// packages/api-client/src/auth-fetch.ts (신규)
export interface TokenStore {
  getAccessToken(): string | null; getRefreshToken(): string | null;
  setTokens(tokens: AuthTokens): void; clear(): void;
}
export interface AuthFetchOptions {
  baseUrl: string; tokens: TokenStore;
  autoRefresh?: boolean;            // 401 → refresh → 재시도. 기본 true
  onAuthExpired?: () => void;       // refresh 실패 시 — 로그인 화면 전환 등
}
export interface AuthRequestInit extends RequestInit { doaAnonymous?: boolean; }
export function createAuthFetch(opts: AuthFetchOptions): typeof fetch;

// packages/api-client/src/http.ts (변경)
export type HttpClientOptions = AuthFetchOptions;   // @deprecated alias(동일)
export class HttpClient { constructor(opts: HttpClientOptions, authFetch?: typeof fetch); /* get/post/patch/delete */ }

// packages/api-client/src/index.ts (변경)
export type TypedClient = ReturnType<typeof createOpenApiClient<paths>>;
export function createApiClient(options: HttpClientOptions): {
  http: HttpClient; client: TypedClient;
  auth; user; seller; catalog; inventory;          // 기존 facade(불변)
};
export { createAuthFetch }; export type { AuthFetchOptions, TokenStore };
```

### 하위 호환성 / 방어 코드

- **기존 facade 비파괴(핵심)**: `createApiClient` 반환의 도메인 facade(auth·user·seller·catalog·inventory)와
  메서드 시그니처를 변경하지 않는다. `client`·`http` 는 **추가**일 뿐이며 기존 console 호출은 불변(타입체크
  회귀 0 — NFR-004·SC-005).
- **refresh 전역 1회 보장**: authFetch 인스턴스 1개를 facade·client 가 공유하므로 동시 401 에서도 refresh
  중복 0(`refreshing` 가드 — NFR-001). 향후 `createApiClient` 내부에서 authFetch 를 복수 생성하지 않도록
  유지해야 한다.
- **refresh 무한 재귀 회피**: refresh 요청(`/auth/refresh`)은 authFetch 가드 밖 직접 fetch + 원요청 재시도는
  `isRetry` 로 1회만. 익명 요청은 `doaAnonymous` 로 refresh 분기 자체를 건너뛴다.
- **이중 prefix 회피**: openapi-fetch 절대 URL 호출 시 `buildUrl` 이 그대로 통과(FR-003). baseUrl 형식
  (trailing slash 유무)에 무관하게 `replace(/\/?$/, '/')` 로 정규화.

---

## 데이터 모델

DB 스키마 변경 없음(마이그레이션 0). 신규 테이블·컬럼·enum·인덱스·제약 0건. 본 차수의 "데이터"는 런타임
DB 데이터가 아닌 **HTTP 계약 타입**(`@doa/shared-types` 의 생성 타입 `paths` — 001 산출)이며, client 는
이를 **소비**할 뿐 생성하지 않는다. `TokenStore` 는 토큰 저장 전략을 console 에 위임하는 인터페이스로 신규
영속 저장소가 아니다. Database Design Agent 비활성(selection-phases.md).

---

## 테스트 전략

### SC↔검증 매핑 (요약)

| SC 식별자 | 수준 | 유형 | 시나리오 요약 | 입력 | 기대 결과 |
|---|---|---|---|---|---|
| SC-001 | typecheck/build | 타입드 client | `api.client` 70경로 타입 + 재노출 | console typecheck/build | `client` 컴파일·`TypedClient`/`createAuthFetch` 재노출·13 라우트 PASS |
| SC-002 | static | refresh 공유 | createAuthFetch 추출·단일 인스턴스 공유 | index.ts·auth-fetch.ts 코드 리뷰 | authFetch 1개 → http·client 주입, `refreshing` in-flight 가드 |
| SC-003 | static | 익명 분리 | doaAnonymous 토큰·refresh 생략 | auth-fetch.ts·http.ts 코드 리뷰 | 익명 요청 Authorization 미주입·refresh 생략, refresh 가드 밖 직접 fetch |
| SC-004 | static | URL 보정 | 절대 통과/상대 보정 | buildUrl 코드 리뷰 | `^https?://` 통과, 상대경로 baseUrl 절대화(이중 prefix 0) |
| SC-005 | typecheck/build | 비파괴 위임 | HttpClient 위임·facade 불변 | http.ts·console typecheck/build | refresh 제거·authFetch 위임, facade 시그니처 불변, 회귀 0 |

### smoke_tests

- 필요 여부: N(별도 부팅 스모크 불필요). 본 차수는 인프라(클라이언트 라이브러리)로, 검증은 **타입체크
  (`tsc --noEmit`·`console typecheck`) + console 빌드(타입드 client 번들·13 라우트 컴파일) + 정적 구조
  검증(refresh 추출·공유·익명 분기·URL 보정)** 으로 갈음한다. 별도 단위 테스트 스위트는 작성하지 않으며,
  기존 console 빌드·타입체크가 회귀 0 으로 유지된다. authFetch 단위 테스트는 후속 권고(GAP-003-01).

---

## 보안 노트

> Security Agent: N(selection-phases.md). 본 절로 보안 영향 분석을 갈음한다.

- **토큰 처리(기존 유지·강화)**: 본 차수는 기존 401 refresh·Bearer 토큰 주입 로직을 `HttpClient` 에서
  `createAuthFetch` 로 **추출·일원화** 한 것이며 인증 메커니즘을 변경하지 않는다. 오히려 facade·client 가
  단일 refresh 인스턴스를 공유하여 토큰 갱신 일관성이 **강화** 된다(refresh 중복·경합 제거 — NFR-001).
- **토큰 저장 위임**: 실제 토큰 저장(localStorage·메모리 등)은 `TokenStore` 인터페이스로 console 에
  위임된다. api-client 는 토큰을 영속 저장하지 않으며 저장 전략·노출 표면은 호출 측(console) 책임이다.
- **익명 요청 분리**: login/register/refresh(`doaAnonymous`)는 Authorization 헤더를 주입하지 않아 인증 전
  요청에 만료/타 사용자 토큰이 섞이지 않는다(NFR-002).
- **신규 공격 표면**: openapi-fetch 도입은 표준 `fetch` 래퍼이며 새 네트워크 엔드포인트·입력 처리 경로를
  추가하지 않는다. `buildUrl` 은 절대 URL 통과/상대 보정만 수행(임의 호스트 강제 redirect 로직 없음 —
  baseUrl 은 console 주입 신뢰값). OWASP Top 10 관점의 신규 공격 표면 없음.
- **결론**: 인증·인가 표면을 변경하지 않으며(기존 가드 계약 소비), 토큰 처리는 추출·일원화로 일관성 강화.
  보안 감사 대상 부재(Security Agent: N — selection-phases.md).

---

## 기타 고려사항

- **refresh 공유의 전제(핵심)**: refresh 전역 1회 일관(NFR-001)은 `createApiClient` 가 authFetch 인스턴스를
  **1개만** 생성하여 facade·client 에 공유하는 것에 의존한다. 향후 `createApiClient` 내부에서 authFetch 를
  복수 생성하거나 client 에 별도 fetch 를 주입하면 이 보장이 깨진다(refresh 가드는 클로저 단위 —
  research §refresh 공유 메커니즘 참조).
- **응답 타입 품질의 백엔드 의존**: 타입드 client 의 response 타입은 백엔드 OpenAPI 응답 정의에서 도출된다.
  001 에서 87 operations 중 typed 2xx content 는 36건이며 나머지는 응답 본문이 타입 미주석이다(001
  coverage-gap·GAP-001-01). 따라서 일부 엔드포인트는 `api.client.GET(...)` 의 response 타입이 비어 있을 수
  있다. 응답 DTO 보강은 본 차수 범위 외(GAP-003-01 — 001 GAP-001-01 연속).
- **console 마이그레이션 점진**: 003 은 타입드 client 를 추가하고 facade 를 불변 유지하는 비파괴 전환까지다.
  console 페이지의 기존 facade 호출을 `api.client` 로 전환하고 수기 shared-types 타입을 폐기하는 작업은
  후속(Phase 1+, 범위 외). 신규 화면은 facade 추가 없이 `api.client` 를 직접 사용한다.
- **HttpClientOptions deprecated alias**: `http.ts` 의 `HttpClientOptions` 는 `AuthFetchOptions` 의
  `@deprecated` alias 다(동일 타입). 기존 `createApiClient(options: HttpClientOptions)` 호출 호환을 위해
  유지하며, 향후 `AuthFetchOptions` 로 통일 권고.
- **authFetch 단위 테스트 부재**: refresh in-flight 가드·doaAnonymous 분기·buildUrl 보정·`isRetry` 1회
  재시도는 단위 테스트 없이 빌드/타입체크·정적 검토로 갈음했다(인프라 성격). 동시성·엣지 케이스 회귀
  방지를 위한 단위 테스트 추가는 후속 권고다(GAP-003-01).
