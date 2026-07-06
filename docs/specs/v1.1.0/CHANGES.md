## [022-legacy-file-binary-migration] 구현 완료

> v1.1.0 의 스물두 번째 차수 — 020-data-migration-cutover 가 "R2 실연동 완료 후 별도 진행"으로
> 범위 외 이월한 `files.files` **실 파일 바이너리**(오브젝트) 이관을 다룬다. 021 이 R2 실연동
> (`R2FileStorage`)을 완성하여 선행 조건이 충족됨에 따라 사용자 확인(020 CHANGES.md 후속
> 주의사항 #6) 후 착수했다. 신규 앱 도메인 코드 변경은 0건 — 020 전용 러너 이미지
> (`scripts/migration/Dockerfile`)를 `rclone` 추가로 확장하고, 신규 스크립트
> `files-migrate.sh`(precheck/precopy/delta/verify/url-update 5개 서브커맨드)·
> `sql/30_file_url_update.sql`(url 멱등 갱신 + 검증 쿼리, DDL 무변경)·운영 문서 2종(런북·
> 사전평가)·정적 테스트 3스위트를 산출했다.
>
> **핵심 설계**: rclone 기반 레거시 S3 → R2 서버간 복사(vendor-neutral, P-002/P-004)·key
> identity 복사(FR-004, key 재작성 없음)·`--checksum` 멱등 skip 으로 델타 처리(`updatedAt`
> 부재로 워터마크 증분 불가, ADR-003)·`verification_runs`(020 감사 테이블 재사용,
> `phase='file-migration'`)·개별 실패 재시도 + 잔존 실패 시 사전평가 리포트 재확인 요청
> (FR-006/007)·멀티파트 ETag 샘플은 `rclone check --download` 실 바이트 대조 fallback
> (ASM-003 안전망).
>
> **검증 방식(옵션 A)**: 실 레거시 AWS S3 접근이 필요한 SC 9건(SC-001·002·003·004·005·006·
> 011·013·015)은 파이프라인 내 자동 실행 불가 — 020 선례와 동일하게 실행 절차·판정 기준을
> `test/test-cases.md` §옵션 A 실행 계약으로 명세하고 사용자 실행 결과 전달로 검증하는 계약을
> 채택했다. 정적 검증 대상 6건(SC-007·008·009·010·012·014)은 자동 테스트 3스위트/18개 전건
> PASS. 회귀 탐지: `apps/backend/test/static/` 전체 23 suites/153 tests 전건 PASS(020/021 및
> 그 이전 spec 22종 회귀 0건).
>
> base `c59e6f9`(021 문서 반영 커밋) → working tree(미커밋). 변경 추적: `git diff c59e6f9 --
> stat -- scripts/migration/Dockerfile scripts/migration/config.example.env`(tracked 2 files,
> +41/-3) + 신규(untracked) 7개 파일(스크립트 1·SQL 1·운영 문서 2·정적 테스트 3, 총 866줄).
> **신규 npm 의존성 0건**(`apps/backend` 도메인 코드 변경 0건, `git diff c59e6f9 --
> apps/backend/src apps/backend/prisma` 무변경) — `rclone` 은 npm 패키지가 아닌 시스템 CLI(alpine
> 패키지)로 러너 이미지에만 추가. 선택 단계: Database Design Agent N(DB 스키마 변경 없음 —
> `files.files` 컬럼 기존재, url 갱신은 단일 컬럼 결정적 UPDATE)·**Deploy Agent → Security
> Agent → Performance Agent 는 Y 판정으로 본 Docs 단계 다음 순서대로 진행 예정**(아래 "미해결
> GAP" 참조).
>
> **GAP-022-01(RESOLVED)**: Alpine `postgres:16-alpine` 베이스에서 `apk add rclone` 실제
> 해소 여부는 정적 리뷰만으로 확정 불가했으나(GAP-020-05 재발 방지 대상), Development Agent 가
> `docker build`+`docker run rclone version` 1회 실증(`rclone v1.74.1-DEV` 정상 출력)으로 해소.

**변경 파일**:
- `scripts/migration/Dockerfile` (수정, +7/-3): `apk add --no-cache curl` → `curl rclone` 확장 +
  `chmod +x` 대상에 `/migration/files-migrate.sh` 추가(020 이미지 확장, 신규 별도 이미지 없음).
- `scripts/migration/config.example.env` (수정, +34): 레거시 S3 rclone remote 설정 키(엔드포인트·
  리전·버킷·access/secret, `[TO-VERIFY]` 슬롯) + R2 rclone remote 설정 키(021 `R2_*` 재사용) +
  `https://` 강제 주석(NFR-004/ADR-009) 추가. 실 자격증명 원문 미기재.
- `scripts/migration/files-migrate.sh` (신규, 334줄): `precheck`(레거시 총개수·총용량 실측 +
  예상소요)·`precopy`(`--files-from`·`--checksum`·`--max-duration` 미설정)·`delta`(멱등 재복사)·
  `verify`(개수 대조 + 샘플 체크섬 + 멀티파트 fallback)·`url-update`(`sql/30_file_url_update.sql`
  실행) 5개 서브커맨드. `lib/common.sh`(020) source 재사용, `stage_run` 패턴 자체 구현
  (`phase='file-migration'`), 실패 key 캡처 + 재시도(FR-006/007).
- `scripts/migration/sql/30_file_url_update.sql` (신규, 44줄): (a) `url = base||'/'||key` 멱등
  UPDATE(WHERE status='UPLOADED') (b) 개수 대조 쿼리 (c) url 형식 검증 쿼리 (d) key 목록 추출
  쿼리(`--files-from` 용, PENDING 제외 단일 필터 지점). DDL(CREATE/ALTER) 0건.
- `scripts/migration/FILE-MIGRATION-RUNBOOK.md` (신규, 146줄): 옵션 A 실행 런북 — 레거시 S3
  접근이 필요한 4단계(precheck·precopy·delta·verify)마다 "사용자 환경 실행 → 결과 전달 → 검증"
  절차 명시(SC-008), 020 컷오버 60분 윈도우 통합 체크포인트, R2 공개 접근 사전점검.
- `scripts/migration/FILE-PRE-ASSESSMENT.md` (신규, 81줄): 사전평가 리포트 템플릿 — 총개수·
  총용량·예상소요 3항목 슬롯(SC-009) + 잔존 실패 목록·"컷오버 개시 전 사용자 재확인 필요"
  문구(SC-007) + 멀티파트 ETag 형식 샘플 확인 항목.
- `apps/backend/test/static/file-migration-runbook.spec.ts` (신규, 72줄): SC-008 — 런북 5개
  서브커맨드 단계별 라벨 최소출현 정적 검증(it.each 5건 + 라벨 반복 테스트).
- `apps/backend/test/static/file-migration-pre-assessment.spec.ts` (신규, 59줄): SC-007·009 —
  사전평가 리포트 3항목 슬롯 + 잔존실패 재확인 문구 정적 검증.
- `apps/backend/test/static/file-migration-script.spec.ts` (신규, 130줄): SC-010·012·014 —
  Dockerfile rclone 토큰·신규 이미지 0건·`--max-duration` 부재·TLS 엔드포인트 정적 검증.

**후속 작업 시 주의사항**:
1. **선택 단계 진행 예정 — Deploy Agent → Security Agent → Performance Agent**: 본 Docs 단계
   완료 시점 기준이며, 세 선택 Agent 는 아직 실행되지 않았다. 최종 gate 는 그 결과로 확정된다.
   캐스케이딩 블로킹(agent-rules.md §0) 적용 — Deploy FAIL 시 Security·Performance 스킵,
   Security BLOCKED(Critical/High) 시 Performance 스킵.
2. **GAP-022-02(OPEN, Security Agent 재평가 위임)**: 022 가 020 의
   `migration_staging.verification_runs` 를 `phase='file-migration'` 로 재사용함에 따라 020 의
   미해결 감사 부채 2건(SEC-020-01 스테이징 정리 미자동화·SEC-020-02 감사 로그 행위자 미기록,
   `context.md §6`)이 그대로 상속된다. 022 는 신규 악화를 유발하지 않으나(동일 테이블·동일
   패턴), 파일 이관이 3중 자격증명(레거시 S3 read + R2 write + 타깃 DB write)을 동시 취급하는
   접근 통제 표면이므로 Security Agent 가 파일 이관 맥락에서 재평가해야 한다.
3. **옵션 A 실행 계약 9건 대기 중(SC-001·002·003·004·005·006·011·013·015)**: 실 레거시 AWS
   S3 자격증명·네트워크 접근이 파이프라인 밖 사용자 환경에만 존재하여 파이프라인 내 자동 실행이
   불가하다. `scripts/migration/FILE-MIGRATION-RUNBOOK.md`·`test/test-cases.md` §옵션 A 실행
   계약의 절차대로 사용자가 실 환경에서 실행 후 결과를 전달하면 검증을 완료할 수 있다.
4. **context.md/infra.md 갱신 필요 (Retrospective Agent 위임, gaps.md 신규 미등록 — GAP-021-03
   에 통합 인지)**: 022 는 `context.md §2 file 모듈`·`§3.4 외부연동`의 기존 정의(FileAsset 필드
   의미·FileStatus enum·key 형태)를 변경하지 않았다(url 컬럼 데이터만 갱신). 021 완료 미반영
   기존 OPEN GAP-021-03("실 R2 연동은 후속" 표현 잔존)을 6단계 Docs/Retrospective 가 021+022
   반영 시 함께 처리한다(gaps.md 참조). GAP-020-02(`files.files` vs `file_assets` 물리명 오표기)
   는 022 산출물이 실측 물리명 사용으로 회피했을 뿐 별도 처리는 Retrospective 위임 유지.
5. **레거시 실 구조 [TO-VERIFY] 잔존**: 레거시 S3 버킷명·엔드포인트·리전·key 네이밍·ETag
   형식·정확한 rclone 버전/플래그 시맨틱은 옵션 A(사용자 실행) + Deploy 단계 이미지 빌드 검증으로
   확정한다(020 관례 승계, 지어내지 않음).
6. **DIFF-022 는 base 혼재 없음**: 020·021 이 모두 커밋 완료(`c702d85`·`c21840e`·`c59e6f9`)
   상태에서 022 가 시작되어, base `c59e6f9` 기준 diff 는 022 변경분만 포함한다(PROC-016-01 caveat
   불필요).

---

## [021-payment-file-integration] 구현 완료

> v1.1.0 의 스물한 번째 차수 — 001~020 차수에 걸쳐 실구현된 18개 도메인 모듈 중 마지막까지
> **stub** 구현으로 남아 있던 두 외부 연동 지점(`PaymentGatewayPort`·`FileStoragePort`)을
> 실 서비스(KG이니시스·Cloudflare R2)로 전환한다. Track A(결제)·Track B(파일) 두 트랙으로
> 구성되며, 두 Port 모두 `env` 기반 `useFactory` DI 팩토리(ADR-005, `PAYMENT_PROVIDER`·
> `FILE_STORAGE`)로 `stub↔real` 을 코드 변경 없이 전환한다(FR-005/SC-008). 미설정·미인식
> 값은 안전하게 stub 로 폴백 — 기존 e2e/unit 회귀 0.

**변경 파일**:
- `apps/backend/src/modules/payment/inicis-payment-gateway.ts` (신규): KG이니시스 `PaymentGatewayPort` 구현체 — `charge`/`refund` native `fetch` + `crypto` 서명(ADR-003), 멱등성 키 페이로드 포함(FR-003), PG 실패 시 `failed` 기록(신규 재시도 메커니즘 없음, GAP-021-01/ADR-008), 요청/응답 로그 자격증명·카드정보 마스킹(NFR-004/ADR-007).
- `apps/backend/src/modules/payment/inicis.config.ts` (신규): `INICIS_MID`·`INICIS_SIGN_KEY`·`INICIS_API_BASE_URL`·`INICIS_API_KEY`·`INICIS_API_IV` 등 이니시스 자격증명 `ConfigModule.forFeature`.
- `apps/backend/src/modules/payment/inicis-payment-gateway.spec.ts` (신규): SC-005(부분환불)·SC-016(로그 마스킹) 등 게이트웨이 레벨 단위 테스트.
- `apps/backend/src/modules/payment/payment-gateway.port.ts` (수정): `charge`에 `authToken?`(GAP-021-02, 표준결제창 인증토큰), `refund`에 `pgTransactionId?`(ADR-002, 취소 대상 거래ID) optional 필드 확장 — 하위호환 유지.
- `apps/backend/src/modules/payment/dto/create-payment.dto.ts` (수정): `authToken?: string`(`@IsOptional()/@IsString()`) 추가(GAP-021-02 완전해소).
- `apps/backend/src/modules/payment/payment.controller.ts` (수정): `dto.authToken` 을 `PaymentService.pay` 4번째 인자로 전달하는 배선 추가.
- `apps/backend/src/modules/payment/payment.service.ts` (수정): `pay(userId, orderId, idempotencyKey, authToken?)` 시그니처 확장 + `gateway.charge({...,authToken})` 전달, `refund` 시 `pgTransactionId` 전달(ADR-002).
- `apps/backend/src/modules/payment/stub-payment-gateway.ts` (수정): 확장된 optional 필드 반영(동작 불변).
- `apps/backend/src/modules/payment/payment.module.ts` (수정): `PAYMENT_GATEWAY` provider 를 `useClass`(고정) → `useFactory`(env `PAYMENT_PROVIDER` 기반, `inicis`\|기본값 stub)로 전환(ADR-005).
- `apps/backend/src/modules/payment/payment.service.spec.ts` (수정): SC-007(021) — PG 실패 시 `failed` 기록 + 동일 멱등키 재요청 시 중복 charge 방지 단위 테스트 추가.
- `apps/backend/src/modules/order/order.service.spec.ts` (수정): SC-009(021) — 환불 자동승인(관리자 개입 없이 단일 호출 완결) 단위 테스트 추가.
- `apps/backend/src/modules/file/r2-file-storage.ts` (신규): Cloudflare R2 `FileStoragePort` 구현체 — `@aws-sdk/client-s3` + `@aws-sdk/s3-request-presigner` 로 presigned PUT URL 발급(FR-007, 만료 600초 ADR-006), `r2.dev` 서브도메인 기반 public URL 반환(FR-008).
- `apps/backend/src/modules/file/r2.config.ts` (신규): `R2_ACCOUNT_ID`·`R2_ACCESS_KEY_ID`·`R2_SECRET_ACCESS_KEY`·`R2_BUCKET`·`R2_PUBLIC_BASE_URL` `ConfigModule.forFeature`.
- `apps/backend/src/modules/file/file.module.ts` (수정): `FILE_STORAGE` provider 를 `useClass`(고정) → `useFactory`(env `FILE_STORAGE` 기반, `r2`\|기본값 stub)로 전환(ADR-005).
- `apps/backend/package.json` (수정): `@aws-sdk/client-s3`·`@aws-sdk/s3-request-presigner` 신규 의존성 추가.
- `apps/backend/.env.example` (수정): `PAYMENT_PROVIDER`·`FILE_STORAGE`·`INICIS_*`(5종)·`R2_*`(5종) 신규 항목 추가.
- `apps/backend/test/static/inicis-decimal.spec.ts` (신규): SC-015 — 결제·환불 신규 코드에 Prisma `Decimal` 만 사용(float/number 리터럴 금지) 정적 검증.
- `apps/backend/test/static/inicis-idempotency.spec.ts` (신규): SC-006 — charge·refund 페이로드에 멱등성 키 포함 정적 검증.
- `apps/backend/test/static/payment-outbox-invariant.spec.ts` (신규): SC-014 — 결제/환불 완료(성공) 상태 변경이 outbox 기록 없이 처리되는 경로가 없음을 정적 검증(PG 실패 `failed` 기록은 outbox 대상 제외).
- `apps/backend/test/static/provider-env-switch.spec.ts` (신규): SC-008 — env 전환만으로 sandbox↔운영/stub↔real 자격증명이 교체됨을 코드 변경 없이 확인.
- `apps/backend/test/static/package-no-aws.spec.ts` (수정): allowlist 정밀화 — `@aws-sdk/client-s3`·`@aws-sdk/s3-request-presigner`(P-002 명시 허용, S3 호환 R2 클라이언트)를 AWS 금지 규칙의 예외로 반영, 기존 SC-051(v1.0.0/003) 유지.

**후속 작업 시 주의사항**:
1. **이니시스 API 구체값 [TO-VERIFY]**: 정확한 엔드포인트·서명 알고리즘·공용 테스트 상점ID(sandbox MID)는 이니시스 개발자센터 공식 문서로 실제 확인이 필요하다(파이프라인 내 WebFetch 미제공으로 미확인). 사용자가 sandbox 크레덴셜을 준비하면 `test/test-cases.md` 옵션A 절차(SC-001~004·010·011·013)를 실행한다.
2. **실 MID 미발급**: 사용자 사업자 계약이 진행 중이며, 실 운영(prod MID) 전환은 본 spec 범위 외 후속 과제다(ASM-003).
3. **R2 계정 준비 필요**: Cloudflare 계정·버킷·API 토큰(`R2_*`)은 사용자가 Development 착수 전 별도 준비했다(`test/test-cases.md` "사전 준비(공통)" 절차 참조).
4. **GAP-021-02 완전 해소**: 표준결제창 인증토큰(`authToken`) 배선이 `CreatePaymentDto`→`PaymentController`→`PaymentService`→`gateway.charge()` 전 구간 완결됐다(5b 코드 Read 확인). 잔존: `authUrl`(결제창 동적 승인 URL)은 DTO 에 여전히 미노출 — 이 흐름이 필요하다고 확정되면 별도 검토(`test/coverage-gap.md` 카테고리 (4), 비차단).
5. **부분환불 user-facing 엔드포인트는 범위 외**(ADR-004) — 게이트웨이 구현체 레벨(`IniisisPaymentGateway.refund`)만 부분금액을 지원하며, 컨트롤러·서비스 레벨 부분환불 엔드포인트 신설은 필요 시 별도 spec 으로 진행한다.
6. **020 파일 바이너리 이관 후속 spec 필요 여부 확인**: 020-data-migration-cutover 는 "R2 실연동 완료 후"를 전제로 레거시 파일 바이너리 이관을 범위 외로 이월했다(020 CHANGES.md 참조). 본 spec(021) 완료로 이 전제가 충족되었으므로, 레거시 파일 바이너리 이관을 별도 후속 spec 으로 진행할지 여부를 **main session 이 사용자에게 확인 필요**(020 스펙 완료 시점 판단 대기 사항).
7. **context.md/infra.md 실연동 반영 갱신 필요**: `GAP-021-03`(gaps.md, OPEN) — context.md §2 file 모듈·§3.4 외부연동, infra.md §3.4·§5·§6·§7 이 여전히 "실 R2/PG 연동은 후속" 표현으로 남아있어 021 완료 사실과 불일치한다. Retrospective Agent 처리 위임.
8. **DIFF-021 base 혼재 주의(PROC-016-01)**: 선행 020-data-migration-cutover 가 본 spec 시작 시점에 미커밋 상태였다. 아래 DIFF 문서의 "base 혼재 주의" caveat 참조.

---

## [020-data-migration-cutover] 구현 완료

> v1.1.0 의 스무 번째 차수 — 001~019 로 18개 도메인 모듈 기능 개발이 완료되었으나 부재했던
> **레거시 AWS RDS(18개 서비스별 인스턴스) → 신규 Fly Postgres(8스키마 33테이블) 데이터 이관·
> 컷오버 절차**를 설계·도구화한다. 신규 앱 도메인 코드 변경은 0건(out-of-band) — 산출물은
> 이관 도구(`scripts/migration/`)·런북·매핑 명세·정적 검증 테스트다.
>
> **핵심 설계(ADR-001~010, plan.md)**: 스테이징 기반 ETL(동일 Fly Postgres 인스턴스 내
> `migration_staging` 임시 스키마, ADR-001) + Fly one-off machine 러너(ADR-002) + DB
> read-only 하드 차단(ADR-003) + 델타 3분기(append-only 워터마크/updatedAt 워터마크/timestamp
> 부재 full re-copy, ADR-004) + 위상순서 UPSERT 로드(users→products→commerce→orders→
> payments→settlements→admin→files, ADR-005) + count·Decimal sum·sample checksum·anti-join
> 4종 검증 하네스(ADR-006) + PoNR 이전 트래픽 재지정 롤백(역이관 없음, ADR-007) + 금전
> 레코드 런타임 결제 경로 우회 직접 삽입(ADR-008) + TLS sslmode=require(ADR-009) + 구조적
> 로그+`verification_runs` 감사 테이블(ADR-010). 컷오버는 60분 윈도우(NFR-001) 내 빅뱅
> 일괄 전환이며, 검증·GO/NO-GO 판단은 50분 이내 완료해야 한다(NFR-005).
>
> **산출물**: `scripts/migration/MAPPING-SPEC.md`(33테이블 필드 단위 매핑표 + ephemeral 4종
> 스킵 정책 + 비-1:1 변환 규칙 4건)·`sql/00_staging_ddl.sql`(스테이징+`verification_runs`
> DDL)·`sql/10_transform.sql`(위상순서 UPSERT)·`sql/20_verify.sql`(검증 4종)·
> `lib/common.sh`·`extract.sh`·`load.sh`·`run.sh`(precopy/outbox-check/cutover/rollback
> 서브커맨드)·`config.example.env`·`RUNBOOK.md`(10개 필수 체크포인트)·
> `PRE-ASSESSMENT.md`(NFR-005 게이트)·`queries/extract/*.sql.template`(30개, extract.sh
> 스캐폴드 자동생성) + 정적 테스트 3스위트(`migration-mapping.spec.ts`·
> `migration-config.spec.ts`·`migration-runbook.spec.ts`, 54건 전PASS).
>
> **검증 방식(옵션 A)**: 실 레거시 AWS RDS 접근이 필요한 SC(SC-001·002·004·005·006·007·009
> 일부·016·020·021·022, 12건)는 파이프라인 내 자동 실행 불가 — 산출물이 실행 절차를 제시하고
> 사용자가 실 환경에서 실행 후 결과를 전달하는 계약으로 채택(spec.md "사후 검증 활동 실행
> 방식"). 5b 가 12개 계약 전건을 실 산출물(run.sh·DDL) 대조로 완결성 검증(거짓 green 없음).
> SC-001~022 전 22건 매핑 완료 — 자동-PASS 14건(SC-003/009 는 정적+옵션A 혼합 중복집계 포함)
> + 옵션A-계약검증 12건. 미커버 SC 는 spec.md 설계상 옵션A 방식이며 결함 아님.
>
> base `1dd5132`(019 완료 커밋) → working tree(미커밋). 변경 추적: 신규(untracked)
> `scripts/migration/` 전체(42 파일, +2,938줄) + `apps/backend/test/static/migration-*.spec.ts`
> 3개(+440줄) + `.gitignore` 수정(+4/-0, `scripts/migration/config.env`·`migration-run/`
> 커밋 방지). **신규 npm 의존성 0건**(표준 `pg_dump`/`psql`/`\copy` CLI + 기존 `pg` 재사용).
> **apps/backend 도메인 코드(src·prisma) 변경 0건** — `git diff 1dd5132 -- apps/backend/src
> apps/backend/prisma` 기준 무변경. 선택 단계: Database Design Agent Y(매핑 명세·변환/검증
> SQL 산출, GAP-020-01 해소)·Deploy/Security/Performance Agent Y(본 Docs 단계 다음 순서대로
> 실행 예정).
>
> **후속 작업 시 주의사항**:
> 1. **레거시 실 DDL [TO-VERIFY]**: `MAPPING-SPEC.md`·`extract.sh`·`queries/extract/*.sql.template`
>    의 레거시측 컬럼명·테이블명·PK 타입은 전부 `[TO-VERIFY]` 마커 상태다(레거시 AWS 접근이
>    파이프라인 밖에 있어 지어내지 않음, spec.md 옵션 A 원칙). 실제 이관 실행 전 사용자/오너가
>    레거시 실 스키마를 대조하여 채워야 동작한다.
> 2. **`products.variants` SKU 가정 (MAPPING-SPEC §8-3, [TO-VERIFY])**: 레거시도 이미 SKU
>    (옵션 조합) 단위 1행 구조라고 가정하고 1:1 매핑했다. 레거시가 `product_options`+
>    `variant_option_values` 분리 구조라면 `10_transform.sql`에 조인 추가가 필요하다(현재
>    SQL 에는 미포함) — 확인 후 T001(매핑 명세) 재작업 대상.
> 3. **미완 선행 조건**: 실 PG 연동(`PaymentGatewayPort` 는 여전히 stub)·실 R2 연동
>    (`FILE_STORAGE` 는 여전히 `StubFileStorage`)은 본 spec 과 독립된 별도 후속 spec 이다.
>    실 파일 바이너리 이관은 R2 연동 완료 후 별도 진행(FR-017/SC-019 는 메타데이터만 포함).
>    레거시 `payment_outbox` pending=0 드레인(ADR-008)이 컷오버 실행의 전제 조건이다.
> 4. **Fly Postgres HA 미결정 (`infra.md §8`)**: 컷오버 시점 가용성 요구 수준에 따른 HA 도입
>    여부는 본 spec 이 강제하지 않으며 별도 결정 필요(로드맵 6단계 이전 결정으로 기 플래그됨).
> 5. **GAP-020-02(context.md §4 정정, OPEN)**: `FileAsset` 물리 테이블명은 `files.files`
>    (`file_assets` 아님, `schema.prisma` L782-783 `@@map`/`@@schema`). `context.md §2/§4`가
>    `file_assets`로 오표기 중 — 본 spec 산출물(`MAPPING-SPEC.md`·`sql/*.sql`)은 실측 물리
>    테이블명(`files.files`)을 사용해 이 문제를 회피했다. `gaps.md` GAP-020-02/GAP-020-03
>    참조(Retrospective 처리 대기).

## [019-security-quality-followups] 구현 완료

> v1.1.0 의 열아홉 번째 차수 — 017-seller-admin-read-apis·018-auth-security-hardening 의
> Security/Performance Agent 감사가 Low~Informational(비블로킹)로 남긴 코드 수준 후속 부채
> 4건(SEC-017-01·GAP-017-03·SEC-018-02·SEC-018-03, `context.md §6` 누적분)을 해소한다.
> (1) 트랙 1 — 관리자·판매자 cursor 목록 4개 엔드포인트(`GET /admin/sellers/pending`·
> `/admin/users`·`/admin/audit-logs`·`/sellers/me/products`)의 개별 `@Query()`+수동 `parseInt`
> 를 신규 `ListQueryDto`/`AdminSellerListQueryDto`(class-validator) 로 전환(FR-001~005) —
> `limit=abc` 등 비정수 입력이 500(NaN passthrough) 대신 400 을 반환. (2) 트랙 2 — `Product`에
> `sellerId` 선두, `Seller`에 `status` 선두 복합 인덱스 신규 추가(FR-006/007, 마이그레이션
> `20260705162400_add_product_seller_list_indexes`). (3) 트랙 3 — `AuthService.findEmail` 404
> 분기(미등록 전화번호)에 신규 `SecurityAuditLogger.findEmailNotFound`(마스킹+best-effort)
> 배선(FR-008~010) — enumeration 시도 탐지 사각 해소. (4) 트랙 4 — `app.module.ts` pino
> `redact: ['req.headers.authorization', 'req.headers.cookie']` 추가(FR-011/012) — HTTP 로그의
> JWT/쿠키 평문 노출 차단.
>
> **트랙 5(사용자 승인 옵션 A, 2026-07-05 17:12) — 사전 결함 통합 fix**: 5b 1차 검증이
> base commit(`62d14f9`) 대비 git diff 0 으로 확정한 003-commerce/018 기원 사전 결함 2건을
> 019 로 편입 수정(신규 FR/SC 없음, 기존 SC unblock 목적):
> - **GAP-019-03(P0, RESOLVED)**: `PrismaService.tx` getter 가 Prisma 6.19.3 클라이언트 생성자
>   Proxy 의 get-trap 으로 인해 비-트랜잭션 경로에서 `this` 가 delegate 미보유 원본 타깃에
>   바인딩되어 `tx.<model>` 접근이 전부 `undefined` 를 반환(SC-006 `admin/audit-logs` 500).
>   `prisma.service.ts`(`rootClient` 필드+`registerRootClient`)·`prisma.module.ts`(provider
>   shorthand→`useFactory` 자기참조 주입)로 해소. getter 시그니처·반환형·`runInTransaction`·
>   14개 repository 호출부 전부 불변.
> - **GAP-019-04(Medium, GET 목록분 RESOLVED)**: 018 이 도입한 전역 rate limit(20/60s)이 GET
>   목록/조회 라우트에 예외 없이 적용되어 100회 순차요청 perf e2e(`list-p95`·`products`)가
>   구조적으로 429 를 받던 회귀. GET 읽기/목록 8핸들러(`product.controller.ts` 5·
>   `admin.controller.ts` 3)에 메서드 레벨 `@SkipThrottle()` 부착으로 해소. mutating/auth
>   엔드포인트의 rate limit(NFR-001~006)은 불변.
>
> base `62d14f9`(018 완료 커밋) → working tree(미커밋). 변경 추적: `git diff 62d14f9 --
> apps/backend`(tracked 11 files, +224/-44) + 신규(untracked) 8개 파일(DTO 2·마이그레이션 2·
> 테스트 4, 총 572줄). **신규 npm 의존 0건**(class-validator·`@nestjs/throttler` 등 기존
> 라이브러리만 사용). **신규 Prisma 마이그레이션 1건**(순수 인덱스 추가, 데이터 변경 없음).
> 선택 단계: Database Design Agent Y(본 spec 에서 인덱스·마이그레이션 산출)·Deploy Agent N
> (신규 의존·배포 구성 무변경)·Security/Performance Agent Y(재감사 예정, 본 Docs 단계 다음).
>
> **known-limitation (GAP-019-05, Low, 사용자 결정 옵션 A — 문서화 후 완료, 2026-07-05
> 18:26)**: 전체 e2e 스위트(`--runInBand`, 26 suites) 실행 시 2건 잔존 FAIL —
> `test/auth.e2e-spec.ts::SC-027`(`/auth/login` 50회 순차요청 P95, NFR-002)·
> `test/auth-recovery.e2e-spec.ts::SC-017`(`/auth/forgot-password`, 018 spec). 근본원인은
> `THROTTLE_DEFAULT_LIMIT=20/60s`·`THROTTLE_FORGOT_PASSWORD_LIMIT=5/60s`(둘 다 NFR-001/003
> 의도된 보안 동작)와 해당 e2e 파일의 다회 순차 요청 설계 간 **산술적 충돌**이다. **production
> 정상**(회귀 아님) — `auth.controller.ts`·`throttle.constants.ts`·두 테스트 파일 전부
> `git diff 62d14f9`=0(T016/T017 무관, 019 신규 코드 아님). 해소 경로는 production 수정이
> 아니라 **테스트 하네스 재설계**(예: 테스트별 `ThrottlerStorage` 격리/리셋, 요청 수를 quota
> 이하로 재설계)이며 본 spec 의 Test Authoring Contract(§F 마이그레이션 2건 한정) 범위 밖이라
> 별도 후속 spec 미생성하고 알려진 제약으로 남긴다. spec.md **SC-017**(전체 스위트 100% PASS)
> 은 이 known-limitation 하에 유예됨 — 전체 125/127 PASS, production 결함 0, 회귀 0.
>
> **tasks.md 정합성 참고**: T017 완료 기준(b)의 `test/auth-recovery.e2e-spec.ts(SC-017/018)`
> 언급은 5b 재검증으로 근본원인 오귀속(overreach)임이 확인되었다 — 해당 FAIL 은 T017 이 해소한
> GET 목록 default throttle 이 아니라 `/auth/forgot-password` 전용 named throttler 쿼터
> 소진이 원인이며, T017 의 GET-only 설계로는 애초에 해소 대상이 아니었다(GAP-019-04 상세 참조).
> tasks.md 문서 자체 수정은 Design Agent 소관(본 Docs 단계는 문서 정합화 기록만 남김).

**변경 파일**:

백엔드 — 신규:
- `apps/backend/src/shared/dto/list-query.dto.ts` (16줄): 공유 `ListQueryDto`(`cursor?`·`limit?`,
  class-validator) — `ListProductsDto` 패턴 복제
- `apps/backend/src/modules/admin/dto/admin-seller-list-query.dto.ts` (17줄):
  `AdminSellerListQueryDto extends ListQueryDto`(`status?`·`q?` 추가, ADR-002 회귀 방지 4필드)
- `apps/backend/src/shared/prisma/prisma.service.spec.ts` (88줄, T018): `registerRootClient`
  delegate 복원·미주입 fallback 회귀 방지 unit(SC-006·SC-017)
- `apps/backend/test/list-query-dto.e2e-spec.ts` (243줄, SC-001~006): 4엔드포인트 DTO 검증
  통합 테스트(400/200 케이스)
- `apps/backend/test/pino-redact.e2e-spec.ts` (131줄, SC-014·015): `stdout.write` spy 기반
  Authorization/Cookie redact 검증(GAP-019-01 하네스 선례 해소)
- `apps/backend/test/static/list-index.spec.ts` (65줄, SC-007·008): `schema.prisma` 텍스트
  파싱 기반 인덱스 존재 정적 검증
- `apps/backend/prisma/migrations/20260705162400_add_product_seller_list_indexes/
  migration.sql`(7줄)·`rollback.sql`(5줄): `Product.sellerId`·`Seller.status` 복합 인덱스 2건
  (Database Design Agent 산출)

백엔드 — 수정:
- `apps/backend/prisma/schema.prisma` (+4): `Product`에
  `@@index([sellerId, createdAt(sort: Desc), id(sort: Desc)])`, `Seller`에
  `@@index([status, createdAt(sort: Desc), id(sort: Desc)])` 추가
- `apps/backend/src/modules/admin/admin.controller.ts` (+37/-변경): `listPendingSellers`·
  `listUsers`·`listAuditLogs` 3메서드 개별 `@Query()`+`parseInt` → DTO 단일 인자 전환 +
  3핸들러 `@SkipThrottle()`(T017)
- `apps/backend/src/modules/product/product.controller.ts` (+14): `listMyProducts` DTO
  전환(`parseInt` 제거) + GET 5핸들러(`listCategories`·`listMyProducts`·
  `getMyProductDetail`·`listPublic`·`getDetail`) `@SkipThrottle()`(T017)
- `apps/backend/src/modules/auth/auth.service.ts` (+1): `findEmail` 404 분기에
  `securityAuditLogger.findEmailNotFound(phone)` 호출 삽입(성공 경로·시그니처 불변)
- `apps/backend/src/shared/security/security-audit.logger.ts` (+12): `findEmailNotFound`
  신규 메서드(기존 3종과 동일 best-effort try/catch 패턴)
- `apps/backend/src/app.module.ts` (+1): `LoggerModule.forRoot({ pinoHttp })` 에
  `redact: ['req.headers.authorization', 'req.headers.cookie']` 추가
- `apps/backend/src/shared/prisma/prisma.service.ts` (+17/-2, T016): `rootClient` 필드+
  `registerRootClient` 신규, `get tx()` fallback 체인
  `als.getStore()?.client ?? this.rootClient ?? (this as unknown as TxClient)` 로 확장
- `apps/backend/src/shared/prisma/prisma.module.ts` (+11/-1, T016): `providers` shorthand →
  `useFactory`(팩토리가 자신을 `registerRootClient` 로 자기참조 등록), `@Global`·`exports` 불변
- `apps/backend/src/modules/admin/admin.controller.spec.ts` (+34/-변경, §F): positional-arg
  호출 → DTO 객체 인자 마이그레이션(T014)
- `apps/backend/src/modules/auth/auth.service.spec.ts` (+88, §F+SC-011/013):
  `mockSecurityAuditLogger.findEmailNotFound` 추가 + 신규 테스트
- `apps/backend/src/shared/security/security-audit.logger.spec.ts` (+49, SC-012/013):
  `findEmailNotFound` 마스킹·best-effort 테스트

**후속 작업 시 주의사항**:
- **GAP-019-05(Low, known-limitation)**: `test/auth.e2e-spec.ts::SC-027`·
  `test/auth-recovery.e2e-spec.ts::SC-017` 는 `--runInBand` 전체 스위트 실행 시 rate-limit
  quota 산술 충돌로 상시 FAIL 한다(production 정상, 회귀 아님). CI/로컬에서 전체 스위트
  100% green 을 기대하지 말 것 — 알려진 2건이다. 해소하려면 별도 spec 에서 두 e2e 파일의
  테스트 하네스(quota 격리/리셋 또는 요청 수 재설계)를 다뤄야 한다.
- **context.md §6 갱신 필요**: SEC-017-01(L240)·SEC-018-02(L255)·SEC-018-03(L256) 3개 행을
  "RESOLVED (019)" 로 전이, §6 헤더 테스트 카운트(L22) 갱신, GAP-019-05 신규 행 추가 —
  `gaps.md` GAP-019-02 에 구체 갱신 문구 기록(Retrospective Agent 처리 위임).
- **GAP-005-03(마이그레이션 드리프트, accepted)** 무관 — 019 마이그레이션은 순차 누적이라
  기존 accepted 결정에 영향 없음.
- **SEC-018-01(Medium, rate limit 헤더 신뢰 미검증)** 은 본 spec 범위 외로 잔존(§범위 외) —
  운영 배포·infra.md 문서화가 필요한 별도 항목.

---

## [018-auth-security-hardening] 구현 완료

> v1.1.0 의 열여덟 번째 차수 — **`context.md §6` 에 013~016 스펙의 Security Agent 감사가
> Medium/Low 취약점으로 판정하여 "후속 위임(Retrospective)"으로 누적시킨 auth 도메인 보안 부채
> 4건(SEC-002~004 계열, GAP-013-09~11·GAP-014-01·GAP-014-06)을 하나의 보안 하드닝 릴리즈로
> 해소**: (1) 트랙 1 — `@nestjs/throttler` 전역 rate limit 도입(FR-001~003, NFR-001~006):
> 전역 기본 IP당 20회/60초 + 고위험 5개 엔드포인트(`social-login` 10·`naver/state` 20·
> `forgot-password` 5·`find-email` 5·`reset-password` 10) 개별 override, `GET /health` 는
> `@SkipThrottle()` 로 예외. (2) 트랙 2 — Fly.io 프록시 실 클라이언트 IP 식별(FR-004,
> NFR-008): `main.ts` `app.set('trust proxy', 1)` + `FlyThrottlerGuard.getTracker`
> (`Fly-Client-IP`→`X-Forwarded-For`→`req.ip` 폴백). (3) 트랙 3 — 소셜 신규가입 path 3c
> 원자화(FR-005): `SocialAuthService.login()` 의 `createUser`+`createSocialAccount` 를
> `runInTransaction` 으로 래핑(P2002 동시성 폴백 catch 는 트랜잭션 외부 유지, SC-011 회귀 방지).
> (4) 트랙 4 — 비밀번호 재설정 세션 폐기 원자화(FR-006): `revokeAllRefreshTokensByUser` 를
> tx-aware(`prisma.tx`)로 전환 후 `markOtpConsumed` 와 단일 `runInTransaction` 으로 통합.
> (5) 트랙 5 — 보안 감사 로그 3종(FR-007~010, NFR-009): 신규 `SecurityAuditLogger`
> (`otpVerificationFailed`·`rateLimitExceeded`·`findEmailAccessed`, 전 메서드 best-effort
> try/catch)·신규 `maskPhone` 유틸(뒤 4자리만 노출).
>
> base `b3f427d`(017 완료 커밋) → working tree(미커밋, 무관 chore 혼재 없음 — clean base).
> 변경 추적: `git diff b3f427d -- apps/backend`(tracked 17 files, +529/-25) + `pnpm-lock.yaml`
> (+16, `@nestjs/throttler` 락). 신규(untracked) 파일 12건(`shared/security/` 8개 828줄 +
> e2e/static 테스트 4개 464줄, 총 12개 994줄)은 git add 후 별도 커밋에 포함 예정.
> **신규 npm 의존 1건**(`@nestjs/throttler` ^6.5.0, 인-메모리 스토리지 — NFR-007/P-003 준수,
> Redis 등 외부 저장소 미도입). **신규 Prisma 마이그레이션 없음**(데이터 모델 변경 없음, 트랜잭션
> 경계 조정만). 선택 단계: Database Design Agent·Deploy Agent·Performance Agent 비활성
> (selection-phases.md N — 스키마/배포구성/성능수치NFR 없음). **Security Agent 는 Y 판정으로
> 본 Docs 단계 다음 활성 실행 예정**(spec 자체가 auth 보안 하드닝이며 선행 미해소 보안 부채
> 재감사가 목적 — 신규 rate limit 가드의 XFF 스푸핑 표면, 트랜잭션 경계, 감사 로그 PII 마스킹
> 완결성 검토).

**변경 파일**:

백엔드 — 신규 (`shared/security/` 공통 인프라 모듈):
- `apps/backend/src/shared/security/throttle.constants.ts` (25줄): rate limit 임계값 상수 6종(`THROTTLE_TTL_MS`=60_000ms·`THROTTLE_DEFAULT_LIMIT`=20·`THROTTLE_SOCIAL_LOGIN_LIMIT`=10·`THROTTLE_NAVER_STATE_LIMIT`=20·`THROTTLE_FORGOT_PASSWORD_LIMIT`=5·`THROTTLE_FIND_EMAIL_LIMIT`=5·`THROTTLE_RESET_PASSWORD_LIMIT`=10) 단일 소스
- `apps/backend/src/shared/security/client-ip.util.ts` (31줄): `resolveClientIp()` — `Fly-Client-IP`→`X-Forwarded-For`[0]→`req.ip` 폴백 순수 함수(throttler 라이브러리 미의존 테스트 seam)
- `apps/backend/src/shared/security/fly-throttler.guard.ts` (45줄): `FlyThrottlerGuard extends ThrottlerGuard` — `getTracker`(resolveClientIp 위임)·`throwThrottlingException`(WARN 로깅 후 super 호출)
- `apps/backend/src/shared/security/security-audit.logger.ts` (47줄): `SecurityAuditLogger`(PinoLogger 래퍼) — `otpVerificationFailed`·`rateLimitExceeded`·`findEmailAccessed` 3종, 전 메서드 best-effort try/catch(FR-010)
- `apps/backend/src/shared/security/security.module.ts` (27줄): `ThrottlerModule.forRoot` + `APP_GUARD`(FlyThrottlerGuard) + `SecurityAuditLogger` provide/export
- `apps/backend/src/shared/security/client-ip.util.spec.ts` (117줄, SC-009)
- `apps/backend/src/shared/security/security-audit.logger.spec.ts` (184줄, SC-014·015·016·017·019)
- `apps/backend/src/shared/security/throttler-exception.spec.ts` (54줄, SC-007)

백엔드 — 신규 (테스트):
- `apps/backend/test/rate-limit.e2e-spec.ts` (201줄, SC-001~006): 전역/라우트별 429 통합 검증
- `apps/backend/test/auth-reset-atomicity.e2e-spec.ts` (144줄, SC-013): revoke 실패 시 비밀번호 변경 롤백 검증
- `apps/backend/test/static/rate-limit-trust-proxy.spec.ts` (48줄, SC-008): trust proxy·tracker 정적 검증
- `apps/backend/test/static/rate-limit-no-redis.spec.ts` (71줄, SC-018): `package.json` 신규 캐시/저장소 의존 0건 정적 검증

백엔드 — 수정:
- `apps/backend/package.json` (+1): `@nestjs/throttler` ^6.5.0 신규 의존
- `apps/backend/src/app.module.ts` (+2): `SecurityModule` 임포트(전역 가드 활성)
- `apps/backend/src/health/health.controller.ts` (+2): `GET /health` 에 `@SkipThrottle()` (Fly 헬스체크 폴링 보호)
- `apps/backend/src/main.ts` (+7/-1): `NestExpressApplication` 타입 지정 + `app.set('trust proxy', 1)`(ADR-004, Fly 엣지 첫 홉 신뢰)
- `apps/backend/src/modules/auth/auth.controller.ts` (+14): 5개 라우트(`social-login`·`naver/state`·`forgot-password`·`reset-password`·`find-email`)에 `@Throttle({ default: { ttl, limit } })` 데코레이터 부착
- `apps/backend/src/modules/auth/auth.module.ts` (+2): `SecurityModule` 임포트
- `apps/backend/src/modules/auth/auth.repository.ts` (+3/-1): `revokeAllRefreshTokensByUser` 를 `this.prisma.refreshToken`(root) → `this.prisma.tx.refreshToken`(tx-aware) 전환
- `apps/backend/src/modules/auth/auth.service.ts` (+25/-소량): `resetPassword` 의 `markOtpConsumed`+`revokeAllRefreshTokensByUser` 를 단일 `runInTransaction` 으로 통합, OTP 불일치/find-email 호출부에 `SecurityAuditLogger` 연동, 생성자에 `PrismaService`+`SecurityAuditLogger` 추가 주입(하위 호환 — 시그니처·반환형·예외 계약 불변)
- `apps/backend/src/modules/auth/auth.util.ts` (+13): `maskPhone(phone)` 신규(뒤 4자리만 노출, NFR-009)
- `apps/backend/src/modules/auth/social-auth.service.ts` (+34/-25): `login()` path 3c(`createUser`+`createSocialAccount`)를 `PrismaService.runInTransaction` 으로 래핑, 생성자에 `PrismaService` 추가 주입, P2002 폴백 catch 는 트랜잭션 외부 유지(SC-011 회귀 방지)
- `apps/backend/src/modules/auth/auth.service.spec.ts` (+194): SC-012·014·016·017 신규 + GAP-018-02 정정([재작업] SC-017 wiring 2건을 실 `SecurityAuditLogger`+`PinoLogger.warn` throw mock 조합으로 재작성)
- `apps/backend/src/modules/auth/auth.util.spec.ts` (+72): `maskPhone` 테스트
- `apps/backend/src/modules/auth/social-auth.service.spec.ts` (+128, SC-010·011) 및 `social-auth.service.{autolink-policy,naver-autolink-exclusion,naver-state,naver}.spec.ts` (각 +14): `PrismaService` mock 추가에 따른 기존 선행(013·014·015·016) 테스트 셋업 갱신(회귀 방지)
- `pnpm-lock.yaml` (+16): `@nestjs/throttler` 락 반영

산출물 문서(참조, 코드 아님):
- `docs/specs/v1.1.0/018-auth-security-hardening/{spec,planning,design,test}/*.md`: spec.md·plan.md·research.md·tasks.md·test-cases.md·coverage.md·coverage-gap.md·test-report.md·gaps.md·assumptions.md·spec-input.md·selection-phases.md (파이프라인 표준 산출물)

**검증** (5b Test Agent EXECUTION [재작업 재검증], coverage.md v1.2/test-report.md v1.1 기준):
- 백엔드 전체: `pnpm --filter backend typecheck` 0 error, unit **39 suites/397 tests 전건 PASS**(회귀 0), static(rate-limit-trust-proxy·rate-limit-no-redis) 2 suites/4 tests PASS, e2e(rate-limit·auth-reset-atomicity, 옵션 A — 로컬 docker-compose PostgreSQL) 2 suites/7 tests PASS
- SC-001~020 **전건 PASS(20/20)**. deferred 없음(옵션 A 로 통합 SC 전건 in-pipeline 실행)
- 설계 문서(plan.md ADR-001~010) 정합성 불일치 0건
- STALE_SC 0건(PATCH-A18 전수 재검증 — 변경/신규 14개 spec 파일, 018 범위 밖 SC 인용은 전건 `(vX.Y.Z/NNN spec)` 출처 주석 보유)

**해결된 GAP**: GAP-018-02([B] 테스트 오류 — `auth.service.spec.ts` SC-017 wiring 2건이 `SecurityAuditLogger` 전체 mock 으로 production 도달 불가능 분기를 전제, plan.md Input 정합 방식으로 재작성하여 RESOLVED. production 코드 변경 없음).

**미해결 GAP / 후속 단계 위임** (Retrospective Agent 위임 / Security Agent 후속 판정 대상):
- **Security Agent 감사 (필수, 미실행)**: selection-phases.md Y 판정(spec 자체가 auth 보안 하드닝). 신규 rate limit 가드·트랜잭션 경계 확장·감사 로그 3종의 최소권한/인가 축 재감사, GAP-018-01(trust proxy 설정)의 XFF 스푸핑 표면(ADR-004 "첫 홉만 신뢰"의 실제 배포 검증) 포함. 본 Docs 단계 다음으로 이어질 단계.
- **Deploy Agent·Performance Agent·Database Design Agent**: selection-phases.md N 판정(배포구성/성능수치NFR/스키마 변경 없음) — 본 spec 에서는 비활성.
- **GAP-018-01 (OPEN, 문서-갱신-필요, Spec Agent 등록·Design Agent 코드 지점 확정·Docs Agent 코드 검증 완료)**: `infra.md` §2(인프라 토폴로지)·§8(알려진 인프라 제약)에 Fly.io 클라이언트 IP 전달 방식(`Fly-Client-IP`/`X-Forwarded-For` 헤더, `trust proxy` 설정 필요성)이 미기재. 코드 검증 완료 — `apps/backend/src/main.ts:11` `app.set('trust proxy', 1)`, `apps/backend/src/shared/security/client-ip.util.ts:7-31` `resolveClientIp` (Fly-Client-IP→XFF→req.ip 폴백) 실재 확인. `grep -n "trust proxy\|Fly-Client-IP\|X-Forwarded-For" .claude/docs/infra.md` 결과 0건(PATCH-A13 cross-check, 신규 도입 케이스 — 기존 표기 불일치 아님). Docs Agent 직접 수정 불가(agent-rules.md §3.1) — Retrospective Agent 위임.
- **GAP-018-03 (신규, 문서-갱신-필요, Docs Agent 발견)**: `context.md §6` "알려진 제약 및 기술 부채" 표의 4개 행 — 소셜 신규가입 경로 orphan user 위험(SEC-002/GAP-014-01)·소셜 로그인 아웃바운드 rate limit 부재(SEC-004/GAP-014-06)·auth reset-password IP rate limit 부재(SEC-002/GAP-013-09)·resetPassword refresh token revoke 비원자(SEC-003/GAP-013-10)·auth 보안 감사 로그 부재(SEC-004/GAP-013-11) — 가 본 spec(018)으로 전부 RESOLVED 되었다. 코드 검증: `apps/backend/src/modules/auth/social-auth.service.ts`(runInTransaction 래핑 확인)·`apps/backend/src/modules/auth/auth.service.ts`(단일 트랜잭션 통합·SecurityAuditLogger 호출 확인)·`apps/backend/src/shared/security/`(신규 rate limit 인프라 확인). `context.md §7` 갱신 이력에 018 항목 추가 및 §1 "현재 버전" 필드 갱신도 함께 필요. Docs Agent 직접 수정 불가 — Retrospective Agent 위임.

**후속 작업 시 주의사항**:
- **console/Flutter 클라이언트의 `429` 응답 UX 미처리**: 본 spec 은 서버 측 rate limit 만 구현했다. 클라이언트가 `429` 응답에 대한 재시도 안내·오류 메시지를 아직 처리하지 않으므로, 향후 UX 개선이 필요하면 별도 spec 으로 진행한다(spec.md "범위 외" 참조).
- **다중 인스턴스 확장 시 rate limit 상태 미공유**: 현재 인-메모리 스토리지(NFR-007)로 단일 Fly.io 인스턴스에서만 정확하다. 향후 다중 인스턴스로 확장 시 분산 스토리지 재검토가 필요하다(별도 spec 대상).
- **PROC-014 사후 운영 검증 4개 시나리오 (범위 외, 운영 배포 이후 수행)**: Fly.io 실제 프록시 헤더 동작 확인·정상 사용자 429 오탐 여부·소셜 신규가입 동시성 부하 시나리오·보안 감사 로그 볼륨/노이즈(spec.md "사후 운영 검증 피드백 사이클" 참조). 결함 발견 시 spec.md "배경 및 목적" 절 입력 또는 별도 patch spec 으로 처리.
- **Security Agent 완료 후 최종 gate 확정**: 본 spec 은 6단계(Docs) 완료 시점 기준이며, rate limit 가드·트랜잭션 경계·감사 로그의 최종 보안 판정은 후속 Security Agent 단계에서 확정된다.

## [017-seller-admin-read-apis] 구현 완료

> v1.1.0 의 열일곱 번째 차수 — **console 실통합 중 발견된 백엔드 계약 갭(BE-GAP-002~007) 6건 해소**:
> (1) admin/seller — 관리자 판매자 목록 API 확장(FR-001~003): 기존 `GET /admin/sellers/pending`
> 에 status(PENDING/APPROVED/REJECTED, 미지정 시 PENDING 하위호환)·cursor·limit·businessName 부분
> 일치 검색(q) query 를 추가하고 응답을 `SellerProfile[]` → `{items, nextCursor}` envelope 으로 전환
> (BE-GAP-002, breaking). (2) seller/product — 신규 `GET /sellers/me/products/:id`(FR-004~005):
> 소유 상품을 상태 무관(DRAFT 포함) ID 단건 상세 조회, variants·images 포함. 404(미존재)→403(비소유)
> 분기 순서로 `assertOwner` 재사용(IDOR 방어, BE-GAP-003). (3) `GET /sellers/me/products`(FR-006):
> cursor·limit 페이지네이션 추가 + envelope 화(BE-GAP-004, breaking). (4) 목록 응답 형태 통일
> (FR-007): (1)·(3) 두 목록 모두 기존 `GET /products` 와 동일한 `{items, nextCursor}` envelope 채택
> (BE-GAP-006, 신규 2개 목록에 한정 — 기존 소형 배열 목록은 불변). (5) inventory — 재고 응답 구조화
> (FR-008~009): `GET .../stock` 원시 숫자 → `{variantId, stock}`, `POST .../stock-in` void 응답
> → `{variantId, stock}`(입고 후 갱신값, 상태코드 200 불변)(BE-GAP-005, breaking). (6) user — 위시
> 리스트·최근 본 상품 상품 요약 조인(FR-010~012): `ProductService.getPublicSummaries()`(신규 공개
> DI 메서드, 단일 `in` 쿼리)로 title·price·thumbnailUrl 인라인 병합. 조회 불가(DRAFT/INACTIVE/삭제/
> 미존재) 상품 참조 항목은 제외하지 않고 `productAvailable:false`+`product:null` 로 유지(BE-GAP-007,
> additive, constitution P-001 모듈 경계 — user 모듈이 products 스키마 직접 쿼리 금지, NFR-004/SC-021
> 정적 검증).
>
> base `0196b9a`(015·016 완료 커밋) → working tree(미커밋). 변경 추적:
> `git diff 0196b9a -- apps/backend` (tracked modified 21 files, +983/-96). 신규(untracked) 파일 4건
> (테스트 3·DTO 1, 총 429줄)은 git add 후 동 커밋에 포함 예정. working tree 에 본 spec 과 무관한
> 미커밋 chore 3건(`fly.toml`·`apps/console/playwright.config.ts`·`docs/ops/social-login-setup.md`)이
> 공존하나 본 변경 파일 목록·DIFF-017 에서 명시적으로 제외했다(범위 밖).
> **신규 npm 의존 0건**(기존 NestJS·Prisma 스택 승계). **신규 Prisma 마이그레이션 없음**(모든 변경은
> 기존 테이블·컬럼 범위 내 응답 DTO/조회 로직 확장). 선택 단계: Database Design Agent·Deploy Agent
> 비활성(selection-phases.md). **Security Agent·Performance Agent 는 본 Docs 단계 다음으로 활성 실행
> 예정**(관리자 판매자 목록 PII 노출 표면·IDOR 3축 인가 감사 / NFR-001 P95 500ms 정적 리뷰+실측 검증) —
> 아래 "미해결 GAP" 참조.

**변경 파일**:

백엔드 — 수정:
- `apps/backend/src/modules/admin/admin.constants.ts` (+4): `DEFAULT_SELLER_PAGE_LIMIT=20`·`MAX_SELLER_PAGE_LIMIT=100` 신설
- `apps/backend/src/modules/admin/admin.controller.ts` (+22/-5): `listPendingSellers` 시그니처 확장(status·cursor·limit·q query), `AdminSellerListResponse` 반환
- `apps/backend/src/modules/admin/admin.service.ts` (+31/-4): 신규 `listSellers(status, cursor, limit, q)` → `SellerService.listSellers` 위임, limit 클램프
- `apps/backend/src/modules/admin/dto/admin-response.dto.ts` (+10): `AdminSellerListResponse {items, nextCursor}` 신설
- `apps/backend/src/modules/seller/seller.repository.ts` (+22): 신규 `listByStatusPaginated({status, cursor, take, q})`(businessName insensitive contains 검색)
- `apps/backend/src/modules/seller/seller.service.ts` (+15): 신규 공개 `listSellers({status, cursor, take, q})`(admin 소비, 기존 `listByStatus` 유지·비파괴)
- `apps/backend/src/modules/product/product.controller.ts` (+23/-3): `listMyProducts` cursor·limit 파라미터 추가, 신규 `GET products/:id` `getMyProductDetail` 라우트
- `apps/backend/src/modules/product/product.repository.ts` (+22/-2): `listBySeller` orderBy 2차키(`id desc`)·cursor·take 추가(cursor 안정성)
- `apps/backend/src/modules/product/product.service.ts` (+48/-2): 신규 `getMyProductDetail(userId, productId)`(404→403 분기, assertOwner 재사용), `listMyProducts` envelope 화, 신규 공개 `getPublicSummaries(productIds)`(단일 in 쿼리, Map 반환)
- `apps/backend/src/modules/inventory/inventory.controller.ts` (+9/-3): `getStock`→`getStockView` 위임, `stockIn` 반환값 그대로 전달
- `apps/backend/src/modules/inventory/inventory.service.ts` (+21/-3): 신규 `getStockView(variantId)`({variantId,stock}), `stockIn` 반환형 `void`→`InventoryStockView`(increment→appendLog→onAfterCommit→재조회→반환)
- `apps/backend/src/modules/user/dto/user-response.dto.ts` (+29/-3): `WishlistResponse`·`RecentViewResponse` 에 `productAvailable`·`product`(nullable `WishlistProductSummary`) 필드 추가
- `apps/backend/src/modules/user/user.module.ts` (+4/-1): `imports` 에 `ProductModule` 추가(신규 DI, 순환 없음 확인)
- `apps/backend/src/modules/user/user.service.ts` (+48/-5): `listWishlist`·`listRecentViews` enrichment — `ProductService.getPublicSummaries()` DI 호출 후 `productAvailable`+`product` 병합 공통 헬퍼
- 테스트 파일(§F 마이그레이션·신규 SC 반영, 회귀 0): `admin.service.spec.ts`(+162/-10)·`inventory.controller.spec.ts`(+27/-11)·`inventory.service.spec.ts`(+99/-4)·`product.service.spec.ts`(+215/-22)·`user.service.spec.ts`(+140/-2)·`test/banner-admin.e2e-spec.ts`(+10/-2, SC-011 envelope 회귀 방어)·`test/static/auth-required-guards.spec.ts`(+22/-14, SC-019 신규·확장 엔드포인트 반영)

백엔드 — 신규:
- `apps/backend/src/modules/admin/admin.controller.spec.ts` (104줄, 신규): SC-020 가드 메타데이터 검증
- `apps/backend/src/modules/inventory/dto/inventory-stock-response.dto.ts` (10줄, 신규): `InventoryStockResponse {variantId, stock}`
- `apps/backend/test/static/user-product-boundary.spec.ts` (109줄, 신규): SC-021 — user 모듈 products 스키마 직접 참조 0건 정적 검증
- `apps/backend/test/perf/list-p95.e2e-spec.ts` (206줄, 신규): SC-018 — P95 실측(admin/sellers/pending·sellers/me/products, 옵션 A)

산출물 문서(참조, 코드 아님):
- `docs/specs/v1.1.0/017-seller-admin-read-apis/{spec,planning,design,test}/*.md`: spec.md·plan.md·research.md·tasks.md·test-cases.md·coverage.md·coverage-gap.md·test-report.md·gaps.md·assumptions.md·spec-input.md·selection-phases.md (파이프라인 표준 산출물, 신규 12개 파일 1,741줄)

**검증** (5b Test Agent EXECUTION, coverage.md/test-report.md 기준):
- 백엔드 전체: `pnpm --filter backend typecheck` 0 error, unit **36 suites / 366 tests 전량 PASS**(회귀 0), static(auth-required-guards/user-product-boundary/cross-schema/inventory-service-signature) 4 suites/25 tests PASS, integration(banner-admin e2e·perf/list-p95) 2 suites/10 tests PASS
- SC-001~021 **전건 PASS(21/21)**. SC-018(P95) 실측: `GET /admin/sellers/pending` P95=3ms, `GET /sellers/me/products` P95=4ms(임계값 500ms 대비 여유 큼, 사용자 옵션 A — 로컬 docker-compose 상시 가동 확인 후 5b 직접 실측)
- 설계 문서(plan.md §1~5, ADR-001~008) 정합성 불일치 0건
- Breaking change 잔여 참조 검증: `grep -rn "\.listPendingSellers("` 서비스 레벨 호출 0건(컨트롤러 핸들러명은 라우트 경로 유지 목적으로 존치, breaking 대상 아님)
- STALE_SC 27건(§F 마이그레이션 파일의 선행 spec(002/003/004) SC 인용 비정형 문구) 발견 → 사용자 결정(옵션 A, 016 선례 동일)에 따라 6개 파일 17개 위치를 `(vX.Y.Z/NNN spec)` 정규식 형식으로 grep+Edit 일괄 정정(production 코드·테스트 로직·기대 단언 불변, 주석만 변경) → 재실행 unit 366/366·static+e2e 33/33 재확인, STALE_SC 0건

**해결된 GAP**: 없음(Design Agent gaps.md — 공백 0건 판정, GAP-017-01 은 "오류 아닌 갱신 권고"로 신규 등록. 5b Test Agent EXECUTION gaps: NONE).

**미해결 GAP / 후속 단계 위임** (Retrospective Agent 위임 / Security·Performance Agent 후속 판정 대상):
- **Security Agent 감사 (필수, 미실행)**: selection-phases.md Y 판정(NFR-002/003 인증·인가, FR-005 IDOR 방어, 관리자 판매자 목록 PII 노출 표면 3축 인가). 본 Docs 단계 다음으로 이어질 단계.
- **Performance Agent 정적 리뷰 (필수, 미실행)**: selection-phases.md Y 판정(NFR-001 P95 500ms). SC-018 은 5b 가 이미 실측 PASS 했으나, 신규 인덱스 부재 여부(`seller.status`·`product.sellerId` 조회 경로) 정적 리뷰는 별도 단계로 수행.
- **GAP-017-01 (OPEN, 문서-갱신-필요, Design Agent 등록)**: context.md §6 "위시리스트·최근 본 상품 productId cross-schema 고아 참조" 제약 항목에 "응답 레벨은 FR-012(productAvailable:false)로 부분 흡수됨(017)" 보강 필요. Docs Agent 직접 수정 불가(agent-rules.md §3.1) — Retrospective Agent 위임.
- **GAP-017-02 (신규, 문서-갱신-필요, Docs Agent 발견)**: context.md §2 "핵심 도메인 모듈 목록" 표의 admin/seller/product/inventory/user 5개 행이 본 spec 의 신규 조회 계약(관리자 판매자 목록 필터·검색·페이지네이션, 판매자 상품 상세/목록 페이지네이션, 재고 응답 구조화, 위시리스트/최근 본 상품 상품 요약 조인)을 반영하지 못한 상태다. §1 개요 스냅샷의 테스트 카운트(unit 255→366, 25→36 suites)도 갱신 필요. 코드 검증 완료(gaps.md GAP-017-02 참조). Docs Agent 직접 수정 불가 — Retrospective Agent 위임.
- **console 배포 순서 동기화 (범위 외, 운영 위임)**: FR-007(목록 envelope 통일)·FR-008~009(재고 응답 구조화)는 breaking change. `apps/console` 의 `seller/products`(실통합 배선됨)·재고 조회/입고 호출부는 이 응답 계약 배포 전에 함께 갱신되어야 회귀가 없다(spec.md "범위 외 §배포 순서 고려사항"). `admin/sellers`·`account/wishlist` 화면은 현재 미배선(플레이스홀더)이라 자유롭다.
- **PROC-014 사후 운영 검증 4개 시나리오 (범위 외, 운영 셋업 이후 수행)**: envelope 전환 프론트 회귀·재고 응답 소비·대량 데이터 커서 무한스크롤·조회 불가 상품 표시(spec.md "사후 운영 검증 피드백 사이클" 참조).

**후속 작업 시 주의사항**:
- **console 프론트 회귀 방지 필수 확인**: `GET /sellers/me/products`·`GET/POST /inventory/...` 응답 계약이 breaking 변경되었다. console 배선부가 신규 envelope/구조화 응답을 소비하도록 갱신되기 전까지는 배포 순서를 반드시 동기화해야 한다(console 측 작업은 본 spec 범위 밖).
- **admin/sellers 목록은 하위 호환 유지**: `status` 미지정 시 기존과 동일하게 PENDING 만 반환(SC-003). 응답 envelope 만 breaking(console admin/sellers 미배선으로 현재는 영향 없음).
- **Security·Performance Agent 완료 후 최종 gate 확정**: 본 spec 은 6단계(Docs) 완료 시점 기준이며, 관리자 판매자 목록의 IDOR/PII 노출 3축 인가 최종 판정과 신규 조회 경로 인덱스 정적 리뷰는 후속 선택 단계에서 확정된다.

---

## [016-naver-state-redirect-hardening] 구현 완료

> **[사후 정합화 2026-07-03 22:21]** 아래 본문은 6단계 Docs 시점 스냅샷이라 SC-014/015 를 "PENDING",
> Security 재감사를 "미실행"으로 서술한다. **이후 Security Agent 재감사가 완료되어 판정이 확정됐다**:
> `016/security/security-report.md` v1.1 — **SEC-015-02 RESOLVED · SEC-015-03 RESOLVED(코드 레벨)/잔존-권고**,
> `status: COMPLETE`, `gate: PASS`(Critical/High/Medium/Low 신규 0). 따라서 **SC-014·SC-015 = PASS**
> (`016/test/coverage.md` v1.1 정합화 반영). 문서-갱신 GAP-016-01~04 도 Retrospective 패치
> (PATCH-CXT-016-01~05)로 context.md·infra.md 에 **적용 완료**(`016/gaps.md` 전건 RESOLVED). 아래
> "미해결 GAP" 절의 Security 재감사 대기·문서 갱신 항목은 모두 종결됐으며, 잔존은 운영 셋업(네이티브
> 앱 배선·실 크레덴셜·redirect_uri 최종 확인)뿐이다.

> **base commit 주의**: 016 착수 시점에 v1.1.0/015 가 아직 커밋되지 않은 상태였다(working tree 공존).
> 따라서 아래 "변경 파일"·`DIFF-016-naver-state-redirect-hardening.md` 의 diff 는 base `6b64c24`(014 완료
> 커밋) 기준으로 **015+016 두 spec 의 누적 변경분**을 함께 포함한다. `auth.controller.ts`·
> `auth.module.ts`·`social-auth.service.ts`·`naver.provider.ts`·
> `social-auth.service.autolink-policy.spec.ts` 5개 파일과, 015 가 신규 생성한 3개 미추적 테스트 파일
> (`naver.provider.spec.ts`·`social-auth.service.naver.spec.ts`·
> `social-auth.service.naver-autolink-exclusion.spec.ts`)은 015 변경분과 016 변경분이 물리적으로
> 혼재한다. 아래 서술·라인 수는 **016 이 추가한 증분만**을 `docs/specs/v1.1.0/DIFF-015-naver-code-exchange.md`
> 에 기록된 015 기준치와 대조하여 best-effort 로 분리했다(정확한 016 단독 diff 는 015 완료 커밋 생성 후
> `git diff {015-완료-커밋}` 으로 재확정 필요 — 아래 "후속 작업 시 주의사항" 참조).

> v1.1.0 의 열여섯 번째 차수 — **네이버 code-exchange 보안 하드닝(SEC-015-02/03 백엔드 완결 조치)**:
> 015 가 재도입한 네이버 서버 authorization code + client_secret 교환 흐름에 대해, 6단계 Security Agent
> 재감사(security-report.md v1.1)가 잔존시킨 두 권고사항을 처리한다. (1) **SEC-015-02(Medium) —
> state(CSRF) 서버측 하드닝**: 신규 `POST /auth/naver/state`(익명) 엔드포인트가 `node:crypto
> randomBytes(32).toString('base64url')` 로 예측 불가능한 state 값을 발급하고(FR-001, NFR-002),
> `oauth_states` 테이블(신규, `users` 스키마)에 TTL(`NAVER_STATE_TTL_MIN=10분`, FR-002)과 함께 저장한다.
> `SocialAuthService.login()` 진입부(`providerImpl.verify` 호출 **이전**)에서 provider가 'naver'인 경우에만
> `OAuthStateService.consume()` 을 호출해 값 일치·미만료·미소비 여부를 검증하고(FR-003~004), 검증은 단일
> 조건부 `deleteMany({ where:{ state, provider, expiresAt:{gt:now} } })` 로 **확인과 1회성 소비를
> 원자화**(delete-on-consume, ADR-003)한다 — PostgreSQL row-level lock 에 위임하여 앱 레이어 Lock 없이
> Check-Then-Act 레이스를 차단한다(FR-005). 카카오·구글은 이 검증 분기에 진입하지 않아 기존 클라이언트
> 토큰 검증 흐름이 완전히 보존된다(FR-006, NFR-003). (2) **SEC-015-03(Low) — redirect_uri 조건부 지원**:
> `NaverProvider.verify()` 가 `NAVER_REDIRECT_URI` 환경변수를 optional 로 조회하여, 설정된 경우에만 토큰
> 교환 요청에 `redirect_uri` 파라미터를 추가한다(FR-007) — 미설정 시 015 의 기존 동작(파라미터 미포함)이
> 그대로 유지되는 **fail-safe 설계**(FR-008, 회귀 0). state 저장은 신규 외부 저장소(Redis 등) 없이 기존
> 단일 PostgreSQL 인스턴스의 신규 테이블 1개로 구현하여 constitution P-003(단일 DB 원칙)·NFR-004 를
> 충족한다(ADR-001 — Fly.io scale-to-zero 콜드 스타트·rolling deploy 인스턴스 불일치로 인한 in-memory
> 대안의 false rejection 위험을 구조적으로 회피).
>
> base `6b64c24`(014 완료 커밋, 015 와 공유) → working tree(미커밋). 변경 추적: 위 base commit 주의 참조.
> **신규 npm 의존 0건**(`node:crypto`·Prisma·`@nestjs/config` 전부 기존 의존성 재사용, SC-012). 신규
> 마이그레이션 1건(`20260703070000_add_oauth_states`, additive — 기존 테이블 무변경). 선택 단계:
> Database Design Agent 활성(oauth_states 스키마·마이그레이션·rollback.sql 산출, data-model.md). Security
> Agent 재감사는 본 Docs 단계 다음으로 이어진다(SC-014/015 최종 판정은 그 재감사 완료 후 확정 —
> coverage.md 는 PENDING 으로 위임 명시). Deploy/Performance Agent 비활성(신규 컨테이너·아웃바운드 없음,
> plan.md "배포 환경 영향"·"성능 게이트 판정" 절 근거).

**변경 파일** (016 고유 증분, 015 기준치 대조 후 분리 — 상세 근거는 `DIFF-016-naver-state-redirect-hardening.md` 참조):

백엔드 — 신규:
- `apps/backend/src/modules/auth/social/oauth-state.service.ts` (33줄): `OAuthStateService` — `issue(provider)`(난수 발급·TTL 계산·opportunistic 만료정리 후 INSERT), `consume(provider, state?)`(원자적 조건부 DELETE 위임)
- `apps/backend/src/modules/auth/social/oauth-state.service.spec.ts` (93줄, 신규 테스트): SC-001·002·010 매핑(발급·TTL 만료·예측불가 N=20)
- `apps/backend/src/modules/auth/social-auth.service.naver-state.spec.ts` (185줄, 신규 테스트): SC-003~006 매핑(state 검증 통과·거부(불일치/만료/미제공)·1회성 재사용 거부·kakao/google state 무관 통과)
- `apps/backend/prisma/migrations/20260703070000_add_oauth_states/migration.sql` (16줄, Database Design Agent 산출): `oauth_states` 테이블 CREATE(`state` UNIQUE, `@@index([expiresAt])`)
- `apps/backend/prisma/migrations/20260703070000_add_oauth_states/rollback.sql` (10줄, 참조용): DROP TABLE 수동 롤백 스크립트

백엔드 — 수정(016 고유분):
- `apps/backend/prisma/schema.prisma` (+15): `model OAuthState`(`users` 스키마, `@@map("oauth_states")`) 추가
- `apps/backend/src/modules/auth/auth.constants.ts` (+3): `NAVER_STATE_TTL_MIN = 10` 상수 추가(013 OTP 상수 파일 재사용)
- `apps/backend/src/modules/auth/auth.repository.ts` (+28): `createOAuthState`·`consumeOAuthState`(원자적 조건부 delete)·`deleteExpiredOAuthStates` 메서드 추가
- `apps/backend/src/modules/auth/dto/auth-response.dto.ts` (+6): `NaverStateResponse { state: string }` Swagger 응답 타입 추가
- `apps/backend/.env.example` (+2): `NAVER_REDIRECT_URI=` 항목 + 주석 추가(NFR-005, SC-013)
- `apps/backend/src/modules/auth/auth.controller.ts` (016 증분 약 +11): `@Post('naver/state')` `naverState()` 핸들러 추가(익명, `OAuthStateService.issue('naver')` 위임) — 015 가 이미 수정한 `dto.state` 전달 라인과 물리적으로 혼재
- `apps/backend/src/modules/auth/auth.module.ts` (016 증분 약 +2): `OAuthStateService` provider 등록 — 015 의 `NaverProvider` 재편입과 혼재
- `apps/backend/src/modules/auth/social-auth.service.ts` (016 증분 약 +17/-1): `login()` 생성자 4번째 인자 `OAuthStateService` 주입 + 진입부 naver 조건부 state 검증 분기(`providerImpl.verify` 이전) 추가 — 015 의 `AUTO_LINK_PROVIDERS` 반전·조건부 verify 호출과 물리적으로 혼재
- `apps/backend/src/modules/auth/social/naver.provider.ts` (016 증분 약 +5): `verify()` 에 `configService.get('NAVER_REDIRECT_URI')` optional 조회 + `redirect_uri` 파라미터 조건부 포함(FR-007/008) — 015 의 code-exchange 전면 재작성과 물리적으로 혼재
- `apps/backend/src/modules/auth/social-auth.service.spec.ts` (+13, §F T012 마이그레이션): `OAuthStateService` DI mock 추가(회귀 방지)
- `apps/backend/src/modules/auth/social-auth.service.autolink-policy.spec.ts` (016 증분 약 +20/-2): `OAuthStateService` DI mock 추가(§F T012) + STALE_SC 정정 마커(`(v1.1.0/015 spec)`, PATCH-A18 옵션 A) 2개소
- `apps/backend/src/modules/auth/social/naver.provider.spec.ts` (015 산출물 대비 016 증분 약 +55): SC-007/008(redirect_uri 조건부 포함/생략) 테스트 추가 + `configService.get` mock 보강
- `apps/backend/src/modules/auth/social-auth.service.naver.spec.ts` (015 산출물 대비 016 증분 약 +16): `OAuthStateService` DI mock 추가(§F T012) + STALE_SC 정정 마커(SC-010, `(v1.1.0/015 spec)`) 1개소
- `apps/backend/src/modules/auth/social-auth.service.naver-autolink-exclusion.spec.ts` (015 산출물 대비 016 증분 약 +13): `OAuthStateService` DI mock 추가(§F T012, 회귀 방지)

DB 설계 산출물(참조 문서, 코드 아님):
- `docs/specs/v1.1.0/016-naver-state-redirect-hardening/db-design/data-model.md` (신규): `oauth_states` 테이블 정의·ERD·인덱스 전략·무결성 규칙·마이그레이션/롤백 전략(Database Design Agent)

**검증** (5b Test Agent EXECUTION, coverage.md v1.1 기준):
- 백엔드 전체: `pnpm --filter backend exec tsc --noEmit` 0 error, `pnpm --filter backend test --silent` **35 suites / 334 tests 전량 PASS**(회귀 0), `pnpm --filter backend lint` 0 error(본 spec 파일 0건)
- `prisma migrate deploy` 로 `20260703070000_add_oauth_states` 적용 확인(16차 마이그레이션·33테이블), `test/health.e2e-spec.ts` 로 `AppModule` 런타임 부팅(`OAuthStateService` DI wiring 포함) 3/3 PASS
- SC-001~008·SC-010·SC-011: unit PASS(state 발급·TTL 만료·검증통과·검증거부(불일치/만료/미제공)·1회성 재사용거부·kakao/google 회귀 0·redirect_uri 조건부 포함/생략·예측불가(N=20)·015 카카오/구글 기존 스위트 100% PASS)
- SC-012: static grep — `package.json`/lockfile 에 Redis 등 외부 저장소 클라이언트 신규 의존 0건
- SC-013: static — `.env.example` 에 `NAVER_REDIRECT_URI` 항목 존재 확인
- SC-009: `[env:e2e-docker]` deferred(실 OAuth 크레덴셜·네이티브 연동 필요, 015 SC-016 과 동일 처리 방식, coverage-gap.md 카테고리(3))
- SC-014·SC-015: **PENDING** — 6단계 Security Agent 재감사 위임(테스트 태스크 아님). 본 Docs 단계 완료 후 이어지는 Security Agent 재감사에서 최종 RESOLVED/잔존-권고 판정 필요(아래 "후속 작업 시 주의사항" 참조)
- STALE_SC 3건(`social-auth.service.autolink-policy.spec.ts` SC-006/008, `social-auth.service.naver.spec.ts` SC-010 — 전부 015 spec 잔존 번호) → main session 경유 사용자 결정(옵션 A)에 따라 `(v1.1.0/015 spec)` exact-match 마커 정정 완료, 최종 STALE_SC 0건
- 설계 문서(plan.md ADR-001~007) 정합성 불일치 0건(test-report.md v1.1)

**해결된 GAP**: 없음(3단계 Design Agent gaps.md — 공백 0건, "§F 회귀위험 2건은 GAP 이 아니라 본 spec 범위 내 구현 태스크(D레이어)로 tasks.md 에 명시" 판정. 5b Test Agent EXECUTION gaps: NONE).

**미해결 GAP / 판정 대기** (Retrospective Agent 위임 / Security Agent 후속 판정 대상):
- **SEC-015-02/SEC-015-03 최종 판정 대기(필수, 미실행)**: 본 spec 이 두 항목의 백엔드 하드닝(state 서버측 발급·원자적 1회성 검증, redirect_uri fail-safe 조건부 지원)을 완결 구현했으나, **6단계 Security Agent 재감사가 아직 수행되지 않았다**. SC-014(SEC-015-02 RESOLVED 판정)·SC-015(SEC-015-03 RESOLVED 또는 잔존-권고 판정)는 이 재감사 완료 전까지 coverage.md 상 PENDING 으로 유지된다. 본 Docs 단계 직후 이어질 단계.
- **네이티브 `flutter_web_auth_2` 앱 배선 미완료(범위 외, 운영 셋업 위임)**: 본 spec 이 발급하는 state 값을 네이티브 앱이 실제로 요청·echo 하도록 배선하는 작업은 spec.md 가 명시적으로 범위 외로 위임했다(`StubSocialAuthService` 고정값 유지). 배선 완료 전까지는 본 하드닝이 실사용 트래픽에 작동하지 않는다(실사용 트래픽 자체가 아직 없음, 회귀 없음).
- **redirect_uri 실제 요구 여부 미확정(범위 외, 운영 셋업 위임)**: FR-007/008 은 코드 레벨로 조건부 준비만 완료했다. 네이버 공식 문서로 최종 요구 여부를 확인하고 필요 시 `NAVER_REDIRECT_URI` 를 설정하는 것은 운영 작업이다.
- **context.md §2/§4/§6 갱신 필요(문서-갱신-필요)**: `POST /auth/naver/state` 신규 엔드포인트·`oauth-state.service.ts`(§2), `oauth_states` 테이블 신규(32→33테이블·15→16차, §4), SEC-015-02/03 제약 항목 상태 전환(§6, Security 재감사 완료 후 RESOLVED/잔존-권고로 조정) — `gaps.md` GAP-016-01~03 에 기록. Docs Agent 직접 수정 불가(agent-rules.md §3.1) — Retrospective Agent 위임.
- **infra.md 갱신 필요(문서-갱신-필요)**: `NAVER_REDIRECT_URI`(선택, 미설정=미포함 기본) 환경변수·`20260703070000_add_oauth_states` 마이그레이션을 §7 배포 전 체크리스트에 additive 반영 — `gaps.md` GAP-016-04 에 기록. Docs Agent 직접 수정 불가.
- **PROC-014 사후 운영 검증 4개 시나리오(범위 외, 운영 셋업 이후 수행)**: state 발급→인증→검증 전체 흐름·state 만료 재시도·redirect_uri 최종 확인·카카오/구글 회귀 확인. 실 크레덴셜 발급 및 네이티브 앱 배선 완료 시점에 수동 점검(spec.md "사후 운영 검증 피드백 사이클" 참조).

**후속 작업 시 주의사항**:
- **DIFF base 재확정 필요**: 015 가 커밋되지 않은 상태로 016 이 진행되어, `DIFF-016-naver-state-redirect-hardening.md` 의 diff 재생성 명령은 현재 base `6b64c24`(014, 015 와 공유) 로만 기록되어 있다. 015 완료 커밋 생성 후에는 `git diff {015-완료-커밋} -- apps/backend/src/modules/auth/social apps/backend/prisma/migrations/20260703070000_add_oauth_states apps/backend/src/modules/auth/auth.constants.ts apps/backend/src/modules/auth/auth.repository.ts apps/backend/src/modules/auth/dto/auth-response.dto.ts apps/backend/.env.example apps/backend/prisma/schema.prisma apps/backend/src/modules/auth/auth.controller.ts apps/backend/src/modules/auth/auth.module.ts apps/backend/src/modules/auth/social-auth.service.ts apps/backend/src/modules/auth/social/naver.provider.ts` 로 016 단독 diff 를 재산출하고 DIFF-016 을 재생성해야 한다.
- **SEC-015-02/03 은 아직 "완료"가 아니다**: 본 spec 은 코드 구현·단위 테스트 검증까지 완료했으나, spec.md NFR-006/007(SC-014/015)이 요구하는 **Security Agent 재감사에 의한 최종 RESOLVED 판정은 아직 없다**. 다음 단계(Security Agent)가 이 판정을 완료해야 GAP 이 최종 종결된다.
- **oauth_states 테이블 운영 관리**: TTL(10분) 경과 행은 발급 시 opportunistic 하게 정리되나(`deleteExpiredOAuthStates`), 별도 스케줄 정리 배치는 없다. 발급 트래픽이 낮은 초기 운영에서는 무방하나, 향후 발급 빈도가 높아지면 테이블 증식 모니터링이 필요할 수 있다(익명 발급 엔드포인트이므로 SEC-004 후속(rate limit)과 동일 축의 잠재 위험 — 위 미해결 GAP 참조).
- **`OAuthState.provider` 컬럼은 향후 확장 여지로 설계됨**: 현재는 `'naver'` 값만 사용하나(FR-006 — kakao/google 은 검증 대상 아님), 카카오·구글이 향후 code-exchange+state 방식으로 전환될 경우 동일 테이블·서비스를 재사용 가능하도록 provider 파라미터화되어 있다(ADR-007 관련 설계 여지, 별도 spec 필요).

---

## [015-naver-code-exchange] 구현 완료 (v1.2 — SEC-015-01 재작업 반영, 최종 상태)

> **개정 이력**: 본 항목은 6단계 Docs 1차 산출물(naver 자동연동 **허용** 시점) 이후, Security Agent 1차
> 감사가 SEC-015-01(High, naver 자동연동의 이메일 소유권 미검증 계정 탈취)을 확정하고 사용자 결정으로
> Development Agent 가 naver 를 `AUTO_LINK_PROVIDERS` 에서 **제외**하는 재작업을 완료함에 따라, 그
> 최종 코드 상태를 반영하도록 Docs Agent 가 현행화했다(5b Test Agent EXECUTION 재검증 gate: PASS 확인 후).
>
> v1.1.0 의 열다섯 번째 차수 — **Naver 소셜 로그인 재도입(서버 authorization code + client_secret 교환 방식)**:
> 014 가 SEC-001(High, 네이버 공개 API 에 access token 의 app/client 바인딩 검증 수단 부재)을 근거로
> 이번 릴리즈에서 완전 제외했던 Naver 를, **표준 OAuth 2.0 Authorization Code Grant 의 confidential-client
> 서버 플로우**로 안전하게 재도입한다(spec.md 배경 및 목적, ADR-001). Flutter 는 access token 을 직접
> 획득하지 않고 단기 유효한 authorization code 만 획득하여 백엔드에 전달하고, 백엔드가 자신만 보유한
> `NAVER_CLIENT_SECRET` 으로 code→access_token 교환을 수행하므로 발급 토큰의 DOA 앱 귀속이 프로토콜
> 수준에서 보장된다 — 이로써 014 GAP-014-08/GAP-014-10 이 지적한 3개 계정 탈취 경로 중 **"제3자 앱이
> 발급받은 토큰/code 의 재전송"** 위협모델은 소거된다(SEC-001 RESOLVED, spec.md NFR-003 좁은 범위 한정).
> **카카오·구글은 본 spec 범위 외**(014 v1.3 재감사에서 app_id/aud 대조로 SEC-001 이미 완전 해소,
> 클라이언트 토큰 검증 방식 무변경, NFR-004/SC-005/SC-019 회귀 방지만 검증).
> (1) `naver.provider.ts` 재작성 — client-token 검증 → code-exchange(`nid.naver.com/oauth2.0/token` POST
> form-urlencoded → `openapi.naver.com/v1/nid/me` GET) 전환(FR-002~004, ADR-001/003), (2)
> `SocialProviderPort.verify(token, context?: {state?, redirectUri?})` optional 2번째 인자 추가 — 카카오·구글
> 구현체는 시그니처 유지(호출부 조건부 verify 로 무변경, ADR-002/NFR-004), (3) `SocialProviderResolver`·
> `SocialLoginDto`(`SUPPORTED_PROVIDERS=['kakao','google','naver']`)·`AuthModule` 에 naver 재편입(FR-001) —
> **naver 로그인 자체(재로그인 경로 3a·신규가입 경로 3c)는 유지**, (4) **`AUTO_LINK_PROVIDERS`
> (`social-auth.service.ts:30`)는 최종적으로 `new Set(['kakao','google'])` — naver 는 제외** — Security
> Agent 1차 감사가 확정한 **SEC-015-01(High)**: code-exchange 의 앱바인딩 보증과 이메일 소유권 검증은
> 서로 독립적인 별개 보증이며, `naver.provider.ts` 에 `google.provider.ts` 의 `email_verified` 에 대응하는
> 이메일 소유권 검증 필드·로직이 전혀 없어(코드 Read 로 확인), 공격자가 자신의 정규 naver 계정 프로필
> 이메일에 victim 의 DOA 가입 이메일을 등록하고 정상 code-exchange 로그인을 완료하면 Path 3b(email
> 자동연동)가 무검증으로 victim 계정에 연동 + JWT 를 발급하는 계정 탈취 취약점을 근거로, naver 를
> 자동연동 대상에서 제외하고 email 매칭 시 409 Conflict 로 차단하도록 반전 조치했다(FR-006 실동작
> 변경, ADR-004 무효화, GAP-015-04/SEC-015-01, `social-auth.service.ts` 주석 4곳에 근거 명시). (5) DTO
> `state?: string` optional 필드 추가 — Flutter 생성 state 를 `SocialCredential`→DTO→`verify` context 로
> 전달(CSRF, ADR-007, 단 서버측 실질 검증은 SEC-015-02 미해결로 남음), (6) Flutter `_SocialRow` 네이버
> 버튼 재활성화(`GestureDetector.onTap` + `onNaver`, FR-009) + `SocialAuthService`에 `signInWithNaver()`
> 추가 — 시스템 브라우저 + 커스텀 URL 스킴(`flutter_web_auth_2` 패키지 도입, 인앱 WebView 금지,
> ADR-006/FR-010) + 취소(무오류 복귀)/실패(오류 메시지) 처리(FR-011~012). **DB 스키마 변경 없음**
> (`social_accounts.provider` 문자열 컬럼이 기존 마이그레이션 `20260701064209_add_social_accounts` 그대로
> 'naver' 값 수용, Database Design Agent 비활성).
> base `6b64c24`(014 완료 커밋) → working tree(미커밋). 변경 추적:
> `git diff 6b64c24 -- apps/backend mobile/customer_app` (tracked modified 14 files, +242/-82 — 재작업분
> `social-auth.service.ts`·`social-auth.service.autolink-policy.spec.ts` 추가 변경 반영, 실측 갱신).
> 신규(untracked) 파일 **5건**(백엔드 테스트 3건·Flutter 테스트 2건, 재작업으로 회귀 테스트
> `social-auth.service.naver-autolink-exclusion.spec.ts` 1건 추가)은 git add 후 동 커밋에 포함.
> **신규 npm 의존 0건**(백엔드는 Node 20 native `fetch` 재사용). **신규 pub 의존 1건**: `flutter_web_auth_2 ^4.1.0`
> (pubspec 선언만 — 실제 import·SDK 연동은 운영 셋업 단계 deferred, ASM-001, `StubSocialAuthService` 로
> 파이프라인 검증). 선택 단계: Security Agent 1차 감사 완료(status: BLOCKED, SEC-015-01 High 1건) →
> 본 재작업 반영 → **Security Agent 재감사(복귀)는 본 Docs 재작업 단계 시점 기준 아직 미실행**(SC-018
> 최종 판정은 재감사 완료 후 확정, coverage.md v1.1 "DEFERRED (변경 없음 — Security 재감사 대기)").

**변경 파일** (최종, base `6b64c24` 대비):

백엔드 — 수정:
- `apps/backend/src/modules/auth/auth.controller.ts` (+1/-1): `socialLogin` 에서 `dto.state` 를 `login(dto.provider, dto.token, dto.state)` 로 전달(FR-002/ADR-007)
- `apps/backend/src/modules/auth/auth.module.ts` (+2/-1): `NaverProvider` import·`providers` 엔트리 복원(014 에서 미와이어했던 것을 재편입, FR-001)
- `apps/backend/src/modules/auth/dto/social-login.dto.ts` (+15/-5): `SUPPORTED_PROVIDERS`에 `'naver'` 재편입 + `@IsOptional @IsString state?: string` 필드 추가(FR-001, ADR-007 CSRF 전달경로)
- `apps/backend/src/modules/auth/social-auth.service.ts` (+30/-17, **재작업 포함**): `AUTO_LINK_PROVIDERS = new Set(['kakao','google'])`(naver 제외 — **SEC-015-01/GAP-015-04**), `login(provider, token, state?)` 3번째 인자 추가·조건부 `verify(token)`/`verify(token,{state})` 호출(카카오·구글 무변경, NFR-004), path 3b/3c 분기 주석 4곳에 naver 제외 근거 명시
- `apps/backend/src/modules/auth/social-auth.service.autolink-policy.spec.ts` (+23/-11, **재작업으로 재반전**): naver 자동연동을 "허용"으로 검증하던 1차 갱신을 **"차단(409 Conflict)"** 재단언으로 되돌림(SC-006, `it.each(['kakao','google'])` 자동연동 유지 + naver 개별 케이스로 분리)
- `apps/backend/src/modules/auth/social/naver.provider.ts` (+66/-26): client-token 검증 → **code-exchange 재작성**. `ConfigService` 주입, `verify(code, ctx?)` 가 토큰 교환 POST(`nid.naver.com/oauth2.0/token`) + 프로필 GET(`openapi.naver.com/v1/nid/me`) 순차 수행. `client_secret`·`access_token` 지역 변수 한정(비노출, FR-002~004/SC-004/SC-017)
- `apps/backend/src/modules/auth/social/social-provider.port.ts` (+15/-3): `verify(token: string, context?: SocialVerifyContext): Promise<SocialProfile>` — `SocialVerifyContext = {state?, redirectUri?}` 타입 추가, 2번째 인자 optional(ADR-002, 카카오·구글 구현체 무영향)
- `apps/backend/src/modules/auth/social/social-provider.resolver.ts` (+4/-5): `NaverProvider` 생성자 주입 + `providers` 맵에 `naver: this.naver` 재편입

백엔드 — 신규:
- `apps/backend/src/modules/auth/social/naver.provider.spec.ts` (신규, 183줄): code-exchange 단위 테스트 — SC-002~004(정상 흐름·access_token 비노출), SC-003(무효/만료/재사용 code·HTTP 실패·응답 필드 누락 3케이스)
- `apps/backend/src/modules/auth/social-auth.service.naver.spec.ts` (신규, 280줄, **재작업으로 T-D3 재반전 반영**): naver 계정해석 단위 테스트 — provider 지원목록 진입(SC-001)·재로그인(SC-007)·신규가입(SC-008)·자동연동 **차단(409, SEC-015-01)**·email 미반환 거부(SC-009)·토큰쌍 형식(SC-010, 재로그인·신규가입 2경로 한정)
- `apps/backend/src/modules/auth/social-auth.service.naver-autolink-exclusion.spec.ts` (**신규, 148줄, 재작업 산출물, SC 비매핑**): SEC-015-01 공격 시나리오 회귀 테스트 — victim 이메일을 자신의 naver 프로필에 등록 후 로그인 시 409 Conflict 로 차단·`createSocialAccount`/`issueTokensForUser` 미호출 확인, path 3a(재로그인) 정책 무관 유지 확인, kakao/google 자동연동 회귀 0 확인(`it.each`)

Flutter — 수정:
- `mobile/customer_app/lib/core/providers.dart` (+12/-4): `AuthController.socialLogin(provider, token, {String? state})` optional state 파라미터 추가 — 카카오·구글 호출은 state 미전달(무영향, ADR-007)
- `mobile/customer_app/lib/features/auth/login_screen.dart` (+15/-4): `_SocialRow` 네이버 원형 버튼(`GestureDetector.onTap`) + `onNaver` 콜백 재활성화(FR-009, SC-011)
- `mobile/customer_app/lib/features/auth/social_auth_service.dart` (+14/-5): `abstract SocialAuthService` 에 `signInWithNaver()` 추가, `SocialCredential` 에 `final String? state` 필드 추가, `StubSocialAuthService.signInWithNaver()` 스텁 구현(GAP-015-02 Dart breaking change 대응 포함)
- `mobile/customer_app/pubspec.lock` (+32): `flutter_web_auth_2` 전이 의존성 잠금
- `mobile/customer_app/pubspec.yaml` (+3): `flutter_web_auth_2: ^4.1.0` 선언(ADR-006, 실사용 코드는 운영 셋업 deferred·ASM-001)
- `mobile/customer_app/test/features/social_login_flow_test.dart` (+10, GAP-015-02 대응): `_StubSocialAuthService`(014 산출물)에 `signInWithNaver()` override 최소 추가 — Dart `implements` breaking change 컴파일 회복, 기존 SC 단언·로직 무변경. **본 재작업 무변경**(Flutter 코드는 재작업 범위 밖).

Flutter — 신규:
- `mobile/customer_app/test/features/naver_social_login_static_test.dart` (신규, 191줄): SC-011·012·017·020 정적 검증(버튼 존재·인앱 WebView 미사용·env 크레덴셜·flutter analyze 마커)
- `mobile/customer_app/test/features/naver_social_login_flow_test.dart` (신규, 277줄): SC-013~015 흐름 테스트(취소·실패·성공)

**검증** (5b Test Agent EXECUTION 재검증, 최종):
- 백엔드 naver + regression 재실행: `naver.provider.spec.ts`+`social-auth.service.naver.spec.ts`+`social-auth.service.autolink-policy.spec.ts`+`social-auth.service.naver-autolink-exclusion.spec.ts` **4 suites/21 tests PASS**
- 백엔드 회귀(smoke_tests, 014 카카오·구글): `social-auth.service.spec.ts`+`kakao.provider.spec.ts`+`auth.service.spec.ts` 3 suites/37 tests PASS(SC-005·SC-019, 회귀 0)
- 백엔드 전체: **33 suites / 323 tests PASS**(재작업으로 신규 회귀 파일 1건 추가 반영, 1차 32 suites/321 tests 대비 net +1 suite/+2 tests — naver 자동연동 성공/토큰쌍 SC 단언 2건 제거 + 신규 파일 3케이스 추가 상쇄 결과). `pnpm exec tsc --noEmit` 오류 0건
- Flutter naver 신규: `naver_social_login_static_test.dart`+`naver_social_login_flow_test.dart` 7 tests PASS(본 재작업 무변경 재확인)
- Flutter 회귀(014): `social_login_flow_test.dart`+`social_login_static_test.dart` 4 tests PASS. Flutter 전체 `flutter test` All tests passed!, `flutter analyze --no-pub lib/` 0 issues(SC-020)
- **SC-001~020 재판정**: 18 PASS(순수) + **2 PASS\*** (SC-006/SC-010 — naver 자동연동 Out of Scope 반영 재판정, spec.md 원문 문언과의 불일치는 GAP-015-05 로 추적) + 2 DEFERRED(SC-016 성능 e2e-docker·SC-018 Security 재감사 대기)
- naver 공격 시나리오(SEC-015-01) 409 차단·`createSocialAccount`/`issueTokensForUser` 미호출 production 실동작 재현 확인. kakao/google 자동연동 회귀 0(이중 확인: `it.each` 신규 + 기존 37 tests)
- `verify(` 호출부 단일 지점(`social-auth.service.ts`) 조건부 확장 확인 — Breaking 잔여 참조 0건(카카오·구글 기존 호출 경로 무변경 코드 직접 대조)
- Dart breaking change(GAP-015-02, `implements SocialAuthService` 3개소) 전건 override 확인 — `flutter test` 전체 PASS 로 컴파일 정합 재확인
- STALE_SC 0건(coverage.md v1.1, PATCH-A18 silence 규칙 적용 후, run-005 대비 변경 없음)

**해결된 GAP**:
- **GAP-015-02 해소**: tasks.md T-C2 설계 시 Dart `implements` 시맨틱상 `abstract SocialAuthService.signInWithNaver()` 추가가 breaking change 임을 §F 절차가 식별하지 못해 4단계 구현 중 컴파일 오류로 발견됨. `_StubSocialAuthService`(014 `social_login_flow_test.dart`)에 최소 override 추가로 컴파일 회복(기존 SC 단언·로직 무변경). Development Agent 처리, Test Agent(EXECUTION) 5b 재검증 동의.
- **GAP-015-04 처리됨(Development, Security 재감사 대기)**: **SEC-015-01(High)** — naver 자동연동(Path 3b)이 이메일 소유권을 검증하지 않아 공격자가 자신의 정규 naver 계정에 victim 이메일을 등록하고 정상 로그인만으로 victim 계정을 탈취 가능함을 Security Agent 1차 감사가 확정. 사용자 결정으로 naver 를 `AUTO_LINK_PROVIDERS` 에서 제외(재로그인 3a·신규가입 3c 는 유지)하는 수정 방향 1 을 채택, Development Agent 가 `social-auth.service.ts` 반전 + 주석 4곳 갱신 + 회귀 테스트(`social-auth.service.naver-autolink-exclusion.spec.ts`) 신규 추가로 처리 완료. **Security Agent 의 복귀 재감사(SC-018 최종 판정)는 아직 미실행** — 6단계 Docs 재작업 다음으로 이어질 단계.

**미해결 GAP / 미완료 감사** (Retrospective Agent 위임 / Security Agent 후속 검토 대상):
- **Security Agent 재감사 (필수, 미실행)**: GAP-015-04/SEC-015-01 조치(naver AUTO_LINK 제외) 이후의 코드 상태를 Security Agent 가 아직 재감사하지 않았다. SC-018(Critical/High 0건 최종 판정)은 이 재감사 완료 전까지 DEFERRED 로 유지된다. 본 Docs 재작업 직후 이어질 단계.
- **SEC-015-02 (Medium, 미해결)**: state(CSRF) 파라미터를 백엔드가 클라이언트 값 그대로 전달만 하고 자체 검증하지 않음. 운영 셋업(네이티브 `flutter_web_auth_2` 연동) 착수 전 클라이언트 측 state 생성·검증 로직 구현 필수(security-report.md 권고 2, PROC-013-03 — context.md §6 등재 권고, Retrospective 위임).
- **SEC-015-03 (Low, 미해결)**: 네이버 토큰 교환 요청에 `redirect_uri` 미포함. 운영 크레덴셜 등록 시 공식 문서로 요구 여부 최종 확인 필요(security-report.md 권고, PROC-014 사후 운영 검증 대상).
- **GAP-015-01 (OPEN, 문서-갱신-필요)**: infra.md §5(연결 실패 재시도)·§7(배포 전 체크리스트)·§8(알려진 인프라 제약)에 네이버 아웃바운드 엔드포인트(`nid.naver.com/oauth2.0/token` 토큰 교환·`openapi.naver.com/v1/nid/me` 프로필)·`NAVER_CLIENT_ID`/`NAVER_CLIENT_SECRET` fail-closed·활성 provider 3종(카카오·구글·네이버, 단 자동연동은 카카오·구글 2종 한정) 갱신 필요(014 GAP-014-06 당시 naver 미활성으로 등재되지 않았던 것의 역갱신 포함). Docs Agent 직접 수정 불가(agent-rules.md §3.1) — 상세는 `docs/specs/v1.1.0/015-naver-code-exchange/gaps.md` GAP-015-01 참조.
- **GAP-015-03 (문서-갱신-필요, Docs Agent 발견)**: context.md §2(핵심 모듈 목록 — `social/` 행이 "NaverProvider 는 파일 보존·미와이어" 로 서술, 코드 검증 결과 `AuthModule.providers`·`SocialProviderResolver.providers` 맵에 `NaverProvider` 실 등록 확인되어 불일치)·§4(데이터 모델 — "활성 provider 카카오·구글(네이버 제외 — SEC-001)" 서술이 부정확 — **로그인 provider 는 3종 활성이나 자동연동(AUTO_LINK)은 카카오·구글 2종 한정(naver 는 SEC-015-01 로 제외)** 으로 두 구분을 분리 서술 필요)·§6(알려진 제약 — GAP-014-06 행에 naver 아웃바운드 2건 추가 필요) 갱신 필요. §7 갱신 이력에 015 신규 행 추가 권고. 상세는 `docs/specs/v1.1.0/015-naver-code-exchange/gaps.md` GAP-015-03 참조(코드 검증 완료).
- **GAP-015-05 (신규, 문서-갱신-필요, spec-text 불일치, 5a Test Agent 발견)**: GAP-015-04 결정(naver AUTO_LINK 제외)으로 spec.md **SC-006**("... 자동 연동되고 JWT 가 반환된다")·**SC-010**("SC-006/007/008 세 경로 모두 ... 토큰 반환")의 naver 관련 원문 문언이 실제 동작(자동연동 시 409 Conflict 거부, 2경로만 토큰 반환)과 더 이상 일치하지 않는다. 코드·테스트는 이미 안전하게 동기화되었으나(coverage.md v1.1 "PASS\*" 표기), spec.md 원문 자체는 Test Agent 권한 밖(agent-rules.md §3.1)이라 미수정 — Spec Agent 복귀 또는 후속 patch spec 에서 SC-006/010 문언 정정 필요. 상세는 gaps.md GAP-015-05 참조.
- **PKCE 미도입 (범위 외, 차후 spec)**: 네이버 오픈API PKCE 지원 여부 미확인(`[TO-VERIFY]`, ASM-003 "미지원 전제"로 확정). 지원 확인 시 별도 spec 재검토(coverage-gap.md 참고 항목).
- **SC-016 실 성능 측정 (범위 외, 운영 위임)**: P95 3초 실 OAuth 흐름 측정 — 실 크레덴셜 발급 후 사후 운영 검증(PROC-014 시나리오 1) 병행 측정.

**후속 작업 시 주의사항**:
- **naver 는 로그인은 되지만 이메일 자동연동은 되지 않는다(SEC-015-01)**: `AUTO_LINK_PROVIDERS`(`social-auth.service.ts:30`)가 최종적으로 `new Set(['kakao','google'])` 로 확정되었다 — naver 는 `providerId` 매칭 재로그인(path 3a)·신규 독립계정 생성(path 3c)만 허용되며, 기존 계정과 이메일이 같을 경우 **자동 연동하지 않고 409 Conflict 로 거부**한다. 이는 naver 오픈API 가 `email_verified` 에 대응하는 이메일 소유권 검증 필드를 제공하지 않기 때문이며(`google.provider.ts` 는 `email_verified==='true'` 검증 보유, `naver.provider.ts`/`kakao.provider.ts` 는 부재), **naver 자동연동을 재도입하려면 별도 spec 에서 서버측 이메일 소유권 검증(예: 네이버 인증 메일 발송·기존 계정 비밀번호 재확인) 메커니즘을 먼저 설계해야 한다.**
- **v1.1.0/014 spec.md "Naver 완전 제외" 정합화 노트가 본 015 로 재도입됨**: 014 spec.md(FR-001/NFR-004/SC-009/SC-013/SC-018/범위 외 절)와 014 CHANGES.md GAP-014-09 관찰은 **그 시점(014 완료 시점)에는 사실**이었으며 이후 v1.1.0/015 가 신규 spec 으로 naver 를 재도입한 것이다. 014 spec.md 는 작성 당시 상태를 기록한 문서이므로 **수정 대상이 아니다**(01-design-rules.md §2 "docs/specs/ 아래 기존 spec 문서는 수정하지 않는다"). 본 015 spec.md 도 SC-006/010 문언이 재작업 이후 실동작과 불일치하는 상태로 병존한다(GAP-015-05, Spec Agent 복귀 시 정정 권고).
- **spec.md SC-006/SC-010 문언 정정 필요(GAP-015-05)**: naver 자동연동 관련 원문("... 자동 연동되고 JWT 가 반환된다", "세 경로 모두 ... 토큰 반환")이 SEC-015-01 반전 이후 실동작과 불일치. Spec Agent 복귀 또는 후속 patch spec 에서 정정 권고(코드·테스트는 이미 안전 상태로 동기화 완료 — 문서 정합성 항목).
- **Security Agent 재감사 필수**: 6단계 Docs 재작업 다음으로 Security Agent 복귀 재감사가 이어져야 SC-018 최종 판정(Critical/High 0건 확인)이 완료된다. SEC-015-02(Medium)·SEC-015-03(Low)도 별도 처리 필요(위 미해결 GAP 참조).
- **NAVER_CLIENT_ID/NAVER_CLIENT_SECRET Fly secret 필수(운영 셋업 단계)**: `.env.example`에 014 부터 placeholder 로 존재(변경 불요). `naver.provider.ts` 는 `ConfigService.getOrThrow` 호출 시점 지연 조회(fail-closed) — 미설정 시 앱 기동은 정상이나 네이버 로그인 자체는 실패. 실 크레덴셜 발급·네이버 개발자센터 앱 등록·redirect URI 등록은 spec.md PROC-014 "사후 운영 검증" 참조.
- **Flutter 실 SDK 딥링크 연동 미완료**: `flutter_web_auth_2` 는 pubspec 선언만 완료(실제 import·네이티브 URL 스킴 설정(Info.plist·AndroidManifest)·정확한 스킴 문자열 확정은 ASM-001 deferred). `StubSocialAuthService.signInWithNaver()` 는 고정 code·state 반환 스텁 — 실 SDK 로 교체하는 후속 작업 필요(013/014 이월 항목과 동일 패턴). state 서버측 실질 검증(SEC-015-02)도 이 시점에 함께 구현 필요.
- **GAP-015-01/03/05 미해결**: infra.md(GAP-015-01)·context.md(GAP-015-03)·spec.md(GAP-015-05) 갱신 — Retrospective/Spec Agent 위임. 상세 gaps.md 참조.

---

## [014-social-login] 구현 완료

> v1.1.0 의 열네 번째 차수 — **소셜 로그인(최종: 카카오·구글 — Naver 는 SEC-001/GAP-014-10 근거로
> 이번 릴리즈 완전 제외, 하단 "3차 복귀" 절 참조. 최초 설계·1차 구현 범위는 카카오·구글·네이버 3종)**:
> (1) 백엔드 `POST /auth/social-login` 엔드포인트 —
> 클라이언트가 SDK로 획득한 토큰을 제공자에 검증(`SocialProviderPort` — Kakao/Google 구현체, Naver 는
> 미와이어 보존)하여
> providerId·email·name 획득(FR-001~002), (2) 계정 해석 3단계 우선순위(providerId 매칭 재로그인 →
> email 매칭 자동연동 → 신규가입, ADR-003, FR-004~007), (3) 소셜 전용 신규가입 사용자 password=null
> (ADR-005, FR-007) + 기존 `login()` null 가드 추가(NFR-003), (4) JWT 발급 공유 helper
> `AuthService.issueTokensForUser()` 추출(ADR-006, login·social-login 공유, 동작 불변, FR-008),
> (5) `social_accounts` 테이블 신규(users 스키마, `@@unique([provider,providerId])`, FR-009,
> Database Design Agent 활성 — GAP-014-01 tx-aware 원자성 안전망 설계),
> (6) Flutter `LoginScreen` `_SocialRow` 플레이스홀더(009 이월)를 `GestureDetector` 콜백 구조로 전환 +
> `SocialAuthService` 추상 인터페이스(`StubSocialAuthService` 기본값, 실 SDK 네이티브 연동은 운영 셋업
> 단계 deferred — ASM-002) + 취소/실패 처리(FR-010~016).
> base `58ee0d1` → working tree(미커밋). 변경 추적:
> `git diff 58ee0d1 -- apps/backend mobile/customer_app` (tracked modified 10 files, +245/-36 — 3차 갱신,
> Naver 완전 제외로 `auth.module.ts`·`login_screen.dart` 재실측).
> 신규(untracked) 파일 15건(SEC-001 수정 회귀 테스트 `kakao.provider.spec.ts`·Naver 자동연동 비활성 회귀
> 테스트 `social-auth.service.autolink-policy.spec.ts` 포함)은 git add 후 동 커밋에 포함.
> **신규 npm/pub 의존 0건**(백엔드는 Node 20 native `fetch`, Flutter는 실 SDK 대신 stub 인터페이스로
> 파이프라인 검증 — plan.md ASM-002/selection-phases.md PATCH-A15 확인).
> **마이그레이션 있음**: `20260701064209_add_social_accounts` (additive — `social_accounts` 테이블 신규 +
> `users.password` NOT NULL 해제, 기존 행 영향 없음).
> 선택 단계: Database Design Agent 활성화(FR-009 스키마 확정, data-model.md 산출). Security Agent
> 활성화 — **SEC-001**(High, Kakao/Naver provider 의 app/client 바인딩(audience) 검증 누락) 발견 →
> Development Agent 복귀 수정: **Kakao 해소**(`access_token_info` 응답 `app_id` 를 신설 env
> `KAKAO_APP_ID` 와 대조, 불일치·조회실패 시 `UnauthorizedException`) — **Naver 는 대응 공개 API
> 부재로 best-effort 문서화만 적용**(로직 불변, 잔여 위험 GAP-014-08 로 분리).
> **(2차 복귀) Naver 자동연동 비활성화 — 폐기된 중간 완화 단계로 보존**: Security Agent 재감사(v1.1)에서
> Naver 심각도 **High 유지** 판정(문서화만으로는 실질 완화가 아님이라는 5개 근거로 하향 불가) → main
> session이 사용자와 함께 security-report.md 권고 3종 중 **(a) "FR-005 자동연동을 Naver 에 한해
> 비활성화"**를 채택. `SocialAuthService` 에 `AUTO_LINK_PROVIDERS`(kakao·google) 화이트리스트를 도입하여
> provider가 이 목록에 없으면(naver) email 매칭 자동연동(path 3b)을 즉시 `ConflictException`(409)으로
> 거부하도록 수정(path 3c의 P2002 race fallback도 동일 게이팅). 회귀 테스트 4건
> (`social-auth.service.autolink-policy.spec.ts`, SC-XXX 비매핑) 추가, 백엔드 전체 307/307 PASS
> (303→307, 회귀 0). **이 완화는 path 3b/3c 만을 대상으로 했고 path 3a(providerId 매칭 재로그인)는
> 대상이 아니었다 — 이후 Security Agent 재감사 2차(v1.2)에서 이 공백이 신규 확정(GAP-014-10)되어
> 아래 3차 복귀의 Naver 완전 제외로 대체되었다.**
> **(3차 복귀, 본 갱신) Naver 이번 릴리즈 완전 제외 — 사용자 최종 결정**: Security Agent 재감사 2차(v1.2)가
> path 3a(`social-auth.service.ts:56-60`, providerId 매칭 재로그인)는 `AUTO_LINK_PROVIDERS` 게이팅
> 대상에 포함되지 않아, 앱 바인딩 검증 수단이 없는 Naver 에 한해 **이미 naver 로 연동된 기존 정규 DOA
> 계정이 타 앱 발급 토큰 재전송으로 완전 탈취 가능**함을 신규 확정(**GAP-014-10**, `status: BLOCKED`
> 유지)함에 따라, 사용자가 Security Agent 권고 (b) **"Naver 소셜 로그인을 이번 릴리즈에서 완전 제외"**를
> 최종 채택했다. `SocialProviderResolver`(kakao·google 2개만 매핑)·`SocialLoginDto`(`@IsIn` 화이트리스트에서
> naver 제거 — 컨트롤러 진입 전 400 거부)·`AuthModule`(`NaverProvider` DI 미와이어)·Flutter
> `login_screen.dart`/`social_auth_service.dart`(네이버 버튼·`signInWithNaver` 제거)를 수정하여 naver 가
> path 3a/3b/3c 어디에도 도달할 수 없도록 API 경계에서 원천 차단했다. `naver.provider.ts` 파일은 삭제하지
> 않고 미와이어 상태로 보존(향후 authorization code + client_secret 교환 방식, ADR-001 재검토 시 재도입
> 전제). 백엔드 전체 **306/306 PASS**(307→306, 5a 의 SC-009 제거 반영, 회귀 0), Flutter **7/7 PASS**
> (8→7, 5a 의 SC-013 제거 반영). **GAP-014-08·GAP-014-10 모두 RESOLVED**(근본 원인 자체는 미해소이나
> naver 가 활성 provider 가 아니므로 리스크로 작용하지 않음). **GAP-014-09(신규 확대, 미해결)** —
> spec.md FR-001/NFR-004/SC-009/SC-013/SC-018/범위 외 절이 여전히 naver 를 지원 대상으로 서술하여
> "이번 릴리즈 제외" 사실을 반영하지 못함(하단 "spec.md 문서 정확성 관찰" 참조, main session/Spec Agent
> 결정 대기).

**변경 파일**:

백엔드 — 수정:
- `apps/backend/.env.example` (+13): 소셜 로그인 크레덴셜 4종(`KAKAO_REST_API_KEY`·`GOOGLE_CLIENT_ID`·`NAVER_CLIENT_ID`·`NAVER_CLIENT_SECRET`, ADR-007) + `KAKAO_APP_ID`(SEC-001 수정, app_id 대조용, REST API 키와 별개 값) 주석 포함 추가
- `apps/backend/prisma/schema.prisma` (+32/-12): `SocialAccount` 모델 신규(ADR-004) — `@@unique([provider, providerId])`·`@@index([userId])`; `User.password: String → String?`(ADR-005) + `socialAccounts` relation 추가
- `apps/backend/src/modules/auth/auth.controller.ts` (+15/-1): `POST /auth/social-login` 라우트 추가(`SocialAuthService` DI 주입, 익명 엔드포인트)
- `apps/backend/src/modules/auth/auth.module.ts` (+13/-1, **3차 갱신** — `NaverProvider` import·providers 엔트리 제거로 +14/-1→+13/-1): `SocialAuthService`·`SocialProviderResolver`·`KakaoProvider`·`GoogleProvider` providers 등록(Naver 이번 릴리즈 미와이어, SEC-001/GAP-014-08/GAP-014-10)
- `apps/backend/src/modules/auth/auth.repository.ts` (+33/-3): `findByProviderAndProviderId`·`createSocialAccount`(tx-aware) 추가; `createUser` 시그니처 확장(password nullable·name)
- `apps/backend/src/modules/auth/auth.service.ts` (+13): `login()` 에 `user.password === null` 가드 추가(NFR-003, ADR-005); `issueTokensForUser(user)` private→공유 helper 추출(ADR-006)
- `apps/backend/src/modules/auth/auth.service.spec.ts` (+43/-10): SC-004(v1.1.0/014 spec) 신규 테스트 + null password 로그인 회귀 테스트 추가
- `apps/backend/src/modules/auth/dto/auth-response.dto.ts` (+8): `SocialLoginResponse` DTO 추가
- `mobile/customer_app/lib/core/providers.dart` (+21): `socialAuthServiceProvider`(기본값 `StubSocialAuthService`) + `AuthController.socialLogin(provider, token)` 메서드 추가
- `mobile/customer_app/lib/features/auth/login_screen.dart` (+54/-9, **3차 갱신** — `_SocialRow` 네이버 `GestureDetector` 버튼·`onNaver` 파라미터 제거로 +62/-8→+54/-9): `_SocialRow` 플레이스홀더 `Container` → `GestureDetector` 콜백 구조 전환(SC-011~012, 카카오·구글 2버튼만), 취소(무오류 복귀)/실패(오류 메시지) 처리(SC-015~016)

백엔드 — 신규:
- `apps/backend/prisma/migrations/20260701064209_add_social_accounts/migration.sql` (신규): `social_accounts` 테이블 DDL + `users.password` NOT NULL 해제 DDL
- `apps/backend/src/modules/auth/social/social-provider.port.ts` (신규): `abstract class SocialProviderPort` — `verify(token): Promise<SocialProfile>` 계약
- `apps/backend/src/modules/auth/social/kakao.provider.ts` (신규, 71줄): KakaoProvider — `kapi.kakao.com/v2/user/me` Bearer 검증·파싱; **SEC-001(High) 수정** — `/v1/user/access_token_info` 응답의 `app_id` 를 `KAKAO_APP_ID` 와 대조 후 불일치·조회실패 시 `UnauthorizedException`(타 카카오 앱 발급 토큰 재사용 차단, google `aud` 검증과 동일 목적)
- `apps/backend/src/modules/auth/social/kakao.provider.spec.ts` (신규, SEC-001 수정 회귀 테스트, SC-XXX 비매핑): app_id 일치·불일치·`access_token_info` 조회실패 3케이스 3/3 PASS
- `apps/backend/src/modules/auth/social/google.provider.ts` (신규): GoogleProvider — `oauth2.googleapis.com/tokeninfo` 검증·`aud` 대조 (GAP-014-04 부팅크래시 수정 완료 — `getOrThrow` 를 생성자에서 `verify()` 내부로 이동)
- `apps/backend/src/modules/auth/social/naver.provider.ts` (신규, 55줄, **3차 갱신** — docstring +53→+55): NaverProvider — `openapi.naver.com/v1/nid/me` Bearer 검증·파싱; **SEC-001/GAP-014-08/GAP-014-10** — 네이버는 app 바인딩 식별용 공개 API 부재로 코드 수정 불가. **(3차 갱신)** docstring을 "이번 릴리즈 미활성(SEC-001/GAP-014-08/GAP-014-10)"으로 전면 갱신(제외 사유·재도입 전제(ADR-001) 명시) — 파일은 삭제하지 않되 `SocialProviderResolver`·`AuthModule` 어디에도 와이어링하지 않음(로직 자체는 무변경)
- `apps/backend/src/modules/auth/social/social-provider.resolver.ts` (신규, 35줄, **3차 갱신** — `NaverProvider` import·생성자 주입·providers 맵 엔트리 제거로 +31→+35): provider 문자열 → Port 구현체 매핑(kakao·google 2개만), naver 요청은 매핑 자체가 없어 `UnauthorizedException`(단, 실제로는 DTO 검증이 먼저 400으로 거부)
- `apps/backend/src/modules/auth/social/stub-social.provider.ts` (신규): 테스트용 stub(무네트워크, NFR-004 mock)
- `apps/backend/src/modules/auth/social-auth.service.ts` (신규, 141줄, **3차 갱신** — 상단·인라인 주석을 "Naver 는 API 경계에서 완전 제외되어 login() 자체가 호출될 수 없다"로 갱신, +136→+141): 계정 해석 3단계 우선순위 오케스트레이션(ADR-003). `AUTO_LINK_PROVIDERS: ReadonlySet<string> = new Set(['kakao','google'])` 화이트리스트(2차 갱신 도입, 상수 자체는 3차 갱신에서 무변경) — provider가 목록에 없으면(naver) path 3b(email 매칭 자동연동)·path 3c의 P2002 race fallback 모두 `ConflictException`(409) 거부. 3차 갱신으로 naver 는 API 경계(DTO)에서 이미 차단되어 이 서비스에 naver 문자열이 도달할 수 없음
- `apps/backend/src/modules/auth/social-auth.service.spec.ts` (신규, **3차 갱신** — 5a 가 SC-009 naver 단위 테스트·`NAVER_PROFILE` fixture 제거로 +340→+313): SC-001~003·005~008·010 단위 테스트 (T-D1, SC-009 제거로 범위 외 처리)
- `apps/backend/src/modules/auth/social-auth.service.autolink-policy.spec.ts` (신규, 147줄, **3차 갱신** — docstring 갱신(naver 가 API 경계에서 완전 제외되어 이 서비스 도달 불가능함을 명시, assertion 무변경), +144→+147, SC-XXX 비매핑 보안 회귀 테스트): naver+기존이메일→Conflict(자동연동·신규생성 모두 미호출)·naver+신규이메일→독립계정 정상생성(path 3c 회귀없음)·`it.each(['kakao','google'])`+기존이메일→자동연동 유지(회귀없음) 4케이스
- `apps/backend/src/modules/auth/dto/social-login.dto.ts` (신규, 16줄, **3차 갱신** — `SUPPORTED_PROVIDERS`에서 `'naver'` 제거 + 제외 사유 주석 추가로 +14→+16): `SocialLoginDto`(`provider`·`token`) class-validator — `@IsIn(['kakao','google'])`로 naver 요청을 컨트롤러 진입 전 400으로 거부(가장 이른 차단점)

Flutter — 신규:
- `mobile/customer_app/lib/features/auth/social_auth_service.dart` (신규, 41줄, **3차 갱신** — `signInWithNaver()` 제거, 라인수 불변): `abstract class SocialAuthService`(`signInWithKakao`·`signInWithGoogle` 2개만) + `StubSocialAuthService`(개발/테스트 기본값) + `SocialCredential`·`SocialAuthCancelled`
- `mobile/customer_app/test/features/social_login_static_test.dart` (신규, **3차 갱신** — 5a 가 SC-013 naver 버튼 테스트·SC-018 naver 크레덴셜 단언 제거로 +162→+138): SC-011~012·017~018(부분) 정적 검증 (T-D3, SC-013 제거로 범위 외 처리)
- `mobile/customer_app/test/features/social_login_flow_test.dart` (신규, **3차 갱신** — 5a 가 `_StubSocialAuthService.signInWithNaver()` override 제거로 +283→+275): SC-014~016 흐름 테스트 (T-D4)

DB 설계 산출물(참조 문서, 코드 아님):
- `docs/specs/v1.1.0/014-social-login/db-design/data-model.md` (신규): `social_accounts` 테이블 정의·ERD·마이그레이션·롤백 전략 (Database Design Agent)

**검증**:
- 백엔드 전체 회귀(SEC-001 Kakao 수정 후 재검증): 303/303 PASS(29 suites, 기존 300 + `kakao.provider.spec.ts` 신규 3건, 회귀 0)
- 백엔드 전체 회귀(Naver 자동연동 비활성 후 재검증, v1.2 — 폐기된 중간 단계): 307/307 PASS(30 suites, 303 + `social-auth.service.autolink-policy.spec.ts` 신규 4건, 회귀 0)
- **(3차 갱신) 백엔드 전체 회귀(Naver 이번 릴리즈 완전 제외 후 최종 재검증)**: **306/306 PASS**(30 suites, 307 → 5a 의 SC-009 naver 단위 테스트 제거 반영, 회귀 0). `pnpm exec tsc --noEmit`/`nest build` 0 error.
- 백엔드 `health.e2e-spec.ts`(AppModule 전체 부팅): 3/3 PASS (GAP-014-04 수정 확인 — 크레덴셜 미설정 상태에서도 정상 기동; SEC-001 Kakao 수정 후 재검증 — `KAKAO_APP_ID` 미설정 상태에서도 정상 기동 확인, lazy lookup; **Naver 완전 제외 후 재검증에서도 3/3 PASS 유지 — `NaverProvider` DI 미와이어 상태에서도 `AuthModule` 정상 기동**)
- **(3차 갱신) Flutter**: `flutter test test/features/social_login_static_test.dart test/features/social_login_flow_test.dart` — **7/7 PASS**(8→7, 5a 의 SC-013 naver 버튼 테스트 제거 반영), `flutter analyze lib/` 0 issues(네이버 버튼 제거 후 재확인)
- 백엔드 SC 매핑 테스트: `social-auth.service.spec.ts`+`auth.service.spec.ts` 합계 **34/34 PASS**(35→34, SC-009 제거)
- 총 **41/41 SC 매핑 테스트 PASS**(backend 34 + Flutter 7, Naver 완전 제외 후 회귀 0 — SC-002 는 kakao 고정이라 정책 변경과 무관함을 코드 대조로 확인)
- **SC-009(FR-001/002, naver 검증 흐름)·SC-013(FR-012, 네이버 버튼)은 OUT_OF_SCOPE 로 재분류**(테스트가 실패한 것이 아니라 5a 가 의도적으로 제거 — production 이 naver 를 API 경계(DTO `@IsIn`)에서부터 거부하여 이 시나리오 자체가 도달 불가능한 경로가 됨). **SC-018(NFR-004, 크레덴셜 존재)은 카카오·구글 부분만 PASS**(naver 크레덴셜 단언 제거, `.env.example`의 `NAVER_CLIENT_ID`/`SECRET` 값 자체는 미제거 상태로 존치)
- SC-001~008·010~012·014~017 전수 PASS(kakao·google 전용 또는 provider 무관 경로, 회귀 0). SC-019(NFR-001, P95 3초, 실 OAuth 필요) → deferred(`[env:e2e-docker]`, Deploy Agent 위임, spec.md 명시)
- `User.password`·`createUserWithSocialAccount` Breaking change 잔여 참조 grep 확인: 0건
- `grep -rniI naver apps/backend/src mobile/customer_app/lib` 잔여 33건 — 전부 (a) 제외 사유·재도입 전제를 명시한 설명 주석/docstring, (b) `naver.provider.ts` 자체 내부 코드(미와이어이므로 실행 경로 도달 불가), (c) `social-auth.service.autolink-policy.spec.ts`(방어적 심층방어 회귀 테스트)뿐 — **실행 경로상 도달 가능한 production 잔여 참조 0건**
- `social-auth.service.autolink-policy.spec.ts`(SC-XXX 비매핑 보안 회귀 테스트) 4/4 PASS — 상세는 `test/coverage.md` §SEC-001 최종 재검증 (Naver 완전 제외) 참조

**해결된 GAP**:
- **GAP-014-02 해소**: D-layer 테스트 결함 4건(5a `ProviderScopeWidget` 비공개 타입·`social_login_static_test.dart` cwd 경로 가정 오류·Key 부재로 인한 영구 skip anti-pattern·`FlutterSecureStorage` 플랫폼 채널 무응답 hang) — Test Agent(EXECUTION) 5b 단계에서 전량 정정. production 코드 변경 없음.
- **GAP-014-03 해소**: tasks.md `createUserWithSocialAccount` 명세와 5a 테스트 mock 계약(`createUser`+`createSocialAccount` 개별) 불일치 — Development Agent 가 개별 호출 방식으로 구현 정렬, dead code 제거.
- **GAP-014-04 해소**: `GoogleProvider` 생성자의 `getOrThrow('GOOGLE_CLIENT_ID')` 가 크레덴셜 미설정 시 `AuthModule` DI 인스턴스화 자체를 실패시켜 앱 전체 부팅 불가 — `verify()` 메서드 내부로 이동하여 수정. `health.e2e-spec.ts` 로 검출(단위 테스트는 전량 mock으로 미검출).
- **GAP-014-07 부분 해소 (Kakao)**: Security Agent 발견 SEC-001(High, Kakao/Naver provider 의 app/client 바인딩(audience) 검증 누락 — 타 앱 발급 토큰 재전송 시 자동연동(FR-005) 경로와 결합해 계정 탈취 가능) — Kakao 는 `KakaoProvider.verify()` 앞단에 `access_token_info` 조회·`app_id` 대조를 추가하여 해소(회귀 테스트 3건, `kakao.provider.spec.ts`, 303/303 회귀 0). Naver 는 대응 공개 API 부재로 코드 수정 불가 → 잔여 위험을 GAP-014-08 로 분리(아래 3차 완전 해소 참조).
- **GAP-014-08 완전 해소 (3차 갱신) — Naver 이번 릴리즈 완전 제외**: v1.1 재감사에서 Naver 자동연동 비활성화(v1.2)만으로는 근본 원인이 미해소였고, 이후 v1.2 재감사 2차가 path 3a(재로그인) 잔존 위험을 GAP-014-10 으로 신규 확정함에 따라, 사용자가 "Naver 소셜 로그인을 이번 릴리즈에서 완전 제외" (Security Agent 권고 (b))를 최종 채택했다. `SocialProviderResolver`·`SocialLoginDto`·`AuthModule`·Flutter 양쪽에서 naver 를 완전 제거하여 근본 원인(앱 바인딩 검증 수단 부재) 자체는 사실로 남으나 naver 가 활성 provider 가 아니므로 리스크로 작용하지 않게 되었다. **상태: RESOLVED by Development Agent** (Test Agent EXECUTION 5b 독립 재검증 동의).
- **GAP-014-10 완전 해소 (3차 갱신) — path 3a 노출 경로 자체 소거**: Security Agent 재감사 2차(v1.2)가 신규 확정한 path 3a(providerId 매칭 재로그인) 잔존 위험 — `naver` provider 문자열이 API 경계(DTO `@IsIn(['kakao','google'])`)에서 400 으로 거부되어 `social-auth.service.ts:56-60`(path 3a) 자체에 도달할 수 없게 되어 완전히 소거되었다. path 3a 로직 자체는 무변경(diff 0). **상태: RESOLVED by Development Agent** (Test Agent EXECUTION 5b 독립 재검증 동의).

**미해결 GAP** (Retrospective Agent 위임 / 일부 main session·Spec Agent 결정 대기):
- **GAP-014-01 (OPEN)**: `createUser`+`createSocialAccount` 트랜잭션 원자성의 실경로(실 PrismaService·실 DB) 검증 불가 — 단위 테스트는 `AuthRepository` 전체 mock. 안전망: `users.email @unique`+`social_accounts @@unique([provider,providerId])`+P2002 catch 재해석 폴백. 후속: 사후 운영 검증·Security Agent 감사·필요 시 testcontainers 통합 테스트.
- **GAP-014-05 (신규, 문서-갱신-필요)**: context.md §2·§4 갱신 필요(`SocialAuthService`·`SocialProviderPort`(kakao/google/stub 구현체 — **naver 는 미와이어**)·`social_accounts` 테이블·`User.password` nullable 반영) — 상세는 `docs/specs/v1.1.0/014-social-login/gaps.md` 참조.
- **GAP-014-06 (신규, 문서-갱신-필요)**: infra.md §7·§8 갱신 필요(OAuth 아웃바운드 제공자 **2종(카카오·구글, naver 제외)**·크레덴셜 env(`KAKAO_APP_ID` 포함) 배포 체크리스트·자동연동 이메일 신뢰 모델 운영 주의사항) — 상세는 `docs/specs/v1.1.0/014-social-login/gaps.md` 참조.
- **GAP-014-09 (미해결, 3차 갱신 — 범위 확대)**: 애초 "FR-005 자동연동만 provider 단위 예외" 수준의 간극이었으나, Naver 완전 제외 결정으로 spec.md `FR-001`("카카오·구글·네이버 중 하나")·`NFR-004`("각 OAuth 제공자(카카오·구글·네이버)")·`SC-009`("`provider: 'naver'`... JWT가 반환된다")·`SC-013`("네이버 소셜 버튼")·`SC-018`(카카오·구글·네이버 크레덴셜)·범위 외 절("실 OAuth 제공자 앱 등록(카카오·구글·네이버)") 전부가 naver 를 지원 대상으로 서술하는 **provider 지원 목록 자체의 정합성 간극**으로 확대되었다. 구현은 naver 를 API 경계(DTO `@IsIn`)에서부터 완전히 거부하며, 5a Test Agent 는 이미 SC-009·SC-013 매핑 테스트를 제거·SC-018 검증 범위를 축소했으나(test-cases.md v1.1) spec.md 원문 자체는 미갱신 상태다. main session/Spec Agent가 spec.md 전면 검토를 결정해야 한다 — 상세는 `docs/specs/v1.1.0/014-social-login/gaps.md` GAP-014-09 참조.

**spec.md 문서 정확성 관찰 (Docs Agent 직접 수정 불가 — 참고용)**:
- spec.md NFR-001 이 "Constitution P-007 API 일반 기준(P95 1초)" 을 언급하나, `.claude/docs/constitution.md` 직접 확인 결과 **P-007은 "스펙 범위 원칙"**이며 constitution에는 성능(P95) 조항이 존재하지 않는다(Planning Agent가 plan.md Constitution Gates 절에서 최초 관찰·기록). 실질 영향은 없다 — NFR-001(P95 3초)은 constitution 기준 완화가 아닌 spec 자체 독립 기준으로 적용되었고 Constitution Gates 판정에도 영향이 없었다. spec.md는 1단계 Spec Agent 산출물이므로 Docs Agent가 직접 수정하지 않는다(agent-rules.md §3.1). 정정이 필요하면 사용자 승인 하 별도 patch 로 spec.md의 조항 번호 참조만 제거·정정 권고.
- **(3차 갱신, GAP-014-09 최종 범위) spec.md 는 여전히 Naver 를 지원 대상 provider 로 서술하나, 구현은 Naver 를 이번 릴리즈에서 완전히 제외했다**: 사용자가 Security Agent 권고 (b)를 최종 채택하여 `SocialProviderResolver`·`SocialLoginDto`·`AuthModule`·Flutter `login_screen.dart`/`social_auth_service.dart` 에서 naver 를 API 경계부터 완전히 거부하도록 수정했다(GAP-014-08/GAP-014-10 완전 해소, 위 "해결된 GAP" 참조). 그러나 spec.md 원문은 아래 5개 지점에서 여전히 naver 를 지원 대상으로 명시하고 있어 **구현-문서 불일치**가 존재한다:
  - **FR-001**: "소셜 제공자 식별자(카카오·구글·네이버 중 하나)" — naver 는 구현상 `@IsIn` 화이트리스트에서 제외되어 요청 자체가 400 으로 거부된다.
  - **NFR-004**: "각 OAuth 제공자(카카오·구글·네이버)의 인증 크레덴셜은 환경변수로 관리" — naver 크레덴셜(`NAVER_CLIENT_ID`/`NAVER_CLIENT_SECRET`)은 `.env.example`에 여전히 존재하나 코드에서 실제로 읽어 사용하는 provider 는 kakao·google 뿐이다.
  - **SC-009**: "`provider: 'naver'` 식별자로 소셜 로그인 요청 시 네이버 검증 흐름이 수행되고 JWT가 반환된다" — 5a 가 이 시나리오의 단위 테스트를 제거했다(production 에서 도달 불가능한 경로가 됨, `coverage.md` OUT_OF_SCOPE 재분류).
  - **SC-013**: "`LoginScreen` 네이버 소셜 버튼이 탭 가능하며 탭 핸들러가 존재한다" — `login_screen.dart`의 `_SocialRow`에서 네이버 버튼 자체가 제거되어 검증 대상이 production 에 더 이상 존재하지 않는다.
  - **SC-018**: "카카오·구글·네이버 각 제공자의 인증 크레덴셜 환경변수 항목이 `.env.example`에 존재한다" — `.env.example`의 naver 항목 존재 자체는 여전히 참(코드 검증 결과는 미변경)이나, 검증 범위가 활성 provider(kakao·google)로 사실상 축소되었다.
  - **범위 외 절**: "실 OAuth 제공자 앱 등록(카카오·구글·네이버)" — naver 앱 등록 자체가 이번 릴리즈에서 무의미해졌다.
  spec.md는 Spec Agent 산출물이므로 Docs Agent가 직접 수정하지 않으며, 위 NFR-001/P-007 관찰과 동일한 방식으로 참고용 관찰 사실만 기록한다(GAP-014-09). 정정이 필요하면 사용자 승인 하 별도 patch로 (1) FR-001/NFR-004 를 "카카오·구글(Naver는 SEC-001/GAP-014-08/GAP-014-10 근거로 이번 릴리즈 제외)"로 갱신, (2) SC-009/SC-013 을 수용 기준 목록에서 제거 또는 "제외(범위 외)"로 이관, (3) SC-018 크레덴셜 항목의 NAVER_* 존치 여부 결정, (4) 범위 외 절에 naver 완전 제외 사실을 추가하는 것을 권고한다.

**후속 작업 시 주의사항**:
- **OAuth 크레덴셜(카카오·구글) + KAKAO_APP_ID Fly secret 필수(운영 셋업 단계)**: `KAKAO_REST_API_KEY`·`GOOGLE_CLIENT_ID`·`KAKAO_APP_ID`(SEC-001 수정, 카카오 개발자콘솔 앱키 하단 "앱 ID" — REST API 키와 별개 값) 실 값 발급·설정 전까지는 stub provider 로만 동작(파이프라인 검증 완료 상태). `NAVER_CLIENT_ID`/`NAVER_CLIENT_SECRET` 은 `.env.example`에 존치되어 있으나 **naver 는 이번 릴리즈 미와이어이므로 발급이 불필요**(GAP-014-08/GAP-014-10 완전 해소). `KAKAO_APP_ID` 미설정 시 앱 기동은 정상이나(lazy lookup) 카카오 로그인 자체는 401 로 실패한다. 실 크레덴셜 발급 후 spec.md PROC-014 "사후 운영 검증" 시나리오 수동 점검 필요(naver 항목 제외).
- **Flutter 실 SDK 네이티브 연동 미완료**: `SocialAuthService` 는 현재 `StubSocialAuthService` 만 구현되어 있다(`signInWithKakao`/`signInWithGoogle` 2개만, `signInWithNaver` 없음). 카카오/구글 실 SDK(`kakao_flutter_sdk_user`/`google_sign_in` 등, 정확한 패키지명 미확정)·Info.plist·AndroidManifest·deep link 설정은 운영 셋업 단계 deferred(ASM-002). `socialAuthServiceProvider` 를 실 구현체로 교체하는 후속 작업 필요.
- **GAP-014-01 잔존 — 신규 소셜 가입 경로 비원자성**: `createUser`+`createSocialAccount` 개별 호출(GAP-014-03 해소 결과). `createUser` 성공 후 `createSocialAccount` 실패 시 orphan user 가능(P2002 catch 폴백이 1차 안전망). 운영 모니터링 및 Security Agent 감사 대상.
- **자동 연동(FR-005) 이메일 신뢰 모델 — 계정 탈취 표면(SEC-001, Kakao 해소·Naver 완전 제외로 근본 해소)**: 제공자가 반환하는 이메일의 소유권 검증을 OAuth 제공자에 위임(ASM-001/NFR-002). Security Agent 감사로 Kakao/Naver 에 google `aud` 대응 검증이 결여됨을 발견(SEC-001, High) — **Kakao 는 `access_token_info` app_id 대조로 해소**, **Naver 는 자동연동 비활성화(v1.2)로도 path 3a 잔존 위험이 남아(GAP-014-10) 최종적으로 이번 릴리즈 완전 제외로 근본 해소**(GAP-014-08/GAP-014-10 모두 RESOLVED).
- **`naver.provider.ts` 재도입 시 전제 조건**: 파일은 삭제하지 않고 미와이어 상태로 보존했다(구현 골격 재사용 목적). 향후 재도입 시 authorization code + client_secret 교환 방식(ADR-001 재검토)을 전제 조건으로 채택해야 한다 — client-token 검증 방식(현 ADR-001)으로는 app/client 바인딩 검증이 원천적으로 불가능함이 두 차례 Security Agent 재감사로 확정되었다.
- **GAP-014-09 (미해결, 범위 확대) — spec.md provider 지원 목록 자체가 구현과 불일치**: spec.md FR-001/NFR-004/SC-009/SC-013/SC-018/범위 외 절이 여전히 naver 를 지원 대상으로 서술한다(위 "spec.md 문서 정확성 관찰" 참조). Docs Agent는 spec.md를 직접 수정하지 않는다(agent-rules.md §3.1, Spec Agent 산출물 단일 책임) — Retrospective Agent가 본 관찰을 근거로 spec.md 패치 권고안을 도출하고, main session이 사용자 승인을 거쳐 Spec Agent 재호출 여부를 결정하는 경로를 권고한다. 갱신 전까지 spec.md 는 provider 지원 범위에 대해 구현과 어긋난 SoT 임을 인지할 것.
- **소셜 전용 사용자(password=null) + OTP 재설정 상호작용 미변경**: 013 OTP 비밀번호 재설정 흐름을 소셜 전용 사용자에게도 그대로 허용(ASM-003, 의도된 현행 유지) — 소셜 전용 사용자가 email OTP 로 password 를 신규 설정 가능. 후속 spec 검토 대상.
- **GAP-014-05/06/09 미해결**: GAP-014-05(context.md 갱신, naver 미와이어 반영)·GAP-014-06(infra.md 갱신, OAuth 아웃바운드 제공자 2종(kakao·google)·`KAKAO_APP_ID` 체크리스트 반영)은 Retrospective Agent 위임. GAP-014-09(spec.md provider 지원 목록 정합성)는 main session/Spec Agent 결정 대기 — 상세 gaps.md 참조.
- **spec.md NFR-001 조항 번호 오참조**: 위 "spec.md 문서 정확성 관찰" 참조. 무해하나 향후 유사 조항 인용 시 constitution.md 원문 재확인 권장.

---

## [013-flutter-customer-phase2] 구현 완료

> v1.1.0 의 열세 번째 차수 — **Flutter 소비자 앱 Phase 2**: 009 Phase 1에서 이월한 기능들을 구현.
> (1) 카테고리 화면 재시도 버튼(FR-002/SC-003), (2) 마이페이지 실 사용자 데이터 연동 + 6개 항목 라우팅 연결(FR-003~009),
> (3) 개인정보수정(PATCH /users/me — FR-004/SC-006~007), (4) 고객 서비스 접근(mailto/FAQ/공지 — FR-005~007),
> (5) 알림 설정 로컬 영속(shared_preferences — FR-008), (6) 마일리지 준비중 안내(FR-009),
> (7) 비밀번호 재설정 OTP 플로우(POST /auth/forgot-password, POST /auth/reset-password — FR-010~013),
> (8) 이메일 찾기(POST /auth/find-email — FR-014~016) + 마스킹 표시(NFR-004),
> (9) SEC-001 OTP 브루트포스 차단 (`password_reset_otps.attempts` 카운터·5회 무효화·`OTP_MAX_ATTEMPTS=5`, Security Agent BLOCKED 후 Development Agent 수정).
> base `1798c73` → working tree(미커밋).
> 변경 추적: `git diff 1798c73 -- apps/backend mobile/customer_app pnpm-lock.yaml` (tracked modified 17 files, +787/-52).
> 신규(untracked) 파일 20+건은 git add 후 동 커밋에 포함.
> 신규 의존성: `nodemailer`+`@types/nodemailer`(백엔드 SMTP), `url_launcher`·`shared_preferences`(Flutter).
> **마이그레이션 있음**: `20260701022235_add_password_reset_otps`, `20260701140100_add_otp_attempts` (additive, zero-downtime).
> 선택 단계: Security Agent 활성화 (GAP-013-08 SEC-001 High 취약점 발견·수정 완료. GAP-013-09~11 Medium Retrospective 위임).

**변경 파일**:

백엔드 — 수정:
- `apps/backend/.env.example` (+7): SMTP 환경변수 5종(`SMTP_HOST/PORT/USER/PASS/MAIL_FROM`) 주석 포함 추가
- `apps/backend/package.json` (+2): `nodemailer` + `@types/nodemailer` devDep 추가
- `apps/backend/prisma/schema.prisma` (+16): `password_reset_otps` 테이블 신규 선언; `attempts Int @default(0)` 컬럼 추가 (SEC-001)
- `apps/backend/src/modules/auth/auth.controller.ts` (+25): `POST /auth/forgot-password`, `POST /auth/reset-password`, `POST /auth/find-email` 엔드포인트 추가
- `apps/backend/src/modules/auth/auth.module.ts` (+2): MailModule 임포트 등록
- `apps/backend/src/modules/auth/auth.repository.ts` (+73+α): OTP CRUD(`createOtp`, `findOtp`, `invalidateOtps`) + `findUserByPhone` + `revokeAllRefreshTokensByUser` 수정; `incrementOtpAttempts(id)` 메서드 추가 — DB atomic increment (SEC-001)
- `apps/backend/src/modules/auth/auth.service.ts` (+107+α): `forgotPassword`, `resetPassword`, `findEmail` 서비스 로직 — OTP 해싱·만료 검증·rate-limit 구현; `resetPassword` OTP 불일치 시 `attempts` 증가·`OTP_MAX_ATTEMPTS`(5회) 도달 시 OTP consumed 처리 (SEC-001 브루트포스 차단)
- `apps/backend/src/modules/auth/auth.service.spec.ts` (+281+2): SC-004/SC-015~SC-024 신규 단위 테스트 + STALE_SC 출처 주석; SEC-001 회귀 테스트 2건(`test_otp_5th_wrong_attempt_invalidates_otp`·`test_otp_after_invalidation_correct_otp_also_rejected`) 추가
- `apps/backend/src/modules/auth/dto/auth-response.dto.ts` (+8): ForgotPasswordResponse·ResetPasswordResponse·FindEmailResponse DTO 추가

백엔드 — 신규:
- `apps/backend/prisma/migrations/20260701022235_add_password_reset_otps/migration.sql` (신규): `password_reset_otps` 테이블 DDL
- `apps/backend/prisma/migrations/20260701140100_add_otp_attempts/migration.sql` (신규): `password_reset_otps.attempts` 컬럼 DDL — `ALTER TABLE ADD COLUMN attempts INTEGER NOT NULL DEFAULT 0` (SEC-001)
- `apps/backend/src/infrastructure/mail/mail.module.ts` (신규): MailModule — NODE_ENV 기반 SmtpMailer/StubMailer 선택 DI
- `apps/backend/src/infrastructure/mail/mailer.port.ts` (신규): MailerPort 추상 인터페이스 (`sendMail(to, subject, text)`)
- `apps/backend/src/infrastructure/mail/smtp.mailer.ts` (신규): SmtpMailer — nodemailer SMTP 구현체
- `apps/backend/src/infrastructure/mail/stub.mailer.ts` (신규): StubMailer — 테스트·개발 환경 no-op 구현체
- `apps/backend/src/modules/auth/auth.constants.ts` (신규): `OTP_TTL_MIN=10`, `OTP_RESEND_WINDOW_SEC=60`, `OTP_LENGTH=6`, `OTP_MAX_ATTEMPTS=5` (SEC-001 추가)
- `apps/backend/src/modules/auth/auth.util.ts` (신규): `maskEmail(email)` 순수 함수 — NFR-004 마스킹 로직
- `apps/backend/src/modules/auth/auth.util.spec.ts` (신규): maskEmail 단위 테스트 4건 (SC-024)
- `apps/backend/src/modules/auth/dto/find-email.dto.ts` (신규): FindEmailDto(`phone` 필드)
- `apps/backend/src/modules/auth/dto/forgot-password.dto.ts` (신규): ForgotPasswordDto(`email` 필드)
- `apps/backend/src/modules/auth/dto/reset-password.dto.ts` (신규): ResetPasswordDto(`email`·`otp`·`newPassword` 필드)
- `apps/backend/test/auth-recovery.e2e-spec.ts` (신규): 비밀번호 재설정·이메일 찾기 E2E 7건 (SC-015~018·SC-020·SC-022~023)

Flutter — 수정:
- `mobile/customer_app/ios/Runner/Info.plist` (+4): url_launcher iOS 스킴 설정 추가
- `mobile/customer_app/lib/core/providers.dart` (+53): AuthMeProvider·CategoryProvider·ProfileEditNotifier·NotificationSettingsNotifier 등 신규 Provider 추가
- `mobile/customer_app/lib/features/auth/login_screen.dart` (+22/-?): 비밀번호 재설정·이메일 찾기 링크 onTap 활성화 (SC-014·SC-021)
- `mobile/customer_app/lib/features/category/category_screen.dart` (+17/-?): 재시도 버튼 추가(SC-003), 하드코딩 제거 확인(SC-002)
- `mobile/customer_app/lib/features/mypage/mypage_screen.dart` (+82/-?): 실 사용자 데이터 연동(SC-004), 6개 항목 라우팅 연결
- `mobile/customer_app/pubspec.lock` (+120): url_launcher·shared_preferences 전이 의존성 잠금
- `mobile/customer_app/pubspec.yaml` (+2): `url_launcher`·`shared_preferences` 선언

Flutter — 신규:
- `mobile/customer_app/lib/core/constants.dart` (신규): `kSupportEmail` 상수 — SC-009 고객지원 이메일 리터럴 제거
- `mobile/customer_app/lib/core/router.dart` (신규): GoRouter 기반 앱 라우터 — 화면 간 네비게이션 통합
- `mobile/customer_app/lib/features/auth/find_email_screen.dart` (신규): 이메일 찾기 화면 (SC-021~024)
- `mobile/customer_app/lib/features/auth/forgot_password_screen.dart` (신규): 비밀번호 재설정 요청 + OTP 입력 화면 (SC-014~020)
- `mobile/customer_app/lib/features/mypage/mileage_screen.dart` (신규): 마일리지 준비중 안내 화면 (SC-013)
- `mobile/customer_app/lib/features/mypage/profile_edit_screen.dart` (신규): 개인정보수정 화면 (SC-006~007)
- `mobile/customer_app/lib/features/notification/` (신규): 알림 설정 화면 디렉토리 (SC-012)
- `mobile/customer_app/lib/features/support/` (신규): 고객지원(FAQ·공지·1:1문의) 화면 디렉토리 (SC-008~011)
- `mobile/customer_app/test/static_verification_test.dart` (신규): 정적 검증 테스트 9건 (SC-002·005·009·010·011·013 보조·026 보조)
- `mobile/customer_app/test/features/` (신규): Flutter 위젯·단위 테스트 파일 10종 (SC-001·003~008·010~014·019·021·024)

공통:
- `pnpm-lock.yaml` (+19): nodemailer 백엔드 전이 의존성 잠금

**검증**:
- 백엔드 단위: 30/30 PASS (`auth.service.spec.ts` — SEC-001 회귀 테스트 2건 포함)
- 백엔드 util 단위: 5/5 PASS (`auth.util.spec.ts`)
- 백엔드 E2E: 7/7 PASS (`test/auth-recovery.e2e-spec.ts`)
- Flutter: 28/28 PASS (위젯·단위·정적 검증 10종)
- 총 **65/65 PASS** (SEC-001 수정 후 재검증 완료 — pipeline-log: backend 30+e2e 7+Flutter 28)
- SC-025 (P95 3초): 운영 모니터링 deferred
- SC-026 (flutter analyze 0 issues): CI 위임 (test 파일 6 issues, lib/ 0건)

**해결된 GAP**:
- **GAP-013-05 해소**: `auth.repository.ts` `revokeAllRefreshTokensByUser` `this.prisma.tx` → `this.prisma` 수정 (E2E SC-017 PASS 확인)
- **GAP-013-06 해소**: `faq_screen.dart` 정적 FAQ 항목 1개 이상 추가 (SC-010 PASS 확인)
- **GAP-013-07 해소**: `notice_screen.dart` 정적 공지 항목 1개 이상 추가 (SC-011 PASS 확인)
- **GAP-013-08 해소**: SEC-001 OTP 브루트포스 — `password_reset_otps.attempts` 컬럼·마이그레이션 `20260701140100_add_otp_attempts`·`OTP_MAX_ATTEMPTS=5`·`incrementOtpAttempts`·`resetPassword` 5회 도달 시 consumed 처리 완료. 회귀 테스트 2건 추가. 65/65 PASS 확인.

**후속 작업 시 주의사항**:
- **SMTP 환경변수 5종 Fly secret 필수**: `SMTP_HOST`·`SMTP_PORT`·`SMTP_USER`·`SMTP_PASS`·`MAIL_FROM` 미설정 시 비밀번호 재설정 OTP 발송 불가. `.env.example` 참조. infra.md §7 갱신 필요 (GAP-013-03).
- **OTP 상수 위치**: `apps/backend/src/modules/auth/auth.constants.ts` — `OTP_TTL_MIN=10`(분), `OTP_RESEND_WINDOW_SEC=60`(초), `OTP_MAX_ATTEMPTS=5`(SEC-001 브루트포스 차단 상수). 변경 시 infra.md §8 갱신 필요 (GAP-013-03).
- **flutter analyze test 파일 6 issues**: `lib/` 0건. CI `flutter analyze` 실행 시 test 파일 경고 발생. `coverage-gap.md` 해소 방법 참조.
- **url_launcher iOS Info.plist 필수**: `LSApplicationQueriesSchemes` 추가됨. iOS 배포 시 빌드 검증 필수.
- **phone 비유니크 — findEmail 첫 매치 반환**: `users.phone` 유니크 제약 없음. 동일 전화번호 복수 가입 시 첫 건 반환 (ADR-007). 운영 검증 필요.
- **알림 설정 백엔드 미연동**: `shared_preferences` 로컬 저장만. 서버 알림 제어는 별도 spec.
- **GAP-013-03/04 미해결**: infra.md(SMTP 환경변수·OTP 임계값·마이그레이션)·context.md(auth 모듈·MailerPort) 갱신 — Retrospective Agent 위임.
- **Security Agent GAP 미해결(GAP-013-09~11)**: user enumeration IP rate limit(Medium)·resetPassword revoke 원자성(Medium)·보안 감사 로깅(Medium) — Retrospective Agent 위임.
- **소셜 로그인 014 이월 유지**: LoginScreen 소셜 버튼 placeholder UI. onTap 미구현.

---

## [012-console-phase4-polish] 구현 완료

> v1.1.0 의 열두 번째 차수 — **콘솔 Phase 4 마감**: (1) 백엔드 `GET /auth/me` 응답에 `isAdmin` 필드 추가(FR-001),
> (2) `<ImageUpload>` 공용 컴포넌트 + 상품 이미지 관리 + 배너 이미지 업로드(FR-002~004),
> (3) Next.js `middleware.ts` 라우트 가드 + `auth.tsx` isAdmin 실값 연동 + 네비게이션 권한 필터(FR-005~007),
> (4) `<ErrorState>·<LoadingState>·<EmptyState>` 표준 컴포넌트(FR-008~009),
> (5) Playwright E2E 설정 + 스모크 시나리오 4종(FR-010~011).
> base `f0489a1` → working tree(미커밋). 변경 라인은
> `git diff f0489a1 -- apps/backend/src apps/console packages/shared-types packages/api-client pnpm-lock.yaml`
> 로 재생성 (14 files changed, +1462/-52). **마이그레이션 없음**(DB 스키마 변경 0).
> 신규 의존성: `@playwright/test` (devDep, console). 선택 단계 전부 N.

**변경 파일**:

백엔드:
- `apps/backend/src/shared/auth/admin-ids.ts` (신규, +17): `isAdminUserId()` 순수 헬퍼 — ADMIN_USER_IDS 파싱·포함 판별(ADR-001). fail-closed.
- `apps/backend/src/shared/auth/admin-ids.spec.ts` (신규): isAdminUserId 단위 테스트 (env 미설정·빈값·포함·미포함 케이스)
- `apps/backend/src/shared/auth/admin.guard.ts` (+11/-1): isAdminUserId() 위임으로 파싱 로직 추출. 행위 보존.
- `apps/backend/src/modules/auth/auth.service.ts` (+5/-1): `getProfile()` 반환에 `isAdmin: isAdminUserId(userId, env)` 추가(FR-001)
- `apps/backend/src/modules/auth/dto/auth-response.dto.ts` (+3): `AuthProfileResponse`에 `isAdmin: boolean` 필드 추가
- `apps/backend/src/modules/auth/auth.service.spec.ts` (+84/-0): SC-001·SC-002 신규 테스트 + process.env 격리(beforeEach/afterEach). 기존 SC-010·013·014·016·017 (v1.0.0/001 spec) 출처 주석 추가.

콘솔 공용:
- `apps/console/lib/upload-constants.ts` (신규, +10): `ALLOWED_MIME_TYPES`·`MAX_FILE_SIZE_BYTES` 상수 (NFR-002)
- `apps/console/components/states.tsx` (신규): `<LoadingState>·<ErrorState>·<EmptyState>` 표준 컴포넌트 (FR-008)
- `apps/console/components/image-upload.tsx` (신규): `<ImageUpload>` 공용 컴포넌트 — presign→PUT→confirm 3단계 업로드 (FR-002·ADR-002)
- `apps/console/lib/auth.tsx` (+18/-1): isAdmin 하드코딩 false → `profile?.isAdmin ?? false` 연동. 쿠키 미러링(`token` 쿠키 set/delete) 추가 (FR-005·ADR-003·ADR-004)
- `apps/console/lib/config.ts` (+10): `API_BASE_URL` 런타임 설정 노출 (ADR-006)
- `apps/console/middleware.ts` (신규, +40): 보호 경로 쿠키 기반 가드 — 비인증 `/login` 리다이렉트, 비관리자 `/admin/*` 차단 (FR-006·ADR-003·ADR-005)

콘솔 페이지·레이아웃:
- `apps/console/app/(dashboard)/layout.tsx` (+9/-0): 네비게이션 admin 섹션에 `isAdmin` 조건 추가 (FR-007. GAP-007-01 (2) 해소)
- `apps/console/app/(dashboard)/admin/banners/page.tsx` (+19/-0): `imageUrl` 입력 → `<ImageUpload>` 교체 (FR-004)
- `apps/console/app/(dashboard)/seller/products/[id]/page.tsx` (+86/-0): 이미지 관리 섹션 추가 — 목록·업로드·삭제·10장 제한 (FR-003)

패키지:
- `packages/shared-types/src/index.ts` (+39/-0): `FilePurpose` union, `UserProfile.isAdmin` 추가, `ImageUploadResult` 신규
- `packages/api-client/src/index.ts` (+13): `files.presign·confirm`, `products.addImage·deleteImage` 메서드 추가

설정·테스트:
- `apps/console/package.json` (+14/-0): `@playwright/test`·`vitest`·`@vitejs/plugin-react` devDep 추가. `test` 스크립트 추가.
- `apps/console/tsconfig.json` (+10/-0): `paths` 추가·테스트 파일 exclude
- `apps/console/vitest.config.ts` (신규): vitest 설정 (react plugin)
- `apps/console/vitest.setup.ts` (신규): vitest 글로벌 setup
- `apps/console/tsconfig.test.json` (신규): 테스트 전용 tsconfig
- `apps/console/tsconfig.e2e.json` (신규): Playwright 전용 tsconfig
- `apps/console/playwright.config.ts` (신규): Playwright 설정 (SC-020)
- `apps/console/static-verification.test.ts` (신규): 정적 구조 검증 24개
- `apps/console/components/image-upload.test.tsx` (신규): ImageUpload 단위 테스트 7개 (SC-004~006)
- `apps/console/app/(dashboard)/layout.test.tsx` (신규): 레이아웃 isAdmin 분기 3개 (SC-017)
- `apps/console/app/(dashboard)/admin/banners/page.test.tsx` (신규): 배너 페이지 5개 (SC-011·012·019)
- `apps/console/app/(dashboard)/seller/products/[id]/page.test.tsx` (신규): 상품 이미지 섹션 5개 (SC-007~010)
- `apps/console/e2e/auth.spec.ts` (신규): Playwright E2E — 로그인 (SC-021)
- `apps/console/e2e/seller.spec.ts` (신규): Playwright E2E — 판매자 접근 (SC-022)
- `apps/console/e2e/admin.spec.ts` (신규): Playwright E2E — 관리자 접근 (SC-023)
- `apps/console/e2e/guard.spec.ts` (신규): Playwright E2E — 가드 (SC-024·025)
- `pnpm-lock.yaml` (+1193/-0): Playwright + vitest 전이 의존성

**검증**:
- `pnpm --filter backend test` → **271 passed / 271 total** (기존 261 + SC-001~002 신규 10개. 회귀 0)
- `pnpm --filter console test` → **44 passed / 44 total** (static-verification 24·image-upload 7·layout 3·banners 5·products/[id] 5. 회귀 0)
- 총 **315/315 PASS**
- SC 18/25 파이프라인 검증 PASS. SC-015·016·021~025 (7건) DEFERRED (env:e2e-docker, 옵션 A — 로컬 실행)

**해결**:
- **GAP-007-01 (2) 해소**: 비관리자에게 admin 메뉴가 노출되는 UX 결함 — `layout.tsx` isAdmin 조건 추가로 해소.
- `isAdminUserId` 헬퍼 추출(ADR-001): AdminGuard·AuthService 공유 로직 단일 지점화.
- 쿠키 미러링(ADR-003): localStorage 토큰 → 쿠키 동기화로 Next.js middleware 서버 사이드 가드 가능.

**후속 작업 시 주의사항**:
- **쿠키 미러링은 클라이언트 신뢰값 (ADR-003)**: `middleware.ts` 의 `isAdmin` 쿠키는 클라이언트가 설정하므로 위변조 가능. 백엔드 `AdminGuard` 가 최종 방어선. middleware 는 UX 보호 추가 계층. admin 라우트 백엔드 권한 검증 생략 금지.
- **GAP-001 — 상품·배너 모두 `PRODUCT_IMAGE` purpose**: `FilePurpose` enum 에 `BANNER` 없음. 두 용도 모두 `'PRODUCT_IMAGE'` 전송. presign key prefix 만의 의미 차선택. 실 운영 후 enum 확장 필요 시 별도 spec.
- **`ADMIN_USER_IDS` 미설정 시 전 admin 차단**: 환경변수 미설정 → `isAdminUserId` fail-closed → 모든 사용자 isAdmin=false → middleware `/admin/*` 전면 차단. 배포 시 `ADMIN_USER_IDS` 필수 설정 (infra.md 체크리스트 갱신 권고 — §7).
- **`CORS_ORIGIN` (011 연계)**: 011 에서 추가된 `.env.example` `CORS_ORIGIN` — 콘솔 개발 서버 origin 미포함 시 API 호출 CORS 오류. 로컬 개발 시 `CORS_ORIGIN=http://localhost:3001` 또는 미설정(fail-open) 확인.
- **E2E 7건 로컬 실행**: SC-015·016·021~025 는 파이프라인 외 로컬 실행 필요. `coverage-gap.md §E2E 로컬 실행 절차` 참조 (백엔드·콘솔 dev 서버 기동 후 `pnpm --filter console test:e2e` 실행).
- **`StubFileStorage` → 실 R2 전환 시**: presigned URL 형식 차이로 클라이언트 PUT 실패 가능. 전환 후 이미지 업로드 end-to-end 수동 검증 필수.
- **배너 imageUrl 입력 완전 대체**: `CreateBannerDialog` 의 텍스트 입력 → `<ImageUpload>` 교체. URL 직접 입력 불가. 이미지 파일 업로드 전용.
- **context.md 갱신 필요 (GAP-002)**: `shared/auth` 항목에 `admin-ids.ts isAdminUserId 헬퍼` + `GET /auth/me isAdmin 노출` 반영 필요 — gaps.md GAP-002 참조.

## [011-backend-cors-dev-logging] 구현 완료

> v1.1.0 의 열한 번째 차수 — **백엔드 부트스트랩 보강**: (1) CORS 활성화로 콘솔·모바일 등 교차 출처
> 클라이언트의 API 호출 허용, (2) `app.module.ts` 가 비프로덕션에서 참조하던 `pino-pretty` transport
> 의존성 누락(잠재 부팅 결함) 해소, (3) GAP-011-01 해소(`CORS_ORIGIN` 환경변수 문서화). base `1fe3489`
> → working tree(작성 시점 미커밋). 변경 라인은
> `git diff 1fe3489 -- apps/backend/src/main.ts apps/backend/.env.example apps/backend/package.json pnpm-lock.yaml`
> 로 재생성 (소스 4 files, +93 / 인프라 메타 `infra.md` +2 별도). **마이그레이션 없음**(DB 스키마 변경 0).
> 신규 의존성: `pino-pretty ^13.1.3`(devDep). 선택 단계 전부 N. **역문서화(retroactive)**.

**변경 파일**:
- `apps/backend/src/main.ts` (+7): 부트스트랩에 `app.enableCors({ origin: CORS_ORIGIN?.split(',') ?? true, credentials: true })` 추가
- `apps/backend/.env.example` (+3): `CORS_ORIGIN` 항목 + fail-open 주의 주석 추가 (GAP-011-01 해소)
- `apps/backend/package.json` (+1): `devDependencies` 에 `pino-pretty ^13.1.3` 추가
- `pnpm-lock.yaml` (+82): `pino-pretty@13.1.3` + 전이 의존성 트리 lock
- `.claude/docs/infra.md` (+2): §7 배포 체크리스트에 `CORS_ORIGIN` 항목, §8 알려진 제약에 CORS fail-open 행 추가 (GAP-011-01 해소, 인프라 참조 문서 — 별도 추적)

**검증**:
- `pnpm --filter backend test` → **261 passed / 261 total** (회귀 0, 미커밋 변경 포함 상태로 실행).
- `main.ts` `enableCors` + `?? true` fallback 확인 (SC-001, SC-002).
- `package.json` devDeps `pino-pretty` + `pnpm-lock` `pino-pretty@13.1.3` 확인 (SC-003, SC-004).
- `.env.example` 에 `CORS_ORIGIN` 추가 확인 (GAP-011-01 해소).

**해소된 GAP**:
- **GAP-011-01 (해소)**: CORS 환경변수 문서화 공백 해소 — `.env.example` 에 `CORS_ORIGIN` 추가 및
  `infra.md` §7(배포 체크리스트)·§8(알려진 제약: CORS fail-open) 보강. 운영 배포 시 `CORS_ORIGIN`
  화이트리스트 설정이 체크리스트로 강제된다.

**후속 작업 시 주의사항**:
- **CORS 전체 허용 기본값 — 운영 화이트리스트 필수**: `CORS_ORIGIN` 미설정 시 모든 origin 허용 +
  `credentials: true` 조합은 운영에서 보안 위험이다. 코드 기본값은 fail-open 이므로, 운영 배포 시 반드시
  `CORS_ORIGIN` 환경변수로 허용 origin 을 명시해야 한다(infra.md §7 체크리스트로 강제, §8 제약 등재).
- **pino-pretty 는 dev 전용**: 비프로덕션 transport 로만 동작하므로 `devDependencies` 가 적절. 프로덕션
  (`NODE_ENV=production`)에서는 `transport: undefined` 로 raw JSON stdout 로깅 — 동작 변경 없음. 프로덕션
  이미지 빌드 시 dev 의존성 제외 가능.
- **010 FR-005 와의 관계**: 010 이 `openapi:gen` 에 `NODE_ENV=production` 을 강제해 pino-pretty 누락을
  *회피*한 것과 동일 뿌리 문제를, 본 차수가 의존성 추가로 *근본 해소*했다. 이제 `openapi:gen` 외 다른
  비프로덕션 부팅 경로에서도 transport 로드가 안전하다.

## [010-backend-response-schemas] 구현 완료

> v1.1.0 의 열 번째 차수 — **백엔드 OpenAPI 2xx 응답 스키마 보강**(GAP-001-01 후속): 14개 도메인에
> 문서 전용 응답 DTO(`*-response.dto.ts`)를 신규 도입하고 각 컨트롤러 라우트에 `@ApiOkResponse({ type })`
> 부착. **런타임 무변경**(NFR-001) — 컨트롤러는 여전히 Prisma 엔티티를 반환하며 DTO 는 스키마 생성 전용.
> base `a3fc463` → `1fe3489`(커밋 6개, 중간에 009 docs 커밋 `db7cdb5` 끼어 있음). 변경 라인은
> `git diff a3fc463 1fe3489 -- apps/backend/src apps/backend/openapi.json apps/backend/package.json packages/shared-types/src/openapi.gen.ts`
> 로 재생성. **마이그레이션 없음**(DB 스키마 변경 0). **신규 의존성 0**. 선택 단계 전부 N.
> **역문서화(retroactive)** — 이미 커밋된 코드 기준으로 SDD 문서 세트를 역공학 작성.

**변경 파일** (응답 DTO 14종 신규 + 컨트롤러 15종 어노테이션 + 생성물 2종):
- `apps/backend/src/modules/admin/dto/admin-response.dto.ts` (+51) · `admin.controller.ts` (+7)
- `apps/backend/src/modules/auth/dto/auth-response.dto.ts` (+34) · `auth.controller.ts` (+11)
- `apps/backend/src/modules/banner/dto/banner-response.dto.ts` (+35) · `banner.controller.ts` (+6)
- `apps/backend/src/modules/cart/dto/cart-response.dto.ts` (+40) · `cart.controller.ts` (+5)
- `apps/backend/src/modules/coupon/dto/coupon-response.dto.ts` (+75) · `coupon.controller.ts` (+13)
- `apps/backend/src/modules/notification/dto/notification-response.dto.ts` (+47) · `notification.controller.ts` (+9)
- `apps/backend/src/modules/order/dto/order-response.dto.ts` (+101) · `order.controller.ts` (+4)
- `apps/backend/src/modules/product/dto/product-response.dto.ts` (+125) · `product.controller.ts` (+9)
- `apps/backend/src/modules/review/dto/review-response.dto.ts` (+46) · `review.controller.ts` (+6)
- `apps/backend/src/modules/seller/dto/seller-response.dto.ts` (+35)
- `apps/backend/src/modules/settlement/dto/settlement-response.dto.ts` (+35) · `settlement.controller.ts` (+4)
- `apps/backend/src/modules/shipping/dto/shipping-response.dto.ts` (+49) · `shipping.controller.ts` (+6)
- `apps/backend/src/modules/stats/dto/stats-response.dto.ts` (+29) · `stats.controller.ts` (+4)
- `apps/backend/src/modules/user/dto/user-response.dto.ts` (+79) · `user.controller.ts` (+15)
- `apps/backend/src/modules/search/search.controller.ts` (+3): 상품 검색 라우트 어노테이션
- `apps/backend/package.json` (+1/-1): `openapi:gen` 스크립트에 `NODE_ENV=production` 추가 (pino-pretty silent exit 버그 픽스, FR-005)
- `apps/backend/openapi.json` (+1773/-161): 생성물 — components.schemas 32→73, typed 2xx 38→62
- `packages/shared-types/src/openapi.gen.ts` (+562/-61): 생성물 — openapi-typescript 코드젠 재실행

**검증**:
- `pnpm --filter backend test` → **261 passed / 261 total**, 25 suites 전량 PASS (SC-008, 회귀 0).
- `openapi.json` `components.schemas` 32→**73** (SC-005, 직접 카운트 검증).
- typed 2xx 응답 오퍼레이션 38→**62** / 전체 89 (SC-006, 직접 카운트 검증).
- 14개 도메인 `*-response.dto.ts` 신규 생성 확인 (SC-001).
- `openapi:gen` 스크립트 `NODE_ENV=production` 포함 확인 (SC-004).

**후속 작업 시 주의사항**:
- **DTO 는 문서 전용 — 런타임 변환 없음**: 컨트롤러는 Prisma 엔티티를 그대로 반환하므로 DTO 필드와 실제
  반환 페이로드가 drift 할 수 있다. class-transformer 직렬화 변환은 범위 외(별도 스펙). DTO 필드를 추가·변경할 때
  실제 엔티티 반환 형태와 수동 대조가 필요하다.
- **금전 필드 string 표기(P-005) 일관성**: Prisma `Decimal` 은 JSON 직렬화 시 문자열이 되므로 DTO 에서
  `@ApiProperty({ type: String })` 로 선언했다. 신규 금전 필드 추가 시 동일 원칙을 유지해야 프론트 타입이 맞다.
- **cross-schema plain String(P-001)**: userId·sellerId 등 외래 모듈 ID 는 모듈 의존 회피를 위해 plain String
  으로만 노출한다. 찜·최근 본 상품(`/user/wishlist`·`/user/recent-views`)도 `productId: string` 만 반환하며 상품
  summary join 을 하지 않는다(SC-009). 응답에 상품 상세가 필요하면 별도 BFF/조합 계층에서 처리한다.
- **계약 재생성 절차(2단계) 유지**: 백엔드 DTO 변경 시 `pnpm --filter backend openapi:gen` →
  `pnpm --filter @doa/shared-types gen` 양 단계를 재실행해야 `openapi.json`·`openapi.gen.ts` drift 가 없다.
  CI 자동 재생성·diff 게이트는 아직 없음(GAP-001-01 잔존).
- **SettlementWithItems items 미모델링(GAP-010-01)**: `createSettlement` 응답의 `items` 배열은 DTO 로 완전
  표현하지 않았다(범위 외 이월). 정산 상세 응답을 프론트에서 강타입으로 다루려면 후속 스펙에서 보강 필요.
- **204 응답 미보강**: 로그아웃·삭제 등 204 No Content 는 스키마 대상이 아니다(범위 외). 본문이 있는 응답만 보강했다.

## [009-flutter-customer-app] 구현 완료

> v1.1.0 의 아홉 번째 차수 — **Flutter 고객 앱 MVP 신규 구현**: `mobile/customer_app` 모듈 전체 신규 생성.
> base `a94ff47` → `a3fc463`. 변경 라인은 `git diff a94ff47 a3fc463 -- mobile/customer_app` 로 재생성
> (28 files, 전체 신규). **마이그레이션 없음**(DB 스키마 변경 0). 신규 의존성: Flutter ^3.9.2 + Riverpod + Dio 등 (백엔드·콘솔 독립).
> 선택 단계 전부 N.

**변경 파일**:
- `mobile/customer_app/lib/app.dart`: DoaApp — AuthStatus switch 라우팅
- `mobile/customer_app/lib/main.dart`: 진입점, ko_KR 초기화
- `mobile/customer_app/lib/core/api_client.dart`: Dio + InterceptorsWrapper (Bearer·401 refresh)
- `mobile/customer_app/lib/core/providers.dart`: Riverpod providers, AuthController
- `mobile/customer_app/lib/core/token_store.dart`: FlutterSecureStorage 래퍼
- `mobile/customer_app/lib/theme/app_theme.dart`: DoaColors, DoaRadius, AppTheme.light()
- `mobile/customer_app/lib/features/shell/app_shell.dart`: 4탭 IndexedStack
- `mobile/customer_app/lib/features/shell/category_screen.dart`: 카테고리 화면 (하드코딩)
- `mobile/customer_app/lib/features/auth/login_screen.dart`: 로그인 화면
- `mobile/customer_app/lib/features/home/home_screen.dart`: 홈 상품 그리드
- `mobile/customer_app/lib/features/product/product_detail_screen.dart`: 상품 상세, 찜, 리뷰
- `mobile/customer_app/lib/features/product/variant_sheet.dart`: 옵션 선택 시트
- `mobile/customer_app/lib/features/cart/cart_screen.dart`: 장바구니
- `mobile/customer_app/lib/features/checkout/checkout_screen.dart`: 결제 화면 (uuid idempotencyKey)
- `mobile/customer_app/lib/features/order/order_history_screen.dart`: 주문 내역
- `mobile/customer_app/lib/features/order/order_detail_screen.dart`: 주문 상세
- `mobile/customer_app/lib/features/order/delivery_tracking_screen.dart`: 배송 추적 스테퍼
- `mobile/customer_app/lib/features/order/order_status.dart`: 주문 상태 레이블·색상
- `mobile/customer_app/lib/features/review/review_write_screen.dart`: 리뷰 작성
- `mobile/customer_app/lib/features/wishlist/wishlist_screen.dart`: 찜 목록
- `mobile/customer_app/lib/features/history/history_screen.dart`: 최근 본 상품
- `mobile/customer_app/lib/features/coupon/coupon_box_screen.dart`: 쿠폰함
- `mobile/customer_app/lib/features/address/address_book_screen.dart`: 배송 주소록
- `mobile/customer_app/lib/features/address/address_edit_screen.dart`: 배송지 추가·수정
- `mobile/customer_app/lib/features/mypage/mypage_screen.dart`: 마이페이지
- `mobile/customer_app/lib/features/search/search_screen.dart`: 검색 화면
- `mobile/customer_app/pubspec.yaml`: Flutter 의존성 선언
- `mobile/customer_app/test/app_theme_test.dart`: AppTheme 위젯 테스트

**후속 작업 시 주의사항**:
- 전체 응답 파싱이 `Map<String,dynamic>` 동적 파싱이므로, 필드명·타입 변경 시 런타임 오류 발생. Freezed 모델 도입 전까지 백엔드 응답 스키마 변경에 주의 (GAP-009-01).
- 찜 목록·최근 본 상품은 N+1 조회 패턴. 아이템 수 증가 시 서버 요청 급증 가능 (GAP-009-02).
- `pubspec.yaml`에 `go_router`가 선언되어 있으나 실제 라우팅은 `Navigator.push`/`MaterialPageRoute` 사용. 향후 라우팅 통합 시 go_router 적용 또는 제거 결정 필요.
- `mobile/customer_app`은 백엔드·콘솔과 독립 빌드 단위. `pnpm` 워크스페이스 외부에 위치하며 `flutter pub get`으로 별도 의존성 관리.

## [008-console-admin-polish] 구현 완료

> v1.1.0 의 여덟 번째 차수 — **007(관리자 콘솔) 이후 폴리시 작업**: 관리자 쿠폰 화면(007 범위 외 예고)·
> CouponManager 공유 컴포넌트 추출·다크모드 토글(002 GAP-002-01 부분 해소)·인앱 알림 화면(009 소비 UI).
> base `e7d8ebb` → `99d34a9`. 커밋 3개: `5a14be6`(관리자 쿠폰 + CouponManager)·`4a446b2`(다크모드 + 알림)·
> `99d34a9`(알림 경로 정정). 변경 라인은 `git diff e7d8ebb 99d34a9 -- apps/console packages` 로 재생성
> (9 files, +464/-229). **마이그레이션 없음**(DB 스키마 변경 0). **신규 의존성 0**(`package.json` 변경 없음).
> 선택 단계 전부 N.

**변경 파일**:
- `apps/console/components/coupon-manager.tsx`(신규): CouponManager 공유 컴포넌트. `CouponApi { list, create,
  issue }` 인터페이스 의존성 주입·`queryScope`로 TanStack Query 캐시 키 분리(판매자/관리자 독립)·`discountLabel`·
  `validate`(010 정합 클라이언트 검증)·`CreateDialog`(할인 유형 Select·할인값·최소주문·발급수량·만료일·mutation·
  onSuccess invalidate·close·reset)·`IssueDialog`(userId Input·mutation·onSuccess invalidate).
- `apps/console/app/(dashboard)/account/notifications/page.tsx`(신규): 인앱 알림 화면. `useQuery(['notifications'],
  api.notification.list)`(`GET /notifications` → `NotificationListResult`) + `NotificationRow`(Badge info/
  neutral·`TYPE_LABEL[n.type]`·`opacity-70` 읽음 표시·"읽음" Button → `markRead` mutation onSuccess invalidate)
  + 헤더 "전체 읽음"(unread>0 시) → `markAllRead` mutation. 경로: `account/notifications`(99d34a9 경로 정정).
- `apps/console/app/(dashboard)/seller/coupons/page.tsx`(수정): CouponManager 위임 리팩토링(235줄→~26줄).
  `isSeller` 분기(EmptyState "판매자 미등록")·`queryScope="seller"` 유지. 기존 UX·동작 회귀 0.
- `apps/console/app/(dashboard)/layout.tsx`(수정): 헤더 우측 액션에 `<ThemeToggle />` 추가. NAV 배열:
  common 섹션에 "알림"(`/account/notifications`)·admin 섹션에 "쿠폰(관리자)"(`/admin/coupons`) 추가.
- `apps/console/components/theme-toggle.tsx`(신규): 다크모드 토글 버튼. `documentElement.classList.toggle
  ('dark', next)` + `localStorage.setItem('theme', ...)` 영속(try-catch 감싸 불가 환경 허용) + `useEffect`
  마운트 시 `.dark` 상태 초기화 + `aria-label`.
- `packages/shared-types/src/index.ts`: notification view 타입 3종(`NotificationType` 4 union·`Notification`·
  `NotificationListResult`). 백엔드 `GET /notifications` 응답 OpenAPI 미정의이므로 전이형 한시 정의.
- `packages/api-client/src/index.ts`: `notification` 도메인 facade(list·markRead·markAllRead) + `admin.
  listCoupons`·`admin.createCoupon`·`admin.issueCoupon` 3 메서드 추가. 기존 facade·client·http 불변.
- `apps/console/app/(dashboard)/admin/coupons/page.tsx`(신규): 관리자 쿠폰 화면. `CouponManager`에 `api.admin.
  {listCoupons, createCoupon, issueCoupon}` 주입·`queryScope="admin"`·`title="쿠폰(관리자)"`.
- `apps/console/app/layout.tsx`(수정): `THEME_SCRIPT`(`localStorage.getItem('theme')` + `prefers-color-scheme:
  dark` → `classList.add('dark')`) 인라인 스크립트를 `<head>`에 삽입. `<html lang="ko" suppressHydrationWarning>`.

**검증**: `pnpm --filter console typecheck` 0 error / `pnpm --filter console build` 모든 라우트 PASS(신규
`/admin/coupons`·`/account/notifications` 포함) / 기존 화면(상품·계정·주문·배송·판매자 통계/정산/기존쿠폰)
동작 회귀 0. 신규 단위/e2e 테스트 0(UI 화면 — 타입체크·빌드·정적 갈음). 변경 라인 직접 카운트
(coupon-manager +247·notifications +83·seller/coupons +13/-222·dashboard/layout +12/-6·theme-toggle +34·
shared-types +28·api-client +20·admin/coupons +20·app/layout +7/-1 = 9 files +464/-229).

**해결**: 007 §범위 외 예고 `admin/coupons` 화면 구현. GAP-002-01(다크모드 토글 UI 부재) 부분 해소(FOUC
방지 포함). 009 인앱 알림 이벤트 소비 UI 제공. 006 판매자 쿠폰 화면 CouponManager 공유화로 코드 중복 해소.

**후속 작업 시 주의사항**:
- **notification·admin 쿠폰 응답 view 타입 한시**: `GET /notifications`·`GET/POST /admin/coupons` 응답이 OpenAPI
  미정의이므로 전이형 view 타입(`shared-types`)으로 한시 정의. 백엔드 `@ApiResponse({ type })` 보강 후 코드젠
  생성 타입으로 대체 가능(004·006·007 GAP 연속 — GAP-008-01).
- **알림 경로 정정 이력**: `4a446b2`에서 cwd 버그로 `account/notification`(단수) 위치에 잘못 생성, `99d34a9`에서
  `account/notifications`(복수)로 정정 완료. 향후 알림 관련 링크·라우트는 `notifications`(복수) 사용.
- **CouponManager queryScope 분리**: 판매자 쿠폰·관리자 쿠폰은 `queryScope`("seller"/"admin")로 캐시 키가 분리된다.
  향후 `CouponManager`에 추가 소비처를 붙일 때 고유한 `queryScope` 문자열을 사용할 것.
- **다크모드 시스템 모드 실시간 감지 미지원**: `THEME_SCRIPT`는 초기 로드 시만 `prefers-color-scheme`을 확인한다.
  런타임 시스템 모드 변경 감지는 후속 스펙에서 `matchMedia` 이벤트 리스너로 추가 필요.

---

## [007-admin-console] 구현 완료

> v1.1.0 의 일곱 번째 차수 — **FRONTEND-PLAN Phase 3(관리자 운영 콘솔 — 플랫폼 통계·전체 정산·사용자·감사
> 로그·판매자 승인·배너 관리)**. base `1a6d70d` → `e7d8ebb`. 커밋 1개: `e7d8ebb`(Phase 3 관리자 콘솔).
> 변경 라인은 `git diff 1a6d70d e7d8ebb -- apps/console packages` 로 재생성(9 files, +586/-13).
> **마이그레이션 없음**(DB 스키마 변경 0 — 프론트 console 화면 + 공유 패키지). **신규 의존성 0**(`package.json`
> 변경 없음). 선택 단계 전부 N. 004·005·006(판매자 화면) 위에 관리자 운영 화면을 올린다.

**변경 파일**:
- `apps/console/app/(dashboard)/admin/stats/page.tsx`(신규): 플랫폼 통계. `useQuery(['admin','stats'],
  api.admin.statsOverview)`(`GET /admin/stats/overview` → `PlatformOverview`)로 조회 후 `StatCard` 5개(총
  매출(완료) `formatKRW(totalSales)`·총 주문·완료 주문·총 사용자·총 판매자 — 각 `toLocaleString('ko-KR')`).
  로딩·에러 분기.
- `apps/console/app/(dashboard)/admin/settlements/page.tsx`(신규): 전체 정산. `api.admin.settlements()`
  (`GET /admin/settlements` → `SettlementView[]` — 006 타입 재사용)로 조회 후 `@doa/ui` Table 렌더(판매자
  `sellerId` 앞 12자·총 매출·수수료 `−formatKRW`·지급액·상태 Badge). status `completed`→"지급완료"(success)·
  그 외→"정산대기"(warning). 빈 목록 분기.
- `apps/console/app/(dashboard)/admin/users/page.tsx`(신규): 사용자. `useInfiniteQuery` + `api.admin.
  users(cursor)`(`GET /admin/users` → `CursorPage<AdminUser>`)·`getNextPageParam`=`last.nextCursor`·`pages.
  flatMap(items)` Table(이메일·이름·연락처·가입일). `hasNextPage` 시 "더 보기" Button(`isFetchingNextPage`
  비활성화).
- `apps/console/app/(dashboard)/admin/audit-logs/page.tsx`(신규): 감사 로그. `api.admin.auditLogs()`
  (`GET /admin/audit-logs` → `AdminAuditLog[]`, 013 append-only)로 조회 후 Table(일시·관리자 `adminId` 앞
  12자·조치 `Badge` info·대상 `targetType`·`targetId` 앞 12자). 빈 목록 분기.
- `apps/console/app/(dashboard)/admin/sellers/page.tsx`(수정 — 플레이스홀더→실데이터): 판매자 승인. `api.admin.
  pendingSellers()`(`GET /admin/sellers/pending` → `AdminSeller[]`)로 조회 후 Table(상호·대표자·사업자번호·
  연락처·조치). 행 승인 Button → `api.admin.approveSeller(s.id)`(`POST /admin/sellers/:id/approve`, `useMutation`)
  `onSuccess` invalidate `['admin','pendingSellers']`. 처리 중 `approve.variables === s.id` 행만 비활성화·
  "처리 중…".
- `apps/console/app/(dashboard)/admin/banners/page.tsx`(신규): 배너 관리(CRUD). `api.admin.banners()`
  (`GET /admin/banners` → `Banner[]`) Table(제목·위치·순서·활성 Badge·조치). `CreateBannerDialog`(Radix Dialog —
  `Input`·`Select`(`BannerPosition` 4종)·`createBanner`(`POST /admin/banners`) `onSuccess` invalidate+닫기+
  reset). 활성 토글(`updateBanner`(`PATCH /admin/banners/:id`) `{ isActive: !b.isActive }`)·삭제(`deleteBanner`
  (`DELETE /admin/banners/:id`) danger 버튼). 세 mutation 모두 `onSuccess` invalidate. 삭제는 즉시(확인
  다이얼로그 없음 — 후속). 기존 `lib/order.ts` `formatKRW` 재사용.
- `packages/shared-types/src/index.ts`: admin view 타입 9종(`PlatformOverview`·`AdminUser`·`AdminAuditLog`·
  `SellerApprovalStatus`·`AdminSeller`·`BannerPosition`·`Banner`·`CreateBannerRequest`·`UpdateBannerRequest`).
  백엔드 응답이 OpenAPI 에 미정의(Prisma 엔티티 반환 — 001 coverage-gap)이므로 전이형 view 타입으로 한시 정의.
  금전 필드(`PlatformOverview.totalSales`)는 Decimal→JSON 직렬화상 **문자열**. 정산은 006 `SettlementView`
  재사용(신규 정산 타입 0).
- `packages/api-client/src/index.ts`: `createApiClient` 반환에 `admin` 도메인 facade 10 메서드(`statsOverview`·
  `settlements`·`users`·`auditLogs`·`pendingSellers`·`approveSeller`·`banners`·`createBanner`·`updateBanner`·
  `deleteBanner`) 추가. `api.http` 기반(`http.get/post/patch/delete`), view 타입을 응답 제네릭으로 사용.
  `admin.users` 는 `{ query: { cursor, limit } }`, `admin.auditLogs` 는 `{ query: { limit } }`. 기존 facade
  (auth·user·seller·catalog·inventory·order·shipping·stats·settlement·coupon)·`client`·`http` 불변.
- `apps/console/app/(dashboard)/layout.tsx`: AppShell `NAV` 관리자 섹션에 "배너"(`/admin/banners`)·"전체 정산"
  (`/admin/settlements`)·"플랫폼 통계"(`/admin/stats`)·"사용자"(`/admin/users`)·"감사 로그"(`/admin/audit-logs`)
  5개 추가(기존 "판매자 승인" 위에 누적). `visible` 필터는 seller 섹션만 `isSeller` 로 가림(admin 항상 노출 —
  AdminGuard 백엔드 강제).

**검증**: `pnpm --filter console typecheck` 0 error / `pnpm --filter console build` 22 라우트 PASS(신규
`/admin/stats`·`/admin/settlements`·`/admin/users`·`/admin/audit-logs`·`/admin/banners` 포함) / 기존 화면(상품·
계정·주문·배송·판매자 통계/정산/쿠폰) 동작 회귀 0. 신규 단위/e2e 테스트 0(UI 화면 — `git diff 1a6d70d e7d8ebb
-- apps/console packages` 에 `*.spec.ts`·`*.e2e.ts` 변경 0, 검증은 타입체크 + 빌드 + 정적 구조 리뷰로 갈음).
변경 라인 직접 카운트(banners +172·shared-types +77·sellers +72/-13·users +71·settlements +64·audit-logs +61·
stats +32·api-client +32·layout +5 = 9 files +586/-13). 마이그레이션 없음(DB 스키마 변경 0). 신규 의존 0
(`package.json` 변경 없음). `@doa/ui`(StatCard·Select·Table·Dialog)·`lib/order.ts`(formatKRW)·006
`SettlementView` 기존 자산 재사용(변경 0).

**해결**: **FRONTEND-PLAN Phase 3(관리자 운영 콘솔) RESOLVED**. 004·005·006 이 완성한 Phase 1~2(판매자 화면)
위에 관리자 플랫폼 통계·전체 정산·사용자(cursor 무한 스크롤)·감사 로그·판매자 승인·배너 관리 운영 화면 6종을
제공. 006 과 동일하게 응답 스키마가 OpenAPI 미정의인 도메인이라 타입드 client 대신 전이형 view 타입 +
`api.admin.*` facade 채택(정산은 006 `SettlementView` 재사용). 판매자 승인 화면의 플레이스홀더를 실데이터+승인
mutation 으로 교체. 권한은 백엔드 `AdminGuard` 가 전 admin 라우트에 강제(UI 네비는 권한 필터 없이 노출 —
클라이언트 권한 차단은 후속).

**후속 작업 시 주의사항**:
- **응답 view 타입 한시성(006·004·001 연속)**: 관리자 통계·정산·사용자·감사·판매자·배너 응답은 백엔드가
  Prisma 엔티티를 반환하고 OpenAPI 응답 content 가 미주석이다. 003 타입드 client 대신 `@doa/shared-types`
  전이형 view 타입(금전 string) 9종을 한시 정의했다. 백엔드 응답 DTO + `@ApiResponse({ type })` 보강 후
  코드젠 재생성하면 생성 타입으로 대체 가능(GAP-007-01 (5)). 금전 필드는 Decimal→문자열이므로 대체 후에도
  `string` 유지 확인(P-005).
- **권한은 백엔드 AdminGuard 강제(UI 표시 분기 없음)**: admin 네비는 권한 필터 없이 모든 인증 사용자에게
  노출된다(`visible` 필터는 seller 섹션만 `isSeller` 로 가림). 데이터 보호는 백엔드 `AdminGuard`(403)가
  강제하나, 비관리자에게 admin 메뉴가 보이는 UX 결함이 있다. 후속에서 `isAdmin` UI 필터 추가 권고(GAP-007-01
  (2)).
- **배너 삭제 즉시 수행**: 배너 삭제는 `danger` 버튼 클릭 시 확인 다이얼로그 없이 즉시 호출된다. 후속에서
  `AlertDialog` 재확인 추가 권고(GAP-007-01 (1)). 배너 편집(활성 토글 외 필드 수정) UI 도 미지원(GAP-007-01 (3)).
- **`SettlementView` 재사용**: admin 전체 정산은 006 의 `SettlementView` 를 재사용한다(id·sellerId·periodStart/
  End·totalSales·commission·payoutAmount·status·createdAt). admin 화면은 `sellerId` 컬럼을 표시한다(판매자 본인
  화면은 정산 기간 표시). 향후 admin/판매자 정산 응답 형태가 분기하면 타입 분리 필요.
- **admin/coupons 는 별도(008)**: 관리자 전역 쿠폰 화면(`/admin/coupons`)은 본 007 범위 외(facade·네비 미포함).
  008 차수에서 추가된다.

---

## [006-seller-coupon-settlement-stats] 구현 완료

> v1.1.0 의 여섯 번째 차수 — **FRONTEND-PLAN Phase 2(판매자 부가 운영 화면 — 통계·정산·쿠폰) + console 전
> 페이지 디자인 토큰 통일**. base `4daca5a` → `1a6d70d`. 커밋 2개: `1b3ffd1`(Phase 2 화면) → `1a6d70d`(토큰
> 통일). 변경 라인은 `git diff 4daca5a 1a6d70d -- apps/console packages` 로 재생성(15 files, +503/-51).
> **마이그레이션 없음**(DB 스키마 변경 0 — 프론트 console 화면 + 공유 패키지). **신규 의존성 0**(`package.json`
> 변경 없음). 선택 단계 전부 N. 004·005(판매자 주문·배송) 위에 판매자 운영 화면을 마저 올린다.

**변경 파일**:
- `apps/console/app/(dashboard)/seller/stats/page.tsx`(신규): 판매 통계. `useQuery(['seller','stats'],
  api.stats.seller, { enabled: isSeller })`(`GET /seller/stats` → `SellerStats`)로 조회 후 `StatCard` 2개
  (누적 매출 `formatKRW(salesTotal)`·완료 주문 수 `orderCount.toLocaleString('ko-KR')`건). 구매 확정
  (completed) 기준. 로딩·에러·비판매자(`EmptyState`) 분기.
- `apps/console/app/(dashboard)/seller/settlements/page.tsx`(신규): 정산 내역. `api.settlement.listMine()`
  (`GET /settlements` → `SettlementView[]`)로 조회 후 `@doa/ui` Table 렌더(정산 기간·총 매출·수수료
  `−formatKRW`·지급액·상태 Badge). status `completed`→"지급완료"(success)·그 외→"정산대기"(warning). 빈·
  비판매자 분기.
- `apps/console/app/(dashboard)/seller/coupons/page.tsx`(신규): 쿠폰 목록 + 생성 + 발급. `api.coupon.
  listSeller()`(`GET /sellers/me/coupons` → `CursorPage<Coupon>`, `data.items` Table — 할인·최소주문·발급/
  총량·만료·발급 버튼). `CreateCouponDialog`(Radix Dialog — `Select`(type FIXED/PERCENTAGE)·`Input`·클라이언트
  `validate`(discountValue>0·PERCENTAGE 1~100, 010 서버 검증 정합)·`createSeller`(`POST /sellers/me/coupons`)
  `onSuccess` invalidate `['seller','coupons']`+닫기). `IssueCouponDialog`(Radix Dialog — targetUserId·
  `issueSeller`(`POST /sellers/me/coupons/:id/issue` → `UserCoupon`) `onSuccess` 성공 문구+닫기). 기존
  `lib/order.ts` `formatKRW` 재사용.
- `packages/shared-types/src/index.ts`: 통계·정산·쿠폰 view 타입 8종(`SellerStats`·`SettlementStatus`·
  `SettlementView`·`CouponType`·`Coupon`·`CreateCouponRequest`·`IssueCouponRequest`·`UserCoupon`). 백엔드
  응답이 OpenAPI 에 미정의(Prisma 엔티티 반환 — 001 coupon-gap)이므로 전이형 view 타입으로 한시 정의. 금전
  필드(`salesTotal`·`totalSales`·`commission`·`payoutAmount`·`discountValue`·`maxDiscountAmount`·
  `minOrderAmount`)는 Decimal→JSON 직렬화상 **문자열**.
- `packages/api-client/src/index.ts`: `createApiClient` 반환에 `stats`(seller)·`settlement`(listMine)·
  `coupon`(listSeller·createSeller·issueSeller) 도메인 facade 추가. `api.http` 기반(`http.get/post`), view
  타입을 응답 제네릭으로 사용. `coupon.listSeller` 는 `{ query: { cursor, take } }`. 기존 facade(auth·user·
  seller·catalog·inventory·order·shipping)·`client`·`http` 불변.
- `apps/console/app/(dashboard)/layout.tsx`: AppShell `NAV` 판매자 섹션에 "쿠폰"(`/seller/coupons`)·"정산"
  (`/seller/settlements`)·"판매 통계"(`/seller/stats`) 3개 추가(`isSeller` 한정 노출).
- console 기존 화면 9개(`login`·`dashboard`·`account/profile`·`account/addresses`·`account/wishlist`·
  `seller/products`·`seller/products/[id]`·`seller/products/new`·`seller/register`): 하드코딩 팔레트
  (`zinc-*`·`red-*`·`amber-*`·`green-*`·`bg-white`)를 @doa/design-tokens 시맨틱 토큰 클래스(`bg-surface`·
  `text-foreground`·`text-muted-foreground`·`text-subtle-foreground`·`border-border`·`divide-border`·
  `bg-muted`·`rounded-card`·`text-danger`·`bg-warning-soft`·`border-warning`·`text-warning(-foreground)` 등)
  로 전환(클래스명만 교체, 구조·props·동작 불변). console 화면 하드코딩 팔레트 0건.

**검증**: `pnpm --filter console typecheck` 0 error / `pnpm --filter console build` 17 라우트 PASS(신규
`/seller/stats`·`/seller/settlements`·`/seller/coupons` 포함) / 기존 화면(상품·계정·관리자·주문·배송) 동작
회귀 0 / `grep -rE "(zinc|red|amber|green)-[0-9]{2,3}|bg-white" apps/console/app` **0건**. 신규 단위/e2e 테스트
0(UI 화면 — `git diff 4daca5a 1a6d70d -- apps/console packages` 에 `*.spec.ts`·`*.e2e.ts` 변경 0, 검증은
타입체크 + 빌드 + 정적 구조 리뷰 + grep 으로 갈음). 변경 라인 직접 카운트(coupons +235·settlements +78·
shared-types +70·stats +36·api-client +30·products[id] +16/-16·addresses +8/-8·wishlist +7/-7·products +7/-7·
profile +3/-3·dashboard +3/-3·login +3/-3·layout +3·products/new +2/-2·register +2/-2 = 15 files +503/-51).
마이그레이션 없음(DB 스키마 변경 0). 신규 의존 0(`package.json` 변경 없음). `@doa/ui`(StatCard·Select·Table·
Dialog)·`lib/order.ts`(formatKRW) 기존 자산 재사용(변경 0).

**해결**: **FRONTEND-PLAN Phase 2(판매자 운영 화면) — 004 GAP-004-01 (4)의 판매자 통계·정산·쿠폰 화면 부분
RESOLVED + 002 디자인 시스템의 화면 레벨 미통일 RESOLVED**. 004·005 가 완성한 Phase 1(주문 이행) 위에 판매자
매출 확인·정산 조회·쿠폰 생성/발급 운영 화면 3종을 제공. 004 와 동일하게 응답 스키마가 OpenAPI 미정의인
도메인이라 타입드 client 대신 전이형 view 타입 + `api.stats`/`api.settlement`/`api.coupon` facade 채택. 쿠폰
생성 폼에 010 서버 검증과 정합되는 클라이언트 검증 적용. 병행하여 console 전 화면의 하드코딩 팔레트를 시맨틱
토큰으로 통일하여 002 디자인 시스템을 화면 레벨까지 확장(하드코딩 0). 쿠폰 cursor 더보기·발급 후 목록 갱신·
서버 에러 표면 강화·낙관적 업데이트·e2e·응답 스키마 보강·다크 토글 UI 는 GAP-006-01(Low) / 002 GAP-002-01
후속.

**후속 작업 시 주의사항**:
- **응답 view 타입 한시성(004 연속)**: 통계·정산·쿠폰 view 타입(`@doa/shared-types` — `SellerStats`·
  `SettlementView`·`Coupon`·`UserCoupon` 등, 금전 string)은 백엔드 응답이 OpenAPI 에 미정의(Prisma 엔티티
  반환 — 001 coverage-gap)여서 한시 정의한 것이다. 백엔드에 도메인별 응답 DTO + `@ApiResponse({ type })` 를
  보강하고 코드젠을 재생성하면 생성 타입(`Schemas['...']`)으로 대체하고 화면을 003 타입드 client 로 전환할 수
  있다. 금전 필드는 Decimal→문자열이므로 대체 후에도 `string` 유지를 확인한다(부동소수점 금지 — P-005).
- **쿠폰 검증은 010 서버 검증과 정합(클라이언트는 UX)**: `coupons/page.tsx` 의 `validate`(discountValue>0·
  PERCENTAGE 1~100)는 제출 전 UX 즉시 피드백이며, 실제 강제는 백엔드 010 서버 검증(class-validator)이 담당한다.
  백엔드 검증 규칙이 바뀌면 클라이언트 `validate` 도 함께 갱신하여 정합을 유지한다(불일치 시 서버 거부가
  `ApiError` 로 표면화).
- **쿠폰 cursor 미소비·발급 후 비갱신(GAP-006-01, Low)**: `api.coupon.listSeller` facade 는 cursor/take 를
  지원하나 화면은 첫 페이지(`data.items`)만 렌더한다('더보기' 미구현). `issueSeller` `onSuccess` 는 목록을
  invalidate 하지 않아 발급/총량 컬럼이 발급 직후 즉시 갱신되지 않는다(다음 조회 시 반영). 더보기·즉시 반영이
  필요하면 cursor 추가 로드 + `['seller','coupons']` invalidate 를 추가한다.
- **금전 헬퍼 재사용(신규 0)**: 3개 신규 화면은 004 산출 `apps/console/lib/order.ts` 의 `formatKRW(amount:
  string)` 를 재사용한다. 신규 금전 헬퍼를 추가하지 않았으며, 신규 금전 화면은 동일 헬퍼를 재사용한다(부동
  소수점 금지 일관 — P-005).
- **토큰 통일 = 클래스명 교체(동작 불변)**: 기존 화면 9개의 토큰 전환은 하드코딩 Tailwind 팔레트를 시맨틱 토큰
  클래스로 일괄 치환한 것으로 컴포넌트 구조·props·핸들러는 불변이다. console 화면 하드코딩 팔레트는 0건이며,
  `.dark` 분기가 화면 레벨까지 작동한다(다크 토글 UI 는 002 GAP-002-01 잔여). 신규 화면도 시맨틱 토큰만
  사용하므로, 향후 화면 추가 시 하드코딩 팔레트 0 을 유지한다(grep 게이트 권고).
- **권한은 백엔드 강제(UI 표시 분기만)**: 본 화면들의 `isSeller` 분기는 표시 편의이며 데이터 보호가 아니다.
  실제 인가는 백엔드 판매자 스코프(쿠폰 생성은 APPROVED 판매자)가 강제한다. UI 분기만 믿고 백엔드 권한 검증을
  생략하면 안 된다.
- **`@doa/ui` 변경 0(기존 자산 재사용)**: 본 차수는 `StatCard`(`./card`)·`Select`(`./field`)·Table 프리미티브
  (`./table` — 004)·Dialog(Radix `./dialog` — 002)를 재사용하며 `@doa/ui` 를 변경하지 않았다. 디자인 시스템
  컴포넌트가 화면 요구를 이미 충족함을 보여준다(신규 화면이 패키지 변경 없이 구성됨).
- **Phase 2 후속(GAP-006-01, Low)**: 쿠폰 더보기·발급 후 목록 갱신·서버 에러 필드 매핑·낙관적 업데이트
  (`onMutate`)·정산/통계 기간 필터·차트·Playwright e2e 는 본 차수 범위 외다. 후속에서 보강한다.

## [005-order-shipping-gap-fill] 구현 완료

> v1.1.0 의 다섯 번째 차수 — **004 에서 발견·기록된 BE-GAP 2건(GAP-004-01 (1)·(2))을 백엔드 신규 라우트로
> 해소**. base `8bba04d`(004 완료) → `8b48eb5`(005 완료). 변경 라인은 `git diff 8bba04d 8b48eb5 -- apps/
> backend packages apps/console` 로 재생성(12 files, +415/-78). **마이그레이션 없음**(DB 스키마 변경 0 —
> 기존 shipment·order 테이블 조회만). **신규 의존성 0**(`package.json` 변경 없음). 선택 단계 Security=Y.

**변경 파일**:
- `apps/backend/src/modules/shipping/shipping.service.ts`: `getTracking` 의 인라인 권한 3축 검증을
  `_assertCanViewOrder(userId, orderId)` private 헬퍼로 추출하고, 신규 `getByOrder(userId, orderId)`(권한
  3축 검증 후 `findByOrderId` 반환, 송장 미존재 시 **null**)가 공유. 인가 단일 지점. 예외 메시지
  `'Not allowed to view this shipment'` 통일. `getTracking` 동작 불변(리팩토링).
- `apps/backend/src/modules/shipping/shipping.repository.ts`: `findByOrderId(orderId)` —
  `prisma.tx.shipment.findFirst({ where: { orderId }, orderBy: { createdAt: 'desc' } })`. 주문당 최신 송장
  1건(현재 주문당 1건 가정), 미존재 시 null.
- `apps/backend/src/modules/shipping/shipping.controller.ts`: `@Get()` `getByOrder(@CurrentUser,
  @Query('orderId'))` → `GET /shipments?orderId=`(권한 3축, `Shipment | null`).
- `apps/backend/src/modules/order/order.service.ts`: `getSellerOrderDetail(userId, orderId)` —
  `getApprovedSeller` → `orderRepository.findById` → 주문 미존재 404(`NotFoundException`)·items 중 본인
  `sellerId` 불일치 시 403(`ForbiddenException`). items 포함 `OrderWithDetails` 반환.
- `apps/backend/src/modules/order/seller-order.controller.ts`: `@Get(':orderId')` `getSellerOrder` →
  `GET /seller/orders/:orderId`(판매자 단건 주문 상세, 본인 소유).
- `apps/backend/openapi.json`: 신규 라우트 2개 재생성(paths 71 — `/shipments` 에 GET 추가·
  `/seller/orders/{orderId}` 신규).
- `packages/shared-types/src/index.ts`: `OrderItemView`(id·productId·sellerId·variantId·unitPrice[string]·
  quantity)·`SellerOrderDetail`(`SellerOrder` 확장 + `items: OrderItemView[]`). 금전 string(전이형 view
  타입 — 004 연속).
- `packages/shared-types/src/openapi.gen.ts`: 신규 라우트 2개 생성 타입 재생성.
- `packages/api-client/src/index.ts`: `order.getSellerDetail(orderId)`(GET `/seller/orders/:id` →
  `SellerOrderDetail`)·`shipping.getByOrder(orderId)`(GET `/shipments?orderId=` → `Shipment | null`,
  `{ query: { orderId } }`) facade 추가. 기존 facade 메서드 불변.
- `apps/console/app/(dashboard)/seller/orders/[id]/ship/page.tsx`: 진입 시 `shipmentQuery`
  (`api.shipping.getByOrder`)로 기존 송장 복구 + `orderQuery`(`api.order.getSellerDetail`)로 주문 상태·금액
  헤더 표시. `shipment = shipmentQuery.data ?? null` 로 등록 폼/관리 패널 분기. create·updateStatus
  `onSuccess` 가 `qc.setQueryData(['shipment','byOrder',orderId])` 캐시 갱신(004 세션 `useState` 대체 —
  재진입 정상 동작).
- `apps/backend/src/modules/shipping/shipping.service.spec.ts`: `getByOrder` 단위 테스트 3(seller→shipment·
  buyer+미존재→null·stranger→Forbidden[findByOrderId 미호출]).
- `apps/backend/src/modules/order/order.service.spec.ts`: `getSellerOrderDetail` 단위 테스트 3(owner→order·
  not_owner→Forbidden·missing→NotFound).

**검증**: `pnpm --filter backend typecheck` 0 error / `pnpm --filter backend test` 261 PASS(004 대비 **+6**:
getByOrder 3·getSellerOrderDetail 3) / `pnpm --filter backend test:e2e` 84 PASS / `openapi.json` paths 71
(`/shipments` GET·`/seller/orders/{orderId}`) / `pnpm --filter console typecheck` 0 error / `pnpm --filter
console build` 14 라우트 PASS(`/seller/orders/[id]/ship` ƒ 동적) / 기존 라우트·facade·view 타입·console 화면
회귀 0. 변경 라인 직접 카운트(ship +138/-72·openapi.gen +61/-1·openapi.json +60·shipping.spec +46·order.spec
+32·shipping.service +16/-5·order.service +14·shared-types +14·shipping.controller +10·seller-order.controller
+9·shipping.repository +8·api-client +7 = 12 files +415/-78). 마이그레이션 없음(DB 스키마 변경 0). 신규 의존
0(`package.json` 변경 없음).

**해결**: **004 GAP-004-01 의 BE-GAP 2건 RESOLVED** — (1) 판매자 단건 주문 조회(`GET /seller/orders/:orderId`,
items·소유검증)·(2) 주문→송장 조회(`GET /shipments?orderId=`, 권한 3축·null)를 백엔드에 추가하고, console
ship 페이지가 진입 시 `getByOrder` 로 기존 송장을 복구하고 `getSellerDetail` 로 주문 컨텍스트(상태·금액)를
표시하도록 전환하여 **004 의 세션 state 재진입 한계를 해소**했다. 그 과정에서 shipping 권한 3축 검증을
`_assertCanViewOrder` 로 추출해 `getTracking`·`getByOrder` 가 공유(중복 제거). 004 gaps.md 의 GAP-004-01
(1)·(2) 상태를 RESOLVED(005)로 갱신.

**후속 작업 시 주의사항**:
- **권한 헬퍼 단일 지점(핵심)**: shipping 의 권한 3축(구매자 본인 OR 해당 주문 판매자, 미허가 403)은 이제
  `_assertCanViewOrder` 한 곳에 모여 있다. `getTracking`·`getByOrder` 가 공유하므로, 권한 규칙 변경 시 이
  헬퍼만 수정하면 두 라우트에 일관 반영된다. 송장 관련 신규 조회 라우트 추가 시에도 이 헬퍼를 재사용한다.
- **송장 미존재 = null(예외 아님)**: `getByOrder`/`findByOrderId` 는 송장 미등록(발송 전)을 `null` 로 신호한다
  (404/throw 아님). console 은 `shipmentQuery.data ?? null` 로 등록 폼/관리 패널을 분기한다. 호출 측은 null
  을 정상 흐름으로 처리해야 한다.
- **주문당 송장 1건 가정**: `findByOrderId` 는 `findFirst orderBy createdAt desc` 로 최신 1건만 반환한다.
  분할배송(주문당 송장 N건) 도입 시 이 가정을 재검토하고 배열 반환 + 송장 선택 UI 가 필요하다(GAP-005-01).
- **응답 view 타입 한시성(004 연속)**: `SellerOrderDetail`·`OrderItemView` 도 백엔드 응답이 OpenAPI 미정의
  (Prisma 엔티티 반환)여서 전이형 view 타입(금전 string)으로 한시 정의한 것이다. 응답 DTO + `@ApiResponse
  ({ type })` 보강 후 코드젠 재생성하면 생성 타입으로 대체 가능하다(004 GAP-004-01 (3) / 001 GAP-001-01 연속).
- **주문 items UI 미렌더**: `getSellerOrderDetail` 은 items 포함 주문을 반환하나, console ship 헤더는 상태·
  금액만 표시한다. 품목 상세 표시가 필요해지면 `SellerOrderDetail.items` 렌더를 추가한다(GAP-005-01).
- **Phase 2 후속(GAP-005-01, Low)**: 송장 status 업데이트 e2e·낙관적 업데이트(`onMutate`)는 본 차수 범위
  외다(004 와 동일). console mutation 은 서버 응답 후 `setQueryData`/`invalidate` 로 정합성을 유지한다.

## [004-seller-order-shipping] 구현 완료

> v1.1.0 프론트엔드 사이클의 네 번째 차수(003 api-client 다음, FRONTEND-PLAN Phase 1 판매자 화면 첫 차수).
> base `0db61b9`(003 완료) → `8bba04d`(004 완료). 변경 라인은 `git diff 0db61b9 8bba04d -- packages
> apps/console` 로 재생성(8 files, +481/-10). **마이그레이션 없음**(DB 스키마 변경 0 — 프론트 console 화면 +
> 공유 패키지). **신규 의존성 0**(`package.json` 변경 없음). 001~003(공유 기반 Phase 0) 위에 첫 도메인 화면.

**변경 파일**:
- `apps/console/app/(dashboard)/seller/orders/page.tsx`(신규): 판매자 주문 목록. `useQuery(['seller','orders'],
  api.order.listSeller, { enabled: isSeller })`로 조회 후 `@doa/ui` Table 렌더(주문 ID 앞 12자…·상태
  Badge[`ORDER_STATUS_TONE`/`LABEL`]·결제금액[`formatKRW`, 우측]·주문일·조치). `OrderAction` 상태별 분기 —
  `confirmed`→"주문 확인" 버튼(`api.order.confirm` mutation, `onSuccess` invalidate)·`preparing`→"송장 등록"
  링크·`shipped`/`delivered`→"배송 관리" 링크·그 외→"—". 로딩·에러(`ApiError`)·빈(`EmptyState`)·비판매자 분기.
- `apps/console/app/(dashboard)/seller/orders/[id]/ship/page.tsx`(신규): 송장 등록 + 배송 관리. 송장
  미등록 시 등록 폼(carrier·trackingNumber `Input`, 빈 값 비활성화)→`api.shipping.create`(`POST /shipments`,
  preparing→shipped), 생성 `Shipment` 를 세션 state(`useState`) 보관. 등록 후 배송 상태 Card
  (`updateStatus('in_transit')`="배송중 처리"·`updateStatus('delivered')`="배송완료 처리",
  `delivered` 시 버튼 비활성화) + 추적 이력 Card(`api.shipping.tracking`, `enabled: !!shipment`, 상태·설명·
  발생 시각 시간순).
- `apps/console/lib/order.ts`(신규): `ORDER_STATUS_LABEL`/`ORDER_STATUS_TONE`(Badge tone)·
  `SHIPMENT_STATUS_LABEL`·`formatKRW(amount: string)`(Decimal 문자열을 `Number().toLocaleString('ko-KR')`로
  표기, `Number.isFinite` 방어 — 부동소수점 금지 P-005).
- `packages/shared-types/src/index.ts`: 주문·배송 view 타입 7종(`OrderStatus`·`SellerOrder`·`ShipmentStatus`·
  `Shipment`·`ShipmentTracking`·`CreateShipmentRequest`·`UpdateShipmentStatusRequest`). 백엔드 응답이 OpenAPI
  에 미정의(Prisma 엔티티 반환 — 001 coverage-gap)이므로 전이형 view 타입으로 한시 정의. 금전 필드
  (`totalAmount`·`discountAmount`)는 Decimal→JSON 직렬화상 **문자열**.
- `packages/api-client/src/index.ts`: `createApiClient` 반환에 `order`(listSeller·confirm)·`shipping`
  (create·updateStatus·tracking) 도메인 facade 추가. `api.http` 기반(`http.get/post/patch`), view 타입을
  응답 제네릭으로 사용. 기존 facade(auth·user·seller·catalog·inventory)·`client`·`http` 불변.
- `packages/ui/src/table.tsx`(신규) + `packages/ui/src/index.ts`: 경량 Table 프리미티브 6종(`Table`·`THead`·
  `TBody`·`TR`·`TH`·`TD` — 시맨틱 토큰 `border-border`·`bg-muted/50`·`divide-border`·`text-foreground`) 추가·
  재노출. 주석 "정렬·필터가 필요해지면 TanStack Table 로 확장".
- `apps/console/app/(dashboard)/layout.tsx`: AppShell `NAV` 판매자 섹션에 "주문·배송"(`/seller/orders`) 항목
  추가(`isSeller` 한정 노출) + 잔여 zinc 토큰을 시맨틱 토큰(`border-border`·`bg-surface`·`text-muted-foreground`·
  `bg-accent`·`text-on-accent`·`bg-muted`·`rounded-control`)으로 전환(잔여 zinc 0).

**검증**: `pnpm --filter console typecheck` 0 error / `pnpm --filter console build` 14 라우트 PASS
(`/seller/orders` ○ 정적·`/seller/orders/[id]/ship` ƒ 동적) / 기존 화면(상품·계정·관리자) 회귀 0. 신규
단위/e2e 테스트 0(UI 화면 — `git diff 0db61b9 8bba04d -- packages apps/console` 에 `*.spec.ts`·`*.e2e.ts`
변경 0, 검증은 타입체크 + 빌드 + 정적 구조 리뷰로 갈음). 변경 라인 직접 카운트(ship +173·orders +140·
shared-types +61·lib/order +37·table.tsx +35·api-client +23·layout +11/-10·ui index +1 = 8 files +481/-10).
마이그레이션 없음(DB 스키마 변경 0). 신규 의존 0(`package.json` 변경 없음 — P-002 무저촉 자명).

**해결**: **FRONTEND-PLAN Phase 1(판매자 화면) 주문·배송 이행 — 003 GAP-003-01 의 판매자 도메인 화면 부분
RESOLVED**. 001~003 이 완성한 공유 기반(생성 타입·디자인 시스템·타입드 api-client) 위에 판매자가 주문을
이행(결제 완료 주문 확인 → 송장 등록(발송) → 배송 상태 전이 → 추적 조회)할 첫 도메인 화면을 제공. 응답
스키마가 OpenAPI 미정의인 주문·배송 도메인이라 타입드 client 대신 전이형 view 타입 + `api.order`/`api.shipping`
facade 를 채택(요청 측 정확, 응답은 한시 view 타입). 판매자 주문 상세·주문→송장 조회 엔드포인트(BE-GAP)·응답
스키마 보강·rhf/낙관적 업데이트/서버 페이지네이션/DataTable 은 GAP-004-01(Low~Medium) / Phase 2·백엔드 후속.

**후속 작업 시 주의사항**:
- **응답 view 타입 한시성(핵심)**: 주문·배송 응답 view 타입(`@doa/shared-types` — `SellerOrder`·`Shipment`
  등, 금전 string)은 백엔드 응답이 OpenAPI 에 미정의(Prisma 엔티티 반환 — 001 coverage-gap)여서 한시 정의한
  것이다. 백엔드에 도메인별 응답 DTO + `@ApiResponse({ type })` 를 보강하고 코드젠을 재생성하면, 이 view
  타입을 생성 타입(`Schemas['...']`)으로 대체하고 화면을 003 타입드 client(`api.client.GET`)로 전환할 수 있다.
  금전 필드는 Decimal→문자열이므로 대체 후에도 `string` 유지를 확인해야 한다(부동소수점 금지 — P-005).
- **BE-GAP: 판매자 주문 상세 엔드포인트 부재(GAP-004-01, Medium)**: `GET /orders/:id` 는 구매자 스코프이므로
  판매자용 단건 주문 상세 조회 엔드포인트가 없다. ship 페이지는 주문 상세(items 등)를 직접 가져오지 못하고
  `useParams` 의 orderId 만 사용한다. 백엔드에 `GET /seller/orders/:id`(items 포함) 추가 시 ship 페이지에
  주문 상세 표시를 보강한다.
- **BE-GAP: 주문→송장 조회 엔드포인트 부재(GAP-004-01, Medium)**: `GET /shipments?orderId` 또는 주문 응답에
  shipment 포함이 없어, 이미 발송된 주문에 ship 페이지 재진입 시 기존 shipment id 를 복구하지 못한다. 현재는
  송장 등록 **직후 세션 state** 의 shipment id 로 상태변경·추적이 동작한다(세션 내 완결). 재진입 시 재등록
  시도는 백엔드가 400(주문이 preparing 아님)으로 거부한다. 백엔드 조회 엔드포인트 추가 시 진입 시 기존 송장
  복구를 구현한다.
- **상태 전이는 백엔드 강제**: 주문 상태(7종)·배송 상태(4종) 전이는 백엔드가 강제한다 — confirm(confirmed→
  preparing)·송장 등록(preparing→shipped)·배송완료(delivered 시 주문도 delivered). 프론트는 라벨·톤 매핑과
  조치 분기만 담당한다. 신규 상태 추가 시 `lib/order.ts` 의 `Record<OrderStatus,...>`/`Record<ShipmentStatus,
  ...>` 매핑을 갱신해야 타입체크가 통과한다.
- **권한은 백엔드 강제(UI 표시 분기만)**: 본 화면의 `isSeller` 분기는 표시 편의이며 데이터 보호가 아니다.
  실제 인가는 백엔드 판매자 스코프·권한 3축이 강제한다. UI 분기만 믿고 백엔드 권한 검증을 생략하면 안 된다.
- **Table 프리미티브 확장 경로**: `@doa/ui` Table 6종은 경량 마크업(시맨틱 토큰)이며 정렬·필터가 없다. 목록
  정렬/필터/서버 페이지네이션이 필요해지면 TanStack Table 기반 DataTable 로 확장한다(Phase 2 — `table.tsx`
  주석 명시). 현재 주문 목록은 `GET /seller/orders` 전체 배열을 렌더한다(서버 페이지네이션 미적용).
- **Phase 2 후속(GAP-004-01, Low)**: 송장 등록 폼은 제어 컴포넌트 + 빈 값 비활성화이며 rhf+zod 검증을
  사용하지 않는다. mutation 은 서버 응답 후 `setState`/`invalidateQueries`(낙관적 업데이트 미적용). e2e
  테스트도 없다. Phase 2 에서 rhf+zod·낙관적 업데이트·서버 페이지네이션·DataTable·Playwright e2e 를 보강한다.

## [003-api-client-typed] 구현 완료

> v1.1.0 프론트엔드 사이클의 세 번째 차수(002 디자인 시스템 다음). base `29eb81f`(002 SDD 문서 커밋) →
> `1671814`(003 완료). 변경 라인은 `git diff 29eb81f 1671814 -- packages/api-client` 로 재생성(4 files,
> +146/-84 — `pnpm-lock.yaml` 부수 변경 제외). **마이그레이션 없음**(DB 스키마 변경 0 — 프론트 HTTP
> 클라이언트 패키지). FRONTEND-PLAN Phase 0(타입 공유) 완성 — 001(생성 타입 SSOT)의 소비자 차수.

**변경 파일**:
- `packages/api-client/src/auth-fetch.ts`(신규): `createAuthFetch(opts): typeof fetch` 팩토리. 토큰 주입
  (Authorization Bearer)·401 자동 refresh(원요청 `isRetry` 1회 재시도)·`refreshing` in-flight 가드(동시
  401 시 단일 refresh Promise 공유 — 전역 1회)·`doaAnonymous` 익명 분기(login/register/refresh 토큰·refresh
  생략)·`buildUrl`(절대 URL `^https?://` 통과 / 상대경로 baseUrl 절대화 — 이중 prefix 회피)·`doRefresh`
  (refresh 요청은 가드 밖 직접 fetch — 무한 재귀 회피). `TokenStore`·`AuthFetchOptions`·`AuthRequestInit`
  인터페이스 정의.
- `packages/api-client/src/http.ts`: `HttpClient` 에서 refresh 로직 제거 → 공유 authFetch 위임(중복 제거).
  본 클래스는 쿼리 직렬화(`withQuery`)·JSON 본문·표준 에러 변환(`ApiError`)·204 처리만 담당. 생성자
  `constructor(opts, authFetch?)` optional 주입(주입 우선, 없으면 `createAuthFetch(opts)` 자체 생성).
  `options.anonymous` → `init.doaAnonymous` 매핑. `HttpClientOptions = AuthFetchOptions`(@deprecated alias).
- `packages/api-client/src/index.ts`: `openapi-fetch` 의 `createOpenApiClient<paths>({ baseUrl, fetch:
  authFetch })` 로 전 도메인 70경로 타입드 클라이언트(`client`) 추가. `createApiClient` 가
  `createAuthFetch(options)` 로 authFetch **1개** 생성 → `new HttpClient(options, authFetch)` 와 타입드
  `client` 에 **공유 주입**(refresh in-flight 전역 1회 일관). 반환에 `client`(신규 화면용
  `api.client.GET('/seller/orders', { params, ... })`)·`http`(저수준) + 기존 도메인 facade(auth·user·seller·
  catalog·inventory) 공존. `TypedClient` 타입·`createAuthFetch`·`AuthFetchOptions`·`TokenStore` 재노출.
- `packages/api-client/package.json`: `openapi-fetch ^0.17.0`(dependency) 추가. 생성 타입 `paths`(001 산출)
  소비 타입드 HTTP 클라이언트. AWS/Fly.io 전용 SDK 아님(P-002 무저촉).

**검증**: `pnpm --filter console typecheck` 0 error / `pnpm --filter console build` 13 라우트 PASS
(openapi-fetch 번들·타입드 client 컴파일 확인) / 기존 facade·refresh 동작 회귀 0. 신규 단위 테스트 0(인프라/
클라이언트 — `git diff 29eb81f 1671814 -- packages/api-client` 에 `*.spec.ts` 변경 0, 검증은 타입체크 + 빌드
+ 정적 구조 리뷰로 갈음). 변경 라인 직접 카운트(auth-fetch.ts +98/-0·http.ts +29/-82·index.ts +17/-1·
package.json +2/-1 = 4 files +146/-84). 마이그레이션 없음(DB 스키마 변경 0). 신규 의존 1종(`openapi-fetch`)은
AWS/Fly.io 전용 SDK 아님(P-002 무저촉).

**해결**: **001 §범위 외 "`@doa/api-client` 의 생성 타입 전면 전환"(GAP-001-01 (3)) 수행 — FRONTEND-PLAN
Phase 0(타입 공유) 완성**. 001 이 확립한 생성 타입 SSOT(`openapi.gen.ts` paths 70경로)를 `openapi-fetch`
`createClient<paths>` 로 직접 소비하는 전 도메인 70경로 타입드 클라이언트(경로·params·query·body·response
전부 타입)를 제공. 동시에 401 refresh 로직을 `createAuthFetch`(공유 fetch 래퍼)로 추출하여 legacy facade 와
타입드 client 가 **동일 authFetch 인스턴스를 공유**(refresh 전역 in-flight 1회 일관)하게 하고, 기존 facade·
console 호출을 비파괴로 유지(회귀 0). console 화면 마이그레이션·수기 타입 폐기·응답 스키마 보강은 GAP-003-01
(Low) / Phase 1+ 후속.

**후속 작업 시 주의사항**:
- **refresh 공유의 전제(핵심)**: refresh 전역 1회 일관은 `createApiClient` 가 `createAuthFetch(options)` 로
  authFetch 인스턴스를 **1개만** 생성하여 `HttpClient`(facade)와 openapi-fetch `client` 에 공유 주입하는
  것에 의존한다(`refreshing` in-flight 가드는 클로저 단위). 향후 `createApiClient` 내부에서 authFetch 를
  복수 생성하거나 `client` 에 별도 fetch 를 주입하면 이 보장이 깨져 동시 401 시 refresh 가 중복 실행된다.
- **이중 prefix 회피(buildUrl)**: openapi-fetch 는 `baseUrl + path`(절대 URL)로 주입 fetch 를 호출하므로,
  `createAuthFetch.buildUrl` 이 절대 URL(`^https?://`)을 그대로 통과시켜야 한다(baseUrl 재prefix 시 이중
  prefix). HttpClient(facade)는 상대경로(`/products/...`)를 넘겨 baseUrl 로 절대화된다. 향후 URL 처리를
  변경할 때 이 절대/상대 분기를 유지해야 한다.
- **익명 요청 분리(doaAnonymous)**: login/register/refresh 는 `doaAnonymous` 플래그로 Authorization 미주입·
  401 refresh 재시도 생략한다. refresh 요청(`/auth/refresh`)은 `doRefresh` 내부에서 authFetch 가드를 거치지
  않고 직접 fetch 한다(refresh 무한 재귀 회피). facade 의 `{ anonymous: true }` 옵션이 `doaAnonymous` 로
  매핑되므로, 신규 익명 엔드포인트 추가 시 `anonymous`/`doaAnonymous` 를 설정해야 한다.
- **console 마이그레이션 점진(GAP-003-01, Low)**: 003 은 타입드 client 를 **추가** 하고 도메인 facade·
  console 호출을 불변(비파괴) 유지한다. console 페이지의 기존 facade 호출(`api.auth.login` 등)을
  `api.client.GET/POST(...)` 로 전환하고 수기 shared-types 타입을 폐기하는 작업은 Phase 1+ 후속이다. 신규
  화면은 facade 추가 없이 `api.client` 를 직접 사용한다(전 도메인 70경로).
- **응답 스키마 품질 백엔드 의존(GAP-003-01, Low)**: 타입드 client 의 response 타입은 백엔드 OpenAPI 응답
  정의에서 도출된다. 001 에서 87 operations 중 typed 2xx response content 는 36건이며 나머지는 응답 본문이
  타입 미주석이다(`@ApiResponse({ type })` 미부여 — 001 GAP-001-01). 따라서 일부 엔드포인트는
  `api.client.GET(...)` 의 response 타입이 비어 있을 수 있다. 백엔드에 응답 DTO + `@ApiResponse({ type })`
  를 보강하고 코드젠을 재생성하면 client response 타입이 자동 완성된다.
- **authFetch 단위 테스트 부재(GAP-003-01, Low)**: refresh in-flight 가드·doaAnonymous 분기·buildUrl 보정·
  `isRetry` 1회 재시도는 단위 테스트 없이 빌드/타입체크·정적 리뷰로 갈음했다(인프라 성격). refresh 동시성
  같은 경합은 단위 테스트 없이 회귀 탐지가 어려우므로, 후속에 동시 401 → refresh 1회·doaAnonymous 분기·
  buildUrl 케이스·재시도 1회 단위 테스트 추가를 권고한다.
- **HttpClientOptions deprecated alias**: `http.ts` 의 `HttpClientOptions` 는 `AuthFetchOptions` 의
  `@deprecated` alias(동일 타입)다. 기존 `createApiClient(options: HttpClientOptions)` 호출 호환을 위해
  유지하며, 향후 `AuthFetchOptions` 로 통일을 권고한다.
- **신규 의존 1종**: `openapi-fetch ^0.17.0`(api-client dependency). AWS/Fly.io 전용 SDK 가 아닌 생성 타입
  소비 타입드 HTTP 클라이언트로 P-002 무저촉. `pnpm-lock.yaml` 에 `openapi-fetch@0.17.0` 반영(부수 변경).

## [002-design-system-foundation] 구현 완료

> v1.1.0 프론트엔드 사이클의 두 번째 차수(001 OpenAPI 코드젠 다음). base `3a6dbc9`(001 SDD 문서 커밋) →
> `721cb22`(002 완료). 커밋 3개: `ea7521e`(design-tokens) → `d3dc628`(console 토큰 연결 + @doa/ui shadcn
> 전환) → `721cb22`(Storybook + 공유 theme.css SSOT 분리). 변경 라인은 `git diff 3a6dbc9 721cb22 --
> packages apps/console` 로 재생성(28 files, +779/-74 — 생성물 `build/*` 미포함). **마이그레이션 없음**
> (DB 스키마 변경 0 — 클라이언트 디자인 토큰·UI·빌드 설정). DESIGN-PLAN Phase 0(디자인 토대).

**변경 파일**:
- `packages/design-tokens/tokens/primitive/{color,dimension,typography,effect}.json`(신규): W3C DTCG 원시
  토큰 — brand(50~900)·neutral(0~950)·status(green/amber/red/blue) 색상, space(0~16)·radius(sm~full)·
  border width, font(family sans/mono·size xs~3xl·weight·lineHeight), shadow·duration·easing. 참조 전용.
- `packages/design-tokens/tokens/semantic/{base,color.light,color.dark}.json`(신규): 시맨틱 토큰 —
  `base`(theme 독립 radius control/card/modal/pill·space gutter/section/inset·text body/heading/display·
  motion control/overlay), `color.light`/`color.dark`(의미 색상 bg·fg·border·accent·success·warning·
  danger·info). 다크모드는 `color.dark.json` 만 분기.
- `packages/design-tokens/build.mjs`(신규): Style Dictionary v4 **programmatic** 빌드. light/dark 인스턴스
  2개 + 커스텀 포맷 `doa/tailwind-preset`·`doa/dart-light`·`doa/dart-dark`. filter `isSemantic`/
  `isSemanticColorDark`(primitive 미유출). `_root.css`+`_dark.css` → `tokens.css` 결합 후 임시 파일 제거.
  산출: `build/web/{tokens.css(86줄),tailwind-preset.cjs}`·`build/flutter/{light,dark}_tokens.dart(45줄)`.
- `packages/design-tokens/css/theme.css`(신규): `@theme inline` — 시맨틱 토큰 변수 → Tailwind 유틸리티
  토큰(`--color-surface: var(--bg-surface)`·`--color-foreground`·`--color-border`·`--color-ring`·
  `--radius-control` 등). console·Storybook 공유 SSOT(중복 제거).
- `packages/design-tokens/package.json`·`README.md`(신규): `style-dictionary ^4.4.0` devDep + `build`
  스크립트 + 패키지 문서.
- `packages/ui/src/cn.ts`: `cn = twMerge(clsx(...))`(shadcn 표준).
- `packages/ui/src/button.tsx`: `cva` 변형(variant primary/secondary/ghost/danger/link × size sm/md/lg/
  icon + fullWidth) + `asChild`(Radix Slot) + `focus-visible:ring-ring` 포커스링. 하드코딩 → 시맨틱 토큰.
- `packages/ui/src/dialog.tsx`(신규): Radix Dialog 래핑(Root/Trigger/Close/Content/Header/Title/
  Description/Footer). 포커스 트랩·ESC·ARIA 기본 제공 + lucide `X`·`aria-label="닫기"` + 토큰.
- `packages/ui/src/{card,field,feedback,page-header}.tsx`: 하드코딩 팔레트(`zinc-*`·`red-*`)를 시맨틱 토큰
  클래스(`bg-surface`·`text-foreground`·`border-border`·`bg-{success,warning,danger,info}-soft`·
  `text-danger` 등)로 전환. Badge tones(neutral/success/warning/danger/info/dark). 외부 API 불변.
- `packages/ui/src/index.ts`: `Dialog`군·`cn`·`buttonVariants` export 추가(기존 컴포넌트 export 불변).
- `packages/ui/.storybook/{main,preview}.ts`·`tailwind.css`(신규): Storybook 10 react-vite. `main.ts`
  `viteFinal` 로 `@tailwindcss/vite` 주입, `preview.ts` → `tailwind.css`(tailwindcss + tokens.css +
  theme.css + `@source '../src'`).
- `packages/ui/src/{button,feedback}.stories.tsx`(신규): Button(변형·AllVariants)·Feedback(Badge tones·
  EmptyState) 스토리.
- `packages/ui/package.json`·`.gitignore`: 의존(`@radix-ui/react-dialog`·`@radix-ui/react-slot`·
  `class-variance-authority`·`clsx`·`tailwind-merge`·`lucide-react`·storybook 4종) + `storybook`/
  `build-storybook` 스크립트 + `storybook-static/` gitignore.
- `apps/console/app/globals.css`: `@import 'tailwindcss'` + design-tokens `tokens.css` + 공유 `theme.css`
  + `@source '../../../packages/ui/src'`. html,body 토큰 적용(`var(--bg-canvas)`·`var(--fg-default)`).
- `apps/console/package.json`: `@doa/design-tokens` workspace dep 추가.

**검증**: `design-tokens build` 성공(tokens.css 86줄 — :root light 전체 + .dark 색상 오버라이드, primitive
미유출) / `@doa/ui` 잔여 하드코딩 0건(grep, stories 제외) + export API 불변 / `pnpm --filter console build`
13 라우트 PASS / `build-storybook` 성공 / `pnpm --filter console typecheck` EXIT 0(회귀 0). 신규 단위
테스트 0(토큰/컴포넌트/빌드 — Storybook 카탈로그가 시각 검증 대체, `git diff 3a6dbc9 721cb22` 에 `*.spec.ts`
변경 0). 마이그레이션 없음(DB 스키마 변경 0). 신규 의존 11종 전부 클라이언트 UI·빌드 도구(AWS/Fly.io 전용
SDK 아님 — P-002 무저촉).

**해결**: **`@doa/ui` 하드코딩·토큰/다크모드/SSOT 부재 제거(DESIGN-PLAN Phase 0 디자인 토대 핵심 목표)** —
코드-퍼스트 W3C 디자인 토큰(3계층 primitive→semantic→theme) → Style Dictionary → 웹(tokens.css·preset)·
Flutter(dart) 자동 생성으로 **디자인 결정의 SSOT 를 토큰 JSON 으로 단일화**. `@doa/ui` 를 Radix+shadcn
패턴 + 시맨틱 토큰 클래스로 전환(하드코딩 0·접근성 내장·다크모드 분기 구조), console 연결 + 공유 @theme
SSOT, Storybook 카탈로그 확립. 풍부한 인벤토리·a11y 자동화·다크 토글·Flutter 소비는 GAP-002-01(Low) /
Phase 1~5 후속.

**후속 작업 시 주의사항**:
- **primitive 미유출 원칙(핵심)**: web 산출은 빌드 filter(`isSemantic`/`isSemanticColorDark`)로 **semantic
  토큰만** CSS 변수로 노출한다. 컴포넌트는 `color.brand.600` 같은 원시값이 아닌 `accent-solid` 같은 의미값
  에만 결합해야 하며, 팔레트 교체는 `color.light`/`color.dark` 의 semantic 매핑만 수정한다. 향후 primitive
  를 CSS 변수로 노출하지 않도록 유지해야 한다.
- **`@source` 누락 함정**: Tailwind 4 는 워크스페이스 패키지의 `node_modules` 경로를 기본 미스캔한다.
  console `globals.css`·Storybook `tailwind.css` 의 `@source`(`@doa/ui` src)가 없으면 시맨틱 토큰 클래스가
  최종 CSS 에서 누락되어 스타일이 적용되지 않는다. 새 소비처 추가 시 `@source` 필수.
- **토큰 재생성·미커밋 산출물**: `build/` 는 root `.gitignore` 로 **추적되지 않는다**(001 의 openapi.json
  과 달리 미커밋). 토큰 JSON 변경 후 `pnpm --filter @doa/design-tokens build` 로 재생성해야 소비처에
  반영된다. CI/로컬 빌드 시 `design-tokens build` 가 console·Storybook build 선행으로 필요할 수 있다.
- **`tailwind-preset.cjs` 미연결(GAP-002-01, Low)**: 빌드가 `tailwind-preset.cjs`(Tailwind v3 스타일
  preset)를 생성하나, Tailwind 4 console·Storybook 은 `@theme`(공유 `theme.css`)를 사용하여 preset 의
  소비처가 없다(참조용). v3 소비처가 생기지 않는 한 preset 은 산출물로만 남는다.
- **다크모드 토글 UI 부재**: `.dark` 셀렉터·`color.dark.json` 분기는 구현되나 런타임 테마 전환 UI(`.dark`
  클래스 토글)는 미구현이다. 라이트 모드가 기본 적용된다. AppShell(DESIGN-PLAN §5-3)의 상단 테마 토글과
  함께 후속 구성한다.
- **a11y 자동 감사·시각 회귀 부재(GAP-002-01, Low)**: WCAG AA 는 Radix 프리미티브(트랩·ARIA)·포커스 링
  으로 구조 확보하나, axe 자동 접근성 감사·Chromatic 시각 회귀는 미구축이다(Storybook 카탈로그는 수동
  검토). 인벤토리 확장 후 a11y 애드온 + 시각 회귀 CI 게이트 추가를 권고한다.
- **컴포넌트 인벤토리·Flutter 소비 후속**: 002 는 토대 컴포넌트(Button·Dialog·Card·field·feedback·
  page-header)까지다. DataTable(TanStack Table)·Form(rhf+zod)·MoneyInput·FileUpload·AppShell·CommandPalette
  등은 Phase 1~4, Flutter `{light,dark}_tokens.dart` 의 `ThemeData` 소비는 Phase 5. 후속 컴포넌트는 동일
  패턴(cva + 시맨틱 토큰 + Radix)으로 확장한다.
- **@doa/ui API 하위호환**: 토큰 전환은 컴포넌트 외부 export(컴포넌트명·props)를 변경하지 않았다(시각
  변화는 있으나 빌드·타입 계약 불변). 향후 컴포넌트 props 변경 시 console 소비처 영향을 사전 점검한다.

## [001-openapi-codegen-foundation] 구현 완료

> v1.1.0 은 프론트엔드 릴리즈 사이클의 첫 차수다(v1.0.0 은 백엔드 18도메인 재구축 사이클). 본 항목이
> v1.1.0 CHANGES.md 의 최초 기록이다. base `6c4ddae`(v1.0.0 백엔드 013 완료) → `678ba1c`(001 완료). 변경
> 라인은 `git diff 6c4ddae 678ba1c -- apps/backend packages/shared-types` 로 재생성. **마이그레이션 없음**
> (DB 스키마 변경 0 — 본 차수는 타입 계약 생성·코드젠). FRONTEND-PLAN.md Phase 0(공유 기반).

**변경 파일**:
- `apps/backend/nest-cli.json`: `compilerOptions.plugins` 에 `@nestjs/swagger` CLI 플러그인
  (`introspectComments:true`, `dtoFileNameSuffix:[".dto.ts",".entity.ts"]`) 등록 → `nest build` 컴파일 시
  DTO(class-validator + JSDoc)에서 `@ApiProperty` 메타데이터 자동 주입(수기 데코레이터 0).
- `apps/backend/src/openapi.ts`(신규): OpenAPI 문서 생성기. `NestFactory.create(AppModule, { logger:false
  })`(listen 없이 부팅) → `DocumentBuilder`(title `DOA Market API`·version `1.0.0`·`addBearerAuth({
  type:'http', scheme:'bearer', bearerFormat:'JWT' }, 'access-token')`) → `SwaggerModule.createDocument` →
  `apps/backend/openapi.json` 직렬화 → `app.close` + `process.exit`.
- `apps/backend/package.json`: `openapi:gen = "nest build && node dist/openapi.js"` 스크립트 +
  `@nestjs/swagger ^11.4.4`(NestJS 11 호환) 의존 추가. 플러그인은 빌드 단계에만 적용되므로 ts-node 직접
  실행 아닌 빌드 산출물 실행.
- `apps/backend/openapi.json`(신규 생성물): 산출 OpenAPI 문서(OpenAPI 3.0.0, 70 paths / 32 component
  schemas, 72K). component schemas 32종 = 입력 DTO `*Dto` 31 + `OrderItemInput`. 속성·타입·검증 제약
  (`minLength:8`·`minimum:1`·`format:email`)·enum(`FIXED`/`PERCENTAGE`)·required·JSDoc 한글 설명 자동
  채움. 편의상 레포 커밋(CI 재생성 가능).
- `packages/shared-types/package.json`: `openapi-typescript ^7.13.0`(devDependency) +
  `gen = "openapi-typescript ../../apps/backend/openapi.json -o src/openapi.gen.ts"` 스크립트.
- `packages/shared-types/src/index.ts`: `export type { paths, components, operations } from './openapi.gen'`
  + `Schemas = components['schemas']`·`Schema<K>` 헬퍼 재노출. 기존 수기 타입(001/002 도메인 — `LoginRequest`
  ·`UserProfile`·`Product` 등)은 console 호환 위해 한시 유지(점진 대체).
- `packages/shared-types/src/openapi.gen.ts`(신규 생성물): 자동 생성 타입(3220줄, paths/components/
  operations interface, 84K). 편의상 레포 커밋.

**검증**: `openapi:gen` 성공(paths 70 출력) / `gen` 성공(openapi.gen.ts 3220줄) / `pnpm --filter console
typecheck` 회귀 0 / backend `tsc --noEmit` EXIT 0. 신규 단위 테스트 0(코드젠/인프라 — `git diff 6c4ddae
678ba1c` 에 `*.spec.ts` 변경 0). 생성물 수치 직접 카운트(paths 70·schemas 32·gen 3220줄). 마이그레이션
없음(DB 스키마 변경 0). 신규 의존 2종(`@nestjs/swagger`·`openapi-typescript`)은 AWS/Fly.io 전용 SDK 아님
(P-002 무저촉).

**해결**: **수기 shared-types 18도메인 동기화 부담 제거(FRONTEND-PLAN Phase 0 핵심 목표)** — 백엔드
OpenAPI 자동 생성(`@nestjs/swagger` CLI 플러그인 introspect) + 프론트 `openapi-typescript` 코드젠으로
**입력 계약의 SSOT 를 백엔드 코드(DTO + class-validator + JSDoc)로 단일화**. 수기 타입(001/002 도메인만,
11도메인 누락) 대신 70 paths/32 schemas 가 결정적으로 생성되며, 백엔드 변경이 `openapi:gen` → `gen` 2단계
재실행으로 프론트에 전파된다. 응답 스키마 보강·api-client 전환·생성물 CI 검증은 GAP-001-01(Low) 후속.

**후속 작업 시 주의사항**:
- **플러그인 빌드 경유 필수(핵심 함정)**: `@nestjs/swagger` CLI 플러그인은 `nest build` 컴파일 단계에만
  `@ApiProperty` 메타데이터를 주입한다. `ts-node src/openapi.ts` 직접 실행은 플러그인 미적용으로 **빈
  스키마**(속성 0)를 산출한다. `openapi:gen = "nest build && node dist/openapi.js"` 가 빌드 경유를
  강제하므로, 향후 생성 절차를 변경할 때 반드시 빌드 경유를 유지해야 한다.
- **계약 재생성 절차(2단계)**: 백엔드 DTO 변경 시 반드시 `pnpm --filter backend openapi:gen` →
  `pnpm --filter @doa/shared-types gen` 양 단계를 재실행해야 계약이 동기화된다. 한 단계라도 누락하면
  생성물(`openapi.json`·`openapi.gen.ts`)이 최신 DTO 와 불일치(drift)한다. 현재 CI 자동 재생성·diff 검증이
  없으므로(GAP-001-01) 사람이 절차를 지켜야 한다.
- **response 스키마 미주석(GAP-001-01, Low)**: component schemas 32종은 전부 입력(request) DTO 다. 87
  operations 중 typed 2xx response content 는 36건이며 응답 본문은 대부분 타입 미주석이다(컨트롤러가
  엔티티/원시값 반환, `@ApiResponse({ type })` 미부여). 프론트는 응답 타입을 부분적으로만 코드젠에서
  얻는다. 후속에 도메인별 응답 DTO + `@ApiResponse({ type })` 로 점진 보강한다(FRONTEND-PLAN §8 정책).
- **수기 타입 한시 유지 — 점진 대체**: `shared-types/index.ts` 의 수기 타입(001/002 도메인)은 console
  호환을 위해 유지된다. 생성 타입으로의 완전 대체·수기 타입 삭제는 후속 차수다. 향후 console 화면을 생성
  타입(`Schemas['...']`)으로 마이그레이션할 때 수기 타입을 단계적으로 제거하고, `@doa/api-client` 의
  18도메인 메서드도 생성 타입 기반으로 재작성한다(범위 외 — Phase 0 후속).
- **생성물 레포 커밋**: `openapi.json`·`openapi.gen.ts` 는 생성물이나 편의상 레포에 커밋된다(CI 재생성
  가능). `dist/` 는 gitignore. 향후 생성물 drift 방지를 위해 CI 에 `openapi:gen` → `gen` 재실행 후
  `git diff --exit-code` 검증 게이트 추가를 권고한다(GAP-001-01).
- **신규 의존 2종**: `@nestjs/swagger ^11.4.4`(백엔드 dependency)·`openapi-typescript ^7.13.0`
  (shared-types devDependency). 둘 다 AWS/Fly.io 전용 SDK 가 아닌 계약 생성·코드젠 도구로 P-002 무저촉.
  `@nestjs/swagger` 는 NestJS 11 호환 버전이며, NestJS 메이저 업그레이드 시 호환 버전 동반 갱신 필요.
