---
작성: Test Agent (AUTHORING) — 옵션A caveat 갱신: Test Agent (EXECUTION, 5b)
버전: v1.1
최종 수정: 2026-07-06 02:49
상태: 확정
---

# Test Cases: 021-payment-file-integration

## 목차

- [SC × 시나리오 매트릭스](#sc--시나리오-매트릭스)
- [외부 의존성 명시](#외부-의존성-명시)
- [옵션 A 검증 계약 (실 이니시스 sandbox·실 R2 버킷 필요)](#옵션-a-검증-계약-실-이니시스-sandbox실-r2-버킷-필요)
- [미커버 항목 (사전 분류 — 4-카테고리)](#미커버-항목-사전-분류--4-카테고리)

---

## SC × 시나리오 매트릭스

> 검증 방식 열: **자동** = jest 로 파이프라인 내 자동 실행·통과 확인 완료. **옵션A** = 실
> 이니시스 sandbox·실 R2 버킷 크레덴셜이 필요하여 jest 자동화 대상에서 제외하고 아래
> "옵션 A 검증 계약" 절의 수동 절차로 검증한다(거짓 green 방지 — 019/020 원칙 계승).

| SC-ID | 수용 기준 | Happy | Edge | Error | 검증 방식 | 테스트 파일·함수 | env 태그 |
|---|---|---|---|---|---|---|---|
| SC-001 | sandbox 신용카드 동기 승인→completed | test_when_card_charge_then_completed | — | — | **옵션A** | (옵션A 절차 §SC-001 참조) | `[env:e2e-docker]` |
| SC-002 | sandbox 실시간 계좌이체 승인 | test_when_transfer_charge_then_approved | — | — | **옵션A** | (옵션A 절차 §SC-002 참조) | `[env:e2e-docker]` |
| SC-003 | sandbox 간편결제 승인 | test_when_easypay_charge_then_approved | — | — | **옵션A** | (옵션A 절차 §SC-003 참조) | `[env:e2e-docker]` |
| SC-004 | 전액 환불→refunded | test_when_full_refund_then_refunded | — | — | **옵션A** | (옵션A 절차 §SC-004 참조) | `[env:e2e-docker]` |
| SC-005 | 부분 환불(요청액만, 게이트웨이 레벨) | — | test_when_partial_amount_and_pgTransactionId_then_request_body_reflects_partial_amount_only | — | **자동** (PASS 확인) | `src/modules/payment/inicis-payment-gateway.spec.ts` | `[env:integration]` |
| SC-006 | charge/refund 페이로드 멱등키 포함(정적) | test_when_inspect_charge_method_then_payload_includes_idempotencyKey / test_when_inspect_refund_method_then_payload_includes_idempotencyKey | — | — | **자동** (PASS 확인) | `test/static/inicis-idempotency.spec.ts` | `[env:static]` |
| SC-007 | PG 실패→failed + 동일 멱등키 재요청 중복방지 | — | — | test_when_pg_fails_then_status_failed_and_retry_with_same_key_no_duplicate_charge | **자동** (PASS 확인) | `src/modules/payment/payment.service.spec.ts` (SC-007 describe 블록) | `[env:integration]`(unit mock 구현) |
| SC-008 | env 전환만으로 sandbox↔운영 교체(정적) | (다수 — payment.module/file.module/config 검증) | — | — | **자동** (PASS 확인) | `test/static/provider-env-switch.spec.ts` | `[env:static]` |
| SC-009 | 환불 관리자 개입 없이 자동 처리 | test_when_cancel_paid_then_refund_completes_within_single_call_without_manual_approval | — | — | **자동** (PASS 확인) | `src/modules/order/order.service.spec.ts` (SC-009 (021) describe 블록) | `[env:integration]`(unit mock 구현) |
| SC-010 | presigned PUT 실 R2 업로드 2xx | test_when_put_presigned_then_2xx | — | — | **옵션A** | (옵션A 절차 §SC-010 참조) | `[env:e2e-docker]` |
| SC-011 | public URL(r2.dev) GET 접근 | test_when_get_public_url_then_content | — | — | **옵션A** | (옵션A 절차 §SC-011 참조) | `[env:e2e-docker]` |
| SC-012 | allowlist 외 MIME/10MiB 초과 400(회귀) | — | — | (기존 테스트로 커버 확인) | **자동** (기존 테스트 PASS 확인 — 신규 작성 불요) | `src/modules/file/file.service.spec.ts`::`when_contentType_not_allowed_then_BadRequest (SEC-FIND-006-02)`, `when_size_over_limit_then_BadRequest` | `[env:unit]` |
| SC-013 | 결제 API 100회 순차 P95 ≤2000ms | — | test_when_100_payments_then_p95_under_2000 | — | **옵션A**(실 이니시스 지연 포함 측정) / stub 기준은 기존 SC-046 로 자동 커버 | `test/payments.e2e-spec.ts`(SC-046, 기존, stub 기준 PASS 확인) + (옵션A 절차 §SC-013 참조, 실 inicis 기준) | `[env:e2e-docker]` Should |
| SC-014 | outbox 미기록 상태변경 경로 부재(정적/단위) | test_when_inspect_createOutbox_call_count_then_exactly_two_success_paths 등 | — | test_when_inspect_source_then_no_outbox_reference_in_failed_status_branch | **자동** (PASS 확인) | `test/static/payment-outbox-invariant.spec.ts` | `[env:unit]` |
| SC-015 | 신규 결제/환불 코드 Decimal 전용(정적) | test_when_inspect_gateway_source_then_amount_typed_as_Prisma_Decimal 등 | — | — | **자동** (PASS 확인) | `test/static/inicis-decimal.spec.ts` | `[env:static]` |
| SC-016 | 로그에 자격증명·카드정보 미노출 | test_when_charge_then_mid_and_signKey_absent_from_all_log_output / test_when_refund_then_mid_and_signKey_absent_from_all_log_output | — | — | **자동** (PASS 확인) | `src/modules/payment/inicis-payment-gateway.spec.ts` (SC-016 describe 블록) | `[env:integration]` |

> **참고(constitution P-002 L32 회귀 가드)**: `test/static/package-no-aws.spec.ts` 는 021 진행 중
> Development(T007)가 allowlist(`@aws-sdk/client-s3`·`@aws-sdk/s3-request-presigner`)로 직접
> 정밀화 완료(PASS 확인됨). 원 SC-051(v1.0.0/003 spec) 소유 파일이며 021 신규 SC 번호가
> 부여되어 있지 않으므로 위 매트릭스에는 포함하지 않았다 — 실행 시 함께 확인됨(회귀 없음).

---

## 외부 의존성 명시

- **fixture**: `payment.service.spec.ts`/`order.service.spec.ts` 는 기존 mock 팩토리
  (`mockPaymentRepository`·`mockPaymentGateway`·`mockOrderRepository`·`mockPrismaService`·
  `mockPaymentService` 등)를 재사용한다. 신규 fixture 추가 없음.
- **mock**: `inicis-payment-gateway.spec.ts` 는 `globalThis.fetch` 를 `jest.fn()` 으로 교체하고
  `Logger.prototype.log/warn/error` 를 `jest.spyOn` 으로 가로챈다. 각 테스트 `afterEach` 에서
  `jest.restoreAllMocks()` + `globalThis.fetch` 원복(전역 상태 오염 방지).
- **환경 변수**: 정적 테스트(`test/static/*.spec.ts`)는 환경 변수·DB·네트워크가 전혀 필요 없다
  (소스 텍스트 파싱만). 옵션 A 절차는 아래 "외부 의존성" 표(§옵션 A 검증 계약) 참조.
- **외부 서비스**: 옵션 A 항목(SC-001~004·010·011·013)만 실 이니시스 sandbox·실 Cloudflare R2
  버킷에 의존한다. 그 외 전 항목은 외부 서비스 의존 없음.

---

## 옵션 A 검증 계약 (실 이니시스 sandbox·실 R2 버킷 필요)

> **원칙**: 아래 SC 들은 실제 크레덴셜 없이 통과하는 mock 으로 "검증됨"을 위장하지 않는다.
> 사용자가 sandbox/R2 크레덴셜을 준비한 뒤 아래 절차를 직접 실행하고, 그 결과를 Test
> Agent(EXECUTION, 5b)에 전달하면 5b 가 판정한다. main session 이 크레덴셜 준비 절차를
> 사용자에게 안내하는 옵션 A 흐름을 따른다(plan.md PATCH-A08).

### 사전 준비 (공통)

| 항목 | 값/출처 |
|---|---|
| `PAYMENT_PROVIDER=inicis` | Fly secrets 또는 `.env.local` |
| `INICIS_MID`·`INICIS_SIGN_KEY`·`INICIS_API_BASE_URL` | 이니시스 개발자센터 공용 테스트 상점ID 발급([TO-VERIFY], ASM-013) |
| `FILE_STORAGE=r2` | Fly secrets 또는 `.env.local` |
| `R2_ACCOUNT_ID`·`R2_ACCESS_KEY_ID`·`R2_SECRET_ACCESS_KEY`·`R2_BUCKET`·`R2_PUBLIC_BASE_URL` | Cloudflare R2 계정·버킷·API 토큰 발급(ASM-013) |
| `DATABASE_URL`·`TEST_JWT_TOKEN` | 기존 e2e 관례(payments.e2e-spec.ts 참조) |

> **[GAP-021-02 완전 해소 — 5b 갱신]** 5a 산출 시점에는 `POST /payments` 가 클라이언트 `authToken`
> 을 수신·전달하는 배선이 없어 아래 "게이트웨이 직접 호출" 방식만 가능했다. 이후 team-lead
> 지시(사용자 승인)로 Development Agent 가 배선을 완전 확장했다 — `CreatePaymentDto.authToken?`
> (optional, `@IsOptional()/@IsString()`) 추가 → `PaymentController.pay` 가 `dto.authToken` 을
> `PaymentService.pay(userId, orderId, idempotencyKey, authToken)` 4번째 인자로 전달 →
> `PaymentService.pay` 가 `gateway.charge({ orderId, amount, idempotencyKey, authToken })` 로
> 전달(`payment.service.ts` L36-58, `payment.controller.ts` L31-46, `create-payment.dto.ts`
> 확인 완료 — 5b 코드 레벨 재확인). **따라서 SC-001~003·013 의 실 sandbox 검증은 이제
> "게이트웨이 직접 호출"이 아닌 실 HTTP API 경로(`POST /payments` body 에 `authToken` 포함)로도
> 수행 가능**하다. 하위호환 확인: `authToken` 미전달 시 `undefined` 로 전파되어 stub 은 값을
> 사용하지 않고 `IniisisPaymentGateway.charge` 는 기존 `INICIS_API_BASE_URL` fallback 경로를
> 그대로 사용(회귀 0, unit 409/409·정적 135/135·`payments.e2e-spec.ts` 4건 전 PASS 로 5b 재확인).
> `authUrl`(결제창 동적 승인 URL)은 `POST /payments` DTO 에 여전히 미노출이므로, 결제창이
> 동적 URL 을 요구하는 흐름이면 아래 "게이트웨이 직접 호출" 방식이 계속 필요할 수 있다
> ([TO-VERIFY], research.md §4-1). 아래 SC-001~004·013 절차 문구는 두 경로(HTTP API 경유 /
> 게이트웨이 직접 호출) 를 병기하도록 갱신했다.

### SC-001~003: sandbox 신용카드·계좌이체·간편결제 동기 승인

1. 이니시스 표준(호스팅) 결제창 테스트 흐름으로 1단계 인증을 수행하여 `authToken`(또는
   `authUrl`) 을 획득한다(브라우저 테스트 결제창, 사용자 협조 필요 — research.md §4-1/§4-2).
2. **방식 A(권장, HTTP API 경유 — GAP-021-02 완전해소로 신규 가능)**: `POST /payments`
   `{ orderId, idempotencyKey, authToken }` 로 실 요청(JWT 인증 헤더 포함). 컨트롤러→서비스→
   게이트웨이 배선이 `authToken` 을 그대로 전달하므로 실 API 왕복 전체(주문 소유권·멱등성·
   outbox 포함)가 검증된다.
   **방식 B(대안, 게이트웨이 직접 호출 — `authUrl` 동적 승인 URL 이 필요한 흐름일 때)**:
   Node REPL 또는 임시 스크립트에서 `new IniisisPaymentGateway(configService)` 를 생성(env 로부터
   실 sandbox config 주입)하고 `charge({ orderId, amount: new Prisma.Decimal('1000'),
   idempotencyKey: randomUUID(), authToken, authUrl })` 를 호출한다(HTTP 계층·DB 기록 우회).
3. **기대 결과**: 방식 A 는 `POST /payments` 201 응답 + `status: 'completed'`(DB 확인 시
   `payment.pgTransactionId` 비어있지 않음). 방식 B 는 `{ success: true, pgTransactionId: <string> }`
   반환(신용카드=SC-001, 실시간계좌이체=SC-002, 간편결제=SC-003 — 결제수단별 이니시스 sandbox
   테스트 계정/코드로 반복).
4. **판정 기준**: 방식 A — 응답 `status === 'completed'` 이면 PASS. 방식 B — `success === true`
   이고 `pgTransactionId` 가 비어있지 않은 문자열이면 PASS. 실패 시 `failureReason` 값과 함께
   FAIL 로 기록하고 원인(서명 불일치·엔드포인트 오류 등 [TO-VERIFY] 항목)을 5b 에 보고한다.

### SC-004: 전액 환불

1. SC-001~003 중 하나로 sandbox 실 charge 를 완료하여 `pgTransactionId` 를 획득한다.
2. `PaymentService.refund(paymentId, 'refund:'+orderId)` 를 호출(실 DB 경유, `DATABASE_URL`
   설정된 통합 환경)하거나, 게이트웨이 직접 호출로 `refund({ paymentId, amount: <원결제액>,
   idempotencyKey, pgTransactionId })` 를 호출한다.
3. **기대 결과**: `{ success: true, pgRefundId: <string> }`. DB 경유 시 `payment.status ===
   'refunded'`.
4. **판정 기준**: 위 조건 충족 시 PASS. 이니시스 응답 `resultCode !== '0000'` 이면 FAIL 로
   기록하고 사유를 5b 에 보고.

### SC-010/SC-011: R2 실 업로드·public URL 접근

1. `FILE_STORAGE=r2` + R2 크레덴셜 설정 후 앱 기동, `POST /files/presign`
   (`{ purpose, contentType: 'image/png' }`) 호출 → `{ uploadUrl, publicUrl }` 획득.
2. **SC-010**: 로컬 이미지 파일(≤10MiB, allowlist MIME)을 `PUT {uploadUrl}` 로 업로드.
   **기대 결과**: 2xx 응답. **판정 기준**: HTTP status 200~299 이면 PASS.
3. **SC-011**: 업로드 완료 후 `GET {publicUrl}`(r2.dev) 요청.
   **기대 결과**: 업로드한 파일과 동일한 바이트 내용(또는 최소 200 OK + Content-Length 일치).
   **판정 기준**: 응답 바디가 원본 파일과 동일하면 PASS.

### SC-013: 결제 API 100회 순차 P95 ≤ 2,000ms (실 이니시스 기준)

1. `PAYMENT_PROVIDER=inicis` 설정 상태에서 기존 `test/payments.e2e-spec.ts`(SC-046 패턴)를
   실 sandbox 크레덴셜 환경에서 재실행하되, 각 반복 호출이 실제 이니시스 승인 API 를
   경유하도록 구성한다. GAP-021-02 완전해소로 `POST /payments` body 에 `authToken` 을 포함한
   HTTP API 경유 100회 반복 측정이 가능하다(§SC-001~003 방식 A). `authUrl` 동적 URL 이 필요한
   흐름이면 방식 B(게이트웨이 레벨 100회 반복 호출)로 대체 가능.
2. **기대 결과**: 100회 응답시간의 P95 ≤ 2,000ms.
3. **판정 기준**: P95 초과 시 NFR-001 Should 등급이므로 즉시 FAIL 처리하지 않고, 이니시스
   외부 지연(ASM-004, 시스템이 통제할 수 없는 변동 요인)으로 기록 — Performance Agent 최종
   판단으로 위임.

---

## 미커버 항목 (사전 분류 — 4-카테고리)

| SC-ID | 미커버 사유 | 카테고리 | 권장 검증 방법 |
|---|---|---|---|
| SC-001~003 | 실 이니시스 sandbox 승인 API 호출(1단계 브라우저 인증 필요) — mock 시뮬레이션은 "실 API 호출 검증" 목표(ASM-001) 훼손 | (3) 운영 환경(sandbox) 에서 확인 권장 | 위 옵션 A 절차 §SC-001~003 |
| SC-004 | 실 이니시스 sandbox 취소 API 호출 | (3) 운영 환경(sandbox) 에서 확인 권장 | 위 옵션 A 절차 §SC-004 |
| SC-010/SC-011 | 실 Cloudflare R2 버킷 PUT/GET(네트워크·인증 실제 동작 검증 목적) | (3) 운영 환경(R2 실 버킷) 에서 확인 권장 | 위 옵션 A 절차 §SC-010/SC-011 |
| SC-013 | 실 이니시스 외부 지연 포함 P95(ASM-004 통제 불가 변동 요인) | (3) 운영 환경(sandbox) 에서 확인 권장 | 위 옵션 A 절차 §SC-013. stub 기준 자동 회귀는 기존 SC-046 로 이미 커버 |
| GAP-021-02 (RESOLVED, 5b 재확인) | `POST /payments` 가 클라이언트로부터 결제창 인증결과(authToken)를 수신·전달하는 배선을 Development 추가작업으로 완전 확장(`create-payment.dto.ts`·`payment.controller.ts`·`payment.service.ts` — 5b 코드 레벨 확인 완료). 잔존 항목은 `authUrl`(결제창 동적 승인 URL) 미노출뿐(§SC-001~003 방식 B 로 대체 가능) | (4) 차후 점검(경미) | `authUrl` 을 요구하는 결제창 흐름 확정 시 DTO 확장 여부 재검토([TO-VERIFY], research.md §4-1) |

> 카테고리 (1)(단위테스트 가능이나 미작성) 항목 없음 — SC-005·006·007·008·009·012·014·015·016
> 전건 자동 테스트 작성·PASS 확인 완료. 카테고리 (3)(4) 만 존재하므로 Docs Agent(6단계)
> 진행이 가능하나, GAP-021-02 잔존 항목은 main session 이 사용자에게 옵션 A 실행 전
> 컨트롤러 배선 확장 여부를 확인하도록 권고한다.
