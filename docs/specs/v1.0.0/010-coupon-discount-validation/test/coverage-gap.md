---
작성: Test Agent (EXECUTION)
버전: v1.0
최종 수정: 2026-06-29 20:17
상태: 확정 (retroactive)
---

# Coverage Gap: 010-coupon-discount-validation

## 목차

- [미커버 항목 목록](#미커버-항목-목록)
- [minOrderAmount 음수 거부 전용 테스트 부재 (상세)](#minorderamount-음수-거부-전용-테스트-부재-상세)
- [DTO 레벨 음수 거부 통합 e2e 부재 (상세)](#dto-레벨-음수-거부-통합-e2e-부재-상세)
- [신규 단위 테스트 수 기록](#신규-단위-테스트-수-기록)

---

## 미커버 항목 목록

> 모든 spec.md SC(SC-001~006)는 직접 커버(PASS). 아래는 SC 로 정의되지 않았거나 동형 분기로 갈음되어
> 전용 자동 단언이 없는 항목이다.

| 항목 | 미커버 시나리오 | 카테고리 | 검증 방법 | 담당 | 비고 |
|---|---|---|---|---|---|
| `minOrderAmount < 0 → 400` 전용 테스트 | 음수 minOrderAmount 생성 거부 | (1) 단위테스트 가능 | `when_negative_minOrderAmount_then_BadRequest` 추가 | 개발 | FR-001 (d) 구현·동작. 동형 분기(maxDiscountAmount 음수 — SC-004)가 같은 `!= null && .lt(0)` 구조 커버 |
| DTO 레벨 음수 거부 통합 e2e | HTTP body 음수 discountValue → ValidationPipe → service → 400 반환 end-to-end | (2) 설계(범위 외) | 쿠폰 생성 e2e(음수 body → 400) | 후속 보강 | service 단위 테스트(SC-001~005)로 검증 갈음. DTO 는 불변(@IsDecimal 만) |

---

## minOrderAmount 음수 거부 전용 테스트 부재 (상세)

**현상**: `_assertValidDiscount` 의 `minOrderAmount != null && minOrderAmount.lt(0) → 400 BadRequest`
분기(FR-001 (d))는 구현·동작하지만, 음수 `minOrderAmount` 입력에 대한 400 거부를 직접 단언하는 단위
테스트가 없다.

**근본 원인 (코드 근거)**:
- `maxDiscountAmount`(SC-004)와 `minOrderAmount`(미커버)는 `_assertValidDiscount` 내에서 **동일한
  구조**(`X != null && X.lt(0) → throw BadRequestException`)로 검증된다. SC-004 가 이 동형 분기를
  직접 단언하므로 `minOrderAmount` 분기의 결함 위험은 낮다.

**위험도**: 낮음. 두 nullable Decimal 필드의 음수 거부 로직이 구조적으로 동일하며, SC-004 가 그 형태를
직접 검증한다.

**권장 수정 방향**: `when_negative_minOrderAmount_then_BadRequest` 단위 테스트 1건 추가(SC-004 와 동형).

---

## DTO 레벨 음수 거부 통합 e2e 부재 (상세)

**현상**: 음수 `discountValue` 가 HTTP 요청 body 로 들어와 `CreateCouponDto` ValidationPipe 와
`_assertValidDiscount` service 검증을 거쳐 400 이 반환되는 end-to-end 통합 테스트가 없다.

**근본 원인 (설계 결정)**:
- `CreateCouponDto` 는 010 에서 변경되지 않았다(`@IsDecimal()` 만, ADR-004 — service 단일 권위).
  음수 거부의 권위는 service 레벨 `_assertValidDiscount` 이며, 이는 단위 테스트 SC-001~005 로 직접
  검증된다.
- e2e 통합 테스트는 라우트·가드·ValidationPipe·service 를 묶어 검증하나, 010 은 라우트·가드·DTO 를
  변경하지 않으므로 service 단위 검증으로 핵심 분기를 직접 단언했다.

**위험도**: 낮음. 과다청구 차단의 핵심(생성 거부·계산 floor)이 단위 테스트로 직접 커버된다.

**권장 수정 방향**: 쿠폰 생성 e2e 에 음수 `discountValue` body → 400 시나리오 후속 보강.

---

## 신규 단위 테스트 수 기록

010 신규 단위 테스트는 **6건**이며, 실제 spec 파일의 `it()` 를 직접 카운트하여 확정했다(자가 보고
신뢰하지 않음):

| 파일 | 010 신규 케이스 수 | 구성 |
|---|---|---|
| `coupon.service.spec.ts` | 6 | 생성 검증 5(negative·zero·PERCENTAGE>100·negative maxDiscount·seller negative) + floor 방어 1(negative discountValue → 0) |
| **합계** | **6** | 009 baseline 239 + 6 = 245 unit (정합) |

> `coupon.service.spec.ts` 는 010 에서 describe `createCoupon — discountValue 검증 (SEC-001)` 신규 5건과
> describe `validateAndCalculateDiscount` 내 floor 방어 1건을 더했다. 신규 suite 가 아니라 기존 suite
> 확장이며, e2e+static(16/84)에는 변화가 없다(010 은 신규 e2e/static 미추가). 본 카운트는 추적 정확성
> 목적이다.
