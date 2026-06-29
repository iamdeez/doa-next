---
작성: Test Agent (AUTHORING)
버전: v1.0
최종 수정: 2026-06-29 20:17
상태: 확정 (retroactive)
---

# Test Cases: 010-coupon-discount-validation

## 목차

- [SC × 시나리오 매트릭스](#sc--시나리오-매트릭스)
- [케이스 상세](#케이스-상세)
- [외부 의존성 명시](#외부-의존성-명시)
- [미커버 항목 (사전 분류)](#미커버-항목-사전-분류)

---

## SC × 시나리오 매트릭스

> 테스트 함수명은 실제 spec 파일의 `it('...')` 식별자 기준.
> 신규 단위 테스트: coupon.service.spec **6** 케이스 — 생성 검증 5(SC-001~005) + floor 방어 1(SC-006).

| SC-ID | 수용 기준 | Happy Path | Edge Case | 테스트 파일·함수 | env 태그 |
|---|---|---|---|---|---|
| SC-001 | 음수 discountValue 거부 + repo 미호출 | — | `when_discountValue_negative_then_BadRequest_and_repo_not_called` | coupon.service.spec.ts::createCoupon — discountValue 검증 (SEC-001) | [env:unit] |
| SC-002 | discountValue=0 거부(경계) | — | `when_discountValue_zero_then_BadRequest` | 〃 | [env:unit] |
| SC-003 | PERCENTAGE >100 거부 | — | `when_PERCENTAGE_discountValue_over_100_then_BadRequest` | 〃 | [env:unit] |
| SC-004 | 음수 maxDiscountAmount 거부 | — | `when_negative_maxDiscountAmount_then_BadRequest` | 〃 | [env:unit] |
| SC-005 | 판매자 음수 거부(승인 후) + repo 미호출 | — | `when_seller_discountValue_negative_then_BadRequest_after_approval` | 〃 | [env:unit] |
| SC-006 | 음수 쿠폰 할인 0 floor(심층) | — | `when_coupon_has_negative_discountValue_then_floored_to_zero (SEC-001 심층방어)` | coupon.service.spec.ts::validateAndCalculateDiscount | [env:unit] |

---

## 케이스 상세

### SC-001 (when_discountValue_negative_then_BadRequest_and_repo_not_called)

- 입력: `service.createCoupon('admin-1', { type: FIXED, discountValue: Decimal('-5000'), expiresAt })`.
- 단언: `rejects.toThrow(BadRequestException)` + `mockCouponRepository.createCoupon` **미호출**.

### SC-002 (when_discountValue_zero_then_BadRequest)

- 입력: `createCoupon('admin-1', { type: FIXED, discountValue: Decimal('0'), expiresAt })`.
- 단언: `rejects.toThrow(BadRequestException)`(경계 — `lte(0)`).

### SC-003 (when_PERCENTAGE_discountValue_over_100_then_BadRequest)

- 입력: `createCoupon('admin-1', { type: PERCENTAGE, discountValue: Decimal('150'), expiresAt })`.
- 단언: `rejects.toThrow(BadRequestException)`.

### SC-004 (when_negative_maxDiscountAmount_then_BadRequest)

- 입력: `createCoupon('admin-1', { type: PERCENTAGE, discountValue: Decimal('20'), maxDiscountAmount: Decimal('-1'), expiresAt })`.
- 단언: `rejects.toThrow(BadRequestException)`.

### SC-005 (when_seller_discountValue_negative_then_BadRequest_after_approval)

- 선행: `mockSellerService.getApprovedSeller.mockResolvedValue({ id: 'seller-id-1', userId: 'seller-user-1' })`.
- 입력: `service.createSellerCoupon('seller-user-1', { type: FIXED, discountValue: Decimal('-3000'), expiresAt })`.
- 단언: `rejects.toThrow(BadRequestException)` + `mockCouponRepository.createCoupon` **미호출**(승인 확인 후 검증에서 차단).

### SC-006 (when_coupon_has_negative_discountValue_then_floored_to_zero)

- 선행: `mockCouponRepository.findUserCouponWithCoupon.mockResolvedValue({ ...UNUSED_USER_COUPON, coupon: { ...FIXED_COUPON, discountValue: Decimal('-5000') } })`.
- 입력: `service.validateAndCalculateDiscount('uc-1', 'user-1', Decimal('10000'))`.
- 단언: `result.discountAmount.toString() === '0'`(음수 아님 — `_calcDiscount` 0 floor 심층 방어).

---

## 외부 의존성 명시

### fixture / mock

- `mockCouponRepository`: `createCoupon`·`findUserCouponWithCoupon` 등 jest.fn()(004 기존). SC-001·005 는 `createCoupon` 미호출 단언.
- `mockSellerService`: `getApprovedSeller` jest.fn(). SC-005 에서 승인 판매자 반환 mock.
- Decimal fixture: `new Prisma.Decimal('...')` — 입력값·`discountAmount.toString()` 단언.
- `UNUSED_USER_COUPON`·`FIXED_COUPON`: 004 기존 spec fixture 재사용(SC-006 의 coupon override 베이스).

### 환경 변수

- 단위 테스트: 별도 환경 변수 불필요(전부 mock, DB 연결 없음).

### 외부 서비스

- 단위: DB·네트워크 연결 없음. 전부 mock.

---

## 미커버 항목 (사전 분류)

| 항목 | 미커버 사유 | 카테고리 | 권장 검증 방법 |
|---|---|---|---|
| `minOrderAmount < 0 → 400` 전용 단위 테스트 | FR-001 (d) 구현·동작하나 전용 it() 없음. 동형 분기(maxDiscountAmount 음수 — SC-004)가 같은 `!= null && .lt(0)` 구조를 커버 | (1) 단위테스트 가능 | `when_negative_minOrderAmount_then_BadRequest` 추가 권장 |
| DTO 레벨 음수 거부 통합 e2e | HTTP 요청 → ValidationPipe → service 까지 음수 입력이 도달해 400 반환되는 end-to-end 시나리오 없음. service 단위 테스트로 검증 갈음 | (2) 설계(범위 외) | 쿠폰 생성 e2e(음수 body → 400) 후속 보강 |
