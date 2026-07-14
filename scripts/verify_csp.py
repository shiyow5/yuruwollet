#!/usr/bin/env python3
"""ビルド成果物の **CSP とバンドルが同じ Supabase を指しているか** を検算する。

    python3 scripts/verify_csp.py [frontend/dist]

**なぜ要るか**（実際に踏んだ）:

Vite は `.env` の値を `import.meta.env`（アプリ側）にしか入れず、`vite.config.ts` の
`process.env` には入れない。そのため CSP を `process.env` から組み立てていたとき、
`frontend/.env` に書いて `make deploy-frontend` する経路（docs/DEPLOY.md の手順）で

    バンドル            → https://<ref>.supabase.co   （正しい）
    CSP の connect-src  → http://127.0.0.1:54321      （**間違い**）

となった。この状態で本番に出ると **画面は出るのに Supabase への通信が CSP で全部塞がれる**。
「真っ白」ではないので気づきにくく、一番厄介な壊れ方をする。

根本原因は vite.config.ts で loadEnv() を使うことで直したが、
**デプロイ経路が増えても壊れないよう、成果物そのものを突き合わせる**。

期待値（本番の URL）を引数で渡さないのが肝。**バンドルに焼き込まれた値を正**として、
CSP がそれを許可しているかだけを見る。どの経路でビルドしても成立する不変条件。
"""

import re
import sys
from pathlib import Path


def find_bundle_supabase_origin(assets: Path) -> str | None:
    """バンドルに焼き込まれた Supabase のオリジンを探す。"""
    pattern = re.compile(r'https://[a-z0-9-]+\.supabase\.(?:co|in)')
    for path in assets.rglob('*.js'):
        found = pattern.findall(path.read_text(errors='ignore'))
        if found:
            return found[0]
    return None


def main() -> None:
    args = [a for a in sys.argv[1:] if not a.startswith('--')]
    # **本番へ出す直前は --production を付けること。**
    # 付けないと「バンドルがローカルを指している」ビルドを *正常* として通してしまい、
    # frontend/.env を書き忘れたまま make deploy-frontend したときに素通りする。
    production = '--production' in sys.argv

    dist = Path(args[0] if args else 'frontend/dist')
    headers_file = dist / '_headers'

    if not headers_file.is_file():
        sys.exit(f'{headers_file} がありません（_headers が生成されていない）')

    headers = headers_file.read_text()
    if 'Content-Security-Policy:' not in headers:
        sys.exit(f'{headers_file} に CSP がありません')

    origin = find_bundle_supabase_origin(dist / 'assets')
    if origin is None:
        if production:
            sys.exit(
                'バンドルに本番の Supabase URL が焼き込まれていません。\n'
                '  VITE_SUPABASE_URL の渡し忘れです（frontend/.env か、シェルの環境変数）。\n'
                '  このまま出すとローカル（127.0.0.1）を指したアプリが本番に出ます。'
            )
        print('バンドルに本番 Supabase URL が無い（ローカルビルド）。CSP の検算はスキップ。')
        return

    host = origin.removeprefix('https://')
    missing = [o for o in (f'https://{host}', f'wss://{host}') if o not in headers]
    if missing:
        print(f'バンドルは {origin} を指しているのに、CSP がそれを許可していません。')
        print(f'  CSP に無いオリジン: {", ".join(missing)}')
        print('  → この状態で本番に出すと、画面は出るのに Supabase への通信が全部 CSP で落ちます。')
        print()
        print(headers)
        sys.exit(1)

    if re.search(r'127\.0\.0\.1:54321|localhost:54321', headers):
        sys.exit(f'CSP にローカルの Supabase が残っています:\n{headers}')

    print(f'OK: バンドルも CSP も {origin} を指しています。')


if __name__ == '__main__':
    main()
