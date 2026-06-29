---
작성: Design Agent
버전: v1.0
최종 수정: 2026-06-29 13:55
상태: 작성중
---

# Gaps — 004-review-coupon

> 기획/설계 공백 누적 기록 (pipeline-conventions.md §6 형식). 3단계 이후 모든 Agent 가 누적.

## 목차

- [GAP-001](#gap-001)
- [GAP-002](#gap-002)

---

## GAP-001

- **출처**: Design Agent
- **유형**: 문서-코드 불일치
- **컨텍스트**: order cancel 라우트 (FR-016 / SC-023)
- **내용**: spec.md SC-023·plan.md 인터페이스 표는 주문 취소를 `DELETE /orders/:id` 로 표기하나, 003-commerce 실구현은 `POST /orders/:orderId/cancel`(`order.controller.ts:60`)이다. 004 는 `cancel()` 서비스 메서드 내부만 수정(restoreForOrder 추가)하고 라우트는 003 그대로 유지한다.
- **영향**: 낮음 — SC-023 은 [env:unit] 서비스 단위 검증이므로 라우트 표기 불일치가 테스트·동작에 영향 없음. HTTP 라우트 변경(DELETE 신설)은 본 spec 범위 외(P-007).
- **상태**: ACKNOWLEDGED — 라우트 통일이 필요하면 후속 spec 으로 분리. 본 spec 은 003 실구현 라우트(`POST .../cancel`) 유지.

## GAP-002

- **출처**: Design Agent → Docs Agent 코드 검증 완료
- **유형**: 문서-갱신-필요 (context.md)
- **컨텍스트**: context.md §1·§2·§3.2·§4·§6
- **내용**: 004 구현·검증 완료에 따른 context.md 갱신 필요 항목 (PATCH-A10 기준):
  - **§1 프로젝트 개요 note**: "8개 실구현 + 10 스텁" → "10개 실구현(coupon·review 추가) + 8 스텁". "19테이블" → "22테이블".
  - **§2 핵심 도메인 모듈 note**: "10개(coupon·review·...)" 스텁 목록 → coupon·review 제거, 8개로 감소.
  - **§4 스키마 분리 구조**: commerce `1(carts)` → `4(carts·coupons·user_coupons·reviews)`. "19개 테이블 실체화" → "22개". 실재 상태 설명 갱신.
  - **§3.2 이벤트 흐름**: `review.created` 신규 행 추가 (발행: review 모듈, 구독: stats, 인-프로세스 EventEmitter).
  - **§6 알려진 제약**: "10개 도메인 모듈 빈 스텁" 행 → "8개"로 수정(coupon·review 제거).
- **코드 검증** (PROC-002):
  - coupon 실구현: `apps/backend/src/modules/coupon/coupon.service.ts` L487 `export class CouponService`
  - review 실구현: `apps/backend/src/modules/review/review.service.ts` L1528 `export class ReviewService`
  - commerce 4테이블: `apps/backend/prisma/schema.prisma` Coupon(L40)·UserCoupon(L69)·Review(L90) 모델 정의
  - review.created 이벤트: `apps/backend/src/modules/review/review.service.ts` L1575 `this.eventEmitter.emit('review.created', {...})`
  - 22테이블 계산: 기존 19 + coupons + user_coupons + reviews = 22 ✓
- **PATCH-A09 확인**: 004 변경에 새 infra-level timeout/threshold/health-check 없음. infra.md 갱신 불필요.
- **PATCH-A13 확인**: 004 신규 상수가 context.md/infra.md 기존 표기와 불일치하는 항목 없음.
- **영향**: 중간 — context.md 직접 갱신은 Retrospective Agent 처리 위임([MUST NOT] Docs Agent 직접 갱신).
- **상태**: OPEN — Retrospective Agent 처리 위임. Docs Agent 코드 검증 완료(2026-06-29).

## GAP-003

- **출처**: Security Agent
- **유형**: 보안 취약점 (Medium)
- **컨텍스트**: [SEC-001: CreateCouponDto discountValue 양수 검증 누락]
- **내용**: `CreateCouponDto`의 `discountValue`, `maxDiscountAmount`, `minOrderAmount` 필드가 `@IsDecimal()` 데코레이터만 가지고 있어 음수 값을 허용한다. `plan.md §핵심 설계 L74`는 "`discountValue`(양수, PERCENTAGE 는 1~100) 검증(DTO + service)"을 명시하나 실제 DTO 구현에 `@Min(0)` 또는 `@IsPositive()` 적용이 누락되었다. `CouponService._calcDiscount`도 음수 `discountValue`를 가드하지 않아, FIXED 쿠폰에서 `Decimal.min(-5000, totalAmount) = -5000` → `discountAmount = -5000` → `payment: totalAmount - (-5000) = totalAmount + 5000` 으로 고객 과다청구가 발생할 수 있다. 공격 주체는 APPROVED 판매자 또는 관리자로 한정되며 내부자 위협 범위다.
- **수정 방향**: `CreateCouponDto.discountValue`에 `@IsPositive()` 또는 `@Min(0.01)` 추가. PERCENTAGE 타입의 경우 `@Max(100)` 추가(단 DTO 레벨에서 타입 조건부 검증은 class-validator 제약상 service 레벨 검증으로 보완). `maxDiscountAmount`, `minOrderAmount`도 `@IsPositive()` 또는 `@Min(0)` 추가.
- **영향**: 중간 — 악의적 관리자/판매자에 의한 고객 과다청구 가능
- **상태**: **RESOLVED (010-coupon-discount-validation, 커밋 2664da3)** — `CouponService._assertValidDiscount` 가 `createCoupon`·`createSellerCoupon` 에서 `discountValue≤0`/`PERCENTAGE>100`/음수 `maxDiscountAmount`/음수 `minOrderAmount` 를 400 BadRequest 로 거부(repo 미호출, 저장 차단) + `_calcDiscount` 가 `Prisma.Decimal.max(0, …)` 0 floor(음수 할인 차단) + 단위 테스트 6건. 검증은 DTO 가 아닌 service 레벨로 보완(PERCENTAGE 조건부 ≤100 분기). 상세: `docs/specs/v1.0.0/010-coupon-discount-validation/`
</content>
