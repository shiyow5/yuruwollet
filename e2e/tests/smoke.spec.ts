import { test, expect } from '@playwright/test';

/**
 * ナビに載っていない画面は「URL を直接知っている人しか使えない機能」になる。
 * 実際にサブスクとグラフがその状態でマージされていたので、
 * **全画面がナビから到達できること**を E2E で守る。
 *
 * リンクはラベル名ではなく href で辿る（ラベルを変えただけでテストが壊れないように）。
 */
const PAGES = [
  { path: '/ledger', heading: '家計簿' },
  { path: '/subscriptions', heading: 'サブスク管理' },
  { path: '/wishlist', heading: '二人のウィッシュリスト' },
  { path: '/charts', heading: 'グラフ' },
  { path: '/mypage', heading: 'マイページ' },
];

test('アプリのシェルが描画される', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('link', { name: 'yuruwollet' })).toBeVisible();
});

test('すべての画面にナビから到達できる', async ({ page }) => {
  for (const target of PAGES) {
    await page.goto('/');

    await page.locator(`nav a[href="${target.path}"]`).first().click();

    await expect(page).toHaveURL(new RegExp(`${target.path}$`));
    await expect(page.getByRole('heading', { name: target.heading })).toBeVisible();
  }
});

// 画面が 6 つあるので、ボトムナビが狭い端末で溢れないことを確認する
test('ボトムナビが 360px 幅に収まる', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 740 });
  await page.goto('/');

  const links = page.locator('nav.md\\:hidden a');
  await expect(links).toHaveCount(6);

  for (const link of await links.all()) {
    const box = await link.boundingBox();
    expect(box).not.toBeNull();
    // 画面外にはみ出していない
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(360);
  }
});
