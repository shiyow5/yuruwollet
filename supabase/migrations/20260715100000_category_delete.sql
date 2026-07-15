-- カテゴリを削除できるようにする（#75）
--
-- ## 現状の問題
--
-- - フロントに削除機能が無く、アーカイブのみ（CategoryManager）。
-- - 削除ポリシー（categories_delete）は is_system = false を要求するが、
--   **「デフォルト（seed）」と「ユーザー追加」を区別する手段が無い**
--   （seed のデフォルトカテゴリも is_system = false）。
--
-- ユーザーの要望: デフォルトはアーカイブでよいが、後から追加したものは削除したい。
-- そのために is_default 列を足して区別する。

alter table public.categories
  add column is_default boolean not null default false;

comment on column public.categories.is_default is
  'seed で投入したデフォルトカテゴリ。true はアーカイブのみ可・削除不可。ユーザー追加は false。';

-- 既存環境: seed で入れたデフォルトカテゴリに印を付ける。
-- **ユーザーが後から追加したもの（カラオケ等）は false のまま**にしたいので、
-- 「is_system=false 全部」ではなく **name を明示**して更新する。
-- 新規環境（db reset）でも、seed_baseline（20260712141714）の後にこの migration が
-- 走るので、同じ行に印が付く。
update public.categories set is_default = true
where is_system = false
  and (kind::text, name) in (
    ('expense', '食費'),
    ('expense', '友好費'),
    ('expense', '交通費'),
    ('expense', '学祭関連'),
    ('expense', '光熱費'),
    ('expense', 'その他'),
    -- **「サブスク」は消させない。** settle_subscription が name = 'サブスク' で参照し、
    -- 無いと精算が PT404 で失敗する（20260713070000 で seed）。ユーザー追加ではないので
    -- デフォルト扱いにして削除不可にする。
    ('expense', 'サブスク'),
    ('income', 'バイト代'),
    ('income', '仕送り'),
    ('income', 'その他')
  );

-- 削除ポリシー: システムでもデフォルトでもないカテゴリだけ削除できる。
-- （デフォルトはアーカイブのみ。取引で使われているものは transactions.category_id の
--   FK `on delete restrict` が別途止める＝使用中は消せない。）
drop policy categories_delete on public.categories;
create policy categories_delete on public.categories for delete to authenticated
  using (
    household_id = (select auth.jwt() ->> 'household_id')
    and is_system = false
    and is_default = false
  );
