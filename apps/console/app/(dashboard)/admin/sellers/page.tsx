'use client';

import { ApiError } from '@doa/api-client';
import {
  Badge,
  Button,
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
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';

/** GET /admin/sellers/pending + POST /admin/sellers/:id/approve (007). */
export default function AdminSellersPage() {
  const qc = useQueryClient();
  const { data, isLoading, error } = useQuery({
    queryKey: ['admin', 'pendingSellers'],
    queryFn: () => api.admin.pendingSellers(),
  });

  const approve = useMutation({
    mutationFn: (sellerId: string) => api.admin.approveSeller(sellerId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin', 'pendingSellers'] }),
  });

  return (
    <div className="space-y-6">
      <PageHeader title="판매자 승인" subtitle="관리자 전용 · 승인 대기 판매자 관리" />
      {isLoading && <Loading />}
      {error && <ErrorText>{error instanceof ApiError ? error.message : '불러오기 실패'}</ErrorText>}
      {data && data.length === 0 && (
        <EmptyState title="대기 중인 판매자 없음" message="승인 대기 큐가 비어 있습니다." />
      )}
      {data && data.length > 0 && (
        <Table>
          <THead>
            <TR>
              <TH>상호</TH>
              <TH>대표자</TH>
              <TH>사업자번호</TH>
              <TH>연락처</TH>
              <TH className="text-right">조치</TH>
            </TR>
          </THead>
          <TBody>
            {data.map((s) => (
              <TR key={s.id}>
                <TD className="font-medium">{s.businessName}</TD>
                <TD className="text-muted-foreground">{s.representativeName}</TD>
                <TD className="text-muted-foreground">{s.businessNumber}</TD>
                <TD className="text-muted-foreground">{s.contactPhone ?? '—'}</TD>
                <TD className="text-right">
                  <div className="flex items-center justify-end gap-2">
                    <Badge tone="warning">{s.status}</Badge>
                    <Button
                      size="sm"
                      onClick={() => approve.mutate(s.id)}
                      disabled={approve.isPending && approve.variables === s.id}
                    >
                      {approve.isPending && approve.variables === s.id ? '처리 중…' : '승인'}
                    </Button>
                  </div>
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
      )}
      {approve.error && (
        <ErrorText>{approve.error instanceof ApiError ? approve.error.message : '승인 실패'}</ErrorText>
      )}
    </div>
  );
}
