import { parseAmount } from '../format';

export type AmountResult = { ok: true; value: number } | { ok: false; error: string };

/** 0 円以上の整数（円）を検証する。目標額・初期残高で共通。 */
function validateYen(raw: string, label: string): AmountResult {
  const text = raw.trim();
  if (text === '') return { ok: false, error: `${label}を入力してください` };

  const value = parseAmount(text);
  if (value === null || !Number.isFinite(value)) {
    return { ok: false, error: '数字で入力してください' };
  }
  if (!Number.isInteger(value)) return { ok: false, error: '1円単位で入力してください' };
  if (value < 0) return { ok: false, error: `${label}は0円以上で入力してください` };
  // Postgres の integer 上限。超えると DB 側で落ちるので手前で弾く。
  if (value > 2_147_483_647) return { ok: false, error: `${label}が大きすぎます` };
  return { ok: true, value };
}

/** 今月の目標貯金額。 */
export function validateTargetAmount(raw: string): AmountResult {
  return validateYen(raw, '目標額');
}

/** 初期残高（アプリを使い始めた時点の財布の中身）。 */
export function validateOpeningBalance(raw: string): AmountResult {
  return validateYen(raw, '初期残高');
}
