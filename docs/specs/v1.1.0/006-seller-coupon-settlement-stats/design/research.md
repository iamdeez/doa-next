---
작성: Design Agent
버전: v1.0
최종 수정: 2026-06-30 01:41
상태: 확정 (retroactive)
---

# Research: 006-seller-coupon-settlement-stats

## 목차

- [분석 우선순위 게이트 결과](#분석-우선순위-게이트-결과)
- [기존 코드베이스 분석](#기존-코드베이스-분석)
  - [console 판매자 영역 현황 (006 이전)](#console-판매자-영역-현황-006-이전)
  - [백엔드 통계·정산·쿠폰 라우트 계약](#백엔드-통계정산쿠폰-라우트-계약)
- [응답 타입 처리 — 타입드 client vs facade+view 타입](#응답-타입-처리--타입드-client-vs-facadeview-타입)
- [쿠폰 검증 UX — 010 서버 검증 정합](#쿠폰-검증-ux--010-서버-검증-정합)
- [쿠폰 생성/발급 UI — Radix Dialog 패턴](#쿠폰-생성발급-ui--radix-dialog-패턴)
- [정산·통계 데이터 표현](#정산통계-데이터-표현)
- [토큰 마이그레이션 전략](#토큰-마이그레이션-전략)
- [재고 화면 — 기존 통합 발견](#재고-화면--기존-통합-발견)
- [생성물·구조 검증 (직접 확인)](#생성물구조-검증-직접-확인)
- [엣지 케이스 및 한계](#엣지-케이스-및-한계)

---

## 분석 우선순위 게이트 결과

- **변경 대상(plan §핵심 설계)**: console 화면 3개(`seller/stats`·`seller/settlements`·`seller/coupons`)·
  `layout.tsx`(네비)·`api-client/index.ts`(facade)·`shared-types/index.ts`(view 타입) + 기존 화면 9개(토큰
  통일). 백엔드·DB **변경 없음**(기존 라우트 소비).
- §A·B·C 분석은 위 변경 대상으로 한정.
- §D(다단계 병렬 파이프라인): 미해당.
- §E(동일 가드 결정 통합): 미해당.
- 외부 라이브러리 검증(§4): **신규 라이브러리 0건**(기존 TanStack Query·Radix Dialog[`@doa/ui`]·
  `@doa/api-client`·`@doa/shared-types`·`@doa/design-tokens` 만 사용).
- §F(production 시그니처 변경): **부분 해당** — `createApiClient` 반환에 `stats`·`settlement`·`coupon`
  facade **추가**(기존 facade·console 화면 불변 — 호출 측 영향 0). `@doa/ui`·`@doa/shared-types` 기존
  export 불변(view 타입 8종 추가).

---

## 기존 코드베이스 분석

> context.md 의 모노레포·공유 패키지 구조를 기준선. 본 절은 변경 대상 한정 정밀 분석.

### console 판매자 영역 현황 (006 이전)

- **구조**: console 판매자 영역(`(dashboard)/seller/`)에 상품 관리(`/seller/products`)·주문·배송
  (`/seller/orders`)만 존재(004·005). 통계·정산·쿠폰 화면 부재. AppShell(`(dashboard)/layout.tsx`)의 `NAV`
  판매자 섹션에 "내 상품"·"주문·배송"만 등록.
- **공유 패키지**: 004 가 `@doa/api-client` 에 도메인 facade(auth·user·seller·catalog·inventory·order·
  shipping) + 타입드 client + `http`(저수준)를 제공. `stats`·`settlement`·`coupon` facade 는 부재.
  `@doa/shared-types` 에 통계·정산·쿠폰 view 타입 부재. `@doa/ui` 에 `StatCard`(`./card`)·`Select`
  (`./field`)·Table 프리미티브(`./table` — 004)·Dialog(`./dialog` — Radix 002)가 **이미 존재**(본 차수에
  `@doa/ui` 변경 0).
- **금전 헬퍼**: 004 가 `apps/console/lib/order.ts` 에 `formatKRW(amount: string)` 를 제공. 본 차수 3개
  신규 화면이 이를 재사용(신규 헬퍼 0).
- **토큰 현황**: 002 가 `@doa/ui` 를 시맨틱 토큰으로 전환했으나, console 화면 페이지 9개(`login`·`dashboard`·
  `account/*`·`seller/products/*`·`seller/register`)는 하드코딩 팔레트(`zinc-*`·`red-*`·`amber-*`·`green-*`·
  `bg-white`)를 직접 사용 중. AppShell `layout.tsx` 는 004 에서 이미 시맨틱 토큰으로 전환됨(본 차수 토큰
  대상 아님 — 네비만 추가).

### 백엔드 통계·정산·쿠폰 라우트 계약

- 백엔드는 이미 다음 라우트를 제공한다(엔드포인트 경로는 글로벌 프리픽스 없음 — facade 컨벤션 동일):
  `GET /seller/stats`(판매자 본인 매출·주문 요약)·`GET /settlements`(판매자 본인 정산 배열)·`GET /sellers/me/
  coupons`(cursor 쿠폰 목록)·`POST /sellers/me/coupons`(CreateCouponDto — 서버 검증 010)·`POST /sellers/me/
  coupons/:id/issue`(IssueCouponDto: targetUserId → UserCoupon).
- **응답 스키마 미정의**: 위 라우트의 응답은 컨트롤러가 Prisma 엔티티를 반환하며 OpenAPI 응답 content 가
  미주석이다(001 coverage-gap — 87 ops 중 typed 2xx content 36건, 004 와 동일). 따라서 003 의 타입드 client
  는 이 라우트들의 response 타입이 비어 본 화면에서 이점이 적다.

---

## 응답 타입 처리 — 타입드 client vs facade+view 타입

| 항목 | 003 타입드 client(`api.client.GET`) | facade + view 타입(006 채택) |
|---|---|---|
| 요청(params·body) 타입 | 생성 타입에서 자동 | view 타입 수기(`CreateCouponRequest` 등) |
| 응답 타입 | **비어 있음**(백엔드 응답 미정의 — 001 coverage-gap) | **전이형 view 타입**(`SellerStats`·`SettlementView`·`Coupon` — 금전 string) |
| 금전 표기 | (응답 타입 부재로 미보장) | view 타입 금전 필드 `string`(Decimal→문자열, `formatKRW`) |
| 호출 형태 | `api.client.GET('/seller/stats', ...)` | `api.stats.seller()`(facade) |
| 한시성 | — | 백엔드 응답 DTO 보강 후 생성 타입 대체 |

> 채택: facade + view 타입(ADR-001·002 — 004 연속). 통계·정산·쿠폰 응답이 OpenAPI 미정의(Prisma 엔티티
> 반환)여서 타입드 client 의 응답 타입이 비어 있다. `@doa/shared-types` 에 전이형 view 타입 8종(금전
> Decimal→문자열)을 정의하고 `api.http` 기반 도메인 facade(`api.stats`·`api.settlement`·`api.coupon`)로
> 호출하여 화면에서 응답 타입 안전성을 확보한다. 백엔드 응답 DTO + `@ApiResponse({ type })` 보강 후 코드젠
> 재생성하면 view 타입을 생성 타입(`Schemas['...']`)으로 대체할 수 있다(GAP-006-01 / 004 GAP-004-01 연속).

---

## 쿠폰 검증 UX — 010 서버 검증 정합

- **문제**: 쿠폰 생성 시 할인값이 음수/0 이거나 비율 할인이 100 초과면 백엔드(010 서버 검증)가 거부한다.
  제출 후 서버 거부만 의존하면 UX 가 저하된다.
- **해결(채택)**: 클라이언트 `validate(type, discountValue)` 로 제출 전 즉시 차단한다(ADR-004).

| 조건 | 클라이언트 메시지 | 백엔드(010) |
|---|---|---|
| `!Number.isFinite(v) \|\| v <= 0` | "할인값은 0보다 커야 합니다." | discountValue 양수 강제 |
| `type === 'PERCENTAGE' && v > 100` | "비율 할인은 1~100 사이여야 합니다." | PERCENTAGE 1~100 강제 |

- 클라이언트 검증은 **UX 즉시 피드백**이며 실제 강제는 백엔드 010 이 담당한다(정합 — NFR-002). `clientError`
  가 있으면 `ErrorText` 표시 + 제출 비활성화(`canSubmit = discountValue && expiresAt && !clientError &&
  !create.isPending`). 클라이언트를 통과한 값도 백엔드가 재검증하며, 서버 거부 시 `create.error`(`ApiError`)
  메시지를 다이얼로그에 노출한다.

---

## 쿠폰 생성/발급 UI — Radix Dialog 패턴

| 항목 | Radix Dialog 모달(006 채택) | 별도 라우트 페이지 |
|---|---|---|
| 접근성 | 포커스 트랩·ESC·ARIA 내장(002 산출) | 수동 구성 필요 |
| 흐름 | 목록 화면에서 즉시 생성·발급 | 페이지 이동·복귀 |
| 의존성 | 0(기존 `@doa/ui` Dialog 재사용) | 신규 라우트 추가 |

> 채택: Radix `Dialog`(ADR-003). 002 가 제공한 `Dialog`(Root/Trigger/Content/Header/Title/Description/
> Footer)를 재사용하여 `CreateCouponDialog`·`IssueCouponDialog` 를 목록 화면 내 모달로 구성한다. 포커스
> 트랩·ESC·ARIA 가 기본 제공되어 접근성(NFR-004)을 확보한다.

---

## 정산·통계 데이터 표현

- **통계(`SellerStats`)**: `salesTotal`(string)·`orderCount`(number) 2개 지표. `StatCard` 2개로 렌더 —
  누적 매출(`formatKRW`)·완료 주문 수(`toLocaleString('ko-KR')`건). 구매 확정(completed) 기준(PageHeader
  subtitle 명시).
- **정산(`SettlementView[]`)**: 전체 배열(CursorPage 아님). Table 컬럼 — 정산 기간(`periodStart~periodEnd`
  `toLocaleDateString`)·총 매출·수수료(`−formatKRW`)·지급액(`font-semibold`)·상태 Badge. status 매핑:
  `completed`→"지급완료"(success)·그 외(`pending`)→"정산대기"(warning).
- **쿠폰(`CursorPage<Coupon>`)**: `data.items` 첫 페이지만 렌더. Table 컬럼 — 할인(`discountLabel`)·최소주문·
  발급/총량(`issuedCount / totalQuantity`)·만료일·발급 버튼. cursor '더보기'는 미구현(범위 외, facade 는
  cursor/take 지원).

---

## 토큰 마이그레이션 전략

- **문제**: console 화면 페이지 9개가 하드코딩 팔레트(`zinc/red/amber/green/bg-white`)를 사용하여 디자인
  시스템이 화면 레벨까지 일관 적용되지 못함.
- **해결(채택)**: 하드코딩 클래스를 시맨틱 토큰 클래스로 일괄 치환(ADR-007). 구조·props·핸들러 불변, 클래스명만
  교체.

| 하드코딩 (before) | 시맨틱 토큰 (after) |
|---|---|
| `border-zinc-200` | `border-border` |
| `bg-white` | `bg-surface` |
| `text-zinc-900` | `text-foreground` |
| `text-zinc-500/600` | `text-muted-foreground` |
| `text-zinc-400` | `text-subtle-foreground` |
| `bg-zinc-50` / `hover:bg-zinc-50` | `bg-muted` / `hover:bg-muted` |
| `divide-zinc-100` | `divide-border` |
| `rounded-xl` | `rounded-card` |
| `border-amber-200`·`bg-amber-50` | `border-warning`·`bg-warning-soft` |
| `text-amber-700/800` | `text-warning-foreground` |
| `text-amber-600` | `text-warning` |
| `text-red-600` | `text-danger` |

> 전환 후 console 화면(`apps/console/app`)의 하드코딩 팔레트 클래스(`zinc/red/amber/green/slate/gray-NN`·
> `bg-white`)는 **0건**(grep 직접 확인). 시각 결과는 002 light 토큰 매핑에 따라 동일 유지되며, `.dark`
> 분기가 화면 레벨까지 작동하게 된다(다크 토글 UI 는 범위 외 — 002 GAP-002-01).

---

## 재고 화면 — 기존 통합 발견

- **분석 중 발견**: FRONTEND-PLAN Phase 2 후보에 "재고 화면"이 있었으나, 재고 관리(옵션·재고)가 기존 상품
  상세 페이지(`/seller/products/[id]`)에 **이미 통합**되어 있음을 확인했다(해당 페이지에 "옵션 · 재고" 섹션
  존재). 별도 재고 화면을 추가하지 않으며, 본 차수는 통계·정산·쿠폰 3화면으로 한정한다(spec §범위 외).
- 참고: `seller/products/[id]/page.tsx` 는 본 차수에서 토큰 통일 대상이며(옵션·재고 섹션 포함 16라인 전환),
  기능 변경은 없다.

---

## 생성물·구조 검증 (직접 확인)

> 변경 구조는 추측하지 않고 실제 파일·diff 를 직접 확인하여 확정했다(자가 보고 신뢰하지 않음).

| 대상 | 측정 | 값 | 측정 방법 |
|---|---|---|---|
| `coupons/page.tsx` | 신규 라인 | +235 / -0 | `git diff --numstat 4daca5a 1a6d70d` |
| `settlements/page.tsx` | 신규 라인 | +78 / -0 | 동일 |
| `shared-types/index.ts` | 변경 | +70 / -0 | 동일(view 타입 8종) |
| `stats/page.tsx` | 신규 라인 | +36 / -0 | 동일 |
| `api-client/index.ts` | 변경 | +30 / -0 | 동일(stats·settlement·coupon facade) |
| `layout.tsx` | 변경 | +3 / -0 | 동일(네비 3개) |
| 기존 화면 9개(토큰) | 변경 | +49 / -51 | 동일(클래스명 교체) |
| 합계 | 15 files | +503 / -51 | `git diff --numstat 4daca5a 1a6d70d -- apps/console packages` |

- view 타입(직접 확인 — `shared-types/index.ts` L321~393): `SellerStats`·`SettlementStatus`·`SettlementView`·
  `CouponType`·`Coupon`(금전 `string`·`maxDiscountAmount`/`minOrderAmount` `string|null`)·`CreateCouponRequest`·
  `IssueCouponRequest`·`UserCoupon`. 주석에 "Phase 2 — 판매자 통계·정산·쿠폰. 금전 필드는 Decimal → JSON
  문자열" + "discountValue 양수, PERCENTAGE 1~100(010)" 명시.
- facade(직접 확인 — `api-client/index.ts` L168~191): `stats.seller`·`settlement.listMine`·`coupon.
  {listSeller,createSeller,issueSeller}` — `http.get/post` 기반, view 타입 응답 제네릭. `listSeller` 는
  `{ query: { cursor, take } }`.

---

## 엣지 케이스 및 한계

- **응답 타입 백엔드 의존(view 타입 한시성)**: 통계·정산·쿠폰 응답은 OpenAPI 미정의(Prisma 엔티티)여서
  전이형 view 타입으로 한시 정의했다. 백엔드 응답 DTO 보강 후 생성 타입 대체 예정(GAP-006-01 — 004
  GAP-004-01 / 001 GAP-001-01 연속).
- **쿠폰 cursor 미소비**: facade 는 cursor/take 를 지원하나 화면은 첫 페이지(`data.items`)만 렌더한다.
  '더보기' 추가 로드는 범위 외(후속).
- **발급 후 목록 비갱신**: `issueSeller` `onSuccess` 는 다이얼로그 닫기·성공 문구만 표시하며 목록을
  invalidate 하지 않는다. 발급/총량 컬럼은 다음 조회 시 반영(즉시 반영 필요 시 후속 invalidate 추가).
- **서버 검증 에러 표면**: 생성/발급 다이얼로그는 `ApiError` 메시지를 그대로 표시한다. 필드별 서버 에러
  인라인 매핑은 미적용(후속).
- **e2e 부재**: 본 차수는 UI 화면이나 별도 e2e/단위 테스트가 없다. 검증은 console typecheck/build + 정적
  구조 리뷰로 갈음(GAP-006-01).

가정-실제 불일치 현재 미발견(변경 구조·diff·view 타입·facade·토큰 전환을 실제 파일/numstat/grep 직접 확인).
