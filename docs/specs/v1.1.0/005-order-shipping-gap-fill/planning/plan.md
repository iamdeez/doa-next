---
작성: Planning Agent
버전: v1.0
최종 수정: 2026-06-30 01:23
상태: 확정 (retroactive)
---

# Plan: 005-order-shipping-gap-fill

> Branch: 005-order-shipping-gap-fill | Date: 2026-06-30 | Spec: [../spec/spec.md](../spec/spec.md)

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

> `constitution.md`(P-001~P-007) 존재 → 해당 조항을 Gates 로 사용한다(constitution 우선). 본 차수의 핵심
> 검토 조항은 **P-001(모듈 경계 — shipping repo 는 자기 스키마, order 데이터는 DI)**·**P-002(신규 의존 0)**·
> **P-005(금전 Decimal)**·**P-007(스펙 범위)** 이며, 권한·동작 정합성은 P-006(테스트 — 단위 +6·e2e·tsc)로
> 검증한다.

- [x] **P-001 모듈 경계 원칙**: [Pass 기준: 다른 도메인 모듈의 스키마 테이블을 직접 참조·쿼리하지 않음]
  → PASS(직접 검토 조항). `ShippingRepository.findByOrderId` 는 **자기 모듈 스키마**(`prisma.tx.shipment`)만
  쿼리한다. shipping 이 필요로 하는 주문 소유 정보는 `OrderService.getOrderOwnership`(DI)를 통해 얻으며,
  order 테이블을 직접 쿼리하지 않는다. `getSellerOrderDetail` 은 order 모듈 내부에서 `orderRepository.findById`
  를 호출한다. 모듈 경계 교차 쿼리 0.
- [x] **P-002 AWS 의존 금지 원칙**: [Pass 기준: `@aws-sdk/*` 및 AWS 전용 SDK 신규 추가 0건]
  → PASS. **신규 의존성 추가 0건**(`package.json` 변경 없음 — numstat 12 파일에 `package.json` 부재). 기존
  NestJS·Prisma·TanStack Query 만 사용.
- [x] **P-003 단일 DB 원칙**: [Pass 기준: 단일 PostgreSQL 외 외부 저장소 0건]
  → PASS(무관). 기존 단일 PostgreSQL(`shipment`·`order` 테이블) 조회만. DB 스키마 변경 0(마이그레이션 없음).
  신규 캐시·큐·저장소 0.
- [x] **P-004 클라우드 중립 원칙**: [Pass 기준: Fly.io 전용 API 결합 0건]
  → PASS. 표준 NestJS 라우트·Prisma·`fetch` 만 사용. 플랫폼 전용 API 0.
- [x] **P-005 결제·정산 정합성 원칙**: [Pass 기준: 금전 상태 변경 outbox·멱등성·Decimal]
  → PASS(직접 검토 조항). 본 차수는 **조회 전용**(주문 상세·송장 조회) 라우트 2개 추가이며 금전 상태를
  변경하지 않는다. `OrderItemView.unitPrice` 는 Decimal→JSON 직렬화상 **문자열**로 정의된다(부동소수점 금지).
  console 도 표시만 한다.
- [x] **P-006 테스트 원칙**: [Pass 기준: SC-XXX 없는 FR-XXX 0건]
  → PASS. FR-001·002·003→SC-001/SC-003, FR-004→SC-002/SC-003, FR-005·006→SC-004, FR-007→SC-005, FR-008→
  SC-003. 권한·소유 분기는 **단위 테스트 +6**(getByOrder 3·getSellerOrderDetail 3)로 검증하며, 라우트 등록·
  openapi 재생성은 e2e 84·tsc·build 로 확인한다. 기존 커버리지 저하 0.
