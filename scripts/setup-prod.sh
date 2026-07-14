#!/usr/bin/env bash
# yuruwollet 本番セットアップ。.env を読んで、自動化できる部分をすべて実行する。
#
#   cp .env.example .env && (値を埋める) && make setup-prod
#
# 冪等: 何度実行しても壊れない（既にあるものは作り直さない）。
# 途中で失敗したら、原因を直して再実行すればよい。
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

# ---------------------------------------------------------------- helpers
step() { printf '\n\033[1;36m== %s\033[0m\n' "$*"; }
info() { printf '   %s\n' "$*"; }
ok() { printf '   \033[32m✓\033[0m %s\n' "$*"; }
die() {
  printf '\n\033[31m✗ %s\033[0m\n' "$*" >&2
  exit 1
}

[ -f .env ] || die ".env がありません。cp .env.example .env して値を埋めてください。"

# **source を使わない。**
# bash は行を shell の構文として解釈するため、JSON の値
#   SUPABASE_SIGNING_KEY={"kty":"EC",...}
# からクォートを剥がしてしまう（→ {kty:EC,...}）。それが Pages の secret に入り、
# Pages Function の JSON.parse が落ちて /api/session が毎回 500 になる。
# env_export.py は値をテキストとして読み、shlex.quote で包み直す。
eval "$(python3 scripts/env_export.py .env)" || die ".env を読めませんでした"

require() {
  for name in "$@"; do
    [ -n "${!name:-}" ] || die ".env の $name が空です（docs/DEPLOY.md 参照）"
  done
}

require SUPABASE_URL SUPABASE_ANON_KEY SUPABASE_SERVICE_ROLE_KEY DATABASE_URL \
  EMAIL_YURURI EMAIL_SHIYOWO \
  CLOUDFLARE_ACCOUNT_ID CLOUDFLARE_API_TOKEN CF_TEAM_NAME APP_HOSTNAME \
  GOOGLE_CLIENT_ID GOOGLE_CLIENT_SECRET

# 署名鍵は URL やキーからは導出できない。Pages Function が JWT を自分で発行するため必須。
if [ -z "${SUPABASE_JWT_SECRET:-}" ] && [ -z "${SUPABASE_SIGNING_KEY:-}" ]; then
  die "SUPABASE_JWT_SECRET か SUPABASE_SIGNING_KEY のどちらかを埋めてください（.env の 1) 参照）"
fi

# ES256 を選んだ場合、鍵は JWK（JSON）。壊れた JSON を secret に入れると
# /api/session が 500 になる。**入れる前に**弾く。
if [ -n "${SUPABASE_SIGNING_KEY:-}" ]; then
  python3 -c "
import json, sys
try:
    jwk = json.loads(sys.argv[1])
except Exception as e:
    sys.exit(f'SUPABASE_SIGNING_KEY が JSON として読めません: {e}\n'
             '.env ではシングルクォートで囲んでください: SUPABASE_SIGNING_KEY=\'{\"kty\":...}\'')
for f in ('kty', 'alg'):
    if f not in jwk:
        sys.exit(f'SUPABASE_SIGNING_KEY に {f} がありません')
" "$SUPABASE_SIGNING_KEY" || die "SUPABASE_SIGNING_KEY が不正です"
fi

# 末尾の / があると PostgREST の URL が壊れる
SUPABASE_URL="${SUPABASE_URL%/}"

case "$SUPABASE_URL" in
https://*.supabase.co) ;;
*) die "SUPABASE_URL は https://<ref>.supabase.co の形にしてください（今: ${SUPABASE_URL}）" ;;
esac

case "$DATABASE_URL" in
postgresql://* | postgres://*) ;;
*) die "DATABASE_URL は postgresql://... の接続文字列にしてください" ;;
esac
# Transaction pooler(6543) は DDL/prepared statement に使えず migration が失敗する
case "$DATABASE_URL" in
*:6543*) die "DATABASE_URL に Transaction pooler(6543) は使えません。ダッシュボードの Connect → **Session pooler** の接続文字列にしてください" ;;
esac

# 導出値
ACCESS_TEAM_DOMAIN="https://${CF_TEAM_NAME}.cloudflareaccess.com"
PAGES_PROJECT="yuruwollet"

