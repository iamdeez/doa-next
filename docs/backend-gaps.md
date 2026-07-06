# 백엔드 API 계약 갭 (console 발견)

> `apps/console`(판매자·관리자 콘솔)을 백엔드의 **안정화된 001-skeleton / 002-catalog API**에
> 붙이며 발견한 백엔드 계약 갭 모음이다. 후속 백엔드 spec(또는 002 보강)의 입력 자료로 사용한다.
>
> - **기준 시점**: 2026-06-28, base commit `bf92cd4` (002-catalog 완료 시점).
> - **범위**: 003-commerce(cart/order/payment)는 별도 진행 중이며 본 문서 범위 밖이다.
> - **근거**: 각 항목은 `apps/backend` 실제 코드(컨트롤러·서비스·DTO·prisma)를 근거로 한다.
> - **console 우회**: 각 갭에 대해 console 이 현재 어떻게 우회하는지 명시한다. 상세는
>   `apps/console/README.md` "백엔드 계약 갭" 절과 동기화한다.

## 목차

- [심각도 분류](#심각도-분류)
- [갭 목록](#갭-목록)
  - [BE-GAP-001 — 관리자 자기 식별 수단 부재](#be-gap-001--관리자-자기-식별-수단-부재)
  - [BE-GAP-002 — 관리자용 판매자 목록 조회 API 부재](#be-gap-002--관리자용-판매자-목록-조회-api-부재)
  - [BE-GAP-003 — 판매자용 상품 상세(any status) 조회 부재](#be-gap-003--판매자용-상품-상세any-status-조회-부재)
  - [BE-GAP-004 — 판매자 상품 목록 페이지네이션 부재](#be-gap-004--판매자-상품-목록-페이지네이션-부재)
  - [BE-GAP-005 — 재고 조회 응답이 원시 숫자](#be-gap-005--재고-조회-응답이-원시-숫자)
  - [BE-GAP-006 — 목록 응답 형태 불일치(배열 vs CursorPage)](#be-gap-006--목록-응답-형태-불일치배열-vs-cursorpage)
  - [BE-GAP-007 — 위시리스트·최근 본 상품이 productId 만 반환](#be-gap-007--위시리스트최근-본-상품이-productid-만-반환)
- [요약 표](#요약-표)
- [후속 처리 방향](#후속-처리-방향)

---

## 심각도 분류

| 표기 | 의미 |
|---|---|
| 🔴 Blocking | 기능을 정상 구현할 수 없어 console 이 우회/제한을 강제당함 |
| 🟡 Consistency | 동작은 하나 일관성·확장성 관점에서 개선 필요 |

---

## 갭 목록

### BE-GAP-001 — 관리자 자기 식별 수단 부재

**심각도**: 🔴 Blocking → ✅ **해소됨** (v1.1.0/012 console-phase4, 커밋 `381b5eb` "isAdmin 노출")

> **해소 근거 (현행 코드 검증 2026-07-03)**: `GET /auth/me` → `getProfile`(`auth.service.ts:200-206`)가
> `isAdmin`(`isAdminUserId(userId, ADMIN_USER_IDS)` 기준, AdminGuard 와 동일)을 반환한다.
> 응답 타입 `AuthProfileResponse.isAdmin: boolean`(`auth-response.dto.ts:39`). 아래 원문은 이력 보존용.

**현재 동작 (근거)**
- `GET /auth/me` → `{ id, email, createdAt }` 만 반환 (`auth.service.ts` `getProfile`, L177). 역할/권한 클레임 없음.
- JWT 검증 결과도 `{ userId, email }` 만 (`shared/auth/jwt.strategy.ts` `validate`, L34).
- 관리자는 토큰이 아닌 환경변수 `ADMIN_USER_IDS` 로만 판별된다 (`shared/auth/admin.guard.ts`, fail-closed).

**영향**
- 프론트가 "현재 사용자가 관리자인가"를 알 방법이 없다. 관리자 전용 메뉴/화면의 표시 여부를 토큰 기반으로 결정할 수 없다.

**console 우회**
- admin 라우트를 항상 노출하되, 실제 액션(`PATCH /sellers/:id/approve|reject`)은 백엔드 `AdminGuard` 가 최종 강제(403)하고 UI 가 이를 graceful 처리. `lib/auth.tsx` 의 `isAdmin` 은 현재 항상 `false`.

**제안**
- `GET /auth/me` 응답에 `isAdmin: boolean`(또는 `roles: string[]`) 추가. `AdminGuard` 와 동일한 `ADMIN_USER_IDS` 기준 사용.

---

### BE-GAP-002 — 관리자용 판매자 목록 조회 API 부재

**심각도**: 🔴 Blocking

**현재 동작 (근거)**
- `seller.controller.ts` 의 관리자 대상 엔드포인트는 `PATCH /sellers/:id/approve`, `PATCH /sellers/:id/reject` 두 개의 **변경(action)** 만 존재.
- 승인 대기(PENDING) 판매자를 **조회**하는 엔드포인트(`GET /sellers` 등)가 없다.

**영향**
- 관리자 승인 화면(`admin/sellers`)에 표시할 데이터 소스가 없다. 승인/반려 액션은 가능하나 대상 목록을 가져올 수 없다.

**console 우회**
- `admin/sellers` 를 플레이스홀더로 둠(목록 API 추가 시 실데이터 연결).

**제안**
- `GET /sellers?status=PENDING`(admin-guarded, cursor 페이지네이션) 추가. 상태 필터·검색 파라미터 포함.

---

### BE-GAP-003 — 판매자용 상품 상세(any status) 조회 부재

**심각도**: 🔴 Blocking

**현재 동작 (근거)**
- `GET /products/:id`(`product.service.ts` `getDetail`)는 상태가 `ACTIVE` 또는 `OUT_OF_STOCK` 인 경우만 반환하고, 그 외(`DRAFT`/`INACTIVE`)는 `NotFoundException`(404). 상세에는 `variants`·`images` 포함(`product.repository.ts` `findById` include).
- `GET /sellers/me/products`(`listBySeller`)는 소유 상품 전체를 반환하지만 **variants/images 미포함**(`product.repository.ts` `listBySeller` — include 없음).
- 결과적으로 판매자가 **DRAFT 상품의 옵션(variant)을 되읽을** 엔드포인트가 없다.

**영향**
- 상품 생성 직후(DRAFT) 옵션 등록 단계에서 등록된 옵션 목록을 조회할 수 없다. 정상적인 "DRAFT → 옵션/재고 등록 → 게시" 워크플로우의 조회 단계가 비어 있다.

**console 우회**
- 상품 관리 화면(`seller/products/[id]`)은 `GET /products/:id` 404 시 "옵션 추가 + 게시" 패널로 우회. 옵션은 `POST /products/:id/variants` 응답의 `id` 로 즉시 재고 입고 가능. **게시(publish) 후** 전체 옵션 목록이 표시된다.

**제안**
- `GET /sellers/me/products/:id`(소유 상품은 상태 무관 반환, variants+images 포함) 추가. 또는 `listBySeller` 에 variants include 추가.

---

### BE-GAP-004 — 판매자 상품 목록 페이지네이션 부재

**심각도**: 🟡 Consistency

**현재 동작 (근거)**
- `GET /sellers/me/products`(`listBySeller`)는 `findMany({ where: { sellerId }, orderBy })` 로 **전체 배열**을 반환. cursor/limit 미지원.

**영향**
- 상품 수가 많은 판매자에서 응답이 무한정 커진다. public 목록(`GET /products`)은 cursor 기반인데 판매자 목록만 비대칭.

**console 우회**
- 전체 배열을 그대로 렌더링(현재 스캐폴딩 단계라 허용).

**제안**
- `GET /sellers/me/products` 에 cursor·limit 추가하여 public 목록과 동일한 `{ items, nextCursor }` 형태로 통일(BE-GAP-006 과 연계).

---

### BE-GAP-005 — 재고 조회 응답이 원시 숫자

**심각도**: 🟡 Consistency

**현재 동작 (근거)**
- `GET /inventory/:variantId/stock` → 서비스 `getStock` 이 `number` 를 그대로 반환(`inventory.service.ts` `getStock`). 응답 본문이 `5` 같은 원시 숫자.
- `POST /inventory/:variantId/stock-in` → `void`(본문 없음, 200).

**영향**
- 원시 숫자 응답은 향후 필드 추가(예: `reserved`, `updatedAt`) 시 하위호환을 깨뜨린다. 입고 응답이 비어 있어 갱신된 재고를 알려면 재조회 필요.

**console 우회**
- `getStock` 을 `Promise<number>` 로 타입 지정. 입고 후 `['stock', variantId]` 쿼리 무효화로 재조회.

**제안**
- `{ variantId, stock }` 형태 객체 envelope 로 반환. 입고 응답도 갱신된 재고 객체 반환 고려.

---

### BE-GAP-006 — 목록 응답 형태 불일치(배열 vs CursorPage)

**심각도**: 🟡 Consistency

**현재 동작 (근거)**
- `GET /products`(public) → `{ items, nextCursor }`(`product.service.ts` `listPublic`).
- `GET /sellers/me/products` → 원시 배열(`listBySeller`).
- `GET /categories` → 원시 배열(`findCategories`).

**영향**
- 동일 도메인(상품)인데 목록 응답 형태가 엔드포인트마다 달라, 클라이언트가 엔드포인트별로 분기해야 한다.

**console 우회**
- `@doa/shared-types` 에서 `CursorPage<T>`(envelope)와 배열 반환을 엔드포인트별로 구분하여 타입 지정.

**제안**
- 페이지네이션이 필요한 목록은 `{ items, nextCursor }` 로 통일. 고정 소형 목록(categories)은 배열 유지 가능하나 규칙을 문서화.

---

### BE-GAP-007 — 위시리스트·최근 본 상품이 productId 만 반환

**심각도**: 🟡 Consistency

**현재 동작 (근거)**
- `GET /users/me/wishlist`(`user.service.ts` `listWishlist` → `findWishlistsByUser`)는 `{ id, userId, productId, createdAt }` 행을 반환. 상품 정보 미조인.
- `GET /users/me/recent-views`(`listRecentViews`)도 `{ id, userId, productId, viewedAt }` 만 반환.
- prisma `Wishlist`·`ProductView` 의 `productId` 는 cross-schema plain String 으로 FK 미선언(P-001 경계).

**영향**
- 위시리스트/최근 본 상품 화면에서 상품명·가격·이미지를 표시하려면 productId 별로 별도 상품 조회가 필요하다(N+1). 게다가 `GET /products/:id` 는 ACTIVE/OUT_OF_STOCK 만 반환(BE-GAP-003)하여 비활성 상품은 조회 자체가 불가하다.

**console 우회**
- `account/wishlist` 화면은 productId 를 그대로 노출. 상품 정보 enrichment 는 보류.

**제안**
- 응답에 상품 요약(`title`·`price`·대표 이미지) 포함, 또는 productId 배열을 받아 상품 요약을 일괄 반환하는 `POST /products/batch-summary` 류 엔드포인트 제공.

---

## 요약 표

| ID | 심각도 | 영역 | 한 줄 요약 | console 우회 가능 |
|---|---|---|---|---|
| BE-GAP-001 | ✅ 해소됨 | auth | `GET /auth/me` 에 관리자/역할 정보 없음 → **`isAdmin` 반환(012, `381b5eb`)** | — |
| BE-GAP-002 | 🔴 | seller(admin) | 관리자용 판매자 목록 조회 API 없음 | 불가(플레이스홀더) |
| BE-GAP-003 | 🔴 | product | DRAFT 상품 상세·옵션 조회 API 없음 | 부분(POST 응답+publish) |
| BE-GAP-004 | 🟡 | product | 판매자 상품 목록 페이지네이션 없음 | 가능 |
| BE-GAP-005 | 🟡 | inventory | 재고 조회가 원시 숫자 반환 | 가능 |
| BE-GAP-006 | 🟡 | 공통 | 목록 응답 형태(배열/envelope) 불일치 | 가능 |
| BE-GAP-007 | 🟡 | user | 위시리스트·최근 본 상품이 productId 만 반환(상품 미조인) | 가능 |

---

## 후속 처리 방향

- 🔴 **001 은 012(console-phase4, `381b5eb`)에서 해소됨.** 잔여 🔴 2건(002·003)은 console 의 관리자 기능과 상품 관리 워크플로우를 정상화하려면 백엔드 보강이 필요하다.
  신규 spec(예: `0xx-seller-admin-read-apis`)으로 묶어 처리하는 것을 제안한다.
- 🟡 3건(004·005·006)은 일관성·확장성 개선으로, 위 보강 spec 에 함께 포함하거나 별도 리팩토링 spec 으로 분리한다.
- 본 문서는 console 가 새 갭을 발견할 때마다 갱신한다. 백엔드에서 해소된 항목은 "해소됨(spec/커밋 참조)"으로 표기 후 일정 기간 뒤 제거한다.