- [x] **P-007 스펙 범위 원칙**: [Pass 기준: spec.md 범위 외 변경 파일 0건]
  → PASS(직접 검토 조항). 변경 범위 = shipping(service·repository·controller·spec)·order(service·
  seller-controller·spec)·shared-types·api-client·openapi.gen/json·console ship page. 전부 FR-001~008 추적
  가능. **송장 status e2e·낙관적 업데이트·분할배송·주문 items UI·응답 스키마 보강은 범위 외**.

> **예외 사항**: 없음. P-001~P-007 전부 통과(예외 0건). 신규 의존성 추가 0(P-002 무저촉 자명).

> **Gates 판정**: P-001~P-007 전부 통과. 선택 단계는 Database Design=N·Deploy=N·**Security=Y**(권한 3축·
> 소유 검증 추가)·Performance=N(selection-phases.md). Design Agent(3단계) → Development(4)+Test AUTHORING(5a)
> → Test EXECUTION(5b) → Docs(6) → **Security(선택)** → Retrospective(7) 진입 가능.

---

## 기술 컨텍스트

> v1.1.0 백엔드(NestJS 모놀리스) + 프론트(console) 스택. 005 고유 변경만 명시.

- **언어 / 런타임**: TypeScript 5.x / NestJS(모듈러 모놀리스, backend) + Next.js 15(App Router, console).
  pnpm `9.0.0` + Turborepo. Prisma(`prisma.tx`).
- **백엔드 모듈**: `shipping`(controller·service·repository) + `order`(service·seller-order.controller).
  권한 3축은 기존 `OrderService.getOrderOwnership`·`SellerService.getApprovedSeller`·`_resolveSellerId` 재사용.
- **API 호출(console)**: `@doa/api-client` 도메인 facade(`api.order.getSellerDetail`·`api.shipping.getByOrder`
  — `api.http` 기반). 상태·데이터 페칭은 TanStack Query(`useQuery`·`useMutation`·`setQueryData`·`invalidate`).
- **타입**: `@doa/shared-types` 전이형 view 타입(`SellerOrderDetail`·`OrderItemView` — 금전 Decimal→문자열).
  `openapi.gen.ts` 재생성(신규 라우트 2개 반영).
- **테스트 프레임워크**: backend jest 단위(`*.spec.ts` — getByOrder 3·getSellerOrderDetail 3 신규)+e2e
  (`test:e2e`). console 은 정적 구조 + typecheck/build.
- **환경변수**: 신규 0. **신규 의존성**: 0건(기존 패키지만 사용).

---

## 사전 영향도 분석 결과

> 상세는 [../design/research.md](../design/research.md) 참조. 본 절은 영향 파일 요약.

### 영향 파일 목록

| 파일 | 변경 유형 | 영향 내용 | 레이어 |
|---|---|---|---|
| `apps/backend/src/modules/shipping/shipping.repository.ts` | 수정 | `findByOrderId(orderId)` — `findFirst orderBy createdAt desc`(주문당 최신 1건, null 가능) | A(데이터) |
| `apps/backend/src/modules/shipping/shipping.service.ts` | 수정 | `_assertCanViewOrder` 헬퍼 추출(권한 3축) + `getByOrder`(null 가능) 추가 + `getTracking` 리팩토링(헬퍼 사용) | B(도메인) |
| `apps/backend/src/modules/order/order.service.ts` | 수정 | `getSellerOrderDetail(userId, orderId)` — items 포함, 소유 검증(404/403) | B(도메인) |
| `apps/backend/src/modules/shipping/shipping.controller.ts` | 수정 | `GET /shipments?orderId=`(`@Get()` + `@Query('orderId')`) | C(인터페이스) |
| `apps/backend/src/modules/order/seller-order.controller.ts` | 수정 | `GET /seller/orders/:orderId`(판매자 단건 상세) | C(인터페이스) |
| `apps/backend/openapi.json` | 재생성 | 신규 라우트 2개 반영(paths 71, `/shipments` GET 추가·`/seller/orders/{orderId}` 신규) | C(계약) |
| `packages/shared-types/src/index.ts` | 수정 | `OrderItemView`·`SellerOrderDetail`(금전 string) | A(타입 계약) |
| `packages/shared-types/src/openapi.gen.ts` | 재생성 | 신규 라우트 2개 생성 타입 반영 | A(생성 타입) |
| `packages/api-client/src/index.ts` | 수정 | `order.getSellerDetail`·`shipping.getByOrder` facade 추가 | B(도메인 facade) |
| `apps/console/app/(dashboard)/seller/orders/[id]/ship/page.tsx` | 수정 | 진입 시 `getByOrder` 송장 복구 + `getSellerDetail` 주문 헤더 + `setQueryData` 캐시 갱신(세션 state 대체) | C(화면) |
| `apps/backend/src/modules/shipping/shipping.service.spec.ts` | 수정 | `getByOrder` 단위 테스트 3(seller·buyer+null·stranger) | D(검증) |
| `apps/backend/src/modules/order/order.service.spec.ts` | 수정 | `getSellerOrderDetail` 단위 테스트 3(owner·not_owner·missing) | D(검증) |

