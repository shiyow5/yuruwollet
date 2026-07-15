import { useRef, type KeyboardEvent } from 'react';
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
   * align-items:stretch が効いて **横いっぱいに引き伸ばされて**いた（トグルが画面幅まで伸びる）。
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

/**
 * ほしい物/行きたい場所・支出/収入・通貨・サイクル・自分/相手 などの 2〜3 択トグル。
 *
 * **role は radiogroup/radio（tab ではない、#18）。** 相互排他の値選択は WAI-ARIA APG 上
 * radiogroup が正しく、tab は対応する tabpanel を要求する（ここには無い）。
 * radiogroup パターンに従い、キーボードは **1 タブストップ（roving tabindex）+ 矢印キー移動**にする:
 * 選択中の radio だけ Tab で到達でき、←↑/→↓ で前後の値へ（端でラップ）、Home/End で先頭/末尾へ。
 * radio は移動＝選択なので、矢印移動でそのまま onChange する。
 */
export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  className,
  fullWidth = false,
  ariaLabelledby,
  ariaLabel,
}: Props<T>) {
  const buttonRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const activeIndex = options.findIndex((o) => o.value === value);
  // value がどの選択肢とも一致しない異常時でも、必ず 1 つは Tab で到達できるようにする。
  const tabbableIndex = activeIndex >= 0 ? activeIndex : 0;

  function selectAt(index: number) {
    onChange(options[index].value);
    buttonRefs.current[index]?.focus();
  }

  function handleKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    const last = options.length - 1;
    let next: number;
    switch (event.key) {
      case 'ArrowRight':
      case 'ArrowDown':
        next = index === last ? 0 : index + 1;
        break;
      case 'ArrowLeft':
      case 'ArrowUp':
        next = index === 0 ? last : index - 1;
        break;
      case 'Home':
        next = 0;
        break;
      case 'End':
        next = last;
        break;
      default:
        return;
    }
    // 矢印での画面スクロールや、既定のフォーカス移動を止める。
    event.preventDefault();
    selectAt(next);
  }

  return (
    <div
      className={cn(
        // max-w-full は必須。w-fit は max-content なので、選択肢が多いと
        // 狭い画面で親からはみ出す（ウィッシュリストの 3 択が 360px で溢れる）。
        'flex max-w-full rounded-full bg-surface-container-high p-1',
        fullWidth ? 'w-full' : 'w-fit',
        className,
      )}
      role="radiogroup"
      aria-labelledby={ariaLabelledby}
      aria-label={ariaLabel}
    >
      {options.map((o, i) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            ref={(el) => {
              buttonRefs.current[i] = el;
            }}
            type="button"
            role="radio"
            aria-checked={active}
            // roving tabindex: 選択中の 1 つだけ Tab 到達可、他はグループ内の矢印移動でのみ。
            tabIndex={i === tabbableIndex ? 0 : -1}
            onClick={() => onChange(o.value)}
            onKeyDown={(e) => handleKeyDown(e, i)}
            className={cn(
              'rounded-full px-5 py-2 font-label-sm text-label-sm transition',
              active
                ? 'bg-custom-accent text-on-primary shadow-sm'
                : 'text-custom-text/70 hover:text-custom-text',
            )}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
