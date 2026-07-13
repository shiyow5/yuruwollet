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
set -a
# shellcheck disable=SC1091
source .env
set +a

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
CF_API="https://api.cloudflare.com/client/v4"

cf() { # cf <method> <path> [json]
  local method="$1" path="$2" body="${3:-}"
  local args=(-sS -X "$method" "${CF_API}${path}"
    -H "Authorization: Bearer ${CLOUDFLARE_API_TOKEN}"
    -H "Content-Type: application/json")
  [ -n "$body" ] && args+=(-d "$body")
  curl "${args[@]}"
}

cf_ok() { # 標準入力の Cloudflare レスポンスを検証し .result を返す
  local res
  res="$(cat)"
  if [ "$(jq -r '.success' <<<"$res")" != "true" ]; then
    printf '%s\n' "$res" >&2
    die "Cloudflare API が失敗しました（上のエラーを確認してください）"
  fi
  jq -c '.result' <<<"$res"
}

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
  [ "$(jq -r 'length' /tmp/yw-profile.json)" = "1" ] ||
    die "member_id=${member} の行が見つかりません（db push は成功していますか）"
  ok "${member} → ${email}"
done

# ---------------------------------------------------------------- C. Access
# Pages より先に作る。AUD が決まらないと Pages の env を確定できないため。
step "C. Cloudflare Access — Google をログイン方法として登録"

idp_id=$(cf GET "/accounts/${CLOUDFLARE_ACCOUNT_ID}/access/identity_providers" | cf_ok |
  jq -r '.[] | select(.type=="google") | .id' | head -1)

if [ -n "$idp_id" ]; then
  ok "Google IdP は登録済み ($idp_id)"
else
  idp_id=$(cf POST "/accounts/${CLOUDFLARE_ACCOUNT_ID}/access/identity_providers" "$(jq -nc \
    --arg id "$GOOGLE_CLIENT_ID" --arg secret "$GOOGLE_CLIENT_SECRET" \
    '{name:"Google", type:"google", config:{client_id:$id, client_secret:$secret}}')" |
    cf_ok | jq -r '.id')
  ok "Google IdP を登録 ($idp_id)"
fi

step "C. Cloudflare Access — アプリとポリシー（この2人だけ通す）"

app=$(cf GET "/accounts/${CLOUDFLARE_ACCOUNT_ID}/access/apps" | cf_ok |
  jq -c --arg d "$APP_HOSTNAME" '.[] | select(.domain==$d)' | head -1)

policy=$(jq -nc --arg a "$EMAIL_YURURI" --arg b "$EMAIL_SHIYOWO" '{
  name: "two of us",
  decision: "allow",
  include: [ {email:{email:$a}}, {email:{email:$b}} ]
}')

if [ -n "$app" ]; then
  app_id=$(jq -r '.id' <<<"$app")
  ok "Access アプリは作成済み ($app_id)"
else
  app=$(cf POST "/accounts/${CLOUDFLARE_ACCOUNT_ID}/access/apps" "$(jq -nc \
    --arg d "$APP_HOSTNAME" --arg idp "$idp_id" --argjson p "$policy" \
    '{name:"yuruwollet", type:"self_hosted", domain:$d,
      session_duration:"720h", allowed_idps:[$idp], auto_redirect_to_identity:true,
      policies:[$p]}')" | cf_ok)
  app_id=$(jq -r '.id' <<<"$app")
  ok "Access アプリを作成 ($app_id)"
fi

ACCESS_AUD=$(jq -r '.aud' <<<"$app")
[ -n "$ACCESS_AUD" ] && [ "$ACCESS_AUD" != "null" ] || die "AUD タグを取得できませんでした"
ok "AUD = ${ACCESS_AUD}"

# ---------------------------------------------------------------- B. Pages
step "B. Cloudflare Pages — プロジェクト"

export CLOUDFLARE_API_TOKEN CLOUDFLARE_ACCOUNT_ID
if npx --yes wrangler pages project list 2>/dev/null | grep -q "\b${PAGES_PROJECT}\b"; then
  ok "Pages プロジェクトは作成済み (${PAGES_PROJECT})"
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
if [ -n "${SUPABASE_SIGNING_KEY:-}" ]; then
  put_secret SUPABASE_SIGNING_KEY "$SUPABASE_SIGNING_KEY"
else
  put_secret SUPABASE_JWT_SECRET "$SUPABASE_JWT_SECRET"
fi

step "B. Cloudflare Pages — フロントをビルドしてデプロイ"
# VITE_ は **ビルド時**にバンドルへ焼き込まれる。Pages の環境変数では届かない。
VITE_SUPABASE_URL="$SUPABASE_URL" \
  VITE_SUPABASE_ANON_KEY="$SUPABASE_ANON_KEY" \
  npm run build --workspace @yuruwollet/frontend
# functions/ を拾わせるため frontend から実行する（ルートから叩くと /api/session が消える）
(cd frontend && npx --yes wrangler pages deploy dist --project-name "$PAGES_PROJECT" --commit-dirty=true)
ok "デプロイ完了"

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

  残りの手動作業:
    1. Pages にカスタムドメインを割り当てる
       Cloudflare → Workers & Pages → ${PAGES_PROJECT} → Custom domains
         → Set up a custom domain → ${APP_HOSTNAME}

  確認（docs/DEPLOY.md の F）:
    - 許可していない Google アカウントで開いて **拒否される**こと（最重要）
    - ${EMAIL_YURURI} / ${EMAIL_SHIYOWO} でログインできること
    - 各自マイページから初期残高を入れる
    - 翌日、Supabase の fx_rates に当日の行が入っていること（cron が動いた証拠）

EOF
