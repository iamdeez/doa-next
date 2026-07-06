---
작성: Test Agent (EXECUTION)
버전: v1.0
최종 수정: 2026-07-04 00:29
상태: 확정
---

# Coverage: 017-seller-admin-read-apis

## 목차

- [SC × 시나리오 매트릭스](#sc--시나리오-매트릭스)
- [SC당 매핑 가지수 통계](#sc당-매핑-가지수-통계)
- [환경 태그 라우팅](#환경-태그-라우팅)
- [STALE_SC 경고](#stale_sc-경고-현재-spec-에-없는-sc-번호가-docstring-에-잔존)

---

## SC × 시나리오 매트릭스

> "수용 기준" 열은 spec.md SC-001~021 원문을 그대로 복사했다(PATCH-001 원문 대조 가드).
> "검증 파일" 열은 Read/Glob 으로 실재 확인된 경로만 기재했다. "태스크" 열은 tasks.md 실재 T-ID.

| SC-ID | 수용 기준 | Happy Path | Edge Case | Error Case | plan.md 시나리오 전체 | 상태 |
|---|---|---|---|---|---|---|
| SC-001 | 관리자가 상태 파라미터로 PENDING을 지정하여 판매자 목록을 조회하면 PENDING 상태 판매자만 반환된다. | PASS (`admin.service.spec.ts`, T015) | — | — | 커버 | PASS |
| SC-002 | 관리자가 상태 파라미터로 APPROVED를 지정하여 판매자 목록을 조회하면 APPROVED 상태 판매자만 반환된다. | PASS (`admin.service.spec.ts`, T015) | — | — | 커버 | PASS |
| SC-003 | 관리자가 상태 파라미터 없이 판매자 목록을 조회하면 기존 동작과 동일하게 PENDING 상태 판매자만 반환된다(하위 호환 회귀 없음). | — | PASS (`admin.service.spec.ts`, T015 — 미지정→PENDING) | PASS (`admin.service.spec.ts`, T015 — 유효하지 않은 status→400) | 커버 | PASS |
| SC-004 | 관리자가 `limit`을 지정하여 판매자 목록을 조회하면 지정 개수 이하로 반환되고, 다음 페이지가 존재하면 `nextCursor`가 null이 아니며, 마지막 페이지에서는 `nextCursor`가 null이다. | — | PASS ×4 (`admin.service.spec.ts`, T015 — 기본/최대/최소 클램프 + 페이지 경계) | — | 커버 | PASS |
| SC-005 | 관리자가 판매자 상호명의 일부 문자열로 검색하면 해당 문자열을 포함하는 businessName의 판매자만 반환된다. | PASS (`admin.service.spec.ts`, T015) | — | — | 커버 | PASS |
| SC-006 | 승인된 판매자가 자신 소유의 DRAFT 상태 상품을 ID로 상세 조회하면, 해당 상품의 variants·images가 포함된 응답이 반환된다. | PASS (`product.service.spec.ts`, T016) | — | — | 커버 | PASS |
| SC-007 | 승인된 판매자가 자신 소유의 ACTIVE/OUT_OF_STOCK/INACTIVE 상태 상품을 ID로 상세 조회해도 동일하게 variants·images가 포함된 응답이 반환된다. | — | PASS ×3 it.each (`product.service.spec.ts`, T016) | — | 커버 | PASS |
| SC-008 | 판매자가 소유하지 않은 상품 ID로 FR-004 조회를 시도하면 403이 반환된다. | — | — | PASS (`product.service.spec.ts`, T016) | 커버 | PASS |
| SC-009 | 존재하지 않는 상품 ID로 FR-004 조회를 시도하면 404가 반환된다. | — | — | PASS (`product.service.spec.ts`, T016) | 커버 | PASS |
| SC-010 | 승인된 판매자가 `limit`을 지정하여 자신의 상품 목록을 조회하면 지정 개수 이하로 반환되고, 다음 페이지 존재 여부가 `nextCursor`로 표현된다. | — | PASS ×2 (`product.service.spec.ts`, T017) | — | 커버 | PASS |
| SC-011 | FR-002(관리자 판매자 목록)와 FR-006(판매자 상품 목록) 조회 응답이 모두 `items`·`nextCursor` 필드를 갖는 동일한 envelope 형태임을 응답 스키마 검증으로 확인한다. | PASS ×3 (`admin.service.spec.ts` / `product.service.spec.ts`, T017; `test/banner-admin.e2e-spec.ts` 회귀, T023) | — | — | 커버 | PASS |
| SC-012 | 승인된 판매자가 자신 소유 variant의 재고를 조회하면 응답에 `variantId`와 `stock`(현재 수량) 필드가 포함된다. | PASS ×2 (`inventory.service.spec.ts` / `inventory.controller.spec.ts`, T018) | PASS (`inventory.service.spec.ts` — variant 미존재 시 stock=0, T018) | — | 커버 | PASS |
| SC-013 | 승인된 판매자가 자신 소유 variant에 재고를 입고하면 응답에 `variantId`와 입고 후 갱신된 `stock` 값이 포함된다. | PASS (`inventory.service.spec.ts`, T018) | PASS (`inventory.service.spec.ts` — 커밋 후 재조회 null→0 방어, T018) | — | 커버 | PASS |
| SC-014 | 인증된 사용자가 위시리스트에 담긴 ACTIVE 상태 상품을 조회하면, 각 항목에 title·price·대표 이미지 URL이 포함되어 반환된다. | PASS (`user.service.spec.ts`, T019) | — | — | 커버 | PASS |
| SC-015 | 인증된 사용자가 최근 본 상품 목록을 조회하면, 각 항목에 title·price·대표 이미지 URL이 포함되어 반환된다. | PASS (`user.service.spec.ts`, T019) | — | — | 커버 | PASS |
| SC-016 | 위시리스트에 담긴 상품이 삭제되었거나 DRAFT/INACTIVE 상태인 경우, 해당 위시리스트 항목은 응답에서 누락되지 않고 상품 조회 불가 여부가 표시된 채로 반환된다. | — | PASS (`user.service.spec.ts`, T019) | — | 커버 | PASS |
| SC-017 | 최근 본 상품 목록에서도 동일하게, 참조 상품이 조회 불가 상태인 항목이 누락 없이 유지되고 조회 불가 여부가 표시된다. | — | PASS (`user.service.spec.ts`, T019) | — | 커버 | PASS |
| SC-018 | FR-002·FR-006 목록 조회 API의 P95 응답 시간이 500ms 이하다(로컬 docker-compose 환경, 데이터 1,000건 미만). | PASS ×2 실측 — P95=3ms(admin/sellers/pending), P95=4ms(sellers/me/products) (`test/perf/list-p95.e2e-spec.ts`, T022) | — | — | 커버 (5b 실측 완료, 사용자 옵션 A) | PASS |
| SC-019 | 본 spec의 신규·확장 엔드포인트에 유효하지 않거나 없는 JWT로 요청 시 401이 반환된다. | PASS 정적 검증 (`test/static/auth-required-guards.spec.ts`, T021) | — | — | 커버([env:static]로 구현, spec.md [env:unit] 태그와 실 구현 태그 불일치는 test-cases.md 에 사유 명시 — 기존 코드베이스 002/003/004 관행 승계) | PASS |
| SC-020 | `ADMIN_USER_IDS`에 포함되지 않은 사용자가 관리자 판매자 목록 조회를 시도하면 403이 반환된다. | — | — | PASS (`admin.controller.spec.ts`, T021) | 커버 | PASS |
| SC-021 | user 모듈의 Repository/Service 코드가 products 스키마 Prisma 모델을 직접 참조하지 않고, product 모듈의 공개 서비스 메서드(DI)만 호출함을 코드 정적 검사로 확인한다. | PASS ×2 (`test/static/user-product-boundary.spec.ts`, T020) | — | — | 커버 | PASS |

**결론**: SC-001~021 전건 PASS(21/21). deferred(env:e2e-docker 등 미실행) SC 없음 — SC-018(옵션 A)도
5b 가 직접 실측 완료. plan.md 테스트 전략 매핑표(SC-001~021, 수준·유형·시나리오) 전건 반영 확인.

---

## SC당 매핑 가지수 통계

| SC-ID | 총 테스트 함수 수 | Happy | Edge | Error |
|---|---|---|---|---|
| SC-001 | 1 | 1 | 0 | 0 |
| SC-002 | 1 | 1 | 0 | 0 |
| SC-003 | 2 | 0 | 1 | 1 |
| SC-004 | 4 | 0 | 4 | 0 |
| SC-005 | 1 | 1 | 0 | 0 |
| SC-006 | 1 | 1 | 0 | 0 |
| SC-007 | 3 | 0 | 3 | 0 |
| SC-008 | 1 | 0 | 0 | 1 |
| SC-009 | 1 | 0 | 0 | 1 |
| SC-010 | 2 | 0 | 2 | 0 |
| SC-011 | 3 | 3 | 0 | 0 |
| SC-012 | 3 | 2 | 1 | 0 |
| SC-013 | 2 | 1 | 1 | 0 |
| SC-014 | 1 | 1 | 0 | 0 |
| SC-015 | 1 | 1 | 0 | 0 |
| SC-016 | 1 | 0 | 1 | 0 |
| SC-017 | 1 | 0 | 1 | 0 |
| SC-018 | 2 | 2 | 0 | 0 |
| SC-019 | 1 | 1 | 0 | 0 |
| SC-020 | 1 | 0 | 0 | 1 |
| SC-021 | 2 | 2 | 0 | 0 |
| **합계** | **35** | **16** | **14** | **5** |

평균 SC당 매핑 1.67개(35/21). 모든 SC 최소 1개 이상 테스트 보유(0건 SC 없음).

---

## 환경 태그 라우팅

| env 태그 | 대상 SC | 처리 |
|---|---|---|
| `[env:unit]` | SC-001~017, SC-020 | 5b 직접 검증 완료 |
| `[env:static]` | SC-019(실구현), SC-021 | 5b 직접 검증 완료 |
| `[env:integration]` | SC-018, SC-011(banner-admin e2e 회귀 방어) | 5b 직접 검증 완료(로컬 docker-compose 가용, deferred 없음) |

태그 누락 SC 없음(spec.md 전건 `[env:*]` 태그 명시 확인).

---

## STALE_SC 경고 (현재 spec 에 없는 SC 번호가 docstring 에 잔존)

**정정 완료(옵션 A) — STALE_SC 0건.**

사용자 결정: 옵션 A(일괄 정정) 확정. §F 마이그레이션 파일 5건의 선행 spec SC 인용 문구를
PATCH-A18 출처 정규식(`\(v\d+\.\d+\.\d+/\d+\s+spec\)`)에 부합하는 `(vX.Y.Z/NNN spec)` 형식으로
grep+Edit 일괄 정정했다. production 코드·테스트 로직·기대 단언은 불변(주석/docstring 인용 문구만
변경). 정정 후 대상 스위트 재실행으로 회귀 0건 확인(unit 366/366, static+e2e 33/33 전건 PASS —
아래 "정정 내역" 표 하단 재실행 결과 참조).

**정정 내역**:

| 정정 전 표기 | 정정 후 표기 | 파일 | 원 출처 |
|---|---|---|---|
| `(002-catalog 계승)` | `(v1.0.0/002 spec) 계승` | `src/modules/product/product.service.spec.ts` (L4) | v1.0.0/002-catalog |
| `(002/003 계승)` | `(v1.0.0/002 spec)(v1.0.0/003 spec) 계승` | `src/modules/inventory/inventory.controller.spec.ts` (L4) | v1.0.0/002-catalog · v1.0.0/003-commerce |
| `(002-catalog 계승)` | `(v1.0.0/002 spec) 계승` | `src/modules/inventory/inventory.service.spec.ts` (L4) | v1.0.0/002-catalog |
| `(003-commerce 신규 — ...)` | `(v1.0.0/003 spec) 신규 — ...` | `src/modules/inventory/inventory.service.spec.ts` (L5, L354) | v1.0.0/003-commerce |
| `(002-catalog 계승)` | `(v1.0.0/002 spec) 계승` | `src/modules/user/user.service.spec.ts` (L5) | v1.0.0/002-catalog |
| `(002-catalog, NFR-002 관련)` 외 | `(v1.0.0/002 spec)(NFR-002 관련)` 외(SC-007→v1.0.0/003, SC-052→v1.0.0/004 동일 패턴 적용, 헤더·컨트롤러 목록 주석·`it()` 블록 docstring 전 위치 포함 14개 인용점) | `test/static/auth-required-guards.spec.ts` (L5-7, 23, 29, 35, 58, 62, 67, 95-96, 100, 157) | v1.0.0/002-catalog · v1.0.0/003-commerce · v1.0.0/004-review-coupon |
| `SC-047 P95 측정 패턴 재사용` (인용 없음) | `SC-047(v1.0.0/002 spec) P95 측정 패턴 재사용` | `test/perf/list-p95.e2e-spec.ts` (L6) | v1.0.0/002-catalog(추정, `test/products.e2e-spec.ts` GET /products P95) |

**정정 후 검증**:
- `grep -rnE "\((00[234]-[a-z-]+)" {6개 파일}` → 0건(비정형 인용 잔존 없음).
- `grep -noE "\(v[0-9]+\.[0-9]+\.[0-9]+/[0-9]+ spec\)" {6개 파일}` → 각 SC 번호 인접 위치에 정규식
  매칭 인용 전건 확인(예: auth-required-guards.spec.ts 14곳, product.service.spec.ts 헤더 포함
  5곳).
- `pnpm --filter backend typecheck`: 0 errors(재실행).
- `pnpm exec jest`(unit): 36 suites / 366 tests 전건 PASS(재실행, 회귀 0).
- `pnpm exec jest --config test/jest-e2e.json`(대상 6개 static/e2e 스위트): 6 suites / 33 tests
  전건 PASS(재실행, 회귀 0) — `list-p95.e2e-spec.ts`(SC-018 재실측 포함), `auth-required-guards`,
  `user-product-boundary`, `banner-admin`, `cross-schema`, `inventory-service-signature`.

STALE_SC 잔존 0건(git diff 변경 파일 범위 재점검 완료).
