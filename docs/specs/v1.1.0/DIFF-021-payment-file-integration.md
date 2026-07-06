---
작성: Docs Agent
버전: v1.0
최종 수정: 2026-07-06 03:00
상태: 확정
---

# Diff: 021-payment-file-integration

## 커밋 메시지용 한 줄 요약

- **KO**: 결제 게이트웨이(KG이니시스)·파일 저장소(Cloudflare R2) stub → 실연동 전환, env 기반 provider 팩토리 도입
- **EN**: Wire real KG Inicis payment gateway and Cloudflare R2 file storage behind env-driven provider factories, replacing stubs

## 변경 요약

- **Track A (결제)**: `PaymentGatewayPort` 의 실 구현체 `IniisisPaymentGateway` 신규 추가. native `fetch` + `crypto` 서명으로 KG이니시스 REST API 에 `charge`/`refund` 요청을 전달하고 동기 승인/거절 응답을 수신한다(FR-001/002). 모든 요청 페이로드에 멱등성 키를 포함하며(FR-003), PG 호출 실패(타임아웃/5xx) 시 신규 재시도 메커니즘을 추가하지 않고 결제 상태를 `failed` 로 기록한 뒤 동일 멱등키 재요청으로 안전하게 처리한다(FR-004, GAP-021-01/ADR-008). 요청/응답 로그의 자격증명·카드정보는 마스킹 처리한다(NFR-004).
- **DI 팩토리 전환(ADR-005)**: `PaymentGatewayPort`·`FileStoragePort` 의 provider 바인딩을 `useClass`(고정) 에서 `useFactory`(env 기반) 로 전환했다. `PAYMENT_PROVIDER=inicis`\|`FILE_STORAGE=r2` 로 실 구현체를, 그 외/미설정 값은 기존 stub(`StubPaymentGateway`/`StubFileStorage`) 로 폴백한다(FR-005/SC-008). 기존 e2e/unit 이 override 없이 `AppModule` 을 부팅하므로 stub 기본값 유지가 회귀 방지의 핵심이다.
- **GAP-021-02 완전 해소**: 표준(호스팅) 결제창 방식(ASM-006)이 요구하는 인증토큰(`authToken`)을 `charge()` 페이로드에 담기 위해 `CreatePaymentDto.authToken?` → `PaymentController.pay` → `PaymentService.pay(..., authToken?)` → `gateway.charge({...,authToken})` 전 구간 배선을 완결했다. `authToken` 미전달 시 `undefined` 전파로 하위 호환 유지.
- **Track B (파일)**: `FileStoragePort` 의 실 구현체 `R2FileStorage` 신규 추가. `@aws-sdk/client-s3` + `@aws-sdk/s3-request-presigner` 로 Cloudflare R2(S3 호환 엔드포인트)에 대해 실제 presigned PUT URL(만료 600초, ADR-006)을 발급하고(FR-007), `r2.dev` 서브도메인 기반 공개 URL 을 반환한다(FR-008). 011-file-security 의 이미지 4종 allowlist·10MiB 상한 검증은 `FileService` 레벨 로직으로 실 연동 전환과 무관하게 유지된다(FR-009, 회귀 0).
- **테스트**: 신규 정적 검증 4종(`inicis-decimal`·`inicis-idempotency`·`payment-outbox-invariant`·`provider-env-switch`) + 게이트웨이 레벨 단위 테스트(`inicis-payment-gateway.spec.ts`) + `payment.service.spec.ts`/`order.service.spec.ts` 신규 블록 2건. `package-no-aws.spec.ts` 는 `@aws-sdk/client-s3`·`@aws-sdk/s3-request-presigner` 를 P-002 명시 허용 예외로 반영하도록 정밀화(기존 SC-051 유지). SC-001~004·010·011·013 실 지연분은 이니시스 sandbox·R2 실 버킷 크레덴셜이 필요해 옵션A(사용자 실행)로 DEFERRED — 자동화 9건(SC-005·006·007·008·009·012·014·015·016) 전건 PASS, 회귀 0.

## 변경 파일 및 라인 수

| 파일 | 추가 | 삭제 |
|---|---|---|
| `apps/backend/src/modules/payment/inicis-payment-gateway.ts` (신규) | +209 | -0 |
| `apps/backend/src/modules/payment/inicis.config.ts` (신규) | +30 | -0 |
| `apps/backend/src/modules/payment/inicis-payment-gateway.spec.ts` (신규) | +162 | -0 |
| `apps/backend/src/modules/payment/payment-gateway.port.ts` | +8 | -0 |
| `apps/backend/src/modules/payment/dto/create-payment.dto.ts` | +10 | -1 |
| `apps/backend/src/modules/payment/payment.controller.ts` | +1 | -1 |
| `apps/backend/src/modules/payment/payment.service.ts` | +7 | -1 |
| `apps/backend/src/modules/payment/stub-payment-gateway.ts` | +2 | -0 |
| `apps/backend/src/modules/payment/payment.module.ts` | +19 | -1 |
| `apps/backend/src/modules/payment/payment.service.spec.ts` | +50 | -0 |
| `apps/backend/src/modules/order/order.service.spec.ts` | +37 | -0 |
| `apps/backend/src/modules/file/r2-file-storage.ts` (신규) | +66 | -0 |
| `apps/backend/src/modules/file/r2.config.ts` (신규) | +26 | -0 |
| `apps/backend/src/modules/file/file.module.ts` | +21 | -5 |
| `apps/backend/package.json` | +2 | -0 |
| `apps/backend/.env.example` | +24 | -0 |
| `apps/backend/test/static/inicis-decimal.spec.ts` (신규) | +53 | -0 |
| `apps/backend/test/static/inicis-idempotency.spec.ts` (신규) | +73 | -0 |
| `apps/backend/test/static/payment-outbox-invariant.spec.ts` (신규) | +80 | -0 |
| `apps/backend/test/static/provider-env-switch.spec.ts` (신규) | +96 | -0 |
| `apps/backend/test/static/package-no-aws.spec.ts` | +52 | -20 |

## Diff

> **base 혼재 주의 (PROC-016-01)**: 본 spec(021) 진입 시 선행 020-data-migration-cutover 가 **미커밋** 상태였다(사용자가 커밋을 보류하고 진행을 선택 — pipeline-log.md "사용자 개입" 이벤트 참조). base commit `1dd5132`(019 완료 커밋) 는 020 변경분(`scripts/migration/`·`.claude/docs/context.md`·`.claude/docs/infra.md`·`.gitignore`·`docs/specs/v1.1.0/020-data-migration-cutover/` 등)과 021 변경분이 혼재된 상태다. 위 "변경 파일 및 라인 수" 표는 **021 관련 경로로 한정**(`apps/backend/src/modules/payment`·`apps/backend/src/modules/file`·`apps/backend/src/modules/order/order.service.spec.ts`·`apps/backend/package.json`·`apps/backend/.env.example`·`apps/backend/test/static`)한 diff 결과이므로 020 변경분과 섞이지 않았음을 확인했다(각 파일 개별 `git diff 1dd5132 -- {path}` 로 검증). 020 이 커밋 완료되면 아래 재생성 명령의 `1dd5132` 를 **020 완료 커밋 해시**로 갱신한다.

재생성 명령 (021 관련 경로로 한정):
```bash
git diff 1dd5132 -- apps/backend/src/modules/payment apps/backend/src/modules/file apps/backend/src/modules/order/order.service.spec.ts apps/backend/package.json apps/backend/.env.example apps/backend/test/static
```
