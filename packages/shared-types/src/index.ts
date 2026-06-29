/**
 * @doa/shared-types — 프론트(console)·api-client 가 공유하는 백엔드 HTTP 계약 타입.
 *
 * **Phase 0(OpenAPI 코드젠) 전환 중**:
 * - `openapi.gen.ts` 가 백엔드 OpenAPI(`apps/backend/openapi.json`)에서 자동 생성된 SSOT 다
 *   (`pnpm --filter @doa/shared-types gen`). 신규 타입은 여기서 가져온다.
 * - 아래 수기 타입(001/002 도메인)은 기존 console 화면 호환을 위해 한시 유지하며,
 *   생성 타입으로 점진 대체한다.
 */

// OpenAPI 자동 생성 계약 (SSOT) — paths/components/operations 전체 재노출.
export type { paths, components, operations } from './openapi.gen';
import type { components as _components } from './openapi.gen';

/** OpenAPI components.schemas 단축 접근 — `Schemas['CreateProductDto']` 형태. */
export type Schemas = _components['schemas'];
/** 개별 스키마 추출 헬퍼 — `Schema<'CreateCouponDto'>`. */
export type Schema<K extends keyof _components['schemas']> =
  _components['schemas'][K];

// ---------------------------------------------------------------------------
// 공통
// ---------------------------------------------------------------------------

/** 백엔드 NestJS 예외 필터의 표준 에러 응답 형태. */
export interface ApiErrorBody {
  statusCode: number;
  message: string | string[];
  error?: string;
}

/** cursor 기반 페이지네이션 응답 (product 목록 등). */
export interface CursorPage<T> {
  items: T[];
  nextCursor: string | null;
}

// ---------------------------------------------------------------------------
// auth (POST /auth/*)
// ---------------------------------------------------------------------------

export interface LoginRequest {
  email: string;
  password: string;
}

export interface RegisterRequest {
  email: string;
  /** 최소 8자 (백엔드 @MinLength(8)). */
  password: string;
}

/** POST /auth/login, POST /auth/refresh(accessToken만) 응답. */
export interface AuthTokens {
  accessToken: string;
  refreshToken?: string;
}

/**
 * 사용자 프로필. 엔드포인트별로 채워지는 필드가 다르다.
 * - GET /auth/me  → { id, email, createdAt }
 * - GET /users/me → { id, email, name, phone }
 */
export interface UserProfile {
  id: string;
  email: string;
  name?: string | null;
  phone?: string | null;
  createdAt?: string;
}

/** PATCH /users/me — UpdateProfileDto. */
export interface UpdateProfileRequest {
  name?: string;
  phone?: string;
}

// ---------------------------------------------------------------------------
// user: 배송지 / 위시리스트 / 최근 본 상품 (GET/POST/PATCH/DELETE /users/me/*)
// ---------------------------------------------------------------------------

export interface Address {
  id: string;
  userId: string;
  recipientName: string;
  phone: string;
  zipCode: string;
  address1: string;
  address2?: string | null;
  isDefault: boolean;
  createdAt?: string;
}

/** POST /users/me/addresses — CreateAddressDto. */
export interface CreateAddressRequest {
  recipientName: string;
  phone: string;
  zipCode: string;
  address1: string;
  address2?: string;
  isDefault?: boolean;
}

/** PATCH /users/me/addresses/:id — UpdateAddressDto. */
export interface UpdateAddressRequest {
  recipientName?: string;
  phone?: string;
  zipCode?: string;
  address1?: string;
  address2?: string | null;
}

/** GET /users/me/wishlist — 위시리스트 행(상품 정보 미조인, productId 만). */
export interface WishlistItem {
  id: string;
  userId: string;
  productId: string;
  createdAt?: string;
}

/** GET /users/me/recent-views — 최근 본 상품 행(productId 만). */
export interface RecentView {
  id: string;
  userId: string;
  productId: string;
  viewedAt?: string;
}

// ---------------------------------------------------------------------------
// seller (POST/GET/PATCH /sellers/*)
// ---------------------------------------------------------------------------

/** prisma enum SellerStatus (apps/backend/prisma/schema.prisma). */
export type SellerStatus = 'PENDING' | 'APPROVED' | 'REJECTED';

/** POST /sellers/register — RegisterSellerDto. */
export interface SellerRegisterRequest {
  businessName: string;
  businessNumber: string;
  representativeName: string;
  contactPhone?: string;
  businessAddress?: string;
}

export interface SellerProfile {
  id: string;
  userId: string;
  businessName: string;
  businessNumber: string;
  representativeName: string;
  contactPhone?: string | null;
  businessAddress?: string | null;
  status: SellerStatus;
  rejectReason?: string | null;
  createdAt?: string;
}

