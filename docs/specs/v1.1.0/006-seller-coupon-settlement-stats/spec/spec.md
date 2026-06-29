---
작성: Spec Agent
버전: v1.0
최종 수정: 2026-06-30 01:41
상태: 확정 (구현 완료 — retroactive 문서화)
---

# Spec: 006-seller-coupon-settlement-stats

> Branch: 006-seller-coupon-settlement-stats | Date: 2026-06-30 | Version: v1.1.0
>
> 본 문서는 이미 구현·검증이 완료된 코드(커밋 `1b3ffd1` Phase 2 화면 + `1a6d70d` 토큰 통일, base `4daca5a`)를
> 근거로 정식 SDD 포맷으로 retroactive 작성되었다. 모든 요구사항·수용 기준은 실제 구현된 console 화면
> (`seller/stats/page.tsx`·`seller/settlements/page.tsx`·`seller/coupons/page.tsx`)·`@doa/api-client`
> (stats·settlement·coupon facade)·`@doa/shared-types`(view 타입)·AppShell `layout.tsx`(네비) + 토큰 통일
> 전환 9개 기존 페이지에서 확인한 사실을 기준으로 한다. **FRONTEND-PLAN Phase 2(판매자 부가 운영 화면 —
> 통계·정산·쿠폰)** 를 구현하고, 이와 병행하여 **console 전 페이지의 하드코딩 팔레트를 @doa/design-tokens
> 시맨틱 토큰으로 통일**한다. 004·005(판매자 주문·배송) 위에 판매자 운영 화면을 마저 올린다.

## 목차

