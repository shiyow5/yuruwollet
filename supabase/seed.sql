-- ============================================================
-- yuruwollet seed: household 1 + メンバー 2 (ゆるり/しよを) + デフォルトカテゴリ
-- email はローカル開発用プレースホルダ。本番の Gmail は Phase 11 で反映。
-- ============================================================

insert into public.households (id, name) values ('main', 'yuruwollet')
on conflict (id) do nothing;

insert into public.profiles (member_id, household_id, display_name, email, opening_balance) values
  ('yururi', 'main', 'ゆるり', 'yururi@example.com', 0),
  ('shiyowo', 'main', 'しよを', 'shiyowo@example.com', 0)
on conflict (member_id) do nothing;

-- system カテゴリ: 残高調整 (household ごとに 1 件)
insert into public.categories (household_id, kind, name, icon, is_system, sort_order) values
  ('main', 'system', '残高調整', 'sync_alt', true, 999)
on conflict (household_id, kind, name) do nothing;

-- デフォルト支出カテゴリ
insert into public.categories (household_id, kind, name, icon, sort_order) values
  ('main', 'expense', '食費', 'restaurant', 10),
  ('main', 'expense', '友好費', 'local_cafe', 20),
  ('main', 'expense', '交通費', 'directions_subway', 30),
  ('main', 'expense', '学祭関連', 'celebration', 40),
  ('main', 'expense', '光熱費', 'bolt', 50),
  ('main', 'expense', 'その他', 'more_horiz', 60)
on conflict (household_id, kind, name) do nothing;

-- デフォルト収入カテゴリ
insert into public.categories (household_id, kind, name, icon, sort_order) values
  ('main', 'income', 'バイト代', 'work', 10),
  ('main', 'income', '仕送り', 'volunteer_activism', 20),
  ('main', 'income', 'その他', 'more_horiz', 30)
on conflict (household_id, kind, name) do nothing;
