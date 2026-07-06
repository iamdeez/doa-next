---
작성: Test Agent (EXECUTION)
버전: v1.0
최종 수정: 2026-07-06 02:51
상태: 확정
---

# 테스트 실행 결과

## 목차

- [실행 요약](#실행-요약)
- [무관 e2e 4건 재현·판정](#무관-e2e-4건-재현판정)
- [GAP-021-02 완전해소 코드 확인](#gap-021-02-완전해소-코드-확인)
- [§F 회귀 확인](#f-회귀-확인)
- [실패 목록](#실패-목록)
- [SC 미커버 항목](#sc-미커버-항목)
- [plan.md 매핑표 검증](#planmd-매핑표-검증)
- [설계 문서 정합성](#설계-문서-정합성)
- [회귀 탐지](#회귀-탐지)

---

## 실행 요약

| 스위트 | 결과 |
|---|---|
| `pnpm --filter backend typecheck` | 0 error |
| unit(`pnpm test`) | **41 suites / 409 tests 전부 PASS**(회귀 0, Development 보고 수치와 독립 재확인 일치) |
| 정적(`test/static`, jest-e2e config) | **20 suites / 135 tests 전부 PASS** |
| `payments.e2e-spec.ts` + `orders.e2e-spec.ts` | **2 suites / 7 tests 전부 PASS**(DI 팩토리 default stub 기본 부팅 회귀 0. `DATABASE_URL`/`TEST_JWT_TOKEN` 미설정으로 SC-045/046 통합 케이스는 SKIP — 기존 관례, 021 영향 아님) |
| `git status` | 021 변경 파일 + 5b 문서 편집(test-cases.md·gaps.md) 외 의도치 않은 파일 없음 |

## 무관 e2e 4건 재현·판정

team-lead 지시에 따라 5a 가 관측한 4건을 base commit(`git diff 1dd5132`) 대조 + 재현으로 판정.

| 스위트 | 관측 | git diff 1dd5132(관련 파일) | 재현(독립 실행) | 판정 |
|---|---|---|---|---|
| `test/auth.e2e-spec.ts` SC-027(로그인 P95) | FAIL(429 Too Many Requests) | `auth.controller.ts`·`throttle.constants.ts`·본 파일 = **0줄 변경** | 단독 실행(register 포함 8케이스 중 SC-027 1건만 FAIL) — 동일 재현 | **021 무관, 기존 known-limitation GAP-019-05(019 spec 문서화, Low) 재현.** production 정상(rate-limit 의도 동작), 021 미변경 |
| `test/auth-recovery.e2e-spec.ts` SC-017(forgot-password) | FAIL(429) | 관련 auth 모듈 파일 = **0줄 변경** | 단독 실행(7케이스 중 SC-017 1건만 FAIL) — 동일 재현 | **021 무관, 기존 known-limitation GAP-019-05 재현.** 019 CHANGES.md/gaps.md 에 이미 문서화(해소 경로=테스트 하네스 재설계, production 결함 아님) |
| `test/pino-redact.e2e-spec.ts` SC-014/015 | FAIL(redact 마커 미발견) | `pino-redact.e2e-spec.ts`·`app.module.ts`(redact 배열) = **0줄 변경** | **단독 실행 시 2/2 PASS**(auth 계열 3개 e2e 와 병렬 실행 시에만 FAIL) | **021 무관, 병렬 실행(jest 기본 워커) 시 로그캡처 타이밍 충돌로 추정되는 기존 테스트 하네스 이슈.** production·021 변경 무관(git diff 0). 신규 GAP 미등록(021 스코프 밖, 025 이하 기존 회귀 인프라 이슈로 추후 점검 후보) |
| `test/health.e2e-spec.ts` | PASS(4건 실행 모두 PASS) | — | 재확인 PASS | 문제 없음 |

**결론**: 4건 전부 021 변경(payment/file 모듈·DI 팩토리·`@aws-sdk` 추가)과 **무관**함을 git diff 0 + 독립 재현으로 확정. gate 판정에서 제외.

## GAP-021-02 완전해소 코드 확인

`create-payment.dto.ts`·`payment.controller.ts`·`payment.service.ts` 직접 Read 확인:

- `CreatePaymentDto.authToken?: string`(`@IsOptional()/@IsString()`) 추가 확인(L11-17).
- `PaymentController.pay` — `dto.authToken` 을 `paymentService.pay(user.userId, dto.orderId, idempotencyKey, dto.authToken)` 4번째 인자로 전달 확인(L45).
- `PaymentService.pay(userId, orderId, idempotencyKey, authToken?)` — `gateway.charge({ orderId, amount, idempotencyKey, authToken })` 로 전달 확인(L36-58).
- 하위호환: `authToken` 미전달 시 `undefined` 로 전파 → `toFormBody()` 가 undefined 필드를 제외(페이로드 미포함) → `StubPaymentGateway` 는 값 자체 미사용 → 기존 동작 완전 불변. unit 409/409·정적 135/135·`payments.e2e-spec.ts` 4건 PASS 로 회귀 0 재확인.
- **결론**: GAP-021-02 완전 해소 확인. gaps.md 상태 RESOLVED 로 갱신 완료(5b).

## §F 회귀 확인

`PaymentGatewayPort.charge`(+`authToken?`)·`refund`(+`pgTransactionId?`) optional 필드 확장의 전 호출측을 grep 전수 확인:

- `gateway.charge(...)` 호출측: `payment.service.ts` L58 **1개소만 존재**(신규 인자 정상 전달 확인).
- `gateway.refund(...)` 호출측: `payment.service.ts` L118 **1개소만 존재**(`pgTransactionId` 정상 전달 확인).
- `paymentService.refund(...)` 호출측(시그니처 무변경): `order.service.ts` L205 **1개소** — 영향 없음.
- `FileStoragePort`(`getPresignedUploadUrl`/`getPublicUrl`)는 021 에서 시그니처 확장 없음(기존 그대로) — `file.service.ts` 호출측 불변 확인.
- **결론**: Port 시그니처 확장이 유일한 호출측에 안전하게 반영됨을 확인. 회귀 0.

## 실패 목록

| 테스트명 | 실패 메시지 | 원인 분류 | 처리 방향 |
|---|---|---|---|
| `auth.e2e-spec.ts::SC-027` | `expected 200, got 429` | [C 상당 — 021 스코프 밖 pre-existing known-limitation, GAP-019-05] | 처리 불요(021 무관 확정, 기존 문서화됨) |
| `auth-recovery.e2e-spec.ts::SC-017` | `expected 200, got 429` | [동일, GAP-019-05] | 처리 불요 |
| `pino-redact.e2e-spec.ts::SC-014/015` | `expect(...).toBe(true)` 실패(병렬 실행시만) | [021 스코프 밖 — 테스트 하네스 병렬 실행 이슈, production/021 무관] | 처리 불요(021 범위 밖, 후속 점검 후보로 기록) |

> 021 SC-001~016 매핑 테스트(unit/정적/e2e) 중 실패 0건.

## SC 미커버 항목

카테고리 (1)(단위테스트 가능 미작성) 0건. 옵션A(3) 6건 + SC-013 실 지연분(3) — 아래 표 및
`coverage-gap.md` 참조.

**SC 매핑 테이블**:

| SC-ID | 관련 테스트 | 통과 여부 | 미커버 근본원인 |
|---|---|---|---|
| SC-001 | (옵션A §SC-001~003) | - | 실 sandbox 크레덴셜 필요(DEFERRED, spec 확정 설계) |
| SC-002 | (옵션A §SC-001~003) | - | 상동 |
| SC-003 | (옵션A §SC-001~003) | - | 상동 |
| SC-004 | (옵션A §SC-004) | - | 실 sandbox 크레덴셜 필요(DEFERRED) |
| SC-005 | `inicis-payment-gateway.spec.ts` | PASS | - |
| SC-006 | `test/static/inicis-idempotency.spec.ts` | PASS | - |
| SC-007 | `payment.service.spec.ts`(SC-007 (021)) | PASS | - |
| SC-008 | `test/static/provider-env-switch.spec.ts` | PASS | - |
| SC-009 | `order.service.spec.ts`(SC-009 (021)) | PASS | - |
| SC-010 | (옵션A §SC-010/011) | - | 실 R2 버킷 필요(DEFERRED) |
| SC-011 | (옵션A §SC-010/011) | - | 상동 |
| SC-012 | `file.service.spec.ts`(기존) | PASS | - |
| SC-013 | `payments.e2e-spec.ts`(SC-046, stub) + 옵션A(실 지연분) | PASS(stub) / DEFERRED(실 지연) | 실 이니시스 외부 지연 포함 측정은 ASM-004 |
| SC-014 | `test/static/payment-outbox-invariant.spec.ts` | PASS | - |
| SC-015 | `test/static/inicis-decimal.spec.ts` | PASS | - |
| SC-016 | `inicis-payment-gateway.spec.ts`(SC-016) | PASS | - |

## plan.md 매핑표 검증

plan.md "테스트 전략" 표(SC-001~016 × 수준/유형)와 test-cases.md·coverage.md 매트릭스 대조 완료 —
누락 0건. PATCH-A08 옵션A defer 정책과 실행 결과 일치.

## 설계 문서 정합성

- spec.md v1.2 FR-001~009·NFR-001~004 대비 구현 커버 재확인: 전건 충족(Development 자가점검과 5b 코드 Read 교차검증 일치).
- plan.md ADR-001~009 vs 실제 구현 대조: ADR-008(GAP-021-01 실패분기·멱등재요청) 코드 그대로 반영(`payment.service.ts` L60·L74-80). ADR-002(refund pgTransactionId 확장) 반영 확인. 코드 예시·변수명 불일치 0건.
- **불일치 발견 시 코드 수정 금지 원칙** — 본 5b 는 불일치 0건이므로 해당 없음.

## 회귀 탐지

- unit 409/409·정적 135/135 — 019/020 완료 시점 대비 회귀 0(수치 증가만 존재, 감소 없음).
- `payments.e2e-spec.ts`/`orders.e2e-spec.ts` — DI 팩토리 `useFactory` 전환 후 기본 stub 부팅 유지 재확인(회귀 0).
- 무관 e2e 4건은 위 "무관 e2e 4건 재현·판정" 절에서 021 기인 회귀가 아님을 git diff 0 + 독립 재현으로 확정.
