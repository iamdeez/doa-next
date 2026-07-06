---
작성: Design Agent
버전: v1.1
최종 수정: 2026-07-05 17:34
상태: 확정
---

# Research: 019-security-quality-followups

## 목차

- [분석 범위 게이트](#분석-범위-게이트)
- [기존 코드베이스 분석](#기존-코드베이스-분석)
  - [클래스·모듈 계층 구조](#클래스모듈-계층-구조)
  - [영향 범위 분석 (호출 측 전수 목록)](#영향-범위-분석-호출-측-전수-목록)
  - [공유 상태·동시성 분석](#공유-상태동시성-분석)
- [§F production 시그니처 변경 — 호출 측 테스트 식별 (PROC-001)](#f-production-시그니처-변경--호출-측-테스트-식별-proc-001)
- [외부 라이브러리 API 실제 동작 확인](#외부-라이브러리-api-실제-동작-확인)
- [인정되는 한계 및 안전망](#인정되는-한계-및-안전망)
- [배포 환경 영향 추정](#배포-환경-영향-추정)
- [context.md 부정합 사전 점검](#contextmd-부정합-사전-점검)
- [기술 선택 조사](#기술-선택-조사)
- [테스트 하네스 조사 (Test Authoring 입력)](#테스트-하네스-조사-test-authoring-입력)
- [엣지 케이스 및 한계](#엣지-케이스-및-한계)
- [트랙 5 — 사전 결함 fix 분석 (v1.1 확장)](#트랙-5--사전-결함-fix-분석-v11-확장)

---

## 분석 범위 게이트

plan.md "핵심 설계" 변경 대상 모듈이 명시되어 있어 분석을 그 범위로 한정한다.

| 게이트 | 판정 |
|---|---|
| 변경 대상 모듈 추출 | `admin.controller.ts`·`product.controller.ts`(C), 신규 DTO 2종(C), `security-audit.logger.ts`·`auth.service.ts`(B), `app.module.ts`(C/infra), `schema.prisma`+신규 마이그레이션(A — Database Design Agent 산출) |
| §A/§B/§C 범위 | 위 모듈로 한정 |
| §D (다단계 병렬 파이프라인) | **건너뜀** — plan 이 병렬 파이프라인 미요구(순수 입력 검증·인덱스·로깅) |
| §E (동일 가드 결정 통합) | **건너뜀** — plan 이 동일 가드 다필드 결정 패턴 미요구 |
| §4 외부 라이브러리 검증 | **신규 도입 0** (class-validator·class-transformer·nestjs-pino 전부 기존 사용). 단 pino `redact` 옵션은 프로젝트 첫 사용 → 표준 동작만 확인 |
| §F (시그니처 변경) | **수행** — `@Query()` 개별 추출 → `@Query() dto: DTO` 컨트롤러 시그니처 변경 4메서드 + `AuthService.findEmail` 내부 호출 추가. 아래 §F 절 참조 |

---

## 기존 코드베이스 분석

> context.md §2 전체 구조는 참조로 대신하고, 본 spec 변경 대상만 코드 대조한다.

### 클래스·모듈 계층 구조

| 대상 | 실코드 확인 | 결론 |
|---|---|---|
| `ListProductsDto` | `product/dto/list-products.dto.ts` — `cursor?: @IsOptional @IsString` / `limit?: @IsOptional @Type(()=>Number) @IsInt @Min(1) @Max(100)` | 신규 `ListQueryDto` 는 이 구조를 그대로 복제(공유 위치 `src/shared/dto/`). `AdminSellerListQueryDto extends ListQueryDto` 는 표준 TS class 상속 — 데코레이터 상속됨(class-validator 는 프로토타입 체인 메타데이터 병합) |
| `AdminController` | `@Controller('admin') @UseGuards(JwtAuthGuard, AdminGuard)`. `listPendingSellers`(status·cursor·limit·q 개별 `@Query`), `listUsers`(cursor·limit), `listAuditLogs`(limit) 전부 개별 `@Query()` + `limit ? parseInt(limit,10) : undefined` | 3개 메서드 시그니처 전환 대상. 가드·클래스 데코레이터 무변경 |
| `SellerProductController` | `@Controller('sellers/me') @UseGuards(JwtAuthGuard)`. `listMyProducts`(`@CurrentUser` + cursor·limit 개별 `@Query`) | 1개 메서드 전환. `@CurrentUser()` 파라미터는 유지, `@Query` 2개만 DTO 로 통합 |
| `SecurityAuditLogger` | `shared/security/security-audit.logger.ts` — `PinoLogger` 주입, `setContext('SecurityAudit')`. 기존 3메서드(`otpVerificationFailed`·`rateLimitExceeded`·`findEmailAccessed`) 전부 `try{ logger.warn(...) }catch{}` best-effort 패턴 | 신규 `findEmailNotFound(phone)` 를 동일 패턴으로 추가. concrete class, DI singleton |
| `AuthService.findEmail` | `auth.service.ts` — `findFirstUserByPhone(phone)` → null 시 `throw NotFoundException`(로그 이전) → 성공 시 `findEmailAccessed` + masked email 반환 | **시그니처 불변**(`findEmail(phone): Promise<FindEmailResult>`). 404 분기에 `findEmailNotFound(phone)` 호출을 throw 이전에 삽입 |
| `AppModule` LoggerModule | `LoggerModule.forRoot({ pinoHttp:{ transport: NODE_ENV!=='production' ? pino-pretty : undefined } })` | `pinoHttp` 에 `redact` 키 추가만. transport 분기 불변 |
| `Product`·`Seller` (schema.prisma) | `Product`: `@@index([status, createdAt(sort:Desc), id(sort:Desc)])` 만 존재, `sellerId` 인덱스 없음. `Seller`: PK `id`·unique `userId` 만, `status` 인덱스 없음 | 인덱스 2개 추가 — **Database Design Agent 산출**(본 Design tasks 는 참조만) |

### 영향 범위 분석 (호출 측 전수 목록)

| 파일 | 변경 유형 | 영향 내용 |
|---|---|---|
| `src/shared/dto/list-query.dto.ts` | 신규(C) | 공유 `ListQueryDto`. `src/shared/dto/` 디렉토리 부재 → 신규 생성 |
| `src/modules/admin/dto/admin-seller-list-query.dto.ts` | 신규(C) | `AdminSellerListQueryDto extends ListQueryDto` + status·q |
| `src/modules/admin/admin.controller.ts` | 수정(C) | 3메서드 `@Query()`→DTO. 수동 parseInt 제거. 서비스 호출 인자는 `query.*` |
| `src/modules/product/product.controller.ts` | 수정(C) | `listMyProducts` cursor·limit `@Query()`→`ListQueryDto` |
| `src/shared/security/security-audit.logger.ts` | 수정(B) | `findEmailNotFound(phone)` 신규 메서드 |
| `src/modules/auth/auth.service.ts` | 수정(B) | `findEmail` 404 분기에 `findEmailNotFound` 호출 삽입(throw 이전) |
| `src/app.module.ts` | 수정(C) | `pinoHttp.redact` 추가 |
| `prisma/schema.prisma` | 수정(A) | **Database Design Agent 산출** — Product `[sellerId,createdAt Desc,id Desc]` / Seller `[status,createdAt Desc,id Desc]` |
| `prisma/migrations/{ts}_*/migration.sql` | 신규(A) | **Database Design Agent 산출** — CREATE INDEX 2건 |
| `admin.controller.spec.ts` | 수정(D, §F) | positional-arg 호출 → DTO 객체 인자 마이그레이션(회귀 방지) |
| `auth.service.spec.ts` | 수정(D, §F) | `mockSecurityAuditLogger` 에 `findEmailNotFound: jest.fn()` 추가(회귀 방지) + SC-011/013 신규 |

**서비스·repository 무변경 확증**: `AdminService.listSellers/listUsers/listAuditLogs`, `ProductService.listMyProducts` 는 이미 `limit?: number` 를 받는다(`product.service.spec.ts` L767 `service.listMyProducts(FIXED_USER_ID, undefined, 2)` — number 전달 확인). 컨트롤러가 `query.limit`(number|undefined)를 그대로 전달하면 정합. 클램프 로직(Math.max/min)은 서비스에 잔존(2중 방어).

### 공유 상태·동시성 분석

- **공유 자원 신규 도입 0**: 입력 검증 DTO(요청 스코프)·인덱스(DB)·로거 메서드(stateless)·pino 설정(정적) 전부 공유 가변 상태·캐시·레이스 컨디션과 무관.
- `SecurityAuditLogger` 는 DI singleton 이나 상태 필드 없음(logger 만 보유). `findEmailNotFound` 는 순수 로깅 — 동시 호출 안전.
- §C Check-Then-Act·Lock 검토 대상 없음.

---

## §F production 시그니처 변경 — 호출 측 테스트 식별 (PROC-001)

### 변경되는 production 메서드 목록

| 메서드 | 시그니처 전 | 시그니처 후 | 유형 |
|---|---|---|---|
| `AdminController.listPendingSellers` | `(status?, cursor?, limit?: string, q?)` (개별 @Query) | `(query: AdminSellerListQueryDto)` | 인자 형태 변경(개별→DTO), parseInt 제거 |
| `AdminController.listUsers` | `(cursor?, limit?: string)` | `(query: ListQueryDto)` | 동상 |
| `AdminController.listAuditLogs` | `(limit?: string)` | `(query: ListQueryDto)` | 동상 |
| `SellerProductController.listMyProducts` | `(user, cursor?, limit?: string)` | `(user, query: ListQueryDto)` | @Query 2개→DTO |
| `AuthService.findEmail` | `(phone): Promise<FindEmailResult>` | **불변** — 내부에 `findEmailNotFound(phone)` 호출 추가만 | 시그니처 불변, 내부 의존 호출 추가 |
| `SecurityAuditLogger` | (기존 3메서드) | `+ findEmailNotFound(phone): void` | 메서드 추가(비파괴) |

### 각 메서드를 직접 호출하는 테스트 (grep 결과)

`grep -rn "listPendingSellers\|listMyProducts\|findEmail" src test` 확인:

| 테스트 파일·함수 | 호출 라인 | 마이그레이션 필요 판정 |
|---|---|---|
| `admin.controller.spec.ts` `listPendingSellers — query 파라미터 배선` (L80·L94) | `controller.listPendingSellers('APPROVED','cursor-1','10','마켓')` / `(undefined,undefined,undefined,undefined)` | **필요(회귀 확정)** — positional-arg 4개 호출이 신규 `(query: DTO)` 단일 인자와 불일치. `listPendingSellers({status:'APPROVED',cursor:'cursor-1',limit:10,q:'마켓'})` 로 전환 + 기대값 `listSellers('APPROVED','cursor-1',10,'마켓')` 유지. **단위 테스트에는 ValidationPipe 미개입** → `'10'`(string) 대신 `10`(number) 을 DTO 에 직접 전달(파싱은 production 에서 제거됨) |
| `product.service.spec.ts` `listMyProducts` (L767·787·801) | `service.listMyProducts(...)` — **서비스** 호출(number 전달) | **불필요** — 서비스 시그니처 불변. 컨트롤러 아님 |
| `auth.service.spec.ts` `test_find_email_unregistered_404` (L648~656) | `service.findEmail('01099999999')` (findFirstUserByPhone→null) | **필요(회귀 확정)** — production 이 throw 이전에 `this.securityAuditLogger.findEmailNotFound(phone)` 호출. 현재 `mockSecurityAuditLogger`(L84~88)에 해당 메서드 부재 → `undefined()` TypeError → `.rejects.toThrow(NotFoundException)` 실패. **`mockSecurityAuditLogger` 에 `findEmailNotFound: jest.fn()` 추가 필수** |
| `auth.service.spec.ts` `SC-016 findEmailAccessed` (L826~831) | `service.findEmail(FIXED_USER.phone!)` (성공 경로) | **불필요** — 성공 경로는 `findEmailNotFound` 미호출. mock 에 메서드 추가만 되면 무영향 |
| `security-audit.logger.spec.ts` | 기존 3메서드 테스트 | **불필요** — 신규 메서드 추가는 비파괴. SC-012/013(신규 메서드) 테스트만 추가 |

### 호출 측 마이그레이션이 본 spec 범위에 포함되는지

- **포함 확정**: 두 마이그레이션 모두 **미수행 시 SC-017(전체 스위트 100% PASS) 위반** = 기존 테스트 회귀. spec.md NFR-005·SC-017 이 명시적으로 회귀 없음을 요구하므로 in-scope. 별도 사용자 결정 불요(SCOPE_VIOLATION 아님 — spec 이 이미 회귀 금지를 결정).
- tasks.md D 레이어(Test Agent 5a)에 마이그레이션 태스크 명시 + SC-016(admin.controller.spec 회귀 방어는 SC-006·SC-016 우산, auth mock 은 SC-011·SC-013·SC-017)로 매핑. 정적 AST 검사 테스트(`ast.FunctionDef` 류) 대상 아님(TS·NestJS).

### "PASS 유지" 예측 항목 representation·바인딩 점검 (PROC-001/002 확장)

- `test_find_email_unregistered_404` 는 `.rejects.toThrow(NotFoundException)` 로 **예외 타입**을 단언한다. production 이 throw 이전에 의존 메서드를 호출하도록 바뀌므로, "출력(예외)은 동일해도 의존 바인딩(mock 표면)이 바뀌어 FAIL" 하는 사각지대다 → 위 표에서 FAIL 로 분류(누락 없음).
- 나머지 통합 테스트(SC-001~006)는 신규 작성이므로 기존 representation 회귀 대상 아님.

---

## 외부 라이브러리 API 실제 동작 확인

> plan.md "외부 라이브러리 동작 검증" 표와 cross-check. 3항목 재확인 결과 plan 판정과 일치.

| 항목 | 가정 | 실제 동작 (근거) | 일치 |
|---|---|---|---|
| class-validator query 변환 | `@Type(()=>Number) @IsInt @Min(1) @Max(100)` 가 query string 검증·변환 | `list-products.dto.ts` 가 동일 패턴, `GET /products`(`product.controller.ts` L86 `@Query() query: ListProductsDto`)에서 실동작. `main.ts` L30 `transform:true` → `'20'→20`, `'abc'→NaN→@IsInt 400`, `'0'→@Min 400`, `'101'→@Max 400` | O |
| `forbidNonWhitelisted:true` 부작용 | 미선언 query 파라미터 400 거부 | `main.ts` L28 확인. DTO 전환 시 DTO 미선언 파라미터가 400. `admin/sellers/pending` 의 `status`·`q` 를 DTO 에 포함하지 않으면 **기존 유효 요청 400 회귀**(SC-006/SC-010 위반) → `AdminSellerListQueryDto` 로 status·q 포함(ADR-002) | O |
| pino `redact` | `pinoHttp.redact: string[]` 가 지정 경로를 `[Redacted]` 로 치환 | pino 표준 옵션(nestjs-pino → pino-http → pino 전달). Node http 헤더명 소문자화 → 경로는 `req.headers.authorization`·`req.headers.cookie`(소문자) 필수. 프로젝트 첫 사용이나 라이브러리 표준 동작 | O |

- **가정 vs 실제 불일치 0건** → Planning 복귀(BLOCKED) 불요.

## 인정되는 한계 및 안전망

| 항목 | 인정되는 한계 | 안전망 |
|---|---|---|
| pino `redact` 경로 매칭 | pino-http 기본 req serializer 가 `req.headers` 하위에 헤더를 담는 전제 — nestjs-pino 기본 직렬화(커스텀 serializer 미설정)이므로 성립하나, 커스텀 serializer 도입 시 경로 무효화 | SC-014/015 통합 테스트가 실제 로그 스트림에서 `[Redacted]` 마커 존재 + 원본 토큰 부재를 최종 확인 |
| `status` 검증 수준 | `AdminSellerListQueryDto.status` 는 `@IsString`(비-enum) — 무효 status 문자열은 서비스가 파싱/기본값 처리(400 아님). `@IsEnum` 도입 시 기존 동작 변경(P-007 위반) | 입력 검증 강화는 `limit`(NaN·범위)로 한정. status 동작 불변 유지(ADR-002 기타 고려사항) |

## 배포 환경 영향 추정

- 본 spec 검증 대상(DTO 검증·인덱스·감사 로그·pino redact)은 socket/NAT/LB 등 배포 환경 특이성과 무관(순수 애플리케이션 레이어). infra.md cross-reference 상 신규 배포 영향 없음.
- 인덱스 마이그레이션은 로컬 PostgreSQL 적용까지가 spec 범위(ASM-002). 운영 배포 실적용은 표준 `prisma migrate deploy` 경로(§범위 외).
- SEC-018-01(rate limit 헤더 신뢰 — Fly-Client-IP 재기입 공식문서 근거)은 배포 환경 의존 항목으로 **본 spec §범위 외**(context.md §6 L254 잔존).

## context.md 부정합 사전 점검

변경 대상 클래스·필드·Enum 을 context.md §2/§6 에서 grep 대조:

| 항목 | 현재 context.md 정의 | 변경 후 | 부정합 |
|---|---|---|---|
| SEC-017-01 (§6 L240) | "cursor 목록 API @Query 파라미터 DTO 미검증 (Low·비블로킹)" | 4개 엔드포인트 DTO 검증 완료 → **RESOLVED (019)** 로 전이 | 6단계 Docs Agent 가 §6 행 갱신(RESOLVED) |
| SEC-018-02 (§6 L255) | "find-email 감사 로그 실패 케이스 미커버 (Low)" | `findEmailNotFound` 추가 → **RESOLVED (019)** | 동상 |
| SEC-018-03 (§6 L256) | "pino 요청 로그 redact 미설정 (Informational)" | `pinoHttp.redact` 추가 → **RESOLVED (019)** | 동상 |
| GAP-005-03 (§6 L236, accepted) | 마이그레이션 드리프트 accepted | 신규 마이그레이션 순차 누적(무관) | 변경 없음(accepted 유지) |
| SEC-018-01 (§6 L254) | rate limit 헤더 신뢰 (Medium) | **본 spec 미해소**(§범위 외) | 잔존 — 갱신 없음 |
| 테스트 카운트 (§6 L22) | unit 397 + static 4 + e2e | 신규 테스트 추가로 카운트 증가 | 6단계 Docs Agent 가 카운트 갱신 |

> 위 4개 전이 항목은 6단계 Docs Agent 의 context.md §6 갱신 대상. Design 은 직접 갱신 불가(MUST NOT) → 본 절로 가시화(gaps.md `문서-갱신-필요` 병기).

## 기술 선택 조사

plan.md ADR-001~005 와 cross-reference. 재검토 결과 전건 타당(대안 대비 우위):

- **ADR-002 (공유 + 확장 DTO)**: 단일 `ListQueryDto` 전체 적용 시 `admin/sellers/pending` status·q 가 미선언 파라미터로 400 회귀. 공유 `ListQueryDto`(3 엔드포인트) + `AdminSellerListQueryDto extends`(1 엔드포인트) 가 회귀 방지 + 중복 최소의 최적 구조.
- **ADR-003 (복합 인덱스)**: 단일 컬럼 `[sellerId]`·`[status]` 은 WHERE 만 커버, `ORDER BY createdAt DESC, id DESC` 정렬 미커버(sort 노드 잔존). 복합 `[sellerId, createdAt Desc, id Desc]`·`[status, createdAt Desc, id Desc]` 가 WHERE+ORDER BY 완전 커버 — 기존 Product 공개 인덱스 패턴과 일관. **인덱스 스키마·마이그레이션은 Database Design Agent 소유**(본 Design 은 근거 쿼리 대조만 제공).
- **ADR-004 (best-effort 감사 이벤트)**: 기존 3개 이벤트와 동일 내부 try/catch 패턴 승계 → 호출부 추가 가드 불요(FR-010 자동 충족).

## 테스트 하네스 조사 (Test Authoring 입력)

> 5a Test Agent(AUTHORING) 는 production 을 보지 못한 채 병렬 진행하므로, 하네스 canonical 을 여기서 확정하여 Test Authoring Contract 에 전달한다.

| 테스트 수준 | 하네스 canonical | 근거 파일 |
|---|---|---|
| 통합/e2e (SC-001~006·010·014·015) | `Test.createTestingModule({imports:[AppModule]})` → `app.init()` + `supertest`. 파일 `test/*.e2e-spec.ts`, 실행 `pnpm --filter backend test:e2e`(jest-e2e.json). docker PostgreSQL + `prisma migrate dev` 전제 | `test/rate-limit.e2e-spec.ts`·`test/banner-admin.e2e-spec.ts` |
| Admin JWT 발급 | AppModule import **이전** `process.env.ADMIN_USER_IDS = ADMIN_ID` 주입 → `new JwtService({ secret: process.env.JWT_ACCESS_SECRET }).sign({ sub: ADMIN_ID, email })` → `.set('Authorization', 'Bearer '+token)` | `test/banner-admin.e2e-spec.ts` L23·49~51·60 |
| Seller JWT 발급 | `jwt.sign({ sub: sellerUserId, email })` — `/sellers/me/products` 는 `JwtAuthGuard` 만(AdminGuard 없음). `user.userId` 스코핑 | 동상 |
| static schema (SC-007·008) | `fs.readFileSync('prisma/schema.prisma','utf-8')` 텍스트 파싱. 파일 `test/static/*.spec.ts`, DB·앱 기동 불요 | `test/static/structure.spec.ts`·`schema-decimal.spec.ts` |
| unit (SC-011·012·013·016) | 콜로케이트 `src/**/*.spec.ts`, `Test.createTestingModule` + mock DI | `auth.service.spec.ts`·`security-audit.logger.spec.ts` |
| e2e-db EXPLAIN (SC-009) | 로컬 PostgreSQL 마이그레이션 적용 후 `EXPLAIN` 2건. **Performance Agent(6단계 후) 또는 Test EXECUTION** 실행 | plan §통합/운영 검증 defer 옵션 C |

**SC-014/015 pino redact 로그 캡처 — 하네스 선례 부재(핵심 위험, GAP-019-01)**: 기존 test/ 에 pino 출력 스트림을 캡처하는 선례가 없다. nestjs-pino 의 redact 는 pino destination(기본 stdout)에 JSON 라인으로 기록된다. **권장 canonical**: 통합 테스트에서 `process.stdout.write` 를 임시 spy 로 가로채(요청 처리 구간에 한해), Authorization·Cookie 헤더를 포함한 supertest 요청(경량 엔드포인트 예: `GET /health`) 후 수집된 JSON 라인에서 (a) `[Redacted]` 마커 존재, (b) 원본 토큰/쿠키 문자열 부재를 단언. 단언 후 `stdout.write` 원복(전역 상태 오염 방지 — 반드시 `afterEach` 복원). NODE_ENV 가 test 에서 `pino-pretty` transport 로 분기되면 라인 포맷이 달라질 수 있으므로, 테스트는 `[Redacted]` 토큰 존재 여부만(포맷 무관) 단언한다.

## 엣지 케이스 및 한계

- **`forbidNonWhitelisted` + 확장 DTO**: `admin/sellers/pending` 은 반드시 `status·cursor·limit·q` 4필드 전부 DTO 선언(하나라도 누락 시 해당 파라미터 포함 요청 400 회귀). Development·Test 필수 검증 지점(SC-006/SC-010).
- **DTO 에 선언·미전송 파라미터**: `forbidNonWhitelisted` 는 **미선언** 파라미터만 거부. DTO 에 있으나 미전송은 정상(예: `listAuditLogs` 가 `cursor` 를 사용 안 해도 `ListQueryDto.cursor` 선언 무해).
- **단위 테스트 ValidationPipe 미개입**: `admin.controller.spec.ts` 단위 테스트는 컨트롤러 메서드를 직접 호출하므로 ValidationPipe(transform)가 실행되지 않는다 → DTO 인자에 이미 변환된 값(`limit:10` number)을 직접 넣어야 한다. 실제 파싱·거부(400)는 통합 테스트(SC-001~005)가 검증.
- **pino redact 전역 상태**: SC-014/015 stdout 캡처는 전역 `process.stdout.write` 를 건드리므로 반드시 격리·복원. 병렬 테스트 파일과의 간섭 방지를 위해 단일 파일 내 순차 실행 권장.
- **인덱스 존재 검증 vs 인덱스명**: SC-007/008 은 인덱스 **선두 컬럼**(`sellerId`/`status`)을 검사 — Prisma 자동 생성 인덱스명(`products_sellerId_createdAt_id_idx` 등)과 무관하게 충족.

---

## 트랙 5 — 사전 결함 fix 분석 (v1.1 확장)

> 5b EXECUTION 이 base commit(62d14f9) 대비 **git diff 0** 으로 확정한 사전 결함 2건(GAP-019-03 P0 CONFIRMED·GAP-019-04 Medium). 019 신규 코드 아님. SC-006/010/017 을 직접 차단하여 사용자 승인(옵션 A, pipeline-log 17:12)으로 019 범위 통합. 신규 FR/SC 없음.

### 5-1. GAP-019-03 근본원인 — `PrismaService.tx` 비-트랜잭션 delegate 상실 (P0)

**결함 위치**: `apps/backend/src/shared/prisma/prisma.service.ts` L27~29(수정 전)
```ts
get tx(): TxClient {
  return this.als.getStore()?.client ?? (this as unknown as TxClient);
}
```

**근본원인 (5b Q1-a 확정)**: `PrismaService extends PrismaClient`. Prisma 6.19.3 의 `PrismaClient` 생성자는 인스턴스를 **Proxy 로 래핑**하여 반환한다(`new PrismaService()` = Proxy P, 원본 타깃 = T). model delegate(`user`·`adminAuditLog` 등)는 Proxy P 의 get trap 을 통해서만 노출된다. 그러나 subclass 의 `tx` getter 가 호출될 때 내부 `this` 는 **원본 타깃 T**(delegate 미보유)로 바인딩된다. 따라서 비-트랜잭션(ALS store 부재) 경로에서 fallback `(this as unknown as TxClient)` = T 를 반환 → `this.prisma.tx.<delegate>` = `undefined` → `Cannot read properties of undefined`.

- **실증(5b)**: `AdminRepository.listAuditLogs`(SC-006, admin/audit-logs 500)·`AuthRepository.createUser`(회원가입 전체 차단 → register 의존 6개 SC cascade FAIL, `TypeError ... reading 'create'`). 동일 근본원인.
- **트랜잭션 내부 경로는 정상**: ALS store 존재 시 `store.client`(=`$transaction` 이 넘긴 client) 반환 → 018 rate-limit/atomicity·결제 트랜잭션 e2e 가 green 이었던 이유. 즉 결함은 **비-트랜잭션 read/write 전용**.

### 5-2. GAP-019-04 근본원인 — 전역 rate limit 이 GET 목록/읽기 충돌 (Medium)

**결함 위치**: `apps/backend/src/shared/security/security.module.ts` 전역 `APP_GUARD`(`FlyThrottlerGuard`) + `ThrottlerModule.forRoot` default(`THROTTLE_DEFAULT_LIMIT=20`/60s, **018 도입**).

**근본원인 (5b Q1-c 확정)**: 018 이 전역 throttle 을 도입하면서 모든 라우트에 20회/60s 를 적용했으나 GET 목록/읽기에 예외 데코레이터가 없다. 100회 순차 요청을 전제로 작성된 기존 perf e2e(017 도입, 018 이전)가 21번째부터 항상 429. `auth-recovery.e2e-spec.ts` 는 동일 파일 SC-020(429 유발 목적)이 quota 를 선소진해 뒤 SC-017 이 quota 부족 실패. 영향 파일 `list-p95.e2e-spec.ts`·`products.e2e-spec.ts`·`auth-recovery.e2e-spec.ts` 전부 019 미변경(git diff 0).

### 5-3. fix 접근 (ADR-006/007) 및 대안 대조

| fix | 채택 접근 | 왜 이 접근인가 | 비채택 대안 |
|---|---|---|---|
| ADR-006 (tx getter) | `prisma.module.ts` provider 를 useFactory 로 전환 → `new PrismaService()` 로 얻은 Proxy P 를 `registerRootClient(client)` 로 인스턴스에 자기참조 주입. getter fallback 을 `?? this.rootClient ??` 로 삽입 → 비-tx 경로가 delegate 보유 Proxy(P) 반환 | 팩토리 `client` 는 DI 가 repository 에 주입하는 **바로 그 Proxy P**. getter 내부 `this`(=T)의 `this.rootClient` 는 동일 인스턴스 저장소에서 P 를 읽음 → delegate 복원. 시그니처·tx 내부 경로·14개 repo 무변경 | (a) getter 내부 `this` 재-Proxy 래핑 — 이중 래핑 취약·검증 불가 / (b) 생성자 `this.rootClient=this` — 동일 set-trap 의존, lifecycle 결합 불명확 / (c) 14개 repo `runInTransaction` 강제 래핑 — 대규모·범위 초과 |
| ADR-007 (rate limit) | GET 읽기/목록 **8핸들러 메서드 레벨** `@SkipThrottle()`. 혼재 컨트롤러(Product·Admin) 컨트롤러 레벨 금지 | 읽기=멱등 조회로 남용 위험 클래스(brute-force·enumeration·자원변경) 밖. mutating/auth strict 임계값 전부 불변 → 보안 약화 아님. SC-010/017 결정성 확보 | 완화 `@Throttle` 상한(300/60s) — 상한 유지로 방어심층 우위이나 동일 IP 다중 GET 스위트 누적 시 flakiness 잔존 |

**GET 핸들러 실측 = 8개** (plan L302 "9개"는 텍스트 오기 — plan 표 L283~286 enumeration·실 코드가 authoritative):
- `product.controller.ts`(5): `listCategories`·`listMyProducts`·`getMyProductDetail`·`listPublic`·`getDetail`
- `admin.controller.ts`(3): `listPendingSellers`·`listUsers`·`listAuditLogs`
- 검증: `grep -cE "@Get\(" product.controller.ts admin.controller.ts` = 5, 3.

### 5-4. §F PROC-001 재적용 — tx getter fix 호출측 회귀 점검

T016 은 production `get tx(): TxClient` **시그니처·반환형 불변**(sync↔async·인자·반환 타입 변경 없음). 순수 내부 fallback 우선순위 삽입 + 신규 `registerRootClient` 메서드 + module provider 형태 변경.

| 잠재 회귀원 | grep 확인 | 판정 |
|---|---|---|
| 기존 `prisma.service.spec.ts`(getter 직접 단언) | `ls src/shared/prisma/*.spec.ts` = **부재** | 마이그레이션 대상 없음. T018 은 순수 신규 |
| unit spec 의 PrismaService mock | `grep "tx:" src/**/*.spec.ts` → `tx: {}` passthrough(auth·social-auth 등) | 실 getter 미사용(mock 객체). 회귀 없음 |
| static 텍스트 파싱 테스트 | `test/static/cross-schema.spec.ts`·`user-product-boundary.spec.ts` 가 repository **소스 텍스트** `this.prisma[.tx].<model>` grep | prisma.service 내부 무관·repository 소스 무변경 → 회귀 없음 |
| e2e 의 PrismaModule/PrismaService 직접 인스턴스화 | `grep "new PrismaService\|PrismaModule\|get(PrismaService)" test` = **없음** | AppModule 경유 팩토리 투명 실행. 회귀 없음 |

**§F 결론**: tx getter fix 로 인한 기존 테스트 **호출측 마이그레이션 대상 0건**. 회귀 방지 신규 unit(T018)만 5a 재작업으로 추가. T017(@SkipThrottle)은 production 시그니처 변경 없는 데코레이터 부착이라 §F 대상 아님 — SC-010/017 커버는 기존 e2e(`list-p95`·`products`·`auth-recovery`) 재실행 + mutating 불변은 기존 `rate-limit.e2e-spec.ts`(7/7)로 완비, 신규 테스트 불요.

### 5-5. 동시성·lifecycle 확인 (§C / P-005)

- **`rootClient` 레이스 컨디션 없음**: 부트스트랩 시 팩토리가 **1회 write**(`registerRootClient`) 후 요청 처리 중 read-only. Node 단일 스레드 + 부트스트랩 단일 실행 → race window 없음. 트랜잭션별 격리는 기존 `AsyncLocalStorage`(요청/트랜잭션 스코프) 담당·불변.
- **lifecycle(useFactory)**: Nest 는 useFactory 반환 인스턴스에도 `OnModuleInit`/`OnModuleDestroy` 훅 호출 → `$connect`/`$disconnect` 정상. 팩토리 반환은 Proxy P 이며 Nest 가 P 를 통해 lifecycle 메서드 호출(Development 런타임 검증 항목 T016-c).
- **P-005 결제 정합성**: `payment`·`settlement` 모듈 코드 무변경. tx **내부** 경로(`store.client`) 완전 불변 → outbox+멱등 결제 흐름 회귀 0.
