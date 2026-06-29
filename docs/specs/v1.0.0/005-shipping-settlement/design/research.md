---
작성: Design Agent
버전: v1.0
최종 수정: 2026-06-29 17:30
상태: 확정 (retroactive)
---

# Research: 005-shipping-settlement

## 목차

- [분석 우선순위 게이트 결과](#분석-우선순위-게이트-결과)
- [기존 코드베이스 분석](#기존-코드베이스-분석)
  - [클래스·모듈 계층 구조](#클래스모듈-계층-구조)
  - [영향 범위 분석 (호출 측 전수 목록)](#영향-범위-분석-호출-측-전수-목록)
  - [공유 상태·동시성 분석](#공유-상태동시성-분석)
- [영향 파일 목록](#영향-파일-목록)
- [외부 라이브러리 API 실제 동작 확인](#외부-라이브러리-api-실제-동작-확인)
- [기술 선택 조사](#기술-선택-조사)
- [엣지 케이스 및 한계](#엣지-케이스-및-한계)

---

## 분석 우선순위 게이트 결과

- **변경 대상 모듈(plan §핵심 설계)**: `shipping`(빈 스텁 실구현), `settlement`(빈 스텁 실구현), `order`(markShipped·markDelivered·getOrderOwnership·getCompletedItemsForSettlement 신규 공개 + repository.findCompletedItemsBySellerInPeriod), `prisma`(ALS 재사용, 변경 0), `schema.prisma`(orders 2테이블 + settlements 2테이블 — Database Design Agent 소유).
- §A·B·C 분석은 위 모듈로 한정.
- §D(다단계 병렬 파이프라인): 미해당.
- §E(동일 가드 결정 통합): 배송 추적 권한 3축(구매자 OR 판매자)에 적용 — 본문 [엣지 케이스](#엣지-케이스-및-한계) 참조.
- 외부 라이브러리 검증(§4): **신규 라이브러리 0건**. 기존 `Prisma.Decimal`(`.toDecimalPlaces`·`ROUND_HALF_UP`) 만 신규 사용 메서드 — 아래 검증.
- §F(production 시그니처 변경): **해당 없음** — order 모듈은 신규 공개 메서드 추가(additive)이며 기존 메서드 시그니처 변경 없음. 기존 호출 측 영향 0.

---

## 기존 코드베이스 분석

> context.md §2 핵심 모듈 목록을 기준선. 본 절은 변경 대상 한정 정밀 분석.

### 클래스·모듈 계층 구조

- **OOP 상속/추상 클래스 없음**: 변경 대상은 전부 NestJS `@Injectable()` concrete 클래스. 신규 클래스(ShippingService·SettlementService 등)는 상속 없이 직접 인스턴스화(NestJS DI).
- **모듈 DI 토폴로지(실측)**:
  - `ShippingService` 생성자(실측 `shipping.service.ts:15-21`): `ShippingRepository`, `PrismaService`, `OrderService`, `SellerService`, `EventEmitter2`.
  - `ShippingModule.imports`(실측 `shipping.module.ts`): `AuthSharedModule, OrderModule, SellerModule`. exports `ShippingService`.
  - `SettlementService` 생성자(실측 `settlement.service.ts:11-16`): `SettlementRepository`, `PrismaService`, `OrderService`, `SellerService`.
  - `SettlementModule.imports`: `AuthSharedModule, OrderModule, SellerModule`. controllers `[SettlementController, AdminSettlementController]`. exports `SettlementService`.
  - `OrderModule`(실측): exports `OrderService`(이미 존재 — shipping/settlement DI 소비 가능).
  - `SellerService.getApprovedSeller(userId): Promise<{id; userId}>` — 미승인 시 throw. shipping/settlement 가 DI 소비.

- **순환 DI 점검(신규 의존 관계)**:
  | 관계 | 방향 | 순환? |
  |---|---|---|
  | shipping → order | ShippingModule imports OrderModule, ShippingService uses OrderService | order 는 shipping 미import → **순환 없음** |
  | shipping → seller | ShippingModule imports SellerModule | seller 는 shipping 미import → 순환 없음 |
  | settlement → order | SettlementModule imports OrderModule, SettlementService uses OrderService | order 는 settlement 미import → **순환 없음** |
  | settlement → seller | SettlementModule imports SellerModule | 순환 없음 |
  - 결론: **forwardRef 신규 도입 불필요**. shipping/settlement → order·seller 는 단방향.

### 영향 범위 분석 (호출 측 전수 목록)

- **`OrderService` 신규 공개 메서드(markShipped·markDelivered·getOrderOwnership·getCompletedItemsForSettlement)**: 신규 추가이므로 기존 호출 측 0. shipping/settlement 모듈만 호출(신규). 기존 OrderService 메서드 시그니처 불변 → 003/004 order 테스트 회귀 0.
- **`OrderRepository.findCompletedItemsBySellerInPeriod`**: 신규. OrderService.getCompletedItemsForSettlement 만 호출. 기존 repository 메서드 불변.
- **shipping/settlement 모듈**: 003/004 시점 빈 스텁(골격만) → 실구현. 기존 호출 측 0.
- **AppModule 와이어링**: ShippingModule·SettlementModule 이 AppModule imports 에 등록(부팅 시 DI 해석). health e2e 로 부팅 검증.

### 공유 상태·동시성 분석

- **공유 자원**: `orders.orders.status`(배송 전이 대상 — order 모듈 소유, OrderService 가 갱신), `settlements.settlement_items`(정산 항목 — 멱등 미보장).
- **Check-Then-Act 분석**:
  | 자원 | 위험 | 현재 안전망 | 근거 |
  |---|---|---|---|
  | orders.status (preparing→shipped) | 동일 주문 동시 송장 등록 2건 | `markShipped` 가 `status !== preparing` 시 400 → 두 번째 거부. shipping 트랜잭션 내 실행 | FR-001. row-level 상태 검증 |
  | orders.status (shipped→delivered) | 중복 delivered 전이 | `markDelivered` 멱등(이미 delivered no-op) + status≠shipped 400 | FR-002 |
  | settlement_items (중복 집계) | **동일 항목 재정산 → 중복 지급액** | **안전망 없음** — orderItemId unique 미선언, 기집계 제외 미구현 | **GAP-005-01 / SEC-FIND-005-01** (admin-only 운영 위험) |
- **Lock 범위**: 별도 비관 락 미사용. 배송 전이는 OrderService 의 상태 검증 + 트랜잭션. Lock 내 네트워크/파일 I/O 없음.
- **EventEmitter tx 전파 주의**: `shipping.shipped`·`shipping.delivered` 는 `onAfterCommit(()=>emit)` → 커밋 후 발행(주문 tx 미오염, 003 ADR-005 승계).
- **캐싱 컴포넌트 없음**: in-memory 캐시 도입 없음 → 캐시 생명주기 검토 비해당.

---

## 영향 파일 목록

| 파일 | 변경 유형 | 영향 내용 | 레이어 |
|---|---|---|---|
| `prisma/schema.prisma` | 수정(DB Design 소유) | ShipmentStatus·SettlementStatus enum + Shipment·ShipmentTracking·Settlement·SettlementItem 4모델 | A |
| `prisma/migrations/20260629080659_005_shipping_settlement/migration.sql` | 신규 | 005 테이블·enum·인덱스·FK(004 드리프트 동반 캡처) | A |
| `src/modules/shipping/shipping.repository.ts` | 신규 구현 | shipment/tracking CRUD, append-only tracking | A |
| `src/modules/shipping/shipping.service.ts` | 신규 구현 | createShipment·updateStatus·getTracking(권한 3축) | B |
| `src/modules/shipping/shipping.events.ts` | 신규 구현 | SHIPPING_EVENTS 상수 | B |
| `src/modules/shipping/shipping.controller.ts` | 신규 구현 | POST·PATCH·GET 3 엔드포인트 | C |
| `src/modules/shipping/dto/{create-shipment,update-shipment-status}.dto.ts` | 신규 | 입력 검증 dto | C |
| `src/modules/shipping/shipping.module.ts` | 수정 | imports·providers·exports | C |
| `src/modules/settlement/settlement.repository.ts` | 신규 구현 | settlement/item 생성·조회 | A |
| `src/modules/settlement/settlement.service.ts` | 신규 구현 | createSettlement(Decimal)·listMySettlements·listAll | B |
| `src/modules/settlement/settlement.constants.ts` | 신규 | COMMISSION_RATE='0.1' | B |
| `src/modules/settlement/settlement.controller.ts` | 신규 구현 | SettlementController·AdminSettlementController | C |
| `src/modules/settlement/dto/create-settlement.dto.ts` | 신규 | 입력 검증 dto | C |
| `src/modules/settlement/settlement.module.ts` | 수정 | imports·controllers·exports | C |
| `src/modules/order/order.service.ts` | 수정(additive) | markShipped·markDelivered·getOrderOwnership·getCompletedItemsForSettlement 신규 공개 | B |
| `src/modules/order/order.repository.ts` | 수정(additive) | findCompletedItemsBySellerInPeriod 신규 | A |
| `test/static/cross-schema.spec.ts` | 수정(확장) | ShippingRepository·SettlementRepository 규칙(SC-051) | D |
| `test/static/schema-decimal.spec.ts` | 수정(확장) | 정산 금전 필드 5종 MONEY_FIELDS 추가(SC-050) | D |

> `package.json` 변경 0건(신규 npm 의존 없음 — SC-052 자동 충족).

---

## 외부 라이브러리 API 실제 동작 확인

- **신규 외부 라이브러리: 없음 — 해당 없음**. selection-phases.md 자가 점검 결과 신규 npm 0건.
- **`Prisma.Decimal`(decimal.js)**: 정산 계산에 사용하는 메서드 — 인스턴스 `.add()`·`.mul()`·`.minus()`·`.toDecimalPlaces(dp, rounding)`, 정적 `Prisma.Decimal.ROUND_HALF_UP`. `totalSales = Σ saleAmount`(`.add` 누적), `commission = totalSales.mul(rate).toDecimalPlaces(2, ROUND_HALF_UP)`, `payoutAmount = totalSales.minus(commission)`. 전 과정 Decimal, float 0. `COMMISSION_RATE` 는 문자열 `'0.1'` 를 `new Prisma.Decimal('0.1')` 로 생성(부동소수점 `0.1` 회피). public API 만 사용.
- **`createMany`(SettlementItem)**: Prisma 공식. 빈 배열 회피 위해 `items.length > 0` 가드 후 호출.
- **`findMany` include / orderBy**: settlement findById 는 `include:{items:true}`, listBySeller/listAll 은 `orderBy:{createdAt:desc}`. tracking 은 `orderBy:{occurredAt:desc}`. Prisma 표준.

가정-실제 불일치 현재 미발견.

---

## 기술 선택 조사

| 결정 | 채택 | 근거 |
|---|---|---|
| 배송 테이블 스키마 | 물리적 `orders` 스키마, 논리 소유 shipping 모듈(order 테이블 미접근) | P-001 모듈 경계. 별도 shipping 스키마 신설 대비 스키마 관리 단순화(ADR-001). cross-schema 정적 검사(SC-051)로 order 모델 미참조 보장 |
| 정산 테이블 스키마 | 신규 `settlements` 스키마 | 도메인 경계 명확화(ADR-002). settlement_items.orderId/orderItemId 는 plain String |
| 주문 전이 결합 | shipping 트랜잭션 내 `OrderService.markShipped`/`markDelivered` DI | 배송·주문 전이 원자성(ADR-003). shipping 이 order 테이블 직접 UPDATE 회피(P-001) |
| 추적 권한 3축 | `getOrderOwnership` `{userId, sellerIds}` 후 구매자 OR 판매자. 판매자 축 `getApprovedSeller` try/catch | shipping 이 order/seller 직접 조회 회피(ADR-004). 미승인 판매자 예외를 `_resolveSellerId` 가 흡수 → 권한 판정 오류 없이 403 |
| 정산 금전 계산 | `Prisma.Decimal` + `.toDecimalPlaces(2, ROUND_HALF_UP)`, `COMMISSION_RATE='0.1'` 문자열 | 부동소수점 금지(P-005, ADR-005) |
| tracking append-only | create 만, UPDATE/DELETE 미사용 + `(shipmentId, occurredAt desc)` 인덱스 | 배송 이력 무결성(ADR-006) |
| 정산 기간 기준 | 주문 `createdAt` 기준(전용 completedAt 부재) | 범위 단순화(ADR-007). **한계: 정확 정산주기 산정 제약(GAP-005-02)** |
| 정산 중복 멱등 | **미구현**(허용·기록) | orderItemId unique 미선언, 기집계 제외 미구현. admin-only 운영 위험(GAP-005-01) |

---

## 엣지 케이스 및 한계

- **§E 동일 가드 조건 통합(추적 권한)**: `getTracking` 은 구매자(`ownership.userId === userId`) 와 판매자(`sellerIds.includes(sellerId)`) 를 단일 OR 가드로 판정. 구매자 본인이면 판매자 조회(getApprovedSeller) 자체를 건너뜀(테스트 `when_customer_owner_then_returns_tracking` 가 `getApprovedSeller` 미호출 단언).
- **미승인 판매자 권한 판정**: `_resolveSellerId` 가 `getApprovedSeller` 의 throw 를 try/catch 로 null 변환 → 미승인/미등록 판매자는 판매자 축으로 인정되지 않고 403. 구매자도 판매자도 아니면 403.
- **빈 집계 정산**: `getCompletedItemsForSettlement` 가 빈 배열 반환 시 totalSales/commission/payoutAmount=0, `createItems` 미호출(`items.length > 0` 가드). 정산 레코드는 0금액으로 생성됨(테스트 `when_no_completed_items_then_zero_amounts_and_no_items_created`).
- **markDelivered 멱등**: 이미 delivered 면 no-op(재호출 안전). status≠shipped(이고 delivered 도 아님)이면 400.
- **정산 중복 집계(한계)**: 동일 항목 재정산 시 중복 지급액 산정 가능(GAP-005-01). 막는 테스트 부재(coverage-gap.md).
- **정산 기간 createdAt 기준(한계)**: 주문 완료 시각이 아닌 생성 시각으로 집계(GAP-005-02).
- **마이그레이션 드리프트(한계)**: 005 마이그레이션에 004 테이블 생성이 함께 캡처(GAP-005-03). DB 정상 동기화.
- **settlement.events 스캐폴드**: `settlement.events.ts` 는 빈 파일(이벤트 미발행). 정산 알림은 후속.
