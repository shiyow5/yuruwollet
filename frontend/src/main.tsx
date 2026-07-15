import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource-variable/plus-jakarta-sans/wght.css';
// 全アイコン(約3.8MB)を積む material-symbols/outlined.css の代わりに、使うぶんだけの
// サブセット(十数KB)を読む（#9）。scripts/subset_icons.py が生成する。
import './styles/material-symbols.css';
import './styles/index.css';
import App from './App';

const rootEl = document.getElementById('root');
if (!rootEl) {
  throw new Error('#root element not found');
}

createRoot(rootEl).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
