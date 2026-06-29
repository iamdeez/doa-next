---
작성: Test Agent (EXECUTION)
버전: v1.0
최종 수정: 2026-06-29 19:01
상태: 확정 (retroactive)
---

# Coverage: 009-notification-events

## 목차

- [실행 요약](#실행-요약)
- [SC × 시나리오 커버리지 매트릭스](#sc--시나리오-커버리지-매트릭스)
- [커버리지 요약](#커버리지-요약)
- [STALE_SC 경고](#stale_sc-경고)

---

## 실행 요약

> 본 retroactive 검증은 009 완료 커밋 `b3793fa`(base `e97a142`) 기준으로 main session 이 게이트를 직접
> 재실행·코드리뷰하여 확인한 수치다. 신규 단위 테스트 개수는 실제 spec 파일의 `it()` 를 직접 카운트했다.

| 항목 | 본 retroactive 검증 (HEAD `b3793fa`) |
|---|---|
| tsc `--noEmit` | **EXIT 0** |
| Unit 테스트 (src/) | **25 suites / 239 PASS** (008 대비 +8) |
| e2e + Static 테스트 (test/) | **16 suites / 84 PASS** (변화 없음 — 009 전용 신규 e2e 없음) |
| AppModule 부팅 | 정상 — NotificationModule imports Order/Seller/Product + EventsHandler provider, 순환 의존 없음 |
| 009 신규 단위 테스트 | **8** (notification.events.spec — `it()` 직접 카운트) |
| 009 회귀 | **0** (003~008 전체 PASS) |
| 마이그레이션 | 없음(스키마 변경 0) |

> **신규 단위 8 산정 근거(사실 기준)**:
> - `notification.events.spec.ts` = 8 케이스(`grep -cE '\bit\('` 직접 카운트 — onOrderCreated 1 +
>   onShipmentShipped 2 + onSettlementCreated 2 + onReviewCreated 2 + 격리 1).
> - 008 baseline 231 + 8 = 239 로 정합. suites +1(notification.events.spec 신규 suite).
> - `order.service.spec.ts`·`settlement.service.spec.ts` 의 009 변경은 `EventEmitter2`(+`onAfterCommit`)
>   mock provider 추가일 뿐 신규 `it()` 케이스가 아니다(회귀 0 보장 목적).
> - e2e+static 16/84 는 008 과 동일(009 전용 신규 e2e 미추가 — SC-006 은 기존 AppModule 부팅 묶음으로 확인).

### 실행 커맨드

```bash
cd apps/backend
npx tsc --noEmit -p tsconfig.json                                              # EXIT 0
npx jest --testPathPattern="src/"                                              # 25 suites / 239 PASS
npx jest --config ./test/jest-e2e.json                                         # 16 suites / 84 PASS (변화 없음)
```

---

## SC × 시나리오 커버리지 매트릭스

| SC-ID | 수용 기준 | Happy Path | Edge/Error Case | 상태 |
|---|---|---|---|---|
| SC-001 | order.created → 구매자 ORDER_PLACED | when_order_created_then_notify_buyer_ORDER_PLACED | — | PASS |
| SC-002 | shipping.shipped → ORDER_SHIPPED / 해석 throw 격리 | when_shipped_then_resolve_buyer_and_notify_ORDER_SHIPPED | when_ownership_resolution_throws_then_no_create_and_no_throw | PASS |
| SC-003 | settlement.created → SETTLEMENT_CREATED / null skip | when_settlement_created_then_resolve_seller_user_and_notify | when_seller_userId_unresolved_then_no_create | PASS |
| SC-004 | review.created → REVIEW_RECEIVED / no seller skip | when_review_created_then_resolve_seller_via_product_and_notify | when_product_has_no_seller_then_no_create | PASS |
| SC-005 | create 실패 격리 | — | create 실패가 핸들러 밖으로 전파되지 않는다 (격리) | PASS |
| SC-006 | AppModule 부팅·순환 의존 없음 | NotificationModule imports Order/Seller/Product + EventsHandler provider → DI 해석 성공(기존 부팅 e2e 묶음) | — | PASS (간접 — 기존 부팅 묶음) |

---

## 커버리지 요약

| 항목 | 수 |
|---|---|
| 전체 SC | 6 (핸들러 단위 5 + 통합 부팅 1) |
| PASS (직접 커버) | 5 (SC-001~005) |
| INDIRECT (간접 커버) | 1 (SC-006 — 기존 AppModule 부팅 e2e 묶음으로 순환 의존 부재 확인, 009 전용 신규 e2e 없음) |
| GAP | 0 |

> SC-001~005 는 핸들러 단위 테스트로 직접 커버(PASS). SC-006(부팅·순환 의존 없음)은 기존 AppModule 부팅
> e2e 묶음(16/84)이 DI 그래프를 해석하여 간접 확인한다(009 전용 신규 e2e 미추가 — coverage-gap.md).
> 009 는 신규 GAP 을 남기지 않으며, 006 의 GAP-006-01 을 RESOLVED 처리한다.

---

## STALE_SC 경고

STALE_SC 검출 결과: **0건**

검출 대상: 009 git diff(`git diff e97a142 b3793fa -- apps/backend`) 변경 파일 내 테스트 SC 번호.
`notification.events.spec.ts` 는 행위 기반 `it('when_..._then_...')`(및 한국어 격리 케이스) 명명을
사용하며 docstring 에 SC 번호를 직접 부착하지 않는다(spec.md SC 와의 매핑은 본 coverage.md·test-cases.md
가 담당). semantic mismatch 없음.
