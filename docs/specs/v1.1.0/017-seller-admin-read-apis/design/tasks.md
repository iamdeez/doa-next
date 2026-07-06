---
작성: Design Agent
버전: v1.0
최종 수정: 2026-07-03 23:24
상태: 확정
---

# Tasks: 017-seller-admin-read-apis

> Branch: 017-seller-admin-read-apis | Date: 2026-07-03 | Plan: [../planning/plan.md](../planning/plan.md)

## 목차

- [전제 조건](#전제-조건)
- [태스크 목록](#태스크-목록)
  - [Step 1. 데이터 계층 (레이어 A)](#step-1-데이터-계층-레이어-a)
  - [Step 2. 도메인 계층 (레이어 B)](#step-2-도메인-계층-레이어-b)
  - [Step 3. 인터페이스 계층 (레이어 C)](#step-3-인터페이스-계층-레이어-c)
  - [Step 4. 테스트 계층 (레이어 D — 5a Test AUTHORING)](#step-4-테스트-계층-레이어-d--5a-test-authoring)
- [Test Authoring Contract](#test-authoring-contract)
- [태스크 입도 가이드](#태스크-입도-가이드)
- [구현 완료 기준](#구현-완료-기준)

---

## 전제 조건

- [x] spec.md 의 모든 [NEEDS CLARIFICATION] 항목이 해소되었는가? — 없음(SC-018 옵션 A 확정, ASM-005 사용자 확인 절차 pipeline-log 기록)
- [x] plan.md 의 Constitution Gates 가 모두 통과(또는 예외 기재) 되었는가? — P-001~007 전건 PASS(예외 0)
- [x] CHANGES.md 에서 이전 작업의 "후속 작업 시 주의사항" 을 확인했는가? — v1.1.0 CHANGES.md 확인, 본 spec 과 충돌 없음

---

## 태스크 목록

> [P] 표시: 이전 태스크와 병렬 실행 가능
> **레이어 분할**: A·B·C = 4단계 Development Agent, D = 5a Test Agent (AUTHORING). 두 단계 PPG-1 동시 spawn.
> 의존 순서: A → B → C (D 는 5a 가 tasks.md·plan.md 계약 기반으로 A·B·C 와 병렬 authoring).

### Step 1. 데이터 계층 (레이어 A)

- [x] **T001** `[P]` — admin 판매자 목록 페이지 상수 신설
  - 레이어: A | 구현 파일: `apps/backend/src/modules/admin/admin.constants.ts`
  - 관련 요구사항: FR-002 (ASM-006)
  - 상세: `DEFAULT_SELLER_PAGE_LIMIT = 20`, `MAX_SELLER_PAGE_LIMIT = 100` 추가(기존 user 상수 관례 승계).
  - 완료 기준: 두 상수 export, 기존 상수 무변경, `tsc --noEmit` 통과.

- [x] **T002** `[P]` — seller repository cursor 페이지네이션 조회
  - 레이어: A | 구현 파일: `apps/backend/src/modules/seller/seller.repository.ts`
  - 관련 요구사항: FR-001·002·003
  - 상세: 신규 `listByStatusPaginated({ status, cursor, take, q })` — `where: { status, ...(q ? { businessName: { contains: q, mode: 'insensitive' } } : {}) }`, `orderBy: [{ createdAt: 'desc' }, { id: 'desc' }]`, `cursor: cursor ? { id: cursor } : undefined`, `skip: cursor ? 1 : 0`, `take`. 기존 `listByStatus(status)` **유지**.
  - 완료 기준: 신규 메서드 추가, 기존 메서드 시그니처 무변경, P-001(users 스키마 전용) 유지.

- [x] **T003** `[P]` — product repository cursor 확장 + 공개 요약 조회
  - 레이어: A | 구현 파일: `apps/backend/src/modules/product/product.repository.ts`
  - 관련 요구사항: FR-006(목록), FR-010·011·012(요약)
  - 상세: (a) `listBySeller(sellerId, cursor?, take?)` — orderBy 에 `{ id: 'desc' }` 2차키 추가·cursor·skip·take 지원(기존 호출 하위호환 위해 cursor/take optional). (b) 신규 `findPublicSummariesByIds(ids: string[])` — `where: { id: { in: ids }, status: { in: [ACTIVE, OUT_OF_STOCK] } }, include: { images: { orderBy: { displayOrder: 'asc' }, take: 1 } }`. 빈 배열 방어(Prisma `in: []` 자연 빈 결과).
  - 완료 기준: 두 메서드 반영, `listBySeller` 기존 무인자 호출도 컴파일·동작(cursor/take undefined 시 전체 반환 유지 또는 기본 take 적용 — plan §3 정합).

- [x] **T004** `[P]` — inventory 응답 타입·DTO 신설
  - 레이어: A | 구현 파일: `apps/backend/src/modules/inventory/dto/inventory-stock-response.dto.ts` (신규), `inventory.service.ts`(인터페이스)
  - 관련 요구사항: FR-008·009
  - 상세: `InventoryStockResponse { @ApiProperty() variantId: string; @ApiProperty() stock: number }` DTO 신설. service 반환용 `interface InventoryStockView { variantId: string; stock: number }` 정의.
  - 완료 기준: DTO·인터페이스 export, `tsc` 통과.

### Step 2. 도메인 계층 (레이어 B)

- [x] **T005** — SellerService 공개 목록 메서드 (T002 후)
  - 레이어: B | 구현 파일: `apps/backend/src/modules/seller/seller.service.ts`
  - 관련 요구사항: FR-001·002·003, FR-007
  - 상세: 신규 공개 `listSellers({ status, cursor, take, q }): Promise<{ items: SellerProfile[]; nextCursor: string | null }>` — `listByStatusPaginated` 위임 후 `nextCursor = items.length === take ? items[last].id : null`. 기존 `listByStatus` 유지.
  - 완료 기준: 메서드 추가, envelope 반환, admin DI 소비 가능.

- [x] **T006** — AdminService listSellers 대체 (T005 후)
  - 레이어: B | 구현 파일: `apps/backend/src/modules/admin/admin.service.ts`
  - 관련 요구사항: FR-001·002·003, NFR-003
  - 상세: `listPendingSellers()` → `listSellers(status?, cursor?, limit?, q?)` 로 **대체**(research 설계 노트 — dead code 제거). status 파싱: `SellerStatus` 화이트리스트, 미지정 → `SellerStatus.PENDING`(SC-003), 유효하지 않은 값 → `BadRequestException`. `take = Math.min(Math.max(limit ?? DEFAULT_SELLER_PAGE_LIMIT, 1), MAX_SELLER_PAGE_LIMIT)`. `sellerService.listSellers({...})` 위임.
  - 완료 기준: 신규 메서드로 대체, `admin.constants` seller 상수 사용, 잔여 `listPendingSellers` 참조 0(controller 도 T011 에서 전환).

- [x] **T007** — ProductService 상세·목록 (T003 후)
  - 레이어: B | 구현 파일: `apps/backend/src/modules/product/product.service.ts`
  - 관련 요구사항: FR-004·005(상세), FR-006·007(목록)
  - 상세: (a) 신규 `getMyProductDetail(userId, productId)` — `const product = await findById(productId); if (!product) throw NotFoundException;`(404, SC-009) → `await this.assertOwner(userId, product.sellerId);`(403, SC-008) → `return product`(images+variants 포함). **분기 순서 404→403 고정**. (b) `listMyProducts(userId, cursor?, limit?)` → `{ items, nextCursor }` — `getApprovedSeller` 후 `take` 클램프(`DEFAULT_PAGE_LIMIT`/`MAX_PAGE_LIMIT`), `listBySeller(seller.id, cursor, take)`, nextCursor 계산.
  - 완료 기준: 두 메서드 반영, `assertOwner`(private) 재사용, envelope 반환.

- [x] **T008** — ProductService 공개 요약 메서드 (T003 후) `[P]` (T007 과 동일 파일 — 순차)
  - 레이어: B | 구현 파일: `apps/backend/src/modules/product/product.service.ts`
  - 관련 요구사항: FR-010·011·012, NFR-004
  - 상세: 신규 공개 `getPublicSummaries(productIds: string[]): Promise<Map<string, ProductSummaryView>>` where `ProductSummaryView = { productId: string; title: string; price: Prisma.Decimal; thumbnailUrl: string | null }`. `findPublicSummariesByIds(ids)` 결과를 Map 으로 변환(조회 가능 상품만 포함, thumbnailUrl = 첫 이미지 url 또는 null). 빈 입력 → 빈 Map.
  - 완료 기준: 메서드 export(user DI 소비), 조회 불가 상품은 Map 누락.

- [x] **T009** — InventoryService 응답 구조화 (T004 후)
  - 레이어: B | 구현 파일: `apps/backend/src/modules/inventory/inventory.service.ts`
  - 관련 요구사항: FR-008·009
  - 상세: (a) 신규 `getStockView(variantId): Promise<InventoryStockView>` → `{ variantId, stock: await this.getStock(variantId) }`. (b) `stockIn(variantId, quantity)` 반환 `void` → `InventoryStockView` — 기존 `increment`·`appendLog`·`onAfterCommit(emit)` 유지 후 커밋 후 `findByVariant` 재조회 → `{ variantId, stock: updated?.quantity ?? 0 }` 반환. `getStock(number)` **내부 보존**(cart/order 미영향).
  - 완료 기준: `getStockView` 추가, `stockIn` 반환 변경, emit·log 순서·상태코드 불변.

- [x] **T010** — UserService enrichment + UserModule DI (T008 후)
  - 레이어: B | 구현 파일: `apps/backend/src/modules/user/user.service.ts`, `apps/backend/src/modules/user/user.module.ts`
  - 관련 요구사항: FR-010·011·012, NFR-004
  - 상세: (a) `user.module.ts` `imports` 에 `ProductModule` 추가. (b) `UserService` 생성자에 `private readonly productService: ProductService` 주입. (c) `listWishlist`·`listRecentViews`: `const rows = ...; const summaries = await this.productService.getPublicSummaries(rows.map(r => r.productId)); return rows.map(r => { const s = summaries.get(r.productId); return { ...r, productAvailable: !!s, product: s ? { title: s.title, price: s.price.toString(), thumbnailUrl: s.thumbnailUrl } : null }; });` (동일 가드 통합 블록 §E). `UserRepository` **무변경**(NFR-004).
  - 완료 기준: DI 해소, 항목 유지 + productAvailable/product 반영, user.repository.ts 무변경, price 문자열 직렬화.

### Step 3. 인터페이스 계층 (레이어 C)

- [x] **T011** — AdminController query 확장 + DTO (T006 후)
  - 레이어: C | 구현 파일: `apps/backend/src/modules/admin/admin.controller.ts`, `apps/backend/src/modules/admin/dto/admin-response.dto.ts`
  - 관련 요구사항: FR-001·002·003, FR-007, NFR-003
  - 상세: (a) `admin-response.dto.ts` 에 `AdminSellerListResponse { @ApiProperty({ type: [SellerProfileResponse] }) items; @ApiProperty({ type: String, required: false, nullable: true }) nextCursor }` 신설. (b) `listPendingSellers` → `@Query('status') status?`, `@Query('cursor') cursor?`, `@Query('limit') limit?`, `@Query('q') q?` 추가, `this.adminService.listSellers(status, cursor, limit ? parseInt(limit,10) : undefined, q)` 호출. `@ApiOkResponse({ type: AdminSellerListResponse })`. 라우트 경로 `sellers/pending` 유지. `@UseGuards(JwtAuthGuard, AdminGuard)` 클래스 레벨 유지.
  - 완료 기준: query 파라미터 배선, envelope 응답, AdminGuard 유지(SC-020).

- [x] **T012** — SellerProductController 상세 라우트 + 목록 query (T007 후)
  - 레이어: C | 구현 파일: `apps/backend/src/modules/product/product.controller.ts`
  - 관련 요구사항: FR-004·005·006·007
  - 상세: `SellerProductController`(`@Controller('sellers/me')`, `@UseGuards(JwtAuthGuard)`)에 (a) 신규 `@Get('products/:id') getMyProductDetail(@CurrentUser() user, @Param('id') productId) { return this.productService.getMyProductDetail(user.userId, productId); }` `@ApiOkResponse({ type: ProductDetailResponse })`. (b) `listMyProducts` 에 `@Query('cursor') cursor?`, `@Query('limit') limit?` 추가 → `listMyProducts(user.userId, cursor, limit ? parseInt(limit,10) : undefined)`, `@ApiOkResponse({ type: ProductListResponse })`.
  - 완료 기준: 두 라우트 반영, 기존 `ProductDetailResponse`·`ProductListResponse` 재사용.

- [x] **T013** — InventoryController 응답 배선 (T009 후)
  - 레이어: C | 구현 파일: `apps/backend/src/modules/inventory/inventory.controller.ts`
  - 관련 요구사항: FR-008·009
  - 상세: `getStock` 라우트 → `return this.inventoryService.getStockView(variantId)`, `@ApiOkResponse({ type: InventoryStockResponse })`. `stockIn` 라우트 → `return` 값 그대로 전달(object). 상태코드 `@HttpCode(OK)`=200·`@Get` 200 불변, 기존 소유권/승인 가드 순서(`getApprovedSeller`→`assertSellerOwnsVariant`) 유지.
  - 완료 기준: 컨트롤러 응답 object, 상태코드·가드 불변.

- [x] **T014** — user-response.dto 요약 필드 추가 (T010 후)
  - 레이어: C | 구현 파일: `apps/backend/src/modules/user/dto/user-response.dto.ts`
  - 관련 요구사항: FR-010·011·012
  - 상세: `WishlistProductSummary { @ApiProperty() title: string; @ApiProperty() price: string; @ApiProperty({ required:false, nullable:true }) thumbnailUrl: string | null }` 신설. `WishlistResponse`·`RecentViewResponse` 에 `@ApiProperty() productAvailable: boolean;` + `@ApiProperty({ required:false, nullable:true, type: () => WishlistProductSummary }) product?: WishlistProductSummary | null;` 추가(기존 필드 유지 — additive).
  - 완료 기준: DTO 반영, 응답 배열 형태 유지(envelope 아님).

### Step 4. 테스트 계층 (레이어 D — 5a Test AUTHORING)

> 본 Step 은 **5a Test Agent (AUTHORING)** 가 4단계 Development 와 PPG-1 병렬로 수행한다. Development(4단계)는 A·B·C 만 진행한다.

- [ ] **T015** — admin 판매자 목록 테스트 + 기존 spec 마이그레이션
  - 레이어: D | 테스트 파일: `apps/backend/src/modules/admin/admin.service.spec.ts`(마이그레이션)
  - 검증 대상: SC-001·002·003·004·005 (SC-020 인가 검증은 T021)
  - 상세: 기존 `describe('listPendingSellers')` → `describe('listSellers')` 재작성(§F). `mockSellerService.listSellers` jest.fn() 추가. status=PENDING/APPROVED/미지정(하위호환) 위임, limit 클램프, q 전달 검증. 유효하지 않은 status → BadRequestException.
  - 완료 기준: SC-001~005 시나리오 커버, 기존 admin.service.spec 다른 테스트 회귀 없음.

- [ ] **T016** — seller 상품 상세 테스트
  - 레이어: D | 테스트 파일: `apps/backend/src/modules/product/product.service.spec.ts`(추가)
  - 검증 대상: SC-006·007·008·009
  - 상세: `getMyProductDetail` — 소유 DRAFT/ACTIVE/OUT_OF_STOCK/INACTIVE 상세(variants·images 포함), 타인 소유 → 403(ForbiddenException), 미존재 id → 404(NotFoundException). 404→403 분기 순서 확인.
  - 완료 기준: Happy(SC-006/007)·Error(SC-008 403·SC-009 404) 커버.

- [ ] **T017** — product 목록 페이지네이션 + envelope 테스트 + 기존 spec 마이그레이션
  - 레이어: D | 테스트 파일: `apps/backend/src/modules/product/product.service.spec.ts`(마이그레이션 L663-676)
  - 검증 대상: SC-010, SC-011(envelope)
  - 상세: 기존 `listMyProducts` 테스트를 envelope 반환 + `listBySeller(sellerId, cursor, take)` 호출 인자로 마이그레이션(§F). limit=2·상품 3건 → items ≤2·nextCursor 표현. SC-011: 응답이 `items`·`nextCursor` 필드 보유(FR-002·006 공통 envelope).
  - 완료 기준: SC-010·011 커버, 기존 array 단언 제거.

- [ ] **T018** — inventory 응답 구조화 테스트 + 기존 spec 마이그레이션
  - 레이어: D | 테스트 파일: `apps/backend/src/modules/inventory/inventory.service.spec.ts`·`inventory.controller.spec.ts`(마이그레이션)
  - 검증 대상: SC-012·013
  - 상세: (a) service: `getStockView` → `{ variantId, stock }`; `stockIn` → object 반환(커밋 후 findByVariant 재조회 mock 추가 — `findByVariant` 2회 응답). (b) controller: `getStock` 라우트가 `getStockView` 호출·object 반환(기존 `getStock.mockResolvedValue(42)` → `getStockView` mock 로 전환), `stockIn` object 반환. 기존 소유권 차단(403) 테스트 회귀 없음.
  - 완료 기준: SC-012·013 커버, controller/service spec 마이그레이션 완료.

- [ ] **T019** — user 위시리스트·최근 본 상품 enrichment 테스트 + DI 마이그레이션
  - 레이어: D | 테스트 파일: `apps/backend/src/modules/user/user.service.spec.ts`(마이그레이션)
  - 검증 대상: SC-014·015·016·017
  - 상세: **`Test.createTestingModule` providers 에 `{ provide: ProductService, useValue: mockProductService }` 추가 필수**(§F — 미추가 시 전체 스위트 DI 해소 FAIL). `mockProductService.getPublicSummaries` jest.fn(). ACTIVE 상품 → title·price·thumbnailUrl 포함·productAvailable=true. 삭제/DRAFT/INACTIVE(Map 누락) → 항목 유지·productAvailable=false·product=null. 최근 본 상품 동일.
  - 완료 기준: SC-014~017 커버, UserService DI 정상 해소, 기존 user.service.spec 다른 테스트 회귀 없음.

- [ ] **T020** `[P]` — SC-021 user 모듈 products 직접 참조 금지 정적 검증
  - 레이어: D | 테스트 파일: `apps/backend/test/static/user-product-boundary.spec.ts`(신규) 또는 `test/static/cross-schema.spec.ts` 확장
  - 검증 대상: SC-021 (NFR-004) `[env:static]`
  - 상세: `user.repository.ts`·`user.service.ts` 소스에 products 스키마 Prisma 모델 직접 참조(`this.prisma.product`·`this.prisma.variant`·`this.prisma.tx.product` 등) 0건, 상품 요약은 `productService.getPublicSummaries` DI 호출만 사용함을 fs 텍스트 검사. 기존 `cross-schema.spec.ts` 패턴(this.prisma.{model} + this.prisma.tx.{model} 양 패턴) 재사용.
  - 완료 기준: 정적 검사 통과, 위반 시 FAIL.

- [ ] **T021** `[P]` — SC-019 인증(401)·SC-020 인가(403) 테스트
  - 레이어: D | 테스트 파일: `apps/backend/test/static/auth-required-guards.spec.ts`(확장) + `apps/backend/test/banner-admin.e2e-spec.ts` 또는 `admin.controller.spec.ts`
  - 검증 대상: SC-019 (NFR-002) `[env:unit]`, SC-020 (NFR-003) `[env:unit]`
  - 상세: (a) SC-019 — 신규·확장 엔드포인트(`GET /admin/sellers/pending`, `GET /sellers/me/products/:id`, `GET /sellers/me/products`, `GET/POST /inventory/:variantId/stock(-in)`, `GET /users/me/wishlist`, `GET /users/me/recent-views`)에 `JwtAuthGuard` 적용 확인(무효·부재 JWT → 401). 기존 auth-required-guards 정적 패턴 재사용. (b) SC-020 — `GET /admin/sellers/pending` 을 `ADMIN_USER_IDS` 외 사용자(userToken)로 호출 시 403(AdminGuard fail-closed). banner-admin.e2e 의 기존 `when_non_admin_..._then_403` 패턴 재사용 또는 admin.controller.spec 가드 메타데이터 검증.
  - 완료 기준: SC-019 대상 엔드포인트 가드 존재 확인, SC-020 비관리자 403 단언.

- [ ] **T022** — SC-018 목록 API P95 통합 측정 테스트 (사용자 옵션 A)
  - 레이어: D | 테스트 파일: `apps/backend/test/perf/list-p95.e2e-spec.ts`(신규) `[env:integration]`
  - 검증 대상: SC-018 (NFR-001)
  - 상세: 앱 기동 + docker-compose PostgreSQL + 1,000건 미만 데이터로 `GET /admin/sellers/pending`·`GET /sellers/me/products` 커서 목록 조회 P95 ≤ 500ms 측정. **옵션 A 확정**: main session 이 환경 구성 절차 제시 → 사용자 실행 → 결과 전달 → 5b Test EXECUTION 검증. 5a 는 측정 harness/시나리오 작성.
  - 완료 기준: 측정 스크립트·시나리오 존재, 5b 에서 실측 후 P95 판정 가능.

- [ ] **T023** — e2e admin 판매자 목록 envelope 마이그레이션
  - 레이어: D | 테스트 파일: `apps/backend/test/banner-admin.e2e-spec.ts`(마이그레이션 L154-165) `[env:integration]`
  - 검증 대상: SC-011 회귀 방어(FR-007)
  - 상세: `when_admin_lists_pending_sellers_then_200_array` → envelope 단언으로 정정(`expect(res.body).toHaveProperty('items')` + `Array.isArray(res.body.items)` + `toHaveProperty('nextCursor')`). 배열 단언 제거(§F — 미정정 시 회귀 FAIL 확정).
  - 완료 기준: e2e 단언 envelope 반영, 회귀 FAIL 제거.

---

## Test Authoring Contract

> **PPG-1 의 5a Test Agent (AUTHORING) 입력 contract.** 각 SC 의 production 심볼 canonical(PROC-004) 을 박제하여 4단계와의 병렬 발산을 차단한다. 본 spec 은 백엔드 전용 — UI 위젯 harness(PATCH-013-01/PROC-014-03) 해당 없음.

### production 심볼 canonical (병렬 중 가정 오류 차단)

| 심볼 | 시그니처 | 반환/페이로드 |
|---|---|---|
| `AdminService.listSellers` | `(status?: string, cursor?: string, limit?: number, q?: string)` | `{ items: SellerProfile[]; nextCursor: string \| null }` |
| `SellerService.listSellers` | `({ status, cursor, take, q })` | `{ items: SellerProfile[]; nextCursor: string \| null }` |
| `ProductService.getMyProductDetail` | `(userId: string, productId: string)` | `Product & { images[]; variants[] }` / 404(NotFound)·403(Forbidden) |
| `ProductService.listMyProducts` | `(userId: string, cursor?: string, limit?: number)` | `{ items; nextCursor }` |
| `ProductService.getPublicSummaries` | `(productIds: string[])` | `Map<string, { productId; title; price: Decimal; thumbnailUrl: string\|null }>` |
| `InventoryService.getStockView` | `(variantId: string)` | `{ variantId: string; stock: number }` |
| `InventoryService.stockIn` | `(variantId: string, quantity: number)` | `{ variantId: string; stock: number }` (기존 void 대체) |
| `UserService` 생성자 | `(userRepository, productService)` | **DI 인자 추가** — spec TestingModule 에 mock ProductService provider 필수 |
| Wishlist/RecentView 항목 | 기존 필드 + `productAvailable: boolean` + `product: { title; price: string; thumbnailUrl } \| null` | 배열 형태 유지(envelope 아님) |

- **리터럴 단언 주의**: 예외 타입은 NestJS `NotFoundException`(404)·`ForbiddenException`(403)·`BadRequestException`(400) 클래스로 단언(문자열 메시지 추측 금지). status 화이트리스트는 `SellerStatus` enum 참조.
- **DI canonical (최대 리스크)**: `user.service.spec.ts` 는 `Test.createTestingModule` 사용 → ProductService mock provider 미추가 시 전체 스위트 compile FAIL. 반드시 provider 추가.

### SC → 테스트 매핑

| SC-ID | 수용 기준 | Happy | Edge | Error | 테스트 파일 | 비고 |
|---|---|---|---|---|---|---|
| SC-001 | status=PENDING 판매자만 | ✓ | | | admin.service.spec.ts | [env:unit] |
| SC-002 | status=APPROVED 판매자만 | ✓ | | | admin.service.spec.ts | [env:unit] |
| SC-003 | status 미지정→PENDING(하위호환) | | ✓ | | admin.service.spec.ts | [env:unit] |
| SC-004 | limit·nextCursor 경계 | | ✓ | | admin.service.spec.ts | [env:unit] |
| SC-005 | businessName 부분일치 검색 | ✓ | | | admin.service.spec.ts | [env:unit] |
| SC-006 | 소유 DRAFT 상세 variants·images | ✓ | | | product.service.spec.ts | [env:unit] |
| SC-007 | 소유 ACTIVE/OOS/INACTIVE 상세 | | ✓ | | product.service.spec.ts | [env:unit] |
| SC-008 | 타인 소유 상세 → 403 | | | ✓ | product.service.spec.ts | [env:unit] |
| SC-009 | 미존재 id 상세 → 404 | | | ✓ | product.service.spec.ts | [env:unit] |
| SC-010 | 판매자 목록 페이지네이션 | | ✓ | | product.service.spec.ts | [env:unit] |
| SC-011 | envelope {items,nextCursor} 형태 | ✓ | | | product.service.spec.ts / admin.service.spec.ts | [env:unit] |
| SC-012 | 재고 조회 {variantId,stock} | ✓ | | | inventory.service.spec.ts / inventory.controller.spec.ts | [env:unit] |
| SC-013 | 재고 입고 {variantId,갱신 stock} | ✓ | | | inventory.service.spec.ts | [env:unit] |
| SC-014 | 위시리스트 ACTIVE 요약 | ✓ | | | user.service.spec.ts | [env:unit] |
| SC-015 | 최근 본 상품 요약 | ✓ | | | user.service.spec.ts | [env:unit] |
| SC-016 | 위시리스트 조회불가 항목 유지·표시 | | ✓ | | user.service.spec.ts | [env:unit] |
| SC-017 | 최근 본 상품 조회불가 항목 유지·표시 | | ✓ | | user.service.spec.ts | [env:unit] |
| SC-018 | 목록 API P95 ≤ 500ms | ✓ | | | test/perf/list-p95.e2e-spec.ts | [env:integration] 옵션 A |
| SC-019 | 무효/부재 JWT → 401 | | | ✓ | test/static/auth-required-guards.spec.ts | [env:unit] |
| SC-020 | 비관리자 admin 목록 → 403 | | | ✓ | admin.controller.spec.ts / banner-admin.e2e | [env:unit] |
| SC-021 | user 모듈 products 직접참조 0 | ✓ | | | test/static/user-product-boundary.spec.ts | [env:static] |

> 본 contract 는 외부 agent / 사용자 / CI 가 직접 충족 가능. main session 이 `ExternalAuthoring: YES` 시 외부 산출물 존재 확인 후 5b 진입.

---

## 태스크 입도 가이드

- 1 태스크 ≈ 구현 파일 1~3개 + 대응 테스트 파일 1개 수준.
- T007·T008 은 동일 `product.service.ts` 파일이므로 순차 진행(병렬 편집 충돌 회피).
- 단일 함수 수정이라도 호출 측 영향이 넓은 경우(UserService DI·응답 계약)는 §F 마이그레이션 태스크로 분리(T015·T017·T018·T019·T023).

## 구현 완료 기준

- [x] 모든 A·B·C 태스크(T001~T014) 체크박스 완료 (4단계 Development)
- [ ] 모든 D 태스크(T015~T023) 체크박스 완료 (5a Test AUTHORING — PPG-1 병렬 진행 중, 4단계 범위 밖)
- [x] [TypeScript] `pnpm --filter backend typecheck` (tsc --noEmit) 통과
- [x] [TypeScript] `pnpm --filter backend test` 전체 PASS — 4단계 종료 시점 362/362 PASS(unit). 5a 가 병렬로 D 레이어 마이그레이션(admin/product/inventory service·controller, user.service)을 완료해 A·B·C 구현과 정합 확인됨. 단 D 레이어(T015~T023) 체크박스 판정 자체는 5a 소관.
- [x] UserModule→ProductModule 신규 import 후 앱 부팅(`onModuleInit`) 1회 DI 해소 검증(순환 없음) — `test/health.e2e-spec.ts` SC-007 케이스로 확인, DI 에러 없음
- [x] git status 의도치 않은 파일 없음 (본 4단계 변경분 한정 — apps/console/playwright.config.ts·docs/ops/·fly.toml 은 본 작업 범위 밖 별도 변경)
