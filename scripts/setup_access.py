#!/usr/bin/env python3
"""Cloudflare Access を構築し、AUD タグを標準出力に返す。

- Google IdP を登録（既にあれば再利用）
- Self-hosted アプリを作成（既にあれば再利用）し、許可した 2 メールだけ通すポリシーを付ける

環境変数から入力を読む（setup-prod.sh が .env を export して呼ぶ）。
進捗は stderr に出す。**stdout には AUD だけ**を出す（呼び出し側が変数に取るため）。
"""

import json
import os
import sys
import urllib.error
import urllib.request

API = "https://api.cloudflare.com/client/v4"


def env(name: str) -> str:
    value = os.environ.get(name, "")
    if not value:
        sys.exit(f"環境変数 {name} が空です")
    return value


ACCOUNT = env("CLOUDFLARE_ACCOUNT_ID")
TOKEN = env("CLOUDFLARE_API_TOKEN")
HOSTNAME = env("APP_HOSTNAME")
EMAILS = [env("EMAIL_YURURI"), env("EMAIL_SHIYOWO")]
GOOGLE_ID = env("GOOGLE_CLIENT_ID")
GOOGLE_SECRET = env("GOOGLE_CLIENT_SECRET")


def log(msg: str) -> None:
    print(f"   {msg}", file=sys.stderr)


def call(method: str, path: str, body: dict | None = None):
    req = urllib.request.Request(
        f"{API}{path}",
        method=method,
        data=json.dumps(body).encode() if body is not None else None,
        headers={
            "Authorization": f"Bearer {TOKEN}",
            "Content-Type": "application/json",
        },
    )
    try:
        with urllib.request.urlopen(req) as res:
            payload = json.load(res)
    except urllib.error.HTTPError as e:
        detail = e.read().decode(errors="replace")
        sys.exit(f"Cloudflare API {method} {path} → HTTP {e.code}\n{detail}")

    if not payload.get("success"):
        errors = json.dumps(payload.get("errors"), ensure_ascii=False, indent=2)
        sys.exit(f"Cloudflare API {method} {path} が失敗しました:\n{errors}")
    return payload["result"]


# ---- Google IdP -------------------------------------------------------------
idps = call("GET", f"/accounts/{ACCOUNT}/access/identity_providers")
google = next((i for i in idps if i.get("type") == "google"), None)

idp_body = {
    "name": "Google",
    "type": "google",
    "config": {"client_id": GOOGLE_ID, "client_secret": GOOGLE_SECRET},
}

if google:
    # **既存 IdP をそのまま再利用してはいけない。**
    # 古い OAuth クライアントが登録されたままだと、セットアップは成功と報告するのに
    # ログインだけが Google 側で失敗する（原因が Cloudflare 側に見えず、追いにくい）。
    # .env の資格情報で必ず上書きする。
    # client_secret は API が返さないので、client_id が一致していても毎回入れ直す。
    old_id = (google.get("config") or {}).get("client_id")
    google = call(
        "PUT", f"/accounts/{ACCOUNT}/access/identity_providers/{google['id']}", idp_body
    )
    if old_id and old_id != GOOGLE_ID:
        log(f"✓ Google IdP の client_id を更新 ({old_id} → {GOOGLE_ID})")
    else:
        log(f"✓ Google IdP を .env の資格情報で更新 ({google['id']})")
else:
    google = call("POST", f"/accounts/{ACCOUNT}/access/identity_providers", idp_body)
    log(f"✓ Google IdP を登録 ({google['id']})")

# ---- アプリ + ポリシー -------------------------------------------------------
# ポリシーは「許可した 2 メールだけ Allow」。ここが唯一の入口の門番になる。
policy = {
    "name": "two of us",
    "decision": "allow",
    "include": [{"email": {"email": e}} for e in EMAILS],
}

apps = call("GET", f"/accounts/{ACCOUNT}/access/apps")
app = next((a for a in apps if a.get("domain") == HOSTNAME), None)

if app:
    log(f"✓ Access アプリは作成済み ({app['id']})")
    # 既存アプリでもポリシーとログイン方法は宣言どおりに揃える（手で触られていても直す）
    app = call(
        "PUT",
        f"/accounts/{ACCOUNT}/access/apps/{app['id']}",
        {
            "name": "yuruwollet",
            "type": "self_hosted",
            "domain": HOSTNAME,
            "session_duration": "720h",
            "allowed_idps": [google["id"]],
            "auto_redirect_to_identity": True,
            "policies": [policy],
        },
    )
    log("✓ ポリシーを更新（この 2 人だけ Allow）")
else:
    app = call(
        "POST",
        f"/accounts/{ACCOUNT}/access/apps",
        {
            "name": "yuruwollet",
            "type": "self_hosted",
            "domain": HOSTNAME,
            "session_duration": "720h",
            "allowed_idps": [google["id"]],
            "auto_redirect_to_identity": True,
            "policies": [policy],
        },
    )
    log(f"✓ Access アプリを作成 ({app['id']})")

aud = app.get("aud")
if not aud:
    sys.exit("AUD タグを取得できませんでした（Access アプリの作成に失敗している可能性があります）")

log(f"✓ AUD = {aud}")
print(aud)
