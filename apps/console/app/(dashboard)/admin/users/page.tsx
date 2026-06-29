'use client';

import { ApiError } from '@doa/api-client';
import {
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
import { useInfiniteQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';

/** GET /admin/users — 사용자 목록(cursor 페이지네이션). */
export default function AdminUsersPage() {
  const { data, isLoading, error, fetchNextPage, hasNextPage, isFetchingNextPage } =
    useInfiniteQuery({
      queryKey: ['admin', 'users'],
      queryFn: ({ pageParam }) => api.admin.users(pageParam),
      initialPageParam: undefined as string | undefined,
      getNextPageParam: (last) => last.nextCursor ?? undefined,
    });

  const items = data?.pages.flatMap((p) => p.items) ?? [];

  return (
    <div className="space-y-6">
      <PageHeader title="사용자" subtitle="관리자 전용 · 전체 사용자 목록" />
      {isLoading && <Loading />}
      {error && <ErrorText>{error instanceof ApiError ? error.message : '불러오기 실패'}</ErrorText>}
      {!isLoading && items.length === 0 && <EmptyState title="사용자 없음" />}
      {items.length > 0 && (
        <>
          <Table>
            <THead>
              <TR>
                <TH>이메일</TH>
                <TH>이름</TH>
                <TH>연락처</TH>
                <TH>가입일</TH>
              </TR>
            </THead>
            <TBody>
              {items.map((u) => (
                <TR key={u.id}>
                  <TD className="font-medium">{u.email}</TD>
                  <TD className="text-muted-foreground">{u.name ?? '—'}</TD>
                  <TD className="text-muted-foreground">{u.phone ?? '—'}</TD>
                  <TD className="text-muted-foreground">
                    {new Date(u.createdAt).toLocaleDateString('ko-KR')}
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
          {hasNextPage && (
            <Button variant="secondary" onClick={() => void fetchNextPage()} disabled={isFetchingNextPage}>
              {isFetchingNextPage ? '불러오는 중…' : '더 보기'}
            </Button>
          )}
        </>
      )}
    </div>
  );
}
