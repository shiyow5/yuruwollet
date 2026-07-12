import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '../database.types';
import type { Category, CategoryDraft } from '../ledger/types';

/** household 共有のカテゴリ（非archived）を kind→sort_order→name 順で取得する。 */
export async function listCategories(client: SupabaseClient<Database>): Promise<Category[]> {
  const { data, error } = await client
    .from('categories')
    .select('*')
    .eq('is_archived', false)
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
export async function archiveCategory(
  client: SupabaseClient<Database>,
  id: string,
): Promise<void> {
  const { error } = await client
    .from('categories')
    .update({ is_archived: true })
    .eq('id', id)
    .eq('is_system', false);
  if (error) throw new Error(`カテゴリのアーカイブに失敗しました: ${error.message}`);
}
