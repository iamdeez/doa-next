import type {
  AddImageRequest,
  Address,
  AuthTokens,
  Category,
  CreateAddressRequest,
  CreateProductRequest,
  CreateShipmentRequest,
  CreateVariantRequest,
  CursorPage,
  ListProductsQuery,
  LoginRequest,
  Product,
  ProductImage,
  ProductVariant,
  RecentView,
  RegisterRequest,
  SellerOrder,
  SellerOrderDetail,
  SellerProfile,
  SellerRegisterRequest,
  SellerStatusResponse,
  Shipment,
  ShipmentTracking,
  StockInRequest,
  UpdateAddressRequest,
  UpdateProfileRequest,
  UpdateShipmentStatusRequest,
  UserProfile,
  WishlistItem,
} from '@doa/shared-types';
import createOpenApiClient from 'openapi-fetch';
import type { paths } from '@doa/shared-types';
import { HttpClient, type HttpClientOptions } from './http';
import { createAuthFetch } from './auth-fetch';

export { ApiError, HttpClient } from './http';
export { createAuthFetch } from './auth-fetch';
export type { HttpClientOptions, TokenStore } from './http';
export type { AuthFetchOptions } from './auth-fetch';

/** OpenAPI(생성 타입) 기반 완전 타입드 클라이언트 — 전 도메인 70개 경로. */
export type TypedClient = ReturnType<typeof createOpenApiClient<paths>>;

/**
 * 도메인별로 그룹화된 타입드 API 클라이언트.
 * 엔드포인트 경로는 apps/backend 컨트롤러(글로벌 프리픽스 없음) 기준.
 */
export function createApiClient(options: HttpClientOptions) {
  // 공유 authFetch — legacy facade 와 타입드 client 가 동일 refresh(in-flight 1회) 공유.
  const authFetch = createAuthFetch(options);
  const http = new HttpClient(options, authFetch);
  /**
   * 전 도메인 타입드 클라이언트 (openapi-fetch). 신규 화면은 이것을 사용한다.
   * 예: `api.client.GET('/seller/orders', { params: { query: { ... } } })` — 경로·쿼리·본문·응답 전부 타입.
   */
  const client = createOpenApiClient<paths>({ baseUrl: options.baseUrl, fetch: authFetch });

  return {
    http,
    client,

    auth: {
      login: (body: LoginRequest) =>
        http.post<AuthTokens>('/auth/login', body, { anonymous: true }),
      register: (body: RegisterRequest) =>
        http.post<UserProfile>('/auth/register', body, { anonymous: true }),
      logout: (refreshToken: string) =>
        http.post<void>('/auth/logout', { refreshToken }),
      me: () => http.get<UserProfile>('/auth/me'),
    },

    user: {
      me: () => http.get<UserProfile>('/users/me'),
      updateProfile: (body: UpdateProfileRequest) =>
        http.patch<UserProfile>('/users/me', body),

      addresses: {
        list: () => http.get<Address[]>('/users/me/addresses'),
        create: (body: CreateAddressRequest) =>
          http.post<Address>('/users/me/addresses', body),
        update: (id: string, body: UpdateAddressRequest) =>
          http.patch<Address>(`/users/me/addresses/${id}`, body),
        remove: (id: string) => http.delete<void>(`/users/me/addresses/${id}`),
        setDefault: (id: string) =>
          http.patch<{ ok: boolean }>(`/users/me/addresses/${id}/default`),
      },

      wishlist: {
        list: () => http.get<WishlistItem[]>('/users/me/wishlist'),
        add: (productId: string) =>
          http.post<WishlistItem>('/users/me/wishlist', { productId }),
        remove: (productId: string) =>
          http.delete<void>(`/users/me/wishlist/${productId}`),
      },

      recentViews: () => http.get<RecentView[]>('/users/me/recent-views'),
    },

    seller: {
      register: (body: SellerRegisterRequest) =>
        http.post<SellerProfile>('/sellers/register', body),
      me: () => http.get<SellerProfile>('/sellers/me'),
      status: () => http.get<SellerStatusResponse>('/sellers/me/status'),
      /** GET /sellers/me/products — 본인 상품 전체 배열(페이지네이션 없음). */
      myProducts: () => http.get<Product[]>('/sellers/me/products'),
      /** 관리자 전용(ADMIN_USER_IDS) — 비관리자는 403. */
      approve: (sellerId: string) =>
        http.patch<SellerProfile>(`/sellers/${sellerId}/approve`),
      reject: (sellerId: string, reason?: string) =>
        http.patch<SellerProfile>(`/sellers/${sellerId}/reject`, { reason }),
    },

    catalog: {
      categories: () => http.get<Category[]>('/categories'),
      listProducts: (query?: ListProductsQuery) =>
        http.get<CursorPage<Product>>('/products', { query: query as never }),
      getProduct: (id: string) => http.get<Product>(`/products/${id}`),
      createProduct: (body: CreateProductRequest) =>
        http.post<Product>('/products', body),
      publishProduct: (id: string) => http.patch<Product>(`/products/${id}/publish`),
      deactivateProduct: (id: string) =>
        http.patch<Product>(`/products/${id}/deactivate`),
      addVariant: (productId: string, body: CreateVariantRequest) =>
        http.post<ProductVariant>(`/products/${productId}/variants`, body),
      addImage: (productId: string, body: AddImageRequest) =>
        http.post<ProductImage>(`/products/${productId}/images`, body),
    },

    inventory: {
      /** 현재 재고(숫자) — APPROVED 판매자 전용. */
      getStock: (variantId: string) =>
        http.get<number>(`/inventory/${variantId}/stock`),
      /** 재고 입고 — 본문 없음(void). APPROVED 판매자 전용. */
      stockIn: (variantId: string, body: StockInRequest) =>
        http.post<void>(`/inventory/${variantId}/stock-in`, body),
    },

    order: {
      /** GET /seller/orders — 판매자 본인 주문 목록(최신순). */
      listSeller: () => http.get<SellerOrder[]>('/seller/orders'),
      /** GET /seller/orders/:id — 판매자 단건 주문 상세(items 포함). */
      getSellerDetail: (orderId: string) =>
        http.get<SellerOrderDetail>(`/seller/orders/${orderId}`),
      /** POST /seller/orders/:id/confirm — 주문 확인(confirmed → preparing). */
      confirm: (orderId: string) =>
        http.post<void>(`/seller/orders/${orderId}/confirm`),
    },

    shipping: {
      /** POST /shipments — 송장 등록(preparing → shipped). 생성된 Shipment 반환. */
      create: (body: CreateShipmentRequest) => http.post<Shipment>('/shipments', body),
      /** GET /shipments?orderId= — 주문 기준 송장 조회(없으면 null). 재진입 복구용. */
      getByOrder: (orderId: string) =>
        http.get<Shipment | null>('/shipments', { query: { orderId } }),
      /** PATCH /shipments/:id/status — 배송 상태 업데이트(delivered 시 주문도 delivered). */
      updateStatus: (id: string, body: UpdateShipmentStatusRequest) =>
        http.patch<Shipment>(`/shipments/${id}/status`, body),
      /** GET /shipments/:id/tracking — 추적 이력(권한 3축: 구매자/판매자). */
      tracking: (id: string) => http.get<ShipmentTracking[]>(`/shipments/${id}/tracking`),
    },
  };
}

export type ApiClient = ReturnType<typeof createApiClient>;
