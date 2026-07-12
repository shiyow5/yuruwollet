-- ============================================================
-- ローカル開発用 seed（`supabase start` / `db reset` 時のみ実行）。
-- 必須ベースライン行（household / profiles / categories）は
-- migration (20260712141714_seed_baseline.sql) で管理しているため、
-- ここには開発用の補助データだけを置く。
-- ============================================================

-- ローカル開発用のプレースホルダ email（本番は Cloudflare Access 側で管理）
update public.profiles set email = 'yururi@example.com'
  where member_id = 'yururi' and email is null;
update public.profiles set email = 'shiyowo@example.com'
  where member_id = 'shiyowo' and email is null;
