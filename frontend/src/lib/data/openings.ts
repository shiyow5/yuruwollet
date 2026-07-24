import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '../database.types';
import type { AccountBalance, AccountOpening } from '../ledger/types';

/**
 * メンバー×口座 ごとの現在残高（#102）。
 * 口座残高 = 口座初期残高 + その口座の収支。household スコープで両メンバー分が返る
 * （相手タブで相手の口座残高も見せるため）。archived 口座も含めて返す。
 */
export async function getAccountBalances(
  client: SupabaseClient<Database>,
): Promise<AccountBalance[]> {
  const { data, error } = await client.from('v_account_balances').select('*');
  if (error) throw new Error(`口座別残高の取得に失敗しました: ${error.message}`);
  return data ?? [];
}

/**
 * メンバー×口座 ごとの初期残高（#102）。household スコープで両メンバー分が返る。
 * 未設定の口座は行が無い（残高計算では 0 とみなす）。
 */
export async function listAccountOpenings(
  client: SupabaseClient<Database>,
): Promise<AccountOpening[]> {
  const { data, error } = await client.from('account_openings').select('*');
  if (error) throw new Error(`口座の初期残高の取得に失敗しました: ${error.message}`);
  return data ?? [];
}

export interface UpsertAccountOpeningInput {
  householdId: string;
  memberId: string;
  accountId: string;
  openingBalance: number;
}

/**
 * 口座の初期残高を設定/更新する（#102）。
 * account_openings は primary key (member_id, account_id) なので upsert（1 口座 1 行）。
 * RLS が member_id = 自分 を強制するので、他人の初期残高は書き換えられない。
 */
export async function upsertAccountOpening(
  client: SupabaseClient<Database>,
  input: UpsertAccountOpeningInput,
): Promise<void> {
  const { error } = await client.from('account_openings').upsert(
    {
      household_id: input.householdId,
      member_id: input.memberId,
      account_id: input.accountId,
      opening_balance: input.openingBalance,
    },
    { onConflict: 'member_id,account_id' },
  );
  if (error) throw new Error(`口座の初期残高を保存できませんでした: ${error.message}`);
}
