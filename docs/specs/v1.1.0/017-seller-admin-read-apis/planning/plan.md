---
작성: Planning Agent
버전: v1.0
최종 수정: 2026-07-03 [시각 미확인, spawn 기준 22:58 — Bash 도구 미제공]
상태: 검토중
---

# Plan: 017-seller-admin-read-apis

> Branch: 017-seller-admin-read-apis | Date: 2026-07-03 | Spec: [../spec/spec.md](../spec/spec.md)

## 목차

- [사전 검증 (Constitution Gates)](#사전-검증-constitution-gates)
- [기술 컨텍스트](#기술-컨텍스트)
- [핵심 설계](#핵심-설계)
- [결정 기록 (ADRs)](#결정-기록-adrs)
- [인터페이스 계약](#인터페이스-계약)
- [데이터 모델](#데이터-모델)
- [테스트 전략](#테스트-전략)
- [기타 고려사항](#기타-고려사항)

---

## 사전 검증 (Constitution Gates)

> `.claude/docs/constitution.md`(P-001~007) 조항을 그대로 Gates 로 사용한다. spec.md NFR 이 constitution 보다
> 강화된 경우(예: NFR-004 = P-001 모듈 경계 강화)는 spec 기준을 사용한다.

- [x] **P-001 모듈 경계 원칙**: [Pass 기준: 각 모듈이 자기 스키마 테이블에만 접근하고 타 도메인 데이터는 공개 서비스 DI 로만 획득]
  - FR-010~012(위시리스트·최근 본 상품 상품 요약)는 user 모듈이 products 스키마를 직접 쿼리하지 않고
    `ProductService.getPublicSummaries()`(신규 공개 메서드) DI 로만 조회한다. NFR-004·SC-021 로 정적 검증.
  - admin 판매자 목록은 `SellerService.listSellers()`(공개 메서드) DI 경유(admin→seller 기존 패턴 승계).
  - 4계층(controller·service·repository·events) 구조 유지. **PASS**
- [x] **P-002 AWS 의존 금지 원칙**: [Pass 기준: AWS 전용 SDK/서비스 신규 의존 0건]
  - 본 spec 은 기존 조회 로직 확장만 포함. 신규 패키지 의존 0. **해당 없음(자동 PASS)**
- [x] **P-003 단일 DB 원칙**: [Pass 기준: 단일 PostgreSQL 외 외부 저장소 추가 0건]
  - 신규 외부 저장소·캐시·큐 없음. **해당 없음(자동 PASS)**
- [x] **P-004 클라우드 중립 원칙**: [Pass 기준: Fly.io 전용 API 비즈니스 로직 결합 0건]
  - 순수 backend 인-프로세스 조회 로직. **해당 없음(자동 PASS)**
- [x] **P-005 결제·정산 정합성 원칙**: [Pass 기준: 결제·환불·정산 상태 변경 outbox+멱등 처리]
  - 결제·정산 도메인 무변경. inventory stock-in 은 금전 아님(수량). **해당 없음(자동 PASS)**
- [x] **P-006 테스트 원칙**: [Pass 기준: SC-XXX 없는 FR-XXX 0건]
  - FR-001~012 전부 SC 매핑 존재(요구사항 구조화 매트릭스). NFR-001~004 도 SC-018~021 매핑. **PASS**
- [x] **P-007 스펙 범위 원칙**: [Pass 기준: spec.md 범위 외 변경 파일 0건]
  - BE-GAP-006 envelope 통일은 신규 2개 목록(관리자 판매자·판매자 상품)에 한정(categories 배열 유지, ASM-004).
  - console(프론트) 배선·신규 마이그레이션·worker 프로세스는 범위 외 명시. **PASS**

예외 사항: 없음.

> Gates 전건 통과. Design Agent 진입 가능.

---

## 기술 컨텍스트

- **언어 / 런타임**: TypeScript / Node.js (NestJS 모듈러 모놀리스, `apps/backend`)
- **주요 의존성**: NestJS(`@nestjs/common`·`@nestjs/swagger`·`@nestjs/event-emitter`), Prisma Client(`@prisma/client`), PostgreSQL 16. **신규 의존 0건**(기존 스택·컨벤션 승계).
- **테스트 프레임워크**: Jest(`*.spec.ts` 단위, 255 unit PASS 기존) + e2e/static suite. 본 spec SC 는 대부분 `[env:unit]`, SC-018 만 `[env:integration]`, SC-021 만 `[env:static]`.
- **승계 컨벤션(코드 실검증 완료)**:
  - cursor 페이지네이션: `orderBy [createdAt desc, id desc]` + `cursor {id}` + `skip: cursor?1:0` + `take` + `nextCursor = rows.length===take ? rows.last.id : null` (product `listPublic`·user `listPaginated` 동일 패턴).
  - 소유권 검증: `ProductService.assertOwner(userId, product.sellerId)` — 존재하지 않으면 상위에서 `NotFoundException`(404), 소유 불일치면 `ForbiddenException`(403).
  - 페이지 상수: 모듈별 constants 파일(`product.constants.ts` 20/100, `admin.constants.ts` DEFAULT/MAX_USER_PAGE_LIMIT 20/100).
  - 응답 DTO: `@ApiProperty` 문서 전용 클래스(런타임 변환 없음, Prisma 엔티티 직결). 금전 필드는 Decimal→JSON 문자열(P-005).

### 외부 라이브러리 동작 검증 (§10)

신규 외부 라이브러리·API 도입 없음. 모든 변경은 기존 Prisma Client(`findMany` cursor·`findUnique` include)·NestJS DI 의 이미 검증된 동작 범위 내이며, 본 spec 에서 새로 의존하는 미검증 외부 동작은 없다. → **silent failure 한계 명시 대상 없음.**

### 배포 환경 영향 (PROC-009)

본 spec 은 순수 backend 인-프로세스 조회 로직 확장으로 컨테이너 NAT·L4 LB·keepalive 등 운영 토폴로지 특이성에 의존하지 않는다(infra.md 운영 환경 절 cross-reference 결과 영향 없음). 단, FR-007(목록 envelope 통일)·FR-008~009(재고 응답 구조화)는 **응답 계약 breaking change** 이므로 console 배포 순서 의존성이 존재한다 → spec "범위 외 §배포 순서 고려사항" 및 아래 기타 고려사항 참조(운영 위험 아님, 클라이언트 동기 배포 이슈).

---

## 핵심 설계

> 작성 깊이: Design Agent 가 추가 설계 판단 없이 tasks.md 를 분해할 수 있는 수준. 변경 대상 모듈·시그니처·핵심 분기 명시.

### 1. admin/seller 모듈 — 관리자 판매자 목록 확장 (FR-001~003, FR-007)

기존 `GET /admin/sellers/pending`(`AdminController.listPendingSellers`)을 **확장**한다(ASM-002, 사용자 확정). 라우트 경로는 유지하고 query 파라미터 4종을 추가한다.

- **Controller** (`admin.controller.ts`): `listPendingSellers` → 시그니처 확장.
  ```ts
  @Get('sellers/pending')
  async listPendingSellers(
    @Query('status') status?: string,   // 'PENDING' | 'APPROVED' | 'REJECTED', 미지정 → PENDING
    @Query('cursor') cursor?: string,
    @Query('limit') limit?: string,
    @Query('q') q?: string,             // businessName 부분 일치
  )
  ```
  - `status` 파싱: 유효 `SellerStatus` enum 값만 허용, 미지정 시 `SellerStatus.PENDING`(하위 호환, SC-003). 유효하지 않은 값 → `BadRequestException`(400).
- **AdminService** (`admin.service.ts`): 신규 `listSellers(status, cursor, limit, q)` → `{ items, nextCursor }`. `limit` 은 `1..MAX_SELLER_PAGE_LIMIT` 클램프(기존 `listUsers` 패턴 동일).
- **SellerService** (`seller.service.ts`): 신규 공개 메서드 `listSellers({ status, cursor, take, q }): Promise<{ items: SellerProfile[]; nextCursor: string | null }>`. 기존 `listByStatus(status)`(admin/stats 소비 중)는 **유지**(비파괴).
- **SellerRepository** (`seller.repository.ts`): 신규 `listByStatusPaginated({ status, cursor, take, q })`:
  ```ts
  where: { status, ...(q ? { businessName: { contains: q, mode: 'insensitive' } } : {}) },
  orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
  cursor: cursor ? { id: cursor } : undefined,
  skip: cursor ? 1 : 0,
  take,
  ```
- **상수**: `admin.constants.ts` 에 `DEFAULT_SELLER_PAGE_LIMIT = 20`, `MAX_SELLER_PAGE_LIMIT = 100` 신설(ASM-006 — 기존 20/100 관례 승계, 모듈별 상수 패턴).
- **응답 형태 변경**: `SellerProfile[]` → `{ items, nextCursor }`(FR-007). 이는 breaking change 이나 console `admin/sellers` 화면 미배선(플레이스홀더)으로 회귀 없음(spec 범위 외 §배포 순서).
- **DTO**: `admin-response.dto.ts` 에 `AdminSellerListResponse { items: SellerProfileResponse[]; nextCursor: string | null }` 신설.

### 2. seller/product 모듈 — 판매자 상품 상세 (FR-004, FR-005)

신규 엔드포인트 `GET /sellers/me/products/:id`(소유 상품 상태 무관 상세, variants+images 포함).

- **Controller** (`SellerProductController` in `product.controller.ts`): 신규 라우트.
  ```ts
  @Get('products/:id')
  getMyProductDetail(@CurrentUser() user, @Param('id') productId: string)
  ```
- **ProductService** (`product.service.ts`): 신규 `getMyProductDetail(userId, productId)`:
  ```ts
  const product = await this.productRepository.findById(productId); // images+variants include 재사용
  if (!product) throw new NotFoundException('Product not found');    // SC-009 (404)
  await this.assertOwner(userId, product.sellerId);                  // SC-008 (403)
  return product;
  ```
  - **분기 순서 고정**: 존재 확인(404) → 소유권(403). 기존 `updateProduct`·`publish` 동일 순서(ASM-001).
  - `assertOwner` → `getApprovedSeller(userId)` 가 미승인 판매자 시 403(FR-004 "승인된 판매자" 전제와 정합).
- **DTO**: 기존 `ProductDetailResponse`(images+variants 포함) 재사용. 신규 DTO 불필요.

### 3. seller/product 모듈 — 판매자 상품 목록 페이지네이션 (FR-006, FR-007)

기존 `GET /sellers/me/products`(`listMyProducts`)에 cursor·limit 추가 + envelope 화.

- **Controller** (`SellerProductController`): 시그니처 확장 `@Query('cursor')`·`@Query('limit')`.
- **ProductService**: `listMyProducts(userId, cursor?, limit?)` → `{ items, nextCursor }`. limit 클램프(`DEFAULT_PAGE_LIMIT`/`MAX_PAGE_LIMIT` 재사용 — 동일 product 모듈 상수).
- **ProductRepository** (`product.repository.ts`): `listBySeller(sellerId, cursor?, take?)` 확장:
  ```ts
  where: { sellerId },
  orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],   // id 2차키 추가(cursor 안정성)
  cursor: cursor ? { id: cursor } : undefined,
  skip: cursor ? 1 : 0,
  take,
  ```
  - variants/images include 는 목록에 불필요(상세 FR-004 전용). 목록은 상품 요약만.
- **응답 형태 변경**: 배열 → `{ items, nextCursor }`(FR-007). console `seller/products` **배선됨** → 배포 동기화 필요(spec 범위 외 §배포 순서, 기타 고려사항).
- **DTO**: 기존 `ProductListResponse`(items: ProductSummaryResponse[], nextCursor) 재사용.

### 4. inventory 모듈 — 재고 응답 구조화 (FR-008, FR-009)

- **InventoryService** (`inventory.service.ts`):
  - `getStock(variantId): Promise<number>` **유지**(내부 재사용 안전 — cart/order 는 `checkAvailability`·`decreaseStock` 사용, getStock 은 컨트롤러 전용이나 이름 보존).
  - 신규 `getStockView(variantId): Promise<InventoryStockView>` → `{ variantId, stock: await getStock(variantId) }`.
  - `stockIn(variantId, quantity): Promise<void>` → `Promise<InventoryStockView>` 로 변경. increment·appendLog·onAfterCommit 이후 갱신 수량 재조회 후 반환:
    ```ts
    await this.inventoryRepository.increment(variantId, quantity);
    // ...appendLog, onAfterCommit(emitStockChanged)...
    const updated = await this.inventoryRepository.findByVariant(variantId);
    return { variantId, stock: updated?.quantity ?? 0 };
    ```
  - **상태 코드 불변**(ASM-003): `POST .../stock-in` 은 `@HttpCode(OK)`=200 유지, `GET .../stock` 200 유지. 계약은 body 확장(void→객체 / number→객체)만.
- **Controller** (`inventory.controller.ts`): `getStock` 라우트 → `getStockView` 호출, `stockIn` 라우트 → 반환값 그대로 전달.
- **DTO**: `inventory/dto/` 에 `InventoryStockResponse { variantId: string; stock: number }` 신설.
- **인터페이스**: `InventoryStockView { variantId: string; stock: number }` (service 반환 타입).

### 5. user 모듈 — 위시리스트·최근 본 상품 요약 (FR-010~012, NFR-004)

user 모듈이 `ProductService.getPublicSummaries()`(신규 공개 메서드) DI 로 상품 요약을 조회하여 각 항목에 인라인 병합한다(별도 batch-summary 엔드포인트 신설 아님 — ASM/범위 외 HOW 위임 결정).

- **ProductService** (`product.service.ts`): 신규 공개 메서드
  ```ts
  async getPublicSummaries(productIds: string[]): Promise<Map<string, ProductSummaryView>>
  ```
  - `ProductSummaryView = { productId: string; title: string; price: Prisma.Decimal; thumbnailUrl: string | null }`.
  - 조회 가능(ACTIVE·OUT_OF_STOCK) 상품만 Map 에 포함. DRAFT·INACTIVE·삭제·미존재는 Map 에서 **누락**(호출 측이 productAvailable:false 판정).
  - `thumbnailUrl` = 이미지 `displayOrder asc` 첫 항목 url, 없으면 null.
- **ProductRepository**: 신규 `findPublicSummariesByIds(ids: string[])`:
  ```ts
  where: { id: { in: ids }, status: { in: [ACTIVE, OUT_OF_STOCK] } },
  include: { images: { orderBy: { displayOrder: 'asc' }, take: 1 } },
  ```
  - 단일 쿼리(`in`)로 N+1 회피(NFR-001 정합).
- **UserService** (`user.service.ts`): `listWishlist`·`listRecentViews` enrichment:
  ```ts
  const rows = await this.userRepository.findWishlistsByUser(userId);
  const summaries = await this.productService.getPublicSummaries(rows.map(r => r.productId));
  return rows.map(r => {
    const s = summaries.get(r.productId);
    return { ...r, productAvailable: !!s, product: s ? { title, price, thumbnailUrl } : null };
  });
  ```
  - `listRecentViews` 동일 패턴(ProductView 행).
  - **ASM-005 확정**: 조회 불가 항목은 제외하지 않고 유지, `productAvailable: false` + `product: null`.
- **UserModule** (`user.module.ts`): `imports` 에 `ProductModule` 추가(신규 DI). **순환 참조 없음** — ProductModule 은 UserModule 을 import 하지 않음(product.viewed 이벤트는 EventEmitter2 전역 경유이며 모듈 import 아님). DI 그래프: `user → product → {seller, inventory(forwardRef)}`, `admin → user → product`. cycle 없음(코드 실검증 완료).
- **UserRepository**: **변경 없음**(users 스키마 전용 유지 — NFR-004·SC-021 정적 검증 통과 조건).
- **DTO** (`user-response.dto.ts`): `WishlistResponse`·`RecentViewResponse` 에 필드 추가:
  ```ts
  @ApiProperty() productAvailable!: boolean;
  @ApiProperty({ required: false, nullable: true, type: () => WishlistProductSummary })
  product?: WishlistProductSummary | null;   // { title, price(문자열), thumbnailUrl }
  ```
  - `WishlistProductSummary { title: string; price: string; thumbnailUrl: string | null }` 신설(price 는 Decimal 직렬화 문자열, P-005).

---

## 결정 기록 (ADRs)

| ADR-ID | 결정 항목 | 채택안 | 대안 (검토했으나 채택 안 함) | 근거 (spec FR/NFR 참조) | 영향 범위 |
|---|---|---|---|---|---|
| ADR-001 | 관리자 판매자 목록 API 형태 | 기존 `GET /admin/sellers/pending` 확장(status·cursor·limit·q query 추가, status 미지정→PENDING 하위호환) | (a) 신규 `GET /admin/sellers` 별도 엔드포인트 / (b) 기존 유지 + 신규 병존 | FR-001·002·003, ASM-002(사용자 확정), NFR-003 AdminGuard 승계 | `admin.controller/service`, `seller.service/repository`, `admin.constants`, `admin-response.dto` |
| ADR-002 | seller 상품 상세 조회 경로 | 신규 `GET /sellers/me/products/:id` (findById 재사용 + assertOwner) | (a) 공개 `GET /products/:id` 에 소유자 분기 추가 / (b) `listBySeller` 에 variants include | FR-004·005, ASM-001(assertOwner 404→403 순서) | `product.controller/service` |
| ADR-003 | 404/403 분기 순서 | 존재 확인(404) → 소유권 확인(403) | 소유권 우선(존재 노출 최소화) | FR-005, SC-008/009, ASM-001 (기존 updateProduct 패턴 일관) | `product.service.getMyProductDetail` |
| ADR-004 | 판매자 상품 목록 페이지네이션 | 기존 `GET /sellers/me/products` 에 cursor·limit·envelope 추가(`listBySeller` orderBy 에 id 2차키 추가) | offset 페이지네이션 | FR-006·007, NFR-001, cursor 관례(context §5 ADR-007) | `product.controller/service/repository` |
| ADR-005 | 재고 응답 구조화 방식 | service 레벨 `{ variantId, stock }` shaping(`getStockView` 신설, `stockIn` 반환 변경, `getStock(number)` 내부 보존) | controller 레벨 매핑 / getStock 자체 반환형 변경 | FR-008·009, ASM-003(상태코드 200 불변) | `inventory.service/controller`, `inventory/dto` |
| ADR-006 | 위시리스트·최근본상품 상품 요약 획득 | user→product `ProductService.getPublicSummaries()` DI inline enrichment(단일 `in` 쿼리) | (a) 신규 `POST /products/batch-summary` 엔드포인트 재사용 / (b) user repo 직접 products 조인 | FR-010·011·012, NFR-004(P-001 모듈경계·SC-021 정적) | `user.module/service/dto`, `product.service/repository` |
| ADR-007 | 조회 불가 상품 항목 처리 | 항목 유지 + `productAvailable:false` + `product:null`(무음 제외 아님) | 무음 필터링(목록에서 제거) | FR-012, ASM-005(사용자 확정 — 데이터 유실 오인 방지), SC-016/017 | `user.service`, `user-response.dto` |
| ADR-008 | 페이지네이션 상수 위치 | `admin.constants.ts` 에 `DEFAULT/MAX_SELLER_PAGE_LIMIT`(20/100) 신설, product 목록은 기존 `product.constants` 재사용 | product.constants 를 admin 에서 cross-import | FR-002·006, ASM-006(20/100 관례 승계, 모듈별 상수 패턴) | `admin.constants` |

> 본 표는 Design Agent 의 research.md "기술 선택 조사" 절과 cross-reference 한다. 계정 자동연동·병합 정책 변경(PATCH-015-02) 은 본 spec 범위 아님(auth 무변경).

---

## 인터페이스 계약

### 하위 호환성 요약

| 엔드포인트 | 변경 | 하위 호환 | 방어 |
|---|---|---|---|
| `GET /admin/sellers/pending` | query(status·cursor·limit·q) 추가, 응답 `[]`→`{items,nextCursor}` | 요청 하위호환(status 미지정→PENDING). 응답 breaking | console admin/sellers 미배선 → 회귀 없음. status 유효성 400 가드 |
| `GET /sellers/me/products/:id` | 신규 | N/A(신규) | 404→403 분기, 미승인 판매자 403 |
| `GET /sellers/me/products` | query(cursor·limit) 추가, 응답 `[]`→`{items,nextCursor}` | 응답 breaking | **console seller/products 배선됨 → 동기 배포 필수** |
| `GET /inventory/:variantId/stock` | 응답 `number`→`{variantId,stock}` | 응답 breaking | console 재고 조회부 동기 배포. 상태코드 200 불변 |
| `POST /inventory/:variantId/stock-in` | 응답 `void`→`{variantId,stock}` | additive(기존 body 미사용) | 상태코드 200 불변(ASM-003) |
| `GET /users/me/wishlist` | 항목에 `productAvailable`·`product` 추가 | additive(기존 필드 유지) | 상품 조회 불가 시 product:null |
| `GET /users/me/recent-views` | 항목에 `productAvailable`·`product` 추가 | additive(기존 필드 유지) | 동일 |

### 권한 부여·소유권 엔드포인트 인가 3축 (PATCH-001 / PROC-003)

> 본 spec 은 상태 전이(approve/reject)를 신규 추가하지 않으나, 소유권 기반 조회(FR-004/005)와 admin 전용 조회(FR-001~003)가 IDOR·권한 우회 표면이므로 3축을 명시한다.

| 엔드포인트 | (a) 호출자 신원(인증) | (b) 대상 자원 소유권 | (c) 역할(admin 등) | 미검증 축 위험·후속 |
|---|---|---|---|---|
| `GET /admin/sellers/pending`(확장) | JWT(JwtAuthGuard) | — (전체 판매자 대상 관리 조회) | AdminGuard(ADMIN_USER_IDS, fail-closed) | 없음 — NFR-003·SC-020 로 403 검증. `q`·`status` 는 Prisma 파라미터화(인젝션 무위험) |
| `GET /sellers/me/products/:id` | JWT | assertOwner(seller.id===product.sellerId) → 403 | 판매자 승인(getApprovedSeller) → 미승인 403 | 없음 — FR-005·SC-008/009 로 403/404 검증. 타 판매자 상품 조회 차단(IDOR 방어) |
| `GET /sellers/me/products` | JWT | `where: { sellerId }`(본인 seller 범위 한정) | 판매자 승인 | 없음 — 본인 소유 상품만 반환 |
| `GET /inventory/:variantId/stock`·`stock-in` | JWT | assertSellerOwnsVariant(기존) → 403 | 판매자 승인 | 없음 — 기존 SEC-002 방어 승계(응답 형태만 변경) |
| `GET /users/me/wishlist`·`recent-views` | JWT | `where: { userId }`(본인 범위) | — | 없음 — 본인 데이터만. 상품 요약은 공개(ACTIVE/OUT_OF_STOCK) 정보만 노출(DRAFT 상세 미노출) |

### 신규 공개 서비스 메서드 계약 (모듈 간 DI)

- `SellerService.listSellers({ status, cursor, take, q }): Promise<{ items: SellerProfile[]; nextCursor: string | null }>` — admin 소비.
- `ProductService.getPublicSummaries(productIds: string[]): Promise<Map<string, ProductSummaryView>>` — user 소비. 빈 배열 입력 시 빈 Map 반환(방어). 조회 가능 상품만 포함.
- `InventoryService.getStockView(variantId): Promise<InventoryStockView>`, `stockIn(...): Promise<InventoryStockView>` — controller 소비.

---

## 데이터 모델

**신규 Prisma 마이그레이션 없음.** 모든 변경은 기존 테이블·컬럼 범위 내 응답 DTO/조회 로직 확장이다(spec 범위 외 명시). 참조 테이블:

- `users.sellers`(status·businessName — 상태 필터·검색), `products.products`(status·title·price), `products.product_images`(displayOrder — thumbnail), `products.variants`(상세 include), `products.inventory`(quantity), `users.wishlists`·`users.product_views`(productId plain String, cross-schema — P-001).

> cross-schema plain String 참조 특성상 위시리스트·최근 본 상품의 productId 가 삭제된 상품을 가리킬 수 있다(고아 참조, context §6 알려진 제약). 이는 FR-012·ADR-007 의 productAvailable:false 처리로 흡수된다.

---

## 테스트 전략

> 테스트 수준: 대부분 단위(service·controller). SC-018 만 통합(앱 기동·측정), SC-021 만 정적(코드 검사).

| SC | 수준 | 유형 | 시나리오 요약 | 입력 | 기대 결과 |
|---|---|---|---|---|---|
| SC-001 | 단위 | Happy | status=PENDING 판매자 목록 조회 | status='PENDING', 혼합 상태 판매자 | PENDING 상태만 items 에 포함 |
| SC-002 | 단위 | Happy | status=APPROVED 조회 | status='APPROVED' | APPROVED 상태만 반환 |
| SC-003 | 단위 | Edge | status 미지정(하위호환) | status=undefined | 기존과 동일 PENDING 만 반환 |
| SC-004 | 단위 | Edge | limit 지정·페이지 경계 | limit=2, 판매자 3건 | items ≤2, 다음 페이지 존재 시 nextCursor≠null, 마지막 페이지 nextCursor=null |
| SC-005 | 단위 | Happy | businessName 부분 일치 검색 | q='마켓' | businessName 에 '마켓' 포함 판매자만 반환 |
| SC-006 | 단위 | Happy | 소유 DRAFT 상품 상세 | 본인 DRAFT productId | variants·images 포함 응답 |
| SC-007 | 단위 | Edge | 소유 ACTIVE/OUT_OF_STOCK/INACTIVE 상세 | 각 상태 본인 productId | 동일하게 variants·images 포함 |
| SC-008 | 단위 | Error | 타인 소유 상품 상세 시도 | 타 판매자 productId | 403 Forbidden |
| SC-009 | 단위 | Error | 미존재 상품 ID 상세 시도 | 존재하지 않는 id | 404 NotFound |
| SC-010 | 단위 | Edge | 판매자 상품 목록 페이지네이션 | limit=2, 본인 상품 3건 | items ≤2, nextCursor 로 다음 페이지 표현 |
| SC-011 | 단위 | Happy | envelope 형태 검증 | FR-002·006 응답 | 두 응답 모두 {items, nextCursor} 필드 보유 |
| SC-012 | 단위 | Happy | 재고 조회 구조화 | 본인 소유 variantId | 응답에 variantId·stock 필드 |
| SC-013 | 단위 | Happy | 재고 입고 구조화 | 본인 variantId, quantity=5 | 응답에 variantId·입고 후 갱신 stock |
| SC-014 | 단위 | Happy | 위시리스트 ACTIVE 상품 요약 | ACTIVE 상품 담긴 위시리스트 | 각 항목 title·price·thumbnailUrl 포함, productAvailable=true |
| SC-015 | 단위 | Happy | 최근 본 상품 요약 | ACTIVE 상품 조회 이력 | 각 항목 title·price·thumbnailUrl 포함 |
| SC-016 | 단위 | Edge | 위시리스트 삭제/DRAFT 상품 | 삭제·DRAFT/INACTIVE 상품 담김 | 항목 유지, productAvailable=false, product=null |
| SC-017 | 단위 | Edge | 최근 본 상품 조회 불가 항목 | 조회 불가 상품 이력 | 항목 유지 + productAvailable=false |
| SC-018 | 통합 | Happy | 목록 API P95 측정 | 1,000건 미만, 로컬 docker-compose | P95 ≤ 500ms |
| SC-019 | 단위 | Error | 무효/부재 JWT | 401 대상 신규·확장 엔드포인트 | 401 Unauthorized |
| SC-020 | 단위 | Error | 비관리자 admin 목록 시도 | ADMIN_USER_IDS 외 사용자 | 403 Forbidden |
| SC-021 | 정적 | Happy | user 모듈 products 직접 참조 없음 | user Repository/Service 코드 | products Prisma 모델 직접 참조 0, ProductService DI 만 호출 |

> **SC별 시나리오 유형 커버리지**: FR-001(SC-001 Happy·SC-003 Edge), FR-005(SC-008 Error 403·SC-009 Error 404) 로 Happy/Edge/Error 3유형이 관련 FR 전반에 분산 커버됨. 조회 성공 계열(FR-004/006/008~011)은 Happy+Edge 중심, 거부 계열(FR-005, NFR-002/003)은 Error 중심. Error 축이 없는 순수 조회 FR(FR-002/003/006/007/008~011)은 NFR-002(SC-019 401)·NFR-003(SC-020 403)이 공통 인증·인가 Error 를 보강한다.

### SC-018 통합/성능 검증 defer 결정 (PATCH-A08 / PROC-010)

SC-018(P95 측정)은 `[env:integration]` 으로 앱 기동 + docker-compose PostgreSQL + 부하 데이터가 필요하다. main session 이 아래 옵션 중 사용자 결정을 수집한다:

- **옵션 A (권장)**: main session 이 환경 구성 절차 제시 → 사용자 실행 → 결과 전달 → Test Agent 검증.
- **옵션 B**: 사용자가 직접 환경 구축 + 측정 실행 + 결과 전달.
- **옵션 C**: 측정 스킵(단위 + 정적 검증만으로 마감).

**PROC-010 자가 점검**:
1. **운영 환경 의존성**: N — cursor 페이지네이션 성능은 배포 토폴로지·외부 시스템에 의존하지 않고 로컬 PostgreSQL 인덱스·쿼리 플랜에만 의존. 기존 `listPublic`·`listUsers` 동일 패턴이 002 에서 이미 NFR-001 통과.
2. **mock 불가 운영 시나리오**: N — 순수 DB 조회 지연으로 단위 mock 이 아닌 실 DB 측정만 필요할 뿐, 운영 특이 시나리오 없음.
3. **권장 옵션**: 1·2 모두 N 이므로 성능 리스크는 낮으나 SC-018 은 실측 SC 이므로 **옵션 A 권장**(자동 검증). 옵션 C 채택 시 신규 인덱스 부재 여부(seller.status·product.sellerId 조회 경로)를 Performance Agent 정적 리뷰로 보완.

### 사후 운영 검증 피드백 사이클 (PROC-014)

spec.md "범위 외 §사후 운영 검증 피드백 사이클" 에 4개 시나리오(envelope 전환 프론트 회귀, 재고 응답 소비, 대량 데이터 커서 무한스크롤, 조회 불가 상품 표시)가 명시됨. 사후 결함 발견 시 spec 수정 이벤트 → 1단계 재진입, 직전 cycle 산출물은 `_ai-workspace/cycle-N-archive/` 백업. 본 plan 은 해당 절차를 승계 참조한다.

### smoke_tests

- 필요 여부: **N**
- 근거: 변경 엔드포인트가 SC 매핑 테스트로 직접 커버되고, 응답 형태 breaking change 의 회귀 대상(console)은 프론트 범위 밖(별도 배포 동기화 이슈)이다. backend SC 범위 밖 중요 경로에 대한 회귀 유발 가능성 낮음.

---

## 기타 고려사항

- **UserModule → ProductModule 신규 import 순환 검증**: ProductModule 은 UserModule 을 import 하지 않으므로 단방향(cycle 없음). `product.viewed` 이벤트(product→user)는 EventEmitter2 전역 경유로 모듈 그래프에 포함되지 않는다. Design/Development 단계에서 앱 부팅(`onModuleInit`) 1회로 DI 해소를 검증한다(NestJS 순환 시 부팅 시점에만 표면화 — typecheck 로 미검출).
- **재고 응답 breaking change 배포 순서**: `GET/POST /inventory/...` 및 `GET /sellers/me/products` 응답 형태 변경은 console 배선부(seller/products·재고 조회·입고)와 **동기 배포** 필요. spec "범위 외 §배포 순서 고려사항" 승계 — 운영 위험이 아닌 클라이언트 계약 동기화 이슈이며, console 갱신은 본 spec 범위 밖.
- **thumbnailUrl 대표 이미지 선정**: `displayOrder asc` 첫 이미지. 이미지 없는 상품은 null(FR-010~011 "대표 이미지 URL" 의 부재 케이스 — DTO nullable).
- **price 직렬화**: Prisma Decimal → JSON 문자열(P-005). `WishlistProductSummary.price: string`, `ProductSummaryView.price: Prisma.Decimal`(service 내부). Design 단계에서 DTO 문자열 표기 일관성 확인.
- **동시성**: 신규 로직은 read 조회 + inventory stock-in(기존 increment·appendLog, 이미 검증된 경로) 재사용. 신규 공유 상태·캐시 도입 없음 → race condition 신규 위험 없음.
- **`getPublicSummaries` 빈 입력 방어**: productIds 빈 배열 시 Prisma `in: []` 는 빈 결과 → 빈 Map 반환. 위시리스트·최근 본 상품이 비어 있는 정상 케이스 방어.
- **status 파라미터 파싱**: `SellerStatus` enum(`PENDING`·`APPROVED`·`REJECTED`) 화이트리스트 검증. 그 외 문자열 → 400(Design 단계에서 DTO `@IsEnum` 또는 서비스 가드 방식 확정).
</content>
