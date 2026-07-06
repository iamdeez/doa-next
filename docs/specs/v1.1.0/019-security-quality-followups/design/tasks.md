---
작성: Design Agent
버전: v1.1
최종 수정: 2026-07-05 17:34
상태: 확정
---

# Tasks: 019-security-quality-followups
> Branch: 019-security-quality-followups | Date: 2026-07-05 | Plan: [plan.md](../planning/plan.md)

## 목차

- [전제 조건](#전제-조건)
- [태스크 분해 레이어](#태스크-분해-레이어)
- [태스크 목록](#태스크-목록)
  - [Step 5. 통합 수정 — 사전 결함 fix (v1.1 확장)](#step-5-통합-수정--사전-결함-fix-v11-확장)
- [Test Authoring Contract](#test-authoring-contract)
- [태스크 입도 가이드](#태스크-입도-가이드)
- [구현 완료 기준](#구현-완료-기준)

---

## 전제 조건

- [x] spec.md 의 모든 [NEEDS CLARIFICATION] 항목이 해소되었는가? — spec §미결 사항 "없음"
- [x] plan.md 의 Constitution Gates 가 모두 통과(또는 예외 기재)되었는가? — P-001~P-007 전건 PASS
- [x] CHANGES.md 에서 이전 작업의 "후속 작업 시 주의사항"을 확인했는가? — 018 auth 보안 부채 5건 해소·SEC-018-01 잔존(§범위 외), OpenAPI 계약 재생성 절차 무관

---

## 태스크 분해 레이어

> [P] 표시: 이전 태스크와 병렬 실행 가능
> 기본 의존 순서: A → B → C → D (의존 없으면 [P])
>
> | 레이어 | 본 spec 대상 |
> |---|---|
> | A. 데이터 계층 | `schema.prisma` 인덱스 2개 + 신규 마이그레이션 — **Database Design Agent 산출**. 본 tasks 는 참조 배선만(중복 생성 금지) |
> | B. 도메인 계층 | `SecurityAuditLogger.findEmailNotFound` + `AuthService.findEmail` 배선 |
> | C. 인터페이스 계층 | 신규 DTO 2종 + 컨트롤러 4메서드 전환 + `app.module.ts` pino redact |
> | D. 테스트 계층 | SC-001~017 테스트 + §F 기존 테스트 마이그레이션 2건 — **5a Test Agent(AUTHORING)** |
>
> **PPG-1 파일 소유 분할**: A·B·C(production 소스) = 4단계 Development / D(테스트 파일 전량) = 5a Test Agent. 테스트 파일(신규·기존 마이그레이션 포함)은 **전량 Test Agent 소유**로 하여 PPG-1 병렬 중 동일 파일 충돌을 차단한다.
>
> **v1.1 확장 — Step 5 (사전 결함 fix, 트랙 5)**: 5b EXECUTION 이 확정한 사전 결함 2건(GAP-019-03 P0·GAP-019-04 Medium)을 SC-006/010/017 unblock 목적으로 편입. 기존 T001~T015 는 **불변**. fix 태스크는 아래 레이어에 매핑된다.
>
> | fix 레이어 | 대상 | 소유 |
> |---|---|---|
> | E. 공유 인프라(Prisma) | `shared/prisma/prisma.service.ts`·`prisma.module.ts` — tx getter delegate 복원(ADR-006) | **Development(4단계)** |
> | C'. 인터페이스 정책 데코레이터 | `product.controller.ts`·`admin.controller.ts` — GET 읽기/목록 8핸들러 `@SkipThrottle`(ADR-007) | **Development(4단계)** |
> | D'. fix 회귀 방지 테스트 | `prisma.service.spec.ts`(신규 targeted unit) | **5a Test Agent(AUTHORING) — 재작업 필요** |

---

## 태스크 목록

### Step 1. 데이터 계층 (Database Design Agent 산출 참조)

- [x] **T001** — 인덱스 스키마·마이그레이션 참조 배선
  - 레이어: A
  - 산출 소유: **Database Design Agent** (3단계 후 / 4단계 전 실행)
  - 대상 파일: `apps/backend/prisma/schema.prisma`(수정), `apps/backend/prisma/migrations/{ts}_add_product_seller_list_indexes/migration.sql`(신규)
  - 관련 요구사항: FR-006, FR-007, NFR-002, NFR-003
  - 상세: `Product` 에 `@@index([sellerId, createdAt(sort: Desc), id(sort: Desc)])`, `Seller` 에 `@@index([status, createdAt(sort: Desc), id(sort: Desc)])` 추가 + `prisma migrate dev --name add_product_seller_list_indexes` 로 마이그레이션 생성. **본 Design tasks 는 인덱스/마이그레이션을 직접 생성하지 않고 Database Design Agent 산출물을 참조**한다. Development(4단계)는 DB Design 산출 스키마·마이그레이션을 기준으로 후속 A 레이어 작업이 없음(순수 스키마 추가).
  - 근거 쿼리(DB Design 참조): `ProductRepository.listBySeller`(`where{sellerId}, orderBy[{createdAt desc},{id desc}]`) / `SellerRepository.listByStatusPaginated`(`where{status, businessName contains?}, orderBy[{createdAt desc},{id desc}]`)
  - 완료 기준: schema.prisma 에 2개 인덱스 존재(SC-007/008 static 검증 통과) + 신규 마이그레이션 SQL 에 CREATE INDEX 2건 + GAP-005-03 accepted 위 순차 누적(드리프트 무관)

### Step 2. 도메인 계층 (Development 4단계)

- [x] **T002** — `SecurityAuditLogger.findEmailNotFound` 신규 메서드
  - 레이어: B
  - 구현 파일: `apps/backend/src/shared/security/security-audit.logger.ts`
  - 관련 요구사항: FR-008, FR-009, FR-010
  - 상세: 기존 3메서드와 동일 best-effort 패턴으로 `findEmailNotFound(phone: string): void` 추가 — `try { this.logger.warn({ event: 'find_email_not_found', phone: maskPhone(phone) }, 'find-email not found'); } catch { /* best-effort */ }`. `maskPhone` 은 기존 import 재사용(`auth.util`).
  - 완료 기준: 메서드 존재 + `event: 'find_email_not_found'` + `maskPhone(phone)` 마스킹 + 내부 try/catch(FR-010) + 기존 3메서드 무변경

- [x] **T003** — `AuthService.findEmail` 404 분기 감사 이벤트 배선 (T002 완료 후)
  - 레이어: B
  - 구현 파일: `apps/backend/src/modules/auth/auth.service.ts`
  - 관련 요구사항: FR-008, FR-010
  - 상세: `findEmail` 의 `if (!user)` 블록에서 `throw new NotFoundException(...)` **이전**에 `this.securityAuditLogger.findEmailNotFound(phone);` 삽입. 시그니처·성공 경로·반환 타입 불변.
  - 완료 기준: 404 분기에서 `findEmailNotFound(phone)` 1회 호출 후 `NotFoundException` throw. 성공 경로(`findEmailAccessed`)·시그니처 무변경

### Step 3. 인터페이스 계층 (Development 4단계, [P] 서로 병렬)

- [x] **T004** `[P]` — 공유 `ListQueryDto` 신규
  - 레이어: C
  - 구현 파일: `apps/backend/src/shared/dto/list-query.dto.ts`(신규 — `src/shared/dto/` 디렉토리 부재 → 생성)
  - 관련 요구사항: FR-002, FR-003, FR-004, FR-005
  - 상세: `ListProductsDto` 구조 복제 — `cursor?: @IsOptional @IsString` / `limit?: @IsOptional @Type(()=>Number) @IsInt @Min(1) @Max(100)`.
  - 완료 기준: 파일 존재 + class-validator 데코레이터 정확 + `import` 형태 named(`import { ListQueryDto } from '../../shared/dto/list-query.dto'`)

- [x] **T005** `[P]` — `AdminSellerListQueryDto extends ListQueryDto`
  - 레이어: C
  - 구현 파일: `apps/backend/src/modules/admin/dto/admin-seller-list-query.dto.ts`(신규)
  - 관련 요구사항: FR-001, FR-005, NFR-001 (ADR-002)
  - 상세: `ListQueryDto` 상속 + `status?: @IsOptional @IsString` + `q?: @IsOptional @IsString`. `status` 는 `@IsEnum` 금지(서비스 파싱 유지 — P-007). **4필드(cursor·limit·status·q) 전부 선언 필수**(forbidNonWhitelisted 회귀 방지).
  - 완료 기준: 상속 구조 + status·q `@IsString @IsOptional` + cursor·limit 상속

- [x] **T006** — `AdminController` 3메서드 DTO 전환 (T005 완료 후)
  - 레이어: C
  - 구현 파일: `apps/backend/src/modules/admin/admin.controller.ts`
  - 관련 요구사항: FR-001, FR-002, FR-003, FR-005, NFR-001
  - 상세:
    - `listPendingSellers` → `@Query() query: AdminSellerListQueryDto`, 호출 `listSellers(query.status, query.cursor, query.limit, query.q)`
    - `listUsers` → `@Query() query: ListQueryDto`, 호출 `listUsers(query.cursor, query.limit)`
    - `listAuditLogs` → `@Query() query: ListQueryDto`, 호출 `listAuditLogs(query.limit)`(query.cursor 미사용)
    - 수동 `parseInt` 전부 제거. 서비스 시그니처 무변경(`limit?: number`).
  - 완료 기준: 3메서드 개별 `@Query()`+parseInt 제거 + DTO 단일 인자 + 서비스 호출 인자 정합 + `tsc --noEmit` 0

- [x] **T007** — `SellerProductController.listMyProducts` DTO 전환 (T004 완료 후)
  - 레이어: C
  - 구현 파일: `apps/backend/src/modules/product/product.controller.ts`
  - 관련 요구사항: FR-004, FR-005, NFR-001
  - 상세: `@CurrentUser() user` 유지 + cursor·limit `@Query()`→`@Query() query: ListQueryDto`. 호출 `listMyProducts(user.userId, query.cursor, query.limit)`. parseInt 제거.
  - 완료 기준: `@CurrentUser` 유지 + DTO 통합 + 서비스 호출 정합 + `tsc --noEmit` 0

- [x] **T008** `[P]` — `app.module.ts` pino redact
  - 레이어: C
  - 구현 파일: `apps/backend/src/app.module.ts`
  - 관련 요구사항: FR-011, FR-012, NFR-004
  - 상세: `LoggerModule.forRoot({ pinoHttp: { ... } })` 의 `pinoHttp` 에 `redact: ['req.headers.authorization', 'req.headers.cookie']` 추가(소문자 경로). 기존 `transport` 분기 불변.
  - 완료 기준: `redact` 배열 2경로 추가 + transport 분기 무변경 + 인증/인가 런타임 로직 무변경(NFR-004)

### Step 4. 테스트 계층 (5a Test Agent AUTHORING — PPG-1 병렬)

> 본 Step(레이어 D) 은 4단계 Development 와 동일 turn 병렬 spawn 되는 **5a Test Agent(AUTHORING)** 가 수행한다. Development(4)는 Step 1~3(A·B·C)만 진행한다. 테스트 파일 canonical 은 아래 [Test Authoring Contract](#test-authoring-contract) 참조.

- [ ] **T009** — SC-001~006 통합 테스트 (DTO 검증)
  - 레이어: D | 테스트 파일: `apps/backend/test/list-query-dto.e2e-spec.ts`(신규) | 검증 대상: SC-001·002·003·004·005·006
- [ ] **T010** — SC-007·008 static 인덱스 존재 테스트
  - 레이어: D | 테스트 파일: `apps/backend/test/static/list-index.spec.ts`(신규) | 검증 대상: SC-007·008
- [ ] **T011** — SC-011·013 auth.service findEmail 테스트 + §F mock 마이그레이션
  - 레이어: D | 테스트 파일: `apps/backend/src/modules/auth/auth.service.spec.ts`(수정) | 검증 대상: SC-011·013 + 회귀(SC-017)
- [ ] **T012** — SC-012·013(신규 메서드) security-audit.logger 테스트
  - 레이어: D | 테스트 파일: `apps/backend/src/shared/security/security-audit.logger.spec.ts`(수정) | 검증 대상: SC-012·013
- [ ] **T013** — SC-014·015 pino redact 통합 테스트
  - 레이어: D | 테스트 파일: `apps/backend/test/pino-redact.e2e-spec.ts`(신규) | 검증 대상: SC-014·015
- [ ] **T014** — §F admin.controller.spec.ts positional→DTO 마이그레이션
  - 레이어: D | 테스트 파일: `apps/backend/src/modules/admin/admin.controller.spec.ts`(수정) | 검증 대상: 회귀(SC-006·SC-017)
- [ ] **T015** — SC-009·010·016·017 회귀·EXPLAIN 검증(5b/Performance 실행 경로)
  - 레이어: D | 검증 대상: SC-009(e2e-db EXPLAIN)·SC-010(인덱스 전후 회귀)·SC-016(인증 가드 회귀)·SC-017(전체 스위트). SC-009 는 Performance Agent 또는 Test EXECUTION 이 로컬 PG 에서 EXPLAIN 실행

### Step 5. 통합 수정 — 사전 결함 fix (v1.1 확장)

> 5b EXECUTION 이 base commit(62d14f9) 대비 git diff 0 으로 확정한 **사전 결함 2건**(GAP-019-03·04)을 SC-006/010/017 unblock 목적으로 편입. **신규 FR/SC 없음(spec.md 불변)** — 기존 SC 를 차단하던 결함 제거. Development(4단계) 재진입으로 T016·T017 production 수정, 5a 재작업으로 T018 회귀 방지 unit 추가. 근거: plan §트랙 5, ADR-006/007, research §트랙 5.

- [x] **T016** — `PrismaService.tx` 비-트랜잭션 delegate 복원 (ADR-006, GAP-019-03 P0)
  - 레이어: E (공유 인프라 — Prisma) | 소유: **Development(4단계)**
  - 구현 파일: `apps/backend/src/shared/prisma/prisma.service.ts`(수정), `apps/backend/src/shared/prisma/prisma.module.ts`(provider shorthand → useFactory)
  - 관련 요구사항: SC-006 unblock (신규 FR 없음)
  - 상세 (ADR-006 채택안):
    - `prisma.service.ts`: `private rootClient?: TxClient;` 필드 + `registerRootClient(client: PrismaClient): void { this.rootClient = client as unknown as TxClient; }` 신규. getter 를 `get tx(): TxClient { return this.als.getStore()?.client ?? this.rootClient ?? (this as unknown as TxClient); }` 로 수정. **getter 시그니처(`get tx(): TxClient`)·반환형·트랜잭션 내부 경로(`store.client`)·`runInTransaction`·`onAfterCommit`·lifecycle hook 전부 불변.**
    - `prisma.module.ts`: `providers: [PrismaService]` → `providers: [{ provide: PrismaService, useFactory: (): PrismaService => { const client = new PrismaService(); client.registerRootClient(client); return client; } }]`. `@Global`·`exports` 불변.
    - **작동 원리**: 팩토리 `client` 는 DI 가 repository 에 주입하는 Proxy P(delegate 보유). `registerRootClient(client)` 로 인스턴스 저장소에 P 기록 → getter(내부 `this`=원본타깃 T, delegate 미보유)의 `this.rootClient` 가 동일 저장소에서 P 를 읽어 반환 → `tx.<delegate>` 정상 복원. 근본원인은 research §트랙 5-1 참조.
  - **14개 repository 무변경** (`this.prisma.tx.<delegate>` 호출부 코드·시그니처 불변).
  - 완료 기준 (런타임 검증 필수):
    - (a) 실 앱 부트스트랩(AppModule)에서 **비-트랜잭션** `prismaService.tx.<delegate>`(예: `.user`·`.adminAuditLog`) 가 `undefined` 아님 — SC-006 e2e(`test/list-query-dto.e2e-spec.ts` admin/audit-logs 케이스) FAIL(500)→PASS(200) 전환으로 실증
    - (b) `runInTransaction` 내부에서 `tx` 가 여전히 `store.client` 반환(트랜잭션 경로 회귀 0) — 018 rate-limit/atomicity e2e 및 결제 트랜잭션 경로 green 유지
    - (c) `onModuleInit` 의 `$connect`·`onModuleDestroy` 의 `$disconnect` 정상(팩토리 반환 Proxy 가 lifecycle hook 수신)
    - (d) `pnpm --filter backend exec tsc --noEmit` EXIT 0

- [x] **T017** — GET 읽기/목록 엔드포인트 rate limit 예외 (ADR-007, GAP-019-04 Medium)
  - 레이어: C' (인터페이스 정책 데코레이터) | 소유: **Development(4단계)**
  - 구현 파일: `apps/backend/src/modules/product/product.controller.ts`, `apps/backend/src/modules/admin/admin.controller.ts`
  - 관련 요구사항: SC-010·SC-017 unblock (신규 FR 없음)
  - 상세: `@nestjs/throttler` 의 `@SkipThrottle()` 를 아래 **GET 읽기/목록 8핸들러에 메서드 레벨**로 부착. import 는 `import { SkipThrottle } from '@nestjs/throttler';`(health.controller 기존 패턴 승계).

    | 컨트롤러 (파일) | 핸들러 (메서드) | 라우트 |
    |---|---|---|
    | `CategoriesController` (product.controller.ts) | `listCategories` | GET /categories |
    | `SellerProductController` (product.controller.ts) | `listMyProducts` | GET /sellers/me/products |
    | `SellerProductController` (product.controller.ts) | `getMyProductDetail` | GET /sellers/me/products/:id |
    | `ProductController` (product.controller.ts) | `listPublic` | GET /products |
    | `ProductController` (product.controller.ts) | `getDetail` | GET /products/:id |
    | `AdminController` (admin.controller.ts) | `listPendingSellers` | GET /admin/sellers/pending |
    | `AdminController` (admin.controller.ts) | `listUsers` | GET /admin/users |
    | `AdminController` (admin.controller.ts) | `listAuditLogs` | GET /admin/audit-logs |

    - **혼재 컨트롤러 강제(ProductController·AdminController)**: 컨트롤러 레벨 `@SkipThrottle()` 금지 — 같은 컨트롤러의 mutating 핸들러(`createProduct`·`updateProduct`·`publish`·`deactivate`·variants·images / `approveSeller`) rate limit 까지 제거된다. **반드시 메서드 레벨**로 위 8핸들러에만 부착. 읽기 전용 컨트롤러(Categories·SellerProduct)도 일관성 위해 메서드 레벨.
    - **불변**: mutating(POST/PATCH/DELETE)·auth 엔드포인트의 전역 default(20/60s)·개별 `@Throttle`(NFR-001~006) 전부 불변. 응답 구조·상태 코드 불변(200 유지, 429 회귀 제거).
    - > **핸들러 수 주의**: plan §5-2 본문 L302 는 "9개"로 표기하나 실제 코드 열거는 **8개**(product.controller 5 + admin.controller 3)다 — plan 표(L283~286) enumeration 및 실 코드가 authoritative(research §트랙 5-2 기록). tasks 는 8핸들러로 확정.
  - 완료 기준 (런타임 검증 필수):
    - (a) 8핸들러에 `@SkipThrottle()` 부착 + 위 mutating/auth 핸들러 **미부착**(코드 확인)
    - (b) 다중 GET 순차 요청이 429 없이 통과 — `test/perf/list-p95.e2e-spec.ts`(100회 순차)·`test/products.e2e-spec.ts`(SC-047)·`test/auth-recovery.e2e-spec.ts`(SC-017/018) FAIL(429)→PASS 전환
    - (c) mutating/auth rate limit 회귀 0 — 기존 `test/rate-limit.e2e-spec.ts` 7/7 PASS 유지(strict 임계값 불변 확인)
    - (d) `pnpm --filter backend exec tsc --noEmit` EXIT 0

- [ ] **T018** — `PrismaService.tx` delegate 복원 targeted unit (ADR-006 회귀 방지)
  - 레이어: D' (fix 회귀 방지 테스트) | 소유: **5a Test Agent(AUTHORING) — 재작업 필요** | 검증 대상: T016 / SC-006·SC-017 회귀 방지
  - 테스트 파일: `apps/backend/src/shared/prisma/prisma.service.spec.ts`(신규 — 현재 부재)
  - 상세 (DB 연결 불요 — Proxy 동작만 검증):
    - `new PrismaService()` (= Proxy P) 생성 후 `service.registerRootClient(service)` 호출 → `(service.tx as any).user` 등 model delegate 가 **`toBeDefined()`**(비-트랜잭션 경로 delegate 복원 실증). `$connect` 호출 없음(delegate 는 연결 전에도 노출).
    - `registerRootClient` **미주입** 인스턴스는 fallback `(this as unknown as TxClient)` 로 하위호환 반환됨을 확인(회귀 0 방어).
    - (선택) `runInTransaction(fn)` 내부에서 `tx` 가 `store.client`(ALS store) 를 반환함을 spy 로 확인 — 트랜잭션 경로 불변 단언. `$transaction` mock 이 필요하면 delegate 접근 없는 최소 mock 으로 격리.
  - 완료 기준: 신규 unit PASS + `prisma.service.spec.ts` 존재 + 비-tx delegate 정의 단언 + 미주입 fallback 단언. e2e(SC-006)는 T016 완료 기준(a)이 커버하므로 본 unit 은 fast/DB-free 회귀 insurance.
  - > **§F PROC-001 결과**: T016 은 production 시그니처(`get tx()`) **불변**이므로 호출측 마이그레이션 대상 없음. 기존 unit spec 은 PrismaService 를 `tx: {}` passthrough mock 으로 등록(실 getter 미사용), static 테스트(`cross-schema.spec.ts`·`user-product-boundary.spec.ts`)는 repository **소스 텍스트** 파싱(getter 내부 무관) → tx getter fix 로 인한 기존 테스트 회귀 **0건**. `prisma.service.spec.ts` 는 부재였으므로 T018 은 순수 신규(마이그레이션 아님).

---

## Test Authoring Contract

> **PPG-1 의 5a Test Agent(AUTHORING) 입력 contract**. Development(4)와 병렬이므로 production 심볼을 canonical 로 명시한다.

### production 심볼 canonical (PROC-004)

| 심볼 | canonical 시그니처·형태 |
|---|---|
| `ListQueryDto` | `src/shared/dto/list-query.dto.ts` — `{ cursor?: string; limit?: number }` |
| `AdminSellerListQueryDto` | `src/modules/admin/dto/admin-seller-list-query.dto.ts` extends `ListQueryDto` — `+ { status?: string; q?: string }` |
| `AdminController.listPendingSellers` | `(query: AdminSellerListQueryDto)` → `adminService.listSellers(query.status, query.cursor, query.limit, query.q)` |
| `AdminController.listUsers` | `(query: ListQueryDto)` → `adminService.listUsers(query.cursor, query.limit)` |
| `AdminController.listAuditLogs` | `(query: ListQueryDto)` → `adminService.listAuditLogs(query.limit)` |
| `SellerProductController.listMyProducts` | `(user: AuthenticatedUser, query: ListQueryDto)` → `productService.listMyProducts(user.userId, query.cursor, query.limit)` |
| `SecurityAuditLogger.findEmailNotFound` | `findEmailNotFound(phone: string): void` — `event: 'find_email_not_found'`, `phone: maskPhone(phone)`, 내부 try/catch |
| `AuthService.findEmail` | `(phone): Promise<FindEmailResult>` **시그니처 불변** — 404 분기에서 `findEmailNotFound(phone)` 호출 후 `throw NotFoundException('No account found for this phone number')` |
| `PrismaService.registerRootClient` (v1.1) | `registerRootClient(client: PrismaClient): void` — 팩토리가 Proxy 자기참조 주입. `rootClient` 필드에 저장 |
| `PrismaService.tx` getter (v1.1) | `get tx(): TxClient` **시그니처·반환형 불변** — 반환 우선순위: `als.getStore()?.client`(tx 내부) ?? `rootClient`(비-tx, delegate 보유 Proxy) ?? `(this as unknown as TxClient)`(미주입 fallback) |
| `@SkipThrottle` 부착 GET 핸들러 (v1.1) | `product.controller.ts`: `listCategories`·`listMyProducts`·`getMyProductDetail`·`listPublic`·`getDetail` / `admin.controller.ts`: `listPendingSellers`·`listUsers`·`listAuditLogs` — **메서드 레벨 8개**. mutating/auth 핸들러 미부착 |

### 하네스 canonical (research §테스트 하네스 조사)

- **통합/e2e**: `Test.createTestingModule({imports:[AppModule]})` + supertest, `test/*.e2e-spec.ts`, 실행 `test:e2e`. docker PG + `prisma migrate dev` 전제.
- **Admin JWT**: AppModule import 이전 `process.env.ADMIN_USER_IDS = ADMIN_ID` → `new JwtService({secret: process.env.JWT_ACCESS_SECRET}).sign({sub: ADMIN_ID, email})` → `Bearer`. Seller JWT: `sign({sub: sellerUserId, email})` (`/sellers/me/products` 는 JwtAuthGuard 만).
- **static**: `fs.readFileSync('prisma/schema.prisma')` 텍스트 파싱, `test/static/*.spec.ts`.
- **unit**: 콜로케이트 `src/**/*.spec.ts` + mock DI.

### SC 시나리오 표

| SC-ID | 수용 기준 | Happy | Edge | Error | 테스트 파일 | 비고 |
|---|---|---|---|---|---|---|
| SC-001 | admin/sellers/pending 비정수 limit → 400 | — | — | `?limit=abc` 400 | `test/list-query-dto.e2e-spec.ts` | [env:integration] admin JWT |
| SC-002 | admin/users 비정수 limit → 400 | — | — | `?limit=abc` 400 | 동상 | admin JWT |
| SC-003 | admin/audit-logs 비정수 limit → 400 | — | — | `?limit=abc` 400 | 동상 | admin JWT |
| SC-004 | sellers/me/products 비정수 limit → 400 | — | — | `?limit=abc` 400 | 동상 | seller JWT |
| SC-005 | 4엔드포인트 limit=0·101 경계 → 400 | — | `?limit=0`·`?limit=101` 전부 400 | — | 동상 | 경계값 |
| SC-006 | 4엔드포인트 유효 limit=20 → 200 + 기존 구조 | `?limit=20`(+정상 status/q/cursor) 200 | — | — | 동상 | **ADR-002 회귀 방어**: admin/sellers/pending 에 `?status=APPROVED&q=마켓` 동반 요청도 200(400 아님) |
| SC-007 | schema.prisma Product sellerId 선두 복합 인덱스 | 인덱스 존재 | — | — | `test/static/list-index.spec.ts` | [env:static] fs 파싱 |
| SC-008 | schema.prisma Seller status 선두 복합 인덱스 | 인덱스 존재 | — | — | 동상 | [env:static] |
| SC-009 | EXPLAIN 인덱스 스캔 | Index/Bitmap Scan | — | — | (로컬 PG EXPLAIN) | [env:e2e-db] Performance/EXECUTION 실행 |
| SC-010 | 인덱스 전후 회귀 없음 | 기존 e2e 응답 동일 | — | — | 기존 e2e | [env:integration] |
| SC-011 | 미등록 phone findEmail → findEmailNotFound 호출 + 404 | — | — | mock findFirstUserByPhone→null → findEmailNotFound 1회 + NotFoundException | `src/modules/auth/auth.service.spec.ts` | [env:unit] **mockSecurityAuditLogger 에 findEmailNotFound: jest.fn() 필수** |
| SC-012 | 신규 이벤트 마스킹 | maskPhone 결과만(원본 phone 부재) | — | — | `src/shared/security/security-audit.logger.spec.ts` | [env:unit] |
| SC-013 | 로거 예외 best-effort | — | — | 로거 내부 throw mock → findEmail 정상 404 | `auth.service.spec.ts` + `security-audit.logger.spec.ts` | [env:unit] 실 SecurityAuditLogger + PinoLogger.warn throw mock(기존 L853+ 패턴) |
| SC-014 | Authorization 헤더 redact | 로그에 `[Redacted]` + 원본 토큰 부재 | — | — | `test/pino-redact.e2e-spec.ts` | [env:integration] **stdout.write spy 후 afterEach 복원** |
| SC-015 | Cookie 헤더 redact | 로그에 `[Redacted]` + 원본 쿠키 부재 | — | — | 동상 | [env:integration] 동상 |
| SC-016 | 인증/인가 기존 테스트 회귀 없음 | auth-required-guards·rate-limit PASS | — | — | 기존 `test/static/auth-required-guards.spec.ts`·`test/rate-limit.e2e-spec.ts` | [env:unit] |
| SC-017 | 전체 스위트 100% PASS | 전체 unit·e2e·static | — | — | 전체 | [env:integration] |

### §F 기존 테스트 마이그레이션 (Test Agent 필수 수행)

| 파일 | 마이그레이션 | canonical |
|---|---|---|
| `src/modules/admin/admin.controller.spec.ts` | `listPendingSellers — query 파라미터 배선` describe 의 positional-arg 호출 → DTO 객체 인자. `controller.listPendingSellers({status:'APPROVED',cursor:'cursor-1',limit:10,q:'마켓'})` / `controller.listPendingSellers({})`. 기대값 `listSellers('APPROVED','cursor-1',10,'마켓')` / `listSellers(undefined,undefined,undefined,undefined)` 유지 | 단위 테스트에 ValidationPipe 미개입 → `limit` 은 **number(10)** 직접 전달(parseInt production 제거). `{}` 전달 시 전 필드 undefined |
| `src/modules/auth/auth.service.spec.ts` | `mockSecurityAuditLogger`(L84~88)에 `findEmailNotFound: jest.fn()` 추가 | 미추가 시 `test_find_email_unregistered_404` 가 `undefined()` TypeError 로 회귀. SC-011 신규 테스트도 동일 mock 사용 |

> 본 contract 는 외부 agent/사용자/CI 가 직접 충족 가능. `ExternalAuthoring: YES` 시 main 이 산출물(test-cases.md + 테스트 파일) 존재 확인 후 5b 진입.

### v1.1 fix 테스트 소유 판정 (5a 재작업 범위)

| fix 태스크 | SC 커버 경로 | 신규 테스트 필요 여부 | 5a 재작업 |
|---|---|---|---|
| T016 (tx getter fix) | SC-006 e2e(`list-query-dto.e2e-spec.ts` admin/audit-logs, 이미 5a 작성)·auth.e2e register 경로 = 이미 존재하는 e2e 가 직접 커버 | **targeted unit 추가(T018)** — plan §트랙 5 "신규 권장". P0·subtle Proxy 근본원인의 fast/DB-free 회귀 insurance | **필요(소량)** — `prisma.service.spec.ts` 1개 신규 |
| T017 (@SkipThrottle) | SC-010/017 e2e(`list-p95`·`products`·`auth-recovery`, 기존)가 429→200 전환으로 직접 커버 + mutating 불변은 기존 `rate-limit.e2e-spec.ts`(7/7) 가 커버 | **신규 테스트 불요** — 기존 e2e 재실행이 완전 커버 | 불요 |

> **5a 재작업 결론**: T018(prisma.service targeted unit) 1건만 5a 재작업 대상. T017 은 기존 e2e 재실행으로 충분하여 신규 테스트 파일 불요. §8 보고 반영.

---

## 태스크 입도 가이드

- 1 태스크 ≈ 구현 파일 1~3개 + 대응 테스트 1개 수준. T006(3메서드 동일 파일)·T009(4엔드포인트 동일 e2e 파일)는 단일 파일 응집이라 분할 불요.
- §F 마이그레이션(T011·T014)은 production 시그니처 변경의 호출 측 동반 마이그레이션으로 별도 태스크 분리.
- T016(prisma.service+module 2파일, 강결합 fix)·T017(2컨트롤러 데코레이터 부착)은 각각 단일 응집 fix 라 분할 불요. T018 은 T016 회귀 방지 unit 으로 별도 분리(5a 소유).

## 구현 완료 기준

- [ ] 모든 태스크 체크박스 완료 (T001~T018)
- [ ] [TypeScript] `pnpm --filter backend exec tsc --noEmit` EXIT 0
- [ ] [Test] `pnpm --filter backend test`(unit) + `test:e2e`(통합·e2e) + static 전체 PASS (SC-017)
- [ ] [Prisma] 신규 마이그레이션 적용 후 `prisma migrate status` up-to-date (Database Design Agent 산출)
- [ ] [v1.1 fix] T016 후 SC-006 e2e(admin/audit-logs) 200 + auth.e2e register 경로 PASS (tx delegate 복원)
- [ ] [v1.1 fix] T017 후 `list-p95`·`products`·`auth-recovery` e2e 429→PASS + `rate-limit.e2e-spec.ts` 7/7 유지
- [ ] git status 의도치 않은 파일 없음
