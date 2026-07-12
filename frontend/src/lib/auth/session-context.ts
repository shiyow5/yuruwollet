import { createContext, useContext } from 'react';
import type { SessionState } from './useSession';

export const SessionContext = createContext<SessionState>({ status: 'loading' });

export function useSessionContext(): SessionState {
  return useContext(SessionContext);
}
