import { Suspense } from 'react';
import { Outlet } from 'react-router';
import { TopAppBar } from './TopAppBar';
import { BottomNav } from './BottomNav';
import { BalanceWall } from '../../features/wall/BalanceWall';
import { useSessionContext } from '../../lib/auth/session-context';
import { Skeleton } from '../ui';

/** ルートのチャンク読み込み中（#12 の遅延ロード）。ナビは出したままコンテンツだけ差し替える。 */
function PageFallback() {
  return (
    <div className="flex flex-col gap-4" aria-hidden="true">
      <Skeleton className="h-28 rounded-2xl" />
      <Skeleton className="h-28 rounded-2xl" />
      <Skeleton className="h-28 rounded-2xl" />
    </div>
  );
}

export function AppShell() {
  const session = useSessionContext();

  return (
    // ボトムナビの高さ + セーフエリアぶん、コンテンツの下に余白を空ける。
    // 空けないと最後のカードがナビに隠れる。
    // env() は該当しない端末では 0 なので、PC の見た目は変わらない。
    <div className="min-h-dvh bg-custom-bg pb-[calc(6rem+env(safe-area-inset-bottom))] md:pb-0">
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
        <Suspense fallback={<PageFallback />}>
          <Outlet />
        </Suspense>
      </main>
      <BottomNav />
      {/* 毎月24日の残高確認の壁（条件を満たすときだけ全画面ロックで出る） */}
      <BalanceWall />
    </div>
  );
}
