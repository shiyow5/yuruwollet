import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, useLocation } from 'react-router';
import { createQueryClient } from '../../lib/queryClient';
import { SessionContext } from '../../lib/auth/session-context';
import type { SessionState } from '../../lib/auth/useSession';
import { HomePage } from '../../app/pages/HomePage';
import { addMonths, jstMonthStart, jstToday } from '../../lib/format';
import type { Transaction } from '../../lib/ledger/types';

const SEED: Transaction = {
  id: 't1',
  household_id: 'main',
  owner_member_id: 'yururi',
  type: 'expense',
  amount: 1200,
  category_id: 'cafe',
  memo: 'カフェ代',
  occurred_on: '2026-07-12',
  is_system_generated: false,
  subscription_id: null,
  created_at: '2026-07-12T01:15:00Z',
  updated_at: '2026-07-12T01:15:00Z',
};

// 共有インメモリ store。**作成した行を listTransactions にも反映する**こと。
// 反映しないと invalidateLedger の再取得で楽観挿入した行が消え、
// 「追加したのに履歴に出ない」というテスト側の偽陽性になる。
const state = vi.hoisted(() => ({
  rows: [] as unknown[],
  counter: 0,
  lastMonth: 'data' as 'data' | 'none' | 'error',
}));

vi.mock('../../lib/supabase', () => ({ supabase: {} }));

vi.mock('../../lib/data/transactions', () => ({
  listTransactions: vi.fn(async (_c: unknown, params: { memberId: string; limit?: number }) => {
    const rows = (state.rows as Transaction[]).filter((t) => t.owner_member_id === params.memberId);
    return params.limit != null ? rows.slice(0, params.limit) : rows;
  }),
  createTransaction: vi.fn(
    async (
      _c: unknown,
      draft: {
        type: 'income' | 'expense';
        amount: number;
        categoryId: string | null;
        occurredOn: string;
        memo: string;
      },
      ctx: { householdId: string; ownerMemberId: string },
    ) => {
      const created: Transaction = {
        id: `srv-${state.counter++}`,
        household_id: ctx.householdId,
        owner_member_id: ctx.ownerMemberId,
        type: draft.type,
        amount: draft.amount,
        category_id: draft.categoryId,
        memo: draft.memo,
        occurred_on: draft.occurredOn,
        is_system_generated: false,
        subscription_id: null,
        created_at: '2026-07-14T03:00:00Z',
        updated_at: '2026-07-14T03:00:00Z',
      };
      state.rows = [created, ...(state.rows as Transaction[])];
      return created;
    },
  ),
  updateTransaction: vi.fn(),
  deleteTransaction: vi.fn(),
}));

vi.mock('../../lib/data/categories', () => ({
  listCategories: vi.fn(async () => [
    {
      id: 'cafe',
      household_id: 'main',
      kind: 'expense',
      name: '交際費',
      icon: 'local_cafe',
      sort_order: 0,
      is_system: false,
      is_archived: false,
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
    },
  ]),
  createCategory: vi.fn(),
  archiveCategory: vi.fn(),
  unarchiveCategory: vi.fn(),
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
  getMemberBalances: vi.fn(async () => [
    { household_id: 'main', member_id: 'yururi', display_name: 'ゆるり', balance: 342500 },
    { household_id: 'main', member_id: 'shiyowo', display_name: 'しよを', balance: 120000 },
  ]),
  // **month を見る。** 見ないと先月にも同じ行が返り、「先月なし」の分岐が撃てない。
  getMonthlySummary: vi.fn(async (_c: unknown, memberId: string, month: string) => {
    if (memberId !== 'yururi') return null;
    const current = jstMonthStart();
    if (month === current) {
      return {
        household_id: 'main',
        member_id: 'yururi',
        month: current,
        income: 450000,
        expense: 107500,
        net: 342500,
      };
    }
    if (month === addMonths(current, -1)) {
      if (state.lastMonth === 'none') return null;
      if (state.lastMonth === 'error') throw new Error('先月の取得に失敗');
      return {
        household_id: 'main',
        member_id: 'yururi',
        month,
        income: 400000,
        expense: 124000,
        net: 276000,
      };
    }
    return null;
  }),
  getCategoryBreakdown: vi.fn(async (_c: unknown, memberId: string) =>
    memberId === 'yururi'
      ? [
          {
            household_id: 'main',
            member_id: 'yururi',
            month: '2026-07-01',
            category_id: 'food',
            category_name: '食費',
            category_icon: 'restaurant',
            type: 'expense' as const,
            total: 42000,
          },
        ]
      : [],
  ),
}));

