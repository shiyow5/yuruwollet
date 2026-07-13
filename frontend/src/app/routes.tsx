import type { ReactElement } from 'react';
import { HomePage } from './pages/HomePage';
import { LedgerPage } from './pages/LedgerPage';
import { SubscriptionsPage } from './pages/SubscriptionsPage';
import { WishlistPage } from './pages/WishlistPage';
import { ChartsPage } from './pages/ChartsPage';
import { MyPage } from './pages/MyPage';
import { SettingsPage } from './pages/SettingsPage';

export interface AppRoute {
  path: string;
  element: ReactElement;
  /** ボトムナビ / デスクトップナビに出す */
  nav?: { label: string; icon: string };
  /**
   * ナビ以外の到達手段。**nav も entry も無いルートは routes.test.ts が落とす。**
   *
   * 「ナビに載せないルート」を許すためにガードを緩めるのではなく、
   * **どこから入るのかを宣言させる**。宣言が嘘でないこと（実際にリンクがあること）は
   * TopAppBar.test.tsx が検証する。
   */
  entry?: { via: 'top-app-bar'; label: string };
}

/**
 * アプリの画面はここが単一の真実。ナビ (BottomNav / DesktopNav) はこの定義から導出する。
 *
 * ルートだけ足して導線に載せ忘れると、URL を直接知っている人しか使えない
 * 「存在するのに到達できない機能」になる（実際にサブスクとグラフがそうなっていた）。
 * routes.test.ts が「到達手段の無いルート」を検出する。
 */
export const appRoutes: AppRoute[] = [
  { path: '/', element: <HomePage />, nav: { label: 'ホーム', icon: 'home' } },
  {
    path: '/ledger',
    element: <LedgerPage />,
    nav: { label: '家計簿', icon: 'account_balance_wallet' },
  },
  {
    path: '/subscriptions',
    element: <SubscriptionsPage />,
    nav: { label: 'サブスク', icon: 'subscriptions' },
  },
  {
    path: '/wishlist',
    element: <WishlistPage />,
    nav: { label: 'ウィッシュ', icon: 'favorite' },
  },
  { path: '/charts', element: <ChartsPage />, nav: { label: 'グラフ', icon: 'insights' } },
  { path: '/mypage', element: <MyPage />, nav: { label: 'マイページ', icon: 'person' } },
  // 設定はボトムナビに入れない。7 項目にすると 360px で 1 項目 51px になり、
  // 「6 つだから px-1 まで切り詰められる」という BottomNav の設計前提が崩れる。
  // TopAppBar のアバターから入る。
  {
    path: '/settings',
    element: <SettingsPage />,
    entry: { via: 'top-app-bar', label: '設定' },
  },
];
