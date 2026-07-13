import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '../database.types';
import type { WishlistItem, WishGenre } from '../wishlist/types';

/**
 * ウィッシュリストは household 共有（per-member ではない）。
 * archived で「現役」と「思い出アーカイブ」を分ける。
 */
export async function listWishlist(
  client: SupabaseClient<Database>,
  archived: boolean,
): Promise<WishlistItem[]> {
  const { data, error } = await client
    .from('wishlist_items')
    .select('*')
    .eq('archived', archived)
    .order('created_at', { ascending: false });
  if (error) throw new Error(`ウィッシュリストを取得できませんでした: ${error.message}`);
  return data ?? [];
}

export interface CreateWishlistInput {
  householdId: string;
  registrantId: string;
  genre: WishGenre;
  title: string;
  url: string;
  memo: string;
}

export async function createWishlistItem(
  client: SupabaseClient<Database>,
  input: CreateWishlistInput,
): Promise<WishlistItem> {
  const { data, error } = await client
    .from('wishlist_items')
    .insert({
      household_id: input.householdId,
      registrant_id: input.registrantId,
      genre: input.genre,
      title: input.title,
      // 空文字を URL として保存しない（リンクを描画するかの判定を null で行う）
      url: input.url === '' ? null : input.url,
      memo: input.memo,
    })
    .select()
    .single();
  if (error) throw new Error(`追加できませんでした: ${error.message}`);
  return data;
}

/**
 * 「買った！/行った！」= done にして **思い出アーカイブへ移動**（削除しない）。
 * status と archived は必ず一緒に動かす（片方だけ変えると一覧から消えたのに未達成、等の齟齬が出る）。
 */
export async function completeWishlistItem(
  client: SupabaseClient<Database>,
  id: string,
): Promise<void> {
  const { error } = await client
    .from('wishlist_items')
    .update({ status: 'done', archived: true })
    .eq('id', id);
  if (error) throw new Error(`「済み」にできませんでした: ${error.message}`);
}

/** 思い出アーカイブから現役リストへ戻す。 */
export async function restoreWishlistItem(
  client: SupabaseClient<Database>,
  id: string,
): Promise<void> {
  const { error } = await client
    .from('wishlist_items')
    .update({ status: 'planned', archived: false })
    .eq('id', id);
  if (error) throw new Error(`戻せませんでした: ${error.message}`);
}

export async function deleteWishlistItem(
  client: SupabaseClient<Database>,
  id: string,
): Promise<void> {
  const { error } = await client.from('wishlist_items').delete().eq('id', id);
  if (error) throw new Error(`削除できませんでした: ${error.message}`);
}
