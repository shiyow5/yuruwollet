-- pgTAP: RLS の cross-household 分離 + per-member 書込強制 + confirm_balance_checkpoint RPC
begin;
select plan(85);

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

-- 本来の課金日(anchor) は挿入時に next_renewal_date の日から自動で入る
insert into public.subscriptions
  (household_id, owner_member_id, name, currency, original_amount, amount_jpy, cycle, next_renewal_date, status)
values ('main', 'yururi', 'MonthEnd', 'JPY', 800, 800, 'monthly', date '2026-01-31', 'active');
select is(
  (select renewal_anchor_day from public.subscriptions where name = 'MonthEnd'),
  31::smallint,
  '本来の課金日は next_renewal_date の日から自動で入る'
);

-- ユーザーが課金日を変えたら anchor も追随する
update public.subscriptions set next_renewal_date = date '2026-02-10' where name = 'MonthEnd';
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
-- Block F: roll_subscription_cycle（支払い記録と更新日前進の原子化）
-- ============================================================
-- 「記録」と「前進」が別々の往復だと、その隙間で編集/解約されたときに
-- 古い金額の支払いだけが台帳に残る。1 トランザクションに閉じて塞ぐ。
reset role;
set local role service_role;

-- 収入カテゴリにも「サブスク」を作る。
-- categories は (household_id, kind, name) で一意なので **これは作れてしまう**。
-- 名前だけでカテゴリを引いていると、支出が収入カテゴリで記録される。
insert into public.categories (household_id, kind, name, sort_order)
values ('main', 'income', 'サブスク', 90);

insert into public.subscriptions
  (household_id, owner_member_id, name, currency, original_amount, amount_jpy, cycle, next_renewal_date, status)
values ('main', 'yururi', 'RpcSub', 'JPY', 1200, 1200, 'monthly', date '2026-05-10', 'active');

-- cron が 3 ヶ月止まっていた場合。止まっていた間も課金は起きているので、全期ぶん記録する。
select is(
  public.roll_subscription_cycle(
    (select id from public.subscriptions where name = 'RpcSub'),
    date '2026-05-10', 'JPY', 1200, 'monthly', 10,
    '[{"occurred_on":"2026-05-10","amount":1200},
      {"occurred_on":"2026-06-10","amount":1200},
      {"occurred_on":"2026-07-10","amount":1200}]'::jsonb,
    date '2026-08-10'
  ),
  true,
  'roll_subscription_cycle: 到来した支払いを記録して更新日を進める'
);

select is(
  (select count(*)::int from public.transactions
     where subscription_id = (select id from public.subscriptions where name = 'RpcSub')),
  3,
  'roll_subscription_cycle: 止まっていた 3 期ぶんすべてを記録する'
);

select is(
  (select next_renewal_date from public.subscriptions where name = 'RpcSub'),
  date '2026-08-10',
  'roll_subscription_cycle: 更新日が次の周期へ進む'
);

-- 同名の収入カテゴリがあっても、支出は必ず **支出カテゴリ** で記録される
select is(
  (select distinct c.kind::text
     from public.transactions t join public.categories c on c.id = t.category_id
    where t.subscription_id = (select id from public.subscriptions where name = 'RpcSub')),
  'expense',
  'roll_subscription_cycle: 同名の収入カテゴリを引かない（kind まで絞る）'
);

-- cron は再実行されうる。同じ更新日ぶんが二重計上されてはいけない。
select is(
  public.roll_subscription_cycle(
    (select id from public.subscriptions where name = 'RpcSub'),
    date '2026-08-10', 'JPY', 1200, 'monthly', 10,
    '[{"occurred_on":"2026-07-10","amount":1200}]'::jsonb,
    date '2026-09-10'
  ),
  true,
  'roll_subscription_cycle: 再実行できる'
);
select is(
  (select count(*)::int from public.transactions
     where subscription_id = (select id from public.subscriptions where name = 'RpcSub')),
  3,
  'roll_subscription_cycle: 同じ更新日ぶんは増えない（冪等）'
);

