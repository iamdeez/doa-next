---
작성: Spec Agent
버전: v1.0
최종 수정: 2026-07-03 [spawn 기준 22:44 — Bash 도구 미제공]
상태: 검토중
---

# Spec: 017-seller-admin-read-apis

> Branch: 017-seller-admin-read-apis | Date: 2026-07-03 | Version: v1.1.0

## 목차

- [배경 및 목적](#배경-및-목적)
- [사용자 스토리](#사용자-스토리)
- [기능 요구사항](#기능-요구사항)
- [비기능 요구사항](#비기능-요구사항)
- [수용 기준](#수용-기준)
- [요구사항 구조화 매트릭스](#요구사항-구조화-매트릭스)
- [선행 spec 영향 추적](#선행-spec-영향-추적-predecessor-lineage)
- [범위 외](#범위-외)
- [미결 사항](#미결-사항)

---

## 배경 및 목적

`apps/console`(판매자·관리자 통합 콘솔)이 안정화된 001-skeleton/002-catalog API에 실통합을 진행하며
`docs/backend-gaps.md`에 6건의 백엔드 계약 갭(BE-GAP-002~007)을 발견·기록했다. 본 spec은 이 중 잔여
6건을 해소한다(BE-GAP-001은 이미 v1.1.0/012에서 해소됨 — `GET /auth/me`의 `isAdmin` 노출).

**코드 현황 재검증 결과 (2026-07-03 실코드 확인)**: `docs/backend-gaps.md`는 2026-06-28(base commit
`bf92cd4`) 시점 기준으로 작성되어 이후 진행된 013(admin-audit-log) 작업 결과를 반영하지 못한 부분이
있다. 구체적으로 **BE-GAP-002는 문서상 "API 부재"로 기재되어 있으나, 실제로는 `GET /admin/sellers/pending`
엔드포인트가 이미 존재한다**(`AdminController.listPendingSellers`, `admin.controller.ts`). 다만 이
엔드포인트는 상태가 PENDING으로 고정되어 있고 페이지네이션·검색 파라미터가 없어(`SellerProfile[]` 원시
배열 반환), console이 필요로 하는 상태 필터링·검색·대용량 목록 대응 기능은 여전히 부재하다. 본 spec의
BE-GAP-002 관련 요구사항은 이 기존 엔드포인트의 **확장**으로 재정의한다. `apps/console/README.md`의
"목록 API 대기/플레이스홀더" 서술도 동일하게 stale하다. BE-GAP-003~007은 실코드 대조 결과 문서 기재와
일치함을 확인했다.

잔여 갭이 console의 관리자 승인 워크플로우와 판매자 상품 관리 워크플로우를 정상화하는 데 필요한 이유:

- **관리자 승인 화면**(BE-GAP-002, 🔴): 승인/거부 액션 API는 있으나 심사 이력(승인·거부된 판매자) 조회,
  검색, 대용량 목록 대응 수단이 없어 운영 화면이 PENDING 단건 페이지에 머물러 있다.
- **판매자 상품 관리 화면**(BE-GAP-003, 🔴): DRAFT 상품 등록 직후 등록한 옵션을 되읽을 방법이 없어,
  "DRAFT → 옵션/재고 등록 → 게시" 워크플로우의 조회 단계가 비어 있다. console은 현재 게시(publish) 후에만
  전체 옵션 목록을 표시하는 우회로 동작한다.
- **일관성·확장성**(BE-GAP-004~007, 🟡): 판매자 상품 목록의 페이지네이션 부재, 재고 응답의 원시 숫자화,
  목록 응답 형태의 엔드포인트 간 불일치, 위시리스트·최근 본 상품의 상품 정보 미조인은 당장 기능을 막지는
  않으나 확장성·클라이언트 구현 복잡도에 부담을 준다.

`apps/worker`(pg-boss 별도 프로세스)는 본 spec 범위에 포함하지 않는다 — 모든 대상 작업은 backend
인-프로세스 조회 로직 확장으로 충분하며, 별도 백그라운드 잡 처리가 필요하지 않다(Stage 2+ 보류 대상).

---

## 사용자 스토리

- **US-001**: 관리자로서, 판매자 목록을 심사 상태별로 필터링·검색하고 페이지네이션으로 조회하여 승인
  워크플로우를 운영하고 싶다.
- **US-002**: 판매자로서, 등록 직후(DRAFT) 내 상품의 옵션·이미지를 다시 조회하여 게시 전 등록 내용을
  확인하고 싶다.
- **US-003**: 판매자로서, 상품이 많아져도 내 상품 목록을 끊김 없이(페이지네이션) 조회하고 싶다.
- **US-004**: 판매자로서, 재고 조회·입고 결과를 구조화된 형태로 받아 프론트 화면에 바로 반영하고 싶다.
- **US-005**: 구매자로서, 위시리스트·최근 본 상품 목록에서 상품명·가격·이미지를 productId 재조회 없이
  바로 확인하고 싶다.

---

## 기능 요구사항

### [admin/seller 모듈] — BE-GAP-002 (관리자용 판매자 목록)

- **FR-001**: 관리자는 판매자 목록을 심사 상태(PENDING/APPROVED/REJECTED)로 필터링하여 조회할 수 있다.
  상태를 지정하지 않으면 기존 동작과 동일하게 PENDING 상태 판매자만 반환된다(하위 호환).
- **FR-002**: 관리자는 판매자 목록을 cursor 기반 페이지네이션(cursor·limit)으로 조회할 수 있다.
- **FR-003**: 관리자는 판매자 상호명(businessName) 부분 일치 검색으로 판매자 목록을 필터링할 수 있다.

### [seller/product 모듈] — BE-GAP-003 (판매자 상품 상세)

- **FR-004**: 승인된 판매자는 자신이 소유한 상품을 상품 상태(DRAFT 포함 전체 상태)와 무관하게 ID로 단건
  상세 조회할 수 있으며, 응답에는 해당 상품의 옵션(variant) 목록과 이미지 목록이 포함된다.
- **FR-005**: 판매자가 소유하지 않은 상품 ID로 FR-004의 상세 조회를 시도하면 조회가 거부된다. 존재하지
  않는 상품 ID로 조회를 시도해도 조회가 거부된다.

### [seller/product 모듈] — BE-GAP-004 (판매자 상품 목록 페이지네이션)

- **FR-006**: 승인된 판매자는 자신의 상품 목록을 cursor 기반 페이지네이션(cursor·limit)으로 조회할 수
  있다.

### [공통] — BE-GAP-006 (목록 응답 형태 통일)

- **FR-007**: FR-002(관리자 판매자 목록)와 FR-006(판매자 상품 목록)의 응답은 기존 공개 상품 목록
  (`GET /products`)과 동일하게 `{ items, nextCursor }` 형태로 통일된다. 본 spec에서 변경하지 않는 기존
  소형 고정 목록(예: 카테고리 목록)은 배열 형태를 유지한다.

### [inventory 모듈] — BE-GAP-005 (재고 응답 구조화)

- **FR-008**: 승인된 판매자가 재고 수량을 조회하면, 응답은 variantId와 현재 재고 수량을 포함하는
  구조화된 객체로 반환된다(기존 원시 숫자 반환을 대체).
- **FR-009**: 승인된 판매자가 재고를 입고하면, 입고 처리 결과로 variantId와 입고 후 갱신된 재고 수량을
  포함하는 구조화된 객체가 응답된다(기존 무응답(void)을 대체).

### [user 모듈] — BE-GAP-007 (위시리스트·최근 본 상품 상품 요약)

- **FR-010**: 인증된 사용자가 위시리스트를 조회하면, 각 항목에 해당 상품의 요약 정보(제목·가격·대표
  이미지 URL)가 포함되어 반환된다.
- **FR-011**: 인증된 사용자가 최근 본 상품 목록을 조회하면, 각 항목에 해당 상품의 요약 정보(제목·가격·
  대표 이미지 URL)가 포함되어 반환된다.
- **FR-012**: 위시리스트 또는 최근 본 상품 항목이 참조하는 상품이 존재하지 않거나 조회 불가 상태
  (ACTIVE·OUT_OF_STOCK이 아닌 상태, 예: DRAFT·INACTIVE, 또는 삭제됨)인 경우, 해당 항목은 목록에서
  제외되지 않고 유지되며 상품 정보 조회 불가 여부를 나타내는 표시와 함께 반환된다.

> 식별자(FR-XXX)는 요구사항 구조화 매트릭스·SC-XXX와 1:1 추적된다.

---

## 비기능 요구사항

- **NFR-001**: FR-002·FR-006으로 신설되는 cursor 페이지네이션 목록 조회 API의 P95 응답 시간은 500ms
  이하여야 한다. (측정 조건: 로컬 docker-compose PostgreSQL 환경, 데이터 1,000건 미만 —
  `v1.0.0/002-catalog` NFR-001과 동일 조건 승계)
- **NFR-002**: 본 spec으로 신설·확장되는 모든 인증 필요 엔드포인트는 유효하지 않거나 없는 JWT로 요청 시
  401을 반환해야 한다.
- **NFR-003**: 관리자 전용 목록 조회(FR-001~003)는 `ADMIN_USER_IDS`에 포함되지 않은 사용자에게 403을
  반환해야 한다(기존 AdminGuard, fail-closed 원칙 승계).
- **NFR-004**: 위시리스트·최근 본 상품의 상품 정보 조회(FR-010~012)는 user 모듈이 products 스키마
  테이블을 직접 쿼리하지 않고, product 모듈의 공개 서비스 인터페이스(DI)를 통해서만 조회해야 한다
  (constitution P-001 모듈 경계 원칙).

---

## 수용 기준

> 환경 태그 규약: `[env:static]` 코드·설정 정적 검증 / `[env:unit]` 단위 테스트 / `[env:integration]` 앱 기동 후 검증

### admin/seller 모듈 (BE-GAP-002)

- **SC-001** (FR-001): 관리자가 상태 파라미터로 PENDING을 지정하여 판매자 목록을 조회하면 PENDING
  상태 판매자만 반환된다. `[env:unit]`
- **SC-002** (FR-001): 관리자가 상태 파라미터로 APPROVED를 지정하여 판매자 목록을 조회하면 APPROVED
  상태 판매자만 반환된다. `[env:unit]`
- **SC-003** (FR-001): 관리자가 상태 파라미터 없이 판매자 목록을 조회하면 기존 동작과 동일하게 PENDING
  상태 판매자만 반환된다(하위 호환 회귀 없음). `[env:unit]`
- **SC-004** (FR-002): 관리자가 `limit`을 지정하여 판매자 목록을 조회하면 지정 개수 이하로 반환되고,
  다음 페이지가 존재하면 `nextCursor`가 null이 아니며, 마지막 페이지에서는 `nextCursor`가 null이다.
  `[env:unit]`
- **SC-005** (FR-003): 관리자가 판매자 상호명의 일부 문자열로 검색하면 해당 문자열을 포함하는
  businessName의 판매자만 반환된다. `[env:unit]`

### seller/product 모듈 (BE-GAP-003, BE-GAP-004)

- **SC-006** (FR-004): 승인된 판매자가 자신 소유의 DRAFT 상태 상품을 ID로 상세 조회하면, 해당 상품의
  variants·images가 포함된 응답이 반환된다. `[env:unit]`
- **SC-007** (FR-004): 승인된 판매자가 자신 소유의 ACTIVE/OUT_OF_STOCK/INACTIVE 상태 상품을 ID로 상세
  조회해도 동일하게 variants·images가 포함된 응답이 반환된다. `[env:unit]`
- **SC-008** (FR-005): 판매자가 소유하지 않은 상품 ID로 FR-004 조회를 시도하면 403이 반환된다.
  `[env:unit]`
- **SC-009** (FR-005): 존재하지 않는 상품 ID로 FR-004 조회를 시도하면 404가 반환된다. `[env:unit]`
- **SC-010** (FR-006): 승인된 판매자가 `limit`을 지정하여 자신의 상품 목록을 조회하면 지정 개수 이하로
  반환되고, 다음 페이지 존재 여부가 `nextCursor`로 표현된다. `[env:unit]`

### 공통 (BE-GAP-006)

- **SC-011** (FR-007): FR-002(관리자 판매자 목록)와 FR-006(판매자 상품 목록) 조회 응답이 모두 `items`·
  `nextCursor` 필드를 갖는 동일한 envelope 형태임을 응답 스키마 검증으로 확인한다. `[env:unit]`

### inventory 모듈 (BE-GAP-005)

- **SC-012** (FR-008): 승인된 판매자가 자신 소유 variant의 재고를 조회하면 응답에 `variantId`와
  `stock`(현재 수량) 필드가 포함된다. `[env:unit]`
- **SC-013** (FR-009): 승인된 판매자가 자신 소유 variant에 재고를 입고하면 응답에 `variantId`와 입고
  후 갱신된 `stock` 값이 포함된다. `[env:unit]`

### user 모듈 (BE-GAP-007)

- **SC-014** (FR-010): 인증된 사용자가 위시리스트에 담긴 ACTIVE 상태 상품을 조회하면, 각 항목에 title·
  price·대표 이미지 URL이 포함되어 반환된다. `[env:unit]`
- **SC-015** (FR-011): 인증된 사용자가 최근 본 상품 목록을 조회하면, 각 항목에 title·price·대표 이미지
  URL이 포함되어 반환된다. `[env:unit]`
- **SC-016** (FR-012): 위시리스트에 담긴 상품이 삭제되었거나 DRAFT/INACTIVE 상태인 경우, 해당 위시리스트
  항목은 응답에서 누락되지 않고 상품 조회 불가 여부가 표시된 채로 반환된다. `[env:unit]`
- **SC-017** (FR-012): 최근 본 상품 목록에서도 동일하게, 참조 상품이 조회 불가 상태인 항목이 누락 없이
  유지되고 조회 불가 여부가 표시된다. `[env:unit]`

### 비기능 요구사항

- **SC-018** (NFR-001): FR-002·FR-006 목록 조회 API의 P95 응답 시간이 500ms 이하다(로컬 docker-compose
  환경, 데이터 1,000건 미만). `[env:integration]`
- **SC-019** (NFR-002): 본 spec의 신규·확장 엔드포인트에 유효하지 않거나 없는 JWT로 요청 시 401이
  반환된다. `[env:unit]`
- **SC-020** (NFR-003): `ADMIN_USER_IDS`에 포함되지 않은 사용자가 관리자 판매자 목록 조회를 시도하면
  403이 반환된다. `[env:unit]`
- **SC-021** (NFR-004): user 모듈의 Repository/Service 코드가 products 스키마 Prisma 모델을 직접
  참조하지 않고, product 모듈의 공개 서비스 메서드(DI)만 호출함을 코드 정적 검사로 확인한다.
  `[env:static]`

---

## 요구사항 구조화 매트릭스

> 매핑 누락(SC 없는 FR/NFR, FR/NFR 없는 SC) 0건이 완료 조건이다.

| US-ID | FR-ID | NFR-ID | SC-ID | [env:*] | MoSCoW |
|---|---|---|---|---|---|
| US-001 | FR-001 | — | SC-001, SC-002, SC-003 | unit | Must |
| US-001 | FR-002 | — | SC-004 | unit | Must |
| US-001 | FR-003 | — | SC-005 | unit | Must |
| US-002 | FR-004 | — | SC-006, SC-007 | unit | Must |
| US-002 | FR-005 | — | SC-008, SC-009 | unit | Must |
| US-003 | FR-006 | — | SC-010 | unit | Should |
| US-001, US-003 | FR-007 | — | SC-011 | unit | Should |
| US-004 | FR-008 | — | SC-012 | unit | Should |
| US-004 | FR-009 | — | SC-013 | unit | Should |
| US-005 | FR-010 | — | SC-014 | unit | Should |
| US-005 | FR-011 | — | SC-015 | unit | Should |
| US-005 | FR-012 | — | SC-016, SC-017 | unit | Should |
| — | — | NFR-001 | SC-018 | integration | Must |
| — | — | NFR-002 | SC-019 | unit | Must |
| — | — | NFR-003 | SC-020 | unit | Must |
| — | — | NFR-004 | SC-021 | static | Must |

---

## 선행 spec 영향 추적 (Predecessor Lineage)

| 선행 spec | 식별된 결함 항목 | 결함 인지 시점 | 식별 경로 |
|---|---|---|---|
| v1.0.0/002-catalog | BE-GAP-003·004·005·006·007 — DRAFT 상품 옵션 재조회 불가, 판매자 목록 무제한 배열,
  재고 원시 숫자, 목록 응답 형태 비대칭, 위시리스트/최근 본 상품 상품 미조인 | 2026-06-28 | `apps/console` 실통합
  작업 중 발견(사후 코드 검토), `docs/backend-gaps.md` 기록 |
| v1.1.0/013-admin-audit-log | BE-GAP-002 — 관리자 판매자 목록 API 부재로 문서화되었으나, 013 작업으로
  `GET /admin/sellers/pending`(상태 고정·페이지네이션 없음)이 이미 생성되어 **부분 해소** 상태였음 | 2026-07-03
  (본 spec 작성 중 실코드 재검증으로 식별) | Spec Agent 코드 현황 재검증(PATCH-013-02) |

---

## 범위 외

다음 항목들은 이번 spec에서 의도적으로 제외한다.

**프로세스 범위 외**
- `apps/worker`(pg-boss 별도 프로세스) 관련 작업 — 모든 대상 조회 로직은 backend 인-프로세스 처리로
  충분하며 별도 백그라운드 잡이 필요하지 않다(Stage 2+ 보류).
- `003-commerce`(cart/order/payment) 도메인 — 별도 spec으로 진행 중, 본 문서 범위 밖.

**console(프론트엔드) 측 작업**
- console의 실제 화면 배선(`admin/sellers`, `seller/products` 목록 렌더링, `account/wishlist` 화면의
  상품 요약 표시) 및 API 클라이언트 타입 갱신은 본 spec 범위 밖이다(백엔드 계약 변경만 다룬다).
- **배포 순서 고려사항**: FR-007(목록 응답 envelope 통일)과 FR-008~009(재고 응답 구조화)는 기존 원시
  배열/숫자 응답과 호환되지 않는 breaking change다. `apps/console`의 `seller/products` 화면(README상
  "실통합 데모"로 이미 배선됨)과 재고 조회·입고 호출부는 이 변경 배포 전에 함께 갱신되어야 회귀가 없다.
  `admin/sellers`·`account/wishlist` 화면은 현재 미배선(플레이스홀더)이라 이 순서 문제에서 자유롭다.

**의도적 축소 범위**
- BE-GAP-006(목록 응답 형태 통일)은 본 spec에서 신규/변경되는 목록(관리자 판매자 목록, 판매자 상품 목록)
  2건에 한정한다. `GET /categories` 등 기존 소형 고정 배열 목록의 envelope 전환은 포함하지 않는다
  (constitution P-007 스펙 범위 원칙).
- BE-GAP-007의 구현 방식(응답 내 인라인 조인 vs 별도 batch-summary 엔드포인트 재사용)은 HOW 결정이므로
  Planning 단계에 위임한다. spec은 "응답에 상품 요약이 포함되어야 한다"는 WHAT만 규정한다.
- 신규 Prisma 마이그레이션 없음 — 모든 변경은 기존 테이블·컬럼 범위 내 응답 DTO/조회 로직 확장이다.

**사후 운영 검증 피드백 사이클 (PROC-014)**

본 spec 파이프라인 종료 후 운영/console 통합 환경에서 점검이 필요한 시나리오:

1. console의 `seller/products` 화면(이미 실통합됨)이 신규 `{ items, nextCursor }` envelope으로 정상
   렌더링되는지 확인(배열 → envelope 전환에 따른 프론트 회귀 여부).
2. console의 재고 조회·입고 호출부가 신규 `{ variantId, stock }` 응답 형태를 정상 소비하는지 확인.
3. 관리자 판매자 목록 API를 대량 데이터(수백~수천 건)로 조회했을 때 커서 페이지네이션이 무한 스크롤
   방식으로 정상 동작하는지 확인.
4. 위시리스트/최근 본 상품에 DRAFT·INACTIVE·삭제된 상품이 섞인 실사용 시나리오에서 "조회 불가" 표시가
   프론트에 의도대로 노출되는지 확인.

사후 결함 발견 시: spec.md "배경 및 목적" 절 또는 hotfix spec 입력 → main session의 "spec 수정" 이벤트 →
1단계 재진입. 직전 cycle 산출물은 `_ai-workspace/cycle-N-archive/`로 백업 보존.

---

## 미결 사항

[NEEDS CLARIFICATION] 항목 없음.

> 본 spec 작성 세션에는 `AskUserQuestion` 대화형 도구가 제공되지 않아, 5건의 옵션형 결정(Q-A~Q-E,
> `spec-input.md` "질문 분석 근거" 절)을 기존 코드베이스 컨벤션과의 일관성을 근거로 자율 채택했다.
> 이는 임의 결정이 아니라 기존 패턴(예: `assertOwner` 403/404 관례, `product.constants.ts` 페이지네이션
> 상수, 002-catalog NFR-001 성능 조건)을 그대로 승계한 것이며, 근거는 `spec-input.md`와
> `assumptions.md`(ASM-001~007)에 상세 기록했다. **main session이 사용자에게 이 채택 결과(특히 ASM-005
> 의 "조회 불가 상품 표시" UX 결정)를 제시하고 이견이 없는지 최종 확인하는 절차가 필요하다.** 이견이
> 없으면 그대로 확정하고 Planning 단계로 진행한다. 설계 과정 중 발생하는 추가 기술 결정(HOW)은 plan.md
> 에서 다룬다.

---

*가정(ASM) 사항은 `docs/specs/v1.1.0/017-seller-admin-read-apis/spec/assumptions.md` 참조.*
