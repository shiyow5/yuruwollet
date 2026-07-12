import { useSession } from './lib/auth/useSession';

export default function App() {
  const state = useSession();

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-6 bg-custom-bg p-6 text-custom-text">
      <div className="flex w-full max-w-sm flex-col items-center gap-6 rounded-3xl border border-black/5 bg-surface-container p-10 text-center">
        <p className="font-label-sm text-label-sm uppercase tracking-[0.2em] text-custom-text/60">
          yuruwollet
        </p>

        {state.status === 'loading' && (
          <p className="text-body-md text-custom-text/60">読み込み中…</p>
        )}

        {state.status === 'authenticated' && (
          <>
            <h1 className="font-headline-md text-[28px] font-bold leading-tight text-custom-accent">
              ようこそ、{state.session.member.displayName} さん
            </h1>
            <p className="text-body-md text-custom-text/70">セッション確立（Phase 2）</p>
          </>
        )}

        {state.status === 'error' && (
          <p className="text-body-md text-error">認証が必要です（{state.error}）</p>
        )}
      </div>
    </main>
  );
}
