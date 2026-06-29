---
작성: Planning Agent
버전: v1.0
최종 수정: 2026-06-29 17:30
상태: 확정 (retroactive)
---

# Plan: 005-shipping-settlement

> Branch: 005-shipping-settlement | Date: 2026-06-29 | Spec: [../spec/spec.md](../spec/spec.md)

## 목차

- [사전 검증 (Constitution Gates)](#사전-검증-constitution-gates)
- [기술 컨텍스트](#기술-컨텍스트)
- [사전 영향도 분석 결과](#사전-영향도-분석-결과)
- [핵심 설계](#핵심-설계)
- [결정 기록 (ADRs)](#결정-기록-adrs)
- [인터페이스 계약](#인터페이스-계약)
- [데이터 모델](#데이터-모델)
- [테스트 전략](#테스트-전략)
- [기타 고려사항](#기타-고려사항)

---

## 사전 검증 (Constitution Gates)

> `constitution.md`(P-001~P-007) 존재 → 해당 조항을 Gates 로 사용한다(constitution 우선). spec.md NFR(NFR-001~006)은 P-001·P-002·P-005·P-006·P-007 을 하위 구체화하며 충돌(완화) 없음.

- [x] **P-001 모듈 경계 원칙**: [Pass 기준: shipping/settlement Repository 가 자기 소유 테이블 외 타 도메인 모델을 직접 참조·쿼리하지 않음 — SC-051 정적 검증]
  → PASS. `ShippingRepository`는 `this.prisma.tx.shipment`·`shipmentTracking`만, `SettlementRepository`는 `this.prisma.tx.settlement`·`settlementItem`만 쿼리. 주문 데이터는 전부 `OrderService` 공개 메서드(`markShipped`·`markDelivered`·`getOrderOwnership`·`getCompletedItemsForSettlement`) DI 경유. 판매자 식별은 `SellerService.getApprovedSeller` DI. 4계층(controller·service·repository·events) 준수. shipping 테이블이 물리적으로 `orders` 스키마에 있으나 order 모듈 소유 테이블(orders·order_items·order_events)에는 미접근.
- [x] **P-002 AWS 의존 금지 원칙**: [Pass 기준: `@aws-sdk/*` 신규 추가 0건 — SC-052]
  → PASS. 신규 npm 의존 0건. shipping/settlement 모듈은 기존 Prisma·NestJS·class-validator·EventEmitter2만 사용.
- [x] **P-003 단일 DB 원칙**: [Pass 기준: 단일 PostgreSQL 외 외부 저장소 0건]
  → PASS. 신규 4테이블(`orders.shipments`·`orders.shipment_tracking`·`settlements.settlements`·`settlements.settlement_items`)을 기존 PostgreSQL 인스턴스에 추가(신규 `settlements` 스키마 분리). 외부 저장소·캐시·브로커 0. 이벤트(`shipping.shipped`·`shipping.delivered`)는 인-프로세스 EventEmitter2.
- [x] **P-004 클라우드 중립 원칙**: [Pass 기준: Fly.io 전용 API 결합 0건]
  → PASS. 표준 Prisma + PostgreSQL만. Fly 전용 SDK·API 미사용.
- [x] **P-005 결제·정산 정합성 원칙**: [Pass 기준: 금전 수치 Decimal, 부동소수점 0건(NFR-001), 상태 변경 원자성(NFR-002) — SC-050 검증]
  → PASS(핵심 요구). (1) **Decimal**: `settlements`·`settlement_items` 금전 필드 5종 전부 `@db.Decimal(12,2)`. 정산 계산은 `Prisma.Decimal` 연산(`.add/.mul/.minus/.toDecimalPlaces(2, ROUND_HALF_UP)`)만, float 0. `COMMISSION_RATE`는 문자열 `'0.1'`(Decimal 생성자 입력 — 부동소수점 회피). (2) **원자성**: 송장 등록(주문 전이+shipment+tracking)·배송 완료(shipment 갱신+tracking+주문 전이)·정산 생성(settlement+items)이 각각 `runInTransaction` 단일 트랜잭션. **outbox·멱등성 키 적용 범위 주의**: P-005 의 outbox/멱등키는 *결제·환불* 상태 변경 대상이며, 본 spec 의 정산 *생성*은 결제 상태 변경이 아니라 집계 레코드 생성이다. 정산 생성은 outbox 대상이 아니다(003 ADR-007 의 outbox 는 payment.completed→order.confirmed 흐름 전용). 단 정산 *중복 생성* 멱등성은 본 spec 에서 보장하지 않음(예외 사항 참조).
- [x] **P-006 테스트 원칙**: [Pass 기준: SC-XXX 없는 FR-XXX 0건]
  → PASS. FR-001~006·NFR-001~006 전부 SC 매핑 존재(spec.md 매트릭스 역방향 검증 완료).
- [x] **P-007 스펙 범위 원칙**: [Pass 기준: spec.md 범위 외 변경 파일 0건]
  → PASS. 변경 범위 = shipping·settlement 2개 스텁 실구현 + order 모듈 005 연동 메서드 4종 추가(전부 FR-001~006 추적 가능). spec.md 범위 외 리팩토링 0.

**스코프 추적 (P-007 — order 산출물 cross-cutting 변경의 FR 근거)**:

| 변경 대상 | 변경 성격 | 근거 FR | 비파괴성 |
|---|---|---|---|
| `modules/order/order.service.ts` 신규 `markShipped` | `preparing → shipped` 전이 + 판매자 소유권/상태 검증 | FR-001 | additive 공개 메서드 — 기존 전이 경로 불변 |
| `modules/order/order.service.ts` 신규 `markDelivered` | `shipped → delivered` 전이(멱등) | FR-002 | additive — 이미 delivered 면 no-op |
| `modules/order/order.service.ts` 신규 `getOrderOwnership` | 배송 추적 권한 3축 판정용 `{userId, sellerIds}` 반환 | FR-003 | additive 조회 메서드 |
| `modules/order/order.service.ts` 신규 `getCompletedItemsForSettlement` | 정산 집계용 항목 매출 명세 반환 | FR-004·005 | additive 조회 메서드 |
| `modules/order/order.repository.ts` 신규 `findCompletedItemsBySellerInPeriod` | orders 스키마 내 completed 주문항목 조회(기간·판매자) | FR-004 | additive — orders 자기 스키마 join |

> **예외 사항(P-005 관련)**: 정산 *중복 생성* 멱등성은 본 spec 에서 보장하지 않는다. `SettlementItem.orderItemId` 에 unique 제약이 없고 `getCompletedItemsForSettlement` 가 기집계 항목을 제외하지 않으므로, 동일/겹치는 기간 재정산 시 동일 항목이 중복 지급액에 반영될 수 있다. 트리거가 admin-only 이므로 외부 악용이 아닌 운영 절차 위험으로 분류하여 **허용·기록**(gaps.md GAP-005-01, security-report SEC-FIND-005-01). 후속 정산 보강 spec 에서 멱등성/제약 추가.

> **Gates 판정**: P-001~P-007 전부 통과(예외 1건 — 정산 중복 멱등 미보장, 근거 명시·허용). Design Agent(3단계) 진입 가능.

---

## 기술 컨텍스트

> 003/004 의 확정 스택을 재확정. 005 고유 신규 결정만 명시.

- **언어 / 런타임**: TypeScript 5.4 / Node.js 20.x. pnpm + Turborepo.
- **백엔드 프레임워크**: NestJS 11.x. 4계층(controller·service·repository·events).
- **ORM / DB**: Prisma `^6.19.0` multiSchema + PostgreSQL 16. 신규 `settlements` 스키마 추가, shipping 테이블은 기존 `orders` 스키마에 배치.
- **인증/인가**: 기존 `shared/auth` 재사용 — `JwtAuthGuard`·`AdminGuard`(`ADMIN_USER_IDS` env, fail-closed)·`@CurrentUser()`·`AuthenticatedUser`. 신규 가드 없음. 판매자 권한은 `SellerService.getApprovedSeller(userId)`(DI, 미승인 throw).
- **트랜잭션 전파**: 003 ALS 인프라 `PrismaService`(`runInTransaction`/`tx`/`onAfterCommit`) 재사용. shipping/settlement repository 모두 `this.prisma.tx` 로 쿼리 → 주문 전이(OrderService)와 동일 트랜잭션 참여. 신규 인프라 0.
- **도메인 이벤트**: 인-프로세스 `EventEmitter2`. `shipping.shipped`·`shipping.delivered`(FR-001/002)는 `onAfterCommit` 으로 커밋 후 발행(tx 오염 방지, 003 ADR-005 패턴 승계). settlement 이벤트는 스캐폴드만(`settlement.events.ts` 빈 파일).
- **금전 타입**: `Prisma.Decimal`(`@db.Decimal(12,2)`) — totalSales·commission·payoutAmount·saleAmount·commissionAmount(NFR-001, P-005). 계산은 `.add/.mul/.minus/.toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP)` 만. `COMMISSION_RATE = '0.1'`(문자열 상수, settlement.constants.ts).
- **입력 검증**: `class-validator` + 전역 `ValidationPipe`. `CreateShipmentDto`(orderId·carrier·trackingNumber `@IsString @IsNotEmpty`), `UpdateShipmentStatusDto`(status `@IsEnum(ShipmentStatus)`, description `@IsOptional @IsString`), `CreateSettlementDto`(sellerId `@IsString @IsNotEmpty`, periodStart·periodEnd `@IsDateString`).
- **테스트 프레임워크**: Jest(`*.spec.ts`, src rootDir) + 정적(`test/static`, jest-e2e.json rootDir). 단위([env:unit]) + 정적([env:static] — SC-050·051·052).
- **환경변수**: 기존 `DATABASE_URL`·`JWT_*`·`ADMIN_USER_IDS` 재사용. 신규 env 0.
- **신규 의존성**: 0건. 신규 npm 패키지 없음.

---

## 사전 영향도 분석 결과

> 상세는 [../design/research.md](../design/research.md) 참조. 본 절은 영향 파일 요약.

### 영향 파일 목록

| 파일 | 변경 유형 | 영향 내용 | 레이어 |
|---|---|---|---|
| `prisma/schema.prisma` | 수정(DB Design 소유) | `ShipmentStatus`·`SettlementStatus` enum + `Shipment`·`ShipmentTracking`·`Settlement`·`SettlementItem` 4모델 | A |
| `prisma/migrations/20260629080659_005_shipping_settlement/migration.sql` | 신규 | 005 테이블·enum·인덱스·FK | A |
| `src/modules/shipping/shipping.repository.ts` | 신규 구현 | shipment/tracking CRUD·append-only tracking | A |
| `src/modules/shipping/shipping.service.ts` | 신규 구현 | createShipment·updateStatus·getTracking(권한 3축) | B |
| `src/modules/shipping/shipping.events.ts` | 신규 구현 | `SHIPPING_EVENTS` 상수(shipped·delivered) | B |
| `src/modules/shipping/shipping.controller.ts` | 신규 구현 | POST /shipments·PATCH /:id/status·GET /:id/tracking | C |
| `src/modules/shipping/dto/*.ts` | 신규 | create-shipment·update-shipment-status dto | C |
| `src/modules/shipping/shipping.module.ts` | 수정 | imports(AuthShared·Order·Seller)·exports(ShippingService) | C |
| `src/modules/settlement/settlement.repository.ts` | 신규 구현 | settlement/item 생성·조회 | A |
| `src/modules/settlement/settlement.service.ts` | 신규 구현 | createSettlement(Decimal 집계)·listMySettlements·listAll | B |
| `src/modules/settlement/settlement.constants.ts` | 신규 | `COMMISSION_RATE='0.1'` | B |
| `src/modules/settlement/settlement.controller.ts` | 신규 구현 | POST /settlements·GET /settlements·GET /admin/settlements | C |
| `src/modules/settlement/dto/create-settlement.dto.ts` | 신규 | create-settlement dto | C |
| `src/modules/settlement/settlement.module.ts` | 수정 | imports(AuthShared·Order·Seller)·exports(SettlementService) | C |
| `src/modules/order/order.service.ts` | 수정(additive) | markShipped·markDelivered·getOrderOwnership·getCompletedItemsForSettlement 신규 공개 | B |
| `src/modules/order/order.repository.ts` | 수정(additive) | findCompletedItemsBySellerInPeriod 신규(orders 스키마 join) | A |
| `test/static/cross-schema.spec.ts` | 수정(확장) | ShippingRepository·SettlementRepository 규칙 추가(SC-051) | D |
| `test/static/schema-decimal.spec.ts` | 수정(확장) | totalSales·commission·payoutAmount·saleAmount·commissionAmount Decimal 검증(SC-050) | D |

> `package.json` 변경 0건(신규 npm 의존 없음 — SC-052 자동 충족). OrderModule·SellerModule 은 이미 `exports`에 서비스 포함(shipping/settlement DI 소비 가능) → forwardRef 불요.

---

## 핵심 설계

> 작성 깊이: Design Agent 가 tasks.md 분해 가능한 수준. 변경 대상 모듈·인터페이스 시그니처·핵심 분기 로직 포함.

### 0. 모듈 간 통신 토폴로지 (P-001 / NFR-003 핵심)

```
[shipping 모듈] orders 스키마 소유(shipments, shipment_tracking)
   │   OrderService.markShipped(orderId, sellerId)        (DI, preparing→shipped 전이 + 소유권/상태 검증)
   │   OrderService.markDelivered(orderId, sellerId)      (DI, shipped→delivered 전이, 멱등)
   │   OrderService.getOrderOwnership(orderId): {userId, sellerIds}  (DI, 추적 권한 3축 판정)
   │   SellerService.getApprovedSeller(userId): {id, userId}         (DI, 미승인 throw)
[order 모듈] orders 스키마 소유(orders, order_items, order_events) ── 신규 공개 4종
   │   OrderService.getCompletedItemsForSettlement(sellerId, start, end): [{orderId, orderItemId, saleAmount}]  (DI)
   ▼
[settlement 모듈] settlements 스키마 소유(settlements, settlement_items)
   │   SellerService.getApprovedSeller(userId)            (DI, listMySettlements 판매자 식별)
[seller 모듈] users 스키마 ── getApprovedSeller (003 실재)
```

**규약**:
- shipping·settlement 의 주문 데이터 획득은 직접 Prisma 쿼리 절대 금지, `OrderService` 공개 DI 만(P-001, NFR-003).
- **순환 DI 회피**: shipping → order(DI 단방향), settlement → order(DI 단방향). order 는 shipping·settlement 를 import 하지 않음. shipping/settlement → seller(DI 단방향). 순환 없음 → forwardRef 불요.

### 1. shipping 모듈 (orders 스키마 소유) — FR-001~003

변경 대상: `modules/shipping/{shipping.controller,shipping.service,shipping.repository,shipping.events}.ts` + `shipping.module.ts` + dto. (현재 빈 스텁)

**컨트롤러 라우팅**(`@Controller('shipments')` `@UseGuards(JwtAuthGuard)`):

| 엔드포인트 | 인가 | 동작 | FR/SC |
|---|---|---|---|
| `POST /shipments` | getApprovedSeller(미승인 403) | `{orderId, carrier, trackingNumber}` → markShipped + shipment(shipped)·tracking 생성, 201 | FR-001 / SC-001 |
| `PATCH /shipments/:id/status` | getApprovedSeller + getOrderOwnership.sellerIds 포함(불일치 403) | `{status, description?}` → shipment 갱신·tracking append, delivered 시 markDelivered | FR-002 / SC-002 |
| `GET /shipments/:id/tracking` | 구매자 `order.userId===me` 또는 판매자 `sellerIds.includes(seller.id)`(둘 다 아니면 403) | 추적 이력 최신순 | FR-003 / SC-003 |

**핵심 분기 로직**:
- **송장 등록(FR-001)**: `seller = getApprovedSeller(userId)`(미승인 throw 403) → `runInTransaction`: `markShipped(orderId, seller.id)`(주문 비소유 403·상태≠preparing 400 전파) → `createShipment(status=shipped, shippedAt=now)` → `appendTracking(shipped, "Shipment registered ...")` → 커밋 후 `onAfterCommit(emit 'shipping.shipped')`.
- **상태 업데이트(FR-002)**: `seller = getApprovedSeller` → `findById(shipmentId)`(없으면 404) → `getOrderOwnership(shipment.orderId)` → `sellerIds.includes(seller.id)` 아니면 403 → `runInTransaction`: `updateShipment(status, delivered면 deliveredAt=now)` → `appendTracking(newStatus)` → delivered 면 `markDelivered(orderId, seller.id)` → delivered 면 커밋 후 `emit 'shipping.delivered'`.
- **추적 조회(FR-003)**: `findById`(없으면 404) → `getOrderOwnership` → `authorized = (ownership.userId === userId)`; 아니면 `_resolveSellerId(userId)`(getApprovedSeller try/catch → 실패 시 null) 가 `sellerIds`에 포함되면 authorized → 아니면 403 → `findTracking(shipmentId)`(occurredAt desc).

### 2. settlement 모듈 (settlements 스키마 소유) — FR-004~006

변경 대상: `modules/settlement/{settlement.controller,settlement.service,settlement.repository,settlement.constants}.ts` + `settlement.module.ts` + dto.

**컨트롤러 라우팅**(NestJS 다중 컨트롤러):

| 엔드포인트 | 가드 | 동작 | FR/SC |
|---|---|---|---|
| `POST /settlements` | JwtAuthGuard + AdminGuard | `{sellerId, periodStart, periodEnd}` → 집계 정산 생성, 201 | FR-004 / SC-004 |
| `GET /settlements` | JwtAuthGuard | getApprovedSeller(미승인 403) → 본인 정산 최신순 | FR-006 / SC-006 |
| `GET /admin/settlements` | JwtAuthGuard + AdminGuard | 전체 정산 최신순 | FR-006 / SC-006 |

**핵심 분기 로직(FR-004·005)**:
```
rate = new Prisma.Decimal(COMMISSION_RATE)            // '0.1'
items = orderService.getCompletedItemsForSettlement(sellerId, start, end)   // [{orderId, orderItemId, saleAmount}]
totalSales = items.reduce((acc, i) => acc.add(i.saleAmount), Decimal(0))
commission = totalSales.mul(rate).toDecimalPlaces(2, ROUND_HALF_UP)
payoutAmount = totalSales.minus(commission)
runInTransaction:
  created = createSettlement({sellerId, periodStart, periodEnd, totalSales, commission, payoutAmount, status:pending})
  if (items.length > 0):
    createItems(items.map(i => ({settlementId: created.id, orderId, orderItemId,
                                 saleAmount: i.saleAmount,
                                 commissionAmount: i.saleAmount.mul(rate).toDecimalPlaces(2, ROUND_HALF_UP)})))
return findById(created.id)   // include items
```

### 3. order 모듈 신규 공개 메서드 — FR-001~005 (shipping/settlement DI contract)

```ts
// OrderService (additive 공개 메서드)
async markShipped(orderId: string, sellerId: string): Promise<void>;
//  order 미존재 404, 항목 sellerId 불일치 403, status≠preparing 400 → updateStatus(shipped) + appendEvent(SELLER)
async markDelivered(orderId: string, sellerId: string): Promise<void>;
//  order 미존재 404, sellerId 불일치 403, 이미 delivered 멱등 no-op, status≠shipped 400 → updateStatus(delivered, deliveredAt) + appendEvent
async getOrderOwnership(orderId: string): Promise<{ userId: string; sellerIds: string[] }>;
//  order 미존재 404. sellerIds = unique(items.sellerId)
async getCompletedItemsForSettlement(sellerId, periodStart, periodEnd):
  Promise<Array<{ orderId; orderItemId; saleAmount: Prisma.Decimal }>>;
//  repository.findCompletedItemsBySellerInPeriod → saleAmount = Decimal(unitPrice) * quantity
```

---

## 결정 기록 (ADRs)

| ADR-ID | 결정 항목 | 채택안 | 대안(검토했으나 미채택) | 근거(spec FR/NFR) | 영향 범위 |
|---|---|---|---|---|---|
| ADR-001 | 배송 테이블 스키마 위치 | shipping 테이블을 물리적 `orders` 스키마에 배치하되 논리 소유는 shipping 모듈(order 테이블 미접근) | 별도 `shipping` 스키마 신설(추가 스키마 관리 비용) | P-001, NFR-003 | schema.prisma, ShippingRepository |
| ADR-002 | 정산 테이블 스키마 위치 | 신규 `settlements` 스키마 신설 | commerce/orders 스키마에 합류(도메인 경계 모호) | P-001, P-003 | schema.prisma, SettlementRepository |
| ADR-003 | 주문↔배송 상태 전이 결합 | shipping 트랜잭션 내 `OrderService.markShipped`·`markDelivered` DI 호출(원자성) | shipping 이 order 테이블 직접 UPDATE(P-001 위반) | FR-001·002, NFR-002, P-001 | shipping.service, order.service |
| ADR-004 | 추적 권한 3축 판정 | `getOrderOwnership` 로 `{userId, sellerIds}` 획득 후 구매자/판매자 OR 판정. 판매자 축은 `getApprovedSeller` try/catch | shipping 이 order/seller 직접 조회(P-001 위반) | FR-003, NFR-005, P-001 | shipping.service.getTracking |
| ADR-005 | 정산 금전 계산 | 전 과정 `Prisma.Decimal` + `.toDecimalPlaces(2, ROUND_HALF_UP)`. `COMMISSION_RATE='0.1'` 문자열 상수 | Number 변환 후 계산(부동소수점 — P-005 위반) | FR-005, NFR-001, P-005 | settlement.service, settlement.constants |
| ADR-006 | tracking append-only | `shipment_tracking` UPDATE/DELETE 미사용, create 만(이력 무결성). `occurredAt desc` 인덱스 | shipment 단일 status 컬럼만(이력 손실) | FR-002·003 | shipping.repository, schema.prisma |
| ADR-007 | 정산 기간 기준 시각 | 주문 `createdAt` 기준 집계(전용 completedAt 부재) | 주문에 completedAt 컬럼 추가(범위 확대) | FR-004 | order.repository.findCompletedItemsBySellerInPeriod. **한계: GAP-005-02** |
| ADR-008 | 배송 이벤트 발행 시점 | `onAfterCommit` 으로 커밋 후 `shipping.shipped`·`shipping.delivered` 발행(tx 오염 방지) | 트랜잭션 내 emit(핸들러 쿼리 tx 편입) | FR-001·002 | shipping.service |

> **PATCH-003 (NFR 성능 직결 파라미터)**: 본 spec 은 P95 수치 NFR 없음. 정산 집계는 관리자 수동 트리거(저빈도). 정산 집계 쿼리는 `(sellerId, createdAt)` 인덱스 + `items.some({sellerId})` 필터로 처리.

---

## 인터페이스 계약

### 권한·상태 전이 엔드포인트 인가 3축

> 상세는 spec.md [권한 평가 결과](../spec/spec.md#권한-평가-결과-patch-001) 참조.

| 엔드포인트 | (a) 호출자 신원 | (b) 자원 소유권 | (c) 역할 |
|---|---|---|---|
| `POST /shipments` | JWT | markShipped 주문 항목 sellerId 일치 | getApprovedSeller(APPROVED) |
| `PATCH /shipments/:id/status` | JWT | getOrderOwnership.sellerIds 포함 | getApprovedSeller |
| `GET /shipments/:id/tracking` | JWT | **구매자 userId 또는 판매자 sellerIds**(IDOR 차단) | — |
| `POST /settlements` | JWT | — | AdminGuard(fail-closed) |
| `GET /settlements` | JWT | listBySeller(seller.id) 본인만 | getApprovedSeller |
| `GET /admin/settlements` | JWT | — | AdminGuard |

### 005 가 소비하는 003 공개 인터페이스 (DI)

```ts
// modules/order/order.service.ts — 003 실재 + 005 신규 공개
class OrderService {
  // 005 신규 (shipping/settlement DI contract)
  markShipped(orderId: string, sellerId: string): Promise<void>;       // preparing→shipped (404/403/400)
  markDelivered(orderId: string, sellerId: string): Promise<void>;     // shipped→delivered, 멱등 (404/403/400)
  getOrderOwnership(orderId: string): Promise<{ userId: string; sellerIds: string[] }>;  // 404
  getCompletedItemsForSettlement(sellerId, periodStart, periodEnd):
    Promise<Array<{ orderId; orderItemId; saleAmount: Prisma.Decimal }>>;
}
// modules/seller/seller.service.ts — 003 실재
class SellerService { getApprovedSeller(userId): Promise<{ id; userId }>; }  // 미승인 ForbiddenException
```

### 005 신규 공개 인터페이스 (모듈 간 DI)

```ts
class ShippingService {  // exports
  createShipment(userId, {orderId, carrier, trackingNumber}): Promise<Shipment>;
  updateStatus(userId, shipmentId, newStatus: ShipmentStatus, description?): Promise<Shipment>;
  getTracking(userId, shipmentId): Promise<ShipmentTracking[]>;
}
class SettlementService {  // exports
  createSettlement(sellerId, periodStart: Date, periodEnd: Date): Promise<SettlementWithItems>;
  listMySettlements(userId): Promise<Settlement[]>;
  listAll(): Promise<Settlement[]>;
}
```

### 트랜잭션 경계 계약 (NFR-002)

- **송장 등록(FR-001)**: `runInTransaction` 안에서 `markShipped`(order 전이) → `createShipment` → `appendTracking`. 어느 단계 실패 → 전체 롤백(주문 전이·shipment·tracking 미반영). 커밋 후 `onAfterCommit(emit shipping.shipped)`.
- **배송 완료(FR-002)**: `runInTransaction` 안에서 `updateShipment` → `appendTracking` → (delivered면) `markDelivered`. 실패 시 전체 롤백.
- **정산 생성(FR-004)**: `runInTransaction` 안에서 `createSettlement` → (항목>0면) `createItems`. 실패 시 전체 롤백.
- **전파 메커니즘**: shipping/settlement repository 가 `this.prisma.tx` 사용 → ALS 활성 트랜잭션 자동 참여(003 인프라). OrderService 메서드도 동일 tx 클라이언트로 발행.

### 하위 호환성 / 방어 코드

- order 모듈 신규 메서드는 전부 additive 공개 → 003/004 기존 동작 불변.
- `markDelivered` 멱등(이미 delivered 면 no-op) — 재호출 안전.
- `getTracking` 의 판매자 축 판정은 `_resolveSellerId`(getApprovedSeller try/catch → null) 로 미승인 판매자 예외를 흡수 → 권한 판정 오류 없이 403.
- `findById` null → NotFoundException(404) 방어.
- 집계 항목 0건 → 금액 0 정산, createItems 미호출(빈 createMany 회피).

---

## 데이터 모델

> 상세 컬럼·타입·인덱스·제약·마이그레이션은 **Database Design Agent**(selection-phases.md: Y)가 [../db-design/data-model.md](../db-design/data-model.md) 로 확정. 본 절은 plan 수준 목표 구조.

### orders 스키마 (shipping 신규 2테이블)

| 테이블 | 핵심 필드 | 제약·인덱스 | 모듈 |
|---|---|---|---|
| `orders.shipments` | `id`, `orderId`(plain String — orders.orders.id, FK 미선언), `status`(enum, default preparing), `carrier`, `trackingNumber`, `shippedAt?`, `deliveredAt?`, `createdAt`, `tracking[]` | index(orderId) — FR-002/003 조회 | shipping |
| `orders.shipment_tracking` | `id`, `shipmentId`(동일 모듈 FK), `status`(enum), `description`, `occurredAt` | index(shipmentId, occurredAt desc) — FR-003 cursor, FK CASCADE | shipping |

### settlements 스키마 (정산 신규 2테이블)

| 테이블 | 핵심 필드 | 제약·인덱스 | 모듈 |
|---|---|---|---|
| `settlements.settlements` | `id`, `sellerId`(plain String — users.sellers.id), `periodStart`, `periodEnd`, `totalSales Decimal(12,2)`, `commission Decimal(12,2)`, `payoutAmount Decimal(12,2)`, `status`(enum, default pending), `createdAt`, `items[]` | index(sellerId, createdAt desc) — FR-006 조회 | settlement |
| `settlements.settlement_items` | `id`, `settlementId`(동일 모듈 FK), `orderId`·`orderItemId`(plain String — orders, P-001), `saleAmount Decimal(12,2)`, `commissionAmount Decimal(12,2)` | index(settlementId), FK CASCADE | settlement |

### 스키마 enum 신규

| enum | 스키마 | 값 | 근거 |
|---|---|---|---|
| `ShipmentStatus` | orders | preparing, shipped, in_transit, delivered | FR-001/002 배송 전이 |
| `SettlementStatus` | settlements | pending, completed | FR-004(생성 pending), 지급 완료(completed) 후속 |

> **P-001/NFR-003 핵심**: `shipments.orderId`·`settlements.sellerId`·`settlement_items.orderId/orderItemId` 는 전부 cross-schema/cross-module 경계 → **Prisma `@relation` 미선언 plain String**(003 패턴 승계). 동일 스키마 내 FK(`shipment_tracking.shipmentId`↔`shipments`, `settlement_items.settlementId`↔`settlements`)만 정상 선언.

---

## 테스트 전략

> 테스트 수준: 단위/정적. spec 의 모든 SC 가 [env:unit] 또는 [env:static]. 통합·E2E 대상 없음(단일 앱 내 DI/tx).

### SC↔테스트 매핑 (요약)

| SC 식별자 | 수준 | 유형 | 시나리오 요약 | 입력 | 기대 결과 |
|---|---|---|---|---|---|
| SC-001 | 단위 | Happy/Error | 송장 등록 + 주문 shipped 전이 / 미승인 403 / preparing 아님 전파 | APPROVED 판매자 createShipment | markShipped 호출·shipment(shipped)·tracking·event |
| SC-002 | 단위 | Happy/Edge | delivered 시 markDelivered, in_transit 시 미호출 | updateStatus(delivered/in_transit) | markDelivered 호출/미호출·event |
| SC-003 | 단위 | Happy/Error | 추적 조회 권한 3축 | 구매자/판매자/제3자/없음 | 200(tracking) / 403 / 404 |
| SC-004 | 단위 | Happy/Edge | 정산 생성, 빈 집계 0금액 | createSettlement | settlement(pending)+items / 0금액·createItems 미호출 |
| SC-005 | 단위 | Happy/Edge | Decimal 금전 계산·반올림 | items saleAmount | totalSales/commission/payoutAmount 정확·HALF_UP |
| SC-006 | 단위 | Happy/Error | 본인/전체 정산 조회 | listMySettlements/listAll | 본인 정산 / 미승인 403 / 전체 |
| SC-050 | 정적 | — | 정산 금전 필드 Decimal | grep schema.prisma | totalSales·commission·payoutAmount·saleAmount·commissionAmount Decimal |
| SC-051 | 정적 | — | shipping/settlement repo cross-schema 0 | grep repository | order/product/user 모델 미참조 |
| SC-052 | 정적 | — | `@aws-sdk/*` 신규 0 | grep package.json | 미추가 |

### smoke_tests

- 필요 여부: N
- 근거: 005 변경은 shipping/settlement 신규 모듈 + order 의 additive 공개 메서드(기존 전이 경로 불변). order/payment/coupon/review 의 기존 테스트가 회귀 경계를 감지. AppModule 부팅(ShippingModule·SettlementModule DI 정상) 으로 와이어링 회귀 확인.

---

## 기타 고려사항

- **정산 중복 집계 멱등 미보장**: `getCompletedItemsForSettlement` 가 기집계 항목을 제외하지 않고 `SettlementItem.orderItemId` 에 unique 제약이 없어, 동일/겹치는 기간 재정산 시 동일 항목이 중복 지급액에 반영될 수 있다. admin-only 트리거이므로 운영 절차 위험으로 허용·기록(GAP-005-01, SEC-FIND-005-01). 후속 정산 보강 spec.
- **정산 기간 필터 createdAt 기준**: 전용 `completedAt` 부재로 정산 주기 산정에 한계(ADR-007, GAP-005-02). 정확 산정 필요 시 주문 completedAt 컬럼 추가 검토.
- **마이그레이션 드리프트**: 005 마이그레이션 SQL(`20260629080659_005_shipping_settlement`)에 004(coupons·user_coupons·reviews) 테이블 생성도 함께 캡처됨. 004 모델이 schema.prisma 엔 있었으나 별도 마이그레이션이 없던 기존 드리프트가 `migrate dev` 에서 함께 잡힌 것. DB 정상 동기화 상태(GAP-005-03). 마이그레이션 히스토리 정리는 백엔드 전체 완료 후 검토.
- **배송 상태 전이 검증 위치**: 주문 상태 검증(`preparing`/`shipped`)·판매자 소유권은 전부 `OrderService.markShipped`/`markDelivered` 가 담당(shipping 은 상태머신을 직접 알지 않음, P-001). shipping 은 shipment/tracking 무결성만 책임.
- **EventEmitter tx 전파 주의**: `shipping.shipped`·`shipping.delivered` 는 `onAfterCommit` 으로 커밋 후 발행(003 ADR-005 승계). settlement 이벤트는 본 spec 에서 미발행(스캐폴드만).