/** GET /sellers/me/status — 승인 상태 + 반려 사유. */
export interface SellerStatusResponse {
  status: SellerStatus;
  rejectReason: string | null;
}

// ---------------------------------------------------------------------------
// product / category (GET/POST/PATCH /products, /categories, /sellers/me/products)
// ---------------------------------------------------------------------------

/** prisma enum ProductStatus. */
export type ProductStatus = 'DRAFT' | 'ACTIVE' | 'OUT_OF_STOCK' | 'INACTIVE';

export interface Category {
  id: string;
  name: string;
  slug: string;
  displayOrder: number;
}

export interface ProductVariant {
  id: string;
  productId?: string;
  sku: string;
  optionName: string;
  optionValue: string;
  price: string; // Decimal → 문자열 직렬화 (NFR-005)
  /** 재고는 Inventory 조인 시에만 포함. */
  stock?: number;
}

export interface ProductImage {
  id: string;
  url: string;
  displayOrder: number;
}

export interface Product {
  id: string;
  sellerId: string;
  categoryId: string;
  title: string;
  description?: string | null;
  price: string; // Decimal
  status: ProductStatus;
  variants?: ProductVariant[];
  images?: ProductImage[];
  category?: Category;
  createdAt?: string;
}

/** GET /products 쿼리 파라미터 (public 목록 — cursor·limit 만 지원). */
export interface ListProductsQuery {
  cursor?: string;
  limit?: number;
}

/** POST /products — CreateProductDto. */
export interface CreateProductRequest {
  categoryId: string;
  title: string;
  description?: string;
  price: number;
}

/** POST /products/:id/variants — CreateVariantDto. */
export interface CreateVariantRequest {
  optionName: string;
  optionValue: string;
  sku: string;
  price: number;
  initialStock?: number;
}

/** POST /products/:id/images — AddImageDto. */
export interface AddImageRequest {
  url: string;
  displayOrder?: number;
}

// ---------------------------------------------------------------------------
// inventory (POST /inventory/:variantId/stock-in, GET /inventory/:variantId/stock)
// 두 엔드포인트 모두 APPROVED 판매자 필수.
// - GET  /inventory/:variantId/stock   → 숫자(현재 재고)만 반환
// - POST /inventory/:variantId/stock-in → 본문 없음(void, 200)
// ---------------------------------------------------------------------------

/** POST /inventory/:variantId/stock-in — StockInDto. quantity 최소 1. */
export interface StockInRequest {
  quantity: number;
}

// ---------------------------------------------------------------------------
// order / shipping (Phase 1 — 판매자 주문·배송)
// 백엔드 응답이 OpenAPI 에 미정의(Prisma 엔티티 반환)이므로 전이형 view 타입으로 한시 정의한다.
// 금전 필드는 Decimal → JSON 직렬화 시 문자열.
// ---------------------------------------------------------------------------

export type OrderStatus =
  | 'pending'
  | 'confirmed'
  | 'preparing'
  | 'shipped'
  | 'delivered'
  | 'completed'
  | 'cancelled';

/** GET /seller/orders — 판매자 주문 1건(items 미포함). */
export interface SellerOrder {
  id: string;
  userId: string;
  status: OrderStatus;
  totalAmount: string;
  discountAmount: string;
  deliveredAt: string | null;
  completedAt: string | null;
  createdAt: string;
}

export interface OrderItemView {
  id: string;
  productId: string;
  sellerId: string;
  variantId: string;
  unitPrice: string;
  quantity: number;
}

/** GET /seller/orders/:orderId — 판매자 단건 주문 상세(items 포함). */
export interface SellerOrderDetail extends SellerOrder {
  items: OrderItemView[];
}

export type ShipmentStatus = 'preparing' | 'shipped' | 'in_transit' | 'delivered';

export interface Shipment {
  id: string;
  orderId: string;
  status: ShipmentStatus;
  carrier: string;
  trackingNumber: string;
  shippedAt: string | null;
  deliveredAt: string | null;
  createdAt: string;
}

export interface ShipmentTracking {
  id: string;
  shipmentId: string;
  status: ShipmentStatus;
  description: string;
  occurredAt: string;
}

/** POST /shipments — CreateShipmentDto. */
export interface CreateShipmentRequest {
  orderId: string;
  carrier: string;
  trackingNumber: string;
}

/** PATCH /shipments/:id/status — UpdateShipmentStatusDto. */
export interface UpdateShipmentStatusRequest {
  status: ShipmentStatus;
  description?: string;
}
