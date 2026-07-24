-- ============================================================
-- account_openings: 「メンバー×口座」ごとの初期残高。#102 Phase 1
--
-- accounts は #98 で household 共有(現金/銀行/クレカ…)だが、**残高はメンバー別**
-- (ゆるりの現金 ≠ しよをの現金)。よって初期残高も per (member, account) で持つ。
--
-- 総残高 = profiles.opening_balance(在り処を選ばない「未設定」分の初期残高)
--        + Σ account_openings.opening_balance(口座ごとの初期残高)
--        + Σ transactions(全取引; 収入−支出)
-- この3項の分解により、下の移行(未設定→現金へ付け替え)を挟んでも総残高は不変になる。
-- ============================================================

create table public.account_openings (
  household_id text not null references public.households (id) on delete cascade,
  member_id text not null references public.profiles (member_id) on delete cascade,
  account_id uuid not null references public.accounts (id) on delete cascade,
  opening_balance integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (member_id, account_id)
);
create index account_openings_household_idx on public.account_openings (household_id);

comment on table public.account_openings is
  'メンバー×口座 ごとの初期残高。accounts は世帯共有だが残高はメンバー別のため。#102';

-- updated_at 自動更新(categories/accounts と同じ共通関数)
create trigger touch_account_openings before update on public.account_openings
  for each row execute function public.touch_updated_at();

-- ============================================================
-- RLS: 閲覧は household 単位(相手の口座残高も見える)。書込は自分の member_id のみ。
-- 他 household の account を差し込めないことも DB で保証する。
-- ============================================================
alter table public.account_openings enable row level security;

create policy account_openings_select on public.account_openings for select to authenticated
  using (household_id = (select auth.jwt() ->> 'household_id'));

create policy account_openings_insert on public.account_openings for insert to authenticated
  with check (
    household_id = (select auth.jwt() ->> 'household_id')
    and member_id = (select auth.jwt() ->> 'member_id')
    and exists (
      select 1 from public.accounts a
      where a.id = account_id
        and a.household_id = (select auth.jwt() ->> 'household_id')
    )
  );

create policy account_openings_update on public.account_openings for update to authenticated
  using (
    household_id = (select auth.jwt() ->> 'household_id')
    and member_id = (select auth.jwt() ->> 'member_id')
  )
  with check (
    household_id = (select auth.jwt() ->> 'household_id')
    and member_id = (select auth.jwt() ->> 'member_id')
    and exists (
      select 1 from public.accounts a
      where a.id = account_id
        and a.household_id = (select auth.jwt() ->> 'household_id')
    )
  );

create policy account_openings_delete on public.account_openings for delete to authenticated
  using (
    household_id = (select auth.jwt() ->> 'household_id')
    and member_id = (select auth.jwt() ->> 'member_id')
  );

-- 新テーブルは init の一括 grant に含まれないので明示する。
grant select, insert, update, delete on public.account_openings to authenticated;
grant select, insert, update, delete on public.account_openings to service_role;

-- ============================================================
-- VIEW: 口座別残高 (per member × account)。
--   口座残高 = 口座初期残高(無ければ0) + Σ(その口座・そのメンバーの収入−支出)
-- accounts × profiles を household 内で総当たりし、初期残高と取引を左結合。
-- どのメンバーから見ても両者ぶんの全口座が出る(相手タブ用)。
-- ============================================================
create view public.v_account_balances
with (security_invoker = on) as
select
  a.household_id,
  p.member_id,
  a.id as account_id,
  a.name as account_name,
  a.icon as account_icon,
  a.is_archived,
  coalesce(o.opening_balance, 0)
  + coalesce(sum(case when t.type = 'income' then t.amount else -t.amount end), 0) as balance
from public.accounts a
join public.profiles p on p.household_id = a.household_id
left join public.account_openings o
  on o.account_id = a.id and o.member_id = p.member_id
