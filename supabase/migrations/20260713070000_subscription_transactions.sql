-- サブスクの支払いを台帳に記録できるようにする。
--
-- これまでサブスクは subscriptions テーブルにあるだけで、支出取引を生成する経路が無かった。
-- そのため毎月、サブスクの支払額ぶん **アプリの計算残高と実際の残高がズレ**、
-- 24日の壁が毎月「ズレています」と言い、ユーザーが「残高調整」で消すことになる。
-- 残高調整はカテゴリを持たないので、**サブスク代がカテゴリ別グラフから消える**。

-- ---- 1) サブスク用の支出カテゴリ ----
-- cron が名前で引くので、この名前で固定する（残高調整と同じ方式）。
-- ユーザーが削除・改変できないよう is_system = true にする…のではなく、
-- **通常の支出カテゴリとして扱う**（is_system は「集計から除外する」印であり、
-- サブスク代は集計に **含めるべき** ものだから）。
insert into public.categories (household_id, kind, name, icon, sort_order)
select id, 'expense', 'サブスク', 'subscriptions', 55
from public.households
on conflict (household_id, kind, name) do nothing;

-- ---- 2) 取引が「どのサブスクの、いつぶんの支払いか」を持つ ----
alter table public.transactions
  add column subscription_id uuid references public.subscriptions (id) on delete set null;

-- **二重計上をアプリのロジックに頼らない。**
-- cron は再実行されうるし、数ヶ月遅れて複数期ぶんを一度に追いつくこともある。
-- 「このサブスクの、この更新日ぶん」は 1 件だけ、を DB で保証する。
create unique index transactions_subscription_period_idx
  on public.transactions (subscription_id, occurred_on)
  where subscription_id is not null;

comment on column public.transactions.subscription_id is
  'サブスクの支払いとして自動生成された取引。unique(subscription_id, occurred_on) で二重計上を防ぐ。';

-- ---- 3) service_role だけが subscription_id 付きの取引を作れる ----
-- ユーザーが手で subscription_id を付けると、cron の冪等性（unique 制約）と衝突して
-- その月の自動記録が失敗する。書込は cron 専用にする。
create or replace function public.guard_subscription_txn()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.subscription_id is not null and current_user <> 'service_role' then
    raise exception 'subscription_id 付きの取引は cron のみが作成できます'
      using errcode = 'PT403';
  end if;
  return new;
end;
$$;

comment on function public.guard_subscription_txn() is
  'subscription_id 付きの取引は service_role (cron) のみ。ユーザーが作ると冪等性が壊れる。';

create trigger guard_subscription_txn_on_write
  before insert or update on public.transactions
  for each row execute function public.guard_subscription_txn();
