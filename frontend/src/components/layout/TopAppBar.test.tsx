import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { TopAppBar } from './TopAppBar';
import { SessionContext } from '../../lib/auth/session-context';
import type { SessionState } from '../../lib/auth/useSession';
import { appRoutes } from '../../app/routes';

function renderBar(session: SessionState) {
  return render(
    <SessionContext.Provider value={session}>
      <MemoryRouter>
        <TopAppBar />
      </MemoryRouter>
    </SessionContext.Provider>,
  );
}

const authed = (avatarUrl?: string): SessionState => ({
  status: 'authenticated',
  session: {
    supabaseJwt: 'jwt',
    expiresAt: 9999999999,
    member: { id: 'yururi', displayName: 'ゆるり', avatarUrl },
    householdId: 'main',
  },
});

describe('TopAppBar', () => {
  // routes.tsx の `entry` は「ナビ以外の到達手段」の宣言。
  // **宣言しただけで実際にリンクが無ければ、到達できないルートが復活する。**
  // routes.test.ts の「到達手段がある」ガードの実体はここ。
  it('entry: top-app-bar のルートには実際にリンクがある', () => {
    const { container } = renderBar(authed());
    const declared = appRoutes.filter((r) => r.entry?.via === 'top-app-bar');
    expect(declared.length).toBeGreaterThan(0);
    for (const route of declared) {
      expect(
        container.querySelector(`a[href="${route.path}"]`),
        `${route.path} が TopAppBar から到達できない`,
      ).not.toBeNull();
    }
  });

  // どのページを見ていても「いま誰なのか」が分かる必要がある
  // （相手タブを見ているときに自分が誰か混乱する）。画像だけでは読み上げられない。
  it('ログイン中は「ゆるり としてログイン中」のリンクを出す', () => {
    renderBar(authed());
    const link = screen.getByRole('link', { name: 'ゆるり としてログイン中' });
    expect(link).toHaveAttribute('href', '/settings');
  });

  it('画像が無ければ頭文字を出す（Access の picture は best-effort）', () => {
    renderBar(authed());
    expect(screen.getByText('ゆ')).toBeInTheDocument();
  });

  it('画像があれば img を出す', () => {
    const { container } = renderBar(authed('https://lh3.googleusercontent.com/a/x'));
    expect(container.querySelector('img')).not.toBeNull();
  });

  // E2E（vite preview）では Pages Functions が動かず /api/session が無いので、
  // セッションは必ず error になる。**設定への導線が消えてはいけない**
  // （消えると /settings に到達する手段が無くなる）。
  it('セッションが取れなくても設定への導線は残る', () => {
    for (const session of [
      { status: 'loading' } as SessionState,
      { status: 'error', error: 'boom' } as unknown as SessionState,
    ]) {
      const { unmount } = renderBar(session);
      expect(screen.getByRole('link', { name: '設定' })).toHaveAttribute('href', '/settings');
      unmount();
    }
  });

  // 歯車は /mypage を指しており、ボトムナビの「マイページ」と完全に重複していた。
  // （/mypage へのリンク自体は DesktopNav に正当に存在するので、歯車アイコンの不在で見る）
  it('歯車は置かない（/mypage を指していてボトムナビと重複していた）', () => {
    renderBar(authed());
    expect(screen.queryByText('settings')).toBeNull();
  });
});
