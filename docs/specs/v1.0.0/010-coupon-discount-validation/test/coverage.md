---
작성: Test Agent (EXECUTION)
버전: v1.0
최종 수정: 2026-06-29 20:17
상태: 확정 (retroactive)
---

# Coverage: 010-coupon-discount-validation

## 목차

- [실행 요약](#실행-요약)
- [SC × 시나리오 커버리지 매트릭스](#sc--시나리오-커버리지-매트릭스)
- [커버리지 요약](#커버리지-요약)
- [STALE_SC 경고](#stale_sc-경고)

---

## 실행 요약

> 본 retroactive 검증은 010 완료 커밋 `2664da3`(base `6fe1588`) 기준으로 main session 이 게이트를 직접
> 재실행·코드리뷰하여 확인한 수치다. 신규 단위 테스트 개수는 실제 spec 파일의 `it()` 를 직접 카운트했다.

| 항목 | 본 retroactive 검증 (HEAD `2664da3`) |
|---|---|
| tsc `--noEmit` | **EXIT 0** |
| Unit 테스트 (src/) | **25 suites / 245 PASS** (009 대비 +6) |
| e2e + Static 테스트 (test/) | **16 suites / 84 PASS** (변화 없음 — 신규 e2e/static 없음) |
| 010 신규 단위 테스트 | **6** (coupon.service.spec 검증 5 + floor 방어 1 — `it()` 직접 카운트) |
| 010 회귀 | **0** (004~009 전체 PASS) |
| 마이그레이션 | **없음** (스키마 무변경 — Coupon 기존 Decimal 필드 재사용) |

> **신규 단위 6 산정 근거(사실 기준)**:
> - `coupon.service.spec.ts` 가 010 에서 6 케이스 추가 — describe `createCoupon — discountValue 검증
>   (SEC-001)` 5건(negative·zero·PERCENTAGE>100·negative maxDiscount·seller negative) + describe
>   `validateAndCalculateDiscount` 내 floor 방어 1건(`when_coupon_has_negative_discountValue_then_floored_to_zero`).
> - 009 baseline 239 + 6 = 245 로 정합. suites 수 무변(기존 coupon.service.spec 확장 — 신규 suite 아님).
> - e2e+static 16/84 는 009 와 동일(010 은 신규 e2e/static 미추가 — DTO 레벨 음수 거부 e2e 없음).

### 실행 커맨드

```bash
cd apps/backend
npx tsc --noEmit -p tsconfig.json                                              # EXIT 0
npx jest --testPathPattern="src/"                                              # 25 suites / 245 PASS
npx jest --config ./test/jest-e2e.json                                         # 16 suites / 84 PASS (변화 없음)
```

---

## SC × 시나리오 커버리지 매트릭스

| SC-ID | 수용 기준 | Edge Case | 상태 |
|---|---|---|---|
| SC-001 | 음수 discountValue 거부 + repo 미호출 | when_discountValue_negative_then_BadRequest_and_repo_not_called | PASS |
| SC-002 | discountValue=0 거부 | when_discountValue_zero_then_BadRequest | PASS |
| SC-003 | PERCENTAGE >100 거부 | when_PERCENTAGE_discountValue_over_100_then_BadRequest | PASS |
| SC-004 | 음수 maxDiscountAmount 거부 | when_negative_maxDiscountAmount_then_BadRequest | PASS |
| SC-005 | 판매자 음수 거부(승인 후) + repo 미호출 | when_seller_discountValue_negative_then_BadRequest_after_approval | PASS |
| SC-006 | 음수 쿠폰 할인 0 floor | when_coupon_has_negative_discountValue_then_floored_to_zero | PASS |

---

## 커버리지 요약

| 항목 | 수 |
|---|---|
| 전체 SC | 6 (생성 검증 5 + floor 방어 1) |
| PASS (직접 커버) | 6 |
| INDIRECT (간접 커버) | 0 |
| GAP | 0 (단, `minOrderAmount<0` 전용 테스트·DTO 레벨 음수 거부 e2e 는 coverage-gap.md 참조) |

> 모든 SC(SC-001~006)가 직접 커버되었다. `_assertValidDiscount` 의 `minOrderAmount < 0 → 400` 분기는
> 동형 분기(maxDiscountAmount 음수 — SC-004)로 같은 구조가 커버되며 전용 테스트는 없다(coverage-gap.md).
> 010 은 신규 GAP 을 남기지 않으며, 004 의 SEC-001 / GAP-003 을 RESOLVED 처리한다.

---

## STALE_SC 경고

STALE_SC 검출 결과: **0건**

검출 대상: 010 git diff(`git diff 6fe1588 2664da3 -- apps/backend`) 변경 파일 내 테스트 SC 번호.
`coupon.service.spec.ts` 의 추가 테스트는 docstring·describe 에 `SEC-001` 라벨과 행위 기반
`it('when_..._then_...')` 명명을 사용한다(spec.md SC 와의 매핑은 본 coverage.md·test-cases.md 가 담당).
semantic mismatch 없음.