import { createTransaction } from '../../lib/data/transactions';

const authedSession: SessionState = {
  status: 'authenticated',
  session: {
    supabaseJwt: 'jwt',
    expiresAt: 9999999999,
    member: { id: 'yururi', displayName: 'ゆるり' },
    householdId: 'main',
  },
};

/** 現在のパスを DOM に出す。ホームで追加しても /ledger へ飛ばないことを検証するため。 */
function PathProbe() {
  return <span data-testid="pathname">{useLocation().pathname}</span>;
}

function renderHome(session: SessionState = authedSession) {
  // retry を切る。既定は retry:1 で、失敗クエリがバックオフ後に再試行するため
  // 「取得に失敗したら」の分岐がタイムアウトする。
  const qc = createQueryClient();
  qc.setDefaultOptions({ queries: { retry: false } });
  return render(
    <QueryClientProvider client={qc}>
      <SessionContext.Provider value={session}>
        <MemoryRouter>
          <HomePage />
          <PathProbe />
        </MemoryRouter>
      </SessionContext.Provider>
    </QueryClientProvider>,
  );
}

/** 支出比較カード（role=region）に絞る。金額が今月の支出タイルと重複するため。 */
function comparisonCard() {
  return screen.getByRole('region', { name: '支出の比較' });
}

