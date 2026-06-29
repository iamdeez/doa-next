---
작성: Spec Agent
버전: v1.0
최종 수정: 2026-06-30 01:23
상태: 확정 (구현 완료 — retroactive 문서화)
---

# Spec: 005-order-shipping-gap-fill

> Branch: 005-order-shipping-gap-fill | Date: 2026-06-30 | Version: v1.1.0
>
> 본 문서는 이미 구현·검증이 완료된 코드(커밋 `8b48eb5`, base `8bba04d`)를 근거로 정식 SDD 포맷으로
> retroactive 작성되었다. 모든 요구사항·수용 기준은 실제 구현된 백엔드(`shipping.service.ts`·
> `shipping.repository.ts`·`shipping.controller.ts`·`order.service.ts`·`seller-order.controller.ts`)·
> 공유 패키지(`@doa/shared-types`·`@doa/api-client`)·console(`seller/orders/[id]/ship/page.tsx`)·
> 백엔드 단위/e2e 테스트(`shipping.service.spec.ts`·`order.service.spec.ts`)에서 확인한 사실을 기준으로
> 한다. **004 에서 발견·기록된 백엔드 계약 공백(BE-GAP 2건 — GAP-004-01)을 해소** 하여, 004 가 세션 state
> 한계로 미루었던 ship 화면 재진입 복구를 가능케 한다.

## 목차

