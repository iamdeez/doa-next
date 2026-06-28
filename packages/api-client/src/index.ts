import type {
  AddImageRequest,
  Address,
  AuthTokens,
  Category,
  CreateAddressRequest,
  CreateProductRequest,
  CreateVariantRequest,
  CursorPage,
  ListProductsQuery,
  LoginRequest,
  Product,
  ProductImage,
  ProductVariant,
  RecentView,
  RegisterRequest,
  SellerProfile,
  SellerRegisterRequest,
  SellerStatusResponse,
  StockInRequest,
  UpdateAddressRequest,
  UpdateProfileRequest,
  UserProfile,
  WishlistItem,
} from '@doa/shared-types';
import { HttpClient, type HttpClientOptions } from './http';

export { ApiError, HttpClient } from './http';
export type { HttpClientOptions, TokenStore } from './http';

/**
 * 도메인별로 그룹화된 타입드 API 클라이언트.
 * 엔드포인트 경로는 apps/backend 컨트롤러(글로벌 프리픽스 없음) 기준.
 */
export function createApiClient(options: HttpClientOptions) {
  const http = new HttpClient(options);

  return {
    http,

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
  };
}

export type ApiClient = ReturnType<typeof createApiClient>;
