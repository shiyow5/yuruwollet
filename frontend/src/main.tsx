import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import '@fontsource-variable/plus-jakarta-sans/wght.css';
// 全アイコン(約3.8MB)を積む material-symbols/outlined.css の代わりに、使うぶんだけの
// サブセット(十数KB)を読む（#9）。scripts/subset_icons.py が生成する。
import './styles/material-symbols.css';
import './styles/index.css';
import App from './App';

// デプロイ直後に古い index.html が指す（もう存在しない）チャンクの取得に失敗したら、
// 新しい index.html を取り直すため 1 回だけ自動リロードする（#12）。本リポジトリは
// 小さな修正を頻繁に出すので、開きっぱなしの端末がこれを踏みやすい。無限ループを
// 防ぐため sessionStorage で 1 回に制限し、2 回目以降は RouteErrorBoundary に任せる。
const PRELOAD_RELOAD_KEY = 'vite-preload-reloaded';
window.addEventListener('vite:preloadError', (event) => {
  if (sessionStorage.getItem(PRELOAD_RELOAD_KEY)) return;
  event.preventDefault();
  sessionStorage.setItem(PRELOAD_RELOAD_KEY, '1');
  window.location.reload();
});

// service worker を登録する（#55）。これで Chrome が「アプリをインストール」バナー
// （beforeinstallprompt）を出せるようになる。dev では pwa-config の devOptions.enabled=false
// のため registerSW は no-op。registerType:'autoUpdate' の自動リロードは **更新時のみ**
// （既存 SW を置き換える activated で event.isUpdate/isExternal のときだけ location.reload）。
// 初回インストールではリロードしないので、初回訪問がリロードでちらつくことはない。
// 更新時のリロードで消えたチャンクの 404 も避けられる（#12 の vite:preloadError と補完）。
// **キャッシュ戦略は pwa-config.ts で厳格に制限**（/api の JWT・Supabase の家計データは非キャッシュ、
// トップレベル遷移は Access のためネットワークへ）。
registerSW({ immediate: true });

const rootEl = document.getElementById('root');
if (!rootEl) {
  throw new Error('#root element not found');
}

createRoot(rootEl).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
