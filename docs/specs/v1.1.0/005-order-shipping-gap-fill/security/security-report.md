---
작성: Security Agent
버전: v1.0
최종 수정: 2026-06-30 01:23
상태: 확정 (retroactive)
---

# Security Report: 005-order-shipping-gap-fill

## 목차

- [검토 범위](#검토-범위)
- [위협 모델 — 인가 경계](#위협-모델--인가-경계)
- [OWASP Top 10 점검](#owasp-top-10-점검)
- [취약점 목록](#취약점-목록)
- [정보 누출 점검](#정보-누출-점검)
- [결론](#결론)

---

## 검토 범위

> Security Agent: Y(selection-phases.md — 권한 3축·소유 검증 신규 추가·리팩토링). DIFF(`git diff 8bba04d
> 8b48eb5`) 기반으로 인가 관련 변경을 검토했다.

검토 대상(인가 직접 관련):
- `apps/backend/src/modules/shipping/shipping.service.ts` — `_assertCanViewOrder`(권한 3축 추출)·`getByOrder`
- `apps/backend/src/modules/shipping/shipping.controller.ts` — `GET /shipments?orderId=`
- `apps/backend/src/modules/order/order.service.ts` — `getSellerOrderDetail`(소유 검증)
- `apps/backend/src/modules/order/seller-order.controller.ts` — `GET /seller/orders/:orderId`
- `apps/backend/src/modules/shipping/shipping.repository.ts` — `findByOrderId`

검토 제외: DB 스키마(변경 0)·신규 의존성(0)·환경변수(0). console 은 표시 분기만(실제 인가는 백엔드).

---

## 위협 모델 — 인가 경계

본 차수는 **조회 라우트 2개** 를 추가하며, 핵심 위협은 **IDOR(타인 자원 조회)** 다. orderId 만 알면 타인의
주문 상세·송장을 조회할 수 있는가?

| 라우트 | 자원 | 인가 게이트 | IDOR 차단 |
|---|---|---|---|
| `GET /shipments?orderId=` | 타 주문의 송장 | `_assertCanViewOrder` — 구매자 본인 OR 해당 주문 판매자 | 무관 사용자 403, `findByOrderId` 미호출 |
| `GET /seller/orders/:orderId` | 타 판매자의 주문 상세 | `getApprovedSeller` + items 중 본인 `sellerId` 일치 | 비소유 403, 미존재 404 |

- 두 라우트 모두 `@UseGuards(JwtAuthGuard)`(컨트롤러 레벨, 기존) 하에서 인증된 `user.userId` 를 기준으로
  인가를 재검증한다. URL 파라미터(orderId)를 신뢰하지 않고 소유/권한을 서버에서 확인한다.

### 권한 헬퍼 추출의 보안 영향

- `getTracking` 의 인라인 권한 3축 검증을 `_assertCanViewOrder` 로 추출하여 `getByOrder` 와 공유한다. 추출
  전후 동작이 동일(구매자 본인 → 미허가 시 판매자 축 → 미허가 시 403)함을 단위 테스트가 보증한다. 인가
  로직이 **단일 지점** 에 모여 두 라우트가 동일 규칙을 강제하므로, 한쪽만 누락·약화될 위험이 감소한다(보안
  개선 방향). 헬퍼 추출은 권한을 **약화하지 않는다**.

---

## OWASP Top 10 점검

| 항목 | 관련성 | 점검 결과 |
|---|---|---|
| A01 Broken Access Control | **직접** | `getByOrder`·`getSellerOrderDetail` 모두 서버측 소유/권한 검증. IDOR 차단(단위 테스트 stranger→403·not_owner→403·missing→404 로 검증). 권한 실패 시 repository 미접근(`findByOrderId not.toHaveBeenCalled`) |
| A02 Cryptographic Failures | 무관 | 암호화·비밀 처리 변경 0 |
| A03 Injection | 낮음 | Prisma 파라미터 바인딩(`where: { orderId }`)·NestJS `@Query`/`@Param`. 원시 SQL·문자열 조립 0 |
| A04 Insecure Design | 검토 | 미존재 신호: 송장은 `null`(정상 — 발송 전), 주문은 404(자원 부재). 인가 실패는 403 으로 구분 — 자원 존재 여부와 인가 실패를 적절히 구분 |
| A05 Security Misconfiguration | 무관 | 설정·CORS·헤더 변경 0 |
| A07 Identification & Auth Failures | 낮음 | 기존 `JwtAuthGuard` 재사용(신규 인증 경로 0) |
| A08 Data Integrity Failures | 무관 | 조회 전용(상태 변경 0) |
| A09 Logging Failures | 정보성 | 인가 실패 시 표준 `ForbiddenException`/`NotFoundException`. 민감 정보 로그 누출 없음 |

---

## 취약점 목록

| 등급 | 건수 | 항목 |
|---|---|---|
| Critical | 0 | — |
| High | 0 | — |
| Medium | 0 | — |
| Low | 0 | — |

신규 취약점 **0건**. 신규 라우트는 서버측 인가(권한 3축·판매자 소유)를 일관 적용하며, 권한 헬퍼 추출은
인가를 약화하지 않고 단일 지점으로 통합한다. 신규 의존성·신규 네트워크 엔드포인트 외부 노출·원시 SQL·비밀
처리 변경이 없다.

---

## 정보 누출 점검

- **송장 미존재 null**: `getByOrder` 는 권한 검증을 **먼저** 수행(`_assertCanViewOrder`)한 뒤 `findByOrderId`
  를 호출한다. 무관 사용자는 송장 존재 여부와 무관하게 403 을 받으므로, null/송장 반환으로 타 주문 존재를
  추론할 수 없다(권한 우선 → 누출 없음).
- **판매자 주문 상세**: `getSellerOrderDetail` 은 미존재 404·비소유 403 으로 응답한다. 비소유 주문에 대해
  403(주문 존재) vs 404(주문 부재)가 갈리는 미세한 oracle 이 이론상 가능하나, 판매자 권한(`getApprovedSeller`)
  이 선행되고 orderId 는 추측 난이도가 높은 식별자이며, 노출되는 것은 "존재/소유" 비트뿐이다(상세 데이터는
  비소유 시 미반환). 실무 위험 낮음(권고 등급 미만).
- **금전 표기**: `OrderItemView.unitPrice` 등 금전은 Decimal→문자열로 표시 전용. 클라이언트 금전 연산 0
  (P-005). 누출·정밀도 훼손 없음.

---

## 결론

005 의 인가 변경(주문→송장 조회·판매자 주문 상세 라우트 + 권한 3축 헬퍼 추출)은 **Critical/High/Medium/Low
취약점 0건** 이다. 두 신규 조회 라우트는 서버측에서 소유/권한을 일관 검증(IDOR 차단)하며, 권한 검증을 자원
접근보다 **먼저** 수행하여 정보 누출을 방지한다. 권한 헬퍼 추출은 인가를 단일 지점으로 통합해 규칙 일관성을
높이는 방향이며 권한을 약화하지 않는다. 단위 테스트 +6(stranger→403·not_owner→403·missing→404·findByOrderId
미호출)이 인가 경계를 직접 검증한다. Security 게이트 PASS — Performance Agent 블로킹 사유 없음(Performance=N).
</content>
