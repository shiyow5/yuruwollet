import { test, expect, type Page } from '@playwright/test';

/**
 * ウィッシュリストの Realtime 同期（#44）。
 *
 * 手作業だと「2 つの端末（またはウィンドウ）を並べる」必要があり確認が面倒な項目。
 * ここでは **独立した 2 つのブラウザコンテキスト**（別セッション・別 WebSocket）を開き、
 * 片方の操作がもう片方に伝播するかを見る。
 *
 * 前提: supabase_realtime publication に wishlist_items が入っていること。
 * DELETE の伝播には replica identity full が要る
 * （supabase/migrations/20260713050000_wishlist_realtime.sql）。ここはその実測でもある。
 */

async function addWish(page: Page, title: string) {
  await page.getByRole('button', { name: 'ウィッシュを追加' }).click();
  await page.locator('#wish-title').fill(title);
  await page.getByRole('button', { name: '追加', exact: true }).click();
  await expect(page.getByText(title)).toBeVisible();
}

/**
 * 作った品を消す。**実 DB を共有しているので必ず後始末する**
 * （残すとローカルの確認用データ = make testdata に E2E のゴミが混ざる）。
 * 「思い出」に移したものは、そのタブから消す。
 */
async function removeWish(page: Page, title: string, archived = false) {
  await page.goto('/wishlist');
  if (archived) await page.getByRole('radio', { name: '思い出' }).click();
  // タブ切替の直後は一覧がまだ描画されていない。count() を先に読むと 0 と判断して
  // 素通りし、消したつもりで残る（実際にそうなった）。**出るのを待ってから**押す。
  const button = page.getByRole('button', { name: `${title} を削除` });
  await expect(button).toBeVisible();
  await button.click();
  await expect(page.getByText(title)).toHaveCount(0);
}

test.describe('ウィッシュリストの Realtime', () => {
  test('片方で追加すると、もう片方に出る', async ({ browser }) => {
    const [a, b] = [await browser.newContext(), await browser.newContext()];
    const [pa, pb] = [await a.newPage(), await b.newPage()];

    await pa.goto('/wishlist');
    await pb.goto('/wishlist');
    // 購読が張られるまで待つ（一覧の描画完了を代理に使う）
    await expect(pa.getByRole('button', { name: 'ウィッシュを追加' })).toBeVisible();
    await expect(pb.getByRole('button', { name: 'ウィッシュを追加' })).toBeVisible();

    const title = `テスト用の品 ${Date.now()}`;
    await addWish(pa, title);

    // **もう片方にも出る**（Realtime。ここが本題）
    await expect(pb.getByText(title)).toBeVisible({ timeout: 15_000 });

    await removeWish(pa, title);
    await a.close();
    await b.close();
  });

  test('片方で削除すると、もう片方からも消える（replica identity full）', async ({ browser }) => {
    const [a, b] = [await browser.newContext(), await browser.newContext()];
    const [pa, pb] = [await a.newPage(), await b.newPage()];

    await pa.goto('/wishlist');
    await expect(pa.getByRole('button', { name: 'ウィッシュを追加' })).toBeVisible();

    const title = `消す品 ${Date.now()}`;
    await addWish(pa, title);

    await pb.goto('/wishlist');
    await expect(pb.getByText(title)).toBeVisible({ timeout: 15_000 });

    // replica identity が default だと **DELETE はフィルタ付きチャンネルに届かない**。
    // ここが落ちたら full が外れたと考えてよい（pgTAP も守っているが、これは実配信の確認）。
    await pa.getByRole('button', { name: `${title} を削除` }).click();
    const dialog = pa.getByRole('dialog');
    if (await dialog.count()) {
      await dialog
        .getByRole('button', { name: /削除|はい/ })
        .last()
        .click();
    }

    await expect(pa.getByText(title)).toHaveCount(0);
    await expect(pb.getByText(title)).toHaveCount(0, { timeout: 15_000 });

    await a.close();
    await b.close();
  });

  test('「買った！」が相手側でも思い出アーカイブへ移る', async ({ browser }) => {
    const [a, b] = [await browser.newContext(), await browser.newContext()];
    const [pa, pb] = [await a.newPage(), await b.newPage()];

    await pa.goto('/wishlist');
    await expect(pa.getByRole('button', { name: 'ウィッシュを追加' })).toBeVisible();

    const title = `買う品 ${Date.now()}`;
    await addWish(pa, title);

    await pb.goto('/wishlist');
    await expect(pb.getByText(title)).toBeVisible({ timeout: 15_000 });

    const card = pa.locator('li').filter({ hasText: title });
    await card.getByRole('button', { name: '買った！' }).click();

    // 現役リストから消える（両方で）
    await expect(pa.getByText(title)).toHaveCount(0);
    await expect(pb.getByText(title)).toHaveCount(0, { timeout: 15_000 });

    // 思い出アーカイブには居る（削除ではなく移動）
    await pb.getByRole('radio', { name: '思い出' }).click();
    await expect(pb.getByText(title)).toBeVisible();

    await removeWish(pa, title, true);
    await a.close();
    await b.close();
  });
});
