import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { Icon, Modal } from '../../components/ui';
import {
  CATEGORY_ICON_GROUPS,
  DEFAULT_CATEGORY_ICON,
  isCategoryIcon,
  type CategoryIconGroup,
} from '../../lib/icons/palette';
import { cn } from '../../lib/cn';

interface Props {
  value: string;
  onChange: (icon: string) => void;
  label?: string;
  /** 選べるアイコン群。既定はカテゴリパレット。アカウント用に差し替えできる（#98）。 */
  groups?: readonly CategoryIconGroup[];
  /** value がパレット内かの判定。groups とセットで渡す。 */
  isValid?: (name: string) => boolean;
  /** パレット外/未選択時に描く既定アイコン。 */
  fallbackIcon?: string;
}

const SHEET_LABEL = 'アイコンを選ぶ';

/** グリッドの列数。↑↓ の移動量と一致させる必要があるので、CSS と別々に持たない。 */
const COLUMNS = 6;

/**
 * カテゴリアイコンをパレットから選ぶ（#9 / #88）。
 *
 * Material Symbols をサブセットしている都合上、パレット外の名前は文字列で表示されて
 * しまうので、自由入力ではなく選択式にしている。
 *
 * **グリッドをフォームに埋め込まない**（#88、実機フィードバック）: 76 個を 248px の箱に
 * 収めると入れ子スクロールになり、スマホで扱いにくいうえフォームが 1331px まで伸びていた。
 * 今のアイコンだけ出し、選ぶときだけシートを開く。
 *
 * ネイティブ `<select>` にしない理由: Icon はサブセットフォントの**コードポイント**を描く
 * （`iconGlyph`）。iOS は `<option>` を OS 側が描画してカスタムフォントが効かないため、
 * 絵ではなく豆腐（□）や文字化けが並ぶ。
 *
 * **role は listbox/option**（radiogroup ではない）: APG 準拠の radiogroup は矢印キーでの
 * 移動がそのまま選択になる（`SegmentedControl` はそう実装している）。だがここは選ぶと
 * シートが閉じるので、radiogroup にすると**矢印を 1 回押した瞬間に閉じる**ことになる。
 * listbox なら「フォーカスの移動」と「確定」を分けられる。
 */
