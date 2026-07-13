-- サブスクの支払いを「更新日が来たその場で」台帳に記録できるようにする。
--
-- これまで支払いの記録は cron (service_role) だけが行っていた。そのため
-- **更新日が今日/過去のサブスクを登録しても、次の cron (JST 00:00) まで
-- 台帳・残高・グラフに出ない**。登録した本人からは「効いていない」ように見える。
--
-- 更新日が **未来** のサブスクが出ないのは正しい（まだ課金されていない）。
-- 直すのは「到来済みなのに出ない」ケース。
--
-- ---------------------------------------------------------------------------
-- 設計: **ロールフォワードの計算を SQL に一本化する。**
--
-- クライアント用に SQL 側でも計算すると、Go (cron) と 2 箇所に同じロジックが生まれる。
-- next_renewal_date の食い違いは **二重計上や欠落に直結する**（許可リストを 2 箇所に
-- 置くとズレるのと同じ）。cron も同じ SQL を呼ぶようにして、計算は 1 箇所だけにする。
--
-- SQL は外部 API を叩けないので、USD で fx_rates にレートが無い日は
-- **そこで止めて「必要な日付」を返す**。cron がそれを取得して upsert し、呼び直す。
-- ---------------------------------------------------------------------------

-- ---- 1) ロールフォワード（Go の renewal.Next と同じ規則） ----
--
-- 月末の課金日は短い月で丸めるしかない (1/31 → 2/28)。
-- ところが丸めた 2/28 を次回の基準にすると 3/28 に化け、以後ずっと 28 日課金になる。
-- **本来の課金日 (anchor) から毎回丸め直す**ので 1/31 → 2/28 → 3/31 と戻る。
--
-- 日を 1 に固定してから月を足す（+ interval '1 month' は 1/31 を 2/28 に丸めてくれるが、
-- anchor を復元できないので使わない）。
create or replace function public.next_renewal_after(
  p_current date,
  p_cycle public.sub_cycle,
  p_anchor integer
)
returns date
language sql
immutable
set search_path = ''
as $$
  with base as (
    select (date_trunc('month', p_current)
            + (case when p_cycle = 'yearly' then interval '12 months' else interval '1 month' end)
           )::date as first_of_month
  ),
  bounds as (
    -- anchor 未設定（既存行）は現在の日をそのまま使う
    select first_of_month,
           coalesce(nullif(p_anchor, 0), extract(day from p_current)::integer) as anchor,
           extract(day from (first_of_month + interval '1 month' - interval '1 day'))::integer as last_day
      from base
  )
  select (first_of_month + (least(anchor, last_day) - 1) * interval '1 day')::date
    from bounds;
$$;

comment on function public.next_renewal_after is
  '次の更新日。本来の課金日 (anchor) から毎回丸め直すので、月末課金が 28 日に固定化しない。';

-- ---- 2) 精算（到来済みの支払いを記録して更新日を進める） ----
--
-- security definer である点が重要:
--   * authenticated から呼べるようにするため（自分のサブスクだけ）
--   * ただし definer だと current_user が関数の所有者になり、
--     guard_subscription_txn（current_user <> 'service_role' なら PT403）に **自分で弾かれる**
--   → トランザクション局所の設定で「精算中である」ことを示し、トリガはそれを見る
create or replace function public.settle_subscription(p_subscription_id uuid)
returns table (recorded integer, needs_fx_on date)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_sub public.subscriptions;
  v_today date := public.jst_today();
  v_category uuid;
  v_due date;
  v_amount integer;
  v_rate numeric;
  v_rate_date date;
  v_last_rate numeric;
  v_last_rate_date date;
  v_count integer := 0;
  v_caller_household text := (auth.jwt() ->> 'household_id');
  v_caller_member text := (auth.jwt() ->> 'member_id');
