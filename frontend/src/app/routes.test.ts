import { describe, expect, it } from 'vitest';
import { appRoutes } from './routes';
import { navItems } from '../components/layout/navItems';

describe('ルートとナビの整合', () => {
  // ルートだけ足してナビに載せ忘れると、URL を直接知っている人しか使えない
  // 「存在するのに到達できない機能」になる（サブスクとグラフで実際に起きた）。
  it('すべてのルートがナビから到達できる', () => {
    const unreachable = appRoutes.filter((r) => r.nav === undefined).map((r) => r.path);
    expect(unreachable).toEqual([]);
  });

  it('ナビはルート定義から導出される（二重管理しない）', () => {
    expect(navItems.map((n) => n.to)).toEqual(appRoutes.filter((r) => r.nav).map((r) => r.path));
  });

  it('実装済みの画面がすべて含まれている', () => {
    expect(appRoutes.map((r) => r.path)).toEqual([
      '/',
      '/ledger',
      '/subscriptions',
      '/wishlist',
      '/charts',
      '/mypage',
    ]);
  });

  it('パスとラベルが重複しない', () => {
    const paths = appRoutes.map((r) => r.path);
    const labels = navItems.map((n) => n.label);
    expect(new Set(paths).size).toBe(paths.length);
    expect(new Set(labels).size).toBe(labels.length);
  });
});
