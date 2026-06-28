import type { ReactNode } from 'react';
import { cn } from './cn';

type Tone = 'neutral' | 'success' | 'warning' | 'danger' | 'dark';

const TONE: Record<Tone, string> = {
  neutral: 'bg-zinc-100 text-zinc-600',
  success: 'bg-green-100 text-green-700',
  warning: 'bg-amber-100 text-amber-700',
  danger: 'bg-red-100 text-red-700',
  dark: 'bg-zinc-900 text-white',
};

export function Badge({ tone = 'neutral', children }: { tone?: Tone; children: ReactNode }) {
  return (
    <span className={cn('rounded-full px-2 py-0.5 text-xs', TONE[tone])}>{children}</span>
  );
}

export function EmptyState({ title, message }: { title: string; message?: string }) {
  return (
    <div className="rounded-xl border border-dashed border-zinc-300 bg-white p-10 text-center">
      <div className="text-sm font-medium text-zinc-700">{title}</div>
      {message && <div className="mt-1 text-sm text-zinc-400">{message}</div>}
    </div>
  );
}

export function Loading({ label = '불러오는 중…' }: { label?: string }) {
  return <p className="text-sm text-zinc-500">{label}</p>;
}

export function ErrorText({ children }: { children: ReactNode }) {
  return <p className="text-sm text-red-600">{children}</p>;
}