> DB 스키마·마이그레이션 변경 0. 기존 라우트·facade·view 타입 불변(additive — NFR-004). `package.json` 변경
> 0(신규 의존 0 — P-002).

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
| `packages/shared-types/src/index.ts` | 14 | 0 | 동일(OrderItemView·SellerOrderDetail) |
| `apps/backend/.../shipping/shipping.controller.ts` | 10 | 0 | 동일(GET getByOrder) |
| `apps/backend/.../order/seller-order.controller.ts` | 9 | 0 | 동일(GET getSellerOrder) |
| `apps/backend/.../shipping/shipping.repository.ts` | 8 | 0 | 동일(findByOrderId) |
| `packages/api-client/src/index.ts` | 7 | 0 | 동일(getSellerDetail·getByOrder facade) |

**합계**: 12 files changed, 415 insertions(+), 78 deletions(-).

---

## 핵심 설계

### 1. 권한 3축 헬퍼 추출 + 주문 기준 송장 조회 (FR-001·002·003)

```ts
// shipping.service.ts — getTracking 의 인라인 검증을 _assertCanViewOrder 로 추출
async getTracking(userId: string, shipmentId: string) {
  const shipment = await this.shippingRepository.findById(shipmentId);
  if (!shipment) throw new NotFoundException('Shipment not found');
  await this._assertCanViewOrder(userId, shipment.orderId);   // 추출된 헬퍼 공유
  return this.shippingRepository.findTracking(shipmentId);
}

/** 주문 기준 송장 조회 — 권한 3축. 송장 미존재 시 null(재진입 복구용). */
async getByOrder(userId: string, orderId: string): Promise<Shipment | null> {
  await this._assertCanViewOrder(userId, orderId);
  return this.shippingRepository.findByOrderId(orderId);
}

/** 권한 3축 — 구매자 본인 OR 해당 주문 판매자. 미허가 시 403. */
private async _assertCanViewOrder(userId: string, orderId: string): Promise<void> {
  const ownership = await this.orderService.getOrderOwnership(orderId);
  let authorized = ownership.userId === userId;                  // 구매자 본인
  if (!authorized) {
    const sellerId = await this._resolveSellerId(userId);        // 판매자 축
    authorized = sellerId !== null && ownership.sellerIds.includes(sellerId);
  }
  if (!authorized) throw new ForbiddenException('Not allowed to view this shipment');
}
```

```ts
// shipping.repository.ts — 주문당 최신 송장 1건(현재 주문당 1건)
async findByOrderId(orderId: string): Promise<Shipment | null> {
  return this.prisma.tx.shipment.findFirst({
    where: { orderId },
    orderBy: { createdAt: 'desc' },
  });
}
// shipping.controller.ts
@Get()
async getByOrder(@CurrentUser() user, @Query('orderId') orderId: string) {
  return this.shippingService.getByOrder(user.userId, orderId);   // Shipment | null
}
```

