import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createQueryClient } from '../../lib/queryClient';
import { SessionContext } from '../../lib/auth/session-context';
import type { SessionState } from '../../lib/auth/useSession';
import { SubscriptionsPage } from '../../app/pages/SubscriptionsPage';
import type { Subscription } from '../../lib/subscriptions/types';

vi.mock('../../lib/supabase', () => ({ supabase: {} }));

const state = vi.hoisted(() => ({ subs: [] as Subscription[], counter: 0 }));

vi.mock('../../lib/data/subscriptions', () => ({
  listSubscriptions: vi.fn(async (_c: unknown, memberId: string) =>
    state.subs.filter((s) => s.owner_member_id === memberId),
  ),
  getLatestFxRate: vi.fn(async () => ({ rate: 150, rateDate: '2026-07-13' })),
  getSubscriptionMonthlyTotal: vi.fn(async (_c: unknown, memberId: string) =>
    state.subs
      .filter((s) => s.owner_member_id === memberId && s.status !== 'considering_cancel')
      .reduce((sum, s) => sum + (s.monthly_amount_jpy ?? 0), 0),
  ),
  createSubscription: vi.fn(
    async (
      _c: unknown,
      draft: {
        name: string;
        currency: 'JPY' | 'USD';
        originalAmount: number;
        cycle: 'monthly' | 'yearly';
        nextRenewalDate: string;
        status: 'active' | 'trial' | 'considering_cancel';
      },
      fx: { rate: number; rateDate: string } | null,
      ctx: { householdId: string; ownerMemberId: string },
    ) => {
      const amountJpy =
        draft.currency === 'JPY'
          ? Math.round(draft.originalAmount)
          : Math.round(draft.originalAmount * (fx?.rate ?? 0));
      const monthly = draft.cycle === 'yearly' ? Math.round(amountJpy / 12) : amountJpy;
      const row: Subscription = {
        id: `srv-${state.counter++}`,
        household_id: ctx.householdId,
        owner_member_id: ctx.ownerMemberId,
        name: draft.name,
        currency: draft.currency,
        original_amount: draft.originalAmount,
        amount_jpy: amountJpy,
        fx_rate: draft.currency === 'USD' ? (fx?.rate ?? null) : null,
        fx_rate_date: draft.currency === 'USD' ? (fx?.rateDate ?? null) : null,
        cycle: draft.cycle,
        next_renewal_date: draft.nextRenewalDate,
        renewal_anchor_day: Number(draft.nextRenewalDate.slice(8, 10)),
        status: draft.status,
        monthly_amount_jpy: monthly,
        created_at: '2026-07-13T00:00:00Z',
        updated_at: '2026-07-13T00:00:00Z',
      };
      state.subs = [row, ...state.subs];
      return row;
    },
  ),
  updateSubscription: vi.fn(
    async (
      _c: unknown,
      id: string,
      draft: { name: string; originalAmount: number; currency: 'JPY' | 'USD' },
    ) => {
      state.subs = state.subs.map((s) =>
        s.id === id
          ? {
              ...s,
              name: draft.name,
              original_amount: draft.originalAmount,
              amount_jpy: Math.round(draft.originalAmount),
              monthly_amount_jpy: Math.round(draft.originalAmount),
            }
          : s,
      );
      return state.subs.find((s) => s.id === id)!;
    },
  ),
  deleteSubscription: vi.fn(async (_c: unknown, id: string) => {
    state.subs = state.subs.filter((s) => s.id !== id);
  }),
}));

vi.mock('../../lib/data/aggregates', () => ({
  listProfiles: vi.fn(async () => [
    {
      household_id: 'main',
      member_id: 'yururi',
      display_name: 'ゆるり',
      email: null,
      opening_balance: 0,
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
    },
    {
      household_id: 'main',
      member_id: 'shiyowo',
      display_name: 'しよを',
      email: null,
      opening_balance: 0,
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
    },
  ]),
  getMemberBalances: vi.fn(async () => []),
  getMonthlySummary: vi.fn(async () => null),
  getCategoryBreakdown: vi.fn(async () => []),
}));

import {
  createSubscription,
  updateSubscription,
  deleteSubscription,
  listSubscriptions,
  getSubscriptionMonthlyTotal,
} from '../../lib/data/subscriptions';

type OnceMock = { mockImplementationOnce: (fn: () => Promise<unknown>) => void };

function subRow(over: Partial<Subscription> = {}): Subscription {
  return {
    id: 'seed-1',
    household_id: 'main',
    owner_member_id: 'yururi',
    name: 'Netflix',
    currency: 'JPY',
    original_amount: 1490,
    amount_jpy: 1490,
    fx_rate: null,
    fx_rate_date: null,
    cycle: 'monthly',
    next_renewal_date: '2026-08-15',
    renewal_anchor_day: 15,
    status: 'active',
    monthly_amount_jpy: 1490,
    created_at: '2026-07-13T00:00:00Z',
    updated_at: '2026-07-13T00:00:00Z',
    ...over,
  };
}

const authedSession: SessionState = {
  status: 'authenticated',
  session: {
    supabaseJwt: 'jwt',
    expiresAt: 9999999999,
    member: { id: 'yururi', displayName: 'ゆるり' },
    householdId: 'main',
  },
};

function renderPage(session: SessionState = authedSession) {
  const qc = createQueryClient();
  return render(
    <QueryClientProvider client={qc}>
      <SessionContext.Provider value={session}>
        <SubscriptionsPage />
      </SessionContext.Provider>
    </QueryClientProvider>,
  );
}

