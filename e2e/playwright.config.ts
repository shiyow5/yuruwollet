import { defineConfig, devices } from '@playwright/test';

/**
 * E2E は既定でフロントの本番ビルドを vite preview で配信して実行する。
 * `E2E_BASE_URL` を渡すと外部の配信先（Access 保護デプロイ + service token 等）を対象にできる。
 * Pages Functions / Supabase を含む完全な E2E は Phase 2 で wrangler pages dev に切替える。
 */
const baseURL = process.env.E2E_BASE_URL ?? 'http://localhost:4173';

export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? [['html', { open: 'never' }], ['list']] : 'list',
  use: {
    baseURL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        command:
          'npm --workspace @yuruwollet/frontend run build && npm --workspace @yuruwollet/frontend run preview -- --port 4173 --strictPort',
        url: 'http://localhost:4173',
        reuseExistingServer: !process.env.CI,
        timeout: 180_000,
      },
});
