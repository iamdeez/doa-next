'use client';

import type { Address, CreateAddressRequest } from '@doa/shared-types';
import { ApiError } from '@doa/api-client';
import { Badge, Button, Card, EmptyState, ErrorText, Input, Loading, PageHeader } from '@doa/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { api } from '@/lib/api';

const KEY = ['users', 'me', 'addresses'];

export default function AddressesPage() {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState<Address | null>(null);
  const [creating, setCreating] = useState(false);

  const list = useQuery({ queryKey: KEY, queryFn: () => api.user.addresses.list() });
  const invalidate = () => queryClient.invalidateQueries({ queryKey: KEY });

  const remove = useMutation({
    mutationFn: (id: string) => api.user.addresses.remove(id),
    onSuccess: invalidate,
  });
  const setDefault = useMutation({
    mutationFn: (id: string) => api.user.addresses.setDefault(id),
    onSuccess: invalidate,
  });

  return (
    <div className="max-w-2xl space-y-6">
      <PageHeader
        title="배송지"
        actions={
          !creating && !editing ? (
            <Button onClick={() => setCreating(true)}>배송지 추가</Button>
          ) : undefined
        }
      />

      {(creating || editing) && (
        <AddressForm
          initial={editing ?? undefined}
          onCancel={() => {
            setCreating(false);
            setEditing(null);
          }}
          onSaved={() => {
            setCreating(false);
            setEditing(null);
            invalidate();
          }}
        />
      )}

      {list.isLoading && <Loading />}

      {list.data && list.data.length === 0 && !creating && (
        <EmptyState title="등록된 배송지가 없습니다." />
      )}

      <div className="space-y-3">
        {list.data?.map((a) => (
          <Card key={a.id} className="p-4">
            <div className="flex items-start justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-medium text-foreground">{a.recipientName}</span>
                  {a.isDefault && <Badge tone="dark">기본</Badge>}
                </div>
                <div className="mt-1 text-sm text-muted-foreground">{a.phone}</div>
                <div className="mt-1 text-sm text-muted-foreground">
                  ({a.zipCode}) {a.address1} {a.address2 ?? ''}
                </div>
              </div>
              <div className="flex shrink-0 gap-3 text-sm">
                {!a.isDefault && (
                  <button
                    onClick={() => setDefault.mutate(a.id)}
                    className="text-muted-foreground hover:text-foreground"
                  >
                    기본 설정
                  </button>
                )}
                <button onClick={() => setEditing(a)} className="text-muted-foreground hover:text-foreground">
                  수정
                </button>
                <button
                  onClick={() => remove.mutate(a.id)}
                  className="text-danger hover:text-danger"
                >
                  삭제
                </button>
              </div>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}

const FIELDS: { key: keyof CreateAddressRequest; label: string; required: boolean }[] = [
  { key: 'recipientName', label: '수령인', required: true },
  { key: 'phone', label: '연락처', required: true },
  { key: 'zipCode', label: '우편번호', required: true },
  { key: 'address1', label: '주소', required: true },
  { key: 'address2', label: '상세주소', required: false },
];

function AddressForm({
  initial,
  onCancel,
  onSaved,
}: {
  initial?: Address;
  onCancel: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState<Record<string, string>>({
    recipientName: initial?.recipientName ?? '',
    phone: initial?.phone ?? '',
    zipCode: initial?.zipCode ?? '',
    address1: initial?.address1 ?? '',
    address2: initial?.address2 ?? '',
  });
  const [isDefault, setIsDefault] = useState(initial?.isDefault ?? false);
  const [error, setError] = useState<string | null>(null);

  const save = useMutation({
    mutationFn: () => {
      if (initial) {
        return api.user.addresses.update(initial.id, {
          recipientName: form.recipientName,
          phone: form.phone,
          zipCode: form.zipCode,
          address1: form.address1,
          address2: form.address2 || null,
        });
      }
      const body: CreateAddressRequest = {
        recipientName: form.recipientName,
        phone: form.phone,
        zipCode: form.zipCode,
        address1: form.address1,
        address2: form.address2 || undefined,
        isDefault,
      };
      return api.user.addresses.create(body);
    },
    onSuccess: onSaved,
    onError: (err) => setError(err instanceof ApiError ? err.message : '저장 실패'),
  });

  function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    save.mutate();
  }

  return (
    <Card>
      <form onSubmit={submit} className="space-y-4">
        <div className="text-sm font-medium text-foreground">{initial ? '배송지 수정' : '새 배송지'}</div>
        <div className="grid grid-cols-2 gap-3">
          {FIELDS.map((f) => (
            <Input
              key={f.key}
              label={f.label}
              required={f.required}
              value={form[f.key] ?? ''}
              onChange={(e) => setForm((s) => ({ ...s, [f.key]: e.target.value }))}
            />
          ))}
        </div>

        {!initial && (
          <label className="flex items-center gap-2 text-sm text-foreground">
            <input
              type="checkbox"
              checked={isDefault}
              onChange={(e) => setIsDefault(e.target.checked)}
            />
            기본 배송지로 설정
          </label>
        )}

        {error && <ErrorText>{error}</ErrorText>}

        <div className="flex gap-3">
          <Button type="submit" disabled={save.isPending}>
            {save.isPending ? '저장 중…' : '저장'}
          </Button>
          <Button type="button" variant="secondary" onClick={onCancel}>
            취소
          </Button>
        </div>
      </form>
    </Card>
  );
}
