import { z } from 'zod';

/**
 * URL は画面上でリンクとして描画するため、**スキームを http(s) に限定する**。
 * これが無いと `javascript:...` や `data:text/html,...` を登録でき、
 * 相手がリンクを踏んだ瞬間にスクリプトが走る（共有リストなので相手を攻撃できてしまう）。
 */
export function isSafeUrl(raw: string): boolean {
  try {
    const url = new URL(raw);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

export const wishlistFormSchema = z.object({
  genre: z.enum(['want', 'place']),
  title: z.string().trim().min(1, 'タイトルを入力してください').max(100, 'タイトルが長すぎます'),
  url: z
    .string()
    .trim()
    .max(2000, 'URL が長すぎます')
    .refine((v) => v === '' || isSafeUrl(v), 'http(s) の URL を入力してください'),
  memo: z.string().trim().max(500, 'メモが長すぎます'),
});

export type WishlistFormInput = z.infer<typeof wishlistFormSchema>;

export interface WishlistFormValues {
  genre: string;
  title: string;
  url: string;
  memo: string;
}

export type ParseResult =
  | { ok: true; value: WishlistFormInput }
  | { ok: false; errors: Partial<Record<keyof WishlistFormValues, string>> };

export function parseWishlistForm(values: WishlistFormValues): ParseResult {
  const parsed = wishlistFormSchema.safeParse(values);
  if (parsed.success) return { ok: true, value: parsed.data };

  const errors: Partial<Record<keyof WishlistFormValues, string>> = {};
  for (const issue of parsed.error.issues) {
    const key = issue.path[0] as keyof WishlistFormValues;
    errors[key] ??= issue.message;
  }
  return { ok: false, errors };
}
