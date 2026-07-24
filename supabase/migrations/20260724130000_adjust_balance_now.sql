-- ============================================================
-- adjust_balance_now: 任意のタイミングでの残高数え直し（#99）
--
-- 毎月24日の壁（confirm_balance_checkpoint）は「後で数える」を押すと当月は
-- もう出てこなくなる。ユーザーは「気が向いたときにいつでも残高を数え直したい」。
-- そこで **24日ガードにも月次 checkpoint にも縛られない** 残高調整専用の RPC を足す。
--
-- confirm_balance_checkpoint との違い:
--   - 24日ガード(PT403) なし         … いつでも呼べる
--   - balance_checkpoints を触らない … 月次の unique / 冪等(PT409) と衝突しない。
--                                       24日の壁の表示・再表示ロジックには一切影響しない。
--   - memo は「残高調整（手動）」    … 24日ぶん（残高調整（24日））と区別できる
--
-- 引き継ぐもの（confirm と同じ防御）:
--   - 引数検証(PT400)               … null / 負値を弾く
--   - profiles FOR UPDATE で直列化  … 同時実行・書込との競合を防ぐ（lock_owner_profile と対）
--   - CAS(PT412)                    … ユーザーが画面で見た computed と現在値が食い違えば拒否
--                                       （承認後に相手が取引を足した等で、見ていないズレを勝手に調整しない）
--
-- system カテゴリ「残高調整」・is_system_generated=true は confirm と同じ。集計（カテゴリ別）から
-- 除外され、残高には反映される。
-- ============================================================

create function public.adjust_balance_now(
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

  -- [0] 引数検証。UI を迂回した呼び出しもここで弾く。
  if p_actual is null or p_actual < 0 then
    raise exception 'actual balance must be a non-negative integer (got %)', p_actual
      using errcode = 'PT400';
  end if;

  -- 同一メンバーの調整を直列化する（同時実行での二重調整・競合を防ぐ）。
  select opening_balance into v_opening
    from public.profiles
    where member_id = v_member and household_id = v_household
    for update;
  if not found then
    raise exception 'profile not found';
  end if;

  -- 現在の「アプリの計算」残高（全期間累積・残高調整込み）。
  select v_opening
    + coalesce(sum(case when type = 'income' then amount else -amount end), 0)
    into v_computed
    from public.transactions
    where household_id = v_household and owner_member_id = v_member;

  -- [1] CAS: ユーザーが画面で承認した computed と一致しなければ調整しない。
  if p_expected_computed is distinct from v_computed then
    raise exception 'balance changed (expected %, computed %)', p_expected_computed, v_computed
      using errcode = 'PT412';
  end if;

  v_diff := p_actual - v_computed;

  -- ズレが無ければ何もしない（取引を作らない）。壁と同じ挙動。
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

comment on function public.adjust_balance_now(integer, integer) is
  '任意タイミングの残高数え直し（#99）。24日ガード・checkpoint なし。CAS と直列化は confirm と共通。';

revoke all on function public.adjust_balance_now(integer, integer) from public;
grant execute on function public.adjust_balance_now(integer, integer) to authenticated;
grant execute on function public.adjust_balance_now(integer, integer) to service_role;
