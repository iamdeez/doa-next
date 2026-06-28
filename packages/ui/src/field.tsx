import type { InputHTMLAttributes, SelectHTMLAttributes, TextareaHTMLAttributes } from 'react';
import { cn } from './cn';

const CONTROL =
  'mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm outline-none focus:border-zinc-900';

function Label({ label, required }: { label: string; required?: boolean }) {
  return (
    <>
      {label}
      {required && <span className="ml-0.5 text-red-500">*</span>}
    </>
  );
}

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
}

export function Input({ label, required, className, ...rest }: InputProps) {
  return (
    <label className="block text-sm font-medium text-zinc-700">
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
    <label className="block text-sm font-medium text-zinc-700">
      <Label label={label} required={required} />
      <select required={required} className={cn(CONTROL, 'bg-white', className)} {...rest}>
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
    <label className="block text-sm font-medium text-zinc-700">
      <Label label={label} required={required} />
      <textarea required={required} className={cn(CONTROL, className)} {...rest} />
    </label>
  );
}
