---
작성: Planning Agent
버전: v1.1
최종 수정: 2026-07-05 [시각 미확인, spawn 기준 17:16]
상태: 확정
---

# Plan: 019-security-quality-followups
> Branch: 019-security-quality-followups | Date: 2026-07-04 [시각 미확인, spawn 기준 07:04] | Spec: [spec.md](../spec/spec.md)
>
> **v1.1 개정 (2026-07-05)**: 5b EXECUTION 이 확정한 **사전 결함 2건**(GAP-019-03 tx getter P0·GAP-019-04 GET 목록 rate limit Medium)을 019 범위로 통합 수정하기 위한 확장. 사용자 승인(pipeline-log 17:12, 옵션 A). 두 결함은 기존 SC-006·SC-010·SC-017 을 **차단**하는 것이므로 신규 FR/SC 불요 — spec.md 불변. 추가분: 트랙 5(§핵심 설계)·ADR-006/007·영향분석표·Constitution Gates 재검증·인터페이스 계약·테스트 전략 갱신.

## 목차

- [사전 검증 (Constitution Gates)](#사전-검증-constitution-gates)
  - [사전 검증 재검증 — 019 통합 수정 확장 (GAP-019-03/04)](#사전-검증-재검증--019-통합-수정-확장-gap-019-0304)
- [기술 컨텍스트](#기술-컨텍스트)
- [외부 라이브러리 동작 검증](#외부-라이브러리-동작-검증)
- [핵심 설계](#핵심-설계)
  - [트랙 5 — 019 통합 수정: 사전 결함 GAP-019-03/04 (SC-006/010/017 unblock)](#트랙-5--019-통합-수정-사전-결함-gap-019-0304-sc-006010017-unblock)
- [결정 기록 (ADRs)](#결정-기록-adrs)
- [인터페이스 계약](#인터페이스-계약)
- [데이터 모델](#데이터-모델)
- [테스트 전략](#테스트-전략)
- [기타 고려사항](#기타-고려사항)

---

## 사전 검증 (Constitution Gates)

> `.claude/docs/constitution.md` 존재 → 해당 조항(P-001~P-007)을 무조건 우선 기준으로 사용. spec.md NFR 은 이 조항과 충돌하지 않는다.

- [x] **P-001 모듈 경계 원칙**: [Pass 기준: 타 도메인 스키마 직접 참조·JOIN 0건 / 각 모듈 4계층 유지]
  - Query DTO 는 각 컨트롤러(admin·product)가 자기 서비스에만 전달하는 순수 입력 검증 객체(교차 쿼리 없음). 공유 `ListQueryDto` 는 `src/shared/dto/` 위치의 형식 계약일 뿐 도메인 데이터 미포함.
  - `Product` 인덱스는 `products` 스키마, `Seller` 인덱스는 `users` 스키마 — 각 소유 모듈 repository(`ProductRepository.listBySeller`·`SellerRepository.listByStatusPaginated`) 쿼리 대상에 국한.
  - find-email 감사 이벤트는 `auth` 모듈 내부(SecurityAuditLogger `shared/security`) / pino redact 는 `app.module.ts` 인프라 로깅 설정. 교차 모듈 DB 접근 없음. → **PASS**
- [x] **P-002 AWS 의존 금지 원칙**: [Pass 기준: AWS 전용 SDK/서비스 신규 의존 0건] — 신규 의존 0(class-validator·class-transformer·nestjs-pino 전부 기존 설치). → **PASS**
- [x] **P-003 단일 DB 원칙**: [Pass 기준: 단일 PostgreSQL 외 신규 외부 저장소 0건] — 인덱스 추가는 기존 PostgreSQL 스키마 내 변경. 신규 저장소 없음. → **PASS**
- [x] **P-004 클라우드 중립 원칙**: [Pass 기준: Fly.io 전용 API 에 비즈니스 로직 결합 0건] — 표준 Prisma 마이그레이션·표준 pino redact·표준 class-validator. 플랫폼 종속 없음. → **PASS**
- [x] **P-005 결제·정산 정합성 원칙**: [Pass 기준: 결제·환불·정산 상태 변경 시 outbox+멱등성] — 본 spec 은 payment·settlement 모듈 무변경. 해당 없음(N/A) → **PASS**
- [x] **P-006 테스트 원칙**: [Pass 기준: SC-XXX 없는 FR-XXX 0건] — FR-001→SC-001, FR-002→SC-002, FR-003→SC-003, FR-004→SC-004, FR-005→SC-005, FR-006→SC-007, FR-007→SC-008, FR-008→SC-011, FR-009→SC-012, FR-010→SC-013, FR-011→SC-014, FR-012→SC-015. 미매핑 FR 0건. → **PASS**
- [x] **P-007 스펙 범위 원칙**: [Pass 기준: spec.md 범위 외 변경 파일 0건] — 4개 발견 항목(SEC-017-01·GAP-017-03·SEC-018-02·SEC-018-03)에 한정. ASM-001(SEC-017-01 4개 엔드포인트 확장)은 사용자 확정(pipeline-log 07:04). 범위 외 리팩토링 없음. → **PASS**

예외 사항: 없음.

> Gates 전건 통과. Design Agent 진입 가능.

### 사전 검증 재검증 — 019 통합 수정 확장 (GAP-019-03/04)

> v1.1 확장분(트랙 5 · ADR-006/007)에 대한 Constitution Gates 재검증. 기존 트랙 1~4 판정은 불변. 참조: constitution.md P-001~P-007.

- [x] **P-001 모듈 경계 원칙**: 두 fix 모두 **shared 인프라 계층**에 국한 —
  - ADR-006(tx getter): `shared/prisma/prisma.service.ts`·`prisma.module.ts`. `PrismaService`(전역 `@Global` 공유 인프라)는 특정 도메인 스키마에 종속되지 않는 트랜잭션 인프라. 도메인 모듈 간 직접 DB 교차 쿼리 신규 도입 0. 오히려 비-트랜잭션 경로에서 model delegate 를 정상 복원하여 각 repository 가 **자기 스키마 테이블**에 접근하던 기존 계약을 회복시킬 뿐.
  - ADR-007(rate limit): `shared/security` 가드 정책 데코레이터(`@SkipThrottle`)만 컨트롤러에 부착. DB 접근·모듈 경계 무관. → **PASS**
- [x] **P-002 AWS 의존 금지 원칙**: 신규 의존 0. `@nestjs/throttler`(`@SkipThrottle`)·`@prisma/client`·`@nestjs/common`(useFactory) 전부 기존 설치분. → **PASS**
- [x] **P-003 단일 DB 원칙**: 신규 외부 저장소 0. tx getter 는 동일 PostgreSQL 클라이언트의 delegate 반환 방식만 교정. → **PASS**
- [x] **P-004 클라우드 중립 원칙**: 표준 NestJS DI(useFactory)·표준 `@nestjs/throttler` 데코레이터·표준 Prisma 클라이언트. Fly.io 전용 API 결합 0. → **PASS**
- [x] **P-005 결제·정산 정합성 원칙**: `payment`·`settlement` 모듈 코드 **무변경**. ADR-006 은 트랜잭션 인프라의 **비-트랜잭션 fallback** 경로만 교정하며, 트랜잭션 내부 경로(ALS store 존재 시 `store.client` 반환)는 완전 불변 — outbox+멱등성으로 처리되는 결제 흐름의 `runInTransaction` 경로에 회귀 0. → **PASS**
- [x] **P-006 테스트 원칙**: 신규 FR/SC **0건**(spec.md 불변). 두 fix 는 기존 **SC-006**(admin/audit-logs 200)·**SC-010**(회귀 스위트)·**SC-017**(전체 100% PASS)을 차단하던 결함을 제거하여 해당 SC 를 **unblock** 한다. 추가로 ADR-006 회귀 방지용 targeted unit(비-트랜잭션 `tx.<delegate>` 정의 확인)을 Test 단계에 권장(테스트 전략 참조). SC 없는 신규 FR 없음. → **PASS**
- [x] **P-007 스펙 범위 원칙**: 본 확장은 spec.md 범위를 넘어서는 것이나, **사용자 명시 승인**으로 편입(pipeline-log 17:12 사용자 개입 — 옵션 A "019 통합 수정"). 두 결함은 base commit(62d14f9) 대비 019 미변경 파일의 **사전 결함**(003-commerce·018 도입 시점)이며, 기존 SC-006/010/017 을 차단하므로 정합적으로 본 spec 검증 범위 내. 무관한 리팩토링 확산 없음(변경은 tx fallback 1개 + GET 읽기 엔드포인트 rate limit 예외로 한정). → **PASS**

> **호환성(하위호환) 검증** — 프로젝트 constitution 에 독립 "호환성" 조항은 없으나(기본 게이트의 호환성 원칙), ADR-006 은 14개 repository 의 `this.prisma.tx.<delegate>` 호출 계약(시그니처·반환형)을 **불변** 유지하는 것이 필수 전제다. 상세 논증은 §인터페이스 계약 "tx 접근 계약(ADR-006)" 참조. Development 은 구현 후 **비-트랜잭션·트랜잭션 내부 양 경로**의 delegate 접근을 런타임 검증한다.

> 재검증 Gates 전건 통과(예외 0). Design Agent [재작업] 진입 가능.

## 기술 컨텍스트

- 언어 / 런타임: TypeScript / Node.js (NestJS 모듈러 모놀리스, `apps/backend`)
- 주요 의존성: **신규 npm 의존 0**. 기존 설치분 재사용 —
  - `class-validator` + `class-transformer` (기존 `ListProductsDto` 가 동일 패턴 사용 — `@Type(() => Number)`·`@IsInt`·`@Min`·`@Max`·`@IsString`·`@IsOptional`)
  - `@prisma/client` + Prisma CLI (인덱스 스키마 변경 + 신규 마이그레이션)
  - `nestjs-pino` (기존 `LoggerModule.forRoot` — `pinoHttp.redact` 옵션 추가만)
- 테스트 프레임워크: Jest (unit·integration·e2e) + static(schema/typecheck). 기존 스위트: unit 397 PASS(39 suites) + static 4 + e2e(rate-limit 6·atomicity 1) — 018 5b 기준.
- 전제: 전역 `ValidationPipe` 가 `{ whitelist: true, forbidNonWhitelisted: true, transform: true }` 로 이미 구성됨(`apps/backend/src/main.ts` L25~31 확인). `transform: true` 덕분에 `@Type(() => Number)` query→number 변환이 동작한다.

## 외부 라이브러리 동작 검증

> §10 (외부 라이브러리 API 동작 사전 검증) — spec 가정이 의존하는 3개 라이브러리 동작을 실코드/설정으로 확인.

| 항목 | 검증 대상 | 확인 결과 (근거) | 인정되는 한계 |
|---|---|---|---|
| class-validator query 변환 | `@Type(() => Number) @IsInt @Min(1) @Max(100)` 가 query string 을 검증·변환하는가 | **확인됨** — `apps/backend/src/modules/product/dto/list-products.dto.ts` 가 정확히 이 패턴을 사용하고 `GET /products`(product.controller.ts L86 `@Query() query: ListProductsDto`)에서 실동작 중. `main.ts` L30 `transform: true` 로 `'20'→20`, `'abc'→NaN(→@IsInt 실패→400)`, `'0'→@Min 실패→400`, `'101'→@Max 실패→400`. | 없음(코드베이스 검증된 패턴) |
| **`forbidNonWhitelisted: true` 부작용** | DTO 에 선언되지 않은 query 파라미터를 400 으로 거부하는가 | **확인됨** — `main.ts` L28 `forbidNonWhitelisted: true`. 현재 `admin/sellers/pending` 은 `status`·`cursor`·`limit`·`q` 4개를 **개별** `@Query()` 로 받아 ValidationPipe 검증 대상이 아님(primitive skip). DTO 로 전환하면 DTO 에 없는 파라미터가 400 으로 거부됨 → **`status`·`q` 를 DTO 에 포함하지 않으면 기존 유효 요청이 400 회귀**(NFR-001·SC-006·SC-010 위반). → ADR-002 로 엔드포인트별 DTO 설계 강제. | 없음(설정 파일로 확증) |
| pino redact | `pinoHttp.redact` 경로가 요청 헤더를 마스킹하는가 | **확인됨(라이브러리 표준)** — nestjs-pino `LoggerModule.forRoot({ pinoHttp })` 는 옵션을 pino-http→pino 로 전달. pino `redact: string[]` 는 지정 경로를 기본 검열 문자열 `[Redacted]` 로 치환. Node http 는 헤더명을 소문자화하므로 경로는 `req.headers.authorization`·`req.headers.cookie`(소문자) 필수. context.md §6 권고 경로와 일치. | pino-http 기본 req serializer 가 `req.headers` 하위에 헤더를 담는 전제 — nestjs-pino 기본 직렬화이며 커스텀 serializer 미설정이므로 성립. SC-014/015 통합 테스트로 마커 존재 최종 확인. |

## 핵심 설계

### 트랙 1 — SEC-017-01: cursor 목록 API Query DTO 검증 (FR-001~005, NFR-001)

**신규 DTO 2종:**

1. `src/shared/dto/list-query.dto.ts` — 공유 `ListQueryDto` (기존 `ListProductsDto` 와 구조 동일, 공유 위치):
   ```ts
   export class ListQueryDto {
     @IsOptional() @IsString()
     cursor?: string;

     @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100)
     limit?: number;
   }
   ```
2. `src/modules/admin/dto/admin-seller-list-query.dto.ts` — `AdminSellerListQueryDto extends ListQueryDto` (status·q 추가):
   ```ts
   export class AdminSellerListQueryDto extends ListQueryDto {
     @IsOptional() @IsString()
     status?: string;   // 기존 동작 보존 — 서비스 레이어가 status 문자열 파싱(enum 매핑) 담당

     @IsOptional() @IsString()
     q?: string;
   }
   ```

**컨트롤러 시그니처 전환 (4개 메서드):**

| 컨트롤러·메서드 | 전환 전 | 전환 후 | 서비스 호출 |
|---|---|---|---|
| `AdminController.listPendingSellers` (`admin.controller.ts`) | `@Query('status')`·`@Query('cursor')`·`@Query('limit')`·`@Query('q')` + 수동 `parseInt` | `@Query() query: AdminSellerListQueryDto` | `listSellers(query.status, query.cursor, query.limit, query.q)` |
| `AdminController.listUsers` | `@Query('cursor')`·`@Query('limit')` + 수동 `parseInt` | `@Query() query: ListQueryDto` | `listUsers(query.cursor, query.limit)` |
| `AdminController.listAuditLogs` | `@Query('limit')` + 수동 `parseInt` | `@Query() query: ListQueryDto` | `listAuditLogs(query.limit)` |
| `SellerProductController.listMyProducts` (`product.controller.ts`) | `@Query('cursor')`·`@Query('limit')` + 수동 `parseInt` | `@Query() query: ListQueryDto` | `listMyProducts(user.userId, query.cursor, query.limit)` |

- 서비스 시그니처는 이미 `limit?: number`(number) 를 받으므로 **서비스·repository 변경 불필요**. 컨트롤러의 `limit ? parseInt(limit, 10) : undefined` 는 `query.limit`(이미 number|undefined) 로 대체. 클램프 로직(Math.max/min)은 서비스에 잔존(방어). DTO 가 상위에서 NaN·범위 밖을 400 으로 차단.
- `listAuditLogs`·`listUsers`·`listMyProducts` 는 `cursor` 파라미터가 DTO 에 선언되어 있어도 미전송 시 무해(`forbidNonWhitelisted` 는 **미선언 파라미터** 만 거부 — DTO 에 있으나 미전송은 정상). `listAuditLogs` 는 `query.cursor` 를 사용하지 않으므로 무시.

### 트랙 2 — GAP-017-03: 복합 인덱스 추가 + 신규 마이그레이션 (FR-006/007, NFR-002/003)

**`schema.prisma` 인덱스 2개 추가** (cursor 쿼리 정렬과 정합 — ADR-003):

```prisma
model Product {
  // ... 기존 필드 ...
  @@index([status, createdAt(sort: Desc), id(sort: Desc)])   // 기존(공개 목록)
  @@index([sellerId, createdAt(sort: Desc), id(sort: Desc)])  // 신규 (FR-006)
  @@map("products")
  @@schema("products")
}

model Seller {
  // ... 기존 필드 ...
  @@index([status, createdAt(sort: Desc), id(sort: Desc)])    // 신규 (FR-007)
  @@map("sellers")
  @@schema("users")
}
```

- 근거 쿼리(실 repository 대조):
  - `ProductRepository.listBySeller`: `where {sellerId}, orderBy [{createdAt desc},{id desc}]` → `[sellerId, createdAt Desc, id Desc]` 로 WHERE+ORDER BY 완전 커버.
  - `SellerRepository.listByStatusPaginated`: `where {status, businessName contains?}, orderBy [{createdAt desc},{id desc}]` → `[status, createdAt Desc, id Desc]` 로 status 등가 + 정렬 커버(businessName `contains` 는 인덱스 미활용이나 status 선두로 후보 집합 축소).
- **신규 Prisma 마이그레이션 1개** — Development Agent 가 `pnpm --filter backend exec prisma migrate dev --name add_product_seller_list_indexes` 실행. 생성 SQL 예상형(Prisma 자동 생성):
  ```sql
  CREATE INDEX "products_sellerId_createdAt_id_idx" ON "products"."products"("sellerId", "createdAt" DESC, "id" DESC);
  CREATE INDEX "sellers_status_createdAt_id_idx" ON "users"."sellers"("status", "createdAt" DESC, "id" DESC);
  ```
- 순수 additive(스키마 전용) — 응답 구조·상태 코드 불변(NFR-002). GAP-005-03(마이그레이션 드리프트, accepted) 위에 정상 누적(`migrate deploy` 순차 적용).

### 트랙 3 — SEC-018-02: find-email 실패 감사 이벤트 (FR-008/009/010)

**`SecurityAuditLogger`(`shared/security/security-audit.logger.ts`) 신규 메서드:**

```ts
/** find-email 미등록 전화번호 조회(404) 이벤트 — enumeration 탐지 (FR-008/009). */
findEmailNotFound(phone: string): void {
  try {
    this.logger.warn(
      { event: 'find_email_not_found', phone: maskPhone(phone) },
      'find-email not found',
    );
  } catch {
    /* best-effort: 로깅 실패가 원 흐름 차단 금지 (FR-010) */
  }
}
```

**`AuthService.findEmail`(`auth.service.ts` L295~302) 호출 배선:**

```ts
async findEmail(phone: string): Promise<FindEmailResult> {
  const user = await this.authRepository.findFirstUserByPhone(phone);
  if (!user) {
    this.securityAuditLogger.findEmailNotFound(phone);   // 신규 (FR-008) — throw 이전
    throw new NotFoundException('No account found for this phone number');
  }
  this.securityAuditLogger.findEmailAccessed(phone, user.email);  // 기존(성공)
  return { email: maskEmail(user.email) };
}
```

- FR-009: `maskPhone(phone)` 로 마스킹(기존 `findEmailAccessed` 와 동일 `auth.util` 헬퍼).
- FR-010(best-effort): 로거 메서드 내부 `try/catch` 가 예외를 흡수 → 호출부 추가 가드 불요(기존 3개 이벤트와 동일 패턴). `findEmail` 은 항상 `NotFoundException` 정상 반환.

### 트랙 4 — SEC-018-03: pino 요청 로그 redact (FR-011/012)

**`app.module.ts`(`apps/backend/src/app.module.ts` L32~39) LoggerModule 설정:**

```ts
LoggerModule.forRoot({
  pinoHttp: {
    redact: ['req.headers.authorization', 'req.headers.cookie'],   // 신규 (FR-011/012)
    transport:
      process.env['NODE_ENV'] !== 'production'
        ? { target: 'pino-pretty' }
        : undefined,
  },
}),
```

- 기본 검열 문자열 `[Redacted]` 로 치환(pino 표준). 경로는 소문자(Node http 헤더명 소문자화). transport 분기는 불변(NFR-004 — 인증/인가 로직 무변경, 로깅 설정만).

### 트랙 5 — 019 통합 수정: 사전 결함 GAP-019-03/04 (SC-006/010/017 unblock)

> **배경**: 5b EXECUTION 이 base commit(62d14f9) 대비 git diff 0 인 **사전 결함 2건**을 확정(CONFIRMED). 019 신규 코드 아님. 그러나 기존 SC-006·SC-010·SC-017 을 차단하므로 사용자 승인(옵션 A)으로 019 범위 통합. 신규 FR/SC 없음.

#### 5-1. GAP-019-03 (P0) — `PrismaService.tx` getter 비-트랜잭션 delegate 상실 (SC-006 unblock)

**결함 메커니즘 (5b Q1-a 확정 근거)**: `prisma.service.ts` L27~29 —

```ts
get tx(): TxClient {
  return this.als.getStore()?.client ?? (this as unknown as TxClient);   // ← 결함 fallback
}
```

Prisma 6.19.3 의 생성자는 `PrismaClient` 를 **Proxy 로 래핑**하여 반환한다(`new PrismaService()` = Proxy P, 원본 타깃 = T). model delegate(`user`·`adminAuditLog` 등)는 Proxy P 에만 노출된다. 그러나 Prisma 내부 Proxy 의 get trap 이 `tx` 프로퍼티 일반 접근을 가로채 subclass getter 를 **원본 타깃 T 바인딩**으로 호출한다(`Object.getPrototypeOf(prisma) !== PrismaService.prototype` 로 방증). 따라서 getter 내부 `this === T`(delegate 미보유) → fallback `(this as unknown as TxClient)` = T → `this.prisma.tx.<delegate>` = `undefined` → 비-트랜잭션 모든 read/write 가 `Cannot read properties of undefined` 로 실패.

- 영향: 14개 repository 의 `this.prisma.tx.X` **비-트랜잭션 경로 전부**(예: `AdminRepository.listAuditLogs`→SC-006, `AuthRepository.createUser`→회원가입 전체). 트랜잭션 내부 경로(ALS store 존재)는 `store.client` 를 반환하므로 **정상**(018 rate-limit/atomicity e2e 가 green 이었던 이유).

**수정 설계 (ADR-006 채택안 (a) — useFactory + 자기참조 setter)**:

`prisma.service.ts`:
```ts
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly als = new AsyncLocalStorage<TxContext>();
  private rootClient?: TxClient;   // 신규 — DI 관리 인스턴스(=Proxy P) 자기참조

  /** DI 팩토리가 생성 직후 Proxy 인스턴스를 주입한다(모델 delegate 보유). */
  registerRootClient(client: PrismaClient): void {
    this.rootClient = client as unknown as TxClient;
  }

  get tx(): TxClient {
    // 트랜잭션 내부: store.client (불변) / 외부: delegate 보유 Proxy(rootClient) 우선,
    // 미주입 환경(직접 instantiation 등)은 기존 fallback 으로 하위호환.
    return this.als.getStore()?.client ?? this.rootClient ?? (this as unknown as TxClient);
  }
  // onModuleInit·onModuleDestroy·onAfterCommit·runInTransaction 불변
}
```

`prisma.module.ts` — shorthand provider 를 useFactory 로 전환:
```ts
@Global()
@Module({
  providers: [
    {
      provide: PrismaService,
      useFactory: (): PrismaService => {
        const client = new PrismaService();   // = Proxy P (delegate 보유)
        client.registerRootClient(client);    // 자기참조(P) 주입
        return client;
      },
    },
  ],
  exports: [PrismaService],
})
export class PrismaModule {}
```

- **작동 원리**: 팩토리의 `client` 는 DI 가 repository 에 주입하는 바로 그 Proxy P(delegate 보유). `registerRootClient(client)` 로 인스턴스 저장소에 P 를 기록 → getter(내부 `this`=T)의 `this.rootClient` 는 동일 인스턴스 저장소에서 P 를 읽어 반환. 반환된 P 는 delegate 를 보유하므로 `tx.<delegate>` 정상.
- **하위호환(P-002/인터페이스 계약)**: `tx` 게터 시그니처·반환형(`TxClient`) 불변. 트랜잭션 내부 경로(`store.client`) 완전 불변. `rootClient` 미주입 경로(테스트에서 `new PrismaService()` 직접 생성 등)는 기존 `(this as unknown as TxClient)` fallback 유지 → 회귀 0. 14개 repository 코드 **무변경**.
- **[검증 위임]** Development 은 구현 후 런타임 검증 필수: (a) 비-트랜잭션 `prismaService.tx.<delegate>`(예: `.user`) 가 `undefined` 아님, (b) `runInTransaction` 내부에서 `tx` 가 여전히 `store.client` 반환, (c) `onModuleInit` 의 `$connect` 정상 동작(팩토리 인스턴스가 lifecycle hook 수신). Nest 는 useFactory 반환 인스턴스에도 `OnModuleInit`/`OnModuleDestroy` 훅을 호출한다.

#### 5-2. GAP-019-04 (Medium) — GET 목록/읽기 엔드포인트 전역 rate limit 충돌 (SC-010/017 unblock)

**결함 메커니즘 (5b Q1-c 확정 근거)**: `security.module.ts` 의 전역 `APP_GUARD`(`FlyThrottlerGuard`) + `ThrottlerModule.forRoot` default(`THROTTLE_DEFAULT_LIMIT=20`/60s, 018 도입)가 **모든** 엔드포인트에 적용된다. GET 목록/읽기 엔드포인트에 예외 데코레이터가 없어 브라우징·페이지네이션·perf e2e(100회 순차)·auth-recovery 스위트가 `429 Too Many Requests`. `list-p95.e2e-spec.ts`(017 SC-018)·`products.e2e-spec.ts`(SC-047)·`auth-recovery.e2e-spec.ts` 전부 429 → SC-010(회귀)·SC-017(전체 PASS) 차단.

**수정 설계 (ADR-007 채택안 — GET 읽기/목록 `@SkipThrottle` 예외)**:

`@nestjs/throttler` 의 `@SkipThrottle()` 를 **GET 읽기/목록 핸들러**에 적용한다. mutating(POST/PATCH/DELETE)·auth 엔드포인트의 기존 개별 임계값(`@Throttle` NFR-001~006) 및 전역 default 는 **불변**.

| 컨트롤러 | 파일 | 적용 대상 (GET 읽기/목록) | 적용 레벨 | mutating 잔존(strict 유지) |
|---|---|---|---|---|
| `CategoriesController` | `product.controller.ts` | `listCategories` (GET /categories) | 메서드 | — (읽기 전용 컨트롤러) |
| `SellerProductController` | `product.controller.ts` | `listMyProducts`(GET /sellers/me/products)·`getMyProductDetail`(GET /sellers/me/products/:id) | 메서드 | — (읽기 전용 컨트롤러) |
| `ProductController` | `product.controller.ts` | `listPublic`(GET /products)·`getDetail`(GET /products/:id) | **메서드 (혼재)** | `createProduct`·`updateProduct`·`publish`·`deactivate`·variants·images = default 20/60s 유지 |
| `AdminController` | `admin.controller.ts` | `listPendingSellers`(GET /admin/sellers/pending)·`listUsers`(GET /admin/users)·`listAuditLogs`(GET /admin/audit-logs) | **메서드 (혼재)** | `approveSeller`(POST) = default 20/60s 유지 |

- **혼재 컨트롤러 주의(ProductController·AdminController)**: 컨트롤러 레벨 `@SkipThrottle()` 는 같은 컨트롤러의 mutating 핸들러 rate limit 까지 제거하므로 **금지**. 반드시 **메서드 레벨**로 GET 읽기 핸들러에만 부착한다. 읽기 전용 컨트롤러(Categories·SellerProduct)도 일관성을 위해 메서드 레벨로 통일.
- **보안 근거 (P-001 rate limit 완화가 보안 약화 아님)**: 본 코드베이스 rate limit(throttle.constants NFR-001~006)의 1차 목적은 **인증·변경 남용**(brute-force·enumeration·자원 변경)의 차단이다. GET 읽기/목록은 **멱등 조회**로 그 위험 클래스에 속하지 않으며, 공개 읽기는 Fly.io 엣지/인프라 계층의 coarse 보호를, 인증 읽기(`sellers/me/*`·`admin/*`)는 JWT/AdminGuard 를 유지한다. 민감 작업(mutating·auth)의 strict 임계값은 전부 불변이므로 보안 약화 없음.
- **대안(검토·비채택)**: 완화된 `@Throttle` 상한(예: 300/60s 신규 상수) — 여전히 상한을 두어 방어심층 우위이나, perf e2e 가 동일 IP 로 여러 GET 스위트를 한 60s 윈도우에서 누적 실행하면 상한 초과로 **테스트 flakiness** 잔존 위험. GET 읽기의 위험 클래스가 낮고 SC-010/017 결정성이 우선이므로 `@SkipThrottle` 채택.

## 결정 기록 (ADRs)

| ADR-ID | 결정 항목 | 채택안 | 대안 (검토했으나 채택 안 함) | 근거 (spec FR/NFR 참조) | 영향 범위 |
|---|---|---|---|---|---|
| ADR-001 | cursor 목록 API 입력 검증 방식 | class-validator Query DTO(`@Type(()=>Number) @IsInt @Min(1) @Max(100)` / `@IsString @IsOptional`) 로 전환, 컨트롤러 수동 `parseInt` 제거 | (a) 컨트롤러 내 수동 `parseInt`+범위 검증 유지 — anti-pattern 근본 미해소 / (b) 파라미터별 `ParseIntPipe` — cursor·q·status 혼재 검증 일관성 저하 | FR-001~005, NFR-001. 기존 `ListProductsDto` 검증된 패턴 승계 | `main.ts`(기존 ValidationPipe 재사용), `admin.controller.ts`, `product.controller.ts`, 신규 DTO 2개 |
| ADR-002 | `forbidNonWhitelisted` 회귀 방지 — 엔드포인트별 DTO 분리 | 공유 `ListQueryDto`(cursor·limit) + `AdminSellerListQueryDto extends ListQueryDto`(status·q 추가). `admin/sellers/pending` 만 확장 DTO 사용 | 단일 `ListQueryDto` 전체 적용 — `admin/sellers/pending` 의 `status`·`q` 가 미선언 파라미터로 400 거부되어 **기존 유효 요청 회귀** | NFR-001, SC-006, SC-010. `main.ts` `forbidNonWhitelisted:true` 확인 근거 | 신규 DTO 2개, `admin.controller.ts` |
| ADR-003 | 인덱스 복합 컬럼 구성 | `Product [sellerId, createdAt Desc, id Desc]` / `Seller [status, createdAt Desc, id Desc]` — cursor 쿼리 정렬과 정합 | 단일 컬럼 `[sellerId]`·`[status]`(Task 초안) — WHERE 는 커버하나 `ORDER BY createdAt DESC, id DESC` 정렬 미커버 → sort 노드 잔존, cursor 안정성·확장성 열위 | FR-006/007, NFR-003, SC-007/008/009. 실 repository 쿼리(`listBySeller`·`listByStatusPaginated`) + 기존 Product 공개 인덱스 패턴 대조 | `schema.prisma`(Product·Seller), 신규 마이그레이션 1개 |
| ADR-004 | find-email 실패 감사 이벤트 | `SecurityAuditLogger.findEmailNotFound` 신규(내부 try/catch best-effort) + `AuthService.findEmail` 404 분기에 throw 이전 호출 | 컨트롤러/미들웨어 레벨 로깅 — PII 마스킹·도메인 컨텍스트 접근 어려움, 기존 3개 이벤트 패턴과 불일치 | FR-008/009/010, SC-011/012/013. 기존 `findEmailAccessed`·`maskPhone` 패턴 승계 | `security-audit.logger.ts`, `auth.service.ts` |
| ADR-005 | HTTP 요청 로그 토큰 redact | `LoggerModule` `pinoHttp.redact: ['req.headers.authorization','req.headers.cookie']` | 커스텀 pino serializer 로 헤더 재작성 — 과도, 표준 `redact` 옵션으로 충분 | FR-011/012, SC-014/015, NFR-004(로깅 설정만) | `app.module.ts` |
| ADR-006 | `PrismaService.tx` 비-트랜잭션 delegate 상실 fix (GAP-019-03, P0) | **useFactory + 자기참조 setter** — `prisma.module.ts` 팩토리가 `new PrismaService()`(=Proxy P, delegate 보유)를 `registerRootClient(client)` 로 인스턴스에 주입 → getter fallback 이 `this.rootClient`(=P) 반환. getter 시그니처·반환형·트랜잭션 내부 경로(`store.client`) 불변 | (a-대안) getter 내부에서 `this` 를 Proxy 로 재래핑 — Prisma Proxy 이중 래핑 취약·검증 불가 / (b) 생성자 내 자기참조 캡처(`this.rootClient=this`) — 동일 set-trap 의존이라 이점 없음, 팩토리보다 Nest lifecycle 결합 불명확 / (c) 14개 repo 를 `runInTransaction` 강제 래핑 — 대규모 변경·범위 초과 | 기존 SC-006(admin/audit-logs 200) unblock. Prisma 6.19.3 생성자 Proxy 래핑(5b Q1-a 확정) 대응. P-005 결제 트랜잭션 경로 회귀 0 필수 | `shared/prisma/prisma.service.ts`(수정), `shared/prisma/prisma.module.ts`(provider→useFactory), 14개 repository는 **무변경** |
| ADR-007 | GET 목록/읽기 엔드포인트 rate limit 예외 (GAP-019-04, Medium) | **`@SkipThrottle()` 메서드 레벨** — GET 읽기/목록 핸들러 9개에만 부착. 전역 default(20/60s)·mutating/auth 개별 임계값(NFR-001~006) 불변. 혼재 컨트롤러(Product·Admin)는 컨트롤러 레벨 금지·메서드 레벨 강제 | 완화된 `@Throttle` 상한(300/60s 등) — 상한 유지로 방어심층 우위이나 동일 IP 다중 GET 스위트 누적 시 테스트 flakiness 잔존(SC-010/017 결정성 저하) | 기존 SC-010(회귀 스위트)·SC-017(전체 100% PASS) unblock. 018 전역 rate limit 도입 시점 회귀(5b Q1-c 확정). 읽기=멱등 조회로 남용 위험 클래스 밖 → 보안 약화 아님 | `product.controller.ts`(Categories·SellerProduct·Product GET 5개), `admin.controller.ts`(GET 3개) |

> Design Agent research.md "기술 선택 조사" 절과 cross-reference. ADR 미작성 결정이 design 단계에 발견되면 status: BLOCKED 로 Planning 복귀.
> **ADR-006/007 은 v1.1 통합 수정 확장분** — 트랙 5 상세 설계 참조. 사용자 승인(pipeline-log 17:12) 하 편입.

## 인터페이스 계약

- **하위 호환성**: 4개 엔드포인트 모두 응답 구조·상태 코드 불변(NFR-001·SC-006). 유효 정수 `limit`·정상 `cursor`·`status`·`q` 는 전환 전과 동일 200. 변경은 "무효 입력(비정수/범위 밖) → 기존 500 가능 → 신규 400" 방향만.
- **핵심 방어 계약(ADR-002)**: `admin/sellers/pending` 의 `AdminSellerListQueryDto` 는 반드시 `status`·`cursor`·`limit`·`q` 4개를 모두 선언한다. 하나라도 누락 시 `forbidNonWhitelisted` 가 해당 파라미터 포함 기존 요청을 400 으로 거부 → NFR-001/SC-010 회귀. Development·Test 단계 필수 검증 지점.
- **서비스 레이어 불변**: `AdminService.listSellers/listUsers/listAuditLogs`, `ProductService.listMyProducts` 시그니처(`limit?: number`) 변경 없음. 클램프 로직 잔존(2중 방어).
- **감사 로거 best-effort 계약(FR-010)**: `findEmailNotFound` 내부 try/catch 로 예외 흡수. 호출부는 반환값 미사용(void). `findEmail` 404 흐름 무차단.
- **로깅 계약(NFR-004)**: pino redact 는 stdout 로그 스트림 직렬화에만 영향. JWT 검증·AdminGuard·rate limit 등 인증/인가 런타임 로직 무변경.
- **tx 접근 계약(ADR-006, 하위호환 핵심)**: `PrismaService.tx` 게터의 **시그니처(`get tx(): TxClient`)·반환 타입(`Prisma.TransactionClient`)** 불변. 14개 repository 의 `this.prisma.tx.<delegate>` 호출부 코드 **무변경**. 경로별 반환 계약:
  - 트랜잭션 내부(ALS store 존재): `store.client` 반환 — **완전 불변**(결제 `runInTransaction` 경로 회귀 0, P-005).
  - 트랜잭션 외부(store 부재): 기존 결함은 delegate 미보유 T 반환 → 수정 후 **delegate 보유 Proxy(rootClient=P)** 반환. "무효 → 정상 delegate 접근" 방향의 교정만이며 정상 호출부에는 무해(기존 동작 200 유지, 결함 경로만 500→200).
  - `rootClient` 미주입(비-DI 직접 instantiation, 일부 테스트): 기존 `(this as unknown as TxClient)` fallback 유지 → 회귀 0.
  - **Development·Test 필수 검증 지점**: 비-트랜잭션·트랜잭션 내부 양 경로의 delegate 접근이 모두 정상임을 런타임 확인(회귀 방지 unit 권장).
- **rate limit 예외 계약(ADR-007)**: GET 읽기/목록 9개 핸들러에 `@SkipThrottle()` 부착. **mutating(POST/PATCH/DELETE)·auth 엔드포인트의 기존 rate limit(전역 default 20/60s + 개별 `@Throttle` NFR-001~006)은 불변**. 혼재 컨트롤러(ProductController·AdminController)는 컨트롤러 레벨 적용 시 mutating 핸들러까지 예외되므로 **메서드 레벨 부착 강제**. 응답 구조·상태 코드 불변(200 유지, 429 회귀 제거).

### 권한 부여·상태 전이 엔드포인트 인가 3축 (PATCH-001/PROC-003)

> 본 spec 은 **권한 부여·승인·상태 전이 엔드포인트를 신규 추가·수정하지 않는다**(SellerService.approve·admin approve 경로 무변경). 대상은 전부 목록 **조회(read)** 엔드포인트이며 기존 가드가 유지된다. 최소 방어선으로 조회 엔드포인트의 인가 유지 상태만 명시한다.

| 엔드포인트 | (a) 호출자 신원(인증) | (b) 대상 자원 소유권 | (c) 역할(admin 등) | 비고 |
|---|---|---|---|---|
| `GET /admin/sellers/pending`·`/admin/users`·`/admin/audit-logs` | JwtAuthGuard | — (관리 조회) | AdminGuard(`ADMIN_USER_IDS`, fail-closed) | 본 spec 은 가드 무변경, 입력 DTO 검증만 추가 |
| `GET /sellers/me/products` | JwtAuthGuard | `user.userId` 스코핑(본인 상품만 조회) | — | 소유권은 서비스가 `user.userId` 로 필터, 무변경 |

## 데이터 모델

인덱스(비-컬럼) 추가만 — 컬럼·테이블·관계 변경 없음. `data-model.md` 분리 불요.

| 모델 | 스키마 | 변경 | 내용 |
|---|---|---|---|
| `Product` | `products` | `@@index` 추가 | `[sellerId, createdAt(sort: Desc), id(sort: Desc)]` (FR-006) |
| `Seller` | `users` | `@@index` 추가 | `[status, createdAt(sort: Desc), id(sort: Desc)]` (FR-007) |

## 테스트 전략

| SC | 테스트 수준 | 유형 | 시나리오 요약 | 입력 | 기대 결과 |
|---|---|---|---|---|---|
| SC-001 | 통합 | Error | `admin/sellers/pending` 비정수 limit | `GET /admin/sellers/pending?limit=abc` (admin JWT) | 400 |
| SC-002 | 통합 | Error | `admin/users` 비정수 limit | `GET /admin/users?limit=abc` | 400 |
| SC-003 | 통합 | Error | `admin/audit-logs` 비정수 limit | `GET /admin/audit-logs?limit=abc` | 400 |
| SC-004 | 통합 | Error | `sellers/me/products` 비정수 limit | `GET /sellers/me/products?limit=abc` (seller JWT) | 400 |
| SC-005 | 통합 | Edge | 4개 엔드포인트 경계값 하한/상한 초과 | 각 엔드포인트 `?limit=0`·`?limit=101` | 전부 400 |
| SC-006 | 통합 | Happy | 4개 엔드포인트 유효 limit — 회귀 없음 | 각 엔드포인트 `?limit=20`(+ status/q/cursor 정상) | 200 + 기존 응답 구조(`SellerProfile[]`/`{items,nextCursor}` 등) |
| SC-007 | static | Happy | Product 인덱스 존재 | `schema.prisma` 파싱 | `Product` 에 `sellerId` 선두 복합 인덱스 존재 |
| SC-008 | static | Happy | Seller 인덱스 존재 | `schema.prisma` 파싱 | `Seller` 에 `status` 선두 복합 인덱스 존재 |
| SC-009 | e2e-db | Happy | EXPLAIN 인덱스 스캔 | 로컬 PG(마이그레이션 적용 후) `EXPLAIN` — `WHERE sellerId=$1 ORDER BY createdAt DESC,id DESC` / `WHERE status=$1 ORDER BY createdAt DESC,id DESC` | Seq Scan 아님(Index Scan/Bitmap Index Scan) |
| SC-010 | 통합 | Happy | 인덱스 전후 회귀 없음 | `GET /sellers/me/products`·`/admin/sellers/pending` 기존 e2e | 응답 바디·상태 코드 동일 |
| SC-011 | unit | Error | 미등록 전화번호 find-email | `findEmail('01000000000')` (미존재) | `findEmailNotFound` 호출됨 + NotFoundException |
| SC-012 | unit | Happy | 신규 이벤트 마스킹 | SC-011 이벤트 로그 검사 | `maskPhone` 결과만(원본 전화번호 부재) |
| SC-013 | unit | Error | 로거 예외 best-effort | 로거 내부 throw mock | `findEmail` 정상 404 반환(차단 없음) |
| SC-014 | 통합 | Happy | Authorization 헤더 redact | Authorization 포함 요청 후 pino 로그 | 원본 토큰 부재 + redact 마커(`[Redacted]`) |
| SC-015 | 통합 | Happy | Cookie 헤더 redact | Cookie 포함 요청 후 pino 로그 | 원본 쿠키 부재 + redact 마커 |
| SC-016 | unit | Happy | 인증/인가 기존 테스트 회귀 없음 | `auth-required-guards.spec.ts`·rate-limit e2e | PASS 유지 |
| SC-017 | 통합 | Happy | 전체 스위트 회귀 없음 | 전체 unit·e2e·static | 100% PASS |

> **SC별 시나리오 3유형 커버 확인**: Happy(SC-006/007/008/009/010/012/014/015/016/017) · Edge(SC-005 경계값) · Error(SC-001/002/003/004 비정수, SC-011 미등록, SC-013 로거 예외). 3유형 전부 커버.

### 019 통합 수정 검증 (GAP-019-03/04 — 신규 SC 없음, 기존 SC unblock)

두 fix 는 신규 FR/SC 를 추가하지 않고 **기존 SC 를 unblock** 한다. 재검증 매핑:

| fix | 검증 SC (기존) | 검증 방식 | 회귀 방지 추가(권장) |
|---|---|---|---|
| ADR-006 tx getter | SC-006(admin/audit-logs 200)·SC-017(전체 PASS) | 5a `list-query-dto.e2e-spec.ts` SC-006 케이스(현재 FAIL → PASS 전환)·018 `auth.e2e-spec.ts` 회원가입 경로(현재 TypeError → PASS) | **targeted unit(신규 권장)**: 비-트랜잭션 컨텍스트에서 `prismaService.tx.<delegate>`(예: `.user`) 가 정의됨 + `runInTransaction` 내부에서 `store.client` 반환 유지. Development/Test 단계에서 회귀 방지용 추가. 파일 소유는 5a(테스트) — 실제 케이스명·배치는 Design tasks.md 가 결정 |
| ADR-007 rate limit | SC-010(회귀 스위트)·SC-017(전체 PASS) | `list-p95.e2e-spec.ts`(017 SC-018 100회 순차)·`products.e2e-spec.ts`(SC-047)·`auth-recovery.e2e-spec.ts` 429 → 200 전환. mutating/auth 엔드포인트 rate limit e2e(`rate-limit.e2e-spec.ts` 7/7)가 **불변 PASS 유지**됨을 확인(strict 임계값 회귀 없음) | — (기존 rate-limit e2e 가 mutating/auth strict 유지 회귀 커버) |

- **검증 순서 의존**: ADR-006 tx fix 가 선행 적용되지 않으면 018 회원가입 e2e·SC-006 이 계속 FAIL 하여 SC-017(전체 PASS) 불성립. 두 fix 모두 5b 재검증 이전 Development 단계에서 적용 필수.
- **SC-009(EXPLAIN, env:e2e-db)** 는 5b Q1-d 에서 소규모 데이터(9건/1건)로 planner 가 Seq Scan 선택함을 확인(인덱스는 `SET enable_seqscan=off` 시 정상 Index Scan) — 인덱스 구조는 정상이며 문면 미충족은 데이터 규모 제약. 본 통합 수정과 무관(트랙 2 결과 유지, coverage-gap.md (3)운영환경 확인 권장 이관됨).

### 통합/운영 검증 defer — 옵션 C (PATCH-A08 / PROC-010 / PROC-014)

- **옵션 결정**: spec.md §범위 외 "사후 운영 검증 피드백 사이클(PROC-014)" 에서 **옵션 C**(파이프라인 내 운영 환경 검증 스킵, 단위/정적/로컬 통합까지 수행) 채택 확정. 4개 변경 모두 로컬 개발 환경(Docker Compose PostgreSQL)+CI 에서 완결 검증 가능, 운영 배포 환경 의존 없음.
- **PROC-010 옵션 C 자가 점검**:
  1. **운영 환경 의존성 평가**: **N** — DTO 검증(통합), 인덱스(로컬 EXPLAIN SC-009), find-email 감사(unit), pino redact(통합) 전부 로컬 완결. 운영 토폴로지/외부 시스템 의존 없음. (운영 의존 항목 SEC-018-01 은 §범위 외로 명시 제외.)
  2. **mock 시뮬레이션 가능성**: SC-009 EXPLAIN 은 실 PostgreSQL 필요(mock 불가)이나 이는 **로컬 docker-compose PostgreSQL**(파이프라인 내 e2e 환경 — 기존 rate-limit/atomicity e2e 가 사용) 범위이며 운영 환경 아님. mock 불가 + 파이프라인 밖인 운영 시나리오 **없음**.
  3. **권장 옵션 재검토**: 1·2 모두 운영 의존 부재 → 옵션 C 정당. 추가 운영 모니터링은 spec PROC-014 로 이관(신규 위험 낮음).
- **SC-009([env:e2e-db]) 실행 경로**: 로컬 PostgreSQL 에 신규 마이그레이션 적용 후 `EXPLAIN` 2건 실행(Test Agent EXECUTION 또는 Performance Agent). 파이프라인 내 실행 가능.
- **PROC-014 사후 피드백 사이클**: spec.md §범위 외 절에 사후 점검 시나리오 (a)~(d) 및 결함 발견 시 처리 절차(hotfix spec → 1단계 재진입, `_ai-workspace/cycle-N-archive/` 백업) 기재됨. 별도 전담 점검 일정 없이 차기 운영 배포(Stage 4+) 일반 모니터링으로 갈음(사용자 합의).

### smoke_tests (선택)

- 필요 여부: **N** — 변경이 SC 매핑 범위(4개 엔드포인트·2개 인덱스·find-email·pino)로 국한되며 SC-010/SC-016/SC-017 이 회귀(기존 e2e·인증 가드·전체 스위트)를 이미 포괄한다. 별도 smoke 경로 불요.

## 기타 고려사항

- **`status` 검증 수준(ADR-002)**: `AdminSellerListQueryDto.status` 는 `@IsEnum(SellerStatus)` 가 아닌 `@IsString @IsOptional` 로 둔다 — 현재 서비스 레이어가 status 문자열 파싱/기본값(PENDING) 처리를 담당하며, `@IsEnum` 도입 시 기존 무효 status 처리 동작이 400 으로 바뀌어 범위 외 동작 변경(P-007)이 된다. 입력 검증 강화는 `limit`(NaN·범위) 로 한정한다.
- **미검증 외부 enum/상수 마커(PATCH-002)**: 본 plan 코드 예시의 값은 전부 실코드/설정 확인분(`SellerStatus`·`FilePurpose` 등 미검증 enum 리터럴 미사용). `[TO-VERIFY]` 마커 없음.
- **마이그레이션 인덱스명**: 위 SQL 의 인덱스명(`products_sellerId_createdAt_id_idx` 등)은 Prisma 자동 생성 예상형이다. 실제 명은 `prisma migrate dev` 산출물이 SoT — SC-007/008 은 인덱스 **존재·선두 컬럼**을 검사하므로 자동 생성명과 무관하게 충족.
- **GAP-005-03(마이그레이션 드리프트, accepted)**: 신규 마이그레이션은 기존 16차 위에 순차 누적되며 드리프트와 무관(신규 CREATE INDEX 만). 기존 accepted 결정 유지.
- **동시성/캐싱**: 트랙 1~4 는 공유 상태·캐시·레이스 컨디션 신규 도입 없음(순수 입력 검증·인덱스·로깅). ADR-006 의 `rootClient` 는 **부트스트랩 시 팩토리가 1회 write** 후 read-only(요청 처리 중 변경 없음) — Node 단일 스레드 + 부트스트랩 단계 단일 실행이므로 레이스 컨디션 없음. 트랜잭션별 격리는 기존 `AsyncLocalStorage`(요청/트랜잭션 스코프)가 담당하며 불변. ADR-007 은 데코레이터 메타데이터 부착으로 런타임 상태 무관.
- **ADR-006 useFactory lifecycle 확인 위임**: Nest 는 useFactory 반환 인스턴스에도 `OnModuleInit`/`OnModuleDestroy` 훅을 호출하므로 `$connect`/`$disconnect` 정상 동작(Development 런타임 검증 항목). 팩토리 반환 인스턴스는 Proxy P 이며, Nest 가 P 를 통해 lifecycle 메서드를 호출한다.
- **사전 결함의 출처(P-007 추적성)**: GAP-019-03 은 003-commerce(`c1f1618`)부터, GAP-019-04 는 018 전역 rate limit 도입부터 잠재. 둘 다 base commit(62d14f9) 대비 019 미변경 파일이었으나 019 가 회귀 검증 매개체(list-p95·SC-006)로 재사용하며 표면화. 사용자 승인으로 019 통합.
