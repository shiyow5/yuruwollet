import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '../database.types';
import type { MonthlySummaryRow, SavingsHistoryRow, SubscriptionSlice } from '../charts/types';

/**
 * 直近 N ヶ月の月次収支（残高調整は view 側で除外済み）。
 * 取引が 1 件も無い月は **行として存在しない**ので、系列の穴埋めは呼び出し側で行う。
 */
export async function listMonthlySummaries(
  client: SupabaseClient<Database>,
  memberId: string,
  fromMonth: string,
): Promise<MonthlySummaryRow[]> {
  const { data, error } = await client
    .from('v_monthly_summary')
    .select('month, income, expense, net')
    .eq('member_id', memberId)
    .gte('month', fromMonth)
    .order('month', { ascending: true });
  if (error) throw new Error(`収支推移を取得できませんでした: ${error.message}`);
  return (data ?? []) as MonthlySummaryRow[];
}

/** 目標を設定した月の「目標 vs 実績」。目標が無い月は行が存在しない。 */
export async function listSavingsHistory(
  client: SupabaseClient<Database>,
  memberId: string,
  fromMonth: string,
): Promise<SavingsHistoryRow[]> {
  const { data, error } = await client
    .from('v_savings_progress')
    .select('period_month, target_amount, saved')
    .eq('member_id', memberId)
    .gte('period_month', fromMonth)
    .order('period_month', { ascending: true });
  if (error) throw new Error(`貯金の履歴を取得できませんでした: ${error.message}`);
  return (data ?? []) as SavingsHistoryRow[];
}

/**
 * サブスクの月換算内訳。
 * 解約検討中(considering_cancel)は月換算合計から除外しているので、内訳からも外す。
 */
export async function listSubscriptionSlices(
  client: SupabaseClient<Database>,
  memberId: string,
): Promise<SubscriptionSlice[]> {
  const { data, error } = await client
    .from('subscriptions')
    .select('name, monthly_amount_jpy')
    .eq('owner_member_id', memberId)
    .neq('status', 'considering_cancel')
    .order('monthly_amount_jpy', { ascending: false });
  if (error) throw new Error(`サブスク内訳を取得できませんでした: ${error.message}`);
  return (data ?? []).map((r) => ({
    name: r.name,
    monthly: r.monthly_amount_jpy ?? 0,
  }));
}
