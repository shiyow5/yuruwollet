import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { BottomNav } from './BottomNav';
import { navItems } from './navItems';

function renderNav() {
  return render(
    <MemoryRouter>
      <BottomNav />
    </MemoryRouter>,
  );
}

describe('BottomNav', () => {
  it('ナビ項目をすべて描画する', () => {
    renderNav();
    for (const item of navItems) {
      expect(screen.getByRole('link', { name: item.label })).toHaveAttribute('href', item.to);
    }
  });

  // fixed bottom-0 のままだと、ラベルが画面のいちばん下に貼り付く。
  // 角丸のかかった端末では文字が丸みに食われ、ホームインジケータ／ジェスチャーバーの
  // ある端末ではその下に潜り込む。**下端の余白にセーフエリアを足す。**
  // env() は該当しない端末では 0 なので、PC の見た目は変わらない。
  it('下端の余白にセーフエリアを足している', () => {
    const { container } = renderNav();
    const nav = container.querySelector('nav')!;
    expect(nav.className).toContain('pb-[calc(0.75rem+env(safe-area-inset-bottom))]');
  });

  // 横向きのノッチ側も避ける
  it('左右の余白にもセーフエリアを足している', () => {
    const { container } = renderNav();
    const nav = container.querySelector('nav')!;
    expect(nav.className).toContain('env(safe-area-inset-left)');
    expect(nav.className).toContain('env(safe-area-inset-right)');
  });

  // 同じプロパティのクラスを 2 つ出すと、cn は競合を解決しないので
  // CSS の出力順に依存する。辺ごとに 1 回だけ指定すること。
  it('padding のクラスが辺ごとに 1 回だけ（px-/py- と混ざっていない）', () => {
    const { container } = renderNav();
    const nav = container.querySelector('nav')!;
    const classes = nav.className.split(/\s+/);
    expect(classes.filter((c) => /^px-/.test(c))).toEqual([]);
    expect(classes.filter((c) => /^py-/.test(c))).toEqual([]);
    expect(classes.filter((c) => /^pb-/.test(c))).toHaveLength(1);
    expect(classes.filter((c) => /^pt-/.test(c))).toHaveLength(1);
  });
});
