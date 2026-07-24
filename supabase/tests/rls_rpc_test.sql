-- pgTAP: RLS の cross-household 分離 + per-member 書込強制 + confirm_balance_checkpoint RPC
begin;
select plan(149);

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
select is((select count(*) from public.categories)::int, 11, 'seed カテゴリ 11 件が見える（サブスク追加）');
select is((select count(*) from public.accounts)::int, 5, 'seed アカウント 5 件が見える（#98）');

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

-- USD で fx_rate/fx_rate_date 欠落は fx_fields_consistent 制約で拒否
select throws_ok(
  $$ insert into public.subscriptions
       (household_id, owner_member_id, name, currency, original_amount, amount_jpy, cycle, next_renewal_date, status)
     values ('main', 'yururi', 'ChatGPT', 'USD', 20, 3000, 'monthly', current_date, 'active') $$,
  null, null,
  'USD で fx フィールド欠落は拒否 (fx_fields_consistent)'
);

-- JPY に fx を混入するのも拒否
select throws_ok(
  $$ insert into public.subscriptions
       (household_id, owner_member_id, name, currency, original_amount, amount_jpy, fx_rate, fx_rate_date, cycle, next_renewal_date, status)
     values ('main', 'yururi', 'BadJPY', 'JPY', 1000, 1000, 150, current_date, 'monthly', current_date, 'active') $$,
  null, null,
  'JPY に fx を混入するのは拒否 (fx_fields_consistent)'
);

-- yearly の生成列 monthly_amount_jpy = round(amount_jpy/12)
insert into public.subscriptions
  (household_id, owner_member_id, name, currency, original_amount, amount_jpy, cycle, next_renewal_date, status)
values ('main', 'yururi', 'YearlyPlan', 'JPY', 12000, 12000, 'yearly', current_date, 'active');
select is(
  (select monthly_amount_jpy from public.subscriptions where household_id = 'main' and name = 'YearlyPlan'),
  1000,
  'yearly の月換算生成列 = round(amount_jpy/12)'
);

-- 本来の課金日(anchor) は挿入時に next_renewal_date の日から自動で入る。
-- **未来日を使う。** ここは jst_today() 差し替え前（実 CI 日付）なので、過去日にすると
-- #65 の下限ガード(guard_renewal_floor)に弾かれる。anchor は日(31/10)だけを見るので年は任意。
insert into public.subscriptions
  (household_id, owner_member_id, name, currency, original_amount, amount_jpy, cycle, next_renewal_date, status)
values ('main', 'yururi', 'MonthEnd', 'JPY', 800, 800, 'monthly', date '2027-01-31', 'active');
select is(
  (select renewal_anchor_day from public.subscriptions where name = 'MonthEnd'),
  31::smallint,
  '本来の課金日は next_renewal_date の日から自動で入る'
);

-- ユーザーが課金日を変えたら anchor も追随する
update public.subscriptions set next_renewal_date = date '2027-02-10' where name = 'MonthEnd';
select is(
  (select renewal_anchor_day from public.subscriptions where name = 'MonthEnd'),
  10::smallint,
  'ユーザーが課金日を変えたら本来の課金日も変わる'
);

-- savings_goals: 自分名義のみ書込可
select lives_ok(
  $$ insert into public.savings_goals (household_id, member_id, period_month, target_amount)
     values ('main', 'yururi', date_trunc('month', now())::date, 30000) $$,
  '目標貯金を自分名義で設定できる'
);
select throws_ok(
  $$ insert into public.savings_goals (household_id, member_id, period_month, target_amount)
     values ('main', 'shiyowo', date_trunc('month', now())::date, 50000) $$,
  null, null,
  '目標貯金を相手名義で設定するのは拒否'
);

-- v_savings_progress: 達成判定は「その人の今月の 収入 − 支出 ≥ 目標」
-- Block A で 1000 の収入(バイト代)を当月に入れている
select is(
  (select saved from public.v_savings_progress where member_id = 'yururi'),
  1000::bigint,
  '今月の貯金額 = 収入 − 支出'
);
select is(
  (select achieved from public.v_savings_progress where member_id = 'yururi'),
  false,
  '目標 30000 に対し 1000 なら未達成'
);

-- 残高調整(is_system_generated)は貯金額に含めない
-- （24日の壁で実残高に合わせただけの行を「貯金した」と数えない）
select lives_ok(
  $$ update public.savings_goals set target_amount = 1000
     where member_id = 'yururi' $$,
  '自分の目標額は更新できる'
);
select is(
  (select achieved from public.v_savings_progress where member_id = 'yururi'),
  true,
  '目標 1000 に対し 1000 なら達成'
);

