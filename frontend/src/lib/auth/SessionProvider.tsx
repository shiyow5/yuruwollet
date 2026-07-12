import { type ReactNode } from 'react';
import { useSession } from './useSession';
import { SessionContext } from './session-context';

/** アプリ全体で 1 回だけ /api/session を取得し、状態を配布する */
export function SessionProvider({ children }: { children: ReactNode }) {
  const state = useSession();
  return <SessionContext.Provider value={state}>{children}</SessionContext.Provider>;
}
