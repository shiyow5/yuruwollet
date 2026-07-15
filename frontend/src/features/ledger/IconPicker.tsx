import { Icon } from '../../components/ui';
import { CATEGORY_ICON_GROUPS } from '../../lib/icons/palette';
import { cn } from '../../lib/cn';

interface Props {
  value: string;
  onChange: (icon: string) => void;
  label?: string;
}

/**
 * カテゴリアイコンをパレットから選ぶ（#9）。
 *
 * 以前は「Material Symbols 名」を自由入力させていたが、フォントをサブセットした今、
 * パレット外の名前は文字列で表示されてしまう。選択式にして常に描画できる名前に限る。
 */
export function IconPicker({ value, onChange, label = 'アイコン' }: Props) {
  return (
    <div className="flex flex-col gap-2">
      <span id="icon-picker-label" className="font-label-sm text-label-sm text-custom-text/60">
        {label}
      </span>
      <div
        role="radiogroup"
        aria-labelledby="icon-picker-label"
        className="flex max-h-56 flex-col gap-3 overflow-y-auto rounded-2xl bg-surface-container-high p-3"
      >
        {CATEGORY_ICON_GROUPS.map((group) => (
          <div key={group.group} className="flex flex-col gap-1.5">
            <span className="font-label-sm text-label-sm text-custom-text/40">{group.group}</span>
            <div className="flex flex-wrap gap-1.5">
              {group.icons.map((name) => {
                const selected = name === value;
                return (
                  <button
                    key={name}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    aria-label={name}
                    onClick={() => onChange(name)}
                    className={cn(
                      'flex h-10 w-10 items-center justify-center rounded-xl transition',
                      selected
                        ? 'bg-custom-accent text-white'
                        : 'text-custom-text/70 hover:bg-custom-accent/10 hover:text-custom-accent',
                    )}
                  >
                    <Icon name={name} size={22} filled={selected} />
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