describe('SubscriptionsPage 統合', () => {
  beforeEach(() => {
    state.subs = [];
    state.counter = 0;
    vi.clearAllMocks();
  });

  it('自分/相手タブと FAB、合計・件数を表示', async () => {
    state.subs = [subRow()];
    renderPage();
    expect(await screen.findByRole('tab', { name: 'ゆるり' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'サブスクを追加' })).toBeInTheDocument();
    expect(await screen.findByText('1件')).toBeInTheDocument();
    // 合計 StatTile 内に ¥1,490（一覧の項目にも同額が出るためスコープする）
    const totalTile = screen.getByText('今月の合計（月換算）').closest('div') as HTMLElement;
    expect(within(totalTile).getByText('¥1,490')).toBeInTheDocument();
  });

  it('サブスクを追加すると一覧と合計に反映される', async () => {
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: 'サブスクを追加' }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.change(within(dialog).getByPlaceholderText('Netflix など'), {
      target: { value: 'Spotify' },
    });
    fireEvent.change(within(dialog).getByPlaceholderText('1490'), { target: { value: '1,280' } });
    fireEvent.click(within(dialog).getByRole('button', { name: '追加' }));

    await waitFor(() => expect(createSubscription).toHaveBeenCalledTimes(1));
    const [, draft] = (createSubscription as unknown as { mock: { calls: unknown[][] } }).mock
      .calls[0];
    expect(draft).toMatchObject({ name: 'Spotify', currency: 'JPY', originalAmount: 1280 });
    // 一覧に出る
    expect(await screen.findByText('Spotify')).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    // 合計 StatTile にも反映（¥1,280）
    const totalTile = screen.getByText('今月の合計（月換算）').closest('div') as HTMLElement;
    await waitFor(() => expect(within(totalTile).getByText('¥1,280')).toBeInTheDocument());
  });

  it('編集: 初期値がプリフィルされ更新すると反映される', async () => {
    state.subs = [subRow({ id: 'seed-1', name: 'Netflix', original_amount: 1490 })];
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: '編集' }));
    const dialog = await screen.findByRole('dialog');
    const amountInput = within(dialog).getByPlaceholderText('1490');
    expect(amountInput).toHaveValue('1490'); // プリフィル
    fireEvent.change(amountInput, { target: { value: '1600' } });
    fireEvent.click(within(dialog).getByRole('button', { name: '更新' }));

    await waitFor(() => expect(updateSubscription).toHaveBeenCalledTimes(1));
    const [, id, draft] = (updateSubscription as unknown as { mock: { calls: unknown[][] } }).mock
      .calls[0];
    expect(id).toBe('seed-1');
    expect(draft).toMatchObject({ originalAmount: 1600 });
    // 更新後の金額が反映（一覧の項目と合計の両方に出るため複数一致でよい）
    expect((await screen.findAllByText('¥1,600')).length).toBeGreaterThan(0);
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('削除: confirm=false では削除しない', async () => {
    state.subs = [subRow({ id: 'seed-1', name: '残す' })];
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    renderPage();
    expect(await screen.findByText('残す')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '削除' }));
    expect(deleteSubscription).not.toHaveBeenCalled();
    expect(screen.getByText('残す')).toBeInTheDocument();
  });

  it('追加失敗時はフォームにエラーを表示', async () => {
    (createSubscription as unknown as OnceMock).mockImplementationOnce(async () => {
      throw new Error('rls');
    });
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: 'サブスクを追加' }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.change(within(dialog).getByPlaceholderText('Netflix など'), {
      target: { value: 'X' },
    });
    fireEvent.change(within(dialog).getByPlaceholderText('1490'), { target: { value: '500' } });
    fireEvent.click(within(dialog).getByRole('button', { name: '追加' }));
    expect(await within(dialog).findByText(/保存に失敗しました/)).toBeInTheDocument();
  });

  it('削除失敗時はエラーバナーを表示', async () => {
    state.subs = [subRow({ id: 'seed-1', name: '消せない' })];
    (deleteSubscription as unknown as OnceMock).mockImplementationOnce(async () => {
      throw new Error('network');
    });
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    renderPage();
    expect(await screen.findByText('消せない')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '削除' }));
    expect(await screen.findByText(/削除に失敗しました/)).toBeInTheDocument();
  });

  it('取得失敗時は合計/件数を ¥0・0件 と見せず — にする', async () => {
    (listSubscriptions as unknown as OnceMock).mockImplementationOnce(async () => {
      throw new Error('net');
    });
    (getSubscriptionMonthlyTotal as unknown as OnceMock).mockImplementationOnce(async () => {
      throw new Error('net');
    });
    // retry を無効にした client で高速にエラー状態へ
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={qc}>
        <SessionContext.Provider value={authedSession}>
          <SubscriptionsPage />
        </SessionContext.Provider>
      </QueryClientProvider>,
    );
    // 一覧はエラー表示
    expect(await screen.findByText('サブスクを読み込めませんでした')).toBeInTheDocument();
    // タイルは — （¥0 / 0件 を出さない）
    const totalTile = screen.getByText('今月の合計（月換算）').closest('div') as HTMLElement;
    expect(within(totalTile).getByText('—')).toBeInTheDocument();
    expect(screen.queryByText('¥0')).toBeNull();
    expect(screen.queryByText('0件')).toBeNull();
  });

  it('相手ビューでは FAB を出さず相手のデータを取得', async () => {
    renderPage();
    fireEvent.click(await screen.findByRole('tab', { name: 'しよを' }));
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: 'サブスクを追加' })).toBeNull(),
    );
    expect(listSubscriptions).toHaveBeenCalledWith(expect.anything(), 'shiyowo');
  });

  it('削除は確認後に実行され一覧から消える', async () => {
    state.subs = [subRow({ id: 'seed-1', name: '解約する' })];
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    renderPage();
    expect(await screen.findByText('解約する')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '削除' }));
    await waitFor(() => expect(screen.queryByText('解約する')).toBeNull());
  });
});
