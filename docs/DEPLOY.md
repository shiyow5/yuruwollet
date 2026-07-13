# 本番化手順（Phase 11）

`yuruwollet` を `https://yuruwollet.shiyow.dev` に公開し、**ゆるり・しよを の 2 人だけ**が
開けるようにするまでの手順。上から順に実行する。

前提: Cloudflare アカウント（`shiyow.dev` を管理下に置いている）と GitHub リポジトリがある。

---

## 0. 全体像

```
        Cloudflare Access（許可した2メールだけ通す / Google ログイン）
                       │
Browser ──▶ Cloudflare Pages（SPA + /api/session）
                       │  Access が Cf-Access-Jwt-Assertion を注入
                       │  Pages Function が検証 → 短命 Supabase JWT を発行
                       ▼
                 Supabase（RLS で household/member を認可）
                       ▲
                       │ service_role
        Cloudflare Cron Worker（Go/WASM・毎日 JST 00:00）
```

必要な作業は 4 つ。**A. Supabase → B. Cloudflare Pages → C. Cloudflare Access → D. Cron Worker**。

---

## A. Supabase（本番プロジェクト）

### A-1. プロジェクトを作る

1. https://supabase.com/dashboard → **New project**
2. **Region: Northeast Asia (Tokyo)** を選ぶ（レイテンシに効く）
3. Database Password は強いものを生成し、**控える**（あとで `SUPABASE_DB_PASSWORD` に使う）
4. 作成後、**Project Settings → General** の **Reference ID**（`abcdefghijklmnop` のような文字列）を控える

### A-2. API キーを控える

**Project Settings → API Keys**:

| 名前 | 用途 | 秘密か |
|---|---|---|
| `anon` / `publishable` key | ブラウザから Supabase を叩く | 公開して良い |
| `service_role` key | **Cron Worker 専用** | **絶対に公開しない** |

### A-3. Supabase JWT の署名鍵を用意する

このアプリは **Pages Function が自前で Supabase JWT を発行する**（Supabase Auth を使わない）。
そのため**署名に使う秘密鍵が手元に必要**。

> **重要**: Supabase の署名鍵（ES256）は **秘密鍵を Supabase から取り出せない**。
> 公式ドキュメント: *"extracting of the private key or shared secret from Supabase is not possible"*。
> **自分で鍵を生成して Supabase にインポートする**のが正しい手順。
> （ダッシュボードで鍵を見に行っても秘密鍵は出てこない）

#### 推奨: ES256 の鍵を自分で作ってインポートする

```bash
cd /home/satosho/yuruwollet/yuruwollet

# 秘密鍵を生成（カレントに JSON が出る。**リポジトリにコミットしない**）
npx supabase gen signing-key --algorithm ES256
```

1. 出力された **秘密鍵 JWK (JSON)** を控える → これが `SUPABASE_SIGNING_KEY`
2. Supabase ダッシュボード → **Project Settings → JWT Keys → Signing Keys**
   → **Add standby key → Import** で、同じ JSON を貼り付ける
3. **Rotate** して、インポートした鍵を **in use（現行鍵）** にする

> Supabase 側は公開鍵だけを持ち、JWT の検証に使う。秘密鍵は手元と Pages の secret にだけ存在する。

#### 代替: 旧来の HS256 JWT secret を使う

**Project Settings → API Keys → JWT Secret** が存在するプロジェクトなら、それをそのまま使える
（*"You can only extract the legacy JWT secret"*）。→ `SUPABASE_JWT_SECRET`

コードは `SUPABASE_SIGNING_KEY`（ES256）を優先し、無ければ `SUPABASE_JWT_SECRET`（HS256）を使う。
**どちらか一方**があれば良い。

### A-4. スキーマを本番へ流す

ローカルから実行する:

```bash
cd /home/satosho/yuruwollet/yuruwollet

# Supabase CLI にログイン（ブラウザが開く）
npx supabase login

# 本番プロジェクトに紐付け（<ref> は A-1 の Reference ID）
npx supabase link --project-ref <ref>

# マイグレーションを本番に適用
npx supabase db push
```

