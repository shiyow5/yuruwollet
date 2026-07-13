import { describe, expect, it } from 'vitest';
import { appRoutes } from './routes';
import { navItems } from '../components/layout/navItems';

describe('ルートとナビの整合', () => {
  // ルートだけ足して導線に載せ忘れると、URL を直接知っている人しか使えない
  // 「存在するのに到達できない機能」になる（サブスクとグラフで実際に起きた）。
  //
  // ナビ以外から入る画面（設定）を足すにあたり、このガードを緩めるのではなく
  // **到達手段を宣言させる**（nav か entry）。宣言が嘘でないことは
  // TopAppBar.test.tsx が「実際にリンクがあるか」を見て担保する。
  it('すべてのルートに到達手段がある（nav か entry）', () => {
    const unreachable = appRoutes
      .filter((r) => r.nav === undefined && r.entry === undefined)
      .map((r) => r.path);
    expect(unreachable).toEqual([]);
  });

  it('ナビはルート定義から導出される（二重管理しない）', () => {
    expect(navItems.map((n) => n.to)).toEqual(appRoutes.filter((r) => r.nav).map((r) => r.path));
  });

  // 設定はボトムナビに入れない。7 項目にすると 360px で 1 項目 51px になり、
  // 「6 つだから px-1 まで切り詰められる」という BottomNav の設計前提が崩れる。
  it('設定はボトムナビに出さない（ナビは 6 項目のまま）', () => {
    expect(navItems.map((n) => n.to)).not.toContain('/settings');
    expect(navItems).toHaveLength(6);
  });

  it('設定は TopAppBar から入る', () => {
    const settings = appRoutes.find((r) => r.path === '/settings');
    expect(settings?.nav).toBeUndefined();
    expect(settings?.entry).toEqual({ via: 'top-app-bar', label: '設定' });
  });

  it('実装済みの画面がすべて含まれている', () => {
    expect(appRoutes.map((r) => r.path)).toEqual([
      '/',
      '/ledger',
      '/subscriptions',
      '/wishlist',
      '/charts',
      '/mypage',
      '/settings',
    ]);
  });

  it('パスとラベルが重複しない', () => {
    const paths = appRoutes.map((r) => r.path);
    const labels = navItems.map((n) => n.label);
    expect(new Set(paths).size).toBe(paths.length);
    expect(new Set(labels).size).toBe(labels.length);
  });
});
