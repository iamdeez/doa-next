---
작성: Performance Agent
버전: v1.0
최종 수정: 2026-07-06 05:52
상태: 확정
---

# 성능 측정 및 최적화 결과

## 목차

- [검토 범위](#검토-범위)
- [Constitution 성능 원칙 조항 이행 현황](#constitution-성능-원칙-조항-이행-현황)
- [성능 목표](#성능-목표)
- [Baseline 측정 결과](#baseline-측정-결과)
- [병목 지점 분석](#병목-지점-분석)
- [최적화 적용 내역](#최적화-적용-내역)
- [최종 측정 결과](#최종-측정-결과)
- [미달성 항목 및 사유](#미달성-항목-및-사유)
- [회귀 테스트 결과](#회귀-테스트-결과)

---

## 검토 범위

DIFF-021 변경 파일 중 성능(NFR-001/NFR-003)과 직결된 파일만 검토했다.

| 파일 | 검토 사유 |
|---|---|
| `apps/backend/src/modules/payment/inicis-payment-gateway.ts` | `charge()`/`refund()` 가 `POST /payments` 응답시간(NFR-001)에 직접 포함되는 동기 외부 호출 |
| `apps/backend/src/modules/payment/payment.service.ts` | PG 호출과 DB 트랜잭션의 경계(트랜잭션 내부 포함 여부)가 자원 고갈 리스크에 직결 |
| `apps/backend/src/modules/file/r2-file-storage.ts` | presigned URL 생성이 R2 서버 왕복을 포함하는지 확인 필요(NFR-001 무관 확인 목적) |
| `apps/backend/test/static/inicis-decimal.spec.ts` | NFR-003 Decimal 전용 정적 검증 존재 여부 확인 |
| `apps/backend/src/main.ts` | 애플리케이션 레벨 요청 타임아웃 설정 존재 여부 교차 확인 |

**제외 파일**: `r2.config.ts`, `inicis.config.ts`(env 파싱만, 성능 무관), `dto/create-payment.dto.ts`(검증 로직만) — research.md 영향 범위 분석과 DIFF 변경 라인 수(±10 이하) 대조 결과 성능 경로 미포함 확인.

---

## Constitution 성능 원칙 조항 이행 현황

`.claude/docs/constitution.md` 에 성능 전용 조항(P-XXX)이 없다(P-001~P-007 은 모듈 경계/AWS 금지/단일 DB/클라우드 중립/결제 정합성/테스트/스펙 범위). spec.md NFR-001(P95 ≤2,000ms)·NFR-003(Decimal 전용)이 구체적 수치 기준을 제공하므로, 03-verification-rules PROC-020-02 의 임의 기준 설정 회피 조건(NFR 모호 시에만 적용)에 해당하지 않는다 — spec.md 기준을 그대로 사용했다.

---

## 성능 목표

| PERF-ID | NFR-XXX | 목표값 | 측정 방법 |
|---|---|---|---|
| PERF-001 | NFR-001 | `POST /payments` P95 ≤ 2,000ms (KG이니시스 외부 API 지연 포함, 시스템 통제 불가 변동 요인으로 인지 — ASM-004) | `[env:e2e-docker]` 실측(SC-013) 또는 구조적 분석(외부 크레덴셜 부재 시) |
| PERF-002 | NFR-003 | 금전 연산 Decimal 전용, 부동소수점 미개입 | `[env:static]` 정적 검증 |

---

## Baseline 측정 결과

| PERF-ID | 측정값 | 목표 달성 여부 |
|---|---|---|
| PERF-001 (SC-013 실측) | **미실측** — 이니시스 sandbox 실 크레덴셜이 이 세션 환경에 없어 `test/payments.e2e-spec.ts`(SC-046, `TEST_JWT_TOKEN`/`TEST_ORDER_ID` 의존) 실행 불가. spec.md 도 SC-001~004·010·011·013 을 옵션A(사용자 실행)로 이미 DEFERRED 처리(security-report.md·DIFF-021 §변경 요약과 동일 caveat 승계) | 판정 보류 — coverage-gap, BLOCKED 사유 아님 |
| PERF-002 (정적 검증) | `pnpm exec jest --config test/jest-e2e.json --testPathPattern="test/static"` 실행 결과 **20 suites / 135 tests 전부 PASS** (`inicis-decimal.spec.ts` 포함, 회귀 0) | 달성 |

`payment.service.ts` 의 `amount` 는 `new Prisma.Decimal(order.totalAmount.toString()).minus(order.discountAmount)` 로 계산되고, `inicis-payment-gateway.ts` 는 `amount.toString()` 으로만 직렬화한다. `Number(`·`parseFloat(`·부동소수점 리터럴 산술 패턴이 grep 으로 0건 확인되어 정적 테스트 결과와 코드 사실이 일치한다.

---

## 병목 지점 분석

| PERF-ID | 병목 원인 | 유형 |
|---|---|---|
| PERF-BOTTLENECK-001 | `IniisisPaymentGateway.charge()`(L119)·`refund()`(L174) 의 native `fetch()` 호출에 **명시적 타임아웃(`AbortController`/`signal`) 이 없다**. `main.ts` 에도 앱 레벨 요청 타임아웃 인터셉터가 없다. | 구현 수준(단일 파일 2개 호출 지점에 국한 — 아키텍처 변경 불요) |
| — (참고, 병목 아님) | `R2FileStorage.getPresignedUploadUrl()` 은 `getSignedUrl()`(AWS SigV4 서명) 로컬 계산만 수행하며 R2 서버 왕복을 포함하지 않는다(SDK 특성상 네트워크 호출 없음). NFR-001(결제 API)과 무관하며 자체 지연 요인도 없음. | 해당 없음 — 정상 |

### PERF-BOTTLENECK-001 상세

- **근거**: `inicis-payment-gateway.ts` L119(`charge`)·L174(`refund`) 의 `fetch(endpoint, {...})` 호출에 `signal` 옵션이 없다. 저장소 전체(`apps/backend/src/modules/payment`, `apps/backend/src/modules/file`, `apps/backend/src/modules/social-auth`)를 grep 한 결과 `AbortController`/`AbortSignal.timeout`/`signal:` 패턴이 0건이다.
- **위험**: Node 20 내장 `fetch`(undici)는 애플리케이션이 별도 지정하지 않는 한 요청 전체에 대한 짧은 상한 타임아웃을 강제하지 않는다(기본 `headersTimeout`/`bodyTimeout` 이 각 300,000ms 로, 응답 대기가 초 단위가 아닌 분 단위까지 늘어날 수 있다). 이니시스 API 가 느리게 응답하거나 응답을 지연시키는 경우, 해당 요청은 NFR-001 P95 목표(2,000ms)를 벗어나는 수준으로 오래 열려 있을 수 있으며, 동시에 여러 결제 요청이 발생하면 이니시스 host 로의 아웃바운드 연결(undici agent 커넥션 풀)이 점유되어 **후속 결제 요청까지 연쇄 지연**될 수 있다.
- **완화 요인(자원 고갈 관점)**: `payment.service.ts` L57-58 의 주석과 코드 확인 결과 `gateway.charge()`/`gateway.refund()` 호출은 **DB 트랜잭션(`prisma.runInTransaction`) 외부**에서 실행된다("PG 호출은 롤백 불가" — 의도된 설계). 따라서 PG 응답 지연이 Prisma 커넥션 풀을 직접 고갈시키지는 않는다. 다만 HTTP 요청-응답 사이클과 아웃바운드 소켓은 여전히 응답 시점까지 점유된다.
- **spec 설계와의 정합성 간극**: ADR-008/FR-004/SC-007 은 "PG 호출이 타임아웃/5xx 로 실패하면 payment=`failed` 로 기록한다"는 처리 **이후** 동작만 정의했고, 그 타임아웃을 실제로 발생시키는 **상한값 자체**는 코드·설계 문서 어디에도 명시되어 있지 않다. 현재는 undici 기본값(약 5분)에 암묵적으로 의존하는 상태다.
- **선례**: infra.md §5(연결 실패 재시도 동작)에 이미 카카오/구글/네이버 소셜 로그인의 native fetch 도 "재시도 없음"으로만 기재되어 있고 타임아웃 여부는 기재되어 있지 않다(ADR-003 이 "기존 소셜 provider 와 동일 패턴"으로 명시 채택). 즉 타임아웃 부재는 021 신규 도입이 아니라 기존 소셜 로그인 패턴을 그대로 승계한 것이나, 결제는 NFR-001 이라는 구체적 P95 수치 목표를 가진 유일한 외부 연동이라는 점에서 리스크 노출도가 다르다.
- **분류 근거(구현 수준 vs 아키텍처 수준)**: 수정 범위가 `inicis-payment-gateway.ts` 단일 파일의 2개 `fetch()` 호출에 `AbortController` 기반 `signal` 옵션을 추가하는 것으로 국한되며, 기존 실패 분기(`{success:false, failureReason}` 반환) 계약·`payment.service.ts` 의 트랜잭션 경계·멱등성 로직을 변경할 필요가 없다. 따라서 아키텍처 수준 재설계가 아닌 **구현 수준 병목**으로 분류한다.

---

## 최적화 적용 내역

**본 차수는 검증·보고 전용으로 코드 변경을 적용하지 않았다** (team-lead 지시: "코드 변경 금지(검증·보고만)"). PERF-BOTTLENECK-001 은 아래 "미달성 항목 및 사유"에 Development Agent 복귀 권고로 기록한다.

권고 수정안(Development 복귀 시 참고용, 미적용):

```ts
const controller = new AbortController();
const timer = setTimeout(() => controller.abort(), INICIS_REQUEST_TIMEOUT_MS);
try {
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: toFormBody(payload),
    signal: controller.signal,
  });
  // ...
} finally {
  clearTimeout(timer);
}
```

- `INICIS_REQUEST_TIMEOUT_MS` 는 NFR-001 P95 예산(2,000ms) 내에서 이니시스 API 자체 처리 시간을 고려해 결정 필요(예: 5,000~10,000ms — 정확한 값은 이니시스 공식 문서 기준 [TO-VERIFY], Development/사용자 확인 대상).
- `AbortError` 는 기존 `catch (err)` 분기에서 `err instanceof Error` 로 이미 포착되므로 `charge()`/`refund()` 의 기존 실패 반환 계약(`{success:false, failureReason}`)이 그대로 적용된다 — 인터페이스 변경 없음.

---

## 최종 측정 결과

코드 변경이 없으므로 Baseline 과 동일하다(PERF-002 135/135 PASS 유지, PERF-001 미실측 상태 유지).

---

## 미달성 항목 및 사유

| PERF-ID | 미달성 내용 | 사유 | 권고 조치 |
|---|---|---|---|
| PERF-BOTTLENECK-001 | `charge()`/`refund()` fetch 호출에 명시적 타임아웃 부재 | 본 차수는 검증 전용(코드 변경 금지 지시) | **Development Agent 복귀 권고**: `AbortController` 기반 타임아웃을 두 호출 지점에 추가(위 예시 참조). 구현 수준 수정으로 아키텍처 변경 불요. |
| PERF-001 (SC-013 실측) | 실제 이니시스 sandbox 호출 지연 미측정 | 실 크레덴셜이 이 세션 환경에 없음(옵션A, 사용자 실행 대상) | 기존 spec.md/DIFF-021 caveat 유지 — coverage-gap, BLOCKED 사유 아님 |

---

## 회귀 테스트 결과

코드 변경이 없어 회귀 재확인이 불필요하나, baseline 측정 시 실행한 정적 검증 스위트가 최신 상태임을 재확인했다.

`pnpm exec jest --config test/jest-e2e.json --testPathPattern="test/static"` → **Test Suites: 20 passed, 20 total / Tests: 135 passed, 135 total** (`payment-outbox-invariant.spec.ts`·`provider-env-switch.spec.ts`·`inicis-decimal.spec.ts`·`inicis-idempotency.spec.ts`·`package-no-aws.spec.ts` 포함, 회귀 0).
