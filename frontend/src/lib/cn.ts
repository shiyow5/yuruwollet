/** falsy を除いて className を結合する軽量ユーティリティ */
export function cn(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ');
}
