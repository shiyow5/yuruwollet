#!/usr/bin/env python3
"""cron Worker を **workerd の上で** 実際に走らせるスモークテスト。

なぜ必要か:

    2026-07-13、cron Worker は本番で毎回 scriptThrewException で死んでいた。
    原因は Go 標準の http.Client を使っていたこと。js/wasm の net/http は
    グローバルの fetch を直接呼ぶが、workerd では `this` が不正になり
    "Illegal invocation" で panic する。

    ネイティブの `go test` はこの経路を通らない（fetch も workerd も無い）。
    WASM ビルドが通ることも確認していたが、**ビルドは通る**。
    つまり既存の CI では原理的に捕まえられなかった。

    唯一の捕まえ方は「本物の workerd で scheduled イベントを投げる」こと。

やること:

    1. 為替 API と Supabase の代わりになるスタブを 1 本立てる
    2. `wrangler dev --test-scheduled` で Worker を起動する
    3. GET /__scheduled を叩く → 200 でなければ失敗
    4. スタブが期待どおりの呼び出しを受けたかを検証する
       （200 だけ見ると「何もせず正常終了」も通ってしまう）

    python3 scripts/cron_smoke.py
"""

import os
import re
import signal
import subprocess
import sys
import threading
import time
import urllib.error
import urllib.request
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
BACKEND = ROOT / "backend"

STUB_PORT = 8788
WORKER_PORT = 8799
WORKER_BOOT_TIMEOUT = 180  # 秒。初回は workerd の取得とビルドで時間がかかる

# スタブが受けたリクエスト（"METHOD /path"）
received: list[str] = []


class Stub(BaseHTTPRequestHandler):
    """為替 API と Supabase PostgREST の両方を兼ねる。"""

    def _record(self) -> str:
        path = self.path.split("?")[0]
        received.append(f"{self.command} {path}")
        return path

    def _send(self, body: str, status: int = 200) -> None:
        payload = body.encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(payload)))
        self.end_headers()
        self.wfile.write(payload)

    def do_GET(self) -> None:  # noqa: N802
        path = self._record()
        if path.startswith("/v1/"):  # frankfurter (最新 or 履歴)
            self._send('{"base":"USD","date":"2026-07-13","rates":{"JPY":150.0}}')
        elif path == "/rest/v1/subscriptions":
            self._send("[]")  # 更新日が到来したサブスクは無い
        elif path == "/rest/v1/households":  # keep-alive の ping
            self._send('[{"id":"main"}]')
        elif path == "/rest/v1/fx_rates":
            self._send("[]")
        else:
            self._send("[]", 404)

    def do_POST(self) -> None:  # noqa: N802
        path = self._record()
        length = int(self.headers.get("Content-Length", 0))
        self.rfile.read(length)
        self._send("[]", 201)

    def log_message(self, *_args) -> None:  # スタブのアクセスログは黙らせる
        pass


def wait_for_worker(proc: subprocess.Popen, log: list[str]) -> None:
    """wrangler が待ち受けるまで待つ。落ちたら即座に失敗させる。"""
    deadline = time.time() + WORKER_BOOT_TIMEOUT
    while time.time() < deadline:
        if proc.poll() is not None:
            fail("wrangler dev が起動前に終了しました", log)
        try:
            urllib.request.urlopen(f"http://127.0.0.1:{WORKER_PORT}/health", timeout=2)
            return
        except urllib.error.HTTPError:
            return  # 応答はしている（/health が無くてもよい）
        except OSError:
            time.sleep(1)
    fail("wrangler dev が起動しませんでした", log)


def fail(message: str, log: list[str]) -> None:
    print(f"\n✗ {message}\n")
    print("--- wrangler の出力 ---")
    print("".join(log[-60:]))
    sys.exit(1)


def main() -> None:
    # Worker に渡す env。スタブへ向ける。
    dev_vars = BACKEND / ".dev.vars"
    dev_vars.write_text(
        f"SUPABASE_URL=http://127.0.0.1:{STUB_PORT}\n"
        "SUPABASE_SERVICE_ROLE_KEY=smoke-test-key\n"
        f"FX_BASE_URL=http://127.0.0.1:{STUB_PORT}\n"
    )

    stub = HTTPServer(("127.0.0.1", STUB_PORT), Stub)
    threading.Thread(target=stub.serve_forever, daemon=True).start()

    log: list[str] = []
    # wrangler は workerd を子プロセスとして立てる。npx だけ落としても workerd が
    # ポートを掴んだまま残り、次の実行が「前回の Worker」に当たってしまう。
    # プロセスグループごと落とせるように新しいセッションで起動する。
    proc = subprocess.Popen(
        ["npx", "wrangler", "dev", "--test-scheduled", "--local", "--port", str(WORKER_PORT)],
        cwd=BACKEND,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
        start_new_session=True,
    )

    def drain() -> None:
        assert proc.stdout is not None
        for line in proc.stdout:
            log.append(line)

    threading.Thread(target=drain, daemon=True).start()

    try:
        print(f"wrangler dev を起動中（最大 {WORKER_BOOT_TIMEOUT}s）…")
        wait_for_worker(proc, log)
        print("起動しました。scheduled イベントを投げます。")

        url = f"http://127.0.0.1:{WORKER_PORT}/__scheduled?cron=0+15+*+*+*"
        try:
            with urllib.request.urlopen(url, timeout=60) as res:
                status = res.status
        except urllib.error.HTTPError as e:
            status = e.code

        time.sleep(1)  # スタブへの最後の呼び出しが届くのを待つ

        if status != 200:
            fail(f"scheduled イベントが {status} で失敗しました（200 を期待）", log)

        # 200 だけでは足りない。**実際に外向き HTTP を出したか**を見る。
        # Illegal invocation はまさにここで死んでいた（subrequests=0）。
        expected = [
            r"GET /v1/",  # 為替の取得
            r"POST /rest/v1/fx_rates",  # レートの保存
            r"GET /rest/v1/subscriptions",  # サブスクの一覧
            r"GET /rest/v1/households",  # keep-alive
        ]
        for pattern in expected:
            if not any(re.match(pattern, r) for r in received):
                fail(
                    f"cron が {pattern} を呼んでいません（受けたのは {received}）",
                    log,
                )

        # panic は 200 を返しつつログにだけ出ることがある
        joined = "".join(log)
        for bad in ("panic:", "Illegal invocation", "Uncaught"):
            if bad in joined:
                fail(f"Worker のログに {bad!r} が出ています", log)

        print(f"\n✓ cron が workerd 上で完走しました（{len(received)} 本の外向き HTTP）")
        for r in received:
            print(f"    {r}")
    finally:
        try:
            os.killpg(os.getpgid(proc.pid), signal.SIGTERM)
            proc.wait(timeout=10)
        except (ProcessLookupError, subprocess.TimeoutExpired):
            try:
                os.killpg(os.getpgid(proc.pid), signal.SIGKILL)
            except ProcessLookupError:
                pass
        stub.shutdown()
        dev_vars.unlink(missing_ok=True)


if __name__ == "__main__":
    main()
