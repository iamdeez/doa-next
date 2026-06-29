---
작성: Design Agent
버전: v1.0
최종 수정: 2026-06-30 01:23
상태: 확정 (retroactive)
---

# Research: 005-order-shipping-gap-fill

## 목차

- [분석 우선순위 게이트 결과](#분석-우선순위-게이트-결과)
- [BE-GAP 분석 (004 GAP-004-01)](#be-gap-분석-004-gap-004-01)
- [권한 3축 재사용 — 헬퍼 추출](#권한-3축-재사용--헬퍼-추출)
- [주문당 송장 1건 가정](#주문당-송장-1건-가정)
- [console 재진입 복구 패턴](#console-재진입-복구-패턴)
- [응답 타입 — typed client vs facade+view 타입](#응답-타입--typed-client-vs-facadeview-타입)
- [생성물·구조 검증 (직접 확인)](#생성물구조-검증-직접-확인)
- [엣지 케이스 및 한계](#엣지-케이스-및-한계)

---

## 분석 우선순위 게이트 결과

- **변경 대상(plan §핵심 설계)**: backend shipping(service·repository·controller)·order(service·
  seller-controller) + shared-types·api-client·openapi.gen/json + console ship page + 단위 테스트 2종.
- §A·B·C 분석은 위 12파일로 한정.
- §D(다단계 병렬 파이프라인): 미해당.
- §E(동일 가드 결정 통합): **해당** — `getTracking`·`getByOrder` 의 권한 3축 가드를 `_assertCanViewOrder`
  단일 헬퍼로 통합(중복 제거).
- 외부 라이브러리 검증(§4): **신규 라이브러리 0건**(기존 NestJS·Prisma·TanStack Query·`@doa/*` 만 사용).
- §F(production 시그니처 변경): **부분 해당** — 신규 라우트 2개(`GET /shipments`·`GET /seller/orders/:id`)
  **추가**, `ShippingService.getTracking` 내부 리팩토링(시그니처 불변), `getByOrder`·`getSellerOrderDetail`·
  `findByOrderId` 신규 메서드 추가. 기존 라우트·facade·view 타입 불변(호출 측 영향 0).

---

## BE-GAP 분석 (004 GAP-004-01)

004 는 판매자 주문·배송 화면을 올리며 백엔드 계약 공백 2건을 GAP-004-01 (1)·(2) 로 기록했다. 005 는 이를
백엔드 라우트로 해소한다.

| BE-GAP (004) | 등급 | 004 한계 | 005 해소 |
|---|---|---|---|
| (1) 판매자 단건 주문 조회 부재 — `GET /orders/:id` 는 구매자 스코프 | Medium | ship 페이지가 주문 상세(상태·금액·items)를 직접 가져오지 못함 | `GET /seller/orders/:orderId`(items 포함, 소유 검증 404/403) |
| (2) 주문→송장 조회 부재 — `GET /shipments?orderId` 없음 | Medium | 재진입 시 기존 shipment id 복구 불가(세션 state 완결) | `GET /shipments?orderId=`(권한 3축, null 가능) |

- 두 BE-GAP 은 프론트 단독으로 해소 불가한 백엔드 의존 공백이었다(004 coverage-gap.md 명시). 005 가 백엔드
  라우트를 추가하고 console 을 재진입 복구가 동작하도록 전환하여 RESOLVED.

---

## 권한 3축 재사용 — 헬퍼 추출

- **문제**: 주문 기준 송장 조회(`getByOrder`)는 기존 추적 조회(`getTracking`)와 **동일한** 권한 3축(구매자
  본인 OR 해당 주문 판매자, 미허가 403)을 필요로 한다. 인라인 복제 시 인가 로직이 두 곳에 분산되어 한쪽만
  수정될 위험이 있다.
- **해결(채택 — ADR-002)**: `getTracking` 의 인라인 검증을 `_assertCanViewOrder(userId, orderId)` private
  헬퍼로 추출하고 `getByOrder` 와 공유한다. 인가가 단일 지점에 모여 두 라우트가 동일 규칙을 강제한다.

| 구분 | 추출 전(004) | 추출 후(005) |
|---|---|---|
| `getTracking` 권한 검증 | 인라인(ownership·sellerId 분기) | `await this._assertCanViewOrder(userId, shipment.orderId)` |
| `getByOrder` 권한 검증 | (메서드 부재) | `await this._assertCanViewOrder(userId, orderId)` |
| 예외 메시지 | `'Not allowed to view this shipment tracking'` | `'Not allowed to view this shipment'`(통일) |

- 추출 동작은 불변(구매자 본인 → 미허가 시 판매자 축 → 미허가 시 403). 기존 `getTracking` 테스트가 회귀 0
  으로 동작 동일성을 보증한다.

---

## 주문당 송장 1건 가정

- **문제**: 주문 기준 송장 조회 시 한 주문에 송장이 여러 개일 수 있는가(분할배송)?
- **현 구현(채택 — ADR-003)**: `findByOrderId` 는 `findFirst({ where: { orderId }, orderBy: { createdAt:
  'desc' } })` 로 **최신 1건** 만 반환한다. 현재 주문당 송장 1건을 가정한다.
- **확장 경로**: 분할배송(주문당 송장 N건)으로 확장 시 배열 반환 + 송장 선택 UI 가 필요하다(범위 외 — 가정을
  재검토). `orderBy createdAt desc` 는 다건이 되더라도 최신 송장을 우선 반환하는 안전한 기본값이다.

---

## console 재진입 복구 패턴

- **문제**: 004 는 송장 등록 직후 `useState` 의 shipment 로만 상태변경·추적이 동작했다(세션 내 완결). 재진입
  시 기존 송장을 복구할 수 없었다.
- **해결(채택 — ADR-005)**: 세션 `useState` 를 **TanStack Query 로 대체** 한다.

| 항목 | 004(세션 state) | 005(쿼리 복구) |
|---|---|---|
| 송장 보관 | `const [shipment, setShipment] = useState<Shipment\|null>(null)` | `const shipment = shipmentQuery.data ?? null`(`getByOrder`) |
| 재진입 복구 | 불가(등록 직후만 보유) | 가능(`useQuery(['shipment','byOrder',orderId], getByOrder)`) |
| 주문 컨텍스트 | 없음(orderId 만) | `orderQuery`(`getSellerDetail`) — 상태·금액 헤더 |
| mutation 후 갱신 | `setShipment(s)` | `qc.setQueryData(['shipment','byOrder',orderId], s)` |

- 진입 시 `getByOrder` 가 기존 송장을 반환하면 관리 패널(상태변경·추적)을, `null` 이면 등록 폼을 렌더한다.
  `getSellerDetail` 로 주문 상태(Badge)·결제금액(formatKRW)을 헤더에 표시한다.
- 직접 확인(ship/page.tsx L35~69): `orderQuery`·`shipmentQuery`·`create`/`updateStatus` 의 `setQueryData`·
  `tracking`(`enabled: !!shipment`).

---

## 응답 타입 — typed client vs facade+view 타입

- 004 와 동일하게, 주문·배송 응답은 백엔드가 Prisma 엔티티를 반환하고 OpenAPI 응답 content 가 미정의다(001
  coverage-gap 연속). 따라서 005 도 `@doa/shared-types` 전이형 view 타입(`SellerOrderDetail`·`OrderItemView`
  — 금전 string) + `api.http` 기반 facade(`order.getSellerDetail`·`shipping.getByOrder`)를 채택한다(ADR-006).
- `getByOrder` 는 `http.get<Shipment | null>('/shipments', { query: { orderId } })` 로 query 옵션을 사용한다
  (직접 확인 — api-client/index.ts).
- 백엔드 응답 DTO + `@ApiResponse({ type })` 보강 후 코드젠 재생성하면 view 타입을 생성 타입으로 대체
  가능하다(004 GAP-004-01 (3) 연속 — 본 차수도 OPEN 유지).

---

## 생성물·구조 검증 (직접 확인)

> 변경 구조는 추측하지 않고 실제 파일·diff 를 직접 확인하여 확정했다(자가 보고 신뢰하지 않음).

| 대상 | 측정 | 값 | 측정 방법 |
|---|---|---|---|
| `ship/page.tsx` | 변경 라인 | +138 / -72 | `git diff --numstat 8bba04d 8b48eb5` |
| `openapi.gen.ts` | 재생성 | +61 / -1 | 동일 |
| `openapi.json` | 재생성 | +60 / -0 | 동일 |
| `shipping.service.spec.ts` | 변경 | +46 / -0 | 동일(getByOrder 3) |
| `order.service.spec.ts` | 변경 | +32 / -0 | 동일(getSellerOrderDetail 3) |
| `shipping.service.ts` | 변경 | +16 / -5 | 동일(헬퍼 추출 + getByOrder) |
| `order.service.ts` | 변경 | +14 / -0 | 동일(getSellerOrderDetail) |
| `shared-types/index.ts` | 변경 | +14 / -0 | 동일(OrderItemView·SellerOrderDetail) |
| `shipping.controller.ts` | 변경 | +10 / -0 | 동일(GET getByOrder) |
| `seller-order.controller.ts` | 변경 | +9 / -0 | 동일(GET getSellerOrder) |
| `shipping.repository.ts` | 변경 | +8 / -0 | 동일(findByOrderId) |
| `api-client/index.ts` | 변경 | +7 / -0 | 동일(facade 2종) |
| 합계 | 12 files | +415 / -78 | `git diff --numstat 8bba04d 8b48eb5 -- apps/backend packages apps/console` |

- openapi paths(직접 확인 — `python3 json.load`): **71개**. `/seller/orders/{orderId}` 신규(`get`),
  `/shipments` 에 `get` 추가(기존 `post` + `get`).
- view 타입(직접 확인 — `shared-types/index.ts`): `OrderItemView`(unitPrice `string`·quantity number)·
  `SellerOrderDetail extends SellerOrder { items: OrderItemView[] }`. 주석 "GET /seller/orders/:orderId —
  판매자 단건 주문 상세(items 포함)".
- facade(직접 확인 — `api-client/index.ts`): `order.getSellerDetail`·`shipping.getByOrder`(`{ query: {
  orderId } }`).

---

## 엣지 케이스 및 한계

- **송장 미존재 = null(예외 아님)**: 주문 기준 송장 조회는 발송 전(미등록)을 정상으로 보아 `null` 을 반환한다.
  console 은 `?? null` 로 등록 폼/관리 패널을 분기한다.
- **분할배송 미지원**: `findByOrderId` 는 최신 1건만 반환한다(주문당 1건 가정). N건 분할배송은 범위 외.
- **주문 items UI 미렌더**: `SellerOrderDetail.items` 는 응답에 포함되나, console ship 헤더는 상태·금액만
  표시하고 품목 목록 UI 는 렌더하지 않는다(범위 외).
- **송장 status e2e 부재**: 권한·소유 분기는 단위 테스트 +6 으로 검증하나, 송장 등록→상태 전이의 백엔드 e2e
  시나리오는 본 차수에 추가하지 않는다(후속 — GAP-005-01).
- **응답 스키마 한시성(004 연속)**: `SellerOrderDetail` 도 전이형 view 타입(금전 string). 응답 DTO 보강 후
  생성 타입 대체 예정(004 GAP-004-01 (3) / 001 GAP-001-01 연속).

가정-실제 불일치 현재 미발견(변경 구조·diff·view 타입·facade·openapi paths·단위 테스트를 실제 파일/numstat/
jest 직접 확인).
</content>
