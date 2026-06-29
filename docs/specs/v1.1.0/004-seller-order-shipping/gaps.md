---
작성: Design Agent → Docs Agent 누적
버전: v1.0
최종 수정: 2026-06-30 01:06
상태: 확정 (retroactive)
---

# Gaps — 004-seller-order-shipping

> 기획/설계 공백 누적 기록. 3단계 이후 모든 Agent 가 누적.

## 목차

- [신규 GAP](#신규-gap)
- [해결한 선행 설계 공백](#해결한-선행-설계-공백)

---

## 신규 GAP

### GAP-004-01

- **출처**: Design Agent / Test Agent (research·coverage-gap) / Docs Agent
- **유형**: 백엔드 계약 공백(BE-GAP) + 점진 전환·테스트 자동화 한계 (Low~Medium — 권고) — 판매자 주문 상세·
  주문→송장 조회 엔드포인트 부재 + 응답 스키마 미정의(view 타입 한시) + e2e/rhf/낙관적 업데이트 부재
- **컨텍스트**: 백엔드 주문·배송 라우트(`/seller/orders`·`/shipments` — 응답 OpenAPI 미정의, 단건 주문 상세·
  주문→송장 조회 부재), `apps/console/app/(dashboard)/seller/orders/[id]/ship/page.tsx`(세션 state 완결),
  `packages/shared-types/src/index.ts`(전이형 view 타입)
- **내용**:
  - (1) **BE-GAP: 판매자용 단건 주문 조회 엔드포인트 부재** (Medium) — `GET /orders/:id` 는 구매자 스코프
    이므로 ship 페이지가 판매자 권한으로 주문 상세(items 등)를 직접 가져오지 못한다. 현재 `useParams` 의
    orderId 만 사용한다. **→ RESOLVED (005, 커밋 `8b48eb5`)**: `GET /seller/orders/:orderId`(items 포함,
    `getApprovedSeller` + items sellerId 소유 검증 — 미존재 404·비소유 403) + `api.order.getSellerDetail`
    추가, ship 헤더에 주문 상태·금액 표시.
  - (2) **BE-GAP: 주문→송장 조회 엔드포인트 부재** (Medium) — `GET /shipments?orderId` 또는 주문 응답에
    shipment 포함이 없어, 이미 발송된 주문에 ship 페이지 재진입 시 기존 shipment id 를 복구하지 못한다.
    현재는 송장 등록 직후 세션 state 의 shipment id 로 상태변경·추적이 동작한다(세션 내 완결). 재진입 시
    재등록 시도는 백엔드가 400(주문이 preparing 아님)으로 거부한다. **→ RESOLVED (005, 커밋 `8b48eb5`)**:
    `GET /shipments?orderId=`(권한 3축 `_assertCanViewOrder`, 미존재 null) + `findByOrderId`(최신 1건) +
    `api.shipping.getByOrder` 추가, ship 진입 시 `useQuery` 로 기존 송장 복구(세션 `useState` 대체).
  - (3) **응답 스키마 미정의 → view 타입 한시** (Low) — 주문·배송 응답은 백엔드가 Prisma 엔티티를 반환하고
    OpenAPI 응답 content 가 미주석이다(87 ops 중 typed 2xx content 36건 — 001 GAP-001-01 연속). 따라서
    003 타입드 client 대신 `@doa/shared-types` 전이형 view 타입(금전 string)을 한시 정의했다.
  - (4) **프론트 후속(Phase 2) 부재** (Low) — rhf+zod 폼 검증·낙관적 업데이트·서버 페이지네이션(현재 전체
    배열)·DataTable(TanStack) 정렬/필터·e2e 테스트가 본 차수에 없다.
- **수정 방향**:
  - (1)·(2) 백엔드에 판매자 스코프 단건 주문 상세(`GET /seller/orders/:id`, items 포함)·주문→송장 조회
    (`GET /shipments?orderId` 또는 주문 응답에 shipment 포함) 엔드포인트를 추가한다. 추가 후 ship 페이지가
    진입 시 기존 송장 복구 + 주문 상세 표시를 하도록 보강한다.
  - (3) 백엔드에 도메인별 응답 DTO + `@ApiResponse({ type })` 보강 후 코드젠 재생성하면 view 타입을 생성
    타입(`Schemas['...']`)으로 대체 가능하다(001 GAP-001-01 / 003 GAP-003-01 / FRONTEND-PLAN §8 점진 보강).
  - (4) Phase 2 에서 rhf+zod 폼 검증·`onMutate` 낙관적 업데이트·서버 페이지네이션·TanStack Table DataTable·
    Playwright e2e 를 추가한다.
- **영향**: 낮음~중간 — Phase 1 핵심 목표(판매자 주문 확인·송장 등록(발송)·배송 상태 전이·추적 조회 화면)는
  console typecheck 0·build 14 라우트 PASS 로 달성. BE-GAP (1)·(2)는 재진입 복구·주문 상세 UX 제약을 낳으나
  세션 내 완결로 핵심 이행 흐름은 동작한다. view 타입 한시·Phase 2 미구현은 점진 보강 대상이다.
- **상태**: 부분 RESOLVED — **BE-GAP 2건 (1)·(2)(판매자 주문 상세·주문→송장 조회)는 005(커밋 `8b48eb5`)로
  RESOLVED**(위 (1)·(2) 항목 참조). 잔여 OPEN — (3) 응답 스키마 보강은 001/003 GAP 연속(Low), (4) Phase 2
  프론트 보강(rhf/낙관적/페이지네이션·e2e)은 후속 위임(Low, 005 GAP-005-01 로 이월). coverage-gap.md 와 동일
  사안. 003 GAP-003-01(console 마이그레이션·응답 스키마 품질)의 연속이며, 004 는 그중 판매자 주문·배송 도메인
  화면을 view 타입 + facade 로 **구현**, 005 는 그 BE-GAP 2건을 **해소**한다.

---

## 해결한 선행 설계 공백

| 식별자 | 선행 맥락 | 등급 | 004 해결 | 상태 |
|---|---|---|---|---|
| GAP-003-01 (판매자 주문·배송 화면 부분) | 003 §범위 외 — "console 페이지의 기존 facade 호출 마이그레이션·신규 화면" / FRONTEND-PLAN Phase 1 판매자 화면 부재 | 후속 위임 | console 판매자 영역에 주문 목록(`/seller/orders`)·송장·배송(`/seller/orders/[id]/ship`) 화면 추가. 응답 OpenAPI 미정의 도메인을 전이형 view 타입 + `api.order`/`api.shipping` facade 로 호출. `@doa/ui` 시맨틱 토큰 + TanStack Query 구성. AppShell 네비·토큰 전환 | **RESOLVED (004, 커밋 8bba04d — 판매자 주문·배송 화면 한정. 판매자 주문 상세·주문→송장 조회 엔드포인트·응답 스키마 보강·rhf/낙관적/페이지네이션은 GAP-004-01 후속)** |

> 003 GAP-003-01 은 (1) console 호출 타입드 마이그레이션 (2) 응답 스키마 품질(백엔드 의존) (3) authFetch
> 단위 테스트의 3건을 묶은 항목이었다. 004 는 그중 **판매자 주문·배송 도메인 화면** 을 구현하되, 응답
> 스키마가 미정의인 도메인이라 타입드 client 대신 view 타입 + facade 를 채택했다(응답 스키마 보강 후 생성
> 타입 대체 — GAP-004-01 (3)). 003 GAP-003-01 의 (2) 응답 스키마·(3) authFetch 단위 테스트는 그대로 OPEN
> 유지(004 무관). console 의 다른 기존 화면 타입드 마이그레이션은 Phase 1+ 후속으로 지속된다.
</content>
