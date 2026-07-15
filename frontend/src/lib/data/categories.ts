import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '../database.types';
import type { Category, CategoryDraft } from '../ledger/types';

/**
 * household 共有のカテゴリを kind→sort_order→name 順で取得する。
 * archived も含めて返す（過去の取引が参照するカテゴリ名を履歴表示で解決するため）。
 * フォーム/管理の選択肢は selectableCategories / CategoryManager 側で archived を除外する。
 */
export async function listCategories(client: SupabaseClient<Database>): Promise<Category[]> {
  const { data, error } = await client
    .from('categories')
    .select('*')
    .order('kind', { ascending: true })
    .order('sort_order', { ascending: true })
    .order('name', { ascending: true });
  if (error) throw new Error(`カテゴリの取得に失敗しました: ${error.message}`);
  return data ?? [];
}

export interface CreateCategoryContext {
  householdId: string;
}

/** ユーザーカテゴリを追加する（is_system=false 固定。RLS でも system 作成は不可）。 */
export async function createCategory(
  client: SupabaseClient<Database>,
  draft: CategoryDraft,
  ctx: CreateCategoryContext,
): Promise<Category> {
  const { data, error } = await client
    .from('categories')
    .insert({
      household_id: ctx.householdId,
      kind: draft.kind,
      name: draft.name,
      icon: draft.icon,
      is_system: false,
    })
    .select()
    .single();
  if (error) throw new Error(`カテゴリの追加に失敗しました: ${error.message}`);
  return data;
}

/** カテゴリをソフトアーカイブする（取引の参照を壊さないよう削除ではなく非表示化）。 */
export async function archiveCategory(client: SupabaseClient<Database>, id: string): Promise<void> {
  const { error } = await client
    .from('categories')
    .update({ is_archived: true })
    .eq('id', id)
    .eq('is_system', false);
  if (error) throw new Error(`カテゴリのアーカイブに失敗しました: ${error.message}`);
}

/** アーカイブ済カテゴリを復元する（誤操作からの復旧・重複名の再作成不能を回避）。 */
export async function unarchiveCategory(
  client: SupabaseClient<Database>,
  id: string,
): Promise<void> {
  const { error } = await client
    .from('categories')
    .update({ is_archived: false })
    .eq('id', id)
    .eq('is_system', false);
  if (error) throw new Error(`カテゴリの復元に失敗しました: ${error.message}`);
}

/**
 * カテゴリを削除する（#75）。
 *
 * システム・デフォルトは削除させない（RLS でも `is_system=false and is_default=false` を要求）。
 * ここでも同じ条件を明示して、UI の判定と DB の関門を揃える。
 * 取引で使われているカテゴリは FK（on delete restrict）で DB が弾く＝エラーになる。
 * 呼び出し側は事前に getCategoryUsage で使用数を見て、使用中なら削除させない。
 */
export async function deleteCategory(client: SupabaseClient<Database>, id: string): Promise<void> {
  const { error } = await client
    .from('categories')
    .delete()
    .eq('id', id)
    .eq('is_system', false)
    .eq('is_default', false);
  if (error) throw new Error(`カテゴリの削除に失敗しました: ${error.message}`);
}

/**
 * そのカテゴリが取引で何件使われているか（#75）。
 *
 * 削除ダイアログで見せて、使用中（>0）なら削除ではなくアーカイブに誘導する。
 * 「消したら家計簿の履歴が未分類になる」驚きを、消す前に防ぐ。
 */
export async function getCategoryUsage(
  client: SupabaseClient<Database>,
  id: string,
): Promise<number> {
  const { count, error } = await client
    .from('transactions')
    .select('id', { count: 'exact', head: true })
    .eq('category_id', id);
  if (error) throw new Error(`カテゴリの使用状況の取得に失敗しました: ${error.message}`);
  return count ?? 0;
}
