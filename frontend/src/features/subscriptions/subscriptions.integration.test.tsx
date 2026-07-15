import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createQueryClient } from '../../lib/queryClient';
import { SessionContext } from '../../lib/auth/session-context';
import type { SessionState } from '../../lib/auth/useSession';
import { SubscriptionsPage } from '../../app/pages/SubscriptionsPage';
import type { Subscription } from '../../lib/subscriptions/types';

vi.mock('../../lib/supabase', () => ({ supabase: {} }));

const state = vi.hoisted(() => ({
  subs: [] as Subscription[],
  counter: 0,
  /** 精算 RPC が記録したと返す件数 */
  settledCount: 0,
  payments: { count: 0, total: 0 },
}));

vi.mock('../../lib/data/subscriptions', () => ({
  listSubscriptions: vi.fn(async (_c: unknown, memberId: string) =>
    state.subs.filter((s) => s.owner_member_id === memberId),
  ),
  getLatestFxRate: vi.fn(async () => ({ rate: 150, rateDate: '2026-07-13' })),
  settleMySubscriptions: vi.fn(async () => state.settledCount),
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
  deleteSubscription: vi.fn(async (_c: unknown, id: string, deletePayments = false) => {
    state.subs = state.subs.filter((s) => s.id !== id);
    return deletePayments ? state.payments.count : 0;
  }),
  getSubscriptionPayments: vi.fn(async () => state.payments),
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
  settleMySubscriptions,
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
    state.settledCount = 0;
    state.payments = { count: 0, total: 0 };
    vi.clearAllMocks();
  });

  it('自分/相手タブと FAB、合計・件数を表示', async () => {
    state.subs = [subRow()];
    renderPage();
    expect(await screen.findByRole('radio', { name: 'ゆるり' })).toBeInTheDocument();
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

  it('削除: キャンセルでは削除しない', async () => {
    state.subs = [subRow({ id: 'seed-1', name: '残す' })];
    renderPage();
    expect(await screen.findByText('残す')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '削除' }));

    const dialog = await screen.findByRole('dialog', { name: 'サブスクを削除' });
    fireEvent.click(within(dialog).getByRole('button', { name: 'キャンセル' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
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
    renderPage();
    expect(await screen.findByText('消せない')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '削除' }));
    const dialog = await screen.findByRole('dialog', { name: 'サブスクを削除' });
    fireEvent.click(within(dialog).getByRole('button', { name: '削除する' }));
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
    fireEvent.click(await screen.findByRole('radio', { name: 'しよを' }));
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: 'サブスクを追加' })).toBeNull(),
    );
    expect(listSubscriptions).toHaveBeenCalledWith(expect.anything(), 'shiyowo');
  });

  it('削除は確認後に実行され一覧から消える', async () => {
    state.subs = [subRow({ id: 'seed-1', name: '解約する' })];
    renderPage();
    expect(await screen.findByText('解約する')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '削除' }));
    const dialog = await screen.findByRole('dialog', { name: 'サブスクを削除' });
    fireEvent.click(within(dialog).getByRole('button', { name: '削除する' }));
    await waitFor(() => expect(screen.queryByText('解約する')).toBeNull());
    // 既定は「支払いは残す」
    expect(deleteSubscription).toHaveBeenCalledWith(expect.anything(), 'seed-1', false);
  });

  // #71: 「消したのに家計簿に支出が残っている」と驚かせない。**消す前に**伝える。
  it('支払い記録がある場合、その件数と合計を削除前に伝える', async () => {
    state.subs = [subRow({ id: 'seed-1', name: '解約する' })];
    state.payments = { count: 3, total: 3702 };
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: '削除' }));

    const dialog = await screen.findByRole('dialog', { name: 'サブスクを削除' });
    expect(await within(dialog).findByText(/3 件/)).toBeInTheDocument();
    expect(within(dialog).getByText(/¥3,702/)).toBeInTheDocument();
  });

  it('「支払い記録も一緒に消す」を選ぶと、その指定で削除する', async () => {
    state.subs = [subRow({ id: 'seed-1', name: '解約する' })];
    state.payments = { count: 3, total: 3702 };
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: '削除' }));

    const dialog = await screen.findByRole('dialog', { name: 'サブスクを削除' });
    fireEvent.click(await within(dialog).findByRole('checkbox'));
    fireEvent.click(within(dialog).getByRole('button', { name: '削除する' }));

    await waitFor(() =>
      expect(deleteSubscription).toHaveBeenCalledWith(expect.anything(), 'seed-1', true),
    );
  });

  // **取り消せない操作の直前に、古い数字を見せてはいけない。**
  // 精算（登録・編集）は支払いを増やす。ダイアログを開き直したら必ず取り直す。
  it('ダイアログを開くたびに支払い件数を取り直す（古い件数を見せない）', async () => {
    state.subs = [subRow({ id: 'seed-1', name: '解約する' })];
    state.payments = { count: 1, total: 1000 };
    renderPage();

    // 1 回目
    fireEvent.click(await screen.findByRole('button', { name: '削除' }));
    let dialog = await screen.findByRole('dialog', { name: 'サブスクを削除' });
    expect(await within(dialog).findByText(/1 件/)).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole('button', { name: 'キャンセル' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());

    // その間に精算が走って支払いが増えた体
    state.payments = { count: 2, total: 2234 };

    // 2 回目: 古い「1 件」ではなく、新しい「2 件」が出る
    fireEvent.click(screen.getByRole('button', { name: '削除' }));
    dialog = await screen.findByRole('dialog', { name: 'サブスクを削除' });
    expect(await within(dialog).findByText(/2 件/)).toBeInTheDocument();
    expect(within(dialog).getByText(/¥2,234/)).toBeInTheDocument();
  });

  // 支払いが 0 件ならチェックボックスを出す意味がない（消すものが無い）
  it('支払いが無ければチェックボックスを出さない', async () => {
    state.subs = [subRow({ id: 'seed-1', name: '未課金' })];
    state.payments = { count: 0, total: 0 };
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: '削除' }));

    const dialog = await screen.findByRole('dialog', { name: 'サブスクを削除' });
    expect(await within(dialog).findByText(/まだ支払いは記録されていません/)).toBeInTheDocument();
    expect(within(dialog).queryByRole('checkbox')).toBeNull();
  });

  // 支払いの記録は cron（JST 00:00）だけが行っていたので、更新日が今日/過去の
  // サブスクを登録しても **翌日まで台帳に出なかった**。登録した本人には
  // 「効いていない」ように見える。登録の直後に精算 RPC を呼んで即座に反映する。
  it('登録すると、到来済みの支払いをその場で精算する', async () => {
    state.settledCount = 1;
    renderPage();

    fireEvent.click(await screen.findByRole('button', { name: 'サブスクを追加' }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.change(within(dialog).getByPlaceholderText('Netflix など'), {
      target: { value: 'Netflix' },
    });
    fireEvent.change(within(dialog).getByPlaceholderText('1490'), { target: { value: '1490' } });
    fireEvent.click(within(dialog).getByRole('button', { name: '追加' }));

    await waitFor(() => expect(createSubscription).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(settleMySubscriptions).toHaveBeenCalledTimes(1));
  });

  // 精算が失敗しても、サブスクの登録自体は成功している。
  // ここで「登録できませんでした」と見せるのは嘘（次の cron が拾う）。
  it('精算に失敗しても登録はエラーにしない', async () => {
    (
      settleMySubscriptions as unknown as { mockRejectedValueOnce: (e: Error) => void }
    ).mockRejectedValueOnce(new Error('settle failed'));
    renderPage();

    fireEvent.click(await screen.findByRole('button', { name: 'サブスクを追加' }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.change(within(dialog).getByPlaceholderText('Netflix など'), {
      target: { value: 'Spotify' },
    });
    fireEvent.change(within(dialog).getByPlaceholderText('1490'), { target: { value: '980' } });
    fireEvent.click(within(dialog).getByRole('button', { name: '追加' }));

    await waitFor(() => expect(createSubscription).toHaveBeenCalledTimes(1));
    // フォームは閉じ、一覧に出る（登録は成功しているので）
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(await screen.findByText('Spotify')).toBeInTheDocument();
  });
});