export function IconPicker({
  value,
  onChange,
  label = 'アイコン',
  groups = CATEGORY_ICON_GROUPS,
  isValid = isCategoryIcon,
  fallbackIcon = DEFAULT_CATEGORY_ICON,
}: Props) {
  const [open, setOpen] = useState(false);
  const optionRefs = useRef(new Map<string, HTMLButtonElement>());

  /** 見た目の並び順（グループをまたいで平坦化）。矢印キーはこの順で動く。 */
  const flatIcons = useMemo(() => groups.flatMap((g) => g.icons), [groups]);

  // パレット外（旧データの独自アイコン）はフォーカスの起点にできないので先頭に落とす。
  const selected = isValid(value) ? value : null;
  const initial = selected ?? flatIcons[0];

  // **tab stop はフォーカス中のアイコンに追随させる。**選択中に固定したままだと、矢印で
  // 移動した先が tabIndex=-1 のままになる。Modal のトラップは tabIndex=-1 を巡回先から
  // 除くので、今フォーカスしている要素がリストに載らず Tab でダイアログの外へ抜ける
  // （codex が指摘 → 実ブラウザで再現した）。
  const [tabbable, setTabbable] = useState(initial);

  // 開いたら選択中のアイコンから始める（APG: listbox は選択項目にフォーカス）。
  // Modal 側の初期フォーカス（最初のフォーカス可能要素 = 閉じるボタン）より後に動くので
  // こちらが勝つ。閉じている間に選択が変わった場合もここで追随する。
  useEffect(() => {
    if (!open) return;
    setTabbable(initial);
    optionRefs.current.get(initial)?.focus();
  }, [open, initial]);

  function focusIcon(name: string) {
    setTabbable(name);
    optionRefs.current.get(name)?.focus();
  }

  function handleKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    const current = (e.target as HTMLElement).getAttribute?.('data-name') ?? tabbable;
    const delta = {
      ArrowRight: 1,
      ArrowLeft: -1,
      ArrowDown: COLUMNS,
      ArrowUp: -COLUMNS,
    }[e.key];

    if (delta !== undefined) {
      e.preventDefault(); // シートごとスクロールさせない
      const i = flatIcons.indexOf(current);
      if (i < 0) return;
      // 端で止める（回り込ませない）。一周させても迷うだけなので。
      focusIcon(flatIcons[Math.min(Math.max(i + delta, 0), flatIcons.length - 1)]);
      return;
    }
    if (e.key === 'Home' || e.key === 'End') {
      e.preventDefault();
      focusIcon(e.key === 'Home' ? flatIcons[0] : flatIcons[flatIcons.length - 1]);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <span className="font-label-sm text-label-sm text-custom-text/70">{label}</span>

      {/* アクセシブルネームは label から作る。見えている文字だけに任せると、
          呼び出し側が label を変えても読み上げが「アイコンを選ぶ」に固定されてしまう。 */}
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        aria-label={`${label}を選ぶ`}
        className="flex w-fit items-center gap-3 rounded-2xl bg-surface-container-high px-3 py-2 transition hover:bg-custom-accent/10"
      >
        <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-custom-accent/10 text-custom-accent">
          {/* パレット外だと iconGlyph が名前をそのまま返して英単語が出てしまうので、
              描く前に既定アイコンへ落とす。 */}
          <Icon name={selected ?? fallbackIcon} size={24} filled />
        </span>
        <span aria-hidden="true" className="font-label-sm text-label-sm text-custom-text/70">
          {SHEET_LABEL}
        </span>
      </button>

      {/* シートの中でスクロールする。フォーム側は伸びない。 */}
      <Modal open={open} onClose={() => setOpen(false)} label={SHEET_LABEL} className="max-w-md">
        <div className="flex items-center justify-between gap-4">
          <h2 className="font-headline-md text-headline-md text-custom-text">{SHEET_LABEL}</h2>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="rounded-full px-3 py-2 font-label-sm text-label-sm text-custom-accent transition hover:bg-custom-accent/10"
          >
            閉じる
          </button>
        </div>

        <div
          role="listbox"
          aria-label={SHEET_LABEL}
          onKeyDown={handleKeyDown}
          className="mt-4 flex max-h-[60vh] flex-col gap-4 overflow-y-auto"
        >
          {groups.map((group) => (
            // listbox の子として合法なグルーピング
            <div
              key={group.group}
              role="group"
              aria-label={group.group}
              className="flex flex-col gap-2"
            >
              <span aria-hidden="true" className="font-label-sm text-label-sm text-custom-text/70">
                {group.group}
              </span>
              {/* Tailwind は動的なクラス名を検出できない（`grid-cols-${COLUMNS}` は消える）。
                  COLUMNS を単一の情報源に保つため style で列数を渡す。 */}
              <div
                className="grid gap-1.5"
                style={{ gridTemplateColumns: `repeat(${COLUMNS}, minmax(0, 1fr))` }}
              >
                {group.icons.map((name) => {
                  const isSelected = name === selected;
                  return (
                    <button
                      key={name}
                      ref={(el) => {
                        if (el) optionRefs.current.set(name, el);
                        else optionRefs.current.delete(name);
                      }}
                      type="button"
                      role="option"
                      aria-selected={isSelected}
                      aria-label={name}
                      data-name={name}
                      // roving tabindex: tab stop は常に 1 つだけ
                      tabIndex={name === tabbable ? 0 : -1}
                      onClick={() => {
                        onChange(name);
                        // 選んだら用は済むので閉じる（確定ボタンを増やさない）
                        setOpen(false);
                      }}
                      className={cn(
                        'flex h-11 w-11 items-center justify-center rounded-xl transition',
                        isSelected
                          ? 'bg-custom-accent text-on-primary'
                          : 'text-custom-text/70 hover:bg-custom-accent/10 hover:text-custom-accent',
                      )}
                    >
                      <Icon name={name} size={22} filled={isSelected} />
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
