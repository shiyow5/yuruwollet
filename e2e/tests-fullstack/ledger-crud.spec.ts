import { test, expect, type Page } from '@playwright/test';

/**
 * クロックを 24 日より前に固定する（#98）。
 *
 * この spec は 24日の残高確認の壁とは無関係だが、`?now=` を付けずに素の `/` を開くと
 * **実行日が 24〜末日のときは壁（今月の残高確認ダイアログ）が全面に出て操作を遮る**。
 * 壁はサーバ実時刻ではなく `?now=` で表示ゲートを判定する（wall.spec と同じ seam）ので、
 * ここでは常に壁の出ない日に固定して、実行日に依存せず決定的にする。
 * VITE_ALLOW_CLOCK_OVERRIDE=true でビルドしているので `?now=` が効く。
 */
const CLOCK = '2026-07-20';
function at(path: string): string {
  return path.includes('?') ? `${path}&now=${CLOCK}` : `${path}?now=${CLOCK}`;
}

/**
 * 収支の追加・編集・削除と、それが残高へ伝わるか（#44）。
 *
 * ここは**楽観更新とサーバの実データが食い違わないか**を見るのが主眼。
 * 単体テストはモックの上で通るので、RLS 越しの実挿入 → 集計 View の再計算までは
 * この層でしか確かめられない。
 *
 * **各テストは自分が作った行を必ず消す。** 実 DB を共有しており、残すと
 *   - 後続の locator が過去の行に当たって strict mode 違反になる（実際になった）
 *   - ローカルの確認用データ（make testdata）に E2E のゴミが混ざる
 * ため。文言に Date.now() を入れて、実行ごとにも衝突しないようにしている。
 */

function yen(text: string | null): number {
  return Number((text ?? '').replace(/[^\d-]/g, ''));
}

async function balance(page: Page): Promise<number> {
  return yen(await page.getByTestId('current-balance').textContent());
}

async function addTransaction(
  page: Page,
  kind: '収入' | '支出',
  amount: number,
  memo: string,
  category?: string,
) {
  await page.getByRole('button', { name: kind }).first().click();
  await page.locator('#txn-amount').fill(String(amount));
  await page.locator('#txn-memo').fill(memo);
  if (category) await page.locator('#txn-category').selectOption({ label: category });
  await page.getByRole('button', { name: '追加', exact: true }).click();
}

/**
 * 取引の削除。
 *
 * **確認はネイティブの `window.confirm`**（LedgerPage.tsx:58）で、`role="dialog"` の
 * モーダルではない。Playwright はネイティブダイアログを**既定で拒否**するので、
 * ハンドラを付けないと削除が黙って実行されない（それで最初このテストが落ちた）。
 */
async function removeTransaction(page: Page, memo: string) {
  await page.goto(at('/ledger'));
  page.once('dialog', (d) => d.accept());
  const row = page.getByRole('listitem').filter({ hasText: memo }).first();
  await row.getByRole('button', { name: '削除' }).click();
  await expect(page.getByRole('listitem').filter({ hasText: memo })).toHaveCount(0);
}

test.describe('収支の CRUD と残高への反映', () => {
  test('収入を追加すると残高がそのぶん増え、消すと戻る', async ({ page }) => {
    const memo = `E2E 収入 ${Date.now()}`;
    await page.goto(at('/'));
    const start = await balance(page);

    await addTransaction(page, '収入', 12345, memo);
    await expect(page.getByTestId('current-balance')).toHaveText(
      `¥${(start + 12345).toLocaleString('ja-JP')}`,
    );

    await removeTransaction(page, memo);
    await page.goto(at('/'));
    await expect(page.getByTestId('current-balance')).toHaveText(
      `¥${start.toLocaleString('ja-JP')}`,
    );
  });

  test('追加 → 編集 → 削除を通しで行い、残高が追随する', async ({ page }) => {
    const memo = `E2E 一周 ${Date.now()}`;
    await page.goto(at('/'));
    const start = await balance(page);

    // 追加（-1,000）
    await addTransaction(page, '支出', 1000, memo, '食費');
    await expect(page.getByTestId('current-balance')).toHaveText(
      `¥${(start - 1000).toLocaleString('ja-JP')}`,
    );
    // 履歴の行としてちょうど 1 件出る
    await expect(page.getByRole('listitem').filter({ hasText: memo })).toHaveCount(1);

    // 編集（1,000 → 3,000 なので更に -2,000）
    await page.goto(at('/ledger'));
    await page
      .getByRole('listitem')
      .filter({ hasText: memo })
      .first()
      .getByRole('button', { name: '編集' })
      .click();
    await page.locator('#txn-amount').fill('3000');
    await page
      .getByRole('button', { name: /保存|更新/ })
      .last()
      .click();
    await page.goto(at('/'));
    await expect(page.getByTestId('current-balance')).toHaveText(
      `¥${(start - 3000).toLocaleString('ja-JP')}`,
    );

    // 削除（元に戻る）
    await removeTransaction(page, memo);
    await page.goto(at('/'));
    await expect(page.getByTestId('current-balance')).toHaveText(
      `¥${start.toLocaleString('ja-JP')}`,
    );
  });

  test('記録をタップすると詳細が出る（#105）', async ({ page }) => {
    await page.goto(at('/ledger'));
    // seed の記録を 1 件タップ（詳細ボタンは「… の詳細」）。読み取り専用なので後始末不要。
    await page
      .getByRole('button', { name: / の詳細$/ })
      .first()
      .click();
    await expect(page.getByRole('dialog', { name: '取引の詳細' })).toBeVisible();
  });

  test('月切替で過去の月を遡れる', async ({ page }) => {
    await page.goto(at('/ledger'));
    const heading = page.getByText(/\d{4}年\d{1,2}月の記録/);
    const first = await heading.textContent();

    await page.getByRole('button', { name: '前の月' }).click();
    await expect(heading).not.toHaveText(first ?? '');

    await page.getByRole('button', { name: '次の月' }).click();
    await expect(heading).toHaveText(first ?? '');
  });

  test('自分/相手タブで相手の残高に切り替わり、相手の分は書けない', async ({ page }) => {
    await page.goto(at('/'));
    const mine = await balance(page);

    await page
      .getByRole('radiogroup', { name: '表示するメンバー' })
      .getByRole('radio', { name: 'しよを' })
      .click();

    // 相手の残高は自分と別の値
    await expect(page.getByTestId('current-balance')).not.toHaveText(
      `¥${mine.toLocaleString('ja-JP')}`,
    );
    // 相手ビューでは追加導線を出さない（書けるのは自分の分だけ = RLS と UI の一致）
    await expect(page.getByRole('button', { name: '収入' })).toHaveCount(0);
  });
});
