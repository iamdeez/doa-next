---
작성: Design Agent
버전: v1.0
최종 수정: 2026-06-29 20:17
상태: 확정 (retroactive)
---

# Research: 010-coupon-discount-validation

## 목차

- [분석 우선순위 게이트 결과](#분석-우선순위-게이트-결과)
- [선행 발견(004 SEC-001) 분석](#선행-발견004-sec-001-분석)
- [기존 코드베이스 분석](#기존-코드베이스-분석)
  - [클래스·모듈 계층 구조](#클래스모듈-계층-구조)
  - [영향 범위 분석 (호출 측 전수 목록)](#영향-범위-분석-호출-측-전수-목록)
- [영향 파일 목록](#영향-파일-목록)
- [class-validator 타입 조건부 검증 한계](#class-validator-타입-조건부-검증-한계)
- [이중 방어 선택 근거](#이중-방어-선택-근거)
- [엣지 케이스 및 한계](#엣지-케이스-및-한계)

---

## 분석 우선순위 게이트 결과

- **변경 대상 모듈(plan §핵심 설계)**: `coupon`(service `_assertValidDiscount` 신규 + 생성 두 경로 호출 + `_calcDiscount` 0 floor). DTO·repository·schema **변경 없음**.
- §A·B·C 분석은 coupon.service 로 한정.
- §D(다단계 병렬 파이프라인): 미해당.
- §E(동일 가드 결정 통합): 미해당(인가 변경 없음 — 004 의 쿠폰 라우트 가드 그대로).
- 외부 라이브러리 검증(§4): **신규 라이브러리 0건**. 기존 `Prisma.Decimal`·`@nestjs/common` `BadRequestException` 만.
- §F(production 시그니처 변경): **해당 없음** — `_assertValidDiscount` 는 신규 private, `createCoupon`·`createSellerCoupon`·`_calcDiscount` 외부 시그니처 불변(내부 로직만 변경). 기존 호출 측 영향 0.

---

## 선행 발견(004 SEC-001) 분석

> 004-review-coupon 의 Medium 발견 — 쿠폰 생성 할인값 부호·범위 검증 누락(과다청구). 010 이 해결 대상.

| 항목 | 004 상태 (취약) | 코드 근거 |
|---|---|---|
| DTO 검증 | `CreateCouponDto.discountValue`·`maxDiscountAmount`·`minOrderAmount` 가 `@IsDecimal()` 만 적용(부호·범위 미보장) | `dto/create-coupon.dto.ts` L17~28 |
| service 생성 검증 | `createCoupon`·`createSellerCoupon` 에 양수/범위 검증 없이 바로 `couponRepository.createCoupon` 호출 | `coupon.service.ts`(004) |
| 계산 floor | `_calcDiscount` FIXED `Decimal.min(discountValue, totalAmount)` / PERCENTAGE `Decimal.min(capped, totalAmount)` — 음수 0 floor 없음 | `coupon.service.ts`(004) |

**과다청구 경로(004)**: 악의적 admin/판매자가 음수 `discountValue` 쿠폰 생성 → 발급 → 사용자 적용 →
`discountAmount` 음수 저장 → `payment.pay` 의 `totalAmount.minus(order.discountAmount)` 에서 음수 차감
→ `totalAmount + |discountValue|` 청구(과다청구).

---

## 기존 코드베이스 분석

> context.md §2 핵심 모듈 목록을 기준선. 본 절은 변경 대상 한정 정밀 분석.

### 클래스·모듈 계층 구조

- **OOP 상속/추상 클래스 없음**: 변경 대상은 NestJS `@Injectable()` concrete 클래스(`CouponService`).
- **모듈 DI 토폴로지(실측)**: `CouponService` 생성자 — `CouponRepository`, `SellerService`, `PrismaService`, `EventEmitter2`(004 기존). 010 은 새 DI 의존을 추가하지 않는다.
- **import 추가**: `BadRequestException`(`@nestjs/common`) — 이미 동일 import 블록에서 `ConflictException`·`ForbiddenException`·`NotFoundException`·`UnprocessableEntityException` 를 사용 중이므로 신규 패키지 아님.

### 영향 범위 분석 (호출 측 전수 목록)

- **`CouponService._assertValidDiscount`(신규 private)**: 신규 추가이므로 외부 호출 측 0. `createCoupon`·`createSellerCoupon` 두 메서드 내부에서만 호출.
- **`CouponService.createCoupon` / `createSellerCoupon`(내부 변경)**: 외부 시그니처 불변. 기존 호출 측(`AdminCouponController`·`SellerCouponController`, 004 단위 테스트)은 시그니처 변경 없이 동작. 정상(양수) 쿠폰 생성은 검증 통과 후 기존과 동일.
- **`CouponService._calcDiscount`(내부 변경)**: private. `validateAndCalculateDiscount` 만 호출(004 기존). 0 floor 추가는 이미 양수인 정상 결과를 변형하지 않으므로 004 의 할인 계산 테스트(FIXED·PERCENTAGE happy)는 회귀 0.

---

## 영향 파일 목록

| 파일 | 변경 유형 | 영향 내용 | 레이어 |
|---|---|---|---|
| `src/modules/coupon/coupon.service.ts` | 수정 | `_assertValidDiscount` 신규(+ `BadRequestException` import) + 생성 두 경로 호출 + `_calcDiscount` 0 floor(FIXED·PERCENTAGE) | B |
| `src/modules/coupon/coupon.service.spec.ts` | 수정(확장) | 생성 검증 5건 + floor 방어 1건(SC-001~006) | D |

> `dto/create-coupon.dto.ts`·`coupon.repository.ts`·`prisma/schema.prisma`·`package.json` 변경 0건.

---

## class-validator 타입 조건부 검증 한계

- `CreateCouponDto.discountValue` 는 `type` 이 FIXED 면 양수 금액, PERCENTAGE 면 1~100 정수로 의미가
  달라진다. class-validator 의 필드 데코레이터(`@IsPositive`·`@Max`)는 **다른 필드(`type`) 값에 조건부로
  분기하기 어렵다**(`@ValidateIf` 로 가능하나 가독성·유지보수 비용이 높고, 음수 거부와 PERCENTAGE 상한을
  단일 권위로 묶기 어렵다).
- 따라서 DTO 데코레이터로 음수만 거부(`@IsPositive`)하고 PERCENTAGE 상한은 service 로 분리하면 검증
  권위가 두 곳으로 쪼개진다. **단일 권위(service `_assertValidDiscount`)** 가 부호·범위·타입 조건부 상한을
  한 곳에서 강제하므로 추적·유지보수에 유리하다. 004 security-report 의 "수정 방향" 도 service 레벨 보완을
  명시한다.

---

## 이중 방어 선택 근거

| 방어 계층 | 메서드 | 역할 | 근거 |
|---|---|---|---|
| 주 방어(생성) | `_assertValidDiscount` | 음수/0/PERCENTAGE>100/음수 maxDiscount·minOrder 를 **생성 시점에 400 거부**(저장 차단) | 잘못된 쿠폰이 애초에 DB 에 들어가지 않도록 — 정상 경로 1차 차단 |
| 심층 방어(계산) | `_calcDiscount` 0 floor | DB 에 음수 쿠폰이 존재해도 **할인 계산 결과를 0 으로 floor**(음수 할인 차단) | 생성 검증 우회·기존 데이터·향후 변경에 대한 최종 안전망 — 결제 무결성 직접 보호 |

- 두 계층은 독립적이며, SC-006 은 심층 방어(floor)를 단독으로 직접 단언한다(`_calcDiscount` 가 음수
  쿠폰 입력에 대해 `'0'` 반환).

---

## 엣지 케이스 및 한계

- **discountValue=0 경계**: `lte(0)` 이므로 0 도 거부(SC-002). 양수만 허용.
- **PERCENTAGE=100 경계**: `gt(100)` 만 거부 → 정확히 100 은 통과(100% 할인 허용). totalAmount 까지만
  할인되도록 `_calcDiscount` 가 `min(capped, totalAmount)` 로 clamp.
- **판매자 음수**: `getApprovedSeller` 승인 확인 후 `_assertValidDiscount` 도달 → 승인 안 된 판매자는
  검증 전 차단(SC-005 는 승인 mock 후 음수로 400·repo 미호출 단언).
- **minOrderAmount 음수(한계)**: FR-001 (d) 구현·동작하나 전용 단위 테스트 없음. 동형 분기(maxDiscountAmount
  음수, SC-004)가 같은 `!= null && .lt(0)` 구조를 커버(coverage-gap.md).
- **DTO 레벨 음수 거부 통합 검증(한계)**: 음수 입력이 HTTP 요청 → ValidationPipe → service 까지 도달해
  400 이 반환되는 e2e 통합 테스트는 없다(단위 service 테스트로 검증 — coverage-gap.md).

가정-실제 불일치 현재 미발견.
