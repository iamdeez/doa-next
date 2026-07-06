---
작성: Docs Agent
버전: v1.0
최종 수정: 2026-07-04 00:37
상태: 확정
---

# Diff: 017-seller-admin-read-apis

## 목차

- [base 혼재 주의](#base-혼재-주의)
- [커밋 메시지용 한 줄 요약](#커밋-메시지용-한-줄-요약)
- [변경 요약](#변경-요약)
- [변경 파일 및 라인 수](#변경-파일-및-라인-수)
- [Diff](#diff)

---

## base 혼재 주의

base `0196b9a`(v1.1.0/015·016 완료 커밋, `git log --oneline` 확인)는 017 착수 시점에 이미 커밋되어
있어 015·016 과의 물리적 혼재는 없다.

다만 working tree 에는 본 spec(017)과 **무관한 미커밋 chore 3건**이 공존한다:
`fly.toml`·`apps/console/playwright.config.ts`·`docs/ops/social-login-setup.md`. 아래 "변경 요약"·
"변경 파일 및 라인 수"·재생성 명령은 이 3건을 **명시적으로 제외**하고 `apps/backend` 범위로 한정했다.

## 커밋 메시지용 한 줄 요약

- **KO**: console 실통합 백엔드 계약 갭(BE-GAP-002~007) 6건 해소 — 관리자 판매자 목록 필터·검색·페이지네이션, 판매자 상품 상세·목록 페이지네이션, 목록 응답 envelope 통일, 재고 응답 구조화, 위시리스트·최근 본 상품 상품 요약 조인 (v1.1.0/017)
- **EN**: Resolve 6 backend contract gaps (BE-GAP-002~007) found during console integration — admin seller list filter/search/pagination, seller product detail/list pagination, unified list envelope, structured inventory response, wishlist/recent-view product summary enrichment (v1.1.0/017)

## 변경 요약

- **admin/seller — 관리자 판매자 목록 확장 (FR-001~003, BE-GAP-002)**: 기존 `GET /admin/sellers/pending`
  에 `status`(PENDING/APPROVED/REJECTED, 미지정 시 기존과 동일하게 PENDING — 하위 호환)·`cursor`·
  `limit`·`q`(businessName 부분 일치, insensitive) query 파라미터를 추가했다. `AdminService.listSellers()`
  가 신규 `SellerService.listSellers()`(공개 DI 메서드)로 위임하고, `SellerRepository.listByStatusPaginated()`
  가 cursor 페이지네이션(`orderBy [createdAt desc, id desc] + cursor{id} + skip + take`)을 수행한다.
  기존 `SellerService.listByStatus()`(admin/stats 소비 중)는 그대로 유지된다(비파괴).
- **seller/product — 판매자 상품 상세 신규 (FR-004~005, BE-GAP-003)**: 신규 `GET /sellers/me/products/:id`
  가 `ProductService.getMyProductDetail()` 을 통해 소유 상품을 상태 무관(DRAFT 포함)으로 단건 조회하며
  variants·images 를 포함한다. 존재 확인(404) → 소유권 확인(403) 순서로 기존 `assertOwner` 를 재사용해
  IDOR 를 방어한다.
- **seller/product — 판매자 상품 목록 페이지네이션 (FR-006~007, BE-GAP-004/006)**: 기존
  `GET /sellers/me/products`(`listMyProducts`)에 `cursor`·`limit` 을 추가하고, 응답을 배열에서
  `{items, nextCursor}` envelope 으로 전환했다(`ProductRepository.listBySeller()` orderBy 에
  `id desc` 2차키 추가로 cursor 안정성 확보).
- **공통 — 목록 응답 envelope 통일 (FR-007, BE-GAP-006)**: 위 두 신규/확장 목록(관리자 판매자 목록,
  판매자 상품 목록)이 기존 `GET /products` 와 동일한 `{items, nextCursor}` 형태로 통일됐다. 기존 소형
  고정 배열 목록(예: 카테고리)은 변경하지 않았다(spec 범위 명시).
- **inventory — 재고 응답 구조화 (FR-008~009, BE-GAP-005)**: `GET .../stock` 이 원시 숫자 대신
  `{variantId, stock}` 를 반환하도록 `InventoryService.getStockView()` 를 신설했다. `POST .../stock-in`
  (`stockIn()`)은 반환형을 `void` → `InventoryStockView`(입고 후 갱신된 수량)로 변경했으며, 상태 코드는
  200 으로 불변이다(`increment → appendLog → onAfterCommit → 재조회 → 반환` 순서, 기존 재고 증감 경로
  무변경).
- **user — 위시리스트·최근 본 상품 상품 요약 조인 (FR-010~012, BE-GAP-007)**: `ProductService` 에 신규
  공개 메서드 `getPublicSummaries(productIds)` 를 추가해 단일 `in` 쿼리로 조회 가능(ACTIVE·
  OUT_OF_STOCK) 상품의 title·price·대표 이미지 URL(`displayOrder asc` 첫 이미지)을 Map 으로 반환한다.
  `UserService.listWishlist()`·`listRecentViews()` 가 이 DI 메서드를 호출해 각 항목에 `productAvailable`·
  `product`(nullable) 필드를 병합한다. 조회 불가(DRAFT·INACTIVE·삭제·미존재) 상품을 참조하는 항목은
  목록에서 제외하지 않고 `productAvailable:false`+`product:null` 로 유지된다. `UserModule` 에
  `ProductModule` 을 신규 import(순환 없음 확인, constitution P-001 모듈 경계 — user 는 products 스키마
  직접 쿼리 없이 `ProductService` DI 로만 조회, NFR-004/SC-021 정적 검증).
- **신규 npm 의존 0건**(기존 NestJS·Prisma 스택 재사용). **신규 Prisma 마이그레이션 없음**(기존
  테이블·컬럼 범위 내 응답 DTO/조회 로직 확장).
- **테스트**: 신규 4개 파일(admin controller 가드 검증·inventory 구조화 응답 DTO·user-product 모듈
  경계 정적 검증·P95 성능 e2e) + 기존 8개 테스트 파일 §F 마이그레이션(신규 SC·응답 계약 변경 반영).
  STALE_SC 27건(§F 마이그레이션 파일의 선행 spec SC 인용 비정형 문구)을 사용자 결정(옵션 A)에 따라
  주석 서식만 일괄 정정(production 로직 불변).

## 변경 파일 및 라인 수

> tracked 21 files 는 `git diff 0196b9a --numstat -- apps/backend` 실측치. untracked 4 files 는
> `wc -l` 실측치(신규 파일, 전량 추가).

### 수정 (tracked, 실측)

| 파일 | 추가 | 삭제 |
|---|---|---|
| `apps/backend/src/modules/admin/admin.constants.ts` | +4 | -0 |
| `apps/backend/src/modules/admin/admin.controller.ts` | +22 | -5 |
| `apps/backend/src/modules/admin/admin.service.spec.ts` | +162 | -10 |
| `apps/backend/src/modules/admin/admin.service.ts` | +31 | -4 |
| `apps/backend/src/modules/admin/dto/admin-response.dto.ts` | +10 | -0 |
| `apps/backend/src/modules/inventory/inventory.controller.spec.ts` | +27 | -11 |
| `apps/backend/src/modules/inventory/inventory.controller.ts` | +9 | -3 |
| `apps/backend/src/modules/inventory/inventory.service.spec.ts` | +99 | -4 |
| `apps/backend/src/modules/inventory/inventory.service.ts` | +21 | -3 |
| `apps/backend/src/modules/product/product.controller.ts` | +23 | -3 |
| `apps/backend/src/modules/product/product.repository.ts` | +22 | -2 |
| `apps/backend/src/modules/product/product.service.spec.ts` | +215 | -22 |
| `apps/backend/src/modules/product/product.service.ts` | +48 | -2 |
| `apps/backend/src/modules/seller/seller.repository.ts` | +22 | -0 |
| `apps/backend/src/modules/seller/seller.service.ts` | +15 | -0 |
| `apps/backend/src/modules/user/dto/user-response.dto.ts` | +29 | -3 |
| `apps/backend/src/modules/user/user.module.ts` | +4 | -1 |
| `apps/backend/src/modules/user/user.service.spec.ts` | +140 | -2 |
| `apps/backend/src/modules/user/user.service.ts` | +48 | -5 |
| `apps/backend/test/banner-admin.e2e-spec.ts` | +10 | -2 |
| `apps/backend/test/static/auth-required-guards.spec.ts` | +22 | -14 |
| **소계 (tracked 21 files)** | **+983** | **-96** |

### 신규 (untracked, 실측 `wc -l`)

| 파일 | 라인 수 | 비고 |
|---|---|---|
| `apps/backend/src/modules/admin/admin.controller.spec.ts` | 104 | SC-020 가드 메타데이터 검증 |
| `apps/backend/src/modules/inventory/dto/inventory-stock-response.dto.ts` | 10 | `InventoryStockResponse {variantId, stock}` |
| `apps/backend/test/static/user-product-boundary.spec.ts` | 109 | SC-021 정적 검증 |
| `apps/backend/test/perf/list-p95.e2e-spec.ts` | 206 | SC-018 P95 실측 |
| **소계 (untracked 4 files)** | **429** | — |

### 합계

| 구분 | 파일 수 | 추가 | 삭제 |
|---|---|---|---|
| tracked (수정) | 21 | +983 | -96 |
| untracked (신규) | 4 | +429 | -0 |
| **총계** | **25** | **+1,412** | **-96** |

## Diff

> 전체 diff 는 박제하지 않는다 — git 이 형상관리 SoT. base commit + 재생성 명령:
>
> ```bash
> # tracked 21 files
> git diff 0196b9a -- apps/backend docs/specs/v1.1.0/017-seller-admin-read-apis
>
> # untracked 4 files 확인 (git diff 에 잡히지 않음)
> git status --short -- apps/backend/src/modules/admin apps/backend/src/modules/inventory/dto apps/backend/test/static apps/backend/test/perf
> ```
>
> 본 spec 과 무관한 미커밋 chore 3건(`fly.toml`·`apps/console/playwright.config.ts`·
> `docs/ops/social-login-setup.md`)은 위 pathspec 범위(`apps/backend` 로 한정)에 의해 자동 제외된다.