begin
  recorded := 0;
  needs_fx_on := null;

  select * into v_sub from public.subscriptions where id = p_subscription_id for update;
  if not found then
    return next;
    return;
  end if;

  -- service_role (cron) は全件を精算できる。authenticated は **自分のサブスクだけ**。
  --
  -- **current_user を見てはいけない。** security definer の中では current_user も
  -- session_user も **関数の所有者 (postgres)** になり、呼び出し元のロールは分からない。
  -- （実測: service_role で呼んでも current_user = postgres。
  --   これで判定すると cron が自分の PT403 に弾かれる）
  -- 呼び出し元のロールは `role` の設定に残っているので、そちらを見る。
  if coalesce(current_setting('role', true), '') <> 'service_role' then
    if v_caller_household is null or v_caller_member is null
       or v_sub.household_id <> v_caller_household
       or v_sub.owner_member_id <> v_caller_member
    then
      raise exception '自分のサブスクだけが精算できます' using errcode = 'PT403';
    end if;
  end if;

  -- 解約検討中は課金されない前提
  if v_sub.status not in ('active', 'trial') then
    return next;
    return;
  end if;

  -- 更新日が未来 = まだ課金されていない。何もしない（これは正常）。
  if v_sub.next_renewal_date > v_today then
    return next;
    return;
  end if;

  select id into v_category
    from public.categories
    where household_id = v_sub.household_id and kind = 'expense' and name = 'サブスク';
  if v_category is null then
    raise exception 'household % に支出カテゴリ「サブスク」がありません', v_sub.household_id
      using errcode = 'PT404';
  end if;

  v_due := v_sub.next_renewal_date;

  -- guard_subscription_txn に「これは精算経路の挿入だ」と伝える。
  --
  -- **挿入ループの前後だけに限る。** トランザクション局所の設定は
  -- **トランザクションの最後まで残る**ので、立てっぱなしにすると
  -- 同じトランザクション内の後続の挿入までガードを素通りしてしまう。
  -- （PostgREST は 1 リクエスト = 1 トランザクションなので現状は悪用できないが、
  --   フラグの寿命を挿入の間だけに絞る方が安全）
  perform set_config('app.settling_subscription', 'on', true);

  -- 到来した更新日をすべて記録する。
  -- cron が数ヶ月止まっていたなら、その回数ぶん実際に課金されている。
  while v_due <= v_today loop
    if v_sub.currency = 'USD' then
      -- **その支払日のレート**で確定する。今日のレートで過去分を記録すると月次収支が狂う。
      -- 為替市場は週末・祝日に閉まるので、その日以前の直近を使う（7日以内に限る）。
      select rate, rate_date into v_rate, v_rate_date
        from public.fx_rates
        where base = 'USD' and quote = 'JPY'
          and rate_date <= v_due and rate_date > v_due - 7
        order by rate_date desc
        limit 1;

      if v_rate is null then
        -- SQL からは為替 API を叩けない。ここで止め、必要な日付を返す。
        -- cron がその日のレートを取得して upsert し、呼び直す。
        needs_fx_on := v_due;
        exit;
      end if;

      v_amount := round(v_sub.original_amount * v_rate)::integer;
      v_last_rate := v_rate;
      v_last_rate_date := v_rate_date;
    else
      v_amount := v_sub.amount_jpy;
    end if;

    -- 二重計上は unique(subscription_id, occurred_on) が弾く。
    -- cron と同時に走っても、再実行しても増えない。
    insert into public.transactions (
      household_id, owner_member_id, type, amount, category_id, memo, occurred_on, subscription_id
    ) values (
      v_sub.household_id, v_sub.owner_member_id, 'expense',
      v_amount, v_category, v_sub.name, v_due, v_sub.id
    )
    on conflict (subscription_id, occurred_on) where subscription_id is not null
    do nothing;

    v_count := v_count + 1;
    v_due := public.next_renewal_after(v_due, v_sub.cycle, v_sub.renewal_anchor_day);
  end loop;

  -- 印を下ろす。ここから先は通常のガードが効く。
  perform set_config('app.settling_subscription', 'off', true);

  -- 記録できたぶんだけ更新日を進める。
  -- レートが無くて途中で止まったら、そこが次の更新日になる（残りは cron が拾う）。
  if v_due <> v_sub.next_renewal_date then
    update public.subscriptions set
      next_renewal_date = v_due,
      amount_jpy   = coalesce(v_amount, amount_jpy),
      fx_rate      = coalesce(v_last_rate, fx_rate),
      fx_rate_date = coalesce(v_last_rate_date, fx_rate_date)
    where id = v_sub.id;
  end if;

  recorded := v_count;
  return next;
