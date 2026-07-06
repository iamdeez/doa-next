---
작성: Design Agent (Docs Agent·Performance Agent 추가 항목 포함)
버전: v1.2
최종 수정: 2026-07-04 00:51
상태: 진행중 (GAP-017-01·02·03 OPEN — Retrospective Agent 위임)
---

# Gaps: 017-seller-admin-read-apis

> 3단계 Design Agent 가 최초 생성. 이후 모든 Phase Agent 가 누적 기록한다.
> 형식: `pipeline-conventions.md §6`. 해결된 GAP 은 해당 Agent 가 `RESOLVED by [Agent 공식명]` 으로 갱신한다.

## 목차

- [GAP 목록](#gap-목록)

---

## GAP 목록

### GAP-017-01 — context.md §6 위시리스트/최근본상품 고아 참조 제약의 부분 완화 미반영

- **유형**: 문서-갱신-필요
- **출처**: Design Agent
- **컨텍스트**: user 모듈 위시리스트·최근 본 상품 enrichment(FR-012 / T010·T014)
- **상태**: OPEN (6단계 Docs Agent 위임)
- **내용**: context.md §6 "알려진 제약"에 "위시리스트·최근 본 상품의 productId 는 cross-schema plain String 으로 삭제된 상품을 가리킬 수 있다(고아 참조)" 취지 제약이 있다. 본 spec 의 FR-012(ADR-007) 가 이 고아 참조를 응답 레벨에서 `productAvailable: false` 표시로 **부분 흡수**한다(스키마 레벨 제약 자체는 잔존). 6단계 Docs Agent 가 §6 항목에 "응답은 productAvailable 표시로 흡수됨(017)" 보강을 검토하도록 가시화한다. 오류(부정합)가 아닌 갱신 권고.
- **영향 범위**: `.claude/docs/context.md §6` (문서만 — 코드 영향 없음)

### GAP-017-02 — context.md §2 핵심 도메인 모듈 목록 admin/seller/product/inventory/user 5개 행 갱신 필요

- **유형**: 문서-갱신-필요
- **출처**: Docs Agent
- **컨텍스트**: 6단계 문서화 — CHANGES.md/DIFF-017 작성 중 context.md §2 대조
- **상태**: OPEN (Retrospective Agent 위임)
- **내용**: context.md §2 "핵심 도메인 모듈 목록" 표의 5개 행이 본 spec 의 신규 조회 계약을 반영하지
  못한다. 코드 검증(Read) 완료 근거는 다음과 같다:
  - **admin 행**: "운영 — 판매자 승인 대기/승인(SellerService.approve 재사용)·사용자 목록 + 조치 감사
    로그" 서술에 상태 필터·검색·페이지네이션 언급 없음. 코드 검증: `admin.controller.ts:37`
    `listPendingSellers(status?, cursor?, limit?, q?)`, `admin.service.ts:37-48`
    `listSellers()`→`SellerService.listSellers()` 위임, 응답이 `SellerProfile[]` → `{items,
    nextCursor}` envelope 으로 변경(breaking). 갱신 권고: "판매자 목록(상태 필터 PENDING/APPROVED/
    REJECTED·businessName 검색·cursor 페이지네이션, `{items,nextCursor}`)" 문구 추가.
  - **seller 행**: "판매자 등록·심사·판매자 정보" 서술에 신규 공개 DI 메서드 언급 없음. 코드 검증:
    `seller.service.ts:125` `listSellers({status, cursor, take, q})`(신규, admin 소비),
    `seller.repository.ts` `listByStatusPaginated()`(신규). 갱신 권고: "신규 공개 `listSellers()`
    (admin DI 소비)" 문구 추가.
  - **product 행**: "상품/카테고리/옵션/이미지" 서술에 신규 엔드포인트·DI 메서드 언급 없음. 코드 검증:
    `product.controller.ts:68` 신규 `GET products/:id`(`getMyProductDetail`), `product.service.ts:268`
    (404→403 assertOwner 재사용), `product.controller.ts:53`/`product.service.ts:276`
    `listMyProducts` cursor 페이지네이션+envelope 화(breaking, console `seller/products` 배선됨 —
    배포 동기화 필요), `product.service.ts:293` 신규 공개 `getPublicSummaries(productIds)`(user 모듈
    DI 소비). 갱신 권고: "판매자 소유 상품 상세(`GET /sellers/me/products/:id`, 상태 무관)·목록
    페이지네이션·`getPublicSummaries()`(user 모듈 DI 제공)" 문구 추가.
  - **inventory 행**: "재고/입출고 로그/SKU" 서술에 응답 구조화 언급 없음. 코드 검증:
    `inventory.service.ts:76` `getStockView()`(신규, `{variantId,stock}`), `inventory.service.ts:49`
    `stockIn()` 반환형 `void`→`InventoryStockView`(breaking, 상태코드 200 불변). 갱신 권고: "재고
    조회·입고 응답 `{variantId, stock}` 구조화(breaking, 015 이전 원시 숫자/void 대체)" 문구 추가.
  - **user 행**: "프로필/배송지/찜(wishlist)/최근 본 상품/등급" 서술에 상품 요약 조인 언급 없음. 코드
    검증: `user.service.ts:162` `listWishlist()`·`user.service.ts:187` `listRecentViews()` 가
    `product.service.ts:293` `getPublicSummaries()` DI 호출로 `productAvailable`+`product` 병합,
    `user.module.ts:9` 신규 `ProductModule` import. 갱신 권고: "위시리스트·최근 본 상품 응답에 상품
    요약(title·price·thumbnailUrl) 인라인 조인 — `ProductService.getPublicSummaries()` DI 경유,
    조회 불가 상품은 `productAvailable:false`로 유지" 문구 추가.
  - **§1 개요 스냅샷 부수 권고**: 테스트 카운트 서술("unit 255 PASS(25 suites)")이 016 이후 실측치
    (unit 366 PASS·36 suites, test-report.md 5b 실행 기준)와 어긋난다. 갱신 시 병행 정정 권고(이력
    테이블 신규 행 아님 — §1 은 스냅샷 필드, PROC-003 금지 대상 아님).
