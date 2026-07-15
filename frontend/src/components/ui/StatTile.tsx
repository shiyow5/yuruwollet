import type { ReactNode } from 'react';
import { cn } from '../../lib/cn';

interface Props {
  label: string;
  value: ReactNode;
  className?: string;
}

export function StatTile({ label, value, className }: Props) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center rounded-3xl border border-black/5 bg-surface-container-high p-8 text-center',
        className,
      )}
    >
      <span className="mb-3 font-label-sm text-label-sm uppercase tracking-[0.2em] text-custom-text/70">
        {label}
      </span>
      <span className="text-[28px] font-bold text-custom-text">{value}</span>
    </div>
  );
}