-- 初期残高は自分の分だけ更新できる
select lives_ok(
  $$ update public.profiles set opening_balance = 50000 where member_id = 'yururi' $$,
  '自分の初期残高は更新できる'
);
select is(
  (select opening_balance from public.profiles where member_id = 'yururi'),
  50000,
  '初期残高が更新されている'
);
-- 相手の行は update ポリシーの using に一致しない → 対象外なので変更されない
update public.profiles set opening_balance = 99999 where member_id = 'shiyowo';
select is(
  (select opening_balance from public.profiles where member_id = 'shiyowo'),
  0,
  '相手の初期残高は変更されない (update ポリシーの対象外)'
);
select is(
  (select balance from public.v_member_balances where member_id = 'yururi'),
  51000::bigint,
  '残高 = 初期残高 + 収支（初期残高の変更が残高に効く）'
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
select is((select count(*) from public.accounts)::int, 0, '別 household は accounts 0 件（#98）');
select is((select count(*) from public.transactions)::int, 0, '別 household は transaction 0 件');
-- wishlist は household 共有だが、別 household からは見えない（Realtime も RLS に従う）
select is((select count(*) from public.wishlist_items)::int, 0, '別 household は wishlist 0 件');

-- ============================================================
-- Block C: しよを @ main で残高確認 RPC
-- ============================================================
-- RPC は「今日(JST)」を public.jst_today() 経由で読む。テストではこの関数を
-- GUC 参照に差し替えて日付を偽装する (本番コードに注入経路を持たせないためのシーム)。
-- DDL も transaction 内なので rollback で元に戻る。
reset role;
create or replace function public.jst_today() returns date language sql stable as
  $$ select current_setting('test.today')::date $$;
set local role authenticated;

select set_config(
  'request.jwt.claims',
  '{"role":"authenticated","household_id":"main","member_id":"shiyowo"}',
  true
);

-- 24日より前は確定できない (端末時計を進めても当月を早期 confirmed にできない)
select set_config('test.today', '2026-07-13', true);
select throws_ok(
  $$ select public.confirm_balance_checkpoint(5000, 0) $$,
  'PT403', null,
  'confirm_balance_checkpoint: 24日より前は拒否 (サーバ時刻でガード)'
);

select set_config('test.today', '2026-07-24', true);

-- 引数の検証: UI を迂回した呼び出しでもあり得ない実残高は confirmed にしない
select throws_ok(
  $$ select public.confirm_balance_checkpoint(null::integer, 0) $$,
  'PT400', null,
  'confirm_balance_checkpoint: actual = null は拒否'
);
select throws_ok(
  $$ select public.confirm_balance_checkpoint(-1, 0) $$,
  'PT400', null,
  'confirm_balance_checkpoint: actual < 0 は拒否'
);

-- 台帳の書込は profiles の SHARE ロックを取り、確定 (FOR UPDATE) と直列化される
select has_trigger(
  'public', 'transactions', 'lock_owner_profile_on_write',
  '台帳の書込は owner の profiles 行をロックし、残高確定と直列化される'
);

-- CAS: ユーザーが見た「アプリの計算」と現在の計算残高が食い違えば拒否
select throws_ok(
  $$ select public.confirm_balance_checkpoint(9999, 12345) $$,
  'PT412', null,
  'confirm_balance_checkpoint: expected_computed 不一致は拒否 (stale)'
);
select is(
  (select count(*) from public.transactions where owner_member_id = 'shiyowo' and is_system_generated)::int,
  0,
  'stale な確定では残高調整 transaction を挿入しない'
);

select results_eq(
  $$ select computed, diff from public.confirm_balance_checkpoint(5000, 0) $$,
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

-- 確定済みの月は再確定できない (別タブからの二重確定で調整が重複しない)
select throws_ok(
  $$ select public.confirm_balance_checkpoint(6000, 5000) $$,
  'PT409', null,
  'confirm_balance_checkpoint: 確定済みの月は拒否 (冪等)'
);
select is(
  (select count(*) from public.transactions where owner_member_id = 'shiyowo' and is_system_generated)::int,
  1,
  '確定済みの月への再確定では残高調整 transaction が増えない'
);

-- 差額マイナス: 実際 3000 < 計算 5000 → 支出として残高調整
select set_config('test.today', '2026-08-24', true);
select results_eq(
  $$ select computed, diff from public.confirm_balance_checkpoint(3000, 5000) $$,
  $$ values (5000, -2000) $$,
  'confirm_balance_checkpoint: 計算 5000 / 実際 3000 → 差額 -2000'
);
select is(
  (select balance from public.v_member_balances where member_id = 'shiyowo'),
  3000::bigint,
  'マイナス差額の調整後 しよを 残高 = 3000'
);
select is(
  (select count(*) from public.transactions where owner_member_id = 'shiyowo' and is_system_generated)::int,
  2,
  'マイナス差額でも残高調整 transaction が生成される (計2件)'
);

-- 差額 0: 取引は挿入しない (amount > 0 制約に抵触させない)
select set_config('test.today', '2026-09-24', true);
select results_eq(
  $$ select computed, diff from public.confirm_balance_checkpoint(3000, 3000) $$,
  $$ values (3000, 0) $$,
  'confirm_balance_checkpoint: 差額 0'
);
select is(
  (select count(*) from public.transactions where owner_member_id = 'shiyowo' and is_system_generated)::int,
  2,
  '差額 0 のときは残高調整 transaction を挿入しない'
);

-- checkpoint は member×月 で 1 行 (同月の再確定では増えず、月ごとに 1 行)
select is(
  (select count(*) from public.balance_checkpoints where member_id = 'shiyowo')::int,
  3,
  'checkpoint は member×月 で 1 行 (7/8/9月の 3 行)'
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
-- wishlist は Realtime で配信する（publication 未登録だと postgres_changes が一切飛ばない）
select is(
  (select count(*)::int from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'wishlist_items'),
  1,
  'wishlist_items は supabase_realtime publication に含まれる'
);

-- replica identity full が無いと DELETE の old レコードが主キーのみになり、
-- household_id フィルタに一致せず削除イベントを受け取れない
select is(
  (select relreplident from pg_class where oid = 'public.wishlist_items'::regclass),
  'f'::"char",
  'wishlist_items は replica identity full（DELETE の old に household_id が乗る）'
);

-- ============================================================
-- Block E: cron (service_role) のロールフォワードは本来の課金日を壊さない
--          + サブスクの支払いを台帳に記録する
-- ============================================================
-- サブスクの支払いは **実際の支出** なので is_system_generated にしない。
-- （残高調整と違い、カテゴリ別グラフ・月次収支・目標貯金の判定に含めるべきもの）
select is(
  (select is_system from public.categories where household_id = 'main' and name = 'サブスク'),
  false,
  'サブスクは通常の支出カテゴリ（集計から除外しない）'
);

-- ユーザーが subscription_id 付きの取引を作れてしまうと、
-- cron の冪等キー (subscription_id, occurred_on) と衝突してその月の自動記録が失敗する
select throws_ok(
  $$ insert into public.transactions (household_id, owner_member_id, type, amount, occurred_on, subscription_id)
     values ('main', 'yururi', 'expense', 500, current_date,
             (select id from public.subscriptions where name = 'Netflix')) $$,
  'PT403', null,
  'subscription_id 付きの取引はユーザーが作れない（cron 専用）'
);

-- cron が丸めた日 (2/28) を anchor に付け直してしまうと、以後ずっと 28 日課金に化ける。
-- service_role の更新では anchor を保持しなければならない。
reset role;
set local role service_role;

-- 1/31 課金 (anchor=31) を作り、cron が 2/28 へ丸めて進めた体で更新する
insert into public.subscriptions
  (household_id, owner_member_id, name, currency, original_amount, amount_jpy, cycle, next_renewal_date, status)
values ('main', 'shiyowo', 'CronRoll', 'JPY', 500, 500, 'monthly', date '2026-01-31', 'active');

update public.subscriptions
  set next_renewal_date = date '2026-02-28'
  where name = 'CronRoll';

select is(
  (select renewal_anchor_day from public.subscriptions where name = 'CronRoll'),
  31::smallint,
  'cron のロールフォワードでは本来の課金日 (31) を保持する（28 日に化けない）'
);

-- cron はサブスクの支払いを支出として台帳に記録できる
select lives_ok(
  $$ insert into public.transactions
       (household_id, owner_member_id, type, amount, category_id, memo, occurred_on, subscription_id)
     values ('main', 'shiyowo', 'expense', 500,
             (select id from public.categories where household_id = 'main' and name = 'サブスク'),
             'CronRoll', date '2026-01-31',
             (select id from public.subscriptions where name = 'CronRoll')) $$,
  'cron はサブスクの支払いを支出として記録できる'
);

-- **二重計上をアプリのロジックに頼らない。**
-- cron は再実行されうるし、複数期ぶん遅れて追いつくこともある。DB が弾く。
select throws_ok(
  $$ insert into public.transactions
       (household_id, owner_member_id, type, amount, category_id, occurred_on, subscription_id)
     values ('main', 'shiyowo', 'expense', 500,
             (select id from public.categories where household_id = 'main' and name = 'サブスク'),
             date '2026-01-31',
             (select id from public.subscriptions where name = 'CronRoll')) $$,
  '23505', null,
  '同じサブスクの同じ更新日を二重に記録できない（unique 制約）'
);

-- 別の更新日なら記録できる（翌月ぶん）
select lives_ok(
  $$ insert into public.transactions
       (household_id, owner_member_id, type, amount, category_id, occurred_on, subscription_id)
     values ('main', 'shiyowo', 'expense', 500,
             (select id from public.categories where household_id = 'main' and name = 'サブスク'),
             date '2026-02-28',
             (select id from public.subscriptions where name = 'CronRoll')) $$,
  '別の更新日ぶんは記録できる'
);

reset role;
set local role authenticated;

select lives_ok($$ select 1 from public.fx_rates limit 1 $$, 'fx_rates は select 可能');
select throws_ok(
  $$ insert into public.fx_rates (rate_date, rate) values (current_date, 150) $$,
  null, null,
  'fx_rates への書込は拒否 (service_role のみ)'
);

-- ============================================================
-- Block F: cron が作った支払いをユーザーが壊せない
-- ============================================================
-- cron の行は is_system_generated=false（実支出なので集計に含める）なので、
-- 何も手当てしないと通常の取引として編集・削除できてしまう。
-- 更新日は既に進んでいるため、消されると **二度と復活しない**。
reset role;
set local role service_role;

-- 収入カテゴリにも「サブスク」を作る。
-- categories は (household_id, kind, name) で一意なので **これは作れてしまう**。
-- 名前だけでカテゴリを引いていると、支出が収入カテゴリで記録される。
insert into public.categories (household_id, kind, name, sort_order)
values ('main', 'income', 'サブスク', 90);

-- 2 ヶ月遅れのサブスク（精算すると 3 回ぶん記録される）
insert into public.subscriptions
  (household_id, owner_member_id, name, currency, original_amount, amount_jpy, cycle, next_renewal_date, status)
values ('main', 'yururi', 'GuardSub', 'JPY', 1200, 1200, 'monthly',
        (public.jst_today() - interval '2 months')::date, 'active');

select ok(
  (select recorded from public.settle_subscription(
     (select id from public.subscriptions where name = 'GuardSub'))) = 3,
  '2 ヶ月遅れなら 3 回ぶん記録する'
);

-- 同名の収入カテゴリがあっても、支出は必ず **支出カテゴリ** で記録される
select is(
  (select distinct c.kind::text
     from public.transactions t join public.categories c on c.id = t.category_id
    where t.subscription_id = (select id from public.subscriptions where name = 'GuardSub')),
  'expense',
  '同名の収入カテゴリを引かない（kind まで絞る）'
);

reset role;
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"role":"authenticated","household_id":"main","member_id":"yururi"}',
  true
);

-- cron が作った支払いをユーザーが消せると、更新日は既に進んでいるため二度と復活しない
delete from public.transactions
  where subscription_id = (select id from public.subscriptions where name = 'GuardSub');
select is(
  (select count(*)::int from public.transactions
     where subscription_id = (select id from public.subscriptions where name = 'GuardSub')),
  3,
  'ユーザーは cron が作った支払いを削除できない'
);

-- **subscription_id を外して「ただの取引」に化けさせる経路も塞ぐ。**
-- 旧トリガは new.subscription_id しか見ていなかったので、null を書き込む UPDATE は
-- 素通りし、その後は削除ポリシー (subscription_id is null) もすり抜けて消せた。
select throws_ok(
  $$ update public.transactions set subscription_id = null
      where subscription_id = (select id from public.subscriptions where name = 'GuardSub') $$,
  'PT403', null,
  'ユーザーは cron の支払いから subscription_id を外せない'
);
select throws_ok(
  $$ update public.transactions set amount = 1
      where subscription_id = (select id from public.subscriptions where name = 'GuardSub') $$,
  'PT403', null,
  'ユーザーは cron の支払いの金額を書き換えられない'
);

-- ただしサブスク本体を削除したら、支払いは「ただの支出」として残り、通常どおり扱える。
-- （実際に使ったお金なので履歴からは消さない。FK の on delete set null）
select lives_ok(
  $$ delete from public.subscriptions where name = 'GuardSub' $$,
  'サブスク本体は削除できる（支払い履歴の FK set null がトリガに弾かれない）'
);
select is(
  (select count(*)::int from public.transactions
     where owner_member_id = 'yururi' and memo = 'GuardSub' and subscription_id is null),
  3,
  'サブスクを消しても支払い履歴は「ただの支出」として残る'
);

-- ふつうの取引は今までどおり削除できる（削除ポリシーを締めすぎていない）
insert into public.transactions (household_id, owner_member_id, type, amount, occurred_on)
values ('main', 'yururi', 'expense', 300, current_date);
delete from public.transactions
  where owner_member_id = 'yururi' and amount = 300 and subscription_id is null;
select is(
  (select count(*)::int from public.transactions
     where owner_member_id = 'yururi' and amount = 300 and subscription_id is null),
  0,
  'サブスク由来でない取引はこれまでどおり削除できる'
);

-- ============================================================
-- Block G: anchor が null のサブスクでも CAS が通る
-- ============================================================
-- renewal_anchor_day は nullable。Go 側は null を 0 (int のゼロ値) として受け取るので、
-- RPC が null と 0 を別物として扱うと CAS が **常に不一致** になり、
-- そのサブスクは永久に進まない（支払いも記録されない）。
reset role;
set local role service_role;

insert into public.subscriptions
  (household_id, owner_member_id, name, currency, original_amount, amount_jpy, cycle, next_renewal_date, status)
values ('main', 'shiyowo', 'NullAnchor', 'JPY', 800, 800, 'monthly', date '2026-06-05', 'active');

-- 通常はトリガが必ず埋めるので null にはならない。
-- ここではトリガを一時停止して「万一 null が残った行」を作る
-- （20260713060000 が明示的に想定しているケース）。
reset role;
alter table public.subscriptions disable trigger set_renewal_anchor_on_write;
update public.subscriptions set renewal_anchor_day = null where name = 'NullAnchor';
alter table public.subscriptions enable trigger set_renewal_anchor_on_write;
set local role service_role;

select is(
  (select renewal_anchor_day from public.subscriptions where name = 'NullAnchor'),
  null::smallint,
  'anchor が null の行を用意した'
);

-- anchor が null でも精算できる（next_renewal_after が current の日にフォールバックする）
select ok(
  (select recorded from public.settle_subscription(
     (select id from public.subscriptions where name = 'NullAnchor'))) > 0,
  'anchor が null のサブスクでも精算できる'
);
select ok(
  (select count(*) from public.transactions
     where subscription_id = (select id from public.subscriptions where name = 'NullAnchor')) > 0,
  'anchor が null のサブスクでも支払いが記録される'
);

-- ============================================================
-- Block H: next_renewal_after（Go の renewal.Next と同じ規則であること）
-- ============================================================
-- ロールフォワードの計算は **ここ（SQL）にしか無い**。cron もクライアントも同じ関数を通る。
-- 2 箇所に同じ規則があるとズレ、next_renewal_date の食い違いが二重計上や欠落に直結するため、
-- Go 側の実装（旧 internal/renewal）は削除した。ケース表はそこから移してきたもの。
reset role;

select is(public.next_renewal_after(date '2026-07-10', 'monthly', 10), date '2026-08-10',
          'monthly 通常');
select is(public.next_renewal_after(date '2026-12-15', 'monthly', 15), date '2027-01-15',
          'monthly 年またぎ');
select is(public.next_renewal_after(date '2026-07-10', 'yearly', 10), date '2027-07-10',
          'yearly 通常');

-- 単純な「1ヶ月足す」だと 1/31 が 3/3 に繰り上がり、1 回のロールで 2 ヶ月進んでしまう
select is(public.next_renewal_after(date '2026-01-31', 'monthly', 31), date '2026-02-28',
          '月末: 1/31 → 2/28');
select is(public.next_renewal_after(date '2028-01-31', 'monthly', 31), date '2028-02-29',
          '月末: うるう年は 2/29');
select is(public.next_renewal_after(date '2026-03-31', 'monthly', 31), date '2026-04-30',
          '月末: 3/31 → 4/30');

-- anchor を持つ理由。丸めた 2/28 を次の基準にすると 3/28 に化けるが、
-- 本来の課金日 (31) を保持していれば 3/31 に戻る
select is(public.next_renewal_after(date '2026-02-28', 'monthly', 31), date '2026-03-31',
          '丸めた翌月は本来の課金日に戻る: 2/28(anchor31) → 3/31');
select is(public.next_renewal_after(date '2026-02-28', 'monthly', 30), date '2026-03-30',
          'anchor 30: 2/28 → 3/30');

select is(public.next_renewal_after(date '2028-02-29', 'yearly', 29), date '2029-02-28',
          'yearly 2/29 → 翌年 2/28');
select is(public.next_renewal_after(date '2027-02-28', 'yearly', 29), date '2028-02-29',
          'yearly 2/28(anchor29) → うるう年は 2/29 に戻る');

-- anchor 未設定（既存行）は current の日をそのまま使う
select is(public.next_renewal_after(date '2026-07-10', 'monthly', 0), date '2026-08-10',
          'anchor 0 は current の日を使う');

-- ============================================================
-- Block I: settle_subscription（更新日が到来済みなら即座に台帳へ）
-- ============================================================
-- これまで支払いの記録は cron だけだったので、更新日が今日/過去のサブスクを登録しても
-- 次の cron（JST 00:00）まで台帳に出なかった。登録した本人には「効いていない」ように見える。
reset role;
set local role service_role;

-- 為替レートを用意（USD の精算に要る）
insert into public.fx_rates (rate_date, base, quote, rate)
values (public.jst_today() - 1, 'USD', 'JPY', 150)
on conflict do nothing;

-- 更新日が「今日」の JPY サブスク
insert into public.subscriptions
  (household_id, owner_member_id, name, currency, original_amount, amount_jpy, cycle, next_renewal_date, status)
values ('main', 'yururi', 'SettleToday', 'JPY', 1000, 1000, 'monthly', public.jst_today(), 'active');

-- 更新日が「未来」の JPY サブスク（まだ課金されていないので出てはいけない）
insert into public.subscriptions
  (household_id, owner_member_id, name, currency, original_amount, amount_jpy, cycle, next_renewal_date, status)
values ('main', 'yururi', 'SettleFuture', 'JPY', 2000, 2000, 'monthly', public.jst_today() + 10, 'active');

-- 相手（shiyowo）のサブスク。ゆるりからは精算できてはいけない
insert into public.subscriptions
  (household_id, owner_member_id, name, currency, original_amount, amount_jpy, cycle, next_renewal_date, status)
values ('main', 'shiyowo', 'SettleOther', 'JPY', 3000, 3000, 'monthly', public.jst_today(), 'active');

reset role;
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"role":"authenticated","household_id":"main","member_id":"yururi"}',
  true
);

