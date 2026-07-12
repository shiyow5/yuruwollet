-- pgTAP: RLS の cross-household 分離 + per-member 書込強制 + confirm_balance_checkpoint RPC
begin;
select plan(14);

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
