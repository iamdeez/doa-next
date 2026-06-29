---
작성: Test Agent (EXECUTION)
버전: v1.0
최종 수정: 2026-06-30 01:23
상태: 확정 (retroactive)
---

# Coverage: 005-order-shipping-gap-fill

## 목차

- [실행 요약](#실행-요약)
- [SC × 시나리오 커버리지 매트릭스](#sc--시나리오-커버리지-매트릭스)
- [커버리지 요약](#커버리지-요약)
- [STALE_SC 경고](#stale_sc-경고)

---

## 실행 요약

> 본 retroactive 검증은 005 완료 커밋 `8b48eb5`(base `8bba04d`) 기준으로 main session 이 게이트를 직접
> 재실행·구조 확인한 결과다. 백엔드 권한·소유 분기는 단위 테스트 +6 으로 검증하며, 라우트 등록·openapi 재생성·
> console 재진입은 typecheck/build/e2e + 정적 구조 검증으로 판정한다.

| 항목 | 본 retroactive 검증 (HEAD `8b48eb5`) |
|---|---|
| backend typecheck | **0 error** (`pnpm --filter backend typecheck` — main 직접 실행) |
| backend unit | **261 PASS** (`pnpm --filter backend test` — 25 suites, 004 대비 **+6**) |
| backend e2e | **84 PASS** (`pnpm --filter backend test:e2e` — 16 suites) |
| openapi paths | **71** (`/shipments` GET 추가·`/seller/orders/{orderId}` 신규 — `json.load` 직접 확인) |
| console typecheck | **0 error** (`pnpm --filter console typecheck` — main 직접 실행) |
| console build | **14 라우트 PASS** (`/seller/orders/[id]/ship` ƒ 동적 — main 직접 실행) |
| getByOrder 권한 | `shipping.service.spec.ts` 3 케이스(seller·buyer+null·stranger) PASS |
| getSellerOrderDetail 소유 | `order.service.spec.ts` 3 케이스(owner·not_owner·missing) PASS |
| 권한 헬퍼 추출 | `_assertCanViewOrder` — getTracking·getByOrder 공유(동작 불변, 회귀 0) |
| view 타입·facade | `OrderItemView`·`SellerOrderDetail` + `getSellerDetail`·`getByOrder` facade |
| console 재진입 | `ship/page.tsx` — `getByOrder` 복구 + `getSellerDetail` 헤더 + `setQueryData` |
| 신규 단위 테스트 | **+6** (getByOrder 3 · getSellerOrderDetail 3) |
| 마이그레이션 | **없음** (DB 스키마 변경 0) |
| 신규 의존 | **0** (`package.json` 변경 없음) |

> **단위 +6 산정 근거(사실 기준)**: `git diff 8bba04d 8b48eb5` 의 `shipping.service.spec.ts`(+46, getByOrder
> describe 3 it)·`order.service.spec.ts`(+32, getSellerOrderDetail describe 3 it). 두 spec 파일 단독 실행
> 46 PASS(기존 40 + 신규 6), 전체 261 PASS(004 시점 255 + 6). main 직접 jest 실행으로 확인.

### 변경 라인 직접 카운트 (자가 보고 비신뢰)

| 파일 | 추가 | 삭제 | 방법 |
|---|---|---|---|
| `apps/console/.../seller/orders/[id]/ship/page.tsx` | 138 | 72 | `git diff --numstat 8bba04d 8b48eb5` |
| `packages/shared-types/src/openapi.gen.ts` | 61 | 1 | 동일(재생성) |
| `apps/backend/openapi.json` | 60 | 0 | 동일(재생성) |
| `apps/backend/.../shipping/shipping.service.spec.ts` | 46 | 0 | 동일(getByOrder 3) |
| `apps/backend/.../order/order.service.spec.ts` | 32 | 0 | 동일(getSellerOrderDetail 3) |
| `apps/backend/.../shipping/shipping.service.ts` | 16 | 5 | 동일(헬퍼 추출 + getByOrder) |
| `apps/backend/.../order/order.service.ts` | 14 | 0 | 동일(getSellerOrderDetail) |
| `packages/shared-types/src/index.ts` | 14 | 0 | 동일(view 타입 2종) |
| `apps/backend/.../shipping/shipping.controller.ts` | 10 | 0 | 동일(GET getByOrder) |
| `apps/backend/.../order/seller-order.controller.ts` | 9 | 0 | 동일(GET getSellerOrder) |
| `apps/backend/.../shipping/shipping.repository.ts` | 8 | 0 | 동일(findByOrderId) |
| `packages/api-client/src/index.ts` | 7 | 0 | 동일(facade 2종) |

**합계**: 12 files changed, 415 insertions(+), 78 deletions(-).

### 실행 커맨드

```bash
pnpm --filter backend typecheck     # tsc --noEmit (0 error)
pnpm --filter backend test          # 261 PASS (25 suites, +6)
pnpm --filter backend test:e2e      # 84 PASS (16 suites)
pnpm --filter console typecheck     # tsc --noEmit (0 error)
pnpm --filter console build         # 14 라우트 PASS (/seller/orders/[id]/ship ƒ)
python3 -c "import json; print(len(json.load(open('apps/backend/openapi.json'))['paths']))"   # 71
git diff --numstat 8bba04d 8b48eb5 -- apps/backend packages apps/console   # 12 files, +415/-78
```

---

## SC × 시나리오 커버리지 매트릭스

| SC-ID | 수용 기준 | 케이스 | 상태 |
|---|---|---|---|
| SC-001 | getByOrder 권한·null | `shipping.service.spec.ts` 3 케이스 | PASS(unit) |
| SC-002 | getSellerOrderDetail 소유 | `order.service.spec.ts` 3 케이스 | PASS(unit) |
| SC-003 | 라우트·openapi | controller 등록 + openapi 71 paths + backend tsc/e2e | PASS(typecheck/build/unit) |
| SC-004 | view 타입·facade | shared-types·api-client 코드 리뷰 | VERIFIED(static)/PASS(typecheck) |
| SC-005 | console 재진입 복구 | ship/page.tsx 리뷰 + console typecheck/build | VERIFIED(static)/PASS(typecheck/build) |

---

## 커버리지 요약

| 항목 | 수 |
|---|---|
| 전체 SC | 5 (getByOrder 권한 1 + getSellerOrderDetail 소유 1 + 라우트·openapi 1 + view 타입·facade 1 + console 재진입 1) |
| PASS (단위·빌드 직접) | 3 (SC-001·002·003 — 단위 +6·openapi·e2e/tsc) |
| VERIFIED (정적 + 타입체크/빌드) | 2 (SC-004·005 — view 타입·facade·console 재진입 코드 리뷰 + typecheck/build) |
| GAP | 0 (단, 송장 status e2e·분할배송·주문 items UI·낙관적 업데이트는 coverage-gap.md·GAP-005-01 참조) |

> SC-001(getByOrder 권한)·SC-002(getSellerOrderDetail 소유)는 신규 단위 테스트 +6 으로 직접 PASS, SC-003
> (라우트·openapi)은 openapi 71 paths·backend e2e 84·tsc 0 으로 PASS, SC-004(view 타입·facade)·SC-005
> (console 재진입)은 정적 구조 리뷰 + typecheck/build 로 확인(VERIFIED/PASS). 모든 SC 가 충족되며, 송장
> status e2e·분할배송·주문 items UI·낙관적 업데이트는 Low~Medium 잔여 권고다(GAP-005-01). **004 의 BE-GAP
> 2건(판매자 주문 상세·주문→송장 조회)이 RESOLVED**.

---

## STALE_SC 경고

STALE_SC 검출 결과: **0건**

검출 대상: 005 git diff(`git diff 8bba04d 8b48eb5 -- apps/backend packages apps/console`) 변경 파일. 신규
단위 테스트(getByOrder 3·getSellerOrderDetail 3)는 SC-001·002 와 의미 정합(권한 3축·소유 검증). 테스트 표제
(`갭 보강`)와 검증 대상(주문→송장 조회·판매자 주문 상세)이 spec FR-001·004 와 일치. semantic mismatch 없음.
</content>
