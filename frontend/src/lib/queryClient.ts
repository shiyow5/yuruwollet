import { QueryClient } from '@tanstack/react-query';

/**
 * アプリ共通の QueryClient を生成する。
 * - server-state は Supabase が真実なので staleTime は短め (30s) にしつつ、
 *   ウィンドウ復帰での過剰な再取得は抑える。
 * - 変異失敗時は自前でロールバックするため mutation の retry は無効。
 */
export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        retry: 1,
        refetchOnWindowFocus: false,
      },
      mutations: {
        retry: false,
      },
    },
  });
}
