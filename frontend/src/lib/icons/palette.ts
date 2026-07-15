import paletteJson from './palette.json';

/**
 * アイコンの単一の真実（#9）。
 *
 * Material Symbols フォントは全アイコンで約 4MB ある。ここに載っているものだけを
 * サブセットして数十KB に落とす（scripts/subset_icons.py）。ligature 描画なので、
 * フォントに含まれないアイコン名は「文字列」として表示されてしまう。だから
 * カテゴリアイコンは自由入力ではなく、このパレットからの選択にする。
 */
export interface CategoryIconGroup {
  group: string;
  icons: readonly string[];
}

/** アプリ chrome で使うアイコン（ナビ・ボタン・空状態など）。ユーザーは選べない。 */
export const UI_ICONS: readonly string[] = paletteJson.ui;

/** カテゴリで選べるアイコン（グループ別）。CategoryManager のピッカーが使う。 */
export const CATEGORY_ICON_GROUPS: readonly CategoryIconGroup[] = paletteJson.categories;

/** カテゴリで選べるアイコンの平坦なリスト（重複除去）。 */
export const CATEGORY_ICONS: readonly string[] = Array.from(
  new Set(CATEGORY_ICON_GROUPS.flatMap((g) => g.icons)),
);

/** フォントにサブセットする全アイコン（ui ∪ categories、重複除去、ソート）。 */
export const SUBSET_ICONS: readonly string[] = Array.from(
  new Set([...UI_ICONS, ...CATEGORY_ICONS]),
).sort();

const CATEGORY_ICON_SET = new Set(CATEGORY_ICONS);

/** そのアイコン名がカテゴリパレットに含まれるか（カテゴリ作成時の検証に使う）。 */
export function isCategoryIcon(name: string): boolean {
  return CATEGORY_ICON_SET.has(name);
}

/** カテゴリアイコンの既定値（パレットの先頭。未指定時のフォールバック）。 */
export const DEFAULT_CATEGORY_ICON = CATEGORY_ICONS[0];
