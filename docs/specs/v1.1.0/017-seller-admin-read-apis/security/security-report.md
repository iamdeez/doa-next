---
작성: Security Agent
버전: v1.0
최종 수정: 2026-07-04 00:44
상태: 확정
---

# 보안 감사 결과 — 017-seller-admin-read-apis

## 목차

- [검토 범위](#검토-범위)
- [요약](#요약)
- [Constitution 보안 조항 이행 현황](#constitution-보안-조항-이행-현황)
- [취약점 목록](#취약점-목록)
- [NFR-XXX / SC-XXX 보안 요구사항 이행 현황](#nfr-xxx--sc-xxx-보안-요구사항-이행-현황)
- [권고사항](#권고사항)

---

## 검토 범위

`DIFF-017-seller-admin-read-apis.md`(base `0196b9a`, `apps/backend` 범위 한정) 변경 파일 25개 중,
plan.md "권한 부여·소유권 엔드포인트 인가 3축" 표와 research.md 영향 범위 분석 표를 대조하여
보안 경계(인증·인가·입력 검증·소유권 검증)와 직접 관련된 아래 14개 소스 파일을 직접 Read 로 검토했다.

| 파일 | 검토 사유 |
|---|---|
| `src/modules/admin/admin.controller.ts` | 관리자 판매자 목록 신규 query 파라미터(status·cursor·limit·q) — AdminGuard 경계 |
| `src/modules/admin/admin.service.ts` | status 화이트리스트 검증(`resolveSellerStatus`)·limit 클램프 |
| `src/modules/admin/admin.constants.ts` | 페이지네이션 상수 |
| `src/modules/seller/seller.service.ts` | 신규 공개 `listSellers()` DI 메서드 |
| `src/modules/seller/seller.repository.ts` | `listByStatusPaginated()` — Prisma 파라미터화 쿼리 |
| `src/modules/product/product.controller.ts` | 신규 `SellerProductController`(소유 상품 상세/목록) — IDOR 표면 |
| `src/modules/product/product.service.ts` | `getMyProductDetail`(404→403 순서)·`assertOwner`·`getPublicSummaries` |
| `src/modules/product/product.repository.ts` | `listBySeller`·`findPublicSummariesByIds`(ACTIVE/OUT_OF_STOCK 필터) |
| `src/modules/inventory/inventory.controller.ts` | 재고 조회/입고 응답 구조화 — 소유권 검증 승계 확인 |
| `src/modules/inventory/inventory.service.ts` | `getStockView`·`stockIn` 반환 구조화 |
| `src/modules/inventory/dto/inventory-stock-response.dto.ts` | 응답 DTO |
| `src/modules/user/user.service.ts` | 위시리스트·최근 본 상품 enrichment — 본인 범위·모듈 경계 |
| `src/modules/user/user.module.ts` | `ProductModule` 신규 import (모듈 경계) |
| `src/modules/user/dto/user-response.dto.ts` | 응답 DTO 필드 추가(additive) |

기존 가드 구현(`shared/auth/admin.guard.ts`, `shared/auth/jwt-auth.guard.ts`)은 본 spec에서 변경되지
않았으나, 신규 엔드포인트가 이 가드에 실제로 의존하므로 재확인 목적으로 함께 읽었다.

**제외 파일**: DIFF 변경 파일 중 테스트 파일(`*.spec.ts`, `*.e2e-spec.ts`) 11개는 코드가 아닌 검증
로직이므로 소스 감사 대상에서 제외했고, 대신 테스트가 실제로 보안 경계를 검증하는지 여부만 대조
확인했다(`admin.controller.spec.ts` SC-020, `test/static/auth-required-guards.spec.ts` SC-019,
`test/static/user-product-boundary.spec.ts` SC-021, `test/banner-admin.e2e-spec.ts` 401/403/200 e2e).
`user/dto/user-response.dto.ts` 외 순수 DTO 문서화 파일(`admin-response.dto.ts`)은 보안 로직을
포함하지 않아 필드 노출 범위만 확인(SellerProfileResponse businessNumber 등 기존 admin 전용 DTO
재사용, 신규 노출 표면 아님)했다.

---

## 요약

| 항목 | 값 |
|---|---|
| 검토 대상 소스 파일 | 14개 |
| Critical | 0건 |
| High | 0건 |
| Medium | 0건 |
| Low | 1건 (SEC-017-01) |
| 전체 취약점 | 1건 |

**결론**: Critical/High 취약점 없음. Low 1건은 기존 코드베이스 컨벤션(007 관리자 목록 API)을
승계한 패턴으로, 017 spec 이 신규로 도입한 회귀가 아니다. **status: COMPLETE (gate: PASS)** —
Performance Agent 진행 가능.

---

## Constitution 보안 조항 이행 현황

| 조항 | 이행 여부 | 비고 |
|---|---|---|
| P-001 모듈 경계 원칙 | 이행 | `UserService` 가 `products` 스키마를 직접 쿼리하지 않고 `ProductService.getPublicSummaries()` DI로만 조회. `user.repository.ts` 무변경. `test/static/user-product-boundary.spec.ts`(SC-021)가 `this.prisma.(tx.)?{product\|variant\|category\|productImage\|inventory\|inventoryLog}` 패턴 부재 + `getPublicSummaries(` 호출 존재를 정적 검증. `UserModule`↔`ProductModule` 순환 참조 없음(research.md 실검증 인용) |
| P-002 AWS 의존 금지 | 이행 | 신규 npm 의존 0건(DIFF 커밋 메시지 명시), AWS SDK/서비스 신규 도입 없음 |
| P-003 단일 DB 원칙 | 이행 | 신규 외부 저장소·캐시 도입 없음. 모든 신규 로직은 PostgreSQL 무상태 read(`findMany`/`findUnique`) |
| P-007 스펙 범위 원칙 | 이행 | 검토한 변경 전건이 spec.md FR-001~012 범위 내(BE-GAP-002~007). 범위 외 리팩토링 없음 |

> P-004(클라우드 중립)·P-005(결제·정산 정합성)·P-006(테스트 원칙)은 본 spec 변경 범위(조회 API,
> 결제/정산 비관여)와 직접 관련 없어 보안 감사 대상에서 제외.

---

## 취약점 목록

### SEC-017-01 — 관리자·판매자 목록 API `limit`/`cursor` 쿼리 파라미터 DTO 미검증

- **심각도**: Low
- **OWASP**: A04:2021 Insecure Design (Improper Input Validation)
- **위치**: `admin.controller.ts:37-49`(`listPendingSellers`), `product.controller.ts:53-63`(`listMyProducts`)
- **설명**: 두 엔드포인트 모두 `@Query('limit') limit?: string` 형태로 개별 쿼리 파라미터를 추출한 뒤
  컨트롤러에서 `parseInt(limit, 10)`으로 수동 변환한다. 프로젝트 전역 `ValidationPipe`
  (`main.ts:20-26`, `whitelist`/`forbidNonWhitelisted`/`transform`)는 `@Query() query: SomeDto`
  형태의 class-validator DTO에만 적용되며, 개별 `@Query('name')` 추출 파라미터는 검증 대상이 아니다.
  `limit=abc` 등 비정수 문자열 입력 시 `parseInt`가 `NaN`을 반환하고, 이는 서비스 레이어의
  `Math.max(limit ?? DEFAULT, 1)` / `Math.min(..., MAX)` 클램프 로직을 통과한다(`NaN`은 nullish가
  아니므로 `??` 미적용, `Math.max`/`Math.min` 결과도 `NaN`). 최종적으로 Prisma `findMany({ take: NaN })`
  형태로 전달되어 예기치 않은 런타임 오류(500) 를 유발할 수 있다.
- **영향 평가**: (1) 인증(JwtAuthGuard)·인가(AdminGuard/승인 판매자 검증)를 우회하지 않음 — 데이터
  노출·권한 상승 없음. (2) 커스텀 예외 필터가 없어 NestJS 기본 `ExceptionsHandler`가 처리하며,
  기본 동작상 스택 트레이스를 응답 바디에 노출하지 않음(정보 노출 없음). (3) 단일 요청당 영향이며
  분산 자원 고갈로 이어지는 구조가 아니어서 가용성 영향은 제한적. **동일 패턴이 이 spec 이전부터
  존재하는 `GET /admin/users`·`GET /admin/audit-logs`(007-admin)에도 적용되어 있음** — 017이 새로
  도입한 회귀가 아니라 기존 컨벤션을 그대로 승계한 것.
- **수정 방향**: `class-validator` 기반 Query DTO(`ListSellersDto`, `ListMyProductsDto` 등, 기존
  `ListProductsDto` 패턴 재사용)로 전환하여 `@IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100)`
  검증을 `limit`에 적용. `cursor`는 `@IsOptional() @IsString()`으로 타입 고정. 전역 `ValidationPipe`가
  적용되어 비정상 입력 시 400 Bad Request로 처리된다.
- **상태**: OPEN (권고, 블로킹 아님)

---

## NFR-XXX / SC-XXX 보안 요구사항 이행 현황

| ID | 요구사항 | 이행 여부 | 비고 |
|---|---|---|---|
| NFR-002 | 신규·확장 인증 필요 엔드포인트는 무효/누락 JWT 시 401 | 이행 | `AdminController`(class-level `@UseGuards(JwtAuthGuard, AdminGuard)`), `SellerProductController`(`@UseGuards(JwtAuthGuard)`), `InventoryController`(`@UseGuards(JwtAuthGuard)`) 전건 확인. `test/static/auth-required-guards.spec.ts`(SC-019)가 컨트롤러 소스 텍스트 파싱으로 `JwtAuthGuard` 적용 여부를 정적 검증하며 대상 목록에 `product.controller.ts` 신규 등재 확인 |
| NFR-003 | 관리자 전용 목록 조회는 `ADMIN_USER_IDS` 미포함 사용자에게 403(fail-closed) | 이행 | `admin.guard.ts`의 `AdminGuard.canActivate()`가 `ADMIN_USER_IDS` 미설정/빈 값 시 전원 거부하는 fail-closed 로직을 그대로 유지(017에서 변경 없음). `admin.controller.spec.ts`(SC-020)가 `Reflect.getMetadata(GUARDS_METADATA, AdminController)`로 클래스 레벨 가드 유지를 회귀 방어. `test/banner-admin.e2e-spec.ts`가 admin 라우트 403 e2e 확인 |
| NFR-004 | user 모듈이 products 스키마를 직접 쿼리하지 않고 product 모듈 DI로만 조회(P-001) | 이행 | `user.service.ts` 생성자에 `ProductService` 주입, `enrichWithProductSummary()`가 `this.productService.getPublicSummaries(...)` 호출로만 상품 정보 획득. `user.repository.ts` 무변경. `test/static/user-product-boundary.spec.ts`(SC-021) 2개 테스트(부재 검증 + 양성 DI 호출 검증) 정적 확인 |
| SC-008 | 판매자가 소유하지 않은 상품 ID 조회 시 403 | 이행 | `getMyProductDetail()` — `findById` → 404 → `assertOwner`(seller.id !== product.sellerId → 403) 순서. `assertOwner`는 `getApprovedSeller` 경유로 미승인 판매자도 403 처리(IDOR 방어 + 승인 상태 검증 동시 충족) |
| SC-009 | 존재하지 않는 상품 ID 조회 시 404 | 이행 | `getMyProductDetail()`이 `assertOwner` 호출 이전에 `findById` null 체크로 404를 먼저 반환(순서 고정, plan.md 명시 관례 재사용) |
| SC-012/013 | 재고 조회·입고는 소유 variant만 접근 가능 | 이행 | `InventoryController.getStock`/`stockIn` 모두 `productService.assertSellerOwnsVariant(user.userId, variantId)`(기존 SEC-002) 선행 호출 유지 — 응답 구조화(017)와 무관하게 소유권 검증 로직 자체는 변경 없음 |
| SC-014~017 | 위시리스트·최근 본 상품 조회는 본인 데이터만, 상품 정보는 조회 가능(ACTIVE/OUT_OF_STOCK) 상태만 노출 | 이행 | `findWishlistsByUser(userId)`/`findRecentViews(userId, ...)`로 본인 범위 한정. `findPublicSummariesByIds()`가 `status: { in: [ACTIVE, OUT_OF_STOCK] } }` 필터를 적용해 DRAFT/INACTIVE 상품의 title·price·이미지가 위시리스트·최근 본 상품 응답을 통해 노출되지 않음(간접 정보 노출 방지) |
| SC-019 | 신규·확장 엔드포인트 JWT 미검증 시 401 | 이행 | 위 NFR-002 동일 |
| SC-020 | 비관리자 판매자 목록 조회 시도 403 | 이행 | 위 NFR-003 동일 |
| SC-021 | user 모듈 products 스키마 직접 참조 금지 정적 검증 | 이행 | 위 NFR-004 동일 |

---

## 권고사항

1. **SEC-017-01 (Low, 비블로킹)**: `admin/sellers/pending`·`sellers/me/products`의 `limit`/`cursor`
   쿼리 파라미터를 class-validator DTO로 전환 권고. 기존 `ListProductsDto` 패턴 재사용 시 낮은
   구현 비용으로 해소 가능. Critical/High가 아니므로 본 spec을 블로킹하지 않으며, 후속 spec 또는
   별도 리팩토링에서 처리 가능. 동일 패턴을 사용하는 `admin/users`·`admin/audit-logs`(007-admin,
   본 spec 범위 밖)도 함께 정정하는 것이 일관성 측면에서 바람직하다.
2. **Retrospective → context.md §6 등재 권고**: SEC-017-01은 admin/product 도메인 전반에 반복되는
   패턴(017 신규 도입이 아닌 007 기존 승계)이므로, 프로젝트 특정 기술 부채로서
   `context.md §6 알려진 제약`에 "cursor 페이지네이션 엔드포인트의 개별 `@Query()` 파라미터가
   DTO 검증을 우회함(admin·seller·product 목록 API 공통)" 취지로 additive 등재를 권고한다. 후속
   처리(별도 patch spec 신설 또는 기존 spec 편입 여부)는 main session·사용자 결정 사항이다.
3. **모듈 경계 설계 우수 사례**: `getPublicSummaries()`가 ACTIVE/OUT_OF_STOCK 상태 필터를 응답
   경계에서 적용하여, 위시리스트·최근 본 상품 enrichment 경로를 통한 DRAFT 상품 정보의 간접 노출을
   원천 차단한 설계는 향후 유사 cross-domain 조인 설계의 참조 패턴으로 유지 권고.
4. **IDOR 방어 일관성**: `assertOwner`(product)·`assertSellerOwnsVariant`(inventory) 모두 "존재
   확인(404) → 소유권 확인(403)" 순서를 일관되게 재사용하고 있다. 향후 신규 소유권 기반 엔드포인트
   추가 시에도 이 순서·패턴을 유지할 것을 권고한다(정보 노출 최소화 — 미존재 자원과 타인 소유 자원을
   동일한 순서로 구분해 반환).