# ---------------------------------------------------------------- A. Supabase
step "A. Supabase — スキーマを本番へ適用"

# --db-url なら link も access token も DB パスワードも要らない。
# 適用済み migration は remote の履歴テーブルで管理されるので、再実行しても二重適用しない。
npx --yes supabase db push --db-url "$DATABASE_URL"
ok "migration 適用済み（households / profiles / categories も投入される）"

step "A. Supabase — メンバーのメールを設定"
for pair in "yururi:${EMAIL_YURURI}" "shiyowo:${EMAIL_SHIYOWO}"; do
  member="${pair%%:*}"
  email="${pair#*:}"
  status=$(curl -sS -o /tmp/yw-profile.json -w '%{http_code}' \
    -X PATCH "${SUPABASE_URL}/rest/v1/profiles?member_id=eq.${member}" \
    -H "apikey: ${SUPABASE_SERVICE_ROLE_KEY}" \
    -H "Authorization: Bearer ${SUPABASE_SERVICE_ROLE_KEY}" \
    -H "Content-Type: application/json" \
    -H "Prefer: return=representation" \
    -d "{\"email\":\"${email}\"}")
  [ "$status" = "200" ] || {
    cat /tmp/yw-profile.json >&2
    die "profiles.email の更新に失敗しました (HTTP $status)"
  }
  python3 -c "
import json, sys
rows = json.load(open('/tmp/yw-profile.json'))
if len(rows) != 1:
    sys.exit('member_id=${member} の行が見つかりません（db push は成功していますか）')
if rows[0].get('email') != '${email}':
    sys.exit('email が反映されていません: ' + repr(rows[0].get('email')))
" || die "profiles.email の確認に失敗しました"
  ok "${member} → ${email}"
done

# ---------------------------------------------------------------- C. Access
# Pages より先に作る。AUD が決まらないと Pages の env を確定できないため。
step "C. Cloudflare Access — Google IdP / アプリ / この2人だけ通すポリシー"

ACCESS_AUD="$(python3 scripts/setup_access.py)"
[ -n "$ACCESS_AUD" ] || die "AUD タグを取得できませんでした"

# ---------------------------------------------------------------- B. Pages
step "B. Cloudflare Pages — プロジェクト"

export CLOUDFLARE_API_TOKEN CLOUDFLARE_ACCOUNT_ID
if npx --yes wrangler pages project list 2>/dev/null | grep -q "\b${PAGES_PROJECT}\b"; then
  ok "Pages プロジェクトは作成済み (${PAGES_PROJECT})"

  # **production branch が main であることを確認する。**
  # 別ブランチで最初に作られていると、`--branch main` のデプロイは preview 扱いになり、
  # 本番 URL は古い内容を出し続ける（デプロイは成功と報告される）。
  python3 - <<'PY' || die "Pages プロジェクトの production branch を確認できませんでした"
import json, os, sys, urllib.request, urllib.error

acct = os.environ["CLOUDFLARE_ACCOUNT_ID"]
tok = os.environ["CLOUDFLARE_API_TOKEN"]
base = f"https://api.cloudflare.com/client/v4/accounts/{acct}/pages/projects/yuruwollet"


def call(method, body=None):
    req = urllib.request.Request(
        base,
        method=method,
        data=json.dumps(body).encode() if body else None,
        headers={"Authorization": f"Bearer {tok}", "Content-Type": "application/json"},
    )
    return json.load(urllib.request.urlopen(req))["result"]


current = call("GET").get("production_branch")
if current == "main":
    print("   ✓ production branch = main")
    sys.exit(0)

print(f"   production branch が {current!r} でした。main に直します。")
call("PATCH", {"production_branch": "main"})
print("   ✓ production branch を main に更新しました")
PY
else
  npx --yes wrangler pages project create "$PAGES_PROJECT" --production-branch main >/dev/null
  ok "Pages プロジェクトを作成 (${PAGES_PROJECT})"
fi

