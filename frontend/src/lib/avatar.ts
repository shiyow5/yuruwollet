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

const DEFAULT_TONE = 'bg-surface-container-high text-custom-text/60';

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
 * **https の絶対 URL だけを通す。** `javascript:` や `data:` を弾く
 * （CSP をまだ入れていないので、ここが唯一の関門になる）。
 */
export function isDisplayableAvatarUrl(value: unknown): value is string {
  return typeof value === 'string' && value.startsWith('https://');
}
