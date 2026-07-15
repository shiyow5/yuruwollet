import type { InputHTMLAttributes } from 'react';
import { cn } from '../../lib/cn';

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
}

export function Input({ label, className, ...props }: InputProps) {
  return (
    <label className="flex flex-col gap-2">
      {label && <span className="font-label-sm text-label-sm text-custom-text/70">{label}</span>}
      <input
        className={cn(
          'w-full rounded-2xl bg-surface-container-high px-4 py-3 text-body-md text-custom-text outline-none placeholder:text-custom-text/60 focus:ring-2 focus:ring-custom-accent',
          className,
        )}
        {...props}
      />
    </label>
  );
}