end;
$$;

comment on function public.settle_subscription is
  '到来済みの支払いを台帳に記録し、更新日を進める。cron とクライアントの両方が呼ぶ。'
  'USD でレートが無い日は止めて needs_fx_on を返す（SQL は為替 API を叩けないため）。';

-- ---- 3) authenticated 向け: 自分のサブスクをまとめて精算 ----
create or replace function public.settle_my_subscriptions()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_household text := (auth.jwt() ->> 'household_id');
  v_member text := (auth.jwt() ->> 'member_id');
  v_id uuid;
  v_total integer := 0;
  v_result record;
begin
  if v_household is null or v_member is null then
    raise exception 'missing household/member claim' using errcode = 'PT403';
  end if;

  for v_id in
    select id from public.subscriptions
     where household_id = v_household
       and owner_member_id = v_member
       and status in ('active', 'trial')
       and next_renewal_date <= public.jst_today()
  loop
    select * into v_result from public.settle_subscription(v_id);
    v_total := v_total + coalesce(v_result.recorded, 0);
  end loop;

  return v_total;
end;
$$;

comment on function public.settle_my_subscriptions is
  '自分の到来済みサブスクをまとめて精算する。登録・編集の直後にクライアントが呼ぶ。';

-- ---- 4) トリガ: 精算経路からの挿入だけを通す ----
--
-- これまでは current_user = 'service_role' だけを通していた。
-- security definer の精算関数は current_user が所有者になるため、そのままだと弾かれる。
-- **「精算中である」という印**を見る形に変える（印は精算関数だけが立てる。
-- トランザクション局所なので他へ漏れない）。
create or replace function public.guard_subscription_txn()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  -- 精算関数（settle_subscription）からの挿入。cron もクライアントもここを通る。
  if coalesce(current_setting('app.settling_subscription', true), '') = 'on' then
    return new;
  end if;

  -- cron が直接書く経路（roll_subscription_cycle）も引き続き許す
  if current_user = 'service_role' then
    return new;
  end if;

  if new.subscription_id is not null then
    raise exception 'subscription_id 付きの取引は精算経路のみが作成できます'
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

-- ---- 5) 権限 ----
-- 精算は authenticated から呼べる（自分のぶんだけ。関数内で household/member を検査する）。
grant execute on function public.settle_my_subscriptions() to authenticated, service_role;

-- 単体の精算は cron 専用。クライアントは settle_my_subscriptions 経由で呼ぶ
-- （こちらを直接開けると、id さえ知っていれば他人のサブスクの精算を試せてしまう。
--   関数内でも弾いているが、入口を絞る方が確実）。
revoke execute on function public.settle_subscription(uuid) from public, anon, authenticated;
grant execute on function public.settle_subscription(uuid) to service_role;

-- ---- 6) 旧 RPC を落とす ----
-- roll_subscription_cycle は「Go が計算した支払いを受け取って書く」ものだった。
-- 計算を SQL に一本化したので、呼ぶ人がいない。残すと
-- 「どちらが正なのか」が分からなくなるデッドコードになる。
drop function if exists public.roll_subscription_cycle(
  uuid, date, public.sub_currency, numeric, public.sub_cycle, integer,
  jsonb, date, integer, numeric, date
);
