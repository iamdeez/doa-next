'use client';

import type { Notification, NotificationType } from '@doa/shared-types';
import { ApiError } from '@doa/api-client';
import { Badge, Button, Card, EmptyState, ErrorText, Loading, PageHeader } from '@doa/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';

const TYPE_LABEL: Record<NotificationType, string> = {
  ORDER_PLACED: '주문',
  ORDER_SHIPPED: '배송',
  SETTLEMENT_CREATED: '정산',
  REVIEW_RECEIVED: '리뷰',
};

/** GET /notifications — 인앱 알림(009). */
export default function NotificationsPage() {
  const qc = useQueryClient();
  const { data, isLoading, error } = useQuery({
    queryKey: ['notifications'],
    queryFn: () => api.notification.list(),
  });
  const invalidate = () => qc.invalidateQueries({ queryKey: ['notifications'] });

  const markRead = useMutation({
    mutationFn: (id: string) => api.notification.markRead(id),
    onSuccess: invalidate,
  });
  const markAll = useMutation({
    mutationFn: () => api.notification.markAllRead(),
    onSuccess: invalidate,
  });

  const unread = data?.items.filter((n) => !n.isRead).length ?? 0;

  return (
    <div className="space-y-6">
      <PageHeader
        title="알림"
        subtitle={unread > 0 ? `읽지 않은 알림 ${unread}건` : '모든 알림을 확인했습니다.'}
        actions={
          unread > 0 ? (
            <Button size="sm" variant="secondary" onClick={() => markAll.mutate()} disabled={markAll.isPending}>
              전체 읽음
            </Button>
          ) : undefined
        }
      />
      {isLoading && <Loading />}
      {error && <ErrorText>{error instanceof ApiError ? error.message : '불러오기 실패'}</ErrorText>}
      {data && data.items.length === 0 && <EmptyState title="알림 없음" message="새 알림이 오면 여기에 표시됩니다." />}
      <div className="space-y-2">
        {data?.items.map((n) => (
          <NotificationRow key={n.id} n={n} onRead={() => markRead.mutate(n.id)} />
        ))}
      </div>
    </div>
  );
}

function NotificationRow({ n, onRead }: { n: Notification; onRead: () => void }) {
  return (
    <Card className={n.isRead ? 'opacity-70' : ''}>
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <Badge tone={n.isRead ? 'neutral' : 'info'}>{TYPE_LABEL[n.type] ?? n.type}</Badge>
            <span className="font-medium text-foreground">{n.title}</span>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">{n.body}</p>
          <p className="mt-1 text-xs text-subtle-foreground">
            {new Date(n.createdAt).toLocaleString('ko-KR')}
          </p>
        </div>
        {!n.isRead && (
          <Button size="sm" variant="ghost" onClick={onRead}>
            읽음
          </Button>
        )}
      </div>
    </Card>
  );
}
