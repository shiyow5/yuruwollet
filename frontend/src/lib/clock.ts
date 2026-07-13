const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * `?now=` によるクロック偽装を許可するか。
 * 本番ビルドでは無効。許可すると 24日前でも壁を開けて「決定」でき、
 * RPC はサーバの実月を confirmed にしてしまう（＝本来の24日の催促が消える）ため、
 * 開発と E2E（VITE_ALLOW_CLOCK_OVERRIDE=true）に限定する。
 */
export function isClockOverrideAllowed(): boolean {
  return import.meta.env.DEV === true || import.meta.env.VITE_ALLOW_CLOCK_OVERRIDE === 'true';
}

/**
 * 現在時刻。開発/E2E に限り `?now=YYYY-MM-DD` で JST の日付を偽装できる（表示判定用の seam）。
 */
export function getNow(
  search: string = typeof window === 'undefined' ? '' : window.location.search,
  allowOverride: boolean = isClockOverrideAllowed(),
): Date {
  if (!allowOverride) return new Date();
  const override = new URLSearchParams(search).get('now');
  if (override && ISO_DATE.test(override)) {
    return new Date(`${override}T12:00:00+09:00`);
  }
  return new Date();
}
