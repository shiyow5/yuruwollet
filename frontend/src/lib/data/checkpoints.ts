import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '../database.types';
import type { Checkpoint } from '../wall/types';
import { ConfirmCheckpointError, classifyConfirmError, confirmErrorMessage } from '../wall/errors';

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
 * status='skipped' を upsert する（`skipped` 用の RLS 直接書込経路）。
 *
 * **現在アプリからは未使用（#106）。** 「後で数える」は DB に skipped を残さない
 * ローカルな一時操作に変えた（BalanceWall）。この関数と `skipped` ステータス・RLS は
 * 壁の口座別化（#104）で壁を作り直す際にまとめて掃除する予定。
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

export interface ConfirmInput {
  /** ユーザーが数えて入力した実際の残高。 */
  actual: number;
  /** ユーザーが画面で見た「アプリの計算」残高。サーバはこれと現在値が一致するときだけ確定する。 */
  expectedComputed: number;
}

/**
 * 「決定」= RPC で原子的に「残高調整」取引を挿入し checkpoint を confirmed にする。
 * 差額 0 のときは取引を挿入しない（サーバ側で判定）。
 *
 * RPC は 24日ガード・確定済みチェック・expectedComputed の一致（CAS）を検証し、
 * 崩れていれば SQLSTATE で拒否する。承認後に残高が動いていた場合に、
 * ユーザーが見ていないズレを勝手に調整しないための仕組み。
 */
export async function confirmCheckpoint(
  client: SupabaseClient<Database>,
  input: ConfirmInput,
): Promise<Checkpoint> {
  const { data, error } = await client.rpc('confirm_balance_checkpoint', {
    p_actual: input.actual,
    p_expected_computed: input.expectedComputed,
  });
  if (error) {
    const kind = classifyConfirmError(error.code);
    throw new ConfirmCheckpointError(kind, `${confirmErrorMessage(kind)} (${error.message})`);
  }
  return data as Checkpoint;
}

/**
 * 任意タイミングの残高数え直し（#99）= adjust_balance_now RPC。
 *
 * 24日の壁（confirmCheckpoint）と違い checkpoint を作らず、残高調整取引だけを挿入する。
 * そのため 24日ガード(PT403)・冪等(PT409) は無く、起き得る拒否は
 * CAS 不一致(PT412=stale) と引数不正(PT400) のみ。エラー種別は confirm と同じ写像を使う。
 * 返り値は適用した差額（actual − computed。0 なら取引を挿入していない）。
 */
export async function adjustBalanceNow(
  client: SupabaseClient<Database>,
  input: ConfirmInput,
): Promise<number> {
  const { data, error } = await client.rpc('adjust_balance_now', {
    p_actual: input.actual,
    p_expected_computed: input.expectedComputed,
  });
  if (error) {
    const kind = classifyConfirmError(error.code);
    throw new ConfirmCheckpointError(kind, `${confirmErrorMessage(kind)} (${error.message})`);
  }
  return data as number;
}
