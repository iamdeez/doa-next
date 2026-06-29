---
작성: Design Agent → Docs Agent 누적
버전: v1.0
최종 수정: 2026-06-30 01:23
상태: 확정 (retroactive)
---

# Gaps — 005-order-shipping-gap-fill

> 기획/설계 공백 누적 기록. 3단계 이후 모든 Agent 가 누적.

## 목차

- [신규 GAP](#신규-gap)
- [해결한 선행 설계 공백](#해결한-선행-설계-공백)

---

## 신규 GAP

### GAP-005-01

- **출처**: Design Agent / Test Agent (research·coverage-gap) / Security Agent / Docs Agent
- **유형**: 테스트 자동화 한계 + 기능 범위 분리 + 응답 스키마 한시 (Low — 권고) — 송장 status e2e 부재 +
  분할배송·주문 items UI 미구현 + 낙관적 업데이트 미적용 + 응답 스키마 한시(view 타입)
- **컨텍스트**: `shipping.repository.ts`(`findByOrderId` 최신 1건)·`order.service.ts`(`getSellerOrderDetail`
  items 포함)·`apps/console/.../ship/page.tsx`(주문 헤더 상태/금액만)·`packages/shared-types/src/index.ts`
  (`SellerOrderDetail` 전이형 view 타입)
- **내용**:
  - (1) **송장 status e2e 부재** (Low) — 권한·소유 분기는 단위 +6 으로 검증했으나, 송장 등록(발송)→배송중→
    배송완료→추적 누적의 백엔드 e2e 시나리오가 본 차수에 없다.
  - (2) **분할배송(주문당 송장 N건) 미지원** (Low) — `findByOrderId` 는 `findFirst orderBy createdAt desc`
    로 주문당 최신 송장 1건만 반환한다(현재 주문당 1건 가정). 한 주문에 복수 송장을 다루는 흐름은 미지원.
  - (3) **주문 items UI 미렌더** (Low) — `getSellerOrderDetail` 이 items 포함 주문을 반환하고
    `SellerOrderDetail.items` 가 응답에 있으나, console ship 헤더는 주문 상태·결제금액만 표시하고 품목 목록
    UI 는 렌더하지 않는다.
  - (4) **낙관적 업데이트 미적용** (Low) — console ship 의 create·updateStatus mutation 은 서버 응답 후
    `setQueryData`/`invalidateQueries` 하며 `onMutate` 낙관적 업데이트는 미적용이다(004 연속).
  - (5) **응답 스키마 한시(view 타입)** (Low) — `SellerOrderDetail` 도 백엔드 응답이 OpenAPI 에 미정의
    (Prisma 엔티티 반환)여서 전이형 view 타입(금전 string)으로 한시 정의했다(004 GAP-004-01 (3) / 001
    GAP-001-01 연속).
- **수정 방향**:
  - (1) 백엔드 e2e 에 송장 등록→배송 전이→추적 누적 흐름을 추가한다.
  - (2) 분할배송 도입 시 `findByOrderId` 를 배열 반환으로 확장하고 송장 선택 UI 를 추가한다(현재 가정 재검토).
  - (3) 주문 품목 상세 표시가 필요해지면 ship 페이지에 `SellerOrderDetail.items` 렌더를 추가한다.
  - (4) Phase 2 에서 `onMutate` 낙관적 업데이트 + 실패 롤백을 적용한다.
  - (5) 백엔드 응답 DTO + `@ApiResponse({ type })` 보강 후 코드젠 재생성하면 view 타입을 생성 타입으로 대체
    가능하다(001/004 GAP 연속).
- **영향**: 낮음 — 본 차수 핵심 목표(004 BE-GAP 2건 해소 — ship 재진입 복구 + 주문 컨텍스트 표시 + 권한 3축/
  소유 검증)는 backend unit 261(+6)·e2e 84·tsc 0·console typecheck 0·build 14 라우트 PASS 로 달성. 위 항목은
  전부 후속 권고(범위 외 / 백엔드 후속 / Phase 2)다.
- **상태**: OPEN — 송장 status e2e·분할배송·주문 items UI·낙관적 업데이트는 후속 위임(Low), 응답 스키마
  보강은 001/004 GAP 연속(Low). 004 GAP-004-01 의 (3)·(4)(응답 스키마 한시·Phase 2 프론트)는 본 차수에서도
  계속 OPEN 이며, (1)·(2)(BE-GAP 2건)는 본 차수로 RESOLVED(아래 표).

---

## 해결한 선행 설계 공백

| 식별자 | 선행 맥락 | 등급 | 005 해결 | 상태 |
|---|---|---|---|---|
| GAP-004-01 (1) 판매자 주문 상세 부재 | 004 BE-GAP — `GET /orders/:id` 는 구매자 스코프, ship 페이지가 판매자 권한으로 주문 상세를 못 가져옴 | Medium | `GET /seller/orders/:orderId`(items 포함, `getApprovedSeller` + items sellerId 소유 검증 — 미존재 404·비소유 403) + `api.order.getSellerDetail` + ship 헤더에 주문 상태·금액 표시 | **RESOLVED (005, 커밋 8b48eb5)** |
| GAP-004-01 (2) 주문→송장 조회 부재 | 004 BE-GAP — `GET /shipments?orderId` 부재로 ship 재진입 시 기존 송장 복구 불가(세션 state 완결) | Medium | `GET /shipments?orderId=`(권한 3축 `_assertCanViewOrder`, 미존재 null) + `findByOrderId`(최신 1건) + `api.shipping.getByOrder` + ship 진입 시 `useQuery` 로 기존 송장 복구(세션 `useState` 대체) | **RESOLVED (005, 커밋 8b48eb5)** |

> 004 GAP-004-01 은 (1) 판매자 주문 상세 (2) 주문→송장 조회 (3) 응답 스키마 미정의 (4) Phase 2 프론트의
> 4건을 묶은 항목이었다. 005 는 그중 **BE-GAP 2건 (1)·(2)** 를 백엔드 신규 라우트 + console 재진입 복구로
> 해소했다. (3) 응답 스키마 한시·(4) Phase 2 프론트(rhf/낙관적/페이지네이션)는 본 차수에서도 OPEN 유지하며
> GAP-005-01 (4)·(5)로 이월한다. 004 gaps.md 의 GAP-004-01 (1)·(2) 상태는 RESOLVED(005)로 갱신한다.
</content>
