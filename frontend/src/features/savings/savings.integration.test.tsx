import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SessionContext } from '../../lib/auth/session-context';
import type { SessionState } from '../../lib/auth/useSession';
import { MyPage } from '../../app/pages/MyPage';
import type { SavingsProgress } from '../../lib/savings/types';

vi.mock('../../lib/supabase', () => ({ supabase: {} }));

const state = vi.hoisted(() => ({
  /** member_id -> 目標行（null = 未設定） */
  goals: {} as Record<string, unknown>,
  openingBalance: 10000,
  balance: 45000,
  progressFails: false,
  saveFails: false,
  balanceFails: false,
}));

vi.mock('../../lib/data/savings', () => ({
  getSavingsProgress: vi.fn(async (_c: unknown, memberId: string) => {
    if (state.progressFails) throw new Error('progress failed');
    return (state.goals[memberId] as SavingsProgress | undefined) ?? null;
  }),
  saveSavingsGoal: vi.fn(async (_c: unknown, input: { memberId: string; targetAmount: number }) => {
    if (state.saveFails) throw new Error('save failed');
    state.goals[input.memberId] = {
      household_id: 'main',
      member_id: input.memberId,
      period_month: '2026-07-01',
      target_amount: input.targetAmount,
      saved: 12000,
      achieved: 12000 >= input.targetAmount,
    };
  }),
  deleteSavingsGoal: vi.fn(async (_c: unknown, memberId: string) => {
    delete state.goals[memberId];
  }),
  updateOpeningBalance: vi.fn(async (_c: unknown, _m: string, value: number) => {
    state.openingBalance = value;
  }),
}));

vi.mock('../../lib/data/aggregates', () => ({
  listProfiles: vi.fn(async () => [
    {
      member_id: 'yururi',
      display_name: 'ゆるり',
      household_id: 'main',
      email: 'yururi@example.com',
      opening_balance: state.openingBalance,
    },
    {
      member_id: 'shiyowo',
      display_name: 'しよを',
      household_id: 'main',
      email: 'shiyowo@example.com',
      opening_balance: 0,
    },
  ]),
  getMemberBalances: vi.fn(async () => {
    if (state.balanceFails) throw new Error('balance failed');
    return [
      { household_id: 'main', member_id: 'yururi', display_name: 'ゆるり', balance: state.balance },
      { household_id: 'main', member_id: 'shiyowo', display_name: 'しよを', balance: 0 },
    ];
  }),
  getMonthlySummary: vi.fn(async () => null),
  getCategoryBreakdown: vi.fn(async () => []),
}));

const authedSession: SessionState = {
  status: 'authenticated',
  session: {
    supabaseJwt: 'jwt',
    expiresAt: 9999999999,
    member: { id: 'yururi', displayName: 'ゆるり' },
    householdId: 'main',
  },
};

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <SessionContext.Provider value={authedSession}>
        <MyPage />
      </SessionContext.Provider>
    </QueryClientProvider>,
  );
}

function goal(over: Partial<SavingsProgress> = {}): SavingsProgress {
  return {
    household_id: 'main',
    member_id: 'yururi',
    period_month: '2026-07-01',
    target_amount: 30000,
    saved: 12000,
    achieved: false,
    ...over,
  };
}

