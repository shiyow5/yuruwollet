const yenNumber = new Intl.NumberFormat('ja-JP', { maximumFractionDigits: 0 });

/**
 * JPY 金額を「¥1,234」形式に整形する。JPY は小数を持たないため四捨五入する。
 * 通貨記号は環境非依存にするため自前で付与する（Intl の currency 表示は ICU 差がある）。
 */
export function formatYen(amount: number): string {
  return `¥${yenNumber.format(Math.round(amount))}`;
}

/**
 * 収入/支出の符号付き表示（例: 支出 → 「- ¥4,500」, 収入 → 「+ ¥280,000」）。
 */
export function formatSignedYen(amount: number, type: 'income' | 'expense'): string {
  const sign = type === 'income' ? '+' : '-';
  return `${sign} ${formatYen(Math.abs(amount))}`;
}
