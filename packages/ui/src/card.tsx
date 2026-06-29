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
    <div className={cn('rounded-card border border-border bg-surface p-6', className)}>
      {children}
    </div>
  );
}

/** 라벨 + 값 형태의 요약 카드 (대시보드 등). */
export function StatCard({ title, value }: { title: string; value: string }) {
  return (
    <div className="rounded-card border border-border bg-surface p-5">
      <div className="text-xs font-medium uppercase tracking-wide text-subtle-foreground">
        {title}
      </div>
      <div className="mt-2 truncate text-lg font-semibold text-foreground">{value}</div>
    </div>
  );
}
