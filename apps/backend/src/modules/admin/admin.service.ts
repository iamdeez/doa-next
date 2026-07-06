import { BadRequestException, Injectable } from '@nestjs/common';
import { AdminAuditLog, SellerStatus } from '@prisma/client';
import { SellerProfile, SellerService } from '../seller/seller.service';
import { AdminUserListItem, UserService } from '../user/user.service';
import { AdminRepository } from './admin.repository';
import {
  AUDIT_ACTION,
  AUDIT_TARGET,
  DEFAULT_AUDIT_LOG_LIMIT,
  DEFAULT_SELLER_PAGE_LIMIT,
  DEFAULT_USER_PAGE_LIMIT,
  MAX_AUDIT_LOG_LIMIT,
  MAX_SELLER_PAGE_LIMIT,
  MAX_USER_PAGE_LIMIT,
} from './admin.constants';

/**
 * 운영 관리 서비스 — 기존 도메인 Service 조합(P-001: 타 도메인 데이터는 DI 경유).
 * 자기 소유 테이블은 admin_audit_logs(감사 로그)뿐이며 AdminRepository 로 접근한다.
 * 판매자 승인 로직은 seller 도메인 재사용(SellerService.approve), 조치 후 감사 로그를 append 한다.
 */
@Injectable()
export class AdminService {
  constructor(
    private readonly sellerService: SellerService,
    private readonly userService: UserService,
    private readonly adminRepository: AdminRepository,
  ) {}

  // ── 판매자 운영 ──────────────────────────────────────────────────

  /**
   * 판매자 목록 — 상태 필터·cursor 페이지네이션·businessName 검색 (017).
   * status 미지정 시 PENDING(기존 `GET /admin/sellers/pending` 동작 하위 호환).
   * 유효하지 않은 status 문자열은 400.
   */
  async listSellers(
    status: string | undefined,
    cursor: string | undefined,
    limit: number | undefined,
    q: string | undefined,
  ): Promise<{ items: SellerProfile[]; nextCursor: string | null }> {
    const resolvedStatus = this.resolveSellerStatus(status);
    const take = Math.min(
      Math.max(limit ?? DEFAULT_SELLER_PAGE_LIMIT, 1),
      MAX_SELLER_PAGE_LIMIT,
    );
    return this.sellerService.listSellers({ status: resolvedStatus, cursor, take, q });
  }

  /**
   * 판매자 승인 — seller 도메인의 기존 승인 로직(PENDING→APPROVED) 재사용 후 감사 로그 기록(013).
   * 감사 기록 실패가 승인 자체를 무효화하지 않도록, 승인 성공 후 append 한다.
   */
  async approveSeller(
    adminUserId: string,
    sellerId: string,
  ): Promise<SellerProfile> {
    const result = await this.sellerService.approve(sellerId);
    await this.adminRepository.createAuditLog({
      adminId: adminUserId,
      action: AUDIT_ACTION.SELLER_APPROVE,
      targetType: AUDIT_TARGET.SELLER,
      targetId: sellerId,
    });
    return result;
  }

  // ── 사용자 운영 ──────────────────────────────────────────────────

  /** 사용자 목록 — cursor 페이지네이션. limit 은 1..MAX 범위로 클램프. */
  async listUsers(
    cursor: string | undefined,
    limit: number | undefined,
  ): Promise<{ items: AdminUserListItem[]; nextCursor: string | null }> {
    const take = Math.min(
      Math.max(limit ?? DEFAULT_USER_PAGE_LIMIT, 1),
      MAX_USER_PAGE_LIMIT,
    );
    return this.userService.listUsersForAdmin(cursor, take);
  }

  // ── 감사 로그 (013 GAP-007-01) ────────────────────────────────────

  /** 감사 로그 목록 조회 — 최신순. limit 은 1..MAX 범위로 클램프. */
  async listAuditLogs(limit: number | undefined): Promise<AdminAuditLog[]> {
    const take = Math.min(
      Math.max(limit ?? DEFAULT_AUDIT_LOG_LIMIT, 1),
      MAX_AUDIT_LOG_LIMIT,
    );
    return this.adminRepository.listAuditLogs(take);
  }

  // ── Private helpers ───────────────────────────────────────────────

  /** status 쿼리 파라미터 파싱 — 미지정 시 PENDING(하위 호환), 화이트리스트 외 값은 400. */
  private resolveSellerStatus(status: string | undefined): SellerStatus {
    if (status === undefined) return SellerStatus.PENDING;
    if (!Object.values(SellerStatus).includes(status as SellerStatus)) {
      throw new BadRequestException(`Invalid seller status: ${status}`);
    }
    return status as SellerStatus;
  }
}