describe('HomePage ダッシュボード統合', () => {
  beforeEach(() => {
    state.rows = [SEED];
    state.counter = 0;
    state.lastMonth = 'data';
    vi.mocked(createTransaction).mockClear();
  });

  it('挨拶・自分の残高・今月収支・カテゴリ別・履歴を表示', async () => {
    renderHome();
    expect(screen.getByText('おかえり、ゆるり さん')).toBeInTheDocument();
    expect(await screen.findByText('¥342,500')).toBeInTheDocument();
    expect(await screen.findByText('¥450,000')).toBeInTheDocument();
    // ¥107,500 は「今月の支出」タイルと支出比較カードの 2 箇所に出る
    expect(await screen.findAllByText('¥107,500')).toHaveLength(2);
    // カテゴリ別支出
    expect(await screen.findByText('食費')).toBeInTheDocument();
    expect(await screen.findByText('¥42,000')).toBeInTheDocument();
    // 直近の履歴
    expect(await screen.findByText('カフェ代')).toBeInTheDocument();
    expect(await screen.findByText('- ¥1,200')).toBeInTheDocument();
  });

  it('相手タブに切り替えると相手の残高になる', async () => {
    renderHome();
    expect(await screen.findByText('¥342,500')).toBeInTheDocument();
    fireEvent.click(await screen.findByRole('tab', { name: 'しよを' }));
    expect(await screen.findByText('¥120,000')).toBeInTheDocument();
    // 相手の今月支出は 0（サマリなし）
    await waitFor(() => expect(screen.getByText('おかえり、ゆるり さん')).toBeInTheDocument());
  });

  // ---- #36 ホームで追加を完結させる ----

  it('「支出」ボタンでモーダルが開き、/ledger へ遷移しない', async () => {
    renderHome();
    fireEvent.click(await screen.findByRole('button', { name: '支出' }));
    const dialog = await screen.findByRole('dialog', { name: '収支を追加' });
    expect(within(dialog).getByRole('tab', { name: '支出' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    expect(screen.getByTestId('pathname')).toHaveTextContent('/');
  });

  it('「収入」ボタンから開くと収入タイプで初期化される', async () => {
    renderHome();
    fireEvent.click(await screen.findByRole('button', { name: '収入' }));
    const dialog = await screen.findByRole('dialog', { name: '収支を追加' });
    expect(within(dialog).getByRole('tab', { name: '収入' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
  });

  it('キャンセルするとモーダルが閉じ、ホームに留まる', async () => {
    renderHome();
    fireEvent.click(await screen.findByRole('button', { name: '支出' }));
    const dialog = await screen.findByRole('dialog', { name: '収支を追加' });
    fireEvent.click(within(dialog).getByRole('button', { name: 'キャンセル' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(screen.getByTestId('pathname')).toHaveTextContent('/');
  });

  // ホームは常に当月を見ているので、既定日付は「今日」
  it('既定日付は今日', async () => {
    renderHome();
    fireEvent.click(await screen.findByRole('button', { name: '支出' }));
    const dialog = await screen.findByRole('dialog', { name: '収支を追加' });
    expect(within(dialog).getByDisplayValue(jstToday())).toBeInTheDocument();
  });

  it('ホームから追加すると直近の履歴に即座に出る（楽観更新）', async () => {
    renderHome();
    expect(await screen.findByText('カフェ代')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '支出' }));
    const dialog = await screen.findByRole('dialog', { name: '収支を追加' });
    fireEvent.change(within(dialog).getByPlaceholderText('0'), { target: { value: '3,000' } });
    fireEvent.click(within(dialog).getByRole('button', { name: '追加' }));

    // 追加が成功するとモーダルは閉じ、楽観挿入された行が履歴に出る
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(await screen.findByText('- ¥3,000')).toBeInTheDocument();
    expect(vi.mocked(createTransaction)).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ amount: 3000, type: 'expense', occurredOn: jstToday() }),
      { householdId: 'main', ownerMemberId: 'yururi' },
    );
  });

  it('相手タブでは収入/支出ボタンが出ない', async () => {
    renderHome();
    expect(await screen.findByRole('button', { name: '支出' })).toBeInTheDocument();
    // タブはプロフィール取得後に出る（残高ボタンは session から同期で出るため待ちが要る）
    fireEvent.click(await screen.findByRole('tab', { name: 'しよを' }));
    await waitFor(() => expect(screen.queryByRole('button', { name: '支出' })).toBeNull());
    expect(screen.queryByRole('button', { name: '収入' })).toBeNull();
  });

  // `?add=` の生成元を消し忘れると、家計簿側の読み取りを消した時点で導線が死ぬ
  it('ホームに /ledger?add= へ飛ぶリンクが無い', async () => {
    const { container } = renderHome();
    await screen.findByRole('button', { name: '支出' });
    expect(container.querySelector('a[href*="add="]')).toBeNull();
  });

  // ---- #37 今月/先月の支出比較 ----

  it('今月と先月の支出が 2 本のバーで表示される', async () => {
    renderHome();
    // カード自体は最初から（スケルトンで）出るので、バーの出現を待つ
    const card = await screen.findByRole('region', { name: '支出の比較' });
    // 124,000 が最大 → 100%、107,500 は 87%
    expect(await within(card).findByRole('progressbar', { name: '今月の支出' })).toHaveAttribute(
      'aria-valuenow',
      '87',
    );
    expect(within(card).getByRole('progressbar', { name: '先月の支出' })).toHaveAttribute(
      'aria-valuenow',
      '100',
    );
    expect(within(card).getByText('¥107,500')).toBeInTheDocument();
    expect(within(card).getByText('¥124,000')).toBeInTheDocument();
  });

  // ¥0 のバーは「先月は 1 円も使わなかった」と誤読される。データ不在を実データとして見せない。
  it('先月の記録が無いときは ¥0 を出さず「比較できません」を表示する', async () => {
    state.lastMonth = 'none';
    renderHome();
    const card = await screen.findByRole('region', { name: '支出の比較' });
    expect(await within(card).findByText(/先月の記録がないため比較できません/)).toBeInTheDocument();
    expect(within(card).queryByText('¥0')).toBeNull();
    expect(within(card).queryByRole('progressbar')).toBeNull();
  });

  it('取得に失敗したら ¥0 を出さずエラーを表示する', async () => {
    state.lastMonth = 'error';
    renderHome();
    const card = await screen.findByRole('region', { name: '支出の比較' });
    expect(await within(card).findByRole('alert')).toHaveTextContent(/支出の比較を取得できません/);
    expect(within(card).queryByText('¥0')).toBeNull();
  });

  it('相手タブに切り替えると相手の比較になる', async () => {
    renderHome();
    await screen.findByRole('region', { name: '支出の比較' });
    fireEvent.click(await screen.findByRole('tab', { name: 'しよを' }));
    // 相手（しよを）は今月も先月もサマリ無し → 比較できません
    await waitFor(() =>
      expect(
        within(comparisonCard()).getByText(/先月の記録がないため比較できません/),
      ).toBeInTheDocument(),
    );
  });
});
