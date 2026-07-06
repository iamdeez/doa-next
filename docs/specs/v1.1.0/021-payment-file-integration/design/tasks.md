---
작성: Design Agent
버전: v1.0
최종 수정: 2026-07-06 02:05
상태: 확정
---

# Tasks: 021-payment-file-integration
> Branch: 021-payment-file-integration | Date: 2026-07-06 | Plan: [plan.md](../planning/plan.md)

## 목차

- [전제 조건](#전제-조건)
- [태스크 목록](#태스크-목록)
- [Test Authoring Contract](#test-authoring-contract)
- [태스크 입도 가이드](#태스크-입도-가이드)
- [구현 완료 기준](#구현-완료-기준)

---

## 전제 조건

- [x] spec.md 의 모든 [NEEDS CLARIFICATION] 항목이 해소되었는가? — 0건(GAP-021-01 RESOLVED)
- [x] plan.md 의 Constitution Gates 가 모두 통과(또는 예외 기재) 되었는가? — P-001~P-007 전건 PASS
- [x] CHANGES.md 에서 이전 작업의 "후속 작업 시 주의사항" 을 확인했는가? — 020 이 PG/R2 실연동을 명시적 후속 spec 으로 지정
- [ ] **[TO-VERIFY] 크레덴셜**: 이니시스 공용 테스트 상점ID·R2 계정/버킷/토큰은 Development 착수 직전 사용자 준비(ASM-013·GAP-021-02). 미준비 시 실 검증 SC(e2e-docker)만 옵션 A defer, 정적/단위/DI 전환 태스크는 진행 가능.

---

## 태스크 목록

> [P] 표시: 이전 태스크와 병렬 실행 가능. 기본 의존 순서: B → C → D.
> **레이어 재정의**: 본 spec 은 스키마 변경 0(레이어 A 없음). Track A(결제)·Track B(파일)는 상호 독립 → 트랙 간 [P] 병렬 가능.
>
> | 레이어 | 본 spec 대상 | 담당 |
> |---|---|---|
> | A. 데이터 | 없음(스키마 무변경, DB Design 비활성) | — |
> | B. 도메인 | Port 구현체(IniisisPaymentGateway·R2FileStorage)·config·refund 시그니처·caller 마이그레이션 | 4단계 Development |
> | C. 인터페이스 | DI 팩토리(useFactory)·env·package.json·정적 가드 정밀화·redact | 4단계 Development |
> | D. 테스트 | SC-001~016 | 5a Test(AUTHORING) |

### Step 1. Track A 기반 — 결제 (레이어 B)

- [x] **T001** — 이니시스 config 매핑
    - 레이어: B
    - 구현 파일: `apps/backend/src/modules/payment/inicis.config.ts`
    - 관련 요구사항: FR-005
    - 상세: `registerAs('inicis', () => ({ mid, signKey, apiBaseUrl, apiKey?, apiIv? }))` — env(`INICIS_MID`·`INICIS_SIGN_KEY`·`INICIS_API_BASE_URL`·`INICIS_API_KEY`·`INICIS_API_IV`) 매핑. **정확한 이니시스 키 요구사항은 [TO-VERIFY]**. 필수 env 검증은 **provider=inicis 선택 시점**에만(jwtConfig 처럼 무조건 throw 금지 — stub 부팅 유지, research §1-1).
    - 완료 기준: config 함수 정의 + provider=inicis 시 필수 env 부재면 명확한 에러, provider=stub 이면 미검증(부팅 유지). typecheck 0.

- [x] **T002** — IniisisPaymentGateway 구현 (charge/refund/서명)
    - 레이어: B
    - 구현 파일: `apps/backend/src/modules/payment/inicis-payment-gateway.ts`
    - 관련 요구사항: FR-001·FR-002·FR-003
    - 상세: `@Injectable() class IniisisPaymentGateway implements PaymentGatewayPort`. `ConfigService`(inicis) 주입, HTTP=native `fetch`, 서명=native `crypto`.
      - `charge`: 이니시스 **표준결제 승인 API**(서버-투-서버, 동기) 호출 → 성공 `{success:true, pgTransactionId: <tid>}` / 실패·거절 `{success:false, failureReason}`. 결제창 인증결과(auth token) 입력 경로는 **GAP-021-02 / [TO-VERIFY]** — optional 파라미터 확장 여지(refund 동형, stub 회귀 0). 결제수단 코드(카드·실시간계좌이체·간편결제) `[TO-VERIFY]`. 가상계좌 미구현(범위 외).
      - `refund`: 취소 API 호출. `pgTransactionId`(원 거래ID, T003 로 확장된 optional 파라미터) + `amount`(부분환불 시 요청액) 전달 → `{success, pgRefundId}`. 전액=원결제액.
      - 멱등키(FR-003): charge/refund 페이로드에 `idempotencyKey` 포함(이니시스 필드 매핑 [TO-VERIFY]).
      - 로깅(NFR-004): 요청/응답 로그에서 MID·signKey·apiKey·카드 관련 필드 **명시 마스킹/미출력**(research §10).
      - 파라미터·서명 알고리즘·엔드포인트·응답 필드 구체값 전량 `[TO-VERIFY]`(이니시스 개발자센터 — 추측 리터럴 금지).
    - 완료 기준: PaymentGatewayPort 구현 완료·typecheck 0. 앱 부팅 1회로 런타임 import 검증(fetch/crypto 내장). 자격증명 로그 미노출 자가 확인.

- [x] **T003** — refund 시그니처 확장(pgTransactionId) + 호출 측 마이그레이션 (ADR-002, §F PROC-001)
    - 레이어: B
    - 구현 파일: `apps/backend/src/modules/payment/payment-gateway.port.ts`·`stub-payment-gateway.ts`·`payment.service.ts`
    - 관련 요구사항: FR-002 (SC-005)
    - 상세: `PaymentGatewayPort.refund` 파라미터에 `pgTransactionId?: string`(**optional**) 추가. `StubPaymentGateway.refund` 동반 갱신(값 무시). `payment.service.ts` L116 refund 호출에 `pgTransactionId: payment.pgTransactionId ?? undefined` 전달(`payment` 은 findByOrderId 결과로 이미 보유). **payment.service 의 실패분기·멱등 조회·charge 흐름은 불변(ADR-008)**.
    - 완료 기준: optional 확장으로 기존 `payment.service.spec.ts` refund 테스트(SC-040/041) PASS 유지(인자 엄격검증 없음 확인 — research §3-1). 잔여 참조 grep 0. typecheck 0.

### Step 2. Track B 기반 — 파일 (레이어 B) `[P]` (Track A 와 병렬)

- [x] **T004** `[P]` — R2 config 매핑
    - 레이어: B
    - 구현 파일: `apps/backend/src/modules/file/r2.config.ts`
    - 관련 요구사항: FR-007·FR-008
    - 상세: `registerAs('r2', () => ({ accountId, accessKeyId, secretAccessKey, bucket, publicBaseUrl }))` — env(`R2_ACCOUNT_ID`·`R2_ACCESS_KEY_ID`·`R2_SECRET_ACCESS_KEY`·`R2_BUCKET`·`R2_PUBLIC_BASE_URL`). 필수 env 검증은 provider=r2 시점에만(stub 부팅 유지).
    - 완료 기준: config 정의 + provider=r2 시 필수 env 부재면 에러, stub 이면 미검증. typecheck 0.

- [x] **T005** `[P]` — R2FileStorage 구현 (presigned PUT·public URL)
    - 레이어: B
    - 구현 파일: `apps/backend/src/modules/file/r2-file-storage.ts`
    - 관련 요구사항: FR-007·FR-008·FR-009
    - 상세: `@Injectable() class R2FileStorage implements FileStoragePort`. 생성자에서 `S3Client`(endpoint=`https://{accountId}.r2.cloudflarestorage.com`, region=`'auto'`, credentials) 1회 생성(재사용).
      - `getPresignedUploadUrl(key, contentType)`: `getSignedUrl(s3, new PutObjectCommand({ Bucket, Key: key, ContentType: contentType }), { expiresIn: R2_PRESIGN_EXPIRES_SECONDS })` → `{ uploadUrl, publicUrl }`. **import: named** (`import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3'`·`import { getSignedUrl } from '@aws-sdk/s3-request-presigner'`).
      - `getPublicUrl(key)`: `${publicBaseUrl}/${key}`(r2.dev).
      - 상수 `R2_PRESIGN_EXPIRES_SECONDS = 600`(ADR-006, 사용자 승인).
      - **allowlist·10MiB 검증 중복 금지** — FileService 에 존재(FR-009 회귀는 FileService 불변으로 자동 보장).
    - 완료 기준: FileStoragePort 구현·typecheck 0. 앱 부팅 1회로 `@aws-sdk` 런타임 import 검증(typecheck 미포착 — research §6). 실 R2 PUT/GET 은 SC-010/011(옵션 A).

### Step 3. DI 팩토리·설정·정적 가드 (레이어 C)

- [x] **T006** — 결제/파일 DI 팩토리 전환 (useClass→useFactory, default stub) (ADR-005)
    - 레이어: C
    - 구현 파일: `apps/backend/src/modules/payment/payment.module.ts`·`apps/backend/src/modules/file/file.module.ts` (+ 필요 시 `shared/config/config.module.ts` load 등록)
    - 관련 요구사항: FR-005 (SC-008)
    - 상세: `PAYMENT_GATEWAY` provider 를 `useFactory`(inject: ConfigService) 로 — `PAYMENT_PROVIDER==='inicis'` → IniisisPaymentGateway, 그 외(미설정·미인식) → **StubPaymentGateway(default)**. `FILE_STORAGE` 동일(`FILE_STORAGE==='r2'` → R2FileStorage, 그 외 → StubFileStorage). inicis/r2 config 를 `ConfigModule` load 에 등록(모듈 로컬 `ConfigModule.forFeature` 또는 전역 config.module load — 택1, research §1-1).
    - 완료 기준: **PAYMENT_PROVIDER/FILE_STORAGE 미설정 시 stub 로 부팅**(e2e 회귀 방지 — payments.e2e-spec.ts 는 override 없이 AppModule 부팅). 기존 payment/file **단위 스위트 PASS 유지**(자체 provider override 로 팩토리 미경유 — research §1-2). smoke: `src/modules/payment/**/*.spec.ts`·`src/modules/file/**/*.spec.ts` 전체 PASS.

- [x] **T007** — 신규 의존성 추가 + package-no-aws 정적 가드 정밀화 (§F PROC-001)
    - 레이어: C
    - 구현 파일: `apps/backend/package.json`·`apps/backend/test/static/package-no-aws.spec.ts`
    - 관련 요구사항: FR-007 / constitution P-002 L32
    - 상세: `@aws-sdk/client-s3`·`@aws-sdk/s3-request-presigner` 를 dependencies 에 추가(pnpm). **`package-no-aws.spec.ts` 회귀 필수 수정** — 두 it 블록이 모든 `@aws-sdk/*`·`@aws-` 를 0건으로 단언하므로 그대로면 FAIL. allowlist=`['@aws-sdk/client-s3','@aws-sdk/s3-request-presigner']` **정확 매칭만 예외**, 그 외 `@aws-sdk/*`·`aws-sdk`·`@aws-`·`amazon-` 은 **계속 차단**(무력화 아님 — P-002 L32 명시 허용 근거를 테스트 주석에 기재).
    - 완료 기준: `pnpm install` 후 정적 스위트(`test/static`) 전체 PASS. allowlist 외 임의 `@aws-sdk/*` 추가 시 여전히 FAIL 함을 논리로 확인(가드 유효성 유지).

- [x] **T008** `[P]` — .env.example 신규 env 문서화 + redact 검토
    - 레이어: C
    - 구현 파일: `apps/backend/.env.example` (+ 조건부 `apps/backend/src/app.module.ts`)
    - 관련 요구사항: FR-005·NFR-004
    - 상세: `.env.example` 에 `PAYMENT_PROVIDER`·`FILE_STORAGE`·`INICIS_*`·`R2_*` 를 기존 파일 스타일(주석+KEY=placeholder)로 추가. 이니시스 키명은 [TO-VERIFY] 반영(placeholder + 주석). ADR-007 redact: 이니시스 자격증명은 req.header 가 아니므로 pino `req.headers.*` redact 로 미포착 — **주 방어는 T002 구현체 마스킹**. 응답 body 로깅이 없으면 redact 배열 확장은 불요(research §7·§10). 필요 판단 시에만 최소 확장.
    - 완료 기준: .env.example 에 신규 키 문서화. 실제 secret 값 미기재(placeholder만). Security Agent SC-016 최종 감사 대상 명시.

### Step 4. 테스트 (레이어 D) — 5a Test(AUTHORING) 소유

> 본 Step(레이어 D)은 **5a Test Agent(AUTHORING)** 가 PPG-1 병렬로 수행한다. 4단계 Development 는 본 Step 외(B·C)만 진행. 상세 시나리오·파일·심볼은 아래 [Test Authoring Contract] 를 canonical 로 사용.

- [ ] **T009** — 정적/단위 검증 (SC-006·008·012·014·015)
    - 레이어: D
    - 테스트 파일: `test/static/*.spec.ts`(SC-006 멱등키 페이로드·SC-008 env 전환구조·SC-015 Decimal)·`src/modules/**/*.spec.ts` 또는 `test/*`(SC-012 allowlist 회귀·SC-014 outbox 경로)
    - 검증 대상: SC-006·SC-008·SC-012·SC-014·SC-015

- [ ] **T010** — 통합 검증 (SC-007·009·016)
    - 레이어: D
    - 테스트 파일: `test/*.e2e-spec.ts`(integration — mock/실 DB) 또는 `src/modules/payment/*.spec.ts`
    - 검증 대상: SC-007(PG 실패→failed+멱등키 재요청 중복방지)·SC-009(환불 자동경로)·SC-016(로그 자격증명 미노출)

- [ ] **T011** — E2E-docker 검증 (SC-001~005·010·011·013) — 옵션 A
    - 레이어: D
    - 테스트 파일: `test/payments.e2e-spec.ts`·`test/search-notification-file.e2e-spec.ts`(또는 신규 `test/r2-file.e2e-spec.ts`)·`test/perf/*`
    - 검증 대상: SC-001~005(이니시스 sandbox charge/refund)·SC-010/011(실 R2 PUT/GET)·SC-013(P95)
    - 비고: 실 이니시스 sandbox·실 R2 크레덴셜 필요 → **옵션 A**(main 이 환경구성 절차 제시 → 사용자 실행 → 결과 전달 → Test Agent 검증). 크레덴셜 부재 시 `isIntegrationEnvReady()` 패턴으로 skip(기존 payments.e2e 패턴 준용).

---

## Test Authoring Contract

> **PPG-1 의 5a Test Agent(AUTHORING) 입력 contract.** 5a 는 Development(4)와 병렬이라 production 코드를 못 보므로, 아래 **canonical 심볼**을 기준으로 작성한다(가정 금지 — PROC-004).

### Canonical production 심볼 (실측 기준 — research §1-1)

- `PaymentGatewayPort`(DI 토큰 `'PAYMENT_GATEWAY'`, string literal):
  - `charge({ orderId: string, amount: Prisma.Decimal, idempotencyKey: string }): Promise<{ success: boolean, pgTransactionId?: string, failureReason?: string }>` — (GAP-021-02) auth token optional 확장 가능성 있음, 단언은 `objectContaining` 권장.
  - `refund({ paymentId: string, amount: Prisma.Decimal, idempotencyKey: string, pgTransactionId?: string }): Promise<{ success: boolean, pgRefundId?: string }>` — `pgTransactionId` T003 신규 optional. **refund 호출 인자 단언은 `objectContaining`**(엄격 매칭 금지 — 기존 SC-040/041 회귀 방지).
- `FileStoragePort`(DI 토큰 `'FILE_STORAGE'`):
  - `getPresignedUploadUrl(key: string, contentType: string): Promise<{ uploadUrl: string, publicUrl: string }>`
  - `getPublicUrl(key: string): string`
- `PaymentService.pay(userId, orderId, idempotencyKey)` / `refund(paymentId, idempotencyKey)` — **불변**(ADR-008). 실패분기: `chargeResult.success===false` → `createPayment({status:'failed'})` + **outbox 미기록**.
- 결제 진입점 `POST /payments`(JwtAuthGuard, Idempotency-Key 헤더 UUID v4). 환불은 `OrderService.cancel` 내부 자동경로(`payment.service.ts` refund → `refund:{orderId}` 키). **user-facing 환불 엔드포인트 없음**.
- 상수: `ALLOWED_CONTENT_TYPES=['image/jpeg','image/png','image/webp','image/gif']`·`MAX_FILE_SIZE_BYTES=10*1024*1024`(file.constants.ts).

### SC 매핑 표

| SC-ID | 수용 기준 | Happy | Edge | Error | 테스트 파일 경로 | 환경/비고 |
|---|---|---|---|---|---|---|
| SC-001 | sandbox 신용카드 동기 승인→completed | test_when_card_charge_then_completed | — | — | `test/payments.e2e-spec.ts`(또는 신규 inicis e2e) | `[env:e2e-docker]` 옵션 A. 이니시스 sandbox·결제수단 코드 [TO-VERIFY] |
| SC-002 | sandbox 실시간 계좌이체 승인 | test_when_transfer_charge_then_approved | — | — | 동상 | `[env:e2e-docker]` 옵션 A |
| SC-003 | sandbox 간편결제 승인 | test_when_easypay_charge_then_approved | — | — | 동상 | `[env:e2e-docker]` 옵션 A |
| SC-004 | 전액 환불→refunded | test_when_full_refund_then_refunded | — | — | 동상 | `[env:e2e-docker]` 옵션 A |
| SC-005 | 부분 환불(요청액만) | — | test_when_partial_refund_then_partial_amount | — | `src/modules/payment/inicis-payment-gateway.spec.ts`(게이트웨이 integration, ADR-004) | `[env:integration]`. refund 에 부분 amount+pgTransactionId 전달 검증 |
| SC-006 | charge/refund 페이로드 멱등키 포함(정적) | test_when_inspect_gateway_source_then_idempotency_key_in_payload | — | — | `test/static/inicis-idempotency.spec.ts`(신규) | `[env:static]` 소스 텍스트 검사 |
| SC-007 | PG 실패→failed + 동일 멱등키 재요청 중복방지 | — | — | test_when_pg_fails_then_failed_and_idem_retry_no_dup | `src/modules/payment/payment.service.spec.ts`(확장) 또는 `test/*.e2e` | `[env:integration]`. charge mock 실패 주입 + 동일 key 2회 → 2차는 findByIdempotencyKey 로 기존 결과(중복 charge 0) |
| SC-008 | env 전환만으로 sandbox↔운영 교체(정적) | test_when_inspect_factory_then_env_switch_no_code_change | — | — | `test/static/provider-env-switch.spec.ts`(신규) | `[env:static]`. useFactory·env 참조·default stub 구조 검증 |
| SC-009 | 환불 관리자 개입 없이 자동 처리 | test_when_cancel_order_then_auto_refund_no_admin | — | — | `test/orders.e2e-spec.ts`(확장) 또는 `src/modules/order/order.service.spec.ts` | `[env:integration]`. OrderService.cancel→PaymentService.refund 자동경로 |
| SC-010 | presigned PUT 실 R2 업로드 2xx | test_when_put_presigned_then_2xx | — | — | `test/r2-file.e2e-spec.ts`(신규) | `[env:e2e-docker]` 옵션 A. 실 R2 크레덴셜 |
| SC-011 | public URL(r2.dev) GET 접근 | test_when_get_public_url_then_content | — | — | 동상 | `[env:e2e-docker]` 옵션 A |
| SC-012 | allowlist 외 MIME/10MiB 초과 400(회귀) | — | — | test_when_invalid_type_or_oversize_then_400 | `src/modules/file/file.service.spec.ts`(기존 회귀 확인) | `[env:unit]`. FileService 계층 불변 — 기존 테스트로 커버 |
| SC-013 | 결제 API 100회 순차 P95 ≤2000ms | — | test_when_100_payments_then_p95_under_2000 | — | `test/payments.e2e-spec.ts`(기존 SC-046 패턴) | `[env:e2e-docker]` Should. 외부지연 ASM-004 구분(Performance Agent) |
| SC-014 | outbox 미기록 상태변경 경로 부재(정적/단위) | — | — | test_when_inspect_then_no_outbox_less_state_change | `src/modules/payment/payment.service.spec.ts` 또는 `test/static/*` | `[env:unit]`. 성공만 outbox, 실패는 outbox 대상 제외(FR-004) |
| SC-015 | 신규 결제/환불 코드 Decimal 전용(정적) | test_when_inspect_source_then_decimal_only | — | — | `test/static/schema-decimal.spec.ts`(확장) 또는 신규 `test/static/inicis-decimal.spec.ts` | `[env:static]`. amount 는 Prisma.Decimal — float/number 리터럴 금지 |
| SC-016 | 로그에 자격증명·카드정보 미노출 | — | — | test_when_charge_logged_then_no_credentials | `test/pino-redact.e2e-spec.ts`(확장) 또는 `src/modules/payment/inicis-payment-gateway.spec.ts` | `[env:integration]`. MID·signKey·apiKey·카드필드 마스킹/부재 |

> **UI 상태주입(PATCH-013-01)·플랫폼 채널(PROC-014-03)**: 본 spec 은 backend 전용 — UI 위젯 테스트 없음(해당 없음).
> **트랜잭션 인지 심볼(PROC-013-01)**: `payment.service.pay/refund` 는 `runInTransaction` 콜백 내에서 repository 사용(기존). 본 spec 은 이 경로 불변 → 신규 tx-aware 미스매치 리스크 없음.
> **옵션 A 정합**: e2e-docker/일부 integration(SC-001~005·010·011·013)은 실 크레덴셜 필요 → main 이 `ExternalAuthoring`/옵션 A 로 사용자 실행·결과 전달. 크레덴셜 부재 시 skip guard(기존 `isIntegrationEnvReady()` 패턴).

---

## 태스크 입도 가이드

- 1 태스크 ≈ 구현 파일 1~3개 + 대응 테스트. T002(이니시스 구현)는 파일 1개지만 charge/refund/서명/마스킹 복합 → 단일 유지(응집).
- Track A(T001~T003)·Track B(T004~T005)는 상호 독립 → [P] 병렬.
- T003(refund 시그니처)는 호출 측 마이그레이션 포함 — 영향 범위 좁음(1개소)이라 단일 태스크 유지.

## 구현 완료 기준

- [x] 모든 태스크(T001~T008, 레이어 B·C) 체크박스 완료 (D 레이어는 5a 소유)
- [x] `[TypeScript]` `pnpm --filter backend typecheck`(tsc --noEmit) 0 error
- [x] `[TypeScript]` `pnpm --filter backend test`(unit) 전체 PASS — 기존 payment/file 스위트 회귀 0 (41 suites/409 tests PASS, 5a 신규 inicis-payment-gateway.spec.ts·payment.service.spec.ts SC-007 포함)
- [x] 정적 스위트(`test/static`) 전체 PASS — **package-no-aws 가드 정밀화 반영**(T007) (20 suites/135 tests PASS, 5a 신규 inicis-decimal·inicis-idempotency·payment-outbox-invariant·provider-env-switch 포함)
- [x] 앱 부팅 1회 성공 — `@aws-sdk` 런타임 import·이니시스 fetch/crypto 검증(typecheck 미포착분, research §6). 임시 e2e 스펙으로 5개 시나리오(기본 stub 부팅·inicis 필수env 부재 시 에러·inicis 필수env 충족 시 부팅·r2 필수env 부재 시 에러·r2 필수env 충족 시 부팅) 확인 후 삭제
- [x] PAYMENT_PROVIDER/FILE_STORAGE 미설정 시 stub 부팅(e2e 회귀 방지) 확인 — 기존 `payments.e2e-spec.ts`(override 없이 AppModule 부팅) PASS로 재확인
- [x] Breaking change 잔여 참조: refund 시그니처 확장 후 `gateway.refund(` 전 호출부 정합 확인(grep) — `payment.service.ts` L116 유일 호출부, 정합 완료
- [x] `git status` 의도치 않은 파일 없음
- [x] 실 크레덴셜 필요 SC(e2e-docker/일부 integration)는 옵션 A defer 명시(거짓 green 금지 — 019/020 원칙 계승) — SC-001~005·010·011·013 은 T011(5a 소유)에서 옵션 A 처리, 본 Development 범위(T001~T008)는 실 크레덴셜 불요
</content>
