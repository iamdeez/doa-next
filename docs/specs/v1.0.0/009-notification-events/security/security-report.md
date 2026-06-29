---
작성: Security Agent
버전: v1.0
최종 수정: 2026-06-29 19:01
상태: 확정 (retroactive)
---

# 보안 감사 결과 — 009-notification-events

## 목차

- [검토 범위](#검토-범위)
- [요약](#요약)
- [GAP-006-01 해결 검증](#gap-006-01-해결-검증)
- [Constitution 보안 조항 이행 현황](#constitution-보안-조항-이행-현황)
- [NFR 보안 요구사항 이행 현황](#nfr-보안-요구사항-이행-현황)
- [OWASP Top 10 점검 결과](#owasp-top-10-점검-결과)
- [긍정 확인 사항](#긍정-확인-사항)
- [권고사항](#권고사항)

---

## 검토 범위

### 검토 대상 파일 (DIFF-009-notification-events.md 기반)

| 파일 | 검토 이유 |
|---|---|
| `notification/notification.events.ts` | 알림 실패 격리(safeNotify)·수신자 해석 권한·@OnEvent 구독 |
| `notification/notification.module.ts` | 모듈 import 단방향성(순환 의존 부재) |
| `order/order.service.ts`, `order/order.events.ts` | order.created after-commit emit(페이로드 최소성) |
| `settlement/settlement.service.ts`, `settlement/settlement.events.ts` | settlement.created emit(식별자만, 금액 미포함) |
| `seller/seller.service.ts` | getUserIdBySellerId(read-only, sellers 스키마) |
| `product/product.service.ts` | getSellerIdByProductId(read-only, products 스키마) |

### 제외 파일 및 사유

- review 모듈 — 009 변경 없음(004 `review.created` emit 재사용, 검토 대상 외)
- `*.spec.ts` — 보안 관련 production 로직 없음(mock·단언)

---

## 요약

| 항목 | 내용 |
|---|---|
| 검토 대상 파일 수 | 8개 |
| Critical 건수 | 0 |
| High 건수 | 0 |
| Medium 건수 | 0 |
| Low 건수 | 0 |
| 전체 취약점 건수 | 0 |
| 판정 | **COMPLETE** — Critical/High/Medium/Low 0건. 006 의 GAP-006-01(알림 미연동)을 RESOLVED 로 검증 확정 |

---

## GAP-006-01 해결 검증

> 006-search-notification-file 의 Low 공백 — 알림 도메인 이벤트 미연동(실제 생성 경로 부재). 009 가 해결 대상.

| 검증 항목 | 006 상태 (공백) | 009 해결 (코드 근거) | 판정 |
|---|---|---|---|
| 알림 생성 경로 | `NotificationService.create()` export 됐으나 호출 측 0 | `NotificationEventsHandler`(@OnEvent 4종)가 order.created·shipping.shipped·settlement.created·review.created 를 구독하여 `create()` 호출 | RESOLVED |
| NotificationType 4종 활용 | enum 열거만, 실제 생성 type 0 | ORDER_PLACED·ORDER_SHIPPED·SETTLEMENT_CREATED·REVIEW_RECEIVED 전부 핸들러에서 실제 생성 | RESOLVED |

**판정**: GAP-006-01 → **RESOLVED (009, 커밋 b3793fa)**. 4종 도메인 이벤트가 각각 올바른 수신자에게
알림을 생성하는 경로가 확보되었다. 006 gaps.md GAP-006-01 / 006 coverage-gap.md 의 상태가 RESOLVED 로
갱신된다.

---

## Constitution 보안 조항 이행 현황

| 조항 | 이행 여부 | 비고 |
|---|---|---|
| P-001 (모듈 경계 원칙) | 이행 | 수신자 해석은 read-only Service DI(getOrderOwnership·getUserIdBySellerId·getSellerIdByProductId). 핸들러가 타 도메인 테이블 직접 쿼리 0. cross-schema plain String |
| P-002 (외부 의존 추상화) | 이행 | 신규 npm 의존 0. 인-프로세스 @nestjs/event-emitter(기존). 외부 푸시 SDK 0 |
| P-005 (결제·정산 정합성) | 해당 없음 | 009 는 금전 필드 생성·변경 0. settlement.created emit 은 식별자만 전달(금액 미포함) |

---

## NFR 보안 요구사항 이행 현황

| ID | 요구사항 | 이행 여부 | 비고 |
|---|---|---|---|
| NFR-001 | 수신자 해석 read-only DI(P-001) | 이행 | 핸들러가 타 도메인 테이블 직접 쿼리 안 함. 수신자(userId)는 서버가 도메인 Service 로 해석 |
| NFR-002 | 구독자 패턴·순환 의존 없음 | 이행 | NotificationModule → Order/Seller/Product 단방향. AppModule 부팅으로 순환 부재 확인 |
| NFR-003 | additive 호환성(005~008 회귀 0) | 이행 | order/settlement emit additive, 해석 메서드 신규. 전체 PASS |

---

## OWASP Top 10 점검 결과

| OWASP | 항목 | 점검 결과 | 근거 |
|---|---|---|---|
| A01 | 접근 제어 취약점 | 양호 | 알림 수신자(userId)는 클라이언트가 지정할 수 없고 서버가 도메인 Service 로 해석 → 타인 알림 생성 표면 없음. 알림 조회 권한은 006 `JwtAuthGuard`+소유권(변경 없음) |
| A03 | 인젝션 | 양호 | 알림 본문은 서버 구성 한국어 템플릿 + 식별자(orderId·settlementId·productId·rating). raw SQL 미사용(Prisma) |
| A04 | 안전하지 않은 설계 | 양호 | 구독자 패턴으로 결합도 낮춤. 실패 격리(safeNotify)로 부가 기능 실패가 핵심 흐름에 전파되지 않음 |
| A05 | 보안 설정 오류 | 양호 | 모듈 import 단방향(순환 의존 없음). AppModule 부팅 검증 |
| A09 | 로깅·모니터링 | 양호 | 알림 실패 시 `Logger.error(event=...)` 로 기록(과다 정보 노출 없음 — 에러 메시지·이벤트명만) |

---

## 긍정 확인 사항

| 항목 | 확인 내용 |
|---|---|
| **알림 실패 격리** | 모든 핸들러가 `safeNotify`(try/catch + Logger) 래퍼 안에서 실행. 알림 생성·수신자 해석 예외가 발행 측(주문·배송·정산·리뷰)으로 전파되지 않아 핵심 트랜잭션·흐름은 정상 완료(FR-005, SC-002·005) |
| **수신자 해석 서버 권한** | 수신자(userId)를 클라이언트가 지정하지 않고 서버가 `getOrderOwnership`·`getUserIdBySellerId`·`getSellerIdByProductId` 로 해석. 타인 알림 생성 불가. 미해석(null) 시 알림 생략(잘못된 수신자 회피, FR-003·004) |
| **순환 의존 부재** | NotificationModule 이 Order/Seller/Product 를 단방향 import 하고 역방향(도메인 → notification) import 가 없어 순환 의존이 없다. AppModule 부팅(기존 e2e 묶음)이 DI 그래프 해석 성공을 확인(NFR-002, SC-006) |
| **after-commit 발행** | order.created·settlement.created 가 `onAfterCommit`(커밋 후) 발행 → 구독자가 미커밋 데이터를 읽지 않으며, 알림 실패가 원 트랜잭션을 롤백하지 않음 |
| **페이로드 최소성** | settlement.created 는 settlementId·sellerId 식별자만 전달(금액 미포함). order.created 는 orderId·userId 만. 민감·금전 정보 이벤트 노출 없음 |

---

## 권고사항

### 일반 권고 (Informational)

- **이벤트→알림 생성→조회 e2e 보강**: order/settlement 실 emit → DB 알림 생성 → `GET /notifications`
  조회의 end-to-end 통합 테스트 후속 보강 권장. 현재 핸들러 단위 테스트로 분기를 직접 커버하며 부팅·
  순환 부재는 기존 묶음으로 확인되어 실질 위험은 낮다(coverage-gap.md).
- **알림 전달 보장(at-least-once)**: `safeNotify` 는 실패를 격리(로깅)할 뿐 재시도하지 않는다. 알림
  유실 허용 범위를 넘어서는 보장이 필요해지면 outbox·재시도 큐 도입 검토(범위 외).
