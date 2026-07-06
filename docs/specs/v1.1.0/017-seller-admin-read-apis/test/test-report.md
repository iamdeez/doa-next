---
작성: Test Agent (EXECUTION)
버전: v1.0
최종 수정: 2026-07-04 00:29
상태: 확정
---

# 테스트 실행 결과

## 목차

- [실행 요약](#실행-요약)
- [실패 목록](#실패-목록)
- [SC 미커버 항목](#sc-미커버-항목)
- [plan.md 매핑표 검증](#planmd-매핑표-검증)
- [설계 문서 정합성](#설계-문서-정합성)
- [회귀 탐지](#회귀-탐지)
- [SC-018 실측 결과 (사용자 옵션 A)](#sc-018-실측-결과-사용자-옵션-a)
- [STALE_SC 경고 요약](#stale_sc-경고-요약)

---

## 실행 요약

실행 범위: 본 spec(017)의 SC-001~021 매핑 테스트 전건(unit + static + integration). 전체 회귀
스위트는 CI 위임(agent-rules §실행 범위 원칙). plan.md smoke_tests 는 불필요(N) 확정.

| 구분 | 스위트 | 테스트 | 결과 |
|---|---|---|---|
| typecheck | `pnpm --filter backend typecheck` | — | **0 errors** |
| unit (전체 회귀 포함) | 36 suites | 366 tests | **366 PASS / 0 FAIL** |
| SC-001~017,020 unit(SC 매핑 파일 재확인) | admin.service/controller, product.service, inventory.service/controller, user.service | 89 tests | **89 PASS** |
| static (SC-019/021 + 공유) | auth-required-guards, user-product-boundary, cross-schema, inventory-service-signature | 4 suites / 25 tests | **25 PASS** |
| integration (SC-011 회귀, SC-018) | banner-admin.e2e-spec.ts, perf/list-p95.e2e-spec.ts | 2 suites / 10 tests | **10 PASS** |

> unit 전체(366)는 SC-001~021 매핑 대상 89건을 포함한 전체 회귀 스위트로, 본 spec 변경(admin/
> product/inventory/user 서비스·컨트롤러, DTO)의 §F 마이그레이션 정합을 함께 확인하기 위해
> 전체 실행했다(회귀 0건 확인 목적 — agent-rules §실행 범위 의 "SC 매핑 테스트만 실행" 원칙과
> 별개로, 동일 파일 내 기존 테스트가 다수 혼재해 파일 단위 실행이 곧 전체 스위트 실행과 동일함).

**전체 e2e/static 스위트 1회 전체 실행(비-SC-매핑 범위 포함) 관찰**: `test/auth.e2e-spec.ts` 7건
실패 — 본 spec 이 손대지 않은 로그인/리프레시 토큰 흐름 파일이며 SC-001~021 매핑 밖. agent-rules
§실행 범위 원칙에 따라 pre-existing 여부 판별(git stash 등) 시도하지 않았고, SC 매핑 밖이므로 본
gate 판정에서 제외한다(5a AUTHORING 자체 실행 시에도 동일 관찰·동일 판단, test-cases.md §자체 실행
검증 결과 참조).

**Breaking change 잔여 참조 검증**: `grep -rn "\.listPendingSellers("` 결과 잔여 서비스 레벨 호출
0건(컨트롤러 핸들러 메서드명 `listPendingSellers` 자체는 T011 설계대로 라우트 경로 유지 목적으로
존치 — breaking change 대상 아님). `AdminService.listPendingSellers`(구 메서드) 참조 0건.

---

## 실패 목록

없음. 본 spec SC 매핑 테스트 전건 통과(0 FAIL).

---

## SC 미커버 항목

없음. SC-001~021 전건에 대응하는 테스트가 존재하고 전건 PASS. 카테고리 (1)(2) 미커버 0건
(coverage-gap.md 참조 — 카테고리 (3)(4)만 존재).

---

## plan.md 매핑표 검증

**SC 매핑 테이블**:

| SC-ID | 관련 테스트 | 통과 여부 | 미커버 근본원인 |
|---|---|---|---|
| SC-001 | `admin.service.spec.ts::when_status_PENDING_then_delegates_with_PENDING(SC-001)` | PASS | - |
| SC-002 | `admin.service.spec.ts::when_status_APPROVED_then_delegates_with_APPROVED(SC-002)` | PASS | - |
| SC-003 | `admin.service.spec.ts::when_status_undefined_then_defaults_to_PENDING_backward_compat(SC-003)` / `when_status_invalid_then_bad_request(SC-003 Error)` | PASS | - |
| SC-004 | `admin.service.spec.ts::when_limit_undefined_then_default_clamped_take(SC-004)` 외 3건(최대/최소 클램프·페이지 경계) | PASS | - |
| SC-005 | `admin.service.spec.ts::when_q_provided_then_delegates_with_q(SC-005)` | PASS | - |
| SC-006 | `product.service.spec.ts::when_owner_gets_own_DRAFT_product_then_detail_with_variants_images(SC-006)` | PASS | - |
| SC-007 | `product.service.spec.ts::when_owner_gets_own_%s_product_then_detail_with_variants_images(SC-007)` (it.each ×3: ACTIVE/OUT_OF_STOCK/INACTIVE) | PASS | - |
| SC-008 | `product.service.spec.ts::when_non_owner_gets_product_then_403(SC-008)` | PASS | - |
| SC-009 | `product.service.spec.ts::when_product_not_found_then_404(SC-009)` | PASS | - |
| SC-010 | `product.service.spec.ts::when_seller_lists_own_products_with_limit_then_paginated_envelope(SC-010)` / `when_last_page_then_nextCursor_null(SC-010)` | PASS | - |
| SC-011 | `admin.service.spec.ts::when_response_returned_then_envelope_shape(SC-011)` / `product.service.spec.ts::when_response_returned_then_envelope_shape(SC-011)` / `test/banner-admin.e2e-spec.ts::when_admin_lists_pending_sellers_then_200_envelope(SC-011)` | PASS | - |
| SC-012 | `inventory.service.spec.ts::when_get_stock_view_then_returns_variantId_and_stock` / `inventory.controller.spec.ts::when_own_variant_getstock_then_structured_response(SC-012)` | PASS | - |
| SC-013 | `inventory.service.spec.ts::when_stock_in_succeeds_then_returns_variantId_and_updated_stock` / `when_reread_after_commit_returns_null_then_stock_defaults_to_zero` | PASS | - |
| SC-014 | `user.service.spec.ts::when_wishlist_item_references_active_product_then_summary_included` | PASS | - |
| SC-015 | `user.service.spec.ts::when_recent_view_references_active_product_then_summary_included` | PASS | - |
| SC-016 | `user.service.spec.ts::when_wishlist_item_references_unavailable_product_then_item_kept_with_flag` | PASS | - |
| SC-017 | `user.service.spec.ts::when_recent_view_references_unavailable_product_then_item_kept_with_flag` | PASS | - |
| SC-018 | `test/perf/list-p95.e2e-spec.ts::when_admin_lists_pending_sellers_100_times_then_p95_under_500ms` / `when_seller_lists_own_products_100_times_then_p95_under_500ms` | PASS (실측, §SC-018 실측 결과 참조) | - |
| SC-019 | `test/static/auth-required-guards.spec.ts::when_inspect_auth_controllers_then_jwt_guard_applied` | PASS | - |
| SC-020 | `admin.controller.spec.ts::when_inspect_guards_metadata_then_jwt_and_admin_guard_present` (describe `SC-020: ...`) | PASS | - |
| SC-021 | `test/static/user-product-boundary.spec.ts::when_inspect_user_module_then_no_direct_products_prisma_access` / `when_inspect_user_service_then_product_summaries_use_di_call` | PASS | - |

SC-XXX 없는 FR/NFR: 0건(spec.md 요구사항 구조화 매트릭스 재확인, FR-001~012·NFR-001~004 전건
SC 매핑 존재).

---

## 설계 문서 정합성

plan.md "핵심 설계" §1~5 코드 예시를 실제 구현과 대조하여 불일치 0건 확인:

| plan.md 절 | 대조 대상 | 결과 |
|---|---|---|
| §1 admin/seller (L84-107) | `admin.constants.ts`(DEFAULT/MAX_SELLER_PAGE_LIMIT=20/100), `admin-response.dto.ts`(AdminSellerListResponse{items,nextCursor}) | 일치 |
| §2 seller 상품 상세 (L109-127) | `product.service.ts::getMyProductDetail` — 404→403 분기 순서, `assertOwner` 재사용 | 일치 (코드 그대로) |
| §3 상품 목록 (L129-145) | `product.repository.ts::listBySeller` orderBy 2차키(`id desc`), cursor/skip/take | 일치 |
| §4 inventory (L147-162) | `inventory.service.ts::stockIn`(increment→appendLog→onAfterCommit→재조회→반환), `getStockView` | 일치 (코드 라인 단위 동일) |
| §5 user enrichment (L164-200) | `product.service.ts::getPublicSummaries`(Map 변환, thumbnailUrl 첫 이미지), `user-response.dto.ts::WishlistProductSummary/productAvailable` | 일치 |
| ADR-006 DI 경로 (L213) | `user.module.ts` imports ProductModule, 순환 없음(`test/health.e2e-spec.ts` DI 부팅 검증) | 일치 |

불일치 0건 — plan.md 갱신 불요.

---

## 회귀 탐지

- unit 전체 366/366 PASS(4단계 종료 시점 362 + 5a 신규 4건 `getPublicSummaries` 보조 테스트,
  회귀 0건).
- `order.service.spec.ts`·`settlement.service.spec.ts`(product.repository `listBySeller` 시그니처
  변경 영향 검토 대상, research.md §F "마이그레이션 불필요 확인" 목록) 전건 PASS — 각 파일 소속
  Repository(OrderRepository/SettlementRepository)의 `listBySeller` 는 product 모듈과 무관한 별도
  메서드로 확인, 회귀 없음.
- `test/static/cross-schema.spec.ts`·`test/static/inventory-service-signature.spec.ts`(변경 없는
  기존 정적 검증) 전건 PASS — `checkAvailability`·`decreaseStock` 시그니처 불변 확인.
- Breaking change(admin 목록/판매자 목록 envelope, 재고 응답 구조화) 대상 응답 계약 회귀:
  `test/banner-admin.e2e-spec.ts::when_admin_lists_pending_sellers_then_200_envelope(SC-011)` 및
  `inventory.controller.spec.ts` object 반환 단언으로 §F 마이그레이션 반영 확인, 회귀 0건.

---

## SC-018 실측 결과 (사용자 옵션 A)

로컬 `docker-compose` PostgreSQL(컨테이너 `doa-next-postgres-1`, 5일 가동 중) 가용 확인 후
`test/perf/list-p95.e2e-spec.ts` 를 5b 가 직접 재실행하여 실측했다(플랜 옵션 A — "환경 구성 절차
제시 → 사용자 실행" 단계는 이미 로컬 환경이 상시 가동 중이라 즉시 실측 가능했음).

| 대상 | P95 | avg | max | min | 판정(≤500ms) |
|---|---|---|---|---|---|
| `GET /admin/sellers/pending?limit=20` | 3ms | 2ms | 19ms | 1ms | PASS |
| `GET /sellers/me/products?limit=20` | 4ms | 3ms | 7ms | 2ms | PASS |

측정 조건: 30건 상품 시딩(SEED_PRODUCT_COUNT), 각 100회 반복 호출, 데이터 1,000건 미만(NFR-001
조건 승계). 임계값 500ms 대비 여유가 크므로 로컬 저부하 환경 특성을 감안해도 harness·구현 정상
동작을 신뢰할 수 있는 수준으로 판정한다. 대표성 있는 운영 유사 규모 부하는
coverage-gap.md 카테고리(3)로 위임.

---

## STALE_SC 경고 요약

STALE_SC 27건 발견 후 사용자 결정(옵션 A — 일괄 정정) 수신, grep+Edit 으로 6개 파일의 선행 spec
SC 인용 문구를 PATCH-A18 정규식 형식(`(vX.Y.Z/NNN spec)`)으로 정정 완료(coverage.md §STALE_SC
경고 섹션 "정정 완료(옵션 A)" 참조). production 코드·테스트 로직·기대 단언은 불변(주석 인용
문구만 변경). 정정 후 재실행 결과 unit 366/366, static+e2e(6 suites) 33/33 전건 PASS, 회귀 0건.
STALE_SC 잔존 0건.
