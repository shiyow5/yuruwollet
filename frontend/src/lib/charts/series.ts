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
  '#4a769e', // ダスティブルー（アクセント）。custom-accent と揃える（#90 で暗くした）
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

interface Entry {
  name: string;
  value: number;
}

/**
 * 同名のスライスを 1 つに合算する。
 *
 * カテゴリ未設定ぶんも「その他」と表示するため、**「その他」という名前のカテゴリが
 * 実在するとスライスが 2 つできる**（凡例が 2 行に割れ、DonutChart の React key も衝突する）。
 * 畳み込みの有無に関わらず、名前が同じものは必ず 1 つにする。
 */
function mergeByName(entries: Entry[]): Entry[] {
  const byName = new Map<string, number>();
  for (const entry of entries) {
    byName.set(entry.name, (byName.get(entry.name) ?? 0) + entry.value);
  }
  return [...byName].map(([name, value]) => ({ name, value }));
}

/**
 * 大きい順。**同額なら名前順**にする。
 *
 * 同額のまま入力順に任せると、再取得のたびに順序が入れ替わりうる。
 * 色は index で振るので、同じカテゴリの色と凡例の位置が毎回変わってしまう。
 */
function byValueThenName(a: Entry, b: Entry): number {
  return b.value - a.value || a.name.localeCompare(b.name);
}

/** 上位を残し、あふれた分を「その他」に畳む（合計は保つ）。 */
function collapse(entries: Entry[]): Slice[] {
  const sorted = mergeByName(entries).sort(byValueThenName);

  let merged = sorted;
  if (sorted.length > MAX_SLICES) {
    const head = sorted.slice(0, MAX_SLICES - 1);
    const overflow = sorted.slice(MAX_SLICES - 1).reduce((sum, e) => sum + e.value, 0);
    // head にすでに「その他」が居ることがあるので、合算してから並べ直す
    merged = mergeByName([...head, { name: OTHER, value: overflow }]).sort(byValueThenName);
  }

  return merged.map((entry, i) => ({ ...entry, color: sliceColor(i) }));
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
