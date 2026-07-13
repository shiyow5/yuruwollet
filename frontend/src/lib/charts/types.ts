/** v_monthly_summary の必要列（取引が無い月は行が存在しない）。 */
export interface MonthlySummaryRow {
  month: string;
  income: number;
  expense: number;
  net: number;
}

/** v_savings_progress の必要列（目標を設定した月だけ行が存在する）。 */
export interface SavingsHistoryRow {
  period_month: string;
  target_amount: number;
  saved: number;
}

/** サブスクの月換算内訳（considering_cancel は除外済み）。 */
export interface SubscriptionSlice {
  name: string;
  monthly: number;
}

/** 収支推移グラフの 1 点（穴埋め済み）。 */
export interface TrendPoint {
  month: string;
  /** 「7月」のような軸ラベル */
  label: string;
  income: number;
  expense: number;
  net: number;
}

/** ドーナツの 1 スライス。 */
export interface Slice {
  name: string;
  value: number;
  color: string;
}

/** 貯金履歴の 1 点。 */
export interface SavingsPoint {
  month: string;
  label: string;
  target: number;
  saved: number;
}
