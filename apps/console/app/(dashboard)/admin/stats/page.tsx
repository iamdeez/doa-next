'use client';

import { ApiError } from '@doa/api-client';
import { ErrorText, Loading, PageHeader, StatCard } from '@doa/ui';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { formatKRW } from '@/lib/order';

/** GET /admin/stats/overview — 플랫폼 요약(관리자). */
export default function AdminStatsPage() {
  const { data, isLoading, error } = useQuery({
    queryKey: ['admin', 'stats'],
    queryFn: () => api.admin.statsOverview(),
  });

  return (
    <div className="space-y-6">
      <PageHeader title="플랫폼 통계" subtitle="관리자 전용 · 전체 플랫폼 요약" />
      {isLoading && <Loading />}
      {error && <ErrorText>{error instanceof ApiError ? error.message : '불러오기 실패'}</ErrorText>}
      {data && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <StatCard title="총 매출(완료)" value={formatKRW(data.totalSales)} />
          <StatCard title="총 주문" value={`${data.totalOrders.toLocaleString('ko-KR')}건`} />
          <StatCard title="완료 주문" value={`${data.completedOrders.toLocaleString('ko-KR')}건`} />
          <StatCard title="총 사용자" value={`${data.totalUsers.toLocaleString('ko-KR')}명`} />
          <StatCard title="총 판매자" value={`${data.totalSellers.toLocaleString('ko-KR')}명`} />
        </div>
      )}
    </div>
  );
}
