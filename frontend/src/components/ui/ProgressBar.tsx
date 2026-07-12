import { cn } from '../../lib/cn';

interface Props {
  value: number;
  max?: number;
  className?: string;
  barClassName?: string;
}

export function ProgressBar({ value, max = 1, className, barClassName }: Props) {
  const pct = max === 0 ? 0 : Math.max(0, Math.min(100, (value / max) * 100));
  return (
    <div
      className={cn('h-2 w-full overflow-hidden rounded-full bg-black/5', className)}
      role="progressbar"
      aria-valuenow={Math.round(pct)}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div
        className={cn('h-full rounded-full bg-custom-accent transition-[width]', barClassName)}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}
