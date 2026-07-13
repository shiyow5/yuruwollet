import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '../database.types';
import type { Checkpoint } from '../wall/types';

/** member×月 の残高確認 checkpoint。無ければ null。 */
export async function getCurrentCheckpoint(
  client: SupabaseClient<Database>,
  memberId: string,
  month: string,
): Promise<Checkpoint | null> {
  const { data, error } = await client
    .from('balance_checkpoints')
    .select('*')
    .eq('member_id', memberId)
    .eq('checkpoint_month', month)
    .maybeSingle();
  if (error) throw new Error(`残高確認の状態を取得できませんでした: ${error.message}`);
  return data;
}

export interface SkipContext {
  householdId: string;
  memberId: string;
  month: string;
}

/**
 * 「後で数える」= status='skipped' を upsert する。
 * RLS 上、checkpoint への直接書込は skipped のみ許可（confirmed は RPC 経由のみ）。
 * 既存の skipped 行は updated_at が更新され、当日は再表示されなくなる。
 */
export async function skipCheckpoint(
  client: SupabaseClient<Database>,
  ctx: SkipContext,
): Promise<void> {
  const { error } = await client.from('balance_checkpoints').upsert(
    {
      household_id: ctx.householdId,
      member_id: ctx.memberId,
      checkpoint_month: ctx.month,
      status: 'skipped',
    },
    { onConflict: 'household_id,member_id,checkpoint_month' },
  );
  if (error) throw new Error(`スキップを保存できませんでした: ${error.message}`);
}

/**
 * 「決定」= RPC で原子的に「残高調整」取引を挿入し checkpoint を confirmed にする。
 * 差額 0 のときは取引を挿入しない（サーバ側で判定）。
 */
export async function confirmCheckpoint(
  client: SupabaseClient<Database>,
  actual: number,
): Promise<Checkpoint> {
  const { data, error } = await client.rpc('confirm_balance_checkpoint', { p_actual: actual });
  if (error) throw new Error(`残高の確定に失敗しました: ${error.message}`);
  return data as Checkpoint;
}
