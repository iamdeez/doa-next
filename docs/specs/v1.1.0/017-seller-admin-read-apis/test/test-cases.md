---
작성: Test Agent (AUTHORING)
버전: v1.0
최종 수정: 2026-07-04 00:08
상태: 확정
---

# Test Cases: 017-seller-admin-read-apis

## 목차

- [개요](#개요)
- [SC × 시나리오 매트릭스](#sc--시나리오-매트릭스)
- [§F 마이그레이션 반영 현황](#f-마이그레이션-반영-현황)
- [외부 의존성 명시](#외부-의존성-명시)
- [자체 실행 검증 결과 (AUTHORING 단계 참고용)](#자체-실행-검증-결과-authoring-단계-참고용)
- [미커버 항목 (사전 분류 — 4-카테고리)](#미커버-항목-사전-분류--4-카테고리)

---

## 개요

본 문서는 `spec.md` SC-001~SC-021 전건에 대응하는 테스트 케이스를 tasks.md D 레이어(T015~T023)
기준으로 매핑한다. tasks.md "Test Authoring Contract" 절의 production 심볼 canonical 을 그대로
따랐으며, 작성 시점(PPG-1 병렬)에 4단계 Development Agent 가 A·B·C 레이어(T001~T014)를 이미 완료한
상태였음을 `git diff` 로 확인 후 canonical 정합성을 재검증했다(불일치 0건).

---

## SC × 시나리오 매트릭스

| SC-ID | 수용 기준 | Happy Path | Edge Case | Error Case | 테스트 파일·함수 | env 태그 |
|---|---|---|---|---|---|---|
| SC-001 | status=PENDING 판매자만 반환 | `when_status_PENDING_then_delegates_with_PENDING(SC-001)` | | | `admin.service.spec.ts` | `[env:unit]` |
| SC-002 | status=APPROVED 판매자만 반환 | `when_status_APPROVED_then_delegates_with_APPROVED(SC-002)` | | | `admin.service.spec.ts` | `[env:unit]` |
| SC-003 | status 미지정→PENDING(하위호환) | | `when_status_undefined_then_defaults_to_PENDING_backward_compat(SC-003)` | `when_status_invalid_then_bad_request(SC-003 Error)` | `admin.service.spec.ts` | `[env:unit]` |
| SC-004 | limit·nextCursor 경계(기본/최대/최소 클램프, 페이지 경계) | | `when_limit_undefined_then_default_clamped_take` / `when_limit_exceeds_max_then_clamped_to_max` / `when_limit_below_one_then_clamped_to_one` / `when_last_page_then_nextCursor_null_and_full_page_then_nextCursor_set` (모두 `(SC-004)`) | | `admin.service.spec.ts` | `[env:unit]` |
| SC-005 | businessName 부분 일치 검색 | `when_q_provided_then_delegates_with_q(SC-005)` | | | `admin.service.spec.ts` | `[env:unit]` |
| SC-006 | 소유 DRAFT 상품 상세(variants·images 포함) | `when_owner_gets_own_DRAFT_product_then_detail_with_variants_images(SC-006)` | | | `product.service.spec.ts` | `[env:unit]` |
| SC-007 | 소유 ACTIVE/OUT_OF_STOCK/INACTIVE 상세도 동일 | | `when_owner_gets_own_%s_product_then_detail_with_variants_images(SC-007)` (it.each × 3) | | `product.service.spec.ts` | `[env:unit]` |
| SC-008 | 타인 소유 상세 조회 → 403 | | | `when_non_owner_gets_product_then_403(SC-008)` | `product.service.spec.ts` | `[env:unit]` |
| SC-009 | 미존재 상품 상세 조회 → 404 (404→403 분기 순서 확인) | | | `when_product_not_found_then_404(SC-009)` | `product.service.spec.ts` | `[env:unit]` |
| SC-010 | 판매자 상품 목록 페이지네이션 | | `when_seller_lists_own_products_with_limit_then_paginated_envelope(SC-010)` / `when_last_page_then_nextCursor_null(SC-010)` | | `product.service.spec.ts` | `[env:unit]` |
| SC-011 | envelope `{items,nextCursor}` 형태(관리자 판매자 목록 + 판매자 상품 목록 양쪽) | `when_response_returned_then_envelope_shape(SC-011)` (admin·product 양쪽 파일) | | | `admin.service.spec.ts` / `product.service.spec.ts` | `[env:unit]` |
| SC-012 | 재고 조회 `{variantId,stock}` | `when_get_stock_view_then_returns_variantId_and_stock` / `when_own_variant_getstock_then_structured_response(SC-012)` | `when_variant_not_found_then_stock_zero` | | `inventory.service.spec.ts` / `inventory.controller.spec.ts` | `[env:unit]` |
| SC-013 | 재고 입고 후 `{variantId,갱신 stock}` | `when_stock_in_succeeds_then_returns_variantId_and_updated_stock` | `when_reread_after_commit_returns_null_then_stock_defaults_to_zero` | | `inventory.service.spec.ts` / `inventory.controller.spec.ts`(`when_own_variant_then_stock_increased` 갱신) | `[env:unit]` |
| SC-014 | 위시리스트 ACTIVE 상품 요약(title·price·thumbnailUrl) | `when_wishlist_item_references_active_product_then_summary_included` | | | `user.service.spec.ts` | `[env:unit]` |
| SC-015 | 최근 본 상품 요약 | `when_recent_view_references_active_product_then_summary_included` | | | `user.service.spec.ts` | `[env:unit]` |
| SC-016 | 위시리스트 조회불가 항목 유지·표시 | | `when_wishlist_item_references_unavailable_product_then_item_kept_with_flag` | | `user.service.spec.ts` | `[env:unit]` |
| SC-017 | 최근 본 상품 조회불가 항목 유지·표시 | | `when_recent_view_references_unavailable_product_then_item_kept_with_flag` | | `user.service.spec.ts` | `[env:unit]` |
| SC-018 | 목록 API(관리자 판매자·판매자 상품) P95 ≤ 500ms | `when_admin_lists_pending_sellers_100_times_then_p95_under_500ms` / `when_seller_lists_own_products_100_times_then_p95_under_500ms` | | | `test/perf/list-p95.e2e-spec.ts` | `[env:integration]` (옵션 A) |
| SC-019 | 신규·확장 엔드포인트 무효/부재 JWT → 401 | `when_inspect_auth_controllers_then_jwt_guard_applied`(정적, `product.controller.ts` 신규 추가) | | | `test/static/auth-required-guards.spec.ts` | `[env:unit]`(spec.md 태그) — 실 구현은 `[env:static]` 정적 검증 |
| SC-020 | 비관리자 admin 목록 조회 → 403 | | | `when_inspect_guards_metadata_then_jwt_and_admin_guard_present(SC-020)` | `admin.controller.spec.ts`(신규) | `[env:unit]` |
| SC-021 | user 모듈 products 스키마 직접 참조 0건 | `when_inspect_user_module_then_no_direct_products_prisma_access` / `when_inspect_user_service_then_product_summaries_use_di_call` | | | `test/static/user-product-boundary.spec.ts`(신규) | `[env:static]` |

> SC-004 는 4개 테스트(기본/최대/최소 클램프 + 페이지 경계)로 분해했으며 모두 Edge 유형이다(경계값 검증 본질).
> SC-019 는 spec.md 상 `[env:unit]` 태그이나 실제 검증 방법은 기존 `auth-required-guards.spec.ts` 파일 컨벤션을 따라
> 정적 코드 검증(`[env:static]`)으로 구현했다(002/003/004-review-coupon 스펙에서도 동일 방식 사용 — 코드베이스 기존 관행 승계).
> SC-013 은 기존 `inventory.controller.spec.ts` 의 `SC-043: stockIn — 소유한 variant 재고 입고 성공` 테스트를
> object 반환 검증으로 갱신하여 컨트롤러 배선까지 함께 확인한다.

---

## §F 마이그레이션 반영 현황

research.md §F(PROC-001) 가 식별한 breaking change 호출측 테스트 7건을 전건 반영했다.

| 대상 파일 | 마이그레이션 내용 | 반영 여부 |
|---|---|---|
| `admin/admin.service.spec.ts` | `listPendingSellers` → `listSellers` 전면 재작성(`describe('listSellers')`) | 완료 |
| `test/banner-admin.e2e-spec.ts` L154-165 | `Array.isArray(res.body)` → `{items,nextCursor}` envelope 단언 | 완료(회귀 FAIL 확정 항목 정정) |
| `product/product.service.spec.ts` L~663-676 | `listMyProducts` array 단언 → envelope + `listBySeller(sellerId,cursor,take)` 호출 인자 단언 | 완료 |
| `inventory/inventory.controller.spec.ts` L85-100(stockIn) | `stockIn.mockResolvedValue(undefined)` → object 반환 | 완료 |
| `inventory/inventory.controller.spec.ts` L167-189(getStock) | `getStock` mock/단언 → `getStockView` mock/단언 | 완료 |
| `inventory/inventory.service.spec.ts` L110-160(stockIn) | `findByVariant` 2회 응답(입고 전/커밋 후 재조회) mock 구성 | 완료 |
| `user/user.service.spec.ts` 전체 | `Test.createTestingModule` providers 에 `{provide: ProductService, useValue: mockProductService}` 추가(DI canonical — 최대 리스크) | 완료 |

> 마이그레이션 불필요 확인(research.md): `test/static/inventory-service-signature.spec.ts` (checkAvailability/decreaseStock 시그니처만 검사, stockIn 반환 변경 범위 밖), `order.service.spec.ts`·`settlement.service.spec.ts` 의 `listBySeller`(OrderRepository/SettlementRepository 소속, product 무관) — 둘 다 실행 결과 회귀 없음을 재확인(아래 §자체 실행 검증 결과).

---

## 외부 의존성 명시

- **fixture**: `product.service.spec.ts` 기존 `FIXED_PRODUCT_DRAFT/ACTIVE/INACTIVE/OOS`, `FIXED_VARIANT`, `FIXED_IMAGE`; `admin.service.spec.ts`·`user.service.spec.ts`·`inventory.*.spec.ts` 기존 FIXED_* 상수 재사용(신규 fixture 최소화).
- **mock**: `mockSellerService.listSellers`(admin), `mockProductRepository.findPublicSummariesByIds`(product), `mockInventoryService.getStockView`(inventory.controller), `mockProductService.getPublicSummaries`(user — DI 신규 추가).
- **환경 변수**: SC-018 e2e 는 `DATABASE_URL`·`JWT_ACCESS_SECRET` 필요(로컬 docker-compose PostgreSQL). `ADMIN_USER_IDS` 는 테스트 파일이 앱 부팅 전 자체 주입(`banner-admin.e2e-spec.ts` 패턴).
- **외부 서비스**: 없음(신규 라이브러리·외부 API 의존 0건 — research.md 확인).
- **DB 시드(SC-018 한정)**: `test/perf/list-p95.e2e-spec.ts` 가 `PrismaService` 로 APPROVED 판매자 1건 + 상품 30건을 자체 시딩·정리한다(외부 사전 시딩 불요, `auth-recovery.e2e-spec.ts` 의 직접 prisma upsert/cleanup 패턴 재사용). `Category` 시드가 전혀 없는 최초 환경에서는 판매자 목록 측정만 스킵된다.

---

## 자체 실행 검증 결과 (AUTHORING 단계 참고용)

PPG-1 병렬 진행 중 4단계 Development Agent 가 A·B·C 레이어(T001~T014)를 이미 완료한 상태였으므로,
작성한 테스트를 로컬에서 1회 자체 실행하여 기본 정합성을 확인했다(정식 SC 커버리지·gate 판정은 5b
EXECUTION 담당 — 본 결과는 AUTHORING 품질 보강을 위한 참고 정보다).

- `pnpm --filter backend typecheck`: **0 errors**.
- `pnpm exec jest`(unit, `src/`): **36 suites / 366 tests 전건 PASS** (기존 362 + 신규 4 `getPublicSummaries` 보조 테스트 포함, 회귀 0건).
- `pnpm exec jest --config test/jest-e2e.json static/*`: `user-product-boundary.spec.ts`·`auth-required-guards.spec.ts`·기존 `cross-schema.spec.ts`·`inventory-service-signature.spec.ts` **전건 PASS**.
- `pnpm exec jest --config test/jest-e2e.json banner-admin perf/list-p95`: 로컬 환경에 `DATABASE_URL`이 이미 설정되어 있어 실측까지 수행됨 — **10/10 PASS**. SC-018 실측치: `admin/sellers/pending` P95=5~25ms, `sellers/me/products` P95=11~15ms (임계값 500ms 대비 여유 큼, 로컬 저부하 환경이므로 절대치보다 harness 정상 동작 확인에 의의).
- 전체 e2e/static 스위트(`pnpm exec jest --config test/jest-e2e.json`) 1회 실행 시 `test/auth.e2e-spec.ts` 에서 7건 실패 관찰 — **본 spec 범위 밖**(로그인/리프레시 토큰 흐름, 017 이 손대지 않은 파일, 이전 테스트 실행의 DB 상태 잔존으로 추정되는 테스트 격리 이슈). SC-XXX 매핑 무관이므로 원인 조사·수정 대상에서 제외한다(agent-rules §실행 범위 — pre-existing 실패 판별 금지 원칙과 별개로, 5b EXECUTION 이 필요 시 별도 판정).

---

## 미커버 항목 (사전 분류 — 4-카테고리)

| SC-ID | 미커버 시나리오 | 카테고리 | 권장 검증 방법 |
|---|---|---|---|
| SC-018 | 실제 운영 유사 규모(1,000건 가까운 데이터) 부하에서의 P95 | (3) 운영 환경에서 확인 권장 | 로컬 자체 시딩(30건)은 harness 검증 목적. 대표성 있는 P95 판정은 사용자 옵션 A 실측(docker-compose + 근접 규모 데이터)으로 5b 가 최종 판정 |
| PROC-014 항목 1 | console `seller/products` 화면이 신규 envelope 으로 정상 렌더링 | (3) 운영 환경에서 확인 권장 | spec.md "사후 운영 검증" 절 그대로 인용 — console 통합 후 수동 확인 |
| PROC-014 항목 2 | console 재고 조회·입고 호출부가 `{variantId,stock}` 신규 응답 정상 소비 | (3) 운영 환경에서 확인 권장 | 상동 |
| PROC-014 항목 3 | 관리자 판매자 목록 대량 데이터(수백~수천 건)에서 무한 스크롤 커서 페이지네이션 정상 동작 | (3) 운영 환경에서 확인 권장 | 상동 |
| PROC-014 항목 4 | 위시리스트/최근 본 상품에 DRAFT·INACTIVE·삭제 상품이 섞인 실사용 시나리오에서 "조회 불가" 표시가 프론트에 의도대로 노출 | (3) 운영 환경에서 확인 권장 | 상동(SC-016/017 은 서비스 레벨 productAvailable 계산까지만 검증, 프론트 렌더링은 범위 밖) |
| — | console(프론트) 측 codegen·화면 배선 | (4) 차후 점검 | 별도 spec(console 실통합) |

> 카테고리 (1) 단위테스트 가능 항목은 0건이다 — SC-001~021 전건이 단위/정적 테스트로 작성·실행·PASS 확인되었다.
> 카테고리 (2) 단위테스트 불가(mock 시뮬레이션 자체 불가능) 항목도 0건이다.
> 카테고리 (3)(4) 만 존재하므로 본 spec 의 AUTHORING 단계는 Development Agent 복귀 요청 없이 5b EXECUTION 으로 위임 가능하다.