-- 一覧取得から呼び出しまでの間にユーザーが編集した場合。
-- **支払いだけが古い金額で残る** ことが無いよう、何もせず false を返す。
select is(
  public.roll_subscription_cycle(
    (select id from public.subscriptions where name = 'RpcSub'),
    date '2026-05-10',  -- 古いスナップショット（実際は 2026-09-10）
    'JPY', 1200, 'monthly', 10,
    '[{"occurred_on":"2026-10-10","amount":9999}]'::jsonb,
    date '2026-06-10'
  ),
  false,
  'roll_subscription_cycle: スナップショットが古ければ何もせず false'
);
select is(
  (select next_renewal_date from public.subscriptions where name = 'RpcSub'),
  date '2026-09-10',
  'CAS 不一致では更新日を進めない'
);
select is(
  (select count(*)::int from public.transactions
     where subscription_id = (select id from public.subscriptions where name = 'RpcSub')),
  3,
  'CAS 不一致では支払いも記録しない（記録だけ残る穴が無い）'
);

-- 解約検討中は課金されない前提。進めない。
update public.subscriptions set status = 'considering_cancel' where name = 'RpcSub';
select is(
  public.roll_subscription_cycle(
    (select id from public.subscriptions where name = 'RpcSub'),
    date '2026-09-10', 'JPY', 1200, 'monthly', 10,
    '[{"occurred_on":"2026-09-10","amount":1200}]'::jsonb,
    date '2026-10-10'
  ),
  false,
  'roll_subscription_cycle: 解約検討中のサブスクは進めない'
);

reset role;
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"role":"authenticated","household_id":"main","member_id":"yururi"}',
  true
);

-- cron が作った支払いをユーザーが消せると、更新日は既に進んでいるため **二度と復活しない**。
-- 残高とカテゴリ別集計からサブスク代が恒久的に欠落する。
delete from public.transactions
  where subscription_id = (select id from public.subscriptions where name = 'RpcSub');
select is(
  (select count(*)::int from public.transactions
     where subscription_id = (select id from public.subscriptions where name = 'RpcSub')),
  3,
  'ユーザーは cron が作った支払いを削除できない'
);

-- ただし、ふつうの取引は今までどおり削除できる（削除ポリシーを締めすぎていない）
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

-- **subscription_id を外して「ただの取引」に化けさせる経路も塞ぐ。**
-- 旧トリガは new.subscription_id しか見ていなかったので、null を書き込む UPDATE は
-- 素通りし、その後は削除ポリシー (subscription_id is null) もすり抜けて消せた。
-- UI がボタンを隠しても、API を直接叩けば同じことができる。
select throws_ok(
  $$ update public.transactions set subscription_id = null
      where subscription_id = (select id from public.subscriptions where name = 'RpcSub') $$,
  'PT403', null,
  'ユーザーは cron の支払いから subscription_id を外せない'
);
select throws_ok(
  $$ update public.transactions set amount = 1
      where subscription_id = (select id from public.subscriptions where name = 'RpcSub') $$,
  'PT403', null,
  'ユーザーは cron の支払いの金額を書き換えられない'
);

-- ただしサブスク本体を削除したら、支払いは「ただの支出」として残り、通常どおり扱える。
-- （実際に使ったお金なので履歴からは消さない。FK の on delete set null）
select lives_ok(
  $$ delete from public.subscriptions where name = 'RpcSub' $$,
  'サブスク本体は削除できる（支払い履歴の FK set null がトリガに弾かれない）'
);
select is(
  (select count(*)::int from public.transactions
     where owner_member_id = 'yururi' and memo = 'RpcSub' and subscription_id is null),
  3,
  'サブスクを消しても支払い履歴は「ただの支出」として残る'
);

-- RPC は cron 専用。クライアントからは実行できない。
select throws_ok(
  $$ select public.roll_subscription_cycle(
       '00000000-0000-0000-0000-000000000000'::uuid, current_date, 'JPY', 1, 'monthly', 1,
       '[]'::jsonb, current_date) $$,
  '42501', null,
  'authenticated は roll_subscription_cycle を実行できない'
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

-- Go は null を 0 として送ってくる
select is(
  public.roll_subscription_cycle(
    (select id from public.subscriptions where name = 'NullAnchor'),
    date '2026-06-05', 'JPY', 800, 'monthly', 0,
    '[{"occurred_on":"2026-06-05","amount":800}]'::jsonb,
    date '2026-07-05'
  ),
  true,
  'anchor が null でも CAS が通る（null と 0 を同じ扱いにする）'
);
select is(
  (select count(*)::int from public.transactions
     where subscription_id = (select id from public.subscriptions where name = 'NullAnchor')),
  1,
  'anchor が null のサブスクでも支払いが記録される'
);

select * from finish();
rollback;
