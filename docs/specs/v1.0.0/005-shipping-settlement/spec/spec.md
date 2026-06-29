---
작성: Spec Agent
버전: v1.0
최종 수정: 2026-06-29 17:30
상태: 확정 (구현 완료 — retroactive 문서화)
---

# Spec: 005-shipping-settlement

> Branch: 005-shipping-settlement | Date: 2026-06-29 | Version: v1.0.0
>
> 본 문서는 이미 구현·검증이 완료된 코드(커밋 `47f09c1`·`b174133`)를 근거로 정식 SDD 포맷으로
> retroactive 작성되었다. 모든 요구사항·수용 기준은 실제 구현된 `shipping`·`settlement` 모듈과
> `order` 모듈 연동 코드에서 확인한 사실을 기준으로 한다.

## 목차

- [배경 및 목적](#배경-및-목적)
- [선행 spec 영향 추적](#선행-spec-영향-추적)
- [사용자 스토리](#사용자-스토리)
- [기능 요구사항](#기능-요구사항)
- [비기능 요구사항](#비기능-요구사항)
- [수용 기준](#수용-기준)
- [요구사항 구조화 매트릭스](#요구사항-구조화-매트릭스)
- [권한 평가 결과 (PATCH-001)](#권한-평가-결과-patch-001)
- [범위 외](#범위-외)
- [미결 사항](#미결-사항)

---

## 배경 및 목적

003-commerce(장바구니·주문·결제)와 004-review-coupon(리뷰·쿠폰) 완료 이후, 주문 이행(배송)과
판매자 정산 도메인을 구현한다. 주문 상태머신은 003에서 `pending → confirmed → preparing → shipped
→ delivered → completed` 전이를 정의했으나, `preparing → shipped`(송장 등록)·`shipped → delivered`
(배송 완료) 전이를 트리거하는 주체(배송)가 부재했다. 또한 `completed` 주문항목의 매출을 판매자에게
정산하는 흐름이 없었다.

**배송(Shipping)**
- APPROVED 판매자가 결제 완료(`preparing`) 주문에 송장(택배사·운송장번호)을 등록하여 주문을
  `preparing → shipped`로 전이한다.
- 판매자가 배송 상태를 업데이트하며, `delivered` 전이 시 주문을 `shipped → delivered`로 전이한다.
- 구매자 본인 또는 해당 주문 판매자가 배송 추적 이력을 조회한다(권한 3축).
- `orders` 스키마에 `shipments`·`shipment_tracking` 테이블을 추가한다. 단, 두 테이블은 물리적으로
  `orders` 스키마에 위치하되 논리적 소유는 shipping 모듈이며, order 모듈 소유 테이블(`orders`·
  `order_items`·`order_events`)에는 직접 접근하지 않는다(P-001).

**정산(Settlement)**
- 관리자가 특정 판매자의 기간 내 `completed` 주문항목 매출을 집계하여 정산 레코드를 생성한다.
- 정산액 계산: `totalSales = Σ(unitPrice × quantity)`, `commission = totalSales × 10%`(ROUND_HALF_UP
  2자리), `payoutAmount = totalSales − commission`. 전 과정 Prisma Decimal(부동소수점 금지, P-005).
- 판매자는 본인 정산만, 관리자는 전체 정산을 조회한다.
- 신규 `settlements` 스키마에 `settlements`·`settlement_items` 테이블을 추가한다.

---

## 선행 spec 영향 추적

| 선행 spec | 식별된 연동 항목 | 인지 시점 | 식별 경로 |
|---|---|---|---|
| v1.0.0/003-commerce | 주문 상태머신의 `preparing → shipped`·`shipped → delivered` 전이가 정의만 되고 트리거 부재. 005가 `OrderService.markShipped`·`markDelivered` 신규 공개 메서드로 전이를 구동. `getCompletedItemsForSettlement`로 `completed` 주문항목 매출을 정산에 공급. | 2026-06-29 | 003-commerce 주문 상태머신(context.md §3.3) |
| v1.0.0/003-commerce | `order_items.sellerId`·`unitPrice`·`quantity` 필드를 정산 집계에 사용(매출 = unitPrice × quantity). 정산 모듈은 이 데이터를 `OrderService` DI 경유로만 획득(P-001). | 2026-06-29 | 003-commerce order_items 스키마 |

---

## 사용자 스토리

- **US-001**: APPROVED 판매자로서, 결제 완료된 본인 주문에 송장(택배사·운송장번호)을 등록하여
  주문을 발송 처리하고 싶다.
- **US-002**: APPROVED 판매자로서, 배송 진행 상태를 업데이트하고 배송 완료를 처리하고 싶다.
- **US-003**: 구매자로서, 내가 주문한 상품의 배송 추적 이력을 조회하고 싶다. 판매자로서도 본인이
  발송한 주문의 추적 이력을 조회하고 싶다. 제3자에게는 노출되지 않기를 원한다.
- **US-004**: 관리자로서, 특정 판매자의 기간 내 판매 완료 매출을 집계하여 정산을 생성하고 싶다.
- **US-005**: 판매자로서, 내 정산 내역(총매출·수수료·실지급액)을 조회하고 싶다. 관리자로서는
  전체 판매자의 정산 내역을 조회하고 싶다.

---

## 기능 요구사항

### 배송 (Shipping)

- **FR-001**: APPROVED 판매자는 `POST /shipments` 로 본인 주문에 송장(`orderId`·`carrier`·
  `trackingNumber`)을 등록할 수 있다. 등록 성공 시 주문 상태가 `preparing → shipped`로 전이되고,
  shipment 레코드(status=`shipped`, `shippedAt` 기록)와 첫 추적 이력(append-only)이 단일 트랜잭션으로
  생성된다. APPROVED 상태가 아닌 판매자는 HTTP 403을 반환한다. 주문 판매자가 아니거나 주문 상태가
  `preparing`이 아니면 `OrderService.markShipped`가 각각 403·400을 반환한다.

- **FR-002**: 판매자는 `PATCH /shipments/:id/status` 로 배송 상태(`shipped`·`in_transit`·`delivered`)를
  업데이트할 수 있다. 추적 이력이 append-only로 누적되며, `delivered` 전이 시 주문 상태가
  `shipped → delivered`로 전이되고 `order.deliveredAt`이 기록된다. 해당 주문의 판매자가 아니면 403,
  shipment가 없으면 404를 반환한다.

- **FR-003**: 배송 추적 조회(`GET /shipments/:id/tracking`)는 권한 3축으로 제한된다 — 주문 구매자
  본인(`order.userId`) 또는 해당 주문의 판매자(`getOrderOwnership.sellerIds` 포함)만 200으로 추적
  이력(최신순)을 받는다. 둘 다 아닌 제3자는 403을 반환한다. 미승인·미등록 판매자는 권한 판정에서
  판매자 축으로 인정되지 않는다.

### 정산 (Settlement)

- **FR-004**: 관리자는 `POST /settlements`(AdminGuard) 로 특정 판매자(`sellerId`)의 기간
  (`periodStart`·`periodEnd`) 내 `completed` 주문항목을 집계하여 정산을 생성한다. settlement 레코드와
  항목별 settlement_items(`orderId`·`orderItemId`·`saleAmount`·`commissionAmount`)를 단일 트랜잭션으로
  생성한다. 집계 대상 항목이 없으면 금액 0의 정산(항목 0건)이 생성된다.

- **FR-005**: 정산 금액 계산은 전 과정 Prisma Decimal로 수행한다(부동소수점 금지).
  - 항목 매출: `saleAmount = unitPrice × quantity`
  - 총매출: `totalSales = Σ saleAmount`
  - 수수료: `commission = totalSales × COMMISSION_RATE(0.1)` — ROUND_HALF_UP, 소수 2자리
  - 실지급액: `payoutAmount = totalSales − commission`
  - 항목 수수료: `commissionAmount = saleAmount × COMMISSION_RATE` — ROUND_HALF_UP, 소수 2자리

- **FR-006**: 판매자는 `GET /settlements` 로 본인 정산 내역만(최신순), 관리자는
  `GET /admin/settlements`(AdminGuard) 로 전체 정산 내역(최신순)을 조회한다. 판매자 조회는 미승인
  판매자에게 403을 반환한다.

---

## 비기능 요구사항

- **NFR-001**: `shipments`·`shipment_tracking`에는 금전 필드가 없으며, `settlements`의 `totalSales`·
  `commission`·`payoutAmount`와 `settlement_items`의 `saleAmount`·`commissionAmount` 등 금전 관련
  모든 수치는 Prisma `Decimal @db.Decimal(12,2)`로 선언한다. `Float` 사용을 금지한다(P-005). 정산
  계산 중간 과정에서도 부동소수점 연산을 하지 않는다(`COMMISSION_RATE`는 문자열 `'0.1'`로 선언).

- **NFR-002**: 배송 송장 등록(주문 `preparing → shipped` 전이 + shipment·tracking 생성)과 배송 완료
  (shipment 갱신 + tracking 추가 + 주문 `shipped → delivered` 전이), 정산 생성(settlement +
  settlement_items)은 각각 단일 트랜잭션으로 처리되어 부분 반영이 발생하지 않는다(003 ALS
  `runInTransaction` 재사용).

- **NFR-003**: `shipping`·`settlement` 모듈의 Repository는 자신의 소유 테이블에만 Prisma Client로
  직접 접근한다 — shipping은 `orders.shipments`·`orders.shipment_tracking`, settlement은
  `settlements.settlements`·`settlements.settlement_items`. order 모듈 소유 테이블(`orders`·
  `order_items`·`order_events`)에 대한 직접 쿼리는 금지되며, 타 도메인 데이터는 `OrderService`·
  `SellerService` DI 경유로만 접근한다(P-001). cross-schema/cross-module 참조는 plain String(FK 미선언).

- **NFR-004**: 인증이 필요한 모든 엔드포인트는 유효하지 않거나 없는 JWT 토큰으로 요청 시 HTTP 401을
  반환한다(`JwtAuthGuard`). 정산 생성·전체 조회는 `AdminGuard`(fail-closed)로 추가 보호된다.

- **NFR-005**: 배송 추적 조회는 자원 소유권(구매자 `order.userId` 또는 판매자 `sellerIds`)을 서버에서
  검증하여 제3자 정보 노출(IDOR)을 차단한다. 상세는 [권한 평가 결과](#권한-평가-결과-patch-001) 참조.

- **NFR-006**: AWS 전용 SDK(`@aws-sdk/*`) 또는 서비스를 신규 의존으로 추가하지 않는다(P-002, P-004).
  신규 npm 의존성 0건.

---

## 수용 기준

> **환경 태그 규약**:
> | 태그 | 의미 |
> |---|---|
> | `[env:static]` | 코드·설정·스키마 파일 존재·구조 검증만으로 판정 가능 |
> | `[env:unit]` | 단위 테스트(mock)로 판정 가능 |

### 배송 SC

- **SC-001** (`FR-001` 관련): APPROVED 판매자가 본인 `preparing` 주문에 송장 등록 시 shipment(status=
  `shipped`)·첫 tracking이 생성되고 `OrderService.markShipped(orderId, seller.id)`가 호출되어 주문이
  `shipped`로 전이된다. `shipping.shipped` 이벤트가 커밋 후 발행된다. 미승인 판매자는 403, 주문이
  `preparing`이 아니면 `markShipped` 예외(400)가 전파되며 shipment는 생성되지 않는다. [env:unit]

- **SC-002** (`FR-002` 관련): 판매자가 `status=delivered`로 상태 업데이트 시 shipment가 갱신되고
  `OrderService.markDelivered(orderId, seller.id)`가 호출되어 주문이 `delivered`로 전이되며
  `shipping.delivered` 이벤트가 발행된다. `status=in_transit`이면 `markDelivered`는 호출되지 않는다.
  [env:unit]

- **SC-003** (`FR-003`·`NFR-005` 관련): 배송 추적 조회는 구매자 본인 또는 해당 주문 판매자만 추적
  이력을 받고(200), 제3자(미승인/타 판매자 포함)는 403을 받는다. shipment가 없으면 404. [env:unit]

### 정산 SC

- **SC-004** (`FR-004` 관련): 관리자가 정산 생성 시 `getCompletedItemsForSettlement`로 집계한 항목으로
  settlement(status=`pending`)과 settlement_items가 단일 트랜잭션으로 생성된다. 집계 항목이 0건이면
  금액 0의 정산이 생성되고 `createItems`는 호출되지 않는다. [env:unit]

- **SC-005** (`FR-005` 관련): 정산 금액이 Decimal로 정확히 계산된다 — 예: 항목 saleAmount 10000·23455
  → totalSales=33455, commission=3345.5, payoutAmount=30109.5, 항목 commissionAmount 1000·2345.5.
  반올림 케이스: saleAmount=100.05 → commission=10.01(ROUND_HALF_UP), payoutAmount=90.04. [env:unit]

- **SC-006** (`FR-006`·`NFR-004` 관련): 판매자가 `GET /settlements` 호출 시 본인 정산만(`listBySeller
  (seller.id)`) 반환된다. 미승인 판매자는 403. 관리자가 `GET /admin/settlements` 호출 시 전체 정산이
  반환된다. [env:unit]

### 비기능 SC

- **SC-050** (`NFR-001` 관련): `schema.prisma`의 `settlements`·`settlement_items` 금전 필드
  (`totalSales`·`commission`·`payoutAmount`·`saleAmount`·`commissionAmount`)가 모두 `Decimal` 타입으로
  선언된다. `Float` 타입 금전 필드가 없다. [env:static]

- **SC-051** (`NFR-003` 관련): `shipping`·`settlement` 모듈 Repository 구현 파일이 자신의 소유 스키마
  외 타 도메인 Prisma 모델(`order`·`orderItem`·`orderEvent`·`product`·`user`·`seller` 등)을 직접
  참조하지 않는다(grep 정적 검사 — `cross-schema.spec.ts`의 ShippingRepository·SettlementRepository
  규칙). [env:static]

- **SC-052** (`NFR-006` 관련): `apps/backend/package.json`의 `dependencies`·`devDependencies`에
  `@aws-sdk/*` 패키지가 신규 추가되지 않는다(`package-no-aws.spec.ts`). [env:static]

---

## 요구사항 구조화 매트릭스

> 매핑 누락(SC 없는 FR/NFR, FR/NFR 없는 SC) 0건이 완료 조건.
> MoSCoW: Must / Should / Could / Won't

| US-ID | FR-ID | NFR-ID | SC-ID | [env:*] | MoSCoW |
|---|---|---|---|---|---|
| US-001 | FR-001 | NFR-002, NFR-004 | SC-001 | unit | Must |
| US-002 | FR-002 | NFR-002 | SC-002 | unit | Must |
| US-003 | FR-003 | NFR-005 | SC-003 | unit | Must |
| US-004 | FR-004 | NFR-002 | SC-004 | unit | Must |
| US-004 | FR-005 | NFR-001 | SC-005 | unit | Must |
| US-005 | FR-006 | NFR-004 | SC-006 | unit | Must |
| — | — | NFR-001 | SC-050 | static | Must |
| — | — | NFR-003 | SC-051 | static | Must |
| — | — | NFR-006 | SC-052 | static | Must |

---

## 권한 평가 결과 (PATCH-001)

> 배송·정산 엔드포인트에 대해 인가 3축(호출자 신원·자원 소유권·역할) 평가.

| 엔드포인트 | 위험도 | (a) 호출자 신원 | (b) 자원 소유권 | (c) 역할 | 대응 SC |
|---|---|---|---|---|---|
| `POST /shipments` | 중간 | JWT | `OrderService.markShipped`가 주문 항목 sellerId 일치 검증 | `getApprovedSeller`(APPROVED, 미승인 403) | SC-001 |
| `PATCH /shipments/:id/status` | 중간 | JWT | `getOrderOwnership.sellerIds`에 seller.id 포함 검증(불일치 403) | `getApprovedSeller` | SC-002 |
| `GET /shipments/:id/tracking` | 중간 | JWT | **구매자 `order.userId===me` 또는 판매자 `sellerIds.includes(seller.id)`**(둘 다 아니면 403) | — | SC-003 |
| `POST /settlements` | 높음(금전) | JWT | — (생성, 관리자 임의 sellerId 지정 허용) | AdminGuard(fail-closed) | SC-004·SC-006 |
| `GET /settlements` | 낮음 | JWT | `listBySeller(seller.id)` 본인만 | `getApprovedSeller`(미승인 403) | SC-006 |
| `GET /admin/settlements` | 중간 | JWT | — | AdminGuard | SC-006 |

**잠재 위험 기록 (허용·기록):**
- **정산 중복 집계 미차단(Medium, GAP-005-01)**: `createSettlement`가 이미 정산에 포함된 `order_item`을
  제외하지 않고, `SettlementItem.orderItemId`에 unique 제약이 없어, 동일/겹치는 기간으로 재정산 시
  동일 항목이 중복 지급액에 반영될 수 있다. 트리거가 admin-only(`AdminGuard`)이므로 외부 악용이 아닌
  운영 절차 위험으로 분류하여 허용·기록한다. 후속 정산 보강 spec에서 멱등성/제약 추가 검토.
- **정산 기간 필터가 주문 `createdAt` 기준(GAP-005-02)**: 전용 `completedAt` 컬럼 부재로 정산 주기
  산정에 한계. 본 spec은 단순화하여 `createdAt` 기준으로 집계한다.

---

## 범위 외

- **실제 택배사 API 연동**: 운송장 실시간 추적·자동 상태 전이 — 송장 번호 저장 및 수동 상태 전이까지만.
- **정산 지급 실행(실제 이체)**: 정산 레코드 생성·조회까지만. `status`는 `pending`(집계 완료·지급 대기)
  으로 생성되며 `completed`(지급 완료) 전이 엔드포인트는 본 spec 범위 외.
- **정산 중복 집계 차단(멱등성)**: `SettlementItem.orderItemId` unique 제약 및 기집계 항목 제외 로직 —
  후속 정산 보강 spec(GAP-005-01).
- **정산 전용 `completedAt` 컬럼**: 주문에 정산 기준 시각 컬럼 추가 — 후속 검토(GAP-005-02).
- **배송비·반품·교환**: 후속 spec.
- **알림(Notification)·검색(Search)·파일(File) 모듈 연동**: Stage 3+ 후속 spec.

---

## 미결 사항

없음 — 본 spec은 구현 완료 코드를 기준으로 retroactive 작성되었으며, 모든 요구사항·수용 기준이 실제
구현과 대조 확인되었다. 식별된 공백은 [범위 외](#범위-외) 및 `gaps.md`(GAP-005-01~03)에 기록한다.
