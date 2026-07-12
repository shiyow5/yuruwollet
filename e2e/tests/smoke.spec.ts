import { test, expect } from '@playwright/test';

// vite preview には Pages Functions が無いためセッションは確立せず、
// アプリのシェル（yuruwollet ラベル）が描画されることだけを確認するスモーク。
// Access + /api/session を含む full-stack E2E は AppShell 実装後に拡張する。
test('アプリのシェルが描画される', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByText('yuruwollet')).toBeVisible();
});