- 미등록은 정상 흐름(발송 전)이므로 `null` 을 반환한다(예외 아님 — NFR-003).
- 인가 로직 단일 지점(`_assertCanViewOrder`)으로 `getTracking`·`getByOrder` 가 동일 규칙 강제(NFR-001).

### 2. 판매자 단건 주문 상세 (FR-004·NFR-002)

```ts
// order.service.ts
async getSellerOrderDetail(userId: string, orderId: string): Promise<OrderWithDetails> {
  const seller = await this.sellerService.getApprovedSeller(userId);
  const order = await this.orderRepository.findById(orderId);
  if (!order) throw new NotFoundException('Order not found');           // 404
  if (!order.items.some((i) => i.sellerId === seller.id)) {
    throw new ForbiddenException('Not your order');                     // 403
  }
  return order;                                                          // items 포함
}
// seller-order.controller.ts
@Get(':orderId')
async getSellerOrder(@CurrentUser() user, @Param('orderId') orderId: string) {
  return this.orderService.getSellerOrderDetail(user.userId, orderId);
}
```

### 3. view 타입 + 도메인 facade (FR-005·006)

```ts
// shared-types/index.ts
export interface OrderItemView { id; productId; sellerId; variantId; unitPrice: string; quantity: number; }
export interface SellerOrderDetail extends SellerOrder { items: OrderItemView[]; }
// api-client/index.ts
order:    { getSellerDetail: (orderId) => http.get<SellerOrderDetail>(`/seller/orders/${orderId}`), /* ... */ }
shipping: { getByOrder: (orderId) => http.get<Shipment | null>('/shipments', { query: { orderId } }), /* ... */ }
```

### 4. console ship 재진입 복구 (FR-007)

```tsx
// ship/page.tsx — 세션 useState 대체: getByOrder 쿼리로 기존 송장 복구
const orderQuery    = useQuery({ queryKey: ['seller','order',orderId], queryFn: () => api.order.getSellerDetail(orderId), enabled: isSeller });
const shipmentQuery = useQuery({ queryKey: ['shipment','byOrder',orderId], queryFn: () => api.shipping.getByOrder(orderId), enabled: isSeller });
const shipment = shipmentQuery.data ?? null;   // 미존재 → null → 등록 폼, 존재 → 관리 패널
const create   = useMutation({ /* ... */ onSuccess: (s) => { qc.setQueryData(['shipment','byOrder',orderId], s); void qc.invalidateQueries({ queryKey: ['seller','orders'] }); } });
const updateStatus = useMutation({ /* ... */ onSuccess: (s) => { qc.setQueryData(['shipment','byOrder',orderId], s); void qc.invalidateQueries({ queryKey: ['shipment', s.id, 'tracking'] }); } });
// 헤더: order && <Badge tone={ORDER_STATUS_TONE[order.status]}>…</Badge> + formatKRW(order.totalAmount)
```

---

## 결정 기록 (ADRs)

| ADR-ID | 결정 항목 | 채택안 | 대안(검토했으나 미채택) | 근거(spec FR/NFR) | 영향 범위 |
|---|---|---|---|---|---|
| ADR-001 | 송장 미존재 신호 | `null` 반환 | 404/throw | FR-001·NFR-003(미등록은 정상 흐름) | shipping.service·controller·console |
| ADR-002 | 권한 3축 중복 처리 | `_assertCanViewOrder` 헬퍼 추출·공유 | getByOrder 인라인 복제 | FR-003·NFR-001(인가 단일 지점) | shipping.service |
| ADR-003 | 주문당 송장 다건 | 최신 1건(`findFirst orderBy desc`) | 전체 배열 | FR-002·범위 외(주문당 1건 가정) | shipping.repository |
| ADR-004 | 판매자 주문 소유 검증 | items 중 `sellerId` 일치 — 404/403 | 단순 존재 확인 | FR-004·NFR-002 | order.service |
| ADR-005 | console 송장 상태 보관 | `getByOrder` 쿼리 복구 + `setQueryData` | 004 세션 `useState` 유지 | FR-007(재진입 복구) | ship/page.tsx |
| ADR-006 | 응답 타입 | 전이형 view 타입(`SellerOrderDetail`, 금전 string) | 생성 타입 즉시 적용 | FR-005·NFR-005(응답 OpenAPI 미정의 — 004 연속) | shared-types |

