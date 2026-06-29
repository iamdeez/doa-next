---
작성: Test Agent (EXECUTION)
버전: v1.0
최종 수정: 2026-06-29 15:06
상태: 확정
---

# Coverage Gap: 004-review-coupon

## 목차

- [선행 보안 발견 후속 갱신 (SEC-001)](#선행-보안-발견-후속-갱신-sec-001)
- [미커버 SC 목록](#미커버-sc-목록)
- [SC-003 상세](#sc-003-상세)
- [SC-034 상세](#sc-034-상세)
- [레이블 불일치 기록](#레이블-불일치-기록)

---

## 선행 보안 발견 후속 갱신 (SEC-001)

> 본 004 coverage-gap.md 는 SC-003·SC-034 의 테스트 커버리지 공백을 다루며, SEC-001(쿠폰 할인값 검증
> 누락)은 security-report.md / gaps.md(GAP-003)에서 추적되었다. 추적성 유지를 위해 그 해결 상태를 여기에도 명시한다.

- **SEC-001 / GAP-003(쿠폰 discountValue 양수 검증 누락, Medium)**: **010-coupon-discount-validation
  (커밋 2664da3)에서 해결**. `CouponService._assertValidDiscount` 생성 검증(음수/0/PERCENTAGE>100/음수
  maxDiscount·minOrder → 400 BadRequest, repo 미호출) + `_calcDiscount` 의 `Prisma.Decimal.max(0, …)`
  0 floor + 단위 테스트 6건(생성 검증 5 + floor 방어 1)으로 과다청구 경로 차단. 상세 커버리지:
  `docs/specs/v1.0.0/010-coupon-discount-validation/test/coverage.md`(SC-001~006 PASS).
- **잔여(010 후속 보강 권고)**: DTO 레벨 음수 거부 통합 e2e·`minOrderAmount<0` 전용 단위 테스트는
  010 coverage-gap.md 에 후속 보강 권고로 기록(기능 결함 위험 낮음 — 핵심 분기는 단위 테스트로 직접 커버).

---

## 미커버 SC 목록

| SC-ID | 미커버 시나리오 | 카테고리 | 검증 방법 | 환경/도구 | 담당 | 비고 |
|---|---|---|---|---|---|---|
| SC-003 | AdminGuard 비적용 사용자 → POST /admin/coupons → 403 반환 (레이블된 단위테스트 미존재) | (1) 단위테스트 가능 | NestJS Testing 모듈로 AdminCouponController + AdminGuard 통합 단위테스트 작성 | Jest + @nestjs/testing | 개발 | 간접 커버 있음 (admin.guard.spec.ts SEC-001 + 정적 @UseGuards 확인). 레이블된 SC-003 테스트 추가 권장. |
| SC-034 | rating=0 또는 rating=6으로 POST /reviews 시도 → 400 반환 | (1) 단위테스트 가능 | CreateReviewDto class-validator 단위테스트 또는 ValidationPipe + controller 단위테스트 | Jest + class-validator | 개발 | CreateReviewDto에 @Min(1) @Max(5) 선언 확인됨. 400 응답 생성은 NestJS ValidationPipe 담당. |

> 카테고리 (1) 항목이 2건이므로 Development Agent 복귀를 요청할 수 있음.
> 단, SC-003 은 간접 커버(메커니즘 테스트 + 정적 확인)가 충분하며 기능 결함 위험 낮음.
> SC-034 는 DTO 선언(@Min/@Max)이 존재하여 class-validator 런타임이 처리 — 기능 결함 위험 낮음.

---

## SC-003 상세

**수용 기준**: `POST /admin/coupons`에 `AdminGuard`가 적용되어 있으며, Admin 권한이 없는 사용자가 쿠폰을 생성하면 403이 반환된다. [env:unit]

**현재 커버리지 (간접)**:
1. `admin.guard.spec.ts` SEC-001: AdminGuard.canActivate() 에서 non-admin userId → 403 ✓
2. `coupon.controller.ts` 정적 확인: `@UseGuards(JwtAuthGuard, AdminGuard)` 데코레이터 적용 ✓

**미커버 범위**: AdminCouponController에 대한 레이블된 SC-003 controller-level 단위테스트 없음. HTTP 레이어에서 실제 403 응답이 발생하는지 통합 확인 없음.

**권장 테스트 접근**:
```typescript
// coupon.controller.spec.ts (신규 또는 기존 확장)
describe('SC-003: POST /admin/coupons — AdminGuard 비적용 사용자 → 403', () => {
  it('when_non_admin_creates_coupon_then_403', async () => {
    // AdminGuard.canActivate()가 false를 반환하도록 모킹
    // 또는 실제 AdminGuard를 주입하고 ADMIN_USER_IDS 환경변수 제어
  });
});
```

---

## SC-034 상세

**수용 기준**: `rating=0` 또는 `rating=6`으로 리뷰 작성 시도 시 400이 반환된다. [env:unit]

**현재 커버리지 (없음)**:
- `review.service.spec.ts`에 rating 유효성 검증 테스트 없음.
- `CreateReviewDto` 에 `@IsInt() @Min(1) @Max(5)` 선언 확인 — class-validator 런타임이 400 처리.

**미커버 범위**: rating 경계값(0, 6)에 대한 400 응답 자동화 테스트 없음.

**권장 테스트 접근 (옵션 1 — DTO 단위테스트)**:
```typescript
// create-review.dto.spec.ts
import { validate } from 'class-validator';
import { CreateReviewDto } from './create-review.dto';

describe('SC-034: CreateReviewDto rating 유효성 검증', () => {
  it('when_rating_0_then_validation_fails', async () => {
    const dto = Object.assign(new CreateReviewDto(), { rating: 0, ... });
    const errors = await validate(dto);
    expect(errors.some(e => e.property === 'rating')).toBe(true);
  });
  it('when_rating_6_then_validation_fails', async () => { ... });
  it('when_rating_1_then_validation_passes', async () => { ... });
  it('when_rating_5_then_validation_passes', async () => { ... });
});
```

---

## 레이블 불일치 기록

다음 항목은 테스트 파일의 SC 레이블이 spec.md SC 번호와 의미적으로 불일치함. 기능 커버리지에는 영향 없으나 추적성 저하.

| 파일 | 테스트 레이블 | 실제 의미 | spec.md 올바른 SC |
|---|---|---|---|
| review.service.spec.ts | SC-031 (orderItem null → 404) | spec.md SC 없음 (implicit) | — |
| review.service.spec.ts | SC-033 (orderStatus != completed → 422) | spec.md SC-031 | SC-031 |
| review.service.spec.ts | SC-034 (P2002 → 409) | spec.md SC-033 | SC-033 |
| review.service.spec.ts | SC-035 (권한 검증 순서) | spec.md SC 없음 (PATCH-03 compliance) | — |
| review.service.spec.ts | SC-036 Happy (updateReview by author) | spec.md SC-035 | SC-035 |
| review.service.spec.ts | SC-036 Error (updateReview by other → 403) | spec.md SC-036 | SC-036 |
| review.service.spec.ts | SC-037 Happy (deleteReview by author) | spec.md SC-037 | SC-037 |
| review.service.spec.ts | SC-037 Error (deleteReview by other → 403) | spec.md SC-038 | SC-038 |
| review.service.spec.ts | SC-038 (deleteReview not found → 404) | spec.md SC 없음 (implicit) | — |
| package-no-aws.spec.ts | SC-051 (@aws-sdk/* 없음) | spec.md SC-055 | SC-055 |
| cross-schema.spec.ts | label: "CouponRepository (SC-053)" | spec.md SC-054 (cross-schema) | SC-054 |
| cross-schema.spec.ts | label: "ReviewRepository (SC-054)" | spec.md SC-054 (cross-schema) | SC-054 |

> 이 불일치는 5a AUTHORING 단계에서 review SC 번호가 spec.md 보다 1씩 오프셋 되어 작성된 결과임.
> 다음 차수 spec 작업 시 test-cases.md AUTHORING 검토 체크리스트에 반영 권장.
