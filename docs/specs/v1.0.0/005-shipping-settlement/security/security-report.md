---
작성: Security Agent
버전: v1.0
최종 수정: 2026-06-29 17:30
상태: 확정 (retroactive)
---

# 보안 감사 결과 — 005-shipping-settlement

## 목차

- [검토 범위](#검토-범위)
- [요약](#요약)
- [Constitution 보안 조항 이행 현황](#constitution-보안-조항-이행-현황)
- [취약점 목록](#취약점-목록)
- [NFR 보안 요구사항 이행 현황](#nfr-보안-요구사항-이행-현황)
- [OWASP Top 10 점검 결과](#owasp-top-10-점검-결과)
- [긍정 확인 사항](#긍정-확인-사항)
- [권고사항](#권고사항)

---

## 검토 범위

### 검토 대상 파일 (DIFF-005-shipping-settlement.md 기반)

| 파일 | 검토 이유 |
|---|---|
| `shipping/shipping.controller.ts` | 인증 (JwtAuthGuard) |
| `shipping/shipping.service.ts` | 배송 추적 권한 3축(IDOR), 상태 전이 권한 |
| `shipping/shipping.repository.ts` | cross-schema 격리(P-001) |
| `settlement/settlement.controller.ts` | 인증·인가 (AdminGuard) |
| `settlement/settlement.service.ts` | 정산 금전 계산, 멱등성, 권한 |
| `settlement/settlement.repository.ts` | cross-schema 격리(P-001) |
| `settlement/settlement.constants.ts` | 수수료율 상수(Decimal 문자열) |
| `order/order.service.ts` | markShipped/markDelivered 소유권·상태 검증, getCompletedItemsForSettlement 집계 |
| `order/order.repository.ts` | 정산 집계 쿼리(기간·판매자 필터) |
| `prisma/schema.prisma` | 데이터 타입(Decimal), settlement_items.orderItemId 제약 |
| `test/static/cross-schema.spec.ts` | SC-051 정적 검증 |
| `test/static/schema-decimal.spec.ts` | SC-050 정적 검증 |

### 제외 파일 및 사유

- `shipping/dto/*.ts`, `settlement/dto/create-settlement.dto.ts` — IsString·IsEnum·IsDateString 등 기본 검증 데코레이터만, 금전 입력 필드 없음(정산액은 서버 계산)
- `shipping/shipping.events.ts`, `settlement/settlement.events.ts`, 모듈·spec 파일 — 보안 관련 로직 없음

---

## 요약

| 항목 | 내용 |
|---|---|
| 검토 대상 파일 수 | 12개 |
| Critical 건수 | 0 |
| High 건수 | 0 |
| Medium 건수 | 1 (SEC-FIND-005-01) |
| Low 건수 | 0 |
| 전체 취약점 건수 | 1 |
| 판정 | **COMPLETE** — Critical/High 0건, Medium 권고사항으로 기록 |

---

## Constitution 보안 조항 이행 현황

| 조항 | 이행 여부 | 비고 |
|---|---|---|
| P-001 (모듈 경계 원칙) | 이행 | ShippingRepository·SettlementRepository 는 자기 소유 테이블만 쿼리. 주문 데이터는 `OrderService` DI 경유(markShipped·markDelivered·getOrderOwnership·getCompletedItemsForSettlement). SC-051 정적 검증 PASS |
| P-002 (AWS 의존 금지) | 이행 | `@aws-sdk/*` 신규 의존 없음. SC-052 정적 검증 대상 |
| P-005 (결제·정산 정합성) | 부분 이행(멱등성 공백) | 금전 필드 전부 `Decimal(12,2)`, 계산 `Prisma.Decimal`(`COMMISSION_RATE='0.1'` 문자열). 송장/배송/정산 생성 단일 트랜잭션. **단 정산 중복 생성 멱등성 미보장(SEC-FIND-005-01)** |

---

## 취약점 목록

### SEC-FIND-005-01 — Medium

| 항목 | 내용 |
|---|---|
| **SEC-ID** | SEC-FIND-005-01 |
| **심각도** | Medium |
| **OWASP** | A04 (Insecure Design — 멱등성/무결성 제약 부재) |
| **위치** | `apps/backend/src/modules/settlement/settlement.service.ts` `createSettlement()` / `order/order.service.ts` `getCompletedItemsForSettlement()` / `order/order.repository.ts` `findCompletedItemsBySellerInPeriod()` / `prisma/schema.prisma` `SettlementItem` |
| **설명** | 정산 생성이 멱등성을 보장하지 않는다. (1) `getCompletedItemsForSettlement` 가 기간 내 모든 `completed` 주문항목을 반환하며 **이미 정산에 포함된 항목을 제외하지 않는다**. (2) `SettlementItem.orderItemId` 에 **UNIQUE 제약이 없다**. 따라서 관리자가 동일/겹치는 기간으로 `POST /settlements` 를 재호출하면 동일 `orderItemId` 가 복수 정산의 `settlement_items` 에 중복 집계되어 중복 지급액(`payoutAmount`)이 산정될 수 있다. |
| **공격 경로** | 1. 관리자가 특정 판매자·기간으로 `POST /settlements` 호출 → 정산 A 생성. 2. 동일(또는 겹치는) 기간으로 재호출 → 정산 B 가 동일 항목을 다시 집계 → 동일 매출이 A·B 양쪽 payoutAmount 에 반영. |
| **공격자 요건** | 관리자(AdminGuard 통과 필요) — 외부 악용이 아닌 내부 운영 절차 오류 범위 |
| **실질 위험** | 중간 — 트리거가 admin-only 이므로 외부 공격 표면이 아니다. 다만 운영 실수(중복/겹치는 기간 재정산)로 판매자 과다 지급액이 산정될 수 있어 금전 정합성(P-005) 관점의 설계 공백이다. |
| **수정 방향** | (1) `SettlementItem.orderItemId` 에 `@unique` 추가(DB 수준 중복 차단). (2) `getCompletedItemsForSettlement` 에서 기존 `settlement_items` 에 포함된 `orderItemId` 제외. (3) 중복정산 거부 단위 테스트 추가. |
| **상태** | OPEN (gaps.md GAP-005-01 에 기록, 후속 정산 보강 spec 위임) |

---

## NFR 보안 요구사항 이행 현황

| ID | 요구사항 | 이행 여부 | 비고 |
|---|---|---|---|
| NFR-001 | 금전 수치 Decimal, 부동소수점 금지 | 이행 | `settlements`·`settlement_items` 금전 필드 5종 전부 `@db.Decimal(12,2)`. 계산 `Prisma.Decimal`(`.add/.mul/.minus/.toDecimalPlaces(2, ROUND_HALF_UP)`), `COMMISSION_RATE='0.1'` 문자열. SC-050 정적 검증 PASS |
| NFR-002 | 송장/배송/정산 단일 트랜잭션 원자성 | 이행 | createShipment·updateStatus·createSettlement 각각 `runInTransaction`. 실패 시 전체 롤백 |
| NFR-003 | Repository cross-schema 접근 금지 | 이행 | ShippingRepository → orders.shipments·shipment_tracking 만. SettlementRepository → settlements 전용. 주문 데이터 OrderService DI. SC-051 정적 검증 PASS |
| NFR-004 | 인증·AdminGuard 보호 | 이행 | shipping 3 엔드포인트 + settlement `GET /settlements` JwtAuthGuard. `POST /settlements`·`GET /admin/settlements` AdminGuard(fail-closed) 추가 |
| NFR-005 | 배송 추적 IDOR 차단 | 이행 | getTracking 권한 3축 — 구매자 `order.userId` 또는 판매자 `sellerIds.includes(seller.id)`. 둘 다 아니면 403. 미승인 판매자 `_resolveSellerId` 가 null 흡수. SC-003 단위 테스트 |
| NFR-006 | AWS SDK 신규 의존 금지 | 이행 | 변경 파일 중 `@aws-sdk/*` 신규 추가 없음. SC-052 검증 대상 |

---

## OWASP Top 10 점검 결과

| OWASP | 항목 | 점검 결과 | 근거 |
|---|---|---|---|
| A01 | 접근 제어 취약점 | 양호 | 배송 추적 권한 3축(IDOR 차단, SC-003). 정산 생성·전체 조회 AdminGuard. 판매자 본인 정산만(listBySeller) |
| A02 | 암호화 실패 | 해당 없음 | 암호화 신규 로직 없음. JWT 는 기존 공유 모듈 |
| A03 | 인젝션 | 양호 | Prisma 파라미터화 쿼리만. raw SQL 미사용. 정산 집계는 Prisma `findMany` where 필터 |
| A04 | 안전하지 않은 설계 | Medium 1건 (SEC-FIND-005-01) | 정산 멱등성/제약 부재. 그 외 배송·정산 흐름은 트랜잭션 원자성·권한 검증 설계 양호 |
| A05 | 보안 설정 오류 | 양호 | cross-schema 격리(SC-051). AdminGuard fail-closed |
| A06 | 취약한 컴포넌트 | 양호 | 기존 검증 라이브러리(class-validator·Prisma·@nestjs/event-emitter) 재사용. 신규 패키지 0 |
| A07 | 인증·세션 관리 | 양호 | JwtAuthGuard + AdminGuard. 판매자 권한 `getApprovedSeller` APPROVED 검증 |
| A08 | 소프트웨어 무결성 | 양호 | 배송 추적 append-only(이력 변조 불가). 이벤트 payload 정의된 인터페이스 |
| A09 | 로깅·모니터링 | 양호 | `shipping.shipped`·`shipping.delivered` 이벤트 발행(커밋 후). 주문 전이 order_events append |
| A10 | SSRF | 해당 없음 | 외부 URL 조회 로직 없음 (택배사 API 연동 범위 외) |

---

## 긍정 확인 사항

본 감사에서 확인된 안전한 설계·구현:

| 항목 | 확인 내용 |
|---|---|
| **배송 추적 정보 누출 차단** | `getTracking` 이 구매자(`order.userId`) 또는 해당 주문 판매자(`sellerIds`)만 허용. 제3자·미승인 판매자는 403. 미승인 판매자 예외를 `_resolveSellerId` try/catch 가 흡수하여 권한 판정 오류 없음(SC-003). |
| **정산 생성 AdminGuard 보호** | `POST /settlements`·`GET /admin/settlements` 에 AdminGuard(fail-closed) 적용. 판매자·일반 사용자는 정산 생성·전체 조회 불가. |
| **Decimal 금전 클라이언트 조작 경로 없음** | 정산액(totalSales·commission·payoutAmount)은 전부 서버가 `completed` 주문항목 매출에서 Decimal 로 계산. 클라이언트 입력(`CreateSettlementDto`)은 sellerId·기간만 받으며 금액 필드 부재. 클라이언트가 금액을 지정할 경로 없음(SEC-FIND-004 류 재발 없음). |
| **DTO class-validator 검증** | `CreateSettlementDto`(@IsString·@IsDateString), `CreateShipmentDto`(@IsNotEmpty), `UpdateShipmentStatusDto`(@IsEnum) 으로 입력 형식 검증. 전역 ValidationPipe. |
| **배송 상태 전이 소유권 검증** | `markShipped`·`markDelivered` 가 주문 항목 sellerId 일치·상태(preparing/shipped) 검증. shipping 이 order 테이블을 직접 변조하지 않고 OrderService DI 경유(P-001). |

---

## 권고사항

### 권고-001 (Medium, SEC-FIND-005-01 관련)

정산 멱등성 보장 — 후속 정산 보강 spec 에서 처리 권장:

```prisma
// schema.prisma — SettlementItem
model SettlementItem {
  // ...
  orderItemId String @unique   // 추가 권고: 동일 주문항목 중복 집계 DB 차단
}
```

```typescript
// order.service.ts getCompletedItemsForSettlement — 추가 권고
// 기존 settlement_items 에 포함된 orderItemId 제외 후 집계
// 또는 settlement.service.createSettlement 에서 기집계 항목 필터링
```

추가로 중복정산 거부 단위 테스트(동일 orderItemId 재집계 시 거부 단언) 작성을 권고한다.

### 일반 권고 (Informational)

- **정산 기간 기준 시각**: 정산 집계가 주문 `createdAt` 기준이다(전용 `completedAt` 부재). 정확한
  정산 주기 산정이 필요하면 주문에 `completedAt` 컬럼 추가를 검토한다(GAP-005-02, 보안 영향 없음).
- **정산 지급 실행 미구현**: `SettlementStatus.completed`(지급 완료) 전이 엔드포인트가 본 spec 범위
  외다. 실제 이체 연동 시 결제·환불과 동일하게 멱등성 키·outbox 패턴(P-005) 적용을 권고한다.