-- 自分の到来済みサブスクだけが精算される
-- （先行ブロックが更新日=今日のサブスクを複数作っているので、総数ではなく個別に見る）
select ok(public.settle_my_subscriptions() > 0, '到来済みのサブスクを精算する');

select is(
  (select amount from public.transactions
     where subscription_id = (select id from public.subscriptions where name = 'SettleToday')),
  1000,
  '更新日が今日のサブスクは **その場で** 台帳に入る'
);

select is(
  (select next_renewal_date from public.subscriptions where name = 'SettleToday'),
  (public.jst_today() + interval '1 month')::date,
  '精算したら更新日が次の周期へ進む'
);

select is(
  (select count(*)::int from public.transactions
     where subscription_id = (select id from public.subscriptions where name = 'SettleFuture')),
  0,
  '更新日が未来のサブスクは記録しない（まだ課金されていない）'
);

select is(
  (select count(*)::int from public.transactions
     where subscription_id = (select id from public.subscriptions where name = 'SettleOther')),
  0,
  '相手のサブスクは精算しない'
);

-- 再実行しても増えない（cron と同時に走っても二重計上しない）
select is(public.settle_my_subscriptions(), 0, '再実行しても新たに記録しない（冪等）');
select is(
  (select count(*)::int from public.transactions where subscription_id is not null
     and memo = 'SettleToday'),
  1,
  '二重計上しない'
);