- [배경 및 목적](#배경-및-목적)
- [사용자 스토리](#사용자-스토리)
- [기능 요구사항](#기능-요구사항)
- [비기능 요구사항](#비기능-요구사항)
- [수용 기준](#수용-기준)
- [요구사항 구조화 매트릭스](#요구사항-구조화-매트릭스)
- [범위 외](#범위-외)
- [미결 사항](#미결-사항)

---

## 배경 및 목적

004(판매자 주문·배송 화면)·005(BE-GAP 해소)가 FRONTEND-PLAN **Phase 1(판매자 주문 이행)** 을 완성했다.
그러나 판매자가 자기 사업을 운영하는 데 필요한 **부가 운영 화면** — 매출 요약(통계), 정산 내역(수수료 차감
지급액), 할인 쿠폰 생성·발급 — 이 console 에 **부재** 했다. 또한 002(디자인 시스템)에서 `@doa/ui` 컴포넌트는
시맨틱 토큰으로 전환되었으나, **console 의 화면 페이지들에는 여전히 하드코딩 팔레트(`zinc-*`·`red-*`·`amber-*`
·`green-*`·`bg-white`)가 잔존**하여 디자인 시스템이 화면 레벨까지 일관 적용되지 못한 상태였다.

- **기존 한계 (판매자 운영 화면 부재)**: console 판매자 영역에는 상품(`/seller/products`)·주문·배송
  (`/seller/orders`)만 존재하고, 매출 통계·정산·쿠폰 화면이 없었다. 백엔드는 판매자 통계·정산·쿠폰 라우트를
  이미 제공하나(소비 UI 부재), 판매자는 이를 호출할 화면이 없어 운영 데이터를 확인하거나 쿠폰을 발급할 수
  없었다.

- **기존 한계 (화면 레벨 디자인 토큰 미통일)**: 002 가 `@doa/ui`(Button·Card·field·feedback 등)를 시맨틱
  토큰으로 전환했으나, console 의 화면 페이지(`login`·`dashboard`·`account/*`·`seller/products/*`·
  `seller/register`)는 하드코딩 Tailwind 팔레트 클래스를 직접 사용하고 있었다. 다크모드 분기·팔레트 교체가
  화면 레벨에서 작동하지 않아 디자인 시스템의 SSOT 가 화면까지 닿지 못했다.

- **백엔드 계약은 존재(소비 측 공백)**: 백엔드는 판매자 통계(`GET /seller/stats`)·정산(`GET /settlements`)·
  쿠폰 목록/생성/발급(`GET·POST /sellers/me/coupons`·`POST /sellers/me/coupons/:id/issue`) 라우트를 제공한다.
  다만 이 엔드포인트들의 **응답 스키마가 OpenAPI 에 미정의**(컨트롤러가 Prisma 엔티티 반환 — 001 coverage-gap)
  여서, 003 의 타입드 client 는 응답 타입이 비어 본 화면에서 이점이 적다(004 와 동일 상황).

006 은 이 공백을 (1) console 판매자 영역에 **판매 통계 화면**(`/seller/stats`)·**정산 화면**
(`/seller/settlements`)·**쿠폰 화면**(`/seller/coupons` — 목록 + 생성 다이얼로그 + 발급 다이얼로그)을 추가하고,
(2) 응답 미정의 엔드포인트를 `@doa/shared-types` 의 **전이형 view 타입**(`SellerStats`·`SettlementView`·
`Coupon`·`UserCoupon` 등 — 금전 Decimal→문자열)으로 정의하여 `api.http` 기반 도메인 facade(`api.stats`·
`api.settlement`·`api.coupon`)로 호출하며, (3) 쿠폰 생성 폼에 **010 서버 검증과 정합되는 클라이언트 검증**
(discountValue>0·PERCENTAGE 1~100)을 적용하고, (4) **병행하여 console 전 페이지의 하드코딩 팔레트를 시맨틱
토큰으로 통일**(console 하드코딩 클래스 0)하는 방식으로 해소한다.

> 설계 결정(FRONTEND-PLAN 연속): Phase 1(004·005 주문·배송) 위에 Phase 2(통계·정산·쿠폰) 운영 화면을 올린다.
> 004 와 동일하게 응답 스키마가 미정의인 도메인이므로 타입드 client 대신 view 타입 + facade 를 채택한다. 토큰
> 통일은 002 디자인 시스템을 화면 레벨까지 확장하는 작업으로, Phase 2 화면과 같은 차수에서 병행한다(디자인
> 일관성 회복). 쿠폰 cursor '더보기'·서버 검증 에러 표면 강화·낙관적 업데이트는 후속(범위 외).

---

## 사용자 스토리

- **US-001**: 판매자로서, 내 누적 매출(구매 확정 기준)과 완료 주문 수를 요약 카드로 한눈에 확인하기를 원한다.
- **US-002**: 판매자로서, 정산 기간별 총 매출·수수료·실지급액과 정산 상태(지급완료/정산대기)를 표로 조회하기를
  원한다.
- **US-003**: 판매자로서, 할인 유형(정액/비율)·할인값·최소 주문 금액·발급 수량·만료일을 지정하여 쿠폰을
  생성하기를 원한다(잘못된 할인값은 제출 전에 막아주기를 원한다).
- **US-004**: 판매자로서, 생성한 쿠폰을 대상 사용자에게 발급하기를 원한다.
- **US-005**: 사용자(개발자/디자이너)로서, console 의 모든 화면이 디자인 시스템 시맨틱 토큰을 일관 사용하여
  팔레트 교체·다크모드 분기가 화면 레벨까지 작동하기를 원한다.

---

## 기능 요구사항

- **FR-001** (판매 통계 화면): `/seller/stats`(`stats/page.tsx`)가 `GET /seller/stats`(`api.stats.seller`)로
  판매자 본인 요약을 조회하여 `StatCard` 2개(누적 매출 — `formatKRW(salesTotal)`·완료 주문 수 —
  `orderCount.toLocaleString('ko-KR')`건)로 렌더한다. `useQuery`(`['seller','stats']`, `enabled: isSeller`)로
  조회하며 로딩(`Loading`)·에러(`ErrorText`)·비판매자(`EmptyState`) 분기를 둔다.

- **FR-002** (정산 내역 화면): `/seller/settlements`(`settlements/page.tsx`)가 `GET /settlements`
  (`api.settlement.listMine`)로 판매자 본인 정산 목록(`SettlementView[]`)을 조회하여 Table(`@doa/ui` Table
  프리미티브)로 렌더한다. 컬럼은 정산 기간(`periodStart~periodEnd`)·총 매출·수수료(`−` 표기)·지급액·상태다.
  상태는 `completed`→"지급완료"(`Badge` success)·그 외→"정산대기"(`Badge` warning)로 매핑한다. 로딩·에러·
  빈 목록(`EmptyState`)·비판매자 분기를 둔다.

- **FR-003** (쿠폰 목록): `/seller/coupons`(`coupons/page.tsx`)가 `GET /sellers/me/coupons`
  (`api.coupon.listSeller`, `CursorPage<Coupon>`)로 판매자 발급 쿠폰 목록을 조회하여 `data.items` 를 Table 로
  렌더한다. 컬럼은 할인(`discountLabel` — FIXED→`formatKRW 할인`·PERCENTAGE→`N% 할인`)·최소주문·발급/총량
  (`issuedCount / totalQuantity`)·만료일·발급 버튼이다. 로딩·에러·빈 목록·비판매자 분기를 둔다.

- **FR-004** (쿠폰 생성): 쿠폰 화면의 `CreateCouponDialog`(Radix `Dialog`)가 할인 유형(`Select` FIXED/
  PERCENTAGE)·할인값·최소 주문 금액(선택)·발급 수량(선택)·만료일 입력으로 `POST /sellers/me/coupons`
  (`api.coupon.createSeller` — `CreateCouponRequest`)를 호출한다. 제출 전 클라이언트 검증(`validate` —
  discountValue>0, PERCENTAGE 1~100)을 수행하고 위반 시 `ErrorText` 노출·제출 비활성화한다. 생성 성공 시
  `invalidateQueries(['seller','coupons'])`로 목록을 갱신하고 다이얼로그를 닫는다.

- **FR-005** (쿠폰 발급): 각 쿠폰 행의 `IssueCouponDialog`(Radix `Dialog`)가 대상 사용자 ID(`targetUserId`)
  입력으로 `POST /sellers/me/coupons/:id/issue`(`api.coupon.issueSeller` — `IssueCouponRequest`)를 호출하여
  쿠폰을 발급한다(`UserCoupon` 반환). 성공 시 성공 문구를 표시하고 다이얼로그를 닫는다.

- **FR-006** (응답 view 타입 정의): 응답 스키마가 OpenAPI 에 미정의인 통계·정산·쿠폰 엔드포인트를 위해
  `@doa/shared-types` 에 전이형 view 타입(`SellerStats`·`SettlementStatus`·`SettlementView`·`CouponType`·
  `Coupon`·`CreateCouponRequest`·`IssueCouponRequest`·`UserCoupon`)을 정의한다. 금전 필드(`salesTotal`·
  `totalSales`·`commission`·`payoutAmount`·`discountValue`·`maxDiscountAmount`·`minOrderAmount`)는
  Decimal→JSON 직렬화상 **문자열**이다.

- **FR-007** (도메인 facade 추가): `@doa/api-client` 의 `createApiClient` 반환에 `stats`(seller)·`settlement`
  (listMine)·`coupon`(listSeller·createSeller·issueSeller) facade 를 추가한다. `api.http`(저수준 HttpClient)
  기반이며 view 타입을 응답 제네릭으로 사용한다.

- **FR-008** (네비게이션 추가): AppShell(`(dashboard)/layout.tsx`)의 판매자 섹션 네비게이션에 "쿠폰"
  (`/seller/coupons`)·"정산"(`/seller/settlements`)·"판매 통계"(`/seller/stats`) 3개 항목을 추가한다.
  판매자(`isSeller`)에게만 노출된다.

- **FR-009** (디자인 토큰 통일): console 의 기존 화면 9개(`login`·`dashboard`·`account/profile`·
  `account/addresses`·`account/wishlist`·`seller/products`·`seller/products/[id]`·`seller/products/new`·
  `seller/register`)의 하드코딩 팔레트 클래스(`zinc-*`·`red-*`·`amber-*`·`green-*`·`bg-white`)를 @doa/
  design-tokens 시맨틱 토큰 클래스(`bg-surface`·`text-foreground`·`text-muted-foreground`·`text-subtle-
  foreground`·`border-border`·`divide-border`·`bg-muted`·`rounded-card`·`text-danger`·`bg-warning-soft`·
  `border-warning`·`text-warning(-foreground)`·`text-success-foreground` 등)로 전환한다. 전환 후 console
  화면의 하드코딩 팔레트 클래스는 0건이다.

---

## 비기능 요구사항

- **NFR-001** (금전 Decimal 문자열 표기): 매출·정산·할인 금액은 Decimal→JSON 직렬화상 문자열로 전달되며,
  기존 `formatKRW(amount: string)`(`lib/order.ts` — 004 산출)이 부동소수점 연산 없이 `Number().
  toLocaleString('ko-KR')`로 원화 표기한다. view 타입의 금전 필드는 `string` 으로 정의된다(부동소수점 금지 —
  P-005 정합성). 신규 화면은 이 헬퍼를 재사용한다(신규 금전 헬퍼 없음).

- **NFR-002** (010 검증 UX 정합): 쿠폰 생성 폼의 클라이언트 검증(`validate` — discountValue>0, PERCENTAGE
  1~100)은 백엔드 쿠폰 서버 검증(010)과 **정합**한다. 클라이언트 검증은 제출 전 즉시 피드백(UX)이며 실제
  강제는 백엔드 DTO 가 담당한다. 클라이언트가 통과시킨 값도 백엔드가 재검증한다.

- **NFR-003** (시맨틱 토큰 일관 — 하드코딩 0): 본 차수 종료 후 console 화면의 하드코딩 팔레트 클래스
  (`zinc-*`·`red-*`·`amber-*`·`green-*`·`bg-white` 등)는 0건이다. 신규 Phase 2 화면도 시맨틱 토큰 컴포넌트
  (`StatCard`·Table·Badge·Dialog·Input·Select·EmptyState·Loading·ErrorText·PageHeader)와 시맨틱 토큰 클래스만
  사용한다.

- **NFR-004** (접근성·상태 분기): 쿠폰 생성·발급은 Radix `Dialog`(포커스 트랩·ESC·ARIA — 002 산출)로 구성한다.
  로딩·에러·빈 상태를 명시적으로 분기하고, 에러는 `ApiError` instanceof 검사로 메시지를 노출하며, 처리 중
  버튼은 비활성화·라벨 전환("생성 중…"·"발급 중…")한다.

- **NFR-005** (권한 — 판매자 스코프): 본 화면은 판매자 전용이다. 비판매자는 각 화면에서 `EmptyState`("판매자
  미등록") 안내를 본다. 실제 권한 강제는 백엔드(판매자 스코프 라우트·APPROVED 판매자 검증)가 담당하며 UI 는
  `isSeller` 표시 분기만 수행한다.

- **NFR-006** (하위 호환 — console 회귀 0): 본 변경은 기존 console 화면의 타입체크·빌드를 깨뜨리지 않는다
  (`console typecheck` 0, `console build` 17 라우트 PASS). 신규 화면 3개 추가(`/seller/stats`·
  `/seller/settlements`·`/seller/coupons`), 토큰 통일은 클래스명만 교체(시각 회귀 가능·빌드/타입 계약 불변),
  기존 화면 동작 회귀 0.

---

## 수용 기준

> **환경 태그 규약**:
> | 태그 | 의미 |
> |---|---|
> | `[env:static]` | 정적 코드/구조 검증(코드 리뷰·grep·분기 로직 확인)으로 판정 |
> | `[env:typecheck]` | TypeScript 타입체크(`console typecheck`) 통과로 판정 |
> | `[env:build]` | 빌드 산출(`console build` 라우트 컴파일) 성공으로 판정 |

- **SC-001** (`FR-001` 관련): `/seller/stats` 가 `api.stats.seller()`로 `SellerStats` 를 조회하여 `StatCard`
  2개(누적 매출 `formatKRW`·완료 주문 수 `toLocaleString`)로 렌더하고, 로딩·에러·비판매자 분기가 존재한다.
  console build 에서 `/seller/stats` 라우트가 컴파일된다. [env:typecheck] [env:build]

- **SC-002** (`FR-002` 관련): `/seller/settlements` 가 `api.settlement.listMine()`로 `SettlementView[]` 를
  조회하여 Table(정산 기간·총 매출·수수료·지급액·상태 Badge)로 렌더하고, 상태가 `completed`→"지급완료"
  (success)·그 외→"정산대기"(warning)로 매핑된다. 빈 목록·비판매자 분기가 존재한다. console build 에서
  `/seller/settlements` 라우트가 컴파일된다. [env:typecheck] [env:build]

- **SC-003** (`FR-003`·`FR-004` 관련): `/seller/coupons` 가 `api.coupon.listSeller()`(`CursorPage<Coupon>`)
  로 목록을 조회하여 `data.items` 를 Table 로 렌더하고, `CreateCouponDialog`(Radix Dialog)가 클라이언트 검증
  (discountValue>0·PERCENTAGE 1~100, `validate`) 위반 시 제출 비활성화·`ErrorText`, 생성 성공 시
  `invalidateQueries(['seller','coupons'])` + 다이얼로그 닫기를 수행한다. console build 에서 `/seller/coupons`
  라우트가 컴파일된다. [env:static] [env:typecheck] [env:build]

- **SC-004** (`FR-005` 관련): `IssueCouponDialog` 가 `targetUserId` 입력으로 `api.coupon.issueSeller(id,
  { targetUserId })`(`POST /sellers/me/coupons/:id/issue`)를 호출하고, 성공 시 성공 문구 표시·다이얼로그
  닫기, 빈 입력·처리 중 발급 버튼 비활성화를 수행한다. [env:static]

- **SC-005** (`FR-006`·`FR-007` 관련): `@doa/shared-types` 에 통계·정산·쿠폰 view 타입 8종이 정의되고(금전
  필드 `string`), `@doa/api-client` 의 `createApiClient` 반환에 `stats`(seller)·`settlement`(listMine)·
  `coupon`(listSeller·createSeller·issueSeller) facade 가 추가된다(view 타입을 응답 제네릭으로 사용).
  [env:static] [env:typecheck]

- **SC-006** (`FR-008`·`FR-009`·`NFR-003`·`NFR-006` 관련): AppShell 네비에 "쿠폰"·"정산"·"판매 통계" 3개가
  판매자 한정 추가되고, console 기존 화면 9개의 하드코딩 팔레트가 시맨틱 토큰으로 전환되어 console 화면의
  하드코딩 팔레트 클래스가 0건이다. `console typecheck` 0 error·`console build` 17 라우트 PASS(기존 화면 동작
  회귀 0). [env:static] [env:typecheck] [env:build]

---

## 요구사항 구조화 매트릭스

> 매핑 누락(SC 없는 FR/NFR, FR/NFR 없는 SC) 0건이 완료 조건.
> MoSCoW: Must / Should / Could / Won't

| US-ID | FR-ID | NFR-ID | SC-ID | [env:*] | MoSCoW |
|---|---|---|---|---|---|
| US-001 | FR-001 | NFR-001·NFR-004·NFR-005 | SC-001 | typecheck/build | Must |
| US-002 | FR-002 | NFR-001·NFR-004·NFR-005 | SC-002 | typecheck/build | Must |
| US-003 | FR-003·FR-004 | NFR-002·NFR-004·NFR-005 | SC-003 | static/typecheck/build | Must |
| US-004 | FR-005 | NFR-004·NFR-005 | SC-004 | static | Must |
| US-001 | FR-006·FR-007 | NFR-001 | SC-005 | static/typecheck | Must |
| US-005 | FR-008·FR-009 | NFR-003·NFR-006 | SC-006 | static/typecheck/build | Must |

> 모든 FR(FR-001~009)이 SC 로 대응된다(FR-001→SC-001, FR-002→SC-002, FR-003·004→SC-003, FR-005→SC-004,
> FR-006·007→SC-005, FR-008·009→SC-006). 매핑 누락 0건. SC-001·002·006 은 타입체크/빌드(+정적)로, SC-003·
> 004·005 는 정적 구조 검증(클라이언트 검증·발급 분기·view 타입·facade)으로 판정한다. 본 차수는 UI 화면이나
> 별도 e2e/단위 테스트 스위트가 없으며, 검증은 **빌드/타입체크 + 정적 구조 검증**으로 갈음한다(plan.md
> 테스트 전략·NFR-006 참조).

---

## 범위 외

- **쿠폰 cursor '더보기' 페이지네이션**: `api.coupon.listSeller` facade 는 `cursor`·`take` 파라미터를 받으나,
  쿠폰 화면은 `listSeller()`를 인자 없이 호출하여 **첫 페이지(`data.items`)만** 렌더한다. 커서 기반 '더보기'
  추가 로드는 범위 외다(후속).
- **서버 검증 에러 표면 강화**: 생성/발급 다이얼로그는 `ApiError` 메시지를 그대로 표시한다. 필드별 서버 검증
  에러 매핑·인라인 표시는 범위 외다(후속).
- **낙관적 업데이트(optimistic update)**: createSeller·issueSeller mutation 은 서버 응답 후 invalidate/
  닫기 방식이며 낙관적 업데이트를 적용하지 않는다(후속). 발급(issue)은 목록 invalidate 도 하지 않는다(목록
  컬럼이 발급 결과를 즉시 반영하지 않음 — 후속 권고).
- **정산/통계 기간 필터·차트**: 통계는 누적 요약 2개 지표, 정산은 전체 목록을 렌더한다. 기간 선택·추세 차트·
  서버 페이지네이션은 범위 외다(후속).
- **재고 화면 별도 추가**: 재고 관리는 기존 상품 상세 페이지(`/seller/products/[id]`)에 이미 통합되어 있어
  별도 화면을 추가하지 않는다(연구 중 발견 — research.md).
- **다크모드 토글 UI**: 토큰 통일로 화면이 `.dark` 분기 구조를 갖추나, 런타임 테마 전환 토글 UI 는 범위 외다
  (002 GAP-002-01 연속).

---

## 미결 사항

없음 — 본 spec 은 구현 완료 코드를 기준으로 retroactive 작성되었으며, 모든 요구사항·수용 기준이 실제 구현
(stats·settlements·coupons 화면·view 타입·stats/settlement/coupon facade·AppShell 네비·9개 페이지 토큰 통일)
과 대조 확인되었다. 쿠폰 cursor 더보기·서버 검증 에러 표면 강화·낙관적 업데이트·기간 필터/차트는 범위 외(후속)
로 분리하되, Phase 2 핵심 목표 — 판매자 매출 확인·정산 조회·쿠폰 생성/발급 화면 제공 + console 디자인 토큰
전면 통일 — 은 console typecheck 0·build 17 라우트 PASS·하드코딩 팔레트 0 으로 달성되었다. 응답 스키마 미정의
(view 타입 한시)는 001/004 GAP 연속이며 gaps.md GAP-006-01 로 기록한다.
