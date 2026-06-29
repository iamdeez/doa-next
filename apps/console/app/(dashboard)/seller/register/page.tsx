'use client';

import type { SellerRegisterRequest } from '@doa/shared-types';
import { ApiError } from '@doa/api-client';
import { Button, Card, ErrorText, Input, PageHeader } from '@doa/ui';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';

const FIELDS: {
  key: keyof SellerRegisterRequest;
  label: string;
  required: boolean;
  placeholder?: string;
}[] = [
  { key: 'businessName', label: '상호 / 브랜드명', required: true },
  { key: 'businessNumber', label: '사업자등록번호', required: true, placeholder: '000-00-00000' },
  { key: 'representativeName', label: '대표자명', required: true },
  { key: 'contactPhone', label: '연락처', required: false, placeholder: '010-0000-0000' },
  { key: 'businessAddress', label: '사업장 주소', required: false },
];

export default function SellerRegisterPage() {
  const router = useRouter();
  const { isSeller, sellerStatus, refresh } = useAuth();
  const [form, setForm] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  if (isSeller) {
    return (
      <Card className="p-8">
        <h1 className="text-xl font-semibold text-foreground">이미 판매자로 등록됨</h1>
        <p className="mt-2 text-sm text-muted-foreground">현재 승인 상태: {sellerStatus}</p>
      </Card>
    );
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const body: SellerRegisterRequest = {
        businessName: form.businessName ?? '',
        businessNumber: form.businessNumber ?? '',
        representativeName: form.representativeName ?? '',
        contactPhone: form.contactPhone || undefined,
        businessAddress: form.businessAddress || undefined,
      };
      await api.seller.register(body);
      await refresh();
      router.replace('/dashboard');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : '판매자 등록에 실패했습니다.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="max-w-lg space-y-6">
      <PageHeader
        title="판매자 등록"
        subtitle="등록 후 관리자 승인(APPROVED)을 받으면 상품을 등록할 수 있습니다."
      />

      <Card>
        <form onSubmit={onSubmit} className="space-y-4">
          {FIELDS.map((f) => (
            <Input
              key={f.key}
              label={f.label}
              required={f.required}
              value={form[f.key] ?? ''}
              placeholder={f.placeholder}
              onChange={(e) => setForm((s) => ({ ...s, [f.key]: e.target.value }))}
            />
          ))}

          {error && <ErrorText>{error}</ErrorText>}

          <Button type="submit" fullWidth disabled={submitting} className="py-2.5">
            {submitting ? '등록 중…' : '판매자 등록 신청'}
          </Button>
        </form>
      </Card>
    </div>
  );
}
