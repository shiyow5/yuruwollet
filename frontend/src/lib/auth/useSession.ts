import { useEffect, useState } from 'react';
import { fetchSession, type SessionInfo } from './session-client';

export type SessionState =
  | { status: 'loading' }
  | { status: 'authenticated'; session: SessionInfo }
  | { status: 'error'; error: string };

/** マウント時に /api/session を取得しセッション状態を返す */
export function useSession(): SessionState {
  const [state, setState] = useState<SessionState>({ status: 'loading' });

  useEffect(() => {
    let alive = true;
    fetchSession()
      .then((session) => {
        if (alive) setState({ status: 'authenticated', session });
      })
      .catch((err: unknown) => {
        if (alive)
          setState({ status: 'error', error: err instanceof Error ? err.message : String(err) });
      });
    return () => {
      alive = false;
    };
  }, []);

  return state;
}
