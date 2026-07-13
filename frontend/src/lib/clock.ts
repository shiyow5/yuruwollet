const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * 現在時刻。テスト/E2E 用に `?now=YYYY-MM-DD` で JST の日付を偽装できる（**表示判定のみ**）。
 * 残高調整の対象月は RPC がサーバの JST 実時刻で決めるため、偽装しても DB の月は汚れない。
 */
export function getNow(
  search: string = typeof window === 'undefined' ? '' : window.location.search,
): Date {
  const override = new URLSearchParams(search).get('now');
  if (override && ISO_DATE.test(override)) {
    return new Date(`${override}T12:00:00+09:00`);
  }
  return new Date();
}
