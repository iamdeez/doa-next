---
작성: Design Agent
버전: v1.0
최종 수정: 2026-06-29 17:30
상태: 확정 (retroactive — 전 태스크 구현 완료)
---

# Tasks: 005-shipping-settlement

> Branch: 005-shipping-settlement | Date: 2026-06-29 | Plan: [../planning/plan.md](../planning/plan.md)

## 목차

- [전제 조건](#전제-조건)
- [태스크 목록](#태스크-목록)
- [Test Authoring Contract](#test-authoring-contract)
- [구현 완료 기준](#구현-완료-기준)

---

## 전제 조건

- [x] spec.md 의 모든 [NEEDS CLARIFICATION] 항목 해소(미결 사항: 없음)
- [x] plan.md Constitution Gates(P-001~P-007) 통과(예외 1건 — 정산 중복 멱등 미보장, 근거 명시·허용)
- [x] CHANGES.md 의 이전 작업(004-review-coupon) "후속 작업 시 주의사항" 확인
- [x] **Database Design Agent** 가 `data-model.md` + 마이그레이션(orders 2테이블 `shipments`·`shipment_tracking` + settlements 2테이블 `settlements`·`settlement_items` + 2 enum + append-only/조회 인덱스)을 확정하고 Prisma client 생성 완료

> A·B·C 레이어 = **4단계 Development Agent**. D 레이어 = **5a Test Agent(AUTHORING)**. 레이어 A→B→C 의존 순, `[P]` 는 병렬 가능.

---

## 태스크 목록

> 레이어: A 데이터(repository·schema 연동) / B 도메인(service·events·constants) / C 인터페이스(controller·dto·module wiring) / D 테스트(5a).

### Step 1. order 모듈 — 005 연동 메서드 (additive, A·B)

- [x] **T001** — order.repository.findCompletedItemsBySellerInPeriod
  - 레이어: A
  - 구현 파일: `apps/backend/src/modules/order/order.repository.ts`
  - 관련 요구사항: FR-004
  - 상세: `findCompletedItemsBySellerInPeriod(sellerId, periodStart, periodEnd): Promise<Array<{orderId; orderItemId; unitPrice: Prisma.Decimal; quantity: number}>>` — `this.prisma.tx.order.findMany({where:{status:completed, createdAt:{gte:start, lte:end}, items:{some:{sellerId}}}, include:{items:{where:{sellerId}}}})` → flatMap 으로 항목 명세 반환. orders 스키마 자기 테이블만(order + order_items join).
  - 완료 기준: orders 스키마만 접근(P-001 무위반). 기간·판매자 필터 정확.

- [x] **T002** — order.service 005 공개 메서드 4종
  - 레이어: B
  - 구현 파일: `apps/backend/src/modules/order/order.service.ts`
  - 관련 요구사항: FR-001·002·003·004·005
  - 상세:
    - `markShipped(orderId, sellerId): Promise<void>` — findById(없으면 404), 항목 sellerId 불일치 403, status≠preparing 400 → updateStatus(shipped) + appendEvent(actorType=SELLER, actorId=sellerId).
    - `markDelivered(orderId, sellerId): Promise<void>` — findById 404, sellerId 불일치 403, 이미 delivered 멱등 no-op, status≠shipped 400 → updateStatus(delivered, {deliveredAt:now}) + appendEvent.
    - `getOrderOwnership(orderId): Promise<{userId; sellerIds: string[]}>` — findById 404, sellerIds = unique(items.sellerId).
    - `getCompletedItemsForSettlement(sellerId, periodStart, periodEnd): Promise<Array<{orderId; orderItemId; saleAmount: Prisma.Decimal}>>` — findCompletedItemsBySellerInPeriod → map(saleAmount = Decimal(unitPrice).mul(quantity)).
  - 완료 기준: 전부 additive 공개. 기존 OrderService 메서드 시그니처 불변(003/004 회귀 0). Decimal 계산.

### Step 2. shipping 모듈 (orders 스키마 소유)

- [x] **T010** — shipping.repository
  - 레이어: A
  - 구현 파일: `apps/backend/src/modules/shipping/shipping.repository.ts`
  - 관련 요구사항: FR-001·002·003
  - 상세: `this.prisma.tx.shipment`/`shipmentTracking` 로 — `createShipment(data)`, `findById(id)`, `updateShipment(id, {status?, shippedAt?, deliveredAt?})`, `appendTracking(data)`(create), `findTracking(shipmentId)`(orderBy occurredAt desc).
  - 완료 기준: shipment·shipmentTracking 모델만 접근 — order/orderItem/orderEvent 등 직접 참조 0(SC-051).

- [x] **T011** — shipping.events
  - 레이어: B
  - 구현 파일: `apps/backend/src/modules/shipping/shipping.events.ts`
  - 관련 요구사항: FR-001·002
  - 상세: `export const SHIPPING_EVENTS = {SHIPPED:'shipping.shipped', DELIVERED:'shipping.delivered'} as const`.
  - 완료 기준: 이벤트 이름 상수. createShipment/updateStatus 의 onAfterCommit 에서 사용.

- [x] **T012** — shipping.service (송장 등록·상태 업데이트·추적 조회)
  - 레이어: B
  - 구현 파일: `apps/backend/src/modules/shipping/shipping.service.ts`
  - 관련 요구사항: FR-001·002·003
  - 상세:
    - `createShipment(userId, {orderId, carrier, trackingNumber})` — `getApprovedSeller(userId)`(미승인 403) → `runInTransaction`: `markShipped(orderId, seller.id)` → `createShipment(status=shipped, shippedAt=now)` → `appendTracking(shipped, "Shipment registered ...")` → `onAfterCommit(emit SHIPPED {shipmentId, orderId, sellerId})`.
    - `updateStatus(userId, shipmentId, newStatus, description?)` — `getApprovedSeller` → `findById`(404) → `getOrderOwnership` → `sellerIds.includes(seller.id)` 아니면 403 → `runInTransaction`: `updateShipment({status, delivered면 deliveredAt})` → `appendTracking(newStatus, description ?? "Status updated to ...")` → delivered면 `markDelivered(orderId, seller.id)` → delivered면 `onAfterCommit(emit DELIVERED)`.
    - `getTracking(userId, shipmentId)` — `findById`(404) → `getOrderOwnership` → `authorized = ownership.userId===userId`; 아니면 `_resolveSellerId`(getApprovedSeller try/catch→null) 가 sellerIds 포함 → 아니면 403 → `findTracking`.
  - 완료 기준: 권한 3축 정확. P-001 — 주문 데이터 OrderService DI 만. 트랜잭션 원자성.

- [x] **T013** `[P]` — shipping dto + controller + module wiring
  - 레이어: C
  - 구현 파일: `apps/backend/src/modules/shipping/dto/{create-shipment,update-shipment-status}.dto.ts`, `shipping.controller.ts`, `shipping.module.ts`
  - 관련 요구사항: FR-001·002·003, SC-052(401)
  - 상세: `CreateShipmentDto`(orderId·carrier·trackingNumber `@IsString @IsNotEmpty`). `UpdateShipmentStatusDto`(status `@IsEnum(ShipmentStatus)`, description `@IsOptional @IsString`). `ShippingController` `@Controller('shipments')` `@UseGuards(JwtAuthGuard)`: POST `/`(201) · PATCH `/:id/status` · GET `/:id/tracking`. `ShippingModule`: imports `[AuthSharedModule, OrderModule, SellerModule]`, providers `[ShippingService, ShippingRepository]`, exports `[ShippingService]`.
  - 완료 기준: 비인증 401(JwtAuthGuard). DI 순환 0.

### Step 3. settlement 모듈 (settlements 스키마 소유)

- [x] **T020** — settlement.constants
  - 레이어: B
  - 구현 파일: `apps/backend/src/modules/settlement/settlement.constants.ts`
  - 관련 요구사항: FR-005
  - 상세: `export const COMMISSION_RATE = '0.1' as const` — Prisma Decimal 문자열(부동소수점 금지).
  - 완료 기준: 문자열 상수. service 에서 `new Prisma.Decimal(COMMISSION_RATE)`.

- [x] **T021** — settlement.repository
  - 레이어: A
  - 구현 파일: `apps/backend/src/modules/settlement/settlement.repository.ts`
  - 관련 요구사항: FR-004·006
  - 상세: `this.prisma.tx.settlement`/`settlementItem` 로 — `createSettlement(data)`, `createItems(items)`(createMany), `findById(id)`(include items), `listBySeller(sellerId)`(createdAt desc), `listAll()`(createdAt desc). `type SettlementWithItems = Settlement & {items: SettlementItem[]}`.
  - 완료 기준: settlement·settlementItem 모델만 접근(SC-051). createdAt desc 정렬.

- [x] **T022** — settlement.service (정산 생성·조회)
  - 레이어: B
  - 구현 파일: `apps/backend/src/modules/settlement/settlement.service.ts`
  - 관련 요구사항: FR-004·005·006
  - 상세:
    - `createSettlement(sellerId, periodStart, periodEnd): Promise<SettlementWithItems>` — `rate = new Prisma.Decimal(COMMISSION_RATE)`; `items = getCompletedItemsForSettlement(...)`; `totalSales = items.reduce((acc,i)=>acc.add(i.saleAmount), Decimal(0))`; `commission = totalSales.mul(rate).toDecimalPlaces(2, ROUND_HALF_UP)`; `payoutAmount = totalSales.minus(commission)` → `runInTransaction`: `createSettlement({...,status:pending})` → `if items.length>0` `createItems(items.map(...commissionAmount = saleAmount.mul(rate).toDecimalPlaces(2, ROUND_HALF_UP)))` → return `findById(created.id)`.
    - `listMySettlements(userId)` — `getApprovedSeller(userId)`(미승인 403) → `listBySeller(seller.id)`.
    - `listAll()` — `listAll()`.
  - 완료 기준: 금전 연산 전부 Decimal(float 0, SC-050). 빈 집계 0금액·createItems 미호출.

- [x] **T023** `[P]` — settlement dto + controllers + module wiring
  - 레이어: C
  - 구현 파일: `apps/backend/src/modules/settlement/dto/create-settlement.dto.ts`, `settlement.controller.ts`, `settlement.module.ts`
  - 관련 요구사항: FR-004·006, SC-052(401)
  - 상세: `CreateSettlementDto`(sellerId `@IsString @IsNotEmpty`, periodStart·periodEnd `@IsDateString`). `SettlementController` `@Controller('settlements')` `@UseGuards(JwtAuthGuard)`: POST `/`(`@UseGuards(AdminGuard)`, 201) · GET `/`(listMySettlements). `AdminSettlementController` `@Controller('admin/settlements')` `@UseGuards(JwtAuthGuard, AdminGuard)`: GET `/`(listAll). `SettlementModule`: imports `[AuthSharedModule, OrderModule, SellerModule]`, controllers `[SettlementController, AdminSettlementController]`, providers `[SettlementService, SettlementRepository]`, exports `[SettlementService]`.
  - 완료 기준: POST/admin 조회 AdminGuard. 비인증 401. DI 순환 0.

### Step 4. 테스트 (D 레이어 — 5a Test Agent AUTHORING)

> 본 Step 은 **5a Test Agent(AUTHORING)** 가 작성(TDD Red). 아래 [Test Authoring Contract](#test-authoring-contract) 가 입력.

- [x] **T030** — shipping 단위 테스트 (`shipping.service.spec.ts`) — SC-001·002·003 (11 케이스)
- [x] **T031** — settlement 단위 테스트 (`settlement.service.spec.ts`) — SC-004·005·006 (6 케이스)
- [x] **T032** `[P]` — 정적 테스트 확장 — `cross-schema.spec.ts`(ShippingRepository·SettlementRepository 규칙, SC-051), `schema-decimal.spec.ts`(정산 금전 필드 5종 MONEY_FIELDS, SC-050)

---

## Test Authoring Contract

> **5a Test Agent(AUTHORING) 입력 contract**. production canonical 심볼 명시(추측 단언 금지).

### Production canonical 심볼

| 심볼 | canonical 형태 |
|---|---|
| `ShippingService` | `createShipment(userId, {orderId, carrier, trackingNumber})`·`updateStatus(userId, shipmentId, newStatus: ShipmentStatus, description?)`·`getTracking(userId, shipmentId): Promise<ShipmentTracking[]>` |
| `ShippingRepository` | `createShipment`·`findById`·`updateShipment`·`appendTracking`·`findTracking` |
| `SettlementService` | `createSettlement(sellerId, periodStart: Date, periodEnd: Date)`·`listMySettlements(userId)`·`listAll()` |
| `SettlementRepository` | `createSettlement`·`createItems`·`findById`·`listBySeller`·`listAll` |
| `OrderService`(005 신규) | `markShipped(orderId, sellerId)`·`markDelivered(orderId, sellerId)`·`getOrderOwnership(orderId): {userId, sellerIds}`·`getCompletedItemsForSettlement(sellerId, start, end): [{orderId, orderItemId, saleAmount: Prisma.Decimal}]` |
| `SellerService` | `getApprovedSeller(userId): Promise<{id, userId}>` — 미승인 `ForbiddenException` |
| `PrismaService`(mock) | `runInTransaction((fn)=>fn())`·`onAfterCommit((cb)=>Promise.resolve(cb()))`·`get tx(){return this}` passthrough |
| 이벤트 리터럴 | `'shipping.shipped'`·`'shipping.delivered'`(SHIPPING_EVENTS) |
| 예외 리터럴 | `ForbiddenException`(403, 미승인 판매자·비소유)·`NotFoundException`(404, shipment 없음)·`BadRequestException`(400, status 불일치 — markShipped/markDelivered 전파) |
| enum/status 리터럴 | `ShipmentStatus.preparing/shipped/in_transit/delivered`·`SettlementStatus.pending/completed` |
| 금전 단언 | `Prisma.Decimal` `.toString()` 비교 — totalSales='33455', commission='3345.5', payoutAmount='30109.5'; 반올림 saleAmount='100.05'→commission='10.01'·payout='90.04' |

### mock 재현 규약

- **shipping.service.spec**:
  - createShipment Happy: `getApprovedSeller.mockResolvedValue({id:'seller-1', userId:'seller-user-1'})`, `markShipped.mockResolvedValue(undefined)`, `createShipment.mockResolvedValue(SHIPMENT)` → `markShipped('order-1','seller-1')` 호출 + shipment(shipped)·tracking·`emit('shipping.shipped', ...)` 단언.
  - createShipment 미승인: `getApprovedSeller.mockRejectedValue(ForbiddenException)` → createShipment 미호출 단언.
  - createShipment preparing 아님: `markShipped.mockRejectedValue(BadRequestException)` → 전파 + createShipment 미호출.
  - updateStatus delivered: `findById`·`getOrderOwnership({userId, sellerIds:['seller-1']})` → `markDelivered('order-1','seller-1')` 호출 + `emit('shipping.delivered')`.
  - updateStatus in_transit: `markDelivered` `not.toHaveBeenCalled()`.
  - updateStatus 비소유: `getOrderOwnership.sellerIds=['seller-1']`, seller-2 → 403, updateShipment 미호출.
  - updateStatus 없음: `findById.mockResolvedValue(null)` → 404.
  - getTracking 구매자: `ownership.userId==='customer-1'` → tracking, `getApprovedSeller` `not.toHaveBeenCalled()`.
  - getTracking 판매자: ownership 판매자 일치 → tracking.
  - getTracking 제3자: `getApprovedSeller.mockRejectedValue(ForbiddenException)` → 403, findTracking 미호출.
  - getTracking 없음: `findById=null` → 404.
- **settlement.service.spec**:
  - 정산 Decimal: `getCompletedItemsForSettlement.mockResolvedValue([{saleAmount:Decimal('10000')},{saleAmount:Decimal('23455')}])` → createSettlement 인자 totalSales='33455'·commission='3345.5'·payoutAmount='30109.5', items commissionAmount '1000'·'2345.5'.
  - 반올림: saleAmount='100.05' → commission='10.01'·payout='90.04'.
  - 빈 집계: `getCompletedItemsForSettlement=[]` → totalSales/commission/payoutAmount='0', `createItems` `not.toHaveBeenCalled()`.
  - listMySettlements: `getApprovedSeller({id:'seller-1'})` → `listBySeller('seller-1')`. 미승인 → 403.
  - listAll: `listAll()` 반환.

### SC → 테스트 매핑

| SC-ID | 수용 기준 | 테스트 파일·describe | 비고 |
|---|---|---|---|
| SC-001 | 송장 등록 + shipped 전이 / 미승인·preparing 아님 | shipping.service.spec.ts::createShipment (3) | [env:unit] |
| SC-002 | delivered 전이 / in_transit 미전이 / 비소유 / 없음 | shipping.service.spec.ts::updateStatus (4) | [env:unit] |
| SC-003 | 추적 권한 3축 + 없음 | shipping.service.spec.ts::getTracking (4) | [env:unit] |
| SC-004 | 정산 생성 / 빈 집계 0금액 | settlement.service.spec.ts::createSettlement (3) | [env:unit] |
| SC-005 | Decimal 계산·반올림 | settlement.service.spec.ts::createSettlement (위 2 케이스) | [env:unit] |
| SC-006 | 본인/미승인/전체 정산 조회 | settlement.service.spec.ts::listMySettlements (2) + listAll (1) | [env:unit] |
| SC-050 | 정산 금전 Decimal 정적 | schema-decimal.spec.ts MONEY_FIELDS 추가 | [env:static] |
| SC-051 | shipping/settlement repo cross-schema 0 | cross-schema.spec.ts ShippingRepository·SettlementRepository 규칙 | [env:static] |
| SC-052 | `@aws-sdk/*` 신규 0 | package-no-aws.spec.ts(기존, 자동 충족) | [env:static] |

---

## 구현 완료 기준

- [x] 모든 A·B·C 태스크 체크박스 완료(4단계), D 태스크 완료(5a)
- [x] `pnpm --filter backend test` 전체 PASSED — 003/004 회귀 0 + 005 신규 SC `[TypeScript/NestJS]`
- [x] `tsc --noEmit` 0 error — NestJS DI 순환(shipping/settlement→order·seller 단방향) 미발생
- [x] cross-schema(SC-051)·schema-decimal(SC-050)·package-no-aws(SC-052) 정적 PASS
- [x] AppModule 부팅 PASS — ShippingModule·SettlementModule DI 정상
- [x] `package.json` 신규 의존 0(SC-052). `@aws-sdk/*` 0
- [x] git status 의도치 않은 파일 없음
