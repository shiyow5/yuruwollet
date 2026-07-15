#!/usr/bin/env python3
"""ビルド成果物の **service worker が機微データをキャッシュせず、Access を壊さない** ことを検算する（#55）。

    python3 scripts/verify_sw.py [frontend/dist]

**なぜ要るか**:

service worker は「設定を 1 行変えると静かに壊れる」。特にこの構成では二つの事故が致命的:

  1. **JWT・家計データを端末に残す。** precache に /api/session（Supabase JWT）や Supabase の
     応答、あるいは html/json を含めると、二人分の家計データやトークンが端末のキャッシュに残る。
  2. **Cloudflare Access のログインを壊す。** navigateFallback で index.html を返す SW を入れると、
     未ログインのトップレベル遷移を SW が食い、Access のログイン 302 に到達できなくなる。

pwa-config.test.ts は「設定オブジェクト」を検証するが、プラグインや workbox のバージョンが
上がって既定が変わると、設定は正しいのに **生成された sw.js だけが壊れる**ことがある。
ここでは **実際に出力された dist/sw.js の precache マニフェスト**そのものを突き合わせる。
どの経路でビルドしても成立する不変条件なので、deploy.yml と make deploy-frontend の両方で呼ぶ。
"""

import re
import sys
from pathlib import Path

# precache に含めてはならない URL の特徴（機微データ・遷移フォールバック）。
#
# precache のエントリは dist 内の**静的ファイルへの same-origin 相対パス**だけ。
# Supabase の応答は cross-origin の runtime リクエストなので precache には決して載らない
# （それは runtimeCaching の話で、pwa-config.test.ts が runtimeCaching===undefined を担保する）。
# ここでは precache が実際に取り得る値だけを弾く。`api/` はスラッシュ必須にして
# `supabase-vendor-*.js`（Supabase クライアント本体 = シェルの一部で precache 正当）を誤検知しない。
FORBIDDEN_PATTERNS = [
    (re.compile(r'\.html$', re.I), 'html（遷移フォールバックになり Access のログインを食う）'),
    (re.compile(r'\.(json|webmanifest)$', re.I), 'json/webmanifest（データを端末に残す）'),
    (re.compile(r'(?:^|/)api/', re.I), 'api/（Supabase JWT を返すエンドポイント）'),
]


def precache_urls(sw_source: str) -> list[str]:
    """sw.js の precache マニフェスト（{url:"...",revision:...} の配列）から URL を抜き出す。

    workbox のランタイム内にも "index.html" 等の文字列が出るため、**url が revision と隣接する対**
    だけを見て誤検知を避ける（precacheAndRoute に渡る実エントリはこの形をしている）。
    キー順は workbox のバージョンで変わり得るので **両順**（url→revision / revision→url）を拾う。
    """
    return re.findall(r'url:\s*"([^"]+)"\s*,\s*revision:', sw_source) + re.findall(
        r'revision:[^,{}]*,\s*url:\s*"([^"]+)"', sw_source
    )


def main() -> None:
    args = [a for a in sys.argv[1:] if not a.startswith('--')]
    dist = Path(args[0] if args else 'frontend/dist')

    sw = dist / 'sw.js'
    if not sw.is_file():
        sys.exit(f'{sw} がありません（VitePWA が service worker を生成していない）')

    source = sw.read_text(errors='ignore')

    urls = precache_urls(source)
    if not urls:
        sys.exit(f'{sw} の precache マニフェストが空/未検出です（globPatterns がシェルに一致していない）')

    # 1. 機微データ・遷移フォールバックを precache していないこと。
    for url in urls:
        for pattern, why in FORBIDDEN_PATTERNS:
            if pattern.search(url):
                sys.exit(f'sw.js が precache してはならない URL を含みます: {url!r} — {why}')

    # 2. アプリシェル（js/css/woff2）は precache されていること（空振りビルドの検出）。
    for ext, label in (('.js', 'JS'), ('.css', 'CSS'), ('.woff2', 'フォント')):
        if not any(u.lower().endswith(ext) for u in urls):
            sys.exit(f'sw.js の precache に {label}({ext}) が 1 つもありません（シェルが precache されていない）')

    # 3. NavigationRoute を登録していないこと（navigateFallback: null が効いている）。
    #
    #    navigateFallback を設定すると workbox は NavigationRoute を登録し、
    #    createHandlerBoundToURL(navigateFallback) を **呼び出す**。**文字列リテラルで探してはいけない**:
    #    minify 後は URL が変数へ巻き上げられ `createHandlerBoundToURL("index.html")` ではなく
    #    `x().createHandlerBoundToURL(N)` になる（NavigationRoute というクラス名も mangle で消える）。
    #    実測（workbox-build 7.4.1 / inlineWorkboxRuntime:true / minify）:
    #      navigateFallback:null  → `createHandlerBoundToURL(` は 1回（メソッド定義のみ）/ `.createHandlerBoundToURL(` は 0回
    #      navigateFallback:設定  → `createHandlerBoundToURL(` は 2回（定義 + 呼出）/ `.createHandlerBoundToURL(` は 1回
    #    メソッド定義（省略記法 `createHandlerBoundToURL(t){`）には先頭ドットが付かないので、
    #    **呼び出し（先頭ドット付き）**か、**定義以外の 2 回目以降の出現**を NavigationRoute の証拠とする。
    if re.search(r'\.createHandlerBoundToURL\(', source) or len(re.findall(r'createHandlerBoundToURL\(', source)) > 1:
        sys.exit('sw.js が NavigationRoute を登録しています（navigateFallback が有効 = Access のログインを食う）')

    # 4. index.html が改ざんされていないこと。
    index = dist / 'index.html'
    if not index.is_file():
        sys.exit(f'{index} がありません')
    html = index.read_text(errors='ignore')
    #   4a. 手書き manifest リンク（crossorigin=use-credentials）が残っていること。
    if not re.search(r'rel="manifest"[^>]*crossorigin="use-credentials"', html):
        sys.exit('index.html の <link rel=manifest crossorigin=use-credentials> が失われています'
                 '（manifest:false にしていないと Access 下で manifest が読めなくなる）')
    #   4b. インラインの SW 登録スクリプトが差し込まれていないこと（CSP script-src self を壊す）。
    if 'serviceWorker' in html or 'registerSW' in html:
        sys.exit('index.html にインライン SW 登録が含まれています（CSP でブロックされる。injectRegister:null にする）')

    # 5. 手書き site.webmanifest が出力に残っていること。
    manifest = dist / 'site.webmanifest'
    if not manifest.is_file():
        sys.exit(f'{manifest} がありません（手書き manifest が出力されていない）')

    # 6. **installable の前提条件**（#55 の目的）を成果物レベルで守る。
    #    完全な Lighthouse PWA 監査は Access 背後のため手動だが、静的に確認できる前提が退行したら止める
    #    （manifest のアイコンや SW の fetch ハンドラが将来外れて installable でなくなるのを黙って通さない）。
    manifest_text = manifest.read_text(errors='ignore')
    for size in ('192x192', '512x512'):
        if size not in manifest_text:
            sys.exit(f'site.webmanifest に {size} アイコンがありません（Android の installable 条件）')
    #    fetch ハンドラの無い SW では Chrome は install バナー（beforeinstallprompt）を出さない。
    if 'fetch' not in source:
        sys.exit('sw.js に fetch ハンドラがありません（installable にならない）')

    print(f'sw.js OK: precache {len(urls)} エントリ（機微データ・遷移フォールバック無し / '
          f'NavigationRoute 無し / index.html の manifest リンク健在 / installable 前提あり）')


if __name__ == '__main__':
    main()