---

## 인터페이스 계약

### 005 신규 백엔드 라우트 계약

| 라우트 | 메서드 | 요청 | 응답 | 인가 | 부수 효과 |
|---|---|---|---|---|---|
| `/shipments` | GET | `?orderId=`(`@Query`) | `Shipment \| null` | 권한 3축(구매자/판매자 — `_assertCanViewOrder`) | 없음(조회) |
| `/seller/orders/:orderId` | GET | `:orderId`(`@Param`) | `SellerOrderDetail`(items 포함) | 판매자 본인 소유(items sellerId 일치) | 없음(조회) |

> 실패: `/shipments` GET — 무관 사용자 403(`findByOrderId` 미호출). `/seller/orders/:orderId` — 미존재 404·
> 비소유 403.

### 005 신규/변경 프론트 인터페이스

```ts
// api-client/index.ts — createApiClient 반환에 추가(기존 메서드 불변)
order:    { getSellerDetail(orderId: string): Promise<SellerOrderDetail>; /* listSeller·confirm 기존 */ };
shipping: { getByOrder(orderId: string): Promise<Shipment | null>; /* create·updateStatus·tracking 기존 */ };
// shared-types — SellerOrder 확장
interface SellerOrderDetail extends SellerOrder { items: OrderItemView[]; }
```

### 하위 호환성 / 방어 코드

- **additive 라우트(핵심)**: 신규 라우트 2개는 기존 라우트·facade·view 타입·console 흐름을 깨지 않는다.
  `getTracking` 은 헬퍼 추출 후에도 동작 불변(인라인 검증 → `_assertCanViewOrder` 호출, 동일 규칙·동일 403).
  신규 facade 메서드는 기존 메서드에 추가된다(NFR-004 — backend tsc 0·console typecheck 0·회귀 0).
- **null 안전**: `getByOrder` 는 송장 미존재 시 `null` 을 반환하고 console 은 `shipmentQuery.data ?? null` 로
  받아 등록 폼/관리 패널을 분기한다. `updateStatus`·`tracking` 은 `shipment!`·`enabled: !!shipment` 로 송장
  존재 시에만 동작한다(NFR-003).
- **권한 표시 분기**: console `isSeller` 분기는 표시 편의이며 실제 인가는 백엔드 권한 3축·판매자 소유 검증이
  강제한다. orderId 만으로 타인 주문/송장을 조회할 수 없다(NFR-001·002).
- **금전 부동소수점 방어**: `OrderItemView.unitPrice` 등 금전 필드는 `string`(Decimal→문자열)이며 console 은
  `formatKRW` 로 표기만 한다(P-005).

---

## 데이터 모델

DB 스키마 변경 없음(마이그레이션 0). 신규 테이블·컬럼·enum·인덱스·제약 0건. 본 차수의 "데이터" 변경은 (1)
기존 `shipment` 테이블의 신규 조회 경로(`findByOrderId` — `where orderId` + `orderBy createdAt desc`)와 (2)
HTTP 응답 view 타입(`SellerOrderDetail`·`OrderItemView` — 백엔드 Prisma 엔티티 응답을 프론트가 한시 표현)
이며, 화면은 이를 소비·표시할 뿐 영속하지 않는다. Database Design Agent 비활성(selection-phases.md).

