---
작성: Docs Agent
버전: v1.0
최종 수정: 2026-06-30 00:40
상태: 확정 (retroactive)
---

# Diff: 003-api-client-typed

## 목차

- [커밋 메시지용 한 줄 요약](#커밋-메시지용-한-줄-요약)
- [변경 요약](#변경-요약)
- [변경 파일 및 라인 수](#변경-파일-및-라인-수)
- [Diff](#diff)

## 커밋 메시지용 한 줄 요약

- **KO**: 003 프론트 Phase 0 완성 — api-client 생성 타입 전환(openapi-fetch 타입드 클라이언트 + 공유 authFetch refresh 일원화)
- **EN**: 003 frontend Phase 0 complete — api-client typed migration (openapi-fetch typed client + shared authFetch refresh consolidation)

## 변경 요약

- **공유 authFetch 추출(FR-001·006)**: `packages/api-client/src/auth-fetch.ts`(신규) — `createAuthFetch(opts):
  typeof fetch`. 토큰 주입(Bearer)·401 자동 refresh(원요청 `isRetry` 1회 재시도)·`refreshing` in-flight
  가드(동시 401 단일 Promise 공유)·`doaAnonymous` 익명 분기·`buildUrl`(절대 URL 통과/상대 baseUrl 보정).
  `TokenStore`·`AuthFetchOptions`·`AuthRequestInit` 정의.
- **HttpClient 위임 리팩토링(FR-004)**: `packages/api-client/src/http.ts` — `HttpClient` 에서 refresh 로직
  제거 → 공유 authFetch 위임. 쿼리 직렬화(`withQuery`)·JSON 본문·`ApiError` 변환·204 처리만 담당. 생성자
  `constructor(opts, authFetch?)` optional 주입. `options.anonymous` → `init.doaAnonymous` 매핑.
- **openapi-fetch 통합 + 공유 인스턴스(FR-005·006·007)**: `packages/api-client/src/index.ts` —
  `createOpenApiClient<paths>({ baseUrl, fetch: authFetch })` 로 전 도메인 70경로 타입드 클라이언트(`client`)
  추가. `createApiClient` 가 `createAuthFetch(options)` 로 authFetch **1개** 생성 → `HttpClient` 와 `client`
  에 공유 주입(refresh 전역 1회 일관). `TypedClient` 타입·`createAuthFetch`·`AuthFetchOptions` 재노출. 기존
  도메인 facade(auth·user·seller·catalog·inventory) 시그니처 불변(비파괴).
- **의존(NFR-005)**: `packages/api-client/package.json` 에 `openapi-fetch ^0.17.0`(dependency) 추가.
  생성 타입 `paths`(001 산출) 소비 타입드 HTTP 클라이언트. AWS/Fly.io 전용 SDK 아님(P-002 무저촉).
- **검증**: `pnpm --filter console typecheck` 0 error · `pnpm --filter console build` 13 라우트 PASS
  (openapi-fetch 번들·타입드 client 컴파일). 기존 facade·refresh 동작 회귀 0. 신규 단위 테스트 0(인프라/
  클라이언트 — 타입체크 + 빌드 + 정적 구조 리뷰로 갈음).
- **해결**: 001 §범위 외 "api-client 의 생성 타입 전면 전환"(GAP-001-01 (3)) 수행 — 전 도메인 70경로
  타입드 클라이언트 제공으로 FRONTEND-PLAN Phase 0(타입 공유) 완성. console 화면 마이그레이션·수기 타입
  폐기·응답 스키마 보강은 후속(GAP-003-01).

## 변경 파일 및 라인 수

> 범위: `packages/api-client`. base `29eb81f`(002 SDD 문서 커밋) → `1671814`(003 완료).
> `git diff --numstat 29eb81f 1671814 -- packages/api-client` 직접 카운트.

| 파일 | 추가 | 삭제 | 비고 |
|---|---|---|---|
| `packages/api-client/src/auth-fetch.ts` (신규) | +98 | -0 | `createAuthFetch`(refresh in-flight 가드·doaAnonymous·buildUrl) |
| `packages/api-client/src/http.ts` | +29 | -82 | HttpClient refresh 제거·공유 authFetch 위임(중복 제거) |
| `packages/api-client/src/index.ts` | +17 | -1 | openapi-fetch `client` 통합·공유 authFetch·`TypedClient` 재노출 |
| `packages/api-client/package.json` | +2 | -1 | `openapi-fetch ^0.17.0` dependency |

**합계 (packages/api-client)**: 4 files changed, 146 insertions(+), 84 deletions(-).

> **부수 변경(spec 코드 범위 외)**: 동일 커밋 `1671814` 에는 `pnpm-lock.yaml`(+15 — `openapi-fetch@0.17.0`
> 추가)도 포함되나, 본 표는 spec 코드 범위(`packages/api-client`)로 한정한다.
>
> 본 003 SDD 문서 세트(`docs/specs/v1.1.0/003-api-client-typed/**`) 와 `DIFF-003`·`CHANGES.md` 003 항목은
> `1671814` 코드 커밋 **이후** retroactive 로 별도 추가된다(코드 diff 범위 외).

## Diff

> 전체 diff 는 본 문서에 박제하지 않는다 — **git 이 형상관리 SoT** 이며 전체 캡처는 중복·문서 비대화를
> 유발한다. 변경 내용은 위 "변경 요약" · "변경 파일 및 라인 수" 절로 추적하고, 라인 단위 diff 가 필요하면
> 아래로 재생성한다:
>
> ```bash
> git diff 29eb81f 1671814 -- packages/api-client   # base commit: 29eb81f
> ```
