---
작성: Test Agent (EXECUTION)
버전: v1.0
최종 수정: 2026-07-06 02:51
상태: 확정
---

# Coverage: 021-payment-file-integration

## 목차

- [SC × 시나리오 매트릭스](#sc--시나리오-매트릭스)
- [STALE_SC 경고](#stale_sc-경고)

---

## SC × 시나리오 매트릭스

> "수용 기준" 열은 spec.md v1.2 원문 복사(PATCH-001 가드 준수). "검증 파일" 열은 Glob/Read 로
> 실재 확인한 경로만 기재.

| SC-ID | 수용 기준 | Happy Path | Edge Case | Error Case | plan.md 시나리오 전체 | 상태 |
|---|---|---|---|---|---|---|
| SC-001 | 이니시스 sandbox(공용 테스트 상점ID)로 신용카드 결제 요청 시 동기 승인 응답을 수신하고 결제 상태가 `completed` 로 전이된다. | 옵션A(§SC-001~003 방식A/B) | — | — | 충족(계약 명세 확정, 실행은 사용자 위임) | DEFERRED(옵션A) |
| SC-002 | 이니시스 sandbox 로 실시간 계좌이체 결제 요청 시 동기 승인 응답을 수신한다. | 옵션A | — | — | 충족 | DEFERRED(옵션A) |
| SC-003 | 이니시스 sandbox 로 간편결제(카카오페이 등 이니시스 지원 범위) 요청 시 동기 승인 응답을 수신한다. | 옵션A | — | — | 충족 | DEFERRED(옵션A) |
| SC-004 | 이니시스 sandbox 크레덴셜로 전액 환불 요청 시 정상 승인 응답을 수신하고 환불 상태가 `refunded` 로 전이된다. | 옵션A | — | — | 충족 | DEFERRED(옵션A) |
| SC-005 | 이니시스 sandbox 크레덴셜로 부분 환불 요청 시 요청 금액만큼만 환불 처리된다. | — | `src/modules/payment/inicis-payment-gateway.spec.ts` (`test_when_partial_amount_and_pgTransactionId_then_request_body_reflects_partial_amount_only`) | — | 충족(게이트웨이 레벨) | PASS |
| SC-006 | charge·refund 요청 페이로드에 멱등성 키가 포함됨을 정적으로 확인한다. | `test/static/inicis-idempotency.spec.ts` | — | — | 충족 | PASS |
| SC-007 | KG이니시스 API 호출이 타임아웃/5xx 등으로 실패하면 결제 상태가 `failed` 로 기록되고, 동일 멱등키로 재요청 시 중복 결제 없이 안전하게 처리(재시도)된다. | — | — | `src/modules/payment/payment.service.spec.ts` (`SC-007 (021)` describe, `test_when_pg_fails_then_status_failed_and_retry_with_same_key_no_duplicate_charge`) | 충족 | PASS |
| SC-008 | 환경변수(설정) 전환만으로 sandbox↔운영 자격증명이 교체됨을 코드 변경 없이 확인한다. | `test/static/provider-env-switch.spec.ts` | — | — | 충족 | PASS |
| SC-009 | 환불 요청이 관리자 승인 없이 자동 처리 경로로 완료된다(자동 기본값 검증). | `src/modules/order/order.service.spec.ts` (`SC-009 (021)` describe, `test_when_cancel_paid_then_refund_completes_within_single_call_without_manual_approval`) | — | — | 충족 | PASS |
| SC-010 | presigned upload URL 로 실제 R2 버킷에 파일을 PUT 업로드하면 성공(2xx) 응답을 수신한다. | 옵션A | — | — | 충족(계약 명세) | DEFERRED(옵션A) |
| SC-011 | 업로드된 객체의 public URL(r2.dev)로 GET 요청 시 파일 내용에 정상 접근된다. | 옵션A | — | — | 충족 | DEFERRED(옵션A) |
| SC-012 | 4종 allowlist 외 MIME 타입 또는 10MiB 초과 업로드 요청은 실 연동 후에도 400 을 반환한다(회귀 검증). | — | — | `src/modules/file/file.service.spec.ts::when_contentType_not_allowed_then_BadRequest (SEC-FIND-006-02)`, `when_size_over_limit_then_BadRequest`(기존 테스트, 신규 작성 불요) | 충족(회귀 0 확인) | PASS |
| SC-013 | 결제 관련 API 100회 순차 요청 P95 가 2,000ms 이하임을 확인한다. | 옵션A(실 이니시스 기준) / `test/payments.e2e-spec.ts`(SC-046, stub 기준, 기존) | — | — | Should 등급, stub 자동회귀 충족·실 이니시스 지연분은 옵션A | PASS(stub)/DEFERRED(옵션A, 실 지연분) |
| SC-014 | 결제/환불 완료(성공) 상태 변경 코드가 outbox 기록 없이 상태만 변경하는 경로가 없음을 정적/단위 검증으로 확인한다(PG 실패 시 `failed` 기록은 outbox 대상 제외 — FR-004). | `test/static/payment-outbox-invariant.spec.ts` | — | (동일 파일 내 실패분기 outbox 미참조 검사) | 충족 | PASS |
| SC-015 | 결제·환불 관련 신규 코드에 float/number 리터럴 대신 Prisma `Decimal` 타입만 사용됨을 정적 검증한다. | `test/static/inicis-decimal.spec.ts` | — | — | 충족 | PASS |
| SC-016 | 결제 요청·응답 로그에 이니시스 자격증명·카드 관련 민감정보가 노출되지 않아야 한다. | `src/modules/payment/inicis-payment-gateway.spec.ts` (`SC-016` describe) | — | — | 충족 | PASS |

**요약**: 자동화 9건(SC-005·006·007·008·009·012·014·015·016) 전건 PASS(회귀 0). 옵션A 6건(SC-001~004·010·011)·SC-013 실 지연분은 spec.md 확정 설계(옵션A, 사용자 실행)에 따른 DEFERRED — 미커버 결함 아님(§ coverage-gap.md 참조).

---

## STALE_SC 경고

검출 범위(PATCH-A18 §2): 021 git diff 변경 파일 — `payment.service.spec.ts`·`order.service.spec.ts`·
`package-no-aws.spec.ts` 3개 기존 파일 + 신규 5개 파일.

- 021 신규 추가 블록(SC-007 (021)·SC-009 (021))은 모두 `(021)`/`(021-payment-file-integration spec)`
  형태의 출처 식별자를 describe 명·docstring 에 포함 — 본 spec 자체 SC 이므로 STALE_SC 대상 아님.
  (엄밀한 `\(v\d+\.\d+\.\d+/\d+\s+spec\)` 정규식과는 표기가 다르나(예: `v1.1.0/021` 대신 `021`),
  본 저장소의 기존 관행 — 파일 상단 헤더에 "대상 SC (003): ... | (004): ..." 형식으로 스펙 폴더
  번호를 표기 — 과 일치하며, 이 관행은 015~020 다회차에 걸쳐 이미 사용 중이다.)
- `payment.service.spec.ts`·`order.service.spec.ts` 에 잔존하는 선행 스펙(003·004) SC 번호
  (SC-009~052 대다수, SC-012/019/020/021/023 등)는 021 diff 로 신규 추가된 코드가 아니며(git diff
  확인 — 기존 블록 변경 0, 신규 블록만 추가), 파일 상단 헤더 주석에 이미 출처가 명시되어 있다
  (PROC-001 "SC 번호 재시작 컨벤션의 정상 부산물"). 021 로 인한 신규 STALE_SC 0건.
- `test/static/package-no-aws.spec.ts` 는 SC-051(v1.0.0/003 spec 소유)을 그대로 유지하며 021 은
  allowlist 정밀화만 수행(describe 명 "SC-051: ..." 불변) — 신규 STALE_SC 아님.

```yaml
stale_sc:
  count: 0
  decision: NONE_FOUND
```
