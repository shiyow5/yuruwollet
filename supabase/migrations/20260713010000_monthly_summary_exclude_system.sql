-- v_monthly_summary から残高調整(is_system_generated)を除外する。
-- v_category_breakdown / v_savings_progress と整合させ、ダッシュボードの
-- 「今月の収入/支出」が 24日の壁で入る調整差額を実収支として数えないようにする。
-- （残高そのものは v_member_balances が調整込みで正しく反映する）
create or replace view public.v_monthly_summary
with (security_invoker = on) as
select
  household_id,
  owner_member_id as member_id,
  date_trunc('month', occurred_on)::date as month,
  sum(case when type = 'income' then amount else 0 end) as income,
  sum(case when type = 'expense' then amount else 0 end) as expense,
  sum(case when type = 'income' then amount else -amount end) as net
from public.transactions
where is_system_generated = false
group by household_id, owner_member_id, date_trunc('month', occurred_on)::date;
