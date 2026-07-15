import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router';
import { SessionContext } from '../../lib/auth/session-context';
import type { SessionState } from '../../lib/auth/useSession';
import { SettingsPage } from '../../app/pages/SettingsPage';

vi.mock('../../lib/supabase', () => ({ supabase: {} }));

// カテゴリ管理は設定に一本化した（#75）。CategoryManager がデータ層を呼ぶのでモックする。
vi.mock('../../lib/data/categories', () => ({
  listCategories: vi.fn(async () => []),
  createCategory: vi.fn(),
  archiveCategory: vi.fn(),
  unarchiveCategory: vi.fn(),
  deleteCategory: vi.fn(),
  getCategoryUsage: vi.fn(async () => 0),
}));
vi.mock('../../lib/auth/logout', () => ({
  ACCESS_LOGOUT_URL: '/cdn-cgi/access/logout',
  logout: vi.fn(async () => {}),
}));

const state = vi.hoisted(() => ({ profilesFail: false }));

vi.mock('../../lib/data/aggregates', () => ({
  listProfiles: vi.fn(async () => {
    if (state.profilesFail) throw new Error('profiles failed');
    return [
      {
        household_id: 'main',
        member_id: 'yururi',
        display_name: 'ゆるり',
        email: 'yururi@example.com',
        opening_balance: 0,
        created_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-01-01T00:00:00Z',
      },
    ];
  }),
  getMemberBalances: vi.fn(async () => []),
  getMonthlySummary: vi.fn(async () => null),
  getCategoryBreakdown: vi.fn(async () => []),
}));

import { logout } from '../../lib/auth/logout';

const authed: SessionState = {
  status: 'authenticated',
  session: {
    supabaseJwt: 'jwt',
    expiresAt: 9999999999,
    member: { id: 'yururi', displayName: 'ゆるり' },
    householdId: 'main',
  },
};

function renderSettings(session: SessionState = authed) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <SessionContext.Provider value={session}>
        <MemoryRouter initialEntries={['/settings']}>
          <SettingsPage />
        </MemoryRouter>
      </SessionContext.Provider>
    </QueryClientProvider>,
  );
  return qc;
}

describe('SettingsPage', () => {
  beforeEach(() => {
    state.profilesFail = false;
    vi.clearAllMocks();
  });

  it('見出しとログイン中のメールを表示する', async () => {
    renderSettings();
    expect(screen.getByRole('heading', { name: '設定' })).toBeInTheDocument();
    expect(await screen.findByText('yururi@example.com')).toBeInTheDocument();
  });

  // 誤タップのコストが大きい（30日の Access セッションを破棄 → Google で再認証）
  it('ログアウトを押すと確認を求める', async () => {
    renderSettings();
    fireEvent.click(await screen.findByRole('button', { name: 'ログアウト' }));
    expect(await screen.findByRole('dialog', { name: 'ログアウト' })).toBeInTheDocument();
    expect(logout).not.toHaveBeenCalled();
  });

  // Access のログアウトは CF_Authorization を消すが、**Google のセッションは消えない**。
  // Cloudflare の Google IdP には prompt パラメータが無く、再認証を強制する手段が無い。
  // 「ログアウトしたのにすぐ入れる」と混乱するので、事前に伝える。
  it('確認ダイアログで Google のログイン状態が残ることを伝える', async () => {
    renderSettings();
    fireEvent.click(await screen.findByRole('button', { name: 'ログアウト' }));
    const dialog = await screen.findByRole('dialog', { name: 'ログアウト' });
    expect(within(dialog).getByText(/Google のログイン状態は残ります/)).toBeInTheDocument();
  });

  it('確認するとログアウトする', async () => {
    renderSettings();
    fireEvent.click(await screen.findByRole('button', { name: 'ログアウト' }));
    const dialog = await screen.findByRole('dialog', { name: 'ログアウト' });
    fireEvent.click(within(dialog).getByRole('button', { name: 'ログアウトする' }));
    expect(logout).toHaveBeenCalledTimes(1);
  });

  // logout の順序契約（捨ててから遷移／捨てるのが失敗しても必ず遷移）は logout.test.ts が見ている。
  // ここで見るのは **配線**: logout に渡している clearCaches が、本当にこの画面の
  // QueryClient を空にするか。ここをモックのまま素通りさせると、
  // 「渡し忘れ」「別の QueryClient を掴んでいる」に気づけず、
  // 前の人のデータを抱えたまま次の人がログインしうる。
  it('ログアウト時に、この画面の QueryClient を捨てる関数を渡す', async () => {
    const qc = renderSettings();
    qc.setQueryData(['前の人のデータ'], { balance: 12345 });

    fireEvent.click(await screen.findByRole('button', { name: 'ログアウト' }));
    const dialog = await screen.findByRole('dialog', { name: 'ログアウト' });
    fireEvent.click(within(dialog).getByRole('button', { name: 'ログアウトする' }));

    const options = vi.mocked(logout).mock.calls[0]?.[0];
    expect(options?.clearCaches).toBeTypeOf('function');

    options!.clearCaches!();
    expect(qc.getQueryData(['前の人のデータ'])).toBeUndefined();
  });

  it('キャンセルするとログアウトしない', async () => {
    renderSettings();
    fireEvent.click(await screen.findByRole('button', { name: 'ログアウト' }));
    const dialog = await screen.findByRole('dialog', { name: 'ログアウト' });
    fireEvent.click(within(dialog).getByRole('button', { name: 'キャンセル' }));
    expect(logout).not.toHaveBeenCalled();
  });

  // E2E（vite preview）では Pages Functions が動かず /api/session が無いので、
  // セッションは必ず error になる。**未認証でも設定ページは壊れず、ログアウトは押せる**こと。
  // （ログアウト自体はセッションを必要としない）
  it('セッションが取れなくてもログアウトは押せる', async () => {
    renderSettings({ status: 'error', error: 'nope' } as unknown as SessionState);
    expect(screen.getByRole('heading', { name: '設定' })).toBeInTheDocument();
    expect(await screen.findByRole('button', { name: 'ログアウト' })).toBeEnabled();
  });

  it('プロフィールを取得できなくてもログアウトは押せる', async () => {
    state.profilesFail = true;
    renderSettings();
    expect(await screen.findByRole('button', { name: 'ログアウト' })).toBeEnabled();
  });

  // #75: カテゴリ管理は設定に一本化した（以前は家計簿ページのモーダル）
  it('カテゴリ管理が設定にある', async () => {
    renderSettings();
    expect(await screen.findByRole('heading', { name: 'カテゴリ管理' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'カテゴリを追加' })).toBeInTheDocument();
  });
});
