---
작성: Test Agent (EXECUTION)
버전: v1.0
최종 수정: 2026-06-30 01:41
상태: 확정 (retroactive)
---

# 테스트 실행 결과 — 006-seller-coupon-settlement-stats

## 목차

- [실행 요약](#실행-요약)
- [실패 목록](#실패-목록)
- [SC 매핑표 검증](#sc-매핑표-검증)
- [설계 문서 정합성](#설계-문서-정합성)
- [회귀 탐지](#회귀-탐지)

---

## 실행 요약

> 본 retroactive 검증은 006 완료 커밋 `1a6d70d`(base `4daca5a`, Phase 2 화면 `1b3ffd1` + 토큰 통일
> `1a6d70d`)에서 main session 이 게이트를 직접 재실행·구조 확인했다. 본 차수는 UI 화면으로 별도 e2e/단위
> 테스트 스위트가 없으며, 검증은 타입체크 + console 빌드 + 정적 구조 검증 + grep(하드코딩 0)으로 갈음한다.

| 항목 | 결과 (HEAD `1a6d70d`) |
|---|---|
| 실행 일시 | 2026-06-30 01:41 |
| console typecheck | **0 error** (PASS) |
| console build | **17 라우트 PASS** (신규 `/seller/stats`·`/seller/settlements`·`/seller/coupons` 포함) |
| 판매 통계 | `stats/page.tsx` — `useQuery(api.stats.seller)` + StatCard 2개(매출·완료주문) |
| 정산 | `settlements/page.tsx` — `useQuery(api.settlement.listMine)` + Table(상태 Badge completed/pending) |
| 쿠폰 | `coupons/page.tsx` — listSeller(items)·생성(validate·invalidate)·발급(targetUserId) |
| view 타입·facade | `shared-types`(8종 view 타입)·`api-client`(stats·settlement·coupon facade) |
| 네비 | `layout.tsx` — "쿠폰"·"정산"·"판매 통계" 3개 추가 |
| 토큰 통일 | console 화면 9개 — 하드코딩 팔레트 **0건**(grep) |
| 전체 통과 여부 | **PASS** |
| 신규 단위/e2e 테스트 | **0** (UI 화면 — 타입체크·빌드·정적·grep 갈음) |
| 마이그레이션 | **없음** (DB 스키마 변경 0) |

### 005(`4daca5a` 직전 상태) → 006(`1a6d70d`) 델타

| 항목 | base(`4daca5a`) | 006(`1a6d70d`) | 델타 |
|---|---|---|---|
| 판매자 영역 화면 | 상품·주문·배송 | + 판매 통계 + 정산 + 쿠폰 | **운영 화면 3개 추가** |
| api-client facade | …·order·shipping | + stats·settlement·coupon | **통계·정산·쿠폰 facade 추가** |
| shared-types | 생성 타입 + 기존 view 타입 | + 통계·정산·쿠폰 view 타입 8종 | **전이형 view 타입 추가** |
| AppShell 네비 | 내 상품·주문·배송 | + 쿠폰·정산·판매 통계 | **네비 3개 추가** |
| console 화면 토큰 | 화면 페이지 하드코딩 팔레트 잔존 | 시맨틱 토큰(하드코딩 0) | **9개 페이지 토큰 통일** |
| console build 라우트 | 14 | 17 | +3 (신규 stats·settlements·coupons) |

> **신규 단위/e2e 0 산정(직접 확인)**: `git diff 4daca5a 1a6d70d -- apps/console packages` 의 변경 파일은
> 화면 3·`layout.tsx`·`api-client/index.ts`·`shared-types/index.ts`·기존 화면 9 = 15종이며 `*.spec.ts`·
> `*.test.ts`·`*.e2e.ts` 변경/추가가 0 이다. UI 화면 성격으로 테스트 스위트 미추가. `package.json` 변경
> 0(신규 의존 0).

### 실행 커맨드

```bash
cd /Users/krystal/workspace/doa/doa-next
pnpm --filter console typecheck            # tsc --noEmit (0 error)
pnpm --filter console build                # 17 라우트 PASS (신규 stats·settlements·coupons)
grep -rE "(zinc|red|amber|green|slate|gray)-[0-9]{2,3}|bg-white" apps/console/app   # 0건
git diff --numstat 4daca5a 1a6d70d -- apps/console packages   # 15 files, +503/-51
```

---

## 실패 목록

**실패 없음.** console typecheck 0 error, console build 17 라우트 PASS(신규 `/seller/stats`·
`/seller/settlements`·`/seller/coupons` 포함), 기존 화면(상품·계정·관리자·주문·배송) 동작 회귀 0. console
화면 하드코딩 팔레트 grep 0건. 변경 구조(통계·정산·쿠폰 화면·view 타입·stats/settlement/coupon facade·네비·
토큰 통일)가 spec.md FR-001~009·SC-001~006 과 일치.

---

## SC 매핑표 검증

| SC-ID | 관련 검증 | 통과 여부 |
|---|---|---|
| SC-001 | `stats/page.tsx` StatCard 2개·formatKRW + console typecheck/build(`/seller/stats`) | PASS(typecheck/build) |
| SC-002 | `settlements/page.tsx` Table·상태 Badge(completed/pending)·formatKRW + console build | PASS(typecheck/build) |
| SC-003 | `coupons/page.tsx` listSeller(items)·`validate`·createSeller invalidate + console build(`/seller/coupons`) | VERIFIED(static)/PASS(typecheck/build) |
| SC-004 | `coupons/page.tsx` IssueCouponDialog issueSeller·성공 문구·비활성화 | VERIFIED(static) |
| SC-005 | `shared-types` view 타입 8종(금전 string)·`api-client` stats·settlement·coupon facade | VERIFIED(static)/PASS(typecheck) |
| SC-006 | `layout.tsx` 네비 3개·console 화면 하드코딩 0(grep) + console typecheck 0·build 17 라우트 | PASS(typecheck/build)/VERIFIED(static) |

---

## 설계 문서 정합성

### plan.md 현행화 점검

- 판매 통계 — `useQuery(api.stats.seller)`·StatCard 2개 — plan.md §핵심 설계 1·ADR-005·FR-001·NFR-001 과
  일치 ✓
- 정산 — `api.settlement.listMine`·Table·상태 Badge(completed/pending) — plan.md §핵심 설계 2·FR-002 과
  일치 ✓
- 쿠폰 목록+생성+발급 — `api.coupon.listSeller/createSeller/issueSeller`·Radix Dialog·`validate`·invalidate
  — plan.md §핵심 설계 3·ADR-003·004·FR-003·004·005·NFR-002·004 와 일치 ✓
- view 타입·facade — view 타입 8종(금전 string)·stats/settlement/coupon facade — plan.md §핵심 설계 4·
  ADR-001·002·FR-006·007 과 일치 ✓
- 네비·토큰 통일 — 네비 3개·하드코딩 팔레트 0 — plan.md §핵심 설계 5·ADR-007·FR-008·009·NFR-003 과 일치 ✓
- 신규 의존 0 — `package.json` 변경 없음 — plan.md Gates P-002·selection-phases 와 일치 ✓

### 발견된 한계·관찰

- **e2e 부재**: UI 화면이나 e2e/단위 테스트 없음(빌드/타입체크/정적/grep 갈음). 후속 권고(GAP-006-01).
- **쿠폰 후속 미구현**: cursor '더보기'·발급 후 목록 invalidate·서버 에러 필드 매핑·낙관적 업데이트 미적용
  (범위 외 — GAP-006-01). 현재 클라이언트 검증(010 정합)·생성 invalidate 로 기본 안전성 확보.
- **응답 view 타입 한시**: 통계·정산·쿠폰 응답 OpenAPI 미정의 → 전이형 view 타입(금전 string). 백엔드 응답
  DTO 보강 후 생성 타입 대체(004 GAP-004-01 / 001 GAP-001-01 연속 — GAP-006-01).

### v1.1.0(004·005) 회귀 확인

- console 화면: 기존 화면(상품·계정·관리자·주문·배송)은 동작 불변이며 신규 화면 3개 추가 + 9개 페이지
  토큰 클래스명 교체(구조·props 불변)로 typecheck 0·build 17 라우트 PASS(회귀 0 — NFR-006·SC-006).
- 공유 패키지: `api-client` 는 stats·settlement·coupon facade **추가**(기존 facade·client·http 불변),
  `shared-types` 는 view 타입 **추가**(기존 타입 불변), `@doa/ui`·`@doa/design-tokens` **변경 0**. 비파괴.

---

## 회귀 탐지

006 이 추가/변경한 파일 (`git diff 4daca5a 1a6d70d -- apps/console packages` 기준):
- `apps/console/app/(dashboard)/seller/coupons/page.tsx`: 쿠폰 목록·생성·발급(신규 +235 -0)
- `apps/console/app/(dashboard)/seller/settlements/page.tsx`: 정산 Table(신규 +78 -0)
- `apps/console/app/(dashboard)/seller/stats/page.tsx`: 판매 통계 StatCard(신규 +36 -0)
- `packages/shared-types/src/index.ts`: view 타입 8종(+70 -0)
- `packages/api-client/src/index.ts`: stats·settlement·coupon facade(+30 -0)
- `apps/console/app/(dashboard)/layout.tsx`: 네비 3개(+3 -0)
- 기존 화면 9개(login·dashboard·account/profile·addresses·wishlist·seller/products·products/[id]·
  products/new·register): 하드코딩 팔레트 → 시맨틱 토큰(+49 -51, 클래스명 교체)

기존 console 화면 동작·공유 패키지 기존 export 불변 → 회귀 0(console typecheck 0·build 17 라우트 PASS).
console 화면 하드코딩 팔레트 grep 0건. 마이그레이션 없음(DB 스키마 변경 0). 신규 의존 0(`package.json` 변경
없음).
