import { test, expect } from '@playwright/test';

test('アプリのトップ画面が表示される', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByText('二人専用の共同ウォレット')).toBeVisible();
  await expect(page.getByRole('link', { name: 'health check' })).toBeVisible();
});
