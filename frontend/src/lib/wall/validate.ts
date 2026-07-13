import { parseAmount } from '../format';

export type ActualBalanceResult = { ok: true; value: number } | { ok: false; error: string };

/**
 * 「実際の残高」入力の検証。財布の中身なので 0 円以上の整数のみ。
 * （RPC の p_actual は integer。差額は actual − computed で正負どちらにもなり得る）
 */
export function validateActualBalance(text: string): ActualBalanceResult {
  const n = parseAmount(text);
  if (Number.isNaN(n)) return { ok: false, error: '残高を入力してください' };
  if (!Number.isInteger(n)) return { ok: false, error: '残高は整数（円）で入力してください' };
  if (n < 0) return { ok: false, error: '残高は0円以上で入力してください' };
  return { ok: true, value: n };
}