> `db push` はマイグレーションのみを流す。**seed は流れない**。

### A-5. メンバーのメールを入れる

**世帯・メンバー 2 名・カテゴリ（`残高調整` を含む）は `db push` で入っている。**
（`supabase/migrations/20260712141714_seed_baseline.sql` が投入する。`seed.sql` ではない）

残っているのは **email だけ**。リポジトリは public なので実メールはコミットしていない。
Supabase ダッシュボードの **SQL Editor** で実行する:

```sql
update public.profiles set email = '<ゆるりの Gmail>'  where member_id = 'yururi';
update public.profiles set email = '<しよをの Gmail>' where member_id = 'shiyowo';

-- 確認
select member_id, display_name, email, opening_balance from public.profiles order by member_id;
```

> このメールは **B-2a の `EMAIL_YURURI` / `EMAIL_SHIYOWO`** と
> **C-3 の Access ポリシー**に入れるメールと**完全に一致**させること。
> 食い違うと `/api/session` が 403 になる。
>
> 初期残高は 0 で入る。アプリの**マイページから各自が設定**できるので、ここでは 0 のままで良い。

---

## B. Cloudflare Pages（フロント + /api/session）

### B-1. Pages プロジェクトを作る（Direct Upload）

**Git 連携（Connect to Git）は使わない。**
Pages Functions は「Pages プロジェクトのルート直下の `functions/`」しか拾わない。
このリポジトリの Functions は `frontend/functions/api/session.ts` にあるため、
Git 連携でリポジトリルートを指定すると **`/api/session` が配信されず、ログイン後に何も動かない**。

代わりに **Direct Upload**（`wrangler pages deploy` / GitHub Actions）を使う。
`frontend` ディレクトリから叩くので、`frontend/functions` が正しく Functions として束ねられる。

```bash
cd /home/satosho/yuruwollet/yuruwollet

npx wrangler login
npx wrangler pages project create yuruwollet --production-branch main
```

（ダッシュボードから作る場合は **Workers & Pages → Create → Pages → Upload assets**。
Connect to Git は選ばない。）

初回のデプロイは B-2 の環境変数を入れたあとで:

```bash
make deploy-frontend
```

### B-2. 環境変数を入れる

環境変数は **2 種類あり、置く場所が違う**。ここを混同すると動かない。

- **実行時（Pages Functions が読む）** → **Cloudflare Pages の環境変数**に置く
- **ビルド時（Vite がバンドルに焼き込む）** → **ビルドを実行する場所**に渡す
  （GitHub Actions なら GitHub secrets、手元から `make deploy-frontend` するなら `.env`）
  → `VITE_` 接頭辞のものはこちら。**Pages の環境変数に入れても届かない**

#### B-2a. Cloudflare Pages の環境変数（実行時）

**Settings → Environment variables → Production**:

| 変数 | 値 | 種別 |
|---|---|---|
| `SUPABASE_URL` | `https://<ref>.supabase.co` | Plaintext |
| `SUPABASE_SIGNING_KEY` **または** `SUPABASE_JWT_SECRET` | A-3 で用意したもの | **Secret（暗号化）** |
| `EMAIL_YURURI` | ゆるりの Gmail | Secret |
| `EMAIL_SHIYOWO` | しよをの Gmail | Secret |
| `ACCESS_TEAM_DOMAIN` | C-1 で決まる。**C の後に設定** | Plaintext |
| `ACCESS_AUD` | C-3 で決まる。**C の後に設定** | Plaintext |

> **`DEV_BYPASS_EMAIL` は絶対に設定しない。**
> ローカル用の認証バイパス（Access ヘッダが無いリクエストをそのまま信頼する）が本番で有効になる。
>
> なお `ACCESS_AUD` と `ACCESS_TEAM_DOMAIN` が**両方**入っていればコード側で無効化される。
> **片方だけ入っている状態は「設定ミス」として 500 で拒否する**（片方だけ入れた瞬間に
> バイパスが生き返るのを防ぐため）。C-4 では 2 つを**同時に**入れること。

#### B-2b. ビルド時の変数

