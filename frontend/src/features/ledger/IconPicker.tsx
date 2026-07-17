import { useState } from 'react';
import { Icon, Modal } from '../../components/ui';
import { CATEGORY_ICON_GROUPS } from '../../lib/icons/palette';
import { cn } from '../../lib/cn';

interface Props {
  value: string;
  onChange: (icon: string) => void;
  label?: string;
}

const SHEET_LABEL = 'アイコンを選ぶ';

/**
 * カテゴリアイコンをパレットから選ぶ（#9）。
 *
 * 以前は「Material Symbols 名」を自由入力させていたが、フォントをサブセットした今、
 * パレット外の名前は文字列で表示されてしまう。選択式にして常に描画できる名前に限る。
 *
 * **グリッドをフォームに埋め込まない**（#9 の実機フィードバック）: 76 個を 248px の箱に
 * 収めると入れ子スクロールになり、スマホで扱いにくいうえフォームが 1331px まで伸びていた。
 * 今のアイコンだけ出し、選ぶときだけシートを開く。
 *
 * ネイティブ `<select>` にしない理由: Icon はサブセットフォントの**コードポイント**を描く
 * （`iconGlyph`）。iOS は `<option>` を OS 側が描画してカスタムフォントが効かないため、
 * 絵ではなく豆腐（□）や文字化けが並ぶ。`<select>` では選べない。
 */
export function IconPicker({ value, onChange, label = 'アイコン' }: Props) {
  const [open, setOpen] = useState(false);

  return (
    <div className="flex flex-col gap-2">
      <span className="font-label-sm text-label-sm text-custom-text/70">{label}</span>

      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        className="flex w-fit items-center gap-3 rounded-2xl bg-surface-container-high px-3 py-2 transition hover:bg-custom-accent/10"
      >
        <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-custom-accent/10 text-custom-accent">
          <Icon name={value} size={24} filled />
        </span>
        <span className="font-label-sm text-label-sm text-custom-text/70">{SHEET_LABEL}</span>
      </button>

      {/* シートの中でスクロールする。フォーム側は伸びない。 */}
      <Modal open={open} onClose={() => setOpen(false)} label={SHEET_LABEL} className="max-w-md">
        <div className="flex items-center justify-between gap-4">
          <h2 className="font-title-md text-title-md text-custom-text">{SHEET_LABEL}</h2>
          {/* close アイコンはサブセットに無い（足すとフォントを作り直す必要がある）。
              他のモーダルと同じくテキストのボタンで閉じる。 */}
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="rounded-full px-3 py-2 font-label-sm text-label-sm text-custom-accent transition hover:bg-custom-accent/10"
          >
            閉じる
          </button>
        </div>

        <div
          role="radiogroup"
          aria-label={SHEET_LABEL}
          className="mt-4 flex max-h-[60vh] flex-col gap-4 overflow-y-auto"
        >
          {CATEGORY_ICON_GROUPS.map((group) => (
            <div key={group.group} className="flex flex-col gap-2">
              <span className="font-label-sm text-label-sm text-custom-text/70">{group.group}</span>
              <div className="grid grid-cols-6 gap-1.5">
                {group.icons.map((name) => {
                  const selected = name === value;
                  return (
                    <button
                      key={name}
                      type="button"
                      role="radio"
                      aria-checked={selected}
                      aria-label={name}
                      onClick={() => {
                        onChange(name);
                        // 選んだら用は済むので閉じる（確定ボタンを増やさない）
                        setOpen(false);
                      }}
                      className={cn(
                        'flex h-11 w-11 items-center justify-center rounded-xl transition',
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
      </Modal>
    </div>
  );
}