-- 単体の精算はクライアントから呼べない（id を知っていれば他人のを試せてしまう）
select throws_ok(
  $$ select public.settle_subscription(
       (select id from public.subscriptions where name = 'SettleOther')) $$,
  '42501', null,
  'authenticated は settle_subscription を直接呼べない'
);

-- 数ヶ月遅れていたら、その回数ぶんすべて記録する
reset role;
set local role service_role;
insert into public.subscriptions
  (household_id, owner_member_id, name, currency, original_amount, amount_jpy, cycle, next_renewal_date, status)
values ('main', 'yururi', 'SettleLate', 'JPY', 500, 500, 'monthly',
        (public.jst_today() - interval '2 months')::date, 'active');

reset role;
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"role":"authenticated","household_id":"main","member_id":"yururi"}',
  true
);
select is(public.settle_my_subscriptions(), 3, '2 ヶ月遅れていたら 3 回ぶん記録する');

-- 解約検討中は精算しない
reset role;
set local role service_role;
insert into public.subscriptions
  (household_id, owner_member_id, name, currency, original_amount, amount_jpy, cycle, next_renewal_date, status)
values ('main', 'yururi', 'SettleCancel', 'JPY', 700, 700, 'monthly', public.jst_today(), 'considering_cancel');

reset role;
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"role":"authenticated","household_id":"main","member_id":"yururi"}',
  true
);
select is(public.settle_my_subscriptions(), 0, '解約検討中は精算しない');

