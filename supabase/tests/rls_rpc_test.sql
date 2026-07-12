-- pgTAP: RLS の cross-household 分離 + per-member 書込強制 + confirm_balance_checkpoint RPC
begin;
select plan(27);

-- ============================================================
-- Block A: ゆるり @ main として認証
-- ============================================================
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"role":"authenticated","household_id":"main","member_id":"yururi"}',
  true
);

select is((select count(*) from public.profiles)::int, 2, 'ゆるりは 2 件の profile を閲覧できる');
select is((select count(*) from public.categories)::int, 10, 'seed カテゴリ 10 件が見える');

select lives_ok(
  $$ insert into public.transactions (household_id, owner_member_id, type, amount, category_id, occurred_on)
     values ('main', 'yururi', 'income', 1000,
             (select id from public.categories where household_id = 'main' and kind = 'income' and name = 'バイト代'),
             current_date) $$,
  'ゆるりは自分の transaction を挿入できる'
);

select is(
  (select count(*) from public.transactions where owner_member_id = 'yururi')::int,
  1,
  '挿入した transaction が見える'
);

select throws_ok(
  $$ insert into public.transactions (household_id, owner_member_id, type, amount, occurred_on)
     values ('main', 'shiyowo', 'income', 500, current_date) $$,
  null, null,
  '他人 (shiyowo) 名義の書込は RLS で拒否'
);

select throws_ok(
  $$ insert into public.transactions (household_id, owner_member_id, type, amount, occurred_on, is_system_generated)
     values ('main', 'yururi', 'income', 500, current_date, true) $$,
  null, null,
  'is_system_generated=true の直接書込は拒否 (残高調整は RPC 経由のみ)'
);

-- 取引 type とカテゴリ kind の不一致 (支出に収入カテゴリ) は拒否
select throws_ok(
  $$ insert into public.transactions (household_id, owner_member_id, type, amount, category_id, occurred_on)
     values ('main', 'yururi', 'expense', 300,
             (select id from public.categories where household_id = 'main' and kind = 'income' and name = 'バイト代'),
             current_date) $$,
  null, null,
  '取引 type とカテゴリ kind の不一致は拒否'
);

-- system カテゴリ (残高調整) を通常取引に使うのは拒否
select throws_ok(
  $$ insert into public.transactions (household_id, owner_member_id, type, amount, category_id, occurred_on)
     values ('main', 'yururi', 'expense', 300,
             (select id from public.categories where household_id = 'main' and is_system and name = '残高調整'),
             current_date) $$,
  null, null,
  'system カテゴリの通常取引利用は拒否'
);

-- system カテゴリの改変 (is_system=false 化) は RLS using で対象外 → 変更されない
update public.categories set is_system = false
where household_id = 'main' and name = '残高調整';
select is(
  (select is_system from public.categories where household_id = 'main' and name = '残高調整'),
  true,
  'system カテゴリは update ポリシーの対象外で変更されない (is_system=true のまま)'
);

-- checkpoint: confirmed の直接書込は拒否, skipped は許可
select throws_ok(
  $$ insert into public.balance_checkpoints (household_id, member_id, checkpoint_month, status)
     values ('main', 'yururi', date_trunc('month', now())::date, 'confirmed') $$,
  null, null,
  'confirmed checkpoint の直接書込は拒否 (RPC 経由のみ)'
);
select lives_ok(
  $$ insert into public.balance_checkpoints (household_id, member_id, checkpoint_month, status)
     values ('main', 'yururi', date_trunc('month', now())::date, 'skipped') $$,
  'skipped checkpoint の直接書込は許可'
);

-- subscriptions: 自分名義で挿入可 (JPY)
select lives_ok(
  $$ insert into public.subscriptions
       (household_id, owner_member_id, name, currency, original_amount, amount_jpy, cycle, next_renewal_date, status)
     values ('main', 'yururi', 'Netflix', 'JPY', 1490, 1490, 'monthly', current_date, 'active') $$,
  'サブスクを自分名義で挿入できる'
);

