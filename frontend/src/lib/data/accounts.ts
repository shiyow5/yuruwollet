import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '../database.types';
import type { Account, AccountDraft } from '../ledger/types';

/**
 * household 共有のアカウント（在り処）を sort_order→name 順で取得する（#98）。
 * archived も含めて返す（過去の取引が参照するアカウント名を履歴表示で解決するため）。
 * フォーム/管理の選択肢は selectableAccounts / AccountManager 側で archived を除外する。
 */
export async function listAccounts(client: SupabaseClient<Database>): Promise<Account[]> {
  const { data, error } = await client
    .from('accounts')
    .select('*')
    .order('sort_order', { ascending: true })
    .order('name', { ascending: true });
  if (error) throw new Error(`アカウントの取得に失敗しました: ${error.message}`);
  return data ?? [];
}

export interface CreateAccountContext {
  householdId: string;
}

/** ユーザーアカウントを追加する。 */
export async function createAccount(
  client: SupabaseClient<Database>,
  draft: AccountDraft,
  ctx: CreateAccountContext,
): Promise<Account> {
  const { data, error } = await client
    .from('accounts')
    .insert({
      household_id: ctx.householdId,
      name: draft.name,
      icon: draft.icon,
    })
    .select()
    .single();
  if (error) throw new Error(`アカウントの追加に失敗しました: ${error.message}`);
  return data;
}

/** アカウントをソフトアーカイブする（取引の参照を壊さないよう削除ではなく非表示化）。 */
export async function archiveAccount(client: SupabaseClient<Database>, id: string): Promise<void> {
  const { error } = await client.from('accounts').update({ is_archived: true }).eq('id', id);
  if (error) throw new Error(`アカウントのアーカイブに失敗しました: ${error.message}`);
}

/** アーカイブ済アカウントを復元する（誤操作からの復旧・重複名の再作成不能を回避）。 */
export async function unarchiveAccount(
  client: SupabaseClient<Database>,
  id: string,
): Promise<void> {
  const { error } = await client.from('accounts').update({ is_archived: false }).eq('id', id);
  if (error) throw new Error(`アカウントの復元に失敗しました: ${error.message}`);
}

/**
 * アカウントを削除する（#98）。
 *
 * カテゴリと違い system/default の保護は無い（テンプレも含めユーザーが自由に消せる）。
 * ただし取引で使われているアカウントは FK（on delete restrict）で DB が弾く＝エラーになる。
 * 呼び出し側は事前に getAccountUsage で使用数を見て、使用中なら削除させずアーカイブへ誘導する。
 */
export async function deleteAccount(client: SupabaseClient<Database>, id: string): Promise<void> {
  const { error } = await client.from('accounts').delete().eq('id', id);
  if (error) throw new Error(`アカウントの削除に失敗しました: ${error.message}`);
}

/**
 * そのアカウントを在り処にした取引が何件あるか（#98）。
 *
 * 削除ダイアログで見せて、使用中（>0）なら削除ではなくアーカイブに誘導する。
 */
export async function getAccountUsage(
  client: SupabaseClient<Database>,
  id: string,
): Promise<number> {
  const { count, error } = await client
    .from('transactions')
    .select('id', { count: 'exact', head: true })
    .eq('account_id', id);
  if (error) throw new Error(`アカウントの使用状況の取得に失敗しました: ${error.message}`);
  return count ?? 0;
}
