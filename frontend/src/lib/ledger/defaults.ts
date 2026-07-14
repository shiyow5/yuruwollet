import { jstMonthStart, jstToday } from '../format';

/**
 * 取引追加フォームの既定日付を決める純関数。
 *
 * 見ている月が当月なら「今日」、それ以外はその月の初日。
 * 過去/未来の月を見ながら追加したときに当月の日付で書き込むと、
 * 追加した記録が別の月に入って「追加したのに消えた」ように見える。
 *
 * ホーム（月ナビが無く常に当月）と家計簿（月ナビあり）が **同じ式**を呼ぶことで、
 * 「ホーム用/家計簿用の日付ロジックの取り違え」を構造的に起こせなくする。
 */
export function defaultOccurredOn(viewMonth: string, now: Date = new Date()): string {
  return viewMonth === jstMonthStart(now) ? jstToday(now) : viewMonth;
}
