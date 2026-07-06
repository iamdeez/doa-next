---
작성: Spec Agent
버전: v1.0
최종 수정: 2026-07-04 06:56
상태: 확정
---

# Spec: 019-security-quality-followups
> Branch: 019-security-quality-followups | Date: 2026-07-04 [시각 미확인, spawn 기준 06:56 anchor] | Version: v1.1.0

## 목차

- [배경 및 목적](#배경-및-목적)
- [사용자 스토리](#사용자-스토리)
- [기능 요구사항](#기능-요구사항)
- [비기능 요구사항](#비기능-요구사항)
- [수용 기준](#수용-기준)
- [요구사항 구조화 매트릭스](#요구사항-구조화-매트릭스)
- [범위 외](#범위-외)
- [미결 사항](#미결-사항)

---

## 배경 및 목적

017-seller-admin-read-apis, 018-auth-security-hardening의 보안·성능 감사(Security Agent·Performance Agent)에서 식별된 비블로킹(Low~Informational) 코드 수준 후속 부채 4건이 `context.md §6`에 미해소 상태로 누적되어 있다. 각 spec은 Critical/High가 없어 gate: PASS로 완료되었으나, 권고사항으로 남긴 항목이 후속 spec 없이는 자연 해소되지 않는다.

1. **SEC-017-01(Low, 비블로킹)** — 관리자·판매자 cursor 목록 API(`GET /admin/sellers/pending`·`GET /admin/users`·`GET /admin/audit-logs`·`GET /sellers/me/products`)가 `@Query('limit')`/`@Query('cursor')`를 개별 추출한 뒤 컨트롤러에서 수동 `parseInt`로 변환한다. 전역 `ValidationPipe`(class-validator DTO 전용)는 이 개별 파라미터 추출 방식을 검증 대상으로 인식하지 못해, `limit=abc` 같은 비정수 입력이 `NaN`으로 변환된 채 서비스 레이어의 클램프 로직을 통과하여 Prisma `take: NaN`으로 전달되고 500 오류를 유발할 수 있다. `admin.controller.ts`(`listPendingSellers`·`listUsers`·`listAuditLogs`) 및 `product.controller.ts`(`SellerProductController.listMyProducts`) 코드 확인 완료 — 4개 메서드 전부 동일한 개별 `@Query()` + 수동 `parseInt` 패턴이다.
2. **GAP-017-03(성능-후속-권고, 비블로킹)** — `apps/backend/prisma/schema.prisma` 코드 확인 결과 `Product` 모델은 `sellerId`를 포함하는 인덱스가 없고(`@@index([status, createdAt(sort: Desc), id(sort: Desc)])`만 존재), `Seller` 모델은 `status`를 포함하는 인덱스가 전혀 없다(PK `id`·unique `userId`뿐). 판매자 소유 상품 목록(`ProductRepository.listBySeller`)·관리자 판매자 목록(`SellerRepository.listByStatusPaginated`) cursor 쿼리가 Seq Scan을 유발하며, 현재 데이터 규모(products 9건·sellers 1건)에서는 무해하나 테이블 성장에 따라 O(테이블 전체) 스캔 비용으로 확대되는 구조적 특성이다.
3. **SEC-018-02(Low)** — `auth.service.ts`의 `findEmail` 메서드 코드 확인 결과, `SecurityAuditLogger.findEmailAccessed` 호출(L300)이 `findFirstUserByPhone`이 사용자를 찾은 **성공** 경로에서만 실행되고, `NotFoundException` 분기(미등록 전화번호)는 로그 호출 이전에 반환된다. 실제 PII가 노출된 성공 이벤트만 기록되고, user enumeration 시도 자체(주로 실패로 구성)는 감사 로그에 남지 않아 탐지 사각지대가 존재한다.
4. **SEC-018-03(Informational)** — `app.module.ts`의 `LoggerModule.forRoot({ pinoHttp })` 코드 확인 결과 `redact`/`serializers` 커스터마이징이 없어, `pino-http` 기본 요청 직렬화가 `Authorization` 헤더(JWT access/refresh 토큰)를 포함한 전체 요청 헤더를 로그 스트림에 평문으로 남길 수 있다.

본 spec은 위 4건을 코드·설정·마이그레이션만으로(외부 크레덴셜·신규 외부 의존 없이) 해소하여, `context.md §6`의 해당 4개 행을 "RESOLVED (019)"로 전이 가능한 수준까지 완결한다. 관련된 SEC-018-01(Medium, rate limit 클라이언트 헤더 신뢰 미검증)은 운영 배포·infra.md 문서화·사후 검증(PROC-014)이 필요한 별도 항목으로 본 spec 범위에서 제외한다(§범위 외 참조).

## 사용자 스토리

- **US-001**: 관리자·판매자 콘솔 API 클라이언트 개발자로서, 목록 조회 API에 비정수 `limit`을 실수로 전달했을 때 500 서버 오류가 아닌 명확한 400 응답을 받아 문제를 즉시 진단하고 싶다.
- **US-002**: 백엔드 운영자로서, 판매자별 상품 목록·상태별 판매자 목록 조회가 데이터 증가에도 Seq Scan 없이 확장 가능하기를 원한다.
- **US-003**: 보안 담당자로서, 이메일 찾기 기능에 대한 미등록 전화번호 대량 조회 시도(enumeration)도 감사 로그로 추적할 수 있기를 원한다.
- **US-004**: 보안 담당자로서, 애플리케이션 HTTP 요청 로그에 인증 토큰(Authorization/Cookie 헤더)이 평문으로 기록되지 않기를 원한다.

## 기능 요구사항

- **FR-001**: 시스템은 `GET /admin/sellers/pending`의 `limit`·`cursor` 쿼리 파라미터를 class-validator 기반 DTO로 검증한다.
- **FR-002**: 시스템은 `GET /admin/users`의 `limit`·`cursor` 쿼리 파라미터를 class-validator 기반 DTO로 검증한다.
- **FR-003**: 시스템은 `GET /admin/audit-logs`의 `limit` 쿼리 파라미터를 class-validator 기반 DTO로 검증한다.
- **FR-004**: 시스템은 `GET /sellers/me/products`의 `limit`·`cursor` 쿼리 파라미터를 class-validator 기반 DTO로 검증한다.
- **FR-005**: FR-001~FR-004의 4개 엔드포인트는 `limit`이 정수가 아니거나 허용 범위(최소 1, 최대 100)를 벗어나면 400 Bad Request를 반환한다.
- **FR-006**: 시스템은 `Product` 모델에 `sellerId` 기반 목록 조회를 뒷받침하는 인덱스를 추가한다.
- **FR-007**: 시스템은 `Seller` 모델에 `status` 기반 목록 조회를 뒷받침하는 인덱스를 추가한다.
- **FR-008**: 시스템은 `POST /auth/find-email` 요청이 미등록 전화번호로 실패(404)하는 경우 별도의 보안 감사 이벤트를 기록한다.
- **FR-009**: FR-008의 신규 감사 이벤트는 기존 `findEmailAccessed`와 동일하게 전화번호를 마스킹하여 기록한다.
- **FR-010**: FR-008의 신규 감사 이벤트 기록 중 예외가 발생해도 `findEmail`의 404 응답 흐름을 차단하지 않는다(best-effort).
- **FR-011**: 시스템은 HTTP 요청 로그에서 `Authorization` 헤더 값을 평문으로 기록하지 않고 redact 처리한다.
- **FR-012**: 시스템은 HTTP 요청 로그에서 `Cookie` 헤더 값을 평문으로 기록하지 않고 redact 처리한다.

## 비기능 요구사항

- **NFR-001**: FR-001~FR-005의 DTO 검증 전환 이후에도 기존 유효 입력(정수 `limit`·정상 `cursor`)에 대한 응답은 전환 이전과 동일한 200 상태 코드·응답 바디 구조를 유지한다(회귀 없음).
- **NFR-002**: FR-006~FR-007의 인덱스 추가는 기존 목록 조회 API의 응답 구조·상태 코드를 변경하지 않는다(스키마 전용 변경).
- **NFR-003**: FR-006~FR-007의 인덱스 추가 후, `WHERE "sellerId" = $1 ORDER BY "createdAt" DESC, id DESC` 및 `WHERE status = $1 ORDER BY "createdAt" DESC, id DESC` 두 쿼리의 `EXPLAIN` 실행 계획이 Seq Scan이 아닌 인덱스 기반 스캔으로 나타난다.
- **NFR-004**: FR-008~FR-012의 감사 로그·redact 변경은 기존 인증(JWT)·인가(AdminGuard 등) 로직의 동작을 변경하지 않는다(순수 로깅 추가·설정 변경).
- **NFR-005**: 본 spec 구현 이후 기존 전체 테스트 스위트(unit·e2e·static)가 회귀 없이 100% PASS를 유지한다(constitution P-006 테스트 원칙).

## 수용 기준

- **SC-001** (`FR-001`): `GET /admin/sellers/pending?limit=abc` 요청 시 400 Bad Request를 반환한다. [env:integration]
- **SC-002** (`FR-002`): `GET /admin/users?limit=abc` 요청 시 400 Bad Request를 반환한다. [env:integration]
- **SC-003** (`FR-003`): `GET /admin/audit-logs?limit=abc` 요청 시 400 Bad Request를 반환한다. [env:integration]
- **SC-004** (`FR-004`): `GET /sellers/me/products?limit=abc` 요청 시 400 Bad Request를 반환한다. [env:integration]
- **SC-005** (`FR-005`): FR-001~FR-004의 4개 엔드포인트 모두 `limit=0` 및 `limit=101`(경계값, 상한 100 초과) 요청 시 400 Bad Request를 반환한다. [env:integration]
- **SC-006** (`FR-001`~`FR-004`, `NFR-001`): FR-001~FR-004의 4개 엔드포인트 모두 유효한 정수 `limit`(예: `limit=20`) 요청 시 DTO 전환 이전과 동일하게 200 + 기존 응답 구조(`SellerProfile[]`/`{items,nextCursor}` 등)를 반환한다. [env:integration]
- **SC-007** (`FR-006`): `schema.prisma`의 `Product` 모델에 `sellerId`를 선두 컬럼으로 하는 복합 인덱스가 존재한다. [env:static]
- **SC-008** (`FR-007`): `schema.prisma`의 `Seller` 모델에 `status`를 선두 컬럼으로 하는 복합 인덱스가 존재한다. [env:static]
- **SC-009** (`NFR-003`): 신규 마이그레이션 적용 후 로컬 PostgreSQL에서 `EXPLAIN`을 실행한 결과, `sellerId` 조건 쿼리와 `status` 조건 쿼리 모두 Seq Scan이 아닌 인덱스 기반 스캔(Index Scan/Bitmap Index Scan)으로 나타난다. [env:e2e-db]
- **SC-010** (`NFR-002`): 인덱스 추가 마이그레이션 적용 전후로 `GET /sellers/me/products`·`GET /admin/sellers/pending` 기존 e2e/통합 테스트의 응답 바디·상태 코드가 동일하게 유지된다(회귀 없음). [env:integration]
- **SC-011** (`FR-008`): 존재하지 않는 전화번호로 `POST /auth/find-email` 요청(404) 시 신규 보안 감사 이벤트(예: `findEmailNotFound`)가 기록된다. [env:unit]
- **SC-012** (`FR-009`): SC-011의 신규 감사 이벤트 로그에 원본 전화번호가 아닌 마스킹된 값(`maskPhone` 결과)만 기록된다. [env:unit]
- **SC-013** (`FR-010`): 감사 로거 내부에서 예외가 발생해도 `findEmail`이 정상적으로 404 `NotFoundException`을 반환한다(best-effort try/catch). [env:unit]
- **SC-014** (`FR-011`): Authorization 헤더를 포함한 요청을 처리한 후 pino 로그 출력에 원본 토큰 값이 아닌 redact 마커가 기록된다. [env:integration]
- **SC-015** (`FR-012`): Cookie 헤더를 포함한 요청을 처리한 후 pino 로그 출력에 원본 쿠키 값이 아닌 redact 마커가 기록된다. [env:integration]
- **SC-016** (`NFR-004`): FR-011~FR-012 적용 이후에도 기존 인증(JWT 검증)·인가(AdminGuard) 관련 기존 테스트(예: `auth-required-guards.spec.ts`, rate-limit e2e)가 회귀 없이 PASS한다. [env:unit]
- **SC-017** (`NFR-005`): 본 spec 구현 완료 후 전체 테스트 스위트(unit·e2e·static)가 회귀 없이 100% PASS한다. [env:integration]

## 요구사항 구조화 매트릭스

| US-ID | FR-ID | NFR-ID | SC-ID | [env:*] | MoSCoW |
|---|---|---|---|---|---|
| US-001 | FR-001 | — | SC-001 | integration | Must |
| US-001 | FR-002 | — | SC-002 | integration | Must |
| US-001 | FR-003 | — | SC-003 | integration | Must |
| US-001 | FR-004 | — | SC-004 | integration | Must |
| US-001 | FR-005 | — | SC-005 | integration | Must |
| US-001 | — | NFR-001 | SC-006 | integration | Must |
| US-002 | FR-006 | — | SC-007 | static | Must |
| US-002 | FR-007 | — | SC-008 | static | Must |
| US-002 | — | NFR-003 | SC-009 | e2e-db | Must |
| US-002 | — | NFR-002 | SC-010 | integration | Should |
| US-003 | FR-008 | — | SC-011 | unit | Must |
| US-003 | FR-009 | — | SC-012 | unit | Must |
| US-003 | FR-010 | — | SC-013 | unit | Must |
| US-004 | FR-011 | — | SC-014 | integration | Must |
| US-004 | FR-012 | — | SC-015 | integration | Must |
| US-004 | — | NFR-004 | SC-016 | unit | Should |
| — | — | NFR-005 | SC-017 | integration | Must |

## 범위 외

- **SEC-018-01(Medium, rate limit 클라이언트 헤더 신뢰 미검증)** — `infra.md` §2/§8 갱신을 통한 Fly.io `Fly-Client-IP` 재기입 공식 문서 근거 확보 및 운영 배포 환경에서의 사후 검증(PROC-014 #1, 헤더 스푸핑 시도 테스트)이 필요한 항목이다. 본 spec은 "코드-only, 외부 크레덴셜·의존 0건" 범위로 한정되어 실제 운영 환경 검증이 불가능하므로 제외한다. 별도 spec 또는 infra.md 문서 갱신 작업으로 이관한다.
- **`apps/worker`(pg-boss 별도 프로세스) 관련 변경** — 사용자 드롭 확정. 본 spec은 `apps/backend` 범위로 한정한다.
- **트랙 B 관련 항목** — 본 spec은 "트랙 C 보안·품질 후속" 4건에 한정되며, 그 외 트랙의 항목은 범위 외.
- **운영(prod) 배포 환경으로의 마이그레이션 실 적용** — 현재 프로젝트는 Stage 1~3 범위(로컬/CI 중심, `fly.toml` 미존재)이므로, 본 spec은 신규 Prisma 마이그레이션 파일 생성 + 로컬 DB 적용 + 기존 CI 파이프라인 통과까지만 다룬다. 향후 실제 운영 배포 시점의 `prisma migrate deploy` 적용은 표준 배포 절차(기존 15차 마이그레이션과 동일 경로)를 따르며 본 spec의 별도 작업 대상이 아니다.

### 사후 운영 검증 피드백 사이클 (PROC-014)

옵션 C(파이프라인 내 운영 환경 검증 스킵, 단위/정적/로컬 통합 검증까지만 수행)를 채택한다 — 본 spec의 4개 변경 사항이 모두 로컬 개발 환경(Docker Compose PostgreSQL)과 CI에서 완결적으로 검증 가능하며 별도 운영 배포 환경 의존이 없기 때문이다(§배경 및 목적, Q17 판단 근거 참조).

1. **사후 점검 가능 시나리오**: (a) 실제 데이터 규모 증가 후 `sellerId`/`status` 인덱스가 실제로 사용되는지 운영 DB에서 재확인, (b) 관리자·판매자 콘솔이 비정수 `limit`을 실수로 전송하는 사례가 실 운영 로그에서 400으로 정상 처리되는지 확인, (c) find-email enumeration 시도가 실제 발생 시 신규 감사 로그(`findEmailNotFound`)가 정상 적재되는지 확인, (d) 운영 로그 스트림에서 Authorization/Cookie 헤더가 redact 마커로 정상 치환되는지 실측 확인.
2. **결함 발견 시 처리 절차**: 발견된 결함 정보를 본 spec.md "배경 및 목적" 절 또는 별도 hotfix spec 입력으로 사용 → main session의 "spec 수정" 이벤트 → 1단계 재진입(cycle N+1) 또는 별도 patch spec 진입. 직전 cycle 산출물은 `_ai-workspace/cycle-N-archive/`로 백업 보존.
3. 사후 검증은 별도 일정 없이 차기 운영 배포(Stage 4+ Fly.io 실 배포) 시점에 자연스럽게 수반되는 일반 모니터링으로 갈음하기로 합의됨(본 spec이 신규로 도입하는 위험이 낮아 별도 전담 점검 일정은 불요).

## 미결 사항

없음 — 모든 요구사항이 Task 지시·code 검증(schema.prisma·admin.controller.ts·product.controller.ts·auth.service.ts·app.module.ts·security-audit.logger.ts) 및 017/018 security-report.md 근거로 확정되었다.
