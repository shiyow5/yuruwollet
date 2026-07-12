import type { CategoryBreakdownRow, TxnType } from './types';

/** カテゴリ別バー 1 本分（ダッシュボードのプログレスバー用）。 */
export interface CategoryBar {
  categoryId: string | null;
  name: string;
  icon: string;
  total: number;
  /** 最大バーを 100 とした相対幅（0-100, 整数） */
  widthPct: number;
}

/**
 * カテゴリ別内訳ビュー行を、指定 type（既定=支出）のバー配列に変換する純関数。
 * - total>0 のみ、降順ソート。
 * - widthPct は最大 total を基準にした相対値（全て 0 のときは 0）。
 * - 未分類（category 削除等で null）は「未分類」/ help アイコンで表示。
 */
export function toCategoryBars(
  rows: CategoryBreakdownRow[],
  type: TxnType = 'expense',
): CategoryBar[] {
  const items = rows
    .filter((r) => r.type === type && (r.total ?? 0) > 0)
    .map((r) => ({
      categoryId: r.category_id,
      name: r.category_name ?? '未分類',
      icon: r.category_icon ?? 'help',
      total: r.total ?? 0,
    }))
    .sort((a, b) => b.total - a.total);

  const max = items.length > 0 ? items[0].total : 0;
  return items.map((x) => ({
    ...x,
    widthPct: max === 0 ? 0 : Math.round((x.total / max) * 100),
  }));
}

/** 指定 type の合計金額を返す純関数。 */
export function totalByType(rows: CategoryBreakdownRow[], type: TxnType): number {
  return rows
    .filter((r) => r.type === type)
    .reduce((sum, r) => sum + (r.total ?? 0), 0);
}