`VITE_SUPABASE_URL` と `VITE_SUPABASE_ANON_KEY` は **Vite がビルド時にバンドルへ焼き込む**。
渡し忘れると、ローカル用の既定値（`127.0.0.1` + demo anon key）を焼いたバンドルが本番に出る。

- **GitHub Actions からデプロイする場合** → E で GitHub secrets に登録する
- **手元から `make deploy-frontend` する場合** → **`frontend/.env`** に書く
  （Vite は `frontend` を起点に `.env` を探す。**リポジトリルートの `.env` は読まれない**）

```bash
# frontend/.env（gitignore 済み）
VITE_SUPABASE_URL=https://<ref>.supabase.co
VITE_SUPABASE_ANON_KEY=<anon key>
```

### B-3. カスタムドメインを割り当てる

**Custom domains → Set up a custom domain** → `yuruwollet.shiyow.dev`

DNS は同じ Cloudflare アカウントの `shiyow.dev` ゾーンに自動で追加される。
ポートフォリオ本体（`shiyow.dev`）には影響しない。

---

## C. Cloudflare Access（2 人だけに絞る）

**ここを飛ばすと誰でもアプリを開けてしまう。必ず設定する。**

### C-1. Zero Trust をオンボードする

1. Cloudflare ダッシュボード → **Zero Trust**
2. チーム名を決める（例: `shiyow`）→ **team domain は `https://shiyow.cloudflareaccess.com`** になる
3. プランは **Free**（50 席まで）を選ぶ

→ この team domain が `ACCESS_TEAM_DOMAIN`。

### C-2. Google を IdP として登録する

1. Google Cloud Console → **APIs & Services → Credentials → Create OAuth client ID**
   - Application type: **Web application**
   - Authorized redirect URI: `https://<team>.cloudflareaccess.com/cdn-cgi/access/callback`
   - **Client ID / Client Secret** を控える
2. Zero Trust → **Settings → Authentication → Login methods → Add new → Google**
   - 1 で控えた Client ID / Secret を入れる
   - **Test** して成功することを確認

### C-3. アプリケーションを作る

1. Zero Trust → **Access → Applications → Add an application → Self-hosted**
2. 設定:
   - **Application name**: `yuruwollet`
   - **Session Duration**: `1 month`（頻繁な再ログインを避ける）
   - **Public hostname**: `yuruwollet.shiyow.dev`
3. **Policy** を追加:
   - Policy name: `two of us`
   - Action: **Allow**
   - Include → Selector: **Emails** → ゆるりの Gmail と しよをの Gmail を追加
4. Identity providers: **Google のみ**を有効にする
5. 作成後、**Overview の Application Audience (AUD) Tag** を控える → `ACCESS_AUD`

### C-4. Pages に Access の値を入れて再デプロイ

B-2a の `ACCESS_TEAM_DOMAIN` と `ACCESS_AUD` を **2 つ同時に**埋める。
片方だけだと `/api/session` は 500（`incomplete Access configuration`）になる。

環境変数を変えただけでは**動いている Function には反映されない**。必ず再デプロイする:

```bash
cd /home/satosho/yuruwollet/yuruwollet
make deploy-frontend
```

（Direct Upload なので **main への push では再デプロイされない**。
GitHub Actions を使うなら `gh workflow run deploy.yml`、
ダッシュボードなら **Deployments → Retry deployment**。）

---

## D. Cron Worker（為替 / サブスク更新 / keep-alive）

```bash
cd /home/satosho/yuruwollet/yuruwollet/backend

# Cloudflare にログイン
npx wrangler login

# secret を登録（対話的に値を貼る）
npx wrangler secret put SUPABASE_URL              # https://<ref>.supabase.co
npx wrangler secret put SUPABASE_SERVICE_ROLE_KEY # A-2 の service_role key

cd ..
make deploy-backend
```

`make deploy-backend` は **secret が登録済みかを先に確認**し、未登録ならデプロイを止める。

> Cron は `0 15 * * *`（UTC）= **毎日 JST 00:00**。
> 為替の取得・サブスクの更新日ロール・Supabase の keep-alive を行う。
> keep-alive は **Supabase Free の 7 日アイドル自動停止**を避けるためのもので、止めるとアプリが死ぬ。

