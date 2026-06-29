---
작성: Design Agent → Security Agent → Docs Agent 누적
버전: v1.0
최종 수정: 2026-06-29 20:17
상태: 확정 (retroactive)
---

# Gaps — 010-coupon-discount-validation

> 기획/설계 공백 누적 기록. 3단계 이후 모든 Agent 가 누적.

## 목차

- [신규 GAP](#신규-gap)
- [해결한 선행 GAP](#해결한-선행-gap)

---

## 신규 GAP

**NONE** — 010 은 신규 기획/설계 공백을 남기지 않는다.

> `minOrderAmount < 0 → 400` 전용 단위 테스트 부재와 DTO 레벨 음수 거부 e2e 부재는 모두 *테스트 보강
> 권고*(coverage-gap.md)일 뿐 기획/설계 공백(GAP)이 아니다. 전자는 동형 분기(maxDiscountAmount 음수 —
> SC-004)가 같은 구조를 직접 단언하여 커버하고, 후자는 차단 권위인 service `_assertValidDiscount` 가 단위
> 테스트(SC-001~005)로 직접 검증되며 계산 0 floor(SC-006)가 최종 안전망이다. 과다청구 차단의 핵심 로직은
> 전부 직접 커버된다.

---

## 해결한 선행 GAP

| 식별자 | 선행 spec | 등급 | 010 해결 | 상태 |
|---|---|---|---|---|
| GAP-003 | 004-review-coupon | Medium | 생성 검증(`_assertValidDiscount`) + 계산 0 floor(`_calcDiscount`) + 단위 테스트 6건(검증 5 + floor 1) | **RESOLVED (010, 커밋 2664da3)** |
| SEC-001 | 004-review-coupon | Medium | GAP-003 과 동일 사안. security/security-report.md "SEC-001 해결 검증" 참조 | **RESOLVED (010)** |

> 004-review-coupon/gaps.md 의 GAP-003, 004-review-coupon/security/security-report.md 의 SEC-001,
> 004-review-coupon/test/coverage-gap.md 의 SEC-001 관련 항목 상태가 본 spec 으로 RESOLVED 갱신된다.
