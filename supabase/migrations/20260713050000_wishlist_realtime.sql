-- ウィッシュリストを Realtime で配信できるようにする。
-- publication に追加しないと postgres_changes が一切飛ばない。
--
-- replica identity full が要る理由（ローカルスタックで実測した挙動）:
--
--   replica identity = default(主キー) のとき
--     INSERT / UPDATE … household フィルタ付きチャンネルに届く（RLS も効き、別 household には届かない）
--     DELETE          … **フィルタ付きチャンネルには届かない**（＝相手が消しても自分の画面から消えない）
--
--   replica identity = full のとき
--     DELETE          … フィルタ付きチャンネルにも届く
--
-- Realtime は old レコードに対してフィルタを評価するため、old が主キーしか持たないと
-- `household_id=eq.<id>` に一致せず、削除イベントが落とされる。
--
-- なお full にしても **配信される old は Realtime 側で主キーだけに切り詰められる**（実測）。
-- 行の中身が購読者に流れることはないので、full による情報の増加は無い。
alter table public.wishlist_items replica identity full;

alter publication supabase_realtime add table public.wishlist_items;

-- 既知の制約（Postgres Changes の仕様）: DELETE はフィルタも RLS も適用されないため、
-- 別 household の購読者にも「削除された行の id」と発生タイミングだけは届く。
-- 現状 household は 1 つしか存在しないため実害は無い。恒久対策（論理削除）は別 Issue。
