import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SessionContext } from '../../lib/auth/session-context';
import type { SessionState } from '../../lib/auth/useSession';
import { ChartsBoard } from './ChartsBoard';

vi.mock('../../lib/supabase', () => ({ supabase: {} }));

const state = vi.hoisted(() => ({
  trend: [] as unknown[],
  categories: [] as unknown[],
  subs: [] as unknown[],
  savings: [] as unknown[],
  trendFails: false,
  subsFails: false,
}));

// Recharts は jsdom では幅 0 になり中身を描かない。
// 「何を渡したか」を検証できるよう、系列を data-* に落とす軽量スタブに差し替える。
vi.mock('./TrendChart', () => ({
  TrendChart: ({ data }: { data: { label: string; income: number }[] }) => (
    <div data-testid="trend" data-points={data.map((d) => `${d.label}:${d.income}`).join(',')} />
  ),
  SavingsHistoryChart: ({ data }: { data: { label: string; target: number }[] }) => (
    <div data-testid="savings" data-points={data.map((d) => `${d.label}:${d.target}`).join(',')} />
  ),
}));
vi.mock('./DonutChart', () => ({
  DonutChart: ({ data }: { data: { name: string; value: number }[] }) => (
    <div data-testid="donut" data-slices={data.map((d) => `${d.name}:${d.value}`).join(',')} />
  ),
}));

vi.mock('../../lib/data/charts', () => ({
  listMonthlySummaries: vi.fn(async () => {
    if (state.trendFails) throw new Error('trend failed');
    return state.trend;
  }),
  listSavingsHistory: vi.fn(async () => state.savings),
  listSubscriptionSlices: vi.fn(async () => {
    if (state.subsFails) throw new Error('subs failed');
    return state.subs;
  }),
}));

vi.mock('../../lib/data/aggregates', () => ({
  getCategoryBreakdown: vi.fn(async () => state.categories),
  listProfiles: vi.fn(async () => [
    { member_id: 'yururi', display_name: 'ゆるり', household_id: 'main' },
    { member_id: 'shiyowo', display_name: 'しよを', household_id: 'main' },
  ]),
  getMemberBalances: vi.fn(async () => []),
  getMonthlySummary: vi.fn(async () => null),
}));

const session: SessionState = {
  status: 'authenticated',
  session: {
    supabaseJwt: 'jwt',
    expiresAt: 9999999999,
    member: { id: 'yururi', displayName: 'ゆるり' },
    householdId: 'main',
  },
};

function renderBoard() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <SessionContext.Provider value={session}>
        <ChartsBoard />
      </SessionContext.Provider>
    </QueryClientProvider>,
  );
}

describe('ChartsBoard 統合', () => {
  beforeEach(() => {
    state.trend = [];
    state.categories = [];
    state.subs = [];
    state.savings = [];
    state.trendFails = false;
    state.subsFails = false;
    vi.clearAllMocks();
  });

  it('データが無ければ 0 のグラフを描かず EmptyState を出す', async () => {
    renderBoard();

    expect(await screen.findByText('まだ記録がありません')).toBeInTheDocument();
    expect(screen.getByText('今月の支出はまだありません')).toBeInTheDocument();
    expect(screen.getByText('サブスクはまだありません')).toBeInTheDocument();
    expect(screen.getByText('目標を立てた月がありません')).toBeInTheDocument();
    expect(screen.queryByTestId('trend')).toBeNull();
  });

  it('収支推移を 12 ヶ月ぶんの系列にする（データが無い月は 0 埋め）', async () => {
    const now = new Date();
    const thisMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
    state.trend = [{ month: thisMonth, income: 200000, expense: 120000, net: 80000 }];
    renderBoard();

    const chart = await screen.findByTestId('trend');
    const points = chart.getAttribute('data-points')!.split(',');
    expect(points).toHaveLength(12);
    // 当月（最後の点）に実データが入り、それ以前は 0
    expect(points[11]).toMatch(/:200000$/);
    expect(points[0]).toMatch(/:0$/);
  });

  it('カテゴリ別支出をドーナツにする（収入は混ぜない）', async () => {
    state.categories = [
      { category_name: '食費', type: 'expense', total: 40000 },
      { category_name: 'バイト代', type: 'income', total: 90000 },
    ];
    renderBoard();

    await waitFor(() => {
      const donuts = screen.getAllByTestId('donut');
      expect(donuts[0].getAttribute('data-slices')).toBe('食費:40000');
    });
  });

  it('相手タブに切り替えると相手の系列を取り直す', async () => {
    const { listSubscriptionSlices } = await import('../../lib/data/charts');
    renderBoard();
    await screen.findByText('サブスクはまだありません');

    fireEvent.click(screen.getByRole('tab', { name: 'しよを' }));

    await waitFor(() =>
      expect(listSubscriptionSlices).toHaveBeenCalledWith(expect.anything(), 'shiyowo'),
    );
  });

  // 取得失敗時に「全部 0 のグラフ」を描くと、0 円だったのか失敗したのか区別できなくなる
  it('取得に失敗したらグラフではなくエラーを出す', async () => {
    state.trendFails = true;
    state.subsFails = true;
    renderBoard();

    expect(await screen.findByText(/収支の推移を取得できませんでした/)).toBeInTheDocument();
    expect(screen.getByText(/サブスクの内訳を取得できませんでした/)).toBeInTheDocument();
    expect(screen.queryByTestId('trend')).toBeNull();
    // 失敗していない他のグラフは EmptyState のままで良い
    expect(screen.getByText('今月の支出はまだありません')).toBeInTheDocument();
  });
});