step "B. Cloudflare Pages — 環境変数（実行時。Functions が読む）"
put_secret() { # put_secret NAME VALUE
  printf '%s' "$2" |
    (cd frontend && npx --yes wrangler pages secret put "$1" --project-name "$PAGES_PROJECT" >/dev/null)
  ok "$1"
}
put_secret SUPABASE_URL "$SUPABASE_URL"
put_secret EMAIL_YURURI "$EMAIL_YURURI"
put_secret EMAIL_SHIYOWO "$EMAIL_SHIYOWO"
# ACCESS_* は必ず 2 つ揃えて入れる（片方だけだと /api/session は 500 で拒否する）
put_secret ACCESS_TEAM_DOMAIN "$ACCESS_TEAM_DOMAIN"
put_secret ACCESS_AUD "$ACCESS_AUD"
# 署名方式は 1 つだけ。**使わない方の secret は消す。**
# ランタイムは SUPABASE_SIGNING_KEY(ES256) を優先するので、ES256 → HS256 に切り替えても
# 古い ES256 の secret が残っていると **古い鍵が使われ続け、切替が効かない**。
delete_secret() { # delete_secret NAME（無ければ黙って成功）
  (cd frontend && npx --yes wrangler pages secret delete "$1" \
    --project-name "$PAGES_PROJECT" >/dev/null 2>&1) && info "$1 を削除（未使用の署名鍵）" || true
}
if [ -n "${SUPABASE_SIGNING_KEY:-}" ]; then
  put_secret SUPABASE_SIGNING_KEY "$SUPABASE_SIGNING_KEY"
  delete_secret SUPABASE_JWT_SECRET
else
  put_secret SUPABASE_JWT_SECRET "$SUPABASE_JWT_SECRET"
  delete_secret SUPABASE_SIGNING_KEY
fi

# **本番に認証バイパスを残さない。**
# DEV_BYPASS_EMAIL が入っていると、Access ヘッダの無いリクエストをその人として通しうる。
# コード側でも二重に無効化しているが（session.ts の accessMode()。ACCESS_* が揃っていると
# バイパスは効かず、片方だけなら fail closed）、**secret 自体を消しておく**。
# 誰かが手で入れてしまっても、setup-prod を流せば必ず消える。
delete_secret DEV_BYPASS_EMAIL

step "B. Cloudflare Pages — フロントをビルドしてデプロイ"
# VITE_ は **ビルド時**にバンドルへ焼き込まれる。Pages の環境変数では届かない。
VITE_SUPABASE_URL="$SUPABASE_URL" \
  VITE_SUPABASE_ANON_KEY="$SUPABASE_ANON_KEY" \
  npm run build --workspace @yuruwollet/frontend
# functions/ を拾わせるため frontend から実行する（ルートから叩くと /api/session が消える）。
# --branch main は必須: wrangler は **git のブランチ名**でデプロイ先を決めるため、
# 作業ブランチのまま実行すると preview にだけ出て、本番は "Nothing is here yet" のままになる。
(cd frontend && npx --yes wrangler pages deploy dist \
  --project-name "$PAGES_PROJECT" --branch main --commit-dirty=true)
ok "デプロイ完了（production）"

# ---------------------------------------------------------------- D. Cron Worker
step "D. Go Cron Worker — secret を登録してデプロイ"
(
  cd backend
  printf '%s' "$SUPABASE_URL" | npx --yes wrangler secret put SUPABASE_URL >/dev/null
  printf '%s' "$SUPABASE_SERVICE_ROLE_KEY" | npx --yes wrangler secret put SUPABASE_SERVICE_ROLE_KEY >/dev/null
)
ok "secret 登録"
make build-backend
(cd backend && npx --yes wrangler deploy)
ok "Cron Worker デプロイ完了（毎日 JST 00:00）"

# ---------------------------------------------------------------- 仕上げ
step "完了"
cat <<EOF

  アプリ: https://${APP_HOSTNAME}

  ⚠️ カスタムドメインは割り当てないこと。
     自分のゾーンに Pages のカスタムドメインを足すと、同じゾーンの他のサイトが 403 になる
     （証明書がホスト個別に発行され、ブラウザの接続再利用時に Cloudflare が弾く）。
     詳細と再現方法は docs/DEPLOY.md の B-3。

  確認（docs/DEPLOY.md の F）:
    - 許可していない Google アカウントで開いて **拒否される**こと（最重要）
    - ${EMAIL_YURURI} / ${EMAIL_SHIYOWO} でログインできること
    - 各自マイページから初期残高を入れる
    - 翌日、Supabase の fx_rates に当日の行が入っていること（cron が動いた証拠）

EOF
