import { Outlet } from 'react-router';
import { TopAppBar } from './TopAppBar';
import { BottomNav } from './BottomNav';
import { useSessionContext } from '../../lib/auth/session-context';

export function AppShell() {
  const session = useSessionContext();

  return (
    <div className="min-h-dvh bg-custom-bg pb-24 md:pb-0">
      <TopAppBar />
      {session.status === 'error' && (
        <div
          role="alert"
          className="bg-error/10 px-5 py-2 text-center font-label-sm text-label-sm text-error md:px-16"
        >
          セッションを確立できません。ページを再読み込みしてください。
        </div>
      )}
      <main className="mx-auto flex max-w-[1200px] flex-col gap-8 px-5 pb-16 pt-2 md:px-16">
        <Outlet />
      </main>
      <BottomNav />
    </div>
  );
}
