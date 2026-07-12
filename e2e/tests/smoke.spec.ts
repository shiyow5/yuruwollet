import { test, expect } from '@playwright/test';

test('アプリのシェルが描画される', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('link', { name: 'yuruwollet' })).toBeVisible();
});

test('ナビゲーションでページ遷移できる', async ({ page }) => {
  await page.goto('/');
  // デスクトップナビ（ボトムナビは md:hidden）の家計簿へ
  await page.getByRole('link', { name: '家計簿', exact: true }).first().click();
  await expect(page).toHaveURL(/\/ledger$/);
  await expect(page.getByRole('heading', { name: '家計簿' })).toBeVisible();

  await page.getByRole('link', { name: 'ウィッシュリスト', exact: true }).first().click();
  await expect(page).toHaveURL(/\/wishlist$/);
});
