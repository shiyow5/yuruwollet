#!/usr/bin/env python3
"""`.env` を **shell 評価せずに** 読み、export 文として出力する。

    eval "$(python3 scripts/env_export.py .env)"

なぜ必要か:

    bash の `source .env` は各行を **shell の構文として解釈する**。そのため

        SUPABASE_SIGNING_KEY={"kty":"EC","crv":"P-256",...}

    は `{kty:EC,crv:P-256,...}` になる（クォートが剥がれ、`"` が消える）。
    これがそのまま Pages の secret に入り、Pages Function の JSON.parse が失敗して
    **/api/session が毎回 500 になる**。ES256 を選んだ人は本番が動かない。

    ここでは行をテキストとして読み、値を shlex.quote で包み直してから渡す。
    値の中身は一切解釈しない。
"""

import shlex
import sys
from pathlib import Path


def parse(path: Path) -> dict[str, str]:
    env: dict[str, str] = {}
    for lineno, raw in enumerate(path.read_text().splitlines(), 1):
        line = raw.strip()
        if not line or line.startswith("#"):
            continue
        if "=" not in line:
            sys.exit(f"{path}:{lineno}: '=' がありません: {raw}")

        key, value = line.split("=", 1)
        key = key.strip()
        if not key.replace("_", "").isalnum():
            sys.exit(f"{path}:{lineno}: 変数名が不正です: {key}")

        value = value.strip()
        # 値全体を囲むクォートだけを外す（中身のクォートは残す）
        if len(value) >= 2 and value[0] == value[-1] and value[0] in "\"'":
            value = value[1:-1]

        env[key] = value
    return env


def main() -> None:
    path = Path(sys.argv[1] if len(sys.argv) > 1 else ".env")
    if not path.is_file():
        sys.exit(f"{path} がありません")

    for key, value in parse(path).items():
        # shlex.quote で包むので、値に " や $ や空白が入っていても壊れない
        print(f"export {key}={shlex.quote(value)}")


if __name__ == "__main__":
    main()
