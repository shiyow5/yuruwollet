import { formatYen } from '../format';

/**
 * リングの進捗率（0-100）。
 * 今月の貯金額（収入 − 支出）は**マイナスにもなりうる**ので 0 で下限を切り、
 * 超過分もリングとしては 100 で止める（実額は別に見せる）。
 * 目標 0 は 0 除算を避けつつ「貯金額が 0 以上なら達成」とみなす。
 */
export function progressPct(saved: number, target: number): number {
  if (target <= 0) return saved >= 0 ? 100 : 0;
  // 100% は **達成したときだけ**。四捨五入すると 29,900/30,000 が 100% になり、
  // リングは満了しているのにカードは「あと ¥100」「未達成」と言う矛盾が起きる。
  if (isAchieved(saved, target)) return 100;
  const pct = Math.floor((saved / target) * 100);
  return Math.max(0, Math.min(99, pct));
}

/** 目標までの残り（達成済みなら 0）。貯金額がマイナスなら目標額より多く必要になる。 */
export function remainingToGoal(saved: number, target: number): number {
  return Math.max(0, target - saved);
}

export function isAchieved(saved: number, target: number): boolean {
  return saved >= target;
}

/**
 * 今月の貯金額の表示。
 * **マイナスを 0 に丸めない**（使いすぎている事実を隠さない）。
 */
export function savedLabel(saved: number): string {
  return saved < 0 ? `-${formatYen(Math.abs(saved))}` : formatYen(saved);
}
