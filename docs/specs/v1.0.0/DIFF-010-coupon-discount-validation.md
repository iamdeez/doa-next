---
작성: Docs Agent
버전: v1.0
최종 수정: 2026-06-29 20:17
상태: 확정 (retroactive)
---

# Diff: 010-coupon-discount-validation

## 목차

- [커밋 메시지용 한 줄 요약](#커밋-메시지용-한-줄-요약)
- [변경 요약](#변경-요약)
- [변경 파일 및 라인 수](#변경-파일-및-라인-수)
- [Diff](#diff)

## 커밋 메시지용 한 줄 요약

- **KO**: 010 쿠폰 할인값 검증 (SEC-001) — 생성 검증 + 계산 0 floor 이중 방어
- **EN**: 010 coupon discount validation — creation guard & 0-floor calculation defense (SEC-001)

## 변경 요약

- **coupon.service — 생성 검증(주 방어)**: `_assertValidDiscount(data)` 신규 추가 —
  `discountValue.lte(0) → 400 BadRequest`(FIXED·PERCENTAGE 공통), `type===PERCENTAGE && discountValue.gt(100)
  → 400`, `maxDiscountAmount.lt(0) → 400`, `minOrderAmount.lt(0) → 400`. `createCoupon`·`createSellerCoupon`
  에서 호출(판매자는 `getApprovedSeller` 승인 확인 이후). 위반 시 `couponRepository.createCoupon` 미호출
  (저장 차단). `BadRequestException`(`@nestjs/common`) import 추가.
- **coupon.service — 계산 0 floor(심층 방어)**: `_calcDiscount` 가 FIXED `Decimal.max(ZERO, Decimal.min(
  discountValue, totalAmount))`·PERCENTAGE `Decimal.max(ZERO, Decimal.min(capped, totalAmount))` 로 결과를
  floor. 잘못된(음수) discountValue 쿠폰이 DB 에 존재해도 음수 할인(과다청구)이 산출되지 않음.
- **테스트**: coupon.service.spec 에 6건 추가 — describe `createCoupon — discountValue 검증 (SEC-001)`
  5건(음수·0·PERCENTAGE>100·음수 maxDiscount·판매자 음수) + `validateAndCalculateDiscount` 내 floor 방어 1건.
- **해결**: SEC-001(쿠폰 할인값 검증 누락 과다청구, Medium) / GAP-003 완전 해결(생성 차단 + 계산 floor +
  테스트 이중 방어). DTO·repository·schema·마이그레이션 변경 0.

## 변경 파일 및 라인 수

> 범위: `apps/backend`. base `6fe1588`(009 완료) → `2664da3`(010 완료). `git diff --numstat` 직접 카운트.

| 파일 | 추가 | 삭제 |
|---|---|---|
| `apps/backend/src/modules/coupon/coupon.service.ts` | +41 | -3 |
| `apps/backend/src/modules/coupon/coupon.service.spec.ts` | +85 | -0 |

**합계 (apps/backend)**: 2 files changed, 126 insertions(+), 3 deletions(-).

> 본 010 SDD 문서 세트(`docs/specs/v1.0.0/010-coupon-discount-validation/**`) 와 `CHANGES.md` 의 010 항목,
> 그리고 004 문서의 SEC-001 / GAP-003 상태 갱신은 `2664da3` 코드 커밋 **이후** retroactive 로 별도
> 추가되었다(코드 diff 범위 외).

## Diff

> 전체 diff 는 본 문서에 박제하지 않는다 — **git 이 형상관리 SoT** 이며 전체 캡처는 중복·비효율이다.
> 변경 내용은 위 "변경 요약" · "변경 파일 및 라인 수" 절로 추적하고, 라인 단위 diff 가 필요하면 아래로 재생성한다:
>
> ```bash
> git diff 6fe1588 2664da3 -- apps/backend   # base commit: 6fe1588
> ```
