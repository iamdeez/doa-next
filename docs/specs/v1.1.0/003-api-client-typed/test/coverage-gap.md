---
작성: Test Agent (EXECUTION)
버전: v1.0
최종 수정: 2026-06-30 00:40
상태: 확정 (retroactive)
---

# Coverage Gap: 003-api-client-typed

## 목차

- [미커버 항목 목록](#미커버-항목-목록)
- [console 호출 타입드 마이그레이션 미완 (상세)](#console-호출-타입드-마이그레이션-미완-상세)
- [응답 스키마 품질 백엔드 의존 (상세)](#응답-스키마-품질-백엔드-의존-상세)
- [authFetch 단위 테스트 부재 (상세)](#authfetch-단위-테스트-부재-상세)
- [신규 단위 테스트 수 기록](#신규-단위-테스트-수-기록)

---

## 미커버 항목 목록

> spec.md SC 중 SC-001·005 는 console typecheck/build 로 직접 커버(PASS), SC-002·003·004 는 정적 구조
> 리뷰로 확인(VERIFIED). 아래는 본 차수 범위 외이거나 테스트 자동화 한계로 검증 대상이 없는 항목이다.

| 항목 | 미커버 시나리오 | 카테고리 | 검증 방법 | 담당 | 비고 |
|---|---|---|---|---|---|
| console 호출 타입드 마이그레이션 | console 페이지의 기존 facade 호출이 타입드 `api.client` 로 미전환 | (3) 기능 미구현(범위 외) | Phase 1+ 화면별 점진 전환 + 수기 타입 폐기 | 후속 차수 | 003 은 client 추가·facade 불변(비파괴)까지 |
| 응답 스키마 품질 | 타입드 client response 타입이 백엔드 OpenAPI 응답 정의에 의존(일부 엔드포인트 미정의) | (3) 기능 미구현(범위 외 — 001 연속) | 도메인별 응답 DTO + `@ApiResponse({ type })` 후속 | 백엔드/후속 차수 | 87 ops 중 typed 2xx content 36건(001 GAP-001-01) |
| authFetch 단위 테스트 | refresh in-flight 가드·doaAnonymous·buildUrl·isRetry 단위 테스트 부재 | (2) 설계(테스트 자동화 한계) | refresh 동시성·익명 분기·URL 보정 단위 테스트 | 후속 차수 | 인프라 — 빌드/타입체크/정적 리뷰로 갈음 |

---

## console 호출 타입드 마이그레이션 미완 (상세)

**현상**: 003 은 `@doa/api-client` 에 타입드 client(`api.client`)를 **추가** 하고 기존 도메인 facade
(auth·user·seller·catalog·inventory)와 console 호출을 **불변(비파괴)** 으로 유지한다. console 페이지의 기존
facade 호출(`api.auth.login` 등)을 타입드 `api.client.GET/POST(...)` 로 전환하는 작업은 포함하지 않는다.

**근본 원인 (범위 분리)**:
- console 회귀 0(NFR-004)을 보장하기 위해 타입드 client 도입과 화면 마이그레이션을 별도 단계로 분리했다
  (spec.md 범위 외). 신규 화면은 facade 추가 없이 `api.client` 를 직접 사용하고, 기존 화면은 facade·수기
  타입으로 정상 동작한다.

**위험도**: 낮음(의도된 범위 분리). 기존 화면은 facade·수기 타입으로 회귀 0(console typecheck 0·build 13
라우트 PASS).

**권장 수정 방향**: Phase 1+ 에서 console 화면을 화면 단위로 `api.client`(`Schemas['...']` 응답 타입) 기반
호출로 점진 전환하고, 전환 완료 도메인의 수기 facade·수기 shared-types 타입을 단계적으로 폐기한다
(GAP-003-01 / 001 GAP-001-01 연속 — 수기 타입 한시 유지 해소).

---

## 응답 스키마 품질 백엔드 의존 (상세)

**현상**: 타입드 client 의 response 타입은 백엔드 OpenAPI 응답 정의에서 도출된다. 001 시점에 87 operations
중 typed 2xx response content 를 가진 것은 36건이며, 나머지 응답 본문은 타입 미주석이다(컨트롤러가 엔티티/
원시값 반환, `@ApiResponse({ type })` 미부여). 따라서 일부 엔드포인트는 `api.client.GET(...)` 의 response
타입이 비어 있거나 불완전할 수 있다.

**근본 원인 (소비 측 한계 — 백엔드 계약 의존)**:
- 003 은 생성 타입 `paths` 의 **소비 도구**(타입드 client)를 제공할 뿐, 생성 타입의 응답 스키마 품질을
  결정하지 않는다. 응답 타입을 완성하려면 백엔드에 응답 DTO + `@ApiResponse({ type })` 를 보강하고 코드젠을
  재생성해야 한다(001 절차).

**위험도**: 낮음. 요청(params·query·body) 타입은 완전하며, 입력 계약 안전성은 003 에서 달성된다. 응답
타입은 부분적으로만 제공되나 client 호출 형태·경로 안전성은 보장된다.

**권장 수정 방향**: 후속 차수에서 도메인별 응답 DTO 를 정의하고 `@ApiResponse({ type })` 로 응답 스키마를
보강(001 GAP-001-01 / FRONTEND-PLAN.md §8 점진 보강 정책). 보강 후 코드젠 재생성하면 client response 타입이
자동 완성된다.

---

## authFetch 단위 테스트 부재 (상세)

**현상**: `createAuthFetch` 의 refresh in-flight 가드(동시 401 단일 Promise 공유)·`doaAnonymous` 분기
(토큰·refresh 생략)·`buildUrl` 보정(절대 통과/상대 절대화)·`isRetry` 1회 재시도(무한 재귀 회피)에 대한
단위 테스트가 없다. 검증은 정적 코드 리뷰 + console 빌드/타입체크로 갈음했다.

**근본 원인 (인프라 성격)**:
- 본 차수는 클라이언트 라이브러리 리팩토링으로, 동작 정합성을 빌드·타입체크·코드 리뷰로 확인했다. 동시성
  (in-flight 가드)·익명 분기·URL 엣지 케이스는 단위 테스트로 회귀 방지하는 것이 이상적이나 본 차수에
  포함하지 않았다.

**위험도**: 낮음. 로직이 단순(클로저 가드·플래그 분기·정규식 보정)하고 console 빌드/타입체크가 통합 수준
회귀를 포착한다. 다만 refresh 동시성 같은 미묘한 경합은 단위 테스트 없이는 회귀 탐지가 어렵다.

**권장 수정 방향**: 후속에 vitest 등으로 (1) 동시 401 → refresh 1회 호출 단언, (2) doaAnonymous → Authorization
미주입·refresh 미호출 단언, (3) buildUrl 절대/상대 케이스, (4) refresh 후 재시도 1회·무한 재귀 부재 단위
테스트를 추가한다(GAP-003-01).

---

## 신규 단위 테스트 수 기록

003 신규 단위 테스트는 **0건**이며, 실제 git diff 를 직접 확인하여 확정했다(자가 보고 신뢰하지 않음):

| 파일 | 003 변경 | 신규 it() |
|---|---|---|
| (변경 파일 전체) | `auth-fetch.ts`(신규)·`http.ts`·`index.ts`·`package.json` — `*.spec.ts`·`*.test.ts` 변경/추가 0 | **0** |

> `git diff 29eb81f 1671814 -- packages/api-client` 에 테스트 파일 변경이 없다. 본 차수는 인프라/클라이언트
> 성격으로 단위 테스트 스위트를 추가하지 않으며, 검증은 console typecheck(0)·build(13 라우트) + 정적 구조
> 리뷰(refresh 추출·공유·익명 분기·buildUrl·facade 불변)로 갈음한다. 본 카운트는 추적 정확성 목적이다.
