-- ============================================================
-- yuruwollet 初期スキーマ (per-member モデル)
-- 認証: Cloudflare Access + Pages Function が発行する Supabase JWT。
-- RLS は auth.jwt()->>'household_id' / 'member_id' のカスタムクレームで判定
-- (Supabase Auth の auth.users には依存しない)。
-- 日付ロジックは全て JST (Asia/Tokyo)。
-- ============================================================

-- ---- ENUM 型 ----
create type public.category_kind as enum ('expense', 'income', 'system');
create type public.txn_type as enum ('income', 'expense');
create type public.sub_currency as enum ('JPY', 'USD');
create type public.sub_cycle as enum ('monthly', 'yearly');
create type public.sub_status as enum ('active', 'trial', 'considering_cancel');
create type public.wish_genre as enum ('want', 'place');
create type public.wish_status as enum ('planned', 'done');
create type public.checkpoint_status as enum ('skipped', 'confirmed');

-- ---- updated_at トリガ関数 ----
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- ============================================================
-- テーブル
-- ============================================================

-- households: 二人のテナント (1 件)
create table public.households (
  id text primary key,
  name text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- profiles: メンバー (ゆるり / しよを)。auth.users 非依存。
create table public.profiles (
  member_id text primary key,
  household_id text not null references public.households (id) on delete cascade,
  display_name text not null,
  email text unique,
  opening_balance integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index profiles_household_idx on public.profiles (household_id);

-- categories: 支出/収入/system。household 共有。
create table public.categories (
  id uuid primary key default gen_random_uuid(),
  household_id text not null references public.households (id) on delete cascade,
  kind public.category_kind not null,
  name text not null,
  icon text,
  sort_order integer not null default 0,
  is_system boolean not null default false,
  is_archived boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (household_id, kind, name)
);

-- transactions: per-member 台帳
create table public.transactions (
  id uuid primary key default gen_random_uuid(),
  household_id text not null references public.households (id) on delete cascade,
  owner_member_id text not null references public.profiles (member_id) on delete cascade,
  type public.txn_type not null,
  amount integer not null check (amount > 0),
  category_id uuid references public.categories (id) on delete restrict,
  memo text not null default '',
  occurred_on date not null,
  is_system_generated boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index transactions_owner_date_idx
  on public.transactions (household_id, owner_member_id, occurred_on desc);

-- subscriptions: per-member。多通貨 (JPY/USD)。
create table public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  household_id text not null references public.households (id) on delete cascade,
  owner_member_id text not null references public.profiles (member_id) on delete cascade,
  name text not null,
  currency public.sub_currency not null default 'JPY',
  original_amount numeric(12, 2) not null check (original_amount >= 0),
  amount_jpy integer not null check (amount_jpy >= 0),
  fx_rate numeric(14, 6),
  fx_rate_date date,
  cycle public.sub_cycle not null default 'monthly',
  next_renewal_date date not null,
  status public.sub_status not null default 'active',
  monthly_amount_jpy integer generated always as (
    case
      when cycle = 'yearly' then round(amount_jpy::numeric / 12.0)::integer
      else amount_jpy
    end
  ) stored,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint fx_fields_consistent check (
    (currency = 'JPY' and fx_rate is null and fx_rate_date is null)
    or (currency = 'USD' and fx_rate is not null and fx_rate_date is not null)
  )
);
create index subscriptions_owner_idx
  on public.subscriptions (household_id, owner_member_id);

-- wishlist_items: 共有 (二人の 1 リスト)
create table public.wishlist_items (
  id uuid primary key default gen_random_uuid(),
  household_id text not null references public.households (id) on delete cascade,
  registrant_id text not null references public.profiles (member_id) on delete cascade,
  genre public.wish_genre not null,
  title text not null,
  url text,
  memo text not null default '',
  status public.wish_status not null default 'planned',
  archived boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index wishlist_household_idx
  on public.wishlist_items (household_id, archived, created_at desc);

-- savings_goals: per-member, 月ごと
create table public.savings_goals (
  id uuid primary key default gen_random_uuid(),
  household_id text not null references public.households (id) on delete cascade,
  member_id text not null references public.profiles (member_id) on delete cascade,
  period_month date not null,
  target_amount integer not null check (target_amount >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (member_id, period_month)
);

-- balance_checkpoints: per-member, 月ごと (24日の壁)
create table public.balance_checkpoints (
  id uuid primary key default gen_random_uuid(),
  household_id text not null references public.households (id) on delete cascade,
  member_id text not null references public.profiles (member_id) on delete cascade,
  checkpoint_month date not null,
  actual integer,
  computed integer,
  diff integer,
  status public.checkpoint_status not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (household_id, member_id, checkpoint_month)
);

-- fx_rates: 日次 USD/JPY キャッシュ (グローバル参照, service_role 書込)
create table public.fx_rates (
  rate_date date not null,
  base text not null default 'USD',
  quote text not null default 'JPY',
  rate numeric(14, 6) not null check (rate > 0),
  created_at timestamptz not null default now(),
  primary key (rate_date, base, quote)
);

-- ---- updated_at トリガ ----
create trigger touch_households before update on public.households
  for each row execute function public.touch_updated_at();
create trigger touch_profiles before update on public.profiles
  for each row execute function public.touch_updated_at();
create trigger touch_categories before update on public.categories
  for each row execute function public.touch_updated_at();
create trigger touch_transactions before update on public.transactions
  for each row execute function public.touch_updated_at();
create trigger touch_subscriptions before update on public.subscriptions
  for each row execute function public.touch_updated_at();
create trigger touch_wishlist before update on public.wishlist_items
  for each row execute function public.touch_updated_at();
create trigger touch_savings before update on public.savings_goals
  for each row execute function public.touch_updated_at();
create trigger touch_checkpoints before update on public.balance_checkpoints
  for each row execute function public.touch_updated_at();

-- ---- system カテゴリ削除ガード ----
create or replace function public.guard_system_category()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.is_system then
    raise exception 'system category cannot be deleted';
  end if;
  return old;
end;
$$;
create trigger guard_system_category before delete on public.categories
  for each row execute function public.guard_system_category();

-- ============================================================
-- RLS
-- クレーム: auth.jwt()->>'household_id' / 'member_id'
-- SELECT は household 単位 (両メンバーが全行可視 → 相手タブ)。
-- 書込は owner/registrant = member_id を強制。
-- ============================================================

alter table public.households enable row level security;
alter table public.profiles enable row level security;
alter table public.categories enable row level security;
alter table public.transactions enable row level security;
alter table public.subscriptions enable row level security;
alter table public.wishlist_items enable row level security;
alter table public.savings_goals enable row level security;
alter table public.balance_checkpoints enable row level security;
alter table public.fx_rates enable row level security;

-- households
create policy households_select on public.households for select to authenticated
  using (id = (select auth.jwt() ->> 'household_id'));

-- profiles
create policy profiles_select on public.profiles for select to authenticated
  using (household_id = (select auth.jwt() ->> 'household_id'));
create policy profiles_update_own on public.profiles for update to authenticated
  using (
    household_id = (select auth.jwt() ->> 'household_id')
    and member_id = (select auth.jwt() ->> 'member_id')
  )
  with check (
    household_id = (select auth.jwt() ->> 'household_id')
    and member_id = (select auth.jwt() ->> 'member_id')
  );

-- categories (共有)
create policy categories_select on public.categories for select to authenticated
  using (household_id = (select auth.jwt() ->> 'household_id'));
create policy categories_insert on public.categories for insert to authenticated
  with check (household_id = (select auth.jwt() ->> 'household_id') and is_system = false);
create policy categories_update on public.categories for update to authenticated
  using (household_id = (select auth.jwt() ->> 'household_id'))
  with check (household_id = (select auth.jwt() ->> 'household_id'));
create policy categories_delete on public.categories for delete to authenticated
  using (household_id = (select auth.jwt() ->> 'household_id') and is_system = false);

-- transactions (per-member 書込, household 閲覧)
create policy transactions_select on public.transactions for select to authenticated
  using (household_id = (select auth.jwt() ->> 'household_id'));
create policy transactions_insert on public.transactions for insert to authenticated
  with check (
    household_id = (select auth.jwt() ->> 'household_id')
    and owner_member_id = (select auth.jwt() ->> 'member_id')
    and is_system_generated = false
  );
create policy transactions_update on public.transactions for update to authenticated
  using (
    household_id = (select auth.jwt() ->> 'household_id')
    and owner_member_id = (select auth.jwt() ->> 'member_id')
    and is_system_generated = false
  )
  with check (
    household_id = (select auth.jwt() ->> 'household_id')
    and owner_member_id = (select auth.jwt() ->> 'member_id')
    and is_system_generated = false
  );
create policy transactions_delete on public.transactions for delete to authenticated
  using (
    household_id = (select auth.jwt() ->> 'household_id')
    and owner_member_id = (select auth.jwt() ->> 'member_id')
    and is_system_generated = false
  );

-- subscriptions (per-member)
create policy subscriptions_select on public.subscriptions for select to authenticated
  using (household_id = (select auth.jwt() ->> 'household_id'));
create policy subscriptions_insert on public.subscriptions for insert to authenticated
  with check (
    household_id = (select auth.jwt() ->> 'household_id')
    and owner_member_id = (select auth.jwt() ->> 'member_id')
  );
create policy subscriptions_update on public.subscriptions for update to authenticated
  using (
    household_id = (select auth.jwt() ->> 'household_id')
    and owner_member_id = (select auth.jwt() ->> 'member_id')
  )
  with check (
    household_id = (select auth.jwt() ->> 'household_id')
    and owner_member_id = (select auth.jwt() ->> 'member_id')
  );
create policy subscriptions_delete on public.subscriptions for delete to authenticated
  using (
    household_id = (select auth.jwt() ->> 'household_id')
    and owner_member_id = (select auth.jwt() ->> 'member_id')
  );

-- wishlist_items (共有: 挿入者は自分, 更新/削除は household 内で可)
create policy wishlist_select on public.wishlist_items for select to authenticated
  using (household_id = (select auth.jwt() ->> 'household_id'));
create policy wishlist_insert on public.wishlist_items for insert to authenticated
  with check (
    household_id = (select auth.jwt() ->> 'household_id')
    and registrant_id = (select auth.jwt() ->> 'member_id')
  );
create policy wishlist_update on public.wishlist_items for update to authenticated
  using (household_id = (select auth.jwt() ->> 'household_id'))
  with check (household_id = (select auth.jwt() ->> 'household_id'));
create policy wishlist_delete on public.wishlist_items for delete to authenticated
  using (household_id = (select auth.jwt() ->> 'household_id'));

-- savings_goals (per-member)
create policy savings_select on public.savings_goals for select to authenticated
  using (household_id = (select auth.jwt() ->> 'household_id'));
create policy savings_insert on public.savings_goals for insert to authenticated
  with check (
    household_id = (select auth.jwt() ->> 'household_id')
    and member_id = (select auth.jwt() ->> 'member_id')
  );
create policy savings_update on public.savings_goals for update to authenticated
  using (
    household_id = (select auth.jwt() ->> 'household_id')
    and member_id = (select auth.jwt() ->> 'member_id')
  )
  with check (
    household_id = (select auth.jwt() ->> 'household_id')
    and member_id = (select auth.jwt() ->> 'member_id')
  );
create policy savings_delete on public.savings_goals for delete to authenticated
  using (
    household_id = (select auth.jwt() ->> 'household_id')
    and member_id = (select auth.jwt() ->> 'member_id')
  );

-- balance_checkpoints (per-member; confirm は RPC, skip は直接 upsert)
create policy checkpoints_select on public.balance_checkpoints for select to authenticated
  using (household_id = (select auth.jwt() ->> 'household_id'));
create policy checkpoints_insert on public.balance_checkpoints for insert to authenticated
  with check (
    household_id = (select auth.jwt() ->> 'household_id')
    and member_id = (select auth.jwt() ->> 'member_id')
  );
create policy checkpoints_update on public.balance_checkpoints for update to authenticated
  using (
    household_id = (select auth.jwt() ->> 'household_id')
    and member_id = (select auth.jwt() ->> 'member_id')
  )
  with check (
    household_id = (select auth.jwt() ->> 'household_id')
    and member_id = (select auth.jwt() ->> 'member_id')
  );

-- fx_rates (認証ユーザは読み取りのみ; 書込は service_role が RLS バイパス)
create policy fx_rates_select on public.fx_rates for select to authenticated
  using (true);

-- ============================================================
-- 権限 (RLS がゲートするため authenticated に付与)
-- ============================================================
grant usage on schema public to authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;

-- ============================================================
-- RPC: 24日の残高確認 (per-member, 原子的)
-- computed(調整前) を算出し、差額があれば残高調整 tx を挿入、checkpoint を upsert。
-- ============================================================
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

  select opening_balance into v_opening
    from public.profiles
    where member_id = v_member and household_id = v_household;
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

revoke all on function public.confirm_balance_checkpoint(integer) from public;
grant execute on function public.confirm_balance_checkpoint(integer) to authenticated;

-- ============================================================
-- 集計 VIEW (security_invoker=on → RLS 準拠。member 別に集計)
-- ============================================================

-- member 別の現在残高 (全期間累積, 残高調整含む)
create view public.v_member_balances
with (security_invoker = on) as
select
  p.household_id,
  p.member_id,
  p.display_name,
  p.opening_balance
  + coalesce(sum(case when t.type = 'income' then t.amount else -t.amount end), 0) as balance
from public.profiles p
left join public.transactions t
  on t.household_id = p.household_id and t.owner_member_id = p.member_id
group by p.household_id, p.member_id, p.display_name, p.opening_balance;

-- member×月 の収入/支出/純増
create view public.v_monthly_summary
with (security_invoker = on) as
select
  household_id,
  owner_member_id as member_id,
  date_trunc('month', occurred_on)::date as month,
  sum(case when type = 'income' then amount else 0 end) as income,
  sum(case when type = 'expense' then amount else 0 end) as expense,
  sum(case when type = 'income' then amount else -amount end) as net
from public.transactions
group by household_id, owner_member_id, date_trunc('month', occurred_on)::date;

-- member×月×カテゴリ の支出/収入 (残高調整は除外)
create view public.v_category_breakdown
with (security_invoker = on) as
select
  t.household_id,
  t.owner_member_id as member_id,
  date_trunc('month', t.occurred_on)::date as month,
  t.category_id,
  c.name as category_name,
  c.icon as category_icon,
  t.type,
  sum(t.amount) as total
from public.transactions t
left join public.categories c on c.id = t.category_id
where t.is_system_generated = false
group by
  t.household_id, t.owner_member_id, date_trunc('month', t.occurred_on)::date,
  t.category_id, c.name, c.icon, t.type;

-- member 別のサブスク月換算合計 (解約検討中は除外)
create view public.v_subscription_monthly_total
with (security_invoker = on) as
select
  household_id,
  owner_member_id as member_id,
  coalesce(sum(monthly_amount_jpy) filter (where status <> 'considering_cancel'), 0) as monthly_total_jpy
from public.subscriptions
group by household_id, owner_member_id;

-- member×月 の貯金進捗 (残高調整を除外した純増 vs 目標)
create view public.v_savings_progress
with (security_invoker = on) as
select
  g.household_id,
  g.member_id,
  g.period_month,
  g.target_amount,
  coalesce(s.saved, 0) as saved,
  (coalesce(s.saved, 0) >= g.target_amount) as achieved
from public.savings_goals g
left join lateral (
  select sum(case when t.type = 'income' then t.amount else -t.amount end) as saved
  from public.transactions t
  where t.household_id = g.household_id
    and t.owner_member_id = g.member_id
    and t.is_system_generated = false
    and date_trunc('month', t.occurred_on)::date = g.period_month
) s on true;

grant select on public.v_member_balances to authenticated;
grant select on public.v_monthly_summary to authenticated;
grant select on public.v_category_breakdown to authenticated;
grant select on public.v_subscription_monthly_total to authenticated;
grant select on public.v_savings_progress to authenticated;
