'use client';

import { ApiError } from '@doa/api-client';
import {
  Badge,
  EmptyState,
  ErrorText,
  Loading,
  PageHeader,
  Table,
  THead,
  TBody,
  TR,
  TH,
  TD,
} from '@doa/ui';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';

/** GET /admin/audit-logs — 관리자 조치 감사 로그(013). */
export default function AdminAuditLogsPage() {
  const { data, isLoading, error } = useQuery({
    queryKey: ['admin', 'auditLogs'],
    queryFn: () => api.admin.auditLogs(),
  });

  return (
    <div className="space-y-6">
      <PageHeader title="감사 로그" subtitle="관리자 전용 · 조치 이력(append-only)" />
      {isLoading && <Loading />}
      {error && <ErrorText>{error instanceof ApiError ? error.message : '불러오기 실패'}</ErrorText>}
      {data && data.length === 0 && <EmptyState title="기록 없음" message="아직 관리자 조치 기록이 없어요." />}
      {data && data.length > 0 && (
        <Table>
          <THead>
            <TR>
              <TH>일시</TH>
              <TH>관리자</TH>
              <TH>조치</TH>
              <TH>대상</TH>
            </TR>
          </THead>
          <TBody>
            {data.map((log) => (
              <TR key={log.id}>
                <TD className="text-muted-foreground">{new Date(log.createdAt).toLocaleString('ko-KR')}</TD>
                <TD className="font-mono text-xs text-muted-foreground">{log.adminId.slice(0, 12)}…</TD>
                <TD>
                  <Badge tone="info">{log.action}</Badge>
                </TD>
                <TD className="text-muted-foreground">
                  {log.targetType} · <span className="font-mono text-xs">{log.targetId.slice(0, 12)}…</span>
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
      )}
    </div>
  );
}
