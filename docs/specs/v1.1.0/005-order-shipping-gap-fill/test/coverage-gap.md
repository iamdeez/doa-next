---
작성: Test Agent (EXECUTION)
버전: v1.0
최종 수정: 2026-06-30 01:23
상태: 확정 (retroactive)
---

# Coverage Gap: 005-order-shipping-gap-fill

## 목차

- [미커버 항목 목록](#미커버-항목-목록)
- [송장 status e2e 부재 (상세)](#송장-status-e2e-부재-상세)
- [분할배송·주문 items UI 미구현 (상세)](#분할배송주문-items-ui-미구현-상세)
- [응답 스키마 한시·낙관적 업데이트 미적용 (상세)](#응답-스키마-한시낙관적-업데이트-미적용-상세)
- [신규 테스트 수 기록](#신규-테스트-수-기록)

---

## 미커버 항목 목록

> spec.md SC 중 SC-001·002 는 신규 단위 테스트 +6 으로 직접 커버(PASS), SC-003 은 openapi·e2e/tsc 로 PASS,
> SC-004·005 는 정적 구조 리뷰 + typecheck/build 로 확인(VERIFIED). 아래는 본 차수 범위 외이거나 테스트
> 자동화 한계로 검증 대상이 없는 항목이다.

| 항목 | 미커버 시나리오 | 카테고리 | 검증 방법 | 담당 | 비고 |
|---|---|---|---|---|---|
| 송장 status 업데이트 e2e | 송장 등록→배송 전이→추적 흐름 e2e 부재 | (2) 설계(테스트 자동화 한계) | 백엔드 e2e 후속 | 후속 차수 | 권한·소유 분기는 단위 +6 으로 검증 |
| 분할배송(주문당 송장 N건) | 한 주문에 복수 송장 조회 | (3) 기능 미구현(범위 외) | 배열 반환·송장 선택 후속 | 후속 차수 | `findByOrderId` 최신 1건(주문당 1건 가정) |
| 주문 items UI 렌더 | ship 헤더에 품목 목록 표시 | (3) 기능 미구현(범위 외) | ship 페이지 품목 렌더 후속 | 후속 차수 | `SellerOrderDetail.items` 응답 포함하나 미렌더 |
| 낙관적 업데이트 | console mutation 낙관적 반영 | (3) 기능 미구현(범위 외) | Phase 2 `onMutate` + 롤백 테스트 | 후속 차수 | 현재 서버 응답 후 setQueryData/invalidate |
| 응답 스키마 보강(생성 타입 대체) | view 타입 → 생성 타입 전환 | (3) 기능 미구현(백엔드 후속) | 응답 DTO + `@ApiResponse` 후 코드젠 | 백엔드/후속 | `SellerOrderDetail` 전이형 view 타입 한시(004 연속) |

---

## 송장 status e2e 부재 (상세)

**현상**: 005 는 신규 라우트 2개(주문→송장 조회·판매자 주문 상세)에 단위 테스트 +6(권한 3축·소유 검증)을
추가했으나, 송장 등록→배송 전이→추적의 백엔드 e2e 시나리오는 추가하지 않았다. 신규 라우트의 라우트 등록·
타입 안전성은 backend e2e 84·tsc 0 으로 회귀 확인된다.

**근본 원인 (단위 검증 집중 + 범위 분리)**:
- 본 차수의 핵심 리스크는 **인가 경계**(권한 3축·판매자 소유)이며, 이를 단위 테스트로 직접 검증했다(stranger
  →403·not_owner→403·missing→404). 송장 상태 전이 흐름 e2e 는 별도 검증 가치가 있으나 본 차수에 포함하지
  않았다.

**위험도**: 낮음. 권한·소유 분기는 단위 +6 으로 직접 커버되고, 라우트 등록·타입 회귀는 e2e 84·tsc 0 으로
포착된다. 다만 송장 status 전이 + 추적 누적의 통합 흐름은 e2e 없이는 미묘한 회귀 탐지가 어렵다.

**권장 수정 방향**: 후속에 송장 등록(발송) → 배송중 → 배송완료(주문도 delivered) → 추적 이력 누적의 백엔드
e2e 를 추가한다(GAP-005-01).

---

## 분할배송·주문 items UI 미구현 (상세)

**현상**: 두 항목이 의도된 범위 분리로 미구현이다.
- (1) **분할배송**: `findByOrderId` 는 `findFirst orderBy createdAt desc` 로 주문당 최신 송장 1건만 반환한다.
  한 주문에 복수 송장(분할배송)을 다루는 흐름은 미지원이다(현재 주문당 송장 1건 가정).
- (2) **주문 items UI**: `getSellerOrderDetail` 은 items 포함 주문을 반환하고 `SellerOrderDetail.items` 가
  응답에 있으나, console ship 헤더는 주문 상태·결제금액만 표시하고 품목 목록 UI 는 렌더하지 않는다.

**근본 원인 (주문당 1건 가정 + 헤더 컨텍스트 한정)**:
- 005 의 목표는 BE-GAP 2건 해소(재진입 복구·주문 컨텍스트)이며, 분할배송·품목 상세 UI 는 그 범위를 벗어난다.

**위험도**: 낮음(의도된 범위 분리). 현재 주문당 송장 1건 가정이 도메인 상태와 일치하며, 주문 헤더(상태·금액)
만으로 ship 화면의 컨텍스트 표시 목적은 충족된다.

**권장 수정 방향**: 분할배송 도입 시 `findByOrderId` 를 배열 반환으로 확장하고 송장 선택 UI 를 추가한다.
주문 품목 상세 표시가 필요해지면 ship 페이지에 `SellerOrderDetail.items` 렌더를 추가한다(GAP-005-01).

---

## 응답 스키마 한시·낙관적 업데이트 미적용 (상세)

**현상**: (1) `SellerOrderDetail` 도 004 와 동일하게 전이형 view 타입(금전 string)으로 한시 정의되었다(응답
OpenAPI 미정의 — Prisma 엔티티 반환). (2) console ship 의 create·updateStatus mutation 은 낙관적 업데이트
없이 서버 응답 후 `setQueryData`/`invalidateQueries` 한다.

**근본 원인 (004 전략 연속 + Phase 분리)**:
- 응답 스키마 한시성은 백엔드 응답 DTO 미보강(001 GAP-001-01 / 004 GAP-004-01 (3) 연속)에 기인하며 본 차수
  범위 외다. 낙관적 업데이트는 Phase 2 로 분리되었다(004 와 동일).

**위험도**: 낮음. view 타입은 백엔드 응답 DTO 보강 후 한 곳(`shared-types`)에서 생성 타입으로 대체 가능하다.
mutation 은 서버 응답 기준으로 상태를 갱신해 정합성을 유지한다.

**권장 수정 방향**: (1) 백엔드 응답 DTO + `@ApiResponse({ type })` 보강 후 코드젠 재생성으로 view 타입을
생성 타입 대체. (2) Phase 2 에서 `onMutate` 낙관적 업데이트 + 실패 롤백 적용(GAP-005-01).

---

## 신규 테스트 수 기록

005 신규 단위 테스트는 **6건**(getByOrder 3·getSellerOrderDetail 3)이며, 실제 git diff 를 직접 확인하여
확정했다(자가 보고 신뢰하지 않음):

| 파일 | 005 변경 | 신규 it() |
|---|---|---|
| `apps/backend/.../shipping/shipping.service.spec.ts` | `getByOrder` describe 추가(+46) | **3** (seller·buyer+null·stranger) |
| `apps/backend/.../order/order.service.spec.ts` | `getSellerOrderDetail` describe 추가(+32) | **3** (owner·not_owner·missing) |
| (그 외 변경 파일) | service·repository·controller·shared-types·api-client·openapi·console | 0(테스트 외) |

> `git diff 8bba04d 8b48eb5` 에서 테스트 파일 변경은 위 2종(+6 it). backend test 261 PASS(004 시점 255 +
> 6), e2e 84 PASS. 두 spec 파일 단독 실행 46 PASS 로 신규 6 포함 확인(main 직접 jest 실행).
</content>
