-- サブスクの削除を RPC に寄せる（#71）
--
-- ## なぜ RPC が要るのか
--
-- 「サブスクを消すとき、その支払い記録も一緒に消せるようにしたい」を
-- **クライアントの 2 段階では実現できない。**
--
-- 削除ポリシー（20260714010000_subscription_payment_integrity.sql）が
--   and subscription_id is null
-- を要求しているため:
--
--   - サブスクを消す**前**: 支払いは subscription_id 付き → ユーザーには消せない
--   - サブスクを消した**後**: FK の on delete set null で subscription_id が null になり
--     消せるようになるが、**もう「どれがそのサブスクの支払いか」が分からない**
--
-- どちらの順でも成立しない。しかも 2 リクエストに割ると、片方だけ成功したときに
-- 「支払いは消えたのにサブスクは残っている」という戻せない状態になる。
-- **1 トランザクションに閉じる。**
--
-- ## 消さない場合の挙動は変えない
--
-- 既定（p_delete_payments = false）は今までどおり。FK の set null で
-- 支払いは「ただの支出」として台帳に残る。**¥1234 は実際に払ったお金**なので、
-- 解約しても支出の事実と残高から消さないのが既定として正しい。
-- 消したい人（誤登録・テストデータ）だけが明示的に消す。

create or replace function public.delete_subscription(
  p_subscription_id uuid,
  p_delete_payments boolean default false
)
returns integer -- 消した支払いの件数
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_sub public.subscriptions;
  v_caller_household text := (auth.jwt() ->> 'household_id');
  v_caller_member text := (auth.jwt() ->> 'member_id');
  v_deleted integer := 0;
begin
  select * into v_sub from public.subscriptions where id = p_subscription_id;

  -- 既に消えていてもエラーにしない（二重送信・再試行で落とさない）
  if not found then
    return 0;
  end if;

  -- **security definer なので RLS が効かない。所有権を自分で確かめる。**
  -- ここを忘れると、相手のサブスク（と、その支払い記録）を消せる RPC になる。
  if v_sub.household_id is distinct from v_caller_household
     or v_sub.owner_member_id is distinct from v_caller_member
  then
    raise exception '自分のサブスクしか削除できません' using errcode = 'PT403';
  end if;

  if p_delete_payments then
    -- **この関数だけが消せる。** 通常の削除ポリシーは subscription_id is null を
    -- 要求するので、subscription_id 付きの行はユーザーからは消せない。
    --
    -- household / owner は上で検証済みだが、**条件に入れておく**。
    -- definer の中で「id だけ」を条件に delete を書くと、将来この関数に
    -- 別の呼び出し経路が生えたときに他人の行まで消しうる。
    -- is_system_generated（残高調整）は subscription_id を持たないので実際には
    -- 引っかからないが、definer で消す以上、明示的に除外しておく。
    delete from public.transactions
     where subscription_id = p_subscription_id
       and household_id = v_caller_household
       and owner_member_id = v_caller_member
       and is_system_generated = false;
    get diagnostics v_deleted = row_count;
  end if;

  -- 残った支払い（p_delete_payments = false の場合）は FK の on delete set null で
  -- subscription_id が外れ、「ただの支出」として台帳に残る。
  -- その UPDATE は guard_subscription_txn を撃つが、参照先のサブスクが
  -- （このトランザクション内で）既に消えているので通る。
  delete from public.subscriptions where id = p_subscription_id;

  return v_deleted;
end;
$$;

comment on function public.delete_subscription(uuid, boolean) is
  'サブスクを削除する。p_delete_payments = true なら、その支払い記録も同じトランザクションで消す。'
  '呼び出し元の household / member を JWT で検証する（definer なので RLS が効かないため）。';

revoke all on function public.delete_subscription(uuid, boolean) from public, anon;
grant execute on function public.delete_subscription(uuid, boolean) to authenticated;
