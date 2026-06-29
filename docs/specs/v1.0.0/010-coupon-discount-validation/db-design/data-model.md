---
작성: Planning Agent (DB Design Agent 비활성 — stub)
버전: v1.0
최종 수정: 2026-06-29 20:17
상태: 확정 (retroactive)
---

# Data Model: 010-coupon-discount-validation

## 목차

- [요약](#요약)
- [재사용 대상 필드 (변경 없음)](#재사용-대상-필드-변경-없음)
- [마이그레이션](#마이그레이션)

---

## 요약

**스키마 변경 없음 — Coupon 테이블 기존 Decimal 필드 재사용, 마이그레이션 불필요.**

010 은 service 레벨의 할인값 검증(`_assertValidDiscount`)·할인 계산 0 floor(`_calcDiscount`)만 변경하며,
DB 형상(테이블·컬럼·enum·인덱스·제약)에는 영향이 없다. 따라서 Database Design Agent 는 비활성
(selection-phases.md: DB Design = N)이며, 본 문서는 "스키마 변경 없음" 을 명시적으로 기록하는 stub 이다.

- 신규 테이블: 0
- 신규/변경 컬럼: 0
- 신규 enum: 0
- 신규 인덱스·제약: 0
- 신규 마이그레이션: 0

---

## 재사용 대상 필드 (변경 없음)

010 의 검증·계산 로직은 004-review-coupon 에서 정의된 `commerce.coupons` 테이블의 기존 Decimal 필드를
**읽기만** 한다(스키마 변경 없음).

| 모델 | 컬럼 | 타입 | 정의 spec | 010 사용 |
|---|---|---|---|---|
| `Coupon` | `discountValue` | Decimal `@db.Decimal(12,2)` | 004 | `_assertValidDiscount` 부호·범위 검증 / `_calcDiscount` 할인 산정 |
| `Coupon` | `maxDiscountAmount` | Decimal `@db.Decimal(12,2)` (nullable) | 004 | `_assertValidDiscount` 음수 거부 / `_calcDiscount` PERCENTAGE 캡 |
| `Coupon` | `minOrderAmount` | Decimal `@db.Decimal(12,2)` (nullable) | 004 | `_assertValidDiscount` 음수 거부 |

> 금전 필드가 이미 `@db.Decimal(12,2)`(004, P-005)이므로 010 의 검증·계산은 전부 `Prisma.Decimal`
> 비교/산술로 수행된다. DB 타입 변경은 필요 없다.

---

## 마이그레이션

**없음.** 010 은 신규 마이그레이션을 생성하지 않는다. `prisma migrate status` 는 009 완료 시점과 동일
(up-to-date) 상태를 유지한다.
