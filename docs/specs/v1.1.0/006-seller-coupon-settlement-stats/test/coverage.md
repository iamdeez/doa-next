---
작성: Test Agent (EXECUTION)
버전: v1.0
최종 수정: 2026-06-30 01:41
상태: 확정 (retroactive)
---

# Coverage: 006-seller-coupon-settlement-stats

## 목차

- [실행 요약](#실행-요약)
- [SC × 시나리오 커버리지 매트릭스](#sc--시나리오-커버리지-매트릭스)
- [커버리지 요약](#커버리지-요약)
- [STALE_SC 경고](#stale_sc-경고)

---

## 실행 요약

> 본 retroactive 검증은 006 완료 커밋 `1a6d70d`(base `4daca5a`, Phase 2 화면 `1b3ffd1` + 토큰 통일
> `1a6d70d`) 기준으로 main session 이 게이트를 직접 재실행·구조 확인한 결과다. 본 차수는 UI 화면으로 별도
> e2e/단위 테스트 스위트가 없으며, SC 는 **타입체크 + console 빌드 + 정적 구조 검증**으로 판정한다.

| 항목 | 본 retroactive 검증 (HEAD `1a6d70d`) |
|---|---|
| console typecheck | **0 error** (`pnpm --filter console typecheck` — main 검증) |
| console build | **17 라우트 PASS** (신규 `/seller/stats`·`/seller/settlements`·`/seller/coupons` 포함 — main 검증) |
| 판매 통계 | `stats/page.tsx` — `useQuery(api.stats.seller)` + StatCard 2개(매출 formatKRW·완료주문) |
| 정산 | `settlements/page.tsx` — `useQuery(api.settlement.listMine)` + Table(상태 Badge completed/pending) |
| 쿠폰 목록+생성+발급 | `coupons/page.tsx` — `listSeller`(items)·`CreateCouponDialog`(validate·invalidate)·`IssueCouponDialog` |
| view 타입 | `shared-types/index.ts` — 8종(`SellerStats`·`SettlementView`·`Coupon`·`UserCoupon` 등, 금전 string) |
| facade | `api-client/index.ts` — stats·settlement·coupon 5종(`api.http` 기반) |
| 네비 | `layout.tsx` — "쿠폰"·"정산"·"판매 통계" 3개 추가 |
| 토큰 통일 | console 화면 9개 — 하드코딩 팔레트 **0건**(grep `zinc/red/amber/green-NN`·`bg-white`) |
| 신규 단위/e2e 테스트 | **0** (UI 화면 — 타입체크·빌드·정적 갈음) |
| 마이그레이션 | **없음** (DB 스키마 변경 0) |
| 신규 의존 | **0** (`package.json` 변경 없음) |

> **신규 단위/e2e 0 산정 근거(사실 기준)**: 006 git diff(`git diff 4daca5a 1a6d70d -- apps/console packages`)의
> 변경 파일 15종(화면 3·`layout.tsx`·`api-client/index.ts`·`shared-types/index.ts`·기존 화면 9)에
> `*.spec.ts`·`*.test.ts`·`*.e2e.ts` 변경/추가가 0 이다. 검증은 console typecheck/build + 정적 구조 리뷰 +
> grep(하드코딩 0)으로 갈음한다.

### 변경 라인 직접 카운트 (자가 보고 비신뢰)

| 파일 | 추가 | 삭제 | 방법 |
|---|---|---|---|
| `apps/console/.../seller/coupons/page.tsx`(신규) | 235 | 0 | `git diff --numstat 4daca5a 1a6d70d` |
| `apps/console/.../seller/settlements/page.tsx`(신규) | 78 | 0 | 동일 |
| `packages/shared-types/src/index.ts` | 70 | 0 | 동일(view 타입 8종) |
| `apps/console/.../seller/stats/page.tsx`(신규) | 36 | 0 | 동일 |
| `packages/api-client/src/index.ts` | 30 | 0 | 동일(stats·settlement·coupon facade) |
| `apps/console/.../seller/products/[id]/page.tsx` | 16 | 16 | 동일(토큰) |
| `apps/console/.../account/addresses/page.tsx` | 8 | 8 | 동일(토큰) |
| `apps/console/.../account/wishlist/page.tsx` | 7 | 7 | 동일(토큰) |
| `apps/console/.../seller/products/page.tsx` | 7 | 7 | 동일(토큰) |
| `apps/console/.../account/profile/page.tsx` | 3 | 3 | 동일(토큰) |
| `apps/console/.../dashboard/page.tsx` | 3 | 3 | 동일(토큰) |
| `apps/console/app/login/page.tsx` | 3 | 3 | 동일(토큰) |
| `apps/console/app/(dashboard)/layout.tsx` | 3 | 0 | 동일(네비 3개) |
| `apps/console/.../seller/products/new/page.tsx` | 2 | 2 | 동일(토큰) |
| `apps/console/.../seller/register/page.tsx` | 2 | 2 | 동일(토큰) |

**합계**: 15 files changed, 503 insertions(+), 51 deletions(-).

### 실행 커맨드

```bash
pnpm --filter console typecheck          # tsc --noEmit (0 error)
pnpm --filter console build              # 17 라우트 PASS (신규 stats·settlements·coupons 포함)
grep -rE "(zinc|red|amber|green|slate|gray)-[0-9]{2,3}|bg-white" apps/console/app   # 0건
git diff --numstat 4daca5a 1a6d70d -- apps/console packages   # 변경 라인 카운트
```

---

## SC × 시나리오 커버리지 매트릭스

| SC-ID | 수용 기준 | 케이스 | 상태 |
|---|---|---|---|
| SC-001 | 통계 StatCard·금전 | stats/page.tsx + console typecheck/build | PASS(typecheck/build) |
| SC-002 | 정산 Table·상태 Badge | settlements/page.tsx + console typecheck/build | PASS(typecheck/build) |
| SC-003 | 쿠폰 목록+생성(검증·invalidate) | coupons/page.tsx 리뷰 + console build | VERIFIED(static)/PASS(typecheck/build) |
| SC-004 | 쿠폰 발급 | coupons/page.tsx IssueCouponDialog 리뷰 | VERIFIED(static) |
| SC-005 | view 타입·facade | shared-types·api-client 리뷰 | VERIFIED(static)/PASS(typecheck) |
| SC-006 | 네비·토큰·회귀 0 | layout·9화면 grep + console typecheck/build | PASS(typecheck/build)/VERIFIED(static) |

---

## 커버리지 요약

| 항목 | 수 |
|---|---|
| 전체 SC | 6 (통계 1 + 정산 1 + 쿠폰 목록/생성 1 + 쿠폰 발급 1 + view 타입/facade 1 + 네비/토큰 1) |
| PASS (타입체크·빌드 직접) | 3 (SC-001·002·006) |
| VERIFIED (정적 구조 검증) | 2 (SC-004·SC-005 — 발급 분기·view 타입/facade 코드 리뷰) |
| PASS+VERIFIED 혼합 | 1 (SC-003 — 검증/invalidate 정적 + 라우트 컴파일) |
| GAP | 0 (단, e2e 부재·쿠폰 더보기·발급 후 목록 갱신·서버 에러 표면·낙관적 업데이트는 coverage-gap.md·GAP-006-01 참조) |

> SC-001(통계)·SC-002(정산)·SC-006(네비·토큰·회귀 0)는 console typecheck/build + grep 으로 직접 PASS,
> SC-003(쿠폰 목록+생성)은 검증·invalidate 정적 리뷰 + 라우트 컴파일, SC-004(쿠폰 발급)·SC-005(view 타입·
> facade)는 정적 구조 리뷰로 확인(VERIFIED). 모든 SC 가 충족되며, e2e 부재·쿠폰 더보기·발급 후 목록 갱신·
> 서버 에러 표면·낙관적 업데이트는 Low 잔여 권고다(GAP-006-01). Phase 2 핵심 목표(판매자 매출 확인·정산
> 조회·쿠폰 생성/발급 화면 + console 디자인 토큰 전면 통일)는 console typecheck 0·build 17 라우트 PASS·
> 하드코딩 팔레트 0 으로 달성.

---

## STALE_SC 경고

STALE_SC 검출 결과: **0건**

검출 대상: 006 git diff(`git diff 4daca5a 1a6d70d -- apps/console packages`) 변경 파일. 변경 파일에 테스트
SC 번호를 포함한 `*.spec.ts`·`*.test.ts`·`*.e2e.ts` 가 없고(UI 화면), SC 판정은 본 coverage.md·test-cases.md
가 정적 구조 리뷰 + console typecheck/build + grep(하드코딩 0)으로 담당한다. semantic mismatch 없음.
