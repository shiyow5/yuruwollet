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

/**
 * サブスクを削除する。**RPC 経由**（#71）。
 *
 * `deletePayments` を立てると、そのサブスクが台帳に作った支払い記録も
 * **同じトランザクションで**消す。
 *
 * **クライアントから 2 回に分けて消すことはできない。** 削除ポリシーが
 * `subscription_id is null` を要求するので、サブスクを消す前は支払いを消せず、
 * 消した後は（FK の on delete set null で）どれがそのサブスクの支払いだったかが
 * 分からなくなる。だから DB 側の 1 トランザクションに閉じてある。
 *
 * 消した支払いの件数を返す（消さない指定なら 0）。
 */
export async function deleteSubscription(
  client: SupabaseClient<Database>,
  id: string,
  deletePayments = false,
): Promise<number> {
  const { data, error } = await client.rpc('delete_subscription', {
    p_subscription_id: id,
    p_delete_payments: deletePayments,
  });
  if (error) throw new Error(`サブスクの削除に失敗しました: ${error.message}`);
  return data ?? 0;
}

/**
 * そのサブスクが台帳に作った支払いの件数と合計。削除ダイアログで見せる。
 *
 * 「消したのに支出が残っている」と驚かせないために、**消す前に**何が残るのかを伝える。
 */
export async function getSubscriptionPayments(
  client: SupabaseClient<Database>,
  subscriptionId: string,
): Promise<{ count: number; total: number }> {
  const { data, error } = await client
    .from('transactions')
    .select('amount')
    .eq('subscription_id', subscriptionId);
  if (error) throw new Error(`支払い記録の取得に失敗しました: ${error.message}`);
  const rows = data ?? [];
  return {
    count: rows.length,
    total: rows.reduce((sum, r) => sum + r.amount, 0),
  };
}

/**
 * 自分の到来済みサブスクを精算する（支払いを台帳に記録し、更新日を進める）。
 *
 * **登録・編集した直後に呼ぶ。** これまで支払いの記録は cron（JST 00:00）だけが
 * 行っていたため、更新日が今日/過去のサブスクを登録しても翌日まで台帳に出なかった。
 *
 * 計算（ロールフォワード）は DB 側にしか無い。cron も同じ SQL を通るので、
 * 規則が 2 箇所に分かれてズレることがない。
 * 二重計上は unique(subscription_id, occurred_on) が弾くので、
 * cron と同時に走っても、何度呼んでも増えない。
 *
 * @returns 記録した支払いの件数
 */
export async function settleMySubscriptions(client: SupabaseClient): Promise<number> {
  const { data, error } = await client.rpc('settle_my_subscriptions');
  if (error) throw error;
  return data ?? 0;
}
