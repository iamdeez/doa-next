---
작성: Planning Agent
버전: v1.1
최종 수정: 2026-07-06 [시각 미확인 — Bash 미제공, date 실행 불가]
상태: 확정
---

# Plan: 021-payment-file-integration
> Branch: 021-payment-file-integration | Date: 2026-07-06 | Spec: [spec.md](../spec/spec.md)

## 목차

- [사전 검증 (Constitution Gates)](#사전-검증-constitution-gates)
- [기술 컨텍스트](#기술-컨텍스트)
- [외부 라이브러리·API 동작 검증](#외부-라이브러리api-동작-검증)
- [핵심 설계](#핵심-설계)
  - [Track A — IniisisPaymentGateway](#track-a--iniisispaymentgateway)
  - [Track B — R2FileStorage](#track-b--r2filestorage)
- [결정 기록 (ADRs)](#결정-기록-adrs)
- [인터페이스 계약](#인터페이스-계약)
- [데이터 모델](#데이터-모델)
- [위험 완화 설계 (PATCH-A06)](#위험-완화-설계-patch-a06)
- [배포 환경 영향 (PROC-009)](#배포-환경-영향-proc-009)
- [테스트 전략](#테스트-전략)
- [기타 고려사항](#기타-고려사항)

---

## 사전 검증 (Constitution Gates)

> constitution.md(P-001~P-007) 존재 → 해당 조항을 Gates 로 사용. 각 조항 수치·조건이 무조건 우선.

- [x] **P-001 모듈 경계 원칙**: [Pass 기준: payment/file 모듈은 자기 스키마(payments·files)만 접근, 타 도메인은 DI/이벤트]
  → PASS. 본 spec 은 `payment`·`file` 두 모듈 **내부 Port 구현체만** 교체. IniisisPaymentGateway 는 payments 스키마 외 미접근(charge/refund 는 외부 HTTP 호출·결과 반환만, DB 기록은 기존 PaymentService/Repository 담당). R2FileStorage 는 DB 미접근(순수 스토리지 어댑터). 신규 cross-schema 쿼리 0건.
- [x] **P-002 AWS 의존 금지 원칙**: [Pass 기준: `@aws-sdk/*` 신규 추가 금지 — 단 S3 호환 엔드포인트용 `@aws-sdk/client-s3` 는 L32 에서 명시 허용]
  → PASS. R2FileStorage 는 `@aws-sdk/client-s3`(S3 호환 엔드포인트, R2 기본) 사용 — **P-002 L32 가 명시 허용**하는 유일한 예외 경로. AWS 전용 서비스(Cognito·SQS·DynamoDB 등) 신규 의존 0건. 이니시스 연동은 native `fetch`(Node 20 내장, 소셜 로그인 provider 와 동일 패턴) 사용 — 신규 SDK 불요.
- [x] **P-003 단일 DB 원칙**: [Pass 기준: 단일 PostgreSQL 외 신규 외부 데이터 저장소 없음]
  → PASS. R2 는 **오브젝트 스토리지**(관계형 데이터·캐시·큐·세션 대체 아님)로, P-003 이 통제하는 "관계형/캐시/큐 저장소" 범주 밖. spec.md·constitution(P-002 L32·P-004 L54)이 R2 를 표준 파일 스토리지로 이미 승인. 신규 DB/Redis/브로커 0건.
- [x] **P-004 클라우드 중립 원칙**: [Pass 기준: Fly.io 전용 API 에 비즈니스 로직 미결합]
  → PASS. R2 는 S3 호환 인터페이스로 접근(다른 S3 호환 스토리지로 이전 가능). 이니시스는 표준 HTTPS REST. Fly 전용 SDK 미도입(크레덴셜은 Fly secrets = 환경변수 표준 주입, 배포 레이어 한정).
- [x] **P-005 결제·정산 정합성 원칙**: [Pass 기준: 금전 상태 변경 = 단일 트랜잭션 + outbox + 멱등성 키 + Decimal]
  → PASS(구조 승계). 기존 PaymentService.pay/refund 의 `runInTransaction` + outbox + idempotencyKey + Prisma.Decimal 흐름을 **그대로 유지**. IniisisPaymentGateway 는 charge/refund 호출을 트랜잭션 **외부**(PG 호출은 롤백 불가)에서 수행하는 기존 배치를 승계. 금전 신규 연산 없음(amount 는 order.totalAmount-discountAmount 로 기존 산출). NFR-003(Decimal) 승계.
- [x] **P-006 테스트 원칙**: [Pass 기준: SC-XXX 없는 FR-XXX 0건]
  → **PASS**. spec.md v1.2 매트릭스상 FR-001~009·NFR-001~004 전건 SC 대응(누락 0). **GAP-021-01 해소됨** — spec.md v1.2 가 SC-007/FR-004/NFR-002/SC-014 를 실제 아키텍처(payment_outbox = 성공 이벤트 relay 전용)에 정합하도록 재작성(옵션 1: 실패 시 payment=failed + 멱등키 재요청 중복방지, outbox 실패기록 없음). ASM-009 도 정정 반영(사용자 승인 옵션 1). 전 SC satisfiable.
- [x] **P-007 스펙 범위 원칙**: [Pass 기준: spec.md 범위 외 변경 파일 0건]
  → PASS(설계 의도). 변경 표면 = payment/file Port 구현체 신규 + DI 바인딩 교체 + env/config + 신규 의존성. user-facing 부분환불 엔드포인트 신설·confirm R2 HEAD 교차검증 등은 **범위 외**로 명시 제외(ADR-004·spec 범위 외 절). 리팩토링 0.

### 예외 사항

없음. (R2 `@aws-sdk/client-s3` 는 P-002 L32 명시 허용이므로 예외 기재 대상 아님.)

> **Gates 종합 판정**: P-001~P-007 **전건 PASS**. GAP-021-01(SC-007 모순) 은 spec.md v1.2 재작성으로 해소됨(옵션 1 확정). 예외 사항 0. gate: PASS.

---

## 기술 컨텍스트

- **언어 / 런타임**: TypeScript 5.4 / Node.js 20 (CommonJS), NestJS 11
- **주요 의존성(기존)**: `@prisma/client` 6.19(Decimal), `@nestjs/config` 4(env), native `fetch`(Node 20 내장 — 소셜 로그인 provider 가 이미 사용), `nestjs-pino`(redact)
- **주요 의존성(신규 — 본 spec 도입)**:
  - `@aws-sdk/client-s3` — R2 S3 호환 클라이언트. presigned URL 발급은 `@aws-sdk/s3-request-presigner`(동반 패키지) 필요 가능성 `[TO-VERIFY: Design 이 presigned PUT URL 생성 API 확정 — getSignedUrl(s3-request-presigner) vs createPresignedPost]`. **P-002 L32 명시 허용**. infra.md §6 "의존성 구조(확정)"에 이미 등재(설치는 미완).
  - 이니시스 결제: **신규 전용 SDK 미도입** — native `fetch` 로 HTTPS REST 직접 호출(P-004 클라우드 중립·기존 소셜 provider 패턴 일관). 서명(hash) 생성은 Node `crypto` 내장 사용 `[TO-VERIFY: 서명 알고리즘 — SHA-256/SHA-512 등 이니시스 공식 규격]`.
- **테스트 프레임워크**: Jest 29 + ts-jest(unit `*.spec.ts` rootDir=src) · supertest(e2e `test/jest-e2e.json`) · 정적 검증 스위트(`test/static/*.spec.ts`)
- **환경변수 주입**: `@nestjs/config`(isGlobal, `.env`/`.env.local`) + Fly secrets(운영). 신규 env 는 `.env.example` 에 문서화(ASM-008/013: 실제 secret 등록은 사용자 책임).

### 신규 환경변수 (설계값 — 정확한 이니시스 키명은 [TO-VERIFY])

| 변수 | 용도 | 비고 |
|---|---|---|
| `PAYMENT_PROVIDER` | 결제 게이트웨이 선택(예: `inicis`\|`stub`) | FR-005 전환·테스트 격리. 미설정 시 안전 기본값(stub 또는 inicis) — ADR-005 |
| `INICIS_MID` | 이니시스 상점ID(공용 테스트 상점ID → 실 MID) | `[TO-VERIFY]` 정확한 공용 테스트 상점ID 값·키명 |
| `INICIS_SIGN_KEY` | 서명(hash) 생성 키 | `[TO-VERIFY]` 키명·발급 위치(이니시스 개발자센터) |
| `INICIS_API_BASE_URL` | sandbox/prod 엔드포인트 | FR-005 전환 축. sandbox↔prod URL `[TO-VERIFY]` |
| `INICIS_API_KEY` / `INICIS_API_IV` | 환불(취소) API 인증·암호화 | `[TO-VERIFY]` 취소 API 규격이 별도 키 요구하는지 |
| `R2_ACCOUNT_ID` | Cloudflare 계정 ID(엔드포인트 구성) | endpoint = `https://{account}.r2.cloudflarestorage.com` |
| `R2_ACCESS_KEY_ID` / `R2_SECRET_ACCESS_KEY` | R2 API 토큰(S3 호환 자격증명) | ASM-013 사용자 발급 |
| `R2_BUCKET` | 버킷명 | |
| `R2_PUBLIC_BASE_URL` | 공개 URL 베이스(r2.dev 서브도메인) | FR-008. 예: `https://pub-xxxx.r2.dev` |

> 이니시스 관련 env 키명·값은 전부 `[TO-VERIFY]` — Design/Development 가 이니시스 공식 개발자센터 문서로 확정한다. 본 표는 **주입 지점의 구조**만 확정(구현체가 config 로 이 값들을 읽어 charge/refund 페이로드 구성). 추측 리터럴 미기재(constitution 정확성 원칙·PATCH-002).

---

## 외부 라이브러리·API 동작 검증

> 본 세션은 **WebFetch 미제공**으로 이니시스 공식 문서 온라인 확인이 불가하다. venv/공식문서 검증이 필요한 항목을 아래에 명시하고 [TO-VERIFY]/[인정 한계]로 Design 에 위임한다(team-lead 승인 범위 — "확인 불가 시 [TO-VERIFY] 마커로 Design/Development 위임").

| 검증 항목 | 상태 | 위임 대상 | 비고 |
|---|---|---|---|
| 이니시스 표준결제 승인 API 요청/응답 파라미터(주문번호·금액·결제수단코드·승인번호·거래ID·실패사유) | `[TO-VERIFY]` | Design(research.md) | 이니시스 개발자센터 공식 규격. 추측 금지 |
| 이니시스 서명(hash) 생성 방식(대상 필드·알고리즘·순서) | `[TO-VERIFY]` | Design | crypto 내장으로 구현하되 규격 확정 필요 |
| 이니시스 취소(환불) API 규격 — 전액/부분 파라미터, 부분환불 지원 방식 | `[TO-VERIFY]` | Design | FR-002 부분환불의 실제 API 파라미터 |
| 공용 테스트 상점ID(MID)·테스트 자격증명 값 | `[TO-VERIFY]` | Design/사용자 | sandbox 진입 필수. 공식 자료 기준 |
| **[인정 한계 — ASM-006]** 결제창 방식(표준/호스팅 vs API 직접): 표준(호스팅) 결제창 가정 시 카드번호 비수집(PCI-DSS 카드데이터 보관 해당없음). 실제 채택 방식이 API 직접 카드입력이면 재검토 | `[TO-VERIFY]` | Design(ASM-006 재확인) | 결제창 방식이 **동기 승인 흐름 설계 자체**를 좌우(리다이렉트형이면 승인결과 수신 경로 상이). Design 우선 확인 필요 |
| `@aws-sdk/client-s3` presigned PUT URL 생성 API(`getSignedUrl` + `PutObjectCommand`) | `[TO-VERIFY]` | Design/Development | R2 는 S3 호환 — 표준 presigner 동작. 앱 부팅·실 R2 PUT 1회로 런타임 검증(typecheck 로 미포착) |

> **[인정 한계 — 결제창 방식 파급]**: ASM-006(표준 결제창 가정)이 부정될 경우(API 직접 카드입력·리다이렉트 승인창) 동기 charge() 단일 호출 모델이 성립하지 않을 수 있다. 이 한계를 흡수할 안전망: (1) Port 시그니처는 charge(orderId,amount,key)→ChargeResult 로 고정하고 이니시스 연동 세부(리다이렉트 URL 반환 등)를 구현체 내부로 캡슐화, (2) 결제창 방식이 리다이렉트형으로 확정되면 status: BLOCKED 로 Spec/Planning 복귀(FR-001 "동기 승인" 전제 재검토). Design 이 ASM-006 을 **최우선 확인**한다.

---

## 핵심 설계

> 작성 깊이: Design Agent 가 추가 설계 판단 없이 tasks.md 를 분해할 수 있는 수준. 변경 대상 모듈·인터페이스 시그니처·핵심 분기를 포함.

### 변경 표면 요약

| 파일 | 변경 유형 | 내용 |
|---|---|---|
| `apps/backend/src/modules/payment/inicis-payment-gateway.ts` | 신규 | `IniisisPaymentGateway implements PaymentGatewayPort`. charge/refund 를 이니시스 REST 호출로 매핑 |
| `apps/backend/src/modules/payment/inicis.config.ts`(또는 config.module load) | 신규 | 이니시스 env 매핑(MID·signKey·baseUrl 등). `@nestjs/config` registerAs |
| `apps/backend/src/modules/payment/payment.module.ts` | 수정 | `PAYMENT_GATEWAY` provider 를 `PAYMENT_PROVIDER` env 기반 팩토리로(useFactory) — inicis\|stub 선택(ADR-005) |
| `apps/backend/src/modules/file/r2-file-storage.ts` | 신규 | `R2FileStorage implements FileStoragePort`. `@aws-sdk/client-s3` presigned PUT + r2.dev public URL |
| `apps/backend/src/modules/file/r2.config.ts`(또는 config load) | 신규 | R2 env 매핑(account·keys·bucket·publicBaseUrl) |
| `apps/backend/src/modules/file/file.module.ts` | 수정 | `FILE_STORAGE` provider 를 env 기반 팩토리로 — r2\|stub 선택 |
| `apps/backend/package.json` | 수정 | `@aws-sdk/client-s3`(+ `@aws-sdk/s3-request-presigner` [TO-VERIFY]) 추가 |
| `apps/backend/.env.example` | 수정 | 신규 env 문서화(위 표) |
| `apps/backend/test/**` · `test/static/**` | 신규 | SC-001~016 테스트(Test Agent 5a 소유 — 본 plan 은 전략만) |

> **StubPaymentGateway·StubFileStorage 는 삭제하지 않는다** — env 팩토리(ADR-005)의 fallback/테스트 경로로 유지. 기존 unit 테스트가 stub 에 의존(회귀 방지).

### Track A — IniisisPaymentGateway

- **클래스**: `@Injectable() class IniisisPaymentGateway implements PaymentGatewayPort`
- **의존 주입**: `ConfigService`(이니시스 env). HTTP 는 native `fetch`.
- **`charge({ orderId, amount, idempotencyKey }): Promise<ChargeResult>`**:
  - 이니시스 승인 API 로 결제 요청 페이로드 구성 → 서명(hash) 포함(FR-003: `idempotencyKey` 를 이니시스 주문번호 또는 별도 필드로 페이로드에 포함 `[TO-VERIFY: 이니시스 멱등/중복방지 필드]`) → HTTPS POST.
  - 동기 응답(FR-001): 승인 성공 → `{ success: true, pgTransactionId: <이니시스 거래ID> }`. 거절/실패 → `{ success: false, failureReason: <사유> }`.
  - 결제수단(신용카드·실시간 계좌이체·간편결제)은 이니시스 결제수단 코드로 구분 `[TO-VERIFY: 결제수단 코드값]`. **가상계좌·비동기 완료 흐름 미구현**(범위 외).
  - 타임아웃/5xx: [위험 완화 설계](#위험-완화-설계-patch-a06) 참조 — 현재 아키텍처상 `{success:false}` 반환 또는 예외. **SC-007 은 [NEEDS CLARIFICATION]**.
- **`refund({ paymentId, amount, idempotencyKey }): Promise<RefundResult>`**:
  - 이니시스 취소(환불) API 호출. `amount` 를 취소금액으로 전달 → **부분환불 지원**(FR-002). 전액이면 amount=원결제액.
  - 성공 → `{ success: true, pgRefundId: <취소 거래ID> }`. 실패 → `{ success: false }`.
  - 취소 대상 식별: 원 거래ID 필요 → `paymentId` 로 PaymentService 가 조회한 `pgTransactionId` 를 어떻게 구현체에 전달할지 `[TO-VERIFY/설계결정: ADR-002]`.
- **로깅(NFR-004/SC-016)**: 요청/응답 로그에서 MID·signKey·API 키·카드 관련 정보를 마스킹/미출력. pino redact 또는 구현체 내 명시적 마스킹(018/019 `SecurityAuditLogger`·`maskEmail` 패턴 참조). 자격증명은 로그 대상에서 제외.

### Track B — R2FileStorage

- **클래스**: `@Injectable() class R2FileStorage implements FileStoragePort`
- **의존 주입**: `ConfigService`(R2 env). 내부에 `S3Client`(endpoint=`https://{R2_ACCOUNT_ID}.r2.cloudflarestorage.com`, region=`auto`, credentials=R2 키).
- **`getPresignedUploadUrl(key, contentType): Promise<PresignedUpload>`**:
  - `PutObjectCommand({ Bucket, Key: key, ContentType: contentType })` + `getSignedUrl(s3, cmd, { expiresIn })` → `uploadUrl`(presigned PUT). `[TO-VERIFY: s3-request-presigner getSignedUrl vs createPresignedPost — PUT 방식 확정]`
  - `publicUrl = getPublicUrl(key)`.
  - **contentType allowlist 검증은 FileService.presign 에 이미 존재**(011) — 구현체는 검증을 중복하지 않고 그대로 위임(FR-009 회귀 방지: allowlist·10MiB 로직은 FileService 계층 불변).
- **`getPublicUrl(key): string`**: `${R2_PUBLIC_BASE_URL}/${key}`(r2.dev 서브도메인, FR-008). 커스텀 도메인 미사용(범위 외).
- **presigned URL 만료(expiresIn)**: 설계값 `[설계결정: ADR-006 — 기본 만료시간, 예 600초]`. ASM-010(업로드 실패 시 클라이언트 재시도 책임) 승계.

---

## 결정 기록 (ADRs)

| ADR-ID | 결정 항목 | 채택안 | 대안 (검토·미채택) | 근거 (spec FR/NFR) | 영향 범위 |
|---|---|---|---|---|---|
| ADR-001 | R2 클라이언트 라이브러리 | `@aws-sdk/client-s3`(+ presigner) | 범용 HTTP + 수동 SigV4 서명 / R2 전용 클라이언트 | FR-007/008, NFR(간결·표준). **P-002 L32 명시 허용** — 예외 아님 | file 모듈·package.json·infra §6 |
| ADR-002 | 이니시스 취소 대상 거래ID 전달 | PaymentService 가 조회한 `pgTransactionId` 를 refund 파라미터에 추가 전달 (Port refund 시그니처 확장 최소) `[TO-VERIFY 이니시스 취소 API 필수 파라미터]` | 구현체가 payments 스키마 직접 조회(P-001 위반) / paymentId 를 이니시스가 이해(불가) | FR-002 | payment-gateway.port(refund 파라미터)·payment.service·구현체 |
| ADR-003 | 이니시스 HTTP 클라이언트 | native `fetch`(Node 20) + `crypto` 서명 | axios/got 신규 의존 / 이니시스 전용 SDK | P-004 클라우드 중립·기존 소셜 provider 일관 | payment 구현체 |
| ADR-004 | 부분환불(SC-005) 노출 범위 | Port 구현체 레벨만 부분금액 전달 지원. **user-facing 부분환불 엔드포인트·OrderService 부분환불 경로 신설은 범위 외** | 컨트롤러 refund 엔드포인트 + 서비스 부분금액 파라미터 신설 | FR-002(구현체 전달 능력) + P-007 스펙범위(신규 엔드포인트 spec FR 미포함) | payment 구현체·SC-005 테스트 방식(게이트웨이 integration) |
| ADR-005 | sandbox↔prod·stub↔real 전환 | `PAYMENT_PROVIDER`/`FILE_STORAGE` env + `useFactory` DI 팩토리 (코드 변경 없이 env 로 구현체 교체) | 빌드타임 분기 / 별도 모듈 | FR-005·SC-008 | payment.module·file.module·config |
| ADR-006 | R2 presigned PUT URL 만료시간 | 상수 기본값(예 600초) — 코드 상수화 `[설계결정 확정 필요]` | 무제한/env 노출 | FR-007·ASM-010 | r2-file-storage |
| ADR-007 | 자격증명 로깅 보안 | 구현체가 요청/응답 로깅 시 MID·키·카드정보 마스킹 + pino redact 확장 검토 | 전체 로그 비활성 / 미조치 | NFR-004·SC-016 | payment 구현체·app.module redact |
| ADR-008 | **[해소 — GAP-021-01, 옵션 1 확정]** PG 실패(타임아웃/5xx) 처리 | charge 실패 시 payment=`failed` 기록(기존 payment.service.pay status=failed 분기 유지) + 동일 멱등성 키 재요청 시 findByIdempotencyKey 로 기존 결과 반환(중복 charge 방지). **payment_outbox 실패기록·신규 서버측 재시도 없음** | (a) charge 실패 시 payment_outbox 재시도 레코드 신규 기록 → ASM-009·P-007 위반(미채택) | FR-004·SC-007·NFR-002·ASM-009(전부 v1.2 정정) | payment.service.pay 실패분기(불변)·SC-007 통합테스트 |
| ADR-009 | 환불 자동승인·감사로그(FR-006) | 환불은 기존 OrderService.cancel→PaymentService.refund 자동 경로 유지(관리자 개입 없음, SC-009). 관리자 개입 예외 케이스 발생 시에만 기존 `admin_audit_logs`(013/018) 재사용 | 신규 환불 승인 워크플로우/감사 종류 | FR-006·SC-009·ASM-012 | payment.service(불변)·admin(재사용) |

### SC-007 결정 (ADR-008 상세 — GAP-021-01 RESOLVED)

> **경위**: 초안 단계에서 SC-007/FR-004/ASM-009 가 실제 `payment_outbox` 아키텍처와 상충함을 발견(GAP-021-01) → 사용자가 **옵션 1** 을 승인 → spec.md v1.2 로 SC-007·FR-004·NFR-002·SC-014 재작성 + ASM-009 정정.
>
> **실제 아키텍처(코드 확인)**: `payment_outbox` 는 charge **성공** 시 `payment.completed` 이벤트를 기록하고 `OutboxRelay`(5초 폴링)가 `OrderService.markConfirmed` 를 호출하는 **트랜잭셔널 이벤트 relay** 다(`payment.service.ts` L61-81 · `outbox-relay.ts` L44-57). charge **실패** 시(`status = failed` 분기) payment 레코드만 `failed` 로 기록되고 outbox 레코드는 생성되지 않으며 charge 재시도 메커니즘도 없다. 멱등성 키는 클라이언트 재요청 시 중복 charge 를 방지한다(`findByIdempotencyKey` → 기존 결과 반환, `payment.service.ts` L47-50).
>
> **확정(옵션 1)**: PG 타임아웃/5xx 시 결제가 `failed` 로 기록되고, 동일 멱등성 키 재요청 시 중복 charge 가 방지된다(기존 멱등 계약, P-005). `payment_outbox` 는 charge **성공 후** `payment.completed` 이벤트 relay(OutboxRelay 폴링 재시도)에만 적용된다. **신규 코드·신규 재시도 메커니즘 0**(기존 payment.service.pay 실패 분기·멱등 조회 로직 불변). ASM-009 준수. spec.md v1.2 반영 완료.

---

## 인터페이스 계약

- **PaymentGatewayPort**: charge 시그니처 **무변경**. refund 는 이니시스 취소 대상 거래ID 전달을 위해 `pgTransactionId` 파라미터 추가 가능성(ADR-002) — 이 경우 StubPaymentGateway·PaymentService 호출부도 동반 갱신(하위 호환: 기존 호출부는 payments 스키마에서 pgTransactionId 조회하여 전달). 추가 파라미터는 optional 로 두어 stub 회귀 방지 검토.
- **FileStoragePort**: `getPresignedUploadUrl`/`getPublicUrl` 시그니처 **무변경**. R2FileStorage 는 동일 계약 구현 → FileService·FileController 무변경(FR-009: allowlist·10MiB 검증은 FileService 계층에 그대로 존재).
- **DI 바인딩**: `PAYMENT_GATEWAY`·`FILE_STORAGE` 토큰의 provider 를 `useClass`(고정) → `useFactory`(env 기반)로 전환(ADR-005). 기존 토큰명·주입 지점(PaymentService·FileService 생성자) 불변 → 소비 측 런타임 에러 없음(P-002 호환성).

> **(PATCH-001/PROC-003) 권한·상태 전이 엔드포인트 인가 3축**: 본 spec 은 신규 엔드포인트를 추가하지 않는다(Port 구현체 교체). 기존 결제/환불 진입점의 인가는 불변:
>
> | 엔드포인트 | (a) 호출자 신원 | (b) 자원 소유권 | (c) 역할 | 미검증 축 |
> |---|---|---|---|---|
> | `POST /payments` | JwtAuthGuard | order.userId === userId(PaymentService.pay) | — | 없음(기존 검증 승계) |
> | 환불(OrderService.cancel 내부) | JwtAuthGuard(취소 요청자) | order.userId === userId(cancel) | — | 없음. 자동 경로(SC-009), user-facing 환불 엔드포인트 없음 |
>
> Security Agent(활성) 가 실 PG 자격증명 취급·로깅 노출(SC-016)·서명 위·변조 방어를 최종 감사한다.

---

## 데이터 모델

**변경 없음.** `payments.payments`·`payments.refunds`·`payments.payment_outbox`·`files.files` 스키마 및 컬럼 전부 기존 유지. 본 spec 은 외부 연동 구현체만 교체하며 신규 테이블·컬럼·마이그레이션이 없다. → **Database Design Agent 비활성**(selection-phases.md).

- `Payment.pgTransactionId`·`Refund.pgRefundId` 는 기존 nullable String 컬럼으로 이니시스 실 거래ID 를 그대로 저장(stub 의 `stub-tx-*` 대체).

---

## 위험 완화 설계 (PATCH-A06)

> assumptions.md 의 "확인 필요 여부: 예" 항목(ASM-003·006·013) 및 GAP-021-01 의 부정검증 대비 안전망.

| 위험(가정) | 부정검증 시나리오 | 안전망 |
|---|---|---|
| ASM-006(표준 결제창 가정) | 실제가 API 직접 카드입력/리다이렉트 승인창 → 동기 charge 단일호출 모델 붕괴 | Port 시그니처 고정 + 이니시스 세부 캡슐화. 리다이렉트형 확정 시 Design 이 status: BLOCKED → Spec/Planning 복귀(FR-001 동기 전제 재검토). Design 최우선 확인 |
| ASM-013(R2 크레덴셜 사용자 준비) | Development 착수 시 크레덴셜 미준비 | env 팩토리(ADR-005)가 `FILE_STORAGE=stub` fallback 허용 → 크레덴셜 부재 시 앱 기동은 유지, 실 검증 SC(SC-010/011)만 defer |
| GAP-021-01(SC-007 실패기록) — **RESOLVED** | (해소됨) spec.md v1.2 옵션 1 확정 — 실패 시 payment=failed + 멱등키 재요청, outbox 실패기록·신규 재시도 없음 | Design 은 기존 payment.service.pay 실패분기·멱등 조회 로직을 불변 유지. 신규 재시도 로직 구현 금지 |
| NFR-001(P95 ≤2,000ms) — 이니시스 외부 지연 통제불가(ASM-004) | sandbox 응답 지연으로 P95 초과 | SC-013 은 Should 등급. 초과 시 외부 변동요인(ASM-004)으로 인지·기록, 코드 결함 아님. Performance Agent 가 측정·구분 |
| 자격증명 로그 노출(NFR-004) | 구현체 디버그 로그에 MID/키/카드정보 평문 | ADR-007 마스킹 + pino redact. Security Agent 최종 감사(SC-016) |

---

## 배포 환경 영향 (PROC-009)

본 spec 은 **신규 외부 아웃바운드 연동 2종**(이니시스 결제 API·R2 S3 API)을 추가하므로 배포 환경 영향이 있다(infra.md §2 토폴로지에 R2 는 기재됨, 이니시스는 신규).

- **Fly secrets 신규 등록 필요**(ASM-008 사용자 수행): `INICIS_*`·`R2_*`·`PAYMENT_PROVIDER`·`FILE_STORAGE`. Deploy Agent(활성) 가 fly secrets 절차·`.env.example` 정합성·배포 전 체크리스트(infra.md §7) 갱신을 담당.
- **아웃바운드 도달성**: Fly.io → 이니시스 결제 API·`*.r2.cloudflarestorage.com`/`*.r2.dev` HTTPS egress. 방화벽/네트워크 제약은 Deploy Agent 확인.
- **infra.md 갱신 필요 항목**(Docs/Deploy 위임): §3.4 외부 연동에 이니시스 추가, §5 재시도 동작에 이니시스·R2 실연동 반영, §6 의존성에 `@aws-sdk/client-s3` 설치 확정, §7 체크리스트에 INICIS_*/R2_* 추가. 미기재 항목은 gaps.md 연계.
- **cross-check**: Design 의 research.md "배포 환경 영향 추정(PATCH-A10)" 절과 본 절을 대조한다.

---

## 테스트 전략

> 테스트 수준: 단위/통합/E2E. spec.md SC 의 `[env:*]` 태그를 준수. 세 시나리오 유형(Happy/Edge/Error) 커버.
> Test Agent(5a AUTHORING)가 test-cases.md 로 상세화하며, 본 표는 매핑·수준·유형을 확정한다.

| SC | 관련 FR/NFR | 수준 | 유형 | 시나리오 요약 | 입력 | 기대 결과 |
|---|---|---|---|---|---|---|
| SC-001 | FR-001 | E2E `[e2e-docker]` | Happy | 이니시스 sandbox 신용카드 승인 | 유효 주문 + 카드 결제수단 | 동기 승인, payment.status=completed |
| SC-002 | FR-001 | E2E `[e2e-docker]` | Happy | 실시간 계좌이체 승인 | 계좌이체 결제수단 | 동기 승인 응답 |
| SC-003 | FR-001 | E2E `[e2e-docker]` | Happy | 간편결제(카카오페이 등) 승인 | 간편결제 결제수단 | 동기 승인 응답 |
| SC-004 | FR-002 | E2E `[e2e-docker]` | Happy | 전액 환불 | completed 결제 전액 취소 | 승인, status=refunded |
| SC-005 | FR-002 | 통합 `[integration]` | Edge | **부분환불**(게이트웨이 integration — ADR-004: IniisisPaymentGateway.refund 에 부분 amount 직접 전달) | 원결제액 > 취소요청액 | 요청 금액만 환불 처리 |
| SC-006 | FR-003 | 정적 `[static]` | Happy | charge/refund 페이로드에 멱등성 키 포함 | 소스 정적 검사 | idempotencyKey 페이로드 포함 확인 |
| SC-007 | FR-004 | 통합 `[integration]` | Error | PG 타임아웃/5xx → payment=`failed` 기록 + 동일 멱등키 재요청 중복방지(GAP-021-01 옵션1 확정) | PG 실패 응답 mock + 동일 idempotencyKey 2회 요청 | 1차: payment.status=failed(outbox 미기록). 2차 재요청: findByIdempotencyKey 로 기존 결과 반환(중복 charge 0) |
| SC-008 | FR-005 | 정적 `[static]` | Happy | env 전환만으로 sandbox↔운영 자격증명 교체 | config/env 정적 검사 | 코드 변경 없이 전환 구조 확인(useFactory·config) |
| SC-009 | FR-006 | 통합 `[integration]` | Happy | 환불 관리자 승인 없이 자동 처리 | OrderService.cancel 자동 refund | 자동 경로 완료(관리자 개입 0) |
| SC-010 | FR-007 | E2E `[e2e-docker]` | Happy | presigned PUT 로 실 R2 업로드 | presigned URL + 파일 | 2xx 업로드 성공 |
| SC-011 | FR-008 | E2E `[e2e-docker]` | Happy | public URL(r2.dev) GET 접근 | 업로드된 객체 key | 파일 내용 정상 접근 |
| SC-012 | FR-009 | 단위 `[unit]` | Error | allowlist 외 MIME/10MiB 초과 400(회귀) | 비허용 contentType·초과 size | 400 반환(FileService 계층 불변 검증) |
| SC-013 | NFR-001 | E2E `[e2e-docker]` | Edge | 결제 API 100회 순차 P95 ≤2,000ms | 100 순차 결제 | P95 ≤2,000ms(외부지연 ASM-004 인지) |
| SC-014 | NFR-002 | 단위 `[unit]` | Error | outbox 기록 없이 상태만 변경 경로 부재 | 정적/단위 검사 | outbox 미기록 상태변경 경로 0 |
| SC-015 | NFR-003 | 정적 `[static]` | Happy | 신규 결제/환불 코드 Decimal 전용(float/number 리터럴 금지) | 소스 정적 검사 | Prisma.Decimal 만 사용 |
| SC-016 | NFR-004 | 통합 `[integration]` | Error | 로그에 자격증명·카드정보 미노출 | 결제 요청/응답 로그 캡처 | MID·키·카드정보 마스킹/부재 |

> **(PATCH-A08) 통합/E2E defer 옵션**: SC-001~005·010·011·013 은 `[env:e2e-docker]`/`[integration]` 으로 실 이니시스 sandbox·실 R2 버킷 자격증명이 필요하다. 파이프라인 내 자동 실행 불가 항목은 **옵션 A**(main 이 환경구성 절차 제시 → 사용자 실행 → 결과 전달 → Test Agent 검증)를 권고한다(spec.md 범위 = "sandbox 실 API 호출 검증까지"·ASM-013). 사용자 선택 미수집 시 main 이 AWAITING_USER 로 위임.
>
> **(PROC-010) 옵션 관련 자가 점검**:
> 1. **운영 환경 의존성**: Y — SC-001~005/010/011 은 이니시스 sandbox·R2 실 버킷(외부 시스템 동작)에 의존. mock 으로 대체 시 "실 API 호출 검증" 목표(ASM-001) 미달.
> 2. **mock 시뮬레이션 불가 시나리오**: 이니시스 실 승인/취소 응답 포맷·서명 검증·R2 실 PUT/GET 은 mock 재현이 목표를 훼손. → 옵션 A/B 권장(옵션 C 부적합).
> 3. **권장**: 옵션 A. 단위(SC-012)·정적(SC-006/008/015)·통합 일부(SC-007[미확정]/009/014/016)는 파이프라인 내 실행 가능.
>
> **(PROC-014) 사후 운영 검증 피드백 사이클**: spec.md "범위 외 §사후 운영 검증 피드백 사이클(PROC-014)"에 명시됨(실 MID 발급 후 첫 실결제 3종·R2 대량 동시 업로드·가상계좌 재검토). 결함 발견 시 spec.md 배경 입력 → main "spec 수정" → 재진입.

### smoke_tests

- 필요 여부: **Y**
- 대상 경로:
  - 기존 payment unit 스위트(`src/modules/payment/**/*.spec.ts`) — DI 팩토리 전환(ADR-005)이 stub 경로 회귀를 유발하지 않는지
  - 기존 file unit 스위트(`src/modules/file/**/*.spec.ts`) — FileStoragePort 교체가 presign allowlist/confirm 회귀(FR-009·SC-012)를 유발하지 않는지
- 근거: `PAYMENT_GATEWAY`/`FILE_STORAGE` provider 를 useClass→useFactory 로 바꾸면 기존 stub 기반 테스트의 DI 해석이 영향받을 수 있어 SC 범위 밖 회귀 감시 필요.

---

## 기타 고려사항

- **StubPaymentGateway/StubFileStorage 존치**: env 팩토리 fallback·기존 unit 테스트 의존으로 삭제하지 않는다(부재-공지 아님, 존치 이유 명시).
- **이니시스 결제창 방식(ASM-006)이 설계 근간**: 표준(호스팅) 결제창이면 동기 charge() 단일 호출 모델 성립. 리다이렉트/API 직접입력이면 [위험 완화 설계] 안전망 발동. Design 이 research.md 에서 **최우선** 확정.
- **[TO-VERIFY] 일관성(PATCH-002)**: 본 plan 은 이니시스 API 구체값(파라미터명·서명 알고리즘·엔드포인트·결제수단 코드·공용 테스트 상점ID)을 리터럴로 지어내지 않고 전부 `[TO-VERIFY]` 로 표기했다. Design/Development 가 이니시스 공식 개발자센터 문서로 확정한다(constitution 정확성 원칙).
- **동시성/공유상태**: 본 spec 구현체는 상태를 공유하지 않는다(각 요청이 독립 fetch·S3 호출). PaymentService 의 기존 트랜잭션·멱등 경계를 그대로 사용하므로 신규 레이스 컨디션 표면 없음. S3Client 는 스레드세이프(단일 인스턴스 재사용 가능).
- **base 혼재 주의(PROC-016-01)**: 선행 020 미커밋 상태 진입 — DIFF base(1dd5132)는 020 변경분과 혼재. 6단계 Docs 가 caveat 처리(pipeline-log 사용자 개입 이벤트 참조).
</content>
