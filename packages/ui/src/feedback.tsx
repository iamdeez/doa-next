import type { ReactNode } from 'react';
import { cn } from './cn';

type Tone = 'neutral' | 'success' | 'warning' | 'danger' | 'info' | 'dark';

const TONE: Record<Tone, string> = {
  neutral: 'bg-muted text-muted-foreground',
  success: 'bg-success-soft text-success-foreground',
  warning: 'bg-warning-soft text-warning-foreground',
  danger: 'bg-danger-soft text-danger-foreground',
  info: 'bg-info-soft text-info-foreground',
  dark: 'bg-inverse text-inverse-foreground',
};

export function Badge({ tone = 'neutral', children }: { tone?: Tone; children: ReactNode }) {
  return (
    <span className={cn('rounded-pill px-2 py-0.5 text-xs font-medium', TONE[tone])}>
      {children}
    </span>
  );
}

export function EmptyState({ title, message }: { title: string; message?: string }) {
  return (
    <div className="rounded-card border border-dashed border-border-strong bg-surface p-10 text-center">
      <div className="text-sm font-medium text-foreground">{title}</div>
      {message && <div className="mt-1 text-sm text-muted-foreground">{message}</div>}
    </div>
  );
}

export function Loading({ label = '불러오는 중…' }: { label?: string }) {
  return <p className="text-sm text-muted-foreground">{label}</p>;
}

export function ErrorText({ children }: { children: ReactNode }) {
  return <p className="text-sm text-danger">{children}</p>;
}
