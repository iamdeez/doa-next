---
작성: Design Agent
버전: v1.0
최종 수정: 2026-06-30 01:23
상태: 확정 (retroactive — 전 태스크 구현 완료)
---

# Tasks: 005-order-shipping-gap-fill

> Branch: 005-order-shipping-gap-fill | Date: 2026-06-30 | Plan: [../planning/plan.md](../planning/plan.md)

## 목차

- [전제 조건](#전제-조건)
- [태스크 목록](#태스크-목록)
- [Test Authoring Contract](#test-authoring-contract)
- [구현 완료 기준](#구현-완료-기준)

---

## 전제 조건

- [x] spec.md 의 모든 [NEEDS CLARIFICATION] 항목 해소(미결 사항: 없음)
- [x] plan.md Constitution Gates(P-001~P-007) 통과(예외 0건, 신규 의존 0 — P-002 무저촉)
- [x] CHANGES.md 의 이전 작업(004) "후속 작업 시 주의사항" 확인 — 004 의 BE-GAP 2건(판매자 주문 상세·
      주문→송장 조회 — GAP-004-01 (1)·(2))이 본 차수의 직접 해소 대상. 004 의 "상태 전이는 백엔드 강제"·
      "권한은 백엔드 강제" 가 본 차수 권한 3축·소유 검증 설계의 기준
- [x] 선택 단계: Database Design=N·Deploy=N·**Security=Y**·Performance=N(selection-phases.md)

> A = 데이터(repository)·타입 계약(view 타입), B = 도메인(service)·facade, C = 인터페이스(controller·
> openapi)·화면(console), D = 검증(단위 +6·e2e·typecheck/build). 레이어 A→B→C→D 의존 순.

---

## 태스크 목록

> 레이어: A 데이터·타입 / B 도메인·facade / C 인터페이스·화면 / D 검증(5a/5b).

### Step 1. 데이터·타입 계약 (A)

- [x] **T001** — 주문 기준 송장 조회 repository
  - 레이어: A
  - 구현 파일: `apps/backend/src/modules/shipping/shipping.repository.ts`
  - 관련 요구사항: FR-002
  - 상세: `findByOrderId(orderId)` — `prisma.tx.shipment.findFirst({ where: { orderId }, orderBy: {
    createdAt: 'desc' } })`. 주문당 최신 송장 1건, 미존재 시 `null`.
  - 완료 기준: `findByOrderId` 정의, null 반환 가능.

- [x] **T002** `[P]` — 주문·배송 view 타입 추가
  - 레이어: A
  - 구현 파일: `packages/shared-types/src/index.ts`
  - 관련 요구사항: FR-005, NFR-005
  - 상세: `OrderItemView`(id·productId·sellerId·variantId·unitPrice[string]·quantity)·`SellerOrderDetail`
    (`SellerOrder` 확장 + `items: OrderItemView[]`). 금전 필드 string.
  - 완료 기준: view 타입 2종 정의, 금전 필드 `string`.

### Step 2. 도메인·facade (B)

- [x] **T003** — 권한 3축 헬퍼 추출 + 주문 기준 송장 조회
  - 레이어: B (T001 완료 후)
  - 구현 파일: `apps/backend/src/modules/shipping/shipping.service.ts`
  - 관련 요구사항: FR-001, FR-003, NFR-001, NFR-003
  - 상세: `getTracking` 의 인라인 권한 3축 검증을 `_assertCanViewOrder(userId, orderId)` private 헬퍼로
    추출. `getByOrder(userId, orderId)` 추가 — 헬퍼 검증 후 `findByOrderId` 반환(null 가능). 예외 메시지
    `'Not allowed to view this shipment'` 통일.
  - 완료 기준: `getByOrder`·`_assertCanViewOrder` 정의, `getTracking` 헬퍼 사용으로 리팩토링(동작 불변).

- [x] **T004** — 판매자 단건 주문 상세
  - 레이어: B (T002 완료 후)
  - 구현 파일: `apps/backend/src/modules/order/order.service.ts`
  - 관련 요구사항: FR-004, NFR-002
  - 상세: `getSellerOrderDetail(userId, orderId)` — `getApprovedSeller` → `orderRepository.findById` →
    미존재 404(`NotFoundException`)·items 중 본인 `sellerId` 불일치 시 403(`ForbiddenException`). items
    포함 `OrderWithDetails` 반환.
  - 완료 기준: `getSellerOrderDetail` 정의, 404/403 분기.

- [x] **T005** `[P]` — 도메인 facade 추가
  - 레이어: B (T002 완료 후)
  - 구현 파일: `packages/api-client/src/index.ts`
  - 관련 요구사항: FR-006
  - 상세: `order.getSellerDetail(orderId)`(GET `/seller/orders/:id` → `SellerOrderDetail`)·
    `shipping.getByOrder(orderId)`(GET `/shipments?orderId=` → `Shipment | null`, `{ query: { orderId } }`).
    기존 facade 메서드 불변.
  - 완료 기준: facade 메서드 2종 추가, view 타입 응답 제네릭.

### Step 3. 인터페이스·화면 (C)

- [x] **T006** — 주문 기준 송장 조회 라우트
  - 레이어: C (T003 완료 후)
  - 구현 파일: `apps/backend/src/modules/shipping/shipping.controller.ts`
  - 관련 요구사항: FR-001
  - 상세: `@Get()` `getByOrder(@CurrentUser, @Query('orderId') orderId)` → `shippingService.getByOrder`.
  - 완료 기준: `GET /shipments?orderId=` 등록.

- [x] **T007** — 판매자 단건 주문 상세 라우트
  - 레이어: C (T004 완료 후)
  - 구현 파일: `apps/backend/src/modules/order/seller-order.controller.ts`
  - 관련 요구사항: FR-004
  - 상세: `@Get(':orderId')` `getSellerOrder(@CurrentUser, @Param('orderId'))` → `orderService.
    getSellerOrderDetail`.
  - 완료 기준: `GET /seller/orders/:orderId` 등록.

- [x] **T008** — OpenAPI 재생성
  - 레이어: C (T006·T007 완료 후)
  - 구현 파일: `apps/backend/openapi.json` + `packages/shared-types/src/openapi.gen.ts`(재생성)
  - 관련 요구사항: FR-008
  - 상세: `openapi:gen` 으로 신규 라우트 2개 반영. paths 71(`/shipments` GET·`/seller/orders/{orderId}`).
  - 완료 기준: openapi.json paths 71, 생성 타입 재생성.

- [x] **T009** — console ship 재진입 복구
  - 레이어: C (T005 완료 후)
  - 구현 파일: `apps/console/app/(dashboard)/seller/orders/[id]/ship/page.tsx`
  - 관련 요구사항: FR-007, NFR-003, NFR-004
  - 상세: 진입 시 `shipmentQuery`(`api.shipping.getByOrder`)로 기존 송장 복구 + `orderQuery`
    (`api.order.getSellerDetail`)로 주문 상태·금액 헤더. `shipment = shipmentQuery.data ?? null` 로 등록
    폼/관리 패널 분기. create·updateStatus `onSuccess` 가 `qc.setQueryData(['shipment','byOrder',orderId])`
    캐시 갱신(004 세션 `useState` 대체).
  - 완료 기준: 재진입 시 기존 송장 복구·주문 헤더 표시, setQueryData 갱신.

### Step 4. 검증 (D 레이어 — 5a/5b)

- [x] **T010** — 검증 시나리오 정의 (5a Test Agent AUTHORING)
  - 검증 대상: SC-001(getByOrder 권한·null)·SC-002(getSellerOrderDetail 소유)·SC-003(라우트·openapi)·
    SC-004(view 타입·facade)·SC-005(console 재진입 복구)
  - 산출물: test-cases.md + 단위 테스트(getByOrder 3·getSellerOrderDetail 3 = +6)
  - 신규 단위 테스트 it() **6건**(권한 3축·소유 검증 분기)

- [x] **T011** — 게이트 실행·확인 (5b Test Agent EXECUTION)
  - 실행: `pnpm --filter backend typecheck`(0)·`test`(261, +6)·`test:e2e`(84) / openapi.json paths 71 /
    `pnpm --filter console typecheck`(0)·`build`(14 라우트) / 정적 구조 리뷰
  - 산출물: coverage.md·coverage-gap.md·test-report.md

---

## Test Authoring Contract

> **5a Test Agent(AUTHORING) 입력 contract**. 백엔드 권한·소유 분기는 단위 테스트 +6 으로 검증하며, 라우트
> 등록·openapi·console 재진입은 typecheck/build/e2e + 정적 구조 리뷰로 갈음한다(추측 단언 금지 — 직접 코드
> 리뷰/실행).

### 검증 canonical 대상

| 대상 | canonical 형태 |
|---|---|
| getByOrder 권한·null | `shipping.service.spec.ts` `getByOrder` describe — seller→shipment·buyer+미존재→null·stranger→Forbidden(findByOrderId 미호출) |
| getSellerOrderDetail 소유 | `order.service.spec.ts` `getSellerOrderDetail` describe — owner→order·not_owner→Forbidden·missing→NotFound |
| 헬퍼 추출 | `shipping.service.ts` `_assertCanViewOrder` — `getTracking`·`getByOrder` 공유(동작 불변) |
| repository | `shipping.repository.ts` `findByOrderId` — `findFirst orderBy createdAt desc` |
| 라우트 | `shipping.controller.ts` `@Get()` + `seller-order.controller.ts` `@Get(':orderId')` |
| openapi | `openapi.json` paths 71(`/shipments` GET·`/seller/orders/{orderId}`) |
| view 타입 | `shared-types/index.ts` `OrderItemView`·`SellerOrderDetail`(금전 string) |
| facade | `api-client/index.ts` `order.getSellerDetail`·`shipping.getByOrder`(`Shipment\|null`) |
| console 재진입 | `ship/page.tsx` `getByOrder` 복구 + `getSellerDetail` 헤더 + `setQueryData` |

### SC → 검증 매핑

| SC-ID | 수용 기준 | 검증 방법 | 비고 |
|---|---|---|---|
| SC-001 | getByOrder 권한·null | `shipping.service.spec.ts` 3 케이스 | [env:unit] |
| SC-002 | getSellerOrderDetail 소유 | `order.service.spec.ts` 3 케이스 | [env:unit] |
| SC-003 | 라우트·openapi | backend tsc/e2e + openapi.json paths 71 | [env:typecheck][env:build][env:unit] |
| SC-004 | view 타입·facade | shared-types·api-client 코드 리뷰 | [env:static][env:typecheck] |
| SC-005 | console 재진입 복구 | ship/page.tsx 코드 리뷰 + console typecheck/build | [env:static][env:typecheck][env:build] |

---

## 구현 완료 기준

- [x] 모든 A·B·C 태스크 체크박스 완료(4단계), D 검증 +6 단위 테스트 + 게이트 실행(5a/5b)
- [x] `shipping.repository.ts` — `findByOrderId`(최신 1건, null 가능)
- [x] `shipping.service.ts` — `_assertCanViewOrder` 추출 + `getByOrder` + `getTracking` 리팩토링(동작 불변)
- [x] `order.service.ts` — `getSellerOrderDetail`(items 포함, 404/403)
- [x] `shipping.controller.ts`·`seller-order.controller.ts` — 신규 라우트 2개
- [x] `shared-types/index.ts` — `OrderItemView`·`SellerOrderDetail`(금전 string)
- [x] `api-client/index.ts` — `getSellerDetail`·`getByOrder` facade(기존 facade 불변)
- [x] `openapi.json` paths 71 + `openapi.gen.ts` 재생성
- [x] `ship/page.tsx` — 재진입 복구(getByOrder) + 주문 헤더(getSellerDetail) + setQueryData
- [x] `backend typecheck` 0 · `backend test` 261(+6) · `backend test:e2e` 84 PASS
- [x] `console typecheck` 0 · `console build` 14 라우트 PASS(회귀 0)
- [x] 신규 의존 0(`package.json` 변경 없음 — P-002 무저촉)
- [x] git status 의도치 않은 파일 없음(12파일 변경)
</content>
