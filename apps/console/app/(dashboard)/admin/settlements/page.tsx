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
import { formatKRW } from '@/lib/order';

/** GET /admin/settlements — 전체 정산 내역(관리자). */
export default function AdminSettlementsPage() {
  const { data, isLoading, error } = useQuery({
    queryKey: ['admin', 'settlements'],
    queryFn: () => api.admin.settlements(),
  });

  return (
    <div className="space-y-6">
      <PageHeader title="전체 정산" subtitle="관리자 전용 · 모든 판매자 정산 내역" />
      {isLoading && <Loading />}
      {error && <ErrorText>{error instanceof ApiError ? error.message : '불러오기 실패'}</ErrorText>}
      {data && data.length === 0 && <EmptyState title="정산 내역 없음" />}
      {data && data.length > 0 && (
        <Table>
          <THead>
            <TR>
              <TH>판매자</TH>
              <TH className="text-right">총 매출</TH>
              <TH className="text-right">수수료</TH>
              <TH className="text-right">지급액</TH>
              <TH>상태</TH>
            </TR>
          </THead>
          <TBody>
            {data.map((s) => (
              <TR key={s.id}>
                <TD className="font-mono text-xs text-muted-foreground">{s.sellerId.slice(0, 12)}…</TD>
                <TD className="text-right tabular-nums">{formatKRW(s.totalSales)}</TD>
                <TD className="text-right tabular-nums text-muted-foreground">−{formatKRW(s.commission)}</TD>
                <TD className="text-right font-semibold tabular-nums">{formatKRW(s.payoutAmount)}</TD>
                <TD>
                  <Badge tone={s.status === 'completed' ? 'success' : 'warning'}>
                    {s.status === 'completed' ? '지급완료' : '정산대기'}
                  </Badge>
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
      )}
    </div>
  );
}
