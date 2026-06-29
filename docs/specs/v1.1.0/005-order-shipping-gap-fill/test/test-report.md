---
작성: Test Agent (EXECUTION)
버전: v1.0
최종 수정: 2026-06-30 01:23
상태: 확정 (retroactive)
---

# 테스트 실행 결과 — 005-order-shipping-gap-fill

## 목차

- [실행 요약](#실행-요약)
- [실패 목록](#실패-목록)
- [SC 매핑표 검증](#sc-매핑표-검증)
- [설계 문서 정합성](#설계-문서-정합성)
- [회귀 탐지](#회귀-탐지)

---

## 실행 요약

> 본 retroactive 검증은 005 완료 커밋 `8b48eb5`(base `8bba04d`)에서 main session 이 게이트를 직접
> 재실행·구조 확인했다. 백엔드 권한·소유 분기는 단위 테스트 +6 으로 검증하며, 라우트 등록·openapi 재생성·
> console 재진입은 typecheck + e2e + console build + 정적 구조 검증으로 갈음한다.

| 항목 | 결과 (HEAD `8b48eb5`) |
|---|---|
| 실행 일시 | 2026-06-30 01:23 |
| backend typecheck | **0 error** (PASS) |
| backend unit | **261 PASS** (25 suites — 004 대비 +6) |
| backend e2e | **84 PASS** (16 suites) |
| openapi paths | **71** (`/shipments` GET 추가·`/seller/orders/{orderId}` 신규) |
| console typecheck | **0 error** (PASS) |
| console build | **14 라우트 PASS** (`/seller/orders/[id]/ship` ƒ 동적) |
| getByOrder 권한·null | `shipping.service.spec.ts` 3 케이스 PASS |
| getSellerOrderDetail 소유 | `order.service.spec.ts` 3 케이스 PASS |
| 권한 헬퍼 추출 | `_assertCanViewOrder` — getTracking·getByOrder 공유(동작 불변) |
| view 타입·facade | `OrderItemView`·`SellerOrderDetail` + `getSellerDetail`·`getByOrder` |
| console 재진입 | `ship/page.tsx` — getByOrder 복구 + getSellerDetail 헤더 + setQueryData |
| 전체 통과 여부 | **PASS** |
| 신규 단위 테스트 | **+6** (getByOrder 3 · getSellerOrderDetail 3) |
| 마이그레이션 | **없음** (DB 스키마 변경 0) |

### 004(`8bba04d`) → 005(`8b48eb5`) 델타

| 항목 | base(`8bba04d`) | 005(`8b48eb5`) | 델타 |
|---|---|---|---|
| 백엔드 라우트 | 주문·배송 기존 | + `GET /shipments?orderId=` + `GET /seller/orders/:orderId` | **신규 라우트 2개** |
| shipping.service 권한 검증 | getTracking 인라인 | `_assertCanViewOrder` 헬퍼 추출·공유 | **인가 단일 지점** |
| backend unit | 255 | 261 | **+6** (getByOrder 3·getSellerOrderDetail 3) |
| openapi paths | 70 | 71 | **+1** (`/seller/orders/{orderId}`; `/shipments` GET 추가) |
| shared-types | 주문·배송 view 타입 7종 | + `OrderItemView`·`SellerOrderDetail` | **view 타입 2종 추가** |
| api-client facade | order(listSeller·confirm)·shipping(create·updateStatus·tracking) | + `getSellerDetail`·`getByOrder` | **facade 2종 추가** |
| console ship | 세션 `useState` 완결(재진입 복구 불가) | `getByOrder` 쿼리 복구 + `getSellerDetail` 헤더 | **재진입 복구 + 주문 컨텍스트** |
| console build 라우트 | 14 | 14 | 0 (ship 페이지 수정 — 라우트 수 불변) |

> **단위 +6 산정(직접 확인)**: `git diff 8bba04d 8b48eb5` 의 테스트 파일 변경은 `shipping.service.spec.ts`
> (+46, getByOrder describe 3 it)·`order.service.spec.ts`(+32, getSellerOrderDetail describe 3 it). 전체
> 261 PASS = 004 시점 255 + 6. main 직접 jest 실행. `package.json` 변경 0(신규 의존 0).

### 실행 커맨드

```bash
cd /Users/krystal/workspace/doa/doa-next
pnpm --filter backend typecheck            # tsc --noEmit (0 error)
pnpm --filter backend test                 # 261 PASS (25 suites, +6)
pnpm --filter backend test:e2e             # 84 PASS (16 suites)
pnpm --filter console typecheck            # tsc --noEmit (0 error)
pnpm --filter console build                # 14 라우트 PASS (/seller/orders/[id]/ship ƒ)
python3 -c "import json,d; ..."            # openapi paths 71
git diff --numstat 8bba04d 8b48eb5 -- apps/backend packages apps/console   # 12 files, +415/-78
```

---

## 실패 목록

**실패 없음.** backend typecheck 0 error·unit 261 PASS(+6)·e2e 84 PASS, console typecheck 0·build 14 라우트
PASS. 신규 단위 테스트 6건(getByOrder 3·getSellerOrderDetail 3) 모두 PASS. 변경 구조(권한 3축 헬퍼 추출·주문
기준 송장 조회·판매자 주문 상세·view 타입·facade·console 재진입 복구)가 spec.md FR-001~008·SC-001~005 와
일치. openapi paths 71(`/shipments` GET·`/seller/orders/{orderId}`).

---

## SC 매핑표 검증

| SC-ID | 관련 검증 | 통과 여부 |
|---|---|---|
| SC-001 | `shipping.service.spec.ts` getByOrder 3 케이스(seller·buyer+null·stranger→403 findByOrderId 미호출) | PASS(unit) |
| SC-002 | `order.service.spec.ts` getSellerOrderDetail 3 케이스(owner·not_owner→403·missing→404) | PASS(unit) |
| SC-003 | 신규 라우트 2개 등록 + openapi 71 paths + backend tsc 0·e2e 84 | PASS(typecheck/build/unit) |
| SC-004 | `shared-types` view 타입 2종(금전 string)·`api-client` getSellerDetail·getByOrder(`Shipment\|null`) | VERIFIED(static)/PASS(typecheck) |
| SC-005 | `ship/page.tsx` getByOrder 복구·getSellerDetail 헤더·setQueryData + console typecheck 0·build 14 | PASS(typecheck/build)/VERIFIED(static) |

---

## 설계 문서 정합성

### plan.md 현행화 점검

- 권한 헬퍼 추출 + getByOrder — `_assertCanViewOrder`·`getByOrder`(null 가능)·`getTracking` 리팩토링 —
  plan.md §핵심 설계 1·ADR-001·002·FR-001·003·NFR-001·003 과 일치 ✓
- 판매자 주문 상세 — `getSellerOrderDetail`(404/403, items 포함) — plan.md §핵심 설계 2·ADR-004·FR-004·
  NFR-002 와 일치 ✓
- view 타입·facade — `OrderItemView`·`SellerOrderDetail`·`getSellerDetail`·`getByOrder` — plan.md §핵심
  설계 3·ADR-006·FR-005·006 과 일치 ✓
- console 재진입 복구 — `getByOrder` 쿼리·`getSellerDetail` 헤더·`setQueryData` — plan.md §핵심 설계 4·
  ADR-005·FR-007 과 일치 ✓
- 주문당 송장 1건 — `findByOrderId findFirst orderBy desc` — plan.md ADR-003·FR-002 와 일치 ✓
- 신규 의존 0 — `package.json` 변경 없음 — plan.md Gates P-002·selection-phases 와 일치 ✓

### 발견된 한계·관찰

- **송장 status e2e 부재**: 권한·소유 분기는 단위 +6 으로 검증, 송장 등록→전이 e2e 미추가(후속 — GAP-005-01).
- **분할배송·주문 items UI**: `findByOrderId` 최신 1건(주문당 1건 가정)·ship 헤더 상태/금액만 표시(범위 외).
- **응답 스키마 한시·낙관적 업데이트**: `SellerOrderDetail` 전이형 view 타입(004 연속)·서버 응답 후 갱신
  (Phase 2 후속 — 범위 외).

### v1.1.0(004) 회귀 확인

- backend: `getTracking` 은 헬퍼 추출 후 동작 불변(기존 테스트 유지). 신규 라우트 2개 **추가**(기존 라우트
  불변). unit 261 PASS(255+6)·e2e 84 PASS·tsc 0 — 회귀 0.
- 공유 패키지: `api-client` 는 facade 2종 **추가**(기존 facade 불변), `shared-types` 는 view 타입 2종 **추가**
  (기존 타입 불변). 비파괴.
- console: ship 페이지 **수정**(세션 state → 쿼리 복구). 기존 화면(목록·상품·계정·관리자) 불변. typecheck 0·
  build 14 라우트 PASS(회귀 0 — NFR-004·SC-005).

---

## 회귀 탐지

005 가 추가/변경한 파일 (`git diff 8bba04d 8b48eb5 -- apps/backend packages apps/console` 기준):
- `apps/backend/src/modules/shipping/shipping.service.ts`: `_assertCanViewOrder` 추출 + `getByOrder`(+16 -5)
- `apps/backend/src/modules/shipping/shipping.repository.ts`: `findByOrderId`(+8 -0)
- `apps/backend/src/modules/shipping/shipping.controller.ts`: `GET /shipments?orderId=`(+10 -0)
- `apps/backend/src/modules/order/order.service.ts`: `getSellerOrderDetail`(+14 -0)
- `apps/backend/src/modules/order/seller-order.controller.ts`: `GET /seller/orders/:orderId`(+9 -0)
- `apps/backend/src/modules/shipping/shipping.service.spec.ts`: getByOrder 3(+46 -0)
- `apps/backend/src/modules/order/order.service.spec.ts`: getSellerOrderDetail 3(+32 -0)
- `apps/backend/openapi.json`: 신규 라우트 2개 재생성(+60 -0)
- `packages/shared-types/src/index.ts`: view 타입 2종(+14 -0)
- `packages/shared-types/src/openapi.gen.ts`: 재생성(+61 -1)
- `packages/api-client/src/index.ts`: facade 2종(+7 -0)
- `apps/console/.../seller/orders/[id]/ship/page.tsx`: 재진입 복구(+138 -72)

기존 백엔드 라우트·공유 패키지 기존 export·console 기존 화면 불변 → 회귀 0(backend unit 261·e2e 84·tsc 0,
console typecheck 0·build 14 라우트 PASS). 마이그레이션 없음(DB 스키마 변경 0). 신규 의존 0(`package.json`
변경 없음). **004 BE-GAP 2건 RESOLVED**.
</content>
