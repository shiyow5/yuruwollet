-- #65: サブスクの更新日が大きく過去だと、精算ループが無制限に回る。
--
-- 登録フォームで next_renewal_date に大きく過去（例: 1900-01-01）を選ぶと、
-- settle_subscription の while ループがその周期ぶん回り、**削除できない取引が
-- 数百〜数千件**作られる。subscription_id 付きの取引はガードトリガによって
-- ユーザーが個別に消せないので、手で復旧できない。
--
-- 多層防御で塞ぐ:
--   1) 書き込み時ガード（authoritative）: authenticated が更新日を 1 周期より前に
--      設定する insert/update を拒否する。service_role（cron）と精算経路は素通し。
--   2) 精算ループの上限（保険）: 1 回の settle_subscription で進めるのは最大 N 周期まで。
--      迂回経路や旧データがあっても、無制限には作らない（到達点まで進めて次回に持ち越す）。
--
-- フォーム側（zod）にも同じ下限を置くが、それは UX の先出しで、DB が最終防壁。

-- ---- 1) 書き込み時ガード ----
--
-- 「次の課金日」は 1 周期ぶんまでしか遡れない（monthly=1 ヶ月 / yearly=1 年）。
-- 直近に過ぎた 1 回の課金を拾う正当な用途は残しつつ、数周期ぶんの履歴注入を塞ぐ。
--
-- **service_role と精算中は素通し。** cron は更新日を前へ進めるだけで過去へ後退させない。
-- 数ヶ月遅れの正当な過去埋め（cron 停止からの復帰）を妨げてはいけない。
create or replace function public.guard_renewal_floor()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_floor date;
begin
  -- 精算経路（settle_subscription が立てる印）と cron(service_role) は検査しない。
  if coalesce(current_setting('app.settling_subscription', true), '') = 'on'
     or coalesce(current_setting('role', true), '') = 'service_role'
  then
    return new;
  end if;

  -- 更新で日付が変わっていないなら検査しない（名前・ステータスだけの編集を妨げない。
  -- 旧データが下限より前でも、日付を触らない限り編集できる）。
  if tg_op = 'UPDATE' and new.next_renewal_date is not distinct from old.next_renewal_date then
    return new;
  end if;

  v_floor := public.jst_today()
    - case when new.cycle = 'yearly' then interval '1 year' else interval '1 month' end;

  if new.next_renewal_date < v_floor then
    raise exception '次回更新日は % より前にできません（1 周期ぶんまで遡れます）', v_floor
      using errcode = 'PT400';
  end if;

  return new;
end;
$$;

comment on function public.guard_renewal_floor() is
  '次回更新日を 1 周期より前に設定するユーザー書込を拒否する（精算ループの暴走を防ぐ。#65）。'
  'service_role と精算経路は素通し。';

-- set_renewal_anchor_on_write より名前順で先に発火する（g < s）。
-- 先に下限を検証してから anchor を計算する。
create trigger guard_renewal_floor
  before insert or update on public.subscriptions
  for each row execute function public.guard_renewal_floor();

-- ---- 2) 精算ループに上限を置く ----
--
-- 20260714080000_settle_subscription.sql の settle_subscription に、
-- 1 回の呼び出しで進める周期数の上限（c_max_iterations）を足しただけ。
-- 上限に達したら止め、到達点まで更新日を進める（残りは次回の呼び出しが拾う＝自己回復）。
--
-- 上限は正当な過去埋め（cron 停止からの復帰で数ヶ月ぶん）を十分に上回る。
-- ガード(1)により新規/編集の過去日は 1 周期に抑えられるので、通常この上限には達しない。
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
  v_iterations integer := 0;
  -- 1 回の精算で進めるのは最大 24 周期まで（monthly なら 2 年、yearly なら 24 年）。
  -- 想定外に大きく過去でも、1 呼び出しで無制限に台帳を作らないための上限。
  c_max_iterations constant integer := 24;
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

  if coalesce(current_setting('role', true), '') <> 'service_role' then
    if v_caller_household is null or v_caller_member is null
       or v_sub.household_id <> v_caller_household
       or v_sub.owner_member_id <> v_caller_member
    then
      raise exception '自分のサブスクだけが精算できます' using errcode = 'PT403';
    end if;
  end if;

  if v_sub.status not in ('active', 'trial') then
    return next;
    return;
  end if;

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

  perform set_config('app.settling_subscription', 'on', true);

  -- 到来した更新日をすべて記録する（ただし 1 回あたり c_max_iterations 周期まで）。
  while v_due <= v_today loop
    -- 上限に達したら止める。到達点(v_due)まで更新日を進め、残りは次回に持ち越す。
    exit when v_iterations >= c_max_iterations;
    v_iterations := v_iterations + 1;

    if v_sub.currency = 'USD' then
      select rate, rate_date into v_rate, v_rate_date
        from public.fx_rates
        where base = 'USD' and quote = 'JPY'
          and rate_date <= v_due and rate_date > v_due - 7
        order by rate_date desc
        limit 1;

      if v_rate is null then
        needs_fx_on := v_due;
        exit;
      end if;

      v_amount := round(v_sub.original_amount * v_rate)::integer;
      v_last_rate := v_rate;
      v_last_rate_date := v_rate_date;
    else
      v_amount := v_sub.amount_jpy;
    end if;

    if v_amount > 0 then
      insert into public.transactions (
        household_id, owner_member_id, type, amount, category_id, memo, occurred_on, subscription_id
      ) values (
        v_sub.household_id, v_sub.owner_member_id, 'expense',
        v_amount, v_category, v_sub.name, v_due, v_sub.id
      )
      on conflict (subscription_id, occurred_on) where subscription_id is not null
      do nothing;

      v_count := v_count + 1;
    end if;

    v_due := public.next_renewal_after(v_due, v_sub.cycle, v_sub.renewal_anchor_day);
  end loop;

  if v_due <> v_sub.next_renewal_date then
    update public.subscriptions set
      next_renewal_date = v_due,
      amount_jpy   = coalesce(v_amount, amount_jpy),
      fx_rate      = coalesce(v_last_rate, fx_rate),
      fx_rate_date = coalesce(v_last_rate_date, fx_rate_date)
    where id = v_sub.id;
  end if;

  perform set_config('app.settling_subscription', 'off', true);

  recorded := v_count;
  return next;
end;
$$;

comment on function public.settle_subscription is
  '到来済みの支払いを台帳に記録し、更新日を進める。cron とクライアントの両方が呼ぶ。'
  'USD でレートが無い日は止めて needs_fx_on を返す。1 回で進めるのは最大 24 周期まで（#65）。';

-- 権限は元のまま（単体精算は cron 専用）。念のため再宣言する。
revoke execute on function public.settle_subscription(uuid) from public, anon, authenticated;
grant execute on function public.settle_subscription(uuid) to service_role;
