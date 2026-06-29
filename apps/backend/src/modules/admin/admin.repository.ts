import { Injectable } from '@nestjs/common';
import { AdminAuditLog } from '@prisma/client';
import { PrismaService } from '../../shared/prisma/prisma.service';

/**
 * admin 모듈 Repository — admin 스키마의 자기 소유 테이블(admin_audit_logs)만 접근(P-001).
 * 판매자 승인·사용자 조회 등 타 도메인 데이터는 Seller/User Service DI 경유로 수행한다.
 * audit log 는 append-only — 생성·조회만 제공(UPDATE/DELETE 없음).
 */
@Injectable()
export class AdminRepository {
  constructor(private readonly prisma: PrismaService) {}

  /** 감사 로그 1건 기록 (append-only). */
  async createAuditLog(data: {
    adminId: string;
    action: string;
    targetType: string;
    targetId: string;
  }): Promise<AdminAuditLog> {
    return this.prisma.tx.adminAuditLog.create({ data });
  }

  /** 감사 로그 목록 — 최신순, take 개 (호출 측에서 클램프). */
  async listAuditLogs(take: number): Promise<AdminAuditLog[]> {
    return this.prisma.tx.adminAuditLog.findMany({
      orderBy: { createdAt: 'desc' },
      take,
    });
  }
}
