'use client';

import type { Shipment, ShipmentStatus } from '@doa/shared-types';
import { ApiError } from '@doa/api-client';
import {
  Badge,
  Button,
  Card,
  ErrorText,
  Input,
  Loading,
  PageHeader,
} from '@doa/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useState } from 'react';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import {
  formatKRW,
  ORDER_STATUS_LABEL,
  ORDER_STATUS_TONE,
  SHIPMENT_STATUS_LABEL,
} from '@/lib/order';

/** 송장 등록 + 배송 상태 관리 — 진입 시 기존 송장 복구(GET /shipments?orderId=). */
export default function ShipPage() {
  const { id: orderId } = useParams<{ id: string }>();
  const { isSeller } = useAuth();
  const qc = useQueryClient();
  const [carrier, setCarrier] = useState('');
  const [trackingNumber, setTrackingNumber] = useState('');

  const orderQuery = useQuery({
    queryKey: ['seller', 'order', orderId],
    queryFn: () => api.order.getSellerDetail(orderId),
    enabled: isSeller,
  });

  const shipmentQuery = useQuery({
    queryKey: ['shipment', 'byOrder', orderId],
    queryFn: () => api.shipping.getByOrder(orderId),
    enabled: isSeller,
  });
  const shipment = shipmentQuery.data ?? null;

  const create = useMutation({
    mutationFn: () => api.shipping.create({ orderId, carrier, trackingNumber }),
    onSuccess: (s) => {
      qc.setQueryData(['shipment', 'byOrder', orderId], s);
      void qc.invalidateQueries({ queryKey: ['seller', 'orders'] });
    },
  });

  const updateStatus = useMutation({
    mutationFn: (status: ShipmentStatus) =>
      api.shipping.updateStatus(shipment!.id, { status }),
    onSuccess: (s) => {
      qc.setQueryData(['shipment', 'byOrder', orderId], s);
      void qc.invalidateQueries({ queryKey: ['shipment', s.id, 'tracking'] });
    },
  });

  const tracking = useQuery({
    queryKey: ['shipment', shipment?.id, 'tracking'],
    queryFn: () => api.shipping.tracking(shipment!.id),
    enabled: !!shipment,
  });

  if (!isSeller) return <ErrorText>판매자 전용 화면입니다.</ErrorText>;

  const order = orderQuery.data;

  return (
    <div className="space-y-6">
      <PageHeader
        title="송장 등록 · 배송"
        subtitle={
          <span className="flex items-center gap-2">
            주문 <span className="font-mono text-xs">{orderId.slice(0, 12)}…</span>
            {order && (
              <Badge tone={ORDER_STATUS_TONE[order.status]}>
                {ORDER_STATUS_LABEL[order.status]}
              </Badge>
            )}
            {order && (
              <span className="tabular-nums text-muted-foreground">
                {formatKRW(order.totalAmount)}
              </span>
            )}
          </span>
        }
        actions={
          <Button variant="ghost" size="sm" asChild>
            <Link href="/seller/orders">← 목록</Link>
          </Button>
        }
      />

      {shipmentQuery.isLoading && <Loading label="배송 정보 확인 중…" />}

      {!shipmentQuery.isLoading && !shipment && (
        <Card className="max-w-md space-y-4">
          <div className="text-sm font-medium text-foreground">송장 정보</div>
          <Input
            label="택배사"
            placeholder="예: CJ대한통운"
            value={carrier}
            onChange={(e) => setCarrier(e.target.value)}
            required
          />
          <Input
            label="운송장 번호"
            placeholder="예: 1234567890"
            value={trackingNumber}
            onChange={(e) => setTrackingNumber(e.target.value)}
            required
          />
          <Button
            fullWidth
            onClick={() => create.mutate()}
            disabled={create.isPending || !carrier || !trackingNumber}
          >
            {create.isPending ? '등록 중…' : '송장 등록 (발송 처리)'}
          </Button>
          {create.error && (
            <ErrorText>
              {create.error instanceof ApiError ? create.error.message : '송장 등록 실패'}
            </ErrorText>
          )}
          <p className="text-xs text-subtle-foreground">
            송장을 등록하면 주문이 <b>배송중</b>으로 전이됩니다.
          </p>
        </Card>
      )}

      {shipment && (
        <div className="grid gap-6 lg:grid-cols-2">
          <ShipmentPanel
            shipment={shipment}
            onUpdate={(s) => updateStatus.mutate(s)}
            pending={updateStatus.isPending}
            error={updateStatus.error}
          />
          <TrackingPanel
            loading={tracking.isLoading}
            items={tracking.data ?? []}
          />
        </div>
      )}
    </div>
  );
}

function ShipmentPanel({
  shipment,
  onUpdate,
  pending,
  error,
}: {
  shipment: Shipment;
  onUpdate: (status: ShipmentStatus) => void;
  pending: boolean;
  error: unknown;
}) {
  const delivered = shipment.status === 'delivered';
  return (
    <Card className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="text-sm font-medium text-foreground">배송 상태</div>
        <Badge tone={delivered ? 'success' : 'info'}>
          {SHIPMENT_STATUS_LABEL[shipment.status]}
        </Badge>
      </div>
      <dl className="space-y-1 text-sm">
        <Row label="택배사" value={shipment.carrier} />
        <Row label="운송장" value={shipment.trackingNumber} />
      </dl>
      <div className="flex gap-2">
        <Button
          size="sm"
          variant="secondary"
          onClick={() => onUpdate('in_transit')}
          disabled={pending || delivered}
        >
          배송중 처리
        </Button>
        <Button size="sm" onClick={() => onUpdate('delivered')} disabled={pending || delivered}>
          배송완료 처리
        </Button>
      </div>
      {error != null && (
        <ErrorText>{error instanceof ApiError ? error.message : '상태 변경 실패'}</ErrorText>
      )}
    </Card>
  );
}

function TrackingPanel({
  loading,
  items,
}: {
  loading: boolean;
  items: { id: string; status: ShipmentStatus; description: string; occurredAt: string }[];
}) {
  return (
    <Card className="space-y-3">
      <div className="text-sm font-medium text-foreground">추적 이력</div>
      {loading && <Loading />}
      {!loading && items.length === 0 && (
        <p className="text-sm text-muted-foreground">이력이 없습니다.</p>
      )}
      <ol className="space-y-3">
        {items.map((t) => (
          <li key={t.id} className="flex gap-3 text-sm">
            <span className="mt-1 h-2 w-2 shrink-0 rounded-pill bg-accent" />
            <div>
              <div className="font-medium text-foreground">{SHIPMENT_STATUS_LABEL[t.status]}</div>
              <div className="text-muted-foreground">{t.description}</div>
              <div className="text-xs text-subtle-foreground">
                {new Date(t.occurredAt).toLocaleString('ko-KR')}
              </div>
            </div>
          </li>
        ))}
      </ol>
    </Card>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="font-medium text-foreground">{value}</dd>
    </div>
  );
}
