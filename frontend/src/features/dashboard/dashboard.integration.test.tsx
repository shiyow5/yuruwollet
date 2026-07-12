import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router';
import { createQueryClient } from '../../lib/queryClient';
import { SessionContext } from '../../lib/auth/session-context';
import type { SessionState } from '../../lib/auth/useSession';
import { HomePage } from '../../app/pages/HomePage';
import type { Transaction } from '../../lib/ledger/types';

vi.mock('../../lib/supabase', () => ({ supabase: {} }));

vi.mock('../../lib/data/transactions', () => ({
  listTransactions: vi.fn(async (_c: unknown, params: { memberId: string; limit?: number }) => {
    if (params.memberId !== 'yururi') return [];
    const rows: Transaction[] = [
      {
        id: 't1',
        household_id: 'main',
        owner_member_id: 'yururi',
        type: 'expense',
        amount: 1200,
        category_id: 'cafe',
        memo: 'カフェ代',
        occurred_on: '2026-07-12',
        is_system_generated: false,
        created_at: '2026-07-12T01:15:00Z',
        updated_at: '2026-07-12T01:15:00Z',
      },
    ];
    return rows;
  }),
  createTransaction: vi.fn(),
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
  getMonthlySummary: vi.fn(async (_c: unknown, memberId: string) =>
    memberId === 'yururi'
      ? {
          household_id: 'main',
          member_id: 'yururi',
          month: '2026-07-01',
          income: 450000,
          expense: 107500,
          net: 342500,
        }
      : null,
  ),
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

const authedSession: SessionState = {
  status: 'authenticated',
  session: {
    supabaseJwt: 'jwt',
    expiresAt: 9999999999,
    member: { id: 'yururi', displayName: 'ゆるり' },
    householdId: 'main',
  },
};

function renderHome(session: SessionState = authedSession) {
  const qc = createQueryClient();
  return render(
    <QueryClientProvider client={qc}>
      <SessionContext.Provider value={session}>
        <MemoryRouter>
          <HomePage />
        </MemoryRouter>
      </SessionContext.Provider>
    </QueryClientProvider>,
  );
}

describe('HomePage ダッシュボード統合', () => {
  it('挨拶・自分の残高・今月収支・カテゴリ別・履歴を表示', async () => {
    renderHome();
    expect(screen.getByText('おかえり、ゆるり さん')).toBeInTheDocument();
    expect(await screen.findByText('¥342,500')).toBeInTheDocument();
    expect(await screen.findByText('¥450,000')).toBeInTheDocument();
    expect(await screen.findByText('¥107,500')).toBeInTheDocument();
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
});
