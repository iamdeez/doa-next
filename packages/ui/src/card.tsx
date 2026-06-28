import type { ReactNode } from 'react';
import { cn } from './cn';

export function Card({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('rounded-xl border border-zinc-200 bg-white p-6', className)}>
      {children}
    </div>
  );
}

/** 라벨 + 값 형태의 요약 카드 (대시보드 등). */
export function StatCard({ title, value }: { title: string; value: string }) {
  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-5">
      <div className="text-xs font-medium uppercase tracking-wide text-zinc-400">{title}</div>
      <div className="mt-2 truncate text-lg font-semibold text-zinc-900">{value}</div>
    </div>
  );
}
