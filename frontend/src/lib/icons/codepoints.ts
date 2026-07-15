import codepoints from './palette.codepoints.json';

/**
 * アイコン名 → 16進コードポイント（scripts/subset_icons.py が生成）。
 *
 * サブセット済みフォントは ligature を持たないので、アイコンは名前ではなく
 * コードポイントで描く（Icon.tsx が使う）。
 */
export const ICON_CODEPOINTS: Record<string, string> = codepoints;

/**
 * アイコン名を描画すべき文字（コードポイントの glyph）に変換する。
 *
 * パレットに無い名前（旧データの独自アイコンなど）は、フォントに glyph が無いので
 * **名前そのものを返す**（従来どおり文字列として表示され、静かに壊れない）。
 */
export function iconGlyph(name: string): string {
  const cp = ICON_CODEPOINTS[name];
  return cp ? String.fromCodePoint(parseInt(cp, 16)) : name;
}
