import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.{test,spec}.{ts,tsx}', 'functions/**/*.{test,spec}.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      // Phase が進むごとに include を広げる。現状はロジックのある層のみ 80% ゲート。
      include: ['src/lib/**', 'functions/**'],
      // 生成物・薄い配線 (client 生成 / React hook) は単体テスト対象外
      exclude: ['**/*.types.ts', 'src/lib/supabase.ts', 'src/lib/auth/useSession.ts'],
      thresholds: { lines: 80, functions: 80, branches: 80, statements: 80 },
    },
  },
});
