'use client';

import type { Product } from '@doa/shared-types';
import { ApiError } from '@doa/api-client';
import { Badge, Button, EmptyState, ErrorText, Loading, PageHeader } from '@doa/ui';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';

const STATUS_TONE: Record<Product['status'], 'success' | 'neutral' | 'warning'> = {
  ACTIVE: 'success',
  DRAFT: 'neutral',
  OUT_OF_STOCK: 'warning',
  INACTIVE: 'neutral',
};

/** GET /sellers/me/products — 실제 백엔드 통합 데모 화면. */
export default function SellerProductsPage() {
  const { isSeller, sellerStatus } = useAuth();

  const { data, isLoading, error } = useQuery({
    queryKey: ['seller', 'products'],
    queryFn: () => api.seller.myProducts(),
    enabled: isSeller,
  });

  if (!isSeller) {
    return (
      <EmptyState
        title="판매자 미등록"
        message="판매자로 등록되어 있지 않습니다. 판매자 등록 후 상품을 관리할 수 있습니다."
      />
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="내 상품"
        subtitle={`승인 상태: ${sellerStatus}`}
        actions={
          <Link href="/seller/products/new">
            <Button>상품 등록</Button>
          </Link>
        }
      />

      {isLoading && <Loading />}

      {error && (
        <ErrorText>
          {error instanceof ApiError ? error.message : '상품을 불러오지 못했습니다.'}
        </ErrorText>
      )}

      {data && data.length === 0 && (
        <EmptyState title="등록된 상품 없음" message="아직 등록한 상품이 없습니다." />
      )}

      {data && data.length > 0 && (
        <div className="overflow-hidden rounded-card border border-border bg-surface">
          <table className="w-full text-sm">
            <thead className="border-b border-border bg-muted text-left text-xs uppercase tracking-wide text-subtle-foreground">
              <tr>
                <th className="px-4 py-3 font-medium">상품명</th>
                <th className="px-4 py-3 font-medium">기본가</th>
                <th className="px-4 py-3 font-medium">상태</th>
                <th className="px-4 py-3 font-medium"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {data.map((p) => (
                <tr key={p.id} className="hover:bg-muted">
                  <td className="px-4 py-3 font-medium text-foreground">
                    <Link href={`/seller/products/${p.id}`} className="hover:underline">
                      {p.title}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{p.price}</td>
                  <td className="px-4 py-3">
                    <Badge tone={STATUS_TONE[p.status]}>{p.status}</Badge>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Link
                      href={`/seller/products/${p.id}`}
                      className="text-sm text-muted-foreground hover:text-foreground"
                    >
                      관리 →
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