left join public.transactions t
  on t.account_id = a.id
  and t.owner_member_id = p.member_id
  and t.household_id = a.household_id
group by a.household_id, p.member_id, a.id, a.name, a.icon, a.is_archived, o.opening_balance;

grant select on public.v_account_balances to authenticated;

-- ============================================================
-- v_member_balances を口座初期残高込みに再定義する。
-- 旧: opening_balance + Σ txns。新: opening_balance + Σ 口座初期残高 + Σ txns。
-- スカラサブクエリで集計を分離し、join 増殖(初期残高×取引の重複計上)を避ける。
-- account_openings が空(移行前/新規 household)なら旧定義と完全に一致する。
-- ============================================================
create or replace view public.v_member_balances
with (security_invoker = on) as
select
  p.household_id,
  p.member_id,
  p.display_name,
  p.opening_balance
  + coalesce((
      select sum(o.opening_balance)
      from public.account_openings o
      where o.household_id = p.household_id and o.member_id = p.member_id
    ), 0)
  + coalesce((
      select sum(case when t.type = 'income' then t.amount else -t.amount end)
      from public.transactions t
      where t.household_id = p.household_id and t.owner_member_id = p.member_id
    ), 0) as balance
from public.profiles p;

-- ============================================================
-- 本番データ移行(冪等)。導入前は「全部お財布(現金)にあった」とみなす。
--   1) 在り処未設定(account_id IS NULL)の取引 → 現金へ付け替え
--   2) profiles.opening_balance → 現金口座の(メンバー別)初期残高へ移す
--   3) 付け替えた分だけ profiles.opening_balance を 0 にする
-- 総残高は不変。移行後、現金残高 = これまでの合計(全取引が現金に集約されるため)。
-- 再実行しても on conflict do nothing と <> 0 ガードで二重計上しない。
-- ============================================================

-- 1) 未設定の「ユーザー取引」を現金へ。
--    subscription_id 付き(サブスク精算)は整合トリガが更新を弾く＆どの口座かは不明。
--    is_system_generated(残高調整)は全体残高を合わせた履歴で、特定口座に属さない。
--    どちらも「未設定」バケツに残す（総残高には従来どおり算入される）。
update public.transactions t
set account_id = a.id
from public.accounts a
where t.account_id is null
  and t.subscription_id is null
  and t.is_system_generated = false
  and a.household_id = t.household_id
  and a.name = '現金';

-- 2)+3) profiles.opening_balance を現金口座の初期残高へ移し、**実際に移した member だけ**
-- profiles を 0 にする。ここを 1 文にするのが肝。
--   - 既に現金の初期残高が手設定されている member は on conflict で insert されず
--     (returning にも出ない) → profiles も 0 にしない。手設定を残しつつ profiles の
--     金額を失わない（zero と move を切り離すと、move が空振りしても zero だけ走って
--     残高を消してしまう）。
--   - 現金口座が無い household では insert が 0 行 → 何も 0 にしない。
--   - 再実行時は 2 回目は opening=0 で対象外 → 二重計上も喪失も起きない。
with moved as (
  insert into public.account_openings (household_id, member_id, account_id, opening_balance)
  select p.household_id, p.member_id, a.id, p.opening_balance
  from public.profiles p
  join public.accounts a on a.household_id = p.household_id and a.name = '現金'
  where p.opening_balance <> 0
  on conflict (member_id, account_id) do nothing
  returning member_id
)
update public.profiles p
set opening_balance = 0
where p.member_id in (select member_id from moved);

