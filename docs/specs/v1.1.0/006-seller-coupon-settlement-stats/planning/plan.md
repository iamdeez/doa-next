---
작성: Planning Agent
버전: v1.0
최종 수정: 2026-06-30 01:41
상태: 확정 (retroactive)
---

# Plan: 006-seller-coupon-settlement-stats

> Branch: 006-seller-coupon-settlement-stats | Date: 2026-06-30 | Spec: [../spec/spec.md](../spec/spec.md)

## 목차

- [사전 검증 (Constitution Gates)](#사전-검증-constitution-gates)
- [기술 컨텍스트](#기술-컨텍스트)
- [사전 영향도 분석 결과](#사전-영향도-분석-결과)
- [핵심 설계](#핵심-설계)
- [결정 기록 (ADRs)](#결정-기록-adrs)
- [인터페이스 계약](#인터페이스-계약)
- [데이터 모델](#데이터-모델)
- [테스트 전략](#테스트-전략)
- [보안 노트](#보안-노트)
- [기타 고려사항](#기타-고려사항)

---

## 사전 검증 (Constitution Gates)

> `constitution.md`(P-001~P-007) 존재 → 해당 조항을 Gates 로 사용한다(constitution 우선). 본 차수의 핵심
> 검토 조항은 **P-002(신규 의존 — 추가 0)**·**P-005(금전 Decimal 정합성)**·**P-007(스펙 범위)** 이며,
> 화면 동작 정합성은 P-006(테스트 — 빌드/타입/정적 갈음)으로 검증한다.

- [x] **P-001 모듈 경계 원칙**: [Pass 기준: 다른 도메인 모듈의 스키마 테이블을 직접 참조·쿼리하지 않음]
  → PASS. 본 차수는 **프론트엔드 console 화면 + 공유 패키지**(api-client·shared-types) 변경이며 백엔드 도메인
  모듈·DB 스키마와 무관하다. DB 접근·교차 쿼리 0. 화면은 백엔드 HTTP 라우트(통계·정산·쿠폰)만 호출.
- [x] **P-002 AWS 의존 금지 원칙**: [Pass 기준: `@aws-sdk/*` 및 AWS 전용 SDK 신규 추가 0건]
  → PASS(직접 검토 조항). **신규 의존성 추가 0건**(`package.json` 변경 없음 — numstat 15파일에 `package.json`
  부재). 기존 TanStack Query·Radix Dialog(`@doa/ui`)·`@doa/api-client`·`@doa/shared-types` 만 사용.
- [x] **P-003 단일 DB 원칙**: [Pass 기준: 단일 PostgreSQL 외 외부 저장소 0건]
  → PASS(무관). 프론트 화면 변경으로 데이터 저장소·캐시·큐 0건. DB 스키마 변경 0(마이그레이션 없음). 다이얼로그
  폼 state(`useState`)는 컴포넌트 메모리이며 영속 저장소가 아니다.
- [x] **P-004 클라우드 중립 원칙**: [Pass 기준: Fly.io 전용 API 결합 0건]
  → PASS. 표준 `fetch`(api-client)·TanStack Query·Radix·Next.js 만 사용. 플랫폼 전용 API 0.
- [x] **P-005 결제·정산 정합성 원칙**: [Pass 기준: 금전 상태 변경 outbox·멱등성·Decimal]
  → PASS(직접 검토 조항). 화면은 금전·정산 상태를 **변경하지 않으며**(통계·정산은 조회만, 쿠폰 생성/발급은
  쿠폰 도메인이며 결제·정산 상태 전이 아님), 금전 **표시** 만 한다. 매출·정산·할인 금액은 Decimal→JSON
  직렬화상 **문자열**로 받고 view 타입 금전 필드를 `string` 으로 정의하며 기존 `formatKRW` 가 부동소수점 연산
  없이 표기한다(NFR-001). 클라이언트 금전 연산 0(쿠폰 검증의 `Number(discountValue)`는 검증용 비교이며 금전
  표시값을 생성하지 않음).
- [x] **P-006 테스트 원칙**: [Pass 기준: SC-XXX 없는 FR-XXX 0건]
  → PASS. FR-001→SC-001, FR-002→SC-002, FR-003·004→SC-003, FR-005→SC-004, FR-006·007→SC-005, FR-008·009→
  SC-006. UI 화면 성격상 별도 e2e/단위 테스트 스위트는 없으며 검증은 **타입체크 + console 빌드 + 정적 구조
  검증**으로 갈음한다(모든 FR 이 SC 로 대응 — P-006 충족). 기존 console 테스트 커버리지 저하 0(NFR-006).
- [x] **P-007 스펙 범위 원칙**: [Pass 기준: spec.md 범위 외 변경 파일 0건]
  → PASS(직접 검토 조항). 변경 범위 = console 화면 3개(신규)·`layout.tsx`(네비)·`api-client/index.ts`
  (facade)·`shared-types/index.ts`(view 타입)·기존 화면 9개(토큰 통일). 전부 FR-001~009 추적 가능. **쿠폰
  cursor 더보기·서버 검증 에러 매핑·낙관적 업데이트·기간 필터/차트·재고 별도 화면·다크 토글은 범위 외**로
  분리. 토큰 통일은 클래스명 교체로 동작·계약 불변(범위 내 — FR-009).

> **예외 사항**: 없음. P-001~P-007 전부 통과(예외 0건). 신규 의존성 추가 0(P-002 무저촉 자명).

> **Gates 판정**: P-001~P-007 전부 통과(예외 0건). 선택 단계는 Database Design=N·Deploy=N·Security=N·
> Performance=N(selection-phases.md). Design Agent(3단계) → Development(4) + Test AUTHORING(5a) 진입 가능.

---

## 기술 컨텍스트

> v1.1.0 프론트 스택을 재확정. 006 고유 변경만 명시.

- **언어 / 런타임**: TypeScript 5.x / Next.js 15(App Router, console). pnpm `9.0.0` + Turborepo 모노레포.
- **상태·데이터 페칭**: TanStack Query(`@tanstack/react-query`) — `useQuery`(통계·정산·쿠폰 목록)·`useMutation`
  (createSeller·issueSeller)·`useQueryClient.invalidateQueries`(쿠폰 목록 갱신). 다이얼로그 폼 state 는
  컴포넌트 `useState`.
- **UI**: `@doa/ui` 시맨틱 토큰 컴포넌트(`StatCard`·Table 프리미티브·Badge·Dialog[Radix]·Input·Select·
  PageHeader·EmptyState·Loading·ErrorText). **본 차수에 `@doa/ui` 패키지 변경 0**(기존 컴포넌트 재사용 —
  StatCard `./card`·Select `./field`·Table `./table`[004]·Dialog `./dialog`[002]).
- **API 호출**: `@doa/api-client` 도메인 facade(`api.stats`·`api.settlement`·`api.coupon` — `api.http`
  기반). 003 타입드 client 는 응답 미정의로 본 화면에 이점이 적어 facade 채택(004 연속).
- **타입**: `@doa/shared-types` 전이형 view 타입(`SellerStats`·`SettlementView`·`Coupon`·`UserCoupon` 등 —
  금전 Decimal→문자열). 백엔드 응답 DTO 보강 후 생성 타입 대체 예정.
- **금전 헬퍼**: 기존 `apps/console/lib/order.ts` 의 `formatKRW(amount: string)`(004 산출) 재사용. **신규
  헬퍼 0**.
- **디자인 토큰**: `@doa/design-tokens` 시맨틱 토큰 클래스(002 산출). 본 차수에 기존 화면 9개의 하드코딩
  팔레트를 이 클래스로 통일.
- **테스트 프레임워크**: 본 차수 별도 e2e/단위 테스트 없음(UI 화면). 검증 = 정적 구조 검증([env:static]) +
  `console typecheck`([env:typecheck]) + `console build` 라우트 컴파일([env:build]).
- **환경변수**: 신규 0. **신규 의존성**: 0건(기존 패키지만 사용).

---

## 사전 영향도 분석 결과

> 상세는 [../design/research.md](../design/research.md) 참조. 본 절은 영향 파일 요약.

### 영향 파일 목록

| 파일 | 변경 유형 | 영향 내용 | 레이어 |
|---|---|---|---|
| `packages/shared-types/src/index.ts` | 수정 | 통계·정산·쿠폰 view 타입 8종(`SellerStats`·`SettlementStatus`·`SettlementView`·`CouponType`·`Coupon`·`CreateCouponRequest`·`IssueCouponRequest`·`UserCoupon` — 금전 string) | A(타입 계약) |
| `packages/api-client/src/index.ts` | 수정 | `stats`(seller)·`settlement`(listMine)·`coupon`(listSeller·createSeller·issueSeller) facade 추가(`api.http` 기반, view 타입 응답 제네릭) | B(도메인 facade) |
| `apps/console/app/(dashboard)/seller/stats/page.tsx` | 신규 | 판매 통계(`StatCard` 2개 — 누적 매출·완료 주문 수) | C(화면) |
| `apps/console/app/(dashboard)/seller/settlements/page.tsx` | 신규 | 정산 Table(기간·총매출·수수료·지급액·상태 Badge) | C(화면) |
| `apps/console/app/(dashboard)/seller/coupons/page.tsx` | 신규 | 쿠폰 목록 Table + 생성 다이얼로그(클라이언트 검증·invalidate) + 발급 다이얼로그(targetUserId) | C(화면) |
| `apps/console/app/(dashboard)/layout.tsx` | 수정 | "쿠폰"·"정산"·"판매 통계" 판매자 네비 3개 추가(+3 -0) | C(셸) |
| `apps/console/app/login/page.tsx` 외 8개 기존 화면 | 수정 | 하드코딩 팔레트(`zinc/red/amber/green/bg-white`) → 시맨틱 토큰 클래스(동작·계약 불변) | C(토큰 통일) |

> 토큰 통일 대상 9개: `login`·`dashboard`·`account/profile`·`account/addresses`·`account/wishlist`·
> `seller/products`·`seller/products/[id]`·`seller/products/new`·`seller/register`.
> 백엔드·DB·`@doa/ui`·`@doa/design-tokens`·`@doa/shared-types` 의 기존 타입·003 타입드 client 변경 0건.
> `package.json` 변경 0(신규 의존 0 — P-002).

### 변경 라인 직접 카운트 (자가 보고 비신뢰)

| 파일 | 추가 | 삭제 | 방법 |
|---|---|---|---|
| `apps/console/.../seller/coupons/page.tsx`(신규) | 235 | 0 | `git diff --numstat 4daca5a 1a6d70d` |
| `apps/console/.../seller/settlements/page.tsx`(신규) | 78 | 0 | 동일 |
| `packages/shared-types/src/index.ts` | 70 | 0 | 동일(view 타입 8종) |
| `apps/console/.../seller/stats/page.tsx`(신규) | 36 | 0 | 동일 |
| `packages/api-client/src/index.ts` | 30 | 0 | 동일(stats·settlement·coupon facade) |
| `apps/console/.../seller/products/[id]/page.tsx` | 16 | 16 | 동일(토큰 통일) |
| `apps/console/.../account/addresses/page.tsx` | 8 | 8 | 동일(토큰 통일) |
| `apps/console/.../account/wishlist/page.tsx` | 7 | 7 | 동일(토큰 통일) |
| `apps/console/.../seller/products/page.tsx` | 7 | 7 | 동일(토큰 통일) |
| `apps/console/.../account/profile/page.tsx` | 3 | 3 | 동일(토큰 통일) |
| `apps/console/.../dashboard/page.tsx` | 3 | 3 | 동일(토큰 통일) |
| `apps/console/app/login/page.tsx` | 3 | 3 | 동일(토큰 통일) |
| `apps/console/app/(dashboard)/layout.tsx` | 3 | 0 | 동일(네비 3개 추가) |
| `apps/console/.../seller/products/new/page.tsx` | 2 | 2 | 동일(토큰 통일) |
| `apps/console/.../seller/register/page.tsx` | 2 | 2 | 동일(토큰 통일) |

**합계**: 15 files changed, 503 insertions(+), 51 deletions(-).

> 커밋 2개로 구성: `1b3ffd1`(Phase 2 화면 — 신규 3화면·layout 네비·api-client·shared-types) + `1a6d70d`
> (토큰 통일 — 기존 9개 페이지). base `4daca5a` → `1a6d70d`.

---

## 핵심 설계

### 1. 판매 통계 화면 (FR-001)

```tsx
// seller/stats/page.tsx
const { data, isLoading, error } = useQuery({
  queryKey: ['seller', 'stats'],
  queryFn: () => api.stats.seller(),       // GET /seller/stats → SellerStats
  enabled: isSeller,
});
// StatCard 2개: 누적 매출 formatKRW(data.salesTotal) · 완료 주문 수 data.orderCount.toLocaleString('ko-KR')건
```

- 비판매자(`!isSeller`)→`EmptyState`("판매자 미등록"), 로딩→`Loading`, 에러→`ErrorText`(`ApiError` instanceof).
- 통계 지표는 누적 매출·완료 주문 수 2개(구매 확정 completed 기준 — PageHeader subtitle 명시).

### 2. 정산 내역 화면 (FR-002)

```tsx
// seller/settlements/page.tsx
const { data } = useQuery({ queryKey: ['seller','settlements'], queryFn: () => api.settlement.listMine(),
  enabled: isSeller });   // GET /settlements → SettlementView[]
// Table 컬럼: 정산 기간(periodStart~periodEnd) · 총 매출 · 수수료(−formatKRW) · 지급액 · 상태 Badge
// status: 'completed' → '지급완료'(success) / 그 외 → '정산대기'(warning)
```

- 빈 목록(`data.length === 0`)→`EmptyState`, 비판매자→`EmptyState`. 금액은 전부 `formatKRW`(우측 정렬·
  `tabular-nums`).

### 3. 쿠폰 목록 + 생성 + 발급 (FR-003·004·005)

```tsx
// seller/coupons/page.tsx
const { data } = useQuery({ queryKey: ['seller','coupons'], queryFn: () => api.coupon.listSeller(),
  enabled: isSeller });   // GET /sellers/me/coupons → CursorPage<Coupon> (data.items 렌더)

// 클라이언트 검증 (010 서버 검증과 정합)
function validate(type: CouponType, discountValue: string): string | null {
  const v = Number(discountValue);
  if (!Number.isFinite(v) || v <= 0) return '할인값은 0보다 커야 합니다.';
  if (type === 'PERCENTAGE' && v > 100) return '비율 할인은 1~100 사이여야 합니다.';
  return null;
}

// CreateCouponDialog (Radix Dialog) — Select(type) + Input(discountValue/minOrderAmount/totalQuantity/expiresAt)
const create = useMutation({
  mutationFn: () => api.coupon.createSeller(body),     // POST /sellers/me/coupons → Coupon
  onSuccess: () => { qc.invalidateQueries({ queryKey: ['seller','coupons'] }); setOpen(false); /* reset */ },
});
// canSubmit = discountValue && expiresAt && !clientError && !create.isPending

// IssueCouponDialog (Radix Dialog) — Input(targetUserId)
const issue = useMutation({
  mutationFn: () => api.coupon.issueSeller(coupon.id, { targetUserId }),  // POST :id/issue → UserCoupon
  onSuccess: () => { setOpen(false); setTargetUserId(''); },   // 성공 문구 표시(목록 invalidate 없음)
});
```

- 목록 Table 컬럼: 할인(`discountLabel`)·최소주문·발급/총량(`issuedCount / totalQuantity`)·만료일·발급 버튼.
- `CursorPage<Coupon>` — 화면은 `data.items` 첫 페이지만 렌더(cursor 더보기 범위 외).

### 4. view 타입 + 도메인 facade (FR-006·007)

```ts
// shared-types/index.ts — 백엔드 응답 OpenAPI 미정의(Prisma 엔티티) → 전이형 view 타입(금전 string)
export interface SellerStats { salesTotal: string; orderCount: number; }
export interface SettlementView { ...; totalSales: string; commission: string; payoutAmount: string;
  status: SettlementStatus; }
export interface Coupon { type: CouponType; discountValue: string; maxDiscountAmount: string|null;
  minOrderAmount: string|null; expiresAt: string; totalQuantity: number|null; issuedCount: number; ... }
// api-client/index.ts
stats:      { seller: () => http.get<SellerStats>('/seller/stats') },
settlement: { listMine: () => http.get<SettlementView[]>('/settlements') },
coupon: {
  listSeller: (cursor?, take?) => http.get<CursorPage<Coupon>>('/sellers/me/coupons', { query: { cursor, take } }),
  createSeller: (body: CreateCouponRequest) => http.post<Coupon>('/sellers/me/coupons', body),
  issueSeller: (id, body: IssueCouponRequest) => http.post<UserCoupon>(`/sellers/me/coupons/${id}/issue`, body),
},
```

### 5. AppShell 네비 + 토큰 통일 (FR-008·009·NFR-003)

```tsx
// layout.tsx — 판매자 네비에 3개 추가 (section: 'seller')
{ href: '/seller/coupons', label: '쿠폰', section: 'seller' },
{ href: '/seller/settlements', label: '정산', section: 'seller' },
{ href: '/seller/stats', label: '판매 통계', section: 'seller' },

// 기존 9개 화면 — 하드코딩 팔레트 → 시맨틱 토큰 (sed 류 일괄 치환, 동작 불변)
// border-zinc-200→border-border · bg-white→bg-surface · text-zinc-900→text-foreground
// text-zinc-500→text-muted-foreground · text-zinc-400→text-subtle-foreground · bg-zinc-50→bg-muted
// divide-zinc-100→divide-border · rounded-xl→rounded-card
// border-amber-200/bg-amber-50→border-warning/bg-warning-soft · text-amber-*→text-warning(-foreground)
// text-red-600→text-danger · (green→success 계열)
```

---

## 결정 기록 (ADRs)

| ADR-ID | 결정 항목 | 채택안 | 대안(검토했으나 미채택) | 근거(spec FR/NFR) | 영향 범위 |
|---|---|---|---|---|---|
| ADR-001 | 응답 호출 도구 | `api.http` 기반 도메인 facade + view 타입 | 003 타입드 `api.client.GET` | FR-006·007(응답 OpenAPI 미정의 — 타입드 이점 적음, 004 연속) | shared-types·api-client |
| ADR-002 | 응답 타입 정의 위치 | `@doa/shared-types` 전이형 view 타입(금전 string) | 화면 로컬 타입 | FR-006, NFR-001 | shared-types |
| ADR-003 | 쿠폰 생성/발급 UI | Radix `Dialog`(목록 화면 내 모달) | 별도 라우트 페이지 | FR-004·005, NFR-004(002 Dialog 재사용) | coupons/page.tsx |
| ADR-004 | 쿠폰 검증 위치 | 클라이언트(UX `validate`) + 백엔드(010 강제) 정합 | 클라이언트만 / 백엔드만 | NFR-002 | coupons/page.tsx |
| ADR-005 | 금전 헬퍼 | 기존 `lib/order.ts` `formatKRW` 재사용 | 신규 헬퍼 정의 | NFR-001, P-005(004 산출 재사용) | stats·settlements·coupons |
| ADR-006 | 권한 강제 | 백엔드 강제 + UI 표시 분기(`isSeller`) | UI 강제 | NFR-005 | 3 화면 |
| ADR-007 | 토큰 통일 범위 | console 전 화면(기존 9개 포함) | Phase 2 신규 화면만 | FR-009, NFR-003(화면 레벨 디자인 SSOT) | 기존 화면 9개 |

---

## 인터페이스 계약

### 백엔드 라우트 계약 (실제 — 호출 측 의존)

| 라우트 | 메서드 | 요청 | 응답(view 타입) | 비고 |
|---|---|---|---|---|
| `/seller/stats` | GET | — | `SellerStats`(salesTotal·orderCount) | 판매자 본인 누적 요약(구매 확정 기준) |
| `/settlements` | GET | — | `SettlementView[]` | 판매자 본인 정산 목록(최신순) |
| `/sellers/me/coupons` | GET | `?cursor&take` | `CursorPage<Coupon>` | 판매자 발급 쿠폰(cursor) |
| `/sellers/me/coupons` | POST | `CreateCouponRequest` | `Coupon` | 쿠폰 생성(APPROVED 판매자, 서버 검증 010) |
| `/sellers/me/coupons/:id/issue` | POST | `IssueCouponRequest`(targetUserId) | `UserCoupon` | 대상 사용자 발급 |

### 006 신규/변경 프론트 인터페이스

```ts
// api-client/index.ts — createApiClient 반환에 추가
stats:      { seller(): Promise<SellerStats>; };
settlement: { listMine(): Promise<SettlementView[]>; };
coupon: {
  listSeller(cursor?: string, take?: number): Promise<CursorPage<Coupon>>;
  createSeller(body: CreateCouponRequest): Promise<Coupon>;
  issueSeller(couponId: string, body: IssueCouponRequest): Promise<UserCoupon>;
};
```

### 하위 호환성 / 방어 코드

- **기존 facade·화면 비파괴(핵심)**: `createApiClient` 반환에 `stats`·`settlement`·`coupon` 을 **추가** 할
  뿐 기존 facade(auth·user·seller·catalog·inventory·order·shipping·http·client)와 console 화면은 불변
  (타입체크 회귀 0 — NFR-006·SC-006). 토큰 통일은 클래스명 교체로 컴포넌트 구조·props·타입 계약 불변.
- **금전 부동소수점 방어**: 기존 `formatKRW` 가 `Number.isFinite` 검사로 비유한값은 원문으로 표기한다. view
  타입 금전 필드는 `string` 이므로 클라이언트가 Decimal 정밀도를 훼손하지 않는다(P-005).
- **쿠폰 검증 이중 방어**: 클라이언트 `validate` 는 제출 전 UX 차단(discountValue>0·PERCENTAGE 1~100)이며,
  실제 강제는 백엔드 010 서버 검증이다. 클라이언트가 통과시킨 값을 백엔드가 거부하면 `ApiError` 메시지를
  다이얼로그에 표시한다(NFR-002).
- **권한 표시 분기**: 비판매자는 각 화면 `EmptyState` 로 분기되나, 실제 데이터 보호는 백엔드 판매자 스코프·
  APPROVED 판매자 검증이 강제한다(NFR-005 — UI 는 표시만).

---

## 데이터 모델

DB 스키마 변경 없음(마이그레이션 0). 신규 테이블·컬럼·enum·인덱스·제약 0건. 본 차수의 "데이터"는 런타임 DB
데이터가 아닌 **HTTP 응답 view 타입**(`@doa/shared-types` 의 전이형 타입 — 백엔드 Prisma 엔티티 응답을
프론트가 한시 표현)이며, 화면은 이를 **소비·표시** 할 뿐 영속하지 않는다. 다이얼로그 폼의 `useState` 는
컴포넌트 세션 메모리로 신규 저장소가 아니다. Database Design Agent 비활성(selection-phases.md).

> **view 타입 한시성**: 응답 view 타입은 백엔드 OpenAPI 응답 정의가 보강되면 생성 타입(`Schemas['...']`)으로
> 대체될 임시 계약이다(GAP-006-01 / 004 GAP-004-01 / 001 GAP-001-01 연속). 정의 위치는 공유 패키지
> (`shared-types`)이므로 백엔드 응답 DTO 보강 시 한 곳에서 교체 가능하다.

---

## 테스트 전략

### SC↔검증 매핑 (요약)

| SC 식별자 | 수준 | 유형 | 시나리오 요약 | 입력 | 기대 결과 |
|---|---|---|---|---|---|
| SC-001 | typecheck/build | 통계 렌더 | StatCard 2개·formatKRW | console typecheck/build | `/seller/stats` 라우트 컴파일·매출/주문 표기 |
| SC-002 | typecheck/build | 정산 렌더 | Table·상태 Badge·formatKRW | console typecheck/build | `/seller/settlements` 컴파일·지급완료/정산대기 |
| SC-003 | static/typecheck/build | 쿠폰 목록+생성 | items Table·Dialog·validate·invalidate | coupons/page.tsx 리뷰 + console build | `/seller/coupons` 컴파일·검증 분기·invalidate |
| SC-004 | static | 쿠폰 발급 | issueSeller·성공 문구·비활성화 | coupons/page.tsx 리뷰 | targetUserId 발급·성공 표시 |
| SC-005 | static/typecheck | view 타입·facade | view 타입 8종·stats/settlement/coupon facade | shared-types·api-client 리뷰 | 금전 string·facade 5종 |
| SC-006 | static/typecheck/build | 네비·토큰·회귀 | 네비 3개·하드코딩 0·17 라우트 | layout·9화면·console typecheck/build | 네비 추가·하드코딩 팔레트 0·회귀 0 |

### smoke_tests

- 필요 여부: N(별도 부팅 스모크 불필요). 본 차수는 UI 화면으로, 검증은 **타입체크(`console typecheck`) +
  console 빌드(신규 3 라우트 컴파일 — `/seller/stats`·`/seller/settlements`·`/seller/coupons`) + 정적 구조
  검증(쿠폰 클라이언트 검증·발급 분기·view 타입·facade·금전 포맷·네비·하드코딩 0)** 으로 갈음한다. 별도
  e2e/단위 테스트 스위트는 작성하지 않으며, 기존 console 빌드·타입체크가 회귀 0 으로 유지된다. e2e·쿠폰 더보기·
  서버 검증 에러 표면·낙관적 업데이트 테스트는 후속 권고(GAP-006-01).

---

## 보안 노트

> Security Agent: N(selection-phases.md). 본 절로 보안 영향 분석을 갈음한다.

- **권한 강제는 백엔드(핵심)**: 본 화면은 클라이언트이며 실제 인가는 백엔드가 강제한다. `GET /seller/stats`·
  `GET /settlements`·`/sellers/me/coupons*` 는 판매자 본인 스코프(쿠폰 생성은 APPROVED 판매자)로 보호된다.
  UI 의 `isSeller` 분기는 표시 편의일 뿐 데이터 보호가 아니며, 비판매자가 라우트에 직접 접근해도 백엔드가
  차단한다(NFR-005).
- **쿠폰 검증 이중 방어(010 정합)**: 클라이언트 `validate` 는 UX 즉시 피드백이며, 할인값·비율 범위의 실제
  강제는 백엔드 010 서버 검증(class-validator)이 담당한다. 클라이언트를 우회한 요청도 백엔드가 거부한다.
- **금전 정합성(P-005)**: 화면은 금전·정산 상태를 변경하지 않고 표시만 하며, Decimal 을 문자열로 받아
  부동소수점 연산 없이 표기한다(`formatKRW`). 결제·정산 상태 변경 로직 0. 쿠폰 도메인은 발급 정의이며 결제·
  정산 outbox/멱등성 경로와 무관하다.
- **신규 공격 표면**: 신규 의존성 0, 신규 네트워크 엔드포인트 0(기존 백엔드 라우트 소비). 생성·발급 폼은
  제어 컴포넌트로 입력을 백엔드 DTO(class-validator)에 위임한다. OWASP Top 10 관점의 신규 공격 표면 없음.
- **결론**: 인가는 백엔드 위임(클라이언트 표시 분기), 쿠폰 검증은 010 서버 검증 정합, 금전은 표시 전용·
  부동소수점 미연산. 보안 감사 대상 부재(Security Agent: N — selection-phases.md).

---

## 기타 고려사항

- **응답 타입 처리(핵심)**: 통계·정산·쿠폰 엔드포인트는 백엔드가 Prisma 엔티티를 반환하고 OpenAPI 에 응답
  스키마가 미정의다(001 coverage-gap). 따라서 003 의 타입드 client 는 응답 타입이 비어 본 화면에서 이점이
  적어, `api.http` 기반 도메인 facade + `@doa/shared-types` 전이형 view 타입을 채택했다(ADR-001·004 연속).
  요청 측(params·body)은 정확하나 응답은 한시 view 타입이며, 백엔드 응답 DTO + `@ApiResponse({ type })` 보강
  후 코드젠 재생성하면 생성 타입으로 대체 가능하다(GAP-006-01).
- **쿠폰 cursor 미소비**: `api.coupon.listSeller` facade 는 `cursor`·`take` 를 받아 `CursorPage<Coupon>` 를
  반환하나, 화면은 인자 없이 호출하여 첫 페이지(`data.items`)만 렌더한다. '더보기' 추가 로드는 범위 외이며,
  facade 시그니처는 후속에서 더보기 구현 시 즉시 사용 가능하다(GAP-006-01).
- **발급 후 목록 비갱신**: `issueSeller` `onSuccess` 는 다이얼로그를 닫고 성공 문구만 표시하며 목록을
  invalidate 하지 않는다. 현재 쿠폰 목록 컬럼(발급/총량)은 발급 직후 즉시 갱신되지 않는다(다음 조회 시 반영).
  발급 결과 즉시 반영이 필요하면 후속에서 `['seller','coupons']` invalidate 를 추가한다(GAP-006-01).
- **토큰 통일 = 클래스명 교체**: 토큰 통일은 하드코딩 Tailwind 팔레트 클래스를 시맨틱 토큰 클래스로 일괄
  치환하는 작업으로, 컴포넌트 구조·props·핸들러는 불변이다. 시각 결과는 002 토큰 매핑(light)에 따라 동일하게
  유지되며, `.dark` 분기가 화면 레벨까지 작동하게 된다. 다크 토글 UI 는 범위 외(002 GAP-002-01 연속).
- **재고 화면 기존 통합**: 연구 중 재고 관리가 기존 상품 상세(`/seller/products/[id]`)에 이미 통합되어 있음을
  확인하여 별도 재고 화면을 추가하지 않았다(spec §범위 외 — research.md).
- **신규 의존 0**: 본 차수는 기존 패키지(TanStack Query·Radix Dialog·`@doa/ui`·`@doa/api-client`·
  `@doa/shared-types`·`@doa/design-tokens`)만 사용하며 `package.json` 변경이 없다(P-002 무저촉 자명,
  NFR-006 회귀 0 유리).
