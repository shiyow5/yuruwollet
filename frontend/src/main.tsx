import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
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

const rootEl = document.getElementById('root');
if (!rootEl) {
  throw new Error('#root element not found');
}

createRoot(rootEl).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
