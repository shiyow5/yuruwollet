import { cn } from '../../lib/cn';

interface Option<T extends string> {
  value: T;
  label: string;
}

interface Props<T extends string> {
  options: Option<T>[];
  value: T;
  onChange: (value: T) => void;
  className?: string;
  /** グループのアクセシブルネーム（可視ラベルの id を指す） */
  ariaLabelledby?: string;
  /** グループのアクセシブルネーム（テキスト直接指定） */
  ariaLabel?: string;
}

/** ほしい物/行きたい場所・支出/収入・自分/相手 などの 2〜3 択トグル */
export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  className,
  ariaLabelledby,
  ariaLabel,
}: Props<T>) {
  return (
    <div
      className={cn('inline-flex rounded-full bg-surface-container-high p-1', className)}
      role="tablist"
      aria-labelledby={ariaLabelledby}
      aria-label={ariaLabel}
    >
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(o.value)}
            className={cn(
              'rounded-full px-5 py-2 font-label-sm text-label-sm transition',
              active
                ? 'bg-custom-accent text-on-primary shadow-sm'
                : 'text-custom-text/60 hover:text-custom-text',
            )}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
