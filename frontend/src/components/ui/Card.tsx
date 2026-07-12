import type { HTMLAttributes } from 'react';
import { cn } from '../../lib/cn';

export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn('rounded-3xl border border-black/5 bg-surface-container p-6 md:p-8', className)}
      {...props}
    />
  );
}
