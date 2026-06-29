import type { InputHTMLAttributes, SelectHTMLAttributes, TextareaHTMLAttributes } from 'react';
import { cn } from './cn';

const CONTROL =
  'mt-1 w-full rounded-control border border-border bg-surface px-3 py-2 text-sm text-foreground ' +
  'outline-none transition-colors placeholder:text-subtle-foreground ' +
  'focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30';

function Label({ label, required }: { label: string; required?: boolean }) {
  return (
    <>
      {label}
      {required && <span className="ml-0.5 text-danger">*</span>}
    </>
  );
}

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
}

export function Input({ label, required, className, ...rest }: InputProps) {
  return (
    <label className="block text-sm font-medium text-foreground">
      <Label label={label} required={required} />
      <input required={required} className={cn(CONTROL, className)} {...rest} />
    </label>
  );
}

export interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label: string;
}

export function Select({ label, required, className, children, ...rest }: SelectProps) {
  return (
    <label className="block text-sm font-medium text-foreground">
      <Label label={label} required={required} />
      <select required={required} className={cn(CONTROL, className)} {...rest}>
        {children}
      </select>
    </label>
  );
}

export interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label: string;
}

export function Textarea({ label, required, className, ...rest }: TextareaProps) {
  return (
    <label className="block text-sm font-medium text-foreground">
      <Label label={label} required={required} />
      <textarea required={required} className={cn(CONTROL, className)} {...rest} />
    </label>
  );
}
