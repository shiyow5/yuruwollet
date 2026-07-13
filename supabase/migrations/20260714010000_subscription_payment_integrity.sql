-- サブスク支払いの記録を「失わない・誤らせない」ようにする。
--
-- 直前の 20260713070000 では、cron が
--   ① POST /transactions で支払いを記録し
--   ② PATCH /subscriptions で更新日を進める
-- という **2 回の HTTP 往復** で処理していた。この構造から次の穴が生まれる。
--
--   a) ①と②の間にユーザーがサブスクを編集/解約すると、古いスナップショットの金額で
--      支払いだけが台帳に残る（②は CAS で弾かれるが、①は取り消せない）
--   b) ①が返す 409 を「重複 = 記録済み」と決め打ちすると、FK 違反など別の 409 でも
--      ②が走り、その期の支払いが **永久に失われる**
--   c) cron が作る行は is_system_generated = false（実支出なので集計に入れる）ため、
--      既存の transactions_delete ポリシーで **ユーザーが削除できてしまう**。
--      ②で更新日は進んだ後なので、unique index による再記録の経路はもう無い
--
-- a) b) は「①と②を 1 つのトランザクションに閉じる」ことで構造的に消える。
-- c) は削除ポリシー側で塞ぐ。

-- ---- 1) cron が作った支払い行はユーザーが削除できない ----
-- 削除だけがトリガ（before insert or update）の対象外だったため、ポリシーで塞ぐ。
-- サブスク自体を削除した場合は FK が subscription_id を null にするので、
-- 「ただの支出」として通常どおり編集・削除できるようになる（履歴は残る）。
drop policy transactions_delete on public.transactions;
create policy transactions_delete on public.transactions for delete to authenticated
  using (
    household_id = (select auth.jwt() ->> 'household_id')
    and owner_member_id = (select auth.jwt() ->> 'member_id')
    and is_system_generated = false
    and subscription_id is null
  );

-- ---- 1b) subscription_id を外して「ただの取引」に化けさせることもできない ----
-- 旧トリガは new.subscription_id しか見ていなかった。そのため
--   UPDATE transactions SET subscription_id = null WHERE ...
-- は通ってしまい（new は null なので素通り）、その後は上の削除ポリシーも
-- すり抜けて消せた。UI がボタンを隠しても、API を直接叩けば同じことができる。
-- **old 側も見る。**
--
-- ただしサブスク本体を削除したときの FK (on delete set null) による更新は通す。
-- そのときは参照先のサブスクが既に消えているので、それを条件にする。
create or replace function public.guard_subscription_txn()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user = 'service_role' then
    return new;
  end if;

  -- ユーザーが subscription_id を付けると、cron の冪等キー (subscription_id, occurred_on)
  -- と衝突してその月の自動記録が失敗する
  if new.subscription_id is not null then
    raise exception 'subscription_id 付きの取引は cron のみが作成できます'
      using errcode = 'PT403';
  end if;

  if tg_op = 'UPDATE' and old.subscription_id is not null then
    -- サブスク削除に伴う FK の set null だけは通す（履歴はただの支出として残る）
    if new.subscription_id is null
       and not exists (select 1 from public.subscriptions where id = old.subscription_id)
    then
      return new;
    end if;
    raise exception 'サブスクの支払いはユーザーが変更できません'
      using errcode = 'PT403';
  end if;

  return new;
end;
$$;

comment on function public.guard_subscription_txn() is
  'サブスクの支払い (subscription_id 付き) は cron 専用。ユーザーは作成も変更もできない。'
  'subscription_id を外して削除ポリシーをすり抜ける経路も塞ぐ。'
  'サブスク本体の削除に伴う FK の set null だけは通す。';

-- ---- 2) 支払いの記録と更新日の前進を 1 トランザクションで行う ----
--
-- security invoker（既定）である点が重要:
--   * service_role は BYPASSRLS を持つので、RLS 迂回のために definer にする必要が無い
--   * definer にすると current_user が関数の所有者になり、
--     guard_subscription_txn（current_user <> 'service_role' なら PT403）に自分で弾かれる
--
-- FOR UPDATE でサブスク行を固定してから読むので、ここから commit まで
-- ユーザーの編集は待たされる。「一覧取得時のスナップショット」との突合せ（CAS）は
-- ロックの内側で行うため、突合せから更新までの隙間が無い。
create or replace function public.roll_subscription_cycle(
  p_subscription_id uuid,
  p_expected_next_renewal_date date,
  p_expected_currency public.sub_currency,
  p_expected_original_amount numeric,
  p_expected_cycle public.sub_cycle,
  p_expected_anchor_day integer,
  p_payments jsonb,
  p_next_renewal_date date,
  p_amount_jpy integer default null,
  p_fx_rate numeric default null,
  p_fx_rate_date date default null
)
returns boolean
language plpgsql
set search_path = ''
as $$
declare
  v_sub public.subscriptions;
  v_category uuid;
  v_payment jsonb;
