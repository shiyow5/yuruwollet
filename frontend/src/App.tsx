import { formatYen } from './lib/format';

export default function App() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-6 bg-custom-bg p-6 text-custom-text">
      <div className="flex w-full max-w-sm flex-col items-center gap-6 rounded-3xl border border-black/5 bg-surface-container p-10 text-center">
        <p className="font-label-sm text-label-sm uppercase tracking-[0.2em] text-custom-text/60">
          yuruwollet
        </p>
        <h1 className="font-headline-md text-[40px] font-bold leading-none text-custom-accent">
          {formatYen(0)}
        </h1>
        <p className="text-body-md text-custom-text/70">
          二人専用の共同ウォレット
          <br />
          セットアップ完了（Phase 0）
        </p>
        <a
          className="rounded-full bg-custom-accent px-6 py-3 font-label-sm text-label-sm text-on-primary transition-opacity hover:opacity-90"
          href="/api/health"
        >
          health check
        </a>
      </div>
    </main>
  );
}
