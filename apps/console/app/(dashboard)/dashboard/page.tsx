'use client';

import { Button, Card, PageHeader, StatCard } from '@doa/ui';
import Link from 'next/link';
import { useAuth } from '@/lib/auth';

export default function DashboardPage() {
  const { profile, isSeller, sellerStatus } = useAuth();

  return (
    <div className="space-y-6">
      <PageHeader title="대시보드" subtitle={`${profile?.email ?? ''} 님, 환영합니다.`} />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard title="계정" value={profile?.email ?? '-'} />
        <StatCard title="판매자 상태" value={isSeller ? (sellerStatus ?? '-') : '미등록'} />
        <StatCard title="역할" value={isSeller ? '판매자' : '일반'} />
      </div>

      {!isSeller && (
        <Card className="flex items-center justify-between p-5">
          <div>
            <div className="text-sm font-medium text-zinc-900">판매자로 등록하기</div>
            <div className="mt-0.5 text-sm text-zinc-400">
              판매자 등록 후 관리자 승인을 받으면 상품을 판매할 수 있습니다.
            </div>
          </div>
          <Link href="/seller/register">
            <Button>판매자 등록</Button>
          </Link>
        </Card>
      )}

      <p className="text-sm text-zinc-400">
        ※ 이 콘솔은 스캐폴딩 단계입니다. 상품·주문·정산 화면은 백엔드 도메인 구현에 맞춰 단계적으로 추가됩니다.
      </p>
    </div>
  );
}