-- subscriptions: 相手名義(owner=shiyowo)の挿入は拒否 (RLS with check)
select throws_ok(
  $$ insert into public.subscriptions
       (household_id, owner_member_id, name, currency, original_amount, amount_jpy, cycle, next_renewal_date, status)
     values ('main', 'shiyowo', 'Spotify', 'JPY', 1280, 1280, 'monthly', current_date, 'active') $$,
  null, null,
  'サブスクを相手名義で挿入するのは拒否'
);

-- v_subscription_monthly_total: 月換算合計に反映
select is(
  (select monthly_total_jpy from public.v_subscription_monthly_total where member_id = 'yururi'),
  1490::bigint,
  'サブスク月換算合計が反映される'
);

-- 解約検討中(considering_cancel)は月換算合計から除外
select lives_ok(
  $$ insert into public.subscriptions
       (household_id, owner_member_id, name, currency, original_amount, amount_jpy, cycle, next_renewal_date, status)
     values ('main', 'yururi', 'OldService', 'JPY', 500, 500, 'monthly', current_date, 'considering_cancel') $$,
  '解約検討中サブスクを挿入できる'
);
select is(
  (select monthly_total_jpy from public.v_subscription_monthly_total where member_id = 'yururi'),
  1490::bigint,
  '解約検討中は月換算合計から除外される'
);

-- wishlist: 自分名義で挿入可, registrant_id の書換は拒否
select lives_ok(
  $$ insert into public.wishlist_items (household_id, registrant_id, genre, title)
     values ('main', 'yururi', 'want', 'テスト') $$,
  'wishlist を自分名義で挿入できる'
);
select throws_ok(
  $$ update public.wishlist_items set registrant_id = 'shiyowo'
     where household_id = 'main' and registrant_id = 'yururi' $$,
  null, null,
  'wishlist の registrant_id 変更は拒否'
);

-- ============================================================
-- Block B: 別 household からの分離
-- ============================================================
select set_config(
  'request.jwt.claims',
  '{"role":"authenticated","household_id":"other","member_id":"ghost"}',
  true
);

select is((select count(*) from public.profiles)::int, 0, '別 household は profile 0 件');
select is((select count(*) from public.categories)::int, 0, '別 household は category 0 件');
select is((select count(*) from public.transactions)::int, 0, '別 household は transaction 0 件');

-- ============================================================
-- Block C: しよを @ main で残高確認 RPC
-- ============================================================
select set_config(
  'request.jwt.claims',
  '{"role":"authenticated","household_id":"main","member_id":"shiyowo"}',
  true
);

select results_eq(
  $$ select computed, diff from public.confirm_balance_checkpoint(5000) $$,
  $$ values (0, 5000) $$,
  'confirm_balance_checkpoint: 調整前残高 0, 差額 5000'
);

select is(
  (select balance from public.v_member_balances where member_id = 'shiyowo'),
  5000::bigint,
  '残高調整後の しよを 残高 = 5000'
);

select is(
  (select count(*) from public.transactions where owner_member_id = 'shiyowo' and is_system_generated)::int,
  1,
  '残高調整 transaction が 1 件生成される'
);

-- v_monthly_summary は残高調整(system)を除外する（しよをの当月は調整のみ→行なし）
select is(
  (select count(*) from public.v_monthly_summary where member_id = 'shiyowo')::int,
  0,
  'v_monthly_summary は残高調整のみの月を集計しない (is_system_generated 除外)'
);

-- ============================================================
-- Block D: fx_rates は読取のみ
-- ============================================================
select lives_ok($$ select 1 from public.fx_rates limit 1 $$, 'fx_rates は select 可能');
select throws_ok(
  $$ insert into public.fx_rates (rate_date, rate) values (current_date, 150) $$,
  null, null,
  'fx_rates への書込は拒否 (service_role のみ)'
);

select * from finish();
rollback;
