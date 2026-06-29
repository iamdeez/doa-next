---
작성: Security Agent
버전: v1.0
최종 수정: 2026-06-29 20:17
상태: 확정 (retroactive)
---

# 보안 감사 결과 — 010-coupon-discount-validation

## 목차

- [검토 범위](#검토-범위)
- [요약](#요약)
- [SEC-001 해결 검증](#sec-001-해결-검증)
- [Constitution 보안 조항 이행 현황](#constitution-보안-조항-이행-현황)
- [NFR 보안 요구사항 이행 현황](#nfr-보안-요구사항-이행-현황)
- [OWASP Top 10 점검 결과](#owasp-top-10-점검-결과)
- [긍정 확인 사항](#긍정-확인-사항)
- [권고사항](#권고사항)

---

## 검토 범위

### 검토 대상 파일 (DIFF-010-coupon-discount-validation.md 기반)

| 파일 | 검토 이유 |
|---|---|
| `coupon/coupon.service.ts` | 쿠폰 할인값 생성 검증(`_assertValidDiscount`)·할인 계산 0 floor(`_calcDiscount`)·과다청구 차단 |
| `coupon/coupon.service.spec.ts` | 할인값 검증·floor 단위 테스트(SC-001~006) |

### 제외 파일 및 사유

- `coupon/dto/create-coupon.dto.ts` — 010 변경 없음(`@IsDecimal()` 만, service 레벨 검증으로 보완). 단, SEC-001 의 원 위치이므로 본 보고서 "SEC-001 해결 검증" 에서 DTO 의 미보장 특성을 함께 다룬다.
- `coupon/coupon.repository.ts`·`prisma/schema.prisma` — 010 변경 없음(스키마·repository 무변경)

---

## 요약

| 항목 | 내용 |
|---|---|
| 검토 대상 파일 수 | 2개 |
| Critical 건수 | 0 |
| High 건수 | 0 |
| Medium 건수 | 0 |
| Low 건수 | 0 |
| 전체 취약점 건수 | 0 |
| 판정 | **COMPLETE** — Critical/High/Medium/Low 0건. 본 spec 의 목적인 SEC-001(004, Medium) 을 RESOLVED 로 검증 확정 |

---

## SEC-001 해결 검증

> 004-review-coupon 의 Medium 발견 — 쿠폰 생성 할인값 부호·범위 검증 누락(음수 discountValue 과다청구). 010 이 해결 대상.

| 검증 항목 | 004 상태 (취약) | 010 해결 (코드 근거) | 판정 |
|---|---|---|---|
| (1) 생성 시점 검증 | `createCoupon`·`createSellerCoupon` 에 양수/범위 검증 없이 바로 `couponRepository.createCoupon` 호출 | `_assertValidDiscount(data)` 를 두 경로에서 호출 — `discountValue.lte(0) → 400`, `PERCENTAGE && gt(100) → 400`, `maxDiscountAmount.lt(0) → 400`, `minOrderAmount.lt(0) → 400`. 위반 시 repo 미호출(저장 차단) | RESOLVED |
| (2) 계산 시점 방어 | `_calcDiscount` FIXED/PERCENTAGE 가 `Decimal.min(...)` 만 — 음수 0 floor 없음 | `Prisma.Decimal.max(ZERO, Decimal.min(...))` 로 양쪽 결과 0 floor. 음수 쿠폰이 DB 에 존재해도 음수 할인 불가 | RESOLVED |
| (3) 검증 테스트 | discountValue 양수 검증·floor 테스트 모두 부재 | 단위 테스트 6건 — 생성 검증 5(음수·0·PERCENTAGE>100·음수 maxDiscount·판매자 음수) + floor 방어 1(음수 discountValue → 0) | RESOLVED |
| 과다청구 경로(P-005) | 음수 discountValue → `discountAmount` 음수 → `payment` `totalAmount − (음수)` 과다청구 | 생성 차단(주) + 계산 0 floor(심층)로 `discountAmount ≥ 0` 보장 → `totalAmount − discountAmount ≤ totalAmount`(과다청구 불가) | 완전 차단 |

**판정**: SEC-001 → **RESOLVED (010, 커밋 2664da3)**. 생성 검증(`_assertValidDiscount`, 1차) +
계산 0 floor(`_calcDiscount`, 2차) + 단위 테스트 6건(검증)의 이중 방어로 완전 해결. 004
security-report.md / gaps.md GAP-003 / test/coverage-gap.md 의 SEC-001 관련 항목 상태가 RESOLVED(010)로
갱신된다.

> **DTO 의 미보장 특성 잔존**: `CreateCouponDto` 는 여전히 `@IsDecimal()` 만 적용한다(010 미변경). 그러나
> 음수/범위 위반의 차단 권위가 service `_assertValidDiscount` 로 단일화되어 있고, 계산 0 floor 가 최종
> 안전망이므로 과다청구 경로는 차단된다. DTO 레벨 음수 거부 e2e 통합 검증은 후속 보강 권고(권고사항).

---

## Constitution 보안 조항 이행 현황

| 조항 | 이행 여부 | 비고 |
|---|---|---|
| P-001 (모듈 경계 원칙) | 이행 | `_assertValidDiscount`·`_calcDiscount` 는 입력 인자만 다룸. 타 도메인 모델 직접 참조 없음 |
| P-002 (외부 의존 추상화) | 이행 | 신규 npm 의존 0. `BadRequestException`(`@nestjs/common` 기존)·Prisma.Decimal 만 |
| P-005 (결제·정산 정합성) | 이행 (완전) | 할인값 검증·계산 전부 Prisma.Decimal. 음수 할인(과다청구) 차단. 004 의 부분이행을 완전이행으로 승격 |

---

## NFR 보안 요구사항 이행 현황

| ID | 요구사항 | 이행 여부 | 비고 |
|---|---|---|---|
| NFR-001 | 할인값 검증·계산 Decimal(P-005) | 이행 | `lte`·`gt`·`lt`·`max`·`min` 전부 Prisma.Decimal. 부동소수점 0 |
| NFR-002 | additive 호환성(004 회귀 0) | 이행 | createCoupon·createSellerCoupon·_calcDiscount 시그니처 불변. 004 쿠폰 테스트 전체 PASS |
| NFR-003 | 서버 권위 검증 | 이행 | DTO `@IsDecimal()` 미보장을 service `_assertValidDiscount` 가 단일 권위로 강제(PERCENTAGE ≤100 포함) |

---

## OWASP Top 10 점검 결과

| OWASP | 항목 | 점검 결과 | 근거 |
|---|---|---|---|
| A01 | 접근 제어 취약점 | 양호 | 쿠폰 생성 인가는 004 그대로(AdminGuard·getApprovedSeller). 010 은 인가 표면 무변 |
| A03 | 인젝션 (비즈니스 로직) | **해결** | 음수 discountValue 비즈니스 로직 인젝션(과다청구)을 생성 검증 + 계산 floor 로 차단 |
| A04 | 안전하지 않은 설계 | **해결** | 004 의 할인값 검증 공백(SEC-001)을 서버 권위 검증 + 심층 방어로 해소 |
| A08 | 소프트웨어 무결성 | 양호 | 금전 계산 Decimal·할인 0 floor. 결제 금액 무결성(`totalAmount − discountAmount ≤ totalAmount`) 보장 |

---

## 긍정 확인 사항

| 항목 | 확인 내용 |
|---|---|
| **과다청구 이중 방어** | 생성 검증(`_assertValidDiscount`, 1차 — 잘못된 쿠폰 저장 차단) + 계산 0 floor(`_calcDiscount`, 2차 — DB 잔존 음수 쿠폰의 음수 할인 차단) + 단위 테스트 6건(검증). 음수 할인이 정상 경로·잔존 데이터 양쪽에서 차단됨 |
| **서버 권위 검증(P-005)** | 클라이언트 DTO(`@IsDecimal`)에 의존하지 않고 service 가 부호·범위·PERCENTAGE 조건부 상한(≤100)을 단일 권위로 강제 |
| **판매자 경로 순서** | `createSellerCoupon` 이 `getApprovedSeller` 승인 확인 이후 `_assertValidDiscount` 호출 — 미승인 판매자는 검증 도달 전 차단(권한·입력 검증 순서 정합) |
| **비파괴 변경** | DTO·repository·schema·마이그레이션 무변경. service 레벨 검증·계산만 추가(정상 쿠폰 동작 불변) |

---

## 권고사항

### 일반 권고 (Informational)

- **DTO 레벨 음수 거부 통합 e2e 보강**: 음수 `discountValue` body → ValidationPipe → service → 400
  반환의 end-to-end 통합 테스트 후속 보강 권장. 현재 차단 권위(service `_assertValidDiscount`)는 단위
  테스트(SC-001~005)로, 계산 방어는 SC-006 으로 커버되어 실질 위험은 낮다(coverage-gap.md).
- **minOrderAmount 음수 거부 전용 테스트**: FR-001 (d) 분기의 전용 단위 테스트(SC-004 와 동형) 추가 권장
  (coverage-gap.md).
- **SEC-002(검증 순서, Low) 유지**: 004 의 별도 Low 발견(`validateAndCalculateDiscount` status 후 소유권
  순서)은 010 범위 외이며 CUID 기반 실질 위험이 낮아 004 권고 상태로 유지된다.
