import { describe, expect, it, vi } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createElement, type ReactNode } from 'react';
import { SessionContext } from '../../lib/auth/session-context';
import type { SessionState } from '../../lib/auth/useSession';
import { useDeleteTransaction } from './hooks';

vi.mock('../../lib/supabase', () => ({ supabase: {} }));
vi.mock('../../lib/data/transactions', () => ({
  createTransaction: vi.fn(async () => ({})),
  updateTransaction: vi.fn(async () => ({})),
  deleteTransaction: vi.fn(async () => undefined),
  listTransactions: vi.fn(async () => []),
  listRecentTransactions: vi.fn(async () => []),
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

/**
 * 台帳を書き換えたら、そこから算出される派生クエリも必ず落とす。
 * 特に目標貯金の進捗（v_savings_progress.saved）は取引から計算されるため、
 * ここを落とし忘れると staleTime の間だけ古い貯金額・達成状態が残る。
 */
describe('台帳の書込は派生クエリを invalidate する', () => {
  it('取引を削除すると savingsProgress も落とす', async () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const spy = vi.spyOn(qc, 'invalidateQueries');

    const wrapper = ({ children }: { children: ReactNode }) =>
      createElement(
        QueryClientProvider,
        { client: qc },
        createElement(SessionContext.Provider, { value: session }, children),
      );

    const { result } = renderHook(() => useDeleteTransaction(), { wrapper });
    act(() => result.current.mutate('txn-1'));
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const keys = spy.mock.calls.map((c) => JSON.stringify(c[0]?.queryKey));
    expect(keys).toContain(JSON.stringify(['savingsProgress', 'yururi']));
    // 既存の派生クエリも落ちていること（劣化検知）
    expect(keys).toContain(JSON.stringify(['transactions', 'yururi']));
    expect(keys).toContain(JSON.stringify(['monthlySummary', 'yururi']));
    expect(keys).toContain(JSON.stringify(['categoryBreakdown', 'yururi']));
  });
});
