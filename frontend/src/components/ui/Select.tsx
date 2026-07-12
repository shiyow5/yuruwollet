import type { SelectHTMLAttributes, ReactNode } from 'react';
import { cn } from '../../lib/cn';

interface Props extends SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  children: ReactNode;
}

/** Input と揃えた見た目のセレクト。カテゴリ選択などに使う。 */
export function Select({ label, className, children, ...props }: Props) {
  return (
    <label className="flex flex-col gap-2">
      {label && <span className="font-label-sm text-label-sm text-custom-text/60">{label}</span>}
      <select
        className={cn(
          'w-full rounded-2xl bg-surface-container-high px-4 py-3 text-body-md text-custom-text outline-none focus:ring-2 focus:ring-custom-accent',
          className,
        )}
        {...props}
      >
        {children}
      </select>
    </label>
  );
}
