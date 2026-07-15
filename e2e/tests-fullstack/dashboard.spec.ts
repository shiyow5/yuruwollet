import { test, expect } from '@playwright/test';

/**
 * ダッシュボードが **RLS 越しに実データ**を取得・表示できることを検証する（#6）。
 * これが通れば「Access 迂回 → /api/session の JWT → supabase REST → RLS(household 一致) → 描画」の
 * full-stack 経路が全部つながっている、と言える。
 */
test.describe('full-stack: ダッシュボードが実データを表示', () => {
  test('現在の残高が取得・表示される（エラーにならない）', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { name: '現在の残高' })).toBeVisible();
    // データ取得に失敗すると「残高を取得できませんでした」が出る（BalanceHero）。出ていない=RLS 越しに取得成功。
    await expect(page.getByText('残高を取得できませんでした')).toHaveCount(0);
    // 残高の値が ¥ 金額で出る（月次サマリの ¥ と混ざらないよう data-testid で一意に特定）。
    await expect(page.getByTestId('current-balance')).toHaveText(/¥[\d,]+/);
  });

  test('自分ビューには収入/支出の追加導線が出る', async ({ page }) => {
    await page.goto('/');
    // canAdd（自分の残高）のときだけ出る。ゆるり自身のビューが既定。
    await expect(page.getByRole('button', { name: '収入' })).toBeVisible();
    await expect(page.getByRole('button', { name: '支出' })).toBeVisible();
  });
});
