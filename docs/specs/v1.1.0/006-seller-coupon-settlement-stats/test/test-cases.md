---
작성: Test Agent (AUTHORING)
버전: v1.0
최종 수정: 2026-06-30 01:41
상태: 확정 (retroactive)
---

# Test Cases: 006-seller-coupon-settlement-stats

## 목차

- [SC × 시나리오 매트릭스](#sc--시나리오-매트릭스)
- [케이스 상세](#케이스-상세)
- [외부 의존성 명시](#외부-의존성-명시)
- [미커버 항목 (사전 분류)](#미커버-항목-사전-분류)

---

## SC × 시나리오 매트릭스

> 본 차수는 UI 화면으로 **단위/e2e 테스트 it() 를 추가하지 않는다**. 검증은 타입체크([env:typecheck]) +
> console 빌드([env:build]) + 정적 구조 검증([env:static] — 쿠폰 클라이언트 검증·발급 분기·view 타입·facade·
> 금전 포맷·네비·하드코딩 0 grep)으로 SC 를 판정한다. 구조는 추측하지 않고 실제 코드를 직접 확인한다.

| SC-ID | 수용 기준 | Happy Path | Edge Case | 검증 대상 | env 태그 |
|---|---|---|---|---|---|
| SC-001 | 통계 StatCard·금전 | StatCard 2개 렌더(매출·완료주문) | 비판매자 EmptyState·에러 ErrorText | stats/page.tsx·console | [env:typecheck][env:build] |
| SC-002 | 정산 Table·상태 Badge | Table 렌더 + 상태 매핑 | 빈 목록 EmptyState·비판매자 | settlements/page.tsx·console | [env:typecheck][env:build] |
| SC-003 | 쿠폰 목록+생성(검증·invalidate) | items Table·생성 성공 invalidate | discountValue≤0·PERCENTAGE>100 차단·빈 목록 | coupons/page.tsx·console | [env:static][env:typecheck][env:build] |
| SC-004 | 쿠폰 발급 | targetUserId 발급·성공 문구 | 빈 입력·처리 중 비활성화·서버 에러 | coupons/page.tsx | [env:static] |
| SC-005 | view 타입·facade | view 타입 8종·stats/settlement/coupon facade | 응답 OpenAPI 미정의 → 전이형 view 타입 | shared-types·api-client | [env:static][env:typecheck] |
| SC-006 | 네비·토큰·회귀 0 | 네비 3개·하드코딩 0·17 라우트 | 기존 화면 동작 불변(클래스명만 교체) | layout·9화면·console | [env:static][env:typecheck][env:build] |

---

## 케이스 상세

### SC-001 (통계 StatCard·금전)

- 검증 방법: `stats/page.tsx` 코드 리뷰 + console typecheck/build.
- 확인 사실:
  - `useQuery({ queryKey: ['seller','stats'], queryFn: () => api.stats.seller(), enabled: isSeller })`.
  - `StatCard` 2개: `누적 매출` = `formatKRW(data.salesTotal)` · `완료 주문 수` =
    `${data.orderCount.toLocaleString('ko-KR')}건`. 그리드(`grid sm:grid-cols-2 lg:grid-cols-3`).
  - 분기: `!isSeller`→`EmptyState`("판매자 미등록"), `isLoading`→`Loading`, `error`→`ErrorText`(`ApiError`
    instanceof). PageHeader subtitle "구매 확정(completed) 기준 누적 요약".
  - `pnpm --filter console typecheck` 0 error + `pnpm --filter console build` 에 `/seller/stats` 라우트 컴파일.

### SC-002 (정산 Table·상태 Badge)

- 검증 방법: `settlements/page.tsx` 코드 리뷰 + console typecheck/build.
- 확인 사실:
  - `useQuery({ queryKey: ['seller','settlements'], queryFn: () => api.settlement.listMine(),
    enabled: isSeller })` (`SettlementView[]`).
  - Table 컬럼: 정산 기간(`PERIOD(periodStart, periodEnd)` `toLocaleDateString('ko-KR')`)·총 매출
    `formatKRW(totalSales)`·수수료 `−formatKRW(commission)`·지급액 `formatKRW(payoutAmount)`(font-semibold)·
    상태 `<Badge tone={s.status === 'completed' ? 'success' : 'warning'}>{s.status === 'completed' ?
    '지급완료' : '정산대기'}</Badge>`.
  - 분기: `data.length === 0`→`EmptyState`("정산 내역 없음"), `!isSeller`→`EmptyState`.
  - `console build` 에 `/seller/settlements` 라우트 컴파일.

### SC-003 (쿠폰 목록+생성·검증·invalidate)

- 검증 방법: `coupons/page.tsx` 코드 리뷰 + console build.
- 확인 사실:
  - 목록: `useQuery({ queryKey: ['seller','coupons'], queryFn: () => api.coupon.listSeller(),
    enabled: isSeller })` (`CursorPage<Coupon>`), `data.items` Table(할인 `discountLabel`·최소주문·발급/총량
    `issuedCount / totalQuantity`·만료일·발급 버튼).
  - `discountLabel(c)`: `c.type === 'FIXED' ? formatKRW(c.discountValue) 할인 : c.discountValue% 할인`.
  - `validate(type, discountValue)`: `!Number.isFinite(v) || v <= 0` → "할인값은 0보다 커야 합니다." /
    `type === 'PERCENTAGE' && v > 100` → "비율 할인은 1~100 사이여야 합니다." (010 서버 검증 정합).
  - `CreateCouponDialog`(Radix Dialog): `Select`(type FIXED/PERCENTAGE)·`Input`(discountValue·minOrderAmount·
    totalQuantity·expiresAt). `clientError` 표시(`ErrorText`)·`canSubmit = discountValue && expiresAt &&
    !clientError && !create.isPending`. `create` `onSuccess` → `invalidateQueries(['seller','coupons'])` +
    `setOpen(false)` + 필드 reset. `create.error` → `ErrorText`(`ApiError`).
  - `console build` 에 `/seller/coupons` 라우트 컴파일.

### SC-004 (쿠폰 발급)

- 검증 방법: `coupons/page.tsx` `IssueCouponDialog` 코드 리뷰.
- 확인 사실:
  - `IssueCouponDialog({ coupon })`(Radix Dialog): `Input`(targetUserId). `issue = useMutation({ mutationFn:
    () => api.coupon.issueSeller(coupon.id, { targetUserId }), onSuccess: () => { setOpen(false);
    setTargetUserId(''); } })`.
  - `issue.isSuccess` → 성공 문구("발급 완료." `text-success-foreground`). `issue.error` → `ErrorText`
    (`ApiError`). 발급 버튼 `disabled: !targetUserId || issue.isPending`, 라벨 "발급 중…"/"발급".
  - 다이얼로그 설명에 `<Badge tone="info">{discountLabel(coupon)}</Badge>` 표시. (목록 invalidate 없음 —
    plan §발급 후 목록 비갱신.)

### SC-005 (view 타입·facade)

- 검증 방법: `shared-types/index.ts`·`api-client/index.ts` 코드 리뷰.
- 확인 사실:
  - `shared-types/index.ts`: `SellerStats`(salesTotal `string`·orderCount `number`)·`SettlementStatus`
    (pending/completed)·`SettlementView`(totalSales·commission·payoutAmount `string`)·`CouponType`(FIXED/
    PERCENTAGE)·`Coupon`(discountValue `string`·maxDiscountAmount/minOrderAmount `string|null`)·
    `CreateCouponRequest`·`IssueCouponRequest`(targetUserId)·`UserCoupon`. 주석 "Phase 2 … 금전 필드는
    Decimal → JSON 문자열" + "discountValue 양수, PERCENTAGE 1~100(010)".
  - `api-client/index.ts`: `stats: { seller: () => http.get<SellerStats>('/seller/stats') }`, `settlement:
    { listMine: () => http.get<SettlementView[]>('/settlements') }`, `coupon: { listSeller(cursor?, take?)
    => http.get<CursorPage<Coupon>>('/sellers/me/coupons', { query: { cursor, take } }), createSeller =>
    http.post<Coupon>, issueSeller => http.post<UserCoupon> }`.

### SC-006 (네비·토큰·회귀 0)

- 검증 방법: `layout.tsx`·console 화면 9개 grep + console typecheck/build.
- 확인 사실:
  - `layout.tsx`: `NAV` 에 `{ href: '/seller/coupons', label: '쿠폰', section: 'seller' }`·`{ href:
    '/seller/settlements', label: '정산', section: 'seller' }`·`{ href: '/seller/stats', label: '판매 통계',
    section: 'seller' }`.
  - 토큰 통일: 기존 화면 9개의 하드코딩 팔레트(`zinc/red/amber/green-NN`·`bg-white`)가 시맨틱 토큰(`bg-surface`·
    `text-foreground`·`text-muted-foreground`·`text-subtle-foreground`·`border-border`·`divide-border`·
    `bg-muted`·`rounded-card`·`text-danger`·`bg-warning-soft`·`border-warning`·`text-warning(-foreground)`)
    으로 전환. `grep -rE "(zinc|red|amber|green)-[0-9]{2,3}|bg-white" apps/console/app` → **0건**.
  - `pnpm --filter console typecheck` 0 error + `pnpm --filter console build` 17 라우트 PASS — 기존 화면
    (상품·계정·관리자·주문·배송) 동작 회귀 0(NFR-006).

---

## 외부 의존성 명시

### 도구 / 라이브러리

- `@tanstack/react-query`(기존): `useQuery`·`useMutation`·`useQueryClient.invalidateQueries`.
- `@doa/ui`(기존, 변경 0): `StatCard`(`./card`)·`Select`(`./field`)·Table 프리미티브(`./table`)·Dialog
  (Radix `./dialog`)·Badge·Button·Input·PageHeader·EmptyState·Loading·ErrorText.
- `@doa/api-client`(기존 + stats·settlement·coupon facade 신규): `api.stats`·`api.settlement`·`api.coupon`
  (`api.http` 기반) + `ApiError`.
- `@doa/shared-types`(기존 + view 타입 8종 신규): `SellerStats`·`SettlementView`·`Coupon`·`UserCoupon` 등.
- `apps/console/lib/order.ts`(기존, 004 산출): `formatKRW` 재사용(신규 헬퍼 0).
- **신규 의존성 0**(`package.json` 변경 없음).

### 환경 변수

- 별도 환경 변수 불필요. API `baseUrl`·`TokenStore` 는 기존 console `lib/api` 가 `createApiClient` 에 주입.

### 외부 서비스

- 검증 단계에서 실제 백엔드 호출 없음. 검증은 정적 구조 리뷰 + 타입체크 + console 빌드(라우트 컴파일) + grep
  (하드코딩 0)으로 수행(테스트 서버 기동·네트워크 호출 아님).

---

## 미커버 항목 (사전 분류)

| 항목 | 미커버 사유 | 카테고리 | 권장 검증 방법 |
|---|---|---|---|
| e2e 자동화 | 본 차수는 UI 화면이나 별도 e2e/단위 테스트 부재(빌드/타입체크/정적 갈음) | (2) 설계(테스트 자동화 한계) | Playwright 등으로 통계 렌더·정산 표·쿠폰 생성/발급 흐름 e2e 후속 |
| 쿠폰 cursor '더보기' | facade 는 cursor/take 지원하나 화면은 첫 페이지만 렌더 | (3) 기능 미구현(범위 외) | 후속에서 cursor 기반 추가 로드 + 테스트 |
| 발급 후 목록 즉시 반영 | `issueSeller` `onSuccess` 가 목록 invalidate 안 함(발급/총량 다음 조회 시 반영) | (3) 기능 미구현(범위 외) | 후속에서 `['seller','coupons']` invalidate 추가 |
| 서버 검증 에러 필드 매핑 | 생성/발급 다이얼로그는 `ApiError` 메시지만 표시(필드별 인라인 미매핑) | (3) 기능 미구현(범위 외) | 후속에서 필드별 서버 에러 표면 강화 |
| 낙관적 업데이트 | mutation 은 서버 응답 후 invalidate/닫기(낙관적 미적용) | (3) 기능 미구현(범위 외) | 후속에서 `onMutate` 낙관적 업데이트 + 롤백 테스트 |