-- ============================================================
-- 残高確認 RPC の「計算残高」を口座初期残高込みに直す。
--
-- 上の移行で opening_balance を profiles → account_openings(現金) に付け替えたため、
-- computed = profiles.opening + Σ txns のままだと、移した金額ぶんだけ計算残高が
-- 過小になり、24日の壁・手動数え直しが誤った差額を作ってしまう。
-- v_member_balances と同じ「profiles.opening + Σ account_openings + Σ txns」に揃える。
--
-- Phase 1 は全口座合算のまま(口座別の数え直しは #103/#104)。ここでは computed の
-- 定義を view と一致させるだけで、直列化(FOR UPDATE)・CAS・ガードは一切変えない。
-- ============================================================
create or replace function public.confirm_balance_checkpoint(
  p_actual integer,
  p_expected_computed integer
)
returns public.balance_checkpoints
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_household text := (auth.jwt() ->> 'household_id');
  v_member text := (auth.jwt() ->> 'member_id');
  v_today date := public.jst_today();
  v_month date := (date_trunc('month', public.jst_today()))::date;
  v_opening integer;
  v_computed integer;
  v_diff integer;
  v_adj_category uuid;
  v_result public.balance_checkpoints;
begin
  if v_household is null or v_member is null then
    raise exception 'missing household/member claim';
  end if;

  if p_actual is null or p_actual < 0 then
    raise exception 'actual balance must be a non-negative integer (got %)', p_actual
      using errcode = 'PT400';
  end if;

  if extract(day from v_today) < 24 then
    raise exception 'balance checkpoint opens on day 24 (JST today is %)', v_today
      using errcode = 'PT403';
  end if;

  select opening_balance into v_opening
    from public.profiles
    where member_id = v_member and household_id = v_household
    for update;
  if not found then
    raise exception 'profile not found';
  end if;

  perform 1
    from public.balance_checkpoints
    where household_id = v_household
      and member_id = v_member
      and checkpoint_month = v_month
      and status = 'confirmed';
  if found then
    raise exception 'balance checkpoint for % is already confirmed', v_month
      using errcode = 'PT409';
  end if;

  -- 計算残高 = 未設定分の初期残高 + 口座初期残高合計 + 全取引(収入−支出)。
  select v_opening
    + coalesce((
        select sum(o.opening_balance) from public.account_openings o
        where o.household_id = v_household and o.member_id = v_member
      ), 0)
    + coalesce(sum(case when t.type = 'income' then t.amount else -t.amount end), 0)
    into v_computed
    from public.transactions t
    where t.household_id = v_household and t.owner_member_id = v_member;

  if p_expected_computed is distinct from v_computed then
    raise exception 'balance changed (expected %, computed %)', p_expected_computed, v_computed
      using errcode = 'PT412';
  end if;

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
      v_today,
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

create or replace function public.adjust_balance_now(
  p_actual integer,
  p_expected_computed integer
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_household text := (auth.jwt() ->> 'household_id');
  v_member text := (auth.jwt() ->> 'member_id');
  v_today date := public.jst_today();
  v_opening integer;
  v_computed integer;
  v_diff integer;
  v_adj_category uuid;
begin
  if v_household is null or v_member is null then
    raise exception 'missing household/member claim';
  end if;

  if p_actual is null or p_actual < 0 then
    raise exception 'actual balance must be a non-negative integer (got %)', p_actual
      using errcode = 'PT400';
  end if;

  select opening_balance into v_opening
    from public.profiles
    where member_id = v_member and household_id = v_household
    for update;
  if not found then
    raise exception 'profile not found';
  end if;

  -- 計算残高 = 未設定分の初期残高 + 口座初期残高合計 + 全取引(収入−支出)。
  select v_opening
    + coalesce((
        select sum(o.opening_balance) from public.account_openings o
        where o.household_id = v_household and o.member_id = v_member
      ), 0)
    + coalesce(sum(case when t.type = 'income' then t.amount else -t.amount end), 0)
    into v_computed
    from public.transactions t
    where t.household_id = v_household and t.owner_member_id = v_member;

  if p_expected_computed is distinct from v_computed then
    raise exception 'balance changed (expected %, computed %)', p_expected_computed, v_computed
      using errcode = 'PT412';
  end if;

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
      '残高調整（手動）',
      v_today,
      true
    );
  end if;

  return v_diff;
end;
$$;
