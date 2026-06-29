---
작성: Design Agent
버전: v1.0
최종 수정: 2026-06-29 20:17
상태: 확정 (retroactive — 전 태스크 구현 완료)
---

# Tasks: 010-coupon-discount-validation

> Branch: 010-coupon-discount-validation | Date: 2026-06-29 | Plan: [../planning/plan.md](../planning/plan.md)

## 목차

- [전제 조건](#전제-조건)
- [태스크 목록](#태스크-목록)
- [Test Authoring Contract](#test-authoring-contract)
- [구현 완료 기준](#구현-완료-기준)

---

## 전제 조건

- [x] spec.md 의 모든 [NEEDS CLARIFICATION] 항목 해소(미결 사항: 없음)
- [x] plan.md Constitution Gates(P-001~P-007) 통과(예외 0건)
- [x] CHANGES.md 의 이전 작업(009-notification-events) "후속 작업 시 주의사항" 확인
- [x] DB Design Agent 비활성(스키마 변경 0 — Coupon 테이블 기존 Decimal 필드 재사용, 마이그레이션 불필요)

> B = service(검증·계산), D = 테스트(5a). 레이어 B→D 의존 순.

---

## 태스크 목록

> 레이어: B 도메인(service) / D 테스트(5a).

### Step 1. 생성 시점 검증 (B — 주 방어)

- [x] **T001** — `_assertValidDiscount` 신규 + 생성 두 경로 호출
  - 레이어: B
  - 구현 파일: `apps/backend/src/modules/coupon/coupon.service.ts`
  - 관련 요구사항: FR-001
  - 상세: `private _assertValidDiscount(data)` 추가 — `discountValue.lte(0) → 400`, `type===PERCENTAGE && discountValue.gt(100) → 400`, `maxDiscountAmount != null && .lt(0) → 400`, `minOrderAmount != null && .lt(0) → 400`. `createCoupon`·`createSellerCoupon` 에서 호출(판매자는 `getApprovedSeller` 이후). `BadRequestException`(`@nestjs/common`) import 추가.
  - 완료 기준: 위반 시 `couponRepository.createCoupon` 미호출. 정상값은 통과(004 회귀 0).

### Step 2. 계산 시점 0 floor (B — 심층 방어)

- [x] **T002** — `_calcDiscount` 0 floor(FIXED·PERCENTAGE)
  - 레이어: B
  - 구현 파일: `apps/backend/src/modules/coupon/coupon.service.ts`
  - 관련 요구사항: FR-002
  - 상세: `ZERO = new Prisma.Decimal(0)`. FIXED 결과를 `Prisma.Decimal.max(ZERO, Prisma.Decimal.min(discountValue, totalAmount))` 로, PERCENTAGE 최종 결과를 `Prisma.Decimal.max(ZERO, Prisma.Decimal.min(capped, totalAmount))` 로 floor.
  - 완료 기준: 결과가 항상 `0 ≤ result ≤ totalAmount`. 음수 discountValue 쿠폰 입력 시 `'0'`.

### Step 3. 테스트 (D 레이어 — 5a Test Agent AUTHORING)

> 본 Step 은 **5a Test Agent(AUTHORING)** 가 작성(TDD Red). 아래 [Test Authoring Contract](#test-authoring-contract) 가 입력.

- [x] **T003** — 할인값 검증·floor 단위 테스트 (`coupon.service.spec.ts` 확장) — SC-001~006 (6 케이스)
  - describe `createCoupon — discountValue 검증 (SEC-001)` 5건:
    - `when_discountValue_negative_then_BadRequest_and_repo_not_called`(SC-001)
    - `when_discountValue_zero_then_BadRequest`(SC-002)
    - `when_PERCENTAGE_discountValue_over_100_then_BadRequest`(SC-003)
    - `when_negative_maxDiscountAmount_then_BadRequest`(SC-004)
    - `when_seller_discountValue_negative_then_BadRequest_after_approval`(SC-005)
  - describe `validateAndCalculateDiscount` 내 floor 방어 1건:
    - `when_coupon_has_negative_discountValue_then_floored_to_zero (SEC-001 심층방어)`(SC-006)

---

## Test Authoring Contract

> **5a Test Agent(AUTHORING) 입력 contract**. production canonical 심볼 명시(추측 단언 금지).

### Production canonical 심볼

| 심볼 | canonical 형태 |
|---|---|
| `CouponService` | `createCoupon(adminUserId, data)`·`createSellerCoupon(sellerUserId, data)`·`validateAndCalculateDiscount(userCouponId, userId, totalAmount)` |
| `CouponRepository`(mock) | `createCoupon(data)`·`findUserCouponWithCoupon(id)` 등(004 기존) |
| `SellerService`(mock) | `getApprovedSeller(sellerUserId)` |
| 예외 | `BadRequestException`(`@nestjs/common`) — 할인값 부호·범위 위반 400 |
| Decimal 단언 | `new Prisma.Decimal('...')` 입력 / `result.discountAmount.toString()` 비교 |

### mock 재현 규약

- **생성 검증(5건)**: `service.createCoupon('admin-1', { type, discountValue, [maxDiscountAmount], expiresAt })` 또는 `service.createSellerCoupon(...)` 가 `rejects.toThrow(BadRequestException)`. SC-001·005 는 `expect(mockCouponRepository.createCoupon).not.toHaveBeenCalled()` 추가. SC-005 는 `mockSellerService.getApprovedSeller.mockResolvedValue({ id, userId })` 선행.
- **floor 방어(1건)**: `mockCouponRepository.findUserCouponWithCoupon.mockResolvedValue({ ...UNUSED_USER_COUPON, coupon: { ...FIXED_COUPON, discountValue: new Prisma.Decimal('-5000') } })` → `service.validateAndCalculateDiscount('uc-1','user-1', new Prisma.Decimal('10000'))` → `result.discountAmount.toString() === '0'`.

### SC → 테스트 매핑

| SC-ID | 수용 기준 | 테스트 파일·describe | 비고 |
|---|---|---|---|
| SC-001 | 음수 discountValue 거부 + repo 미호출 | coupon.service.spec.ts::createCoupon — discountValue 검증 (SEC-001) (1) | [env:unit] |
| SC-002 | discountValue=0 거부 | 〃 (1) | [env:unit] |
| SC-003 | PERCENTAGE >100 거부 | 〃 (1) | [env:unit] |
| SC-004 | 음수 maxDiscountAmount 거부 | 〃 (1) | [env:unit] |
| SC-005 | 판매자 음수 거부(승인 후) + repo 미호출 | 〃 (1) | [env:unit] |
| SC-006 | 음수 쿠폰 할인 0 floor | coupon.service.spec.ts::validateAndCalculateDiscount (1) | [env:unit] |

---

## 구현 완료 기준

- [x] 모든 B 태스크 체크박스 완료(4단계), D 태스크 완료(5a)
- [x] `pnpm --filter backend test` 전체 PASSED — 004~009 회귀 0 + 010 신규 SC `[TypeScript/NestJS]`
- [x] `tsc --noEmit` 0 error
- [x] DTO·repository·schema·마이그레이션 변경 0(service 레벨만)
- [x] `package.json` 신규 의존 0. AWS SDK 0
- [x] git status 의도치 않은 파일 없음
