import { jstMonthStart, addMonths, monthStartOf } from '../format';
import type {
  MonthlySummaryRow,
  SavingsHistoryRow,
  SavingsPoint,
  Slice,
  SubscriptionSlice,
  TrendPoint,
} from './types';

/** ドーナツに描く最大スライス数（超えた分は「その他」に畳む）。 */
export const MAX_SLICES = 6;

const PALETTE = [
  '#769cbf', // ダスティブルー（アクセント）
  '#a8c0d6',
  '#e2b887',
  '#c2a4c8',
  '#8fbf9f',
  '#d99a9a',
  '#b0b7c3',
] as const;

/** index → 色。再レンダーで入れ替わらないよう決定的に割り当てる。 */
export function sliceColor(index: number): string {
  return PALETTE[index % PALETTE.length];
}

function monthLabel(month: string): string {
  return `${Number(month.slice(5, 7))}月`;
}

/** 当月を含む直近 N ヶ月（古い順）。 */
export function recentMonths(count: number, now: Date = new Date()): string[] {
  const current = jstMonthStart(now);
  return Array.from({ length: count }, (_, i) => addMonths(current, i - (count - 1)));
}

/**
 * 収支推移。
 * **取引が 1 件も無い月は view に行が存在しない**ので、穴を 0 で埋める。
 * 詰めてしまうと「4月の次が7月」になり、軸が実際の時間経過を表さなくなる。
 */
export function buildTrend(
  rows: MonthlySummaryRow[],
  count: number,
  now: Date = new Date(),
): TrendPoint[] {
  const byMonth = new Map(rows.map((r) => [monthStartOf(r.month), r]));
  return recentMonths(count, now).map((month) => {
    const row = byMonth.get(month);
    return {
      month,
      label: monthLabel(month),
      income: row?.income ?? 0,
      expense: row?.expense ?? 0,
      net: row?.net ?? 0,
    };
  });
}

/**
 * 貯金履歴。目標を設定していない月は「達成も未達成もしていない」ので、
 * 0 で埋めずに点そのものを作らない（0 で埋めると未設定月が「目標0で達成」に見える）。
 */
export function buildSavingsSeries(rows: SavingsHistoryRow[]): SavingsPoint[] {
  return rows
    .map((r) => ({
      month: monthStartOf(r.period_month),
      label: monthLabel(r.period_month),
      target: r.target_amount,
      saved: r.saved,
    }))
    .sort((a, b) => a.month.localeCompare(b.month));
}

/** v_category_breakdown の行。View 由来なので列はすべて nullable。 */
export interface CategoryRow {
  category_name: string | null;
  type: 'income' | 'expense' | null;
  total: number | null;
}

export const OTHER = 'その他';

/**
 * 上位を残し、あふれた分を「その他」に畳む（合計は保つ）。
 *
 * 上位にすでに「その他」（カテゴリ未設定ぶん）がいる場合、畳んだ分をもう 1 つ足すと
 * 凡例に同名スライスが 2 行並び、DonutChart の React key も衝突する。**必ず 1 つに合算する**。
 */
function collapse(entries: { name: string; value: number }[]): Slice[] {
  const sorted = [...entries].sort((a, b) => b.value - a.value);

  let head = sorted;
  let overflow = 0;
  if (sorted.length > MAX_SLICES) {
    head = sorted.slice(0, MAX_SLICES - 1);
    overflow = sorted.slice(MAX_SLICES - 1).reduce((sum, e) => sum + e.value, 0);
  }

  const merged = [...head];
  if (overflow > 0) {
    const existing = merged.findIndex((e) => e.name === OTHER);
    if (existing >= 0) {
      merged[existing] = { ...merged[existing], value: merged[existing].value + overflow };
    } else {
      merged.push({ name: OTHER, value: overflow });
    }
  }

  // 合算で「その他」が大きくなることがあるので、並べ直してから色を振る
  return merged
    .sort((a, b) => b.value - a.value)
    .map((entry, i) => ({ ...entry, color: sliceColor(i) }));
}

/** カテゴリ別の**支出**内訳（収入は混ぜない）。 */
export function buildCategorySlices(rows: CategoryRow[]): Slice[] {
  const entries = rows
    .filter((r) => r.type === 'expense' && (r.total ?? 0) > 0)
    .map((r) => ({ name: r.category_name ?? 'その他', value: r.total ?? 0 }));
  return collapse(entries);
}

export function buildSubscriptionSlices(rows: SubscriptionSlice[]): Slice[] {
  const entries = rows
    .filter((r) => r.monthly > 0)
    .map((r) => ({ name: r.name, value: r.monthly }));
  return collapse(entries);
}
