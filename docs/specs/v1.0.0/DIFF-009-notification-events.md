---
작성: Docs Agent
버전: v1.0
최종 수정: 2026-06-29 19:01
상태: 확정 (retroactive)
---

# Diff: 009-notification-events

## 목차

- [커밋 메시지용 한 줄 요약](#커밋-메시지용-한-줄-요약)
- [변경 요약](#변경-요약)
- [변경 파일 및 라인 수](#변경-파일-및-라인-수)
- [Diff](#diff)

## 커밋 메시지용 한 줄 요약

- **KO**: 009 알림 이벤트 연동 (GAP-006-01) — 도메인 이벤트 구독 핸들러로 알림 생성
- **EN**: 009 notification event wiring — domain event subscriber handler creates notifications

## 변경 요약

- **NotificationEventsHandler 신규(구독자 패턴)**: `@Injectable` + `@OnEvent` 4종 — order.created→구매자
  ORDER_PLACED, shipping.shipped→`getOrderOwnership(orderId).userId` 구매자 ORDER_SHIPPED,
  settlement.created→`getUserIdBySellerId` 판매자 SETTLEMENT_CREATED, review.created→
  `getSellerIdByProductId`→`getUserIdBySellerId` 판매자 REVIEW_RECEIVED. 알림 생성을 publisher 에 직접
  삽입하지 않고 핸들러가 구독. 수신자 해석은 read-only Service DI(P-001). 실패 격리 `safeNotify`
  (try/catch + Logger) — 알림 실패가 주문/배송/정산 흐름에 전파되지 않음. 수신자 미해석(null) 시 생략.
- **additive read-only 해석 메서드**: `SellerService.getUserIdBySellerId(sellerId)`,
  `ProductService.getSellerIdByProductId(productId)` — 각각 자기 스키마 findById 의 userId·sellerId 반환
  (미존재 시 null).
- **additive after-commit emit**: `OrderService.createOrder` 가 `order.created{orderId, userId}` 를,
  `SettlementService.createSettlement` 가 `settlement.created{settlementId, sellerId}` 를 `onAfterCommit`
  으로 발행(EventEmitter2 DI). 페이로드 타입 `OrderCreatedPayload`·`SettlementCreatedPayload`.
  shipping.shipped(005)·review.created(004)는 기존 emit 재사용.
- **모듈 와이어링**: `NotificationModule` 이 `OrderModule`·`SellerModule`·`ProductModule` import +
  `NotificationEventsHandler` provider 등록. 순환 의존 없음(order·seller·product 어느 것도 notification
  미import — AppModule 부팅 검증).
- **테스트**: notification.events.spec 8건(SC-001~005). order.service.spec·settlement.service.spec 은
  EventEmitter2(settlement 은 onAfterCommit 도) mock provider 추가(회귀 0 보장 — 신규 케이스 아님).
- **마이그레이션 없음**: 006 Notification 테이블·NotificationType enum 재사용(스키마 변경 0).
- **해결**: GAP-006-01(알림 이벤트 미연동) — NotificationType 4종 전부 실제 생성 경로 확보.

## 변경 파일 및 라인 수

> 범위: `apps/backend`. base `e97a142`(008 완료) → `b3793fa`(009 완료).

| 파일 | 추가 | 삭제 |
|---|---|---|
| `apps/backend/src/modules/notification/notification.events.spec.ts` | +140 | -0 |
| `apps/backend/src/modules/notification/notification.events.ts` | +115 | -1 |
| `apps/backend/src/modules/notification/notification.module.ts` | +11 | -4 |
| `apps/backend/src/modules/order/order.events.ts` | +6 | -0 |
| `apps/backend/src/modules/order/order.service.spec.ts` | +5 | -0 |
| `apps/backend/src/modules/order/order.service.ts` | +9 | -0 |
| `apps/backend/src/modules/product/product.service.ts` | +9 | -0 |
| `apps/backend/src/modules/seller/seller.service.ts` | +9 | -0 |
| `apps/backend/src/modules/settlement/settlement.events.ts` | +12 | -1 |
| `apps/backend/src/modules/settlement/settlement.service.spec.ts` | +5 | -0 |
| `apps/backend/src/modules/settlement/settlement.service.ts` | +12 | -0 |

**합계 (apps/backend)**: 11 files changed, 333 insertions(+), 6 deletions(-).

> 본 009 SDD 문서 세트(`docs/specs/v1.0.0/009-notification-events/**`) 와 `CHANGES.md` 의 009 항목,
> 그리고 006 문서의 GAP-006-01 상태 갱신은 `b3793fa` 코드 커밋 **이후** retroactive 로 별도 추가되었다
> (코드 diff 범위 외).

## Diff

> 전체 diff 는 본 문서에 박제하지 않는다 — **git 이 형상관리 SoT** 이며 전체 캡처는 중복·비효율이다.
> 변경 내용은 위 "변경 요약" · "변경 파일 및 라인 수" 절로 추적하고, 라인 단위 diff 가 필요하면 아래로 재생성한다:
>
> ```bash
> git diff e97a142 b3793fa -- apps/backend   # base commit: e97a142 (008 완료)
> ```
