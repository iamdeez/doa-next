import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { ProductService } from '../product/product.service';
import { MAX_PRODUCT_VIEWS } from './user.constants';
import { UserRepository } from './user.repository';

export interface UserProfile {
  id: string;
  email: string;
  name: string | null;
  phone: string | null;
}

export interface AddressData {
  id: string;
  userId: string;
  recipientName: string;
  phone: string;
  zipCode: string;
  address1: string;
  address2: string | null;
  isDefault: boolean;
  createdAt: Date;
}

export interface WishlistItem {
  id: string;
  userId: string;
  productId: string;
  createdAt: Date;
}

export interface RecentView {
  id: string;
  userId: string;
  productId: string;
  viewedAt: Date;
}

/** 관리자 사용자 목록 항목 — 민감 필드(password) 제외 안전 요약 (007-admin). */
export interface AdminUserListItem {
  id: string;
  email: string;
  name: string | null;
  phone: string | null;
  createdAt: Date;
}

/** 위시리스트·최근 본 상품 항목에 병합되는 상품 요약 (017). 조회 불가 시 null. */
export interface ProductSummaryInfo {
  title: string;
  price: string;
  thumbnailUrl: string | null;
}

@Injectable()
export class UserService {
  constructor(
    private readonly userRepository: UserRepository,
    private readonly productService: ProductService,
  ) {}

  // ── Profile ───────────────────────────────────────────────────────

  async getProfile(userId: string): Promise<UserProfile> {
    const user = await this.userRepository.findUserById(userId);
    if (!user) throw new NotFoundException('User not found');
    return { id: user.id, email: user.email, name: user.name, phone: user.phone };
  }

  async updateProfile(userId: string, data: { name?: string; phone?: string }): Promise<UserProfile> {
    const user = await this.userRepository.updateUser(userId, data);
    return { id: user.id, email: user.email, name: user.name, phone: user.phone };
  }

  // ── 관리자 조회 (007-stats / 007-admin, additive 공개 메서드) ──────

  /** 전체 사용자 수 — StatsService 가 DI 경유로 소비 (P-001 경계). */
  async countAllUsers(): Promise<number> {
    return this.userRepository.countAll();
  }

  /**
   * 관리자 사용자 목록 — AdminService 가 DI 경유로 소비.
   * password 등 민감 필드 제외하고 안전한 요약만 반환. cursor 페이지네이션.
   */
  async listUsersForAdmin(
    cursor: string | undefined,
    take: number,
  ): Promise<{ items: AdminUserListItem[]; nextCursor: string | null }> {
    const rows = await this.userRepository.listPaginated(cursor, take);
    const items = rows.map((u) => ({
      id: u.id,
      email: u.email,
      name: u.name,
      phone: u.phone,
      createdAt: u.createdAt,
    }));
    const nextCursor = rows.length === take ? rows[rows.length - 1].id : null;
    return { items, nextCursor };
  }

  // ── Address ───────────────────────────────────────────────────────

  async listAddresses(userId: string): Promise<AddressData[]> {
    return this.userRepository.findAddressesByUser(userId);
  }

  async createAddress(
    userId: string,
    data: {
      recipientName: string;
      phone: string;
      zipCode: string;
      address1: string;
      address2?: string;
      isDefault?: boolean;
    },
  ): Promise<AddressData> {
    return this.userRepository.createAddress(userId, data);
  }

  async updateAddress(
    userId: string,
    addressId: string,
    data: {
      recipientName?: string;
      phone?: string;
      zipCode?: string;
      address1?: string;
      address2?: string | null;
    },
  ): Promise<AddressData> {
    const address = await this.userRepository.findAddressById(addressId);
    if (!address) throw new NotFoundException('Address not found');
    if (address.userId !== userId) throw new ForbiddenException('Access denied');
    return this.userRepository.updateAddress(addressId, data);
  }

  async deleteAddress(userId: string, addressId: string): Promise<void> {
    const address = await this.userRepository.findAddressById(addressId);
    if (!address) throw new NotFoundException('Address not found');
    if (address.userId !== userId) throw new ForbiddenException('Access denied');
    await this.userRepository.deleteAddressWithReassign(userId, addressId, address.isDefault);
  }

  async setDefaultAddress(userId: string, addressId: string): Promise<void> {
    const address = await this.userRepository.findAddressById(addressId);
    if (!address) throw new NotFoundException('Address not found');
    if (address.userId !== userId) throw new ForbiddenException('Access denied');
    await this.userRepository.setDefaultTx(userId, addressId);
  }

  // ── Wishlist ──────────────────────────────────────────────────────

  /** 위시리스트 조회 + 상품 요약 enrichment (017 — ProductService DI, 모듈 경계 준수). */
  async listWishlist(
    userId: string,
  ): Promise<(WishlistItem & { productAvailable: boolean; product: ProductSummaryInfo | null })[]> {
    const rows = await this.userRepository.findWishlistsByUser(userId);
    return this.enrichWithProductSummary(rows);
  }

  async addWishlist(userId: string, productId: string): Promise<WishlistItem> {
    try {
      return await this.userRepository.createWishlist(userId, productId);
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new ConflictException('Already in wishlist');
      }
      throw err;
    }
  }

  async removeWishlist(userId: string, productId: string): Promise<void> {
    await this.userRepository.deleteWishlist(userId, productId);
  }

  // ── ProductView ───────────────────────────────────────────────────

  /** 최근 본 상품 조회 + 상품 요약 enrichment (017 — ProductService DI, 모듈 경계 준수). */
  async listRecentViews(
    userId: string,
  ): Promise<(RecentView & { productAvailable: boolean; product: ProductSummaryInfo | null })[]> {
    const rows = await this.userRepository.findRecentViews(userId, MAX_PRODUCT_VIEWS);
    return this.enrichWithProductSummary(rows);
  }

  /** product.viewed 이벤트 핸들러(UserEventsHandler)가 호출. */
  async recordProductView(userId: string, productId: string): Promise<void> {
    await this.userRepository.upsertProductView(userId, productId);
  }

  // ── Private helpers ───────────────────────────────────────────────

  /**
   * 위시리스트·최근 본 상품 공통 enrichment (017).
   * productAvailable·product 두 필드를 동일 가드(summaries.get 존재 여부)로 결정하는 통합 블록.
   * 조회 불가 항목은 제외하지 않고 유지 + productAvailable:false + product:null
   * (데이터 유실로 오인되지 않도록 무음 필터링하지 않음).
   */
  private async enrichWithProductSummary<T extends { productId: string }>(
    rows: T[],
  ): Promise<(T & { productAvailable: boolean; product: ProductSummaryInfo | null })[]> {
    const summaries = await this.productService.getPublicSummaries(rows.map((r) => r.productId));
    return rows.map((r) => {
      const summary = summaries.get(r.productId);
      return {
        ...r,
        productAvailable: !!summary,
        product: summary
          ? { title: summary.title, price: summary.price.toString(), thumbnailUrl: summary.thumbnailUrl }
          : null,
      };
    });
  }
}
