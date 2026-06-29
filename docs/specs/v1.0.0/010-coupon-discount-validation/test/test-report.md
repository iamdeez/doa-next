---
작성: Test Agent (EXECUTION)
버전: v1.0
최종 수정: 2026-06-29 20:17
상태: 확정 (retroactive)
---

# 테스트 실행 결과 — 010-coupon-discount-validation

## 목차

- [실행 요약](#실행-요약)
- [실패 목록](#실패-목록)
- [SC 매핑표 검증](#sc-매핑표-검증)
- [설계 문서 정합성](#설계-문서-정합성)
- [회귀 탐지](#회귀-탐지)

---

## 실행 요약

> 본 retroactive 검증은 010 완료 커밋 `2664da3`(base `6fe1588`)에서 main session 이 게이트를 직접
> 재실행·코드리뷰하여 확인했다. 신규 단위 테스트 개수는 실제 spec 파일의 `it()` 를 직접 카운트했다(추측 금지).

| 항목 | 결과 (HEAD `2664da3`) |
|---|---|
| 실행 일시 | 2026-06-29 20:17 |
| tsc `--noEmit` | **EXIT 0** |
| Unit 테스트 (apps/backend, rootDir: src) | **245 PASS** / 0 FAIL / 25 suites |
| e2e + Static 테스트 (apps/backend, test/) | **84 PASS** / 0 FAIL / 16 suites |
| 전체 통과 여부 | **PASS** |
| 004~009 회귀 여부 | **없음** |
| 010 신규 단위 테스트 | **6** (coupon.service.spec 검증 5 + floor 방어 1) |
| 마이그레이션 | **없음** (스키마 무변경) |

### 009 → 010 델타

| 항목 | 009 완료(`6fe1588`) | 010 완료(`2664da3`) | 델타 |
|---|---|---|---|
| Unit suites / PASS | 25 / 239 | 25 / 245 | **+6 PASS** (검증 5 + floor 1) / suites 무변 |
| e2e + static suites / PASS | 16 / 84 | 16 / 84 | 변화 없음 |

> **신규 단위 6 산정(직접 카운트)**: `coupon.service.spec.ts` 의 010 추가분 — describe
> `createCoupon — discountValue 검증 (SEC-001)` 5 + `validateAndCalculateDiscount` floor 방어 1 = 6.
> 239 + 6 = 245 정합.

### 실행 커맨드

```bash
cd /Users/krystal/workspace/doa/doa-next/apps/backend
npx tsc --noEmit -p tsconfig.json                                              # EXIT 0
npx jest --testPathPattern="src/"                                              # 25 suites / 245 PASS
npx jest --config ./test/jest-e2e.json                                         # 16 suites / 84 PASS
```

---

## 실패 목록

**실패 없음.** tsc EXIT 0, unit 245 + e2e/static 84 = 전체 PASS.

---

## SC 매핑표 검증

| SC-ID | 관련 테스트 | 통과 여부 |
|---|---|---|
| SC-001 | coupon.service.spec.ts: when_discountValue_negative_then_BadRequest_and_repo_not_called | PASS |
| SC-002 | coupon.service.spec.ts: when_discountValue_zero_then_BadRequest | PASS |
| SC-003 | coupon.service.spec.ts: when_PERCENTAGE_discountValue_over_100_then_BadRequest | PASS |
| SC-004 | coupon.service.spec.ts: when_negative_maxDiscountAmount_then_BadRequest | PASS |
| SC-005 | coupon.service.spec.ts: when_seller_discountValue_negative_then_BadRequest_after_approval | PASS |
| SC-006 | coupon.service.spec.ts: when_coupon_has_negative_discountValue_then_floored_to_zero | PASS |

---

## 설계 문서 정합성

### plan.md 현행화 점검

- 생성 검증 — `_assertValidDiscount` 가 `discountValue.lte(0)`·`PERCENTAGE && gt(100)`·`maxDiscountAmount.lt(0)`·`minOrderAmount.lt(0)` 를 `BadRequestException` 으로 거부 — plan.md ADR-001·002·FR-001 과 일치 ✓
- 생성 두 경로 호출 — `createCoupon`(L44)·`createSellerCoupon`(L81, getApprovedSeller 이후) 에서 `_assertValidDiscount(data)` 호출 — plan.md §핵심 설계 1 과 일치 ✓
- 계산 0 floor — `_calcDiscount` 가 FIXED `Decimal.max(ZERO, Decimal.min(...))`·PERCENTAGE `Decimal.max(ZERO, Decimal.min(capped, totalAmount))` — plan.md ADR-003·FR-002 와 일치 ✓
- DTO 불변 — `create-coupon.dto.ts` `@IsDecimal()` 만(변경 0) — plan.md ADR-004 와 일치 ✓

### 발견된 한계·관찰

- **minOrderAmount 음수 거부 전용 테스트 부재**: FR-001 (d) 구현·동작하나 전용 it() 없음(동형 분기
  SC-004 로 커버). coverage-gap.md 기록. 신규 GAP 아님.
- **DTO 레벨 음수 거부 e2e 부재**: service 단위 검증으로 갈음. coverage-gap.md 기록. 신규 GAP 아님.

### 004~009 회귀 확인

- coupon.service.spec.ts: 010 의 생성 검증·floor 는 정상(양수·범위 내) 쿠폰 동작을 변형하지 않아 004
  기존 쿠폰 테스트(생성·발급·이중사용·할인 계산 happy)가 전부 PASS → 회귀 0.
- 기타 모듈(order/banner/stats/admin/review/shipping/settlement/notification/file 등): 010 미변경, 전체 PASS.

---

## 회귀 탐지

010 이 추가/변경한 파일 (`git diff 6fe1588 2664da3 -- apps/backend` 기준):
- `src/modules/coupon/coupon.service.ts`: `_assertValidDiscount` 신규 + 생성 두 경로 호출 + `_calcDiscount` 0 floor (+41 -3)
- `src/modules/coupon/coupon.service.spec.ts`: 검증 5 + floor 방어 1 (+85)

009 baseline(239 unit) 대비 010 신규 6 → 245 unit (회귀 0). e2e+static 16 suites/84 PASS, 전체
PASS·회귀 0 을 확인했다. 마이그레이션 없음(스키마 무변경).
