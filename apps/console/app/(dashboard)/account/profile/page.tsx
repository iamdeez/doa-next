'use client';

import type { UserProfile } from '@doa/shared-types';
import { ApiError } from '@doa/api-client';
import { Button, Card, ErrorText, Input, Loading } from '@doa/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState, type FormEvent } from 'react';
import { api } from '@/lib/api';

export default function ProfilePage() {
  const queryClient = useQueryClient();
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const profile = useQuery({
    queryKey: ['users', 'me'],
    queryFn: () => api.user.me(),
  });

  useEffect(() => {
    if (profile.data) {
      setName(profile.data.name ?? '');
      setPhone(profile.data.phone ?? '');
    }
  }, [profile.data]);

  const save = useMutation({
    mutationFn: () => api.user.updateProfile({ name, phone }),
    onSuccess: (updated: UserProfile) => {
      queryClient.setQueryData(['users', 'me'], updated);
      setSaved(true);
      setError(null);
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : '저장 실패'),
  });

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    setSaved(false);
    save.mutate();
  }

  return (
    <div className="max-w-lg space-y-6">
      <h1 className="text-2xl font-semibold text-zinc-900">프로필</h1>

      {profile.isLoading && <Loading />}

      {profile.data && (
        <Card>
          <form onSubmit={onSubmit} className="space-y-4">
            <div className="text-sm text-zinc-500">{profile.data.email}</div>

            <Input label="이름" value={name} onChange={(e) => setName(e.target.value)} />
            <Input
              label="연락처"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="010-0000-0000"
            />

            {error && <ErrorText>{error}</ErrorText>}
            {saved && <p className="text-sm text-green-600">저장되었습니다.</p>}

            <Button type="submit" disabled={save.isPending}>
              {save.isPending ? '저장 중…' : '저장'}
            </Button>
          </form>
        </Card>
      )}
    </div>
  );
}
