-- confirm_balance_checkpoint を「同一メンバーの同時実行」に対して直列化する。
--
-- 問題: 2 つのタブ/端末で 24日の壁を開き、ほぼ同時に「はい」を押すと、
-- 両方の呼び出しが **調整前の同じ残高** から差額を計算し、残高調整取引が二重に挿入される。
-- （例: 計算 45,000 / 実際 50,000 → 両方が +5,000 を挿入し、残高が 55,000 になる）
-- checkpoint 行は upsert なので一貫するが、transactions が重複して残高が過剰調整される。
--
-- 対策: 集計の前に profiles 行を FOR UPDATE でロックする。
-- 同一メンバーの後続呼び出しは先行トランザクションのコミットを待ち、
-- **調整後の残高** で再計算するため差額 0 となり、二重の調整取引を挿入しない。
create or replace function public.confirm_balance_checkpoint(p_actual integer)
returns public.balance_checkpoints
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_household text := (auth.jwt() ->> 'household_id');
  v_member text := (auth.jwt() ->> 'member_id');
  v_month date := (date_trunc('month', (now() at time zone 'Asia/Tokyo')))::date;
  v_opening integer;
  v_computed integer;
  v_diff integer;
  v_adj_category uuid;
  v_result public.balance_checkpoints;
begin
  if v_household is null or v_member is null then
    raise exception 'missing household/member claim';
  end if;

  -- 同一メンバーの確定を直列化する（同時「はい」での二重調整を防ぐ）
  select opening_balance into v_opening
    from public.profiles
    where member_id = v_member and household_id = v_household
    for update;
  if v_opening is null then
    raise exception 'profile not found';
  end if;

  select v_opening
    + coalesce(sum(case when type = 'income' then amount else -amount end), 0)
    into v_computed
    from public.transactions
    where household_id = v_household and owner_member_id = v_member;

  v_diff := p_actual - v_computed;

  if v_diff <> 0 then
    select id into v_adj_category
      from public.categories
      where household_id = v_household and is_system = true and name = '残高調整'
      limit 1;

    insert into public.transactions (
      household_id, owner_member_id, type, amount, category_id,
      memo, occurred_on, is_system_generated
    )
    values (
      v_household,
      v_member,
      case when v_diff > 0 then 'income'::public.txn_type else 'expense'::public.txn_type end,
      abs(v_diff),
      v_adj_category,
      '残高調整（24日）',
      (now() at time zone 'Asia/Tokyo')::date,
      true
    );
  end if;

  insert into public.balance_checkpoints (
    household_id, member_id, checkpoint_month, actual, computed, diff, status
  )
  values (v_household, v_member, v_month, p_actual, v_computed, v_diff, 'confirmed')
  on conflict (household_id, member_id, checkpoint_month)
  do update set
    actual = excluded.actual,
    computed = excluded.computed,
    diff = excluded.diff,
    status = 'confirmed',
    updated_at = now()
  returning * into v_result;

  return v_result;
end;
$$;
