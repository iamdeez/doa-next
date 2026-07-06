/**
 * AdminService 단위 테스트 — 007-admin [env:unit]
 * (§F 마이그레이션 017: listPendingSellers → listSellers 재작성 — tasks.md T015)
 *
 * 시나리오:
 *   - 판매자 목록: SellerService.listSellers({status,cursor,take,q}) 위임 (017, FR-001~003)
 *   - 판매자 승인: SellerService.approve 재사용(중복 구현 없음)
 *   - 사용자 목록: limit 클램프(기본/최대), cursor 위임
 */

import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { SellerStatus } from '@prisma/client';
import { AdminService } from './admin.service';
import { AdminRepository } from './admin.repository';
import { SellerService } from '../seller/seller.service';
import { UserService } from '../user/user.service';
import {
  AUDIT_ACTION,
  AUDIT_TARGET,
  DEFAULT_SELLER_PAGE_LIMIT,
  MAX_AUDIT_LOG_LIMIT,
  MAX_SELLER_PAGE_LIMIT,
  MAX_USER_PAGE_LIMIT,
} from './admin.constants';

const mockSellerService = {
  listSellers: jest.fn(),
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

  // ─────────────────────────────────────────────
  // SC-001~005 (v1.1.0/017 spec): AdminService.listSellers — 관리자 판매자 목록 확장
  // §F 마이그레이션 — listPendingSellers() 는 listSellers(...) 로 대체됨(dead code 제거, research.md 설계 노트)
  // ─────────────────────────────────────────────
  describe('listSellers', () => {
    it('when_status_PENDING_then_delegates_with_PENDING(SC-001)', async () => {
      /**
       * SC-001 (FR-001 관련, v1.1.0/017 spec):
       * status=PENDING 지정 조회 시 PENDING 상태 판매자만 반환.
       * production: listSellers(status,cursor,limit,q) → sellerService.listSellers({status,cursor,take,q}) 위임.
       */
      const envelope = {
        items: [{ id: 's1', status: SellerStatus.PENDING }],
        nextCursor: null,
      };
      mockSellerService.listSellers.mockResolvedValue(envelope);

      const result = await service.listSellers('PENDING', undefined, undefined, undefined);

      expect(mockSellerService.listSellers).toHaveBeenCalledWith(
        expect.objectContaining({ status: SellerStatus.PENDING }),
      );
      expect(result).toBe(envelope);
    });

    it('when_status_APPROVED_then_delegates_with_APPROVED(SC-002)', async () => {
      /**
       * SC-002 (FR-001 관련, v1.1.0/017 spec):
       * status=APPROVED 지정 조회 시 APPROVED 상태 판매자만 반환.
       */
      const envelope = {
        items: [{ id: 's2', status: SellerStatus.APPROVED }],
        nextCursor: null,
      };
      mockSellerService.listSellers.mockResolvedValue(envelope);

      const result = await service.listSellers('APPROVED', undefined, undefined, undefined);

      expect(mockSellerService.listSellers).toHaveBeenCalledWith(
        expect.objectContaining({ status: SellerStatus.APPROVED }),
      );
      expect(result).toBe(envelope);
    });

    it('when_status_undefined_then_defaults_to_PENDING_backward_compat(SC-003)', async () => {
      /**
       * SC-003 (FR-001 관련, v1.1.0/017 spec) Edge:
       * status 미지정 시 기존 동작과 동일하게 PENDING 만 조회(하위 호환 회귀 없음).
       */
      mockSellerService.listSellers.mockResolvedValue({ items: [], nextCursor: null });

      await service.listSellers(undefined, undefined, undefined, undefined);

      expect(mockSellerService.listSellers).toHaveBeenCalledWith(
        expect.objectContaining({ status: SellerStatus.PENDING }),
      );
    });

    it('when_status_invalid_then_bad_request(SC-003 Error)', async () => {
      /**
       * SC-003 관련 (FR-001, v1.1.0/017 spec) Error:
       * SellerStatus 화이트리스트 외 문자열 → BadRequestException(400).
       */
      await expect(
        service.listSellers('NOT_A_STATUS', undefined, undefined, undefined),
      ).rejects.toThrow(BadRequestException);

      expect(mockSellerService.listSellers).not.toHaveBeenCalled();
    });

    it('when_limit_undefined_then_default_clamped_take(SC-004)', async () => {
      /**
       * SC-004 (FR-002 관련, v1.1.0/017 spec) Edge:
       * limit 미지정 시 DEFAULT_SELLER_PAGE_LIMIT(20)으로 클램프.
       */
      mockSellerService.listSellers.mockResolvedValue({ items: [], nextCursor: null });

      await service.listSellers(undefined, undefined, undefined, undefined);

      expect(mockSellerService.listSellers).toHaveBeenCalledWith(
        expect.objectContaining({ take: DEFAULT_SELLER_PAGE_LIMIT }),
      );
    });

    it('when_limit_exceeds_max_then_clamped_to_max(SC-004)', async () => {
      /**
       * SC-004 (FR-002 관련, v1.1.0/017 spec) Edge:
       * limit 이 MAX_SELLER_PAGE_LIMIT(100) 초과 시 최대값으로 클램프.
       */
      mockSellerService.listSellers.mockResolvedValue({ items: [], nextCursor: null });

      await service.listSellers(undefined, undefined, 9999, undefined);

      expect(mockSellerService.listSellers).toHaveBeenCalledWith(
        expect.objectContaining({ take: MAX_SELLER_PAGE_LIMIT }),
      );
    });

    it('when_limit_below_one_then_clamped_to_one(SC-004)', async () => {
      /**
       * SC-004 (FR-002 관련, v1.1.0/017 spec) Edge:
       * limit 이 1 미만이면 1로 클램프.
       */
      mockSellerService.listSellers.mockResolvedValue({ items: [], nextCursor: null });

      await service.listSellers(undefined, undefined, 0, undefined);

      expect(mockSellerService.listSellers).toHaveBeenCalledWith(
        expect.objectContaining({ take: 1 }),
      );
    });

    it('when_last_page_then_nextCursor_null_and_full_page_then_nextCursor_set(SC-004)', async () => {
      /**
       * SC-004 (FR-002 관련, v1.1.0/017 spec):
       * 다음 페이지 존재 시(items.length===take) nextCursor 는 null 이 아니고,
       * 마지막 페이지(items.length<take)에서는 nextCursor 가 null.
       * (SellerService.listSellers 가 이미 nextCursor 를 계산하여 반환 — AdminService 는 그대로 전달)
       */
      const fullPage = { items: [{ id: 's1' }, { id: 's2' }], nextCursor: 's2' };
      mockSellerService.listSellers.mockResolvedValueOnce(fullPage);
      const lastResult = await service.listSellers(undefined, undefined, 2, undefined);
      expect(lastResult.nextCursor).toBe('s2');

      const lastPage = { items: [{ id: 's3' }], nextCursor: null };
      mockSellerService.listSellers.mockResolvedValueOnce(lastPage);
      const finalResult = await service.listSellers(undefined, 's2', 2, undefined);
      expect(finalResult.nextCursor).toBeNull();
    });

    it('when_q_provided_then_delegates_with_q(SC-005)', async () => {
      /**
       * SC-005 (FR-003 관련, v1.1.0/017 spec):
       * businessName 부분 일치 검색 문자열(q)이 SellerService.listSellers 로 그대로 전달.
       */
      const envelope = { items: [{ id: 's1', businessName: '마켓 A' }], nextCursor: null };
      mockSellerService.listSellers.mockResolvedValue(envelope);

      const result = await service.listSellers(undefined, undefined, undefined, '마켓');

      expect(mockSellerService.listSellers).toHaveBeenCalledWith(
        expect.objectContaining({ q: '마켓' }),
      );
      expect(result).toBe(envelope);
    });

    it('when_response_returned_then_envelope_shape(SC-011)', async () => {
      /**
       * SC-011 (FR-007 관련, v1.1.0/017 spec):
       * 관리자 판매자 목록 응답이 {items, nextCursor} envelope 형태임을 확인.
       */
      const envelope = { items: [{ id: 's1' }], nextCursor: null };
      mockSellerService.listSellers.mockResolvedValue(envelope);

      const result = await service.listSellers(undefined, undefined, undefined, undefined);

      expect(result).toHaveProperty('items');
      expect(result).toHaveProperty('nextCursor');
      expect(Array.isArray(result.items)).toBe(true);
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
