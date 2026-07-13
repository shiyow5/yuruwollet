-- confirm_balance_checkpoint を「クライアントの主張を検証する」防御的な RPC にする。
--
-- 直前の migration (…_serialize.sql) は profiles を FOR UPDATE でロックして同時実行を直列化したが、
-- それだけでは以下の 3 つの穴が残っていた。いずれも 24日の壁を開いたまま放置したタブや、
-- 進んだ端末時計から **ユーザーが承認していない残高調整** が入りうる。
--
--   [1] 早期確定: 端末時計が進んでいると 23日でも壁が開き、RPC が当月を confirmed にしてしまう。
--       → 本来の 24日の催促がその月まるごと消える。サーバ時刻での日付ガードが無かった。
--   [2] 確定済みの月の再確定: 2 枚目のタブが違う金額を送ると、ロック解放後に **調整後残高** から
--       再計算して別の調整取引を挿入し、確定済み checkpoint を上書きしていた。
--   [3] 陳腐化した差額: クライアントが残高を再取得してから RPC が走るまでの間に相手が取引を追加すると、
--       サーバは新しい差額で再計算する。ユーザーが「差額 0」や「+5,000 で確定」と承認した内容と
--       違う調整が、確認ダイアログ無しで入る。
--
-- 対策: 「ユーザーが承認した (computed, actual) の組」をサーバが検証する。
--   - サーバ時刻 (JST) で 24日ガード          → PT403
--   - 当月が既に confirmed なら拒否 (冪等)    → PT409
--   - p_expected_computed とサーバの計算残高が食い違えば拒否 (CAS) → PT412
-- SQLSTATE は PostgREST の PTxxx 規約に合わせ、フロントは code で分岐して再確認を促す。

-- 「今日 (JST)」を 1 箇所に閉じ込める。テストはこの関数を差し替えて日付を偽装するため、
-- 本番コード側に日付の注入経路 (GUC やパラメータ) を一切持たせずに 24日ガードを検証できる。
create or replace function public.jst_today()
returns date
language sql
stable
as $$ select (now() at time zone 'Asia/Tokyo')::date $$;

comment on function public.jst_today() is
  'JST の今日。24日ガードの単一の真実。テストのみ CREATE OR REPLACE で差し替える。';

-- シグネチャが変わるため旧版を落とす。
-- 残しておくと overload となり、検証を通らない 1 引数版を呼べてしまう。
drop function if exists public.confirm_balance_checkpoint(integer);

create function public.confirm_balance_checkpoint(
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

  -- [1] 24日ガード: 判定はサーバ時刻のみ。クライアントの now は信用しない。
  if extract(day from v_today) < 24 then
    raise exception 'balance checkpoint opens on day 24 (JST today is %)', v_today
      using errcode = 'PT403';
  end if;

  -- 同一メンバーの確定を直列化する (同時「はい」での二重調整を防ぐ)。
  -- 後続の呼び出しは先行トランザクションのコミット後に [2][3] を評価する。
  select opening_balance into v_opening
    from public.profiles
    where member_id = v_member and household_id = v_household
    for update;
  if not found then
    raise exception 'profile not found';
  end if;

  -- [2] 確定済みの月には二度と手を入れない (冪等)。
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

  select v_opening
    + coalesce(sum(case when type = 'income' then amount else -amount end), 0)
    into v_computed
    from public.transactions
    where household_id = v_household and owner_member_id = v_member;

  -- [3] CAS: ユーザーが画面で承認した「アプリの計算」と一致しなければ確定しない。
  -- 一致しない = 承認後に残高が動いた。差額が変わっているので、確認からやり直させる。
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

revoke all on function public.confirm_balance_checkpoint(integer, integer) from public;
grant execute on function public.confirm_balance_checkpoint(integer, integer) to authenticated;
grant execute on function public.confirm_balance_checkpoint(integer, integer) to service_role;
