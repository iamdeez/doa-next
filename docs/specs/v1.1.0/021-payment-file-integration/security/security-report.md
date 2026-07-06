---
작성: Security Agent
버전: v1.0
최종 수정: 2026-07-06 03:11
상태: 확정
---

# 보안 감사 결과

## 목차

- [검토 범위](#검토-범위)
- [요약](#요약)
- [Constitution 보안 조항 이행 현황](#constitution-보안-조항-이행-현황)
- [취약점 목록](#취약점-목록)
- [NFR-XXX / SC-XXX 보안 요구사항 이행 현황](#nfr-xxx--sc-xxx-보안-요구사항-이행-현황)
- [권고사항](#권고사항)

---

## 검토 범위

DIFF-021-payment-file-integration.md 기준 021 관련 경로(base `1dd5132`)만 대상으로 한다.

**대상 파일**:
- `apps/backend/src/modules/payment/inicis-payment-gateway.ts`(신규)
- `apps/backend/src/modules/payment/inicis.config.ts`(신규)
- `apps/backend/src/modules/payment/payment-gateway.port.ts`
- `apps/backend/src/modules/payment/stub-payment-gateway.ts`
- `apps/backend/src/modules/payment/payment.module.ts`
- `apps/backend/src/modules/payment/payment.service.ts`
- `apps/backend/src/modules/payment/payment.controller.ts`
- `apps/backend/src/modules/payment/dto/create-payment.dto.ts`
- `apps/backend/src/modules/file/r2-file-storage.ts`(신규)
- `apps/backend/src/modules/file/r2.config.ts`(신규)
- `apps/backend/src/modules/file/file.module.ts`
- `apps/backend/.env.example`
- `apps/backend/test/static/package-no-aws.spec.ts`

**교차 확인용 간접 참조 파일**(변경 없음, plan.md 인터페이스 계약·research.md 영향범위 근거로 읽음):
- `apps/backend/src/modules/file/file.service.ts`·`file.controller.ts` — presign 키 생성·소유권 검증 로직이 R2FileStorage 도입으로 우회되지 않는지 확인
- `apps/backend/src/modules/order/order.service.ts` (L188-221) — 환불 호출 전 주문 소유권 검증 확인
- `apps/backend/prisma/schema.prisma` (Payment/Refund 모델) — idempotencyKey 유니크 제약 확인
- `apps/backend/src/app.module.ts` — pino redact 설정 확인
- `.claude/docs/constitution.md` P-002/P-004/P-005

**제외**: `apps/backend/test/static/inicis-decimal.spec.ts`·`inicis-idempotency.spec.ts`·`payment-outbox-invariant.spec.ts`·`provider-env-switch.spec.ts`·`inicis-payment-gateway.spec.ts`·`payment.service.spec.ts`·`order.service.spec.ts` — 테스트 코드 자체는 보안 취약점 표면이 아니므로 검증 로직 대조용으로만 열람(코드 대조는 완료, 별도 SEC 항목화 없음).

---

## 요약

- 검토 대상 파일: 13개(신규 4 + 수정 9)
- Critical/High 발견 건수: **0건**
- 전체 발견 항목: Medium 0건, Low 3건(권고사항)
- 판정: **gate PASS** — Medium 이하만 존재, Performance Agent 진행 가능

핵심 보안 통제(자격증명 마스킹, 서버측 금액 재계산, IDOR 방지, presigned URL 키 서버 생성, 멱등성 DB 유니크 제약, AWS SDK allowlist 정밀화)가 모두 코드 대조로 CONFIRMED 되었다. 아래 3건은 Critical/High 가 아닌 권고사항이다.

---

## Constitution 보안 조항 이행 현황

| 조항 | 이행 여부 | 비고 |
|---|---|---|
| P-002 (AWS 의존 금지) | 이행 | `@aws-sdk/client-s3`·`@aws-sdk/s3-request-presigner` 는 L32 명시 허용(S3 호환 R2 전용). `package-no-aws.spec.ts` 가 allowlist 2건 정밀 매칭 + 임의 `@aws-sdk/*` 재유입 시뮬레이션(`@aws-sdk/client-dynamodb`)까지 차단 확인(L97-109). Cognito/EventBridge/SQS/DynamoDB/ElastiCache/CloudWatch/Lambda 신규 의존 없음. |
| P-004 (클라우드 중립) | 이행 | R2FileStorage 는 S3 호환 엔드포인트(`https://{accountId}.r2.cloudflarestorage.com`)만 사용. IniisisPaymentGateway 는 native `fetch`(Node 20 내장)로 Fly.io 전용 API 미결합. |
| P-005 (결제·정산 정합성) | 이행 | 성공 시 payment+outbox 동일 트랜잭션(`payment.service.ts` L63-83), 실패 시 outbox 미기록(ADR-008 확정 설계와 일치). charge/refund 요청 페이로드에 idempotencyKey 포함(코드 확인, L103-110/159-165). `Payment.idempotencyKey`·`Refund.idempotencyKey` 모두 DB `@unique` 제약(schema.prisma L603/624) — 동시 재요청 race 를 DB 레벨에서도 방지. 금전 연산은 전 구간 `Prisma.Decimal`(`.toString()` 직렬화, float 리터럴 연산 없음 — `inicis-payment-gateway.ts` 코드 확인). |

---

## 취약점 목록

Critical/High/Medium 발견 없음. 아래는 Low 등급 권고사항이다(차단 아님).

| SEC-ID | 심각도 | OWASP | 위치 | 설명 | 수정 방향 | 상태 |
|---|---|---|---|---|---|---|
| SEC-021-01 | Low | A02 (암호화 실패) | `inicis-payment-gateway.ts` L205-208 `buildSignature()` | 서명 알고리즘이 `SHA-256(authToken + mid + amount + signKey)` 형태의 자체 고안 해시이며 HMAC(`crypto.createHmac`)이 아니다. secret(`signKey`)이 메시지 **끝**에 위치하는 suffix 구성이라 고전적 length-extension 공격(secret-prefix 구성에서 발생)의 직접 적용 대상은 아니나, 표준 HMAC 대비 이론적 안전마진이 낮다. 또한 이 알고리즘 자체가 `[TO-VERIFY]`(GAP-021-02 잔존)로 표시되어 있어 이니시스 실제 규격과 다를 경우 sandbox 연동 자체가 실패할 뿐 보안 결함으로 이어지지는 않는다(우리가 검증하는 것이 아니라 이니시스가 검증하는 아웃바운드 인증값이므로 외부 공격자가 이 서명 생성 과정에 직접 개입할 경로가 없음 — CONFIRMED 비노출). | 이니시스 공식 개발자센터 문서로 실제 서명 필드·알고리즘을 확정할 때 `crypto.createHmac('sha256', signKey)` 형태의 표준 HMAC 사용을 우선 검토. | 권고 (기존 GAP-021-02 [TO-VERIFY] 잔존 항목과 연계 — 신규 GAP 미생성) |
| SEC-021-02 | Low | A05 (보안 설정 오류) | `inicis.config.ts` L24-28, `r2.config.ts` L20-24 | `INICIS_API_BASE_URL`·R2 엔드포인트(계정ID 기반 자동 구성)가 스킴(https) 강제 검증 없이 env 값을 그대로 사용한다. 운영자가 실수로 `http://` 값을 설정하면 MID·signKey·authToken·카드 관련 필드가 평문으로 네트워크에 노출될 수 있다(R2 엔드포인트는 코드에서 `https://` 하드코딩이라 해당 없음 — 이니시스 `apiBaseUrl` 만 해당). | `IniisisPaymentGateway` 생성자에서 `apiBaseUrl.startsWith('https://')` 검증을 추가하거나, 배포 전 체크리스트(infra.md §7)에 스킴 확인 항목 명시. | 권고 |
| SEC-021-03 | Low | A09 (로깅·모니터링) | `inicis-payment-gateway.ts` L143-146 | PG 호출 예외 발생 시 `err.message`(네트워크 예외 메시지 원문)가 `failureReason` 으로 그대로 DB(`payments.payments.failureReason`)에 저장된다. 현재 API 응답 경로(`payment.service.pay` 반환값·`PaymentController.pay`)는 `failureReason` 을 클라이언트에 노출하지 않음을 코드로 확인(CONFIRMED — 외부 노출 없음). 다만 향후 관리자 콘솔 등에서 이 필드를 그대로 노출하면 내부 인프라 정보(호스트명 등)가 유출될 수 있다. | 향후 이 필드를 사용자/판매자 대상 API 로 노출하는 신규 엔드포인트를 추가할 경우, 원문 대신 분류된 에러 코드로 매핑 후 노출할 것을 후속 spec 설계 시 반영. | 권고 (현재 코드 노출 경로 없음 — 예방적 기록) |

---

## NFR-XXX / SC-XXX 보안 요구사항 이행 현황

| ID | 요구사항 | 이행 여부 | 비고 |
|---|---|---|---|
| NFR-004 | 결제 요청/응답 로그·자격증명(MID·API키 등)·카드 정보 평문 노출 금지 | 이행 | `maskSensitivePayload()` 가 `mid`·`signkey`·`signature`·`apikey`·`apiiv`·`authtoken`·`cardno`/`cardnumber`/`cardnum` 을 소문자 비교로 마스킹(L21-41). `charge`/`refund` 요청·응답 로그 모두 마스킹 함수를 경유(L115-129, L170-183). `inicis-payment-gateway.spec.ts` 가 MID·signKey 고정값이 `Logger.log/warn/error` 전 호출 인자에 등장하지 않음을 실제 검증(L109-160) — 코드+테스트 이중 확인. |
| SC-016 | 결제 요청·응답 로그에 자격증명·카드 민감정보 미노출 | 이행 | 위 NFR-004 근거와 동일. 에러 로그(L139-142, L192-195)는 orderId/paymentId/idempotencyKey 만 포함하고 페이로드 원문을 포함하지 않아 별도 마스킹 불요 확인. |
| FR-003/SC-006 | charge·refund 페이로드에 멱등성 키 포함 | 이행 | 코드 L103-110(charge)·L159-165(refund) 확인. `idempotencyKey` 는 UUID v4(컨트롤러 `isUUID(..,'4')` 검증, L39) 또는 `refund:{orderId}` 서버 생성값(예측 가능하나 소유권 검증이 선행되어 문제 없음 — 아래 참조). |
| NFR-002 | 결제·환불 완료 상태 변경은 outbox 없이 처리되지 않음, 모든 요청은 멱등성 키 필수 | 이행 | `payment.service.ts` L63-83(성공 시 동일 tx 내 outbox), L126-149(환불 성공 시 동일). 실패(`failed`) 분기는 ADR-008 확정 설계에 따라 outbox 대상 제외(GAP-021-01 RESOLVED 반영, 의도된 설계). |
| — | (Security 자체 확인) 금액 위변조 방지 | 이행 (CONFIRMED) | `payment.service.ts` L54-55 — 결제 금액은 `order.totalAmount - order.discountAmount` 로 **서버 측 주문 원장에서 재계산**(`SEC-FIND-004` 기존 패턴 승계, 021 회귀 없음). 클라이언트가 전달한 금액 필드는 `CreatePaymentDto` 에 존재하지 않음(코드 확인 — DTO 에 `amount` 필드 부재) → 클라이언트가 결제 금액을 조작할 입력 경로 자체가 없음. |
| — | (Security 자체 확인) `authToken` 신뢰 경계 | 이행 (CONFIRMED, 설계상 의도) | `CreatePaymentDto.authToken` 은 클라이언트가 임의 문자열을 전달할 수 있으나, 서버는 이를 자체 검증하지 않고 이니시스 승인 API(`charge()` 의 `endpoint`)로 그대로 전달한다(표준 호스팅 결제창 2단계 승인 모델 — research.md §4-1/GAP-021-02). 최종 인증 판단은 이니시스 승인 서버가 수행하며, 금액은 위 항목대로 서버 원장값을 사용하므로 클라이언트가 `authToken` 을 조작해도 (a) 이니시스가 유효하지 않은 토큰을 거부하거나 (b) 이니시스 1단계에서 실제 인가된 금액과 서버가 전달한 금액이 불일치하면 이니시스 승인 단계에서 거절된다. 이 신뢰 위임 구조는 표준 호스팅 결제창의 일반적 설계이며 코드 결함이 아니다. **잔존**: 이니시스 실제 승인 API 가 "금액 불일치 시 거절"을 수행하는지는 이니시스 공식 문서 확정 필요 항목([TO-VERIFY], GAP-021-02 잔존 범위 — 이미 gaps.md 에 문서화됨, 신규 GAP 미생성). |
| — | (Security 자체 확인) R2 presigned URL 오남용 방지 | 이행 (CONFIRMED) | `FileService.presign()` 이 `key = {purpose}/{userId}/{uuid}}` 를 **서버 측에서 생성**(`file.service.ts` L48)하여 `R2FileStorage.getPresignedUploadUrl(key, contentType)` 에 전달 — 클라이언트가 임의 key 를 지정할 경로 없음. `ALLOWED_CONTENT_TYPES` allowlist 사전 검증(L42-46)은 R2FileStorage 도입과 무관하게 FileService 계층에 그대로 유지(FR-009 회귀 없음, 코드 확인). presigned URL 만료 600초(`R2_PRESIGN_EXPIRES_SECONDS`, ADR-006 사용자 승인값)는 직접 업로드 용도로 적정 범위. |

---

## 권고사항

1. **SEC-021-01 (Low)**: 이니시스 실제 서명 규격 확정 시(GAP-021-02 잔존 [TO-VERIFY] 해소 시점) `crypto.createHmac` 기반 HMAC 사용을 우선 검토 — 별도 patch spec 불요, 해당 GAP 해소 작업에 포함 권고.
2. **SEC-021-02 (Low)**: `INICIS_API_BASE_URL` 스킴(https) 검증을 `IniisisPaymentGateway` 생성자 또는 배포 전 체크리스트(infra.md §7)에 추가 권고. Retrospective Agent 가 GAP-021-03(context.md/infra.md 갱신 위임) 처리 시 infra.md §7 체크리스트 항목에 병기하는 것을 제안.
3. **SEC-021-03 (Low)**: 현재 코드 경로상 노출 없음 — 예방적 기록. 향후 결제 실패 사유를 사용자/판매자 대상 API 로 노출하는 신규 기능 설계 시 참조하도록 별도 GAP/Retrospective 등재는 불필요(현재 미노출이므로 P-007 스펙범위 밖 선제 조치 방지).
4. 위 3건 모두 **Medium 이상 미해결 취약점이 아니므로** PROC-013-03(Retrospective → context.md §6 등재 권고) 대상 아님. GAP-021-02 의 기존 [TO-VERIFY] 잔존(authUrl 미노출·서명 규격 확정)과 SEC-021-01 은 동일 근본 원인(이니시스 공식 문서 미확정)이므로 신규 GAP 생성 없이 기존 GAP-021-02 문맥에 위 권고 1을 참조로 남긴다.
