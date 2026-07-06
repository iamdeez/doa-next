---
작성: Design Agent
버전: v1.0
최종 수정: 2026-07-06 02:05
상태: 확정
---

# Research: 021-payment-file-integration

## 목차

- [1. 기존 코드베이스 분석](#1-기존-코드베이스-분석)
  - [1-1. 클래스·모듈 계층 구조](#1-1-클래스모듈-계층-구조)
  - [1-2. 영향 범위 분석 (호출 측 전수)](#1-2-영향-범위-분석-호출-측-전수)
  - [1-3. 공유 상태·동시성 분석](#1-3-공유-상태동시성-분석)
- [2. 영향 파일 목록](#2-영향-파일-목록)
- [3. §F production 시그니처 변경 — 호출 측 테스트 식별 (PROC-001)](#3-f-production-시그니처-변경--호출-측-테스트-식별-proc-001)
- [4. 이니시스 API 계약 확정 (ASM-006 최우선)](#4-이니시스-api-계약-확정-asm-006-최우선)
- [5. R2 연동 조사](#5-r2-연동-조사)
- [6. 외부 라이브러리 실제 동작 확인](#6-외부-라이브러리-실제-동작-확인)
- [7. 인정되는 한계 및 안전망 (PATCH-A07)](#7-인정되는-한계-및-안전망-patch-a07)
- [8. 배포 환경 영향 추정 (PATCH-A10)](#8-배포-환경-영향-추정-patch-a10)
- [9. context.md 부정합 사전 점검 (PATCH-A11)](#9-contextmd-부정합-사전-점검-patch-a11)
- [10. 엣지 케이스 및 한계](#10-엣지-케이스-및-한계)

> 전체 구조는 context.md §2(핵심 모듈)·§3(외부 연동) 참조. 본 문서는 변경 대상(payment·file 두 모듈의 Port 구현체)만 실측·분석한다.

---

## 1. 기존 코드베이스 분석

### 1-1. 클래스·모듈 계층 구조

**Track A — 결제**

- `PaymentGatewayPort`(`payment-gateway.port.ts`) — interface. DI 토큰 `PAYMENT_GATEWAY`(string literal). 2 메서드:
  - `charge({ orderId, amount: Prisma.Decimal, idempotencyKey }): Promise<ChargeResult>` — `ChargeResult = { success, pgTransactionId?, failureReason? }`
  - `refund({ paymentId, amount: Prisma.Decimal, idempotencyKey }): Promise<RefundResult>` — `RefundResult = { success, pgRefundId? }`
- 구현체: `StubPaymentGateway`(`@Injectable`, 항상 success, `stub-tx-{key}`/`stub-refund-{key}`). concrete. base class 없음(interface 직접 구현).
- 신규 `IniisisPaymentGateway` 는 동일 interface 를 `implements` 로 구현(base class 상속 아님 — TS `implements` 이므로 PATCH-015-04 Dart 유형의 강제 재구현 이슈는 없으나, **interface 에 optional 아닌 메서드/파라미터 추가 시 모든 구현체가 동반 갱신 필요** — §3 참조).
- 바인딩: `payment.module.ts` L20 `{ provide: PAYMENT_GATEWAY, useClass: StubPaymentGateway }`.
- 소비: `PaymentService` 생성자 `@Inject(PAYMENT_GATEWAY) gateway`. `pay()`(charge 호출 L56)·`refund()`(refund 호출 L116).

**Track B — 파일**

- `FileStoragePort`(`file-storage.port.ts`) — interface. DI 토큰 `FILE_STORAGE`. 2 메서드:
  - `getPresignedUploadUrl(key, contentType): Promise<PresignedUpload>` — `PresignedUpload = { uploadUrl, publicUrl }`
  - `getPublicUrl(key): string`
- 구현체: `StubFileStorage`(`@Injectable`, `https://r2.stub.local/...` 결정적 URL). concrete.
- 신규 `R2FileStorage` 는 동일 interface `implements`.
- 바인딩: `file.module.ts` L20 `{ provide: FILE_STORAGE, useClass: StubFileStorage }`.
- 소비: `FileService` 생성자 `@Inject(FILE_STORAGE) storage`. `presign()`(getPresignedUploadUrl 호출 L49). **allowlist(4종)·10MiB 검증은 FileService.presign L42·confirm L85 에 존재** — 구현체 밖. FR-009 회귀는 FileService 불변으로 자동 보장.

**Config 패턴** — `jwt.config.ts` 가 `registerAs('jwt', () => {...})` 로 env 매핑. `config.module.ts` `ConfigModule.forRoot({ isGlobal:true, load:[jwtConfig], envFilePath:['.env','.env.local'] })`. 신규 config 는 동일 패턴으로 추가하되 **load 배열에 등록** 필요(아니면 `ConfigService.get('inicis')` 미해석).

> **[중요] jwtConfig 는 env 미설정 시 throw**(L13-18). 이니시스/R2 config 를 동일하게 무조건 throw 하도록 만들면 `PAYMENT_PROVIDER=stub`(크레덴셜 부재) 부팅이 깨진다. → **config 검증은 provider 선택 시점에만**(팩토리 내부에서 inicis/r2 선택된 경우에만 필수 env 검증). ASM-013 fallback(크레덴셜 부재 시 stub 부팅 유지) 전제.

### 1-2. 영향 범위 분석 (호출 측 전수)

| 심볼 | 호출 측 (production) | 호출 측 (test) |
|---|---|---|
| `gateway.charge(...)` | `payment.service.ts` L56 (유일) | `payment.service.spec.ts`(mock `mockPaymentGateway.charge`) |
| `gateway.refund(...)` | `payment.service.ts` L116 (유일) | `payment.service.spec.ts`(mock `mockPaymentGateway.refund`) |
| `storage.getPresignedUploadUrl(...)` | `file.service.ts` L49 (유일) | `file.service.spec.ts`(`useClass: StubFileStorage`) |
| `storage.getPublicUrl(...)` | `file.service.ts`(간접, presign 응답) | — |
| `PAYMENT_GATEWAY` 토큰 provider | `payment.module.ts` L20 | 단위 테스트는 **자체 TestingModule** 로 provider override(모듈 팩토리 미경유) |
| `FILE_STORAGE` 토큰 provider | `file.module.ts` L20 | `file.service.spec.ts` 자체 provider override(모듈 팩토리 미경유) |
| e2e `imports:[AppModule]` | `payments.e2e-spec.ts` L79 (**override 없음** — 실 모듈 팩토리 경유) | — |

**핵심**: 단위 테스트(payment.service.spec·file.service.spec)는 `Test.createTestingModule({ providers:[...] })` 로 **직접 provider 를 주입**하므로 `payment.module.ts`/`file.module.ts` 의 `useClass→useFactory` 전환에 **영향받지 않는다**(회귀 없음). 반면 **e2e(payments.e2e-spec.ts)는 `imports:[AppModule]` 로 실 모듈을 부팅**하며 gateway override 를 하지 않는다 → **DI 팩토리가 `PAYMENT_PROVIDER` 미설정 시 반드시 stub 로 default 해야 e2e 회귀가 없다**(현행 e2e 는 "stub gateway 기준"으로 작성됨). FILE_STORAGE 도 동일(`FILE_STORAGE` 미설정 → stub default).

### 1-3. 공유 상태·동시성 분석

- IniisisPaymentGateway·R2FileStorage 는 **요청별 독립 I/O**(각 fetch / S3 command). 인스턴스 필드로 가변 공유 상태를 두지 않는다.
- `S3Client` 는 stateless·thread-safe → **단일 인스턴스 재사용**(생성자에서 1회 생성) 권장. Check-Then-Act 패턴 없음.
- PaymentService 의 기존 트랜잭션·멱등 경계(`runInTransaction`·`findByIdempotencyKey`)를 그대로 사용 → 신규 레이스 컨디션 표면 없음.
- 캐싱 컴포넌트 없음 → 캐시 생명주기 검토 대상 아님.

---

## 2. 영향 파일 목록

| 파일 | 변경 유형 | 영향 내용 |
|---|---|---|
| `payment/inicis-payment-gateway.ts` | 신규 | `IniisisPaymentGateway implements PaymentGatewayPort` |
| `payment/inicis.config.ts` | 신규 | `registerAs('inicis', ...)` env 매핑(검증은 provider=inicis 시점) |
| `payment/payment.module.ts` | 수정 | `PAYMENT_GATEWAY` provider useClass→useFactory(env `PAYMENT_PROVIDER`, default stub) |
| `payment/payment-gateway.port.ts` | 수정(조건부) | `refund` 파라미터에 `pgTransactionId?` optional 추가(ADR-002). charge 는 §4/§GAP-021-02 결과에 따라 optional 확장 가능 |
| `payment/stub-payment-gateway.ts` | 수정 | refund optional 파라미터 시그니처 동반 갱신(값은 무시) |
| `payment/payment.service.ts` | 수정 | refund 호출부(L116)에 `pgTransactionId: payment.pgTransactionId ?? undefined` 전달. 그 외 실패분기·멱등 조회 **불변**(ADR-008) |
| `file/r2-file-storage.ts` | 신규 | `R2FileStorage implements FileStoragePort`(S3Client + presigned PUT + r2.dev public URL) |
| `file/r2.config.ts` | 신규 | `registerAs('r2', ...)` env 매핑 |
| `file/file.module.ts` | 수정 | `FILE_STORAGE` provider useClass→useFactory(env `FILE_STORAGE`, default stub) |
| `apps/backend/package.json` | 수정 | `@aws-sdk/client-s3` + `@aws-sdk/s3-request-presigner` 추가 |
| `apps/backend/.env.example` | 수정 | 신규 env 문서화(INICIS_*·R2_*·PAYMENT_PROVIDER·FILE_STORAGE) |
| `apps/backend/src/shared/config/config.module.ts` | 수정(검토) | `load:[jwtConfig, inicisConfig, r2Config]` 등록 여부 — 모듈 로컬 registerAs vs 전역 load 중 택1(§tasks) |
| **`test/static/package-no-aws.spec.ts`** | **수정(회귀 필수)** | `@aws-sdk/client-s3`·`@aws-sdk/s3-request-presigner` allowlist 추가 — §3 참조 |
| `app.module.ts`(pino redact) | 수정(조건부) | ADR-007 — 이니시스 자격증명은 req.header 가 아니므로 redact 로 미포착. 주 방어는 구현체 마스킹(§4·§10) |

> **StubPaymentGateway·StubFileStorage 삭제 금지** — 팩토리 default·fallback·기존 단위 테스트 의존(존치 이유: e2e/unit 회귀 방지).

---

## 3. §F production 시그니처 변경 — 호출 측 테스트 식별 (PROC-001)

> 본 spec 은 "Port 구현체 교체" 가 원칙이나 **2건의 시그니처/의존성 변경**이 회귀 표면을 만든다. 사전 식별로 4단계/5b 안전망 확보.

### 3-1. 변경 A — PaymentGatewayPort.refund 파라미터 확장 (ADR-002)

- **변경 전**: `refund({ paymentId, amount, idempotencyKey })`
- **변경 후**: `refund({ paymentId, amount, idempotencyKey, pgTransactionId? })` — 이니시스 취소 API 가 **원 거래ID** 를 요구(paymentId 는 이니시스가 이해 못 함). `pgTransactionId` 는 **optional** 로 추가하여 StubPaymentGateway·기존 테스트 회귀 방지.
- **호출 측 마이그레이션 필요 여부**:
  - `payment.service.ts` L103 `findByOrderId(orderId)` 로 얻은 `payment` 는 이미 `pgTransactionId` 컬럼 보유 → L116 refund 호출에 `pgTransactionId: payment.pgTransactionId ?? undefined` 추가 전달. **필수(1개소)**.
  - `StubPaymentGateway.refund` — 파라미터 추가(값 무시). **필수**.
- **호출 측 테스트 영향**:
  - `payment.service.spec.ts` SC-040(refund 성공)·SC-041(이중환불/멱등): `mockPaymentGateway.refund.mockResolvedValue(...)` + `createRefund/updateStatus/createOutbox` 만 단언. **refund 호출 인자를 `toHaveBeenCalledWith` 로 엄격 검증하지 않음** → optional 파라미터 추가는 **기존 단위 테스트 PASS 유지**(회귀 없음). 신규 SC-005(부분환불) 테스트만 pgTransactionId 전달·부분 amount 를 검증.
- **범위 포함 여부**: ADR-002 로 plan.md 에 명시 → 본 spec 범위 내. tasks.md 에 마이그레이션 태스크 포함(SC-005 매핑).

### 3-2. 변경 B — package-no-aws.spec.ts 정적 가드 회귀 (교차 spec)

- **발견**: `test/static/package-no-aws.spec.ts`(선행 spec SC-051, NFR-005 관련)는 package.json 의 dependencies/devDependencies/peerDependencies 에 **`@aws-sdk/*` 및 `@aws-` 접두어 패키지가 0건**임을 단언한다(2개 it 블록 모두).
- **회귀**: 본 spec 이 `@aws-sdk/client-s3` + `@aws-sdk/s3-request-presigner` 를 추가하면 **이 정적 테스트 2건이 즉시 FAIL** 한다. typecheck 로 미포착 — 정적 스위트 실행 시 표면화.
- **정당성**: constitution **P-002 L32** 가 "파일 스토리지는 S3 호환 인터페이스(`@aws-sdk/client-s3` 내 S3 호환 엔드포인트)만 허용" 으로 **명시 허용**. 따라서 가드는 R2 용 2개 패키지만 **allowlist** 하고, 그 외 모든 `@aws-sdk/*`·`aws-sdk`·`@aws-`·`amazon-` 은 계속 차단하도록 **정밀화**한다(무력화 아님).
- **처리**: tasks.md C 레이어에 "package-no-aws 가드 allowlist 정밀화" 태스크 포함. allowlist = `['@aws-sdk/client-s3', '@aws-sdk/s3-request-presigner']` 정확 매칭만 예외, 그 외 `@aws-sdk/*` 발견 시 여전히 FAIL. 이는 SC-014/NFR 계열의 constitution 준수 검증과 정합.
- **근거(PROC-001)**: research 가 "정적 스위트 PASS 유지" 로 오예측하면 4단계 구현 후 정적 스위트에서 회귀 FAIL. 사전 식별로 차단.

### 3-3. 변경 C — charge 시그니처 (조건부, §4·GAP-021-02)

- 표준 결제창 방식이 확정되면 charge 가 결제창 인증결과(auth token)를 수신해야 할 가능성 → 시그니처 optional 확장 여지. §4·GAP-021-02 에서 상세. **[TO-VERIFY]**(이니시스 공식문서). optional 확장으로 처리 시 refund 와 동일하게 기존 테스트 회귀 없음.

---

## 4. 이니시스 API 계약 확정 (ASM-006 최우선)

> **도구 제약**: 본 세션은 **WebFetch 미제공** — 이니시스 공식 개발자센터 온라인 확인 불가. 아래는 (a) 일반적으로 알려진 KG이니시스 연동 구조에 대한 **논리적 분석**과 (b) spec 정합성 판단이며, 파라미터명·서명 알고리즘·엔드포인트·결제수단 코드·공용 테스트 상점ID 등 **구체값은 전량 `[TO-VERIFY]`**(constitution 정확성 원칙 — 추측 리터럴 미기재). Development 가 이니시스 개발자센터 문서로 확정한다.

### 4-1. ASM-006 판단 — 표준(호스팅) 결제창 vs API 직접연동

KG이니시스 연동은 통상 2가지 형태가 있다:

| 방식 | 카드데이터 수집 주체 | 승인 흐름 | PCI-DSS |
|---|---|---|---|
| **표준(호스팅) 결제창** (웹표준 SDK, 예: `INIStdPay`) | **이니시스 결제창**(가맹점 미수집) | (1) 브라우저 결제창에서 인증 → (2) 가맹점 서버가 **승인 API 서버-투-서버 호출**(동기) | 카드데이터 비보관(ASM-006 정합) |
| API 직접연동(키인) | 가맹점이 카드번호 직접 수집·전송 | 서버-투-서버 단일 호출 | 가맹점 PCI-DSS 카드데이터 취급 필요 |

**판단(근거 기반 좁히기)**:

- spec 은 카드번호 비수집(ASM-006, PCI-DSS 카드데이터 보관 해당없음)을 전제하고 정식 PCI-DSS 감사를 범위 외로 둔다 → **표준(호스팅) 결제창 방식이 spec 의도와 부합**한다. API 직접연동(키인)은 가맹점 카드데이터 취급을 유발하여 ASM-006·"범위 외 PCI-DSS" 전제와 상충 → **부적합**.
- **"동기 승인"(FR-001) 충족 경로**: 표준 결제창의 **2단계 승인 API(서버-투-서버)** 가 동기 응답(승인/거절)을 반환하므로, `PaymentGatewayPort.charge()` 를 **이 승인 API 호출에 매핑**하면 FR-001 의 동기 승인 모델이 성립한다. 이는 기존 소셜 로그인 패턴(클라이언트가 인증 아티팩트 획득 → 서버가 동기 서버-투-서버 검증)과 동일 구조다.

**결론**: **표준(호스팅) 결제창 채택**. 리다이렉트형이라는 이유만으로 즉시 BLOCK 하지 않는다 — 승인 API(2단계)가 동기이므로 charge() 동기 모델은 성립한다. 단 아래 4-2 의 **auth token 전달 경로**가 미해소 설계 공백이다(GAP-021-02).

### 4-2. [핵심 공백 — GAP-021-02] charge() 의 결제창 인증결과(auth token) 수신 경로

- 표준 결제창의 **2단계 승인 API 호출**에는 1단계(브라우저 결제창)가 산출한 **인증 토큰(authToken/tid 류)** `[TO-VERIFY: 정확한 필드명]` 이 필요하다. 그러나 현재 `charge({ orderId, amount, idempotencyKey })` 시그니처에는 이 토큰을 담을 파라미터가 없다.
- 즉 **plan.md 의 "charge 시그니처 무변경" 전제**가, 표준 결제창의 실제 finalize 요구(인증 토큰 입력)와 상충할 수 있다. 이는 refund 의 `pgTransactionId` 확장(ADR-002)과 동형의 문제다.
- **권고 해소안**(범위 확장 최소): charge 파라미터에 **optional 필드**(예: `paymentAuthToken?` — 정확 명칭 `[TO-VERIFY]`)를 추가하여, 컨트롤러/서비스가 클라이언트로부터 받은 결제창 인증결과를 전달. optional 이므로 StubPaymentGateway·기존 charge 테스트 회귀 없음(refund 확장과 동일 패턴). **user-facing 신규 엔드포인트 신설은 아님**(기존 `POST /payments` 진입점에 인증결과 body 필드 추가 여부는 Development/[TO-VERIFY] — 신규 라우트 아님).
- **미해소 시 리스크**: 인증결과 수신 경로가 없으면 sandbox 실 charge(SC-001~003)를 서버 단독으로 재현 불가. sandbox 검증은 이니시스 테스트 결제창으로 auth token 을 얻는 절차(옵션 A, 사용자 협조)가 필요할 수 있다.
- **처리**: **GAP-021-02(OPEN)** 로 gaps.md 기록. tasks.md 는 charge 를 승인 API 캡슐화로 설계하되 auth token 입력을 `[TO-VERIFY]` 로 표기하고 optional 확장 여지를 남긴다. **BLOCK 아님**(team-lead 위임 방침 — 판단 좁히기 + [TO-VERIFY], 옵션 A sandbox 검증). main session 이 사용자에게 ASM-006 세부(결제창 인증결과 전달 방식)를 확인하도록 권고.

### 4-3. API 계약 세부 ([TO-VERIFY] 전량 — Development 확정)

| 항목 | 상태 | 비고 |
|---|---|---|
| 승인(charge) API 요청 파라미터(주문번호·금액·결제수단코드·서명·인증토큰) | `[TO-VERIFY]` | 이니시스 개발자센터 표준결제 승인 규격 |
| 승인 API 응답(승인번호·거래ID(tid)·실패코드/사유) | `[TO-VERIFY]` | `pgTransactionId` 에 tid 저장 |
| 서명(hash) 생성(대상 필드·알고리즘·순서) | `[TO-VERIFY]` | Node `crypto` 내장으로 구현. SHA-256/512 여부 확정 필요 |
| 취소(환불) API 규격 — 전액/부분 파라미터, 원거래ID 필드 | `[TO-VERIFY]` | ADR-002 refund `pgTransactionId` 매핑. 부분환불 amount 필드 |
| 결제수단 코드값(신용카드·실시간계좌이체·간편결제) | `[TO-VERIFY]` | 가상계좌 코드는 미사용(범위 외) |
| sandbox/prod 엔드포인트 URL | `[TO-VERIFY]` | FR-005 env 전환 축(`INICIS_API_BASE_URL`) |
| 공용 테스트 상점ID(MID)·테스트 자격증명 | `[TO-VERIFY: 이니시스 개발자센터 가입 후 확인 필요]` | sandbox 진입 필수. Development 착수 시 사용자 협조(ASM-013 유사) |
| 멱등/중복방지 필드(idempotencyKey 페이로드 위치) | `[TO-VERIFY]` | FR-003 — 주문번호(oid) 또는 별도 필드 |

> 위 표의 구체값 미확정은 GAP 이 아니라 **정상 위임**(plan.md 외부검증 절·gaps.md 주석). 추측 금지 원칙 하에 Development 가 문서로 확정한다.

---

## 5. R2 연동 조사

### 5-1. 패키지 설치 상태

- `@aws-sdk/client-s3`·`@aws-sdk/s3-request-presigner` **모두 미설치**(node_modules/@aws-sdk 부재 확인). 본 spec 에서 신규 추가.
- infra.md §6 "의존성 구조(확정)" 에 `@aws-sdk/client-s3` 는 이미 등재(설치 미완). `@aws-sdk/s3-request-presigner` 는 **미등재** → infra.md 갱신 필요(§8·gaps 연계).

### 5-2. R2 엔드포인트·presigned PUT 설계

- endpoint = `https://{R2_ACCOUNT_ID}.r2.cloudflarestorage.com`, `region: 'auto'`, `credentials: { accessKeyId: R2_ACCESS_KEY_ID, secretAccessKey: R2_SECRET_ACCESS_KEY }`, `forcePathStyle` 는 R2 기본 virtual-hosted 로 불요(R2 는 S3 호환).
- **presigned PUT URL**: `getSignedUrl(s3Client, new PutObjectCommand({ Bucket: R2_BUCKET, Key: key, ContentType: contentType }), { expiresIn })` — `@aws-sdk/s3-request-presigner` 의 `getSignedUrl` 이 PUT presigned URL 을 생성한다(표준 S3 SigV4 presigner, R2 호환). `createPresignedPost`(POST 폼 방식)는 현행 FileStoragePort 가 **PUT 모델**(stub 도 `?presigned=upload` PUT)이므로 **미사용** → `getSignedUrl`+`PutObjectCommand` 채택.
- **expiresIn**: ADR-006 확정값 **600초**(사용자 승인). 코드 상수화(`R2_PRESIGN_EXPIRES_SECONDS = 600`).
- **public URL**: `${R2_PUBLIC_BASE_URL}/${key}`(r2.dev 서브도메인, FR-008). 커스텀 도메인 미사용(범위 외·사용자 확정).
- **allowlist·10MiB(FR-009)**: FileService.presign(L42)·confirm(L85) 에 존재 → R2FileStorage 는 **검증 중복 금지**, 그대로 위임. 회귀 자동 방지.

---

## 6. 외부 라이브러리 실제 동작 확인

> spec/plan 가정이 의존하는 외부 라이브러리 동작. 온라인 확인 불가분은 [TO-VERIFY]·런타임 검증(1회) 위임.

| 항목 | 가정 | 실제/판단 | 검증 방법 |
|---|---|---|---|
| `@aws-sdk/s3-request-presigner` `getSignedUrl` PUT 지원 | presigned PUT URL 생성 가능 | 표준 S3 v3 presigner 동작(널리 확립). named export `getSignedUrl` | **실 R2 PUT 1회**(SC-010, e2e-docker) — typecheck 미포착(docker.md/typescript.md 준수) |
| `@aws-sdk/*` v3 import 형태 | named import | v3 는 ESM/CJS 이중 — `import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3'`·`import { getSignedUrl } from '@aws-sdk/s3-request-presigner'` (named, `export =` CJS 이슈 없음) | 앱 부팅 1회(런타임 import 검증) |
| Node 20 native `fetch`·`crypto` | 이니시스 REST·서명 | Node 20 내장(소셜 provider `google/kakao/naver.provider.ts` 가 이미 `await fetch` 사용) | 기존 패턴 재활용 — 신규 런타임 의존 0 |
| R2 SigV4 서명 호환 | S3 호환 | R2 는 S3 SigV4 호환(constitution/infra 승인) | SC-010/011 실 검증 |

> **(PATCH-04) import 구문 형태 명시**: `@aws-sdk/client-s3`·`@aws-sdk/s3-request-presigner` 는 **named import** 사용(default import 금지 — v3 modular 패키지는 named export). CommonJS `export =` 이슈 대상 아님.

---

## 7. 인정되는 한계 및 안전망 (PATCH-A07)

| 인정 한계 | 안전망 |
|---|---|
| 이니시스 API 구체값(파라미터·서명·엔드포인트·테스트 MID) 온라인 미확인(WebFetch 부재) | [TO-VERIFY] 전량 위임 + Development 문서 확정 + sandbox 실호출 검증(옵션 A) |
| 표준 결제창 auth token 전달 경로 미해소(GAP-021-02) | charge optional 확장 여지(refund 동형) + main 이 사용자에 ASM-006 세부 확인 권고 + optional 이라 stub 회귀 0 |
| ASM-013 R2 크레덴셜 사용자 준비 지연 | 팩토리 `FILE_STORAGE` 미설정→stub default → 부팅 유지, SC-010/011 만 defer(옵션 A) |
| NFR-001 P95 — 이니시스 외부 지연 통제불가(ASM-004) | SC-013 Should 등급. 초과 시 외부 변동요인 기록, 코드 결함 아님(Performance Agent 구분) |
| 자격증명 로그 노출(NFR-004) — 이니시스 자격증명은 req.header 아님 → pino redact 로 미포착 | **주 방어=구현체 명시 마스킹**(요청/응답 로그에서 MID·signKey·apiKey·카드필드 미출력). pino redact 확장은 보조(응답 body 로깅 시). Security Agent 최종 감사(SC-016) |

---

## 8. 배포 환경 영향 추정 (PATCH-A10)

- **신규 아웃바운드 2종**: 이니시스 결제 API(HTTPS), `*.r2.cloudflarestorage.com`(S3 API)·`*.r2.dev`(public GET). Fly.io egress 도달성은 Deploy Agent 확인.
- **Fly secrets 신규**(ASM-008 사용자): `PAYMENT_PROVIDER`·`FILE_STORAGE`·`INICIS_*`·`R2_*`. Deploy Agent 가 절차·체크리스트 갱신.
- **환경 특이성 점검**(컨테이너 NAT/TLS 등): 본 spec 의 검증 대상은 **아웃바운드 HTTPS 호출**(동기 요청-응답)이며, 020 의 broker 종료 후 TCP layer 흡수 같은 **장기 연결 health check 이슈와 무관**(요청마다 새 연결·응답 수신으로 완결). docker-proxy/L4 LB half-close 비대칭 리스크는 본 연동에 해당 없음. → 다중 layer health check 안전망 불요.
- **infra.md cross-reference**: §5 재시도(L120 R2 3회·L122 PG 멱등키)·§6 의존성(L174 client-s3 등재, **presigner 미등재→추가 필요**)·§8 R2 서빙도메인(r2.dev 사용, 커스텀 도메인 범위 외 — 이미 기재). **이니시스는 §3.4 외부 연동·§5 재시도에 미기재 → 갱신 필요**. → gaps.md 문서-갱신-필요 등록(Docs/Deploy 위임).

---

## 9. context.md 부정합 사전 점검 (PATCH-A11)

변경 대상 심볼의 context.md 기존 정의가 본 spec 후에도 유효한지 평가:

| context.md 항목 | 현재 정의 | 본 spec 변경 후 | 부정합 |
|---|---|---|---|
| §2 `file` 모듈(L89) | "R2는 `FileStoragePort` + `StubFileStorage`(무네트워크)" | R2FileStorage 실구현체 추가(stub 존치, env 팩토리 선택) | **갱신 필요** — "실 R2 연동(env 팩토리, stub 병존)" |
| §2 인프라(L96) | "결제: PaymentGatewayPort + stub(실 PG 후속). 파일: FileStoragePort + StubFileStorage(실 R2 후속)" | 실 이니시스/R2 구현체 추가 | **갱신 필요** — "실 PG 후속"·"실 R2 후속" 표현 갱신 |
| §3 외부 연동(L168) | "Cloudflare R2 … 실 R2 연동은 후속" | 실연동 완료 | **갱신 필요** |
| §3 외부 연동(L169) | "PG사(결제) REST API … 멱등성 키 필수" | KG이니시스 실연동 | **갱신 필요** — 벤더 명시(KG이니시스) |
| §4 데이터 모델 | payments·files 스키마 | **변경 없음**(스키마 무변경) | 부정합 없음 |

> 위 갱신은 **6단계 Docs Agent 소유**(Design 직접 갱신 금지 — MUST NOT). gaps.md 에 문서-갱신-필요로 가시화.

---

## 10. 엣지 케이스 및 한계

- **소셜/외부 IdP AUTO_LINK 대조표(PATCH-015-01)**: **해당 없음** — 본 spec 은 결제/파일 연동이며 IdP provider 자동연동(계정 병합) 변경이 없다.
- **factory default = stub 필수**: PAYMENT_PROVIDER/FILE_STORAGE 미설정·미인식 값 → stub 로 안전 fallback(e2e·부팅 회귀 방지, ASM-013). 유효 값(`inicis`/`r2`) 일 때만 실 구현체·필수 env 검증.
- **config throw 시점**: 이니시스/R2 config 는 provider 선택 시에만 필수 env 검증(부재 시 stub 부팅 유지). jwtConfig 처럼 무조건 throw 금지.
- **부분환불(SC-005)**: IniisisPaymentGateway.refund 에 부분 amount 직접 전달로 게이트웨이 레벨만 지원(ADR-004). user-facing 부분환불 엔드포인트·OrderService 부분환불 경로 신설은 범위 외.
- **charge 인증토큰 경로**: GAP-021-02 — 표준 결제창 auth token 전달. optional 확장 or sandbox 옵션 A 절차. [TO-VERIFY].
- **멱등키(FR-003)**: charge/refund 페이로드에 idempotencyKey 포함(SC-006 정적 검증). 이니시스 중복방지 필드 매핑은 [TO-VERIFY].
- **로그 마스킹(NFR-004/SC-016)**: 구현체 로그에서 MID·signKey·apiKey·카드필드 미출력(명시 마스킹). 018/019 `maskEmail`/redact 패턴 참조. 주 방어는 구현체 마스킹(자격증명은 req.header 아님).
</content>
</invoke>
