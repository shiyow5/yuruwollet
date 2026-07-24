-- ============================================================
-- accounts: 取引の「在り処」(現金 / 銀行口座 / クレカ / PayPay など)。#98
--
-- categories と同じ household 共有・RLS・削除ガードのパターンで作る。ただし
-- **収入/支出で分けない**(銀行口座やクレカは収入の受け皿にも支出元にもなる)。
-- そのため category_kind に相当する種別列は持たない。
--
-- transactions.account_id は nullable FK (on delete restrict)。
--   - nullable: 在り処を選ばない取引・過去の取引・system 生成の残高調整/サブスクを壊さない
--   - restrict: 取引のあるアカウントは DB が削除を弾く(UI はアーカイブへ誘導)
-- ============================================================

create table public.accounts (
  id uuid primary key default gen_random_uuid(),
  household_id text not null references public.households (id) on delete cascade,
  name text not null,
  icon text,
  sort_order integer not null default 0,
  is_archived boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (household_id, name)
);
create index accounts_household_idx on public.accounts (household_id);

comment on table public.accounts is
  '取引の在り処(現金/銀行/クレカ/PayPay 等)。household 共有・収入支出で分けない。';

-- updated_at 自動更新(categories と同じ共通関数)
create trigger touch_accounts before update on public.accounts
  for each row execute function public.touch_updated_at();

-- ---- transactions に account_id を足す ----
-- 既存行は NULL(在り処未設定)。system 生成行(残高調整/サブスク)も NULL のまま。
alter table public.transactions
  add column account_id uuid references public.accounts (id) on delete restrict;
create index transactions_account_idx on public.transactions (account_id);

comment on column public.transactions.account_id is
  '在り処(accounts)。任意。未設定は NULL。';

-- ============================================================
-- RLS: household 単位で閲覧・編集(categories 相当。ただし is_system の概念なし)。
-- ============================================================
alter table public.accounts enable row level security;

create policy accounts_select on public.accounts for select to authenticated
  using (household_id = (select auth.jwt() ->> 'household_id'));
create policy accounts_insert on public.accounts for insert to authenticated
  with check (household_id = (select auth.jwt() ->> 'household_id'));
create policy accounts_update on public.accounts for update to authenticated
  using (household_id = (select auth.jwt() ->> 'household_id'))
  with check (household_id = (select auth.jwt() ->> 'household_id'));
create policy accounts_delete on public.accounts for delete to authenticated
  using (household_id = (select auth.jwt() ->> 'household_id'));

-- 新テーブルは init 時の一括 grant に含まれない(既存テーブルにしか効かない)ので明示する。
grant select, insert, update, delete on public.accounts to authenticated;
grant select, insert, update, delete on public.accounts to service_role;

-- ============================================================
-- transactions の insert/update ポリシーに account_id 検証を足す。
-- 他 household のアカウントを付けられないことを DB で保証する
-- (categories の kind/is_system 検証と同じ発想。account は種別を問わない)。
-- transactions_delete は 20260714010000 が別途管理しているので触らない。
-- ============================================================
drop policy transactions_insert on public.transactions;
create policy transactions_insert on public.transactions for insert to authenticated
  with check (
    household_id = (select auth.jwt() ->> 'household_id')
    and owner_member_id = (select auth.jwt() ->> 'member_id')
    and is_system_generated = false
    and (
      category_id is null
      or exists (
        select 1 from public.categories c
        where c.id = category_id
          and c.household_id = (select auth.jwt() ->> 'household_id')
          and c.is_system = false
          and c.kind::text = type::text
      )
    )
    and (
      account_id is null
      or exists (
        select 1 from public.accounts a
        where a.id = account_id
          and a.household_id = (select auth.jwt() ->> 'household_id')
      )
    )
  );

drop policy transactions_update on public.transactions;
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
    and (
      category_id is null
      or exists (
        select 1 from public.categories c
        where c.id = category_id
          and c.household_id = (select auth.jwt() ->> 'household_id')
          and c.is_system = false
          and c.kind::text = type::text
      )
    )
    and (
      account_id is null
      or exists (
        select 1 from public.accounts a
        where a.id = account_id
          and a.household_id = (select auth.jwt() ->> 'household_id')
      )
    )
  );

-- ============================================================
-- seed: デフォルトのアカウントテンプレート(household 'main')。
-- 冪等(on conflict do nothing)。ユーザーは設定画面で追加/リネーム/削除できる。
-- アイコンは palette.json の accounts グループから(サブセット対象)。
-- ============================================================
insert into public.accounts (household_id, name, icon, sort_order) values
  ('main', '現金', 'payments', 10),
  ('main', '銀行口座', 'account_balance', 20),
  ('main', 'クレジットカード', 'credit_card', 30),
  ('main', 'PayPay', 'qr_code_2', 40),
  ('main', '楽天ペイ', 'smartphone', 50)
on conflict (household_id, name) do nothing;