-- ユーザーは相変わらず subscription_id 付きの取引を作れない（精算経路以外は塞がったまま）
select throws_ok(
  $$ insert into public.transactions (household_id, owner_member_id, type, amount, occurred_on, subscription_id)
     values ('main', 'yururi', 'expense', 1, current_date,
             (select id from public.subscriptions where name = 'SettleToday')) $$,
  'PT403', null,
  '精算経路の外からは subscription_id 付きの取引を作れない'
);

-- ============================================================
-- Block J: 精算のロールフォワードが「本来の課金日」を壊さない
-- ============================================================
-- Block E は service_role による **直接の UPDATE** しか見ておらず、
-- settle_subscription を通っていなかった。settle_subscription は security definer なので
-- トリガから見た current_user が所有者(postgres)になり、「人が課金日を編集した」と
-- 誤判定されて anchor が丸めた日で上書きされる（1/31 → 2/28 で anchor が 28 に化ける）。
-- 一度壊れると自動復旧しないので、**精算を実際に通して**確かめる。
-- 「今日」を 2026-02-15 に固定する。**着地が短い月になる日でないと、このバグは隠れる**
-- （例えば 7 月に流すと着地が 7/31 になり、丸めた日 31 が元の anchor 31 と偶然一致する）。
-- DDL なので **postgres (セッションユーザー) のまま**撃つ。service_role には
-- public スキーマの CREATE 権限が無く、permission denied で止まる。
reset role;
create or replace function public.jst_today() returns date language sql stable
as $$ select date '2026-02-15' $$;

set local role service_role;

insert into public.subscriptions
  (household_id, owner_member_id, name, currency, original_amount, amount_jpy, cycle, next_renewal_date, status)
values ('main', 'yururi', 'MonthEndSettle', 'JPY', 1000, 1000, 'monthly', '2026-01-31', 'active');

select is(
  (select renewal_anchor_day from public.subscriptions where name = 'MonthEndSettle'),
  31::smallint,
  '登録時の anchor は 31'
);

select public.settle_subscription((select id from public.subscriptions where name = 'MonthEndSettle'));

select is(
  (select next_renewal_date from public.subscriptions where name = 'MonthEndSettle'),
  date '2026-02-28',
  '1/31 を精算すると次の更新日は 2/28（2 月に 31 日は無い）'
);

select is(
  (select renewal_anchor_day from public.subscriptions where name = 'MonthEndSettle'),
  31::smallint,
  '精算のロールフォワードでは anchor を 31 のまま保つ（28 に丸めない）'
);

-- anchor が壊れていれば、次の周期が 3/28 になる
select is(
  public.next_renewal_after(
    (select next_renewal_date from public.subscriptions where name = 'MonthEndSettle'),
    'monthly',
    (select renewal_anchor_day from public.subscriptions where name = 'MonthEndSettle')
  ),
  date '2026-03-31',
  '次の周期は 3/31 に戻る（月末課金が 28 日に固定化しない）'
);

-- 一方、**ユーザーが課金日を編集した**ときは anchor を付け直す（そちらは正しい挙動）
reset role;
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"role":"authenticated","household_id":"main","member_id":"yururi"}',
  true
);

update public.subscriptions set next_renewal_date = '2026-03-15' where name = 'MonthEndSettle';

select is(
  (select renewal_anchor_day from public.subscriptions where name = 'MonthEndSettle'),
  15::smallint,
  'ユーザーが課金日を変えたときは anchor を付け直す'
);

-- 「今日」を元に戻す（この先で使う人がいても壊れないように）。DDL なので postgres で撃つ。
reset role;
create or replace function public.jst_today() returns date language sql stable
as $$ select (now() at time zone 'Asia/Tokyo')::date $$;

-- ============================================================
-- Block K: 0 円のサブスクが、他のサブスクの精算を巻き添えにしない
-- ============================================================
-- subscriptions は amount_jpy >= 0 を許す（無料トライアルは 0 円で登録できる）が、
-- transactions は check (amount > 0)。0 円をそのまま挿入すると例外になり、
-- settle_my_subscriptions は 1 トランザクションなので **その人の到来済みサブスク全部**が
-- 巻き戻る。しかもフロントは失敗を握り潰すので、画面には何も出ない。
reset role;
set local role service_role;

insert into public.subscriptions
  (household_id, owner_member_id, name, currency, original_amount, amount_jpy, cycle, next_renewal_date, status)
values
  ('main', 'shiyowo', 'FreeTrial', 'JPY', 0, 0, 'monthly', public.jst_today(), 'trial'),
  ('main', 'shiyowo', 'PaidAlongside', 'JPY', 500, 500, 'monthly', public.jst_today(), 'active');

reset role;
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"role":"authenticated","household_id":"main","member_id":"shiyowo"}',
  true
);

select lives_ok(
  $$ select public.settle_my_subscriptions() $$,
  '0 円のサブスクがあっても精算が例外にならない'
);

select is(
  (select count(*)::integer from public.transactions
    where subscription_id = (select id from public.subscriptions where name = 'PaidAlongside')),
  1,
  '同じ人の有料サブスクは巻き添えにならず記録される'
);

