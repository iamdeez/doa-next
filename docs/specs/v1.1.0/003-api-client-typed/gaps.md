---
작성: Design Agent → Docs Agent 누적
버전: v1.0
최종 수정: 2026-06-30 00:40
상태: 확정 (retroactive)
---

# Gaps — 003-api-client-typed

> 기획/설계 공백 누적 기록. 3단계 이후 모든 Agent 가 누적.

## 목차

- [신규 GAP](#신규-gap)
- [해결한 선행 설계 공백](#해결한-선행-설계-공백)

---

## 신규 GAP

### GAP-003-01

- **출처**: Design Agent / Test Agent (research·coverage-gap) / Docs Agent
- **유형**: 점진 전환·계약 완성도·테스트 자동화 한계 (Low — 권고) — console 호출 타입드 마이그레이션 미완
  + 응답 스키마 품질(백엔드 의존) + authFetch 단위 테스트 부재
- **컨텍스트**: `apps/console/**`(기존 facade 호출 — 미전환), 백엔드 OpenAPI 응답 정의(87 ops 중 typed
  2xx content 36건 — 001 GAP-001-01 연속), `packages/api-client/src/auth-fetch.ts`(단위 테스트 부재)
- **내용**: (1) **console 호출 타입드 마이그레이션 미완** — 003 은 타입드 client(`api.client`)를 추가하고
  도메인 facade·console 호출을 불변(비파괴) 유지한다. console 페이지의 기존 facade 호출을 `api.client` 로
  전환하고 수기 shared-types 타입을 폐기하는 작업은 후속(Phase 1+)이다. (2) **응답 스키마 품질(백엔드 의존)**
  — 타입드 client 의 response 타입은 백엔드 OpenAPI 응답 정의에서 도출되며, 일부 엔드포인트는 응답 본문이
  타입 미주석이다(87 ops 중 typed 2xx content 36건 — 컨트롤러가 엔티티/원시값 반환, `@ApiResponse({ type })`
  미부여). 003 은 생성 타입의 소비 도구를 제공할 뿐 응답 스키마 품질을 결정하지 않는다. (3) **authFetch
  단위 테스트 부재** — refresh in-flight 가드·doaAnonymous 분기·buildUrl 보정·isRetry 1회 재시도에 대한
  단위 테스트가 없다(인프라 — 빌드/타입체크/정적 리뷰로 갈음).
- **수정 방향**: (1) Phase 1+ 에서 console 화면을 화면 단위로 `api.client`(생성 타입 응답) 호출로 점진
  전환하고 전환 완료 도메인의 수기 facade·수기 타입을 폐기. (2) 백엔드에 도메인별 응답 DTO + `@ApiResponse({
  type })` 보강 후 코드젠 재생성하면 client response 타입 자동 완성(001 GAP-001-01 / FRONTEND-PLAN §8 점진
  보강 정책). (3) vitest 등으로 refresh 동시성(1회 호출)·doaAnonymous(Authorization 미주입·refresh 미호출)·
  buildUrl(절대/상대)·재시도 1회 단위 테스트 추가.
- **영향**: 낮음 — Phase 0 핵심 목표(전 도메인 70경로 타입드 클라이언트 + refresh 전역 1회 공유 + 비파괴
  facade 공존)는 console typecheck 0·build 13 라우트 PASS 로 달성. console 미마이그레이션·응답 타입 부분
  미획득·authFetch 단위 테스트 부재는 점진 보강 대상이며 기존 console 화면은 facade·수기 타입으로 회귀 0.
- **상태**: OPEN — console 마이그레이션·응답 스키마 보강·authFetch 단위 테스트는 Phase 1+ / 백엔드 후속
  차수 위임(Low 권고). coverage-gap.md 와 동일 사안. 001 GAP-001-01(응답 스키마·api-client 전환)의 연속이며,
  api-client 전환 부분은 003 으로 **RESOLVED**(아래 해결 표).

---

## 해결한 선행 설계 공백

| 식별자 | 선행 맥락 | 등급 | 003 해결 | 상태 |
|---|---|---|---|---|
| GAP-001-01 (api-client 전환 부분) | 001 spec.md §범위 외 — "`@doa/api-client` 의 생성 타입 전면 전환"·"수기 facade 18도메인 메서드 정비" | 후속 위임 | `openapi-fetch` `createClient<paths>` 로 전 도메인 70경로 타입드 클라이언트(`api.client`) 추가. 001 생성 타입 `paths` 를 직접 소비. refresh 로직을 `createAuthFetch` 로 추출하여 facade·client 가 동일 authFetch 공유(전역 1회). 기존 facade·console 비파괴 유지 | **RESOLVED (003, 커밋 1671814 — 타입드 client 제공 한정. console 화면 마이그레이션·수기 타입 폐기·응답 스키마 보강은 GAP-003-01 후속)** |

> 001 GAP-001-01 은 (1) 응답 스키마 미주석 (2) 생성물 CI 재생성 검증 (3) api-client 전환 미완의 3건을
> 묶은 항목이었다. 003 은 그중 **(3) api-client 전환** 을 타입드 client 제공 범위에서 해소한다. (1) 응답
> 스키마·console 화면 마이그레이션은 GAP-003-01 로 후속 위임하며, (2) 생성물 CI 재생성 검증은 001
> GAP-001-01 에 그대로 OPEN 유지(003 무관).