begin
  -- RLS を迂回できる service_role 専用。authenticated からは execute も剥がしてあるが、
  -- 権限付与ミスで穴が開かないよう関数側でも拒否する。
  if current_user <> 'service_role' then
    raise exception 'roll_subscription_cycle は cron (service_role) のみが実行できます'
      using errcode = 'PT403';
  end if;

  select * into v_sub
    from public.subscriptions
    where id = p_subscription_id
    for update;

  if not found then
    return false;
  end if;

  -- 一覧取得から今までの間に人が編集/解約していたら、古い計算で上書きしない。
  -- 次回の cron が新しい値で拾い直す（エラーではない）。
  -- 次の更新日と支払額の計算に使った値を **すべて** 突き合わせる。
  -- anchor は nullable。Go 側は null を 0 として受け取る（int のゼロ値）ので、
  -- そのまま突き合わせると null <> 0 で **常に不一致** になり、
  -- そのサブスクは永久に進まなくなる。両方 0 に寄せて比較する。
  if v_sub.next_renewal_date is distinct from p_expected_next_renewal_date
     or v_sub.currency is distinct from p_expected_currency
     or v_sub.original_amount is distinct from p_expected_original_amount
     or v_sub.cycle is distinct from p_expected_cycle
     or coalesce(v_sub.renewal_anchor_day, 0) <> coalesce(p_expected_anchor_day, 0)
     or v_sub.status not in ('active', 'trial')
  then
    return false;
  end if;

  -- カテゴリは kind まで絞る。
  -- categories は (household_id, kind, name) で一意なので、名前だけで引くと
  -- 収入カテゴリ「サブスク」を作られたときに **支出が収入カテゴリで記録される**。
  select id into v_category
    from public.categories
    where household_id = v_sub.household_id
      and kind = 'expense'
      and name = 'サブスク';

  if v_category is null then
    raise exception 'household % に支出カテゴリ「サブスク」がありません', v_sub.household_id
      using errcode = 'PT404';
  end if;

  -- 到来した更新日ぶんをすべて記録する。cron が数ヶ月止まっていたなら、その回数ぶん課金されている。
  -- 二重計上は unique(subscription_id, occurred_on) が弾く（再実行しても増えない）。
  for v_payment in select * from jsonb_array_elements(p_payments)
  loop
    insert into public.transactions (
      household_id, owner_member_id, type, amount, category_id, memo, occurred_on, subscription_id
    ) values (
      v_sub.household_id,
      v_sub.owner_member_id,
      'expense',
      (v_payment ->> 'amount')::integer,
      v_category,
      v_sub.name,
      (v_payment ->> 'occurred_on')::date,
      v_sub.id
    )
    on conflict (subscription_id, occurred_on) where subscription_id is not null
    do nothing;
  end loop;

  update public.subscriptions set
    next_renewal_date = p_next_renewal_date,
    amount_jpy   = coalesce(p_amount_jpy, amount_jpy),
    fx_rate      = coalesce(p_fx_rate, fx_rate),
    fx_rate_date = coalesce(p_fx_rate_date, fx_rate_date)
  where id = v_sub.id;

  return true;
end;
$$;

comment on function public.roll_subscription_cycle is
  'cron 専用。サブスクの支払い記録と更新日の前進を 1 トランザクションで原子的に行う。'
  'サブスク行を FOR UPDATE で固定してからスナップショットと突合せるため、'
  '「記録だけ入って更新日が進まない」「古い金額で記録される」が起きない。';

-- クライアント（anon/authenticated）からは呼べない。
revoke execute on function public.roll_subscription_cycle(
  uuid, date, public.sub_currency, numeric, public.sub_cycle, integer,
  jsonb, date, integer, numeric, date
) from public, anon, authenticated;

grant execute on function public.roll_subscription_cycle(
  uuid, date, public.sub_currency, numeric, public.sub_cycle, integer,
  jsonb, date, integer, numeric, date
) to service_role;
