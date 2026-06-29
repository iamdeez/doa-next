---
작성: Spec Agent
버전: v1.0
최종 수정: 2026-06-29 20:17
상태: 확정 (구현 완료 — retroactive 문서화)
---

# Spec: 010-coupon-discount-validation

> Branch: 010-coupon-discount-validation | Date: 2026-06-29 | Version: v1.0.0
>
> 본 문서는 이미 구현·검증이 완료된 코드(커밋 `2664da3`, base `6fe1588`)를 근거로 정식 SDD
> 포맷으로 retroactive 작성되었다. 모든 요구사항·수용 기준은 실제 구현된 `coupon` 모듈의
> 쿠폰 할인값 검증 코드(`CouponService._assertValidDiscount` 신규 + `_calcDiscount` 의 0 floor)와
> 단위 테스트 6건(`coupon.service.spec.ts`)에서 확인한 사실을 기준으로 한다.

## 목차

- [배경 및 목적](#배경-및-목적)
- [선행 spec 영향 추적](#선행-spec-영향-추적)
- [사용자 스토리](#사용자-스토리)
- [기능 요구사항](#기능-요구사항)
- [비기능 요구사항](#비기능-요구사항)
- [수용 기준](#수용-기준)
- [요구사항 구조화 매트릭스](#요구사항-구조화-매트릭스)
- [해결된 선행 보안 발견](#해결된-선행-보안-발견)
- [범위 외](#범위-외)
- [미결 사항](#미결-사항)

---

## 배경 및 목적

004-review-coupon 의 보안 감사에서 쿠폰 생성 시 할인값(`discountValue`)에 대한 부호·범위 검증이
**누락**되었다는 Medium 등급 취약점(SEC-001)이 식별되었다. 구체적으로:

1. `CreateCouponDto.discountValue`·`maxDiscountAmount`·`minOrderAmount` 가 `@IsDecimal()` 데코레이터만
   적용되어 있어 **음수 값을 통과**시켰다(DTO 레벨에서 부호·범위 미보장).
2. `CouponService` 의 쿠폰 생성 경로(`createCoupon`·`createSellerCoupon`)에 할인값의 양수/범위를
   강제하는 **서버 권위 검증이 없었다**.
3. 할인 계산(`_calcDiscount`)도 음수 `discountValue` 에 대한 0 floor 가드가 없어, FIXED 쿠폰의 경우
   `Decimal.min(-5000, totalAmount) = -5000` → `discountAmount = -5000` 이 산정되었다.

따라서 악의적 관리자 또는 APPROVED 판매자가 음수 `discountValue` 로 쿠폰을 생성·발급하면, 사용자가
주문에 적용 시 `payment` 단계에서 `totalAmount − (음수) = totalAmount + 양수` 로 **고객 과다청구**가
발생할 수 있는 금전 정합성(P-005) 공백이었다. admin/판매자 한정(내부자 위협)이나 결제 금액 무결성에
직접 영향을 주는 경로였다.

010 은 이 공백을 **생성 시점 검증(주 방어) + 계산 시점 0 floor(심층 방어) + 단위 테스트 6건**의
이중 방어로 해소한다. `_assertValidDiscount` 가 쿠폰 생성 두 경로에서 음수/범위 위반 할인값을 400 으로
거부하고, `_calcDiscount` 가 FIXED·PERCENTAGE 결과를 `Prisma.Decimal.max(0, …)` 로 floor 하여 잘못된
쿠폰이 DB 에 존재하더라도 음수 할인(과다청구)이 산출되지 않도록 한다.

---

## 선행 spec 영향 추적

| 선행 spec | 식별된 연동 항목 | 인지 시점 | 식별 경로 |
|---|---|---|---|
| v1.0.0/004-review-coupon | 쿠폰 생성 할인값 부호·범위 검증 누락(SEC-001, Medium — 음수 discountValue 과다청구). 010 이 생성 검증(`_assertValidDiscount`) + 계산 0 floor(`_calcDiscount`) + 단위 테스트 6건으로 해결. | 2026-06-29 | coupon.service.ts·dto/create-coupon.dto.ts |
| v1.0.0/004-review-coupon (DTO) | `CreateCouponDto` 가 `@IsDecimal()` 만 적용 — 부호·범위 미보장. 010 은 DTO 를 변경하지 않고 service 레벨 검증으로 보완(PERCENTAGE 타입 조건부 상한은 class-validator 데코레이터로 분기 곤란). | 2026-06-29 | dto/create-coupon.dto.ts |

---

## 사용자 스토리

- **US-001**: 플랫폼 운영자로서, 쿠폰 생성 시 음수이거나 범위를 벗어난 할인값이 거부되어, 잘못된
  쿠폰이 시스템에 저장되지 않기를 원한다.
- **US-002**: 결제 무결성 관점에서, 설령 잘못된(음수) 할인값 쿠폰이 어떤 경로로든 DB 에 존재하더라도
  주문 적용 시 음수 할인(과다청구)이 산출되지 않기를 원한다.

---

## 기능 요구사항

- **FR-001**: `CouponService._assertValidDiscount(data)` 가 쿠폰 생성 두 경로(`createCoupon`·
  `createSellerCoupon`)에서 호출되어 다음을 강제한다 — (a) `discountValue ≤ 0` → `400 BadRequest`
  (FIXED·PERCENTAGE 공통), (b) `type === PERCENTAGE && discountValue > 100` → `400 BadRequest`
  (비율 상한), (c) `maxDiscountAmount < 0` → `400 BadRequest`, (d) `minOrderAmount < 0` →
  `400 BadRequest`. 검증 실패 시 `couponRepository.createCoupon` 은 호출되지 않는다(저장 차단).
  판매자 경로(`createSellerCoupon`)는 `getApprovedSeller` 승인 확인 **이후** 검증을 수행한다.

- **FR-002**: `CouponService._calcDiscount(coupon, totalAmount)` 가 FIXED·PERCENTAGE 양쪽 결과를
  `Prisma.Decimal.max(0, Prisma.Decimal.min(…, totalAmount))` 로 floor 하여 결과가 **항상 0 이상
  totalAmount 이하**가 되도록 한다. 잘못된(음수) `discountValue` 쿠폰이 DB 에 존재하더라도 음수 할인
  (과다청구)이 산출되지 않는 심층 방어다.

---

## 비기능 요구사항

- **NFR-001** (P-005 결제·정산 정합성): 할인값 검증·할인 계산은 전부 `Prisma.Decimal` 비교/산술
  (`lte`·`gt`·`lt`·`max`·`min`)로 수행한다. 부동소수점을 사용하지 않으며, 음수 할인이 결제 금액
  (`totalAmount − discountAmount`)을 증가시키는 과다청구 경로를 차단한다.

- **NFR-002** (호환성 / additive): 010 변경은 004 쿠폰 흐름에 대해 additive 다 — `createCoupon`·
  `createSellerCoupon`·`_calcDiscount` 의 외부 시그니처가 불변이며, 정상(양수·범위 내) 쿠폰의 생성·
  발급·할인 계산 동작은 변화 없다. 004 의 기존 쿠폰 단위 테스트(생성·발급·이중사용·할인 계산)는
  회귀 0 으로 유지된다.

- **NFR-003** (서버 권위 검증): 할인값의 부호·범위 보장은 클라이언트 DTO 가 아닌 service 레벨에서
  최종 강제한다 — `CreateCouponDto` 의 `@IsDecimal()` 만으로는 부호·범위가 보장되지 않으므로,
  서버가 권위 있게 검증한다(특히 PERCENTAGE 타입 조건부 상한 ≤100).

---

## 수용 기준

> **환경 태그 규약**:
> | 태그 | 의미 |
> |---|---|
> | `[env:unit]` | 단위 테스트(mock)로 판정 가능 |

- **SC-001** (`FR-001` 관련): 관리자가 음수 `discountValue` 로 FIXED 쿠폰을 생성하면 `400 BadRequest`
  가 발생하고 `couponRepository.createCoupon` 은 호출되지 않는다 — `discountValue=-5000` →
  BadRequestException, repo 미호출. [env:unit]

- **SC-002** (`FR-001` 관련): `discountValue=0` 으로 생성하면 `400 BadRequest` 가 발생한다(경계값 —
  `lte(0)`). [env:unit]

- **SC-003** (`FR-001` 관련): PERCENTAGE 쿠폰의 `discountValue` 가 100 을 초과하면 `400 BadRequest`
  가 발생한다 — `discountValue=150` → BadRequestException. [env:unit]

- **SC-004** (`FR-001` 관련): 음수 `maxDiscountAmount` 로 생성하면 `400 BadRequest` 가 발생한다 —
  `maxDiscountAmount=-1` → BadRequestException. [env:unit]

- **SC-005** (`FR-001` 관련): 승인된 판매자가 음수 `discountValue` 로 쿠폰을 생성하면, `getApprovedSeller`
  승인 확인 이후 `400 BadRequest` 가 발생하고 `couponRepository.createCoupon` 은 호출되지 않는다 —
  `discountValue=-3000` → BadRequestException, repo 미호출. [env:unit]

- **SC-006** (`FR-002` 관련): 음수 `discountValue` 쿠폰이 DB 에 존재할 때 할인 계산이 0 으로 floor
  된다(심층 방어) — `totalAmount=10000`·`discountValue=-5000` → `discountAmount='0'`(음수 아님).
  [env:unit]

---

## 요구사항 구조화 매트릭스

> 매핑 누락(SC 없는 FR/NFR, FR/NFR 없는 SC) 0건이 완료 조건.
> MoSCoW: Must / Should / Could / Won't

| US-ID | FR-ID | NFR-ID | SC-ID | [env:*] | MoSCoW |
|---|---|---|---|---|---|
| US-001 | FR-001 | NFR-001, NFR-003 | SC-001, SC-002, SC-003, SC-004, SC-005 | unit | Must |
| US-002 | FR-002 | NFR-001 | SC-006 | unit | Must |
| — | — | NFR-002 | (004 회귀 0) | unit | Must |

> NFR-002(additive 호환성)는 004 기존 쿠폰 단위 테스트의 회귀 0(전체 PASS)으로 충족하며 별도 신규 SC
> 없음(부재가 곧 상태). `_assertValidDiscount` 의 `minOrderAmount < 0 → 400` 분기(FR-001 (d))는 구현·
> 동작하나 전용 단위 테스트가 없다(SC-004 의 maxDiscountAmount 음수 거부로 동형 경로가 커버 — coverage-gap.md 기록).

---

## 해결된 선행 보안 발견

| 식별자 | 선행 spec | 등급 | 010 해결 내용 | 상태 |
|---|---|---|---|---|
| SEC-001 | 004-review-coupon | Medium | (1) 생성 검증 `_assertValidDiscount`(createCoupon·createSellerCoupon 호출, FR-001), (2) 계산 0 floor `_calcDiscount`(FR-002), (3) 단위 테스트 6건(생성 검증 5 + floor 방어 1) — 생성 차단 + 계산 방어 + 테스트의 이중 방어 | **RESOLVED (010, 커밋 2664da3)** |
| GAP-003 | 004-review-coupon | Medium | SEC-001 과 동일 사안(discountValue 양수 검증 누락) | **RESOLVED (010)** |

---

## 범위 외

- **DTO 레벨 부호 검증 추가**: `CreateCouponDto` 에 `@IsPositive()`·`@Min(0)` 를 추가하는 변경은 본
  spec 범위 외다. PERCENTAGE 타입 조건부 상한(≤100)은 class-validator 데코레이터로 타입 분기가
  곤란하여 service 레벨 검증을 단일 권위로 채택했다(004 security-report 의 "수정 방향" 도 service 레벨
  보완을 명시). DTO 레벨 음수 거부의 통합 e2e 검증은 후속 보강.
- **SEC-002(상태/소유권 검증 순서, Low)**: 004 의 별도 Low 발견(`validateAndCalculateDiscount` 의
  status 후 소유권 순서)은 본 spec 에서 다루지 않는다(CUID 기반 실질 위험 낮음 — 004 권고로 유지).
- **할인값 상한(절대값) 정책**: FIXED 쿠폰의 `discountValue` 절대 상한(예: 주문가 대비 비율 제한)
  정책은 본 spec 범위 외다. 010 은 음수/0/비율 초과만 차단하며, 양의 FIXED 값은 `_calcDiscount` 가
  `min(discountValue, totalAmount)` 로 totalAmount 에 clamp 한다.

---

## 미결 사항

없음 — 본 spec 은 구현 완료 코드를 기준으로 retroactive 작성되었으며, 모든 요구사항·수용 기준이 실제
구현과 대조 확인되었다. 010 은 신규 GAP 을 남기지 않는다(gaps.md: NONE). 004 의 SEC-001 / GAP-003 은
본 spec 에서 RESOLVED 처리된다.
