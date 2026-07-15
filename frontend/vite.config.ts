import { defineConfig, type Plugin } from 'vitest/config';
// loadEnv は vitest/config からは再エクスポートされていない
import { loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';
import { buildHeadersFile, securityHeaders } from './src/lib/security/csp';
import { pwaOptions } from './src/lib/pwa/pwa-config';

/** ローカル supabase。src/lib/supabase.ts の既定値と揃えること。 */
const LOCAL_SUPABASE_URL = 'http://127.0.0.1:54321';

/**
 * アプリのコードと**同じ**解決で VITE_SUPABASE_URL を得る。
 *
 * **`process.env.VITE_SUPABASE_URL` を直接読んではいけない。**
 * Vite は `.env` の値を `import.meta.env`（アプリ側）にしか入れず、
 * **vite.config.ts の `process.env` には入れない**。
 * そのため `frontend/.env` に書いて `make deploy-frontend` する経路
 * （docs/DEPLOY.md の手順）では、
 *   - バンドル       → 本番の Supabase URL（import.meta.env 経由。正しい）
 *   - CSP の connect-src → localhost にフォールバック（**間違い**）
 * となり、**画面は出るのに Supabase への通信が CSP で全部塞がれる**。
 * loadEnv は .env とシェル環境変数の両方を、アプリと同じ規則で解決する。
 */
function resolveSupabaseUrl(mode: string): string {
  const env = loadEnv(mode, process.cwd(), 'VITE_');
  return env.VITE_SUPABASE_URL || LOCAL_SUPABASE_URL;
}

/**
 * Cloudflare Pages の `_headers` をビルド時に生成する（#41）。
 *
 * CSP の connect-src には Supabase のオリジンが要り、これは環境ごとに違う。
 * public/_headers に静的に置くと本番のオリジンを書けず、REST も Realtime も落ちる。
 */
function headersPlugin(supabaseUrl: string): Plugin {
  return {
    name: 'yuruwollet-headers',
    apply: 'build',
    generateBundle() {
      this.emitFile({
        type: 'asset',
        fileName: '_headers',
        source: buildHeadersFile(supabaseUrl),
      });
    },
  };
}

export default defineConfig(({ mode }) => {
  const supabaseUrl = resolveSupabaseUrl(mode);

  return {
    // VitePWA は service worker を生成する（#55）。設定の理由（Access/CSP との両立）は
    // src/lib/pwa/pwa-config.ts と pwa-config.test.ts を参照。
    plugins: [react(), tailwindcss(), headersPlugin(supabaseUrl), VitePWA(pwaOptions)],
    // **E2E（vite preview）にも本番と同じヘッダを付ける。**
    // 付けないと E2E は CSP の無い世界で回り、「テストは緑なのに本番だけ真っ白」を
    // 検出できない。_headers と同じ securityHeaders() から作る。
    preview: { headers: securityHeaders(supabaseUrl) },
    build: {
      rollupOptions: {
        output: {
          // 変わりにくい vendor を分離してキャッシュを効かせ、初回の並列取得も速くする（#12）。
          // 画面はルート単位で lazy 分割（src/app/routes.tsx）。
          manualChunks: {
            'react-vendor': ['react', 'react-dom', 'react-router'],
            'supabase-vendor': ['@supabase/supabase-js'],
            'query-vendor': ['@tanstack/react-query'],
          },
        },
      },
    },
    test: {
      environment: 'jsdom',
      globals: true,
      setupFiles: ['./src/test/setup.ts'],
      include: ['src/**/*.{test,spec}.{ts,tsx}', 'functions/**/*.{test,spec}.ts'],
      coverage: {
        provider: 'v8',
        reporter: ['text', 'html'],
        // Phase が進むごとに include を広げる。現状はロジックのある層のみ 80% ゲート。
        include: ['src/lib/**', 'src/components/ui/**', 'functions/**'],
        // 生成物・薄い配線 (client 生成 / React hook) は単体テスト対象外
        exclude: [
          '**/*.types.ts',
          'src/lib/ledger/types.ts',
          'src/lib/subscriptions/types.ts',
          'src/lib/wall/types.ts',
          'src/lib/supabase.ts',
          'src/lib/queryClient.ts',
          'src/lib/auth/useSession.ts',
          'src/lib/auth/SessionProvider.tsx',
          'src/lib/auth/session-context.ts',
        ],
        thresholds: { lines: 80, functions: 80, branches: 80, statements: 80 },
      },
    },
  };
});