select is(
  (select count(*)::integer from public.transactions
    where subscription_id = (select id from public.subscriptions where name = 'FreeTrial')),
  0,
  '0 円の支払いは台帳に載せない'
);

-- 0 円でも更新日は進む（次の cron で毎回やり直さないように）
select isnt(
  (select next_renewal_date from public.subscriptions where name = 'FreeTrial'),
  public.jst_today(),
  '0 円でも更新日は進む'
);

-- ============================================================
-- Block L: サブスク削除 RPC（delete_subscription）
-- ============================================================
-- #71: サブスクを消しても、その支払い記録は FK の on delete set null で
-- 「ただの支出」として台帳に残る（意図的）。それを **一緒に消す選択肢** を RPC で出す。
--
-- クライアントの 2 段階では書けない: 削除ポリシーが subscription_id is null を
-- 要求するので、消す前は支払いを消せず、消した後は紐付けが失われている。

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"role":"authenticated","household_id":"main","member_id":"yururi"}',
  true
);

-- 支払い記録を 2 件持つサブスクを作る（精算経路を通して作る）
insert into public.subscriptions
  (household_id, owner_member_id, name, currency, original_amount, amount_jpy,
   cycle, next_renewal_date, status)
values
  ('main', 'yururi', 'DelMe', 'JPY', 2000, 2000, 'monthly',
   public.jst_today() - interval '1 month', 'active');

select public.settle_my_subscriptions();

select cmp_ok(
  (select count(*)::int from public.transactions
    where subscription_id = (select id from public.subscriptions where name = 'DelMe')),
  '>=', 1,
  'DelMe の支払いが台帳に記録された（削除テストの前提）'
);

-- ---- 支払いを残して削除する（既定）----
select is(
  public.delete_subscription(
    (select id from public.subscriptions where name = 'DelMe'), false),
  0,
  '支払いを消さない指定なら 0 件返す'
);

select is(
  (select count(*)::int from public.subscriptions where name = 'DelMe'),
  0,
  'サブスクは消えている'
);

-- 支払いは「ただの支出」として残る（subscription_id が外れている）
select cmp_ok(
  (select count(*)::int from public.transactions where memo = 'DelMe' and subscription_id is null),
  '>=', 1,
  '支払いは subscription_id が外れて台帳に残る'
);

-- 残った支払いは **ユーザーが自分で消せる**（RLS の削除ポリシーが通るようになる）
select lives_ok(
  $$ delete from public.transactions where memo = 'DelMe' $$,
  '残った支払いは、ただの支出として自分で削除できる'
);

-- ---- 支払いも一緒に消す ----
insert into public.subscriptions
  (household_id, owner_member_id, name, currency, original_amount, amount_jpy,
   cycle, next_renewal_date, status)
values
  ('main', 'yururi', 'DelMe2', 'JPY', 3000, 3000, 'monthly',
   public.jst_today() - interval '1 month', 'active');

select public.settle_my_subscriptions();

select cmp_ok(
  public.delete_subscription(
    (select id from public.subscriptions where name = 'DelMe2'), true),
  '>=', 1,
  '支払いも消す指定なら、消した件数を返す'
);

select is(
  (select count(*)::int from public.transactions where memo = 'DelMe2'),
  0,
  '支払い記録も台帳から消えている'
);

select is(
  (select count(*)::int from public.subscriptions where name = 'DelMe2'),
  0,
  'サブスクも消えている'
);

-- ---- 既に消えていてもエラーにしない（二重送信・再試行）----
select is(
  public.delete_subscription('00000000-0000-0000-0000-000000000000'::uuid, true),
  0,
  '存在しない id でもエラーにしない（冪等）'
);

-- ---- **相手のサブスクは消せない** ----
-- definer なので RLS が効かない。関数の中で所有者を検証していないと、
-- 相手のサブスクと支払い記録を丸ごと消せる RPC になる。
--
-- **しよを本人として作る。** ゆるりの JWT のままでは owner_member_id='shiyowo' の
-- 行を挿入できない（RLS の insert ポリシーが owner = JWT の member_id を要求する）。
select set_config(
  'request.jwt.claims',
  '{"role":"authenticated","household_id":"main","member_id":"shiyowo"}',
  true
);

insert into public.subscriptions
  (household_id, owner_member_id, name, currency, original_amount, amount_jpy,
   cycle, next_renewal_date, status)
values
  ('main', 'shiyowo', 'ShiyowoSub', 'JPY', 500, 500, 'monthly',
   public.jst_today() + interval '10 days', 'active');

-- ゆるりに戻って、しよをのサブスクを消そうとする
select set_config(
  'request.jwt.claims',
  '{"role":"authenticated","household_id":"main","member_id":"yururi"}',
  true
);

select throws_ok(
  $$ select public.delete_subscription(
       (select id from public.subscriptions where name = 'ShiyowoSub'), true) $$,
  'PT403',
  '自分のサブスクしか削除できません',
  '相手のサブスクは RPC 経由でも削除できない'
);

select is(
  (select count(*)::int from public.subscriptions where name = 'ShiyowoSub'),
  1,
  '相手のサブスクは残っている'
);

-- ============================================================
-- Block M: カテゴリの削除（#75）
-- ============================================================
-- 削除できるのは「システムでもデフォルトでもない」ユーザー追加カテゴリだけ。
-- デフォルト（seed）と残高調整（system）はアーカイブのみ。
-- 取引で使われているものは FK restrict で別途止まる。

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"role":"authenticated","household_id":"main","member_id":"yururi"}',
  true
);

-- デフォルトカテゴリ（食費）は削除できない（ポリシーで弾かれ 0 行・エラーにはならない）
delete from public.categories where kind = 'expense' and name = '食費';
select is(
  (select count(*)::int from public.categories where kind = 'expense' and name = '食費'),
  1,
  'デフォルトカテゴリ（食費）は削除できない'
);

-- **「サブスク」は消させない**（settle_subscription が name で依存する）
delete from public.categories where kind = 'expense' and name = 'サブスク';
select is(
  (select count(*)::int from public.categories where kind = 'expense' and name = 'サブスク'),
  1,
  '「サブスク」カテゴリは削除できない（精算が依存する）'
);

-- 残高調整（system）も削除できない
delete from public.categories where name = '残高調整';
select is(
  (select count(*)::int from public.categories where name = '残高調整'),
  1,
  '残高調整（system）は削除できない'
);

-- ユーザー追加カテゴリ（未使用）は削除できる
insert into public.categories (household_id, kind, name, icon)
  values ('main', 'expense', 'カラオケ', 'mic');
