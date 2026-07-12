import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '../database.types';
import { addMonths } from '../format';
import type { Transaction, TransactionDraft } from '../ledger/types';

export interface ListTransactionsParams {
  memberId: string;
  /** 'YYYY-MM-01'。指定時はその月（当月初〜翌月初）のみ。 */
  month?: string;
  limit?: number;
}

/** member（+任意の月）の取引を occurred_on/created_at 降順で取得する。 */
export async function listTransactions(
  client: SupabaseClient<Database>,
  params: ListTransactionsParams,
): Promise<Transaction[]> {
  let filter = client.from('transactions').select('*').eq('owner_member_id', params.memberId);
  if (params.month) {
    filter = filter.gte('occurred_on', params.month).lt('occurred_on', addMonths(params.month, 1));
  }
  let query = filter
    .order('occurred_on', { ascending: false })
    .order('created_at', { ascending: false });
  if (params.limit != null) query = query.limit(params.limit);

  const { data, error } = await query;
  if (error) throw new Error(`取引の取得に失敗しました: ${error.message}`);
  return data ?? [];
}

export interface CreateTransactionContext {
  householdId: string;
  ownerMemberId: string;
}

/** 取引を追加する。owner_member_id は呼出者（自分）に固定（RLS でも強制）。 */
export async function createTransaction(
  client: SupabaseClient<Database>,
  draft: TransactionDraft,
  ctx: CreateTransactionContext,
): Promise<Transaction> {
  const { data, error } = await client
    .from('transactions')
    .insert({
      household_id: ctx.householdId,
      owner_member_id: ctx.ownerMemberId,
      type: draft.type,
      amount: draft.amount,
      category_id: draft.categoryId,
      memo: draft.memo,
      occurred_on: draft.occurredOn,
    })
    .select()
    .single();
  if (error) throw new Error(`取引の追加に失敗しました: ${error.message}`);
  return data;
}

/** 取引を更新する（自分の非system取引のみ／RLS で保証）。 */
export async function updateTransaction(
  client: SupabaseClient<Database>,
  id: string,
  draft: TransactionDraft,
): Promise<Transaction> {
  const { data, error } = await client
    .from('transactions')
    .update({
      type: draft.type,
      amount: draft.amount,
      category_id: draft.categoryId,
      memo: draft.memo,
      occurred_on: draft.occurredOn,
    })
    .eq('id', id)
    .select()
    .single();
  if (error) throw new Error(`取引の更新に失敗しました: ${error.message}`);
  return data;
}

/** 取引を削除する。 */
export async function deleteTransaction(
  client: SupabaseClient<Database>,
  id: string,
): Promise<void> {
  const { error } = await client.from('transactions').delete().eq('id', id);
  if (error) throw new Error(`取引の削除に失敗しました: ${error.message}`);
}
