# console

DOA Market 판매자·관리자 통합 콘솔 (Next.js App Router, 역할 기반 라우팅 — REBUILD-PLAN 옵션 A).

## 스택

- Next.js 15 (App Router) · React 19 · TypeScript
- Tailwind CSS v4
- TanStack Query v5
- 공유 패키지: `@doa/api-client`, `@doa/shared-types`, `@doa/ui`(공유 컴포넌트)

> Tailwind v4 는 `node_modules` 를 스캔하지 않으므로, `app/globals.css` 의
> `@source '../../../packages/ui/src'` 로 `@doa/ui` 의 클래스를 포함시킨다.

## 실행

```bash
# 모노레포 루트에서 의존성 설치
pnpm install

# 백엔드(apps/backend, 포트 3000) 기동 후
pnpm --filter console dev   # http://localhost:3100
```

환경변수: `NEXT_PUBLIC_API_URL` (기본 `http://localhost:3000`).

## 구조

```
app/
├── login/                  로그인 (POST /auth/login)
├── (dashboard)/
│   ├── layout.tsx          인증 가드 + 역할 기반 사이드바
│   ├── dashboard/          개요
│   ├── account/profile/    프로필 조회·수정 (GET/PATCH /users/me)
│   ├── account/addresses/  배송지 CRUD + 기본 설정 (/users/me/addresses)
│   ├── account/wishlist/   위시리스트·최근 본 상품 (/users/me/wishlist, /recent-views)
│   ├── seller/products/    GET /sellers/me/products (실통합 데모)
│   │   ├── new/            상품 등록 (POST /products)
│   │   └── [id]/           옵션·재고 관리 (variants·stock-in·publish)
│   └── admin/sellers/      판매자 승인 (관리자, 목록 API 대기)
lib/
├── api.ts                  @doa/api-client 인스턴스
├── auth.tsx                AuthProvider · useAuth · 역할 판별
└── token-store.ts          localStorage 토큰 저장
```

## 백엔드 계약 갭 (후속)

- **관리자 판별**: 백엔드가 토큰 클레임이 아닌 `ADMIN_USER_IDS` env 로 admin 을 판별하여,
  "내가 관리자인가"를 알려주는 클라이언트 엔드포인트가 없다. admin 라우트는 백엔드
  `AdminGuard` 가 최종 강제하며 UI 는 403 을 graceful 처리한다.
- **판매자 목록(관리자)**: 승인 대기 판매자 목록 조회 API 부재 — `admin/sellers` 는 플레이스홀더.
- **판매자용 상품 상세(any status)**: `GET /products/:id` 는 ACTIVE/OUT_OF_STOCK 만 반환(DRAFT/INACTIVE → 404).
  판매자가 DRAFT 상품의 옵션을 되읽을 엔드포인트가 없어, 상품 관리 화면은 게시(publish) 후 전체 표시되며
- **위시리스트·최근 본 상품**: productId 만 반환(상품 미조인) — 상품명 표시 보류. 갭 전체 목록은 `docs/backend-gaps.md`.
  DRAFT 는 "옵션 추가 + 게시" 패널로 우회한다. 옵션 추가는 `POST` 응답 id 로 동작.
- 003-commerce(cart/order/payment) 화면은 해당 도메인 구현 후 추가.
