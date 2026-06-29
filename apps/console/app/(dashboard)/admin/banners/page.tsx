'use client';

import type { Banner, BannerPosition, CreateBannerRequest } from '@doa/shared-types';
import { ApiError } from '@doa/api-client';
import {
  Badge,
  Button,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  EmptyState,
  ErrorText,
  Input,
  Loading,
  PageHeader,
  Select,
  Table,
  THead,
  TBody,
  TR,
  TH,
  TD,
} from '@doa/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { api } from '@/lib/api';

const POSITIONS: BannerPosition[] = ['MAIN_TOP', 'MAIN_MIDDLE', 'MAIN_BOTTOM', 'SIDEBAR'];

/** GET/POST/PATCH/DELETE /admin/banners — 배너 관리(관리자). */
export default function AdminBannersPage() {
  const qc = useQueryClient();
  const { data, isLoading, error } = useQuery({
    queryKey: ['admin', 'banners'],
    queryFn: () => api.admin.banners(),
  });
  const invalidate = () => qc.invalidateQueries({ queryKey: ['admin', 'banners'] });

  const toggle = useMutation({
    mutationFn: (b: Banner) => api.admin.updateBanner(b.id, { isActive: !b.isActive }),
    onSuccess: invalidate,
  });
  const remove = useMutation({
    mutationFn: (id: string) => api.admin.deleteBanner(id),
    onSuccess: invalidate,
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="배너"
        subtitle="관리자 전용 · 노출 배너 관리"
        actions={<CreateBannerDialog onCreated={invalidate} />}
      />
      {isLoading && <Loading />}
      {error && <ErrorText>{error instanceof ApiError ? error.message : '불러오기 실패'}</ErrorText>}
      {data && data.length === 0 && <EmptyState title="배너 없음" message="‘배너 추가’로 첫 배너를 만들어 보세요." />}
      {data && data.length > 0 && (
        <Table>
          <THead>
            <TR>
              <TH>제목</TH>
              <TH>위치</TH>
              <TH className="text-right">순서</TH>
              <TH>활성</TH>
              <TH className="text-right">조치</TH>
            </TR>
          </THead>
          <TBody>
            {data.map((b) => (
              <TR key={b.id}>
                <TD className="font-medium">{b.title}</TD>
                <TD className="text-muted-foreground">{b.position}</TD>
                <TD className="text-right tabular-nums">{b.sortOrder}</TD>
                <TD>
                  <Badge tone={b.isActive ? 'success' : 'neutral'}>{b.isActive ? '활성' : '비활성'}</Badge>
                </TD>
                <TD className="text-right">
                  <div className="flex items-center justify-end gap-2">
                    <Button size="sm" variant="ghost" onClick={() => toggle.mutate(b)} disabled={toggle.isPending}>
                      {b.isActive ? '비활성화' : '활성화'}
                    </Button>
                    <Button
                      size="sm"
                      variant="danger"
                      onClick={() => remove.mutate(b.id)}
                      disabled={remove.isPending}
                    >
                      삭제
                    </Button>
                  </div>
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
      )}
    </div>
  );
}

function CreateBannerDialog({ onCreated }: { onCreated: () => void }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    title: '',
    imageUrl: '',
    linkUrl: '',
    position: 'MAIN_TOP' as BannerPosition,
    sortOrder: '',
  });

  const create = useMutation({
    mutationFn: () => {
      const body: CreateBannerRequest = {
        title: form.title,
        imageUrl: form.imageUrl,
        position: form.position,
        ...(form.linkUrl ? { linkUrl: form.linkUrl } : {}),
        ...(form.sortOrder ? { sortOrder: Number(form.sortOrder) } : {}),
      };
      return api.admin.createBanner(body);
    },
    onSuccess: () => {
      onCreated();
      setOpen(false);
      setForm({ title: '', imageUrl: '', linkUrl: '', position: 'MAIN_TOP', sortOrder: '' });
    },
  });

  const set = (k: keyof typeof form) => (e: { target: { value: string } }) =>
    setForm((s) => ({ ...s, [k]: e.target.value }));

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">배너 추가</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>배너 추가</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <Input label="제목" value={form.title} onChange={set('title')} required />
          <Input label="이미지 URL" value={form.imageUrl} onChange={set('imageUrl')} required />
          <Input label="링크 URL(선택)" value={form.linkUrl} onChange={set('linkUrl')} />
          <Select label="노출 위치" value={form.position} onChange={set('position')}>
            {POSITIONS.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </Select>
          <Input label="정렬 순서(선택)" type="number" value={form.sortOrder} onChange={set('sortOrder')} />
          {create.error && (
            <ErrorText>{create.error instanceof ApiError ? create.error.message : '생성 실패'}</ErrorText>
          )}
        </div>
        <DialogFooter>
          <Button
            onClick={() => create.mutate()}
            disabled={create.isPending || !form.title || !form.imageUrl}
          >
            {create.isPending ? '추가 중…' : '추가'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
