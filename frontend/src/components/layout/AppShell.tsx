import { Outlet } from 'react-router';
import { TopAppBar } from './TopAppBar';
import { BottomNav } from './BottomNav';

export function AppShell() {
  return (
    <div className="min-h-dvh bg-custom-bg pb-24 md:pb-0">
      <TopAppBar />
      <main className="mx-auto flex max-w-[1200px] flex-col gap-8 px-5 pb-16 pt-2 md:px-16">
        <Outlet />
      </main>
      <BottomNav />
    </div>
  );
}
