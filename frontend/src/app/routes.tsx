import type { ReactElement } from 'react';
import { HomePage } from './pages/HomePage';
import { LedgerPage } from './pages/LedgerPage';
import { SubscriptionsPage } from './pages/SubscriptionsPage';
import { WishlistPage } from './pages/WishlistPage';
import { ChartsPage } from './pages/ChartsPage';
import { MyPage } from './pages/MyPage';

export interface AppRoute {
  path: string;
  element: ReactElement;
  /** ナビに出す。**省略すると到達手段が無くなる**ので、意図的な場合だけ省く。 */
  nav?: { label: string; icon: string };
}

/**
 * アプリの画面はここが単一の真実。ナビ (BottomNav / DesktopNav) はこの定義から導出する。
 *
 * ルートだけ足してナビに載せ忘れると、URL を直接知っている人しか使えない
 * 「存在するのに到達できない機能」になる（実際にサブスクとグラフがそうなっていた）。
 * routes.test.ts が「nav の無いルート」を検出する。
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
];
