# yuruwollet

yururi × shiyowo の二人専用「共同ウォレット」管理アプリ。日々の収支・サブスク・二人のウィッシュリスト・毎月24日の残高確認・目標貯金・グラフを 1 つに統合。

- **ホスティング**: Cloudflare Pages（SPA + Functions） + Cloudflare Workers（Go Cron）
- **DB / Realtime**: Supabase（Postgres, Tokyo）
- **アクセス制御**: Cloudflare Zero Trust（Access）で許可した 2 名（Google ログイン）のみ

## アーキテクチャ

```
Browser (React SPA)  ──同一オリジン──  /api/session (TS Pages Function)
   │  Access(2メール) ゲート                 │ Access JWT 検証 → Supabase JWT 発行
   ├─ CRUD/集計/Realtime → Supabase 直 (RLS: household_id, per-member 書込)
   └─ 24日調整 → Supabase RPC (SECURITY DEFINER)

Cloudflare Cron → Go Worker: 日次為替 / サブスク更新日ロール / keep-alive
```

詳細な設計判断は `docs/ARCHITECTURE.md`、UI モックは `docs/templates/` を参照。

## 構成（モノレポ）

| ディレクトリ | 内容 |
|---|---|
| `frontend/` | Vite + React 19 + TS + Tailwind v4（Cloudflare Pages）。`functions/api/` に Pages Functions |
| `backend/` | Go Cron Worker（`syumai/workers`, WASM） |
| `supabase/` | migrations / seed / config |
| `e2e/` | Playwright |
| `docs/` | ドキュメント・UI テンプレート |

## セットアップ

```bash
make setup        # node + go の依存を導入
make dev          # フロント開発サーバ
make test         # 単体/統合テスト (frontend + backend)
make lint fmt     # lint / フォーマット
make build        # フロント + Go WASM をビルド
make help         # 全ターゲット一覧
```

必要ツール: Node.js 22+ / Go 1.24+ / Docker（Supabase local, Phase 1〜）。

## 開発フロー

Issue → ブランチ → TDD 実装 → PR → CI + レビュー → 修正 → CI 緑でセルフマージ。
スコープ外の問題は都度 Issue 化。