- [배경 및 목적](#배경-및-목적)
- [사용자 스토리](#사용자-스토리)
- [기능 요구사항](#기능-요구사항)
- [비기능 요구사항](#비기능-요구사항)
- [수용 기준](#수용-기준)
- [요구사항 구조화 매트릭스](#요구사항-구조화-매트릭스)
- [선행 spec 영향 추적](#선행-spec-영향-추적)
- [범위 외](#범위-외)
- [미결 사항](#미결-사항)

---

## 배경 및 목적

004(판매자 주문·배송 화면)는 판매자 주문 이행 흐름(주문 확인 → 송장 등록(발송) → 배송 전이 → 추적)을 console
에 처음 올렸으나, 백엔드 계약 공백 2건으로 **ship 화면이 세션 내에서만 완결** 되는 한계를 남겼다(004 gaps.md
GAP-004-01). 005 는 그 2건의 BE-GAP 을 백엔드에 신규 라우트로 보강하고, console ship 페이지를 재진입 복구가
동작하도록 전환한다.

- **004 BE-GAP (1) — 판매자용 단건 주문 조회 부재**: `GET /orders/:id` 는 구매자 스코프이므로 ship 페이지가
  판매자 권한으로 주문 상세(상태·금액·items)를 직접 가져올 수 없었다. ship 페이지는 `useParams` 의 orderId
  만 사용해, 어떤 주문인지에 대한 컨텍스트(상태·결제금액·품목)를 화면에 표시하지 못했다.

- **004 BE-GAP (2) — 주문→송장 조회 부재**: `GET /shipments?orderId` 또는 주문 응답에 shipment 포함이 없어,
  이미 발송된 주문에 ship 페이지로 **재진입** 하면 기존 송장 id 를 복구할 수 없었다. 004 는 송장 등록 직후
  세션 state(`useState`)의 shipment 로 상태변경·추적이 동작했으나(세션 내 완결), 페이지를 떠났다가 재진입하면
  배송 상태를 이어 관리할 수 없었고, 재등록 시도는 백엔드가 400(주문이 preparing 아님)으로 거부했다.

005 는 이 공백을 (1) 백엔드 `GET /seller/orders/:orderId`(판매자 단건 주문 상세, items 포함, 본인 소유
검증 — 미존재 404·비소유 403)와 `GET /shipments?orderId=`(주문 기준 송장 조회, 권한 3축[구매자/판매자],
미존재 null) 두 라우트를 추가하고, (2) 그 과정에서 `shipping.service` 의 권한 3축 검증을 `_assertCanViewOrder`
헬퍼로 추출해 `getTracking`·`getByOrder` 가 공유하도록 리팩토링하며(중복 제거), (3) `@doa/shared-types` 에
`SellerOrderDetail`·`OrderItemView` view 타입과 `@doa/api-client` 에 `order.getSellerDetail`·
`shipping.getByOrder` facade 를 추가하고, (4) console ship 페이지가 진입 시 `getByOrder`(useQuery)로 기존
송장을 복구하고 `getSellerDetail` 로 주문 상태·금액 헤더를 표시하도록 전환하는 방식으로 해소한다.

> 설계 결정(004 연속): 004 가 남긴 GAP-004-01 의 BE-GAP 2건이 본 차수의 직접 배경이다. 응답 스키마는 여전히
> 전이형 view 타입(`SellerOrderDetail` — 금전 string)으로 정의하나(004 와 동일한 한시 전략), 신규 라우트로
> ship 재진입 복구·주문 컨텍스트 표시를 달성한다. 송장 status 업데이트 e2e·낙관적 업데이트·분할배송(주문당
> 송장 N건)은 후속(범위 외).

---

## 사용자 스토리

- **US-001**: 판매자로서, 이미 송장을 등록한 주문의 ship 화면에 **재진입** 했을 때 기존 송장 상태(배송중/
  배송완료)와 추적 이력을 그대로 이어서 보고 관리하기를 원한다(세션을 떠났다 와도).
- **US-002**: 판매자로서, ship 화면에서 지금 다루는 주문이 어떤 주문인지(상태·결제금액)를 헤더로 확인하기를
  원한다.
- **US-003**: 구매자/판매자로서, 내가 권한을 가진 주문의 송장만 조회되고 무관한 주문의 송장은 차단되기를
  원한다(권한 3축).

---

## 기능 요구사항

- **FR-001** (주문 기준 송장 조회 — 백엔드): `GET /shipments?orderId=`(`ShippingController.getByOrder` —
  `@Get()` + `@Query('orderId')`)가 주문 기준 최신 송장 1건을 조회한다. `ShippingService.getByOrder(userId,
  orderId)`가 권한 3축(`_assertCanViewOrder`)을 검증한 뒤 `ShippingRepository.findByOrderId(orderId)`를
  반환하며, 송장이 없으면 **`null`** 을 반환한다(예외 아님).

- **FR-002** (주문 기준 송장 조회 repository): `ShippingRepository.findByOrderId(orderId)`가
  `prisma.tx.shipment.findFirst({ where: { orderId }, orderBy: { createdAt: 'desc' } })`로 주문당 최신 송장
  1건을 조회한다(현재 주문당 1건 가정). 미존재 시 `null` 을 반환한다.

- **FR-003** (권한 3축 헬퍼 추출 — 리팩토링): `ShippingService` 의 권한 3축 검증(구매자 본인 OR 해당 주문
  판매자, 미허가 시 403)을 `_assertCanViewOrder(userId, orderId)` private 헬퍼로 추출한다. 기존
  `getTracking` 이 인라인으로 갖던 검증 로직을 이 헬퍼 호출로 대체하고, 신규 `getByOrder` 도 동일 헬퍼를
  공유하여 인가 로직 중복을 제거한다. 예외 메시지는 `'Not allowed to view this shipment'` 로 통일한다.

- **FR-004** (판매자 단건 주문 상세 — 백엔드): `GET /seller/orders/:orderId`(`SellerOrderController.
  getSellerOrder`)가 판매자 본인 소유 주문의 상세(items 포함)를 반환한다. `OrderService.getSellerOrderDetail
  (userId, orderId)`가 `getApprovedSeller` → `orderRepository.findById(orderId)` 로 조회하고, 주문 미존재 시
  **404**(`NotFoundException`), items 중 본인 `sellerId` 일치 항목이 없으면 **403**(`ForbiddenException`)을
  던진다.

- **FR-005** (주문·배송 view 타입 추가): `@doa/shared-types` 에 `OrderItemView`(id·productId·sellerId·
  variantId·unitPrice[string]·quantity)와 `SellerOrderDetail`(`SellerOrder` 확장 + `items: OrderItemView[]`)
  를 추가한다. 금전 필드(`unitPrice`)는 Decimal→JSON 직렬화상 문자열이다.

- **FR-006** (도메인 facade 추가): `@doa/api-client` 의 `order` facade 에 `getSellerDetail(orderId)`(GET
  `/seller/orders/:id` → `SellerOrderDetail`)를, `shipping` facade 에 `getByOrder(orderId)`(GET
  `/shipments?orderId=` → `Shipment | null`, `query` 옵션 사용)를 추가한다. 기존 facade 메서드 불변.

- **FR-007** (console ship 재진입 복구): `seller/orders/[id]/ship/page.tsx` 가 진입 시 (1)
  `shipmentQuery`(`useQuery(['shipment','byOrder',orderId], api.shipping.getByOrder, { enabled: isSeller })`)
  로 기존 송장을 복구하고, (2) `orderQuery`(`api.order.getSellerDetail`)로 주문 상태·금액 헤더를 표시한다.
  기존 송장이 있으면 배송 상태·추적 패널을, 없으면 등록 폼을 렌더한다. 등록/상태변경 mutation 의 `onSuccess`
  는 `qc.setQueryData(['shipment','byOrder',orderId], s)`로 캐시를 갱신한다(004 의 세션 `useState` 대체).

- **FR-008** (OpenAPI 재생성): 신규 라우트 2개(`GET /seller/orders/{orderId}`·`GET /shipments`)가
  `openapi.json` 에 반영되고 `@doa/shared-types/openapi.gen.ts` 가 재생성된다.

---

## 비기능 요구사항

- **NFR-001** (권한 3축 — 인가 무결성): `getByOrder`·`getTracking` 은 동일한 `_assertCanViewOrder` 로 보호된다
  — 구매자 본인(`ownership.userId === userId`) 또는 해당 주문 판매자(`sellerId ∈ ownership.sellerIds`)만
  허가하고, 그 외는 403 을 던진다. 헬퍼 추출로 인가 로직이 단일 지점에 모여 두 라우트가 동일 규칙을 강제한다.

- **NFR-002** (판매자 소유 검증): `getSellerOrderDetail` 은 본인 소유(items 중 `sellerId === seller.id`)를
  검증한다 — 미존재 404·비소유 403. 타 판매자가 orderId 만으로 주문 상세를 조회하는 것을 차단한다.

- **NFR-003** (null 안전 — 미존재 신호): 주문 기준 송장 조회는 "미등록" 을 **예외가 아닌 `null`** 로 신호한다
  (FR-001). console 은 `shipmentQuery.data ?? null` 로 받아 송장 미존재 시 등록 폼을, 존재 시 관리 패널을
  분기한다. 미등록이 정상 흐름(아직 발송 전)이므로 404/throw 가 아닌 null 이 적절하다.

- **NFR-004** (하위 호환 — additive): 본 변경은 신규 라우트 2개 추가(additive)이며 기존 라우트·facade·view
  타입·console 화면의 시그니처를 깨지 않는다. `getTracking` 은 동작 불변(헬퍼 추출 리팩토링), 신규 facade
  메서드는 기존 메서드에 추가된다. 백엔드 tsc 0·console typecheck 0·회귀 0.

- **NFR-005** (금전 Decimal 문자열 표기): `OrderItemView.unitPrice` 등 금전 필드는 Decimal→JSON 직렬화상
  문자열로 정의된다(부동소수점 금지 — P-005 정합성, 004 와 동일 전략).

---

## 수용 기준

> **환경 태그 규약**:
> | 태그 | 의미 |
> |---|---|
> | `[env:static]` | 정적 코드/구조 검증(코드 리뷰·grep·분기 로직 확인)으로 판정 |
> | `[env:unit]` | 백엔드 단위 테스트(`jest`) 통과로 판정 |
> | `[env:typecheck]` | TypeScript 타입체크(`tsc --noEmit`) 통과로 판정 |
> | `[env:build]` | 빌드 산출(`console build` 라우트 컴파일·`openapi.json` 재생성) 성공으로 판정 |

- **SC-001** (`FR-001`·`FR-002`·`FR-003`·`NFR-001`·`NFR-003` 관련): `ShippingService.getByOrder` 가 (1)
  판매자/구매자 권한이 있으면 송장(또는 미존재 시 null)을 반환하고, (2) 무관한 사용자는 `ForbiddenException`
  을 던지며 `findByOrderId` 를 호출하지 않는다. `shipping.service.spec.ts` 의 `getByOrder` describe 3
  케이스(seller→shipment·buyer+미존재→null·stranger→Forbidden)가 PASS 한다. [env:unit]

- **SC-002** (`FR-004`·`NFR-002` 관련): `OrderService.getSellerOrderDetail` 이 (1) 본인 소유 주문이면 주문을
  반환하고, (2) 비소유면 `ForbiddenException`, (3) 미존재면 `NotFoundException` 을 던진다.
  `order.service.spec.ts` 의 `getSellerOrderDetail` describe 3 케이스(owner→order·not_owner→Forbidden·
  missing→NotFound)가 PASS 한다. [env:unit]

- **SC-003** (`FR-001`·`FR-004`·`FR-008` 관련): 신규 라우트 2개(`GET /shipments`·`GET /seller/orders/
  {orderId}`)가 컨트롤러에 등록되고 `openapi.json` 에 반영된다 — `openapi.json` paths 71개, `/shipments` 에
  GET 추가, `/seller/orders/{orderId}` 신규. 백엔드 e2e 84 PASS·tsc 0. [env:typecheck] [env:build] [env:unit]

- **SC-004** (`FR-005`·`FR-006` 관련): `@doa/shared-types` 에 `OrderItemView`·`SellerOrderDetail`(금전
  string)이 정의되고, `@doa/api-client` 의 `order.getSellerDetail`·`shipping.getByOrder` facade 가 추가된다
  (view 타입을 응답 제네릭으로 사용, `getByOrder` 는 `Shipment | null`). [env:static] [env:typecheck]

- **SC-005** (`FR-007`·`NFR-003`·`NFR-004` 관련): console ship 페이지가 진입 시 `getByOrder` 로 기존 송장을
  복구하고 `getSellerDetail` 로 주문 헤더를 표시한다 — 송장 존재 시 상태관리·추적 패널, 미존재 시 등록 폼.
  mutation `onSuccess` 가 `setQueryData(['shipment','byOrder',orderId])` 로 캐시 갱신. `console typecheck`
  0·`console build` 14 라우트 PASS(`/seller/orders/[id]/ship` ƒ 동적, 기존 화면 회귀 0). [env:typecheck]
  [env:build] [env:static]

---

## 요구사항 구조화 매트릭스

> 매핑 누락(SC 없는 FR/NFR, FR/NFR 없는 SC) 0건이 완료 조건.
> MoSCoW: Must / Should / Could / Won't

| US-ID | FR-ID | NFR-ID | SC-ID | [env:*] | MoSCoW |
|---|---|---|---|---|---|
| US-001·US-003 | FR-001·FR-002·FR-003 | NFR-001·NFR-003 | SC-001 | unit | Must |
| US-002·US-003 | FR-004 | NFR-002 | SC-002 | unit | Must |
| US-001·US-002 | FR-001·FR-004·FR-008 | NFR-001·NFR-002 | SC-003 | typecheck/build/unit | Must |
| US-001·US-002 | FR-005·FR-006 | NFR-005 | SC-004 | static/typecheck | Must |
| US-001·US-002 | FR-007 | NFR-003·NFR-004 | SC-005 | typecheck/build/static | Must |

> 모든 FR(FR-001~008)이 SC 로 대응된다(FR-001·002·003→SC-001/SC-003, FR-004→SC-002/SC-003, FR-005·006→
> SC-004, FR-007→SC-005, FR-008→SC-003). 매핑 누락 0건. SC-001·002 는 백엔드 단위 테스트(신규 +6)로,
> SC-003 은 openapi 재생성·라우트 등록(빌드)+e2e/tsc 로, SC-004·005 는 정적 구조 + 타입체크/빌드로 판정한다.

---

## 선행 spec 영향 추적

| 선행 spec | 항목 | 005 영향 |
|---|---|---|
| 004 GAP-004-01 (1) 판매자 주문 상세 부재 | BE-GAP(Medium) | **해소** — `GET /seller/orders/:orderId`(items 포함, 소유 검증) 추가. ship 페이지 주문 헤더 표시 |
| 004 GAP-004-01 (2) 주문→송장 조회 부재 | BE-GAP(Medium) | **해소** — `GET /shipments?orderId=`(권한 3축, null 가능) 추가. ship 재진입 복구 |
| 004 §범위 외 "ship 페이지 기존 송장 복구" | 세션 state 한계 | **해소** — `useState` 세션 보관을 `getByOrder` 쿼리 복구로 전환 |
| 004 GAP-004-01 (3) 응답 스키마 미정의 | view 타입 한시(Low) | **계속 OPEN** — `SellerOrderDetail` 도 전이형 view 타입(금전 string). 응답 DTO 보강 후 생성 타입 대체 예정 |
| 004 GAP-004-01 (4) Phase 2 프론트 부재 | rhf/낙관적/페이지네이션(Low) | **계속 OPEN** — 본 차수 범위 외 |

---

## 범위 외

- **송장 status 업데이트 e2e**: 송장 등록·상태 전이의 백엔드 e2e 시나리오는 본 차수에 추가하지 않는다(단위
  테스트 +6 으로 권한·소유 분기를 검증). 후속.
- **낙관적 업데이트(optimistic update)**: console ship 의 create·updateStatus mutation 은 서버 응답 후
  `setQueryData`/`invalidate` 하는 방식이며 `onMutate` 낙관적 업데이트는 적용하지 않는다(Phase 2 후속).
- **분할배송(주문당 송장 N건)**: `findByOrderId` 는 주문당 최신 송장 1건만 반환한다(주문당 1건 가정). 한
  주문에 복수 송장(분할배송)을 다루는 흐름은 범위 외다.
- **판매자 주문 상세 화면(items 렌더)**: `SellerOrderDetail.items` 를 ship 페이지에서 헤더 컨텍스트(상태·
  금액) 외 품목 목록으로 렌더하는 UI 는 본 차수에 없다(주문 상태·금액 헤더만 표시).
- **응답 스키마 보강(생성 타입 대체)**: 주문·배송 응답 DTO + `@ApiResponse({ type })` 보강 및 view 타입의
  생성 타입 대체는 본 차수 범위 외다(004 GAP-004-01 (3) 연속, 백엔드 후속).

---

## 미결 사항

없음 — 본 spec 은 구현 완료 코드를 기준으로 retroactive 작성되었으며, 모든 요구사항·수용 기준이 실제
구현(`getByOrder`·`findByOrderId`·`_assertCanViewOrder`·`getSellerOrderDetail` + 두 신규 라우트 + view
타입·facade + console 재진입 복구)과 대조 확인되었다. 004 의 BE-GAP 2건(판매자 주문 상세·주문→송장 조회)은
본 차수로 **RESOLVED** 되며, 응답 스키마 한시성·Phase 2 프론트 보강·분할배송은 후속(GAP-005-01 / 004
GAP-004-01 연속)으로 분리하되, 핵심 목표 — ship 재진입 복구 + 주문 컨텍스트 표시 + 권한 3축/소유 검증 — 는
백엔드 unit 261(+6)·e2e 84·tsc 0·console typecheck 0·build 14 라우트 PASS 로 달성되었다.
</content>
</invoke>
