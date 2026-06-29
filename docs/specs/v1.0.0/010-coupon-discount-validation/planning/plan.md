---
작성: Planning Agent
버전: v1.0
최종 수정: 2026-06-29 20:17
상태: 확정 (retroactive)
---

# Plan: 010-coupon-discount-validation

> Branch: 010-coupon-discount-validation | Date: 2026-06-29 | Spec: [../spec/spec.md](../spec/spec.md)

## 목차

- [사전 검증 (Constitution Gates)](#사전-검증-constitution-gates)
- [기술 컨텍스트](#기술-컨텍스트)
- [사전 영향도 분석 결과](#사전-영향도-분석-결과)
- [핵심 설계](#핵심-설계)
- [결정 기록 (ADRs)](#결정-기록-adrs)
- [인터페이스 계약](#인터페이스-계약)
- [데이터 모델](#데이터-모델)
- [테스트 전략](#테스트-전략)
- [기타 고려사항](#기타-고려사항)

---

## 사전 검증 (Constitution Gates)

> `constitution.md`(P-001~P-007) 존재 → 해당 조항을 Gates 로 사용한다(constitution 우선). spec.md NFR
> (NFR-001~003)은 P-005 를 하위 구체화하며 충돌(완화) 없음.

- [x] **P-001 모듈 경계 원칙**: [Pass 기준: coupon 모듈이 자기 소유 테이블 외 타 도메인 모델을 직접 참조하지 않음]
  → PASS. `_assertValidDiscount`·`_calcDiscount` 는 입력 인자(쿠폰 생성 data·coupon·totalAmount)만 다루며 타 도메인 모델·스키마를 직접 참조하지 않는다. 판매자 경로의 `getApprovedSeller` 는 004 기존 SellerService DI(변경 없음).
- [x] **P-002 AWS 의존 금지 / 외부 의존 추상화 원칙**: [Pass 기준: `@aws-sdk/*` 및 신규 npm 의존 0건]
  → PASS. 신규 npm 의존 0건(`package.json` 변경 없음). `@nestjs/common` 의 `BadRequestException`(이미 사용 중인 패키지)·`Prisma.Decimal` 만 사용.
- [x] **P-003 단일 DB 원칙**: [Pass 기준: 단일 PostgreSQL 외 외부 저장소 0건]
  → PASS. DB 스키마·마이그레이션 변경 0. Coupon 테이블 기존 Decimal 필드 재사용.
- [x] **P-004 클라우드 중립 원칙**: [Pass 기준: 클라우드 전용 API 결합 0건]
  → PASS. 순수 service 레벨 검증·계산 로직. 클라우드 전용 API 0.
- [x] **P-005 결제·정산 정합성 원칙**: [Pass 기준: 금전 수치 Decimal + 결제 무결성]
  → PASS. 할인값 검증(`lte`·`gt`·`lt`)·할인 계산(`max`·`min`) 전부 `Prisma.Decimal`. **본 spec 의 핵심 목적이 음수 할인(과다청구) 차단**이며, 004 의 P-005 부분이행(할인값 검증 공백, SEC-001)을 완전이행으로 끌어올린다 — `payment` 의 `totalAmount − discountAmount` 가 음수 discountAmount 로 증가하는 경로를 생성(주)·계산(심층) 양쪽에서 차단.
- [x] **P-006 테스트 원칙**: [Pass 기준: SC-XXX 없는 FR-XXX 0건]
  → PASS. FR-001 은 SC-001~005(단위), FR-002 는 SC-006(단위). NFR-002 는 004 회귀 0 으로 충족.
- [x] **P-007 스펙 범위 원칙**: [Pass 기준: spec.md 범위 외 변경 파일 0건]
  → PASS. 변경 범위 = coupon.service(`_assertValidDiscount` 신규 + 생성 두 경로 호출 + `_calcDiscount` 0 floor) + coupon.service.spec(검증 6건). 전부 FR-001·002 추적 가능. DTO·repository·schema 무변경. 범위 외 리팩토링 0.

> **예외 사항**: 없음. P-001~P-007 전부 통과(예외 0건).

> **Gates 판정**: P-001~P-007 전부 통과(예외 0건). Design Agent(3단계) 진입 가능.

---

## 기술 컨텍스트

> 004 의 확정 스택을 재확정. 010 고유 변경만 명시.

- **언어 / 런타임**: TypeScript 5.4 / Node.js 20.x. pnpm + Turborepo.
- **백엔드 프레임워크**: NestJS 11.x. coupon 모듈 4계층(controller·service·repository·events).
- **ORM / DB**: Prisma `^6.19.0` multiSchema + PostgreSQL 16. **DB 스키마·마이그레이션 변경 0** — Coupon 테이블 기존 `discountValue`·`maxDiscountAmount`·`minOrderAmount` `@db.Decimal(12,2)` 필드 재사용.
- **금전 타입**: `Prisma.Decimal` — 검증 비교(`lte(0)`·`gt(100)`·`lt(0)`)·계산 floor(`Prisma.Decimal.max(ZERO, …)`). `ZERO = new Prisma.Decimal(0)`.
- **예외 타입**: `BadRequestException`(`@nestjs/common`) — 할인값 부호·범위 위반 시 400 응답.
- **테스트 프레임워크**: Jest(`*.spec.ts`, src rootDir). 단위([env:unit] — SC-001~006).
- **환경변수**: 신규 0. **신규 의존성**: 0건.

---

## 사전 영향도 분석 결과

> 상세는 [../design/research.md](../design/research.md) 참조. 본 절은 영향 파일 요약.

### 영향 파일 목록

| 파일 | 변경 유형 | 영향 내용 | 레이어 |
|---|---|---|---|
| `src/modules/coupon/coupon.service.ts` | 수정 | `_assertValidDiscount` 신규 + `createCoupon`·`createSellerCoupon` 호출 추가 + `_calcDiscount` 0 floor(FIXED·PERCENTAGE) | B |
| `src/modules/coupon/coupon.service.spec.ts` | 수정(확장) | 생성 검증 5건 + floor 방어 1건(SC-001~006) | D |

> `dto/create-coupon.dto.ts` 변경 0건(DTO 불변 — service 레벨 검증으로 보완). `coupon.repository.ts`·`prisma/schema.prisma` 변경 0건. `package.json` 변경 0건.

---

## 핵심 설계

### 1. 생성 시점 검증 (FR-001 — 주 방어)

```
createCoupon(adminUserId, data):
  _assertValidDiscount(data)                       # 010 신규 — 위반 시 400 BadRequest
  couponRepository.createCoupon({ ADMIN, ... })    # 검증 통과 시에만 저장

createSellerCoupon(sellerUserId, data):
  seller = sellerService.getApprovedSeller(...)    # 004 — 승인 확인 먼저
  _assertValidDiscount(data)                       # 010 신규 — 승인 이후 검증
  couponRepository.createCoupon({ SELLER, ... })

_assertValidDiscount(data):
  if discountValue.lte(0):                          throw 400   # FIXED·PERCENTAGE 공통
  if type === PERCENTAGE && discountValue.gt(100):  throw 400   # 비율 상한
  if maxDiscountAmount != null && .lt(0):           throw 400
  if minOrderAmount   != null && .lt(0):            throw 400
```

- 검증 실패 시 `couponRepository.createCoupon` 미호출(저장 차단 — SC-001·005 의 repo 미호출 단언).
- 판매자 경로는 `getApprovedSeller` **이후** 검증(승인 안 된 판매자는 검증 도달 전 차단 — 004 기존).

### 2. 계산 시점 0 floor (FR-002 — 심층 방어)

```
_calcDiscount(coupon, totalAmount):
  ZERO = new Prisma.Decimal(0)
  if FIXED:       return Decimal.max(ZERO, Decimal.min(discountValue, totalAmount))
  # PERCENTAGE:   base = floor(total * rate / 100); capped = min(base, maxDiscount?)
                  return Decimal.max(ZERO, Decimal.min(capped, totalAmount))
```

- 010 이전: FIXED `Decimal.min(discountValue, totalAmount)` / PERCENTAGE `Decimal.min(capped, totalAmount)` — 음수 floor 없음.
- 010: 양쪽 결과를 `Decimal.max(ZERO, …)` 로 감싸 **결과가 항상 0 이상**이 되도록 한다. 잘못된(음수) `discountValue` 쿠폰이 DB 에 존재해도 음수 할인(과다청구) 불가(SC-006).

---

## 결정 기록 (ADRs)

| ADR-ID | 결정 항목 | 채택안 | 대안(검토했으나 미채택) | 근거(spec FR/NFR) | 영향 범위 |
|---|---|---|---|---|---|
| ADR-001 | 검증 위치 | service 레벨 `_assertValidDiscount`(생성 두 경로 호출) | DTO 데코레이터(@IsPositive/@Min) | NFR-003, FR-001 (PERCENTAGE 조건부 ≤100 은 class-validator 타입 분기 곤란) | coupon.service |
| ADR-002 | 검증 실패 응답 | `400 BadRequest` | `422 Unprocessable` | FR-001 (입력값 부호·범위는 형식 위반) | coupon.service |
| ADR-003 | 계산 단계 방어 | `_calcDiscount` 0 floor(`Decimal.max(ZERO, …)`) | 생성 검증만(DB 잔존 음수 쿠폰 방어 부재) | FR-002 (심층 방어) | coupon.service |
| ADR-004 | DTO 변경 | 불변(service 단일 권위) | DTO @IsPositive 추가 | P-007 (범위 최소화) | dto/create-coupon.dto |

---

## 인터페이스 계약

### 010 신규/변경 인터페이스

```ts
// CouponService — 010 신규 private (생성 입력 검증)
private _assertValidDiscount(data: {
  type: CouponType;
  discountValue: Prisma.Decimal;
  maxDiscountAmount?: Prisma.Decimal | null;
  minOrderAmount?: Prisma.Decimal | null;
}): void;   // 위반 시 BadRequestException, 정상이면 무반환

// CouponService.createCoupon / createSellerCoupon — 시그니처 불변, 내부에 _assertValidDiscount 호출 추가
createCoupon(adminUserId: string, data: {...}): Promise<Coupon>;
createSellerCoupon(sellerUserId: string, data: {...}): Promise<Coupon>;

// CouponService._calcDiscount — 시그니처 불변, 결과 0 floor 추가
private _calcDiscount(coupon, totalAmount: Prisma.Decimal): Prisma.Decimal;  // 0 ≤ result ≤ totalAmount
```

### 하위 호환성 / 방어 코드

- `createCoupon`·`createSellerCoupon`·`_calcDiscount` 외부 시그니처 불변 → 004 호출 측(컨트롤러·order 연동·테스트) 회귀 0.
- 정상(양수·범위 내) 쿠폰의 생성·할인 계산 동작 불변 — `_assertValidDiscount` 통과, `_calcDiscount` 의 `max(ZERO, …)` 가 이미 양수인 정상값을 변형하지 않음.
- `_calcDiscount` 0 floor 가 `_assertValidDiscount`(생성 차단)의 최종 안전망(DB 에 음수 쿠폰이 우회 잔존해도 음수 할인 0 차단).

---

## 데이터 모델

> 상세는 [../db-design/data-model.md](../db-design/data-model.md) 참조.

**스키마 변경 없음.** Coupon 테이블의 기존 `discountValue`·`maxDiscountAmount`·`minOrderAmount`
`@db.Decimal(12,2)` 필드(004 정의)를 재사용한다. 신규 테이블·컬럼·enum·인덱스·마이그레이션 0.
010 은 service 레벨의 검증·계산 로직만 변경하며 DB 형상에는 영향이 없다.

---

## 테스트 전략

### SC↔테스트 매핑 (요약)

| SC 식별자 | 수준 | 유형 | 시나리오 요약 | 입력 | 기대 결과 |
|---|---|---|---|---|---|
| SC-001 | 단위 | Edge | 음수 discountValue 생성 거부 + repo 미호출 | FIXED, discountValue=-5000 | BadRequestException, createCoupon 미호출 |
| SC-002 | 단위 | Edge(경계) | discountValue=0 거부 | FIXED, discountValue=0 | BadRequestException |
| SC-003 | 단위 | Edge | PERCENTAGE >100 거부 | PERCENTAGE, discountValue=150 | BadRequestException |
| SC-004 | 단위 | Edge | 음수 maxDiscountAmount 거부 | PERCENTAGE, maxDiscountAmount=-1 | BadRequestException |
| SC-005 | 단위 | Edge | 판매자 음수 거부(승인 후) + repo 미호출 | FIXED, discountValue=-3000 | BadRequestException, createCoupon 미호출 |
| SC-006 | 단위 | Edge(심층) | 음수 쿠폰 DB 잔존 시 할인 0 floor | totalAmount=10000, discountValue=-5000 | discountAmount='0' |

### smoke_tests

- 필요 여부: N. 010 은 004 의 기존 쿠폰 흐름에 service 레벨 검증·계산 방어를 추가하는 패치이며 신규 모듈·라우트·AppModule 와이어링·스키마 변경이 없다. 단위 테스트(mock)로 검증·floor 분기를 직접 단언한다. 004 의 기존 e2e 부팅은 회귀 0 으로 유지된다.

---

## 기타 고려사항

- **DTO vs service 검증 위치**: `CreateCouponDto.discountValue` 는 `@IsDecimal()` 만 적용되어 부호·범위를 보장하지 않는다. PERCENTAGE 타입에 한해 ≤100 을 강제해야 하는데, class-validator 데코레이터는 다른 필드(`type`) 값에 조건부로 분기하기 어렵다. 따라서 service 레벨 `_assertValidDiscount` 를 단일 검증 권위로 채택했다(ADR-001). DTO 레벨 음수 거부의 통합 e2e 검증은 후속 보강(coverage-gap.md).
- **이중 방어의 독립성**: 생성 검증(주)과 계산 floor(심층)는 독립적이다. 생성 검증이 정상 경로의 음수 쿠폰 저장을 차단하고, 계산 floor 는 어떤 경로로든(생성 검증 우회·기존 데이터·향후 변경) 음수 쿠폰이 DB 에 존재할 때의 최종 안전망이다. SC-006 은 floor 단독 동작을 직접 단언한다.
- **minOrderAmount 음수 거부 테스트 부재**: FR-001 (d)(`minOrderAmount < 0 → 400`)는 구현·동작하나 전용 단위 테스트가 없다. 동형 경로인 maxDiscountAmount 음수 거부(SC-004)가 같은 분기 구조를 커버한다(coverage-gap.md 기록).
