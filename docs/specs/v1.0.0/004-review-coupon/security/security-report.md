---
작성: Security Agent
버전: v1.0
최종 수정: 2026-06-29
상태: 확정
---

# 보안 감사 결과 — 004-review-coupon

## 목차

- [검토 범위](#검토-범위)
- [요약](#요약)
- [Constitution 보안 조항 이행 현황](#constitution-보안-조항-이행-현황)
- [취약점 목록](#취약점-목록)
- [NFR 보안 요구사항 이행 현황](#nfr-보안-요구사항-이행-현황)
- [OWASP Top 10 점검 결과](#owasp-top-10-점검-결과)
- [권고사항](#권고사항)

---

## 검토 범위

### 검토 대상 파일 (DIFF-004-review-coupon.md 기반)

| 파일 | 검토 이유 |
|---|---|
| `coupon/coupon.controller.ts` | 인증·인가 (AdminGuard, JwtAuthGuard) |
| `coupon/coupon.service.ts` | 할인 계산, 이중사용 방지, 발급한도, IDOR |
| `coupon/coupon.repository.ts` | 조건부 UPDATE 원자성 |
| `coupon/dto/create-coupon.dto.ts` | 입력 검증 |
| `order/dto/create-order.dto.ts` | SEC-FIND-004 재발 방지 |
| `order/order.service.ts` | 쿠폰 연동, 할인 계산 흐름 |
| `payment/payment.service.ts` | 실결제 금액 산출 |
| `review/review.controller.ts` | 인증 (JwtAuthGuard) |
| `review/review.service.ts` | 소유권, completed 검증, 중복 방지 |
| `prisma/schema.prisma` | 데이터 타입 (Decimal) |
| `test/static/auth-required-guards.spec.ts` | SC-052 정적 검증 |
| `test/static/cross-schema.spec.ts` | SC-053·SC-054 정적 검증 |
| `test/static/schema-decimal.spec.ts` | SC-050 정적 검증 |

### 제외 파일 및 사유

- `coupon/dto/issue-coupon.dto.ts`, `list-coupon.dto.ts`, `review/dto/update-review.dto.ts`, `list-review.dto.ts` — IsString·IsOptional 등 기본 검증 데코레이터만 있으며 보안 관련 필드 없음
- `order/order.repository.ts`, `review/review.repository.ts` — 크로스 스키마 격리는 정적 테스트(SC-053·054)로 이미 검증됨
- `coupon/coupon.events.ts`, `review/review.events.ts`, 모듈·spec 파일 — 보안 관련 로직 없음

---

## 요약

| 항목 | 내용 |
|---|---|
| 검토 대상 파일 수 | 13개 |
| Critical 건수 | 0 |
| High 건수 | 0 |
| Medium 건수 | 1 (SEC-001) — **RESOLVED (010, 커밋 2664da3)**, 감사 시점 사실 보존 위해 건수 표기 유지 |
| Low 건수 | 1 (SEC-002) — 권고 유지(010 범위 외) |
| 전체 취약점 건수 | 2 |
| 판정 | **COMPLETE** — Critical/High 0건, 권고사항으로 기록. SEC-001(Medium)은 후속 010-coupon-discount-validation 에서 RESOLVED(아래 "취약점 목록 §SEC-001 상태" 참조) |

---

## Constitution 보안 조항 이행 현황

| 조항 | 이행 여부 | 비고 |
|---|---|---|
| P-001 (모듈 경계 원칙) | 이행 | CouponRepository·ReviewRepository는 commerce 스키마만 쿼리. orderItem 데이터는 `OrderService.getOrderItemForReview` DI 경유. SC-053·054 정적 검증으로 확인 |
| P-002 (AWS 의존 금지) | 이행 | `@aws-sdk/*` 신규 의존 없음. SC-055 정적 검증 대상 |
| P-005 (결제·정산 정합성) | 이행 | 금전 필드 전부 `Decimal(12,2)`. 쿠폰 사용은 주문 생성 동일 트랜잭션 내 처리. `payment.pay`의 청구액 = `totalAmount - discountAmount` |

---

## 취약점 목록

### SEC-001 — Medium

| 항목 | 내용 |
|---|---|
| **SEC-ID** | SEC-001 |
| **심각도** | Medium |
| **OWASP** | A03 (Injection — 비즈니스 로직) / A04 (Insecure Design) |
| **위치** | `apps/backend/src/modules/coupon/dto/create-coupon.dto.ts` (L18, L23, L28) / `coupon.service.ts` `_calcDiscount()` |
| **설명** | `CreateCouponDto`의 `discountValue`, `maxDiscountAmount`, `minOrderAmount` 필드가 `@IsDecimal()` 데코레이터만 적용되어 있어 음수 값을 통과시킨다. `plan.md §핵심 설계`는 "discountValue(양수, PERCENTAGE는 1~100) 검증(DTO + service)"을 명시하나 실제 구현에서 DTO 레벨 양수 검증이 누락되었다. `_calcDiscount`도 음수 값에 대한 가드가 없다. FIXED 쿠폰의 경우 `Decimal.min(-5000, totalAmount) = -5000` → `discountAmount = -5000` → payment에서 `totalAmount - (-5000)` = 고객이 정상 금액보다 더 많이 청구됨. PERCENTAGE 쿠폰에 음수 `discountValue` 또는 음수 `maxDiscountAmount`를 설정해도 동일한 과다청구 경로가 존재한다. |
| **공격 경로** | 1. 악의적 Admin 또는 APPROVED 판매자가 음수 `discountValue`로 쿠폰 생성 (FR-001/FR-002 엔드포인트) → 2. 대상 사용자에게 발급 → 3. 사용자가 "할인 쿠폰"으로 인지하고 주문에 적용 → 4. `discountAmount` 음수 저장 → 5. `payment.pay`에서 `totalAmount - (음수) = totalAmount + 양수` 청구 |
| **공격자 요건** | 인증된 Admin 또는 APPROVED 판매자 (내부자 위협) |
| **수정 방향** | `CreateCouponDto.discountValue`에 `@Min(0.01)` 또는 `@IsPositive()` 추가. PERCENTAGE 타입에 대해 `@Max(100)` 추가 (service 레벨 타입 조건부 검증으로 보완). `maxDiscountAmount`·`minOrderAmount`에 `@Min(0)` 추가. `_calcDiscount` 내 `discountValue ≤ 0` 방어 분기 추가 권장 |
| **상태** | **RESOLVED (010-coupon-discount-validation, 커밋 2664da3)** — `CouponService._assertValidDiscount` 생성 검증(`createCoupon`·`createSellerCoupon` 호출: `discountValue≤0`/`PERCENTAGE>100`/음수 `maxDiscountAmount`/음수 `minOrderAmount` → 400 BadRequest, repo 미호출) + `_calcDiscount` 의 `Prisma.Decimal.max(0, …)` 0 floor 이중 방어 + 단위 테스트 6건(생성 검증 5 + floor 방어 1). 검증 권위는 DTO 가 아닌 service 레벨로 단일화(PERCENTAGE 조건부 ≤100 분기). 상세: `docs/specs/v1.0.0/010-coupon-discount-validation/security/security-report.md` |

---

### SEC-002 — Low

| 항목 | 내용 |
|---|---|
| **SEC-ID** | SEC-002 |
| **심각도** | Low |
| **OWASP** | A01 (Broken Access Control — 정보 노출) |
| **위치** | `apps/backend/src/modules/coupon/coupon.service.ts` `validateAndCalculateDiscount()` (L664~L670) |
| **설명** | `validateAndCalculateDiscount`에서 status 확인 (422) 후 소유권 확인 (403) 순서로 검증한다. 공격자가 타인의 `userCouponId`를 알고 있을 때, 해당 쿠폰이 이미 사용/만료되었으면 403 대신 422를 수신하여 쿠폰의 상태 정보를 간접적으로 유추할 수 있다. 코드 주석에 의도적 순서임이 명시되어 있다. |
| **공격자 요건** | 인증된 사용자, 타인 `userCouponId` 사전 취득 필요 |
| **실질 위험** | 낮음 — `userCouponId`는 CUID (무작위 26자리, 열거·추측 불가). 해당 ID를 이미 알고 있다는 전제 자체가 현실적으로 어렵다 |
| **수정 방향** | 소유권 확인을 status 확인보다 먼저 수행(404 → 403 → 422 순서). 또는 `userCouponId`를 소유권 필터와 함께 단일 쿼리로 조회하여 미소유시 404 반환 |
| **상태** | 권고 (정보 제공 목적, 즉각 조치 불필요) |

---

## NFR 보안 요구사항 이행 현황

| ID | 요구사항 | 이행 여부 | 비고 |
|---|---|---|---|
| NFR-001 | 금전 수치 Decimal 타입, 부동소수점 금지 | 이행 | `Coupon.discountValue·maxDiscountAmount·minOrderAmount` 전부 `@db.Decimal(12,2)`. 계산 과정 `Prisma.Decimal` 연산만 사용. SC-050 정적 검증 PASS |
| NFR-002 | user_coupon 이중사용 방지 (조건부 UPDATE) | 이행 | `markUserCouponUsed`: `updateMany({where:{id, status:'unused'}})`. count=0 → 409 ConflictException. 주문 생성 트랜잭션 내부 실행. SC-051 검증 |
| NFR-003 | 인증 필요 엔드포인트 JWT 401 보장 | 이행 | AdminCouponController·SellerCouponController·UserCouponController·ReviewController 모두 `@UseGuards(JwtAuthGuard)` 적용. SC-052 정적 검증 PASS |
| NFR-004 | 자원 소유권 서버 검증 (IDOR 차단) | 이행 | user_coupon.userId 검증(validateAndCalculateDiscount), review.userId 검증(updateReview/deleteReview), order.userId 검증(review 생성 시 getOrderItemForReview). SC-017·032·036·038 단위 테스트 |
| NFR-005 | Repository 크로스 스키마 접근 금지 | 이행 | CouponRepository → commerce 전용. ReviewRepository → commerce 전용. SC-053·054 정적 검증 PASS |
| NFR-006 | AWS SDK 신규 의존 금지 | 이행 | 변경 파일 중 `@aws-sdk/*` 신규 추가 없음. SC-055 검증 대상 |

---

## OWASP Top 10 점검 결과

| OWASP | 항목 | 점검 결과 | 근거 |
|---|---|---|---|
| A01 | 접근 제어 취약점 | 양호 (Low 경고 1건) | AdminGuard·JwtAuthGuard 적용 완전. 소유권 3축 검증(coupon·review·order). SEC-002: 상태 확인 순서가 CUID 기반이므로 실질 위험 낮음 |
| A02 | 암호화 실패 | 해당 없음 | 암호화 신규 로직 없음. JWT는 기존 공유 모듈 사용 |
| A03 | 인젝션 | Medium 1건 (SEC-001) | `$executeRaw` 파라미터화 쿼리 사용 ✓. 비즈니스 로직 인젝션: discountValue 음수 미검증 |
| A04 | 안전하지 않은 설계 | Medium 1건 (SEC-001 연관) | SEC-FIND-004 재발 방지 구현 ✓ (discountAmount DTO 제거). discountValue 양수 설계 명시 → 구현 누락 |
| A05 | 보안 설정 오류 | 양호 | cross-schema 격리 ✓. AdminGuard fail-closed. 공개 열람(ProductReviewController) 의도적 비인증 |
| A06 | 취약한 컴포넌트 | 양호 | 기존 검증된 라이브러리(`class-validator`·`Prisma`·`@nestjs/event-emitter`) 재사용. 신규 취약 패키지 없음 |
| A07 | 인증 및 세션 관리 | 양호 | JwtAuthGuard + AdminGuard 이중 가드 ✓. 판매자 권한: `getApprovedSeller` APPROVED 상태 검증 |
| A08 | 소프트웨어 무결성 | 양호 | 이벤트 payload 정의된 인터페이스 사용. 코드 무결성 정적 검증(cross-schema, Decimal) |
| A09 | 로깅·모니터링 | 양호 | `coupon.used` 이벤트(5개 필드), `review.created` 이벤트(6개 필드) 발행. 쿠폰 이중사용 ConflictException 409 로그 가능 |
| A10 | SSRF | 해당 없음 | 외부 URL 조회 로직 없음 |

---

## SEC-FIND-004 재발 방지 확인

| 검증 항목 | 결과 |
|---|---|
| `CreateOrderDto`에 `discountAmount` 필드 없음 | 확인 (`userCouponId?: string` 만 추가, discountAmount 없음) |
| `discountAmount`를 서버가 계산 | 확인 (`couponService.validateAndCalculateDiscount` 반환값 사용) |
| 클라이언트 전달 금액 무시 | 확인 (DTO에 필드 자체 없음, 클라이언트가 지정할 경로 없음) |
| 할인 계산 결과가 order.discountAmount에 저장 | 확인 (`orderRepository.createOrder({..., discountAmount})`) |
| 결제 시 `totalAmount - discountAmount` 사용 | 확인 (`payment.service.ts: amount = totalAmount.minus(order.discountAmount)`) |

---

## 권고사항

### 권고-001 (Medium, SEC-001 관련)

`CreateCouponDto` 필드 양수 검증 추가:

```typescript
// create-coupon.dto.ts 수정 권고
import { IsDecimal, IsPositive, IsOptional, Min } from 'class-validator';

@IsDecimal()
@IsPositive()  // 추가 필요
discountValue!: string;

@IsOptional()
@IsDecimal()
@Min(0)        // 추가 필요
maxDiscountAmount?: string;

@IsOptional()
@IsDecimal()
@Min(0)        // 추가 필요
minOrderAmount?: string;
```

PERCENTAGE 타입의 경우 service 레벨에서 `discountValue` 1~100 범위 검증 추가:

```typescript
// coupon.service.ts createCoupon/createSellerCoupon 에 추가 권고
if (data.type === CouponType.PERCENTAGE) {
  const dv = Number(data.discountValue);
  if (dv < 1 || dv > 100) {
    throw new UnprocessableEntityException('PERCENTAGE discountValue must be 1~100');
  }
}
```

### 권고-002 (Low, SEC-002 관련)

`validateAndCalculateDiscount`에서 소유권 확인을 status 확인보다 먼저 수행:

```typescript
// 권고 순서 변경 (현재: status → userId / 권고: userId → status)
if (userCoupon.userId !== userId) throw new ForbiddenException('Not your coupon');  // 먼저
if (userCoupon.status !== UserCouponStatus.unused) {
  throw new UnprocessableEntityException('Coupon already used or expired');
}
```

단, CUID 기반 ID로 실질 위험이 낮으므로 즉각 적용 우선순위는 낮다.

### 일반 권고 (Informational)

- **쿠폰 발급 한도 Race Condition 모니터링**: `incrementIssuedCountConditional` 성공 후 `createUserCoupon` 실패 시 `issuedCount`가 실제 발급 수보다 많아질 수 있다. 낮은 확률의 데이터 불일치이나 `totalQuantity` 한도에 가까운 쿠폰에서 실제 발급 가능 건수가 줄어드는 부작용이 있다. 보안 영향 없음.
- **SC-034 미테스트**: `rating=0/6` → 400 검증 단위 테스트가 작성되지 않음(coverage-gap.md GAP 항목). DTO `@IsInt @Min(1) @Max(5)` 구현은 존재하며 ValidationPipe에 의한 동작은 보장되나 후속 테스트 권장.