- **영향 범위**: `.claude/docs/context.md §1(개요 스냅샷 텍스트)·§2(핵심 도메인 모듈 목록 표)` (문서만 — 코드 영향 없음)

### GAP-017-03 — 신규 cursor 페이지네이션 쿼리(관리자 판매자 목록·판매자 상품 목록)의 뒷받침 인덱스 부재

- **유형**: 성능-후속-권고
- **출처**: Performance Agent
- **컨텍스트**: FR-002(`SellerRepository.listByStatusPaginated`)·FR-006(`ProductRepository.listBySeller`) cursor 페이지네이션 쿼리 플랜 검토
- **상태**: OPEN (별도 spec 권고 — 비블로킹)
- **내용**: `schema.prisma` 실코드 확인 결과 `Product` 모델은 `sellerId` 를 포함하는 인덱스가 없고
  (`@@index([status, createdAt(sort: Desc), id(sort: Desc)])` 만 존재, `listPublic` 공개 목록 전용),
  `Seller` 모델은 `status` 를 포함하는 인덱스가 전혀 없다(PK `id`·unique `userId` 뿐). 로컬
  docker-compose PostgreSQL(`doa-next-postgres-1`)에 직접 접속해 `EXPLAIN` 실행 결과, 두 쿼리
  (`WHERE "sellerId" = $1 ORDER BY "createdAt" DESC, id DESC` / `WHERE status = $1 ORDER BY
  "createdAt" DESC, id DESC`) 모두 `Seq Scan` + `Sort` 로 확정됐다(인덱스 미사용). 현재 데이터
  규모(products 9건·sellers 1건)에서는 비용이 무시할 수준(NFR-001 SC-018 실측 P95 3~4ms, 임계값
  500ms 대비 여유 큼)이나, 두 인덱스 부재는 테이블이 성장할수록(특히 `products` — 판매자 1인당
  상품 수 증가) O(테이블 전체) 스캔 비용으로 확대되는 구조적 특성이다. Performance Agent 는 본 spec
  plan.md Constitution Gates(P-007 스펙 범위 원칙 — "신규 마이그레이션은 범위 외 명시", "PASS")
  근거에 따라 이번 spec 범위에서 인덱스 추가(신규 Prisma 마이그레이션)를 직접 적용하지 않았다(구현
  수준 최적화이나 명시적으로 범위 제외된 변경 — constitution P-007 위반 회피, Security Agent
  SEC-017-01 과 동일한 "권고·비블로킹" 처리 패턴 승계). 후속 spec 또는 별도 리팩토링에서 다음 인덱스
  추가를 권고한다: `Product` 모델에 `@@index([sellerId, createdAt(sort: Desc), id(sort: Desc)])`,
  `Seller` 모델에 `@@index([status, createdAt(sort: Desc), id(sort: Desc)])`(기존 `products` 모델의
  `status` 복합 인덱스 패턴과 동일 구조).
- **영향 범위**: `apps/backend/prisma/schema.prisma`(`Product`·`Seller` 모델, 신규 마이그레이션 필요),
  `SellerRepository.listByStatusPaginated`·`ProductRepository.listBySeller` 소비 경로(코드 변경 불요,
  인덱스만 추가). NFR-001 미달성 아님(현재 조건 PASS) — 순수 확장성 대비 권고.

> 현재 미해결 GAP: 3건 (GAP-017-01, GAP-017-02, GAP-017-03 — 누적 5건 초과 아님 — 경고 없음).
