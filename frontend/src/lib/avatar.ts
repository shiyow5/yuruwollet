/**
 * アバターの表示ロジック。
 *
 * Google のプロフィール画像は Cloudflare Access の `custom.picture` クレームで届くが、
 * **公式に "on a best-effort basis"（届かないこともある）** と明記されている。
 * 画像が無い / 壊れている経路が通常経路なので、必ず頭文字にフォールバックする。
 */

/** メンバーごとの色。未知の id でも落ちないように既定色を持つ。 */
const TONES: Record<string, string> = {
  yururi: 'bg-member-yururi text-on-primary',
  shiyowo: 'bg-member-shiyowo text-on-primary',
};

// フォールバックの頭文字は読める文字なので、二次テキストと同じ AA 下限 /70 にする（#13）。
const DEFAULT_TONE = 'bg-surface-container-high text-custom-text/70';

/** 表示名の頭文字（「ゆるり」→「ゆ」）。画像が無いときのフォールバック。 */
export function initialOf(displayName: string): string {
  // slice(0,1) はサロゲートペアを半分に割る。コードポイント単位で取る。
  return [...displayName.trim()][0] ?? '';
}

/** メンバー色のクラス。 */
export function avatarToneClass(memberId: string): string {
  return TONES[memberId] ?? DEFAULT_TONE;
}

/**
 * `<img src>` に流してよい URL か。
 *
 * **https で、かつ Google のプロフィール画像ホストだけ**を通す。
 *
 * スキームだけ見て `https://` を通すと、任意のホストから画像を読みに行ける。
 * 今の経路（自分の Access JWT の picture クレーム）では攻撃者が値を仕込めないが、
 * これはアプリ初の「外部から取ってくる動的な <img src>」なので、
 * ホストまで固定して多層防御にする。IdP を増やしたときに緩むのも防げる。
 *
 * 外れても実害は無い（頭文字にフォールバックするだけ）。CSP はまだ入っていないので、
 * ここが唯一の関門になる（#41 で img-src を足す）。
 */
export function isDisplayableAvatarUrl(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return false;
  }
  return (
    url.protocol === 'https:' &&
    // Google のプロフィール画像は lh3 のほか lh4/lh5/lh6 も使われる
    (url.hostname === 'googleusercontent.com' || url.hostname.endsWith('.googleusercontent.com'))
  );
}
