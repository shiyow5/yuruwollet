import type { HTMLAttributes } from 'react';
import { cn } from '../../lib/cn';

export type ChipTone = 'neutral' | 'accent' | 'success' | 'warning';

const tones: Record<ChipTone, string> = {
  neutral: 'bg-black/5 text-custom-text/60',
  accent: 'bg-custom-accent/20 text-custom-accent',
  success: 'bg-emerald-500/15 text-emerald-700',
  warning: 'bg-error/10 text-error',
};

interface ChipProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: ChipTone;
}

/** ステータス表示等に使う小さなラベル */
export function Chip({ tone = 'neutral', className, ...props }: ChipProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-3 py-1 font-label-sm text-label-sm',
        tones[tone],
        className,
      )}
      {...props}
    />
  );
}