> **view 타입 한시성(004 연속)**: `SellerOrderDetail` 도 백엔드 OpenAPI 응답 정의가 보강되면 생성 타입으로
> 대체될 임시 계약이다(004 GAP-004-01 (3) / 001 GAP-001-01 연속). 정의 위치는 공유 패키지(`shared-types`).

---

## 테스트 전략

### SC↔검증 매핑 (요약)

| SC 식별자 | 수준 | 유형 | 시나리오 요약 | 입력 | 기대 결과 |
|---|---|---|---|---|---|
| SC-001 | unit | getByOrder 권한·null | seller→shipment·buyer+미존재→null·stranger→403 | `shipping.service.spec.ts` | 3 케이스 PASS, stranger 시 findByOrderId 미호출 |
| SC-002 | unit | getSellerOrderDetail 소유 | owner→order·not_owner→403·missing→404 | `order.service.spec.ts` | 3 케이스 PASS |
| SC-003 | typecheck/build/unit | 라우트 등록·openapi | 신규 라우트 2개·openapi 71 paths | backend tsc/e2e·openapi.json | tsc 0·e2e 84·paths 71(`/shipments` GET·`/seller/orders/{orderId}`) |
| SC-004 | static/typecheck | view 타입·facade | `OrderItemView`·`SellerOrderDetail`·getSellerDetail·getByOrder | shared-types·api-client 리뷰 | 금전 string·facade 메서드·`Shipment\|null` |
| SC-005 | typecheck/build/static | console 재진입 복구 | getByOrder 복구·getSellerDetail 헤더·setQueryData | ship/page.tsx·console build | typecheck 0·build 14 라우트·재진입 시 송장 복구 |

### smoke_tests

- 필요 여부: N(별도 부팅 스모크 불필요). 백엔드 권한·소유 분기는 **단위 테스트 +6**(getByOrder 3·
  getSellerOrderDetail 3)로 직접 검증하며, 라우트 등록·openapi 재생성은 **e2e 84·tsc·openapi.json**, console
  재진입 복구는 **typecheck/build + 정적 구조 리뷰**로 판정한다. 송장 status 업데이트 e2e·낙관적 업데이트
  테스트는 후속(GAP-005-01).

---

## 기타 고려사항

- **권한 헬퍼 추출의 동작 불변(핵심)**: `getTracking` 의 인라인 권한 3축 검증을 `_assertCanViewOrder` 로
  추출했다. 추출 전후 동작이 동일(구매자 본인 OR 판매자 축, 미허가 403)함을 기존 `getTracking` 테스트가
  유지(회귀 0)로 확인한다. 예외 메시지만 `'...shipment tracking'` → `'...shipment'` 로 통일(두 라우트 공유).
- **null vs 404 선택**: 주문 기준 송장 조회는 "아직 발송 안 함" 이 정상이므로 미존재를 `null` 로 신호한다.
  반면 판매자 주문 상세는 주문 자체가 없으면 404, 권한 없으면 403 으로 구분한다(자원 부재 vs 인가 실패).
- **주문당 송장 1건 가정**: `findByOrderId` 는 `findFirst orderBy createdAt desc` 로 최신 1건만 반환한다.
  분할배송(주문당 송장 N건)으로 확장 시 이 가정을 재검토하고 배열 반환·송장 선택 UI 가 필요하다(범위 외).
- **응답 스키마 한시성(004 연속)**: `SellerOrderDetail` 도 전이형 view 타입(금전 string)이다. 백엔드 응답
  DTO + `@ApiResponse({ type })` 보강 후 코드젠 재생성하면 생성 타입으로 대체 가능하다(004 GAP-004-01 (3) /
  001 GAP-001-01 연속).
- **신규 의존 0**: 본 차수는 기존 패키지(NestJS·Prisma·TanStack Query·`@doa/*`)만 사용하며 `package.json`
  변경이 없다(P-002 무저촉 자명, NFR-004 회귀 0 유리).
</content>
