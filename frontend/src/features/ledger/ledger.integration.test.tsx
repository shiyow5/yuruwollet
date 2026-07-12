import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { createQueryClient } from '../../lib/queryClient';
import { SessionContext } from '../../lib/auth/session-context';
import type { SessionState } from '../../lib/auth/useSession';
import { LedgerPage } from '../../app/pages/LedgerPage';
import type { Transaction } from '../../lib/ledger/types';

// supabase シングルトンは data 層モック経由でしか使われないが、
// 実クライアント生成（accessToken fetch）を避けるため無害化する。
vi.mock('../../lib/supabase', () => ({ supabase: {} }));

// ---- data 層モック（インメモリ store で「追加→再取得で反映」を検証） ----
vi.mock('../../lib/data/transactions', () => {
  let store: Transaction[] = [];
  let counter = 0;
  return {
    listTransactions: vi.fn(async (_client: unknown, params: { memberId: string }) =>
      store.filter((t) => t.owner_member_id === params.memberId),
    ),
    createTransaction: vi.fn(
      async (
        _client: unknown,
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
          id: `srv-${counter++}`,
          household_id: ctx.householdId,
          owner_member_id: ctx.ownerMemberId,
          type: draft.type,
          amount: draft.amount,
          category_id: draft.categoryId,
          memo: draft.memo,
          occurred_on: draft.occurredOn,
          is_system_generated: false,
          created_at: '2026-07-13T05:30:00Z',
          updated_at: '2026-07-13T05:30:00Z',
        };
        store = [created, ...store];
        return created;
      },
    ),
    updateTransaction: vi.fn(),
    deleteTransaction: vi.fn(),
  };
});

const CATEGORY_ID = '11111111-1111-1111-1111-111111111111';

vi.mock('../../lib/data/categories', () => ({
  listCategories: vi.fn(async () => [
    {
      id: '11111111-1111-1111-1111-111111111111',
      household_id: 'main',
      kind: 'expense',
      name: '食費',
      icon: 'restaurant',
      sort_order: 0,
      is_system: false,
      is_archived: false,
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
    },
  ]),
  createCategory: vi.fn(),
  archiveCategory: vi.fn(),
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

function renderWithProviders(ui: ReactNode, session: SessionState = authedSession) {
  const qc = createQueryClient();
  return render(
    <QueryClientProvider client={qc}>
      <SessionContext.Provider value={session}>{ui}</SessionContext.Provider>
    </QueryClientProvider>,
  );
}

describe('LedgerPage 統合', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('自分表示では自分/相手タブと追加 FAB が出る', async () => {
    renderWithProviders(<LedgerPage />);
    expect(await screen.findByRole('tab', { name: 'ゆるり' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'しよを' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '収支を追加' })).toBeInTheDocument();
  });

  it('収支を追加するとフォームが閉じ一覧に反映される', async () => {
    renderWithProviders(<LedgerPage />);
    // FAB → モーダル
    fireEvent.click(await screen.findByRole('button', { name: '収支を追加' }));

    const dialog = await screen.findByRole('dialog');
    // カテゴリ一覧の読み込みを待ってから選択
    await within(dialog).findByRole('option', { name: '食費' });
    fireEvent.change(within(dialog).getByPlaceholderText('0'), { target: { value: '3,000' } });
    fireEvent.change(within(dialog).getByRole('combobox'), { target: { value: CATEGORY_ID } });
    fireEvent.click(within(dialog).getByRole('button', { name: '追加' }));

    // createTransaction が正規化済みドラフトで呼ばれる
    await waitFor(() => expect(createTransaction).toHaveBeenCalledTimes(1));
    const [, draft, ctx] = (createTransaction as unknown as { mock: { calls: unknown[][] } }).mock
      .calls[0];
    expect(draft).toMatchObject({
      type: 'expense',
      amount: 3000,
      categoryId: CATEGORY_ID,
      memo: '',
    });
    expect(ctx).toEqual({ householdId: 'main', ownerMemberId: 'yururi' });

    // 一覧に金額が反映（楽観 + 再取得）
    expect(await screen.findByText('- ¥3,000')).toBeInTheDocument();
    // モーダルは閉じる
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('相手表示に切り替えると追加 FAB は消える（書込不可）', async () => {
    renderWithProviders(<LedgerPage />);
    fireEvent.click(await screen.findByRole('tab', { name: 'しよを' }));
    await waitFor(() => expect(screen.queryByRole('button', { name: '収支を追加' })).toBeNull());
  });

  it('金額未入力ではエラーを出し送信しない', async () => {
    renderWithProviders(<LedgerPage />);
    fireEvent.click(await screen.findByRole('button', { name: '収支を追加' }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: '追加' }));
    expect(await within(dialog).findByText('金額を入力してください')).toBeInTheDocument();
    expect(createTransaction).not.toHaveBeenCalled();
  });
});
