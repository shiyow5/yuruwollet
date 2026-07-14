import type { MonthlySummary } from './types';

/** 支出比較のバー 1 本分。 */
export interface ExpenseBar {
  expense: number;
  /** 大きい方のバーを 100 とした相対幅（0-100, 整数） */
  widthPct: number;
}

export interface ExpenseComparison {
  thisMonth: ExpenseBar;
  lastMonth: ExpenseBar;
}

/**
 * 今月・先月の支出を 2 本のバーに変換する純関数。
 *
 * **先月の行が無い（previous == null）なら null を返す＝比較しない。**
 * 行が無いのは「取得は成功したが記録 0 件」だが、その大半はアプリを使い始める前の月で、
 * ¥0 のバーを描くと「先月は 1 円も使わなかった」と読めてしまう。
 * バーを 0 幅にしても視覚的に「0 円」と区別が付かないので、カード側で比較を取り下げる。
 *
 * **今月だけ行が無い場合は 0 円・幅 0% を描く。** こちらはクエリが成功していて
 * 「今月はまだ記録が無い」＝ 0 円が事実であり、比較としても意味がある（先月が 100%）。
 * この非対称は意図的。
 *
 * widthPct は最大値基準（toCategoryBars と同じ規約）。
 */
export function buildExpenseComparison(
  current: MonthlySummary | null,
  previous: MonthlySummary | null,
): ExpenseComparison | null {
  if (previous === null) return null;

  const thisMonth = current?.expense ?? 0;
  const lastMonth = previous.expense ?? 0;
  const max = Math.max(thisMonth, lastMonth);
  const pct = (x: number) => (max === 0 ? 0 : Math.round((x / max) * 100));

  return {
    thisMonth: { expense: thisMonth, widthPct: pct(thisMonth) },
    lastMonth: { expense: lastMonth, widthPct: pct(lastMonth) },
  };
}
