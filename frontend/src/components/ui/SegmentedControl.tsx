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
  /**
   * 幅いっぱいに広げる（モーダル内のフォーム向け。タップしやすさを優先する箇所）。
   *
   * 既定は自然幅。以前は `inline-flex` だけだったため、`flex flex-col` の親に置くと
   * align-items:stretch が効いて **横いっぱいに引き伸ばされて**いた（タブが画面幅まで伸びる）。
   *
   * 幅は `w-fit` か `w-full` の **排他的な 1 クラス**として出す。className 経由で
   * `w-full` を足す方式にすると、cn は競合を解決しない単純な結合なので
   * 同じプロパティの 2 クラスが同時に出て CSS の出力順に依存してしまう。
   */
  fullWidth?: boolean;
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
  fullWidth = false,
  ariaLabelledby,
  ariaLabel,
}: Props<T>) {
  return (
    <div
      className={cn(
        // max-w-full は必須。w-fit は max-content なので、選択肢が多いと
        // 狭い画面で親からはみ出す（ウィッシュリストの 3 択が 360px で溢れる）。
        'flex max-w-full rounded-full bg-surface-container-high p-1',
        fullWidth ? 'w-full' : 'w-fit',
        className,
      )}
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
