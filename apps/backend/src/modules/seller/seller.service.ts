import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, SellerStatus } from '@prisma/client';
import { SellerRepository } from './seller.repository';

export interface SellerProfile {
  id: string;
  userId: string;
  businessName: string;
  businessNumber: string;
  representativeName: string;
  contactPhone: string | null;
  businessAddress: string | null;
  status: SellerStatus;
  rejectReason: string | null;
  createdAt: Date;
}

export interface SellerStatusResult {
  status: SellerStatus;
  rejectReason: string | null;
}

/** product 모듈이 DI 소비하는 공개 인터페이스 (plan 인터페이스 계약) */
export interface ApprovedSeller {
  id: string;
  userId: string;
}

@Injectable()
export class SellerService {
  constructor(private readonly sellerRepository: SellerRepository) {}

  async register(
    userId: string,
    data: {
      businessName: string;
      businessNumber: string;
      representativeName: string;
      contactPhone?: string;
      businessAddress?: string;
    },
  ): Promise<SellerProfile> {
    try {
      return await this.sellerRepository.createSeller({ userId, ...data });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new ConflictException('Seller profile already exists');
      }
      throw err;
    }
  }

  async getMyProfile(userId: string): Promise<SellerProfile> {
    const seller = await this.sellerRepository.findByUserId(userId);
    if (!seller) throw new NotFoundException('Seller profile not found');
    return seller;
  }

  async updateMyProfile(
    userId: string,
    data: {
      businessName?: string;
      businessNumber?: string;
      representativeName?: string;
      contactPhone?: string | null;
      businessAddress?: string | null;
    },
  ): Promise<SellerProfile> {
    const seller = await this.sellerRepository.findByUserId(userId);
    if (!seller) throw new NotFoundException('Seller profile not found');
    return this.sellerRepository.updateSeller(seller.id, data);
  }

  async getStatus(userId: string): Promise<SellerStatusResult> {
    const seller = await this.sellerRepository.findByUserId(userId);
    if (!seller) throw new NotFoundException('Seller profile not found');
    return { status: seller.status, rejectReason: seller.rejectReason };
  }

  async approve(sellerId: string): Promise<SellerProfile> {
    const seller = await this.sellerRepository.findById(sellerId);
    if (!seller) throw new NotFoundException('Seller not found');
    return this.sellerRepository.updateStatus(sellerId, SellerStatus.APPROVED, null);
  }

  async reject(sellerId: string, rejectReason: string): Promise<SellerProfile> {
    const seller = await this.sellerRepository.findById(sellerId);
    if (!seller) throw new NotFoundException('Seller not found');
    return this.sellerRepository.updateStatus(sellerId, SellerStatus.REJECTED, rejectReason);
  }

  /**
   * 공개 메서드: product 모듈이 DI 소비 (plan 인터페이스 계약 고정).
   * 미등록 또는 APPROVED 아닌 판매자 → ForbiddenException (FR-017/019, SC-019·020·023).
   */
  async getApprovedSeller(userId: string): Promise<ApprovedSeller> {
    const seller = await this.sellerRepository.findByUserId(userId);
    if (!seller || seller.status !== SellerStatus.APPROVED) {
      throw new ForbiddenException('Seller is not approved');
    }
    return { id: seller.id, userId: seller.userId };
  }

  // ── 관리자 조회 (007-stats / 007-admin, additive 공개 메서드) ──────

  /** 전체 판매자 수 — StatsService 가 DI 경유로 소비 (P-001 경계). */
  async countAllSellers(): Promise<number> {
    return this.sellerRepository.countAll();
  }

  /** 상태별 판매자 목록 — AdminService 가 DI 경유로 소비. 승인 대기(PENDING) 조회 등. */
  async listByStatus(status: SellerStatus): Promise<SellerProfile[]> {
    return this.sellerRepository.listByStatus(status);
  }

  /**
   * 상태별 판매자 목록 — cursor 페이지네이션 + 검색 (017).
   * AdminService 가 DI 경유로 소비. limit 클램프는 호출 측(AdminService) 책임.
   */
  async listSellers(params: {
    status: SellerStatus;
    cursor?: string;
    take: number;
    q?: string;
  }): Promise<{ items: SellerProfile[]; nextCursor: string | null }> {
    const items = await this.sellerRepository.listByStatusPaginated(params);
    const nextCursor = items.length === params.take ? items[items.length - 1].id : null;
    return { items, nextCursor };
  }

  /**
   * sellerId → 판매자 소유 userId 해석 (009 알림 연동, additive read-only).
   * NotificationEventsHandler 가 정산·리뷰 알림 수신자(판매자 userId) 해석에 사용. 미존재 시 null.
   */
  async getUserIdBySellerId(sellerId: string): Promise<string | null> {
    const seller = await this.sellerRepository.findById(sellerId);
    return seller?.userId ?? null;
  }
}
