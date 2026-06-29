---
작성: Test Agent (AUTHORING)
버전: v1.0
최종 수정: 2026-06-30 01:23
상태: 확정 (retroactive)
---

# Test Cases: 005-order-shipping-gap-fill

## 목차

- [SC × 시나리오 매트릭스](#sc--시나리오-매트릭스)
- [케이스 상세](#케이스-상세)
- [외부 의존성 명시](#외부-의존성-명시)
- [미커버 항목 (사전 분류)](#미커버-항목-사전-분류)

---

## SC × 시나리오 매트릭스

> 백엔드 권한·소유 분기는 **단위 테스트 +6**(getByOrder 3·getSellerOrderDetail 3)으로 검증한다. 라우트
> 등록·openapi 재생성([env:build])·console 재진입 복구([env:static]/[env:typecheck])는 정적 구조 + 타입체크/
> 빌드/e2e 로 판정한다. 구조는 추측하지 않고 실제 코드/실행을 직접 확인한다.

| SC-ID | 수용 기준 | Happy Path | Edge Case | 검증 대상 | env 태그 |
|---|---|---|---|---|---|
| SC-001 | getByOrder 권한·null | seller→shipment·buyer→shipment | buyer+미존재→null·stranger→403(findByOrderId 미호출) | shipping.service.spec.ts | [env:unit] |
| SC-002 | getSellerOrderDetail 소유 | owner→order | not_owner→403·missing→404 | order.service.spec.ts | [env:unit] |
| SC-003 | 라우트·openapi | 신규 라우트 2개 등록·openapi 71 paths | `/shipments` GET 추가·`/seller/orders/{orderId}` 신규 | controller·openapi.json·backend e2e | [env:typecheck][env:build][env:unit] |
| SC-004 | view 타입·facade | `SellerOrderDetail`·getSellerDetail·getByOrder | `getByOrder` → `Shipment\|null`·금전 string | shared-types·api-client | [env:static][env:typecheck] |
| SC-005 | console 재진입 복구 | 기존 송장 복구·주문 헤더 | 송장 미존재 → 등록 폼·setQueryData 갱신 | ship/page.tsx·console | [env:static][env:typecheck][env:build] |

---

## 케이스 상세

### SC-001 (getByOrder 권한·null)

- 검증 방법: `shipping.service.spec.ts` `getByOrder (주문 기준 송장 조회 — 갭 보강)` describe 3 케이스 실행.
- 확인 사실:
  - `when_seller_then_returns_shipment_or_null`: `getOrderOwnership` → `{ userId: 'customer-1', sellerIds:
    ['seller-1'] }`, `getApprovedSeller` → `{ id: 'seller-1' }`, `findByOrderId` → `SHIPMENT`.
    `getByOrder('seller-user-1','order-1')` → `findByOrderId('order-1')` 호출, `SHIPMENT` 반환.
  - `when_buyer_and_no_shipment_then_null`: 구매자 본인(`customer-1`)·`findByOrderId` → null →
    `getByOrder('customer-1','order-1')` → `null`.
  - `when_stranger_then_ForbiddenException`: `getApprovedSeller` reject(`Seller is not approved`) →
    `getByOrder('stranger-1','order-1')` → `ForbiddenException`, `findByOrderId` **미호출**(권한 실패 시
    repository 접근 차단).

### SC-002 (getSellerOrderDetail 소유)

- 검증 방법: `order.service.spec.ts` `getSellerOrderDetail — 판매자 주문 상세` describe 3 케이스 실행.
- 확인 사실:
  - `when_owner_seller_then_returns_order`: `getApprovedSeller` → `{ id: FIXED_SELLER_ID }`, `findById` →
    `FIXED_ORDER_PENDING` → 주문 반환(`toBe(FIXED_ORDER_PENDING)`).
  - `when_not_owner_then_ForbiddenException`: `getApprovedSeller` → `{ id: FIXED_OTHER_SELLER_ID }`,
    `findById` → `FIXED_ORDER_PENDING`(items 에 본인 sellerId 없음) → `ForbiddenException`.
  - `when_missing_then_NotFoundException`: `findById` → null → `NotFoundException`.

### SC-003 (라우트·openapi)

- 검증 방법: `shipping.controller.ts`·`seller-order.controller.ts` 코드 리뷰 + `openapi.json` 직접 파싱 +
  backend typecheck/e2e.
- 확인 사실:
  - `shipping.controller.ts`: `@Get()` `getByOrder(@CurrentUser, @Query('orderId'))`.
  - `seller-order.controller.ts`: `@Get(':orderId')` `getSellerOrder(@CurrentUser, @Param('orderId'))`.
  - `openapi.json` paths **71개**, `/shipments` 메서드 `['post','get']`, `/seller/orders/{orderId}` 존재
    (`python3 json.load` 직접 확인).
  - `pnpm --filter backend typecheck` 0 error, `test:e2e` 84 PASS.

### SC-004 (view 타입·facade)

- 검증 방법: `shared-types/index.ts`·`api-client/index.ts` 코드 리뷰.
- 확인 사실:
  - `shared-types/index.ts`: `OrderItemView`(`unitPrice: string`·`quantity: number`)·`SellerOrderDetail
    extends SellerOrder { items: OrderItemView[] }`. 주석 "GET /seller/orders/:orderId — 판매자 단건 주문
    상세(items 포함)".
  - `api-client/index.ts`: `order.getSellerDetail: (orderId) => http.get<SellerOrderDetail>(\`/seller/orders/
    ${orderId}\`)`, `shipping.getByOrder: (orderId) => http.get<Shipment | null>('/shipments', { query: {
    orderId } })`.

### SC-005 (console 재진입 복구)

- 검증 방법: `ship/page.tsx` 코드 리뷰 + console typecheck/build.
- 확인 사실:
  - `orderQuery = useQuery(['seller','order',orderId], () => api.order.getSellerDetail(orderId), { enabled:
    isSeller })` — 헤더에 `<Badge tone={ORDER_STATUS_TONE[order.status]}>` + `formatKRW(order.totalAmount)`.
  - `shipmentQuery = useQuery(['shipment','byOrder',orderId], () => api.shipping.getByOrder(orderId), {
    enabled: isSeller })`, `const shipment = shipmentQuery.data ?? null`.
  - 송장 미존재(`!shipmentQuery.isLoading && !shipment`) → 등록 폼. 존재 → `ShipmentPanel`(상태변경,
    delivered 비활성화) + `TrackingPanel`.
  - `create`/`updateStatus` `onSuccess(s)` → `qc.setQueryData(['shipment','byOrder',orderId], s)`.
  - `pnpm --filter console typecheck` 0 error + `pnpm --filter console build` 14 라우트 PASS
    (`/seller/orders/[id]/ship` ƒ 동적).

---

## 외부 의존성 명시

### 도구 / 라이브러리

- 백엔드: NestJS(`@Get`·`@Query`·`@Param`)·Prisma(`prisma.tx.shipment.findFirst`)·jest(단위·e2e).
- console: `@tanstack/react-query`(`useQuery`·`useMutation`·`setQueryData`·`invalidateQueries`)·`@doa/ui`·
  `@doa/api-client`(`api.order.getSellerDetail`·`api.shipping.getByOrder`)·`@doa/shared-types`.
- **신규 의존성 0**(`package.json` 변경 없음).

### 환경 변수

- 별도 환경 변수 불필요. 단위 테스트는 mock(repository·service), e2e 는 기존 테스트 DB 설정 사용.

### 외부 서비스

- 단위 테스트는 repository·service mock 으로 외부 호출 없음. e2e 는 기존 backend e2e 하네스(인메모리/테스트
  DB)에서 실행. openapi paths 검증은 정적 파일 파싱.

---

## 미커버 항목 (사전 분류)

| 항목 | 미커버 사유 | 카테고리 | 권장 검증 방법 |
|---|---|---|---|
| 송장 status 업데이트 e2e | 권한·소유 분기는 단위 +6 으로 검증, 송장 등록→전이 e2e 미추가 | (2) 설계(테스트 자동화 한계) | 백엔드 e2e 로 송장 등록→배송 전이→추적 흐름 후속 |
| 분할배송(주문당 송장 N건) | `findByOrderId` 최신 1건만 반환(주문당 1건 가정) | (3) 기능 미구현(범위 외) | 배열 반환·송장 선택 UI 후속 |
| 주문 items UI 렌더 | `SellerOrderDetail.items` 응답 포함하나 ship 헤더는 상태·금액만 표시 | (3) 기능 미구현(범위 외) | ship 페이지 품목 목록 렌더 후속 |
| 낙관적 업데이트 | console mutation 은 서버 응답 후 setQueryData/invalidate | (3) 기능 미구현(범위 외) | Phase 2 `onMutate` 낙관적 업데이트 + 롤백 테스트 |
| 응답 스키마 보강(생성 타입 대체) | `SellerOrderDetail` 전이형 view 타입 한시(004 연속) | (3) 기능 미구현(백엔드 후속) | 응답 DTO + `@ApiResponse` 보강 후 코드젠 재생성 |
</content>
