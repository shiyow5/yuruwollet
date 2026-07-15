import type { VitePWAOptions } from 'vite-plugin-pwa';

/**
 * service worker が **precache してよい = アプリシェルの静的アセットだけ**（#55）。
 *
 * ビルドで content hash が付く JS/CSS、サブセットフォント(woff2/woff)、アイコン(png/svg/ico)。
 * これらは公開資産で、端末に残っても害が無く、初回以降のロードを速くする。
 *
 * **html / json / webmanifest / api を絶対に含めない**（下の FORBIDDEN_PRECACHE_TOKENS で不変条件化）:
 *  - index.html を precache して navigateFallback にすると、Access のログイン 302 を SW が食う。
 *  - /api/session は Supabase JWT を、Supabase の応答は二人分の家計データを返す。これらを
 *    precache/キャッシュすると端末にトークン・家計データが残る（#55 の受け入れ条件に反する）。
 */
export const SHELL_GLOB_PATTERNS = ['**/*.{js,css,woff2,woff,png,svg,ico}'] as const;

/**
 * precache の glob に含めてはならない部分文字列（テストの不変条件と実装の単一の出所）。
 * 遷移(html) と データ(json/webmanifest) と 認証(api) を端末に残さないための番人。
 */
export const FORBIDDEN_PRECACHE_TOKENS = ['html', 'json', 'webmanifest', 'api'] as const;

/**
 * vite-plugin-pwa の設定。**Cloudflare Access と 厳格 CSP の下で安全に動くこと**を最優先にしている。
 * ここを変えるときは pwa-config.test.ts の理由コメントを必ず読むこと。
 */
export const pwaOptions: Partial<VitePWAOptions> = {
  // 新しい SW を即座に有効化して「消えたチャンクの 404」を避ける（#12 の vite:preloadError と補完）。
  registerType: 'autoUpdate',
  // **インライン登録スクリプトを使わない。** CSP は script-src 'self'（unsafe-inline 無し）なので、
  // index.html に差し込まれるインライン登録は必ずブロックされる。main.tsx で virtual module から登録する。
  injectRegister: null,
  // **手書きの site.webmanifest を使い続ける。** プラグインに生成させると
  // crossorigin=use-credentials の無い <link rel=manifest> を差し込み、Access 下で manifest が
  // 302 されて読めなくなる（index.html の注記参照）。
  manifest: false,
  workbox: {
    globPatterns: [...SHELL_GLOB_PATTERNS],
    // **navigateFallback を無効化**（vite-plugin-pwa の既定 "index.html" を上書き）。
    // トップレベル遷移は必ずネットワークへ行かせ、未ログインを Access がログイン画面へ 302 できるようにする。
    // workbox-build のスキーマは navigateFallback: null を許可し、NavigationRoute を一切生成しない。
    navigateFallback: null,
    // 古い precache を activate 時に掃除する。
    cleanupOutdatedCaches: true,
    // workbox ランタイムを sw.js に埋め込み、importScripts を無くして CSP の曖昧さを消す（自己完結の 1 ファイル）。
    inlineWorkboxRuntime: true,
    // **runtimeCaching は設定しない。** precache に無い全リクエスト（/api/session=JWT・Supabase=家計データ）は
    // SW を素通りしてネットワークへ抜ける。端末に機微データを一切残さない。
  },
  // 開発では SW を無効化（HMR と干渉させない）。
  devOptions: { enabled: false },
};
