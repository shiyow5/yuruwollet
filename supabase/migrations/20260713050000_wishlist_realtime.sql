-- ウィッシュリストを Realtime で配信できるようにする。
--
-- 1) publication に追加しないと postgres_changes が一切飛ばない。
-- 2) replica identity full が無いと、DELETE の old レコードが **主キーのみ** になる。
--    クライアントは `household_id=eq.<id>` でフィルタして購読するため、household_id を持たない
--    old レコードはフィルタに一致せず、**削除イベントだけ受け取れない**（相手の画面から消えない）。
--    RLS の評価も old レコードに対して行われるので、いずれにせよ full が要る。
alter table public.wishlist_items replica identity full;

alter publication supabase_realtime add table public.wishlist_items;
