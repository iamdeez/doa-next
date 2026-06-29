---
작성: Spec Agent
버전: v1.0
최종 수정: 2026-06-30 01:23
상태: 확정 (retroactive)
---

# Spec Input: 005-order-shipping-gap-fill

> 수집 일시: 2026-06-30 | 맥락: 004(판매자 주문·배송 화면) 완료 후 발견된 BE-GAP 2건 보강 → 정식 SDD 문서화.
> 사용자 지시: "발견된 갭 보강 후 진행".

## 목차

- [수집 진행 상태](#수집-진행-상태)
- [원 요청 맥락](#원-요청-맥락)
- [질문 분석 근거](#질문-분석-근거-question-analysis-basis)
- [카테고리별 수집 내용](#카테고리별-수집-내용)

## 수집 진행 상태

| 카테고리 | 상태 | 답변 완료 항목 |
|---|---|---|
| 1. 배경 및 목적 | 완료 | [Q1, Q2, Q3] |
| 2. 사용자 & 이해관계자 | 완료 | [Q4] |
| 3. 핵심 기능 | 완료 | [Q-A~E] |
| 4. 데이터 & 입출력 | 완료 | [Q-F] |
| 5. 제약조건 | 완료 | [Q5] |
| 6. 예외 & 실패 시나리오 | 완료 | [Q6] |

## 원 요청 맥락

사용자 지시: **004 진행 중/완료 후 발견된 갭을 보강한 뒤 진행**. 004 는 판매자 주문·배송 화면을 console 에
올렸으나, 판매자용 단건 주문 조회·주문→송장 조회 백엔드 엔드포인트 부재(BE-GAP 2건 — 004 GAP-004-01)로 ship
화면이 세션 내에서만 완결되는 한계를 남겼다. 005 는 그 2건의 BE-GAP 을 백엔드 신규 라우트로 보강하고, 그
과정에서 `shipping.service` 의 권한 3축 검증을 헬퍼로 추출(중복 제거)하며, console ship 페이지를 재진입 복구가
동작하도록 전환한다. 본 문서는 그 구현(커밋 `8b48eb5`)을 정식 SDD 포맷으로 보강하기 위한 입력 재구성이다(004
GAP-004-01 (1)·(2) 해소 / FRONTEND-PLAN Phase 1 갭 보강).

## 질문 분석 근거 (Question Analysis Basis)

| 질문 ID | 요지 | 옵션·근거 | 채택 결과 |
|---|---|---|---|
| Q-A | 주문→송장 조회 미존재 신호 | A:404/throw / B:`null` 반환 | **B 채택**(미등록은 정상 흐름(발송 전)이므로 예외가 아닌 `null`. console 은 `?? null` 로 등록 폼/관리 패널 분기 — FR-001·NFR-003) |
| Q-B | 권한 3축 검증 중복 처리 | A:`getByOrder` 에 인라인 복제 / B:`_assertCanViewOrder` 헬퍼 추출 후 공유 | **B 채택**(`getTracking` 의 인라인 검증을 헬퍼로 추출해 `getByOrder` 와 공유 — 인가 단일 지점. 예외 메시지 통일 — FR-003·NFR-001) |
| Q-C | 주문당 송장 다건 처리 | A:전체 배열 / B:최신 1건(`findFirst orderBy createdAt desc`) | **B 채택**(현재 주문당 송장 1건 가정. 분할배송(N건)은 범위 외 — FR-002·범위 외) |
| Q-D | 판매자 주문 상세 소유 검증 | items 중 본인 `sellerId` 일치 — 미존재 404·비소유 403 | **채택**(`getApprovedSeller` → `findById` → `items.some(sellerId===seller.id)` — FR-004·NFR-002·SC-002) |
| Q-E | console 송장 상태 보관 | A:004 세션 `useState` 유지 / B:`getByOrder` 쿼리 복구 + `setQueryData` | **B 채택**(재진입 복구를 위해 세션 state 를 쿼리 데이터로 전환. mutation `onSuccess` 가 `setQueryData(['shipment','byOrder',orderId])` — FR-007·004 세션 한계 해소) |
| Q-F | 응답 타입 정의 | `SellerOrderDetail`(`SellerOrder` 확장 + items)·`OrderItemView`(금전 string) | **채택**(004 view 타입 전략 연속 — 전이형 view 타입, 금전 string. 응답 DTO 보강 후 생성 타입 대체 — FR-005·NFR-005) |

## 카테고리별 수집 내용

### [카테고리 1] 배경 및 목적

Q1. 왜 만드는가?
- 004 가 남긴 BE-GAP 2건(판매자 주문 상세·주문→송장 조회)을 해소하여 ship 화면 재진입 복구 + 주문 컨텍스트
  표시를 가능케 한다. 004 의 세션 state 한계(페이지 떠났다 재진입 시 송장 복구 불가)를 백엔드 라우트로 푼다.

Q2. 현재 어떻게? (005 이전)
- 004 시점: `GET /orders/:id` 는 구매자 스코프, 주문→송장 조회 라우트 부재. ship 페이지는 송장 등록 직후 세션
  `useState` 의 shipment 로만 상태변경·추적이 동작(세션 내 완결). 재등록 시도는 백엔드 400 거부.

Q3. 성공 판단 기준
- 백엔드 신규 라우트 2개(`GET /shipments?orderId=`·`GET /seller/orders/:orderId`) + 단위 테스트 +6(권한·소유
  분기). console ship 재진입 시 기존 송장 복구·주문 헤더 표시. backend tsc 0·unit 261(+6)·e2e 84·console
  typecheck 0·build 14 라우트·openapi 71 paths.

### [카테고리 2] 사용자 & 이해관계자

Q4. 사용자 역할
- 판매자(console): ship 재진입 시 기존 송장 복구·주문 컨텍스트 확인 주체.
- 구매자/판매자(백엔드): 주문 기준 송장 조회의 권한 3축 대상.
- 백엔드 개발자: 신규 라우트 2개 제공 + 권한 헬퍼 추출 주체.

### [카테고리 3] 핵심 기능

**Must:**
- `apps/backend/src/modules/shipping/shipping.service.ts`: `getByOrder`(권한 3축·null 가능) + `_assertCanViewOrder`
  헬퍼 추출 + `getTracking` 리팩토링.
- `apps/backend/src/modules/shipping/shipping.repository.ts`: `findByOrderId`(주문당 최신 1건, null 가능).
- `apps/backend/src/modules/shipping/shipping.controller.ts`: `GET /shipments?orderId=`(`@Get()` + `@Query`).
- `apps/backend/src/modules/order/order.service.ts`: `getSellerOrderDetail`(items 포함, 소유 검증 — 404/403).
- `apps/backend/src/modules/order/seller-order.controller.ts`: `GET /seller/orders/:orderId`.
- `apps/backend/src/modules/.../*.spec.ts`: getByOrder 3 + getSellerOrderDetail 3 = +6 단위 테스트.
- `packages/shared-types/src/index.ts`: `OrderItemView`·`SellerOrderDetail`.
- `packages/api-client/src/index.ts`: `order.getSellerDetail`·`shipping.getByOrder`.
- `apps/console/app/(dashboard)/seller/orders/[id]/ship/page.tsx`: 재진입 복구(getByOrder) + 주문 헤더
  (getSellerDetail) + `setQueryData` 캐시 갱신.

**제외(Out of Scope):**
- 송장 status 업데이트 e2e, 낙관적 업데이트, 분할배송(주문당 송장 N건), 주문 items UI 렌더, 응답 스키마
  보강(생성 타입 대체).

### [카테고리 4] 데이터 & 입출력

- 백엔드 라우트(신규): `GET /shipments?orderId=`(권한 3축, `Shipment | null`)·`GET /seller/orders/:orderId`
  (판매자 소유, `SellerOrderDetail` — items 포함, 미존재 404·비소유 403).
- repository: `findByOrderId(orderId)` → `findFirst({ where: { orderId }, orderBy: { createdAt: 'desc' } })`.
- view 타입: `OrderItemView`(id·productId·sellerId·variantId·unitPrice[string]·quantity)·`SellerOrderDetail`
  (`SellerOrder` 확장 + `items: OrderItemView[]`).
- facade: `api.order.getSellerDetail(orderId)`·`api.shipping.getByOrder(orderId)`(`api.http` 기반).

### [카테고리 5] 제약조건

Q5. 기술 스택 제약
- NestJS 모듈러 모놀리스(shipping·order 모듈) + Prisma(`prisma.tx`). DB 스키마 변경 0(기존 shipment·order
  테이블 조회만).
- 권한 3축은 기존 `getOrderOwnership`·`getApprovedSeller`·`_resolveSellerId` 재사용. additive 라우트(하위
  호환). 금전 Decimal→문자열(부동소수점 금지 — P-005).

### [카테고리 6] 예외 & 실패 시나리오

Q6. 엣지 케이스
- 주문→송장 조회: 송장 미존재 → `null`(예외 아님). 무관한 사용자 → 403(`findByOrderId` 미호출).
- 판매자 주문 상세: 주문 미존재 → 404. 비소유(items 에 본인 sellerId 없음) → 403.
- 분할배송: 주문당 송장 N건은 미지원(`findByOrderId` 최신 1건만). 현재 주문당 1건 가정.
- 응답 타입: `SellerOrderDetail` 도 전이형 view 타입(금전 string) — 백엔드 OpenAPI 응답 미정의(004 GAP-004-01
  (3) 연속). 응답 DTO 보강 후 생성 타입 대체.
</content>
