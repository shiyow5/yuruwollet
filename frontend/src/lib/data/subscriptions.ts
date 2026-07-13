import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '../database.types';
import type { Subscription, SubscriptionDraft } from '../subscriptions/types';
import { computeSubscriptionAmounts, type FxSnapshot } from '../subscriptions/fx';

/** member のサブスクを次回更新日の近い順で取得する。 */
export async function listSubscriptions(
  client: SupabaseClient<Database>,
  memberId: string,
): Promise<Subscription[]> {
  const { data, error } = await client
    .from('subscriptions')
    .select('*')
    .eq('owner_member_id', memberId)
    .order('next_renewal_date', { ascending: true })
    .order('name', { ascending: true });
  if (error) throw new Error(`サブスクの取得に失敗しました: ${error.message}`);
  return data ?? [];
}

/** USD/JPY の最新為替（fx_rates）。無ければ null。 */
export async function getLatestFxRate(
  client: SupabaseClient<Database>,
): Promise<FxSnapshot | null> {
  const { data, error } = await client
    .from('fx_rates')
    .select('*')
    .eq('base', 'USD')
    .eq('quote', 'JPY')
    .order('rate_date', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(`為替レートの取得に失敗しました: ${error.message}`);
  if (!data) return null;
  return { rate: Number(data.rate), rateDate: data.rate_date };
}

/** member のサブスク月換算合計（v_subscription_monthly_total、解約検討中は view 側で除外）。 */
export async function getSubscriptionMonthlyTotal(
  client: SupabaseClient<Database>,
  memberId: string,
): Promise<number> {
  const { data, error } = await client
    .from('v_subscription_monthly_total')
    .select('*')
    .eq('member_id', memberId)
    .maybeSingle();
  if (error) throw new Error(`サブスク合計の取得に失敗しました: ${error.message}`);
  return data?.monthly_total_jpy ?? 0;
}

export interface SubscriptionWriteContext {
  householdId: string;
  ownerMemberId: string;
}

function buildRow(draft: SubscriptionDraft, fx: FxSnapshot | null) {
  const amounts = computeSubscriptionAmounts(draft.currency, draft.originalAmount, fx);
  if (!amounts) {
    throw new Error('為替レートが取得できていないため USD のサブスクを登録できません');
  }
  return {
    name: draft.name,
    currency: draft.currency,
    original_amount: draft.originalAmount,
    amount_jpy: amounts.amountJpy,
    fx_rate: amounts.fxRate,
    fx_rate_date: amounts.fxRateDate,
    cycle: draft.cycle,
    next_renewal_date: draft.nextRenewalDate,
    status: draft.status,
  };
}

/** サブスクを追加する（amount_jpy を書込時スナップ、owner は自分固定）。 */
export async function createSubscription(
  client: SupabaseClient<Database>,
  draft: SubscriptionDraft,
  fx: FxSnapshot | null,
  ctx: SubscriptionWriteContext,
): Promise<Subscription> {
  const row = buildRow(draft, fx); // USD でレート未取得なら DB へ行かず throw
  const { data, error } = await client
    .from('subscriptions')
    .insert({
      household_id: ctx.householdId,
      owner_member_id: ctx.ownerMemberId,
      ...row,
    })
    .select()
    .single();
  if (error) throw new Error(`サブスクの追加に失敗しました: ${error.message}`);
  return data;
}

/** サブスクを更新する（通貨変更にも対応し amount_jpy を再スナップ）。 */
export async function updateSubscription(
  client: SupabaseClient<Database>,
  id: string,
  draft: SubscriptionDraft,
  fx: FxSnapshot | null,
): Promise<Subscription> {
  const row = buildRow(draft, fx);
  const { data, error } = await client
    .from('subscriptions')
    .update(row)
    .eq('id', id)
    .select()
    .single();
  if (error) throw new Error(`サブスクの更新に失敗しました: ${error.message}`);
  return data;
}

/** サブスクを削除する。 */
export async function deleteSubscription(
  client: SupabaseClient<Database>,
  id: string,
): Promise<void> {
  const { error } = await client.from('subscriptions').delete().eq('id', id);
  if (error) throw new Error(`サブスクの削除に失敗しました: ${error.message}`);
}
