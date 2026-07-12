# アーキテクチャ

二人専用（**ゆるり / しよを**）の共同ウォレットアプリ。無料枠で完結し、各技術を得意分野に配置する。

## 構成

| 層 | 技術 | 役割 |
|---|---|---|
| フロント | Vite + React 19 + TS + Tailwind v4 | SPA（Cloudflare Pages, `yuruwollet.shiyow.dev`） |
| 認証エッジ | TS Pages Functions（`frontend/functions/api/`） | Access JWT 検証 → 短命 Supabase JWT 発行（`jose` + Web Crypto） |
| 定期処理 | Go Cron Worker（`syumai/workers`, WASM） | 日次為替 / サブスク更新日ロール / keep-alive |
| データ | Supabase Postgres（RLS / RPC / View） + Realtime | CRUD・集計・原子的更新・共有ウィッシュの Realtime |
| ゲート | Cloudflare Access（Zero Trust） | 許可 2 メール（Google）のみ到達可 |

## 認証フロー

1. Cloudflare Access が `yuruwollet.shiyow.dev` を 2 メールに限定（外側ゲート）。
2. ブラウザが同一オリジンの `GET /api/session` を叩く → Access が `Cf-Access-Jwt-Assertion` を注入。
3. Pages Function が Access JWT を検証（JWKS / aud / iss / exp）→ email を `member`(yururi/shiyowo)+`household` に写像 → **短命 Supabase JWT** を発行（`role:authenticated`, `household_id`, `member_id`）。
4. ブラウザは supabase-js を発行 JWT で使い、CRUD・集計・Realtime を **Supabase に直接**。RLS が `auth.jwt()->>'household_id'` で認可。

## データモデルの要点（per-member）

- **残高・台帳・サブスク・貯金は全て個人単位**。各取引は `owner_member_id` を持ち、残高はその人の全期間累積（`opening_balance + Σ収入 − Σ支出`、保存カラムなし）。
- 表示はデフォルト自分の分、**タブ切替で相手の分も閲覧可**（データは household スコープで両者可視、書込は `owner_member_id = JWT member_id` を強制）。
- **ウィッシュリストのみ共有**。registrant は固定名（ゆるり/しよを）。
- 日付は全て **JST**（`AT TIME ZONE 'Asia/Tokyo'`）。24日の壁は各自が自分の残高を補正、テスト用に注入可能クロックを持つ。
- USD サブスクは**概算**表示（更新日到来時に cron が実レート確定）。

詳細な設計判断・フェーズ計画は実装計画（`~/.claude/plans/`）を参照。UI モックは `docs/templates/`。