delete from public.categories where name = 'カラオケ';
select is(
  (select count(*)::int from public.categories where name = 'カラオケ'),
  0,
  'ユーザー追加カテゴリ（未使用）は削除できる'
);

-- **update→delete の 2 段階迂回でもデフォルトは消せない**（トリガで is_default が不変）。
-- これが無いと、update で is_default を false にしてから delete でき、
-- 削除ポリシーの is_default=false 条件をすり抜けて「サブスク」を消せてしまう（精算が PT404 で壊れる）。
update public.categories set is_default = false where kind = 'expense' and name = 'サブスク';
select is(
  (select is_default from public.categories where kind = 'expense' and name = 'サブスク'),
  true,
  'is_default はユーザーが書き換えられない（トリガで不変）'
);
delete from public.categories where kind = 'expense' and name = 'サブスク';
-- **kind='expense' で数える。** Block D が income の「サブスク」も作っているので、
-- kind を指定しないと 2 件になり、削除が防げているのに誤検知する。
select is(
  (select count(*)::int from public.categories where kind = 'expense' and name = 'サブスク'),
  1,
  'update→delete の迂回でもサブスクは消せない'
);

-- 取引で使われているユーザー追加カテゴリは FK restrict で削除できない
insert into public.categories (household_id, kind, name, icon)
  values ('main', 'expense', '使用中', 'label');
insert into public.transactions
  (household_id, owner_member_id, type, amount, category_id, occurred_on)
  values ('main', 'yururi', 'expense', 500,
    (select id from public.categories where name = '使用中'), public.jst_today());
select throws_ok(
  $$ delete from public.categories where name = '使用中' $$,
  '23503',
  null,
  '取引で使われているカテゴリは FK restrict で削除できない'
);

-- ============================================================
-- Block N: 次回更新日の下限ガード + 精算ループの上限（#65）
-- ============================================================
-- 更新日を大きく過去にすると、精算ループがその周期ぶん回り、削除できない取引が
-- 数百〜数千件作られる。書き込み時ガード(authenticated のみ)とループ上限で塞ぐ。
--
-- 「今日」を 2026-07-15 に固定する（下限・上限の判定を決定的にする）。DDL なので postgres で撃つ。
reset role;
create or replace function public.jst_today() returns date language sql stable
as $$ select date '2026-07-15' $$;

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"role":"authenticated","household_id":"main","member_id":"yururi"}',
  true
);

-- monthly の下限 = 今日 - 1 ヶ月 = 2026-06-15（含む）。それより前は拒否。
select throws_ok(
  $$ insert into public.subscriptions
       (household_id, owner_member_id, name, currency, original_amount, amount_jpy, cycle, next_renewal_date, status)
     values ('main', 'yururi', 'FloorTooOld', 'JPY', 500, 500, 'monthly', date '2026-05-15', 'active') $$,
  'PT400', null,
  'monthly: 1 周期より前（2 ヶ月前）の更新日は拒否'
);

select lives_ok(
  $$ insert into public.subscriptions
       (household_id, owner_member_id, name, currency, original_amount, amount_jpy, cycle, next_renewal_date, status)
     values ('main', 'yururi', 'FloorExact', 'JPY', 500, 500, 'monthly', date '2026-06-15', 'active') $$,
  'monthly: 下限ちょうど（1 ヶ月前）は許可（境界は含む）'
);

select lives_ok(
  $$ insert into public.subscriptions
       (household_id, owner_member_id, name, currency, original_amount, amount_jpy, cycle, next_renewal_date, status)
     values ('main', 'yururi', 'FloorRecent', 'JPY', 500, 500, 'monthly', date '2026-06-25', 'active') $$,
  'monthly: 下限内（20 日前）は許可'
);

-- 既存サブスクの更新日を大きく過去へ編集するのも拒否
insert into public.subscriptions
  (household_id, owner_member_id, name, currency, original_amount, amount_jpy, cycle, next_renewal_date, status)
values ('main', 'yururi', 'EditToPast', 'JPY', 500, 500, 'monthly', date '2026-07-20', 'active');
select throws_ok(
  $$ update public.subscriptions set next_renewal_date = date '2026-05-01' where name = 'EditToPast' $$,
  'PT400', null,
  '更新日を 1 周期より前へ編集するのも拒否'
);

-- yearly の下限 = 今日 - 1 年 = 2025-07-15
select lives_ok(
  $$ insert into public.subscriptions
       (household_id, owner_member_id, name, currency, original_amount, amount_jpy, cycle, next_renewal_date, status)
     values ('main', 'yururi', 'YearRecent', 'JPY', 12000, 12000, 'yearly', date '2026-04-15', 'active') $$,
  'yearly: 1 年以内の過去は許可'
);
select throws_ok(
  $$ insert into public.subscriptions
       (household_id, owner_member_id, name, currency, original_amount, amount_jpy, cycle, next_renewal_date, status)
     values ('main', 'yururi', 'YearTooOld', 'JPY', 12000, 12000, 'yearly', date '2025-06-15', 'active') $$,
  'PT400', null,
  'yearly: 1 周期（1 年）より前は拒否'
);

-- service_role（cron）は素通し。数ヶ月遅れの正当な過去埋めを妨げない。
reset role;
set local role service_role;
select lives_ok(
  $$ insert into public.subscriptions
       (household_id, owner_member_id, name, currency, original_amount, amount_jpy, cycle, next_renewal_date, status)
     values ('main', 'yururi', 'CapPast', 'JPY', 500, 500, 'monthly', date '2024-01-15', 'active') $$,
  'service_role は大きく過去の更新日でも挿入できる（下限ガードは authenticated のみ）'
);

-- 下限より前の日付を持つサブスク（service_role 経由）。N5 で「日付を触らない編集」を試す。
insert into public.subscriptions
  (household_id, owner_member_id, name, currency, original_amount, amount_jpy, cycle, next_renewal_date, status)
values ('main', 'yururi', 'StatusOnly', 'JPY', 500, 500, 'monthly', date '2024-03-15', 'active');

-- 30 ヶ月前のサブスクを 1 回精算しても、記録は上限（24 周期）で止まる。
select is(
  (select recorded from public.settle_subscription(
     (select id from public.subscriptions where name = 'CapPast'))),
  24,
  '1 回の精算で記録するのは最大 24 件（無制限に作らない）'
);
select is(
  (select next_renewal_date from public.subscriptions where name = 'CapPast'),
  date '2026-01-15',
  '上限で止め、更新日は到達点（24 周期ぶん進んだ 2026-01-15）まで進む（残りは次回に持ち越す）'
);

