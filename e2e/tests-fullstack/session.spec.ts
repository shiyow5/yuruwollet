import { test, expect } from '@playwright/test';

/**
 * DEV_BYPASS_EMAIL=yururi@example.com なので、Access 無しでも「ゆるり」としてログイン済みになる。
 * ここでは **セッション確立**（/api/session → member）と、**RLS 越しの実データ**（profiles）を検証する。
 */
test.describe('full-stack: セッション確立', () => {
  test('ログイン中メンバー「ゆるり」の挨拶が出る（/api/session 由来）', async ({ page }) => {
    await page.goto('/');
    // 挨拶名は session.member.displayName（supabase を介さない）。全経路の入口が通っている証拠。
    await expect(page.getByText(/おかえり、ゆるり\s*さん/)).toBeVisible();
  });

  test('自分/相手タブに両メンバーが出る（profiles = RLS 越しの実データ）', async ({ page }) => {
    await page.goto('/');
    // MemberTabs は profiles（supabase）が 2 名揃って初めて出る。#18 で付けた radiogroup 名で特定。
    const group = page.getByRole('radiogroup', { name: '表示するメンバー' });
    await expect(group.getByRole('radio', { name: 'ゆるり' })).toBeVisible();
    await expect(group.getByRole('radio', { name: 'しよを' })).toBeVisible();
  });
});