describe('MyPage 統合（目標貯金 + プロフィール）', () => {
  beforeEach(() => {
    state.goals = {};
    state.openingBalance = 10000;
    state.balance = 45000;
    state.progressFails = false;
    state.saveFails = false;
    state.balanceFails = false;
    vi.clearAllMocks();
  });

  it('目標未設定なら設定を促す', async () => {
    renderPage();
    expect(await screen.findByText('今月の目標はまだありません')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '目標を決める' })).toBeInTheDocument();
  });

  it('目標を設定すると進捗リングが出る', async () => {
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: '目標を決める' }));
    fireEvent.change(screen.getByLabelText('目標額'), { target: { value: '30000' } });
    fireEvent.click(screen.getByRole('button', { name: '保存' }));

    // 12000 / 30000 = 40%
    expect(
      await screen.findByRole('img', { name: /目標 ¥30,000 に対して ¥12,000（40%）/ }),
    ).toBeInTheDocument();
    expect(screen.getByText(/目標まであと ¥18,000/)).toBeInTheDocument();
  });

  it('達成したら達成バッジを出す', async () => {
    state.goals.yururi = goal({ target_amount: 10000, saved: 12000, achieved: true });
    renderPage();
    expect(await screen.findByText('達成！')).toBeInTheDocument();
    expect(screen.getByText('目標を達成しました！')).toBeInTheDocument();
  });

  // 使いすぎている事実を 0 に丸めて隠さない
  it('今月の収支がマイナスなら実額をマイナスで見せ、使いすぎを警告する', async () => {
    state.goals.yururi = goal({ saved: -3000 });
    renderPage();

    expect(
      await screen.findByRole('img', { name: /目標 ¥30,000 に対して -¥3,000（0%）/ }),
    ).toBeInTheDocument();
    expect(screen.getByText('今月は支出が収入を上回っています')).toBeInTheDocument();
    // 残りは目標額より多くなる
    expect(screen.getByText(/目標まであと ¥33,000/)).toBeInTheDocument();
  });

  it('不正な目標額は保存しない', async () => {
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: '目標を決める' }));
    fireEvent.change(screen.getByLabelText('目標額'), { target: { value: '-1' } });
    fireEvent.click(screen.getByRole('button', { name: '保存' }));

    expect(await screen.findByText(/目標額は0円以上/)).toBeInTheDocument();
  });

  it('目標をやめられる', async () => {
    state.goals.yururi = goal();
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: '目標をやめる' }));
    expect(await screen.findByText('今月の目標はまだありません')).toBeInTheDocument();
  });

  it('相手のタブでは目標を閲覧のみにする', async () => {
    state.goals.shiyowo = goal({ member_id: 'shiyowo', target_amount: 50000, saved: 20000 });
    renderPage();
    await screen.findByText('今月の目標はまだありません'); // 自分は未設定

    fireEvent.click(screen.getByRole('tab', { name: 'しよを' }));

    expect(
      await screen.findByRole('img', { name: /目標 ¥50,000 に対して ¥20,000（40%）/ }),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '目標を変える' })).toBeNull();
    expect(screen.queryByRole('button', { name: '目標をやめる' })).toBeNull();
  });

  it('保存に失敗したらエラーを表示する', async () => {
    state.saveFails = true;
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: '目標を決める' }));
    fireEvent.change(screen.getByLabelText('目標額'), { target: { value: '30000' } });
    fireEvent.click(screen.getByRole('button', { name: '保存' }));

    expect(await screen.findByText(/目標を保存できませんでした/)).toBeInTheDocument();
  });

  it('取得に失敗したらエラーを表示する（未設定に見せない）', async () => {
    state.progressFails = true;
    renderPage();
    expect(await screen.findByText(/目標貯金を取得できませんでした/)).toBeInTheDocument();
    expect(screen.queryByText('今月の目標はまだありません')).toBeNull();
  });

  it('プロフィールに固定名とメールを出す', async () => {
    renderPage();
    // 「ゆるり」はタブにも出るので、メール（プロフィール固有）を起点に同じカード内を見る
    const email = await screen.findByText('yururi@example.com');
    const card = email.closest('div')!.parentElement!;
    expect(within(card).getByText('ゆるり')).toBeInTheDocument();
  });

  it('初期残高を更新できる', async () => {
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: '初期残高を変える' }));
    fireEvent.change(screen.getByLabelText('初期残高'), { target: { value: '50000' } });
    fireEvent.click(screen.getByRole('button', { name: '保存' }));

    await waitFor(() => expect(screen.getByText('¥50,000')).toBeInTheDocument());
  });

  it('不正な初期残高は保存しない', async () => {
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: '初期残高を変える' }));
    fireEvent.change(screen.getByLabelText('初期残高'), { target: { value: '-1' } });
    fireEvent.click(screen.getByRole('button', { name: '保存' }));

    expect(await screen.findByText(/初期残高は0円以上/)).toBeInTheDocument();
  });

  // 取得失敗時に ¥0 を「実データ」として見せない
  it('残高の取得に失敗したら現在の残高を — にする', async () => {
    state.balanceFails = true;
    renderPage();
    await screen.findByText('現在の残高');
    expect(await screen.findByText('—')).toBeInTheDocument();
  });
});