-- authenticated が「日付を変えない編集」をするのは、下限より前のサブスクでも通す
reset role;
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"role":"authenticated","household_id":"main","member_id":"yururi"}',
  true
);
select lives_ok(
  $$ update public.subscriptions set status = 'considering_cancel' where name = 'StatusOnly' $$,
  '下限より前のサブスクでも、更新日を触らない編集（ステータス変更）は通す'
);

-- ============================================================
-- Block O: アカウント（在り処）の RLS / 削除ガード / FK restrict（#98）
-- ============================================================
-- accounts は categories と違い is_system/is_default が無い（テンプレも含め自由に消せる）。
-- ただし取引で使われているものは FK restrict で止まる。他 household のアカウントは付けられない。
reset role;
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"role":"authenticated","household_id":"main","member_id":"yururi"}',
  true
);

-- 自分の household のアカウントを在り処にした取引は挿入できる
select lives_ok(
  $$ insert into public.transactions (household_id, owner_member_id, type, amount, occurred_on, account_id)
     values ('main', 'yururi', 'expense', 300, public.jst_today(),
             (select id from public.accounts where household_id = 'main' and name = '現金')) $$,
  '在り処（現金）を指定した取引を挿入できる'
);

-- 存在しない（＝自分の household に無い）アカウントは付けられない（RLS with check で弾く）
select throws_ok(
  $$ insert into public.transactions (household_id, owner_member_id, type, amount, occurred_on, account_id)
     values ('main', 'yururi', 'expense', 300, public.jst_today(), gen_random_uuid()) $$,
  null, null,
  '自分の household に無いアカウントは取引に付けられない'
);

-- ユーザー追加アカウント（未使用）は削除できる
insert into public.accounts (household_id, name, icon) values ('main', '一時口座', 'account_balance');
delete from public.accounts where name = '一時口座';
select is(
  (select count(*)::int from public.accounts where name = '一時口座'),
  0,
  '未使用のアカウントは削除できる（system/default 保護なし）'
);

-- アーカイブ（is_archived=true への更新）はできる
select lives_ok(
  $$ update public.accounts set is_archived = true where name = 'PayPay' $$,
  'アカウントはアーカイブ（ソフト非表示）できる'
);

-- 取引で使われているアカウントは FK restrict で削除できない
insert into public.accounts (household_id, name, icon) values ('main', '使用中口座', 'credit_card');
insert into public.transactions
  (household_id, owner_member_id, type, amount, occurred_on, account_id)
  values ('main', 'yururi', 'expense', 500, public.jst_today(),
    (select id from public.accounts where name = '使用中口座'));
select throws_ok(
  $$ delete from public.accounts where name = '使用中口座' $$,
  '23503',
  null,
  '取引で使われているアカウントは FK restrict で削除できない'
);

-- ============================================================
-- Block P: adjust_balance_now（任意タイミングの残高数え直し, #99）
-- ============================================================
-- 24日の壁と違い、いつでも呼べて checkpoint を作らない。CAS と引数検証は confirm と共通。
-- jst_today は Block C で GUC 参照版に差し替え済み。ここは **24日より前** に固定して、
-- 24日ガードが無いことを示す。
reset role;
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"role":"authenticated","household_id":"main","member_id":"yururi"}',
  true
);
select set_config('test.today', '2026-07-10', true); -- 24日より前

-- 現在の computed（全期間累積）と checkpoint 件数を控える
select set_config(
  'test.computed',
  (
    select (
      opening_balance + coalesce((
        select sum(case when type = 'income' then amount else -amount end)
        from public.transactions
        where owner_member_id = 'yururi' and household_id = 'main'
      ), 0)
    )::text
    from public.profiles where member_id = 'yururi' and household_id = 'main'
  ),
  true
);
select set_config(
  'test.cp_before',
  (select count(*)::text from public.balance_checkpoints where member_id = 'yururi'),
  true
);

-- [1] 24日より前でも数え直せて、差額(+3000)を返す（← 24日ガードが無い証明）
select is(
  (
    select public.adjust_balance_now(
      current_setting('test.computed')::int + 3000,
      current_setting('test.computed')::int
    )
  ),
  3000,
  'adjust_balance_now: 24日より前でも数え直せて差額(+3000)を返す（#99）'
);

-- [2] 「残高調整（手動）」取引が入る（24日ぶんの「残高調整（24日）」とは別文言）
select is(
  (
    select count(*)::int from public.transactions
    where owner_member_id = 'yururi' and memo = '残高調整（手動）'
  ),
  1,
  'adjust_balance_now: 残高調整（手動）取引が 1 件入る'
);

-- [3] checkpoint は作らない（月次の壁の状態に影響しない）
select is(
  (select count(*)::int from public.balance_checkpoints where member_id = 'yururi'),
  current_setting('test.cp_before')::int,
  'adjust_balance_now: balance_checkpoints を作らない（壁と独立）'
);

-- [4] CAS: expectedComputed が現在値と食い違えば拒否
select throws_ok(
  $$ select public.adjust_balance_now(1, 999999999) $$,
  'PT412', null,
  'adjust_balance_now: expectedComputed 不一致は PT412'
);

-- [5] 引数検証: 負の実残高は拒否（CAS より前で弾く）
select throws_ok(
  $$ select public.adjust_balance_now(-1, 0) $$,
  'PT400', null,
  'adjust_balance_now: 負の実残高は PT400'
);

-- [6] ズレ 0 なら 0 を返し、取引を増やさない
select set_config(
  'test.computed2',
  (
    select (
      opening_balance + coalesce((
        select sum(case when type = 'income' then amount else -amount end)
        from public.transactions
        where owner_member_id = 'yururi' and household_id = 'main'
      ), 0)
    )::text
    from public.profiles where member_id = 'yururi' and household_id = 'main'
  ),
  true
);
select is(
  (
    select public.adjust_balance_now(
      current_setting('test.computed2')::int,
      current_setting('test.computed2')::int
    )
  ),
  0,
  'adjust_balance_now: ズレ 0 なら 0 を返す'
);
select is(
  (
    select count(*)::int from public.transactions
    where owner_member_id = 'yururi' and memo = '残高調整（手動）'
  ),
  1,
  'adjust_balance_now: ズレ 0 では取引を増やさない'
);

-- 「今日」を実時刻に戻す（この先で使う人がいても壊れないように）。DDL なので postgres で撃つ。
reset role;
create or replace function public.jst_today() returns date language sql stable
as $$ select (now() at time zone 'Asia/Tokyo')::date $$;

select * from finish();
rollback;
