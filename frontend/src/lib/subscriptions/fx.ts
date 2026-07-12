import type { SubCurrency, SubCycle } from './types';

export interface ComputedAmounts {
  /** DB へ保存する円建てスナップショット（整数） */
  amountJpy: number;
  /** USD のときの適用レート（JPY のときは null） */
  fxRate: number | null;
  /** レートの基準日 'YYYY-MM-DD'（JPY のときは null） */
  fxRateDate: string | null;
}

export interface FxSnapshot {
  rate: number;
  rateDate: string;
}

/**
 * 元通貨・金額と（USD時の）為替から、DB 保存用の円建て額と fx フィールドを算出する純関数。
 * - JPY: amount_jpy = round(originalAmount), fx=null（`fx_fields_consistent` 制約に整合）
 * - USD: レートが無ければ null（＝登録不可）。あれば amount_jpy = round(originalAmount × rate)
 */
export function computeSubscriptionAmounts(
  currency: SubCurrency,
  originalAmount: number,
  fx: FxSnapshot | null,
): ComputedAmounts | null {
  if (currency === 'JPY') {
    return { amountJpy: Math.round(originalAmount), fxRate: null, fxRateDate: null };
  }
  if (!fx) return null;
  return {
    amountJpy: Math.round(originalAmount * fx.rate),
    fxRate: fx.rate,
    fxRateDate: fx.rateDate,
  };
}

/** 月換算額（毎年→/12 四捨五入）。生成列 monthly_amount_jpy と同じ規則で表示/概算に使う。 */
export function monthlyEquivalent(amountJpy: number, cycle: SubCycle): number {
  return cycle === 'yearly' ? Math.round(amountJpy / 12) : amountJpy;
}

/** USD は更新日レートが未確定のため概算表示（実レートは cron が確定）。 */
export function isApproximate(currency: SubCurrency): boolean {
  return currency === 'USD';
}
