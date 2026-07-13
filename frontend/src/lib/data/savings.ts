import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '../database.types';
import type { SavingsProgress } from '../savings/types';

/**
 * その人の当月の目標と進捗。目標が未設定なら null。
 * saved は残高調整（is_system_generated）を除いた「収入 − 支出」（View 側で担保）。
 */
export async function getSavingsProgress(
  client: SupabaseClient<Database>,
  memberId: string,
  month: string,
): Promise<SavingsProgress | null> {
  const { data, error } = await client
    .from('v_savings_progress')
    .select('*')
    .eq('member_id', memberId)
    .eq('period_month', month)
    .maybeSingle();
  if (error) throw new Error(`目標貯金を取得できませんでした: ${error.message}`);
  return data as SavingsProgress | null;
}

export interface SaveGoalInput {
  householdId: string;
  memberId: string;
  month: string;
  targetAmount: number;
}

/**
 * 当月の目標を設定/更新する。
 * savings_goals は unique(member_id, period_month) なので upsert（毎月「今月の目標」は 1 つ）。
 */
export async function saveSavingsGoal(
  client: SupabaseClient<Database>,
  input: SaveGoalInput,
): Promise<void> {
  const { error } = await client.from('savings_goals').upsert(
    {
      household_id: input.householdId,
      member_id: input.memberId,
      period_month: input.month,
      target_amount: input.targetAmount,
    },
    { onConflict: 'member_id,period_month' },
  );
  if (error) throw new Error(`目標を保存できませんでした: ${error.message}`);
}

/** 目標をやめる（当月の行を消す）。 */
export async function deleteSavingsGoal(
  client: SupabaseClient<Database>,
  memberId: string,
  month: string,
): Promise<void> {
  const { error } = await client
    .from('savings_goals')
    .delete()
    .eq('member_id', memberId)
    .eq('period_month', month);
  if (error) throw new Error(`目標を取り消せませんでした: ${error.message}`);
}

/**
 * 初期残高（アプリを使い始めた時点の財布の中身）。
 * 残高 = 初期残高 + Σ(収入 − 支出) なので、これを変えると残高がそのぶん動く。
 */
export async function updateOpeningBalance(
  client: SupabaseClient<Database>,
  memberId: string,
  openingBalance: number,
): Promise<void> {
  const { error } = await client
    .from('profiles')
    .update({ opening_balance: openingBalance })
    .eq('member_id', memberId);
  if (error) throw new Error(`初期残高を保存できませんでした: ${error.message}`);
}