---

## E. GitHub Actions（デプロイを CI から回す）

`.github/workflows/deploy.yml` は **手動トリガ（workflow_dispatch）**。
`main` への push では自動実行されない（secrets 未設定のうちから main を赤くしないため）。

### E-1. secrets を登録する

```bash
cd /home/satosho/yuruwollet/yuruwollet

gh secret set CLOUDFLARE_API_TOKEN      # Cloudflare → My Profile → API Tokens
gh secret set CLOUDFLARE_ACCOUNT_ID     # Cloudflare ダッシュボード右側の Account ID
gh secret set SUPABASE_ACCESS_TOKEN     # https://supabase.com/dashboard/account/tokens
gh secret set SUPABASE_PROJECT_REF      # A-1 の Reference ID
gh secret set SUPABASE_DB_PASSWORD      # A-1 の DB パスワード

# ビルド時にバンドルへ焼き込む（B-2b）。渡さないとローカル用の既定値が本番に出る
gh secret set VITE_SUPABASE_URL         # https://<ref>.supabase.co
gh secret set VITE_SUPABASE_ANON_KEY    # anon key
```

`CLOUDFLARE_API_TOKEN` に必要な権限:
- **Account → Cloudflare Pages → Edit**
- **Account → Workers Scripts → Edit**

### E-2. 実行する

```bash
gh workflow run deploy.yml
gh run watch
```

### E-3.（任意）main への push で自動デプロイにする

F の確認がすべて通ってから有効にする。`.github/workflows/deploy.yml` の冒頭を変える:

```yaml
on:
  workflow_dispatch:
  push:
    branches: [main]
```

---

## F. 動作確認（必ずやる）

1. **第三者を弾けているか**（最重要）
   - 許可していない Google アカウントで `https://yuruwollet.shiyow.dev` を開く
   - → Access のログイン画面で**拒否される**こと

2. **2 人がログインできるか**
   - ゆるり / しよを それぞれの Gmail でログイン
   - ホームに自分の残高が出ること。相手タブで相手の残高が見えること

3. **全画面に到達できるか**
   - ボトムナビ（スマホ）から ホーム / 家計簿 / サブスク / ウィッシュ / グラフ / マイページ すべて開ける

4. **初期残高を入れる**
   - 各自マイページ → 「初期残高を変える」で今の財布の中身を入力

5. **Realtime が動くか**
   - 2 台でウィッシュリストを開き、片方で追加 → もう片方に出ること

6. **翌日、cron が動いたか**
   - Cloudflare → Workers → `yuruwollet-cron` → **Logs**（`cron: 完了` が出ていること）
   - Supabase → Table Editor → `fx_rates` に当日の行が入っていること
   - **入っていなければ secret の設定漏れ**（cron は失敗として記録される）

---

## トラブルシューティング

| 症状 | 原因 |
|---|---|
| `/api/session` が **404** | Pages Functions が束ねられていない。**Git 連携で作った**か、`wrangler pages deploy` を `frontend` 以外から実行した（B-1） |
| `/api/session` が 403 | `EMAIL_YURURI` / `EMAIL_SHIYOWO` と、Access のポリシーに入れたメールが**食い違っている** |
| `/api/session` が 500 + `incomplete Access configuration` | `ACCESS_AUD` と `ACCESS_TEAM_DOMAIN` の**片方だけ**しか入っていない（B-2a）。両方入れて再デプロイする |
| `/api/session` が 500 | `SUPABASE_SIGNING_KEY` / `SUPABASE_JWT_SECRET` が未設定または不正 |
| ログインできるが Supabase に繋がらない（localhost を見に行く） | `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` を**ビルド時**に渡していない（B-2b / E-1） |
| ログインできるがデータが見えない | seed（`households` / `profiles`）が本番に入っていない（A-4） |
| USD サブスクが登録できない | `fx_rates` が空。cron が 1 回も成功していない（D を確認） |
| 数日後にアプリが応答しない | Supabase が一時停止した。cron の keep-alive が失敗している（D を確認） |
