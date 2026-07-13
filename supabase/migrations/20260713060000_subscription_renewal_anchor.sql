-- サブスクの「本来の課金日」を保持する。
--
-- 問題: 月末の課金日は短い月で丸めるしかない (1/31 の月次課金 → 2/28)。
-- ところが cron が丸めた 2/28 を next_renewal_date に保存すると、**次回はその 28 日が基準になり**、
-- 3/28 → 4/28 … と、以後ずっと 28 日課金に化ける。日付だけでは 31 日を復元できない。
--
-- 対策: 本来の課金日 (1-31) を別に持ち、ロールのたびにそこから丸め直す。
-- 1/31 → 2/28 → **3/31** と正しく戻る。
alter table public.subscriptions
  add column renewal_anchor_day smallint
    check (renewal_anchor_day between 1 and 31);

-- 既存行は現在の更新日の「日」を本来の課金日とみなす
update public.subscriptions
  set renewal_anchor_day = extract(day from next_renewal_date)::smallint
  where renewal_anchor_day is null;

-- anchor の維持は DB 側で完結させる。クライアントは next_renewal_date だけ送れば良い。
--
-- ここが肝: **cron のロールフォワードで anchor を付け直してはいけない**。
-- 付け直すと丸めた日 (2/28) が新しい anchor になり、まさに防ぎたい 28 日固定化が起きる。
-- ユーザーが課金日を編集したのか、cron が期を進めただけなのかを **ロール** で区別する
-- (ユーザー = authenticated / cron = service_role)。
create or replace function public.set_renewal_anchor()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    new.renewal_anchor_day := extract(day from new.next_renewal_date)::smallint;
    return new;
  end if;

  if current_user <> 'service_role'
     and new.next_renewal_date is distinct from old.next_renewal_date then
    -- ユーザーが課金日を変えた → 本来の課金日も変わった
    new.renewal_anchor_day := extract(day from new.next_renewal_date)::smallint;
  else
    -- cron のロールフォワード、または課金日以外の編集 → anchor は保持する
    new.renewal_anchor_day := old.renewal_anchor_day;
  end if;
  return new;
end;
$$;

comment on function public.set_renewal_anchor() is
  '本来の課金日を保持する。cron(service_role) のロールでは付け直さない（丸めた日で固定化するため）。';

create trigger set_renewal_anchor_on_write
  before insert or update on public.subscriptions
  for each row execute function public.set_renewal_anchor();

-- 列は **nullable のままにする**。
-- not null にすると `supabase gen types` が Insert の必須項目として型を吐き、
-- クライアントに anchor の存在を意識させることになる（トリガが必ず埋めるのに）。
-- 万一トリガが外れて null が残っても、cron 側は next_renewal_date の日にフォールバックする。
