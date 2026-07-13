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

### A-2. キーを控える

**Project Settings → API Keys**:

| 名前 | 用途 | 秘密か |
|---|---|---|
| `anon` / `publishable` key | ブラウザから Supabase を叩く | 公開して良い |
| `service_role` key | **Cron Worker 専用** | **絶対に公開しない** |

**Project Settings → JWT Keys** で署名方式を確認する:

- **ES256（新規プロジェクトの既定）** → 「Signing Keys」から**秘密鍵 JWK（JSON）**を取得 → `SUPABASE_SIGNING_KEY`
- **HS256（旧来）** → 「JWT Secret」→ `SUPABASE_JWT_SECRET`

どちらか一方があれば良い。

### A-3. スキーマを本番へ流す

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

### A-4. seed（世帯とメンバー）を入れる

`supabase/seed.sql` はローカル用に固定メールが入っている。本番では**実際の Gmail** が要る。
Supabase ダッシュボードの **SQL Editor** で以下を実行する（`<...>` を置き換える）:

```sql
insert into public.households (id, name) values ('main', 'yuruwollet')
  on conflict (id) do nothing;

insert into public.profiles (member_id, household_id, display_name, email, opening_balance) values
  ('yururi',  'main', 'ゆるり', '<ゆるりの Gmail>',  0),
  ('shiyowo', 'main', 'しよを', '<しよをの Gmail>', 0)
  on conflict (member_id) do update set email = excluded.email;
```

カテゴリ（`残高調整` を含む）は `supabase/seed.sql` の該当部分をコピーして同じく SQL Editor で実行する。

> 初期残高は 0 で入る。アプリの**マイページから各自が設定**できるので、ここでは 0 のままで良い。

---

## B. Cloudflare Pages（フロント + /api/session）

### B-1. Pages プロジェクトを作る

1. Cloudflare ダッシュボード → **Workers & Pages → Create → Pages → Connect to Git**
2. `shiyow5/yuruwollet` を選ぶ
3. ビルド設定:
   - **Framework preset**: なし
   - **Build command**: `npm run build:frontend`
   - **Build output directory**: `frontend/dist`
   - **Root directory**: （空欄＝リポジトリルート）

### B-2. 環境変数を入れる

**Settings → Environment variables → Production**:

| 変数 | 値 | 種別 |
|---|---|---|
| `SUPABASE_URL` | `https://<ref>.supabase.co` | Plaintext |
| `SUPABASE_SIGNING_KEY` **または** `SUPABASE_JWT_SECRET` | A-2 で取得したもの | **Secret（暗号化）** |
| `EMAIL_YURURI` | ゆるりの Gmail | Secret |
| `EMAIL_SHIYOWO` | しよをの Gmail | Secret |
| `VITE_SUPABASE_URL` | `https://<ref>.supabase.co` | Plaintext |
| `VITE_SUPABASE_ANON_KEY` | anon key | Plaintext（ブラウザに出る前提） |
| `ACCESS_TEAM_DOMAIN` | C-1 で決まる。**C の後に設定** | Plaintext |
| `ACCESS_AUD` | C-3 で決まる。**C の後に設定** | Plaintext |

> **`DEV_BYPASS_EMAIL` は絶対に設定しない。**
> 設定するとローカル用の認証バイパスが本番で有効になりうる。
> （なお `ACCESS_AUD` と `ACCESS_TEAM_DOMAIN` が入っていれば、コード側でバイパスは無効化される。
> それでも入れない。）

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

B-2 の表の `ACCESS_TEAM_DOMAIN` と `ACCESS_AUD` を埋めて、Pages を再デプロイする
（**Deployments → Retry deployment**、または main に push）。

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

## E. GitHub Actions（自動デプロイ）

`main` に push したら自動でデプロイされるようにする。

```bash
cd /home/satosho/yuruwollet/yuruwollet

gh secret set CLOUDFLARE_API_TOKEN      # Cloudflare → My Profile → API Tokens
gh secret set CLOUDFLARE_ACCOUNT_ID     # Cloudflare ダッシュボード右側の Account ID
gh secret set SUPABASE_ACCESS_TOKEN     # https://supabase.com/dashboard/account/tokens
gh secret set SUPABASE_PROJECT_REF      # A-1 の Reference ID
gh secret set SUPABASE_DB_PASSWORD      # A-1 の DB パスワード
```

`CLOUDFLARE_API_TOKEN` に必要な権限:
- **Account → Cloudflare Pages → Edit**
- **Account → Workers Scripts → Edit**

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
| `/api/session` が 403 | `EMAIL_YURURI` / `EMAIL_SHIYOWO` と、Access のポリシーに入れたメールが**食い違っている** |
| `/api/session` が 500 | `SUPABASE_SIGNING_KEY` / `SUPABASE_JWT_SECRET` が未設定または不正 |
| ログインできるがデータが見えない | seed（`households` / `profiles`）が本番に入っていない（A-4） |
| USD サブスクが登録できない | `fx_rates` が空。cron が 1 回も成功していない（D を確認） |
| 数日後にアプリが応答しない | Supabase が一時停止した。cron の keep-alive が失敗している（D を確認） |
