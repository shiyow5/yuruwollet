import { cn } from '../../lib/cn';

interface Props {
  value: number;
  max?: number;
  className?: string;
  barClassName?: string;
  /** 同じ画面に複数本並ぶときの読み上げ名（例: 「今月の支出」） */
  label?: string;
}

export function ProgressBar({ value, max = 1, className, barClassName, label }: Props) {
  const pct = max === 0 ? 0 : Math.max(0, Math.min(100, (value / max) * 100));
  return (
    <div
      className={cn('h-2 w-full overflow-hidden rounded-full bg-black/5', className)}
      role="progressbar"
      aria-label={label}
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
