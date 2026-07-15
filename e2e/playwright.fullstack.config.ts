import { defineConfig, devices } from '@playwright/test';

/**
 * full-stack ブラウザ E2E（#6）。
 *
 * 既定の playwright.config.ts は **フロントのみ**（vite preview、/api/session は無く未認証）。
 * こちらは **本物の全経路**を通す:
 *   wrangler pages dev（SPA + Pages Functions /api/session）+ ローカル supabase（RLS 付き実データ）。
 * DEV_BYPASS_EMAIL で Access を迂回し「ゆるり」としてログイン済みの状態を作り、
 * セッション確立 → JWT 発行 → RLS 越しの実データ表示までを検証する。
 *
 * **前提**（CI は e2e ジョブが用意。ローカルは手動）:
 *   1. `supabase start` && `supabase db reset`（household / profiles / categories を seed）
 *   2. frontend/.dev.vars に DEV_BYPASS_EMAIL=yururi@example.com 等
 *      （SUPABASE_JWT_SECRET はローカル supabase の JWT secret と一致させる。wrangler pages dev が読む）
 * globalSetup が supabase 到達性を確認し、落ちていたら分かりやすく失敗させる。
 */
const PORT = 8788;
const baseURL = `http://127.0.0.1:${PORT}`;

export default defineConfig({
  testDir: './tests-fullstack',
  // 実 DB を共有し、データを書くテストもあるので直列で回す。
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['html', { open: 'never' }], ['list']] : 'list',
  globalSetup: './fullstack-setup.ts',
  // 初回 goto は「冷えた」/api/session（Pages Function の初回起動）+ supabase REST の
  // ウォームアップを含むので、負荷の高いランナーでは既定 5s を超えうる。データ待ちを 15s に広げる。
  expect: { timeout: 15_000 },
  use: {
    baseURL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    // **frontend から実行**して functions/ と .dev.vars を拾わせる（リポジトリルートから叩くと
    // /api/session が消える）。build 済み dist を wrangler pages dev が配信する。
    command:
      'cd ../frontend && npm run build && npx wrangler pages dev dist --port 8788 --ip 127.0.0.1',
    url: baseURL,
    // ローカルは起動済みの wrangler を再利用。CI は毎回新規（クリーンビルド）。
    // **注意**（ローカル）: 再利用は build をスキップするので、前回の wrangler が 8788 に残っていると
    // フロントの変更が反映されない。フロントを変えたら wrangler を止めてから再実行する（make は db reset 込み）。
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
});
