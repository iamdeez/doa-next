'use client';

import { EmptyState, Loading } from '@doa/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';

const WISH_KEY = ['users', 'me', 'wishlist'];

/**
 * 위시리스트·최근 본 상품. 두 엔드포인트 모두 productId 만 반환하고 상품 정보를
 * 조인하지 않는다(cross-schema, FK 없음 — BE-GAP-007). 상품명 표시는 별도 상품 조회가
 * 필요하나 GET /products/:id 는 ACTIVE/OUT_OF_STOCK 만 반환하므로 여기서는 productId 를 노출한다.
 */
export default function WishlistPage() {
  const queryClient = useQueryClient();

  const wishlist = useQuery({ queryKey: WISH_KEY, queryFn: () => api.user.wishlist.list() });
  const recent = useQuery({
    queryKey: ['users', 'me', 'recent-views'],
    queryFn: () => api.user.recentViews(),
  });

  const remove = useMutation({
    mutationFn: (productId: string) => api.user.wishlist.remove(productId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: WISH_KEY }),
  });

  return (
    <div className="max-w-2xl space-y-8">
      <section className="space-y-4">
        <h1 className="text-2xl font-semibold text-foreground">위시리스트</h1>

        {wishlist.isLoading && <Loading />}

        {wishlist.data && wishlist.data.length === 0 && (
          <EmptyState title="위시리스트가 비어 있습니다." />
        )}

        <div className="space-y-2">
          {wishlist.data?.map((w) => (
            <div
              key={w.id}
              className="flex items-center justify-between rounded-card border border-border bg-surface px-4 py-3"
            >
              <span className="truncate font-mono text-sm text-foreground">{w.productId}</span>
              <button
                onClick={() => remove.mutate(w.productId)}
                disabled={remove.isPending}
                className="shrink-0 text-sm text-danger hover:text-danger disabled:opacity-50"
              >
                제거
              </button>
            </div>
          ))}
        </div>
      </section>

      <section className="space-y-4">
        <h2 className="text-lg font-semibold text-foreground">최근 본 상품</h2>
        {recent.isLoading && <Loading />}
        {recent.data && recent.data.length === 0 && (
          <p className="text-sm text-subtle-foreground">기록이 없습니다.</p>
        )}
        <div className="space-y-2">
          {recent.data?.map((r) => (
            <div
              key={r.id}
              className="rounded-card border border-border-subtle bg-surface px-4 py-2.5 font-mono text-sm text-muted-foreground"
            >
              {r.productId}
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
