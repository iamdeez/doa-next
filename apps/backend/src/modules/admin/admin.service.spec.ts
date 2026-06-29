/**
 * AdminService 단위 테스트 — 007-admin [env:unit]
 *
 * 시나리오:
 *   - 승인 대기 판매자 목록: SellerService.listByStatus(PENDING) 위임
 *   - 판매자 승인: SellerService.approve 재사용(중복 구현 없음)
 *   - 사용자 목록: limit 클램프(기본/최대), cursor 위임
 */

import { Test, TestingModule } from '@nestjs/testing';
import { SellerStatus } from '@prisma/client';
import { AdminService } from './admin.service';
import { AdminRepository } from './admin.repository';
import { SellerService } from '../seller/seller.service';
import { UserService } from '../user/user.service';
import {
  AUDIT_ACTION,
  AUDIT_TARGET,
  MAX_AUDIT_LOG_LIMIT,
  MAX_USER_PAGE_LIMIT,
} from './admin.constants';

const mockSellerService = {
  listByStatus: jest.fn(),
  approve: jest.fn(),
};

const mockUserService = {
  listUsersForAdmin: jest.fn(),
};

const mockAdminRepository = {
  createAuditLog: jest.fn(),
  listAuditLogs: jest.fn(),
};

describe('AdminService', () => {
  let service: AdminService;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AdminService,
        { provide: SellerService, useValue: mockSellerService },
        { provide: UserService, useValue: mockUserService },
        { provide: AdminRepository, useValue: mockAdminRepository },
      ],
    }).compile();

    service = module.get<AdminService>(AdminService);
  });

  // ── 판매자 운영 ──────────────────────────────────────────────────

  describe('listPendingSellers', () => {
    it('when_called_then_queries_PENDING_status', async () => {
      const list = [{ id: 's1', status: SellerStatus.PENDING }];
      mockSellerService.listByStatus.mockResolvedValue(list);

      const result = await service.listPendingSellers();

      expect(mockSellerService.listByStatus).toHaveBeenCalledWith(
        SellerStatus.PENDING,
      );
      expect(result).toBe(list);
    });
  });

  describe('approveSeller', () => {
    it('when_called_then_reuses_seller_approve_and_records_audit', async () => {
      const approved = { id: 's1', status: SellerStatus.APPROVED };
      mockSellerService.approve.mockResolvedValue(approved);
      mockAdminRepository.createAuditLog.mockResolvedValue({ id: 'log-1' });

      const result = await service.approveSeller('admin-user-1', 's1');

      expect(mockSellerService.approve).toHaveBeenCalledWith('s1');
      // 013: 승인 후 감사 로그 append
      expect(mockAdminRepository.createAuditLog).toHaveBeenCalledWith({
        adminId: 'admin-user-1',
        action: AUDIT_ACTION.SELLER_APPROVE,
        targetType: AUDIT_TARGET.SELLER,
        targetId: 's1',
      });
      expect(result).toBe(approved);
    });
  });

  describe('listAuditLogs', () => {
    it('when_limit_undefined_then_default_clamped_take', async () => {
      mockAdminRepository.listAuditLogs.mockResolvedValue([]);
      await service.listAuditLogs(undefined);
      expect(mockAdminRepository.listAuditLogs).toHaveBeenCalledWith(50); // DEFAULT
    });

    it('when_limit_exceeds_max_then_clamped_to_max', async () => {
      mockAdminRepository.listAuditLogs.mockResolvedValue([]);
      await service.listAuditLogs(9999);
      expect(mockAdminRepository.listAuditLogs).toHaveBeenCalledWith(
        MAX_AUDIT_LOG_LIMIT,
      );
    });
  });

  // ── 사용자 운영 ──────────────────────────────────────────────────

  describe('listUsers', () => {
    it('when_limit_undefined_then_uses_default_clamped_take', async () => {
      mockUserService.listUsersForAdmin.mockResolvedValue({
        items: [],
        nextCursor: null,
      });

      await service.listUsers(undefined, undefined);

      const take = mockUserService.listUsersForAdmin.mock.calls[0][1];
      expect(take).toBe(20); // DEFAULT_USER_PAGE_LIMIT
    });

    it('when_limit_exceeds_max_then_clamped_to_max', async () => {
      mockUserService.listUsersForAdmin.mockResolvedValue({
        items: [],
        nextCursor: null,
      });

      await service.listUsers('cursor-1', 9999);

      const [cursor, take] = mockUserService.listUsersForAdmin.mock.calls[0];
      expect(cursor).toBe('cursor-1');
      expect(take).toBe(MAX_USER_PAGE_LIMIT);
    });

    it('when_limit_below_one_then_clamped_to_one', async () => {
      mockUserService.listUsersForAdmin.mockResolvedValue({
        items: [],
        nextCursor: null,
      });

      await service.listUsers(undefined, 0);

      const take = mockUserService.listUsersForAdmin.mock.calls[0][1];
      expect(take).toBe(1);
    });
  });
});
