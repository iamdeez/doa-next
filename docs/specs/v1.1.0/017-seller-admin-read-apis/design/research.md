---
작성: Design Agent
버전: v1.0
최종 수정: 2026-07-03 23:20
상태: 확정
---

# Research: 017-seller-admin-read-apis

## 목차

- [분석 범위 게이트](#분석-범위-게이트)
- [기존 코드베이스 분석](#기존-코드베이스-분석)
  - [클래스·모듈 계층 구조](#클래스모듈-계층-구조)
  - [영향 범위 분석 (변경 대상 파일)](#영향-범위-분석-변경-대상-파일)
  - [공유 상태·동시성 분석](#공유-상태동시성-분석)
- [§F production 시그니처·응답 계약 변경 — 호출 측 테스트 식별 (PROC-001)](#f-production-시그니처응답-계약-변경--호출-측-테스트-식별-proc-001)
- [외부 라이브러리 API 동작 확인](#외부-라이브러리-api-동작-확인)
- [배포 환경 영향 추정](#배포-환경-영향-추정)
- [context.md 부정합 사전 점검](#contextmd-부정합-사전-점검)
- [기술 선택 조사](#기술-선택-조사)
- [엣지 케이스 및 한계](#엣지-케이스-및-한계)

---

## 분석 범위 게이트

plan.md "핵심 설계"가 5개 모듈(admin·seller·product·inventory·user)의 변경 대상 파일·시그니처·분기를 이미 명시했다. 본 research 는 그 대상 파일에만 실코드 대조를 수행한다.

- **§D(다단계 병렬 파이프라인)**: 해당 없음 — 순수 read 조회 확장, 병렬 파이프라인 없음. 건너뜀.
- **§E(동일 가드 조건 결정 통합)**: 부분 적용 — 위시리스트·최근 본 상품 enrichment 에서 `productAvailable`·`product` 두 필드를 동일 가드(`summaries.get(id)` 존재 여부)로 결정한다. plan.md §5 가 이미 통합 블록으로 설계함(`const s = summaries.get(...); productAvailable=!!s; product = s ? {...} : null`). 확인 완료 — 분리 위험 없음.
- **§4(외부 라이브러리)**: 신규 라이브러리·신규 메서드 도입 0건. 기존 Prisma `findMany(cursor)`·`findUnique(include)`·NestJS DI 의 기존 사용 패턴 재활용 → 생략.
- **§F**: production 응답 계약 변경(배열→envelope, number/void→object) 포함 → **수행함**(아래 절).

---

## 기존 코드베이스 분석

> context.md §2 핵심 모듈 목록을 기준선으로 삼는다. 전체 구조는 context.md §2 참조. 본 절은 변경 대상 5개 모듈의 실코드 검증 결과만 기록한다.

### 클래스·모듈 계층 구조

레이어드 아키텍처(controller → service → repository), 상속 트리 없음(NestJS `@Injectable` 서비스는 concrete 단일 클래스). 추상 클래스·인터페이스 구현체 강제 재구현 이슈(PATCH-015-04) 해당 없음.

DI 그래프(신규 import 반영, 코드 실검증):

```
admin  → seller(SellerService), user(UserService)
product → seller(SellerService), inventory(InventoryService, forwardRef)
inventory → seller, product(forwardRef)         # 기존 순환은 forwardRef 로 해소됨
user   → product(ProductService)   ← 신규 import (FR-010~012)
```

- **신규 순환 검증**: `ProductModule` 은 `UserModule` 을 import 하지 않는다(product.module.ts `imports: [SellerModule, forwardRef(InventoryModule), AuthSharedModule]`). `product.viewed` 이벤트(product→user)는 EventEmitter2 전역 경유로 모듈 그래프에 포함되지 않음. 따라서 `user → product` 신규 단방향 추가는 cycle 을 만들지 않는다. **forwardRef 불필요**(plan.md §5 정합).
- `ProductModule` 은 `exports: [ProductService]` 로 이미 공개되어 있어 `UserModule.imports` 에 `ProductModule` 만 추가하면 DI 해소됨.

### 영향 범위 분석 (변경 대상 파일)

| 파일 | 변경 유형 | 영향 내용 |
|---|---|---|
| `admin/admin.constants.ts` | 수정 | `DEFAULT_SELLER_PAGE_LIMIT=20`·`MAX_SELLER_PAGE_LIMIT=100` 신설(ASM-006) |
| `admin/admin.controller.ts` | 수정 | `listPendingSellers` 에 `@Query(status·cursor·limit·q)` 추가, `adminService.listSellers(...)` 호출로 전환. `@ApiOkResponse` 타입 `[SellerProfileResponse]`→`AdminSellerListResponse` |
| `admin/admin.service.ts` | 수정 | `listPendingSellers()` → `listSellers(status?,cursor?,limit?,q?)` 로 대체(아래 설계 노트). limit 클램프 후 SellerService 위임 |
| `admin/dto/admin-response.dto.ts` | 수정 | `AdminSellerListResponse { items: SellerProfileResponse[]; nextCursor }` 신설 |
| `seller/seller.service.ts` | 수정 | 신규 공개 `listSellers({status,cursor,take,q})`. 기존 `listByStatus(status)` **유지**(stats 소비) |
| `seller/seller.repository.ts` | 수정 | 신규 `listByStatusPaginated({status,cursor,take,q})`(orderBy [createdAt desc,id desc]·cursor·q contains insensitive). 기존 `listByStatus` 유지 |
| `product/product.controller.ts` | 수정 | `SellerProductController`: `getMyProductDetail`(신규 `@Get('products/:id')`), `listMyProducts` 에 `@Query(cursor·limit)` 추가 |
| `product/product.service.ts` | 수정 | 신규 `getMyProductDetail(userId,productId)`(404→403), `listMyProducts(userId,cursor?,limit?)` envelope 화, 신규 공개 `getPublicSummaries(ids[])` |
| `product/product.repository.ts` | 수정 | `listBySeller(sellerId,cursor?,take?)` cursor 확장(orderBy 에 id 2차키 추가), 신규 `findPublicSummariesByIds(ids[])` |
| `inventory/inventory.service.ts` | 수정 | 신규 `getStockView(variantId)`, `stockIn` 반환 `void`→`InventoryStockView`. `getStock(number)` **내부 보존** |
| `inventory/inventory.controller.ts` | 수정 | `getStock` 라우트 → `getStockView` 호출, `stockIn` 반환값 전달 |
| `inventory/dto/` | 신규 | `InventoryStockResponse { variantId; stock }` |
| `user/user.module.ts` | 수정 | `imports` 에 `ProductModule` 추가 |
| `user/user.service.ts` | 수정 | 생성자에 `ProductService` 주입, `listWishlist`·`listRecentViews` enrichment |
| `user/dto/user-response.dto.ts` | 수정 | `WishlistResponse`·`RecentViewResponse` 에 `productAvailable`·`product`(`WishlistProductSummary`) 추가 |
| `user/user.repository.ts` | **무변경** | users 스키마 전용 유지(NFR-004·SC-021 정적 통과 조건) |

**설계 노트 — `AdminService.listPendingSellers()` 대체 결정**: 실코드 확인 결과 `AdminService.listPendingSellers()` 의 호출자는 (a) `admin.controller.ts` (b) `admin.service.spec.ts` 뿐이다(grep 전수 확인). 컨트롤러가 신규 `listSellers(...)` 호출로 전환되면 기존 메서드는 dead code 가 되므로, **`listPendingSellers()` → `listSellers(...)` 로 대체**한다(잔존 dead code 금지). 이에 따라 `admin.service.spec.ts` 의 `describe('listPendingSellers')` 테스트는 `listSellers` 로 마이그레이션한다(§F 표 참조, 본 spec 범위 내). `SellerService.listByStatus(status)` 는 stats 등 다른 소비처가 있으므로 **유지**(비파괴).

### 공유 상태·동시성 분석

- **신규 공유 상태·캐시 도입 0건**. 모든 신규 로직은 무상태 read 조회(`findMany`/`findUnique`)이다. Check-Then-Act·race window 신규 발생 없음.
- inventory `stockIn` 은 기존 `increment`→`appendLog`→`onAfterCommit(emit)` 경로를 그대로 유지하고, 반환값 계산을 위해 **커밋 후 `findByVariant` 재조회 1건**만 추가한다. 이 재조회는 이미 커밋된 값을 읽으므로 원자성에 영향 없음(로그·이벤트 순서 불변). Lock 신규 불필요.
- `getPublicSummaries(ids[])` 는 단일 `findMany({ where: { id: { in: ids } } })` 로 N+1 회피. 빈 배열 입력 시 Prisma `in: []` → 빈 결과 → 빈 Map(정상 방어).

---

## §F production 시그니처·응답 계약 변경 — 호출 측 테스트 식별 (PROC-001)

본 spec 은 **응답 계약 breaking change**(FR-007 목록 envelope 통일, FR-008/009 재고 응답 구조화)를 포함한다. 아래는 변경되는 production 심볼과 이를 직접 호출·단언하는 기존 테스트의 전수 식별 결과다(`grep -rn` 근거).

### 변경되는 production 심볼

| 심볼 | 시그니처 전 | 시그니처 후 |
|---|---|---|
| `AdminService.listPendingSellers()` | `(): Promise<SellerProfile[]>` | 대체 → `listSellers(status?,cursor?,limit?,q?): Promise<{items,nextCursor}>` |
| `ProductService.listMyProducts(userId)` | `(userId): Promise<Product[]>` | `(userId, cursor?, limit?): Promise<{items,nextCursor}>` |
| `ProductRepository.listBySeller(sellerId)` | `(sellerId): Promise<Product[]>` | `(sellerId, cursor?, take?): Promise<Product[]>` |
| `InventoryService.getStock(variantId)` | `(): Promise<number>` — **보존**(내부 재사용) | 신규 `getStockView(): Promise<{variantId,stock}>` 추가 |
| `InventoryService.stockIn(variantId,qty)` | `(): Promise<void>` | `(): Promise<{variantId,stock}>` |
| `UserService.listWishlist / listRecentViews` | `Promise<WishlistItem[]/RecentView[]>` | 항목에 `productAvailable`·`product` enrichment(배열 형태 유지, additive) |
| `UserService` 생성자 | `(userRepository)` | `(userRepository, productService)` — **DI 인자 추가** |

### 각 심볼을 직접 호출·단언하는 기존 테스트 (호출 라인 포함)

| 테스트 파일 | 라인 | 현재 단언 | breaking 여부 | 마이그레이션 |
|---|---|---|---|---|
| `admin/admin.service.spec.ts` | L56-66 | `service.listPendingSellers()` → `listByStatus(PENDING)` 위임·array 반환 | 예 | `describe('listSellers')` 로 재작성. `mockSellerService` 에 `listSellers` jest.fn() 추가 |
| `test/banner-admin.e2e-spec.ts` | L154-165 | `GET /admin/sellers/pending` → `expect(Array.isArray(res.body)).toBe(true)` | **예 (회귀 FAIL 확정)** | `{items,nextCursor}` envelope 단언으로 정정. [env:integration] e2e |
| `product/product.service.spec.ts` | L663-676 | `listMyProducts(userId)` → `listBySeller(sellerId)` 호출·`toBe(allProducts)` array | 예 | envelope `{items,nextCursor}` 단언 + `listBySeller(sellerId, undefined, take)` 호출 인자 |
| `inventory/inventory.controller.spec.ts` | L85-100 (stockIn) | `stockIn.mockResolvedValue(undefined)` + 호출 단언 | 예 | `getStockView`/object 반환 반영. stockIn mock → object |
| `inventory/inventory.controller.spec.ts` | L167-189 (getStock) | `getStock.mockResolvedValue(42)`, `getStock` 호출 단언 | 예 | 컨트롤러가 `getStockView` 호출로 전환 → mock·단언 대상 변경 |
| `inventory/inventory.service.spec.ts` | L110-160 (stockIn) | `service.stockIn(...)` emit 검증(반환값 미검증) | 부분 | stockIn 이 커밋 후 `findByVariant` 재조회 1건 추가 → mock `findByVariant` 2회 응답 필요. 반환 object 단언 추가 |
| `user/user.service.spec.ts` | 전체(L1~) | `Test.createTestingModule({ providers: [UserService, {UserRepository}] })` | **예 (모듈 compile FAIL 확정)** | `{ provide: ProductService, useValue: mockProductService }` provider 추가 필수. 미추가 시 "Nest can't resolve dependencies of UserService" 로 **전체 스위트 실패**. wishlist/recent-views 반환 단언도 enrichment 반영 |

### 마이그레이션 불필요(무영향) 확인

- `test/static/inventory-service-signature.spec.ts`: `checkAvailability`(Promise<boolean>)·`decreaseStock`(Promise<void>) 시그니처만 검사. `stockIn` 반환 변경은 이 정적 테스트 범위 밖. `initStock`·`decreaseStock`·`restoreStock` 이 `Promise<void>` 를 유지하므로 `/Promise<void>/` 매칭도 그대로 통과. **무영향**.
- `order.service.spec.ts`·`settlement.service.spec.ts` 의 `listBySeller` 는 `OrderRepository`·`SettlementRepository` 소속(product 아님) → **무영향**.
- `test/static/cross-schema.spec.ts`: user 모듈 repository → products 스키마 직접 참조 금지를 이미 검사. 본 spec 은 user.repository.ts 를 변경하지 않고 enrichment 를 UserService 의 ProductService DI 로 수행하므로 이 정적 규칙을 **자연 준수**. SC-021 은 이 패턴을 `user.service.ts` 까지 확장하여 신규 정적 테스트로 작성(D 레이어).

### 호출 측 마이그레이션의 본 spec 범위 포함 여부 판정

**포함 확정**. spec.md 가 응답 계약 변경을 명시적 FR(FR-007/008/009)·SC(SC-011/012/013)로 규정하고, "범위 외 §배포 순서 고려사항"에서 breaking change 임을 명시했다. backend 테스트의 동반 마이그레이션은 본 spec 구현의 필수 구성요소이므로 tasks.md 에 마이그레이션 태스크로 포함한다(D 레이어). → `SCOPE_VIOLATION` 없음, BLOCKED 불요.

> **동적 호출 한계**: 본 §F 는 `grep` 정적 식별이므로 getattr/eval/동적 콜백은 미포착. backend 는 그런 동적 호출 패턴 부재(NestJS DI 정적 배선). e2e/unit 전체 스위트(255 unit + 84 e2e/static)가 사후 안전망.

---

## 외부 라이브러리 API 동작 확인

신규 외부 라이브러리·신규 메서드 도입 0건. Prisma `findMany({ cursor, skip, take, orderBy })`·`findUnique({ include })`·`where: { field: { contains, mode: 'insensitive' } }`·`where: { id: { in } }` 는 모두 002-catalog/007-admin 에서 이미 검증·운영 중인 동작이다(product `listPublic`·user `listPaginated` 동일 패턴). → silent failure / private API lifecycle 검증 대상 없음(public API 만 사용).

## 배포 환경 영향 추정

순수 backend 인-프로세스 조회 로직 확장. 컨테이너 NAT·L4 LB·keepalive·socket 특이성에 의존하지 않음(plan.md PROC-009 정합). 단 FR-007/008/009 응답 계약 breaking change 는 **console 클라이언트 동기 배포 의존성**을 가진다(운영 위험 아닌 계약 동기화). console `seller/products`·재고 조회/입고 호출부는 배선됨 → 동기 배포 필요. `admin/sellers`·`account/wishlist` 는 미배선(플레이스홀더)이라 무관. 이는 spec "범위 외 §배포 순서"·plan.md 기타 고려사항이 이미 흡수. **infra.md cross-reference 결과 신규 운영 제약 없음.**

## context.md 부정합 사전 점검

변경 대상 심볼(admin/seller/product/inventory/user 조회 메서드·응답 DTO)을 context.md §2 핵심 모듈 표 / §5 도메인 용어 사전과 대조:

- §2 모듈 표는 모듈 단위 역할 기술로 개별 메서드 시그니처를 담지 않음 → 응답 계약 변경으로 인한 문구 부정합 없음.
- §5 도메인 용어(판매자 상태 PENDING/APPROVED/REJECTED, 상품 상태 DRAFT/ACTIVE/OUT_OF_STOCK/INACTIVE)는 본 spec 이 의미를 변경하지 않고 그대로 사용 → 부정합 없음.
- §6 알려진 제약: "위시리스트·최근 본 상품 productId 는 cross-schema plain String(고아 참조 가능)" 항목은 본 spec 의 FR-012(`productAvailable:false`)로 **부분 완화**된다. 6단계 Docs Agent 가 §6 에 "고아 참조를 productAvailable 표시로 흡수" 갱신을 검토하도록 GAP 가시화(gaps.md GAP-017-01). 부정합(오류)은 아님 — 제약 자체는 스키마 레벨로 잔존.

## 기술 선택 조사

plan.md 결정 기록(ADR-001~008)과 cross-reference. 모든 결정은 기존 코드베이스 컨벤션 승계(대안 대비 신규 도입 최소화):

- cursor 페이지네이션: `orderBy [createdAt desc, id desc] + cursor{id} + skip:cursor?1:0 + take + nextCursor=rows.length===take?last.id:null` — product `listPublic`·user `listPaginated` 동일 패턴 재사용.
- 소유권/승인 검증: 기존 `assertOwner`·`getApprovedSeller` 재사용(신규 헬퍼 0). 404→403 분기 순서는 기존 `updateProduct`/`publish` 와 통일(ADR-003).
- N+1 회피: `getPublicSummaries` 단일 `in` 쿼리(ADR-006). thumbnail 은 `images { orderBy displayOrder asc, take 1 }` include.
- 상수: `admin.constants.ts` 에 seller 페이지 상수 신설(모듈별 상수 패턴 — user 상수와 동일 위치 관례). product 목록은 기존 `product.constants` 재사용.

## 엣지 케이스 및 한계

- **limit 클램프**: `Math.min(Math.max(limit ?? DEFAULT, 1), MAX)` — 0·음수·초과 방어(기존 `listUsers`·`listPublic` 동일).
- **status 파싱**: `SellerStatus` enum 화이트리스트(`PENDING`·`APPROVED`·`REJECTED`) 외 문자열 → `BadRequestException`(400). 미지정 → PENDING(SC-003 하위 호환).
- **빈 컬렉션 방어**: `getPublicSummaries([])` → 빈 Map. 위시리스트/최근 본 상품이 빈 경우 productService 호출은 빈 입력으로 안전.
- **thumbnail 부재**: 이미지 없는 상품 → `thumbnailUrl: null`(DTO nullable).
- **price 직렬화**: Prisma Decimal → JSON 문자열(P-005). `WishlistProductSummary.price: string`(service 내부 `ProductSummaryView.price: Prisma.Decimal` → DTO 직렬화 시 문자열). Development 단계에서 문자열 표기 일관성 확인.
- **조회 불가 상품 표시(ASM-005/ADR-007)**: DRAFT/INACTIVE/삭제/미존재 상품은 `productAvailable:false`+`product:null` 로 유지(무음 필터링 금지). 사용자 데이터 유실 오인 방지.
- **DI 인자 추가의 파급(가장 큰 리스크)**: `UserService` 생성자에 `ProductService` 추가는 `user.service.spec.ts` 의 `Test.createTestingModule` provider 목록을 반드시 갱신해야 하며(§F), 미갱신 시 wishlist 무관 테스트까지 전체 스위트가 DI 해소 실패로 무너진다. Test Authoring Contract 에 canonical 로 박제(D 레이어).
