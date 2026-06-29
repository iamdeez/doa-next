---
작성: Spec Agent
버전: v1.0
최종 수정: 2026-06-29 20:17
상태: 확정 (retroactive)
---

# Spec Input: 010-coupon-discount-validation

> 수집 일시: 2026-06-29 | 맥락: 004 보안 발견(SEC-001) 후속 보강 → 정식 SDD 문서화

## 목차

- [수집 진행 상태](#수집-진행-상태)
- [원 요청 맥락](#원-요청-맥락)
- [질문 분석 근거](#질문-분석-근거-question-analysis-basis)
- [카테고리별 수집 내용](#카테고리별-수집-내용)

## 수집 진행 상태

| 카테고리 | 상태 | 답변 완료 항목 |
|---|---|---|
| 1. 배경 및 목적 | 완료 | [Q1, Q2, Q3] |
| 2. 사용자 & 이해관계자 | 완료 | [Q4] |
| 3. 핵심 기능 | 완료 | [Q-A~C] |
| 4. 데이터 & 입출력 | 완료 | [Q-D] |
| 5. 제약조건 | 완료 | [Q5] |
| 6. 예외 & 실패 시나리오 | 완료 | [Q6] |

## 원 요청 맥락

사용자 지시: **004 보안 발견 후속 보강** — 004-review-coupon 의 SEC-001(쿠폰 생성 할인값 부호·범위
검증 누락, Medium — 음수 discountValue 과다청구)을 해소하는 패치. 쿠폰 생성 시점에 음수/범위 위반
할인값을 거부하고(`_assertValidDiscount`), 할인 계산 결과를 0 으로 floor(`_calcDiscount`)하여 음수
할인을 차단했다. 본 문서는 그 패치를 정식 SDD 포맷으로 보강하기 위한 입력 재구성이다.

## 질문 분석 근거 (Question Analysis Basis)

| 질문 ID | 요지 | 옵션·근거 | 채택 결과 |
|---|---|---|---|
| Q-A | 검증 위치 | A:DTO 데코레이터(@IsPositive/@Min) / B:service 레벨(`_assertValidDiscount`) | **B 채택**(PERCENTAGE 타입 조건부 상한 ≤100 은 class-validator 데코레이터로 타입 분기 곤란 — 004 security-report 도 service 레벨 보완 명시) |
| Q-B | 검증 실패 응답 | `400 BadRequest`(생성 입력 형식 위반) vs `422 Unprocessable` | **400 BadRequest 채택**(입력값 자체의 부호·범위 위반은 형식 위반) |
| Q-C | 계산 단계 방어 추가 | `_calcDiscount` 에 0 floor 추가 여부 | **채택**(잘못된 쿠폰이 DB 에 있어도 음수 할인 차단 — 심층 방어, FR-002) |
| Q-D | DTO 변경 여부 | DTO 에 @IsPositive 추가 / DTO 불변 + service 검증 | **DTO 불변 채택**(service 단일 권위. DTO 보강은 범위 외) |

## 카테고리별 수집 내용

### [카테고리 1] 배경 및 목적

Q1. 왜 만드는가?
- 004 쿠폰 생성이 할인값 부호·범위를 검증하지 않아, 악의적 admin/판매자가 음수 discountValue 쿠폰을
  생성→발급→적용 시 `totalAmount − (음수)` 과다청구가 발생할 수 있음(SEC-001, Medium).

Q2. 현재 어떻게? (010 이전)
- `CreateCouponDto` 가 `@IsDecimal()` 만 적용(부호·범위 미보장). `createCoupon`·`createSellerCoupon`
  에 양수/범위 검증 없음. `_calcDiscount` 가 `Decimal.min(...)` 만 적용(음수 floor 없음).

Q3. 성공 판단 기준
- 음수/0/PERCENTAGE>100/음수 maxDiscount 생성 시 400 거부 + repo 미호출. 음수 쿠폰이 DB 에 있어도
  할인 계산이 0 으로 floor.

### [카테고리 2] 사용자 & 이해관계자

Q4. 사용자 역할
- 플랫폼 운영자/관리자·APPROVED 판매자: 쿠폰 생성 주체. 잘못된 할인값 차단의 직접 대상.
- 구매 고객: 과다청구 미발생의 이해당사자.

### [카테고리 3] 핵심 기능

**Must:**
- `_assertValidDiscount(data)`: discountValue≤0 → 400, PERCENTAGE>100 → 400, maxDiscountAmount<0 →
  400, minOrderAmount<0 → 400. `createCoupon`·`createSellerCoupon` 에서 호출(판매자는 승인 확인 후).
- `_calcDiscount`: FIXED·PERCENTAGE 결과 `Prisma.Decimal.max(0, min(...))` 0 floor.

**제외(Out of Scope):**
- DTO 레벨 @IsPositive/@Min 추가, SEC-002(검증 순서, Low), 할인값 절대 상한 정책.

### [카테고리 4] 데이터 & 입출력

- `_assertValidDiscount(data: { type; discountValue; maxDiscountAmount?; minOrderAmount? }): void` —
  위반 시 `BadRequestException`. 정상이면 무반환(통과).
- `_calcDiscount(coupon, totalAmount): Prisma.Decimal` — 출력은 항상 `0 ≤ result ≤ totalAmount`.
- DTO·repository·schema 변경 없음(service 레벨 변경만).

### [카테고리 5] 제약조건

Q5. 기술 스택 제약
- P-005: 할인값 비교·계산 Prisma.Decimal(부동소수점 금지).
- 호환성: createCoupon/createSellerCoupon/_calcDiscount 시그니처 불변(additive). 004 회귀 0.
- 스키마 무변경: Coupon 테이블 기존 Decimal 필드 재사용. 마이그레이션 0.

### [카테고리 6] 예외 & 실패 시나리오

Q6. 엣지 케이스
- discountValue=0 경계(`lte(0)` → 거부, SC-002). PERCENTAGE=100 통과(`gt(100)` 만 거부).
- 판매자 음수 → 승인 확인 후 거부(SC-005). repo 미호출.
- 음수 쿠폰 DB 잔존 → `_calcDiscount` 0 floor(SC-006).
- minOrderAmount<0 → 400(구현 존재, 전용 테스트 없음 — coverage-gap 기록).
