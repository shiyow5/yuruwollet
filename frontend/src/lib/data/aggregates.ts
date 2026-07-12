import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '../database.types';
import type {
  MemberBalance,
  MonthlySummary,
  CategoryBreakdownRow,
  Profile,
} from '../ledger/types';

/** 二人の profile を member_id 昇順で取得する（household スコープで両者返る）。 */
export async function listProfiles(client: SupabaseClient<Database>): Promise<Profile[]> {
  const { data, error } = await client
    .from('profiles')
    .select('*')
    .order('member_id', { ascending: true });
  if (error) throw new Error(`プロフィールの取得に失敗しました: ${error.message}`);
  return data ?? [];
}

/** member 別の現在残高（全期間累積）を取得する。 */
export async function getMemberBalances(
  client: SupabaseClient<Database>,
): Promise<MemberBalance[]> {
  const { data, error } = await client.from('v_member_balances').select('*');
  if (error) throw new Error(`残高の取得に失敗しました: ${error.message}`);
  return data ?? [];
}

/** member×月 の収入/支出サマリを取得する。該当なしは null。 */
export async function getMonthlySummary(
  client: SupabaseClient<Database>,
  memberId: string,
  month: string,
): Promise<MonthlySummary | null> {
  const { data, error } = await client
    .from('v_monthly_summary')
    .select('*')
    .eq('member_id', memberId)
    .eq('month', month)
    .maybeSingle();
  if (error) throw new Error(`月次サマリの取得に失敗しました: ${error.message}`);
  return data;
}

/** member×月 のカテゴリ別内訳を取得する（残高調整は view 側で除外済み）。 */
export async function getCategoryBreakdown(
  client: SupabaseClient<Database>,
  memberId: string,
  month: string,
): Promise<CategoryBreakdownRow[]> {
  const { data, error } = await client
    .from('v_category_breakdown')
    .select('*')
    .eq('member_id', memberId)
    .eq('month', month);
  if (error) throw new Error(`カテゴリ別内訳の取得に失敗しました: ${error.message}`);
  return data ?? [];
}
