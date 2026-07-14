import { defineConfig, type Plugin } from 'vitest/config';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { buildHeadersFile, securityHeaders } from './src/lib/security/csp';

/** ローカル supabase。src/lib/supabase.ts の既定値と揃えること。 */
const LOCAL_SUPABASE_URL = 'http://127.0.0.1:54321';

const supabaseUrl = () => process.env.VITE_SUPABASE_URL || LOCAL_SUPABASE_URL;

/**
 * Cloudflare Pages の `_headers` をビルド時に生成する（#41）。
 *
 * CSP の connect-src には Supabase のオリジンが要り、これは環境ごとに違う。
 * public/_headers に静的に置くと本番のオリジンを書けず、REST も Realtime も落ちる。
 */
function headersPlugin(): Plugin {
  return {
    name: 'yuruwollet-headers',
    apply: 'build',
    generateBundle() {
      this.emitFile({
        type: 'asset',
        fileName: '_headers',
        source: buildHeadersFile(supabaseUrl()),
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), tailwindcss(), headersPlugin()],
  // **E2E（vite preview）にも本番と同じヘッダを付ける。**
  // 付けないと E2E は CSP の無い世界で回り、「テストは緑なのに本番だけ真っ白」を
  // 検出できない。_headers と同じ securityHeaders() から作る。
  preview: { headers: securityHeaders(supabaseUrl()) },
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
});
