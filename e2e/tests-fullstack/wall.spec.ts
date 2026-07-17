import { test, expect, type Page } from '@playwright/test';

/**
 * 24日の壁の**表示ゲート**（#44）。
 *
 * `?now=` は **VITE_ALLOW_CLOCK_OVERRIDE=true でビルドしたときだけ**効く
 * （playwright.fullstack.config.ts の webServer で渡している）。フラグが無いと
 * エラーにならず**黙って無視され、壁が出ないだけ**になるので、最初のテストで
 * 「23日には出ない / 24日に出る」の両方を見て、偽装が効いていることごと確かめる。
 *
 * **ここで確定（「はい」）まではテストしない。** confirm_balance_checkpoint は
 * `public.jst_today()`（= サーバの実時刻）で 24日ガードをかけており、クライアントの
 * `?now=` を意図的に信用しない（20260713030000_confirm_checkpoint_guard.sql:109）。
 * つまり実日付が 24日未満の日に E2E で確定させることは**原理的にできない**（それが正しい）。
 * 確定・スキップ・差額挿入・レースは pgTAP 側が `jst_today` を差し替えて検証している
 * （supabase/tests/rls_rpc_test.sql）。ここは「いつ壁が出るか」だけを見る。
 *
 * 同じ理由で「スキップした当日は再表示されない」も E2E では見られない:
 * checkpoint の updated_at はサーバの実時刻なので、未来日を偽装している間は
 * 常に「過去のスキップ」に見えてしまう。判定そのものは shouldShowWall の単体テストが持つ。
 */

function wall(page: Page) {
  return page.getByRole('dialog', { name: '今月の残高確認' });
}

test.describe('24日の壁（表示ゲート）', () => {
  test('23日には出ない / 24日に出る', async ({ page }) => {
    await page.goto('/?now=2026-07-23');
    await expect(page.getByText(/おかえり、ゆるり/)).toBeVisible();
    await expect(wall(page)).toHaveCount(0);

    await page.goto('/?now=2026-07-24');
    await expect(wall(page)).toBeVisible();
    await expect(wall(page).getByText('明日は給料日！')).toBeVisible();
  });

  test('25日以降も出続ける（数えるまで催促する）', async ({ page }) => {
    await page.goto('/?now=2026-07-28');
    await expect(wall(page)).toBeVisible();
  });

  test('翌月もまた出る', async ({ page }) => {
    await page.goto('/?now=2026-08-24');
    await expect(wall(page)).toBeVisible();
  });

  test('全画面ロックで、裏の操作をさせない', async ({ page }) => {
    await page.goto('/?now=2026-07-24');
    await expect(wall(page)).toBeVisible();

    // 裏のナビは DOM 上は可視（オーバーレイが覆っているだけ）なので、
    // toBeVisible では測れない。**押しても遷移しないこと**で測る。
    await page
      .getByRole('link', { name: '家計簿' })
      .first()
      .click({ timeout: 2000 })
      .catch(() => {
        /* オーバーレイに阻まれるのが期待動作 */
      });
    expect(page.url()).not.toContain('/ledger');
    await expect(wall(page)).toBeVisible();

    // Escape でも閉じない（locked）
    await page.keyboard.press('Escape');
    await expect(wall(page)).toBeVisible();
  });

  test('入力せずに決定すると弾かれ、壁は開いたまま', async ({ page }) => {
    await page.goto('/?now=2026-07-24');
    await wall(page).getByRole('button', { name: '決定' }).click();

    await expect(wall(page).getByRole('alert')).toBeVisible();
    await expect(wall(page)).toBeVisible();
  });

  test('ズレがあると確認ステップを挟む（黙って調整しない）', async ({ page }) => {
    await page.goto('/?now=2026-07-24');

    const shown = await page.getByTestId('current-balance').textContent();
    const computed = Number((shown ?? '').replace(/[^\d-]/g, ''));

    await wall(page)
      .getByLabel('実際の残高')
      .fill(String(computed + 5000));
    await wall(page).getByRole('button', { name: '決定' }).click();

    // 確認ステップに進み、差額と両方の金額を見せる
    await expect(wall(page).getByText('残高のズレを確認')).toBeVisible();
    await expect(wall(page).getByText(/5,000.*ズレています/)).toBeVisible();
    // exact 指定が要る。「アプリの計算」は上の説明文にも含まれる。
    await expect(wall(page).getByText('アプリの計算', { exact: true })).toBeVisible();
    await expect(wall(page).getByText('実際の残高', { exact: true })).toBeVisible();

    // 「いいえ」で入力に戻れる（勝手に確定しない）
    await wall(page).getByRole('button', { name: 'いいえ', exact: true }).click();
    await expect(wall(page).getByLabel('実際の残高')).toBeVisible();
  });
});
