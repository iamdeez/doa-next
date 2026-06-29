---
작성: Test Agent (EXECUTION)
버전: v1.0
최종 수정: 2026-06-30 00:40
상태: 확정 (retroactive)
---

# 테스트 실행 결과 — 003-api-client-typed

## 목차

- [실행 요약](#실행-요약)
- [실패 목록](#실패-목록)
- [SC 매핑표 검증](#sc-매핑표-검증)
- [설계 문서 정합성](#설계-문서-정합성)
- [회귀 탐지](#회귀-탐지)

---

## 실행 요약

> 본 retroactive 검증은 003 완료 커밋 `1671814`(base `29eb81f`)에서 main session 이 게이트를 직접
> 재실행·구조 확인했다. 본 차수는 인프라(클라이언트 라이브러리)로 별도 단위 테스트 스위트가 없으며,
> 검증은 타입체크 + console 빌드 + 정적 구조 검증으로 갈음한다.

| 항목 | 결과 (HEAD `1671814`) |
|---|---|
| 실행 일시 | 2026-06-30 00:40 |
| console typecheck | **0 error** (PASS) |
| console build | **13 라우트 PASS** (openapi-fetch 번들·타입드 client 컴파일) |
| 타입드 client | `createOpenApiClient<paths>` `client` 추가(paths 70경로)·`TypedClient` 재노출 |
| 공유 authFetch | `createAuthFetch(options)` 1개 → http·client 공유(refresh in-flight 1회) |
| 익명 분리 | `doaAnonymous` — Authorization 미주입·refresh skip, refresh 가드 밖 직접 fetch |
| URL 보정 | `buildUrl` 절대 통과/상대 절대화(이중 prefix 0) |
| 도메인 facade | auth·user·seller·catalog·inventory 시그니처 **불변** |
| 전체 통과 여부 | **PASS** |
| 신규 단위 테스트 | **0** (인프라/클라이언트 — 타입체크·빌드·정적 갈음) |
| 마이그레이션 | **없음** (DB 스키마 변경 0) |

### 002(`29eb81f`) → 003(`1671814`) 델타

| 항목 | base(`29eb81f`) | 003(`1671814`) | 델타 |
|---|---|---|---|
| api-client 클라이언트 | 수기 도메인 facade(5도메인) + HttpClient(refresh 보유) | + 타입드 client(70경로) + 공유 authFetch | **타입드 client 추가·refresh 추출** |
| refresh 위치 | HttpClient 내부 | `createAuthFetch`(공유 인스턴스) | **추출·일원화(전역 1회)** |
| 생성 타입 소비 | 미소비(facade 수기 제네릭) | `createClient<paths>` 직접 소비 | **001 생성 타입 소비 시작** |
| console typecheck/build | (기존 통과) | (통과 — 회귀 0) | 변화 없음 |
| 신규 의존 | — | `openapi-fetch ^0.17.0` | +1(타입드 HTTP 클라이언트) |

> **신규 단위 0 산정(직접 확인)**: `git diff 29eb81f 1671814 -- packages/api-client` 의 변경 파일은
> `auth-fetch.ts`(신규)·`http.ts`·`index.ts`·`package.json` 4종이며 `*.spec.ts`·`*.test.ts` 변경/추가가
> 0 이다. 인프라/클라이언트 성격으로 단위 테스트 스위트 미추가. `pnpm-lock.yaml` 부수 변경(`openapi-fetch@0.17.0`)은
> spec 코드 범위 외.

### 실행 커맨드

```bash
cd /Users/krystal/workspace/doa/doa-next
pnpm --filter console typecheck            # tsc --noEmit (0 error)
pnpm --filter console build                # 13 라우트 PASS (openapi-fetch 번들·타입드 client 컴파일)
# 변경 라인 카운트
git diff --numstat 29eb81f 1671814 -- packages/api-client   # auth-fetch.ts +98/-0, http.ts +29/-82, index.ts +17/-1, package.json +2/-1
```

---

## 실패 목록

**실패 없음.** console typecheck 0 error, console build 13 라우트 PASS(타입드 client 포함 컴파일), 기존
facade·refresh 동작 회귀 0. 변경 구조(공유 authFetch·타입드 client·익명 분리·URL 보정·HttpClient 위임·
facade 불변)가 spec.md FR-001~007·SC-001~005 와 일치.

---

## SC 매핑표 검증

| SC-ID | 관련 검증 | 통과 여부 |
|---|---|---|
| SC-001 | `index.ts` `createOpenApiClient<paths>` `client`(70경로)·`TypedClient`/`createAuthFetch` 재노출 + console typecheck/build | PASS(typecheck/build) |
| SC-002 | `createApiClient` authFetch 1개 → http·client 공유, `auth-fetch.ts` `refreshing` in-flight 가드 | VERIFIED(static) |
| SC-003 | `doaAnonymous` Authorization 미주입·refresh skip, `doRefresh` 가드 밖 직접 fetch, http.ts `anonymous→doaAnonymous` 매핑 | VERIFIED(static) |
| SC-004 | `buildUrl` 절대 `^https?://` 통과 / 상대 baseUrl 절대화(이중 prefix 0) | VERIFIED(static) |
| SC-005 | `HttpClient` refresh 제거·authFetch 위임, 도메인 facade 시그니처 불변, console typecheck 0·build 13 라우트 | PASS(typecheck/build)/VERIFIED(static) |

---

## 설계 문서 정합성

### plan.md 현행화 점검

- 공유 authFetch — `createAuthFetch`(토큰 주입·refresh in-flight 가드·doaAnonymous·buildUrl) — plan.md
  §핵심 설계 1·ADR-002·FR-001·006·NFR-001 과 일치 ✓
- 익명 분리 — `doaAnonymous`(Authorization 미주입·refresh skip)·refresh 가드 밖 직접 fetch — plan.md §핵심
  설계 2·ADR-003·FR-002·NFR-002 와 일치 ✓
- URL 보정 — `buildUrl`(절대 통과/상대 절대화) — plan.md §핵심 설계 3·ADR-004·FR-003·SC-004 와 일치 ✓
- HttpClient 위임 — refresh 제거·공유 authFetch 위임(쿼리·JSON·ApiError·204)·생성자 `(opts, authFetch?)` —
  plan.md §핵심 설계 4·ADR-005·FR-004 와 일치 ✓
- openapi-fetch 통합 — `createClient<paths>` `client` + authFetch 1개 공유 + `TypedClient`·`createAuthFetch`
  재노출 + facade 불변 — plan.md §핵심 설계 5·ADR-001·006·FR-005·006·007·NFR-003·004 와 일치 ✓
- 의존 — `openapi-fetch ^0.17.0`(AWS 무관) — plan.md Gates P-002·NFR-005 와 일치 ✓

### 발견된 한계·관찰

- **console 호출 마이그레이션 미완**: 003 은 client 추가·facade 불변(비파괴)까지. console 화면 전환·수기
  타입 폐기는 후속(범위 외 — GAP-003-01).
- **응답 스키마 품질 백엔드 의존**: 타입드 client response 타입은 백엔드 OpenAPI 응답 정의 의존(87 ops 중
  typed 2xx content 36건 — 001 GAP-001-01 연속). 응답 DTO 보강은 후속.
- **authFetch 단위 테스트 부재**: refresh 동시성·익명 분기·buildUrl 단위 테스트 없음(인프라 — 빌드/타입체크
  갈음). 후속 권고(GAP-003-01).

### v1.1.0(002) 회귀 확인

- console 화면: 기존 도메인 facade·수기 타입을 불변 유지하므로 타입드 client 도입 후에도 typecheck 0·build
  13 라우트 PASS(회귀 0 — NFR-004·SC-005).
- refresh 동작: HttpClient → 공유 authFetch 위임으로 동작 동등(오히려 facade·client 공유로 전역 1회 일관
  강화 — NFR-001). 기존 401 refresh·재시도 계약 불변.

---

## 회귀 탐지

003 이 추가/변경한 파일 (`git diff 29eb81f 1671814 -- packages/api-client` 기준):
- `packages/api-client/src/auth-fetch.ts`: `createAuthFetch` 팩토리(신규 +98 -0)
- `packages/api-client/src/http.ts`: HttpClient refresh 제거·공유 authFetch 위임(+29 -82)
- `packages/api-client/src/index.ts`: openapi-fetch `client` 통합·공유 authFetch·재노출(+17 -1)
- `packages/api-client/package.json`: `openapi-fetch ^0.17.0` dependency(+2 -1)

기존 도메인 facade(auth·user·seller·catalog·inventory) 시그니처·console 화면 코드 불변 → 회귀 0(console
typecheck 0·build 13 라우트 PASS). 마이그레이션 없음(DB 스키마 변경 0). `pnpm-lock.yaml` 은 의존 추가
부수 변경(`openapi-fetch@0.17.0` — spec 코드 범위 외).
